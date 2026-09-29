from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-mobile.py <werkkzeug3_kkrieger>")

root = Path(sys.argv[1])
start = root / "wasm" / "_start_wasm.cpp"
shell = root / "wasm" / "shell.html"

cpp = start.read_text(encoding="utf-8")
cpp_anchor = "void sSystem_::WaitForKey() {}"
if cpp_anchor not in cpp:
    raise SystemExit("mobile input C++ anchor missing")

cpp_inject = r'''
// Browser-mobile input bridge. The touch UI calls these through Module.ccall;
// inputs go into the same key/mouse buffers used by SDL desktop input.
extern "C" EMSCRIPTEN_KEEPALIVE void kkMobileKey(int code,int down)
{
  if(!sSystem) return;
  sU32 key = 0;
  switch(code)
  {
  case 1001: key = sKEY_SHIFTL; break;
  case 1002: key = sKEY_ESCAPE; break;
  case 1003: key = sKEY_ENTER; break;
  case 1004: key = sKEY_UP; break;
  case 1005: key = sKEY_DOWN; break;
  case 1006: key = sKEY_LEFT; break;
  case 1007: key = sKEY_RIGHT; break;
  default:
    if(code >= 32 && code < 127) key = (sU32)code;
    break;
  }
  if(!key) return;
  if(code == 1001)
  {
    if(down) gKeyQual |= sKEYQ_SHIFTL;
    else gKeyQual &= ~sKEYQ_SHIFTL;
  }
  if(!down) key |= sKEYQ_BREAK;
  if(sSystem->KeyIndex < MAX_KEYBUFFER)
    sSystem->KeyBuffer[sSystem->KeyIndex++] = key;
}

extern "C" EMSCRIPTEN_KEEPALIVE void kkMobileFire(int down)
{
  if(!sSystem) return;
  if(down) sSystem->MouseButtons |= 1;
  else sSystem->MouseButtons &= ~1;
  sU32 key = sKEY_MOUSEL | (down ? 0 : sKEYQ_BREAK);
  if(sSystem->KeyIndex < MAX_KEYBUFFER)
    sSystem->KeyBuffer[sSystem->KeyIndex++] = key;
}

extern "C" EMSCRIPTEN_KEEPALIVE void kkMobileLook(int dx,int dy)
{
  gMouseDX += dx;
  gMouseDY += dy;
}

extern "C" EMSCRIPTEN_KEEPALIVE void kkMobileResize(int w,int h)
{
  if(!sSystem || !gWindow) return;
  if(w < 240 || h < 240 || w > 4096 || h > 4096) return;
  w &= ~1;
  h &= ~1;
  if(w == sSystem->ConfigX && h == sSystem->ConfigY) return;
  sSystem->ConfigX = w;
  sSystem->ConfigY = h;
  sSystem->InitScreens();
}
'''
cpp = cpp.replace(cpp_anchor, cpp_inject + "\n" + cpp_anchor, 1)
start.write_text(cpp, encoding="utf-8")

doc = shell.read_text(encoding="utf-8")
doc = doc.replace(
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">'
)
doc = doc.replace(
    "if(!resWanted) resWanted = '1024x768';",
    "if(!resWanted) resWanted = 'fit';"
)
doc = doc.replace(
    "var p = el.requestFullscreen ? el.requestFullscreen({navigationUI: 'hide'}) : null;",
    "var request = el.requestFullscreen || el.webkitRequestFullscreen;\n"
    "    var p = request ? request.call(el, {navigationUI: 'hide'}) : null;"
)
doc = doc.replace(
    "if(document.fullscreenElement) document.exitFullscreen(); else enterFullscreen();",
    "var active = document.fullscreenElement || document.webkitFullscreenElement;\n"
    "    if(active){ var exit = document.exitFullscreen || document.webkitExitFullscreen; if(exit) exit.call(document); } else enterFullscreen();"
)

style_anchor = "</style>"
mobile_css = r'''
  body{overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
  canvas{position:absolute;inset:0;width:100dvw !important;height:100dvh !important;max-width:none!important;max-height:none!important;object-fit:fill;touch-action:none}
  #wrap{position:fixed;inset:0;width:100dvw;height:100dvh}
  #mobile-ui{display:none;position:fixed;inset:0;z-index:7;pointer-events:none;touch-action:none}
  #movePad{position:absolute;left:max(18px,env(safe-area-inset-left));bottom:max(20px,env(safe-area-inset-bottom));
           width:132px;height:132px;border:2px solid rgba(255,255,255,.28);border-radius:50%;
           background:rgba(10,10,10,.18);pointer-events:auto;touch-action:none}
  #moveKnob{position:absolute;left:41px;top:41px;width:50px;height:50px;border-radius:50%;
            background:rgba(255,255,255,.32);border:1px solid rgba(255,255,255,.55);transform:translate(0,0)}
  #lookPad{position:absolute;right:0;top:0;width:58%;height:100%;pointer-events:auto;touch-action:none}
  .mBtn{position:absolute;pointer-events:auto;touch-action:none;min-width:56px;min-height:56px;border-radius:50%;
        border:1px solid rgba(255,255,255,.45);background:rgba(12,12,12,.42);color:#fff;
        font:700 12px/1 monospace;backdrop-filter:blur(4px)}
  #mFire{right:max(22px,env(safe-area-inset-right));bottom:max(24px,env(safe-area-inset-bottom));width:86px;height:86px;font-size:13px}
  #mUse{right:max(114px,calc(env(safe-area-inset-right) + 104px));bottom:max(38px,calc(env(safe-area-inset-bottom) + 14px))}
  #mMenu{right:max(14px,env(safe-area-inset-right));top:max(14px,env(safe-area-inset-top))}
  #mWeapon{right:max(82px,calc(env(safe-area-inset-right) + 70px));top:max(14px,env(safe-area-inset-top))}
  #fs{top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));right:auto;z-index:9;min-width:48px;min-height:44px}
  @media (pointer:coarse),(max-width:900px){
    body.kk-running #mobile-ui{display:block}
    body.kk-running #fs{opacity:.72}
    #start{padding:calc(env(safe-area-inset-top) + 14px) calc(env(safe-area-inset-right) + 14px)
                  calc(env(safe-area-inset-bottom) + 14px) calc(env(safe-area-inset-left) + 14px);box-sizing:border-box}
    #resbox,#fsbox{display:none}
  }
  @media (orientation:portrait) and (pointer:coarse){
    #movePad{width:124px;height:124px}
    #moveKnob{left:38px;top:38px;width:48px;height:48px}
    #mFire{width:82px;height:82px}
  }
'''
if style_anchor not in doc:
    raise SystemExit("style anchor missing")
doc = doc.replace(style_anchor, mobile_css + "\n" + style_anchor, 1)

body_anchor = '<button id="fs" title="fullscreen (Esc or the button leaves it)">&#x26F6; fullscreen</button>'
mobile_html = r'''
<div id="mobile-ui" aria-label="mobile game controls">
  <div id="lookPad" aria-label="swipe to look"></div>
  <div id="movePad" aria-label="movement joystick"><div id="moveKnob"></div></div>
  <button class="mBtn" id="mFire" type="button">FIRE</button>
  <button class="mBtn" id="mUse" type="button">USE</button>
  <button class="mBtn" id="mMenu" type="button">MENU</button>
  <button class="mBtn" id="mWeapon" type="button">W1</button>
</div>
'''
if body_anchor not in doc:
    raise SystemExit("fullscreen button anchor missing")
doc = doc.replace(body_anchor, body_anchor + "\n" + mobile_html, 1)

script_anchor = "  document.getElementById('start').addEventListener('click', function(){"
mobile_js = r'''
  var kkRunning = false;
  window.__kkMobileEvents = 0;
  function kkCall(name,args){
    if(!kkRunning || !Module || !Module.ccall) return;
    try {
      Module.ccall(name,null,new Array(args.length).fill('number'),args);
      window.__kkMobileEvents++;
    } catch(e) { console.error('[kk mobile] '+name, e); }
  }
  function kkKey(code,down){ kkCall('kkMobileKey',[code,down?1:0]); }
  function kkPulse(code){ kkKey(code,true); setTimeout(function(){ kkKey(code,false); },80); }
  function kkViewportPixels(){
    var vv = window.visualViewport;
    var cssW = vv ? vv.width : window.innerWidth;
    var cssH = vv ? vv.height : window.innerHeight;
    var d = Math.min(window.devicePixelRatio || 1, 2);
    return [Math.max(240,Math.round(cssW*d)) & ~1, Math.max(240,Math.round(cssH*d)) & ~1];
  }
  var resizeTimer = 0;
  function kkResizeRunning(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){
      if(!kkRunning) return;
      var r = kkViewportPixels();
      kkCall('kkMobileResize',r);
    },120);
  }
  addEventListener('resize',kkResizeRunning,{passive:true});
  addEventListener('orientationchange',kkResizeRunning,{passive:true});
  if(window.visualViewport) visualViewport.addEventListener('resize',kkResizeRunning,{passive:true});

  function kkCapture(el,id){ try { if(el.setPointerCapture) el.setPointerCapture(id); } catch(e) {} }
  var movePad = document.getElementById('movePad');
  var moveKnob = document.getElementById('moveKnob');
  var movePointer = null;
  var moveHeld = new Set();
  function setMoveKey(code,on){
    if(on && !moveHeld.has(code)){ moveHeld.add(code); kkKey(code,true); }
    if(!on && moveHeld.has(code)){ moveHeld.delete(code); kkKey(code,false); }
  }
  function updateMove(e){
    var r = movePad.getBoundingClientRect();
    var dx = e.clientX-(r.left+r.width/2), dy = e.clientY-(r.top+r.height/2);
    var radius = r.width*.34, mag = Math.hypot(dx,dy) || 1;
    var k = Math.min(1,radius/mag);
    moveKnob.style.transform='translate('+Math.round(dx*k)+'px,'+Math.round(dy*k)+'px)';
    var nx=dx/radius, ny=dy/radius, t=.28;
    setMoveKey(119,ny < -t); // W
    setMoveKey(115,ny >  t); // S
    setMoveKey(97, nx < -t); // A
    setMoveKey(100,nx >  t); // D
  }
  function stopMove(){
    [119,115,97,100].forEach(function(k){setMoveKey(k,false);});
    moveKnob.style.transform='translate(0,0)';
    movePointer=null;
  }
  movePad.addEventListener('pointerdown',function(e){movePointer=e.pointerId; kkCapture(movePad,e.pointerId); updateMove(e); e.preventDefault();});
  movePad.addEventListener('pointermove',function(e){if(e.pointerId===movePointer){updateMove(e);e.preventDefault();}});
  movePad.addEventListener('pointerup',stopMove);
  movePad.addEventListener('pointercancel',stopMove);

  var lookPad=document.getElementById('lookPad'), lookPointer=null, lx=0, ly=0;
  lookPad.addEventListener('pointerdown',function(e){lookPointer=e.pointerId;lx=e.clientX;ly=e.clientY;kkCapture(lookPad,e.pointerId);e.preventDefault();});
  lookPad.addEventListener('pointermove',function(e){
    if(e.pointerId!==lookPointer) return;
    var dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;
    kkCall('kkMobileLook',[Math.round(dx*2.2),Math.round(dy*2.2)]);e.preventDefault();
  });
  function stopLook(e){if(e.pointerId===lookPointer) lookPointer=null;}
  lookPad.addEventListener('pointerup',stopLook); lookPad.addEventListener('pointercancel',stopLook);

  function holdButton(id,down,up){
    var el=document.getElementById(id);
    el.addEventListener('pointerdown',function(e){kkCapture(el,e.pointerId);down();e.preventDefault();});
    ['pointerup','pointercancel'].forEach(function(ev){el.addEventListener(ev,function(e){up();e.preventDefault();});});
  }
  holdButton('mFire',function(){kkCall('kkMobileFire',[1]);},function(){kkCall('kkMobileFire',[0]);});
  holdButton('mUse',function(){kkKey(1001,true);},function(){kkKey(1001,false);});
  document.getElementById('mMenu').addEventListener('click',function(e){kkPulse(1002);e.preventDefault();});
  var weapon=1;
  document.getElementById('mWeapon').addEventListener('click',function(e){
    weapon=weapon%4+1; this.textContent='W'+weapon; kkPulse(48+weapon); e.preventDefault();
  });
'''
if script_anchor not in doc:
    raise SystemExit("start script anchor missing")
doc = doc.replace(script_anchor, mobile_js + "\n" + script_anchor, 1)
doc = doc.replace(
    "    Module.kkRes = pickedRes();",
    "    var mobileStart = matchMedia('(pointer:coarse)').matches || innerWidth <= 900;\n"
    "    if(mobileStart) resSel.value='fit';\n"
    "    if(mobileStart && !fsStart.checked && (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) enterFullscreen();\n"
    "    Module.kkRes = pickedRes();"
)
doc = doc.replace(
    "    this.remove();\n    statusEl = null;",
    "    this.remove();\n    document.body.classList.add('kk-running');\n    kkRunning = true;\n    statusEl = null;"
)

shell.write_text(doc, encoding="utf-8")
