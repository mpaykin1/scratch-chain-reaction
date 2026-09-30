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
    if(kkJsFlag("__kkReactorMvp"))
      fprintf(stderr,"[reactor-mvp] {\\\"stage\\\":\\\"viewport\\\",\\\"config\\\":[%d,%d],\\\"master\\\":[%d,%d,%d,%d],\\\"aspect\\\":%.8f}\\n",
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
    if(kkJsFlag("__kkReactorMvp"))
      fprintf(stderr,"[reactor-mvp] {\\\"stage\\\":\\\"full_rt\\\",\\\"requested\\\":[%d,%d],\\\"pow2\\\":[%d,%d]}\\n",
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
void KriegerReactorInstallRenderMesh(GenMesh *mesh,const sVector &lightPos);
#endif
'''
    return one(s,old,new,"engine level lab declaration")

def patch_engine(s):
    marker='#include "materials/material11.hpp"\n#endif\n'
    inject=r'''#include "materials/material11.hpp"
#include "genbitmap.hpp"

static EngMesh *kkLevelLabMesh = 0;
static sVector kkLevelLabLightPos;
static GenBitmap *kkStoneTex = 0;
static GenBitmap *kkStoneBump = 0;
static GenBitmap *kkMetalTex = 0;
static GenBitmap *kkMetalBump = 0;
static GenMaterial *kkStoneMat = 0;
static GenMaterial *kkMetalMat = 0;
static GenMaterial *kkGlowMat = 0;

static GenMaterial *kkReactorTexturedMaterial(GenBitmap *diff,GenBitmap *bump,sU32 tint,sF32 spec)
{
  diff->MakeTexture();
  bump->MakeTexture();
  GenMaterial *gm = new GenMaterial;

  sMaterial11 *base = new sMaterial11;
  base->ShaderLevel = sPS_11;
  base->BaseFlags = sMBF_ZON|sMBF_FOG;
  base->SetTex(0,diff->Texture);
  base->TFlags[0] = sMTF_FILTER|sMTF_MIPMAPS|sMTF_TILE;
  base->TScale[0] = 3.0f;
  base->Combiner[sMCS_TEX0] = sMCOA_SET;
  base->Combiner[sMCS_VERTEX] = sMCOA_MUL2;
  base->AlphaCombiner = sMCA_ZERO;
  sVERIFY(base->Compile());
  gm->AddPass(base,ENGU_BASE,MPP_STATIC,0);

  sMaterial11 *light = new sMaterial11;
  light->ShaderLevel = sPS_11;
  light->BaseFlags = sMBF_ZREAD|sMBF_ZEQUAL|sMBF_BLENDADD;
  light->LightFlags = sMLF_BUMPX;
  light->SetTex(1,bump->Texture);
  light->TFlags[1] = sMTF_FILTER|sMTF_MIPMAPS|sMTF_TILE;
  light->TScale[1] = 3.0f;
  light->SpecPower = spec;
  light->Color[0] = tint;
  light->Combiner[sMCS_LIGHT] = sMCOA_SET;
  light->Combiner[sMCS_COLOR0] = sMCOA_MUL;
  light->AlphaCombiner = sMCA_ZERO;
  sVERIFY(light->Compile());
  gm->AddPass(light,ENGU_LIGHT,MPP_STATIC,0);
  return gm;
}

static GenMaterial *kkReactorGlowMaterial()
{
  GenMaterial *gm = new GenMaterial;
  sMaterial11 *base = new sMaterial11;
  base->ShaderLevel = sPS_11;
  base->BaseFlags = sMBF_ZON|sMBF_NONORMAL;
  base->Color[0] = 0xffff9a32;
  base->Combiner[sMCS_COLOR0] = sMCOA_SET;
  base->Combiner[sMCS_VERTEX] = sMCOA_MUL2;
  base->AlphaCombiner = sMCA_ZERO;
  sVERIFY(base->Compile());
  gm->AddPass(base,ENGU_BASE,MPP_STATIC,0);

  sMaterial11 *glow = new sMaterial11;
  glow->ShaderLevel = sPS_11;
  glow->BaseFlags = sMBF_ZREAD|sMBF_ZEQUAL|sMBF_BLENDADD|sMBF_NONORMAL;
  glow->Color[0] = 0xff5c2108;
  glow->Combiner[sMCS_COLOR0] = sMCOA_SET;
  glow->AlphaCombiner = sMCA_ZERO;
  sVERIFY(glow->Compile());
  gm->AddPass(glow,ENGU_POSTLIGHT,MPP_STATIC,0);
  return gm;
}

static void kkReactorInitMaterials()
{
  if(kkStoneMat) return;
  fprintf(stderr,"[reactor-mvp] {\"stage\":\"materials_begin\"}\n");

  kkStoneTex = Bitmap_Bricks(8,8,0xff54483b,0xff201b19,0xff30261f,
                             0.055f,0.055f,10,6,117,0,0,0.12f,0.22f);
  kkStoneBump = Bitmap_Perlin(8,8,5,5,0.58f,7331,0,1.0f,1.0f,
                              0xff242424,0xffb8b8b8);
  kkStoneBump = Bitmap_Normals(kkStoneBump,2.3f,0);

  kkMetalTex = Bitmap_Perlin(8,8,3,6,0.62f,4207,0,1.0f,1.15f,
                             0xff11161b,0xff66727d);
  kkMetalBump = Bitmap_Perlin(8,8,6,4,0.55f,919,0,1.0f,1.0f,
                              0xff303030,0xffc8c8c8);
  kkMetalBump = Bitmap_Normals(kkMetalBump,1.45f,0);

  kkStoneMat = kkReactorTexturedMaterial(kkStoneTex,kkStoneBump,0x00d3b89a,18.0f);
  kkMetalMat = kkReactorTexturedMaterial(kkMetalTex,kkMetalBump,0x00c8d9e8,56.0f);
  kkGlowMat = kkReactorGlowMaterial();
  fprintf(stderr,"[reactor-mvp] {\"stage\":\"materials_done\"}\n");
}

void KriegerReactorInstallRenderMesh(GenMesh *mesh,const sVector &lightPos)
{
  kkReactorInitMaterials();

  for(sInt i=1;i<mesh->Mtrl.Count;i++)
  {
    sInt kind = mesh->Mtrl[i].Pass;
    GenMaterial *m = kind==3 ? kkGlowMat : (kind==2 ? kkMetalMat : kkStoneMat);
    sRelease(mesh->Mtrl[i].Material);
    mesh->Mtrl[i].Material = m;
    m->AddRef();
    mesh->Mtrl[i].Pass = 0;
  }

  fprintf(stderr,"[reactor-mvp] {\"stage\":\"engmesh_begin\",\"vertices\":%d,\"faces\":%d}\n",mesh->Vert.Count,mesh->Face.Count);
  sRelease(kkLevelLabMesh);
  kkLevelLabMesh = new EngMesh;
  kkLevelLabMesh->FromGenMesh(mesh);
  fprintf(stderr,"[reactor-mvp] {\"stage\":\"engmesh_done\"}\n");
  kkLevelLabLightPos = lightPos;
  fprintf(stderr,"[reactor-mvp] {\"stage\":\"render_mesh\",\"vertices\":%d,\"faces\":%d,\"collisions\":%d,\"basePasses\":3,\"lightPasses\":2,\"materialCategories\":3,\"proceduralTextures\":4,\"bumpMapped\":1}\n",
          mesh->Vert.Count,mesh->Face.Count,mesh->Coll.Count);
}
#endif
'''
    s=one(s,marker,inject,"reactor material/render mesh")

    old='''Engine_::~Engine_()
{
  Matrices.Exit();
'''
    new='''Engine_::~Engine_()
{
#if defined(__EMSCRIPTEN__)
  sRelease(kkLevelLabMesh);
  sRelease(kkStoneMat);
  sRelease(kkMetalMat);
  sRelease(kkGlowMat);
  sRelease(kkStoneTex);
  sRelease(kkStoneBump);
  sRelease(kkMetalTex);
  sRelease(kkMetalBump);
#endif
  Matrices.Exit();
'''
    s=one(s,old,new,"reactor cleanup")

    old2='''void Engine_::Paint(KEnvironment *kenv,sBool specular)
{
  // Insert weapon light into list of light jobs, if necessary.
'''
    new2='''void Engine_::Paint(KEnvironment *kenv,sBool specular)
{
#if defined(__EMSCRIPTEN__)
  if(kkLevelLabMesh && kkJsFlag("__kkReactorMvp"))
  {
    // IMPORTANT: append our world; do not clear native jobs. The original
    // weapon, shot/effect events and postprocess remain fully alive.
    sMatrix labMatrix;
    labMatrix.Init();
    AddPaintJob(kkLevelLabMesh,labMatrix,0,0);

    sF32 pulse = 2.25f + 0.35f*sFSin(sSystem->GetTime()*0.0021f);
    EngLight labLight;
    sSetMem(&labLight,0,sizeof(labLight));
    labLight.Position = kkLevelLabLightPos;
    labLight.Flags = 0;
    labLight.Color = 0xffa45a;
    labLight.Amplify = pulse;
    labLight.Range = 27.0f;
    labLight.Event = 0;
    labLight.Id = 7101;
    AddLightJob(labLight);

    labLight.Position.Init(989.0f,5.8f,-6.0f,1.0f);
    labLight.Color = 0x6f8eff;
    labLight.Amplify = 1.45f;
    labLight.Range = 22.0f;
    labLight.Id = 7102;
    AddLightJob(labLight);

    labLight.Position.Init(989.0f,5.8f,6.0f,1.0f);
    labLight.Color = 0x80a0ff;
    labLight.Amplify = 1.35f;
    labLight.Range = 22.0f;
    labLight.Id = 7103;
    AddLightJob(labLight);

    labLight.Position.Init(1014.0f,4.5f,0.0f,1.0f);
    labLight.Color = 0xff7040;
    labLight.Amplify = 1.15f;
    labLight.Range = 18.0f;
    labLight.Id = 7104;
    AddLightJob(labLight);
    AddAmbientLight(0x17191d);
  }
#endif

  // Insert weapon light into list of light jobs, if necessary.
'''
    return one(s,old2,new2,"reactor paint injection")
def patch_game(s):
    s=one(s,
      '#include <stdio.h>\n',
      '#include <stdio.h>\n#include <emscripten/emscripten.h>\n',
      "game emscripten include")
    anchor='''void KKriegerGame::ResetRoot(KEnvironment *env,KOp *root,sBool firsttime)
{
'''
    helper=r'''#if defined(__EMSCRIPTEN__)
extern KKriegerGame *Game;

static const sF32 KKLAB_X = 1000.0f;
static sInt kkLabCoreMask = 0;

extern "C" EMSCRIPTEN_KEEPALIVE double kkLabPose(int which)
{
  if(!Game) return 0.0;
  switch(which)
  {
  case 0: return Game->PlayerDir;
  case 1: return Game->PlayerLook;
  case 2: return Game->PlayerPos.x;
  case 3: return Game->PlayerPos.y;
  case 4: return Game->PlayerPos.z;
  case 5: return Game->PlayerCell ? 1.0 : 0.0;
  case 6: return Game->WeaponOptics[Game->Player.CurrentWeapon] ? 1.0 : 0.0;
  case 7: return Game->WeaponShot[Game->Player.CurrentWeapon] ? 1.0 : 0.0;
  case 8: return Game->Player.CurrentWeapon;
  case 9: return kkLabCoreMask;
  default: return 0.0;
  }
}

extern "C" EMSCRIPTEN_KEEPALIVE void kkLabDirectLook(int dx,int dy)
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

static void kkLabTint(GenMesh *m,sU32 color)
{
  sInt slot=m->VertMap(sGMI_COLOR0);
  if(slot>=0)
    for(sInt i=0;i<m->Vert.Count;i++)
      m->VertBuf[i*m->VertSize()+slot].InitColor(color);
}

static GenMesh *kkLabXform(GenMesh *m,sF32 sx,sF32 sy,sF32 sz,
                           sF32 rx,sF32 ry,sF32 rz,sF32 tx,sF32 ty,sF32 tz)
{
  sFSRT srt;
  srt.s.Init(sx,sy,sz);
  srt.r.Init(rx,ry,rz);
  srt.t.Init(tx,ty,tz);
  m->All2Sel(1,MAS_VERT);
  return Mesh_Transform(0,m,0,srt);
}

static void kkLabAddPart(GenMesh *&dst,GenMesh *part,sInt material,sU32 color)
{
  if(!part) return;
  kkLabTint(part,color);
  if(part->Mtrl.Count>1)
    part->Mtrl[1].Pass=material;
  if(!dst)
    dst=part;
  else
  {
    dst->Add(part);
    part->Release();
  }
}

static void kkLabCube(GenMesh *&dst,sF32 sx,sF32 sy,sF32 sz,
                      sF32 tx,sF32 ty,sF32 tz,sInt material,sU32 color)
{
  sFSRT srt;
  srt.s.Init(sx,sy,sz); srt.r.Init(0,0,0); srt.t.Init(tx,ty,tz);
  kkLabAddPart(dst,Mesh_Cube(1,1,1,0,srt),material,color);
}

static void kkLabCylinder(GenMesh *&dst,sF32 sx,sF32 sy,sF32 sz,
                          sF32 rx,sF32 ry,sF32 rz,sF32 tx,sF32 ty,sF32 tz,
                          sInt material,sU32 color)
{
  GenMesh *m=Mesh_Cylinder(14,2,0,1,0);
  m=kkLabXform(m,sx,sy,sz,rx,ry,rz,tx,ty,tz);
  kkLabAddPart(dst,m,material,color);
}

static void kkLabTorus(GenMesh *&dst,sF32 ro,sF32 ri,sF32 arc,
                       sF32 rx,sF32 ry,sF32 rz,sF32 tx,sF32 ty,sF32 tz,
                       sInt material,sU32 color)
{
  // The original closed-Torus merge path is disproportionately expensive in
  // the WASM authoring path. Preserve true curved Krieger geometry but build
  // a full ring from two open half-tori, which use the proven fast path.
  if(arc >= 0.999f)
  {
    GenMesh *a=Mesh_Torus(18,7,ro,ri,0.0f,0.5f,1);
    a=kkLabXform(a,1,1,1,rx,ry,rz,tx,ty,tz);
    kkLabAddPart(dst,a,material,color);
    GenMesh *b=Mesh_Torus(18,7,ro,ri,0.0f,0.5f,1);
    b=kkLabXform(b,1,1,1,rx,ry+0.5f,rz,tx,ty,tz);
    kkLabAddPart(dst,b,material,color);
    return;
  }
  GenMesh *m=Mesh_Torus(18,7,ro,ri,0.0f,arc,1);
  m=kkLabXform(m,1,1,1,rx,ry,rz,tx,ty,tz);
  kkLabAddPart(dst,m,material,color);
}

static void kkLabSphere(GenMesh *&dst,sF32 scale,sF32 tx,sF32 ty,sF32 tz,
                        sInt material,sU32 color)
{
  GenMesh *m=Mesh_Sphere(18,8);
  m=kkLabXform(m,scale,scale,scale,0,0,0,tx,ty,tz);
  kkLabAddPart(dst,m,material,color);
}

static void kkLabRibArray(GenMesh *&dst,sF32 z)
{
  GenMesh *m=Mesh_Cylinder(10,2,0,1,0);
  m=kkLabXform(m,0.28f,5.8f,0.28f,0,0,0,KKLAB_X-12.0f,4.3f,z);
  sFSRT step;
  step.s.Init(1,1,1); step.r.Init(0,0,0); step.t.Init(2.4f,0,0);
  sF323 lr; lr.Init(0,0,0);
  m=Mesh_Multiply(0,m,step,11,0,0,0,lr,0);
  kkLabAddPart(dst,m,2,0xff58636d);
}

static GenMesh *kkLabBuildMesh()
{
  static GenMesh *mesh=0;
  if(mesh) return mesh;
  fprintf(stderr,"[reactor-mvp] {\"stage\":\"build_begin\"}\n");

  // Heavy stone shell: real textured/bump-lit material category 1.
  kkLabCube(mesh,34.0f,0.55f,18.0f,KKLAB_X, -0.28f,0,1,0xff6d6256);
  kkLabCube(mesh,34.0f,0.55f,18.0f,KKLAB_X, 10.2f,0,1,0xff39342f);
  kkLabCube(mesh,0.65f,10.5f,18.0f,KKLAB_X-17.0f,5.0f,0,1,0xff554a40);
  kkLabCube(mesh,0.65f,10.5f,18.0f,KKLAB_X+17.0f,5.0f,0,1,0xff554a40);
  kkLabCube(mesh,34.0f,10.5f,0.65f,KKLAB_X,5.0f,-9.0f,1,0xff4c433b);
  kkLabCube(mesh,34.0f,10.5f,0.65f,KKLAB_X,5.0f, 9.0f,1,0xff4c433b);

  fprintf(stderr,"[reactor-mvp] {\"stage\":\"build_shell_done\",\"faces\":%d}\n",mesh->Face.Count);
  // Metallic floor rails and repeated structural ribs use the real Multiply op.
  kkLabCube(mesh,31.0f,0.16f,0.38f,KKLAB_X,0.12f,-4.7f,2,0xff5b6874);
  kkLabCube(mesh,31.0f,0.16f,0.38f,KKLAB_X,0.12f, 4.7f,2,0xff5b6874);
  kkLabRibArray(mesh,-7.8f);
  kkLabRibArray(mesh, 7.8f);

  // Four gothic arches: cylinders + half tori rather than cuboid silhouettes.
  const sF32 ax[4]={KKLAB_X-11.0f,KKLAB_X-4.0f,KKLAB_X+3.0f,KKLAB_X+10.0f};
  for(sInt i=0;i<4;i++)
  {
    kkLabCylinder(mesh,0.72f,6.4f,0.72f,0,0,0,ax[i],3.2f,-6.15f,1,0xff776553);
    kkLabCylinder(mesh,0.72f,6.4f,0.72f,0,0,0,ax[i],3.2f, 6.15f,1,0xff776553);
    kkLabTorus(mesh,6.3f,5.0f,0.50f,0.25f,0,0,ax[i],6.25f,0,1,0xff806d59);
  }

  fprintf(stderr,"[reactor-mvp] {\"stage\":\"build_arches_done\",\"faces\":%d}\n",mesh->Face.Count);
  // Overhead pipes with toroidal collars.
  kkLabCylinder(mesh,0.34f,24.0f,0.34f,0,0,0.25f,KKLAB_X,8.0f,-5.4f,2,0xff34414b);
  kkLabCylinder(mesh,0.46f,25.0f,0.46f,0,0,0.25f,KKLAB_X,8.5f, 5.2f,2,0xff48535e);
  fprintf(stderr,"[reactor-mvp] {\\\"stage\\\":\\\"build_pipe_cyl_done\\\",\\\"faces\\\":%d}\\n",mesh->Face.Count);
  for(sInt x=-10;x<=10;x+=5)
  {
    kkLabTorus(mesh,0.72f,0.47f,1.0f,0.25f,0,0,KKLAB_X+x,8.0f,-5.4f,2,0xff78838c);
    kkLabTorus(mesh,0.86f,0.56f,1.0f,0.25f,0,0,KKLAB_X+x,8.5f, 5.2f,2,0xff78838c);
  }

  fprintf(stderr,"[reactor-mvp] {\"stage\":\"build_pipes_done\",\"faces\":%d}\n",mesh->Face.Count);
  // Central reactor: layered high-segment procedural surfaces.
  const sF32 rx=KKLAB_X+3.0f;
  kkLabCylinder(mesh,5.4f,0.9f,5.4f,0,0,0,rx,0.45f,0,2,0xff38414a);
  kkLabCylinder(mesh,4.2f,1.1f,4.2f,0,0,0,rx,1.25f,0,2,0xff53606a);
  kkLabCylinder(mesh,2.3f,7.2f,2.3f,0,0,0,rx,4.25f,0,2,0xff46535d);
  kkLabTorus(mesh,3.65f,2.75f,1.0f,0,0,0,rx,2.15f,0,2,0xff73808a);
  kkLabTorus(mesh,3.85f,2.95f,1.0f,0,0,0,rx,4.15f,0,2,0xff73808a);
  kkLabTorus(mesh,3.45f,2.55f,1.0f,0,0,0,rx,6.10f,0,2,0xff73808a);
  kkLabTorus(mesh,3.55f,2.70f,1.0f,0.25f,0,0,rx,4.20f,0,2,0xff61717d);
  kkLabSphere(mesh,2.45f,rx,4.35f,0,3,0xffffb04a);
  kkLabSphere(mesh,1.25f,rx,4.35f,0,3,0xffffd585);

  // Reactor braces and energy conduits.
  for(sInt i=0;i<4;i++)
  {
    sF32 z=(i&1)?3.7f:-3.7f;
    sF32 x=rx+((i&2)?3.7f:-3.7f);
    kkLabCylinder(mesh,0.42f,6.7f,0.42f,0,0,0,x,3.35f,z,2,0xff65727d);
    kkLabTorus(mesh,0.75f,0.48f,1.0f,0,0,0,x,6.45f,z,3,0xffff8740);
  }

  // Small luminous guide nodes are the three gameplay objectives.
  kkLabSphere(mesh,0.72f,KKLAB_X-10.0f,1.35f,-5.7f,3,0xff7ab8ff);
  kkLabSphere(mesh,0.72f,KKLAB_X-2.0f,1.35f, 5.7f,3,0xff7ab8ff);
  kkLabSphere(mesh,0.72f,KKLAB_X+12.0f,1.35f,-5.7f,3,0xffff8740);

  fprintf(stderr,"[reactor-mvp] {\"stage\":\"build_reactor_done\",\"faces\":%d}\n",mesh->Face.Count);
  // Collision: one large ADD room plus solid reactor/columns.
  mesh=Mesh_CollisionCube(mesh,0,0,KKLAB_X-16.5f,KKLAB_X+16.5f,-1.0f,10.0f,-8.5f,8.5f,KCM_ADD,1,1,1);
  mesh=Mesh_CollisionCube(mesh,0,0,rx-2.7f,rx+2.7f,-0.5f,7.7f,-2.7f,2.7f,KCM_SUB,1,1,1);
  for(sInt i=0;i<4;i++)
  {
    mesh=Mesh_CollisionCube(mesh,0,0,ax[i]-0.65f,ax[i]+0.65f,-0.5f,6.4f,-6.8f,-5.5f,KCM_SUB,1,1,1);
    mesh=Mesh_CollisionCube(mesh,0,0,ax[i]-0.65f,ax[i]+0.65f,-0.5f,6.4f, 5.5f, 6.8f,KCM_SUB,1,1,1);
  }

  fprintf(stderr,"[reactor-mvp] {\"stage\":\"build_collision_done\",\"faces\":%d,\"collisions\":%d}\n",mesh->Face.Count,mesh->Coll.Count);
  mesh->CalcNormals();
  fprintf(stderr,"[reactor-mvp] {\"stage\":\"build_normals_done\",\"vertices\":%d,\"faces\":%d}\n",mesh->Vert.Count,mesh->Face.Count);
  sVector light; light.Init(rx,6.3f,0,1.0f);
  KriegerReactorInstallRenderMesh(mesh,light);
  fprintf(stderr,"[reactor-mvp] {\"stage\":\"built\",\"id\":\"dark-reactor-v2\",\"visualParts\":52,\"curvedOps\":31,\"multiplyOps\":2,\"materialCategories\":3,\"collisionCells\":%d,\"origin\":[%.1f,0,0]}\n",
          mesh->Coll.Count,KKLAB_X);
  return mesh;
}

static void kkLabInstallCollision(KKriegerGame *game)
{
  GenMesh *mesh=kkLabBuildMesh();
  sMatrix mat; mat.Init();

  // Add our collision graph AFTER SetPainter has installed the native .kx
  // graph. Do not Flush(): that would erase WeaponOptics/WeaponShot links.
  game->CellList.Init();
  KKriegerMesh *cm=new KKriegerMesh(mesh);
  game->AddMesh(cm,mat,0);
  cm->Release();
  game->CellConnect();
  game->CellList.Exit();

  game->PlayerStartPos.Init(KKLAB_X-13.2f,1.0f,6.3f,1.0f);
  fprintf(stderr,"[reactor-mvp] {\"stage\":\"collision_ready\",\"adds\":%d,\"subs\":%d,\"zones\":%d,\"start\":[%.1f,1.0,6.3],\"startDir\":2.582993,\"startLook\":-0.08}\n",
          game->CellAdd.Count,game->CellSub.Count,game->CellZone.Count,KKLAB_X-13.2f);
}

static void kkLabUpdateObjective(KKriegerGame *game)
{
  const sF32 px[3]={KKLAB_X-10.0f,KKLAB_X-2.0f,KKLAB_X+12.0f};
  const sF32 pz[3]={-5.7f,5.7f,-5.7f};
  for(sInt i=0;i<3;i++)
    if(!(kkLabCoreMask&(1<<i)))
    {
      sF32 dx=game->PlayerPos.x-px[i], dz=game->PlayerPos.z-pz[i];
      if(dx*dx+dz*dz<5.3f)
      {
        kkLabCoreMask|=1<<i;
        fprintf(stderr,"[reactor-mvp] {\"stage\":\"core_on\",\"core\":%d,\"mask\":%d}\n",i+1,kkLabCoreMask);
      }
    }
}
#endif

'''
    s=one(s,anchor,helper+anchor,"reactor helpers")

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
  if(kkJsFlag("__kkReactorMvp"))
    kkLabInstallCollision(this);
#endif
  Restart();
#if defined(__EMSCRIPTEN__)
  if(kkJsFlag("__kkReactorMvp"))
    Switches[KGS_GAME] = KGS_GAME_RUN;
  else
#endif
  if(firsttime)
    Switches[KGS_GAME] = KGS_GAME_INTRO;
}
'''
    s=one(s,old,new,"reactor ResetRoot")

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
  if(kkJsFlag("__kkReactorMvp"))
  {
    PlayerStartPos.Init(KKLAB_X-13.2f,1.0f,6.3f,1.0f);
    SetPlayer(PlayerStartPos,2.582993f,-0.08f);
  }
  else
#endif
    SetPlayer(PlayerStartPos,0,0);
'''
    s=one(s,old2,new2,"reactor restart")

    telemetry='''#if defined(__EMSCRIPTEN__)
  if(kkJsFlag("__kkReactorMvp"))
  {
    kkLabUpdateObjective(this);
    static sInt labtick;
    if(labtick++ < 6 || (labtick % 20)==0 || AccelForw!=0 || AccelSide!=0)
      fprintf(stderr,"[reactor-mvp] {\\\\\\\"stage\\\\\\\":\\\\\\\"player\\\\\\\",\\\\\\\"pos\\\\\\\":[%.5f,%.5f,%.5f],\\\\\\\"dir\\\\\\\":%.6f,\\\\\\\"look\\\\\\\":%.6f,\\\\\\\"cell\\\\\\\":%d,\\\\\\\"cores\\\\\\\":%d,\\\\\\\"weapon\\\\\\\":%d,\\\\\\\"optics\\\\\\\":%d,\\\\\\\"shot\\\\\\\":%d}\\n",
              PlayerPos.x,PlayerPos.y,PlayerPos.z,PlayerDir,PlayerLook,PlayerCell?1:0,
              kkLabCoreMask,Player.CurrentWeapon,
              WeaponOptics[Player.CurrentWeapon]?1:0,
              WeaponShot[Player.CurrentWeapon]?1:0);
  }
#endif

'''
    marker='// diagnostics\n\n#if !sPLAYER'
    if marker not in s:
        raise SystemExit("player telemetry anchor missing")
    s=s.replace(marker,telemetry+marker,1)

    old_tick='''  inOptions = Switches[KGS_GAME] == KGS_GAME_OPTIONS
    || Switches[KGS_GAME] == KGS_GAME_INGAME && Switches[KGS_INGAME_MENU] == 1;
'''
    new_tick='''#if defined(__EMSCRIPTEN__)
  if(kkJsFlag("__kkReactorMvp"))
    Switches[KGS_GAME] = KGS_GAME_RUN;
#endif
  inOptions = Switches[KGS_GAME] == KGS_GAME_OPTIONS
    || Switches[KGS_GAME] == KGS_GAME_INGAME && Switches[KGS_INGAME_MENU] == 1;
'''
    s=one(s,old_tick,new_tick,"reactor keep simulation RUN")

    old_key='''  LastKey = key&0x8001ffff;

  switch(key&(0x8001ffff))
'''
    new_key='''  LastKey = key&0x8001ffff;
#if defined(__EMSCRIPTEN__)
  if(kkJsFlag("__kkReactorMvp"))
    fprintf(stderr,"[reactor-mvp] {\\\\\\\"stage\\\\\\\":\\\\\\\"input_key\\\\\\\",\\\\\\\"key\\\\\\\":%u,\\\\\\\"break\\\\\\\":%d}\\n",
            (unsigned)(key&0x1ffff),(key&sKEYQ_BREAK)?1:0);
#endif

  switch(key&(0x8001ffff))
'''
    s=one(s,old_key,new_key,"reactor input telemetry")
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
      '<div id="labBadge">KRIEGER REACTOR MVP\nwaiting for engine</div>\n'
      '<div id="labTouch"><div id="labLook"></div><div id="labJoy"><div id="labKnob"></div></div>'
      '<button id="labJump">JUMP</button><button id="labFire">FIRE</button></div>',
      "level lab UI")
    s=one(s,
      '<div id="start"><div>click to start<small>WebGL2 · procedural content is generated on load, please wait</small>',
      '<div id="start"><div><button id="labStart" disabled>LOADING ENGINE…</button><small>Krieger procedural reactor · textured materials · real lighting · native weapon pipeline</small>',
      "level lab start")

    old='''  var Module = {
    canvas: document.getElementById('canvas'),
    print: function(t){ console.log(t); kkLog(t); },
    printErr: function(t){
'''
    new='''  window.__kkReactorMvp = 1;
  window.__kkLab = {events:[],built:null,collision:null,render:null,player:null,viewport:null,fullRT:null};
  function kkLabLine(t){
    if(typeof t!=='string') return;
    var p=t.indexOf('[reactor-mvp] ');
    if(p<0) return;
    try{
      var e=JSON.parse(t.slice(p+'[reactor-mvp] '.length));
      window.__kkLab.events.push(e);
      if(e.stage==='built') window.__kkLab.built=e;
      if(e.stage==='collision_ready') window.__kkLab.collision=e;
      if(e.stage==='render_mesh') window.__kkLab.render=e;
      if(e.stage==='player') window.__kkLab.player=e;
      if(e.stage==='viewport') window.__kkLab.viewport=e;
      if(e.stage==='full_rt') window.__kkLab.fullRT=e;
      var b=document.getElementById('labBadge');
      if(b){
        var p0=window.__kkLab.player;
        var cores=p0?((p0.cores&1?1:0)+(p0.cores&2?1:0)+(p0.cores&4?1:0)):0;
        b.textContent='KRIEGER REACTOR · dark-reactor-v2'+
          (p0?'\\npos '+p0.pos.map(function(x){return x.toFixed(1)}).join(' / ')+'\\nCORES '+cores+'/3'+(cores===3?' · EXIT OPEN':''):'\\nreactor compiling');
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
      "onRuntimeInitialized: function(){ window.__kkRuntimeReady=true; if(statusEl) statusEl.textContent='ready'; var b=document.getElementById('labStart'); if(b){b.disabled=false;b.textContent='ENTER DARK REACTOR';} },"
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
  look.addEventListener('pointermove',function(e){ if(e.pointerId!==lp) return; var dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;labCall('kkLabDirectLook',[Math.round(dx*2.1),Math.round(dy*2.1)],['number','number']);});
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
print("Krieger Reactor MVP patch: PASS")
