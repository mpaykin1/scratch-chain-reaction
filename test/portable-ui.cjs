const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const base=process.env.BASE_URL||'http://127.0.0.1:8765/';
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.CI?undefined:'chrome',args:['--enable-webgl','--use-angle=swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},
      deviceScaleFactor:2,isMobile:true,hasTouch:true,acceptDownloads:true});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://world-server.mmmpaykin.workers.dev/api/chain-ai',route=>route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify({
        ok:true,provider:'cloudflare',executed:false,prediction:{
          summary:'Лес, вероятно, улучшит устойчивость мира.',
          immediate:['Может улучшиться состояние экологии.'],
          later:['Возможно, изменится спрос на ресурсы.'],
          risks:['Эффект может проявляться постепенно.'],
          surprise:'Лес может повлиять на следующие решения.',confidence:0.75
        }
      })
    }));
    await page.goto(new URL('cinematic/',base).href,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof window.__chainReaction?.advance==='function');
    const control=await page.locator('#nextTurn').boundingBox();
    assert.ok(control&&control.x>=0&&control.x+control.width<=390,'next-turn control visible in portrait');
    assert.ok(control.y>=0&&control.y+control.height<=844,'next-turn control within screen');
    await page.getByRole('button',{name:'Лес',exact:true}).click();
    const surface=page.locator('#placementSurface');await surface.waitFor({state:'visible'});
    const buildBox=await surface.boundingBox();await page.mouse.click(buildBox.x+buildBox.width*.52,buildBox.y+buildBox.height*.66);
    await page.waitForFunction(()=>!document.getElementById('confirmPrediction').disabled);
    await page.getByRole('button',{name:'Да, строить'}).click();
    const initial=await page.evaluate(()=>__chainReaction.getState());
    await page.getByRole('button',{name:'Следующий ход'}).click();
    const advanced=await page.evaluate(()=>__chainReaction.getState());
    assert.equal(advanced.turn,initial.turn+1,'next turn must advance simulation without another build');
    await page.getByRole('button',{name:'Меню',exact:true}).click();
    const [download]=await Promise.all([
      page.waitForEvent('download'),page.getByRole('button',{name:'Экспортировать мир'}).click()
    ]);
    assert.equal(download.suggestedFilename(),'chain-reaction-save.json');
    const raw=await fs.readFile(await download.path(),'utf8');
    assert.equal(JSON.parse(raw).state.turn,advanced.turn);
    await page.getByRole('button',{name:'Начать заново'}).click();
    assert.equal(await page.evaluate(()=>__chainReaction.getState().turn),0);
    await page.getByRole('button',{name:'Меню',exact:true}).click();
    const [chooser]=await Promise.all([
      page.waitForEvent('filechooser'),page.getByRole('button',{name:'Импортировать мир'}).click()
    ]);
    await chooser.setFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(raw)});
    await page.waitForFunction(expected=>__chainReaction.getState().turn===expected,advanced.turn);
    assert.deepEqual(await page.evaluate(()=>__chainReaction.getState()),advanced);
    await page.reload({waitUntil:'load'});
    await page.waitForFunction(()=>Boolean(window.__chainReaction));
    assert.deepEqual(await page.evaluate(()=>__chainReaction.getState()),advanced,'imported world survives reload');
    await page.getByRole('button',{name:'Меню',exact:true}).click();
    const [invalid]=await Promise.all([
      page.waitForEvent('filechooser'),page.getByRole('button',{name:'Импортировать мир'}).click()
    ]);
    await invalid.setFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('not-json')});
    await page.waitForFunction(()=>document.getElementById('dialogTitle').textContent==='Импорт не выполнен');
    assert.deepEqual(await page.evaluate(()=>__chainReaction.getState()),advanced,'invalid import cannot corrupt game');
    assert.deepEqual(errors,[],'no browser JS errors');
    console.log('PORTABLE_QA_PASS portrait, idle tick, downloadable JSON, import, reload and corrupt-file recovery');
    await page.close();
  }finally{await browser.close();}
})().catch(error=>{console.error('PORTABLE_QA_FAIL',error.stack);process.exitCode=1;});
