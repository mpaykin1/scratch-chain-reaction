const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765/';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader']});
  try{
    for(const view of [{name:'iphone11',width:414,height:896,dpr:2},{name:'iphone11-landscape',width:896,height:414,dpr:2},{name:'desktop',width:1440,height:900,dpr:1}]){
      const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:view.dpr,isMobile:view.dpr>1,hasTouch:view.dpr>1});
      const page=await ctx.newPage(),errors=[];
      if(view.name==='iphone11-landscape')await page.addInitScript(()=>{
        const original=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl2'?null:original.call(this,kind,...args)};
      });
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(new URL('cinematic/',BASE).href,{waitUntil:'load'});
      await page.waitForFunction(()=>Boolean(window.__chainReaction&&document.querySelector('#soundBtn')));
      const initial=await page.evaluate(()=>{
        const stage=document.querySelector('#game').getBoundingClientRect(),canvas=document.querySelector('#reactionCanvas');
        return {area:stage.width*stage.height/(innerWidth*innerHeight),renderer:document.querySelector('#game').dataset.effectRenderer,
          backing:canvas?[canvas.width,canvas.height]:null,buttons:[...document.querySelectorAll('.option')].map(b=>b.getBoundingClientRect().width)};
      });
      assert.ok(initial.area>.85,'game must cover >85% of viewport');
      const viewport=await page.locator('meta[name="viewport"]').getAttribute('content');
      assert.ok(!viewport.includes('user-scalable=no'),'mobile accessibility must permit zoom');
      if(view.name==='iphone11-landscape')assert.equal(initial.renderer,'css-fallback');
      assert.ok(initial.buttons.every(w=>w>=39),'buttons stay touchable');
      if(initial.backing)assert.ok(Math.max(...initial.backing)<=1080,'WebGL backing buffer is physically capped');
      assert.ok(['webgl2','css-fallback'].includes(initial.renderer),'renderer or graceful CSS fallback');
      await page.getByRole('button',{name:'Включить звук'}).click();
      assert.equal(await page.locator('#soundBtn').getAttribute('aria-pressed'),'true');
      await page.getByRole('button',{name:'Выключить звук'}).click();
      await page.getByRole('button',{name:'Лес',exact:true}).click();
      await page.waitForFunction(()=>window.__chainReaction.getState().turn===1);
      if(view.name==='iphone11-landscape')assert.ok(await page.locator('.reaction-fallback-pulse.active').count());
      await page.getByRole('button',{name:'Предложить свою идею'}).click();
      await page.locator('#ideaText').fill('Неизвестный механизм для дракона');
      await page.getByRole('button',{name:/Отправить идею/}).click();
      assert.equal(await page.evaluate(()=>window.__chainReaction.getState().turn),1,'unknown ideas must not invent results');
      assert.ok(['critical','stressed','stable'].includes(
        await page.locator('#game').getAttribute('data-climate')),'world must react visually to environmental state');
      await page.locator('#choiceTrigger').click();
      assert.equal(await page.evaluate(()=>document.activeElement.id),'closeChoices');
      await page.keyboard.press('Escape');
      assert.ok(await page.locator('#choiceBox').isHidden());
      assert.equal(await page.evaluate(()=>document.activeElement.id),'choiceTrigger');
      await page.locator('#choiceTrigger').click();
      assert.match(await page.locator('#choiceTitle').innerText(),/энергии/);
      await page.locator('[data-decision="0"]').click();
      assert.equal(await page.evaluate(()=>window.__chainReaction.getState().turn),2,
        'Genie choice must advance the world, not change resources outside time');
      assert.ok((await page.evaluate(()=>window.__chainReaction.getHistory())).some(e=>e.type==='decision'));
      assert.equal(errors.length,0,JSON.stringify(errors));
      console.log('ENHANCEMENT_PASS',view.name,initial);
      await ctx.close();
    }
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const page=await context.newPage();
    await page.goto(new URL('cinematic/',BASE).href,{waitUntil:'load'});
    await page.waitForFunction(()=>Boolean(window.__chainReaction&&navigator.serviceWorker?.controller),null,{timeout:25000});
    await page.getByRole('button',{name:'Лес',exact:true}).click();
    await context.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>Boolean(window.__chainReaction),null,{timeout:15000});
    assert.ok((await page.evaluate(()=>window.__chainReaction.getState())).turn>=1,'offline session persisted');
    console.log('OFFLINE_PASS');
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error('ENHANCEMENT_FAIL',error.stack);process.exitCode=1;});
