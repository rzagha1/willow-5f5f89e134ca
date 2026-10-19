const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.APP_URL || 'http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({headless:true});
 const errors=[];
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/New_York',acceptDownloads:true});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 const wait=()=>page.waitForTimeout(160);
 const click=async(name)=>{await page.getByRole('button',{name,exact:true}).click();await wait();};
 const sheet=()=>page.locator('#sheet');
 const close=async()=>{await click('Close sheet');await page.waitForFunction(()=>!document.querySelector('#sheet').open);};
 async function tile(name){await page.locator('.tile').filter({has:page.locator('strong',{hasText:name})}).click();await page.waitForFunction(()=>document.querySelector('#sheet').open);}
 await page.goto(base);await page.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('.welcome'));
 await page.getByLabel('Your name').fill('Raphael');await page.getByLabel('Baby’s name').fill('Eshel');await click('Let’s begin');
 await page.waitForSelector('.tiles');await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 assert.equal(await page.locator('#update').isVisible(),false,'first install must not announce an update');
 await page.screenshot({path:'artifacts/home-light.png',fullPage:true});
 await tile('Sleep');await click('Start timer');await close();
 const sleepId=await page.evaluate(()=>state.events.find(e=>e.type==='sleep').id);
 await page.reload();await page.waitForSelector('.timer');assert.equal(await page.evaluate(()=>state.events.find(e=>e.type==='sleep').id),sleepId);
 await click('Stop');assert.equal(await page.locator('main .timer').count(),0);
 await tile('Diaper');await click('Wet');await page.waitForFunction(()=>!document.querySelector('#sheet').open);await click('Undo');
 assert.equal(await page.locator('#toast').isVisible(),true);assert.match(await page.locator('#toast').innerText(),/undone/);
 assert.equal(await page.evaluate(()=>state.events.filter(e=>e.type==='diaper'&&!e.deleted).length),0);
 assert.equal(await page.evaluate(()=>state.events.filter(e=>e.type==='diaper'&&e.deleted).length),1);
 await tile('Diaper');await click('Both');await page.waitForFunction(()=>!document.querySelector('#sheet').open);
 await tile('Feed');await click('Bottle');await page.getByLabel('Amount',{exact:true}).fill('4.5');await click('Save feed');await page.waitForFunction(()=>!document.querySelector('#sheet').open);
 await tile('Feed');await click('Solids');await page.getByLabel('Notes (optional)').fill('Avocado');await click('Save feed');await page.waitForFunction(()=>!document.querySelector('#sheet').open);
 await tile('Feed');await click('Right side');await click('Start right timer');await page.waitForFunction(()=>!document.querySelector('#sheet').open);assert.match(await page.locator('main .timer').innerText(),/right/);await click('Stop');
 await tile('Moments');await click('Bath');await page.getByLabel('Notes (optional)').fill('<img src=x onerror=alert(1)>');await click('Save moment');await page.waitForFunction(()=>!document.querySelector('#sheet').open);
 await click('Timeline');assert.equal(await page.locator('.event').count(),6);assert.equal(await page.locator('main img').count(),0);
 await page.screenshot({path:'artifacts/timeline-light.png',fullPage:true});
 await page.locator('.event').filter({hasText:'Bath'}).click();await page.getByLabel('Notes (optional)').fill('Warm and sleepy');await click('Save changes');await page.waitForFunction(()=>!document.querySelector('#sheet').open);
 assert.match(await page.locator('.event').filter({hasText:'Bath'}).innerText(),/Warm and sleepy/);
 await page.locator('.event').filter({hasText:'Bath'}).click();page.once('dialog',dialog=>dialog.accept());await click('Delete entry');await page.waitForFunction(()=>!document.querySelector('#sheet').open);
 assert.equal(await page.locator('.event').filter({hasText:'Bath'}).count(),0);
 await click('Home');await tile('Sleep');await page.goBack();await page.waitForFunction(()=>!document.querySelector('#sheet').open);
 await tile('Sleep');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#sheet').open);
 await tile('Feed');for(let i=0;i<15;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.querySelector('#sheet').contains(document.activeElement)),true);}await close();
 await click('Settings');await page.getByLabel('Appearance').selectOption('dark');await click('Save preferences');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await click('Home');await page.screenshot({path:'artifacts/home-dark.png',fullPage:true});
 await click('Settings');await page.getByLabel('Appearance').selectOption('auto');await click('Save preferences');await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(22, 21, 29)');
 await page.emulateMedia({colorScheme:'light'});assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(248, 247, 252)');
 const downloaded=page.waitForEvent('download');await click('Download backup');const backup=await downloaded;assert.match(backup.suggestedFilename(),/^eshels-baby-backup-.*\.json$/);const backupFile=await backup.path();const data=JSON.parse(fs.readFileSync(backupFile,'utf8'));
 const downloadedCSV=page.waitForEvent('download');await click('Export CSV');const csv=await downloadedCSV;assert.match(csv.suggestedFilename(),/eshels-baby-export-.*\.csv/);
 const validation=await page.evaluate(async()=>{
  const before=JSON.stringify(state.events),sync=payload('sync');
  const one=await importSync(sync),two=await importSync(sync);if(JSON.stringify(state.events)!==before)throw Error('Idempotent import changed data');
  const invalid=structuredClone(sync);invalid.events[0].type='unknown';let rejected=false;try{await importSync(invalid);}catch{rejected=true;}if(!rejected||JSON.stringify(state.events)!==before)throw Error('Invalid import mutated data');
  for(const mutation of [e=>e.startTime='bad',e=>e.note='x'.repeat(2001),e=>e.deleted='yes',e=>e.amount=-1,e=>e.endTime='1990-01-01T00:00:00Z']){const broken=structuredClone(sync);mutation(broken.events[0]);let failed=false;try{await importSync(broken);}catch{failed=true;}if(!failed)throw Error('Malformed field accepted');}
  const code=await encodeSync(sync),decoded=await decodeSync(code);if(JSON.stringify(decoded)!==JSON.stringify(sync))throw Error('Gzip round trip failed');
  const plain='ESHELS1:json:'+btoa(unescape(encodeURIComponent(JSON.stringify(sync))));if(JSON.stringify(await decodeSync(plain))!==JSON.stringify(sync))throw Error('Plain round trip failed');
  const event=structuredClone(sync.events.find(e=>!e.deleted));event.note='Later edit';event.updatedAt=new Date(Date.parse(event.updatedAt)+1000).toISOString();await importSync({...sync,events:[event]});if(state.events.find(e=>e.id===event.id).note!=='Later edit')throw Error('Later edit lost');
  event.deleted=true;event.updatedAt=new Date(Date.parse(event.updatedAt)+1000).toISOString();await importSync({...sync,events:[event]});await importSync(sync);if(!state.events.find(e=>e.id===event.id).deleted)throw Error('Deletion resurrected');
  const sample={...event,deleted:false,type:'sleep',subtype:'sleep',startTime:'2026-10-10T23:30:00-04:00',endTime:'2026-10-11T01:30:00-04:00'};
  if(totals(new Date('2026-10-10T12:00:00-04:00'),[sample],Date.parse('2026-10-12T12:00:00Z')).sleep!==1800000)throw Error('First midnight day wrong');
  if(totals(new Date('2026-10-11T12:00:00-04:00'),[sample],Date.parse('2026-10-12T12:00:00Z')).sleep!==5400000)throw Error('Second midnight day wrong');
  const dst={...sample,startTime:'2026-11-01T00:30:00-04:00',endTime:'2026-11-01T02:30:00-05:00'};
  if(totals(new Date('2026-11-01T12:00:00-05:00'),[dst],Date.parse('2026-11-02T12:00:00Z')).sleep!==10800000)throw Error('DST elapsed time wrong');
  if(!csvCell('=1+1').startsWith('"\''))throw Error('CSV formula not neutralized');
  return {one,two,codeLength:code.length};
 });console.log('Data validation:',validation);
 await page.locator('#import-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{no')});await wait();assert.match(await page.locator('main .error').innerText(),/isn’t readable JSON/);
 await page.evaluate(()=>{importKind='backup'});page.once('dialog',dialog=>dialog.accept());await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await wait();assert.equal(await page.evaluate(()=>state.events.length),data.events.length);
 const other=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,timezoneId:'America/New_York'});const b=await other.newPage();await b.goto(base);await b.getByLabel('Your name').fill('Other parent');await b.getByLabel('Baby’s name').fill('Eshel');await b.getByRole('button',{name:'Let’s begin'}).click();await b.waitForSelector('.tiles');
 const sync=await page.evaluate(()=>payload('sync'));await b.evaluate(raw=>importSync(raw),sync);assert.equal(await b.evaluate(()=>state.events.length),sync.events.length);
 await b.evaluate(async()=>{const first=state.events.find(e=>!e.deleted);await deleteEvent(first.id);});await page.evaluate(raw=>importSync(raw),await b.evaluate(()=>payload('sync')));assert.equal(await page.evaluate(()=>state.events.filter(e=>e.deleted).length),await b.evaluate(()=>state.events.filter(e=>e.deleted).length));
 await context.setOffline(true);await page.reload();await page.waitForSelector('#header h1');await click('Home');await tile('Diaper');await click('Dirty');await page.waitForFunction(()=>!document.querySelector('#sheet').open);await page.reload();await page.waitForSelector('.tiles');assert.ok(await page.evaluate(()=>state.events.some(e=>e.subtype==='dirty')));
 await page.goto(base+'index.html');await page.waitForSelector('.tiles');
 await context.setOffline(false);
 for(const [width,height,size] of [[320,740,16],[375,812,16],[480,800,16],[812,375,16],[390,844,24],[320,740,32]]){
  await page.setViewportSize({width,height});await page.evaluate(size=>document.documentElement.style.fontSize=size+'px',size);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}/${size}`);
  for(const category of ['Feed','Sleep']){await tile(category);assert.equal(await page.evaluate(()=>document.querySelector('#sheet').scrollWidth<=document.querySelector('#sheet').clientWidth),true,category+' sheet overflow');await close();}
 }
 assert.deepEqual(errors,[]);await other.close();await context.close();await browser.close();console.log('PASS: onboarding, all event types, edit/delete/undo, timer reload, Back/Escape/focus trap, themes, exports/restore, gzip/plain sync, two devices, midnight/DST, offline reload, responsive layouts, zero page errors.');
})().catch(error=>{console.error(error);process.exit(1);});
