const TYPES = ['sleep','feed','diaper','misc'];
function fail(message){throw new Error(message);}
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
  const photo=raw.photo===undefined?'':string(raw.photo,250000);
  if(photo && !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo))fail('An attached photo is invalid.');
  const createdAt = timestamp(raw.createdAt), updatedAt = timestamp(raw.updatedAt);
  if (Date.parse(updatedAt) < Date.parse(createdAt)) fail('An update date is before its creation date.');
  const pauses=[];
  if(raw.pauses!==undefined){
    if(raw.type!=='sleep'||!Array.isArray(raw.pauses)||raw.pauses.length>1000)fail('Sleep pauses are invalid.');
    let previous=Date.parse(startTime);
    for(const [index,pause] of raw.pauses.entries()){
      if(!pause||typeof pause!=='object')fail('A sleep pause is invalid.');
      const start=timestamp(pause.startTime), end=timestamp(pause.endTime,true);
      if(Date.parse(start)<previous || (end!==null&&Date.parse(end)<Date.parse(start)))fail('Sleep pauses must be in order and cannot overlap.');
      if(end===null&&(endTime!==null||index!==raw.pauses.length-1))fail('Only the last pause of an unfinished sleep can be open.');
      if(endTime!==null&&Date.parse(end)>Date.parse(endTime))fail('Sleep times must include every pause.');
      pauses.push({startTime:start,endTime:end});previous=Date.parse(end);
    }
  }
  return {id, type:raw.type, subtype, startTime, endTime, amount:raw.amount, unit, note:string(raw.note, 2000), loggedBy:string(raw.loggedBy, 60, true), createdAt, updatedAt, deleted:raw.deleted, ...(photo?{photo}:{}), ...(pauses.length?{pauses}:{})};
}

export function sleepPaused(event) { return event.type==='sleep'&&event.endTime===null&&event.pauses?.at(-1)?.endTime===null; }
export function timerDuration(event, now=Date.now(), from=-Infinity, until=Infinity) {
  const start=Math.max(Date.parse(event.startTime),from), end=Math.min(event.endTime?Date.parse(event.endTime):now,until,now);
  let elapsed=Math.max(0,end-start);
  for(const pause of event.pauses || [])elapsed-=Math.max(0,Math.min(pause.endTime?Date.parse(pause.endTime):now,end)-Math.max(Date.parse(pause.startTime),start));
  return Math.max(0,elapsed);
}
export function lastWakeTime(events, before=Date.now(), excludeId) {
  let latest=null;
  for(const event of events){
    if(event.deleted||event.type!=='sleep'||event.id===excludeId)continue;
    const wake=sleepPaused(event)?event.pauses.at(-1).startTime:event.endTime;
    if(wake&&Date.parse(wake)<=before&&(!latest||Date.parse(wake)>Date.parse(latest)))latest=wake;
  }
  return latest;
}
export function finishTimer(event, now=Date.now()) {
  const paused=sleepPaused(event);
  const endTime=paused?event.pauses.at(-1).startTime:new Date(Math.max(now,Date.parse(event.pauses?.at(-1)?.endTime || event.startTime))).toISOString();
  const result={...event,endTime};
  if(paused){result.pauses=event.pauses.slice(0,-1);if(!result.pauses.length)delete result.pauses;}
  return result;
}
function mergeEvents(local, incoming) {
  const map = new Map(local.map(event => [event.id, event]));
  const counts = {added:0, updated:0, unchanged:0, deleted:0};
  for (const event of incoming) {
    const old = map.get(event.id);
    if (old && (old.updatedAt > event.updatedAt || (old.updatedAt === event.updatedAt && eventOrder(old) >= eventOrder(event)))) { counts.unchanged++; continue; }
    map.set(event.id, event);
    counts[event.deleted ? 'deleted' : old ? 'updated' : 'added']++;
  }
  return {events:[...map.values()], counts};
}

// A stable tie-breaker makes simultaneous edits converge on every device.
export function eventOrder(event) { return (event.deleted ? '1' : '0') + JSON.stringify(event).replace(/[\u007f-\uffff]/g, char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0')); }
export {string, timestamp, validateEvent, mergeEvents};
