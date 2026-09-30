import { chromium, devices } from "playwright";

const url=process.env.KK_URL || "http://127.0.0.1:8767/index.html";
const slots=[0,1,2,4,6];
const watchdog=setTimeout(()=>{
  console.error("WEAPON_PROOF_GLOBAL_TIMEOUT");
  process.exit(124);
},180000);

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

  console.log("STAGE goto");
  await page.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
  await page.waitForFunction(()=>window.__kkRuntimeReady===true,null,{timeout:60000});

  console.log("STAGE start");
  await page.locator("#proofStart").click();
  await page.waitForFunction(()=>window.__kkPortraitProof?.master?.stage==="master",null,{timeout:90000});
  await page.waitForFunction(()=>document.body.classList.contains("weapon-running"),null,{timeout:90000});
  await page.waitForFunction(()=>typeof Module!=="undefined"&&Module.ccall&&Module.ccall("kkWeaponProofCurrent","number",[],[])>=0,null,{timeout:12000});

  console.log("STAGE arm");
  await page.evaluate(()=>Module.ccall("kkWeaponProofEnterRun","number",[],[]));
  await page.waitForFunction(()=>Module.ccall("kkWeaponProofFireReady","number",[],[])===1,null,{timeout:30000});
  const lab=await page.evaluate(()=>({
    grant:Module.ccall("kkWeaponProofGrantArsenal","number",[],[]),
    pause:Module.ccall("kkWeaponProofPauseLab","number",[],[]),
    frozen:Module.ccall("kkWeaponProofFrozenGet","number",[],[]),
    game:Module.ccall("kkWeaponProofGameState","number",[],[])
  }));
  if(lab.grant!==1||lab.pause!==1||lab.frozen!==1||lab.game!==0)
    throw new Error("weapon lab did not freeze cleanly: "+JSON.stringify(lab));

  const portrait=await page.evaluate(()=>({inner:[innerWidth,innerHeight],proof:window.__kkPortraitProof}));
  const m=portrait.proof.master,mw=m.master[2]-m.master[0],mh=m.master[3]-m.master[1];
  if(m.config[1]<=m.config[0])throw new Error("engine not portrait");
  if(m.master[0]!==0||m.master[1]!==0||mw!==m.config[0]||mh!==m.config[1])
    throw new Error("master viewport not full portrait: "+JSON.stringify(m));

  async function fireAndProve(slot){
    const before=await page.evaluate(s=>Module.ccall("kkWeaponProofShotCountGet","number",["number"],[s]),slot);
    const fire=await page.evaluate(({slot})=>{
      window.__kkSelectedSlot=slot;
      const b=document.getElementById("weaponFire");
      b.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerId:80+slot,pointerType:"touch",isPrimary:true}));
      return {result:window.__kkLastFireResult,firedSlot:window.__kkLastFireSlot};
    },{slot});
    console.log("FIRE",slot,JSON.stringify(fire));
    if(fire.firedSlot!==slot) throw new Error("FIRE targeted wrong weapon: "+JSON.stringify(fire));
    if(!(fire.result>before)) throw new Error("FIRE did not call real FireShot for slot "+slot+" before="+before+" result="+fire.result);
  }

  let current=await page.evaluate(()=>Module.ccall("kkWeaponProofCurrent","number",[],[]));
  if(!slots.includes(current)) throw new Error("bad initial player weapon "+current);
  const visited=new Set();

  console.log("STAGE weapons initial",current);
  for(let cycle=0;cycle<8 && visited.size<slots.length;cycle++){
    if(!visited.has(current)){
      await fireAndProve(current);
      visited.add(current);
    }
    if(visited.size===slots.length) break;

    const use=await page.evaluate(({cycle})=>{
      const before=window.__kkUseSeq||0;
      const b=document.getElementById("weaponUse");
      b.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerId:60+cycle,pointerType:"touch",isPrimary:true}));
      return {
        before,after:window.__kkUseSeq||0,target:window.__kkLastUseTarget,
        next:window.__kkLastUseEngineNext,current:window.__kkLastUseEngineCurrent,
        optics:window.__kkLastUseOptics
      };
    },{cycle});
    console.log("USE",cycle,JSON.stringify(use));
    if(use.after<=use.before) throw new Error("USE handler did not run");
    if(!slots.includes(use.target)||use.target===current) throw new Error("USE selected invalid/same weapon: "+JSON.stringify(use));
    if(use.next!==use.target||use.current!==use.target||!use.optics)
      throw new Error("USE did not bind real C++ weapon/model: "+JSON.stringify(use));
    current=use.target;
  }
  if(visited.size!==slots.length) throw new Error("USE did not cycle all five: "+JSON.stringify([...visited]));

  console.log("STAGE engine proof");
  const engineProof=await page.evaluate(slots=>Object.fromEntries(slots.map(slot=>[slot,{
    shots:Module.ccall("kkWeaponProofShotCountGet","number",["number"],[slot]),
    shotEffect:Module.ccall("kkWeaponProofShotEffect","number",["number"],[slot]),
    opticsEffect:Module.ccall("kkWeaponProofOpticsEffect","number",["number"],[slot])
  }])),slots);

  for(const slot of slots){
    const e=engineProof[slot];
    if(e.shots<1||!e.shotEffect||!e.opticsEffect)
      throw new Error("incomplete real weapon proof slot "+slot+": "+JSON.stringify(e));
  }
  const shotEffects=new Set(slots.map(s=>engineProof[s].shotEffect)).size;
  const opticsEffects=new Set(slots.map(s=>engineProof[s].opticsEffect)).size;
  if(shotEffects!==5) throw new Error("expected 5 distinct WeaponShot effects: "+JSON.stringify(engineProof));
  if(opticsEffects!==5) throw new Error("expected 5 distinct WeaponOptics models: "+JSON.stringify(engineProof));

  const realErrors=errors.filter(x=>!/pointer lock|AudioContext|favicon/i.test(x));
  if(realErrors.length) throw new Error(realErrors.join(" | "));

  console.log(JSON.stringify({
    pass:true,iphone11Viewport:portrait.inner,engine:m.config,master:m.master,
    playerWeaponSlots:slots,visited:[...visited],engineWeaponProof:engineProof,
    distinctWeaponShotEffects:shotEffects,distinctWeaponOpticsModels:opticsEffects
  },null,2));
  await context.close();
}finally{
  clearTimeout(watchdog);
  await browser.close();
}
