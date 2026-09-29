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
  await page.waitForFunction(()=>window.__kkWeaponProof?.current===0,null,{timeout:12000});

  const portrait=await page.evaluate(()=>({inner:[innerWidth,innerHeight],proof:window.__kkPortraitProof}));
  const m=portrait.proof.master,mw=m.master[2]-m.master[0],mh=m.master[3]-m.master[1];
  if(m.config[1]<=m.config[0])throw new Error("engine not portrait");
  if(m.master[0]!==0||m.master[1]!==0||mw!==m.config[0]||mh!==m.config[1])
    throw new Error("master viewport not full portrait: "+JSON.stringify(m));

  async function fireAndProve(slot){
    const before=await page.evaluate(s=>window.__kkWeaponProof.events.filter(e=>e.stage==="fire"&&e.weapon===s).length,slot);
    await page.locator("#weaponFire").dispatchEvent("pointerdown",{pointerId:80+slot,pointerType:"touch"});
    await page.waitForTimeout(700);
    await page.locator("#weaponFire").dispatchEvent("pointerup",{pointerId:80+slot,pointerType:"touch"});
    await page.waitForFunction(([s,n])=>window.__kkWeaponProof.events.filter(e=>e.stage==="fire"&&e.weapon===s).length>n,[slot,before],{timeout:7000});
  }

  await fireAndProve(0);
  for(const slot of slots.slice(1)){
    await page.locator("#weaponUse").dispatchEvent("pointerdown",{pointerId:40+slot,pointerType:"touch"});
    await page.locator("#weaponUse").dispatchEvent("pointerup",{pointerId:40+slot,pointerType:"touch"});
    await page.waitForFunction(s=>window.__kkWeaponProof.current===s,slot,{timeout:7000});
    await fireAndProve(slot);
  }

  const state=await page.evaluate(()=>window.__kkWeaponProof);
  for(const slot of slots) if(!state.fired[slot]) throw new Error("weapon did not fire: "+slot);
  const fires=state.events.filter(e=>e.stage==="fire"&&slots.includes(e.weapon));
  const latest=Object.fromEntries(slots.map(s=>[s,[...fires].reverse().find(e=>e.weapon===s)]));
  for(const slot of slots){
    const e=latest[slot];
    if(!e||!e.effect||e.effect==="0"||e.effect==="0x0") throw new Error("missing real WeaponShot effect for "+slot);
  }
  const effectCount=new Set(slots.map(s=>latest[s].effect)).size;
  if(effectCount<5) throw new Error("player weapons do not resolve to five distinct WeaponShot effects: "+JSON.stringify(latest));

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
    fired:Object.fromEntries(slots.map(s=>[s,latest[s]])),distinctWeaponShotEffects:effectCount
  },null,2));
  await context.close();
}finally{await browser.close();}
