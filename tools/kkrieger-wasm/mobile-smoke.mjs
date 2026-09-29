import fs from "node:fs";
import { chromium, devices } from "playwright";

const url = process.env.KK_URL || "http://127.0.0.1:8765/kkrieger_standalone.html";
const browser = await chromium.launch({
  headless: true,
  args:["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--autoplay-policy=no-user-gesture-required"],
});
try {
  const iphone = devices["iPhone 13"];
  const context = await browser.newContext({...iphone, viewport:{width:390,height:844}});
  const page = await context.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  page.on("console",m=>{if(m.type()==="error") errors.push(m.text());});
  await page.goto(url,{waitUntil:"domcontentloaded",timeout:120000});

  const pre = await page.evaluate(()=>({
    w:innerWidth,h:innerHeight,
    canvas:document.querySelector("canvas")?.getBoundingClientRect().toJSON(),
    start:document.getElementById("start")?.getBoundingClientRect().toJSON(),
  }));
  if(!pre.canvas || pre.canvas.width < pre.w*.98 || pre.canvas.height < pre.h*.98) throw new Error("portrait canvas does not fill viewport");

  await page.locator("#start").click();
  await page.waitForFunction(()=>document.body.classList.contains("kk-running"),null,{timeout:30000});
  await page.waitForTimeout(5000);

  const mobile = await page.evaluate(()=> {
    const ids=["movePad","lookPad","mFire","mUse","mMenu","mWeapon"];
    return {
      visible:ids.every(id=>{const e=document.getElementById(id);const r=e.getBoundingClientRect();return getComputedStyle(e).display!=="none"&&r.width>0&&r.height>0;}),
      fireRect:document.getElementById("mFire").getBoundingClientRect().toJSON(),
      useRect:document.getElementById("mUse").getBoundingClientRect().toJSON(),
      events:window.__kkMobileEvents
    };
  });
  if(!mobile.visible) throw new Error("mobile controls not visible");
  if(mobile.fireRect.width<44||mobile.fireRect.height<44||mobile.useRect.width<44||mobile.useRect.height<44) throw new Error("touch targets below 44px");

  const pad=await page.locator("#movePad").boundingBox();
  await page.locator("#movePad").dispatchEvent("pointerdown",{pointerId:11,pointerType:"touch",clientX:pad.x+pad.width/2,clientY:pad.y+pad.height*.15});
  await page.locator("#movePad").dispatchEvent("pointermove",{pointerId:11,pointerType:"touch",clientX:pad.x+pad.width*.8,clientY:pad.y+pad.height*.18});
  await page.locator("#movePad").dispatchEvent("pointerup",{pointerId:11,pointerType:"touch",clientX:pad.x+pad.width*.8,clientY:pad.y+pad.height*.18});
  await page.locator("#mFire").dispatchEvent("pointerdown",{pointerId:12,pointerType:"touch"});
  await page.locator("#mFire").dispatchEvent("pointerup",{pointerId:12,pointerType:"touch"});
  await page.waitForTimeout(250);

  const afterInput=await page.evaluate(()=>window.__kkMobileEvents);
  if(afterInput < 4) throw new Error("mobile controls did not reach wasm bridge");
  await page.screenshot({path:process.env.KK_PORTRAIT_SHOT||"kkrieger-mobile-portrait.png"});

  await page.setViewportSize({width:844,height:390});
  await page.waitForTimeout(700);
  const land=await page.evaluate(()=>({
    w:innerWidth,h:innerHeight,
    c:document.querySelector("canvas").getBoundingClientRect().toJSON(),
    ui:getComputedStyle(document.getElementById("mobile-ui")).display,
    canvasWidth:document.querySelector("canvas").width,
    canvasHeight:document.querySelector("canvas").height,
  }));
  if(land.c.width < land.w*.98 || land.c.height < land.h*.98) throw new Error("landscape canvas does not fill viewport");
  if(land.ui==="none") throw new Error("mobile controls disappeared in landscape");
  if(land.canvasWidth <= land.canvasHeight) throw new Error("internal render target did not rotate to landscape");
  await page.screenshot({path:process.env.KK_LANDSCAPE_SHOT||"kkrieger-mobile-landscape.png"});

  const realErrors=errors.filter(x=>!/pointer lock|AudioContext|favicon/i.test(x));
  console.log(JSON.stringify({portrait:{width:390,height:844},landscape:land,mobileEvents:afterInput,errors:realErrors},null,2));
  if(realErrors.length) throw new Error(realErrors.join(" | "));
  await context.close();
} finally {
  await browser.close();
}
