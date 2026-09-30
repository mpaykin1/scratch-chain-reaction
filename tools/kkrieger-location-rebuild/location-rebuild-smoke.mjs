import fs from "node:fs";
import { chromium, devices } from "playwright";
import { PNG } from "pngjs";

const url=process.env.KK_URL || "http://127.0.0.1:8777/index.html";
const outDir=process.env.KK_OUTDIR || "work/kkrieger-location-rebuild";

function decode(buf){ return PNG.sync.read(buf); }
function metrics(buf){
  const p=decode(buf); let nonBlack=0,total=0,active=[];
  for(let y=0;y<p.height;y++){
    let vis=0,row=0,min=255,max=0;
    for(let x=0;x<p.width;x+=2){
      const i=(y*p.width+x)*4,r=p.data[i],g=p.data[i+1],b=p.data[i+2],peak=Math.max(r,g,b),avg=(r+g+b)/3;
      if(peak>16){nonBlack++;vis++;}
      total++;row++;min=Math.min(min,avg);max=Math.max(max,avg);
    }
    if(vis/Math.max(1,row)>.08 && max-min>12) active.push(y);
  }
  return {nonBlackRatio:nonBlack/Math.max(1,total),heightCoverage:active.length?(active.at(-1)-active[0]+1)/p.height:0};
}
function diff(aBuf,bBuf,reg={x0:0,y0:0,x1:1,y1:1}){
  const a=decode(aBuf),b=decode(bBuf);
  let changed=0,total=0,sum=0;
  const xa=Math.floor(a.width*reg.x0),xb=Math.ceil(a.width*reg.x1),ya=Math.floor(a.height*reg.y0),yb=Math.ceil(a.height*reg.y1);
  for(let y=ya;y<yb;y++) for(let x=xa;x<xb;x++){
    const i=(y*a.width+x)*4;
    const d=Math.max(Math.abs(a.data[i]-b.data[i]),Math.abs(a.data[i+1]-b.data[i+1]),Math.abs(a.data[i+2]-b.data[i+2]));
    if(d>=18) changed++;
    sum+=d; total++;
  }
  return {ratio:changed/Math.max(1,total),meanDelta:sum/Math.max(1,total)};
}

const browser=await chromium.launch({headless:true,args:["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--autoplay-policy=no-user-gesture-required"]});
try{
  fs.mkdirSync(outDir,{recursive:true});
  const context=await browser.newContext({...devices["iPhone 13"],viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[],logs=[];
  page.on("pageerror",e=>errors.push(String(e)));
  page.on("console",m=>{const t=m.text(); if(t.includes("[rebuild]")||t.includes("[portrait-proof]"))logs.push(t); if(m.type()==="error")errors.push(t);});

  await page.goto(url,{waitUntil:"domcontentloaded",timeout:120000});
  await page.waitForFunction(()=>window.__kkRuntimeReady===true,null,{timeout:60000});
  await page.locator("#rebuildStart").click();
  await page.waitForFunction(()=>window.__kkPortraitProof?.master?.stage==="master",null,{timeout:90000});

  const stat=i=>page.evaluate(x=>Module.ccall("kkRebuildGameStat","number",["number"],[x]),i);
  await page.waitForTimeout(3200);
  await page.evaluate(()=>{
    Module.ccall("kkRebuildKey",null,["number","number"],["1".charCodeAt(0),1]);
    Module.ccall("kkRebuildKey",null,["number","number"],["1".charCodeAt(0),0]);
  });
  await page.waitForFunction(()=>{
    try{return Module.ccall("kkRebuildGameStat","number",["number"],[0])===0 &&
               Module.ccall("kkRebuildGameStat","number",["number"],[2])===1 &&
               Module.ccall("kkRebuildGameStat","number",["number"],[3])===1;}
    catch(e){return false;}
  },null,{timeout:30000});

  const layout=await page.evaluate(()=>({
    inner:[innerWidth,innerHeight],
    scroll:[scrollX,scrollY],
    docClient:[document.documentElement.clientWidth,document.documentElement.clientHeight],
    docScroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
    bodyScroll:[document.body.scrollWidth,document.body.scrollHeight],
    bodyStyle:(()=>{const s=getComputedStyle(document.body);return {position:s.position,overflow:s.overflow,touchAction:s.touchAction,overscroll:s.overscrollBehavior}})(),
    rootStyle:(()=>{const s=getComputedStyle(document.documentElement);return {position:s.position,overflow:s.overflow,touchAction:s.touchAction,overscroll:s.overscrollBehavior}})(),
    proof:window.__kkPortraitProof
  }));
  const m=layout.proof.master;
  if(m.config[1]<=m.config[0]) throw new Error("engine not portrait");
  const mw=m.master[2]-m.master[0],mh=m.master[3]-m.master[1];
  if(m.master[0]!==0||m.master[1]!==0||mw!==m.config[0]||mh!==m.config[1]) throw new Error("master viewport not full portrait");
  if(layout.bodyStyle.position!=="fixed"||layout.rootStyle.position!=="fixed") throw new Error("fixed viewport contract missing");
  if(layout.bodyStyle.overflow!=="hidden"||layout.rootStyle.overflow!=="hidden") throw new Error("page overflow not locked");
  if(layout.bodyStyle.touchAction!=="none"||layout.rootStyle.touchAction!=="none") throw new Error("touch-action not locked");

  await page.evaluate(()=>window.scrollTo(0,500));
  await page.waitForTimeout(100);
  const afterScroll=await page.evaluate(()=>({x:scrollX,y:scrollY,doc:document.documentElement.scrollHeight,body:document.body.scrollHeight,inner:innerHeight}));
  if(afterScroll.x!==0||afterScroll.y!==0) throw new Error("page can scroll: "+JSON.stringify(afterScroll));
  if(afterScroll.doc>afterScroll.inner+2||afterScroll.body>afterScroll.inner+2) throw new Error("scrollable page height remains: "+JSON.stringify(afterScroll));

  const cdp=await context.newCDPSession(page);
  async function shot(name){
    await page.evaluate(()=>{
      const canvas=document.querySelector("canvas"),keep=new Set();
      for(let n=canvas;n;n=n.parentElement)keep.add(n);
      window.__kkHidden=[];
      for(const n of document.querySelectorAll("body *")){
        if(n===canvas||keep.has(n)||n.contains(canvas))continue;
        window.__kkHidden.push([n,n.style.visibility]);n.style.visibility="hidden";
      }
    });
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const box=await page.evaluate(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}});
    const cap=await cdp.send("Page.captureScreenshot",{format:"png",fromSurface:true,captureBeyondViewport:false,clip:{...box,scale:1}});
    await page.evaluate(()=>{for(const [n,v] of window.__kkHidden||[])n.style.visibility=v;window.__kkHidden=[];});
    const buf=Buffer.from(cap.data,"base64");fs.writeFileSync(`${outDir}/${name}.png`,buf);return buf;
  }

  await page.evaluate(()=>Module.ccall("kkRebuildSetMode",null,["number"],[0]));
  await page.waitForTimeout(120);
  const original=await shot("original");
  const om=metrics(original);
  if(om.heightCoverage<.85||om.nonBlackRatio<.35) throw new Error("original visibility below gate: "+JSON.stringify(om));

  await page.evaluate(()=>{Module.ccall("kkRebuildSetMode",null,["number"],[1]);window.__kkRebuild.mode=1;});
  await page.waitForTimeout(180);
  const rebuilt=await shot("rebuilt");
  const rm=metrics(rebuilt);
  if(rm.heightCoverage<.85||rm.nonBlackRatio<.35) throw new Error("rebuilt visibility below gate: "+JSON.stringify(rm));

  const full=diff(original,rebuilt);
  const architecture=diff(original,rebuilt,{x0:0,y0:.10,x1:1,y1:.78});
  const touched=await page.evaluate(()=>Module.ccall("kkRebuildGetTouched","number",[],[]));
  if(touched<30) throw new Error("too few native location transforms rebuilt: "+touched);
  if(full.ratio<.18||full.meanDelta<8) throw new Error("location rebuild not obvious enough full-frame: "+JSON.stringify(full));
  if(architecture.ratio<.20||architecture.meanDelta<9) throw new Error("architecture region rebuild not obvious enough: "+JSON.stringify(architecture));

  const beforeFire=await stat(7),ammoBefore=await stat(6);
  await page.evaluate(()=>Module.ccall("kkRebuildFire",null,["number"],[1]));
  await page.waitForTimeout(150);
  await page.evaluate(()=>Module.ccall("kkRebuildFire",null,["number"],[0]));
  await page.waitForFunction(b=>Module.ccall("kkRebuildGameStat","number",["number"],[7])>b,beforeFire,{timeout:5000});
  const afterFire=await stat(7),ammoAfter=await stat(6);
  if(afterFire<=beforeFire) throw new Error("FireShot not reached");
  if(await stat(2)!==1||await stat(3)!==1) throw new Error("native weapon bindings lost");

  const fired=await shot("fired");
  const realErrors=errors.filter(x=>!/pointer lock|AudioContext|favicon/i.test(x));
  if(realErrors.length) throw new Error(realErrors.join(" | "));

  console.log("LOCATION_REBUILD_PASS",JSON.stringify({
    touchedNativeSceneTransforms:touched,
    fullFrameDiff:full,
    architectureDiff:architecture,
    originalVisibility:om,
    rebuiltVisibility:rm,
    fire:{before:beforeFire,after:afterFire,ammoBefore,ammoAfter,opticsBound:await stat(2),shotBound:await stat(3)},
    viewportLock:{layout,afterScroll},
    logs:logs.filter(x=>x.includes("[rebuild]")).slice(-20)
  },null,2));

  await context.close();
} finally {
  await browser.close();
}
