#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-location-rebuild.py <werkkzeug3_kkrieger-root>")

root=Path(sys.argv[1]).resolve()

def rw(rel, transform):
    p=root/rel
    raw=p.read_bytes()
    try:
        text=raw.decode("utf-8"); enc="utf-8"
    except UnicodeDecodeError:
        text=raw.decode("latin-1"); enc="latin-1"
    p.write_bytes(transform(text).encode(enc))

def one(text, old, new, label):
    n=text.count(old)
    if n != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {n}")
    return text.replace(old,new,1)

def patch_scene(s):
    s=one(s,
      "#if defined(__EMSCRIPTEN__)\n#include <stdio.h>\n",
      "#if defined(__EMSCRIPTEN__)\n#include <stdio.h>\n#include <emscripten/emscripten.h>\n",
      "scene emscripten include")
    s=one(s,
      "sInt GenScenePasses = ~0;\nstatic sInt RenderPassAdjust = 0;\n",
      """sInt GenScenePasses = ~0;
static sInt RenderPassAdjust = 0;

#if defined(__EMSCRIPTEN__)
// Native Location Rebuild Lab.
// KX archaeology shows the level architecture lives predominantly in the
// 2400..3908 operator band while first-person weapon optics are below 1000.
// We mutate native Scene_Transform operators in that architecture band only;
// meshes, procedural bitmaps, MatLink materials, normals, sectors, portals,
// lights, weapon events and the 2004 renderer remain the original pipeline.
static sInt kkRebuildMode = 0;
static sInt kkRebuildTouched = 0;
static sU8 kkRebuildSeen[5000];

// KX-derived whitelist: 31 Scene_Transform operators whose immediate input
// is scene-add/multiply or rendered mesh content. Sector/Portal/Physic and
// Monster wrapper transforms are intentionally excluded so we rebuild the
// architecture *inside* native topology rather than tearing topology apart.
static sBool kkRebuildTarget(sInt id)
{
  static const sInt ids[] = {
    2460,2542,2953,2969,3082,3142,3207,3341,3386,
    3464,3506,3515,3526,3589,3591,3606,3608,3622,
    3637,3639,3641,3652,3654,3656,3666,3668,3670,
    3673,3707,3873,3903
  };
  for(sInt i=0;i<sCOUNTOF(ids);i++)
    if(ids[i]==id) return sTRUE;
  return sFALSE;
}

extern "C" EMSCRIPTEN_KEEPALIVE void kkRebuildSetMode(int mode)
{
  kkRebuildMode = mode ? 1 : 0;
}
extern "C" EMSCRIPTEN_KEEPALIVE int kkRebuildGetMode()
{
  return kkRebuildMode;
}
extern "C" EMSCRIPTEN_KEEPALIVE int kkRebuildGetTouched()
{
  return kkRebuildTouched;
}
#endif
""",
      "rebuild scene state")

    old="""void __stdcall Exec_Scene_Transform(KOp *op,KEnvironment *kenv,sF323 s,sF323 r,sF323 t)
{
  sF32 s_arr[9] = { s.x, s.y, s.z, r.x, r.y, r.z, t.x, t.y, t.z };   // was &s.x spanning 3 by-value params
  ExecSceneInputs(op,kenv,s_arr);
}
"""
    new="""void __stdcall Exec_Scene_Transform(KOp *op,KEnvironment *kenv,sF323 s,sF323 r,sF323 t)
{
#if defined(__EMSCRIPTEN__)
  if(kkRebuildMode && op && kkRebuildTarget(op->OpId))
  {
    const sInt id=op->OpId;
    // Rebuild actual native architecture, but keep sector/portal topology
    // untouched. These deliberately large deltas must be obvious to a human
    // at phone scale, not merely detectable by a pixel-diff algorithm.
    sF32 ox=t.x;
    t.x = ox*1.65f;
    if(sFAbs(ox)<0.45f)
      t.x += (id&1) ? 2.30f : -2.30f;
    else
      t.x += ((id%3)-1)*1.10f;

    t.z += ((id%5)-2)*1.15f;
    if(t.y>1.0f) t.y += ((id%4)-1.5f)*0.55f;

    s.x *= 1.18f + (id%4)*0.085f;
    if((id%5)==0) s.y *= 1.42f;
    if((id%7)==0) s.z *= 0.72f;
    r.y += ((id%7)-3)*0.040f;

    if(id<5000 && !kkRebuildSeen[id])
    {
      kkRebuildSeen[id]=1;
      kkRebuildTouched++;
      if(kkRebuildTouched<=48)
      {
        fprintf(stderr,
          "[rebuild] {\\\"stage\\\":\\\"native_location_transform\\\",\\\"op\\\":%d,\\\"touched\\\":%d,\\\"translate\\\":[%.3f,%.3f,%.3f],\\\"scale\\\":[%.3f,%.3f,%.3f]}\\n",
          id,kkRebuildTouched,t.x,t.y,t.z,s.x,s.y,s.z);
        fflush(stderr);
      }
    }
  }
#endif
  sF32 s_arr[9] = { s.x, s.y, s.z, r.x, r.y, r.z, t.x, t.y, t.z };   // was &s.x spanning 3 by-value params
  ExecSceneInputs(op,kenv,s_arr);
}
"""
    return one(s,old,new,"native location transform rebuild")

def patch_game(s):
    s=one(s,
      "#if defined(__EMSCRIPTEN__)\n#include <stdio.h>\n",
      "#if defined(__EMSCRIPTEN__)\n#include <stdio.h>\n#include <emscripten/emscripten.h>\n",
      "game emscripten include")

    reset_old="""void KKriegerGame::ResetRoot(KEnvironment *env,KOp *root,sBool firsttime)
{
  SetPainter(root,env);
  Restart();
  if(firsttime)
    Switches[KGS_GAME] = KGS_GAME_INTRO;
}
"""
    reset_new="""void KKriegerGame::ResetRoot(KEnvironment *env,KOp *root,sBool firsttime)
{
  SetPainter(root,env);
  Restart();
#if defined(__EMSCRIPTEN__)
  // This research lab must enter the real gameplay root immediately. It does
  // not bypass gameplay; it only skips the intro state so weapon/collision
  // evidence can be collected deterministically.
  if(firsttime && kkJsFlag("__kkLocationRebuildLab"))
    Switches[KGS_GAME] = KGS_GAME_RUN;
  else
#endif
  if(firsttime)
    Switches[KGS_GAME] = KGS_GAME_INTRO;
}
"""
    s=one(s,reset_old,reset_new,"location lab gameplay root")

    anchor="""void KKriegerGame::FireShot(KEnvironment *kenv,sInt weapon,KKriegerMonster *monster,const sVector *monsterfiredir)
{
"""
    helper="""#if defined(__EMSCRIPTEN__)
extern KKriegerGame *Game;
static sInt kkRebuildPlayerFireCount = 0;

extern "C" EMSCRIPTEN_KEEPALIVE int kkRebuildGameStat(int which)
{
  if(!Game) return -999;
  sInt w=Game->Player.CurrentWeapon;
  if(w<0 || w>=8) w=0;
  switch(which)
  {
  case 0: return Game->Player.CurrentWeapon;
  case 1: return Game->Player.NextWeapon;
  case 2: return Game->WeaponOptics[w] ? 1 : 0;
  case 3: return Game->WeaponShot[w] ? 1 : 0;
  case 4: return Game->Shots.Count;
  case 5: return Game->Player.FireKey;
  case 6: return Game->Player.Ammo[0];
  case 7: return kkRebuildPlayerFireCount;
  case 8: return Game->Switches[KGS_GAME];
  default:return -1;
  }
}

extern "C" EMSCRIPTEN_KEEPALIVE void kkRebuildDirectLook(int dx,int dy)
{
  if(!Game) return;
  sF32 f=Game->MouseTurnSpeed*(Game->Switches[KGS_MOUSESPEED]+2)/7;
  Game->PlayerDir += dx*f;
  f=Game->MouseLookSpeed*(Game->Switches[KGS_MOUSESPEED]+2)/7*
    (-Game->Switches[KGS_MOUSEINVERT]*2+1);
  Game->PlayerLook += dy*f;
  Game->PlayerLook=sRange<sF32>(Game->PlayerLook,sPIF/2,-sPIF/2);
  Game->PlayerMat.InitEuler(Game->FlyMode?Game->PlayerLook:0,Game->PlayerDir,0);
}
#endif

"""
    s=one(s,anchor,helper+anchor,"location game telemetry")

    needle="""  info = &ShotInfoTable[weapon];
  if(info->Mode==0) return;

  shot = Shots.Add();
"""
    repl="""  info = &ShotInfoTable[weapon];
  if(info->Mode==0) return;

#if defined(__EMSCRIPTEN__)
  if(!monster && kkJsFlag("__kkLocationRebuildLab"))
  {
    kkRebuildPlayerFireCount++;
    fprintf(stderr,
      "[rebuild] {\\\"stage\\\":\\\"player_fire\\\",\\\"count\\\":%d,\\\"weapon\\\":%d,\\\"shotOp\\\":%d}\\n",
      kkRebuildPlayerFireCount,weapon,WeaponShot[weapon]?WeaponShot[weapon]->OpId:-1);
    fflush(stderr);
  }
#endif

  shot = Shots.Add();
"""
    return one(s,needle,repl,"rebuild fire telemetry")

def patch_wasm(s):
    old="static sInt gMouseDX, gMouseDY;\n"
    new="""static sInt gMouseDX, gMouseDY;

extern "C" EMSCRIPTEN_KEEPALIVE void kkRebuildKey(int code,int down)
{
  sU32 key=(sU32)code;
  if(sSystem->KeyIndex<MAX_KEYBUFFER)
    sSystem->KeyBuffer[sSystem->KeyIndex++]=key | (down ? 0 : sKEYQ_BREAK);
}
extern "C" EMSCRIPTEN_KEEPALIVE void kkRebuildFire(int down)
{
  if(down) sSystem->MouseButtons |= 1;
  else     sSystem->MouseButtons &= ~1U;
  if(sSystem->KeyIndex<MAX_KEYBUFFER)
    sSystem->KeyBuffer[sSystem->KeyIndex++]=sKEY_MOUSEL | (down ? 0 : sKEYQ_BREAK);
}

"""
    return one(s,old,new,"rebuild mobile input bridge")

def patch_shell(s):
    s=s.replace("proofBadge","rebuildBadge")
    s=s.replace("proofStart","rebuildStart")
    s=s.replace("PORTRAIT PROOF · waiting","KRIEGER LOCATION REBUILD · waiting")
    s=s.replace("START PORTRAIT PROOF","START LOCATION REBUILD")
    s=s.replace("Real C++/WASM Krieger · portrait master viewport proof",
                "Real Krieger location graph · ORIGINAL / REBUILT")
    s=s.replace("'PORTRAIT PROOF\\nengine '","'KRIEGER LOCATION REBUILD\\nengine '")

    extra_css="""
  #rebuildSwitch{display:none;position:fixed;left:50%;transform:translateX(-50%);top:max(8px,env(safe-area-inset-top));z-index:15;
    gap:6px;padding:5px;background:rgba(0,0,0,.58);border:1px solid rgba(255,255,255,.3);border-radius:10px;touch-action:none}
  #rebuildSwitch button,#rebuildFire{border:1px solid rgba(255,255,255,.5);background:rgba(10,10,10,.76);color:#fff;
    font:700 11px/1 monospace;min-height:44px;padding:0 12px;touch-action:none}
  #rebuildSwitch button.active{background:#eee;color:#111}
  #rebuildTouch{display:none;position:fixed;left:0;top:0;width:100%;height:var(--kk-game-h,100dvh);z-index:8;pointer-events:none;
    overflow:hidden;touch-action:none;overscroll-behavior:none}
  #rebuildLook{position:absolute;inset:0;z-index:1;pointer-events:auto;touch-action:none}
  #rebuildJoy{position:absolute;z-index:2;left:max(18px,env(safe-area-inset-left));bottom:max(26px,env(safe-area-inset-bottom));
    width:112px;height:112px;border:1px solid rgba(255,255,255,.38);border-radius:50%;background:rgba(0,0,0,.22);
    pointer-events:auto;touch-action:none}
  #rebuildKnob{position:absolute;left:37px;top:37px;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.48)}
  #rebuildFire{position:absolute;z-index:3;right:max(18px,env(safe-area-inset-right));bottom:max(30px,env(safe-area-inset-bottom));
    min-width:88px;pointer-events:auto}
  .kk-running #rebuildSwitch{display:flex}
  .kk-running #rebuildTouch{display:block}
  @media (pointer:fine){#rebuildJoy{display:none}}
"""
    s=one(s,"</style>",extra_css+"</style>","rebuild CSS")

    badge='<div id="rebuildBadge">KRIEGER LOCATION REBUILD · waiting</div>'
    ui=badge+"""
<div id="rebuildSwitch">
  <button id="rebuildOriginal" class="active">ORIGINAL</button>
  <button id="rebuildModified">REBUILT</button>
</div>
<div id="rebuildTouch">
  <div id="rebuildLook"></div>
  <div id="rebuildJoy"><div id="rebuildKnob"></div></div>
  <button id="rebuildFire">FIRE</button>
</div>"""
    s=one(s,badge,ui,"rebuild UI")

    s=s.replace(
      "window.__kkPortraitProof = {events:[]};",
      "window.__kkPortraitProof = {events:[]};\n  window.__kkLocationRebuildLab=1;\n  window.__kkRebuild={mode:0};"
    )
    s=s.replace(
      "        startEl.remove();\n        statusEl=null;",
      "        document.body.classList.add('kk-running');\n        startEl.remove();\n        statusEl=null;"
    )

    marker="""  document.getElementById('rebuildStart').addEventListener('click',function(e){
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
        document.body.classList.add('kk-running');
        startEl.remove();
        statusEl=null;
        Module.canvas.focus();
      },40);
    });
  });
"""
    controls=marker+"""
  function rebuildCall(name,args,types,ret){
    try{return Module.ccall(name,ret||null,types||[],args||[]);}
    catch(e){console.error(e);return null;}
  }
  function rebuildMode(mode){
    window.__kkRebuild.mode=mode?1:0;
    rebuildCall('kkRebuildSetMode',[window.__kkRebuild.mode],['number']);
    document.getElementById('rebuildOriginal').classList.toggle('active',!window.__kkRebuild.mode);
    document.getElementById('rebuildModified').classList.toggle('active',!!window.__kkRebuild.mode);
  }
  document.getElementById('rebuildOriginal').addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();rebuildMode(0);});
  document.getElementById('rebuildModified').addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();rebuildMode(1);});

  var fire=document.getElementById('rebuildFire');
  fire.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();rebuildCall('kkRebuildFire',[1],['number']);});
  ['pointerup','pointercancel','pointerleave'].forEach(function(ev){
    fire.addEventListener(ev,function(e){e.preventDefault();rebuildCall('kkRebuildFire',[0],['number']);});
  });

  var joy=document.getElementById('rebuildJoy'),knob=document.getElementById('rebuildKnob'),held={w:0,a:0,s:0,d:0};
  function setKey(k,on){
    on=on?1:0;if(held[k]===on)return;held[k]=on;
    rebuildCall('kkRebuildKey',[k.charCodeAt(0),on],['number','number']);
  }
  function joyReset(){['w','a','s','d'].forEach(function(k){setKey(k,0)});knob.style.transform='translate(0,0)';}
  joy.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();joy.setPointerCapture(e.pointerId);});
  joy.addEventListener('pointermove',function(e){
    if(!joy.hasPointerCapture(e.pointerId))return;e.preventDefault();
    var q=joy.getBoundingClientRect(),dx=e.clientX-(q.left+q.width/2),dy=e.clientY-(q.top+q.height/2);
    var max=36,len=Math.hypot(dx,dy)||1,sc=Math.min(1,max/len);dx*=sc;dy*=sc;
    knob.style.transform='translate('+dx+'px,'+dy+'px)';
    setKey('a',dx<-14);setKey('d',dx>14);setKey('w',dy<-14);setKey('s',dy>14);
  });
  joy.addEventListener('pointerup',joyReset);joy.addEventListener('pointercancel',joyReset);

  var look=document.getElementById('rebuildLook'),lp=-1,lx=0,ly=0;
  look.addEventListener('pointerdown',function(e){
    if(e.target!==look)return;e.preventDefault();lp=e.pointerId;lx=e.clientX;ly=e.clientY;look.setPointerCapture(lp);
  });
  look.addEventListener('pointermove',function(e){
    if(e.pointerId!==lp)return;e.preventDefault();
    var dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;
    rebuildCall('kkRebuildDirectLook',[Math.round(dx*2),Math.round(dy*2)],['number','number']);
  });
  ['pointerup','pointercancel'].forEach(function(ev){look.addEventListener(ev,function(e){if(e.pointerId===lp)lp=-1;});});
"""
    s=one(s,marker,controls,"rebuild controls JS")

    old="""        b.textContent='KRIEGER LOCATION REBUILD\\nengine '+m.config[0]+'×'+m.config[1]+
          '\\nmaster '+(m.master[2]-m.master[0])+'×'+(m.master[3]-m.master[1])+
          '\\naspect '+m.aspect.toFixed(4);
"""
    new="""        var mode=window.__kkRebuild&&window.__kkRebuild.mode?'REBUILT':'ORIGINAL';
        b.textContent='KRIEGER LOCATION REBUILD · '+mode+
          '\\n31 native architecture Scene_Transform KOps'+
          '\\nengine '+m.config[0]+'×'+m.config[1]+
          '\\nmaster '+(m.master[2]-m.master[0])+'×'+(m.master[3]-m.master[1])+
          '\\naspect '+m.aspect.toFixed(4);
"""
    return one(s,old,new,"rebuild badge text")

rw("genscene.cpp",patch_scene)
rw("kkriegergame.cpp",patch_game)
rw("wasm/_start_wasm.cpp",patch_wasm)
rw("wasm/shell.html",patch_shell)
print("Krieger Location Rebuild patch: PASS")
