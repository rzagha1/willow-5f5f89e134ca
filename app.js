'use strict';
const VERSION = '1.0.0';
const TYPES = ['sleep', 'feed', 'diaper', 'misc'];
const LABELS = {sleep:'Sleep', feed:'Feed', diaper:'Diaper', misc:'Misc'};
const SCOPE = new URL('./', location.href).pathname;
const DB_NAME = 'eshels-baby:' + SCOPE;
const LIMIT = 10 * 1024 * 1024;
const $ = selector => document.querySelector(selector);
const iso = () => new Date().toISOString();
const paths = {
  sleep:'M19.8 14.2A8 8 0 0 1 9.8 4.1a8 8 0 1 0 10 10.1Z M17 3v4m-2-2h4',
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
function string(value, cap, required = false) {
  if (typeof value !== 'string' || value.length > cap || (required && !value.trim())) fail('A text field is missing or too long.');
  return value;
}
function timestamp(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail('A date is invalid.');
  return new Date(value).toISOString();
}
function validateEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('An event is invalid.');
  const id = string(raw.id, 36, true);
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id) || !TYPES.includes(raw.type)) fail('An event ID or category is invalid.');
  const subtype = string(raw.subtype, 80, true);
  const choices = {sleep:['sleep'], diaper:['wet','dirty','both'], feed:['left','right','bottle','solids']};
  if (choices[raw.type] && !choices[raw.type].includes(subtype)) fail('An event option is invalid.');
  const startTime = timestamp(raw.startTime), endTime = timestamp(raw.endTime, true);
  if (endTime && Date.parse(endTime) < Date.parse(startTime)) fail('An end time is before its start.');
  if (endTime === null && !(raw.type === 'sleep' || (raw.type === 'feed' && ['left','right'].includes(subtype)))) fail('Only sleep and breast feeds can have running timers.');
  if (raw.amount !== null && (typeof raw.amount !== 'number' || !Number.isFinite(raw.amount) || raw.amount <= 0 || raw.amount > 10000)) fail('A bottle amount is invalid.');
  const unit = string(raw.unit, 2);
  if (!['','oz','ml'].includes(unit) || (subtype === 'bottle' && (raw.amount === null || !unit))) fail('A bottle amount or unit is missing.');
  if (typeof raw.deleted !== 'boolean') fail('An event deletion flag is invalid.');
  const createdAt = timestamp(raw.createdAt), updatedAt = timestamp(raw.updatedAt);
  if (Date.parse(updatedAt) < Date.parse(createdAt)) fail('An update date is before its creation date.');
  return {id, type:raw.type, subtype, startTime, endTime, amount:raw.amount, unit, note:string(raw.note, 2000), loggedBy:string(raw.loggedBy, 60, true), createdAt, updatedAt, deleted:raw.deleted};
}
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
function mergeEvents(local, incoming) {
  const map = new Map(local.map(event => [event.id, event]));
  const counts = {added:0, updated:0, unchanged:0, deleted:0};
  for (const event of incoming) {
    const old = map.get(event.id);
    if (old && Date.parse(old.updatedAt) >= Date.parse(event.updatedAt)) { counts.unchanged++; continue; }
    map.set(event.id, event);
    counts[event.deleted ? 'deleted' : old ? 'updated' : 'added']++;
  }
  return {events:[...map.values()], counts};
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
async function commit(change, redraw = true) {
  if (!storageOK) fail('Your changes cannot be saved. Please free some storage and reload.');
  try {
    const perform = () => {
      if (fallback) {
        const next = JSON.parse(localStorage.getItem(DB_NAME) || 'null') || freshState();
        change(next); localStorage.setItem(DB_NAME, JSON.stringify(next)); state = next; return;
      }
      return new Promise((resolve, reject) => {
        const tx = db.transaction('data', 'readwrite'), store = tx.objectStore('data');
        let next, cause;
        const request = store.get('state');
        request.onsuccess = () => {
          try { next = request.result || freshState(); change(next); store.put(next, 'state'); }
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
  form.append(device.wrap,baby.wrap,save,el('p','footer-note','No accounts. Just your family, on this phone.'));
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
  const note=el('p','footer-note');note.id='offline-status';note.append(icon('check'),document.createTextNode(readyOffline?'Saved on this phone · ready offline':'Saved on this phone'));main.append(note);tick();
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
      const initial=el('span','initial',event.loggedBy.slice(0,1).toLocaleUpperCase());initial.title='Logged by '+event.loggedBy;initial.setAttribute('aria-label','Logged by '+event.loggedBy);side.append(at,initial);row.append(badge,body,side);section.append(row);
    }
    main.append(section);
  }
}
function tick() {
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
function hideSheet(){sheet.close();const target=lastFocus?.isConnected?lastFocus:lastFocusKey?document.querySelector('[data-focus-key="'+CSS.escape(lastFocusKey)+'"]'):null;(target || main).focus();}
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
function openLog(type, original) {
  const content=openSheet(original?'Edit '+LABELS[type].toLowerCase():LABELS[type],type);
  content.append(el('p','sheet-copy',{sleep:'Every little rest counts.',feed:'A full tummy, a happy little one.',diaper:'Fresh, comfy, and ready for more.',misc:'The other little moments worth remembering.'}[type]));
  const form=el('form');content.append(form);
  let subtype=original?.subtype || (type==='sleep'?'sleep':type==='diaper'?'wet':type==='feed'?'left':'');
  let manual=!!original?.endTime, feedMode=original?.subtype==='bottle'?'bottle':original?.subtype==='solids'?'solids':'breast';
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
  let feedPanel, sleepEnd, drawFeed;
  const existingSleep=!original && type==='sleep' && activeEvents().find(e=>e.type==='sleep'&&e.endTime===null);
  if(type==='sleep') {
    if(existingSleep){const timer=el('div','timer sleep'),elapsed=el('strong','elapsed numeric');elapsed.dataset.timer=existingSleep.startTime;elapsed.textContent=duration(Date.now()-Date.parse(existingSleep.startTime),true);timer.append(el('p','caption','Sleep in progress'),elapsed,button('Stop sleep timer','secondary',async()=>{await stopTimer(existingSleep.id);closeSheet();}));form.append(timer);}
    if(!original)options(form,[['timer','Timer'],['manual','Manual entry']],manual?'manual':'timer',value=>{manual=value==='manual';sleepEnd.hidden=!manual;const save=form.querySelector('button[type="submit"]');save.textContent=manual?'Save sleep':existingSleep?'Timer already running':'Start sleep timer';save.disabled=!manual&&!!existingSleep;});
    getStart=timeFields(form,original?.startTime);
    end=field('End time','datetime-local',localInput(original?.endTime || iso()));sleepEnd=end.wrap;sleepEnd.hidden=!manual;form.append(sleepEnd);
    if(original && original.endTime===null){const running=el('strong','elapsed numeric');running.dataset.timer=original.startTime;form.append(running,button('Stop timer now','secondary',async()=>{await stopTimer(original.id);closeSheet();}));}
  } else if(type==='feed') {
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
  submitForm(form,original?'Save changes':type==='sleep'?'Start sleep timer':type==='feed'?'Start left timer':'Save moment',async()=>{
    const startTime=getStart();
    let endTime=startTime;
    if(type==='sleep')endTime=manual?fromInput(end.input.value,original?.endTime):null;
    if(type==='feed'&&feedMode==='breast')endTime=original?.endTime?fromInput(end.input.value,original.endTime):null;
    const event=await saveEvent({type,subtype:type==='misc'?label.input.value.trim():subtype,startTime,endTime,amount:type==='feed'&&feedMode==='bottle'?Number(amount.input.value):null,unit:type==='feed'&&feedMode==='bottle'?unit.input.value:'',note:note.input.value},original);
    closeSheet();notify(event.endTime===null?'Timer started. You can close the app.':'Moment saved.');
  });
  if(drawFeed)drawFeed();
  if(existingSleep){const save=form.querySelector('button[type="submit"]');save.disabled=true;save.textContent='Timer already running';}
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
  const sync=el('section','card settings-group');sync.append(el('h2','','Share the little moments'),el('p','','Send your entries to the other parent, then import theirs. Nothing leaves this phone until you share it.'));
  for(const [text,fn,symbol] of [['Send sync file',sendSync,'share'],['Import sync file',()=>pickFile('sync'),'plus'],['Copy sync code',copySync,'copy'],['Paste sync code',pasteSync,'copy']])sync.append(button(text,'settings-action',fn,symbol));
  sync.append(el('p','sync-date',state.settings.lastSyncAt?'Last sync: '+new Date(state.settings.lastSyncAt).toLocaleString():'No syncs yet.'));main.append(sync);
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
    if(!confirm(`Restore ${incoming.events.length} entries? This replaces all entries and preferences on this phone, including your name. Make a backup first if you want to keep them.`))return;
    await commit(data=>{data.events=incoming.events;data.settings=incoming.settings;data.firstRunAt=iso();});notify('Backup restored. Your moments are here.');
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
    const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
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
    try{db=await openDB();}catch(error){if(error.name==='BlockedError')throw error;fallback=true;}
    await healthCheck();const existing=await readState();
    if(existing){state={events:existing.events.map(validateEvent),settings:validateSettings(existing.settings),firstRunAt:timestamp(existing.firstRunAt)};}
    else{await commit(()=>{},false);}
    if(navigator.storage){try{persisted=await navigator.storage.persisted?.() || false;if(!existing&&!persisted)persisted=await navigator.storage.persist?.() || false;}catch{persisted=false;}}
  }catch(error){storageOK=false;notify('Storage needs attention. '+error.message,null,'',10000);}
  render();setupWorker();
}
window.addEventListener('focus',async()=>{if(!storageOK||!db&&!fallback)return;try{const saved=await readState();if(saved){state=saved;if(!sheet.open&&screen!=='settings')render();else tick();}}catch(error){report(error);}});
let currentDay=dayKey(new Date());
setInterval(()=>{const day=dayKey(new Date());if(day!==currentDay){currentDay=day;if(!sheet.open&&screen!=='settings')render();}tick();},1000);
boot();
