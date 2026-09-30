import fs from "node:fs";
import { chromium, devices } from "playwright";
import { PNG } from "pngjs";

const url=process.env.KK_URL || "http://127.0.0.1:8767/index.html";
const outDir=process.env.KK_OUTDIR || "work/kkrieger-surgery-lab";

function decode(buffer){ return PNG.sync.read(buffer); }

function visualMetrics(buffer){
  const png=decode(buffer);
  let nonBlack=0,total=0;
  const active=[];
  for(let y=0;y<png.height;y++){
    let rowVisible=0,rowN=0,min=255,max=0;
    for(let x=0;x<png.width;x+=2){
      const i=(y*png.width+x)*4;
      const r=png.data[i],g=png.data[i+1],b=png.data[i+2];
      const peak=Math.max(r,g,b), avg=(r+g+b)/3;
      min=Math.min(min,avg); max=Math.max(max,avg);
      if(peak>16){nonBlack++;rowVisible++;}
      total++;rowN++;
    }
    if(rowVisible/Math.max(1,rowN)>.08 && max-min>12) active.push(y);
  }
  return {
    nonBlackRatio:nonBlack/Math.max(1,total),
    heightCoverage:active.length?(active.at(-1)-active[0]+1)/png.height:0,
    top:active.length?active[0]/png.height:null,
    bottom:active.length?active.at(-1)/png.height:null,
  };
}

function diffRatio(aBuf,bBuf,region={x0:0,y0:0,x1:1,y1:1}){
  const a=decode(aBuf), b=decode(bBuf);
  if(a.width!==b.width || a.height!==b.height) throw new Error("image size mismatch");
  const xa=Math.floor(a.width*region.x0), xb=Math.ceil(a.width*region.x1);
  const ya=Math.floor(a.height*region.y0), yb=Math.ceil(a.height*region.y1);
  let changed=0,total=0,sum=0;
  for(let y=ya;y<yb;y++) for(let x=xa;x<xb;x++){
    const i=(y*a.width+x)*4;
    const d=Math.max(
      Math.abs(a.data[i]-b.data[i]),
      Math.abs(a.data[i+1]-b.data[i+1]),
      Math.abs(a.data[i+2]-b.data[i+2])
    );
    if(d>=18) changed++;
    sum+=d; total++;
  }
  return {ratio:changed/Math.max(1,total),meanDelta:sum/Math.max(1,total)};
}

const browser=await chromium.launch({
  headless:true,
  args:["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--autoplay-policy=no-user-gesture-required"]
});

try{
  fs.mkdirSync(outDir,{recursive:true});
  const context=await browser.newContext({...devices["iPhone 13"],viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];
  const logs=[];
  page.on("pageerror",e=>errors.push(String(e)));
  page.on("console",m=>{
    const t=m.text();
    if(t.includes("[surgery]") || t.includes("[portrait-proof]")) logs.push(t);
    if(m.type()==="error") errors.push(t);
  });

  await page.goto(url,{waitUntil:"domcontentloaded",timeout:120000});
  await page.waitForFunction(()=>window.__kkRuntimeReady===true,null,{timeout:60000});
  await page.locator("#surgeryStart").click();
  await page.waitForFunction(()=>window.__kkPortraitProof?.master?.stage==="master",null,{timeout:90000});

  const stat=idx=>page.evaluate(i=>Module.ccall("kkSurgeryStat","number",["number"],[i]),idx);

  // The native beta Reset/weapon animation can initially sit on slot 1 while
  // NextWeapon is slot 0. Drive the *real* game input path with key "1"
  // (weaponswap -> slot 0) rather than assuming the transient state.
  await page.waitForTimeout(3500);
  const preSelect=await Promise.all(Array.from({length:13},(_,i)=>stat(i)));
  console.log("SURGERY_PRESELECT",JSON.stringify(preSelect));
  await page.evaluate(()=>{
    Module.ccall("kkSurgeryKey",null,["number","number"],["1".charCodeAt(0),1]);
    Module.ccall("kkSurgeryKey",null,["number","number"],["1".charCodeAt(0),0]);
  });
  await page.waitForFunction(()=>{
    try{
      return Module.ccall("kkSurgeryStat","number",["number"],[0])===0 &&
             Module.ccall("kkSurgeryStat","number",["number"],[2])===1 &&
             Module.ccall("kkSurgeryStat","number",["number"],[3])===1;
    }catch(e){ return false; }
  },null,{timeout:30000});

  const state=await page.evaluate(()=>({
    inner:[innerWidth,innerHeight],
    dpr:devicePixelRatio,
    canvasCss:(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return [r.x,r.y,r.width,r.height]})(),
    backing:[document.querySelector("canvas").width,document.querySelector("canvas").height],
    proof:window.__kkPortraitProof
  }));
  const m=state.proof.master;
  if(!m) throw new Error("missing portrait master telemetry");
  if(m.config[1]<=m.config[0]) throw new Error("engine not portrait");
  const mw=m.master[2]-m.master[0], mh=m.master[3]-m.master[1];
  if(m.master[0]!==0 || m.master[1]!==0 || mw!==m.config[0] || mh!==m.config[1])
    throw new Error("master viewport is not full portrait: "+JSON.stringify(m));
  const expected=m.config[0]/m.config[1];
  if(Math.abs(m.aspect-expected)>.002) throw new Error("projection aspect mismatch");
  if(state.canvasCss[2]<state.inner[0]*.98 || state.canvasCss[3]<state.inner[1]*.98)
    throw new Error("canvas does not fill viewport");

  const cdp=await context.newCDPSession(page);
  async function capture(name){
    await page.evaluate(()=>{
      const canvas=document.querySelector("canvas");
      const keep=new Set();
      for(let n=canvas;n;n=n.parentElement) keep.add(n);
      window.__kkHiddenForProof=[];
      for(const n of document.querySelectorAll("body *")){
        if(n===canvas || keep.has(n) || n.contains(canvas)) continue;
        window.__kkHiddenForProof.push([n,n.style.visibility]);
        n.style.visibility="hidden";
      }
    });
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const box=await page.evaluate(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
    const cap=await cdp.send("Page.captureScreenshot",{
      format:"png",fromSurface:true,captureBeyondViewport:false,
      clip:{x:box.x,y:box.y,width:box.width,height:box.height,scale:1}
    });
    await page.evaluate(()=>{
      for(const [n,v] of window.__kkHiddenForProof||[]) n.style.visibility=v;
      window.__kkHiddenForProof=[];
    });
    const buf=Buffer.from(cap.data,"base64");
    fs.writeFileSync(`${outDir}/${name}.png`,buf);
    return buf;
  }

  await page.evaluate(()=>Module.ccall("kkSurgerySetMode",null,["number"],[0]));
  await page.waitForTimeout(180);
  const original=await capture("original");
  const om=visualMetrics(original);
  if(om.heightCoverage<.85 || om.nonBlackRatio<.35)
    throw new Error("original real Krieger frame visibility below gate: "+JSON.stringify(om));

  await page.evaluate(()=>{
    Module.ccall("kkSurgerySetMode",null,["number"],[1]);
    window.__kkSurgery.mode=1;
  });
  await page.waitForTimeout(180);
  const modified=await capture("modified");
  const mm=visualMetrics(modified);
  if(mm.heightCoverage<.85 || mm.nonBlackRatio<.35)
    throw new Error("modified real Krieger frame visibility below gate: "+JSON.stringify(mm));

  const fullDiff=diffRatio(original,modified);
  const gunDiff=diffRatio(original,modified,{x0:.50,y0:.34,x1:1,y1:.90});
  if(gunDiff.ratio<.025 || gunDiff.meanDelta<2.0)
    throw new Error("native optics surgery is not visibly detectable: "+JSON.stringify({fullDiff,gunDiff}));
  if(fullDiff.ratio>.55)
    throw new Error("surgery changed too much of the full frame: "+JSON.stringify(fullDiff));

  const beforeFire=await stat(12);
  const beforeAmmo=await Promise.all([8,9,10,11].map(stat));
  await page.evaluate(()=>Module.ccall("kkSurgeryFire",null,["number"],[1]));
  await page.waitForTimeout(140);
  await page.evaluate(()=>Module.ccall("kkSurgeryFire",null,["number"],[0]));
  await page.waitForFunction(before=>{
    try{return Module.ccall("kkSurgeryStat","number",["number"],[12])>before;}
    catch(e){return false;}
  },beforeFire,{timeout:5000});
  const afterFire=await stat(12);
  const afterAmmo=await Promise.all([8,9,10,11].map(stat));
  const fired=await capture("fired");
  const fm=visualMetrics(fired);
  if(afterFire<=beforeFire) throw new Error("real FireShot was not reached");
  if(await stat(3)!==1) throw new Error("current WeaponShot binding disappeared");
  if(await stat(2)!==1) throw new Error("current WeaponOptics binding disappeared");

  const realErrors=errors.filter(x=>!/pointer lock|AudioContext|favicon/i.test(x));
  if(realErrors.length) throw new Error(realErrors.join(" | "));

  console.log("SURGERY_LAB_PASS",JSON.stringify({
    targetOp:219,
    currentWeapon:await stat(0),
    opticsBound:await stat(2),
    shotBound:await stat(3),
    fireCountBefore:beforeFire,
    fireCountAfter:afterFire,
    ammoBefore:beforeAmmo,
    ammoAfter:afterAmmo,
    originalVisibility:om,
    modifiedVisibility:mm,
    firedVisibility:fm,
    fullFrameDiff:fullDiff,
    weaponRegionDiff:gunDiff,
    portrait:{inner:state.inner,backing:state.backing,engine:m.config,master:m.master,aspect:m.aspect},
    surgeryLogs:logs.filter(x=>x.includes("[surgery]")).slice(-12)
  },null,2));

  await context.close();
} finally {
  await browser.close();
}
