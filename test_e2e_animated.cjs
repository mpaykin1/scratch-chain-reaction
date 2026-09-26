const {chromium}=require('C:/Users/user/Desktop/World_server/node_modules/playwright');
const assert=require('node:assert/strict'),os=require('node:os'),path=require('node:path');
const source=process.env.SCRATCH_PREVIEW_URL||'https://mpaykin1.github.io/scratch-chain-reaction/chain-reaction.sb3';
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1250,height:950}});
let errors=[];page.on('pageerror',e=>errors.push(e.message));const url='https://turbowarp.org/embed?project_url='+encodeURIComponent(source)+'&autoplay';
const snap=async()=>page.evaluate(()=>{const vm=window.vm,stage=vm.runtime.targets.find(t=>t.isStage);return {vars:Object.fromEntries(Object.values(stage.variables).map(v=>[v.name,v.value])),vis:Object.fromEntries(vm.runtime.targets.filter(t=>t.isOriginal&&!t.isStage).map(t=>[t.getName(),t.visible])),costume:Object.fromEntries(vm.runtime.targets.filter(t=>t.isOriginal&&!t.isStage).map(t=>[t.getName(),t.currentCostume]))}});
const click=async(x,y=-147)=>{const c=page.locator('canvas').first(),b=await c.boundingBox();if(!b)throw Error('canvas invisible');await page.mouse.click(b.x+(x+240)/480*b.width,b.y+(180-y)/360*b.height);};
const waitTurn=async(n)=>page.waitForFunction(n=>{const s=window.vm.runtime.targets.find(t=>t.isStage);return Number(Object.values(s.variables).find(v=>v.name==='Ход').value)>=n},n,{timeout:18000});
const choose=async(n)=>{const i=page.locator('input').last();await i.waitFor({state:'visible',timeout:15000});await i.fill(String(n));await i.press('Enter');await page.waitForFunction(()=>{const s=window.vm.runtime.targets.find(t=>t.isStage);return Number(Object.values(s.variables).find(v=>v.name==='Занято').value)===0},null,{timeout:15000});};
try{
console.log('SOURCE',source);await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
await page.waitForFunction(()=>window.vm?.runtime?.targets?.some(t=>t.getName?.()==='Злой Джинн'),null,{timeout:90000});
await page.waitForTimeout(1800);let state=await snap();assert.equal(Number(state.vars.Население),32);assert.equal(state.vis['Мир volcano'],false);
await click(-96);await waitTurn(1);state=await snap();console.log('FOREST',JSON.stringify(state.vars));assert.equal(state.vis['Мир forest'],true);assert(Number(state.vars.Экология)>0);
await page.screenshot({path:path.join(os.tmpdir(),'scratch-live-after-forest.png')});
await choose(4);state=await snap();console.log('GENIE_CHOICE_4',JSON.stringify(state.vars));assert.equal(Number(state.vars.Занято),0);
await click(-192);await waitTurn(2);state=await snap();assert.equal(state.vis['Мир city'],true);console.log('CITY',JSON.stringify(state.vars));await choose(4);
await click(0);await waitTurn(3);state=await snap();assert.equal(state.vis['Мир energy'],true);assert.equal(state.vis['Ветряк 1'],true);
const blade=state.costume['Ветряк 1'];await page.waitForTimeout(360);state=await snap();assert.notEqual(state.costume['Ветряк 1'],blade,'wind turbine animation');
console.log('ENERGY',JSON.stringify(state.vars));await choose(4);
await click(96);await waitTurn(4);state=await snap();assert.equal(state.vis['Мир volcano'],true);assert.equal(state.vis['Дым и лава'],true);
console.log('VOLCANO',JSON.stringify(state.vars));await page.screenshot({path:path.join(os.tmpdir(),'scratch-live-after-volcano.png')});await choose(4);
await click(192);const idea=page.locator('input').last();await idea.waitFor({state:'visible',timeout:15000});await idea.fill('солнечная энергия для города');await idea.press('Enter');
await waitTurn(5);state=await snap();console.log('IDEA',JSON.stringify(state.vars));assert(Number(state.vars.Население)>=0);await choose(4);
console.log('E2E_PASS','turns='+state.vars.Ход,'sprites='+Object.keys(state.vis).length,'pageerrors='+errors.length);if(errors.length)console.log('PAGE_ERRORS',JSON.stringify(errors.slice(0,8)));
}catch(e){console.log('E2E_FAIL',String(e),'PAGE_ERRORS',JSON.stringify(errors.slice(0,8)));process.exitCode=1}
finally{await browser.close()}
})();