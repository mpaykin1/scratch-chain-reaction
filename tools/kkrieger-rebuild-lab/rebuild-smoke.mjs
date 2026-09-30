import fs from "node:fs";
import { chromium, devices } from "playwright";
import { PNG } from "pngjs";

const url=process.env.KK_URL || "http://127.0.0.1:8767/index.html";
const outDir=process.env.KK_OUTDIR || "work/kkrieger-rebuild-lab";

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
  // Use phone CSS dimensions but DPR=1 in CI: the full native game scene is
  // expensive under software SwiftShader at iPhone DPR=3. Physical iPhone
  // still runs its real DPR; this gate measures composition/visibility and
  // native gameplay behavior, not GPU throughput.
  const context=await browser.newContext({...devices["iPhone 13"],viewport:{width:390,height:844},deviceScaleFactor:1});
  const page=await context.newPage();
  const errors=[];
  const logs=[];
  page.on("pageerror",e=>errors.push(String(e)));
  page.on("console",m=>{
    const t=m.text();
    if(t.includes("[rebuild]") || t.includes("[portrait-proof]")) logs.push(t);
    if(m.type()==="error") errors.push(t);
  });

  await page.goto(url,{waitUntil:"domcontentloaded",timeout:120000});
  await page.waitForFunction(()=>window.__kkRuntimeReady===true,null,{timeout:60000});
  await page.locator("#rebuildStart").click();
  await page.waitForFunction(()=>window.__kkPortraitProof?.master?.stage==="master",null,{timeout:90000});

  const stat=idx=>page.evaluate(i=>Module.ccall("kkRebuildStat","number",["number"],[i]),idx);

  // Preserve the native beta state machine. The converted beta starts in
  // INTRO and automatically reaches START; Enter selects the default "start
  // game" state through the real Exec_Misc_State operator. We intentionally
  // drive that authored path instead of forcing KGS_GAME from C++.
  await page.waitForTimeout(2500);
  const preSelect=await Promise.all(Array.from({length:15},(_,i)=>stat(i)));
  console.log("REBUILD_PRESELECT",JSON.stringify(preSelect));

  for(let attempt=0;attempt<12;attempt++){
    const gameState=await stat(13);
    if(gameState===0) break;
    await page.evaluate(()=>Module.ccall("kkRebuildKey",null,["number","number"],[10,1]));
    await page.waitForTimeout(700);
  }
  const afterMenu=await Promise.all(Array.from({length:15},(_,i)=>stat(i)));
  console.log("REBUILD_AFTER_MENU",JSON.stringify(afterMenu));
  if(afterMenu[13]!==0) throw new Error("native menu did not enter game: "+JSON.stringify(afterMenu));

  // Slot 0 is the shotgun/first visible optics recipe we surgically modify.
  // Key '1' is the real Krieger weapon-select path.
  await page.evaluate(()=>Module.ccall("kkRebuildKey",null,["number","number"],[49,1]));
  await page.waitForFunction(()=>{
    try{
      return Module.ccall("kkRebuildStat","number",["number"],[13])===0 &&
             Module.ccall("kkRebuildStat","number",["number"],[0])===0 &&
             Module.ccall("kkRebuildStat","number",["number"],[2])===1 &&
             Module.ccall("kkRebuildStat","number",["number"],[3])===1;
    }catch(e){ return false; }
  },null,{timeout:45000});


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

  await page.evaluate(()=>Module.ccall("kkRebuildSetMode",null,["number"],[0]));
  await page.waitForTimeout(180);
  const original=await capture("original");
  const om=visualMetrics(original);
  if(om.heightCoverage<.85 || om.nonBlackRatio<.35)
    throw new Error("original real Krieger frame visibility below gate: "+JSON.stringify(om));

  await page.evaluate(()=>{
    Module.ccall("kkRebuildSetMode",null,["number"],[1]);
    window.__kkRebuild.mode=1;
  });
  await page.waitForTimeout(180);
  const rebuilt=await capture("rebuilt");
  const mm=visualMetrics(rebuilt);
  if(mm.heightCoverage<.85 || mm.nonBlackRatio<.35)
    throw new Error("rebuilt real Krieger frame visibility below gate: "+JSON.stringify(mm));

  const fullDiff=diffRatio(original,rebuilt);
  const centerDiff=diffRatio(original,rebuilt,{x0:.08,y0:.12,x1:.92,y1:.88});
  const touched=await page.evaluate(()=>Module.ccall("kkRebuildTouched","number",[],[]));
  // Stronger than Surgery Lab v1: a location rebuild must alter a large
  // portion of the actual scene, not merely a few statistically different pixels.
  if(touched<24)
    throw new Error("too few native location transforms executed: "+touched);
  if(fullDiff.ratio<.18 || fullDiff.meanDelta<8.0 ||
     centerDiff.ratio<.20 || centerDiff.meanDelta<8.0)
    throw new Error("location rebuild is not large enough for human-visible proof: "+
      JSON.stringify({touched,fullDiff,centerDiff}));
  if(fullDiff.ratio>.90)
    throw new Error("rebuild looks like frame destruction rather than controlled authoring: "+JSON.stringify(fullDiff));

  const beforeFire=await stat(12);
  const beforeAmmo=await Promise.all([8,9,10,11].map(stat));
  await page.evaluate(()=>Module.ccall("kkRebuildFire",null,["number"],[1]));
  await page.waitForTimeout(140);
  await page.evaluate(()=>Module.ccall("kkRebuildFire",null,["number"],[0]));
  await page.waitForFunction(before=>{
    try{return Module.ccall("kkRebuildStat","number",["number"],[12])>before;}
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

  console.log("REBUILD_LAB_PASS",JSON.stringify({
    targetTransforms:86,
    touchedTransforms:touched,
    currentWeapon:await stat(0),
    opticsBound:await stat(2),
    shotBound:await stat(3),
    fireCountBefore:beforeFire,
    fireCountAfter:afterFire,
    ammoBefore:beforeAmmo,
    ammoAfter:afterAmmo,
    originalVisibility:om,
    rebuiltVisibility:mm,
    firedVisibility:fm,
    fullFrameDiff:fullDiff,
    centerSceneDiff:centerDiff,
    portrait:{inner:state.inner,backing:state.backing,engine:m.config,master:m.master,aspect:m.aspect},
    rebuildLogs:logs.filter(x=>x.includes("[rebuild]")).slice(-24)
  },null,2));

  await context.close();
} finally {
  await browser.close();
}
