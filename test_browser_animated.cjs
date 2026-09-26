const {chromium}=require('C:/Users/user/Desktop/World_server/node_modules/playwright');
const os=require('node:os'),path=require('node:path');
const source=process.env.SCRATCH_PREVIEW_URL||'https://mpaykin1.github.io/scratch-chain-reaction/chain-reaction.sb3';
const preview='https://turbowarp.org/embed?project_url='+encodeURIComponent(source)+'&autoplay';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
 const page=await browser.newPage({viewport:{width:1250,height:950}});
 let errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  console.log('PREVIEW',preview);
  await page.goto(preview,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>window.vm&&window.vm.runtime&&window.vm.runtime.targets.some(t=>t.getName&&t.getName()==='Злой Джинн'),null,{timeout:90000});
  await page.waitForTimeout(3000);
  const info=await page.evaluate(()=>({vars:Object.fromEntries(Object.values(window.vm.runtime.targets.find(t=>t.isStage).variables).map(v=>[v.name,v.value])),sprites:window.vm.runtime.targets.filter(t=>!t.isStage&&t.isOriginal).map(t=>({name:t.getName(),visible:t.visible,costume:t.currentCostume})),canvas:Array.from(document.querySelectorAll('canvas')).map(c=>[c.width,c.height,c.clientWidth,c.clientHeight])}));
  console.log('STAGE',JSON.stringify(info));console.log('JS_ERRORS',JSON.stringify(errors));
  await page.screenshot({path:path.join(os.tmpdir(),'scratch-release-start.png')});
  if(info.sprites.length<20||Number(info.vars['Население'])!==32||info.sprites.find(s=>s.name==='Мир volcano').visible)throw Error('start visibility check failed');
  console.log('LIVE_VISIBILITY_PASS');
 }catch(e){console.log('LIVE_VISIBILITY_FAIL',String(e),JSON.stringify(errors));process.exitCode=1}
 finally{await browser.close()}
})();