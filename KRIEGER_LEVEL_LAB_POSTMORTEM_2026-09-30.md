# Krieger Level Lab v1 — physical-iPhone failure postmortem

Status: 2026-09-30  
Authority: physical-device evidence outranks synthetic CI.

## What failed

The black framebuffer was fixed, but the physical iPhone result exposed a more important failure:

- the custom scene is visibly primitive and does not qualify as Krieger-quality graphics;
- the first-person weapon is absent;
- FIRE has no visible projectile/effect.

This is an architectural failure in Level Lab v1, not merely an art-polish issue.

## Root cause A — primitive geometry by construction

`bridge-chamber-v1` is built in `tools/kkrieger-level-lab/patch-level-lab.py` mainly by `kkLabAddCube()`:

```
Mesh_Cube(...)
 -> assign COLOR0
 -> GenMesh::Add(...)
```

The room, corridor, pillars and towers are combinations of cuboids. This proves GenMesh plumbing, but it bypasses most of the operator vocabulary used by real Krieger content.

The pinned upstream operator table exposes, among others: Cylinder, SelectCube/SelectSphere, Subdivide, Transform/TransformEx, Crease, Triangulate, Displace, Bevel, Perlin, Add/Multiply, DeleteFaces, MatLink, Extrude, Grid, Bend/Bend2, UVProjection, AutoCollision, Mesh_Color, LightSlot and ShadowEnable.

Therefore “uses Krieger C++ classes” is not equivalent to “has Krieger visual language”.

## Root cause B — survival material, not a Krieger content material

The black-screen fix correctly introduced a base depth pass before the 2004 light pass:

```
ENGU_BASE
ENGU_LIGHT
```

But the lab material is deliberately minimal. It does not reproduce the authored procedural bitmap/texture dependencies, UV/material graph, shadow/detail treatment and broader pass/effect structure of real .kx content.

Permanent distinction:

- **renderer correctness** = geometry reaches the framebuffer correctly;
- **Krieger fidelity** = the complete authored operator/material/scene/effect pipeline produces comparable visual complexity.

Passing the first does not prove the second.

## Root cause C — Level Lab deletes the weapon bindings

Level Lab patches `KKriegerGame::ResetRoot` to call:

```
Flush();
Monsters.Count = 0;
kkLabInstallCollision(this);
```

Upstream `KKriegerGame::Flush()` clears:

```
WeaponShot[i] = 0;
WeaponOptics[i] = 0;
WeaponExplode[0][i] = 0;
WeaponExplode[1][i] = 0;
WeaponTimer = 0;
```

So the lab destroys the weapon operator links already populated from the .kx graph.

Consequences:

- `WeaponOptics[current]` becomes null -> no first-person weapon;
- `WeaponShot[current]` becomes null -> FIRE cannot create the authored shot event;
- hit/miss explosion links are also lost.

The touch bridge can deliver `sKEY_MOUSEL` correctly while still producing no shot, because the resource graph behind FIRE has been erased.

## Root cause D — renderer isolation deletes native render jobs

The custom Level Lab paint path also clears native jobs before adding its one custom mesh:

```
MeshJobs = 0;
EffectJobs = 0;
PortalJobs = 0;
SectorJobs = 0;
LightJobCount = 0;
Lights04Count = 0;
WeaponLightSet = sFALSE;
...
AddPaintJob(kkLevelLabMesh,...);
```

That removes weapon/effect/event render work together with the old level. This was useful as a renderer-isolation experiment, but it is the wrong architecture for a complete game.

## Native weapon chain that must survive

```
pointer input
 -> sKEY_MOUSEL
 -> KKriegerGame::OnKey
 -> Player.FireKey
 -> KKriegerGame::OnTick
 -> ammo/cooldown/current weapon checks
 -> WeaponShot[current]
 -> FireShot
 -> KKriegerShot::Event.Op
 -> AddEvents
 -> operator/effect graph
 -> renderer
 -> visible shot/effect
```

Visible first-person weapon:

```
WeaponOptics[current]
 -> WeaponEvent.Op
 -> KEnvironment::AddStaticEvent
 -> operator graph
 -> renderer
```

## New invariants

1. Never call destructive `KKriegerGame::Flush()` after weapon bindings are loaded unless every required binding is restored.
2. Never globally clear `MeshJobs/EffectJobs` as the product custom-level strategy if weapons, creatures, particles or event effects must remain visible.
3. FIRE is not PASS because a button or `FireKey` changes. PASS requires non-null weapon resources, real shot/event creation and visible rendered evidence.
4. A non-black or >85%-occupied framebuffer is not evidence of Krieger visual fidelity.

## Status of Level Lab v1

Keep v1 only as a renderer/collision/viewport isolation harness. It is useful for:

- GenMesh and depth/material debugging;
- collision coordinates;
- portrait viewport/render-target diagnostics;
- deterministic framebuffer instrumentation.

It is **FAILED as the architecture for a Krieger-quality custom level**.

## Required successor: Native Level Lab v2

Target:

```
KX/operator recipe
 -> procedural bitmap/texture graph
 -> mesh operator graph
 -> GenMesh
 -> real GenMaterial graph
 -> MakeScene
 -> GenScene { DrawMesh + CollMesh }
 -> Transform/Add/Multiply
 -> Sector/Portal
 -> Light/Ambient
 -> preserve player + weapons + effects
 -> Engine jobs
 -> Paint2004
 -> postprocess
 -> viewport/canvas
```

Do not “improve” v1 by adding more cubes.

## Required research sequence

1. **KX archaeology** — inventory real beta .kx operators with `wasm/tools/kxread.py`, `kxconv.py`, `beta_dis.py`.
2. **Krieger Observatory** — trace `KOp -> generator -> GenMesh/GenMaterial -> scene/effect -> Engine job -> framebuffer`.
3. **Native Geometry Lab** — reproduce one asymmetric architectural asset using several real mesh operators, not merged cubes.
4. **Native Material Lab** — reconstruct one real procedural texture/material dependency graph.
5. **Native Scene Lab** — two sectors, portal, authored lights, same GenScene drives render/collision.
6. **Weapon Lab** — preserve `WeaponOptics/WeaponShot/WeaponExplode`; prove visible weapon and visible firing/effect.
7. **Creature Lab** — mesh + limb/walk/animation + collision + AI + effects.
8. Only then build another complete custom level and compare against canonical Krieger screenshots.

## Future acceptance gate

A public demo may be called Krieger-quality only when it has:

- documented non-primitive operator-generated geometry;
- real procedural texture/material dependencies;
- authored lighting/shadow/effects;
- native scene/sector/portal path where applicable;
- visible first-person weapon;
- visible working FIRE chain;
- real movement/collision;
- portrait physical-iPhone confirmation;
- automated gates rejecting flat/simple frames.

Pinned upstream: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`

Primary source anchors:

- `werkkzeug3_kkrieger/player_kkrieger/kkrieger_oplist.cpp`
- `werkkzeug3_kkrieger/genmesh.cpp`
- `werkkzeug3_kkrieger/genbitmap.cpp`
- `werkkzeug3_kkrieger/genmaterial.cpp`
- `werkkzeug3_kkrieger/genscene.cpp`
- `werkkzeug3_kkrieger/geneffect.cpp`
- `werkkzeug3_kkrieger/engine.cpp`
- `werkkzeug3_kkrieger/kkriegergame.cpp`
- `werkkzeug3_kkrieger/wasm/render2004.cpp`
- `werkkzeug3_kkrieger/wasm/tools/kxread.py`

The key lesson is now explicit: **running on the real Krieger renderer and authoring with the full Krieger content pipeline are different milestones.**
