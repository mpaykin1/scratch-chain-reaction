# Krieger Total Control

Status: 2026-09-29  
Priority: highest  
Upstream baseline: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`

## Goal

Turn Krieger from a successfully launched foreign codebase into a mapped technology platform that World Server can use deliberately.

For every visible result, preserve the trace:

```
DATA
 -> GENERATOR
 -> RUNTIME OBJECT
 -> CPU JOB
 -> GPU PASS
 -> SHADER / MATERIAL
 -> FRAMEBUFFER
 -> POSTPROCESS
 -> VIEWPORT
 -> CANVAS
```

For every player action:

```
INPUT
 -> browser event
 -> WASM boundary
 -> KKriegerGame state
 -> simulation
 -> animation/effect
 -> render job
 -> pixels
```

Physical-device evidence outranks synthetic browser evidence.

## Ten maps

| Map | Verified starting points | Target |
| --- | --- | --- |
| Geometry | `genmesh.hpp/.cpp`, `Mesh_Cube`, `GenMesh::Add`, normals/UV/color streams | explain origin and transforms of every mesh |
| Material | `genmaterial.cpp`, `GenMaterial::AddPass`, `sMaterial11` | map base/light/shadow/postlight/environment passes |
| Renderer | `engine.cpp`, `wasm/render2004.cpp` | complete frame/job/pass/target lifecycle |
| Scene / Level | `genscene.hpp/.cpp` | native rooms, transforms, sectors, portals, camera, lights |
| Creature | `kkriegergame.cpp`, mesh bones and scene walk/limb operators | morphology -> rig -> AI -> collision -> render |
| Weapon | `KKriegerPlayer`, `WeaponEvent`, `FireShot`, weapon operator links | model -> switch -> fire -> projectile/effect/light |
| Effects | `geneffect.*`, engine effect jobs, overlay/render targets | particles, glows, postprocess, shadows |
| Audio | V2 integration and game sound calls | event -> synthesis -> spatial playback |
| Browser / WASM | `wasm/_start_wasm.cpp`, player shell, input bridge | browser -> C++ lifecycle, DPR, resize, fullscreen/orientation |
| Data / Compression | kdoc/operator graph + procedural generators | compact recipe -> large game content |

## Facts already verified

### GenMesh is the real procedural geometry substrate

`GenMeshFace.Material` indexes `GenMesh::Mtrl`; material slot zero is unused. `sGMF_DEFAULT` contains position, normal, tangent, COLOR0 and UV0 streams. `Mesh_Cube` builds real topology and UV data. `GenMesh::Add` remaps/deduplicates material slots while merging generated meshes.

This means a World Server procedural compiler can target a compact recipe and generate actual Krieger geometry without importing a conventional asset file.

### Native scene path is richer than the current Level Lab isolation harness

`MakeScene(KObject*)` converts a `GenMesh` into a `GenScene` with both:

- `DrawMesh` for rendering;
- `CollMesh` for Krieger collision.

Runtime scene operators then queue work through:

- `ExecSceneInput -> Engine->AddPaintJob`
- `Exec_Scene_Sector -> Engine->AddSectorJob`
- `Exec_Scene_Portal -> Engine->AddPortalJob`
- `Exec_Scene_Light -> Engine->AddLightJob`
- `Exec_Scene_Ambient -> Engine->AddAmbientLight`

This is the target for a true native Level Lab v2.

### Collision and navigation are a separate but related graph

`KKriegerGame::SetScene -> SetSceneR -> AddMesh -> CellConnect` traverses scene collision meshes and builds the playable cell graph. `SetPlayer` resolves `PlayerCell`; simulation then updates collider, player position and camera.

### Breakpoint-2004 material invariant

The 2004 light pass uses depth compare EQUAL with depth writes disabled. Therefore a custom mesh with only an `ENGU_LIGHT` pass can be fully alive in simulation while rendering black. A matching earlier base/depth pass is mandatory.

### Physical-iPhone lesson: non-black is not the same as visible 3D

The first black-screen fix produced a frame that synthetic CI called >92% non-black. On the physical iPhone it was almost a single blue-gray field with a horizontal black band.

The reason is now mapped: the test measured occupancy, not authored 3D structure. The player also started at yaw 0; `sMatrix::InitEuler` makes camera forward +Z at yaw 0, and the start position was directly facing the +Z room wall. The wall ended below the separately added ceiling, leaving a real gap that appeared as the black horizontal stripe.

Permanent rule: a Level Lab visual gate must prove structure and view response, not just non-black pixels.

## Observatory target

Krieger Observatory should expose at runtime:

- mesh jobs and source generator;
- face/material slot;
- base/light/shadow/postlight pass;
- normals/tangents/UV/color streams;
- draw calls and depth;
- active lights and ranges;
- sector/portal graph and current sector;
- collision cells and player cell;
- skeleton/bones/animation;
- AI, HP and current monster state;
- CurrentWeapon / NextWeapon / WeaponTimer;
- render-target chain, viewport and final blit.

Selecting an object should display its provenance chain instead of only its runtime identity.

## Laboratory target

Small deterministic harnesses:

`Mesh Lab -> Material Lab -> Light Lab -> Level Lab -> Creature Lab -> Weapon Lab -> Viewport Lab`.

Each lab must expose a machine-readable invariant and a visual oracle. A full game run is not an acceptable substitute for a focused lab.

## Infinite Krieger direction

```
seed + WorldRecipe
 -> sector/chunk recipe
 -> procedural GenMesh / materials / entities
 -> GenScene
 -> sector + portal graph
 -> Krieger runtime
```

Then extend the same compiler idea to `WeaponRecipe`, `CreatureRecipe`, `MaterialRecipe` and `ArchitectureRecipe`.

## World Server extraction status

Do not blindly copy code. Every capability receives one status:

- `REUSE`
- `ADAPT`
- `REIMPLEMENT`
- `KRIEGER-ONLY`
- `OBSOLETE`

and one record:

`capability -> exact source -> dependencies -> input -> output -> limits -> license/provenance -> World Server equivalent -> regression test -> status`.

Licensing must be verified per source file and data set before extraction. A BSD header in an engine file does not automatically establish the status of every bundled data asset.


## 2026-09-30 physical-iPhone correction: Level Lab v1 is not a fidelity architecture

The user-confirmed iPhone result fixed the black framebuffer but exposed the larger failure: the scene is primitive, the first-person weapon is absent, and FIRE has no visible shot/effect.

Root cause is concrete: v1 is mainly `Mesh_Cube + GenMesh::Add`, uses a minimal survival material, calls `KKriegerGame::Flush()` after the .kx weapon graph is populated, and clears native `MeshJobs/EffectJobs` before painting its isolated mesh.

**Status:** v1 remains useful as a renderer/collision/viewport harness, but is FAILED as the architecture for a complete Krieger-quality custom level.

Canonical postmortem: [KRIEGER_LEVEL_LAB_POSTMORTEM_2026-09-30.md](KRIEGER_LEVEL_LAB_POSTMORTEM_2026-09-30.md)

New invariant: custom-level work must preserve `WeaponOptics`, `WeaponShot`, `WeaponExplode`, event/effect jobs and the native operator graph unless a verified replacement is installed. Next target: KX archaeology + Native Level Lab v2 + Weapon Lab.


## Quantified KX baseline

The converted real beta has now been parsed as a graph: **4,817 operators, 77 classes and 38 splines**. It contains hundreds of transforms/material links and substantial bitmap/material/scene/sector/portal machinery. First-person weapon optics alone reach 224–362 operators depending on slot.

See [KRIEGER_KX_ARCHAEOLOGY_BASELINE.md](KRIEGER_KX_ARCHAEOLOGY_BASELINE.md). This is now the factual baseline for Native Level Lab v2.


## 2026-09-30 physical-iPhone correction: human-visible difference is the gate

Surgery Lab proved native KOp control, but the physical-iPhone user could not see an obvious difference between ORIGINAL and MODIFIED. The old pixel-diff gate was therefore too weak.

New rule: a Krieger graphics-control MVP cannot PASS merely because pixels statistically changed. The visual change must be obvious to a physical-device user without hunting for it.

The same phone test also exposed vertical page dragging. All future Krieger demos must hard-lock the document viewport so gestures belong to the game rather than browser scroll/rubber-band.

Canonical verdict: [KRIEGER_SURGERY_PHYSICAL_IPHONE_VERDICT_2026-09-30.md](KRIEGER_SURGERY_PHYSICAL_IPHONE_VERDICT_2026-09-30.md)

Current successor: Native Location Rebuild Lab — mutate many native Scene_Transform KOps in the real level while preserving native materials, procedural textures, weapons, effects, sectors/portals and renderer.
