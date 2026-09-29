#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-level-lab.py <werkkzeug3_kkrieger-root>")

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
    // Proven portrait policy: full engine surface in portrait, original 2:1
    // composition in landscape.
    if(sSystem->ConfigY > sSystem->ConfigX)
      vp.Window.Init(0,0,sSystem->ConfigX,sSystem->ConfigY);
    else
    {
      sInt bh = sMin(sSystem->ConfigX/2,sSystem->ConfigY);
      sInt bw = 2*bh;
      sInt x0 = (sSystem->ConfigX-bw)/2, y0 = (sSystem->ConfigY-bh)/2;
      vp.Window.Init(x0,y0,x0+bw,y0+bh);
    }
#else
"""
    s=one(s,old,new,"mainplayer portrait master")
    old2="""    //Environment->Aspect =  1.0f*vp.Window.XSize()/vp.Window.YSize();
    Environment->Aspect = 2.0f;
"""
    new2="""#if defined(__EMSCRIPTEN__)
    Environment->Aspect = vp.Window.YSize()
      ? 1.0f*vp.Window.XSize()/vp.Window.YSize()
      : 1.0f;
    if(kkJsFlag("__kkLevelLab"))
      fprintf(stderr,"[level-lab] {\\\"stage\\\":\\\"viewport\\\",\\\"config\\\":[%d,%d],\\\"master\\\":[%d,%d,%d,%d],\\\"aspect\\\":%.8f}\\n",
              sSystem->ConfigX,sSystem->ConfigY,
              vp.Window.x0,vp.Window.y0,vp.Window.x1,vp.Window.y1,
              Environment->Aspect);
#else
    Environment->Aspect = 2.0f;
#endif
"""
    s=one(s,old2,new2,"mainplayer dynamic aspect")
    # mainplayer already includes stdio in wasm build; declare flag helper.
    marker='extern sInt CV2MPlayerNextLength;   // see wasm/v2_shim.cpp\n'
    if 'extern "C" int kkJsFlag' not in s:
        s=one(s,marker,marker+'extern "C" int kkJsFlag(const char *name);\n',"mainplayer kkJsFlag declaration")
    return s

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
    if(kkJsFlag("__kkLevelLab"))
      fprintf(stderr,"[level-lab] {\\\"stage\\\":\\\"full_rt\\\",\\\"requested\\\":[%d,%d],\\\"pow2\\\":[%d,%d]}\\n",
              bw,bh,1<<lx,1<<ly);
  }
"""
    s=one(s,old,new,"level lab full-size RT")
    if 'extern "C" int kkJsFlag' not in s:
        marker='#include <stdio.h>\n'
        s=one(s,marker,marker+'extern "C" int kkJsFlag(const char *name);\n',"genoverlay kkJsFlag declaration")
    return s

def patch_engine_hpp(s):
    old='extern Engine_ *Engine;\n'
    new='''extern Engine_ *Engine;
#if defined(__EMSCRIPTEN__)
void KriegerLevelLabInstallRenderMesh(GenMesh *mesh,const sVector &lightPos);
#endif
'''
    return one(s,old,new,"engine level lab declaration")

def patch_engine(s):
    marker='#include "materials/material11.hpp"\n#endif\n'
    inject='''#include "materials/material11.hpp"

static EngMesh *kkLevelLabMesh = 0;
static sVector kkLevelLabLightPos;

void KriegerLevelLabInstallRenderMesh(GenMesh *mesh,const sVector &lightPos)
{
  sRelease(kkLevelLabMesh);
  kkLevelLabMesh = new EngMesh;
  kkLevelLabMesh->FromGenMesh(mesh);
  kkLevelLabLightPos = lightPos;
  fprintf(stderr,"[level-lab] {\\\"stage\\\":\\\"render_mesh\\\",\\\"vertices\\\":%d,\\\"faces\\\":%d,\\\"collisions\\\":%d}\\n",
          mesh->Vert.Count,mesh->Face.Count,mesh->Coll.Count);
}
#endif
'''
    s=one(s,marker,inject,"engine global lab mesh")

    old='''Engine_::~Engine_()
{
  Matrices.Exit();
'''
    new='''Engine_::~Engine_()
{
#if defined(__EMSCRIPTEN__)
  sRelease(kkLevelLabMesh);
#endif
  Matrices.Exit();
'''
    s=one(s,old,new,"engine lab cleanup")

    old2='''void Engine_::Paint(KEnvironment *kenv,sBool specular)
{
  // Insert weapon light into list of light jobs, if necessary.
'''
    new2='''void Engine_::Paint(KEnvironment *kenv,sBool specular)
{
#if defined(__EMSCRIPTEN__)
  if(kkLevelLabMesh && kkJsFlag("__kkLevelLab"))
  {
    // Isolate the new level from the original authored level while keeping the
    // real Krieger renderer/postprocess pipeline that called us.
    MeshJobs = 0;
    EffectJobs = 0;
    PortalJobs = 0;
    SectorJobs = 0;
    LightJobCount = 0;
    Lights04Count = 0;
    WeaponLightSet = sFALSE;
    AmbientLight = 0;

    sMatrix labMatrix;
    labMatrix.Init();
    AddPaintJob(kkLevelLabMesh,labMatrix,0,0);

    EngLight labLight;
    sSetMem(&labLight,0,sizeof(labLight));
    labLight.Position = kkLevelLabLightPos;
    labLight.Flags = 0;
    labLight.Color = 0xffe1b0;
    labLight.Amplify = 2.25f;
    labLight.Range = 42.0f;
    labLight.Event = 0;
    labLight.Id = 7001;
    AddLightJob(labLight);

    labLight.Position.x += 24.0f;
    labLight.Position.z -= 8.0f;
    labLight.Color = 0x88aaff;
    labLight.Amplify = 1.45f;
    labLight.Range = 34.0f;
    labLight.Id = 7002;
    AddLightJob(labLight);
    AddAmbientLight(0x202028);
  }
#endif

  // Insert weapon light into list of light jobs, if necessary.
'''
    return one(s,old2,new2,"engine lab paint injection")

def patch_game(s):
    # Add helpers before ResetRoot.
    anchor='''void KKriegerGame::ResetRoot(KEnvironment *env,KOp *root,sBool firsttime)
{
'''
    helper=r'''#if defined(__EMSCRIPTEN__)
static const sF32 KKLAB_X = 1000.0f;

static void kkLabAddCube(GenMesh *&dst,sF32 sx,sF32 sy,sF32 sz,sF32 tx,sF32 ty,sF32 tz)
{
  sFSRT srt;
  srt.s.Init(sx,sy,sz);
  srt.r.Init(0,0,0);
  srt.t.Init(tx,ty,tz);
  GenMesh *cube = Mesh_Cube(1,1,1,0,srt);
  if(!dst)
    dst = cube;
  else
  {
    dst->Add(cube);
    cube->Release();
  }
}

static GenMesh *kkLabBuildMesh()
{
  static GenMesh *mesh = 0;
  if(mesh)
    return mesh;

  // Room A: asymmetric walls with a deliberate eastern portal.
  kkLabAddCube(mesh,24.0f,0.50f,24.0f,KKLAB_X,-0.25f,0.0f);
  kkLabAddCube(mesh,24.0f,4.5f,0.50f,KKLAB_X,2.0f,-12.0f);
  kkLabAddCube(mesh,24.0f,4.5f,0.50f,KKLAB_X,2.0f, 12.0f);
  kkLabAddCube(mesh,0.50f,4.5f,24.0f,KKLAB_X-12.0f,2.0f,0.0f);
  kkLabAddCube(mesh,0.50f,4.5f,7.5f,KKLAB_X+12.0f,2.0f,-8.25f);
  kkLabAddCube(mesh,0.50f,4.5f,7.5f,KKLAB_X+12.0f,2.0f, 8.25f);

  // Signature central arch + four pillars.
  kkLabAddCube(mesh,1.2f,5.0f,1.2f,KKLAB_X-5.5f,2.5f,-4.5f);
  kkLabAddCube(mesh,1.2f,5.0f,1.2f,KKLAB_X-5.5f,2.5f, 4.5f);
  kkLabAddCube(mesh,1.2f,5.0f,1.2f,KKLAB_X+5.5f,2.5f,-4.5f);
  kkLabAddCube(mesh,1.2f,5.0f,1.2f,KKLAB_X+5.5f,2.5f, 4.5f);
  kkLabAddCube(mesh,8.0f,1.0f,1.2f,KKLAB_X,5.0f,-4.5f);
  kkLabAddCube(mesh,8.0f,1.0f,1.2f,KKLAB_X,5.0f, 4.5f);
  kkLabAddCube(mesh,5.0f,0.7f,5.0f,KKLAB_X,0.35f,0.0f);
  kkLabAddCube(mesh,1.5f,4.0f,1.5f,KKLAB_X,2.0f,0.0f);

  // Corridor.
  kkLabAddCube(mesh,16.0f,0.50f,8.0f,KKLAB_X+20.0f,-0.25f,0.0f);
  kkLabAddCube(mesh,16.0f,4.0f,0.45f,KKLAB_X+20.0f,2.0f,-4.0f);
  kkLabAddCube(mesh,16.0f,4.0f,0.45f,KKLAB_X+20.0f,2.0f, 4.0f);
  kkLabAddCube(mesh,0.8f,1.0f,8.0f,KKLAB_X+16.0f,4.0f,0.0f);
  kkLabAddCube(mesh,0.8f,1.0f,8.0f,KKLAB_X+24.0f,4.0f,0.0f);

  // Room B: taller chamber and a three-tower signature.
  kkLabAddCube(mesh,18.0f,0.50f,20.0f,KKLAB_X+33.0f,-0.25f,0.0f);
  kkLabAddCube(mesh,18.0f,5.5f,0.50f,KKLAB_X+33.0f,2.5f,-10.0f);
  kkLabAddCube(mesh,18.0f,5.5f,0.50f,KKLAB_X+33.0f,2.5f, 10.0f);
  kkLabAddCube(mesh,0.50f,5.5f,20.0f,KKLAB_X+42.0f,2.5f,0.0f);
  kkLabAddCube(mesh,0.50f,5.5f,6.0f,KKLAB_X+24.0f,2.5f,-7.0f);
  kkLabAddCube(mesh,0.50f,5.5f,6.0f,KKLAB_X+24.0f,2.5f, 7.0f);
  kkLabAddCube(mesh,2.0f,7.0f,2.0f,KKLAB_X+29.0f,3.5f,-4.0f);
  kkLabAddCube(mesh,2.0f,9.0f,2.0f,KKLAB_X+33.0f,4.5f, 0.0f);
  kkLabAddCube(mesh,2.0f,6.0f,2.0f,KKLAB_X+37.0f,3.0f, 4.0f);

  // Three connected walkable ADD cells and two SUB obstacles.
  mesh = Mesh_CollisionCube(mesh,0,0,KKLAB_X-12.0f,KKLAB_X+12.5f,-1.0f,6.0f,-12.5f,12.5f,KCM_ADD,1,1,1);
  mesh = Mesh_CollisionCube(mesh,0,0,KKLAB_X+10.0f,KKLAB_X+27.0f,-1.0f,5.0f,-4.5f,4.5f,KCM_ADD,1,1,1);
  mesh = Mesh_CollisionCube(mesh,0,0,KKLAB_X+23.5f,KKLAB_X+42.5f,-1.0f,7.0f,-10.5f,10.5f,KCM_ADD,1,1,1);
  mesh = Mesh_CollisionCube(mesh,0,0,KKLAB_X-0.9f,KKLAB_X+0.9f,-0.5f,4.4f,-0.9f,0.9f,KCM_SUB,1,1,1);
  mesh = Mesh_CollisionCube(mesh,0,0,KKLAB_X+31.8f,KKLAB_X+34.2f,-0.5f,6.8f,-1.2f,1.2f,KCM_SUB,1,1,1);

  mesh->CalcNormals();
  sVector light;
  light.Init(KKLAB_X+5.0f,6.5f,2.0f,1.0f);
  KriegerLevelLabInstallRenderMesh(mesh,light);

  fprintf(stderr,"[level-lab] {\"stage\":\"built\",\"id\":\"bridge-chamber-v1\",\"visualCubes\":%d,\"collisionCells\":%d,\"origin\":[%.1f,0,0]}\n",
          28,mesh->Coll.Count,KKLAB_X);
  return mesh;
}

static void kkLabInstallCollision(KKriegerGame *game)
{
  GenMesh *mesh = kkLabBuildMesh();
  sMatrix mat;
  mat.Init();

  game->CellList.Init();
  KKriegerMesh *cm = new KKriegerMesh(mesh);
  game->AddMesh(cm,mat,0);
  cm->Release();
  game->CellConnect();
  game->CellList.Exit();

  game->PlayerStartPos.Init(KKLAB_X-5.0f,1.0f,6.0f,1.0f);
  fprintf(stderr,"[level-lab] {\"stage\":\"collision_ready\",\"adds\":%d,\"subs\":%d,\"zones\":%d,\"start\":[%.1f,1.0,6.0]}\n",
          game->CellAdd.Count,game->CellSub.Count,game->CellZone.Count,KKLAB_X-5.0f);
}
#endif

'''
    s=one(s,anchor,helper+anchor,"level lab helpers")
    old='''void KKriegerGame::ResetRoot(KEnvironment *env,KOp *root,sBool firsttime)
{
  SetPainter(root,env);
  Restart();
  if(firsttime)
    Switches[KGS_GAME] = KGS_GAME_INTRO;
}
'''
    new='''void KKriegerGame::ResetRoot(KEnvironment *env,KOp *root,sBool firsttime)
{
  SetPainter(root,env);
#if defined(__EMSCRIPTEN__)
  if(kkJsFlag("__kkLevelLab"))
    kkLabInstallCollision(this);
#endif
  Restart();
#if defined(__EMSCRIPTEN__)
  if(kkJsFlag("__kkLevelLab"))
    Switches[KGS_GAME] = KGS_GAME_RUN;
  else
#endif
  if(firsttime)
    Switches[KGS_GAME] = KGS_GAME_INTRO;
}
'''
    s=one(s,old,new,"level lab ResetRoot")

    old2='''void KKriegerGame::Restart()
{
  sInt i;

  ResetByOp = 1;

  SetPlayer(PlayerStartPos,0,0);
'''
    new2='''void KKriegerGame::Restart()
{
  sInt i;

  ResetByOp = 1;
#if defined(__EMSCRIPTEN__)
  if(kkJsFlag("__kkLevelLab"))
    PlayerStartPos.Init(KKLAB_X-5.0f,1.0f,6.0f,1.0f);
#endif

  SetPlayer(PlayerStartPos,0,0);
'''
    s=one(s,old2,new2,"level lab restart")

    # Live player telemetry after tick simulation.
    telemetry='''#if defined(__EMSCRIPTEN__)
  if(kkJsFlag("__kkLevelLab"))
  {
    static sInt labtick;
    if(labtick++ < 4 || (labtick % 30)==0)
      fprintf(stderr,"[level-lab] {\\\"stage\\\":\\\"player\\\",\\\"pos\\\":[%.5f,%.5f,%.5f],\\\"dir\\\":%.6f,\\\"look\\\":%.6f,\\\"cell\\\":%d}\\n",
              PlayerPos.x,PlayerPos.y,PlayerPos.z,PlayerDir,PlayerLook,PlayerCell?1:0);
  }
#endif

'''
    marker='// diagnostics\n\n#if !sPLAYER'
    if marker not in s:
        raise SystemExit("player telemetry anchor missing")
    s=s.replace(marker,telemetry+marker,1)
    return s

def patch_wasm(s):
    old='''static sInt gMouseDX, gMouseDY;
'''
    new='''static sInt gMouseDX, gMouseDY;

extern "C" EMSCRIPTEN_KEEPALIVE void kkLabKey(int code,int down)
{
  sU32 key = (sU32)code;
  if(sSystem->KeyIndex < MAX_KEYBUFFER)
    sSystem->KeyBuffer[sSystem->KeyIndex++] = key | (down ? 0 : sKEYQ_BREAK);
}

extern "C" EMSCRIPTEN_KEEPALIVE void kkLabLook(int dx,int dy)
{
  gMouseDX += dx;
  gMouseDY += dy;
}

extern "C" EMSCRIPTEN_KEEPALIVE void kkLabFire(int down)
{
  if(down) sSystem->MouseButtons |= 1;
  else     sSystem->MouseButtons &= ~1U;
  if(sSystem->KeyIndex < MAX_KEYBUFFER)
    sSystem->KeyBuffer[sSystem->KeyIndex++] = sKEY_MOUSEL | (down ? 0 : sKEYQ_BREAK);
}
'''
    return one(s,old,new,"level lab mobile bridge")

def patch_shell(s):
    s=one(s,
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">\n'
      '<meta name="apple-mobile-web-app-capable" content="yes">\n'
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
      '<meta name="theme-color" content="#000000">',
      "level lab viewport meta")
    s=s.replace("if(!resWanted) resWanted = '1024x768';","if(!resWanted) resWanted = 'fit';")
    s=s.replace("object-fit:contain","object-fit:fill")
    s=one(s,"</style>","""
  body{overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
  #wrap{position:fixed;inset:0;width:100dvw;height:100dvh}
  canvas{position:absolute;inset:0;width:100dvw!important;height:100dvh!important;max-width:none!important;max-height:none!important;touch-action:none}
  #labBadge{position:fixed;left:max(8px,env(safe-area-inset-left));top:max(8px,env(safe-area-inset-top));z-index:8;
    padding:6px 8px;border:1px solid rgba(255,255,255,.32);background:rgba(0,0,0,.52);color:#9ff;
    font:10px/1.25 monospace;pointer-events:none;white-space:pre}
  #labTouch{display:none;position:fixed;inset:0;z-index:6;pointer-events:none}
  #labLook{position:absolute;inset:0;pointer-events:auto;touch-action:none}
  #labJoy{position:absolute;left:max(18px,env(safe-area-inset-left));bottom:max(28px,env(safe-area-inset-bottom));width:118px;height:118px;
    border:1px solid rgba(255,255,255,.35);border-radius:50%;background:rgba(0,0,0,.22);pointer-events:auto;touch-action:none}
  #labKnob{position:absolute;left:39px;top:39px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.45)}
  #labFire,#labJump{position:absolute;right:max(18px,env(safe-area-inset-right));width:72px;height:52px;pointer-events:auto;
    border:1px solid rgba(255,255,255,.4);background:rgba(0,0,0,.45);color:white;font:700 12px monospace;touch-action:none}
  #labFire{bottom:max(30px,env(safe-area-inset-bottom))}
  #labJump{bottom:calc(max(30px,env(safe-area-inset-bottom)) + 62px)}
  #labStart{min-width:225px;min-height:60px;background:#111;color:#fff;border:1px solid #777;font:700 15px monospace}
  .kk-running #labTouch{display:block}
  @media (pointer:fine){#labTouch{display:none!important}}
</style>""","level lab CSS")
    s=one(s,
      '<button id="fs" title="fullscreen (Esc or the button leaves it)">&#x26F6; fullscreen</button>',
      '<button id="fs" title="fullscreen (Esc or the button leaves it)">&#x26F6; fullscreen</button>\n'
      '<div id="labBadge">KRIEGER LEVEL LAB\nwaiting for engine</div>\n'
      '<div id="labTouch"><div id="labLook"></div><div id="labJoy"><div id="labKnob"></div></div>'
      '<button id="labJump">JUMP</button><button id="labFire">FIRE</button></div>',
      "level lab UI")
    s=one(s,
      '<div id="start"><div>click to start<small>WebGL2 · procedural content is generated on load, please wait</small>',
      '<div id="start"><div><button id="labStart" disabled>LOADING ENGINE…</button><small>New level built with real Krieger procedural geometry + collision + renderer</small>',
      "level lab start")

    old='''  var Module = {
    canvas: document.getElementById('canvas'),
    print: function(t){ console.log(t); kkLog(t); },
    printErr: function(t){
'''
    new='''  window.__kkLevelLab = 1;
  window.__kkLab = {events:[],built:null,collision:null,player:null,viewport:null,fullRT:null};
  function kkLabLine(t){
    if(typeof t!=='string') return;
    var p=t.indexOf('[level-lab] ');
    if(p<0) return;
    try{
      var e=JSON.parse(t.slice(p+12));
      window.__kkLab.events.push(e);
      if(e.stage==='built') window.__kkLab.built=e;
      if(e.stage==='collision_ready') window.__kkLab.collision=e;
      if(e.stage==='player') window.__kkLab.player=e;
      if(e.stage==='viewport') window.__kkLab.viewport=e;
      if(e.stage==='full_rt') window.__kkLab.fullRT=e;
      var b=document.getElementById('labBadge');
      if(b){
        var p0=window.__kkLab.player;
        b.textContent='KRIEGER LEVEL LAB · bridge-chamber-v1'+
          (p0?'\\npos '+p0.pos.map(function(x){return x.toFixed(1)}).join(' / '):'\\nprocedural level loading');
      }
    }catch(e){}
  }
  var Module = {
    canvas: document.getElementById('canvas'),
    print: function(t){ console.log(t); kkLabLine(t); kkLog(t); },
    printErr: function(t){
      kkLabLine(t);
'''
    s=one(s,old,new,"level lab collector")
    s=s.replace(
      "onRuntimeInitialized: function(){ if(statusEl) statusEl.textContent = 'ready'; },",
      "onRuntimeInitialized: function(){ window.__kkRuntimeReady=true; if(statusEl) statusEl.textContent='ready'; var b=document.getElementById('labStart'); if(b){b.disabled=false;b.textContent='START NEW LEVEL';} },"
    )

    oldstart='''  document.getElementById('start').addEventListener('click', function(){
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
'''
    newstart='''  var startEl=document.getElementById('start');
  var labBusy=false;
  document.getElementById('labStart').addEventListener('click',function(e){
    e.stopPropagation();
    if(labBusy || !window.__kkRuntimeReady) return;
    labBusy=true;
    this.disabled=true;
    this.textContent='BUILDING LEVEL…';
    resSel.value='fit';
    Module.kkRes=pickedRes();
    requestAnimationFrame(function(){
      setTimeout(function(){
        Module.callMain(['/kkrieger_beta.kx']);
        document.body.classList.add('kk-running');
        startEl.remove();
        statusEl=null;
        Module.canvas.focus();
      },40);
    });
  });

  function labCall(name,args,types){
    try { return Module.ccall(name,null,types||[],args||[]); } catch(e) { console.error(e); }
  }
  var look=document.getElementById('labLook'), joy=document.getElementById('labJoy'), knob=document.getElementById('labKnob');
  var held={w:0,a:0,s:0,d:0};
  function setKey(k,on){
    if(held[k]===on) return;
    held[k]=on;
    labCall('kkLabKey',[k.charCodeAt(0),on],['number','number']);
  }
  function resetJoy(){ ['w','a','s','d'].forEach(function(k){setKey(k,0)}); knob.style.transform='translate(0,0)'; }
  joy.addEventListener('pointerdown',function(e){joy.setPointerCapture(e.pointerId);});
  joy.addEventListener('pointermove',function(e){
    if(!joy.hasPointerCapture(e.pointerId)) return;
    var r=joy.getBoundingClientRect(), dx=e.clientX-(r.left+r.width/2), dy=e.clientY-(r.top+r.height/2);
    var max=38, len=Math.hypot(dx,dy)||1, scale=Math.min(1,max/len); dx*=scale;dy*=scale;
    knob.style.transform='translate('+dx+'px,'+dy+'px)';
    setKey('a',dx < -16); setKey('d',dx > 16); setKey('w',dy < -16); setKey('s',dy > 16);
  });
  joy.addEventListener('pointerup',resetJoy); joy.addEventListener('pointercancel',resetJoy);

  var lx=0,ly=0,lp=-1;
  look.addEventListener('pointerdown',function(e){ if(e.target!==look) return; lp=e.pointerId;lx=e.clientX;ly=e.clientY;look.setPointerCapture(lp); });
  look.addEventListener('pointermove',function(e){ if(e.pointerId!==lp) return; var dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;labCall('kkLabLook',[Math.round(dx*2.1),Math.round(dy*2.1)],['number','number']);});
  look.addEventListener('pointerup',function(e){if(e.pointerId===lp)lp=-1;});
  look.addEventListener('pointercancel',function(e){if(e.pointerId===lp)lp=-1;});

  document.getElementById('labFire').addEventListener('pointerdown',function(){labCall('kkLabFire',[1],['number']);});
  document.getElementById('labFire').addEventListener('pointerup',function(){labCall('kkLabFire',[0],['number']);});
  document.getElementById('labJump').addEventListener('pointerdown',function(){labCall('kkLabKey',[32,1],['number','number']);});
  document.getElementById('labJump').addEventListener('pointerup',function(){labCall('kkLabKey',[32,0],['number','number']);});
'''
    return one(s,oldstart,newstart,"level lab start+controls")

rw("mainplayer.cpp",patch_mainplayer)
rw("genoverlay.cpp",patch_overlay)
rw("engine.hpp",patch_engine_hpp)
rw("engine.cpp",patch_engine)
rw("kkriegergame.cpp",patch_game)
rw("wasm/_start_wasm.cpp",patch_wasm)
rw("wasm/shell.html",patch_shell)
print("Krieger Level Lab patch: PASS")
