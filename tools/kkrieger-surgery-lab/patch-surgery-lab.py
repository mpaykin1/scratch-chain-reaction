#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-surgery-lab.py <werkkzeug3_kkrieger-root>")

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
// Surgery Lab deliberately edits one native optics Scene_Transform at runtime.
// Op 219 belongs to the weapon-0 optics graph rooted at KOp 224.
// The entire original material/bitmap/mesh dependency graph remains intact.
static sInt kkSurgeryMode = 0;
static sInt kkSurgeryLoggedMode = -1;

extern "C" EMSCRIPTEN_KEEPALIVE void kkSurgerySetMode(int mode)
{
  kkSurgeryMode = mode ? 1 : 0;
}

extern "C" EMSCRIPTEN_KEEPALIVE int kkSurgeryGetMode()
{
  return kkSurgeryMode;
}
#endif
""",
      "surgery scene state")
    old="""void __stdcall Exec_Scene_Transform(KOp *op,KEnvironment *kenv,sF323 s,sF323 r,sF323 t)
{
  sF32 s_arr[9] = { s.x, s.y, s.z, r.x, r.y, r.z, t.x, t.y, t.z };   // was &s.x spanning 3 by-value params
  ExecSceneInputs(op,kenv,s_arr);
}
"""
    new="""void __stdcall Exec_Scene_Transform(KOp *op,KEnvironment *kenv,sF323 s,sF323 r,sF323 t)
{
#if defined(__EMSCRIPTEN__)
  // Native optics surgery: alter only the top transform of the real weapon-0
  // operator recipe. We are not drawing a replacement mesh and we do not
  // clear the renderer queues. All original MatLink/bitmap/normal/shadow
  // dependencies under this KOp continue through the normal Krieger pipeline.
  if(op && op->OpId==219)
  {
    if(kkSurgeryMode)
    {
      s.x *= 1.22f;
      s.y *= 1.10f;
      s.z *= 1.35f;
      r.z += 0.045f;
      t.x += 0.105f;
      t.y += 0.020f;
    }
    if(kkSurgeryLoggedMode!=kkSurgeryMode)
    {
      fprintf(stderr,
        "[surgery] {\\\"stage\\\":\\\"native_transform\\\",\\\"op\\\":219,\\\"mode\\\":%d,\\\"scale\\\":[%.3f,%.3f,%.3f],\\\"translate\\\":[%.3f,%.3f,%.3f]}\\n",
        kkSurgeryMode,s.x,s.y,s.z,t.x,t.y,t.z);
      fflush(stderr);
      kkSurgeryLoggedMode=kkSurgeryMode;
    }
  }
#endif
  sF32 s_arr[9] = { s.x, s.y, s.z, r.x, r.y, r.z, t.x, t.y, t.z };   // was &s.x spanning 3 by-value params
  ExecSceneInputs(op,kenv,s_arr);
}
"""
    return one(s,old,new,"native scene transform surgery")

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
static sInt kkSurgeryPlayerFireCount = 0;

extern "C" EMSCRIPTEN_KEEPALIVE int kkSurgeryStat(int which)
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
  case 12:return kkSurgeryPlayerFireCount;
  default:return -1;
  }
}

extern "C" EMSCRIPTEN_KEEPALIVE void kkSurgeryDirectLook(int dx,int dy)
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
    s=one(s,anchor,helper+anchor,"surgery game telemetry")
    needle="""  info = &ShotInfoTable[weapon];
  if(info->Mode==0) return;

  shot = Shots.Add();
"""
    repl="""  info = &ShotInfoTable[weapon];
  if(info->Mode==0) return;

#if defined(__EMSCRIPTEN__)
  if(!monster)
  {
    kkSurgeryPlayerFireCount++;
    fprintf(stderr,
      "[surgery] {\\\"stage\\\":\\\"player_fire\\\",\\\"count\\\":%d,\\\"weapon\\\":%d,\\\"shotOp\\\":%d}\\n",
      kkSurgeryPlayerFireCount,weapon,WeaponShot[weapon]?WeaponShot[weapon]->OpId:-1);
    fflush(stderr);
  }
#endif

  shot = Shots.Add();
"""
    s=one(s,needle,repl,"surgery fire counter")
    old_reset="""  SetPainter(root,env);
  Restart();
  if(firsttime)
    Switches[KGS_GAME] = KGS_GAME_INTRO;
"""
    new_reset="""  SetPainter(root,env);
  Restart();
#if defined(__EMSCRIPTEN__)
  if(firsttime && kkJsFlag("__kkSurgeryLab"))
    Switches[KGS_GAME] = KGS_GAME_RUN;
  else
#endif
  if(firsttime)
    Switches[KGS_GAME] = KGS_GAME_INTRO;
"""
    return one(s,old_reset,new_reset,"surgery enter native game root")

def patch_wasm(s):
    old="static sInt gMouseDX, gMouseDY;\n"
    new="""static sInt gMouseDX, gMouseDY;

extern "C" EMSCRIPTEN_KEEPALIVE void kkSurgeryKey(int code,int down)
{
  sU32 key=(sU32)code;
  if(sSystem->KeyIndex<MAX_KEYBUFFER)
    sSystem->KeyBuffer[sSystem->KeyIndex++]=key | (down ? 0 : sKEYQ_BREAK);
}

extern "C" EMSCRIPTEN_KEEPALIVE void kkSurgeryFire(int down)
{
  if(down) sSystem->MouseButtons |= 1;
  else     sSystem->MouseButtons &= ~1U;
  if(sSystem->KeyIndex<MAX_KEYBUFFER)
    sSystem->KeyBuffer[sSystem->KeyIndex++]=sKEY_MOUSEL | (down ? 0 : sKEYQ_BREAK);
}

"""
    return one(s,old,new,"surgery mobile input bridge")

def patch_shell(s):
    # Rebrand the proven portrait shell, then add surgery controls.
    s=s.replace("proofBadge","surgeryBadge")
    s=s.replace("proofStart","surgeryStart")
    s=s.replace("PORTRAIT PROOF · waiting","KRIEGER SURGERY LAB · waiting")
    s=s.replace("START PORTRAIT PROOF","START SURGERY LAB")
    s=s.replace("Real C++/WASM Krieger · portrait master viewport proof",
                "Real Krieger KOp graph · ORIGINAL / MODIFIED native optics")
    s=s.replace("'PORTRAIT PROOF\\nengine '","'KRIEGER SURGERY LAB\\nengine '")

    extra_css="""
  #surgerySwitch{display:none;position:fixed;left:50%;transform:translateX(-50%);top:max(10px,env(safe-area-inset-top));z-index:12;
    gap:6px;padding:5px;background:rgba(0,0,0,.50);border:1px solid rgba(255,255,255,.3);border-radius:10px}
  #surgerySwitch button,#surgeryFire{border:1px solid rgba(255,255,255,.5);background:rgba(10,10,10,.72);color:#fff;
    font:700 11px/1 monospace;min-height:42px;padding:0 12px;touch-action:none}
  #surgerySwitch button.active{background:#ddd;color:#111}
  #surgeryTouch{display:none;position:fixed;inset:0;z-index:7;pointer-events:none}
  #surgeryLook{position:absolute;inset:0;z-index:1;pointer-events:auto;touch-action:none}
  #surgeryJoy{position:absolute;z-index:2;left:max(18px,env(safe-area-inset-left));bottom:max(26px,env(safe-area-inset-bottom));
    width:112px;height:112px;border:1px solid rgba(255,255,255,.38);border-radius:50%;background:rgba(0,0,0,.22);
    pointer-events:auto;touch-action:none}
  #surgeryKnob{position:absolute;left:37px;top:37px;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.46)}
  #surgeryFire{position:absolute;z-index:3;right:max(18px,env(safe-area-inset-right));bottom:max(30px,env(safe-area-inset-bottom));
    min-width:84px;pointer-events:auto}
  .kk-running #surgerySwitch{display:flex}
  .kk-running #surgeryTouch{display:block}
  @media (pointer:fine){#surgeryJoy{display:none}}
"""
    s=one(s,"</style>",extra_css+"</style>","surgery CSS")

    badge='<div id="surgeryBadge">KRIEGER SURGERY LAB · waiting</div>'
    ui=badge+"""
<div id="surgerySwitch">
  <button id="surgeryOriginal" class="active">ORIGINAL</button>
  <button id="surgeryModified">MODIFIED</button>
</div>
<div id="surgeryTouch">
  <div id="surgeryLook"></div>
  <div id="surgeryJoy"><div id="surgeryKnob"></div></div>
  <button id="surgeryFire">FIRE</button>
</div>"""
    s=one(s,badge,ui,"surgery UI")

    s=s.replace(
      "window.__kkPortraitProof = {events:[]};",
      "window.__kkPortraitProof = {events:[]};\n  window.__kkSurgeryLab=1;\n  window.__kkSurgery={mode:0,targetOp:219,fireCount:0};"
    )
    s=s.replace(
      "        startEl.remove();\n        statusEl=null;",
      "        document.body.classList.add('kk-running');\n        startEl.remove();\n        statusEl=null;"
    )

    marker="""  document.getElementById('surgeryStart').addEventListener('click',function(e){
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
  function surgeryCall(name,args,types,ret){
    try { return Module.ccall(name,ret||null,types||[],args||[]); }
    catch(e){ console.error(e); return null; }
  }
  function surgeryMode(mode){
    window.__kkSurgery.mode=mode?1:0;
    surgeryCall('kkSurgerySetMode',[window.__kkSurgery.mode],['number']);
    document.getElementById('surgeryOriginal').classList.toggle('active',!window.__kkSurgery.mode);
    document.getElementById('surgeryModified').classList.toggle('active',!!window.__kkSurgery.mode);
    var b=document.getElementById('surgeryBadge');
    if(b) b.dataset.mode=window.__kkSurgery.mode?'MODIFIED':'ORIGINAL';
  }
  document.getElementById('surgeryOriginal').addEventListener('pointerdown',function(e){e.preventDefault();surgeryMode(0);});
  document.getElementById('surgeryModified').addEventListener('pointerdown',function(e){e.preventDefault();surgeryMode(1);});

  var fire=document.getElementById('surgeryFire');
  fire.addEventListener('pointerdown',function(e){e.preventDefault();surgeryCall('kkSurgeryFire',[1],['number']);});
  ['pointerup','pointercancel','pointerleave'].forEach(function(ev){
    fire.addEventListener(ev,function(){surgeryCall('kkSurgeryFire',[0],['number']);});
  });

  var joy=document.getElementById('surgeryJoy'), knob=document.getElementById('surgeryKnob');
  var held={w:0,a:0,s:0,d:0};
  function setKey(k,on){
    on=on?1:0;
    if(held[k]===on)return;
    held[k]=on;
    surgeryCall('kkSurgeryKey',[k.charCodeAt(0),on],['number','number']);
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

  var look=document.getElementById('surgeryLook'),lp=-1,lx=0,ly=0;
  look.addEventListener('pointerdown',function(e){
    if(e.target!==look)return;
    lp=e.pointerId;lx=e.clientX;ly=e.clientY;look.setPointerCapture(lp);
  });
  look.addEventListener('pointermove',function(e){
    if(e.pointerId!==lp)return;
    var dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;
    surgeryCall('kkSurgeryDirectLook',[Math.round(dx*2.0),Math.round(dy*2.0)],['number','number']);
  });
  ['pointerup','pointercancel'].forEach(function(ev){look.addEventListener(ev,function(e){if(e.pointerId===lp)lp=-1;});});
"""
    s=one(s,marker,controls,"surgery controls JS")

    # Extend the badge with the selected mode while preserving viewport telemetry.
    old="""        b.textContent='KRIEGER SURGERY LAB\\nengine '+m.config[0]+'×'+m.config[1]+
          '\\nmaster '+(m.master[2]-m.master[0])+'×'+(m.master[3]-m.master[1])+
          '\\naspect '+m.aspect.toFixed(4);
"""
    new="""        var mode=window.__kkSurgery&&window.__kkSurgery.mode?'MODIFIED':'ORIGINAL';
        b.textContent='KRIEGER SURGERY LAB · '+mode+
          '\\nKOp 219 · native weapon-0 optics'+
          '\\nengine '+m.config[0]+'×'+m.config[1]+
          '\\nmaster '+(m.master[2]-m.master[0])+'×'+(m.master[3]-m.master[1])+
          '\\naspect '+m.aspect.toFixed(4);
"""
    return one(s,old,new,"surgery badge text")

rw("genscene.cpp",patch_scene)
rw("kkriegergame.cpp",patch_game)
rw("wasm/_start_wasm.cpp",patch_wasm)
rw("wasm/shell.html",patch_shell)
print("Krieger Surgery Lab patch: PASS")
