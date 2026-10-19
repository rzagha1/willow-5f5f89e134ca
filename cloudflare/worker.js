import {validateEvent, eventOrder} from '../event-data.js';

// Keep photo batches small enough for the free Worker CPU budget.
const BATCH = 4;
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = {'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin'};
    if (origin === env.APP_ORIGIN) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      headers['Access-Control-Max-Age'] = '86400';
    }
    const reply = (data, status=200) => new Response(JSON.stringify(data), {status, headers});
    if (origin && origin !== env.APP_ORIGIN) return reply({error:'Origin not allowed.'}, 403);
    if (new URL(request.url).pathname !== '/sync') return reply({error:'Not found.'}, 404);
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers});
    if (request.method !== 'POST') return reply({error:'Method not allowed.'}, 405);
    const token = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!env.FAMILY_KEY_HASH) return reply({error:'Sync is not configured yet.'}, 503);
    if (!token) return reply({error:'A private family link is required.'}, 401);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const hash = [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    if (hash !== env.FAMILY_KEY_HASH) return reply({error:'This family link is not valid.'}, 401);
    let input, events;
    try {
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw Error('Expected JSON.');
      const reader=request.body?.getReader();if(!reader)throw Error('Missing request body.');
      const chunks=[];let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024){await reader.cancel();throw Error('Request too large.');}chunks.push(value);}
      input=JSON.parse(await new Blob(chunks).text());
      if (!Number.isSafeInteger(input.cursor) || input.cursor<0 || !Array.isArray(input.events) || input.events.length>BATCH) throw Error('Invalid sync request.');
      // Older clients discard pause history when they edit a sleep.
      if(input.protocol!==2)return reply({error:'Update the app on this phone to keep sleep timers in sync.'},409);
      events=input.events.map(validateEvent);
      if(new Set(events.map(event=>event.id)).size!==events.length)throw Error('Duplicate events.');
    } catch(error) { return reply({error:error.message}, 400); }
    try {
      const statements=events.map(event=>env.DB.prepare(`
        INSERT OR REPLACE INTO events (id, updated, ordering, data)
        SELECT ?1, ?2, ?3, ?4 WHERE NOT EXISTS (
          SELECT 1 FROM events WHERE id=?1 AND (updated>?2 OR (updated=?2 AND ordering>=?3))
        )`).bind(event.id,event.updatedAt,eventOrder(event),JSON.stringify(event)));
      // Inserts and reads share one transaction; only committed revisions are acknowledged.
      for(const event of events)statements.push(env.DB.prepare('SELECT data FROM events WHERE id=?').bind(event.id));
      statements.push(env.DB.prepare('SELECT revision,data FROM events WHERE revision>? ORDER BY revision LIMIT ?').bind(input.cursor,BATCH+1));
      const results=await env.DB.batch(statements);
      const rows=results.at(-1).results;
      const page=rows.slice(0,BATCH);
      return reply({
        protocol:2,
        cursor:page.at(-1)?.revision ?? input.cursor,
        more:rows.length>BATCH,
        events:page.map(row=>JSON.parse(row.data)),
        acknowledged:results.slice(events.length,-1).map(result=>JSON.parse(result.results[0].data))
      });
    } catch { return reply({error:'Sync is temporarily unavailable. Your phone will retry.'}, 503); }
  }
};
