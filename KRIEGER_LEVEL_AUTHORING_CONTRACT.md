# Krieger native level authoring contract

Status: 2026-09-29  
Purpose: the minimum known contract for creating our own Krieger levels without treating the engine as magic.

## Two different things must not be confused

### A. Level Lab v1 — renderer isolation harness

Current public Level Lab intentionally bypasses much of the native scene graph:

```
Mesh_Cube / GenMesh::Add
 -> custom GenMaterial
 -> EngMesh::FromGenMesh
 -> Engine::AddPaintJob
```

Collision is installed separately:

```
same GenMesh
 -> KKriegerMesh
 -> KKriegerGame::AddMesh
 -> CellConnect
 -> PlayerCell
```

This harness is valuable for proving geometry, materials, camera, collision and the 2004 renderer independently. It is not yet the final architecture for authoring full Krieger levels.

### B. Level Lab v2 — target native path

A proper Krieger-authored level should exercise the engine's own scene abstractions:

```
procedural geometry operators
 -> GenMesh
 -> material graph / GenMaterial passes
 -> MakeScene
 -> GenScene { DrawMesh + CollMesh }
 -> transforms / Add / Multiply
 -> Sector
 -> Portal links
 -> Lights / Ambient
 -> runtime scene execution
 -> Engine mesh/sector/portal/light jobs
 -> portal visibility + frustum
 -> Paint2004
 -> render targets / postprocess
 -> viewport / canvas
```

Gameplay collision follows the same scene's `CollMesh` through:

```
KKriegerGame::SetScene
 -> SetSceneR
 -> AddMesh
 -> CellConnect
 -> SetPlayer / FindCell
 -> simulation
```

## Minimum authoring contract

| Stage | Required invariant | Verified source |
| --- | --- | --- |
| Geometry | faces reference nonzero material slots; valid positions; normals/tangents/UV streams when required | `genmesh.hpp/.cpp` |
| Material | at least a base/depth path before 2004 additive light when using that renderer mode | `genmaterial.cpp`, `wasm/render2004.cpp` |
| Mesh -> scene | rendered mesh and collision mesh come from the same authored object where possible | `MakeScene` in `genscene.cpp` |
| Transform | room/object transforms live in scene SRT / ExecStack, not CSS or JS visual offsets | `Init/Exec_Scene_Scene/Transform/Multiply` |
| Sector | native room visibility uses sector jobs | `Init/Exec_Scene_Sector` |
| Portal | connections use linked sector scenes plus portal AABB and cost/door state | `Init/Exec_Scene_Portal` |
| Light | light job has position, color, amplification and range | `Exec_Scene_Light` |
| Collision | KCM_ADD/SUB cells connect and player resolves to a valid cell | `kkriegergame.cpp` |
| Camera | player pose/camera must intentionally frame authored geometry | `KKriegerGame::GetCamera`, `sMatrix::InitEuler` |
| Postprocess | scene survives full render-target chain with correct aspect and final blit | `genoverlay.*`, player/viewport code |

## Authoring lesson from bridge-chamber-v1

The physical iPhone showed a blue-gray field and a black horizontal stripe although CI said the scene was >92% non-black.

That screenshot is consistent with the exact authored start pose:

- start near `(995, 1, 6)`;
- yaw `0` means camera forward is +Z;
- a large +Z wall sits directly in front of the player;
- the wall top and separately added ceiling did not meet, leaving a horizontal void.

So the engine was drawing *something*, but the player was looking almost orthogonally at one flat surface. That is a level-authoring failure, not a successful visual proof.

The v1 harness must therefore start on a diagonal authored view, use semantic vertex colours through the real GenMesh COLOR0 stream, close unintended shell gaps, and require visual parallax after camera rotation.

## Visual acceptance — mandatory

A future test link is not publishable merely because canvas pixels are non-black.

The automated oracle must require all of these:

1. >85% occupied/non-black central framebuffer;
2. no single coarse RGB bin dominates the frame;
3. nontrivial luminance variance;
4. nontrivial edge density;
5. multiple quantized scene colours;
6. a real C++ camera rotation changes a meaningful fraction of framebuffer pixels;
7. all DOM diagnostics/control overlays hidden during capture;
8. physical iPhone result can override synthetic PASS.

## Five isolation experiments

1. **Mesh Lab:** render one asymmetric procedural object with unique face/vertex colours. Proves topology, normals and camera.
2. **Material Lab:** same mesh, toggle base only -> base+light -> base+light+post. Proves pass ordering.
3. **Light Lab:** fixed mesh/camera, sweep one real `EngLight`. Proves spatial response and normals.
4. **Sector/Portal Lab:** two differently coloured rooms connected by one portal. Crossing the portal must change current sector and visible scene.
5. **Postprocess/Viewport Lab:** capture pre-post and final output over 16:9, 19.5:9, 4:3, 1:1, 9:16 and narrow portrait.

When all five are deterministic, Level Lab can grow into a recipe-driven native level compiler instead of more one-off patches.
