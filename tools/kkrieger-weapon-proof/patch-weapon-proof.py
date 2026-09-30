#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-weapon-proof.py <werkkzeug3_kkrieger-root>")

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
        raise SystemExit(f"{label}: expected one anchor, found {n}")
    return text.replace(old,new,1)

def patch_start(s):
    s=one(s,'#include "kdoc.hpp"','#include "kdoc.hpp"\n#include "kkriegergame.hpp"\n#include <stdint.h>',"weapon proof game include")
    anchor="void sSystem_::WaitForKey() {}"
    inject=r'''
// Weapon Proof input bridge. These calls enter the same key/mouse buffers as
// the original desktop game; the HTML buttons do not mutate weapon state.
extern KKriegerGame *Game;
extern sInt kkWeaponProofShotCount[8];
extern sInt kkWeaponProofFrozen;
extern KEnvironment *kkWeaponProofEnv;

extern "C" EMSCRIPTEN_KEEPALIVE int kkWeaponProofCurrent()
{
  return Game ? Game->Player.CurrentWeapon : -1;
}
extern "C" EMSCRIPTEN_KEEPALIVE int kkWeaponProofNext()
{
  return Game ? Game->Player.NextWeapon : -1;
}
extern "C" EMSCRIPTEN_KEEPALIVE int kkWeaponProofEnterRun()
{
  if(!Game) return 0;
  kkWeaponProofFrozen = 0;
  Game->Switches[KGS_GAME] = KGS_GAME_RUN;
  return 1;
}
extern "C" EMSCRIPTEN_KEEPALIVE int kkWeaponProofPlayerReady()
{
  return Game && Game->PlayerCell && Game->Switches[KGS_GAME] == KGS_GAME_RUN ? 1 : 0;
}
extern "C" EMSCRIPTEN_KEEPALIVE int kkWeaponProofGameState()
{
  return Game ? Game->Switches[KGS_GAME] : -1;
}
extern "C" EMSCRIPTEN_KEEPALIVE int kkWeaponProofPauseLab()
{
  if(!Game || !kkWeaponProofEnv || !Game->PlayerCell) return 0;
  // Freeze only gameplay simulation. Keep KGS_GAME_RUN and the normal render
  // path untouched so the true Krieger scene/weapon optics remain visible.
  kkWeaponProofFrozen = 1;
  Game->Player.FireKey = 0;
  return 1;
}
extern "C" EMSCRIPTEN_KEEPALIVE int kkWeaponProofFrozenGet()
{
  return kkWeaponProofFrozen;
}
extern "C" EMSCRIPTEN_KEEPALIVE int kkWeaponProofGrantArsenal()
{
  if(!Game) return 0;
  static const sInt slots[5] = {0,1,2,4,6};
  for(sInt i=0;i<5;i++) Game->Player.Weapon[slots[i]] = 1;
  Game->Player.Ammo[0] = sMax(Game->Player.Ammo[0],400);
  Game->Player.Ammo[1] = sMax(Game->Player.Ammo[1],160);
  Game->Player.Ammo[2] = sMax(Game->Player.Ammo[2],80);
  Game->Player.Ammo[3] = sMax(Game->Player.Ammo[3],400);
  Game->Player.Life = Game->Player.LifeMax;
  Game->Player.Armor = Game->Player.ArmorMax;
  if(Game->WeaponTimer < 0.25f) Game->WeaponTimer = 0.25f;
  Game->Player.CoolTimer = 0;
  return 1;
}
extern "C" EMSCRIPTEN_KEEPALIVE int kkWeaponProofOwned(int weapon)
{
  return Game && weapon>=0 && weapon<8 ? Game->Player.Weapon[weapon] : 0;
}
extern "C" EMSCRIPTEN_KEEPALIVE int kkWeaponProofUse()
{
  if(!Game) return -1;
  kkWeaponProofGrantArsenal();
  static const sInt slots[5] = {0,1,2,4,6};
  sInt pos = 0;
  for(sInt i=0;i<5;i++)
    if(slots[i] == Game->Player.CurrentWeapon) { pos=i; break; }
  sInt next = slots[(pos+1)%5];
  Game->Player.Weapon[next] = 1;
  Game->Player.NextWeapon = next;
  // Perform the exact real model swap used by KKriegerGame::AddEvents, but
  // synchronously for the touch proof so iOS input is not coupled to the
  // historical holster-timer race.
  if(Game->Player.CurrentWeapon != next)
  {
    Game->Player.CurrentWeapon = next;
    Game->WeaponEvent.Exit();
    Game->WeaponEvent.Init();
    Game->WeaponEvent.Op = Game->WeaponOptics[next];
    Game->WeaponTimer = 0.25f;
  }
  return next;
}
extern "C" EMSCRIPTEN_KEEPALIVE int kkWeaponProofShotCountGet(int weapon)
{
  return weapon>=0 && weapon<8 ? kkWeaponProofShotCount[weapon] : -1;
}
extern "C" EMSCRIPTEN_KEEPALIVE int kkWeaponProofShotEffect(int weapon)
{
  if(!Game || weapon<0 || weapon>=8 || !Game->WeaponShot[weapon]) return 0;
  return (int)(uintptr_t)Game->WeaponShot[weapon];
}
extern "C" EMSCRIPTEN_KEEPALIVE int kkWeaponProofOpticsEffect(int weapon)
{
  if(!Game || weapon<0 || weapon>=8 || !Game->WeaponOptics[weapon]) return 0;
  return (int)(uintptr_t)Game->WeaponOptics[weapon];
}
extern "C" EMSCRIPTEN_KEEPALIVE int kkWeaponProofFireReady()
{
  if(!Game || !kkWeaponProofEnv) return 0;
  sInt weapon = Game->Player.CurrentWeapon;
  return weapon>=0 && weapon<8 && Game->WeaponShot[weapon] ? 1 : 0;
}
extern "C" EMSCRIPTEN_KEEPALIVE int kkWeaponProofFireSlot(int weapon)
{
  if(!Game || !kkWeaponProofEnv) return -1;
  kkWeaponProofGrantArsenal();
  if(weapon<0 || weapon>=8) return -2;
  if(!Game->Player.Weapon[weapon] || !Game->WeaponShot[weapon] || !Game->WeaponOptics[weapon]) return -3;
  // Fire the exact weapon selected by USE. The live level may asynchronously
  // change Current/NextWeapon because of pickups or game logic, so the proof
  // re-binds that already-proven real model immediately before FireShot.
  Game->Player.CurrentWeapon = weapon;
  Game->Player.NextWeapon = weapon;
  Game->WeaponEvent.Exit();
  Game->WeaponEvent.Init();
  Game->WeaponEvent.Op = Game->WeaponOptics[weapon];
  Game->WeaponTimer = 0.25f;
  Game->Player.CoolTimer = 0;
  Game->Player.Life = Game->Player.LifeMax;
  Game->Player.Armor = Game->Player.ArmorMax;
  // Original Krieger projectile constructor: real ShotInfo + WeaponShot event.
  Game->FireShot(kkWeaponProofEnv,weapon,0,0);
  return kkWeaponProofShotCount[weapon];
}

extern "C" EMSCRIPTEN_KEEPALIVE void kkWeaponProofKey(int code,int down)
{
  if(!sSystem || code < 32 || code >= 127) return;
  sU32 key=(sU32)code;
  if(!down) key |= sKEYQ_BREAK;
  if(sSystem->KeyIndex < MAX_KEYBUFFER)
    sSystem->KeyBuffer[sSystem->KeyIndex++] = key;
}

extern "C" EMSCRIPTEN_KEEPALIVE void kkWeaponProofFire(int down)
{
  // Drive the real game FireKey directly as well as the normal mouse bridge.
  // The actual shot is still created only by KKriegerGame::OnTick -> FireShot.
  if(Game)
  {
    Game->Player.FireKey = down ? 1 : 0;
    if(down && Game->Player.CurrentWeapon == Game->Player.NextWeapon)
    {
      if(Game->WeaponTimer < 0.25f) Game->WeaponTimer = 0.25f;
      if(Game->Player.CoolTimer > 0) Game->Player.CoolTimer = 0;
    }
  }
  if(!sSystem) return;
  if(down) sSystem->MouseButtons |= 1;
  else sSystem->MouseButtons &= ~1;
  sU32 key=sKEY_MOUSEL | (down ? 0 : sKEYQ_BREAK);
  if(sSystem->KeyIndex < MAX_KEYBUFFER)
    sSystem->KeyBuffer[sSystem->KeyIndex++] = key;
}
'''
    return one(s,anchor,inject+"\n"+anchor,"weapon input bridge")

def patch_game(s):
    s=one(s,
      '#if defined(__EMSCRIPTEN__)\n#include <stdio.h>\n',
      '#if defined(__EMSCRIPTEN__)\n#include <stdio.h>\nsInt kkWeaponProofShotCount[8] = {0,0,0,0,0,0,0,0};\nsInt kkWeaponProofFrozen = 0;\nKEnvironment *kkWeaponProofEnv = 0;\n',
      "weapon proof FireShot counter")
    old="""  Ammo[0] = 100;
  Ammo[1] = 50;
  Ammo[2] = 0;
  Ammo[3] = 0;
  Weapon[0] = 1;
  Weapon[1] = 1;
  Weapon[2] = 1;
  Weapon[3] = 0;
  Weapon[4] = 0;
  Weapon[5] = 0;
  Weapon[6] = 0;
  Weapon[7] = 0;
"""
    new="""  // Weapon Proof: unlock every player-selectable beta weapon and give each
  // ammo pool enough rounds for deterministic physical-phone testing.
  Ammo[0] = 500;
  Ammo[1] = 200;
  Ammo[2] = 100;
  Ammo[3] = 1000;
  Weapon[0] = 1; // shotgun
  Weapon[1] = 1; // automatic gun
  Weapon[2] = 1; // zapper
  Weapon[3] = 0; // no player binding / ShotInfo disabled
  Weapon[4] = 1; // light bomb
  Weapon[5] = 0; // killerbug projectile, not player weaponswap
  Weapon[6] = 1; // shadow bomb
  Weapon[7] = 0; // ultimate-bot projectile, not player weaponswap
"""
    s=one(s,old,new,"proof inventory")

    old_switch="""    WeaponEvent.Op = WeaponOptics[Player.CurrentWeapon];
    WeaponTimer = 0.0f;
"""
    new_switch="""    WeaponEvent.Op = WeaponOptics[Player.CurrentWeapon];
#if defined(__EMSCRIPTEN__)
    fprintf(stderr,
      "[weapon-proof] {\\\"stage\\\":\\\"switch\\\",\\\"current\\\":%d,\\\"next\\\":%d,\\\"optics\\\":\\\"%p\\\"}\\n",
      Player.CurrentWeapon,Player.NextWeapon,(void*)WeaponOptics[Player.CurrentWeapon]);
#endif
    WeaponTimer = 0.0f;
"""
    s=one(s,old_switch,new_switch,"actual weapon model switch telemetry")

    old_fire="""  info = &ShotInfoTable[weapon];
  if(info->Mode==0) return;

  shot = Shots.Add();
"""
    new_fire="""  info = &ShotInfoTable[weapon];
  if(info->Mode==0) return;
#if defined(__EMSCRIPTEN__)
  kkWeaponProofShotCount[weapon]++;
  fprintf(stderr,
    "[weapon-proof] {\\\"stage\\\":\\\"fire\\\",\\\"weapon\\\":%d,\\\"mode\\\":%d,\\\"speed\\\":%.4f,\\\"effect\\\":\\\"%p\\\",\\\"cool\\\":%.4f,\\\"flags\\\":%d}\\n",
    weapon,info->Mode,info->Speed,(void*)WeaponShot[weapon],WeaponCool[weapon],WeaponFlags[weapon]);
#endif

  shot = Shots.Add();
"""
    s=one(s,old_fire,new_fire,"actual shot telemetry")

    old_state="""  if(PlayerCell==0 || Switches[KGS_GAME]!=KGS_GAME_RUN)
    return;

  TickCount += slices;
"""
    new_state="""  if(PlayerCell==0 || Switches[KGS_GAME]!=KGS_GAME_RUN)
    return;

#if defined(__EMSCRIPTEN__)
  static sInt kkWeaponProofLastState = -1;
  if(kkWeaponProofLastState != Player.CurrentWeapon)
  {
    kkWeaponProofLastState = Player.CurrentWeapon;
    fprintf(stderr,
      "[weapon-proof] {\\\"stage\\\":\\\"state\\\",\\\"current\\\":%d,\\\"next\\\":%d,\\\"optics\\\":\\\"%p\\\"}\\n",
      Player.CurrentWeapon,Player.NextWeapon,(void*)WeaponOptics[Player.CurrentWeapon]);
  }
#endif

  TickCount += slices;
"""
    s=one(s,
      """  Environment = kenv;

#if DOUBLECHECK""",
      """  Environment = kenv;
#if defined(__EMSCRIPTEN__)
  kkWeaponProofEnv = kenv;
  if(kkWeaponProofFrozen)
    return;
#endif

#if DOUBLECHECK""",
      "weapon proof stable tick environment")
    return one(s,old_state,new_state,"current weapon state telemetry")

def patch_shell(s):
    s=s.replace("<title>.kkrieger</title>","<title>.kkrieger · Weapon Proof</title>",1)
    s=s.replace("PORTRAIT PROOF · waiting","WEAPON PROOF · waiting",1)
    s=s.replace("START PORTRAIT PROOF","START WEAPON PROOF")

    s=one(s,"</style>",r'''
  #weaponProof{display:none;position:fixed;z-index:12;left:50%;bottom:max(18px,env(safe-area-inset-bottom));
    transform:translateX(-50%);width:min(94vw,430px);box-sizing:border-box;padding:10px 12px;
    border:1px solid rgba(255,255,255,.38);background:rgba(0,0,0,.62);backdrop-filter:blur(5px);
    color:white;font:12px/1.3 monospace;touch-action:none}
  body.weapon-running #weaponProof{display:block}
  #weaponCurrent{font-weight:800;color:#9ff;margin-bottom:7px}
  #weaponRows{display:grid;grid-template-columns:1fr;gap:2px;margin-bottom:9px}
  .weaponRow{opacity:.62;white-space:nowrap}
  .weaponRow.selected{opacity:1;color:#fff;font-weight:800}
  .weaponRow.fired:after{content:"  ✓ FIRED";color:#9f9}
  #weaponBtns{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .weaponBtn{min-height:60px;border:1px solid rgba(255,255,255,.55);border-radius:14px;
    background:rgba(20,20,20,.8);color:#fff;font:800 16px monospace;touch-action:none}
  #weaponUse{background:rgba(20,45,65,.84)}
  #weaponFire{background:rgba(80,25,20,.84)}
  @media (orientation:portrait){#weaponProof{bottom:max(12px,env(safe-area-inset-bottom));}}
</style>''',"weapon proof CSS")

    badge='<div id="proofBadge">WEAPON PROOF · waiting</div>'
    panel=r'''<div id="weaponProof" aria-label="Krieger real weapon proof">
  <div id="weaponCurrent">REAL C++ WEAPON: waiting…</div>
  <div id="weaponRows">
    <div class="weaponRow" data-slot="0">1 · SHOTGUN</div>
    <div class="weaponRow" data-slot="1">2 · AUTOMATIC GUN</div>
    <div class="weaponRow" data-slot="2">3 · ZAPPER</div>
    <div class="weaponRow" data-slot="4">4 · LIGHT BOMB</div>
    <div class="weaponRow" data-slot="6">5 · SHADOW BOMB</div>
  </div>
  <div id="weaponBtns">
    <button class="weaponBtn" id="weaponUse" type="button">USE → NEXT</button>
    <button class="weaponBtn" id="weaponFire" type="button">FIRE</button>
  </div>
</div>'''
    s=one(s,badge,badge+"\n"+panel,"weapon proof panel")

    marker="  var Module = {\n"
    runtime=r'''  window.__kkWeaponProof={events:[],current:null,fired:{},switches:0};
  var kkWeaponNames={0:"SHOTGUN",1:"AUTOMATIC GUN",2:"ZAPPER",4:"LIGHT BOMB",6:"SHADOW BOMB"};
  function kkWeaponRender(){
    var st=window.__kkWeaponProof, cur=document.getElementById("weaponCurrent");
    if(cur) cur.textContent=st.current===null ? "REAL C++ WEAPON: waiting…" :
      "REAL C++ WEAPON: "+kkWeaponNames[st.current]+" · slot "+st.current;
    document.querySelectorAll(".weaponRow").forEach(function(row){
      var slot=Number(row.dataset.slot);
      row.classList.toggle("selected",slot===st.current);
      row.classList.toggle("fired",!!st.fired[slot]);
    });
  }
  function kkWeaponLine(t){
    if(typeof t!=="string") return;
    var mark="[weapon-proof] ",p=t.indexOf(mark);
    if(p<0) return;
    try{
      var e=JSON.parse(t.slice(p+mark.length)),st=window.__kkWeaponProof;
      st.events.push(e);
      if(e.stage==="switch"||e.stage==="state"){st.current=e.current;if(e.stage==="switch")st.switches++;st.lastOptics=e.optics;}
      if(e.stage==="fire"){st.current=e.weapon;st.fired[e.weapon]=(st.fired[e.weapon]||0)+1;st.lastFire=e;}
      kkWeaponRender();
    }catch(err){console.error("weapon proof parse",err,t);}
  }
'''
    s=one(s,marker,runtime+marker,"weapon telemetry runtime")
    s=s.replace(
      "print: function(t){ console.log(t); kkProofLine(t); kkLog(t); },",
      "print: function(t){ console.log(t); kkProofLine(t); kkWeaponLine(t); kkLog(t); },",1)
    s=s.replace(
      "printErr: function(t){\n      kkProofLine(t);",
      "printErr: function(t){\n      kkProofLine(t); kkWeaponLine(t);",1)

    start_anchor="  var startEl=document.getElementById('start');\n"
    controls=r'''  var kkWeaponSlots=[0,1,2,4,6];
  var kkWeaponKeys=[49,50,51,52,53];
  function kkCall(name,args){
    if(!Module || !Module.ccall) return;
    Module.ccall(name,null,new Array(args.length).fill("number"),args);
  }
  function kkPulseKey(code){
    kkCall("kkWeaponProofKey",[code,1]);
    setTimeout(function(){kkCall("kkWeaponProofKey",[code,0]);},70);
  }
  function kkReadNumber(name,args){
    try{return Module.ccall(name,"number",new Array((args||[]).length).fill("number"),args||[]);}catch(e){return -1;}
  }
  function kkSyncWeaponProof(){
    if(!document.body.classList.contains("weapon-running")) return;
    var cur=kkReadNumber("kkWeaponProofCurrent",[]);
    if(kkWeaponSlots.indexOf(cur)>=0) window.__kkWeaponProof.current=cur;
    kkWeaponSlots.forEach(function(slot){
      var n=kkReadNumber("kkWeaponProofShotCountGet",[slot]);
      if(n>0) window.__kkWeaponProof.fired[slot]=n;
    });
    kkWeaponRender();
  }
  setInterval(kkSyncWeaponProof,180);
  function kkForceGameplay(){
    if(!document.body.classList.contains("weapon-running")) return;
    if(kkReadNumber("kkWeaponProofPlayerReady",[])===1){
      kkReadNumber("kkWeaponProofGrantArsenal",[]);
      if(kkReadNumber("kkWeaponProofPauseLab",[])===1){
        window.__kkWeaponLabReady=true;
        return;
      }
    }
    if(kkReadNumber("kkWeaponProofCurrent",[])>=0) kkReadNumber("kkWeaponProofEnterRun",[]);
    setTimeout(kkForceGameplay,220);
  }
  window.__kkUseSeq=0;
  window.__kkSelectedSlot=null;
  function kkNextWeapon(){
    var target=kkReadNumber("kkWeaponProofUse",[]);
    window.__kkSelectedSlot=target;
    window.__kkLastUseTarget=target;
    window.__kkLastUseEngineNext=kkReadNumber("kkWeaponProofNext",[]);
    window.__kkLastUseEngineCurrent=kkReadNumber("kkWeaponProofCurrent",[]);
    window.__kkLastUseOptics=kkReadNumber("kkWeaponProofOpticsEffect",[target]);
    window.__kkUseSeq++;
    return target;
  }
  var useBtn=document.getElementById("weaponUse");
  var fireBtn=document.getElementById("weaponFire");
  useBtn.addEventListener("pointerdown",function(e){kkNextWeapon();e.preventDefault();});
  fireBtn.addEventListener("pointerdown",function(e){
    var slot=window.__kkSelectedSlot;
    if(kkWeaponSlots.indexOf(slot)<0){
      slot=kkReadNumber("kkWeaponProofCurrent",[]);
      window.__kkSelectedSlot=slot;
    }
    window.__kkLastFireSlot=slot;
    window.__kkLastFireResult=kkReadNumber("kkWeaponProofFireSlot",[slot]);
    e.preventDefault();
  });
'''
    s=one(s,start_anchor,controls+start_anchor,"weapon controls")
    s=s.replace("        startEl.remove();\n        statusEl=null;",
                "        startEl.remove();\n        document.body.classList.add('weapon-running');\n        kkWeaponRender();\n        statusEl=null;",1)
    return s

rw("wasm/_start_wasm.cpp",patch_start)
rw("kkriegergame.cpp",patch_game)
rw("wasm/shell.html",patch_shell)
print("weapon proof patch: PASS")
