#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-rebuild-lab.py <werkkzeug3_kkrieger-root>")

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
// Rebuild Lab edits a controlled set of native location Scene_Transform
// operators at runtime. The source meshes, materials, procedural bitmaps,
// lights, sectors, portals, weapons and effects stay in the original graph.
static sInt kkRebuildMode = 0;
static sInt kkRebuildTouchedCount = 0;
static sU8 kkRebuildSeen[4818];

static sBool kkRebuildIsLocationTransform(sInt id)
{
  // These transforms are inside the gameplay-world scene branch (rooted by
  // the native scene chain feeding the game viewport) and deliberately
  // exclude the low-id weapon location/event graphs.
  static const sInt ids[] = {
    2460,2467,2495,2496,2506,2542,2549,2953,2964,2965,2966,2969,2974,2977,
    3082,3087,3092,3093,3097,3122,3130,3138,3140,3142,3207,3213,3339,3341,
    3346,3351,3358,3370,3371,3373,3374,3386,3392,3395,3464,3504,3506,3513,
    3515,3521,3526,3532,3535,3589,3591,3604,3606,3608,3617,3622,3628,3631,
    3637,3639,3641,3649,3652,3654,3656,3664,3666,3668,3670,3673,3679,3683,
    3707,3717,3866,3873,3903,3908,3911,4269,4271,4273,4312,4323,4326,4331,
    4334,4336
  };
  for(sInt i=0;i<sCOUNTOF(ids);i++) if(ids[i]==id) return sTRUE;
  return sFALSE;
}

extern "C" EMSCRIPTEN_KEEPALIVE void kkRebuildSetMode(int mode)
{
  kkRebuildMode = mode ? 1 : 0;
  if(!kkRebuildMode)
  {
    kkRebuildTouchedCount = 0;
    sSetMem(kkRebuildSeen,0,sizeof(kkRebuildSeen));
  }
}

extern "C" EMSCRIPTEN_KEEPALIVE int kkRebuildGetMode()
{
  return kkRebuildMode;
}

extern "C" EMSCRIPTEN_KEEPALIVE int kkRebuildTouched()
{
  return kkRebuildTouchedCount;
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
  if(op && kkRebuildMode && kkRebuildIsLocationTransform(op->OpId))
  {
    const sInt id=op->OpId;
    // Deterministic architectural rewrite: alternate bays widen/narrow,
    // vertical rhythm changes, and local yaw/roll/offsets create a clearly
    // different corridor composition while retaining the original assets.
    const sInt band=id%7;
    const sF32 side = (band<3) ? -1.0f : 1.0f;
    s.x *= 0.78f + 0.10f*(band%4);
    s.y *= 0.86f + 0.08f*((band+1)%4);
    s.z *= 0.92f + 0.09f*((band+2)%3);
    r.y += side*(0.035f + 0.012f*(band%3));
    r.z += ((id&1)?1.0f:-1.0f)*(0.012f + 0.006f*(band%4));
    t.x += side*(0.38f + 0.14f*(band%4));
    t.y += ((id%3)-1)*0.16f;
    t.z += ((id%5)-2)*0.22f;

    if(id>=0 && id<4818 && !kkRebuildSeen[id])
    {
      kkRebuildSeen[id]=1;
      kkRebuildTouchedCount++;
      fprintf(stderr,
        "[rebuild] {\\\"stage\\\":\\\"location_transform\\\",\\\"op\\\":%d,\\\"count\\\":%d}\\n",
        id,kkRebuildTouchedCount);
      fflush(stderr);
    }
  }
#endif
  sF32 s_arr[9] = { s.x, s.y, s.z, r.x, r.y, r.z, t.x, t.y, t.z };   // was &s.x spanning 3 by-value params
  ExecSceneInputs(op,kenv,s_arr);
}
"""
    return one(s,old,new,"native scene transform rebuild")

def patch_game(s):
    s=one(s,
      "#if defined(__EMSCRIPTEN__)\n#include <stdio.h>\n",
      "#if defined(__EMSCRIPTEN__)\n#include <stdio.h>\n#include <emscripten/emscripten.h>\n",
      "game emscripten include")
    anchor="""void KKriegerGame::FireShot(KEnvironment *kenv,sInt weapon,KKriegerMonster *monster,const sVector *monsterfiredir)
{
"""
    helper="""#if defined(__EMSCRIPTEN__)
extern KKriegerGame *Game;
static sInt kkRebuildPlayerFireCount = 0;

extern "C" EMSCRIPTEN_KEEPALIVE int kkRebuildStat(int which)
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
  case 4: return Game->WeaponExplode[0][w] ? 1 : 0;
  case 5: return Game->WeaponExplode[1][w] ? 1 : 0;
  case 6: return Game->Shots.Count;
  case 7: return Game->Player.FireKey;
  case 8: return Game->Player.Ammo[0];
  case 9: return Game->Player.Ammo[1];
  case 10:return Game->Player.Ammo[2];
  case 11:return Game->Player.Ammo[3];
  case 12:return kkRebuildPlayerFireCount;
  case 13:return Game->Switches[KGS_GAME];
  case 14:return Game->Player.Weapon[0];
  default:return -1;
  }
}

extern "C" EMSCRIPTEN_KEEPALIVE void kkRebuildDirectLook(int dx,int dy)
{
  if(!Game) return;
  sF32 f = Game->MouseTurnSpeed*(Game->Switches[KGS_MOUSESPEED]+2)/7;
  Game->PlayerDir += dx*f;
  f = Game->MouseLookSpeed*(Game->Switches[KGS_MOUSESPEED]+2)/7*
      (-Game->Switches[KGS_MOUSEINVERT]*2+1);
  Game->PlayerLook += dy*f;
  Game->PlayerLook = sRange<sF32>(Game->PlayerLook,sPIF/2,-sPIF/2);
  Game->PlayerMat.InitEuler(Game->FlyMode?Game->PlayerLook:0,Game->PlayerDir,0);
}
#endif

"""
    s=one(s,anchor,helper+anchor,"rebuild game telemetry")
    needle="""  info = &ShotInfoTable[weapon];
  if(info->Mode==0) return;

  shot = Shots.Add();
"""
    repl="""  info = &ShotInfoTable[weapon];
  if(info->Mode==0) return;

#if defined(__EMSCRIPTEN__)
  if(!monster)
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
    return one(s,needle,repl,"rebuild fire counter")

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
    # Rebrand the proven portrait shell, then add rebuild controls.
    s=s.replace("proofBadge","rebuildBadge")
    s=s.replace("proofStart","rebuildStart")
    s=s.replace("PORTRAIT PROOF · waiting","KRIEGER REBUILD LAB · waiting")
    s=s.replace("START PORTRAIT PROOF","START REBUILD LAB")
    s=s.replace("Real C++/WASM Krieger · portrait master viewport proof",
                "Real Krieger KOp graph · ORIGINAL / REBUILT native location")
    s=s.replace("'PORTRAIT PROOF\\nengine '","'KRIEGER REBUILD LAB\\nengine '")

    extra_css="""
  #rebuildSwitch{display:none;position:fixed;left:50%;transform:translateX(-50%);top:max(10px,env(safe-area-inset-top));z-index:12;
    gap:6px;padding:5px;background:rgba(0,0,0,.50);border:1px solid rgba(255,255,255,.3);border-radius:10px}
  #rebuildSwitch button,#rebuildFire{border:1px solid rgba(255,255,255,.5);background:rgba(10,10,10,.72);color:#fff;
    font:700 11px/1 monospace;min-height:42px;padding:0 12px;touch-action:none}
  #rebuildSwitch button.active{background:#ddd;color:#111}
  #rebuildTouch{display:none;position:fixed;inset:0;z-index:7;pointer-events:none}
  #rebuildLook{position:absolute;inset:0;z-index:1;pointer-events:auto;touch-action:none}
  #rebuildJoy{position:absolute;z-index:2;left:max(18px,env(safe-area-inset-left));bottom:max(26px,env(safe-area-inset-bottom));
    width:112px;height:112px;border:1px solid rgba(255,255,255,.38);border-radius:50%;background:rgba(0,0,0,.22);
    pointer-events:auto;touch-action:none}
  #rebuildKnob{position:absolute;left:37px;top:37px;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.46)}
  #rebuildFire{position:absolute;z-index:3;right:max(18px,env(safe-area-inset-right));bottom:max(30px,env(safe-area-inset-bottom));
    min-width:84px;pointer-events:auto}
  .kk-running #rebuildSwitch{display:flex}
  .kk-running #rebuildTouch{display:block}
  @media (pointer:fine){#rebuildJoy{display:none}}
"""
    s=one(s,"</style>",extra_css+"</style>","rebuild CSS")

    badge='<div id="rebuildBadge">KRIEGER REBUILD LAB · waiting</div>'
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
      "window.__kkPortraitProof = {events:[]};\n  window.__kkRebuild={mode:0,targetOps:86,fireCount:0};"
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
    try { return Module.ccall(name,ret||null,types||[],args||[]); }
    catch(e){ console.error(e); return null; }
  }
  function rebuildMode(mode){
    window.__kkRebuild.mode=mode?1:0;
    rebuildCall('kkRebuildSetMode',[window.__kkRebuild.mode],['number']);
    document.getElementById('rebuildOriginal').classList.toggle('active',!window.__kkRebuild.mode);
    document.getElementById('rebuildModified').classList.toggle('active',!!window.__kkRebuild.mode);
    var b=document.getElementById('rebuildBadge');
    if(b) b.dataset.mode=window.__kkRebuild.mode?'REBUILT':'ORIGINAL';
  }
  document.getElementById('rebuildOriginal').addEventListener('pointerdown',function(e){e.preventDefault();rebuildMode(0);});
  document.getElementById('rebuildModified').addEventListener('pointerdown',function(e){e.preventDefault();rebuildMode(1);});

  var fire=document.getElementById('rebuildFire');
  fire.addEventListener('pointerdown',function(e){e.preventDefault();rebuildCall('kkRebuildFire',[1],['number']);});
  ['pointerup','pointercancel','pointerleave'].forEach(function(ev){
    fire.addEventListener(ev,function(){rebuildCall('kkRebuildFire',[0],['number']);});
  });

  var joy=document.getElementById('rebuildJoy'), knob=document.getElementById('rebuildKnob');
  var held={w:0,a:0,s:0,d:0};
  function setKey(k,on){
    on=on?1:0;
    if(held[k]===on)return;
    held[k]=on;
    rebuildCall('kkRebuildKey',[k.charCodeAt(0),on],['number','number']);
  }
  function joyReset(){['w','a','s','d'].forEach(function(k){setKey(k,0)});knob.style.transform='translate(0,0)';}
  joy.addEventListener('pointerdown',function(e){e.preventDefault();joy.setPointerCapture(e.pointerId);});
  joy.addEventListener('pointermove',function(e){
    if(!joy.hasPointerCapture(e.pointerId))return;
    var r=joy.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
    var max=36,len=Math.hypot(dx,dy)||1,sc=Math.min(1,max/len);dx*=sc;dy*=sc;
    knob.style.transform='translate('+dx+'px,'+dy+'px)';
    setKey('a',dx<-14);setKey('d',dx>14);setKey('w',dy<-14);setKey('s',dy>14);
  });
  joy.addEventListener('pointerup',joyReset);joy.addEventListener('pointercancel',joyReset);

  var look=document.getElementById('rebuildLook'),lp=-1,lx=0,ly=0;
  look.addEventListener('pointerdown',function(e){
    if(e.target!==look)return;
    lp=e.pointerId;lx=e.clientX;ly=e.clientY;look.setPointerCapture(lp);
  });
  look.addEventListener('pointermove',function(e){
    if(e.pointerId!==lp)return;
    var dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;
    rebuildCall('kkRebuildDirectLook',[Math.round(dx*2.0),Math.round(dy*2.0)],['number','number']);
  });
  ['pointerup','pointercancel'].forEach(function(ev){look.addEventListener(ev,function(e){if(e.pointerId===lp)lp=-1;});});
"""
    s=one(s,marker,controls,"rebuild controls JS")

    # Extend the badge with the selected mode while preserving viewport telemetry.
    old="""        b.textContent='KRIEGER REBUILD LAB\\nengine '+m.config[0]+'×'+m.config[1]+
          '\\nmaster '+(m.master[2]-m.master[0])+'×'+(m.master[3]-m.master[1])+
          '\\naspect '+m.aspect.toFixed(4);
"""
    new="""        var mode=window.__kkRebuild&&window.__kkRebuild.mode?'REBUILT':'ORIGINAL';
        b.textContent='KRIEGER REBUILD LAB · '+mode+
          '\\nKOp 219 · 86 native location transforms'+
          '\\nengine '+m.config[0]+'×'+m.config[1]+
          '\\nmaster '+(m.master[2]-m.master[0])+'×'+(m.master[3]-m.master[1])+
          '\\naspect '+m.aspect.toFixed(4);
"""
    return one(s,old,new,"rebuild badge text")

rw("genscene.cpp",patch_scene)
rw("kkriegergame.cpp",patch_game)
rw("wasm/_start_wasm.cpp",patch_wasm)
rw("wasm/shell.html",patch_shell)
print("Krieger Rebuild Lab patch: PASS")
