// Browser regression for real pointer events and world-space building placement.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.BASE_URL||'http://127.0.0.1:8765/';
const artifact=process.env.ARTIFACT_DIR||'qa-artifacts';
fs.mkdirSync(artifact,{recursive:true});
async function stats(page){
  return page.evaluate(()=>window.__chainReaction.getSpatial());
}
async function visibleRatio(page,id){
  return page.evaluate(objectId=>{
    const node=[...document.querySelectorAll('#spatialObjects [data-world-object-id]')]
      .find(el=>el.dataset.worldObjectId===objectId);
    if(!node)return 0;
    const rect=node.getBoundingClientRect();
    if(rect.width<10||rect.height<10)return 0;
    const overlays=[...document.querySelectorAll('.hud,.action-dock,#dialog:not(.hidden),.sheet:not([hidden])')]
      .filter(el=>el.getClientRects().length && getComputedStyle(el).visibility!=='hidden')
      .map(el=>el.getBoundingClientRect());
    let clear=0,total=0;
    for(let y=0;y<10;y++)for(let x=0;x<10;x++){
      const px=rect.left+rect.width*(x+.5)/10,py=rect.top+rect.height*(y+.5)/10;
      total++;
      if(px<0||py<0||px>=innerWidth||py>=innerHeight)continue;
      if(overlays.some(r=>px>=r.left&&px<=r.right&&py>=r.top&&py<=r.bottom))continue;
      clear++;
    }
    return clear/total;
  },id);
}
async function swipeMouse(page,x,y,dx,dy){
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+dx,y+dy,{steps:6});
  await page.mouse.up();
}
async function swipeTouch(page,x,y,dx,dy){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  for(let i=1;i<=7;i++)await cdp.send('Input.dispatchTouchEvent',{
    type:'touchMove',touchPoints:[{x:x+dx*i/7,y:y+dy*i/7,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await cdp.detach();
}
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader']});
  try{
    for(const device of [
      {name:'desktop',width:1280,height:800,mobile:false},
      {name:'iphone-emulation',width:390,height:844,mobile:true},
      {name:'iphone-landscape-emulation',width:844,height:390,mobile:true}
    ]){
      const page=await browser.newPage({
        viewport:{width:device.width,height:device.height},
        isMobile:device.mobile,hasTouch:device.mobile,deviceScaleFactor:device.mobile?2:1
      });
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(new URL('cinematic/',base).href,{waitUntil:'load'});
      await page.waitForFunction(()=>Boolean(window.__chainReaction?.getSpatial));
      const start=await stats(page);assert.equal(start.objects.length,0);
      await page.getByRole('button',{name:'Город',exact:true}).click();
      let now=await stats(page);assert.equal(now.objects.length,1);
      const city={...now.objects[0]},screenX=city.x-now.camera.x+device.width/2;
      assert.ok(screenX>0&&screenX<device.width,'city is on the visible screen');
      assert.ok((await visibleRatio(page,city.id))>=.86,'city must be >85% user-visible');
      await page.evaluate(()=>__chainReaction.decide(0));
      await page.getByRole('button',{name:'Закрыть сообщение'}).click();
      const pan=device.mobile?swipeTouch:swipeMouse;
      for(let i=0;i<10;i++){
        await pan(page,device.width*.60,device.height*.46,-device.width*.24,0);
      }
      now=await stats(page);
      assert.ok(Math.abs(now.camera.x-start.camera.x)>device.width*2,'camera moved ten drags');
      assert.ok(city.x-now.camera.x+device.width/2<0,'original city has left the screen');
      await page.getByRole('button',{name:'Лес',exact:true}).click();
      now=await stats(page);
      assert.equal(now.objects.length,2);
      const forest={...now.objects[1]};
      assert.ok(forest.x-now.camera.x+device.width/2>0);
      assert.ok((await visibleRatio(page,forest.id))>=.86,'forest must be >85% user-visible');
      await page.evaluate(()=>__chainReaction.decide(0));
      await page.getByRole('button',{name:'Закрыть сообщение'}).click();
      for(let i=0;i<6;i++){
        await pan(page,device.width*.52,device.height*.43,0,-device.height*.20);
      }
      await page.getByRole('button',{name:'Вулкан',exact:true}).click();
      now=await stats(page);assert.equal(now.objects.length,3);
      const volcano={...now.objects[2]};
      const visibility=await visibleRatio(page,volcano.id);
      assert.ok(visibility>=.86,'volcano must be >85% user-visible: '+visibility);
      console.log('VISIBILITY_GATE_PASS',device.name,Math.round(visibility*100)+'%');
      await page.screenshot({path:artifact+'/spatial-'+device.name+'-remote.png'});
      await page.reload({waitUntil:'load'});
      await page.waitForFunction(()=>Boolean(window.__chainReaction?.getSpatial));
      const resumed=await stats(page);
      assert.deepEqual(resumed.objects,[city,forest,volcano],
        'all buildings survive reload at their original global coordinates');
      assert.deepEqual(resumed.camera,now.camera,'camera survives reload');
      const raw=await page.evaluate(()=>localStorage.getItem('chain-reaction-world-v1'));
      assert.deepEqual(JSON.parse(raw).spatial,resumed);
      // Typed ideas use exactly the same viewport-only placement rule.
      await page.evaluate(()=>__chainReaction.decide(0));
      await page.getByRole('button',{name:'Закрыть сообщение'}).click();
      // Short landscape screens may be full: pan into empty territory first.
      for(let i=0;i<3;i++)await pan(page,device.width*.5,device.height*.46,-device.width*.35,0);
      await page.getByRole('button',{name:'Поделись своей идеей'}).click();
      await page.locator('#ideaText').fill('Посади лес');
      await page.getByRole('button',{name:/Отправить идею/}).click();
      const typed=await stats(page);
      const outcome=await page.locator('#dialogTitle').textContent();
      assert.equal(typed.objects.length,4,'typed idea builds a fourth object; '+outcome);
      assert.ok((await visibleRatio(page,typed.objects[3].id))>=.86,
        'typed idea must be >85% user-visible');
      assert.deepEqual(errors,[],'no browser JS exceptions');
      console.log('SPATIAL_UI_PASS',device.name,resumed.objects.length,'objects',JSON.stringify(resumed.camera));
      await page.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error('SPATIAL_UI_FAIL',e.stack);process.exitCode=1;});
