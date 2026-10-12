const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const os=require('node:os');
const {createHash,randomUUID}=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'), persist=fs.mkdtempSync(path.join(os.tmpdir(),'eshel-sync-'));
const key=Buffer.alloc(32,1).toString('base64url'), hash=createHash('sha256').update(key).digest('hex');
const config=path.join(root,'cloudflare/wrangler.jsonc'),wrangler=path.join(root,'cloudflare/node_modules/.bin/wrangler');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 let worker,browser,server,logs='';
 try {
  server=http.createServer((req,res)=>{
   const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
   const files=['index.html','app.js','styles.css','manifest.json','sw.js','event-data.js','sync-config.js','sync.js','icon-192.png','icon-512.png','icon-512-maskable.png'];
   if(!files.includes(name)){res.writeHead(404);res.end();return;}
   const data=name==='sync-config.js'?"const SYNC_URL='http://127.0.0.1:8787';":fs.readFileSync(path.join(root,name));
   res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':name.endsWith('.png')?'image/png':'text/html');res.end(data);
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}/`;
  const init=spawnSync(wrangler,['d1','execute','DB','--local','--config',config,'--persist-to',persist,'--file',path.join(root,'cloudflare/schema.sql')],{encoding:'utf8',timeout:60000});
  if(init.status!==0)throw Error(init.stdout+init.stderr);
  worker=spawn(wrangler,['dev','--config',config,'--port','8787','--persist-to',persist,'--var','FAMILY_KEY_HASH:'+hash,'--var','APP_ORIGIN:'+new URL(base).origin],{cwd:root,detached:true,stdio:['ignore','pipe','pipe']});
  worker.stdout.on('data',data=>logs+=data);worker.stderr.on('data',data=>logs+=data);
  let ready=false;for(let i=0;i<120;i++){try{const res=await fetch('http://127.0.0.1:8787/sync',{method:'POST'});if(res.status===401){ready=true;break;}}catch{}await sleep(500);}assert.ok(ready,logs);
  const api=async(body,token=key,origin=new URL(base).origin)=>fetch('http://127.0.0.1:8787/sync',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
  assert.equal((await api({cursor:0,events:[]},'x'.repeat(43))).status,401);
  assert.equal((await api({cursor:0,events:[]},key,'https://untrusted.example')).status,403);
  assert.equal((await api({cursor:0,events:[{id:randomUUID(),type:'unknown'}]})).status,400);
  const preflight=await fetch('http://127.0.0.1:8787/sync',{method:'OPTIONS',headers:{Origin:new URL(base).origin}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),new URL(base).origin);
  browser=await chromium.launch();const errors=[];
  const contexts=await Promise.all(['Parent A','Parent B'].map(async name=>{
   const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'}),page=await ctx.newPage();page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base+'#family='+key);await page.getByLabel('Your name').fill(name);await page.getByLabel('Baby’s name').fill('Eshel');await page.getByRole('button',{name:'Let’s begin'}).click();
   await page.waitForFunction(()=>!!state.sync?.key&&!!state.settings.lastSyncAt);await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
   assert.equal(new URL(page.url()).hash,'','Invitation removed from address/history');return {ctx,page};
  }));
  const [{ctx:aCtx,page:a},{ctx:bCtx,page:b}]=contexts;
  await a.locator('.tile.sleep').click();await a.getByRole('button',{name:'Start Timer',exact:true}).click();
  await b.waitForFunction(()=>state.events.some(e=>e.type==='sleep'&&e.endTime===null));
  const id=await b.evaluate(()=>state.events.find(e=>e.type==='sleep').id);
  await b.locator('.tile.sleep').click();await b.getByRole('button',{name:'Stop Timer',exact:true}).click();
  await a.waitForFunction(id=>!!state.events.find(e=>e.id===id).endTime,id);await a.waitForFunction(()=>document.querySelector('.sleep-timer-button').textContent==='Save sleep');
  await a.getByRole('button',{name:'Close sheet'}).click();await b.getByRole('button',{name:'Close sheet'}).click();
  await a.waitForFunction(()=>!document.querySelector('#sheet').open);await b.waitForFunction(()=>!document.querySelector('#sheet').open);
  await aCtx.setOffline(true);await a.reload();await a.waitForSelector('.tiles');
  await a.locator('.tile.diaper').click();await a.getByRole('button',{name:'Wet',exact:true}).click();await a.waitForFunction(()=>state.sync.pending.length>0);
  await b.locator('.tile.diaper').click();await b.getByRole('button',{name:'Dirty',exact:true}).click();await b.waitForFunction(()=>state.sync.pending.length===0);
  assert.equal(await b.evaluate(()=>state.events.some(e=>e.subtype==='wet')),false);
  await a.reload();await a.waitForSelector('.tiles');assert.ok(await a.evaluate(()=>state.sync.pending.length>0),'Offline queue survives restart');
  await aCtx.setOffline(false);await b.waitForFunction(()=>state.events.some(e=>e.subtype==='wet'));await a.waitForFunction(()=>state.events.some(e=>e.subtype==='dirty')&&state.sync.pending.length===0);
  // A photo is resized once, stored locally, and arrives automatically on the other phone.
  await a.evaluate(id=>openSleep(state.events.find(e=>e.id===id)),id);
  await a.locator('#sheet input[type=file]').setInputFiles(path.join(root,'icon-512.png'));
  await a.waitForFunction(()=>!!document.querySelector('.sleep-photo').getAttribute('src'));
  await a.getByLabel('Notes',{exact:true}).fill('A lovely nap');await a.getByRole('button',{name:'Save',exact:true}).click();
  await b.waitForFunction(id=>state.events.find(e=>e.id===id)?.photo?.startsWith('data:image/jpeg')&&state.events.find(e=>e.id===id)?.note==='A lovely nap',id);
  // Different events survive simultaneous offline edits; equal timestamps converge deterministically.
  await Promise.all([aCtx.setOffline(true),bCtx.setOffline(true)]);
  const stamp=new Date(Date.now()+2000).toISOString();
  for(const [page,note] of [[a,'Alpha 🌙'],[b,'Zeta']])await page.evaluate(async({id,note,stamp})=>commit(data=>{const event=data.events.find(e=>e.id===id);event.note=note;event.updatedAt=stamp;}),{id,note,stamp});
  await Promise.all([aCtx.setOffline(false),bCtx.setOffline(false)]);
  await a.waitForFunction(()=>state.sync.pending.length===0);await b.waitForFunction(()=>state.sync.pending.length===0);
  const serverEvent=(await (await api({cursor:0,events:[]})).json()).events.find(e=>e.id===id);
  await a.waitForFunction(event=>JSON.stringify(state.events.find(e=>e.id===event.id))===JSON.stringify(event),serverEvent);
  await b.waitForFunction(event=>JSON.stringify(state.events.find(e=>e.id===event.id))===JSON.stringify(event),serverEvent);
  await a.evaluate(id=>deleteEvent(id),id);await b.waitForFunction(id=>state.events.find(e=>e.id===id).deleted,id);
  // Pagination must deliver all changes and acknowledge retries without duplicating revisions.
  const sample=await a.evaluate(()=>state.events.find(e=>e.type==='diaper'));
  const many=Array.from({length:45},(_,i)=>({...sample,id:randomUUID(),note:'Pagination '+i}));
  for(let i=0;i<many.length;i+=4)assert.equal((await api({cursor:0,events:many.slice(i,i+4)})).status,200);
  await a.waitForFunction(()=>state.events.length===48);await b.waitForFunction(()=>state.events.length===48);
  const before=(await (await api({cursor:0,events:[]})).json()).cursor;
  await api({cursor:0,events:[many[0]]});const after=(await (await api({cursor:0,events:[]})).json()).cursor;assert.equal(before,after,'Retry is idempotent');
  // A changed local entry while a request is in flight stays queued after acknowledgement.
  let releaseRequest, sawRequest;
  const held=new Promise(resolve=>releaseRequest=resolve), observed=new Promise(resolve=>sawRequest=resolve);
  await a.route('http://127.0.0.1:8787/sync',async route=>{
   const body=route.request().postDataJSON();
   if(body.events.some(event=>event.note==='First queued')){
    const response=await route.fetch();sawRequest();await held;await route.fulfill({response});
   }else await route.continue();
  });
  await a.evaluate(async()=>{const old=state.events.find(e=>e.subtype==='wet');await saveEvent({...old,note:'First queued'},old);});
  await Promise.race([observed,sleep(25000).then(()=>{throw Error('Queued request did not start');})]);
  await a.evaluate(async()=>{const old=state.events.find(e=>e.subtype==='wet');await saveEvent({...old,note:'Newest queued'},old);});
  releaseRequest();
  await b.waitForFunction(()=>state.events.some(e=>e.note==='Newest queued'));
  await a.waitForFunction(()=>state.sync.pending.length===0&&!syncBusy);
  await a.evaluate(async()=>{const saved=state.settings.lastSyncAt;await syncNow();if(state.settings.lastSyncAt!==saved)throw Error('Empty poll rewrote local storage');});
  const backup=await a.evaluate(()=>JSON.stringify(payload('backup')));assert.ok(!backup.includes(key),'Backups exclude family credentials');
  assert.deepEqual(errors,[]);
  console.log('PASS: real Worker + D1, authentication/CORS, two independent paired browsers, automatic timer start/stop, sleep photo and notes, offline reload/queue/reconnect, equal-time edits, deletion, pagination, retry idempotency, private backups, service-worker network bypass.');
 } finally {
  if(browser)await browser.close();
  if(worker)try{process.kill(-worker.pid,'SIGTERM');}catch{}
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(persist,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
