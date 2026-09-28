const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
let playwright;
try{playwright=require('playwright');}
catch{playwright=require(path.join(process.env.USERPROFILE||'','Desktop','World_server','node_modules','playwright'));}
const {chromium}=playwright;
const base=process.env.BASE_URL||(process.env.CI?'http://127.0.0.1:8765/':'http://127.0.0.1:8767/');
(async()=>{const browser=await chromium.launch({headless:true,channel:process.env.CI?undefined:'chrome'});
try{for(const view of [{name:'desktop',width:1365,height:768},{name:'mobile',width:390,height:844}]){
 const page=await browser.newPage({viewport:{width:view.width,height:view.height},isMobile:view.name==='mobile',hasTouch:view.name==='mobile'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('cinematic/voxel-factory.html',base).href,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>Boolean(window.__voxelFactory));
 const area=await page.locator('#map').boundingBox();
 assert.ok(area.width*area.height/(view.width*view.height)>.85);
 assert.equal((await page.evaluate(()=>__voxelFactory.getWorld())).blocks.filter(b=>b.type==='volcano').length,0);
 const snap=process.env.CI?path.join(process.cwd(),'qa-artifacts','voxel-factory'):path.join(process.env.USERPROFILE,'Desktop','voxel-factory-qa');fs.mkdirSync(snap,{recursive:true});
 await page.screenshot({path:path.join(snap,'start-'+view.name+'.png')});
 const tap=(x,z)=>page.locator('#map').click({position:{x:area.width/2+(x-z)*29,y:area.height/2+(x+z)*14.5}});
 await tap(0,0);await page.waitForFunction(()=>__voxelFactory.getWorld().blocks.some(b=>b.type==='forest'));
 await page.locator('[data-build=river]').click();await tap(1,0);
 await page.locator('[data-build=volcano]').click();await tap(4,0);
 for(let i=0;i<5;i++)await page.locator('#nextTurn').click();
 const before=await page.evaluate(()=>__voxelFactory.getWorld());
 assert.ok(before.events.some(e=>e.type==='steam'));
 assert.ok(before.events.some(e=>e.type==='forest_burned'));
 assert.ok(before.events.some(e=>e.type==='resident_evacuated'));
 assert.ok(before.blocks.some(b=>b.type==='burnt_forest'));
 const sig=JSON.stringify(before.blocks);await page.reload();await page.waitForFunction(()=>Boolean(window.__voxelFactory));
 const after=await page.evaluate(()=>__voxelFactory.getWorld());assert.equal(JSON.stringify(after.blocks),sig);
 assert.match(await page.locator('#events').innerText(),/Сохранённый мир.*пар над рекой.*выгоревший лес/);
 await page.screenshot({path:path.join(snap,'consequences-'+view.name+'.png')});
 const old=await page.evaluate(()=>__voxelFactory.getCamera());
 if(view.name==='mobile'){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:area.width/2,y:area.height/2}]});
  for(let i=0;i<20;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:area.width/2+80+i*4,y:area.height/2+40+i*3}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }else{
  await page.mouse.move(area.width/2,area.height/2);await page.mouse.down();
  for(let i=0;i<20;i++)await page.mouse.move(area.width/2+80+i*4,area.height/2+40+i*3,{steps:2});
  await page.mouse.up();
 }
 const moved=await page.evaluate(()=>__voxelFactory.getCamera());
 assert.notDeepEqual(moved,old);assert.deepEqual(errors,[]);
 const motionStats=await page.evaluate(()=>__voxelFactory.getStats());
 await page.waitForTimeout(1600);
 const idleStats=await page.evaluate(()=>__voxelFactory.getStats());
 assert.ok(idleStats.fps>0,'FPS sampling should produce a valid measurement');
 console.log('VOXEL_UI_PASS',view.name,'events',before.events.length,'coverage',area.width*area.height/(view.width*view.height),'motionFPS',motionStats.fps,'idleStats',idleStats);
 await page.close();
 if(view.name==='desktop'){
  const damaged=await browser.newPage();
  await damaged.goto(new URL('cinematic/voxel-factory.html',base).href,{waitUntil:'domcontentloaded'});
  await damaged.evaluate(()=>localStorage.setItem('voxel-factory-v1-chain-main','{broken'));
  await damaged.reload();await damaged.waitForFunction(()=>Boolean(window.__voxelFactory));
  assert.match(await damaged.locator('#events').innerText(),/резервной копии/);
  assert.equal(await damaged.evaluate(()=>localStorage.getItem('voxel-factory-v1-chain-main-backup')),'{broken');
  await damaged.close();
 }
}}finally{await browser.close();}
})().catch(e=>{console.error('VOXEL_UI_FAIL',e.stack);process.exitCode=1;});
