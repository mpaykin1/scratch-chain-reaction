# Kkrieger — known user-reproduced mobile issues

**Status: OPEN. Do not mark fixed from automated Chromium evidence alone.**

The user reproduced these on a physical iPhone on 2026-09-29:

## 1. USE does not change the real weapon

Reproduced in both landscape and portrait.

The UI may show W1/W2/W3 changes, but the actual visible in-game weapon does not reliably change. Tests must observe real engine/player weapon state or the rendered weapon, not only DOM state.

## 2. START GAME works intermittently

Reproduced in both landscape and portrait.

The user taps START GAME and sometimes nothing happens; after repeated taps the game eventually starts. Required acceptance: one deliberate tap after ready state starts the game deterministically on physical iOS.

## 3. Portrait 3D scene is not true full-screen

The canvas/UI can occupy the viewport while the real 3D scene still renders as a horizontal strip with large black areas. Existing automated coverage checks have previously produced false PASS results.

Required acceptance: the actual rendered 3D scene visibly fills the portrait gameplay region on a real iPhone.

## Important

- Landscape mode is generally good and should not regress.
- Walking joystick works.
- Swipe aiming works in landscape and now also works in portrait according to the user.
- FIRE works.
- Safari browser tabs/address controls are browser chrome, not game UI. Use Add to Home Screen / standalone PWA for chrome-free launch.

Canonical handoff: `KRIEGER_HANDOFF.md`
Canonical public game: https://mpaykin1.github.io/scratch-chain-reaction/kkrieger/
