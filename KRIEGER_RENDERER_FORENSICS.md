# Krieger renderer forensics — canonical invariants

Status date: 2026-09-29  
Scope: the Emscripten/WebGL2 port built from `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`.

This file records renderer facts that must survive across chats, agents, ports and World Server extraction. Treat a physical-device result as stronger evidence than a synthetic browser pass.

## 1. 2004 lighting requires a base/depth pass first

The Breakpoint-2004 render path is not “draw mesh + light”. Its light setup uses:

- depth test enabled;
- depth writes disabled;
- depth comparison `EQUAL`;
- additive blending for lighting.

Therefore an `ENGU_LIGHT` pass only becomes visible if an earlier base/depth pass has already populated the depth buffer at exactly the same surface.

### Level Lab failure learned from this

The first custom `bridge-chamber-v1` Level Lab mesh inherited `GenOverlayManager->DefaultMat`. That default material exposes only an `ENGU_LIGHT` pass. The custom mesh and player/collision simulation were alive, but the 2004 light pass had no matching depth and every visible fragment failed `ZFUNC=EQUAL`. Result: a working black scene.

Correct contract for custom Krieger geometry:

```
procedural GenMesh
  -> GenMaterial
     -> ENGU_BASE  (Z write / base colour)
     -> ENGU_LIGHT (Z read + EQUAL / additive real lighting)
  -> EngMesh::FromGenMesh
  -> Engine::AddPaintJob
  -> Paint2004 / RenderPaintJobs2004
```

Do not “fix” this class of bug with CSS, a bright DOM overlay, or by bypassing the real renderer.

## 2. Visual tests must prove the framebuffer, not the page

The original Level Lab CI made a false-positive mistake. It captured the canvas rectangle from the composited browser page while HTML controls were drawn over that rectangle. A cyan diagnostics badge at the top plus joystick/buttons near the bottom caused an algorithm based on first/last active scanline to report about 96% visual-height coverage even though the WebGL scene itself was black.

Permanent testing rule:

1. hide all DOM controls/diagnostics before visual capture;
2. capture the 3D canvas region;
3. inspect central framebuffer luminance/non-black ratio/variation;
4. fail on a black or flat framebuffer;
5. separately assert renderer-state invariants such as base + light passes;
6. separately assert simulation/input, viewport, aspect and render-target dimensions.

Never accept “canvas exists”, “WebGL context exists”, DOM labels, or movement telemetry as proof that 3D pixels are visible.

## 3. Portrait truth chain

Portrait correctness is a multi-stage invariant, not CSS:

```
physical/CSS viewport
 -> canvas CSS size
 -> canvas backing buffer
 -> engine ConfigX/ConfigY
 -> master viewport
 -> projection aspect
 -> full-size render target
 -> postprocess
 -> final framebuffer
```

For the proven portrait path, the master viewport is the full portrait surface, `Environment->Aspect` comes from that viewport, and the full-size postprocess render target is sized for portrait rather than inheriting the old 2:1 assumption.

## 4. Debugging discipline for Krieger Total Control

For every new renderer bug, establish the chain:

```
DATA -> GENERATOR -> RUNTIME OBJECT -> CPU JOB -> GPU PASS
-> SHADER/MATERIAL -> DEPTH/COLOR TARGET -> POSTPROCESS -> VIEWPORT -> CANVAS
```

For every input/gameplay bug:

```
INPUT -> browser event -> WASM boundary -> game state -> simulation
-> animation/effect -> renderer
```

A test is valid only if it measures the stage being claimed. Evidence from a later or unrelated stage must not substitute for it.

## 5. World Server extraction classification

Each Krieger capability should eventually be classified as:

- `REUSE`
- `ADAPT`
- `REIMPLEMENT`
- `KRIEGER-ONLY`
- `OBSOLETE`

and mapped as:

`capability -> source files -> dependencies -> input -> output -> constraints -> license/provenance -> World Server equivalent -> regression test -> status`.

This renderer invariant is the first concrete entry in the Krieger Total Control knowledge base.
