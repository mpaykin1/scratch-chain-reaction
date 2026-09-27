// Screenshot-level mobile smoke test. Run after: npm i --no-save playwright && npx playwright install chromium
// This measures the actual Scratch canvas separately from the iframe. Shell fill != stage fill.
import { chromium, devices } from "playwright";
import fs from "node:fs/promises";
const base=process.env.GAME_URL||"http://127.0.0.1:4173";
await fs.mkdir("mobile-artifacts",{recursive:true});
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const failures=[];
try{
  for(const [name,contextOptions] of [
    ["portrait", {...devices["iPhone 13"],browserName:undefined}],
    ["landscape",{viewport:{width:844,height:390},deviceScaleFactor:1,isMobile:true,hasTouch:true}],
    ["desktop",{viewport:{width:1280,height:800},deviceScaleFactor:1}]
  ]){
    const context=await browser.newContext(contextOptions);
    const page=await context.newPage();
    const errors=[];
    page.on("pageerror",e=>errors.push(String(e)));
    page.on("requestfailed",r=>errors.push("REQUEST_FAILED "+r.url()+" "+r.failure()?.errorText));
    await page.goto(base+"/play.html",{waitUntil:"domcontentloaded",timeout:30000});
    const bounds=await page.evaluate(()=>{
      const box=document.querySelector("#app").getBoundingClientRect();
      const frame=document.querySelector("#game").getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,app:{width:box.width,height:box.height},
        iframe:{width:frame.width,height:frame.height},overflowX:document.documentElement.scrollWidth>innerWidth+1};
    });
    const shellArea=(bounds.app.width*bounds.app.height)/(bounds.width*bounds.height);
    const iframeArea=(bounds.iframe.width*bounds.iframe.height)/(bounds.width*bounds.height);
    if(shellArea<.95||iframeArea<.95||bounds.overflowX)throw Error(name+": broken viewport "+JSON.stringify(bounds));
    await page.waitForTimeout(10000);
    const frameURLs=page.frames().map(f=>f.url());
    const turbo=page.frames().find(f=>f.url().includes("turbowarp.org/embed"));
    let canvasRects=[];
    if(turbo){
      try{
        await turbo.locator("canvas").first().waitFor({state:"visible",timeout:45000});
        canvasRects=await turbo.locator("canvas").evaluateAll(list=>list.map(el=>{
          const r=el.getBoundingClientRect();
          return {x:r.x,y:r.y,width:r.width,height:r.height,area:r.width*r.height};
        }).filter(x=>x.area>1000));
      }catch(e){errors.push("Canvas not visible: "+String(e))}
    }else{errors.push("TurboWarp iframe did not navigate: "+JSON.stringify(frameURLs))}
    const maxCanvas=Math.max(0,...canvasRects.map(x=>x.area));
    const stageArea=maxCanvas/(bounds.width*bounds.height);
    await page.screenshot({path:"mobile-artifacts/"+name+".png",fullPage:true});
    console.log(JSON.stringify({profile:name,shellCoverage:Math.round(shellArea*100),
      iframeCoverage:Math.round(iframeArea*100),largestCanvasCoverage:Math.round(stageArea*100),
      actualCanvasRects:canvasRects,errors}));
    if(!canvasRects.length)failures.push(name+": no game canvas; "+errors.join("; "));
    // Only validate shell coverage here. A real portrait 9:16 Scratch scene is separate work.
    await context.close();
  }
  if(failures.length)throw Error("Gameplay embed not verified: "+failures.join(" | "));
}finally{await browser.close()}
