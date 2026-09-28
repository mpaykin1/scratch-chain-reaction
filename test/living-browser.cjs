'use strict';
const {createServer}=require('node:http');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let playwright;try{playwright=require('playwright');}
catch{playwright=require(path.join(process.env.USERPROFILE||'','Desktop','World_server','node_modules','playwright'));}
const ROOT=path.resolve(__dirname,'..'),OUT=path.resolve(process.env.ARTIFACT_DIR||path.join(ROOT,'work','living-browser'));
const TYPES={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript',
  '.css':'text/css','.webp':'image/webp','.png':'image/png','.json':'application/json','.svg':'image/svg+xml'};
fs.mkdirSync(OUT,{recursive:true});
const server=createServer((req,res)=>{
  let url;try{url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
  if(url==='/'){res.writeHead(302,{Location:'/cinematic/'}).end();return;}
  if(url.endsWith('/'))url+='index.html';
  const file=path.resolve(ROOT,'.'+url);
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':TYPES[path.extname(file)]||'application/octet-stream'});
    res.end(data);
  });
});
async function check(browser,base,device){
  const context=await browser.newContext({viewport:{width:device.w,height:device.h},
    isMobile:device.mobile,hasTouch:device.mobile,deviceScaleFactor:device.mobile?3:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(base+'/cinematic/',{waitUntil:'domcontentloaded',timeout:15000});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>Boolean(window.__chainReaction),{timeout:10000});
  assert.deepEqual(await page.locator('.option').evaluateAll(nodes=>nodes.map(n=>n.dataset.livingId)),
    ['build-city','build-forest','build-volcano','build-energy','idea']);
  assert.equal(await page.locator('#volcanoArt.active').count(),0);
  const backdrop=await page.locator('#scenery').evaluate(n=>getComputedStyle(n).backgroundImage);
  assert.match(backdrop,/world_barren_(landscape|portrait)\.webp/,'barren world must not paint a volcano');
  const coverage=await page.locator('#game').evaluate((n)=>{
    const r=n.getBoundingClientRect();return r.width*r.height/(innerWidth*innerHeight);
  });
  assert.ok(coverage>.85,'game must visibly fill viewport');
  await page.screenshot({path:path.join(OUT,device.name+'-before.png')});
  await page.locator('[data-living-id="build-city"]').click();
  await page.waitForFunction(()=>__chainReaction.getPlaced().city===1);
  assert.equal(await page.locator('.option').first().getAttribute('data-living-id'),'dome');
  assert.equal(await page.locator('#dialog.compact').count(),1);
  await page.locator('#expandDialog').click();
  assert.equal(await page.locator('#dialog.compact').count(),0);
  await page.locator('#expandDialog').click();
  assert.equal(await page.locator('#dialog.compact').count(),1);
  assert.equal(await page.locator('.living-object.city').count(),1);
  const objectVisibility=await page.locator('.living-object.city').evaluate(node=>{
    const rect=node.getBoundingClientRect(),area=rect.width*rect.height;
    const occluders=[...document.querySelectorAll('.hud,#dialog:not(.hidden),.action-dock')];
    const blocked=occluders.reduce((sum,el)=>{
      const r=el.getBoundingClientRect();
      return sum+Math.max(0,Math.min(rect.right,r.right)-Math.max(rect.left,r.left))*
        Math.max(0,Math.min(rect.bottom,r.bottom)-Math.max(rect.top,r.top));
    },0);
    return Math.round(100*Math.max(0,1-blocked/area));
  });
  assert.ok(objectVisibility>85,'new city must be at least 85% unobstructed: '+objectVisibility+'%');
  const sources=await page.evaluate(()=>[
    document.querySelector('.living-object.city img').getAttribute('src'),
    document.querySelector('.option[data-living-id="dome"] img').getAttribute('src')
  ]);
  assert.equal(sources[0],sources[1],'same art in world and contextual button');
  await page.locator('[data-living-id="dome"]').click();
  assert.equal(await page.locator('.option').first().getAttribute('data-living-id'),'summon-dragon');
  assert.equal(await page.locator('.living-dome.active').count(),1);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.__chainReaction));
  assert.equal(await page.locator('.option').first().getAttribute('data-living-id'),'summon-dragon');
  await page.locator('[data-living-id="summon-dragon"]').click();
  assert.equal(await page.locator('.option').first().getAttribute('data-living-id'),'archers');
  assert.equal(await page.locator('.living-object.dragon').count(),1);
  await page.locator('[data-living-id="archers"]').click();
  let world=await page.evaluate(()=>__chainReaction.getHistory());
  assert.ok(world.some(e=>e.type==='retaliation'));
  await page.locator('[data-living-id="archers"]').click();
  assert.equal(await page.locator('.option').first().getAttribute('data-living-id'),'repair');
  await page.locator('[data-living-id="repair"]').click();
  assert.equal(await page.locator('.option').first().getAttribute('data-living-id'),'expand-city');
  await page.screenshot({path:path.join(OUT,device.name+'-after.png')});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.__chainReaction));
  assert.equal(await page.locator('.option').first().getAttribute('data-living-id'),'expand-city');
  // Genuine browser pointer events, including CDP touch events in mobile emulation.
  const startX=Math.round(device.w*.83),startY=Math.round(device.h*.24);
  if(device.mobile){
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',
      touchPoints:[{x:startX,y:startY,id:1}]});
    for(let step=1;step<=5;step++)await cdp.send('Input.dispatchTouchEvent',{
      type:'touchMove',touchPoints:[{x:startX-step*10,y:startY,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await cdp.detach();
  }else{
    await page.mouse.move(startX,startY);
    await page.mouse.down();
    await page.mouse.move(startX-50,startY,{steps:6});
    await page.mouse.up();
  }
  const panned=await page.evaluate(()=>__chainReaction.getViewport());
  assert.ok(panned.x>1,'dragging must pan world: '+JSON.stringify(panned));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.__chainReaction));
  const persisted=await page.evaluate(()=>__chainReaction.getViewport());
  assert.ok(Math.abs(persisted.x-panned.x)<.01,'camera must survive reload');
  assert.equal(await page.locator('.option').first().getAttribute('data-living-id'),'expand-city');
  await page.getByRole('button',{name:'Меню',exact:true}).click();
  await page.locator('details.catalogue summary').click();
  await page.locator('[data-catalog-build="city"]').click();
  assert.equal(await page.evaluate(()=>__chainReaction.getPlaced().city),2,
    'catalogue must still build second city without replacing main button');
  const after=await page.evaluate(()=>({
    city:__chainReaction.getPlaced().city,history:__chainReaction.getHistory().length,
    options:__chainReaction.getLivingActions().map(a=>a.id),
    objects:document.querySelectorAll('.living-object:not([hidden])').length,
    viewport:__chainReaction.getViewport()
  }));
  assert.equal(after.city,2);
  assert.ok(after.objects>0);
  assert.deepEqual(errors,[],'page errors');
  await context.close();
  return {device:device.name,coverage:Math.round(coverage*100),objectVisibility,
    errors,scenarios:['city','dome','dragon','archers','retaliation','victory','repair','reload'],
    after};
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await playwright.chromium.launch({headless:true,
      channel:process.env.CI?undefined:'chrome'});
    const results=[];
    for(const device of [{name:'desktop',w:1440,h:900,mobile:false},
      {name:'mobile-emulation',w:390,h:844,mobile:true}])
      results.push(await check(browser,base,device));
    const report={source:'locally-served-candidate',physicalMobile:false,results};
    fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error.stack||error);server.close();process.exitCode=1;});
