import fs from "node:fs";
import { chromium, devices } from "playwright";
import { PNG } from "pngjs";

const url=process.env.KK_URL || "http://127.0.0.1:8767/index.html";
const shot=process.env.KK_SCREENSHOT || "weapon-proof.png";
const slots=[0,1,2,4,6];

function texturedCoverage(buffer){
  const png=PNG.sync.read(buffer),active=[];
  for(let y=0;y<png.height;y++){
    let min=255,max=0,bright=0,n=0;
    for(let x=0;x<png.width;x+=2){
      const i=(y*png.width+x)*4,v=(png.data[i]+png.data[i+1]+png.data[i+2])/3;
      min=Math.min(min,v);max=Math.max(max,v);if(v>22)bright++;n++;
    }
    if(max-min>=18 && bright/Math.max(1,n)>=0.012) active.push(y);
  }
  if(!active.length)return 0;
  return (active.at(-1)-active[0]+1)/png.height;
}

const browser=await chromium.launch({headless:true,args:[
  "--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist",
  "--autoplay-policy=no-user-gesture-required"
]});
try{
  const iphone=devices["iPhone 11"] || devices["iPhone 12"];
  const context=await browser.newContext({...iphone,viewport:{width:414,height:896}});
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.goto(url,{waitUntil:"domcontentloaded",timeout:120000});
  await page.waitForFunction(()=>window.__kkRuntimeReady===true,null,{timeout:60000});
  await page.locator("#proofStart").click();
  await page.waitForFunction(()=>window.__kkPortraitProof?.master?.stage==="master",null,{timeout:90000});
  await page.waitForFunction(()=>document.body.classList.contains("weapon-running"),null,{timeout:90000});
  await page.waitForFunction(()=>typeof Module!=="undefined"&&Module.ccall&&Module.ccall("kkWeaponProofCurrent","number",[],[])>=0,null,{timeout:12000});
  await page.evaluate(()=>Module.ccall("kkWeaponProofEnterRun","number",[],[]));
  await page.waitForFunction(()=>Module.ccall("kkWeaponProofPlayerReady","number",[],[])===1,null,{timeout:30000});
  await page.evaluate(()=>Module.ccall("kkWeaponProofGrantArsenal","number",[],[]));
  await page.waitForFunction(()=>{
    const c=Module.ccall("kkWeaponProofCurrent","number",[],[]);
    const n=Module.ccall("kkWeaponProofNext","number",[],[]);
    return [0,1,2,4,6].includes(c) && c===n;
  },null,{timeout:12000});

  const portrait=await page.evaluate(()=>({inner:[innerWidth,innerHeight],proof:window.__kkPortraitProof}));
  const m=portrait.proof.master,mw=m.master[2]-m.master[0],mh=m.master[3]-m.master[1];
  if(m.config[1]<=m.config[0])throw new Error("engine not portrait");
  if(m.master[0]!==0||m.master[1]!==0||mw!==m.config[0]||mh!==m.config[1])
    throw new Error("master viewport not full portrait: "+JSON.stringify(m));

  async function fireAndProve(slot){
    console.log("PROVING_FIRE_SLOT",slot);
    await page.waitForFunction(()=>Module.ccall("kkWeaponProofFireReady","number",[],[])===1,null,{timeout:7000});
    const before=await page.evaluate(s=>Module.ccall("kkWeaponProofShotCountGet","number",["number"],[s]),slot);
    const fireResult=await page.evaluate(({slot})=>{
      const b=document.getElementById("weaponFire");
      b.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerId:80+slot,pointerType:"touch",isPrimary:true}));
      b.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,cancelable:true,pointerId:80+slot,pointerType:"touch",isPrimary:true}));
      return window.__kkLastFireResult;
    },{slot});
    if(!(fireResult>before)) throw new Error("FIRE button did not call real FireShot for slot "+slot+" result="+fireResult+" before="+before);
    await page.waitForFunction(([s,n])=>Module.ccall("kkWeaponProofShotCountGet","number",["number"],[s])>n,[slot,before],{timeout:2000});
  }

  let current=await page.evaluate(()=>Module.ccall("kkWeaponProofCurrent","number",[],[]));
  const visited=new Set();
  for(let cycle=0;cycle<10 && visited.size<slots.length;cycle++){
    if(!slots.includes(current)) throw new Error("unexpected player weapon slot "+current);
    if(!visited.has(current)){
      await fireAndProve(current);
      visited.add(current);
    }
    if(visited.size===slots.length) break;
    const beforeSeq=await page.evaluate(()=>window.__kkUseSeq||0);
    const afterSeq=await page.evaluate(({cycle})=>{
      const b=document.getElementById("weaponUse");
      b.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerId:60+cycle,pointerType:"touch",isPrimary:true}));
      b.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,cancelable:true,pointerId:60+cycle,pointerType:"touch",isPrimary:true}));
      return window.__kkUseSeq||0;
    },{cycle});
    if(afterSeq<=beforeSeq) throw new Error("USE pointerdown handler did not run");
    const useState=await page.evaluate(()=>({target:window.__kkLastUseTarget,nextAtTouch:window.__kkLastUseEngineNext}));
    const target=useState.target;
    if(!slots.includes(target)) throw new Error("USE returned invalid target "+target);
    if(target===current) throw new Error("USE did not choose a different weapon "+target);
    if(useState.nextAtTouch!==target) throw new Error("USE did not set real Player.NextWeapon: "+JSON.stringify(useState));
    await page.waitForFunction(s=>Module.ccall("kkWeaponProofCurrent","number",[],[])===s,target,{timeout:7000});
    current=target;
  }
  if(visited.size!==slots.length) throw new Error("USE did not cycle through all five player weapons: "+JSON.stringify([...visited]));

  const engineProof=await page.evaluate(slots=>Object.fromEntries(slots.map(slot=>[slot,{
    shots:Module.ccall("kkWeaponProofShotCountGet","number",["number"],[slot]),
    shotEffect:Module.ccall("kkWeaponProofShotEffect","number",["number"],[slot]),
    opticsEffect:Module.ccall("kkWeaponProofOpticsEffect","number",["number"],[slot])
  }])),slots);
  for(const slot of slots){
    const e=engineProof[slot];
    if(e.shots<1) throw new Error("real FireShot count missing for "+slot);
    if(!e.shotEffect) throw new Error("real WeaponShot effect missing for "+slot);
    if(!e.opticsEffect) throw new Error("real WeaponOptics model missing for "+slot);
  }
  const effectCount=new Set(slots.map(s=>engineProof[s].shotEffect)).size;
  const opticsCount=new Set(slots.map(s=>engineProof[s].opticsEffect)).size;
  if(effectCount<5) throw new Error("expected five distinct real WeaponShot effects: "+JSON.stringify(engineProof));
  if(opticsCount<5) throw new Error("expected five distinct real WeaponOptics models: "+JSON.stringify(engineProof));

  await page.waitForTimeout(1000);
  const png=await page.screenshot({fullPage:false});
  fs.writeFileSync(shot,png);
  const coverage=texturedCoverage(png);
  if(coverage<0.85) throw new Error("portrait textured scene below 85%: "+coverage);

  const realErrors=errors.filter(x=>!/pointer lock|AudioContext|favicon/i.test(x));
  if(realErrors.length)throw new Error(realErrors.join(" | "));
  console.log(JSON.stringify({
    pass:true,iphone11Viewport:portrait.inner,engine:m.config,master:m.master,
    texturedHeightCoverage:coverage,playerWeaponSlots:slots,
    engineWeaponProof:engineProof,distinctWeaponShotEffects:effectCount,distinctWeaponOpticsModels:opticsCount
  },null,2));
  await context.close();
}finally{await browser.close();}
