const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765/';
async function choosePlace(page,x=.5,y=.66,touch=false){
  const surface=page.locator('#placementSurface');await surface.waitFor({state:'visible'});
  const box=await surface.boundingBox(),position={x:box.width*x,y:box.height*y};
  if(touch)await surface.tap({position});else await page.mouse.click(box.x+position.x,box.y+position.y);
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.CI?undefined:'chrome',args:['--enable-webgl','--use-angle=swiftshader']});
  try{
    for(const view of [{name:'iphone11',width:414,height:896,dpr:2},{name:'iphone11-landscape',width:896,height:414,dpr:2},{name:'desktop',width:1440,height:900,dpr:1}]){
      const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:view.dpr,isMobile:view.dpr>1,hasTouch:view.dpr>1});
      const page=await ctx.newPage(),errors=[];
      await page.route('https://world-server.mmmpaykin.workers.dev/api/chain-ai',async route=>{
        const request=route.request(),body=request.postDataJSON?.()||{};
        if(body.mode==='predict_build'){
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
            ok:true,provider:'cloudflare',executed:false,prediction:{
              summary:'Лес, вероятно, улучшит устойчивость мира.',
              immediate:['Может улучшиться состояние экологии.'],
              later:['Может снизиться давление на часть ресурсов.'],
              risks:['Рост леса может потребовать времени для заметного эффекта.'],
              surprise:'Лес может изменить ценность следующих решений.',confidence:0.76
            }
          })});
        }
        const text=String(body.text||'').toLowerCase();
        let commands=[],unknowns=[];
        if(text.includes('прилетел дракон'))commands=[{action:'event',kind:'dragon',details:'Дракон прилетел'}];
        else if(text.includes('стреляют'))commands=[{action:'event',kind:'attack',details:'Жители атакуют дракона'}];
        else unknowns=['Неизвестный механизм'];
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
          ok:true,provider:'cloudflare',executed:false,proposal:{summary:'test',commands,unknowns}
        })});
      });
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
      assert.ok(!(await page.locator('meta[name="viewport"]').getAttribute('content')).includes('user-scalable=no'));
      if(view.name==='iphone11-landscape')assert.equal(initial.renderer,'css-fallback');
      assert.ok(initial.buttons.every(w=>w>=39),'buttons stay touchable');
      if(initial.backing)assert.ok(Math.max(...initial.backing)<=1080,'WebGL backing buffer is physically capped');
      assert.ok(['webgl2','css-fallback'].includes(initial.renderer),'renderer or graceful CSS fallback');
      await page.getByRole('button',{name:'Включить звук'}).click();
      assert.equal(await page.locator('#soundBtn').getAttribute('aria-pressed'),'true');
      await page.getByRole('button',{name:'Выключить звук'}).click();
      await page.getByRole('button',{name:'Лес',exact:true}).click();
      await choosePlace(page,.52,.66,view.dpr>1);
      await page.locator('#predictionBox').waitFor({state:'visible'});
      await page.waitForFunction(()=>!document.getElementById('confirmPrediction').disabled);
      assert.equal(await page.evaluate(()=>window.__chainReaction.getState().turn),0,'prediction itself must not advance time');
      await page.getByRole('button',{name:'Да, строить'}).click();
      await page.waitForFunction(()=>window.__chainReaction.getState().turn===1);
      const choices=await page.evaluate(()=>window.__chainReaction.getDecisionOptions());
      assert.equal(choices.length,4,'Genie needs four context-aware choices');
      assert.equal(choices.filter(x=>x.role==='worsens').length,2);
      assert.equal(choices.filter(x=>x.role==='shifts').length,1);
      assert.equal(choices.filter(x=>x.role==='balanced').length,1);
      assert.equal(await page.locator('[data-decision]').first().textContent(),choices[0].label);
      assert.ok(['critical','stressed','stable'].includes(await page.locator('#game').getAttribute('data-climate')));
      if(view.name==='iphone11-landscape')assert.ok(await page.locator('.reaction-fallback-pulse.active').count());
      await page.getByRole('button',{name:'Предложить свою идею'}).click();
      assert.equal(await page.evaluate(()=>document.activeElement?.id),'ideaText','modal focuses input');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#ideaBox').isVisible(),false,'Escape dismisses modal');
      assert.equal(await page.evaluate(()=>document.activeElement?.id),'askIdea','focus returns to opener');
      await page.getByRole('button',{name:'Предложить свою идею'}).click();
      await page.locator('#ideaText').fill('Пусть вселенная танцует под музыку');
      await page.getByRole('button',{name:/Отправить идею/}).click();
      assert.equal(await page.evaluate(()=>window.__chainReaction.getState().turn),1,'unknown ideas must not invent results');
      await page.getByRole('button',{name:'Меню'}).click();
      await page.getByRole('button',{name:'↶ Отменить ход'}).click();
      assert.equal(await page.evaluate(()=>window.__chainReaction.getState().turn),0,'undo restores previous world');
      await page.getByRole('button',{name:'Лес',exact:true}).click();
      await choosePlace(page,.52,.66,view.dpr>1);
      await page.locator('#predictionBox').waitFor({state:'visible'});
      await page.waitForFunction(()=>!document.getElementById('confirmPrediction').disabled);
      await page.getByRole('button',{name:'Да, строить'}).click();
      assert.equal(await page.evaluate(()=>window.__chainReaction.getState().turn),1,'can continue after undo');
      await page.locator('#choiceTrigger').click();
      assert.match(await page.locator('#choiceTitle').innerText(),/энергии/);
      await page.locator('[data-decision="3"]').click();
      const afterChoice=await page.evaluate(()=>window.__chainReaction.getState());
      assert.equal(afterChoice.turn,2,'a Genie decision advances the deterministic clock');
      await page.evaluate(()=>window.__chainReaction.decide(3));
      assert.deepEqual(await page.evaluate(()=>window.__chainReaction.getState()),afterChoice,'decision cannot be applied twice');
      await page.getByRole('button',{name:'Предложить свою идею'}).click();
      await page.locator('#ideaText').fill('Прилетел дракон');
      await page.getByRole('button',{name:/Отправить идею/}).click();
      await page.waitForFunction(()=>document.getElementById('dragonArt').classList.contains('active'));
      assert.equal((await page.evaluate(()=>__chainReaction.getEntities()[0].hp)),100,'dragon must appear in world state');
      await page.getByRole('button',{name:'Предложить свою идею'}).click();
      await page.locator('#ideaText').fill('Люди в него стреляют');
      await page.getByRole('button',{name:/Отправить идею/}).click();
      await page.waitForFunction(()=>__chainReaction.getEntities()[0].hp<100);
      assert.ok(await page.evaluate(()=>__chainReaction.getHistory().some(e=>e.type==='combat')),'attack becomes a combat event');
      assert.equal(errors.length,0,JSON.stringify(errors));
      console.log('ENHANCEMENT_PASS',view.name,initial);
      await ctx.close();
    }
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const page=await context.newPage();
    await page.route('https://world-server.mmmpaykin.workers.dev/api/chain-ai',route=>route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify({
        ok:true,provider:'cloudflare',executed:false,prediction:{
          summary:'Лес, вероятно, улучшит устойчивость мира.',
          immediate:['Может улучшиться состояние экологии.'],later:[],risks:[],
          surprise:'Лес может изменить следующие решения.',confidence:0.74
        }
      })
    }));
    await page.goto(new URL('cinematic/',BASE).href,{waitUntil:'load'});
    await page.waitForFunction(()=>Boolean(window.__chainReaction&&navigator.serviceWorker?.controller),null,{timeout:25000});
    await page.getByRole('button',{name:'Лес',exact:true}).click();
    await choosePlace(page,.52,.66);
    await page.waitForFunction(()=>!document.getElementById('confirmPrediction').disabled);
    await page.getByRole('button',{name:'Да, строить'}).click();
    await context.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>Boolean(window.__chainReaction),null,{timeout:15000});
    assert.ok((await page.evaluate(()=>window.__chainReaction.getState())).turn>=1,'offline session persisted');
    console.log('OFFLINE_PASS');
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error('ENHANCEMENT_FAIL',error.stack);process.exitCode=1;});
