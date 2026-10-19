const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
(async()=>{
 let release='1.2.0';const requests=[];
 const files=['index.html','app.js','styles.css','manifest.json','sw.js','sync-config.js','sync.js','event-data.js','icon-192.png','icon-512.png','icon-512-maskable.png'];
 const server=http.createServer((req,res)=>{
  requests.push(req.url);const name=req.url.split('?')[0].replace(/^\/nested\//,'')||'index.html';
  if(!files.includes(name)){res.writeHead(404);res.end();return;}
  let data=fs.readFileSync(path.join(__dirname,'..',name));if(name.endsWith('.js'))data=data.toString().replace("'1.2.0'",`'${release}'`);
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':name.endsWith('.png')?'image/png':'text/html');res.end(data);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/nested/`;
 const browser=await chromium.launch({headless:true});
 async function init(options={}) {
  const ctx=await browser.newContext({viewport:{width:375,height:812},timezoneId:'America/New_York',...options});const page=await ctx.newPage();return {ctx,page};
 }
 async function onboard(page){await page.goto(base);await page.getByLabel('Your name').fill('Parent');await page.getByLabel('Baby’s name').fill('Eshel');await page.getByRole('button',{name:'Let’s begin'}).click();await page.waitForSelector('.tiles');}
 const {ctx,page}=await init();const errors=[];page.on('pageerror',error=>errors.push(error.message));await onboard(page);await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 assert.equal(await page.evaluate(async()=>new URL((await navigator.serviceWorker.getRegistration()).scope).pathname),'/nested/');
 assert.equal(await page.evaluate(()=>DB_NAME),'eshels-baby:/nested/');
 const before=requests.length;await page.reload();await page.waitForSelector('.tiles');await page.getByRole('button',{name:'Timeline',exact:true}).click();await page.getByRole('button',{name:'Home',exact:true}).click();assert.equal(requests.slice(before).filter(name=>!name.endsWith('sw.js')).length,0,'No runtime asset or data network fetches');
 await page.evaluate(()=>openLog('sleep'));await page.getByRole('button',{name:'Manual entry',exact:true}).click();await page.getByLabel('Start date and time',{exact:true}).fill('2026-10-10T23:30');await page.getByLabel('End date and time',{exact:true}).fill('2026-10-11T01:30');await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);
 await page.getByRole('button',{name:'Timeline',exact:true}).click();assert.equal(await page.locator('.day-header').count(),2);assert.match(await page.locator('.day-header').nth(0).innerText(),/1h 30m/);assert.match(await page.locator('.day-header').nth(1).innerText(),/30m sleep/);
 for(const row of await page.locator('.event.sleep').allTextContents()){assert.match(row,/Start Oct 10 11:30 PM/);assert.match(row,/End Oct 11 1:30 AM/);}
 await page.evaluate(()=>{const same={...state.events[0],startTime:'2026-10-11T12:00:00-04:00',endTime:'2026-10-11T13:15:00-04:00'};const detail=eventDetail(same);if(!detail.includes('Start 12:00 PM · End 1:15 PM · 1h 15m'))throw Error('Same-day sleep times missing');if(!eventDetail({...same,endTime:null}).includes('End In progress'))throw Error('Running sleep end label missing');});
 await page.locator('.event').first().click();await page.getByRole('button',{name:/^End Time/}).click();await page.getByLabel('End date and time',{exact:true}).fill('2026-10-10T22:00');await page.getByRole('button',{name:'Save',exact:true}).click();assert.match(await page.locator('#sheet .error').innerText(),/before its start/);await page.getByRole('button',{name:'Close sheet'}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);
 await page.evaluate(()=>openLog('sleep'));await page.mouse.click(10,10);await page.waitForFunction(()=>!document.querySelector('#sheet').open);
 await page.evaluate(()=>navigate('settings'));await page.getByLabel('Bottle unit').selectOption('ml');await page.getByLabel('Clock',{exact:true}).selectOption('24h');await page.getByRole('button',{name:'Save preferences'}).click();await page.waitForFunction(()=>state.settings.bottleUnit==='ml');
 assert.match(await page.evaluate(()=>eventDetail(state.events[0])),/Start Oct 10 23:30 · End Oct 11 01:30/);
 await page.evaluate(()=>openLog('feed'));await page.getByRole('button',{name:'Bottle',exact:true}).click();assert.equal(await page.getByLabel('Unit',{exact:true}).inputValue(),'ml');await page.getByRole('button',{name:'Close sheet'}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);
 await page.evaluate(async()=>{await commit(data=>{data.settings.lastBackupAt=null;data.firstRunAt=new Date(Date.now()-8*86400000).toISOString();});});assert.match(await page.locator('#warnings').innerText(),/time for a backup/);
 await page.evaluate(async()=>{const json=payload('sync'),saved=CompressionStream;try{window.CompressionStream=undefined;const plain=await encodeSync(json);if(!plain.startsWith('ESHELS1:json:'))throw Error('No compression fallback');}finally{window.CompressionStream=saved;}});
 const data=await page.evaluate(()=>payload('backup'));const beforeCancel=await page.evaluate(()=>JSON.stringify(state));page.once('dialog',dialog=>dialog.dismiss());await page.evaluate(()=>{importKind='backup'});await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>JSON.stringify(state)),beforeCancel);
 await page.evaluate(async()=>{
  const original=structuredClone(state.events[0]);original.startTime='2026-10-10T23:30:23.123-04:00';original.endTime='2026-10-11T01:30:45.456-04:00';if(fromInput(localInput(original.startTime),original.startTime)!==original.startTime)throw Error('Unedited timestamp changed');
  let rejected=false;try{fromInput('2026-03-08T02:30');}catch{rejected=true;}if(!rejected)throw Error('Nonexistent DST time accepted');
  const tooLarge=new Blob(['x'.repeat(LIMIT+1)]);let bomb=false;try{await boundedBytes(tooLarge.stream());}catch{bomb=true;}if(!bomb)throw Error('Oversized stream accepted');
 });
 release='1.2.1';await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});await page.waitForSelector('#update:not([hidden])');await page.getByRole('button',{name:'Update available, tap to refresh'}).click();await page.waitForFunction(()=>VERSION==='1.2.1');await page.waitForSelector('.tiles');assert.equal(await page.evaluate(()=>state.events.length),1);
 const cachesAfter=await page.evaluate(()=>caches.keys());assert.equal(cachesAfter.length,1);assert.ok(cachesAfter[0].endsWith('1.2.1'));
 await ctx.setOffline(true);await page.reload();await page.waitForSelector('.tiles');await page.evaluate(()=>openLog('sleep'));await page.getByRole('button',{name:'Start Timer',exact:true}).click();await page.getByRole('button',{name:'Close sheet'}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);await page.reload();await page.waitForSelector('.timer');assert.equal(await page.evaluate(()=>state.events.filter(e=>e.endTime===null).length),1);
 await page.screenshot({path:'artifacts/running-timer.png',fullPage:true});
 const fallback=await init();await fallback.page.addInitScript(()=>Object.defineProperty(window,'indexedDB',{value:undefined}));await onboard(fallback.page);assert.equal(await fallback.page.evaluate(()=>window.localStorage.getItem(DB_NAME)!==null),true);await fallback.page.reload();await fallback.page.waitForSelector('.tiles');assert.match(await fallback.page.locator('#warnings').innerText(),/basic phone storage/);
 const broken=await init();await broken.page.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{value:undefined});Storage.prototype.setItem=function(){throw new DOMException('No storage','QuotaExceededError');};});await broken.page.goto(base);await broken.page.waitForSelector('.welcome');assert.match(await broken.page.locator('#warnings').innerText(),/can’t save/);await broken.page.getByLabel('Your name').fill('Parent');await broken.page.getByLabel('Baby’s name').fill('Eshel');await broken.page.getByRole('button',{name:'Let’s begin'}).click();assert.equal(await broken.page.locator('.tiles').count(),0);
 const failingPersist=await init();await failingPersist.page.addInitScript(()=>{navigator.storage.persist=async()=>{throw Error('Denied');};});await onboard(failingPersist.page);assert.equal(await failingPersist.page.evaluate(()=>storageOK),true);
 assert.deepEqual(errors,[]);await browser.close();await new Promise(resolve=>server.close(resolve));console.log('PASS: repository subpath, no runtime network, manual/cross-midnight sleep, validation, backdrop, preferences, reminder, uncompressed fallback, restore cancel, DST input, size limit, real SW update/reload, offline timer restart, localStorage fallback, total storage failure, persistence denial.');
})().catch(error=>{console.error(error);process.exit(1);});
