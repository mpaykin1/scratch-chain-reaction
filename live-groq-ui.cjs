'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root='C:/Users/user/Desktop/scratch-groq-qa-20260928';
const base='https://mpaykin1.github.io/scratch-chain-reaction/cinematic/';
const out=path.join(root,'groq-live-proof');
fs.mkdirSync(out,{recursive:true});
const expected=['Groq'];
(async()=>{
 const browser=await chromium.launch({headless:true,
  executablePath:'C:/Users/user/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
  args:['--no-sandbox','--enable-webgl','--use-angle=swiftshader']});
 const results=[];
 try{
  for(const view of [{name:'desktop',width:1366,height:768,mobile:false},
      {name:'iphone11',width:390,height:844,mobile:true}]){
   const context=await browser.newContext({viewport:{width:view.width,height:view.height},
     deviceScaleFactor:view.mobile?2:1,isMobile:view.mobile,hasTouch:view.mobile,
     serviceWorkers:'block'});
   const page=await context.newPage(),errors=[],calls=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(r.url().endsWith('/api/chain-ai'))calls.push(JSON.parse(r.postData()||'{}'));});
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>!!window.__chainReaction,{timeout:20000});
   const coverage=await page.locator('#game').evaluate(el=>{
     const b=el.getBoundingClientRect();return b.width*b.height/(innerWidth*innerHeight);
   });
   assert.ok(coverage>.85,view.name+': game must cover over 85% of viewport; '+coverage);
   if(await page.locator('#closeDialog').isVisible())await page.locator('#closeDialog').click();
   await page.locator('#askIdea').click();
   assert.ok(await page.locator('#ideaBox').isVisible(),view.name+': idea dialog');
   assert.ok(await page.locator('#aiProvider option[value="groq"]').count(),view.name+': Groq option exists');
   await page.locator('#aiProvider').selectOption('groq');
   await page.locator('#ideaText').fill('Построй готический город с домами');
   const [response]=await Promise.all([
    page.waitForResponse(r=>r.url().endsWith('/api/chain-ai')&&r.request().method()==='POST',{timeout:30000}),
    page.locator('#sendIdea').click()
   ]);
   const api=await response.json();
   assert.equal(response.status(),200,view.name+': '+JSON.stringify(api).slice(0,180));
   assert.equal(api.provider,'groq');
   assert.equal(api.executed,false,'model must not modify game state directly');
   assert.equal(calls.at(-1)?.provider,'groq','browser explicitly routed via Groq');
   await page.waitForFunction(()=>window.__chainReaction.getPlaced().city>0,{timeout:20000});
   assert.ok(await page.locator('#cityArt').evaluate(x=>x.classList.contains('active')),
      view.name+': actual city visible');
   const dialog=(await page.locator('#dialog').innerText());
   assert.match(dialog,/Источник:\s*Groq/,view.name+': actual provider disclosed');
   assert.deepEqual(errors,[],view.name+': no unhandled browser errors');
   const screenshot=path.join(out,view.name+'-groq-live.png');
   await page.screenshot({path:screenshot,fullPage:true});
   results.push({view:view.name,viewportCoverage:Math.round(coverage*100),
      requests:calls.length,provider:api.provider,modelAppliedToVisibleCity:true,
      browserErrors:errors.length,screenshot});
   await context.close();
  }
 }finally{await browser.close();}
 console.log(JSON.stringify({passed:results.length,total:2,results},null,2));
})().catch(e=>{console.error('LIVE_GROQ_BROWSER_FAIL',e.stack);process.exitCode=1;});
