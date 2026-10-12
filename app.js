'use strict';
const VERSION = '1.1.1';
const TYPES = ['sleep', 'feed', 'diaper', 'misc'];
const LABELS = {sleep:'Sleep', feed:'Feed', diaper:'Diaper', misc:'Misc'};
const SCOPE = new URL('./', location.href).pathname;
const DB_NAME = 'eshels-baby:' + SCOPE;
const LIMIT = 10 * 1024 * 1024;
const $ = selector => document.querySelector(selector);
const iso = () => new Date().toISOString();
const paths = {
  sleep:'M19.8 14.2A8 8 0 0 1 9.8 4.1a8 8 0 1 0 10 10.1Z M17 3v4m-2-2h4',
  mask:'M4 8c4-3 12-3 16 0v7c-1 4-5 3-8 0-3 3-7 4-8 0Z M4 9C-1 6 0 2 5 4c5-3 10-3 14 0 5-2 6 2 1 5 M7 10v2m-2 0 2 1 2-1 M17 10v2m-2 0 2 1 2-1',
  feed:'m9 3 4 1-1 3 3 2 3 8a3 3 0 0 1-2 4l-4 1a3 3 0 0 1-4-2L5 12l1-4 3-1 1-3 M6 11l9-3 M8 14l3-1 M9 17l3-1',
  diaper:'M12 3c-2 4-7 8-7 12a7 7 0 0 0 14 0c0-4-5-8-7-12Z M8 15a4 4 0 0 0 3 4',
  misc:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
  home:'m3 10 9-7 9 7 M5 9v12h5v-7h4v7h5V9',
  timeline:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M12 7v5l3 2',
  settings:'m9 3 1-1h4l1 3 3 1 3 2-1 3v3l1 3-3 2-3 1-1 2h-4l-1-3-3-1-3-2 1-3v-3L3 7l3-2 3-1Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  edit:'m4 16 12-12 4 4L8 20H4Z M13 7l4 4',
  trash:'M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
  share:'M12 16V3m-4 4 4-4 4 4 M5 12v9h14v-9',
  copy:'M9 9h12v12H9Z M15 5V3H3v12h2',
  plus:'M12 5v14 M5 12h14', close:'m6 6 12 12 M18 6 6 18', check:'m5 12 4 4L19 6'
};
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name] || paths.misc); svg.append(path); return svg;
}
function button(text, className, fn, symbol) {
  const node = el('button', className); node.type = 'button';
  if (symbol) node.append(icon(symbol));
  if (text) node.append(document.createTextNode(text));
  if (fn) node.addEventListener('click', async () => {
    if (node.disabled) return;
    node.disabled = true;
    try { await fn(); } catch (error) { report(error); }
    finally { node.disabled = false; }
  });
  return node;
}
function field(label, type, value = '', maxLength = 1000) {
  const wrap = el('label', '', label);
  const input = el(type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') input.type = type;
  input.setAttribute('aria-label',label); input.value = value; input.maxLength = maxLength; wrap.append(input);
  return {wrap, input};
}
function selectField(label, choices, value) {
  const wrap = el('label', '', label), input = el('select');
  for (const [key, text] of choices) { const opt = el('option', '', text); opt.value = key; input.append(opt); }
  input.setAttribute('aria-label',label); input.value = value; wrap.append(input); return {wrap, input};
}
function vibrate() { navigator.vibrate?.(10); }
function fail(message) { throw new Error(message); }
let string, timestamp, validateEvent, mergeEvents;
function validateSettings(raw) {
  if (!raw || typeof raw !== 'object') fail('Backup settings are missing.');
  if (!['oz','ml'].includes(raw.bottleUnit) || !['12h','24h'].includes(raw.clock) || !['auto','light','dark'].includes(raw.theme)) fail('Backup settings are invalid.');
  return {deviceName:string(raw.deviceName,60), babyName:string(raw.babyName,60), bottleUnit:raw.bottleUnit, clock:raw.clock, theme:raw.theme, lastBackupAt:timestamp(raw.lastBackupAt,true), lastSyncAt:timestamp(raw.lastSyncAt,true)};
}
function validatePayload(raw, kind) {
  if (!raw || raw.app !== 'Eshels Baby App' || raw.version !== 1 || raw.kind !== kind || !Array.isArray(raw.events) || raw.events.length > 25000) fail('This is not a valid Eshels Baby App ' + kind + ' file.');
  const events = raw.events.map(validateEvent), ids = new Set(events.map(e => e.id));
  if (ids.size !== events.length) fail('This file contains duplicate event IDs.');
  return {events, ...(kind === 'backup' ? {settings:validateSettings(raw.settings)} : {})};
}
function freshState() {
  return {events:[], firstRunAt:iso(), settings:{deviceName:'', babyName:'', bottleUnit:'oz', clock:'12h', theme:'auto', lastBackupAt:null, lastSyncAt:null}};
}
let state = freshState(), db, fallback = false, storageOK = true, persisted = false, readyOffline = false;
let screen = 'home', toastTimeout, lastFocus, lastFocusKey, importKind = 'sync', restoring = false;
const sheet = $('#sheet'), main = $('#main');
function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('data');
    request.onsuccess = () => { const result = request.result; result.onversionchange = () => result.close(); resolve(result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { const error=new Error('Close other copies of the app, then reload.');error.name='BlockedError';reject(error); };
  });
}
function readState() {
  if (fallback) return Promise.resolve(JSON.parse(localStorage.getItem(DB_NAME) || 'null'));
  return new Promise((resolve, reject) => {
    const request = db.transaction('data').objectStore('data').get('state');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function commit(change, redraw = true, fromSync = false) {
  const apply = next => {
    const before = !fromSync && next.sync ? new Map(next.events.map(event=>[event.id,JSON.stringify(event)])) : null;
    change(next);
    if(before && next.sync){
      const changed=next.events.filter(event=>before.get(event.id)!==JSON.stringify(event)).map(event=>event.id);
      next.sync.pending=[...new Set([...next.sync.pending,...changed])];
    }
  };
  if (!storageOK) fail('Your changes cannot be saved. Please free some storage and reload.');
  try {
    const perform = () => {
      if (fallback) {
        const next = JSON.parse(localStorage.getItem(DB_NAME) || 'null') || freshState();
        apply(next); localStorage.setItem(DB_NAME, JSON.stringify(next)); state = next; return;
      }
      return new Promise((resolve, reject) => {
        const tx = db.transaction('data', 'readwrite'), store = tx.objectStore('data');
        let next, cause;
        const request = store.get('state');
        request.onsuccess = () => {
          try { next = request.result || freshState(); apply(next); store.put(next, 'state'); }
          catch (error) { cause = error; tx.abort(); }
        };
        tx.oncomplete = () => {state = next; resolve();};
        tx.onerror = tx.onabort = () => reject(cause || tx.error || new Error('Could not save this change.'));
      });
    };
    if (navigator.locks) await navigator.locks.request(DB_NAME, perform); else await perform();
  } catch (error) {
    if (error.name === 'QuotaExceededError') error = new Error('Your phone is out of storage. Your previous entries are safe; this change was not saved.');
    throw error;
  }
  if (redraw) render();
  if(!fromSync && state.sync?.pending.length)scheduleSync();
}
async function healthCheck() {
  const marker = crypto.randomUUID();
  if (fallback) {
    localStorage.setItem(DB_NAME+':health',marker);
    if (localStorage.getItem(DB_NAME+':health') !== marker) fail('Storage check failed.');
    localStorage.removeItem(DB_NAME+':health'); return;
  }
  await new Promise((resolve,reject) => {
    const tx = db.transaction('data','readwrite'), store = tx.objectStore('data');
    store.put(marker,'health'); const read = store.get('health');
    read.onsuccess = () => { if (read.result !== marker) tx.abort(); else store.delete('health'); };
    tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error || new Error('Storage check failed.'));
  });
}
function updated(old) { return new Date(Math.max(Date.now(), Date.parse(old.updatedAt)+1)).toISOString(); }
async function saveEvent(values, original) {
  const now = iso();
  const event = validateEvent({...values, id:original?.id || crypto.randomUUID(), loggedBy:original?.loggedBy || state.settings.deviceName, createdAt:original?.createdAt || now, updatedAt:original ? updated(original) : now, deleted:false});
  await commit(data => {
    const current = data.events.find(e => e.id === event.id);
    if (original && (!current || current.updatedAt !== original.updatedAt)) fail('This entry changed in another window. Reopen it before editing.');
    if (!original && event.endTime === null && data.events.some(e => !e.deleted && e.endTime === null && e.type === event.type && e.subtype === event.subtype)) fail('That timer is already running. Stop it first.');
    if (current) data.events[data.events.indexOf(current)] = event; else data.events.push(event);
  });
  vibrate(); return event;
}
async function stopTimer(id) {
  await commit(data => {
    const event = data.events.find(e => e.id === id);
    if (!event || event.deleted || event.endTime !== null) return;
    event.endTime = new Date(Math.max(Date.now(), Date.parse(event.startTime))).toISOString(); event.updatedAt = updated(event);
  });
  vibrate(); notify('Timer saved. A little rest, remembered.');
}
async function deleteEvent(id) {
  await commit(data => { const event = data.events.find(e => e.id === id); if (event) { event.deleted = true; event.updatedAt = updated(event); } });
}
function dayStart(value = new Date()) { const date = new Date(value); date.setHours(0,0,0,0); return date; }
function dayEnd(value) { const date = dayStart(value); date.setDate(date.getDate()+1); return date; }
function dayKey(value) { const d = new Date(value); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); }
function duration(ms, seconds = false) {
  const total = Math.max(0, Math.floor(ms/1000)), hours = Math.floor(total/3600), minutes = Math.floor(total%3600/60);
  if (seconds) return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
function ago(value) { const diff = Date.now()-Date.parse(value); return diff < 60000 ? 'just now' : duration(diff)+' ago'; }
function time(value) { return new Date(value).toLocaleTimeString([], {hour:'numeric', minute:'2-digit', hour12:state.settings.clock === '12h'}); }
function localInput(value) { const d = new Date(value); return dayKey(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function fromInput(value, original) {
  if(original && localInput(original)===value)return original;
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime()) || localInput(date)!==value) fail('Please choose a valid local date and time.');
  if (date.getTime() > Date.now()+60000) fail('Please choose a time that has already happened.');
  return date.toISOString();
}
function activeEvents() { return state.events.filter(e => !e.deleted).sort((a,b) => Date.parse(b.startTime)-Date.parse(a.startTime)); }
function totals(date, events = activeEvents(), now = Date.now()) {
  const start = +dayStart(date), end = +dayEnd(date);
  let sleep = 0, feeds = 0, wet = 0, dirty = 0;
  for (const event of events) {
    if (event.deleted) continue;
    const a = Date.parse(event.startTime), b = event.endTime ? Date.parse(event.endTime) : now;
    if (event.type === 'sleep') sleep += Math.max(0, Math.min(b,end,now)-Math.max(a,start));
    if (a < start || a >= end) continue;
    if (event.type === 'feed') feeds++;
    if (event.type === 'diaper') { if (['wet','both'].includes(event.subtype)) wet++; if (['dirty','both'].includes(event.subtype)) dirty++; }
  }
  return {sleep,feeds,wet,dirty};
}
function eventTitle(event) {
  if (event.type === 'sleep') return 'Sleep';
  if (event.type === 'diaper') return {wet:'Wet diaper',dirty:'Dirty diaper',both:'Wet + dirty diaper'}[event.subtype];
  if (event.type === 'feed') return {left:'Breast · left',right:'Breast · right',bottle:'Bottle',solids:'Solids'}[event.subtype];
  return event.subtype;
}
function eventDetail(event) {
  const parts = [];
  if (event.type === 'sleep') {
    const overnight = dayKey(event.startTime) !== dayKey(event.endTime || iso());
    const sleepTime = value => (overnight ? new Date(value).toLocaleDateString([], {month:'short',day:'numeric'})+' ' : '')+time(value);
    parts.push('Start '+sleepTime(event.startTime), 'End '+(event.endTime ? sleepTime(event.endTime) : 'In progress'));
  }
  if (event.endTime === null) parts.push('Running · '+duration(Date.now()-Date.parse(event.startTime)));
  else if (event.type === 'sleep' || ['left','right'].includes(event.subtype)) parts.push(duration(Date.parse(event.endTime)-Date.parse(event.startTime)));
  if (event.amount !== null) parts.push(`${event.amount} ${event.unit}`);
  if (event.note) parts.push(event.note);
  return parts.join(' · ') || LABELS[event.type];
}
function notify(message, action, label = 'Undo', timeout = 5000) {
  clearTimeout(toastTimeout); const toast = $('#toast'); toast.replaceChildren(el('span','',message));
  if (action) toast.append(button(label,'',async () => { toast.hidden=true; await action(); }));
  toast.hidden=false; toastTimeout=setTimeout(() => { toast.hidden=true; },timeout);
}
function report(error) {
  const message = error?.message || 'Something went wrong. Please try again.';
  const target = (sheet.open ? sheet : main).querySelector('.error');
  if (target) {$('#toast').hidden=true;target.textContent=message;target.focus();} else notify(message, null, '', 8000);
}
function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
  const dark = state.settings.theme === 'dark' || (state.settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = state.settings.theme === 'auto' ? (meta.media.includes('dark') ? '#15141B' : '#FFF9F5') : (dark ? '#15141B' : '#FFF9F5');
}
function warnings() {
  const target = $('#warnings'); target.replaceChildren();
  if (!storageOK || !persisted || fallback) {
    const box = el('div','notice');
    box.append(el('p','',!storageOK ? 'We can’t save on this phone right now. Free some storage, then reload. Your existing entries have not been replaced.' : fallback ? 'Using basic phone storage. Keep a backup so your little moments stay safe.' : 'Chrome hasn’t protected this storage yet. Keep regular backups in case it clears space.'));
    target.append(box);
  }
  if (Date.now()-Date.parse(state.settings.lastBackupAt || state.firstRunAt) >= 7*86400000) {
    const box=el('div','notice'); box.append(el('p','','A little peace of mind: it’s time for a backup.'),button('Make a backup','',backup));target.append(box);
  }
}
function render() {
  applyTheme(); warnings();
  const header=$('#header'); header.replaceChildren();
  const brand=el('div','brand'), mark=el('span','brand-mark'); mark.append(icon('sleep')); brand.append(mark,el('span','','Eshels Baby App'));header.append(brand);
  $('#nav').replaceChildren(); main.replaceChildren();
  if (!state.settings.deviceName || !state.settings.babyName) {renderWelcome();return;}
  const heading=el('div','header-row'), words=el('div');
  words.append(el('h1','',screen==='home' ? state.settings.babyName : screen==='timeline' ? 'Little moments' : 'Your little world'));
  words.append(el('p','date',screen==='home' ? new Date().toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'}) : screen==='timeline' ? 'A day at a time, all in one place.' : 'Just the way your family likes it.'));
  heading.append(words,el('div','avatar',state.settings.babyName.slice(0,1).toLocaleUpperCase()));header.append(heading);
  for (const [name,label] of [['home','Home'],['timeline','Timeline'],['settings','Settings']]) {
    const tab=button('', 'tab', () => navigate(name)), badge=el('span');badge.append(icon(name));tab.append(badge,document.createTextNode(label));
    tab.setAttribute('aria-current',screen===name?'page':'false');$('#nav').append(tab);
  }
  if (screen==='home') renderHome(); else if(screen==='timeline') renderTimeline(); else renderSettings();
}
function renderWelcome() {
  $('#nav').hidden=true;
  const wrap=el('section','welcome'), art=el('div','illustration');art.append(icon('sleep'));
  wrap.append(art,el('p','eyebrow','For your newest little love'),el('h1','','A little care.\nA little calm.'),el('p','sheet-copy','Sleepy stretches, tiny feeds, everyday firsts. A gentle place to keep them together.'));
  const form=el('form'), device=field('Your name','text',state.settings.deviceName,60), baby=field('Baby’s name','text',state.settings.babyName,60);
  device.input.placeholder='e.g. Raphael';baby.input.placeholder='e.g. Eshel';device.input.required=baby.input.required=true;
  const save=button('Let’s begin','primary');save.type='submit';
  form.append(device.wrap,baby.wrap,save,el('p','footer-note','Your family’s moments, saved on this phone.'));
  form.addEventListener('submit',async event => {event.preventDefault();save.disabled=true;try {await commit(data=>{data.settings.deviceName=device.input.value.trim();data.settings.babyName=baby.input.value.trim();if(!data.settings.deviceName||!data.settings.babyName)fail('Please enter both names.');});$('#nav').hidden=false;vibrate();} catch(error){report(error);}finally{save.disabled=false;}});
  wrap.append(form);main.append(wrap);
}
function renderHome() {
  $('#nav').hidden=false;
  const events=activeEvents();
  for (const event of events.filter(e=>e.endTime===null)) {
    const banner=el('section','timer '+event.type), top=el('div','timer-top');top.append(icon(event.type),el('span','',eventTitle(event)+' in progress'));
    const bottom=el('div','timer-bottom'), elapsed=el('strong','elapsed numeric',duration(Date.now()-Date.parse(event.startTime),true));elapsed.dataset.timer=event.startTime;
    bottom.append(elapsed,button('Stop','',()=>stopTimer(event.id)));banner.append(top,bottom);main.append(banner);
  }
  const intro=el('div','intro');intro.append(el('h2','','A moment to remember'),el('span','eyebrow','Quick log'));main.append(intro);
  const tiles=el('div','tiles');
  for (const type of TYPES) {
    const tile=button('','tile '+type,()=>openLog(type)), badge=el('span','badge'), plus=el('span','plus');badge.append(icon(type));plus.append(icon('plus'));
    tile.dataset.focusKey='tile-'+type;
    const last=events.find(e=>e.type===type), caption=el('small','',last?'Last: '+ago(last.startTime):'No entries yet');caption.dataset.last=type;
    tile.append(badge,plus,el('strong','',LABELS[type]),caption);tiles.append(tile);
  }
  main.append(tiles);
  const today=el('section','card today'), heading=el('div','section-heading');heading.append(el('h2','','Today'),el('span','caption','The little overview'));today.append(heading);
  const stats=el('div','stats');
  for (const [name,label,symbol] of [['sleep','Total sleep','sleep'],['feeds','Feeds','feed'],['diapers','Wet / dirty','diaper'],['since','Since last feed','timeline']]) {
    const stat=el('div','stat'), title=el('div','stat-label');title.append(icon(symbol),el('span','',label));const value=el('strong','numeric');value.dataset.stat=name;stat.append(title,value);stats.append(stat);
  }
  today.append(stats);main.append(today);
  const note=el('p','footer-note');note.id='offline-status';note.append(icon('check'),document.createTextNode(readyOffline?'Saved on this phone · ready offline':'Saved on this phone'));main.append(note);const syncNote=el('p','footer-note');syncNote.dataset.syncStatus='';main.append(syncNote);syncStatus();tick();
}
function dayLabel(date) {
  const yesterday=dayStart();yesterday.setDate(yesterday.getDate()-1);
  return dayKey(date)===dayKey(new Date())?'Today':dayKey(date)===dayKey(yesterday)?'Yesterday':new Date(date).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric',year:'numeric'});
}
function renderTimeline() {
  const events=activeEvents();
  if (!events.length) {const empty=el('div','empty'), art=el('div','illustration');art.append(icon('sleep'));empty.append(art,el('h2','','No events yet.'),el('p','','The little moments will find a home here. Log your first one from Home.'),button('Go to Home','secondary',()=>navigate('home')));main.append(empty);return;}
  const days=new Map();
  for(const event of events) {
    const start=dayStart(event.startTime), end=event.type==='sleep'?dayStart(event.endTime || new Date()):start;
    // Split a sleep across local calendar days, including daylight-saving changes.
    for(let d=new Date(start);d<=end || +d===+start;d.setDate(d.getDate()+1)) {
      if (event.type==='sleep' && +d!==+start && +d>=Date.parse(event.endTime || iso())) break;
      const key=dayKey(d);if(!days.has(key))days.set(key,{date:new Date(d),events:[]});days.get(key).events.push(event);
    }
  }
  for(const key of [...days.keys()].sort().reverse()) {
    const group=days.get(key), section=el('section'), heading=el('div','day-header'), total=totals(group.date);
    const summary=el('small','numeric',`${duration(total.sleep)} sleep · ${total.feeds} feeds · ${total.wet} wet / ${total.dirty} dirty`);summary.dataset.day=group.date.toISOString();heading.append(el('h2','',dayLabel(group.date)),summary);section.append(heading);
    for(const event of group.events) {
      const row=button('','event '+event.type,()=>openLog(event.type,event)), badge=el('span','badge');badge.append(icon(event.type));
      row.dataset.focusKey='event-'+event.id;
      const body=el('span','event-main'), detail=el('small','',(dayKey(event.startTime)!==key?'Continued · ':'')+eventDetail(event));detail.dataset.eventId=event.id;detail.dataset.continued=String(dayKey(event.startTime)!==key);body.append(el('strong','',eventTitle(event)),detail);
      const side=el('span','event-side'), at=el('time','',time(event.startTime));at.dateTime=event.startTime;
      const initial=el('span','initial',event.loggedBy.slice(0,1).toLocaleUpperCase());initial.title='Logged by '+event.loggedBy;initial.setAttribute('aria-label','Logged by '+event.loggedBy);if(event.type!=='sleep')side.append(at);side.append(initial);row.append(badge,body,side);section.append(row);
    }
    main.append(section);
  }
}
function tick() {
  sleepEditor?.tick();
  for(const node of document.querySelectorAll('[data-timer]')) node.textContent=duration(Date.now()-Date.parse(node.dataset.timer),true);
  if(screen==='timeline'){const events=activeEvents(),map=new Map(events.map(e=>[e.id,e]));for(const node of document.querySelectorAll('[data-day]')){const total=totals(node.dataset.day,events);node.textContent=`${duration(total.sleep)} sleep · ${total.feeds} feeds · ${total.wet} wet / ${total.dirty} dirty`;}for(const node of document.querySelectorAll('[data-event-id]')){const event=map.get(node.dataset.eventId);if(event)node.textContent=(node.dataset.continued==='true'?'Continued · ':'')+eventDetail(event);}}
  if(screen!=='home')return;
  const events=activeEvents(), total=totals(new Date(),events), lastFeed=events.find(e=>e.type==='feed');
  const values={sleep:duration(total.sleep),feeds:String(total.feeds),diapers:`${total.wet} / ${total.dirty}`,since:lastFeed?duration(Date.now()-Date.parse(lastFeed.startTime)):'—'};
  for(const node of document.querySelectorAll('[data-stat]'))node.textContent=values[node.dataset.stat];
  for(const node of document.querySelectorAll('[data-last]')){const event=events.find(e=>e.type===node.dataset.last);node.textContent=event?'Last: '+ago(event.startTime):'No entries yet.';}
}
function navigate(name) {
  if(screen===name)return;
  screen=name;history.pushState({screen,sheet:false},'');render();window.scrollTo(0,0);main.focus();
}
function openSheet(title, category='') {
  if(!sheet.open){lastFocus=document.activeElement;lastFocusKey=lastFocus?.dataset.focusKey;history.pushState({screen,sheet:true},'');}
  sheet.className=category;
  const content=$('#sheet-content');content.replaceChildren(el('div','handle'));
  const head=el('div','sheet-heading'), heading=el('h2','',title);heading.id='sheet-title';
  const close=button('','close',closeSheet,'close');close.setAttribute('aria-label','Close sheet');head.append(heading,close);content.append(head);
  if(!sheet.open)sheet.showModal();
  sheet.scrollTop=0;return content;
}
function hideSheet(){sleepEditor=null;sheet.close();const target=lastFocus?.isConnected?lastFocus:lastFocusKey?document.querySelector('[data-focus-key="'+CSS.escape(lastFocusKey)+'"]'):null;(target || main).focus();}
function closeSheet(){if(history.state?.sheet)history.back();else hideSheet();}
function formError(form){const error=el('p','error');error.setAttribute('role','alert');error.tabIndex=-1;form.append(error);return error;}
function submitForm(form, label, action) {
  const footer=el('div','sheet-footer'), save=button(label,'primary');save.type='submit';footer.append(save);formError(form);form.append(footer);
  form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{await action();}catch(error){report(error);}finally{save.disabled=false;}});
}
function timeFields(parent, value) {
  const row=el('div','time-row');row.append(el('span','','When'));
  const start=field('Date and time','datetime-local',localInput(value || iso()));start.wrap.hidden=!value;
  const toggle=button(value?time(value):'Now','',()=>{start.wrap.hidden=!start.wrap.hidden;toggle.setAttribute('aria-expanded',String(!start.wrap.hidden));if(!start.wrap.hidden)start.input.focus();});toggle.setAttribute('aria-expanded',String(!!value));
  row.append(toggle);parent.append(row,start.wrap);
  return ()=>start.wrap.hidden&&!value?iso():fromInput(start.input.value,value);
}
function options(parent, entries, selected, onSelect) {
  const row=el('div','options');
  for(const [key,text] of entries){const option=button(text,'option',()=>{for(const n of row.children)n.setAttribute('aria-pressed',String(n===option));onSelect(key);});option.setAttribute('aria-pressed',String(key===selected));row.append(option);}
  parent.append(row);return row;
}
let sleepEditor = null;
function sleepTimeLabel(value) {
  if (!value) return 'Today · Add';
  return (dayKey(value) === dayKey(new Date()) ? 'Today' : new Date(value).toLocaleDateString([], {month:'short',day:'numeric'})) + ' · ' + time(value);
}
async function sleepPhoto(file) {
  if (!file || !file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) fail('Choose an image smaller than 15 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 900 / Math.max(bitmap.width,bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const photo=canvas.toDataURL('image/jpeg',.7);
    if(photo.length>250000)fail('This photo is too detailed. Try a smaller image.');
    return photo;
  } finally { bitmap.close(); }
}
function openSleep(selected) {
  let original=selected || activeEvents().find(event=>event.type==='sleep'&&event.endTime===null);
  let draft={type:'sleep',subtype:'sleep',startTime:original?.startTime || iso(),endTime:original?.endTime ?? null,amount:null,unit:'',note:original?.note || '',photo:original?.photo || ''};
  let dirty=false,startChanged=false;
  const content=openSheet('Sleep','sleep sleep-editor');
  content.replaceChildren();
  const heading=el('div','sleep-heading'),close=button('','sleep-close',closeSheet,'close');close.setAttribute('aria-label','Close sheet');
  const title=el('h2','','Sleep');title.id='sheet-title';
  const save=button('Save','sleep-save',async()=>{await persist();closeSheet();notify('Sleep saved.');});
  heading.append(close,title,save);content.append(heading);
  const hero=el('section','sleep-hero');
  for(const [name,position] of [['misc','star-one'],['misc','star-two'],['misc','star-three'],['mask','moon-doodle']]){const doodle=el('span','sleep-doodle '+position);doodle.append(icon(name));hero.append(doodle);}
  hero.append(el('p','sleep-total-label','Total Time'));
  const clock=el('div','sleep-clock numeric');clock.setAttribute('role','timer');clock.setAttribute('aria-label','Sleep duration');
  const digits={};for(const [part,unit] of [['hours','h'],['minutes','m'],['seconds','s']]){const group=el('span','sleep-clock-group'),number=el('span','sleep-clock-number','00');digits[part]=number;group.append(number,el('small','',unit));clock.append(group);}
  hero.append(clock);
  const action=button('Start Timer','sleep-timer-button',async()=>{
    if(original?.endTime===null && !draft.endTime){draft.endTime=new Date(Math.max(Date.now(),Date.parse(draft.startTime))).toISOString();end.input.value=localInput(draft.endTime);end.wrap.hidden=true;}
    await persist();refresh();
  });
  const manual=button('Manual entry','sleep-manual',()=>{start.wrap.hidden=false;end.wrap.hidden=false;start.input.focus();});
  hero.append(action,manual);content.append(hero);
  const form=el('div','sleep-fields');content.append(form);
  const start=field('Start date and time','datetime-local',localInput(draft.startTime));
  const end=field('End date and time','datetime-local',localInput(draft.endTime || iso()));
  for(const field of [start,end]){field.wrap.classList.add('sleep-date-editor');field.wrap.hidden=true;}
  const startRow=button('','sleep-field-row',()=>{start.wrap.hidden=!start.wrap.hidden;startRow.setAttribute('aria-expanded',String(!start.wrap.hidden));if(!start.wrap.hidden)start.input.focus();});
  const startValue=el('span','sleep-field-value');startRow.append(el('span','sleep-field-label','Start Time'),startValue);startRow.setAttribute('aria-expanded','false');
  const endRow=button('','sleep-field-row',()=>{end.wrap.hidden=!end.wrap.hidden;endRow.setAttribute('aria-expanded',String(!end.wrap.hidden));if(!end.wrap.hidden)end.input.focus();});
  const endValue=el('span','sleep-field-value');endRow.append(el('span','sleep-field-label','End Time'),endValue);endRow.setAttribute('aria-expanded','false');
  start.input.addEventListener('change',()=>{try{draft.startTime=fromInput(start.input.value,original?.startTime);startChanged=true;dirty=true;refresh();}catch(error){report(error);}});
  end.input.addEventListener('change',()=>{try{draft.endTime=fromInput(end.input.value,original?.endTime);dirty=true;refresh();}catch(error){report(error);}});
  form.append(startRow,start.wrap,endRow,end.wrap);
  const note=field('Notes','textarea',draft.note,2000);note.wrap.classList.add('sleep-notes');note.input.placeholder='A little detail to remember…';note.input.addEventListener('input',()=>{draft.note=note.input.value;dirty=true;});form.append(note.wrap);
  const photoArea=el('div','sleep-photo-area'),picker=el('input');picker.type='file';picker.accept='image/*';picker.hidden=true;
  const photoPreview=el('img','sleep-photo');photoPreview.alt='Photo attached to this sleep';
  const addPhoto=button('Add Photo','sleep-add-photo',()=>picker.click());
  const removePhoto=button('Remove photo','sleep-manual',()=>{draft.photo='';dirty=true;refresh();});
  picker.addEventListener('change',async()=>{if(!picker.files[0])return;addPhoto.disabled=true;try{draft.photo=await sleepPhoto(picker.files[0]);dirty=true;refresh();}catch(error){report(error);}finally{addPhoto.disabled=false;picker.value='';}});
  photoArea.append(photoPreview,addPhoto,removePhoto,picker);form.append(photoArea);formError(form);
  if(original)form.append(button('Delete entry','sleep-delete',async()=>{if(confirm('Delete this sleep? This deletion will also sync to your other phone.')){await deleteEvent(original.id);closeSheet();notify('Sleep deleted.');}},'trash'));
  async function persist(){
    if(!start.wrap.hidden)draft.startTime=fromInput(start.input.value,original?.startTime);
    if(!end.wrap.hidden)draft.endTime=fromInput(end.input.value,original?.endTime);
    if(!original && draft.endTime===null && !startChanged && start.wrap.hidden)draft.startTime=iso();
    original=await saveEvent(draft,original);draft={...original};dirty=false;start.input.value=localInput(draft.startTime);end.input.value=localInput(draft.endTime || iso());
  }
  function refresh(){
    startValue.textContent=sleepTimeLabel(draft.startTime);endValue.textContent=sleepTimeLabel(draft.endTime);
    action.textContent=original?.endTime===null&&!draft.endTime?'Stop Timer':draft.endTime?'Save sleep':'Start Timer';
    manual.hidden=!!original || !!draft.endTime;
    photoPreview.hidden=!draft.photo;if(draft.photo)photoPreview.src=draft.photo;else photoPreview.removeAttribute('src');
    addPhoto.textContent=draft.photo?'Change Photo':'Add Photo';removePhoto.hidden=!draft.photo;
    updateClock();
  }
  function updateClock(){
    const current=original&&state.events.find(event=>event.id===original.id);
    if(current&&current.updatedAt!==original.updatedAt&&!dirty){if(current.deleted){closeSheet();return;}original={...current};draft={...current};note.input.value=draft.note;start.input.value=localInput(draft.startTime);end.input.value=localInput(draft.endTime || iso());refresh();return;}
    const elapsed=draft.endTime?Date.parse(draft.endTime)-Date.parse(draft.startTime):original?Date.now()-Date.parse(draft.startTime):0;
    const total=Math.max(0,Math.floor(elapsed/1000));digits.hours.textContent=String(Math.floor(total/3600));digits.minutes.textContent=String(Math.floor(total%3600/60)).padStart(2,'0');digits.seconds.textContent=String(total%60).padStart(2,'0');
  }
  sleepEditor={tick:updateClock};refresh();
}

function openLog(type, original) {
  if(type==='sleep')return openSleep(original);
  const content=openSheet(original?'Edit '+LABELS[type].toLowerCase():LABELS[type],type);
  content.append(el('p','sheet-copy',{sleep:'Every little rest counts.',feed:'A full tummy, a happy little one.',diaper:'Fresh, comfy, and ready for more.',misc:'The other little moments worth remembering.'}[type]));
  const form=el('form');content.append(form);
  let subtype=original?.subtype || (type==='sleep'?'sleep':type==='diaper'?'wet':type==='feed'?'left':'');
  let feedMode=original?.subtype==='bottle'?'bottle':original?.subtype==='solids'?'solids':'breast';
  const note=field('Note (optional)','textarea',original?.note || '',2000);
  let getStart, end, amount, unit, label;
  if(type==='diaper' && !original) {
    const details=el('div');details.hidden=true;getStart=timeFields(details);details.append(note.wrap);
    const choices=el('div','diaper-options');
    for(const [key,title] of [['wet','Wet'],['dirty','Dirty'],['both','Both']]) {
      const choice=button('','diaper-choice',async()=>{
        const start=getStart(),event=await saveEvent({type,subtype:key,startTime:start,endTime:start,amount:null,unit:'',note:note.input.value});
        closeSheet();notify(title+' diaper saved.',async()=>{await deleteEvent(event.id);notify('Diaper entry undone.');});
      });choice.append(icon('diaper'),el('strong','',title));choices.append(choice);
    }
    form.append(choices,button('Add details','text-button',()=>{details.hidden=!details.hidden;}),details);formError(form);return;
  }
  let feedPanel, drawFeed;
  if(type==='feed') {
    options(form,[['breast','Breast'],['bottle','Bottle'],['solids','Solids']],feedMode,value=>{feedMode=value;subtype=value==='breast'?'left':value;drawFeed();});
    feedPanel=el('div');form.append(feedPanel);
    amount=field('Amount','number',original?.amount ?? '');amount.input.min='.01';amount.input.max='10000';amount.input.step='any';
    unit=selectField('Unit',[['oz','oz'],['ml','ml']],original?.unit || state.settings.bottleUnit);
    end=field('End time','datetime-local',localInput(original?.endTime || iso()));
    drawFeed=() => {
      feedPanel.replaceChildren();
      if(feedMode==='breast') {
        options(feedPanel,[['left','Left side'],['right','Right side']],subtype,value=>{subtype=value;drawFeed();});
        const running=activeEvents().find(e=>e.type==='feed'&&e.subtype===subtype&&e.endTime===null&&e.id!==original?.id);
        if(running){const timer=el('div','timer feed'),elapsed=el('strong','elapsed numeric');elapsed.dataset.timer=running.startTime;elapsed.textContent=duration(Date.now()-Date.parse(running.startTime),true);timer.append(elapsed,button('Stop '+subtype+' timer','secondary',async()=>{await stopTimer(running.id);drawFeed();}));feedPanel.append(timer);}
        if(original?.endTime)feedPanel.append(end.wrap);
      } else if(feedMode==='bottle') {
        const grid=el('div','form-grid');grid.append(amount.wrap,unit.wrap);feedPanel.append(grid);
      }
      amount.input.required=feedMode==='bottle';
      const submit=form.querySelector('button[type="submit"]');if(submit){const running=!original&&feedMode==='breast'&&activeEvents().some(e=>e.type==='feed'&&e.subtype===subtype&&e.endTime===null);submit.disabled=!!running;submit.textContent=running?'Timer already running':original?'Save changes':feedMode==='breast'?'Start '+subtype+' timer':'Save feed';}
    };
    drawFeed();getStart=timeFields(form,original?.startTime);
    if(original?.endTime===null) form.append(button('Stop timer now','secondary',async()=>{await stopTimer(original.id);closeSheet();}));
  } else {
    if(type==='diaper') options(form,[['wet','Wet'],['dirty','Dirty'],['both','Both']],subtype,value=>{subtype=value;});
    if(type==='misc') {
      const chips=el('div','chips');label=field('What happened?','text',original?.subtype || '',80);label.input.required=true;
      for(const text of ['Medicine','Bath','Tummy time','Doctor','Other'])chips.append(button(text,'',()=>{label.input.value=text;}));form.append(chips,label.wrap);
    }
    getStart=timeFields(form,original?.startTime);
  }
  form.append(note.wrap);
  submitForm(form,original?'Save changes':type==='feed'?'Start left timer':'Save moment',async()=>{
    const startTime=getStart();
    let endTime=startTime;
    if(type==='feed'&&feedMode==='breast')endTime=original?.endTime?fromInput(end.input.value,original.endTime):null;
    const event=await saveEvent({type,subtype:type==='misc'?label.input.value.trim():subtype,startTime,endTime,amount:type==='feed'&&feedMode==='bottle'?Number(amount.input.value):null,unit:type==='feed'&&feedMode==='bottle'?unit.input.value:'',note:note.input.value},original);
    closeSheet();notify(event.endTime===null?'Timer started. You can close the app.':'Moment saved.');
  });
  if(drawFeed)drawFeed();
  if(original)form.append(button('Delete entry','danger',()=>{
    if(confirm('Delete this entry? The deletion will be included in your next sync.'))return deleteEvent(original.id).then(()=>{closeSheet();notify('Entry deleted.');});
  },'trash'));
}
function renderSettings() {
  const profile=el('section','card settings-group');profile.append(el('h2','','Your family'));
  const form=el('form'), device=field('Your name','text',state.settings.deviceName,60), baby=field('Baby’s name','text',state.settings.babyName,60);
  device.input.required=baby.input.required=true;
  const unit=selectField('Bottle unit',[['oz','Ounces (oz)'],['ml','Milliliters (ml)']],state.settings.bottleUnit), clock=selectField('Clock',[['12h','12 hour'],['24h','24 hour']],state.settings.clock), theme=selectField('Appearance',[['auto','Auto · follow phone'],['light','Light'],['dark','Dark']],state.settings.theme);
  const grid=el('div','form-grid');grid.append(unit.wrap,clock.wrap);form.append(device.wrap,baby.wrap,grid,theme.wrap);
  submitForm(form,'Save preferences',async()=>{await commit(data=>{data.settings={...data.settings,deviceName:device.input.value.trim(),babyName:baby.input.value.trim(),bottleUnit:unit.input.value,clock:clock.input.value,theme:theme.input.value};if(!data.settings.deviceName||!data.settings.babyName)fail('Please enter both names.');});notify('Made just right for your family.');});
  profile.append(form);main.append(profile);
  const sync=el('section','card settings-group');sync.append(el('h2','','Family sync'),el('p','','Entries, timers, notes, and photos sync automatically over mobile data or Wi-Fi. Offline changes send when you reconnect or reopen the app.'));
  const status=el('p','sync-date');status.dataset.syncStatus='';status.setAttribute('role','status');sync.append(status);
  sync.append(button(state.sync?'Link another phone':'Connect this phone','settings-action',state.sync?shareFamilyLink:openFamilyConnection,'share'));
  if(state.sync)sync.append(el('p','sync-date','Keep your family link private. Anyone with it can read and change your entries.'));
  main.append(sync);syncStatus();
  const backups=el('section','card settings-group');backups.append(el('h2','','Keep them safe'),el('p','','A backup saves every entry and your preferences. Keep a copy somewhere you trust.'));
  for(const [text,fn,symbol] of [['Download backup',backup,'share'],['Restore backup',()=>pickFile('backup'),'plus'],['Export CSV',exportCSV,'share']])backups.append(button(text,'settings-action',fn,symbol));
  main.append(backups,el('p','about','Eshels Baby App · Version '+VERSION),el('p','about','Made for small moments. Kept on your phone.'));
}
function payload(kind) {return {app:'Eshels Baby App',version:1,kind,exportedAt:iso(),events:state.events,...(kind==='backup'?{settings:{...state.settings,lastBackupAt:iso()}}:{})};}
function filename(kind,extension='json'){return `eshels-baby-${kind}-${dayKey(new Date())}.${extension}`;}
function download(blob,name) {
  const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function backup() {
  download(new Blob([JSON.stringify(payload('backup'),null,2)],{type:'application/json'}),filename('backup'));
  await commit(data=>{data.settings.lastBackupAt=iso();});notify('Backup downloaded. Keep it somewhere safe.');
}
function csvCell(value) {
  let text=value===null?'':String(value);
  // Neutralize spreadsheet formulas without altering the stored entry.
  if(/^[\s]*[=+@-]/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
async function exportCSV() {
  const keys=['id','type','subtype','startTime','endTime','amount','unit','note','loggedBy','createdAt','updatedAt','deleted'];
  const rows=[keys.join(','),...state.events.map(event=>keys.map(key=>csvCell(event[key])).join(','))];
  download(new Blob(['\uFEFF'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'}),filename('export','csv'));
  await commit(data=>{data.settings.lastBackupAt=iso();});notify('CSV downloaded. Use a JSON backup to restore entries.');
}
async function sendSync() {
  const file=new File([JSON.stringify(payload('sync'))],filename('sync'),{type:'application/json'});
  if(navigator.canShare?.({files:[file]})) {
    try{await navigator.share({files:[file],title:'Eshels Baby App'});}catch(error){if(error.name==='AbortError')return;download(file,file.name);notify('Sharing wasn’t available. Your sync file was downloaded.');}
  }else{download(file,file.name);notify('Sync file downloaded. Send it to the other parent.');}
  await commit(data=>{data.settings.lastSyncAt=iso();});
}
async function boundedBytes(stream) {
  const reader=stream.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT){await reader.cancel();fail('This file is too large. Please use a file under 10 MB.');}chunks.push(value);}}finally{reader.releaseLock();}
  const output=new Uint8Array(size);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}return output;
}
async function encodeSync(data) {
  const json=JSON.stringify(data),input=new Blob([json]);
  if(input.size>LIMIT)fail('Your sync is too large for a code. Send a sync file instead.');
  let bytes=new TextEncoder().encode(json),format='json';
  if(typeof CompressionStream!=='undefined'){bytes=await boundedBytes(input.stream().pipeThrough(new CompressionStream('gzip')));format='gzip';}
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return 'ESHELS1:'+format+':'+btoa(binary);
}
async function decodeSync(code) {
  if(typeof code!=='string'||code.length>LIMIT*1.4)fail('This sync code is too large.');
  const match=code.trim().match(/^ESHELS1:(gzip|json):([A-Za-z0-9+/=\s]+)$/);
  if(!match)fail('That doesn’t look like an Eshels Baby App sync code.');
  let bytes;
  try{bytes=Uint8Array.from(atob(match[2].replace(/\s/g,'')),char=>char.charCodeAt(0));}catch{fail('This sync code is incomplete or damaged.');}
  if(match[1]==='gzip') {
    if(typeof DecompressionStream==='undefined')fail('This browser can’t open compressed codes. Import a sync file instead.');
    try{bytes=await boundedBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));}catch{fail('This compressed sync code is damaged or too large.');}
  }
  if(bytes.length>LIMIT)fail('This sync code is too large.');
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('This sync code is incomplete or damaged.');}
}
async function copySync() {
  const code=await encodeSync(payload('sync'));
  try{await navigator.clipboard.writeText(code);await commit(data=>{data.settings.lastSyncAt=iso();});notify('Sync code copied. Send it to the other parent.');}
  catch{const content=openSheet('Your sync code'),area=field('Select and copy this code','textarea',code,LIMIT*1.4);area.input.readOnly=true;content.append(el('p','sheet-copy','Clipboard access wasn’t available. Touch and hold the code, then choose Copy.'),area.wrap);area.input.focus();area.input.select();}
}
async function importSync(raw) {
  const incoming=validatePayload(raw,'sync');let counts;
  await commit(data=>{const result=mergeEvents(data.events,incoming.events);data.events=result.events;counts=result.counts;data.settings.lastSyncAt=iso();});
  return `Added ${counts.added}, updated ${counts.updated}, unchanged ${counts.unchanged}, deleted ${counts.deleted}.`;
}
function pasteSync() {
  const content=openSheet('Bring your moments together'),form=el('form'),code=field('Paste sync code','textarea','',Math.ceil(LIMIT*1.4));code.input.required=true;code.input.spellcheck=false;
  form.append(code.wrap);submitForm(form,'Import code',async()=>{const summary=await importSync(await decodeSync(code.input.value));closeSheet();notify(summary,null,'',8000);});content.append(form);
}
function pickFile(kind){importKind=kind;$('#import-file').value='';$('#import-file').click();}
$('#import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  const kind=importKind;
  try{
    if(file.size>LIMIT)fail('Please use a file under 10 MB.');
    let raw;try{raw=JSON.parse(await file.text());}catch{fail('This file isn’t readable JSON. Your entries have not changed.');}
    if(kind==='sync'){notify(await importSync(raw),null,'',8000);return;}
    const incoming=validatePayload(raw,'backup');
    if(!confirm(state.sync ? `Merge ${incoming.events.length} backup entries into your family and restore these preferences? Later edits and deletions are kept.` : `Restore ${incoming.events.length} entries? This replaces all entries and preferences on this phone, including your name. Make a backup first if you want to keep them.`))return;
    await commit(data=>{data.events=data.sync?mergeEvents(data.events,incoming.events).events:incoming.events;data.settings=incoming.settings;data.firstRunAt=iso();});notify('Backup restored. Your moments are here.');
  }catch(error){report(error);}
});
sheet.addEventListener('cancel',event=>{event.preventDefault();closeSheet();});
sheet.addEventListener('click',event=>{const r=sheet.getBoundingClientRect();if(event.target===sheet&&(event.clientY<r.top||event.clientX<r.left||event.clientX>r.right))closeSheet();});
sheet.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const items=[...sheet.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(node=>node.getClientRects().length);const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}});
window.addEventListener('popstate',()=>{if(sheet.open)hideSheet();const next=history.state?.screen || 'home';if(next!==screen){screen=next;render();main.focus();}});
history.replaceState({screen:'home',sheet:false},'');
async function setupWorker() {
  if(!('serviceWorker' in navigator)){notify('Offline installation needs Chrome on a secure URL.',null,'',8000);return;}
  try{
    const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
    const update=$('#update');
    function waiting(){if(registration.waiting && navigator.serviceWorker.controller){update.hidden=false;update.onclick=()=>{restoring=true;registration.waiting.postMessage({type:'SKIP_WAITING'});};}}
    waiting();registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')waiting();if(worker.state==='redundant'&&!navigator.serviceWorker.controller)notify('Offline setup didn’t finish. Check that every app file was uploaded, then reopen online.',null,'',10000);});});
    function offlineReady(){readyOffline=true;const status=$('#offline-status');if(status)status.replaceChildren(icon('check'),document.createTextNode('Saved on this phone · ready offline'));}
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(restoring)location.reload();else offlineReady();});
    await navigator.serviceWorker.ready;offlineReady();
  }catch{notify('Offline setup didn’t finish. Open this page online again before using airplane mode.',null,'',10000);}
}
async function boot() {
  try{
    ({string,timestamp,validateEvent,mergeEvents}=await import('./event-data.js'));
    try{db=await openDB();}catch(error){if(error.name==='BlockedError')throw error;fallback=true;}
    await healthCheck();const existing=await readState();
    if(existing){state={events:existing.events.map(validateEvent),settings:validateSettings(existing.settings),firstRunAt:timestamp(existing.firstRunAt),...(existing.sync?{sync:existing.sync}:{})};}
    else{await commit(()=>{},false);}
    if(navigator.storage){try{persisted=await navigator.storage.persisted?.() || false;if(!existing&&!persisted)persisted=await navigator.storage.persist?.() || false;}catch{persisted=false;}}
  }catch(error){storageOK=false;notify('Storage needs attention. '+error.message,null,'',10000);}
  render();setupWorker();setupSync();
}
window.addEventListener('focus',async()=>{if(!storageOK||!db&&!fallback)return;try{const saved=await readState();if(saved){state=saved;if(!sheet.open&&screen!=='settings')render();else tick();}}catch(error){report(error);}});
let currentDay=dayKey(new Date());
setInterval(()=>{const day=dayKey(new Date());if(day!==currentDay){currentDay=day;if(!sheet.open&&screen!=='settings')render();}tick();},1000);
boot();
