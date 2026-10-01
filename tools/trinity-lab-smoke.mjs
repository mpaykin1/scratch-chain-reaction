import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const url=process.env.TRINITY_URL||'http://127.0.0.1:8765/trinity-lab/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const out=path.resolve('work/trinity-lab-qa');
fs.mkdirSync(out,{recursive:true});

async function ready(page){
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__trinityLab?.ready===true,{timeout:20000});
  return page.evaluate(()=>window.__trinityLabControl.snapshot());
}
async function state(page){
  return page.evaluate(()=>window.__trinityLabControl.snapshot());
}
function assertCore(s){
  assert.equal(s.sceneRecipeSame,true);
  assert.equal(s.recipeId,'world-server-trinity-courtyard-v1');
  assert.equal(s.seed,'trinity-lab-2026-10-01');
  assert.ok(s.metrics.userVisibility>=85,'user visibility below 85');
  assert.equal(s.viewport?.pass,true,'viewport gate failed '+JSON.stringify(s.viewport?.checks));
}
const browser=await chromium.launch({headless:true,executablePath:chrome});
const evidence={url,desktop:{},portrait:{},errors:[]};
try{
  const desktop=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const page=await desktop.newPage();
  page.on('pageerror',e=>evidence.errors.push('desktop:'+e.message));
  let s=await ready(page);
  assert.equal(s.mode,'KRIEGER');assertCore(s);
  evidence.desktop.krieger={metrics:s.metrics,gates:s.governor?.gates,capabilities:s.capabilities};
  await page.screenshot({path:path.join(out,'desktop-krieger.png')});

  await page.click('[data-mode="INK"]');
  await page.waitForTimeout(500);
  s=await state(page);assertCore(s);
  assert.equal(s.ink.gates.SEMANTIC_INK_GATE,true);
  assert.equal(s.ink.gates.WATERCOLOR_GATE,true);
  const box=await page.locator('#gl').boundingBox();
  await page.mouse.move(box.x+box.width*.78,box.y+box.height*.52);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*.86,box.y+box.height*.44,{steps:5});
  await page.mouse.up();await page.waitForTimeout(350);
  s=await state(page);
  assert.equal(s.ink.gates.STYLE_PERSISTENCE_GATE,true);
  evidence.desktop.ink={metrics:s.metrics,gates:s.ink.gates,diagnostics:s.ink.diagnostics};
  await page.screenshot({path:path.join(out,'desktop-ink.png')});
  await page.click('[data-mode="CUBE"]');
  s=await state(page);
  assert.equal(s.cube.history[0].objects,1,'cube must start as exactly one object');
  const samples=[];
  for(const seconds of [2,4,6,8,10,12]){
    s=await page.evaluate(sec=>window.__trinityLabControl.seekCube(sec),seconds);
    samples.push({seconds,stage:s.cube.stage,objects:s.metrics.objects,operations:s.cube.operations.length});
  }
  assert.equal(s.cube.gates.REAL_GROWTH_GATE,true);
  assert.equal(s.cube.gates.DETERMINISM_GATE,true);
  assert.equal(s.cube.gates.INTERMEDIATE_STATE_GATE,true);
  assert.equal(s.cube.gates.FINAL_SEMANTIC_EQUIVALENCE_GATE,true);
  assert.ok(s.requiredSemanticIds.every(id=>s.semanticIds.includes(id)));
  evidence.desktop.cube={samples,gates:s.cube.gates,operations:[...new Set(s.cube.operations.map(o=>o.op))]};

  for(let i=0;i<4;i++){
    for(const m of ['KRIEGER','INK','CUBE'])await page.evaluate(mode=>window.__trinityLabControl.setMode(mode),m);
  }
  await page.evaluate(()=>window.__trinityLabControl.setMode('KRIEGER'));
  await page.waitForTimeout(250);s=await state(page);assertCore(s);
  await page.click('#debugButton');
  assert.equal(await page.locator('#debug').isVisible(),true);
  await page.screenshot({path:path.join(out,'desktop.png')});
  await desktop.close();
  const mobile=await browser.newContext({
    viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true
  });
  const portrait=await mobile.newPage();
  portrait.on('pageerror',e=>evidence.errors.push('portrait:'+e.message));
  s=await ready(portrait);assertCore(s);
  const before=await portrait.evaluate(()=>({x:scrollX,y:scrollY,v:window.__trinityLab.viewport}));
  assert.deepEqual({x:before.x,y:before.y},{x:0,y:0});

  await portrait.dispatchEvent('#gl','pointerdown',{pointerId:41,pointerType:'touch',clientX:320,clientY:500,bubbles:true});
  await portrait.dispatchEvent('#gl','pointermove',{pointerId:41,pointerType:'touch',clientX:350,clientY:450,bubbles:true});
  await portrait.dispatchEvent('#gl','pointerup',{pointerId:41,pointerType:'touch',clientX:350,clientY:450,bubbles:true});
  await portrait.waitForTimeout(200);
  const after=await portrait.evaluate(()=>({x:scrollX,y:scrollY,s:window.__trinityLabControl.snapshot()}));
  assert.deepEqual({x:after.x,y:after.y},{x:0,y:0});
  assert.equal(after.s.viewport.pass,true);
  assert.ok(after.s.metrics.userVisibility>=85);

  for(const m of ['INK','CUBE','KRIEGER']){
    await portrait.click('[data-mode="'+m+'"]');await portrait.waitForTimeout(120);
  }
  s=await state(portrait);assertCore(s);
  evidence.portrait={before:before.v,after:s.viewport,metrics:s.metrics};
  await portrait.screenshot({path:path.join(out,'portrait.png')});
  await mobile.close();
}finally{
  await browser.close();
}
assert.deepEqual(evidence.errors,[]);
fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({pass:true,url,desktop:evidence.desktop,portrait:evidence.portrait,errors:evidence.errors},null,2));
