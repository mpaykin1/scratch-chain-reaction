# Kkrieger — known user-reproduced mobile issues

**Status: 2 OPEN, 1 SOLVED. Physical-device confirmation outranks automated Chromium evidence.**

The user reproduced these on a physical iPhone on 2026-09-29:

## 1. USE does not change the real weapon

Reproduced in both landscape and portrait.

The UI may show W1/W2/W3 changes, but the actual visible in-game weapon does not reliably change. Tests must observe real engine/player weapon state or the rendered weapon, not only DOM state.

## 2. START GAME works intermittently

Reproduced in both landscape and portrait.

The user taps START GAME and sometimes nothing happens; after repeated taps the game eventually starts. Required acceptance: one deliberate tap after ready state starts the game deterministically on physical iOS.

## 3. Portrait 3D scene fullscreen — SOLVED / USER CONFIRMED

The root cause was not CSS. The WASM player forced a centered 2:1 master viewport and a hard-coded projection aspect of 2.0; the full-size postprocess RT path also inherited a 2:1 assumption.

The successful proof uses the full portrait master viewport, derives `Environment->Aspect` from that viewport, and sizes the full postprocess target for portrait.

Proof:
https://mpaykin1.github.io/scratch-chain-reaction/kkrieger-portrait-proof/

Canonical technical recipe:
`KRIEGER_PORTRAIT_FULLSCREEN_PROOF.md`

The public proof passed live CI with a 1170×2532 engine/master viewport and 100% textured-scene height coverage. The user then tested it on the physical iPhone and confirmed that the portrait fullscreen works.

## Important

- Landscape mode is generally good and should not regress.
- Walking joystick works.
- Swipe aiming works in landscape and now also works in portrait according to the user.
- FIRE works.
- Safari browser tabs/address controls are browser chrome, not game UI. Use Add to Home Screen / standalone PWA for chrome-free launch.

Canonical handoff: `KRIEGER_HANDOFF.md`
Canonical public game: https://mpaykin1.github.io/scratch-chain-reaction/kkrieger/


## 4. Custom Level Lab v1 fidelity + weapon path — OPEN / ARCHITECTURAL

Physical iPhone, 2026-09-30:

- black framebuffer solved;
- scene still primitive cuboid test geometry, not accepted as Krieger-quality graphics;
- first-person weapon absent;
- FIRE has no visible shot/effect.

Confirmed causes: `Mesh_Cube + GenMesh::Add` dominates the lab content; the material is minimal; `KKriegerGame::Flush()` clears `WeaponShot/WeaponOptics/WeaponExplode`; the isolated paint path clears native `MeshJobs/EffectJobs`.

This cannot be declared solved by a non-black framebuffer or FIRE input telemetry. Required successor: Native Level Lab v2 + Weapon Lab.

Canonical postmortem: `KRIEGER_LEVEL_LAB_POSTMORTEM_2026-09-30.md`.
