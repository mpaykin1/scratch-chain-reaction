# Krieger KX archaeology baseline — quantified real beta graph

Status: 2026-09-30  
Pinned upstream: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`  
Analyzed payload: `werkkzeug3_kkrieger/data/kkrieger_beta_conv.kx`

This is the first quantitative inventory of the actual converted .kkrieger beta operator graph. It replaces intuition about “Krieger style” with measurable source data.

## Graph size

Parsed with the repository's own KX layout (`wasm/tools/kxread.py` semantics):

- file size: **125,382 bytes**
- operators: **4,817**
- classes present: **77**
- splines: **38**
- game root: operator 4816 for intro/menu/game slots in the converted beta

The important conclusion is immediate: the visual result is not produced by a few primitive meshes. It is a large procedural dependency graph.

## Most frequent operators in the real beta

Counts below are operator instances in `kkrieger_beta_conv.kx`.

| Operator | Count |
|---|---:|
| Mesh_Transform | 621 |
| Scene_Transform | 335 |
| Mesh_MatLink | 283 |
| Mesh_Cube | 224 |
| Mesh_Multiply | 218 |
| Bitmap_HSCB | 201 |
| Bitmap_Merge | 178 |
| Mesh_Add | 172 |
| Mesh_TransformEx | 162 |
| Scene_Add | 160 |
| Mesh_Color | 156 |
| Bitmap_GlowRect | 150 |
| Bitmap_Flat | 142 |
| Mesh_Bend | 123 |
| Scene_Scene | 94 |
| Bitmap_Rotate | 81 |
| Scene_Multiply | 77 |
| Material_Material | 75 |
| Mesh_AutoCollision | 73 |
| Mesh_UVProjection | 69 |
| Bitmap_Normals | 68 |
| Mesh_CollisionCube | 52 |
| Scene_Light | 49 |
| Scene_Sector | 47 |
| Mesh_ShadowEnable | 46 |
| Mesh_Cylinder | 39 |
| Mesh_Subdivide | 36 |
| Scene_Portal | 35 |
| Mesh_Bend2 | 33 |
| Mesh_LightSlot | 21 |
| Scene_Physic | 16 |
| Mesh_Extrude | 10 |
| Mesh_Displace | 4 |
| Mesh_Perlin | 2 |
| Mesh_Triangulate | 1 |

`Mesh_Cube` is genuinely important, but the real game surrounds those cubes with hundreds of transforms, material links, bitmap generators, UV projection, bends, collision synthesis, scene composition, sectors/portals and lighting.

That is the precise reason the Level Lab v1 formula “29 cubes + one minimal material” looked nothing like Krieger even while using the real renderer.

## Scene topology is a first-class part of the graph

The beta contains:

- 94 Scene roots/wrappers;
- 160 Scene_Add operators;
- 77 Scene_Multiply operators;
- 335 Scene_Transform operators;
- 49 Scene_Light operators;
- 47 Scene_Sector operators;
- 35 Scene_Portal operators;
- 16 Scene_Physic operators;
- 10 Scene_Camera operators.

Therefore a native custom level must not collapse the whole world to a single `EngMesh` and expect equivalent behavior or visuals.

## Material/texture evidence

The graph contains, among other things:

- 283 Mesh_MatLink;
- 75 material operators;
- 69 Mesh_UVProjection;
- 68 Bitmap_Normals;
- 201 HSCB color adjustments;
- 178 bitmap merges;
- 150 glow-rectangle generators;
- 142 flat bitmap sources;
- dozens of blur/rotate/color/perlin/range operations;
- 46 Mesh_ShadowEnable.

This is strong source evidence that Krieger's visual identity comes from the composition of geometry and procedural texture/material chains, not from polygon count alone.

## Exact weapon binding operators

The converted beta contains four `KKrieger_Events` operators.

### Mode 1 — first-person optics

Operator 725 binds:

- weapon 0 -> event op 224
- weapon 1 -> event op 342
- weapon 2 -> event op 581
- weapon 3 -> null
- weapon 4 -> event op 643
- weapon 5 -> null
- weapon 6 -> event op 724
- weapon 7 -> null

### Mode 0 — shot events

Operator 869 binds:

- weapon 0 -> event op 744
- weapon 1 -> event op 758
- weapon 2 -> event op 779
- weapon 3 -> null
- weapon 4 -> event op 836
- weapon 5 -> event op 884
- weapon 6 -> event op 868
- weapon 7 -> event op 905

### Modes 2 and 3 — explosion/hit event families

Operators 926 and 916 provide eight non-null links each.

This validates the source-level conclusion in `KRIEGER_WEAPON_PIPELINE.md`: weapon rendering and firing are authored KOp graphs.

## How complex is a visible weapon?

Dependency traversal from the optics event roots gives:

| Weapon slot | Optics root | Reachable operators |
|---|---:|---:|
| 0 | 224 | 224 |
| 1 | 342 | 293 |
| 2 | 581 | 362 |
| 4 | 643 | 232 |
| 6 | 724 | 297 |

These dependency sets contain many bitmap generators, merges, HSCB/color operations, normal-map generation, mesh transforms, MatLink, UVProjection, bends and other operators.

For example, weapon 2's optics graph reaches **362 operators**, including 29 Mesh_Transform, 17 Mesh_MatLink, 10 Mesh_Cylinder, 9 Mesh_Bend plus a large procedural bitmap network.

A first-person gun in Krieger is therefore not “one weapon mesh”. It is a procedural program.

## How complex is a shot?

Reachable operators from shot event roots:

| Weapon slot | Shot root | Reachable operators |
|---|---:|---:|
| 0 | 744 | 19 |
| 1 | 758 | 20 |
| 2 | 779 | 21 |
| 4 | 836 | 59 |
| 5 | 884 | 20 |
| 6 | 868 | 63 |
| 7 | 905 | 22 |

Even small shot graphs include combinations such as:

- particle emitter;
- procedural bitmap;
- mesh + material link;
- scene wrapper/add/multiply/transform;
- light;
- sometimes scene physics.

So clearing `EffectJobs` or bypassing event graph execution is fundamentally incompatible with faithful weapon behavior.

## Player parameter evidence

Two `KKrieger_Para` operators exist in the converted graph.

The main early parameter op at index 0 has:

- initial weapon ownership mask: 1;
- player start: approximately `(0, 1.75, -21)`.

Another parameter op appears much later in the graph with a different mask/context. The important point is that loadout/start/physics are graph data and should be preserved rather than re-created ad hoc.

## New control principle

For full Krieger control, our unit of reuse must become the **operator recipe/subgraph**, not only C++ functions.

We need APIs that can:

1. identify a source KOp subtree;
2. clone or parameterize it;
3. replace selected geometry/world roots while keeping shared weapon/effect/material subgraphs;
4. inspect generated GenMesh/GenMaterial/GenScene products;
5. preserve sector/portal/physics semantics;
6. emit deterministic provenance so every visible object can be traced back to its operator recipe.

## Immediate next experiments

### Geometry Recipe Lab

Take one actual geometry subgraph from the beta and replay it with changed parameters. PASS only if the output uses the same operator family and remains recognizably Krieger-like.

### Material Recipe Lab

Take one real MatLink/material/bitmap dependency subtree, replay it on a new mesh, and prove UV/normal/procedural texture behavior.

### Weapon Optics Lab

Start with optics root 224 (weapon 0). Preserve its whole dependency graph and render it over a minimal custom scene without clearing native jobs.

### Weapon Shot Lab

Start with shot root 744. Prove the whole event path including particle/light/render behavior and collision.

### Native Sector Lab

Clone a minimal real `Scene_Sector + Scene_Portal` arrangement and substitute our authored room geometry inside that structure.

## Acceptance correction

From now on, “Krieger-level graphics” means we can control and reuse the **same classes of operator subgraphs that the real 4,817-op beta uses**, not merely call the same renderer.

This quantitative baseline is the standard against which Native Level Lab v2 is measured.
