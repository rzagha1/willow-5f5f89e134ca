'use strict';
let syncTimer, syncBusy=false, syncError='', syncRetryAt=0, syncFailures=0;
const familyInvitation=new URLSearchParams(location.hash.slice(1)).get('family');
if(familyInvitation)history.replaceState(history.state,'',location.pathname+location.search);
function syncStatus() {
  const pending=state.sync?.pending?.length || 0;
  const text=!state.sync ? 'Open your private family link once to connect this phone.'
    : !navigator.onLine ? `Offline · ${pending ? pending+' changes waiting' : 'saved on this phone'}`
    : syncError || (syncBusy ? 'Syncing your family’s moments…' : pending ? `${pending} changes waiting to sync` : state.settings.lastSyncAt ? 'Connected · syncing automatically' : 'Connecting…');
  for(const node of document.querySelectorAll('[data-sync-status]'))node.textContent=text;
}
function scheduleSync(delay=250) {
  clearTimeout(syncTimer);
  if(state.sync && storageOK)syncTimer=setTimeout(syncNow,delay);
  syncStatus();
}
async function syncRequest(key, cursor, events) {
  if(!SYNC_URL)fail('The family sync service is not set up yet.');
  const response=await fetch(SYNC_URL+'/sync',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
    body:JSON.stringify({protocol:2,cursor,events}),cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)
  });
  const raw=await response.json();
  if(!response.ok)fail(raw.error || 'Could not connect to family sync.');
  if(raw.protocol!==2)fail('Sleep sync needs an update. Your changes are saved on this phone.');
  if(!Number.isSafeInteger(raw.cursor)||raw.cursor<cursor||typeof raw.more!=='boolean'||!Array.isArray(raw.events)||raw.events.length>4||!Array.isArray(raw.acknowledged)||raw.acknowledged.length!==events.length)fail('The sync reply was incomplete. Your changes are still saved on this phone.');
  return {...raw,events:raw.events.map(validateEvent),acknowledged:raw.acknowledged.map(validateEvent)};
}
async function connectFamily(value) {
  let key=value.trim();
  if(key.includes('#')){const link=new URL(key);key=new URLSearchParams(link.hash.slice(1)).get('family') || '';}
  if(!/^[A-Za-z0-9_-]{43}$/.test(key))fail('Paste the complete private family link.');
  await syncRequest(key,0,[]);
  await commit(data=>{if(data.sync?.key!==key)data.sync={key,cursor:0,pending:data.events.map(event=>event.id)};},false,true);
  syncError='';syncRetryAt=0;if(state.settings.deviceName&&state.settings.babyName)render();scheduleSync(0);
}
function openFamilyConnection() {
  const content=openSheet('Connect this phone'),form=el('form'),link=field('Private family link','password','',1000);
  link.input.autocomplete='off';link.input.spellcheck=false;link.input.required=true;
  content.append(el('p','sheet-copy','Open the same private family link on both phones once. Your entries will then stay in sync over mobile data or Wi-Fi.'));
  form.append(link.wrap);submitForm(form,'Connect',async()=>{await connectFamily(link.input.value);closeSheet();notify('Connected. Your moments will sync automatically.');});content.append(form);
}
async function shareFamilyLink() {
  const url=new URL('./',location.href);url.hash='family='+state.sync.key;
  if(navigator.share){try{await navigator.share({title:'Eshel’s family link',text:'Open once to connect your phone. Keep this link within our family.',url:url.href});return;}catch(error){if(error.name==='AbortError')return;}}
  try{await navigator.clipboard.writeText(url.href);notify('Private family link copied. Open it once on the other phone.');}
  catch{const content=openSheet('Link another phone'),link=field('Private family link','textarea',url.href);link.input.readOnly=true;content.append(el('p','sheet-copy','Anyone with this link can read and change your family’s entries. Share it only with your family.'),link.wrap);link.input.focus();link.input.select();}
}
async function syncNow() {
  if(syncBusy||!storageOK||!state.sync||!navigator.onLine||document.hidden||Date.now()<syncRetryAt){syncStatus();return;}
  syncBusy=true;syncStatus();
  let again=false;
  try {
    const work=async()=>{
      const snapshot=await readState();if(!snapshot?.sync)return;
      const {key,cursor,pending}=snapshot.sync;
      const byId=new Map(snapshot.events.map(event=>[event.id,event]));
      const outgoing=pending.slice(0,4).map(id=>byId.get(id)).filter(Boolean);
      const reply=await syncRequest(key,cursor,outgoing);
      if(reply.acknowledged.some((event,index)=>event.id!==outgoing[index].id))fail('The sync reply did not match your changes.');
      // Empty polls must not rewrite the whole offline store, especially its photos.
      if(!outgoing.length&&!reply.events.length&&snapshot.settings.lastSyncAt)return;
      let changed=false, conflict=false;
      await commit(data=>{
        if(data.sync?.key!==key)return;
        const before=new Map(data.events.map(event=>[event.id,JSON.stringify(event)]));
        const sent=new Map(outgoing.map(event=>[event.id,JSON.stringify(event)]));
        data.sync.pending=data.sync.pending.filter(id=>!sent.has(id)||sent.get(id)!==before.get(id));
        const merged=mergeEvents(data.events,[...reply.events,...reply.acknowledged]);
        changed=merged.counts.added+merged.counts.updated+merged.counts.deleted>0;
        conflict=reply.acknowledged.some(event=>JSON.stringify(event)!==sent.get(event.id));
        data.events=merged.events;data.sync.cursor=Math.max(data.sync.cursor,reply.cursor);data.settings.lastSyncAt=iso();
        again=reply.more||data.sync.pending.length>0;
      },false,true);
      if(changed && screen!=='settings'&&state.settings.deviceName&&state.settings.babyName)render();else tick();
      if(conflict)notify('An entry changed on both phones. The later edit was kept.',null,'',8000);
    };
    if(navigator.locks)await navigator.locks.request(DB_NAME+':sync',{ifAvailable:true},lock=>lock?work():undefined);else await work();
    syncError='';syncFailures=0;syncRetryAt=0;
  } catch(error) {
    syncFailures++;syncRetryAt=Date.now()+Math.min(60000,5000*2**Math.min(syncFailures-1,4));
    syncError=/update/i.test(error.message)?error.message:/family link/.test(error.message)?'Connection needs attention. Reopen your private family link.':'Saved on this phone · connection interrupted, retrying automatically';
  } finally {syncBusy=false;syncStatus();if(again)scheduleSync(100);}
}
async function setupSync() {
  if(!storageOK)return;
  if(familyInvitation){try{await connectFamily(familyInvitation);}catch(error){notify(error.message,null,'',12000);}}
  scheduleSync(0);
  setInterval(()=>{if(!document.hidden)syncNow();},5000);
  window.addEventListener('online',()=>{syncRetryAt=0;scheduleSync(0);});
  window.addEventListener('offline',syncStatus);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncRetryAt=0;scheduleSync(0);}});
  window.addEventListener('focus',()=>{syncRetryAt=0;scheduleSync(0);});
}
