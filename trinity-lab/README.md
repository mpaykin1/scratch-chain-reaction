# World Server — Trinity Lab

Diagnostic integration MVP: one TrinitySceneRecipe and one deterministic seed drive KRIEGER, INK and CUBE adapters.

## What is real

- Shared semantic recipe: terrain, tower, bridge, vegetation, worker and local light.
- CUBE: physical seed cube -> split -> move -> settle -> vegetation -> extrusion/attachment -> merge -> materials/light/life.
- INK: live WebGL scene, semantic strokes, Living Watercolor materials/outlines/paper compositor. Camera remains interactive.
- Viewport Lock: VisualViewport -> CSS canvas -> DPR backing buffer -> WebGL viewport -> camera aspect.
- Existing Graphics Quality Governor consumes runtime geometry/light/performance evidence.

## Honest gaps

- Native Krieger custom-scene authoring is MISSING. KRIEGER mode is the current World Server procedural 3D fallback, not a fake claim that GenScene authoring is solved.
- Character and animation are PARTIAL: articulated procedural worker, not the full extracted Krieger rig/animation system.
- FX are PARTIAL.
- INK remains draw-call heavy because Living Watercolor uses three animated outline shells per mesh.
- Physical iPhone validation is still user verification required.

## Findings retained

1. Living Ink NPR and mandatory Viewport Lock initially disagreed on DPR (1.7 vs device DPR 3). The fix makes Viewport Lock the DPR owner.
2. Per-cell terrain caused the Governor performance gate to fail at 253 draw calls. Shared terrain batching reduced KRIEGER to about 77 draw calls in local Chrome smoke.
3. CUBE now records real move and merge operations instead of advertising them without implementation.
4. The useful next blocker is native Krieger scene/material authoring from the same semantic recipe.

See provenance.json, test/trinity-lab.test.mjs, and tools/trinity-lab-smoke.mjs.
