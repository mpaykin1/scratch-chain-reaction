import fs from "node:fs";
import { chromium, devices } from "playwright";
import { PNG } from "pngjs";

const url=process.env.KK_URL || "http://127.0.0.1:8766/index.html";
const shot=process.env.KK_SCREENSHOT || "portrait-proof.png";

function texturedCoverage(buffer){
  const png=PNG.sync.read(buffer);
  const active=[];
  for(let y=0;y<png.height;y++){
    let min=255,max=0,bright=0,n=0;
    for(let x=0;x<png.width;x+=2){
      const i=(y*png.width+x)*4;
      const v=(png.data[i]+png.data[i+1]+png.data[i+2])/3;
      min=Math.min(min,v); max=Math.max(max,v);
      if(v>22) bright++;
      n++;
    }
    if((max-min)>=18 && bright/Math.max(1,n)>=0.012) active.push(y);
  }
  if(!active.length) return {coverage:0,top:null,bottom:null};
  return {
    coverage:(active.at(-1)-active[0]+1)/png.height,
    top:active[0]/png.height,
    bottom:active.at(-1)/png.height,
  };
}

const browser=await chromium.launch({
  headless:true,
  args:["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--autoplay-policy=no-user-gesture-required"]
});
try{
  const context=await browser.newContext({...devices["iPhone 13"],viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  page.on("console",m=>{ if(m.type()==="error") errors.push(m.text()); });
  await page.goto(url,{waitUntil:"domcontentloaded",timeout:120000});
  await page.waitForFunction(()=>window.__kkRuntimeReady===true,null,{timeout:60000});
  await page.locator("#proofStart").click();
  await page.waitForFunction(()=>window.__kkPortraitProof?.master?.stage==="master",null,{timeout:90000});
  await page.waitForTimeout(3500);

  const state=await page.evaluate(()=>({
    inner:[innerWidth,innerHeight],
    dpr:devicePixelRatio,
    canvasCss:(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return [r.x,r.y,r.width,r.height]})(),
    backing:[document.querySelector("canvas").width,document.querySelector("canvas").height],
    proof:window.__kkPortraitProof,
    pageLock:(()=>{
      const html=getComputedStyle(document.documentElement), body=getComputedStyle(document.body);
      return {
        scroll:[scrollX,scrollY],
        html:{position:html.position,overflow:html.overflow,touchAction:html.touchAction,overscroll:html.overscrollBehavior},
        body:{position:body.position,overflow:body.overflow,touchAction:body.touchAction,overscroll:body.overscrollBehavior},
        rootScroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
        bodyScroll:[document.body.scrollWidth,document.body.scrollHeight]
      };
    })()
  }));
  const m=state.proof.master;
  if(!m) throw new Error("missing engine master telemetry");
  if(m.config[1] <= m.config[0]) throw new Error("engine is not in portrait");
  const mw=m.master[2]-m.master[0], mh=m.master[3]-m.master[1];
  if(m.master[0]!==0 || m.master[1]!==0 || mw!==m.config[0] || mh!==m.config[1]){
    throw new Error("master viewport is not full engine portrait surface: "+JSON.stringify(m));
  }
  const expected=m.config[0]/m.config[1];
  if(Math.abs(m.aspect-expected)>0.002) throw new Error("projection aspect mismatch: "+m.aspect+" expected "+expected);
  if(state.canvasCss[2] < state.inner[0]*.98 || state.canvasCss[3] < state.inner[1]*.98){
    throw new Error("canvas CSS does not fill visible viewport");
  }

  // Fixed-game viewport contract: the HTML document itself must never pan.
  // This protects physical iPhone/Telegram/Safari controls from page
  // rubber-band competing with the game camera.
  for(const [name,style] of [["html",state.pageLock.html],["body",state.pageLock.body]]){
    if(style.position!=="fixed") throw new Error(name+" is not fixed: "+JSON.stringify(style));
    if(style.overflow!=="hidden") throw new Error(name+" overflow is not hidden: "+JSON.stringify(style));
    if(style.touchAction!=="none") throw new Error(name+" touch-action is not none: "+JSON.stringify(style));
  }
  await page.evaluate(()=>window.scrollTo(0,500));
  await page.waitForTimeout(80);
  const scrollProof=await page.evaluate(()=>({
    scroll:[scrollX,scrollY],
    inner:[innerWidth,innerHeight],
    rootScroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
    bodyScroll:[document.body.scrollWidth,document.body.scrollHeight],
    lock:window.__kkViewportLock||null
  }));
  if(scrollProof.scroll[0]!==0 || scrollProof.scroll[1]!==0){
    throw new Error("game page can scroll: "+JSON.stringify(scrollProof));
  }
  if(scrollProof.rootScroll[1] > scrollProof.inner[1]+2 || scrollProof.bodyScroll[1] > scrollProof.inner[1]+2){
    throw new Error("game document remains vertically scrollable: "+JSON.stringify(scrollProof));
  }

  console.log("ENGINE_PORTRAIT_STATE",JSON.stringify({
    inner:state.inner,
    backing:state.backing,
    master:m.master,
    config:m.config,
    aspect:m.aspect,
    fullRT:state.proof.fullRT||null,
    pageLock:state.pageLock
  }));
  const box={x:state.canvasCss[0],y:state.canvasCss[1],width:state.canvasCss[2],height:state.canvasCss[3]};
  if(box.width<=0 || box.height<=0) throw new Error("canvas has no visible DOM rectangle");
  const cdp=await context.newCDPSession(page);
  const captured=await cdp.send("Page.captureScreenshot",{
    format:"png",
    fromSurface:true,
    captureBeyondViewport:false,
    clip:{x:box.x,y:box.y,width:box.width,height:box.height,scale:1}
  });
  const png=Buffer.from(captured.data,"base64");
  fs.writeFileSync(shot,png);
  const texture=texturedCoverage(png);
  if(texture.coverage < 0.85){
    throw new Error("real textured 3D scene covers only "+(texture.coverage*100).toFixed(1)+"% of portrait height");
  }
  if(texture.top > 0.08 || texture.bottom < 0.92){
    throw new Error("textured scene still has large top/bottom bands: "+JSON.stringify(texture));
  }

  const realErrors=errors.filter(x=>!/pointer lock|AudioContext|favicon/i.test(x));
  if(realErrors.length) throw new Error(realErrors.join(" | "));
  console.log(JSON.stringify({
    pass:true,
    viewport:state.inner,
    dpr:state.dpr,
    engine:m.config,
    master:m.master,
    projectionAspect:m.aspect,
    fullRT:state.proof.fullRT||null,
    texturedHeightCoverage:texture.coverage,
    texturedTop:texture.top,
    texturedBottom:texture.bottom,
    pageFixed:true,
    errors:realErrors
  },null,2));
  await context.close();
} finally {
  await browser.close();
}
