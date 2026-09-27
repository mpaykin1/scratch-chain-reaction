'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://127.0.0.1:8765/';
const views=[
  {name:'iPhone portrait',width:390,height:844,mobile:true},
  {name:'iPhone landscape',width:844,height:390,mobile:true},
  {name:'desktop',width:1440,height:900,mobile:false}
];
async function visit(browser,view){
  const context=await browser.newContext({
    viewport:{width:view.width,height:view.height},
    isMobile:view.mobile,hasTouch:view.mobile,
    serviceWorkers:'block',deviceScaleFactor:view.mobile?2:1
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(new URL('cinematic/',base).href,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.__chainReaction?.getState==='function');
  return {context,page,errors};
}
async function testStartup(browser,view){
  const {context,page,errors}=await visit(browser,view);
  try{
    assert.equal(await page.locator('#modalBackdrop').isHidden(),true);
    assert.equal(await page.locator('#waterScenario').isVisible(),false);
    // An untouched first visit must respond to a real tap, without entering a scenario.
    await page.locator('.option[data-action="forest"]').click({timeout:5000});
    assert.equal(await page.evaluate(()=>__chainReaction.getPlaced().forest),1);
    assert.equal(await page.locator('#choiceTrigger').isVisible(),true);
    await page.locator('#choiceTrigger').click();
    assert.equal(await page.locator('#choiceBox').isVisible(),true);
    assert.equal(await page.locator('#modalBackdrop').isVisible(),true);
    await page.locator('[data-decision="3"]').click();
    assert.equal(await page.locator('#modalBackdrop').isHidden(),true);
    await page.locator('#showMenu').click();
    assert.equal(await page.locator('#menuBox').isVisible(),true);
    assert.equal(await page.locator('#waterScenario').isVisible(),true);
    assert.match(await page.locator('#waterScenario').getAttribute('href'),/scenario\.html$/);
    await page.locator('#closeMenu').click();
    await page.locator('#askIdea').click();
    assert.equal(await page.locator('#ideaBox').isVisible(),true);
    await page.locator('#closeIdea').click();
    const before=await page.evaluate(()=>__chainReaction.getState().turn);
    await page.locator('#nextTurn').click();
    assert.equal(await page.evaluate(()=>__chainReaction.getState().turn),before+1);
    assert.deepEqual(errors,[],view.name+' browser errors');
    console.log('STARTUP_PASS',view.name,'first tap, choices, menu, idea and next turn');
  }finally{await context.close();}
}
async function testAllEntryButtons(browser){
  for(const kind of ['city','energy','volcano','idea']){
    const {context,page,errors}=await visit(browser,views[0]);
    try{
      await page.locator('.option[data-action="'+kind+'"]').click({timeout:5000});
      if(kind==='idea')assert.equal(await page.locator('#ideaBox').isVisible(),true);
      else assert.equal(await page.evaluate(key=>__chainReaction.getPlaced()[key],kind),1);
      assert.deepEqual(errors,[],kind+' startup errors');
      console.log('FIRST_TAP_PASS',kind);
    }finally{await context.close();}
  }
}
(async()=>{
  const browser=await chromium.launch({headless:true,
    channel:process.env.CI?undefined:'chrome',
    args:['--enable-webgl','--use-angle=swiftshader']});
  try{
    for(const view of views)await testStartup(browser,view);
    await testAllEntryButtons(browser);
    console.log('ALL_STARTUP_QA_PASS',views.length,'viewports, all five game buttons');
  }finally{await browser.close();}
})().catch(error=>{console.error('STARTUP_QA_FAIL',error.stack);process.exitCode=1;});
