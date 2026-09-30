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

## Canonical graphics-control lesson from the portrait success

Read `KRIEGER_GRAPHICS_CONTROL_LESSONS.md`.

The physical-iPhone-confirmed portrait proof established the working research pattern for Krieger:

```text
measure all stages
→ find the first divergence
→ change the subsystem that owns it
→ assert intermediate engine state
→ assert final framebuffer structure
→ verify on the physical target
```

The next graphics-control progression is now fixed:

`Mesh Lab → Material Lab → Light Lab → native Scene/Sector/Portal Lab → Postprocess Lab`.

Do not jump directly to a full custom level and infer understanding from the result. Each lab must have both a structural oracle and a visual framebuffer oracle.

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
