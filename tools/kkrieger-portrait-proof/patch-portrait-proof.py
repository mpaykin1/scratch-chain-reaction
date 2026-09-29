#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-portrait-proof.py <werkkzeug3_kkrieger-root>")

root=Path(sys.argv[1]).resolve()

def rw(rel, transform):
    p=root/rel
    raw=p.read_bytes()
    try:
        text=raw.decode("utf-8"); enc="utf-8"
    except UnicodeDecodeError:
        text=raw.decode("latin-1"); enc="latin-1"
    new=transform(text)
    p.write_bytes(new.encode(enc))

def one(text, old, new, label):
    n=text.count(old)
    if n != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {n}")
    return text.replace(old,new,1)

def patch_mainplayer(s):
    old="""#if defined(__EMSCRIPTEN__)
    // the view is 2:1 (Environment->Aspect below); the original placed it at
    // 1/6..5/6 of a 4:3 screen, which is the same thing there. For other
    // screen shapes centre the largest 2:1 rectangle instead of stretching.
    {
      sInt bh = sMin(sSystem->ConfigX/2,sSystem->ConfigY);
      sInt bw = 2*bh;
      sInt x0 = (sSystem->ConfigX-bw)/2, y0 = (sSystem->ConfigY-bh)/2;
      vp.Window.Init(x0,y0,x0+bw,y0+bh);
    }
#else
"""
    new="""#if defined(__EMSCRIPTEN__)
    // Portrait Proof: this is the actual root policy that used to force a
    // centered 2:1 band. Portrait now owns the full engine backbuffer.
    // Landscape preserves the original 2:1 composition.
    if(sSystem->ConfigY > sSystem->ConfigX)
    {
      vp.Window.Init(0,0,sSystem->ConfigX,sSystem->ConfigY);
    }
    else
    {
      sInt bh = sMin(sSystem->ConfigX/2,sSystem->ConfigY);
      sInt bw = 2*bh;
      sInt x0 = (sSystem->ConfigX-bw)/2, y0 = (sSystem->ConfigY-bh)/2;
      vp.Window.Init(x0,y0,x0+bw,y0+bh);
    }
#else
"""
    s=one(s,old,new,"mainplayer master viewport")
    old2="""    //Environment->Aspect =  1.0f*vp.Window.XSize()/vp.Window.YSize();
    Environment->Aspect = 2.0f;
"""
    new2="""#if defined(__EMSCRIPTEN__)
    // Match projection to the actual master viewport. In landscape this is
    // still exactly 2.0; in portrait it becomes the physical width/height.
    Environment->Aspect = vp.Window.YSize()
      ? 1.0f*vp.Window.XSize()/vp.Window.YSize()
      : 1.0f;
    fprintf(stderr,
      "[portrait-proof] {\\\"stage\\\":\\\"master\\\",\\\"config\\\":[%d,%d],\\\"master\\\":[%d,%d,%d,%d],\\\"aspect\\\":%.8f}\\n",
      sSystem->ConfigX,sSystem->ConfigY,
      vp.Window.x0,vp.Window.y0,vp.Window.x1,vp.Window.y1,
      Environment->Aspect);
#else
    Environment->Aspect = 2.0f;
#endif
"""
    return one(s,old2,new2,"mainplayer dynamic aspect")

def patch_overlay(s):
    old="""  {
    sInt bh = sMin(sSystem->ConfigX/2,sSystem->ConfigY), bw = 2*bh;
    sInt lx = 10, ly = 9;
    while((1<<lx) < bw && lx < 13) lx++;
    while((1<<ly) < bh && ly < 12) ly++;
    sizes[GENOVER_RTSIZES-1][0] = lx;
    sizes[GENOVER_RTSIZES-1][1] = ly;
  }
"""
    new="""  {
    // The final full-size RT must be able to hold the same portrait surface as
    // the master viewport. Landscape keeps the original 2:1 allocation.
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
    while((1<<lx) < bw && lx < 13) lx++;
    while((1<<ly) < bh && ly < 12) ly++;
    sizes[GENOVER_RTSIZES-1][0] = lx;
    sizes[GENOVER_RTSIZES-1][1] = ly;
    fprintf(stderr,
      "[portrait-proof] {\\\"stage\\\":\\\"full_rt\\\",\\\"requested\\\":[%d,%d],\\\"pow2\\\":[%d,%d]}\\n",
      bw,bh,1<<lx,1<<ly);
  }
"""
    return one(s,old,new,"portrait full-size render target")

def patch_shell(s):
    s=one(s,
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">\n'
      '<meta name="apple-mobile-web-app-capable" content="yes">\n'
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
      '<meta name="theme-color" content="#000000">',
      "viewport meta")
    s=s.replace("if(!resWanted) resWanted = '1024x768';","if(!resWanted) resWanted = 'fit';")
    s=s.replace("object-fit:contain","object-fit:fill")
    s=one(s,"</style>","""
  body{overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
  #wrap{position:fixed;inset:0;width:100dvw;height:100dvh}
  canvas{position:absolute;inset:0;width:100dvw!important;height:100dvh!important;max-width:none!important;max-height:none!important;touch-action:none}
  #proofBadge{position:fixed;left:max(8px,env(safe-area-inset-left));top:max(8px,env(safe-area-inset-top));z-index:9;
    padding:6px 8px;border:1px solid rgba(255,255,255,.35);background:rgba(0,0,0,.55);color:#9ff;
    font:10px/1.25 monospace;pointer-events:none;white-space:pre}
  #start button{min-width:220px;min-height:62px;background:#111;color:#fff;border:1px solid #777;font:700 16px monospace}
</style>""","proof CSS")
    s=one(s,
      '<button id="fs" title="fullscreen (Esc or the button leaves it)">&#x26F6; fullscreen</button>',
      '<button id="fs" title="fullscreen (Esc or the button leaves it)">&#x26F6; fullscreen</button>\n<div id="proofBadge">PORTRAIT PROOF · waiting</div>',
      "proof badge")
    s=one(s,
      '<div id="start"><div>click to start<small>WebGL2 · procedural content is generated on load, please wait</small>',
      '<div id="start"><div><button id="proofStart" disabled>LOADING ENGINE…</button><small>Real C++/WASM Krieger · portrait master viewport proof</small>',
      "proof start button")
    old="""  var Module = {
    canvas: document.getElementById('canvas'),
    print: function(t){ console.log(t); kkLog(t); },
    printErr: function(t){
"""
    new="""  window.__kkPortraitProof = {events:[]};
  function kkProofLine(t){
    if(typeof t!=='string') return;
    var p=t.indexOf('[portrait-proof] ');
    if(p<0) return;
    try {
      var e=JSON.parse(t.slice(p+17));
      window.__kkPortraitProof.events.push(e);
      if(e.stage==='master') window.__kkPortraitProof.master=e;
      if(e.stage==='full_rt') window.__kkPortraitProof.fullRT=e;
      var b=document.getElementById('proofBadge');
      if(b && window.__kkPortraitProof.master) {
        var m=window.__kkPortraitProof.master;
        b.textContent='PORTRAIT PROOF\\nengine '+m.config[0]+'×'+m.config[1]+
          '\\nmaster '+(m.master[2]-m.master[0])+'×'+(m.master[3]-m.master[1])+
          '\\naspect '+m.aspect.toFixed(4);
      }
    } catch(e) {}
  }
  var Module = {
    canvas: document.getElementById('canvas'),
    print: function(t){ console.log(t); kkProofLine(t); kkLog(t); },
    printErr: function(t){
      kkProofLine(t);
"""
    s=one(s,old,new,"proof log collector")
    s=s.replace(
      "onRuntimeInitialized: function(){ if(statusEl) statusEl.textContent = 'ready'; },",
      "onRuntimeInitialized: function(){ window.__kkRuntimeReady=true; if(statusEl) statusEl.textContent='ready'; var b=document.getElementById('proofStart'); if(b){b.disabled=false;b.textContent='START PORTRAIT PROOF';} },"
    )
    oldstart="""  document.getElementById('start').addEventListener('click', function(){
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
    newstart="""  var startEl=document.getElementById('start');
  var proofBusy=false;
  document.getElementById('proofStart').addEventListener('click',function(e){
    e.stopPropagation();
    if(proofBusy || !window.__kkRuntimeReady) return;
    proofBusy=true;
    this.disabled=true;
    this.textContent='GENERATING…';
    resSel.value='fit';
    Module.kkRes=pickedRes();
    requestAnimationFrame(function(){
      setTimeout(function(){
        var data=new URLSearchParams(location.search).get('data');
        Module.callMain(data==='3383'?[]:['/kkrieger_beta.kx']);
        startEl.remove();
        statusEl=null;
        Module.canvas.focus();
      },40);
    });
  });
"""
    return one(s,oldstart,newstart,"proof start handler")

rw("mainplayer.cpp",patch_mainplayer)
rw("genoverlay.cpp",patch_overlay)
rw("wasm/shell.html",patch_shell)
print("portrait proof patch: PASS")
