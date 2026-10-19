const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const base=process.env.APP_URL || 'http://127.0.0.1:8765/';

(async()=>{
 const {validateEvent,timerDuration,lastWakeTime,sleepPaused,finishTimer}=await import('data:text/javascript;base64,'+fs.readFileSync(__dirname+'/../event-data.js').toString('base64'));
 const at=minute=>new Date(Date.parse('2026-10-19T12:00:00Z')+minute*60000).toISOString();
 const sample={id:randomUUID(),type:'sleep',subtype:'sleep',startTime:at(0),endTime:at(60),amount:null,unit:'',note:'',loggedBy:'Parent',createdAt:at(0),updatedAt:at(65),deleted:false};
 assert.equal(timerDuration(validateEvent(sample),Date.parse(at(120))),60*60000,'Old sleep records need no migration');
 const paused=validateEvent({...sample,endTime:null,pauses:[{startTime:at(30),endTime:null}]});
 assert.equal(sleepPaused(paused),true);
 assert.equal(timerDuration(paused,Date.parse(at(90))),30*60000);
 assert.equal(finishTimer(paused,Date.parse(at(90))).endTime,at(30));
 assert.equal(lastWakeTime([sample,paused],Date.parse(at(40))),at(30));
 const resumed=validateEvent({...sample,pauses:[{startTime:at(30),endTime:at(32)},{startTime:at(40),endTime:at(43)}]});
 assert.equal(timerDuration(resumed,Date.parse(at(90))),55*60000);
 assert.equal(timerDuration(resumed,Date.parse(at(90)),Date.parse(at(31)),Date.parse(at(42))),8*60000,'Pause overlap is clipped to the requested day');
 assert.equal(lastWakeTime([{...sample,startTime:at(-60),endTime:at(70)},sample],Date.parse(at(80))),at(70),'Latest wake is independent of start order');
 assert.equal(lastWakeTime([{...sample,deleted:true},{...sample,endTime:null}],Date.parse(at(80))),null);
 assert.equal(lastWakeTime([sample],Date.parse(at(55))),null,'Future wake times are ignored');
 for(const pauses of [null,{},[{startTime:'bad',endTime:null}],[{startTime:at(-1),endTime:at(2)}],[{startTime:at(30),endTime:at(29)}],[{startTime:at(30),endTime:at(61)}],[{startTime:at(30),endTime:null}],[{startTime:at(10),endTime:at(20)},{startTime:at(15),endTime:at(30)}]])assert.throws(()=>validateEvent({...sample,pauses}));
 assert.throws(()=>validateEvent({...sample,endTime:null,pauses:[{startTime:at(10),endTime:null},{startTime:at(20),endTime:null}]}));
 assert.throws(()=>validateEvent({...sample,type:'feed',subtype:'left',pauses:resumed.pauses}));

 const browser=await chromium.launch();
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York',acceptDownloads:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date('2026-10-19T16:00:00Z')});await page.clock.pauseAt(new Date('2026-10-19T16:00:00Z'));
  await page.goto(base);await page.getByLabel('Your name').fill('Parent');await page.getByLabel('Baby’s name').fill('Eshel');await page.getByRole('button',{name:'Let’s begin'}).click();await page.waitForSelector('.tiles');
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  // Two overlapping old entries deliberately sort differently by start and wake time.
  await page.evaluate(async sample=>{await commit(data=>data.events=[{...sample,id:crypto.randomUUID(),startTime:'2026-10-19T12:00:00Z',endTime:'2026-10-19T15:00:00Z'}, {...sample,id:crypto.randomUUID(),startTime:'2026-10-19T13:00:00Z',endTime:'2026-10-19T14:00:00Z'}]);},sample);
  assert.match(await page.locator('.tile.sleep').innerText(),/Woke 1h 0m ago/);
  assert.equal(await page.locator('[data-awake]').innerText(),'Awake for 1h 0m');
  await page.screenshot({path:'artifacts/home-awake.png',fullPage:true});
  await page.locator('.tile.sleep').click();assert.equal(await page.locator('.sleep-wake-gap').innerText(),'Since last wake-up · 1h 0m');
  await page.getByRole('button',{name:'Start Timer',exact:true}).click();await page.getByRole('button',{name:'Pause Timer',exact:true}).waitFor();
  const id=await page.evaluate(()=>state.events.find(e=>e.endTime===null).id);
  const close=async()=>{await page.getByRole('button',{name:'Close sheet',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);};
  await page.getByLabel('Notes',{exact:true}).fill('A cozy nap');
  await page.clock.fastForward(10*60000);await page.getByRole('button',{name:'Pause Timer',exact:true}).click();await page.getByRole('button',{name:'Resume Timer',exact:true}).waitFor();
  const frozen=await page.locator('.sleep-clock').innerText();
  await page.clock.fastForward(2*60000);assert.equal(await page.locator('.sleep-clock').innerText(),frozen);
  assert.equal(await page.evaluate(id=>timerDuration(state.events.find(e=>e.id===id)),id),10*60000);
  await page.screenshot({path:'artifacts/sleep-paused.png'});
  await close();await context.setOffline(true);await page.reload();await page.waitForSelector('.timer.sleep');
  assert.equal(await page.evaluate(id=>sleepPaused(state.events.find(e=>e.id===id)),id),true);
  assert.match(await page.locator('.timer.sleep').innerText(),/00:10:00/);
  await page.getByRole('button',{name:'Open timer',exact:true}).click();await page.getByRole('button',{name:'Resume Timer',exact:true}).click();await page.getByRole('button',{name:'Pause Timer',exact:true}).waitFor();
  await page.clock.fastForward(5*60000);
  assert.equal(await page.evaluate(id=>timerDuration(state.events.find(e=>e.id===id)),id),15*60000);
  assert.equal(await page.evaluate(id=>state.events.find(e=>e.id===id).startTime,id),'2026-10-19T16:00:00.000Z');
  assert.equal(await page.evaluate(id=>state.events.find(e=>e.id===id).note,id),'A cozy nap');
  await page.getByRole('button',{name:'Pause Timer',exact:true}).click();await page.getByRole('button',{name:'Resume Timer',exact:true}).waitFor();
  await page.clock.fastForward(3*60000);await page.getByRole('button',{name:'Stop Timer',exact:true}).click();await page.getByRole('button',{name:'Save sleep',exact:true}).waitFor();
  assert.equal(await page.evaluate(id=>state.events.find(e=>e.id===id).endTime,id),'2026-10-19T16:17:00.000Z');
  assert.equal(await page.evaluate(id=>timerDuration(state.events.find(e=>e.id===id)),id),15*60000);
  assert.equal(await page.evaluate(()=>state.events.length),3);
  await close();assert.equal(await page.locator('[data-awake]').innerText(),'Awake for 3m');
  assert.equal(await page.locator('[data-stat="sleep"]').innerText(),'4h 15m');
  await page.getByRole('button',{name:'Timeline',exact:true}).click();assert.match(await page.locator('.event.sleep').first().innerText(),/15m · Awake breaks excluded/);
  await page.locator('.event.sleep').first().click();await page.getByLabel('Notes',{exact:true}).fill('Still cozy');await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);
  assert.equal(await page.evaluate(id=>state.events.find(e=>e.id===id).pauses.length,id),1,'Editing preserves the break');
  await context.setOffline(false);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const backupDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Download backup',exact:true}).click();const backup=JSON.parse(fs.readFileSync(await (await backupDownload).path(),'utf8'));
  assert.equal(backup.events.find(e=>e.id===id).pauses.length,1);
  await page.evaluate(()=>{importKind='backup'});page.once('dialog',dialog=>dialog.accept());await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await page.waitForFunction(id=>state.events.find(e=>e.id===id).pauses.length===1,id);
  const csvDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export CSV',exact:true}).click();const csv=fs.readFileSync(await (await csvDownload).path(),'utf8');assert.match(csv,/pauses,sleepSeconds/);assert.ok(csv.includes('900'));
  // Pauses straddling midnight and daylight-saving changes use real elapsed time.
  await page.evaluate(()=>{
   const event={type:'sleep',startTime:'2026-11-01T00:30:00-04:00',endTime:'2026-11-01T02:30:00-05:00',pauses:[{startTime:'2026-11-01T01:55:00-04:00',endTime:'2026-11-01T01:05:00-05:00'}]};
   if(totals('2026-11-01T12:00:00-05:00',[event],Date.parse('2026-11-02T12:00:00Z')).sleep!==170*60000)throw Error('DST pause counted incorrectly');
   const midnight={...event,startTime:'2026-10-18T23:30:00-04:00',endTime:'2026-10-19T00:30:00-04:00',pauses:[{startTime:'2026-10-18T23:55:00-04:00',endTime:'2026-10-19T00:05:00-04:00'}]};
   for(const date of ['2026-10-18T12:00:00-04:00','2026-10-19T12:00:00-04:00'])if(totals(date,[midnight]).sleep!==25*60000)throw Error('Midnight pause counted incorrectly');
  });
  await page.getByRole('button',{name:'Home',exact:true}).click();await page.locator('.tile.sleep').click();await page.getByRole('button',{name:'Start Timer',exact:true}).click();await page.getByRole('button',{name:'Pause Timer',exact:true}).waitFor();
  // Failed storage writes must leave the timer running and retryable.
  await page.evaluate(()=>{window.realSaveEvent=saveEvent;saveEvent=async()=>{throw Error('Test save failed');};});
  await page.getByRole('button',{name:'Pause Timer',exact:true}).click();assert.match(await page.locator('#sheet .error').innerText(),/Test save failed/);
  assert.equal(await page.evaluate(()=>state.events.filter(sleepPaused).length),0);await page.evaluate(()=>{saveEvent=window.realSaveEvent;});
  await page.getByRole('button',{name:'Pause Timer',exact:true}).click();await page.getByRole('button',{name:'Resume Timer',exact:true}).waitFor();
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>{state.settings.theme=theme;applyTheme();},theme);
   for(const [width,height,size] of [[320,740,16],[375,812,16],[768,1024,16],[1024,768,16],[1440,900,16],[812,375,16],[320,740,32]]){
    await page.setViewportSize({width,height});await page.evaluate(size=>document.documentElement.style.fontSize=size+'px',size);await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.evaluate(()=>document.querySelector('#sheet').scrollWidth<=document.querySelector('#sheet').clientWidth),true,`Sleep sheet overflow: ${theme} ${width}/${size}`);
    for(const selector of ['.sleep-pause-button','.sleep-timer-button','.sleep-close','.sleep-save']){const box=await page.locator(selector).boundingBox();assert.ok(box.width>=44&&box.height>=44);}
   }
   await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='16px');await page.locator('#sheet').evaluate(node=>node.scrollTop=0);
   await page.screenshot({path:`artifacts/sleep-${theme}-redesign.png`});
   const contrasts=await page.evaluate(()=>{
    const rgb=color=>color.match(/[\d.]+/g).map(Number);
    const luminance=color=>rgb(color).slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
    return ['.sleep-status','.sleep-hint','.sleep-clock','.sleep-pause-button','.sleep-timer-button','.sleep-save','.sleep-field-value'].map(selector=>{
     const node=document.querySelector(selector);let parent=node;
     while(parent.parentElement&&rgb(getComputedStyle(parent).backgroundColor)[3]===0)parent=parent.parentElement;
     const a=luminance(getComputedStyle(node).color),b=luminance(getComputedStyle(parent).backgroundColor);
     return {selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    });
   });
   for(const {selector,ratio} of contrasts)assert.ok(ratio>=4.5,`${theme} ${selector} contrast ${ratio}`);
  }
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#sheet').open);assert.equal(await page.locator('.tile.sleep').evaluate(node=>node===document.activeElement),true);
  await page.clock.fastForward(2*60000);const homeStopWake=await page.evaluate(()=>state.events.find(sleepPaused).pauses.at(-1).startTime);
  await page.getByRole('button',{name:'Stop',exact:true}).click();await page.waitForFunction(()=>!state.events.some(e=>e.endTime===null));
  assert.equal(await page.evaluate(()=>state.events.at(-1).endTime),homeStopWake,'Home Stop also uses the paused wake time');
  assert.deepEqual(errors,[]);console.log('PASS: wake-based gaps, pause/resume without reset, repeated breaks, offline reload, stop while paused, notes, history/totals, backup/CSV, DST/midnight, validation, save failure recovery, responsive light/dark controls and keyboard focus.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
