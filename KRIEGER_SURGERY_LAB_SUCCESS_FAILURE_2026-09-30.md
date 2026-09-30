# Krieger Surgery Lab — success + failure analysis after physical iPhone

Status: 2026-09-30  
Authority: physical iPhone visual judgment overrides purely statistical framebuffer gates.

## What succeeded

The Surgery Lab proved a real new capability:

- we can identify a specific native KOp in the converted Krieger graph;
- we can change its runtime parameters inside the real C++/WASM execution path;
- we can keep the original Krieger material/bitmap/scene/effect dependencies alive;
- WeaponOptics and WeaponShot stay bound;
- FIRE reaches the real `KKriegerGame::FireShot`;
- the real portrait renderer remains full-screen on iPhone.

This is materially different from Level Lab v1, where we replaced the authored content path with primitive custom geometry.

The successful architectural pattern is:

```
real KX graph
 -> identify exact KOp/subtree
 -> mutate native operator parameters
 -> keep original downstream dependencies
 -> normal Krieger renderer
```

That pattern should be preserved.

## What failed

The human-visible goal failed.

On the physical iPhone, ORIGINAL and MODIFIED looked effectively the same to the user. The automated test had accepted the experiment because the changed-pixel ratio in the weapon region was measurable (~10%), but the change was too small and too local to communicate meaningful visual control.

This is a test-design failure, not merely a tuning problem.

### Wrong acceptance assumption

The old gate implicitly treated:

```
statistically measurable framebuffer delta
≈
visually obvious controlled transformation
```

That equivalence is false.

A pixel-diff algorithm is sensitive to tiny geometric motion, subpixel shifts, lighting changes and anti-aliasing. A human looking at a physical phone is judging whether the object or scene is clearly different without being told where to look.

## Why the experiment was still useful

It separated two milestones that had been conflated:

### Milestone A — native control

Can we alter a genuine Krieger operator without breaking the source graph?

**PASS.**

### Milestone B — meaningful authoring control

Can we make a deliberate visual change large enough that a person immediately recognizes a new design while the result still looks like Krieger?

**NOT PROVEN by Surgery Lab v1.**

From now on these milestones must never share one PASS flag.

## New human-visible gate

For authoring-control MVPs, a result is not accepted merely because pixel diff passes.

The visible transformation must satisfy all of the following:

1. ORIGINAL and MODIFIED are visually distinct within about one second on a physical phone.
2. The user does not need a highlighted region or explanation to find the change.
3. The changed area is large enough to represent a design decision, not a micro-adjustment.
4. Native material/texture/light quality is preserved.
5. The automated framebuffer diff is used as a regression oracle, not as a substitute for physical-device judgment.

For a **location rebuild** specifically, the automated test should require a large full-frame delta, not only a local region delta.

## Next experiment: Location Rebuild Lab

The correct next MVP is deliberately more aggressive.

Instead of one optics transform, modify a controlled set of native `Scene_Transform` operators that belong to the real gameplay location graph rooted around the world scene branch.

The experiment must:

- leave the renderer/material pipeline native;
- leave the weapon/effect graph alive;
- change dozens of location transforms;
- produce a visibly different corridor/room composition;
- keep ORIGINAL and REBUILT instantly switchable;
- require a large full-frame framebuffer delta;
- preserve >85% portrait scene visibility;
- preserve real FIRE.

This tests whether we can move from “one operator is controllable” to “the layout language of a Krieger-quality location is controllable”.

## Important constraint

The new MVP is a **visual authoring-control proof**, not yet a final replacement-level system.

If runtime Scene_Transform mutation changes render placement but not every collision cell/portal semantic identically, the MVP must say so. Collision topology becomes a separate acceptance item for Native Level Lab v2.

Do not hide this distinction.

## Permanent lesson

A successful graphics-research MVP needs three independent proofs:

```
SOURCE CONTROL PROOF
exact native operator/subgraph changed

RENDER PROOF
expected pixels changed while fidelity survives

HUMAN PROOF
change is obvious and meaningful on physical device
```

The first two can be automated. The third remains final authority.
