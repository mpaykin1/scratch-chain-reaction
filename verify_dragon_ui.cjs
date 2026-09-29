const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.route('https://world-server.mmmpaykin.workers.dev/api/chain-ai',async route=>{
   const body=route.request().postDataJSON();
   const t=String(body.text||'').toLowerCase();
   const commands=t.includes('стреляют')?[{action:'event',kind:'attack'}]:[{action:'event',kind:'dragon'}];
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,provider:'cloudflare',executed:false,proposal:{summary:'ok',commands,unknowns:[]}})});
  });
  await page.goto('http://127.0.0.1:8766/cinematic/',{waitUntil:'load'});
  await page.waitForFunction(()=>Boolean(window.__chainReaction));
  await page.getByRole('button',{name:'Предложить свою идею'}).click();
  await page.locator('#ideaText').fill('Прилетел дракон');
  await page.getByRole('button',{name:/Отправить идею/}).click();
  await page.waitForFunction(()=>document.getElementById('dragonArt').classList.contains('active'));
  const first=await page.evaluate(()=>({entities:__chainReaction.getEntities(),turn:__chainReaction.getState().turn,label:document.getElementById('dragonArt').getAttribute('aria-label')}));
  assert.equal(first.entities[0].hp,100);
  await page.getByRole('button',{name:'Предложить свою идею'}).click();
  await page.locator('#ideaText').fill('Люди в него стреляют');
  await page.getByRole('button',{name:/Отправить идею/}).click();
  await page.waitForFunction(()=>__chainReaction.getEntities()[0].hp<100);
  const second=await page.evaluate(()=>({entities:__chainReaction.getEntities(),turn:__chainReaction.getState().turn,combat:__chainReaction.getHistory().some(e=>e.type==='combat')}));
  assert.ok(second.entities[0].hp<100);assert.equal(second.combat,true);
  console.log('DRAGON_UI_PASS',JSON.stringify({arrival:first,afterAttack:second}));
 }finally{await browser.close();}
})().catch(e=>{console.error('DRAGON_UI_FAIL',e.stack);process.exit(1)});
