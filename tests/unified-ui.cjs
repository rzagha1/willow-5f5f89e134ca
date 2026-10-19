const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.APP_URL || 'http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.getByLabel('Your name').fill('Parent');await page.getByLabel('Baby’s name').fill('Eshel');await page.getByRole('button',{name:'Let’s begin'}).click();await page.waitForSelector('.tiles');await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>[...document.fonts].some(font=>font.family==='Nunito Sans'&&font.status==='loaded')),true);
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const close=async()=>{await page.getByRole('button',{name:'Close sheet',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);};
  await page.getByRole('button',{name:'Timeline',exact:true}).click();await page.getByRole('button',{name:'Log your first moment',exact:true}).click();
  await page.locator('.tile.feed').click();await page.getByRole('button',{name:'Right side',exact:true}).focus();await page.keyboard.press('Enter');
  assert.equal(await page.getByRole('button',{name:'Right side',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('button',{name:'Right side',exact:true}).evaluate(node=>node===document.activeElement),true,'Rebuilt side selector keeps keyboard focus');
  await page.getByRole('button',{name:'Bottle',exact:true}).click();await page.getByLabel('Amount',{exact:true}).fill('4');await page.getByRole('button',{name:'Save feed',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);
  await page.locator('.tile.misc').click();const bath=page.getByRole('button',{name:'Bath',exact:true}),before=await bath.boundingBox();await bath.click();const after=await bath.boundingBox();assert.equal(before.width,after.width,'Selected chip does not shift its neighbors');assert.equal(await bath.getAttribute('aria-pressed'),'true');
  await page.getByLabel('What happened?',{exact:true}).fill('A first smile');assert.equal(await bath.getAttribute('aria-pressed'),'false');await page.getByRole('button',{name:'Save moment',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#sheet').open);
  await page.locator('.tile.diaper').click();await page.getByRole('button',{name:'Add details',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Hide details',exact:true}).getAttribute('aria-expanded'),'true');await page.getByRole('button',{name:'Hide details',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Add details',exact:true}).getAttribute('aria-expanded'),'false');await close();
  await page.getByRole('button',{name:'Timeline',exact:true}).click();assert.match(await page.locator('.day-header').innerText(),/1 feed ·/);assert.match(await page.evaluate(()=>daySummary({sleep:0,feeds:2,wet:0,dirty:0})),/2 feeds ·/);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  // Keyboard traversal must keep every settings control clear of the floating navigation.
  await page.locator('#main').focus();
  for(let i=0;i<10;i++){
   await page.keyboard.press('Tab');
   const covered=await page.evaluate(()=>{const n=document.activeElement;if(!document.querySelector('#main').contains(n))return false;const a=n.getBoundingClientRect(),b=document.querySelector('#nav').getBoundingClientRect();return a.top<b.bottom&&a.bottom>b.top;});
   assert.equal(covered,false,'Settings focus obscured by navigation');
  }
  await page.getByRole('button',{name:'Connect this phone',exact:true}).click();await page.getByLabel('Private family link',{exact:true}).fill('test');
  await page.evaluate(()=>{window.realConnect=connectFamily;connectFamily=()=>new Promise((resolve,reject)=>{window.rejectConnection=reject;});});
  await page.getByRole('button',{name:'Connect',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Connect',exact:true}).getAttribute('aria-busy'),'true');
  await page.evaluate(()=>window.rejectConnection(Error('Try your family link again.')));await page.waitForSelector('#sheet .error:not(:empty)');assert.equal(await page.getByRole('button',{name:'Connect',exact:true}).isEnabled(),true);assert.equal(await page.getByLabel('Private family link',{exact:true}).inputValue(),'test');await close();await page.evaluate(()=>{connectFamily=window.realConnect;});
  const views=['home','timeline','settings','sleep','breast','bottle','solids','diaper','details','misc','connection'];
  async function openView(view){
   if(['home','timeline','settings'].includes(view)){await page.evaluate(view=>navigate(view),view);return;}
   if(view==='connection'){await page.evaluate(()=>openFamilyConnection());return;}
   await page.evaluate(type=>openLog(type),['breast','bottle','solids'].includes(view)?'feed':view==='details'?'diaper':view);
   if(['bottle','solids'].includes(view))await page.getByRole('button',{name:view==='bottle'?'Bottle':'Solids',exact:true}).click();
   if(view==='details')await page.getByRole('button',{name:'Add details',exact:true}).click();
  }
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>commit(data=>{data.settings.theme=theme;}),theme);
   for(const [width,height,size] of [[375,812,16],[812,375,16],[768,1024,16],[1440,900,16],[320,740,32]]){
    await page.setViewportSize({width,height});await page.evaluate(size=>document.documentElement.style.fontSize=size+'px',size);
    for(const view of views){
     await openView(view);
     const issues=await page.evaluate(()=>{
      const root=document.querySelector('#sheet').open?document.querySelector('#sheet'):document.querySelector('.app-shell');const issues=[];
      if(root.scrollWidth>root.clientWidth||document.documentElement.scrollWidth>innerWidth)issues.push('horizontal overflow');
      for(const tab of document.querySelectorAll('.tab'))if(tab.scrollWidth>tab.clientWidth)issues.push('tab label overflow');
      for(const node of root.querySelectorAll('button,input:not([type=file]),select,textarea')){const rect=node.getBoundingClientRect();if(rect.width&&rect.height&&(rect.width<44||rect.height<44))issues.push('small target: '+(node.getAttribute('aria-label')||node.textContent));}
      const rgb=color=>color.match(/[\d.]+/g).map(Number),luma=color=>rgb(color).slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
      for(const node of root.querySelectorAll('h1,h2,p,label,small,strong,.option,.primary,.tab,.sheet-save,.sleep-timer-button,.sleep-pause-button,.sleep-field-value,.text-button')){
       if(!node.getClientRects().length||node.disabled)continue;
       let parent=node;while(parent.parentElement&&rgb(getComputedStyle(parent).backgroundColor)[3]===0)parent=parent.parentElement;
       const style=getComputedStyle(node),a=luma(style.color),b=luma(getComputedStyle(parent).backgroundColor),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
       const large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&parseInt(style.fontWeight)>=700);
       if(ratio<(large?3:4.5))issues.push('contrast: '+node.className+' '+ratio.toFixed(2));
      }
      return issues;
     });
     assert.deepEqual(issues,[],`${theme} ${view} ${width}px/${size}px`);
     if(width===375&&size===16){await page.evaluate(()=>document.fonts.ready);if(await page.locator('#sheet').isVisible())await page.locator('#sheet').evaluate(node=>node.scrollTop=0);await page.screenshot({path:`artifacts/ui-${theme}-${view}.png`});}
     if(await page.locator('#sheet').isVisible())await close();
    }
   }
  }
  await context.setOffline(true);await page.reload();await page.waitForSelector('.tiles');await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>[...document.fonts].some(font=>font.family==='Nunito Sans'&&font.status==='loaded')),true,'Bundled font works offline');
  assert.deepEqual(errors,[]);console.log('PASS: all 11 interface states in both themes, phone/tablet/desktop/landscape/200% type, contrast, touch targets, chip stability, keyboard focus, busy/error feedback, and offline typography.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
