# Living Light Cat — articulated systems handoff

Date: 2026-10-01
Live MVP: https://mpaykin1.github.io/scratch-chain-reaction/living-light-cat/
Current implementation head: `f33cf465f5c58bb661028552d953bade5dd0285f`

## Implemented systems

1. `CatRig2D` — lightweight articulated silhouette rig with a dedicated head pivot and tail root.
2. `IdleBehaviorController` — explicit behavior channels for head turn, head tilt, breathing, tail swing, tail curl and tail phase.
3. `TailSpline` — Catmull-Rom centerline converted into a tapered ribbon silhouette, with delayed wave motion toward the tip.
4. `SilhouetteRebuilder` — rebuilds the body/head outline every frame from rig pose data.
5. `PoseConstraints` — clamps unsafe pose ranges and supplies mobile viewport layout.
6. `Tuner` — optional `?debug=1` pose sliders for manual tuning.
7. Deterministic QA poses — `?qa=head-left`, `?qa=head-right`, `?qa=tail-left`, `?qa=tail-right`.

## What changed relative to MVP v1

- The head now changes underlying silhouette geometry instead of only changing light.
- The tail is no longer a leftover terminal stroke. It is its own thick spline/ribbon shape.
- Tail motion has phase lag toward the tip, so it bends instead of translating rigidly.
- The tail root is buried inside the body so the attachment seam is hidden.
- The tail loop was compressed and the composition shifted so extreme poses remain visible in an iPhone portrait viewport.
- Whiskers follow the articulated head.

## QA evidence

- GitHub Pages deployment: PASS.
- Repository release gates: PASS.
- Portrait viewport used for deterministic screenshots: 390×844.
- `head-left` vs `head-right`: visibly different head/ear/muzzle orientation.
- `tail-left` vs `tail-right`: visibly different tail loop position/shape.
- Tail loop remains visible in portrait after the final geometry fix.

## Validation status

Implementation and automated/visual QA pass. Product acceptance is intentionally still pending physical-device/user confirmation.

Do not mark the previous animation/tail failures as resolved success until the user confirms the live behavior on the target phone.