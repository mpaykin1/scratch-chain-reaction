from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-mobile.py <werkkzeug3_kkrieger>")

root = Path(sys.argv[1])
start = root / "wasm" / "_start_wasm.cpp"
shell = root / "wasm" / "shell.html"
overlay = root / "genoverlay.cpp"

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

ov = overlay.read_text(encoding="utf-8")
old_rt = """    sInt bh = sMin(sSystem->ConfigX/2,sSystem->ConfigY), bw = 2*bh;
    sInt lx = 10, ly = 9;
"""
new_rt = """    // Keep the original 2:1 target in landscape, but in portrait allocate
    // the full visible surface so the 2004 post-process does not letterbox
    // the game into a narrow horizontal strip.
    sInt bw,bh;
    if(sSystem->ConfigY > sSystem->ConfigX)
    {
      bw = sSystem->ConfigX;
      bh = sSystem->ConfigY;
    }
    else
    {
      bh = sMin(sSystem->ConfigX/2,sSystem->ConfigY);
      bw = 2*bh;
    }
    sInt lx = 10, ly = 9;
"""
if ov.count(old_rt) != 1:
    raise SystemExit("portrait render-target anchor missing")
ov = ov.replace(old_rt,new_rt,1)

old_zoom = """      if(!(flags & 0x1000))
        env.ZoomY *= kenv->Aspect;
"""
new_zoom = """      if(!(flags & 0x1000))
        env.ZoomY *= kenv->Aspect;
#if defined(__EMSCRIPTEN__)
      // The beta camera was authored for a 2:1 render surface. In portrait,
      // compensate the projection instead of stretching the world vertically:
      // desired ZoomY/ZoomX tracks the actual viewport aspect.
      if(sSystem->ConfigY > sSystem->ConfigX)
        env.ZoomY *= (0.5f * sSystem->ConfigX) / sSystem->ConfigY;
#endif
"""
if ov.count(old_zoom) != 1:
    raise SystemExit("portrait camera anchor missing")
ov = ov.replace(old_zoom,new_zoom,1)
old_screen_frac = """      sRect r;
      r.x0 = view.Window.x0 + view.Window.XSize() * fx0;
      r.y0 = view.Window.y0 + view.Window.YSize() * fy0;
      r.x1 = view.Window.x0 + view.Window.XSize() * fx1;
      r.y1 = view.Window.y0 + view.Window.YSize() * fy1;
      if(r.x0<r.x1 && r.y0<r.y1)
        view.Window = r;
      sSystem->SetViewport(view);
"""
new_screen_frac = """      sRect r;
#if defined(__EMSCRIPTEN__)
      // The Breakpoint beta authored its final screen viewport as a 2:1 band.
      // On portrait mobile screens that creates the large black areas seen by
      // the user. Keep all off-screen/post-process viewport fractions intact,
      // but let the final screen target cover the complete visible surface.
      if(sSystem->ConfigY > sSystem->ConfigX && rt->Size >= GENOVER_RTSIZES)
      {
        r = view.Window;
      }
      else
#endif
      {
        r.x0 = view.Window.x0 + view.Window.XSize() * fx0;
        r.y0 = view.Window.y0 + view.Window.YSize() * fy0;
        r.x1 = view.Window.x0 + view.Window.XSize() * fx1;
        r.y1 = view.Window.y0 + view.Window.YSize() * fy1;
      }
      if(r.x0<r.x1 && r.y0<r.y1)
        view.Window = r;
      sSystem->SetViewport(view);
"""
if ov.count(old_screen_frac) != 1:
    raise SystemExit("final screen viewport anchor missing")
ov = ov.replace(old_screen_frac,new_screen_frac,1)

overlay.write_text(ov, encoding="utf-8")

doc = shell.read_text(encoding="utf-8")
doc = doc.replace(
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover>\n'
    '<meta name="apple-mobile-web-app-capable" content="yes">\n'
    '<meta name="mobile-web-app-capable" content="yes">\n'
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
    '<meta name="apple-mobile-web-app-title" content=".kkrieger">\n'
    '<meta name="theme-color" content="#000000">'
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
           background:rgba(10,10,10,.18);pointer-events:auto;touch-action:none;z-index:2}
  #moveKnob{position:absolute;left:41px;top:41px;width:50px;height:50px;border-radius:50%;
            background:rgba(255,255,255,.32);border:1px solid rgba(255,255,255,.55);transform:translate(0,0)}
  #lookPad{position:absolute;inset:0;width:100%;height:100%;pointer-events:auto;touch-action:none;z-index:0}
  .mBtn{position:absolute;pointer-events:auto;touch-action:none;min-width:56px;min-height:56px;border-radius:50%;
        border:1px solid rgba(255,255,255,.45);background:rgba(12,12,12,.42);color:#fff;
        font:700 12px/1 monospace;backdrop-filter:blur(4px);z-index:2}
  #mFire{right:max(22px,env(safe-area-inset-right));bottom:max(24px,env(safe-area-inset-bottom));width:86px;height:86px;font-size:13px}
  #mUse{right:max(114px,calc(env(safe-area-inset-right) + 104px));bottom:max(38px,calc(env(safe-area-inset-bottom) + 14px))}
  #mMenu{right:max(14px,env(safe-area-inset-right));top:max(14px,env(safe-area-inset-top))}
  #mWeapon{right:max(82px,calc(env(safe-area-inset-right) + 70px));top:max(14px,env(safe-area-inset-top))}
  #fs{top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));right:auto;z-index:9;min-width:48px;min-height:44px}
  #startGame{min-width:190px;min-height:58px;padding:12px 22px;border:1px solid #777;background:#151515;color:#fff;
             font:700 16px/1 monospace;letter-spacing:.08em;touch-action:manipulation}
  #startGame:disabled{color:#888;border-color:#444}
  #start.kk-starting{cursor:wait}
  #start.kk-starting #startGame{display:none}
  #start.kk-starting small{font-size:14px;color:#ddd}
  body.kk-standalone #fs{display:none}
  @media (display-mode:standalone){#fs{display:none}}
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

doc = doc.replace(
    '<div id="start"><div>click to start<small>WebGL2 · procedural content is generated on load, please wait</small>',
    '<div id="start"><div><button id="startGame" type="button" disabled>LOADING ENGINE…</button><small>WebGL2 · procedural content is generated on load, please wait</small>'
)
doc = doc.replace(
    "onRuntimeInitialized: function(){ if(statusEl) statusEl.textContent = 'ready'; },",
    "onRuntimeInitialized: function(){ window.__kkRuntimeReady = true; if(statusEl) statusEl.textContent = 'ready'; var b=document.getElementById('startGame'); if(b){b.disabled=false;b.textContent='START GAME';} },"
)

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
  var kkStandalone = !!(navigator.standalone || matchMedia('(display-mode: standalone)').matches);
  if(kkStandalone) document.body.classList.add('kk-standalone');
  window.__kkMobileEvents = 0;
  window.__kkMobileLookEvents = 0;
  window.__kkWeapon = 1;
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
    return [Math.min(4094,Math.max(240,Math.round(cssW*d))) & ~1,
            Math.min(4094,Math.max(240,Math.round(cssH*d))) & ~1];
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
    window.__kkMobileLookEvents++;
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
  document.getElementById('mMenu').addEventListener('click',function(e){kkPulse(1002);e.preventDefault();});
  var weapon=1;
  function cycleWeapon(){
    weapon=weapon%3+1;
    window.__kkWeapon=weapon;
    document.getElementById('mWeapon').textContent='W'+weapon;
    kkPulse(48+weapon);
  }
  document.getElementById('mUse').addEventListener('pointerdown',function(e){
    kkCapture(this,e.pointerId); cycleWeapon(); e.preventDefault();
  });
  document.getElementById('mWeapon').addEventListener('pointerdown',function(e){
    kkCapture(this,e.pointerId); cycleWeapon(); e.preventDefault();
  });
'''
if script_anchor not in doc:
    raise SystemExit("start script anchor missing")
doc = doc.replace(script_anchor, mobile_js + "\n" + script_anchor, 1)
old_start = """  document.getElementById('start').addEventListener('click', function(){
    if(fsStart.checked) enterFullscreen();
    Module.kkRes = pickedRes();
    this.remove();
    statusEl = null;
    Module.canvas.focus();
    // default: the Breakpoint 2004 release data, converted by wasm/tools/kxconv.py;
    // ?data=3383 plays data/kkrieger3383.kx (a later development snapshot)
    var data = new URLSearchParams(location.search).get('data');
    Module.callMain(data === '3383' ? [] : ['/kkrieger_beta.kx']);
  });
"""
new_start = """  var startEl = document.getElementById('start');
  var kkStartBusy = false;
  function kkBeginGame(){
    if(kkStartBusy) return;
    if(!window.__kkRuntimeReady){
      if(statusEl) statusEl.textContent = 'loading engine…';
      return;
    }
    kkStartBusy = true;
    var mobileStart = matchMedia('(pointer:coarse)').matches || innerWidth <= 900;
    if(mobileStart) resSel.value = 'fit';
    if(fsStart.checked || (mobileStart && !kkStandalone)) enterFullscreen();
    Module.kkRes = pickedRes();
    startEl.classList.add('kk-starting');
    startEl.querySelector('small').textContent = 'STARTING GAME · generating procedural world…';
    if(statusEl) statusEl.textContent = 'please wait';
    Module.canvas.focus();

    // Give Safari one paint before the synchronous procedural generation begins.
    requestAnimationFrame(function(){
      setTimeout(function(){
        try {
          var data = new URLSearchParams(location.search).get('data');
          Module.callMain(data === '3383' ? [] : ['/kkrieger_beta.kx']);
          document.body.classList.add('kk-running');
          kkRunning = true;
          startEl.remove();
          statusEl = null;
          Module.canvas.focus();
        } catch(e) {
          kkStartBusy = false;
          startEl.classList.remove('kk-starting');
          if(statusEl) statusEl.textContent = 'start failed · tap START GAME again';
          var b=document.getElementById('startGame'); if(b){b.disabled=false;b.textContent='START GAME';}
          console.error(e);
        }
      },60);
    });
  }
  startEl.addEventListener('click',kkBeginGame);
  document.getElementById('startGame').addEventListener('click',kkBeginGame);
"""
if doc.count(old_start) != 1:
    raise SystemExit("start handler anchor missing")
doc = doc.replace(old_start,new_start,1)

shell.write_text(doc, encoding="utf-8")
