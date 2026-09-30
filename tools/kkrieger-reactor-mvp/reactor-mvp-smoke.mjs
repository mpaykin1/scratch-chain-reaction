import fs from "node:fs";
import { chromium, devices } from "playwright";
import { PNG } from "pngjs";

const url=process.env.KK_URL || "http://127.0.0.1:8767/index.html";
const shot=process.env.KK_SCREENSHOT || "reactor-mvp.png";

function sceneStats(buffer){
  const png=PNG.sync.read(buffer);
  const x0=Math.floor(png.width*0.08), x1=Math.ceil(png.width*0.92);
  const y0=Math.floor(png.height*0.08), y1=Math.ceil(png.height*0.92);
  const bins=new Map();
  let n=0,nonBlack=0,bright=0,sum=0,sum2=0,min=255,max=0,edges=0,edgeTests=0;
  for(let y=y0;y<y1;y+=2){
    for(let x=x0;x<x1;x+=2){
      const i=(y*png.width+x)*4;
      const r=png.data[i], g=png.data[i+1], b=png.data[i+2];
      const v=(r+g+b)/3;
      min=Math.min(min,v); max=Math.max(max,v);
      if(v>12) nonBlack++;
      if(v>28) bright++;
      sum+=v; sum2+=v*v; n++;

      // 4-bit/channel bins are intentionally coarse: antialiasing cannot turn
      // a single flat wall into dozens of supposedly distinct scene colours.
      const key=((r>>4)<<8)|((g>>4)<<4)|(b>>4);
      bins.set(key,(bins.get(key)||0)+1);

      if(x+2<x1){
        const j=(y*png.width+x+2)*4;
        const v2=(png.data[j]+png.data[j+1]+png.data[j+2])/3;
        if(Math.abs(v-v2)>8) edges++;
        edgeTests++;
      }
      if(y+2<y1){
        const j=((y+2)*png.width+x)*4;
        const v2=(png.data[j]+png.data[j+1]+png.data[j+2])/3;
        if(Math.abs(v-v2)>8) edges++;
        edgeTests++;
      }
    }
  }
  const mean=sum/Math.max(1,n);
  const variance=Math.max(0,sum2/Math.max(1,n)-mean*mean);
  const dominant=Math.max(0,...bins.values());
  return {
    width:png.width,height:png.height,
    nonBlackRatio:nonBlack/Math.max(1,n),
    brightRatio:bright/Math.max(1,n),
    meanLuma:mean,
    lumaStdDev:Math.sqrt(variance),
    minLuma:min,maxLuma:max,
    quantizedColorBins:bins.size,
    dominantBinRatio:dominant/Math.max(1,n),
    edgeDensity:edges/Math.max(1,edgeTests)
  };
}

function frameDelta(aBuffer,bBuffer){
  const a=PNG.sync.read(aBuffer), b=PNG.sync.read(bBuffer);
  if(a.width!==b.width || a.height!==b.height) return 1;
  const x0=Math.floor(a.width*0.08), x1=Math.ceil(a.width*0.92);
  const y0=Math.floor(a.height*0.08), y1=Math.ceil(a.height*0.92);
  let changed=0,n=0;
  for(let y=y0;y<y1;y+=2){
    for(let x=x0;x<x1;x+=2){
      const i=(y*a.width+x)*4;
      const d=(Math.abs(a.data[i]-b.data[i])+
               Math.abs(a.data[i+1]-b.data[i+1])+
               Math.abs(a.data[i+2]-b.data[i+2]))/3;
      if(d>14) changed++;
      n++;
    }
  }
  return changed/Math.max(1,n);
}

const browser=await chromium.launch({
  headless:true,
  args:["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--autoplay-policy=no-user-gesture-required"]
});

try{
  const context=await browser.newContext({...devices["iPhone 13"],viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",e=>{ errors.push(String(e)); console.log("PAGEERROR",String(e)); });
  page.on("console",m=>{
    const t=m.text();
    if(/\[reactor-mvp\]|abort|assert|exception|error/i.test(t)) console.log("BROWSER",m.type(),t);
    if(m.type()==="error") errors.push(t);
  });
  page.on("crash",()=>console.log("BROWSER_CRASH"));

  await page.goto(url,{waitUntil:"domcontentloaded",timeout:120000});
  await page.waitForFunction(()=>window.__kkRuntimeReady===true,null,{timeout:60000});
  await page.locator("#labStart").click();

  await page.waitForFunction(()=>window.__kkLab?.built?.id==="dark-reactor-v2",null,{timeout:240000});
  // Use the live C++ cell state as the collision oracle. The telemetry line is
  // diagnostic only and must not be able to turn a working scene into a timeout.
  await page.waitForFunction(()=>window.__kkLab?.player && Module.ccall("kkLabPose","number",["number"],[5])===1,null,{timeout:45000});
  await page.waitForFunction(()=>window.__kkLab?.render?.proceduralTextures>=4 && window.__kkLab?.render?.materialCategories>=3 && window.__kkLab?.render?.bumpMapped===1,null,{timeout:30000});
  await page.waitForFunction(()=>window.__kkLab?.viewport && window.__kkLab?.fullRT,null,{timeout:30000});
  await page.waitForFunction(()=>{
    const current=Module.ccall("kkLabPose","number",["number"],[8]);
    const next=Module.ccall("kkLabPose","number",["number"],[16]);
    return current===next &&
      Module.ccall("kkLabPose","number",["number"],[6])===1 &&
      Module.ccall("kkLabPose","number",["number"],[7])===1 &&
      Module.ccall("kkLabPose","number",["number"],[15])===1 &&
      Module.ccall("kkLabPose","number",["number"],[13])>=0.25;
  },null,{timeout:45000});
  await page.waitForTimeout(1800);

  const before=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__kkLab)));
  if(before.built.visualParts < 45 || before.built.curvedOps < 24 || before.built.multiplyOps < 2)
    throw new Error("reactor is not using enough native procedural geometry: "+JSON.stringify(before.built));
  if(before.built.recipeAB!==1)
    throw new Error("same-recipe A/B parameter-mutation proof is missing: "+JSON.stringify(before.built));
  if(before.built.collisionCells < 8) throw new Error("custom collision graph was not built");
  if(before.render?.basePasses < 3 || before.render?.lightPasses < 2 ||
     before.render?.materialCategories < 3 || before.render?.proceduralTextures < 4 ||
     before.render?.bumpMapped!==1)
    throw new Error("Krieger material/lighting contract missing: "+JSON.stringify(before.render));
  if(Math.abs(before.built.origin[0]-1000)>0.01) throw new Error("custom level is not isolated from original world coordinates");
  if(before.player.pos[0] < 980) throw new Error("player did not spawn in custom level");
  const weapon=await page.evaluate(()=>({
    current:Module.ccall("kkLabPose","number",["number"],[8]),
    next:Module.ccall("kkLabPose","number",["number"],[16]),
    optics:Module.ccall("kkLabPose","number",["number"],[6]),
    shot:Module.ccall("kkLabPose","number",["number"],[7]),
    event:Module.ccall("kkLabPose","number",["number"],[15]),
    weaponTimer:Module.ccall("kkLabPose","number",["number"],[13]),
    shots:Module.ccall("kkLabPose","number",["number"],[10]),
    ammo:Module.ccall("kkLabPose","number",["number"],[11]),
    cool:Module.ccall("kkLabPose","number",["number"],[12])
  }));
  if(weapon.current!==weapon.next || weapon.optics!==1 || weapon.shot!==1 || weapon.event!==1)
    throw new Error("native first-person weapon/event resources are not live: "+JSON.stringify(weapon));

  const v=before.viewport;
  const mw=v.master[2]-v.master[0], mh=v.master[3]-v.master[1];
  if(v.config[1] <= v.config[0]) throw new Error("proof is not running portrait");
  if(mw!==v.config[0] || mh!==v.config[1]) throw new Error("custom level lost full portrait master viewport");
  if(Math.abs(v.aspect-(v.config[0]/v.config[1]))>.002) throw new Error("custom level projection aspect mismatch");

  // Real input boundary. Do not use fixed sleeps: software WebGL can render
  // only a few frames per second. Wait for the C++ simulation state itself.
  const p0=before.player.pos.slice();
  await page.evaluate(()=>Module.ccall("kkLabKey",null,["number","number"],[119,1]));
  await page.waitForFunction((p)=>{
    const q=window.__kkLab?.player?.pos;
    return q && Math.hypot(q[0]-p[0],q[2]-p[2])>0.08;
  },p0,{timeout:45000});
  const after=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__kkLab)));
  const dx=after.player.pos[0]-before.player.pos[0];
  const dz=after.player.pos[2]-before.player.pos[2];
  const moved=Math.hypot(dx,dz);
  if(moved < 0.08) throw new Error("real Krieger player did not move inside custom level: "+moved);

  // Read the real KKriegerGame pose directly instead of waiting for a sampled
  // log line. Re-send look deltas if a software-rendered frame is very slow.
  const pose0=await page.evaluate(()=>[
    Module.ccall("kkLabPose","number",["number"],[0]),
    Module.ccall("kkLabPose","number",["number"],[1])
  ]);
  let pose1=pose0;
  for(let attempt=0;attempt<6;attempt++){
    await page.evaluate(()=>Module.ccall("kkLabDirectLook",null,["number","number"],[45,-24]));
    await page.waitForTimeout(900);
    pose1=await page.evaluate(()=>[
      Module.ccall("kkLabPose","number",["number"],[0]),
      Module.ccall("kkLabPose","number",["number"],[1])
    ]);
    if(Math.abs(pose1[0]-pose0[0])>=0.001 || Math.abs(pose1[1]-pose0[1])>=0.001) break;
  }
  if(Math.abs(pose1[0]-pose0[0])<0.001 && Math.abs(pose1[1]-pose0[1])<0.001)
    throw new Error("camera look did not change live KKriegerGame pose: "+JSON.stringify({pose0,pose1}));
  const looked=await page.evaluate(()=>({
    dir:Module.ccall("kkLabPose","number",["number"],[0]),
    look:Module.ccall("kkLabPose","number",["number"],[1]),
    x:Module.ccall("kkLabPose","number",["number"],[2]),
    y:Module.ccall("kkLabPose","number",["number"],[3]),
    z:Module.ccall("kkLabPose","number",["number"],[4]),
    cell:Module.ccall("kkLabPose","number",["number"],[5])
  }));
  await page.evaluate(()=>Module.ccall("kkLabKey",null,["number","number"],[119,0]));

  // Real FIRE proof: verify the input crosses into KKriegerGame and causes a
  // gameplay-state transition, not merely a button event. Ammo/cooldown are
  // persistent enough to avoid missing a short-lived projectile under SwiftShader.
  const fireBefore=await page.evaluate(()=>({
    shots:Module.ccall("kkLabPose","number",["number"],[10]),
    ammo:Module.ccall("kkLabPose","number",["number"],[11]),
    cool:Module.ccall("kkLabPose","number",["number"],[12])
  }));
  await page.evaluate(()=>Module.ccall("kkLabFire",null,["number"],[1]));
  await page.waitForFunction((b)=>{
    const shots=Module.ccall("kkLabPose","number",["number"],[10]);
    const ammo=Module.ccall("kkLabPose","number",["number"],[11]);
    const cool=Module.ccall("kkLabPose","number",["number"],[12]);
    return shots>b.shots || ammo<b.ammo || cool>b.cool+0.01;
  },fireBefore,{timeout:30000});
  const fireAfter=await page.evaluate(()=>({
    shots:Module.ccall("kkLabPose","number",["number"],[10]),
    ammo:Module.ccall("kkLabPose","number",["number"],[11]),
    cool:Module.ccall("kkLabPose","number",["number"],[12]),
    fireKey:Module.ccall("kkLabPose","number",["number"],[14])
  }));
  await page.evaluate(()=>Module.ccall("kkLabFire",null,["number"],[0]));
  if(!(fireAfter.shots>fireBefore.shots || fireAfter.ammo<fireBefore.ammo || fireAfter.cool>fireBefore.cool+0.01))
    throw new Error("FIRE did not reach native Krieger gameplay state: "+JSON.stringify({fireBefore,fireAfter}));

  // Visual proof must measure the 3D framebuffer, not HTML controls. The old
  // oracle accidentally counted the cyan badge + joystick/buttons as scene
  // pixels, so an entirely black WebGL canvas could pass with ~96% "coverage".
  await page.evaluate(()=>{
    for(const el of document.querySelectorAll("#labBadge,#labTouch,#fs,#status,#start"))
      el.style.visibility="hidden";
  });
  await page.waitForTimeout(250);

  const canvas=await page.evaluate(()=>{
    const el=document.querySelector("canvas");
    if(!el) return null;
    const r=el.getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height};
  });
  if(!canvas || canvas.width<=0 || canvas.height<=0) throw new Error("canvas DOM rectangle unavailable");
  const cdp=await context.newCDPSession(page);
  async function capture(){
    const cap=await cdp.send("Page.captureScreenshot",{
      format:"png",fromSurface:true,captureBeyondViewport:false,
      clip:{x:canvas.x,y:canvas.y,width:canvas.width,height:canvas.height,scale:1}
    });
    return Buffer.from(cap.data,"base64");
  }

  const png=await capture();
  fs.writeFileSync(shot,png);
  const visual=sceneStats(png);

  // A large flat coloured rectangle is NOT a visible level. The user's
  // physical iPhone exposed this exact false positive after the old >85%
  // non-black gate. Require occupancy plus actual scene structure.
  if(visual.nonBlackRatio <= 0.85 ||
     visual.maxLuma < 32 ||
     visual.lumaStdDev < 9 ||
     visual.dominantBinRatio >= 0.68 ||
     visual.quantizedColorBins < 16 ||
     visual.edgeDensity < 0.009)
    throw new Error("custom 3D framebuffer is occupied but not structurally visible: "+JSON.stringify(visual));

  // Parallax/view-response proof: rotate the real C++ player camera and demand
  // that a meaningful part of the framebuffer changes. A flat clear colour,
  // DOM overlay, or a single wall cannot satisfy this by itself.
  console.log("FRAMEBUFFER_BASE "+JSON.stringify(visual));
  const turn=await page.evaluate(()=>{
    const before=Module.ccall("kkLabPose","number",["number"],[0]);
    Module.ccall("kkLabDirectLook",null,["number","number"],[120,0]);
    const after=Module.ccall("kkLabPose","number",["number"],[0]);
    return {before,after};
  });
  if(Math.abs(turn.after-turn.before)<0.20)
    throw new Error("direct C++ camera rotation did not change PlayerDir: "+JSON.stringify(turn));

  // Do not depend on sampled log timing: under SwiftShader a real Krieger
  // frame can take tens of seconds. Poll the actual compositor until the
  // changed C++ pose becomes visible, and judge only the framebuffer delta.
  let pngTurned=null, turned=null, viewDeltaRatio=0;
  for(let attempt=0;attempt<12;attempt++){
    await page.waitForTimeout(3000);
    pngTurned=await capture();
    turned=sceneStats(pngTurned);
    viewDeltaRatio=frameDelta(png,pngTurned);
    if(viewDeltaRatio>=0.035) break;
  }
  if(viewDeltaRatio < 0.035)
    throw new Error("3D view did not respond visually to camera rotation: "+JSON.stringify({turn,viewDeltaRatio,visual,turned}));

  const realErrors=errors.filter(x=>!/pointer lock|AudioContext|favicon/i.test(x));
  if(realErrors.length) throw new Error(realErrors.join(" | "));

  console.log(JSON.stringify({
    pass:true,
    level:before.built,
    collision:before.collision,
    portrait:{config:v.config,master:v.master,aspect:v.aspect,fullRT:before.fullRT},
    playerBefore:before.player,
    playerAfter:after.player,
    moved,
    playerLooked:looked,
    renderer:before.render,
    nativeWeapon:weapon,
    nativeFire:{before:fireBefore,after:fireAfter},
    framebuffer:visual,
    framebufferTurned:turned,
    viewDeltaRatio,
    errors:realErrors
  },null,2));
  await context.close();
} finally {
  await browser.close();
}
