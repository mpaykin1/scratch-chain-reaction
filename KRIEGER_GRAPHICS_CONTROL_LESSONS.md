# Krieger Graphics Control — lessons from the successful portrait proof

Status: **CANONICAL LEARNING RECORD**  
Date: 2026-09-30  
Priority: highest  
Physical-device evidence: **portrait proof confirmed working by the user on a real iPhone**

Canonical proof:
https://mpaykin1.github.io/scratch-chain-reaction/kkrieger-portrait-proof/

Canonical solved recipe:
`KRIEGER_PORTRAIT_FULLSCREEN_PROOF.md`

Pinned upstream:
`MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`

---

## 1. What the portrait success actually proved

The important result is not merely that Krieger can fill a vertical phone screen.

The important result is that we successfully controlled one complete graphics chain inside the real Krieger engine:

```text
browser viewport
→ canvas
→ engine ConfigX / ConfigY
→ master viewport
→ projection aspect
→ render-target allocation
→ postprocess path
→ final framebuffer
→ real textured 3D image on a physical iPhone
```

The first failed attempts worked mostly at the outer browser/CSS layer. The successful attempt changed the internal engine policy at the stage where the 2:1 assumption was actually introduced.

That is the model for every future graphics problem.

Do not ask:

> “Which CSS / shader / random renderer value should we change?”

Ask:

> “At which exact stage does the observed image first diverge from the intended image?”

Then instrument that stage and the stages immediately before and after it.

---

## 2. Exact reason the portrait proof succeeded

### Source-level root cause

In `mainplayer.cpp`, the WASM player created the largest centered 2:1 master viewport:

```cpp
sInt bh = sMin(sSystem->ConfigX/2,sSystem->ConfigY);
sInt bw = 2*bh;
...
vp.Window.Init(x0,y0,x0+bw,y0+bh);
```

and forced:

```cpp
Environment->Aspect = 2.0f;
```

Therefore the browser could expose a tall canvas while the actual game camera/render surface remained a shallow horizontal band.

A related 2:1 assumption existed in the full-size render-target allocation in `genoverlay.cpp`.

### Successful engine-level change

Portrait mode now proves these invariants:

```text
master viewport width  == ConfigX
master viewport height == ConfigY
projection aspect      == viewport width / viewport height
full-size RT           can contain the portrait surface
```

Landscape remains on the original composition path.

### Verified public evidence

The successful public proof measured:

- browser viewport: `390×844`
- engine/backing buffer: `1170×2532`
- master viewport: `1170×2532`
- projection aspect: `0.46208531`
- requested full-size RT: `1170×2532`
- allocated RT: `2048×4096`
- real textured scene height coverage: **100%**
- public exact-bytes verification: PASS
- public live re-test: PASS
- physical iPhone user check: PASS

The physical-device confirmation is the final acceptance signal.

---

## 3. Why the failed attempts were useful

The failed attempts exposed four recurring classes of mistake that must now be treated as anti-patterns.

### Anti-pattern A — fixing the outermost layer first

A full-size canvas does not imply a full-size 3D scene.

A page can be:

```text
CSS fullscreen = PASS
canvas size = PASS
WebGL context = PASS
actual internal scene viewport = FAIL
```

Therefore canvas geometry is necessary evidence, not sufficient evidence.

### Anti-pattern B — changing a later stage while an earlier stage is already wrong

Changing postprocess, CSS, or final blit cannot correctly repair a camera/master viewport that was already forced to 2:1 upstream.

Always find the **first divergent stage**.

### Anti-pattern C — measuring “non-black” instead of intended visual structure

A mostly flat wall, a DOM overlay, or an incorrectly composed frame can make a screenshot non-black while still proving nothing about useful 3D output.

Visual gates must distinguish:

- genuine 3D structure;
- flat fills;
- DOM overlays;
- accidental bands;
- actual camera response.

### Anti-pattern D — trusting synthetic success over the physical device

Synthetic Chromium is a diagnostic tool.

A physical iPhone result can invalidate a synthetic PASS.

This rule is permanent.

---

## 4. The graphics-control method learned from portrait

For every visible Krieger element, future work must build an evidence chain:

```text
DATA
→ GENERATOR
→ RUNTIME OBJECT
→ CPU JOB
→ GPU PASS
→ MATERIAL / SHADER
→ DEPTH + COLOR TARGETS
→ POSTPROCESS
→ VIEWPORT
→ CANVAS
→ PHYSICAL DEVICE
```

Every stage must answer four questions:

1. **What object enters this stage?**
2. **What transformation does the stage perform?**
3. **What dimensions/state/material/pass leave the stage?**
4. **How do we prove this result independently?**

If we cannot answer those four questions, we do not yet control that stage.

---

## 5. Graphics Control Ladder

The next goal is not another monolithic level demo. It is a sequence of small deterministic labs.

### Level 1 — Mesh Control

Goal: prove that we can create and deliberately modify geometry.

Source focus:

- `genmesh.cpp`
- `genmesh.hpp`
- `genminmesh.cpp`
- `EngMesh::FromGenMesh`
- `EngMesh::FromGenMinMesh`
- vertex/index buffer creation

Required proof:

```text
recipe
→ GenMesh
→ known vertex/face counts
→ known normals/UV/tangent/color streams
→ EngMesh
→ draw job
→ visible asymmetric 3D object
```

The object must be asymmetric so a wrong camera or mirrored transform cannot hide behind symmetry.

Acceptance:

- topology counts are known;
- normals are known;
- object rotates and shows parallax;
- no imported conventional model is used;
- screenshot changes meaningfully after real camera rotation.

### Level 2 — Material Control

Goal: prove that we understand why a surface looks the way it does.

Source focus:

- `genmaterial.cpp`
- `GenMaterial::AddPass`
- `materials/*`
- `wasm/shader_translate.cpp`
- `engine.cpp`
- `wasm/render2004.cpp`

Required isolated modes:

1. base/depth only;
2. base + light;
3. base + light + postlight/environment;
4. emissive/blended case.

Acceptance:

- each pass can be enabled/disabled intentionally;
- framebuffer difference is measurable;
- depth state and blend state are recorded;
- material pass provenance is machine-readable.

Permanent 2004 invariant:

> an `ENGU_LIGHT` pass with depth compare EQUAL and no earlier matching depth/base pass can render nothing.

This failure has already been observed and must never be rediscovered from scratch.

### Level 3 — Light Control

Goal: prove spatial lighting response.

Source focus:

- `EngLight`
- `Engine_::AddLightJob`
- light selection/frustum code
- Breakpoint-2004 lighting path
- shadow jobs / shadow volumes

Experiment:

- one fixed mesh;
- one movable light;
- known color/range/amplify;
- sweep light through a deterministic path.

Acceptance:

- measured light position corresponds to visible shading change;
- normal direction changes response correctly;
- disabling the light removes only its contribution;
- shadow path is separable from base shading.

### Level 4 — Scene Control

Goal: stop injecting isolated renderer jobs and author through Krieger's real scene abstractions.

Target path:

```text
GenMesh
→ MakeScene
→ GenScene
→ transforms
→ Sector
→ Portal
→ Light / Ambient
→ Engine sector/portal/light jobs
→ visibility/frustum
→ renderer
```

Source focus:

- `genscene.cpp/.hpp`
- `MakeScene`
- `ExecSceneInput`
- `Exec_Scene_Sector`
- `Exec_Scene_Portal`
- `Exec_Scene_Light`
- `Engine_::AddSectorJob`
- `Engine_::AddPortalJob`
- portal visibility/frustum code

Acceptance:

- two visually distinct rooms;
- one real portal;
- crossing portal changes current/visible sector state;
- hidden room stops producing the expected render work;
- same authored scene provides collision where possible.

### Level 5 — Postprocess Control

Goal: explain the final look after scene rendering.

Source focus:

- `genoverlay.cpp/.hpp`
- render-target manager
- IPP operators
- blur/merge/copy
- final viewport/blit

Required proof:

- capture pre-postprocess target;
- capture final target;
- identify which operator changes which visual property;
- preserve correct aspect ratios through every target.

The portrait proof is the first successful Postprocess/Viewport Lab result.

### Level 6 — Camera / View Control

Goal: intentionally frame geometry instead of accidentally looking into a flat wall.

Required telemetry:

- player/camera position;
- yaw/pitch;
- projection aspect;
- view matrix;
- near/far;
- current sector/cell;
- visible object bounds.

Acceptance:

- a known authored object appears at a predicted screen location;
- camera rotation causes predicted parallax;
- no “flat frame but technically non-black” result can pass.

---

## 6. Krieger Observatory requirements for graphics control

The Observatory should eventually expose these live channels:

### Geometry

- source generator/operator;
- GenMesh / GenMinMesh identity;
- vertex count;
- face/triangle count;
- material slots;
- normals;
- tangents;
- UV channels;
- color streams;
- animation mode;
- bounding box.

### Material

- material identity;
- usage;
- pass index;
- base/light/shadow/postlight classification;
- depth test/write;
- blend mode;
- shader/program identity;
- bound textures.

### Renderer

- MeshJobs;
- EffectJobs;
- PaintJobs;
- selected lights;
- shadows;
- draw calls;
- index/vertex counts;
- current render target;
- current viewport.

### Scene

- scene node;
- transform;
- sector;
- portal links;
- observer sector;
- visible sectors;
- frustum decisions.

### Postprocess

- input target;
- output target;
- target dimensions;
- operator type;
- final blit rectangle.

Selecting one object should eventually display:

```text
generator
→ generated mesh
→ material slots
→ scene node
→ sector
→ render job
→ material pass
→ shader
→ render target
→ final pixels
```

That is the operational definition of “control over Krieger graphics”.

---

## 7. Mandatory test philosophy

Every graphics lab needs **two independent oracles**.

### Structural oracle

Machine-readable engine facts:

- counts;
- IDs;
- transforms;
- passes;
- dimensions;
- states;
- selected jobs.

### Visual oracle

The actual framebuffer:

- non-flat structure;
- luminance variance;
- edge density;
- multiple color buckets;
- camera-response difference;
- expected occupied regions;
- no DOM overlays during capture.

Neither oracle can replace the other.

A renderer can have perfect internal state and still produce black pixels.

A screenshot can look plausible while being produced by the wrong path.

---

## 8. Next-chat mission

A new chat continuing Krieger graphics research should **not start by changing the full game**.

It should continue in this order:

1. read:
   - `KRIEGER_HANDOFF.md`
   - `KRIEGER_TOTAL_CONTROL.md`
   - `KRIEGER_PORTRAIT_FULLSCREEN_PROOF.md`
   - `KRIEGER_RENDERER_FORENSICS.md`
   - this file;
2. inspect current `main` before trusting any historical SHA;
3. reproduce the portrait proof only as a known-good reference;
4. build **Mesh Lab** with one asymmetric procedural object;
5. add exact geometry provenance;
6. build **Material Lab** with explicit base/light/post pass toggles;
7. build **Light Lab**;
8. move to native `GenScene / Sector / Portal` authoring;
9. add pre/post-process target capture;
10. only after deterministic labs exist, use those technologies in a new full level or World Server generator.

Do not jump directly from “portrait works” to “we understand Krieger graphics”.

Portrait proves the method.

The next task is to apply the same method recursively to every graphics subsystem.

---

## 9. Handoff prompt for another chat

```text
Continue Krieger Total Control from the canonical repository:

https://github.com/mpaykin1/scratch-chain-reaction

First read:
KRIEGER_HANDOFF.md
KRIEGER_TOTAL_CONTROL.md
KRIEGER_PORTRAIT_FULLSCREEN_PROOF.md
KRIEGER_GRAPHICS_CONTROL_LESSONS.md
KRIEGER_RENDERER_FORENSICS.md
KRIEGER_LEVEL_AUTHORING_CONTRACT.md

The portrait fullscreen proof is a user-confirmed success on a physical iPhone:
https://mpaykin1.github.io/scratch-chain-reaction/kkrieger-portrait-proof/

Do not rediscover portrait with CSS hacks.

The important lesson is the method:
find the first divergent stage in
DATA -> GENERATOR -> RUNTIME OBJECT -> CPU JOB -> GPU PASS
-> MATERIAL/SHADER -> FRAMEBUFFER -> POSTPROCESS -> VIEWPORT -> CANVAS.

Your next priority is greater control over Krieger graphics.

Build deterministic labs in this order:
Mesh Lab -> Material Lab -> Light Lab -> native Scene/Sector/Portal Lab
-> Postprocess Lab.

For every lab:
- use the real C++/WASM Krieger path;
- cite exact upstream files/symbols;
- expose machine-readable engine state;
- capture the real framebuffer with DOM overlays hidden;
- require both structural and visual acceptance;
- preserve the physical-device truth rule;
- update canonical docs with every verified finding;
- do not claim understanding from filenames or synthetic PASS alone.

Goal:
be able to explain and deliberately modify the origin of visible Krieger pixels,
then extract useful capabilities into World Server.
```

---

## 10. World Server extraction consequence

The portrait success gives the first reusable graphics-control pattern for World Server:

```text
measure all layers
→ locate first divergence
→ change the owning subsystem
→ assert intermediate invariants
→ assert final pixels
→ verify on physical target
```

Classifications learned here:

- old fixed 2:1 viewport policy: `KRIEGER-ONLY`
- responsive viewport policy: `REIMPLEMENT`
- forensics chain: `REUSE`
- aspect-ratio torture tests: `REUSE`
- structural + framebuffer dual oracle: `REUSE`
- physical-device override rule: `REUSE`

This methodology should become part of the World Server procedural 3D quality system.
