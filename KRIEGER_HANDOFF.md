# KKRIEGER HANDOFF — canonical browser build

Status date: 2026-09-29  
Canonical repository: https://github.com/mpaykin1/scratch-chain-reaction  
Canonical branch: `main`  
Runtime implementation baseline: `d0293fec1f0068fc5f8486ad0d72db8a8ef3a939`  
Runtime feature merge before generated publish commit: `66e975452a29476bc5f35268675fa98af42ea6a8`  
Permanent public URL: https://mpaykin1.github.io/scratch-chain-reaction/kkrieger/  
Published file in repository: `kkrieger/index.html`  
Deployment source: GitHub Pages from repository `main`; workflow copies the verified single-file build into `kkrieger/index.html`.

## Read this before changing anything

The browser build is a real C/C++ .kkrieger / werkkzeug3 port compiled with Emscripten to WebAssembly/WebGL2. It is NOT the earlier JavaScript/raycaster imitation.

The build is based on:

- upstream: `MasonDye/kkrieger-wasm`
- pinned upstream commit: `3bf0ff017372e640e966c2785a4d95a998cec242`
- Emscripten: `6.0.9`
- original source family: farbrausch / .theprodukkt werkkzeug3 / .kkrieger
- packaging: one autonomous HTML using `-sSINGLE_FILE=1` and `--embed-file`

Do not replace this with a JavaScript imitation or a new engine unless explicitly requested.

Highest-priority Krieger Total Control program:
- `KRIEGER_TOTAL_CONTROL.md`
- `KRIEGER_LEVEL_AUTHORING_CONTRACT.md`
- `KRIEGER_RENDERER_FORENSICS.md`

These documents separate the current renderer-isolation Level Lab from the target native `GenScene -> Sector -> Portal -> Light -> Engine jobs` authoring path.

Renderer forensics and permanent invariants learned from the Level Lab black-screen failure:
`KRIEGER_RENDERER_FORENSICS.md`

Physical-iPhone fidelity/weapon failure ledger (mandatory before any new custom-level claim):
`KRIEGER_FAILURE_LEDGER.md`

## Mobile status — physical-device truth

The user's physical iPhone result overrides synthetic Chromium evidence.

Portrait fullscreen is now **SOLVED AND USER-CONFIRMED**. The canonical recipe and proof are in:
`KRIEGER_PORTRAIT_FULLSCREEN_PROOF.md`

Two issues remain OPEN:

1. **USE does not reliably change the actual in-game weapon.**
   - Reproduced in portrait and landscape.
   - The overlay label may change while the real weapon does not.
   - Do not treat a DOM label change or synthetic pointer event as proof.
   - Acceptance requires visible in-game weapon change on a real mobile device, or a lower-level engine-state proof tied to the actual `Player.CurrentWeapon` / `Player.NextWeapon`.

2. **START GAME works intermittently.**
   - Reproduced in portrait and landscape.
   - User reported tapping repeatedly before the game suddenly started.
   - Do not treat a headless Chromium click as sufficient proof.
   - Acceptance requires deterministic one-tap start after the button becomes ready on real iOS Safari / standalone PWA.

3. **Portrait fullscreen — SOLVED / USER CONFIRMED.**
   - Root cause: the WASM player forced a centered 2:1 master viewport and `Environment->Aspect = 2.0f`; full-size postprocess allocation also followed the 2:1 assumption.
   - Correct fix: in portrait, use the full `ConfigX × ConfigY` master viewport, derive projection aspect from that viewport, and allow the full-size postprocess target to hold portrait dimensions.
   - Public proof: https://mpaykin1.github.io/scratch-chain-reaction/kkrieger-portrait-proof/
   - CI measured 1170×2532 engine + master viewport, aspect 0.46208531 and 100% textured scene height coverage.
   - The user then tested the public proof on the physical iPhone and confirmed it works.
   - Full technical recipe: `KRIEGER_PORTRAIT_FULLSCREEN_PROOF.md`

The remaining USE and START reports take precedence over synthetic smoke-test PASS results.

## What currently works according to the user

- Graphics quality is considered good.
- Landscape gameplay is generally playable.
- Mobile walking joystick works.
- Swipe-to-look / aiming works in landscape.
- After later changes, swipe-to-look also works in portrait.
- FIRE works.
- The live public URL works and the real WebAssembly game renders.

## Safari / iOS browser chrome

The tabs, address bar, back/share controls visible around the game in Safari are browser UI, not game UI. A normal web page cannot permanently hide all Safari chrome. The current shell includes iOS standalone/PWA metadata so the same URL can be launched from **Add to Home Screen** without normal Safari tab/address chrome.

Do not claim that a normal Safari tab can programmatically remove the browser's own UI.

## Canonical repository files

Runtime/build integration in this repository:

- `tools/kkrieger-wasm/build-singlefile.sh`
  - checks the pinned upstream checkout
  - applies mobile/browser patches
  - switches preload files to embedded files
  - enables `SINGLE_FILE`
  - embeds license notices
  - produces `work/kkrieger-singlefile/kkrieger_standalone.html`

- `tools/kkrieger-wasm/patch-mobile.py`
  - patches the upstream browser shell and C++ input bridge
  - mobile touch UI
  - mobile resize
  - portrait-related render-target / viewport modifications
  - START GAME behavior
  - iOS standalone metadata
  - USE / weapon-cycle behavior

- `tools/kkrieger-wasm/browser-smoke.mjs`
  - desktop/file/HTTP compositor smoke test
  - WebGL2
  - runtime activity
  - visible/non-flat frame

- `tools/kkrieger-wasm/mobile-smoke.mjs`
  - synthetic mobile portrait/landscape test
  - touch controls
  - rotation
  - current portrait coverage heuristic
  - IMPORTANT: this test has produced false confidence relative to the physical iPhone bugs above

- `tools/kkrieger-wasm/verify-singlefile.mjs`
  - verifies one-file packaging and absence of runtime sidecars

- `.github/workflows/kkrieger-standalone.yml`
  - reproducible build
  - browser tests
  - artifact upload
  - production copy to `kkrieger/index.html`
  - exact-live-bytes check
  - live browser smoke

- `kkrieger/index.html`
  - generated production artifact
  - do not hand-edit; change the patch/build pipeline and regenerate

## Important upstream engine files

Inside the pinned `MasonDye/kkrieger-wasm` checkout:

- `werkkzeug3_kkrieger/genmesh.cpp` — procedural mesh generation
- `werkkzeug3_kkrieger/genminmesh.cpp` — compact/minimal mesh operators
- `werkkzeug3_kkrieger/genbitmap.cpp` — procedural bitmap / texture generation
- `werkkzeug3_kkrieger/genmaterial.cpp` — materials
- `werkkzeug3_kkrieger/materials/*` — material/shader source family
- `werkkzeug3_kkrieger/wasm/shader_translate.cpp` — shader translation for WebGL path
- `werkkzeug3_kkrieger/genscene.cpp` — scene graph / scene operators
- `werkkzeug3_kkrieger/geneffect.cpp` — effects
- `werkkzeug3_kkrieger/genoverlay.cpp` — render targets, overlays, post-processing, viewport logic
- `werkkzeug3_kkrieger/engine.cpp` — core renderer/engine path
- `werkkzeug3_kkrieger/kkriegergame.cpp` — game logic, input handling, weapons, player state
- `werkkzeug3_kkrieger/kkriegergame.hpp` — game/player structures
- `werkkzeug3_kkrieger/kdoc.cpp` / `kdoc.hpp` — document/runtime environment and game linkage
- `werkkzeug3_kkrieger/v2/*` — V2 procedural audio
- `werkkzeug3_kkrieger/wasm/v2_bridge.cpp` — browser audio bridge
- `werkkzeug3_kkrieger/wasm/_start_wasm.cpp` — SDL/browser system/input/video bridge
- `werkkzeug3_kkrieger/wasm/shell.html` — upstream HTML shell
- `werkkzeug3_kkrieger/data/kkrieger_beta_conv.kx` — converted Breakpoint 2004 beta data
- `werkkzeug3_kkrieger/data/kkrieger3383.kx` — later development snapshot

The default browser shell starts the Breakpoint 2004 beta data. The `?data=3383` query path selects the alternate snapshot supported by the upstream shell.

## Mobile input implementation notes

The browser patch currently exposes C-callable WASM bridge functions in `_start_wasm.cpp`:

- `kkMobileKey(code, down)`
- `kkMobileFire(down)`
- `kkMobileLook(dx, dy)`
- `kkMobileResize(w, h)`

They feed the same input buffers / mouse deltas used by the real C++ game.

Relevant real weapon handling is in `kkriegergame.cpp`:

- digit key processing maps through `weaponswap`
- `Player.NextWeapon`
- `Player.CurrentWeapon`
- `WeaponTimer`
- beginning inventory has only a limited set of weapons enabled

A correct USE fix must prove that the real game state changes, not only `window.__kkWeapon` or the W-label.

## Build commands

From the `scratch-chain-reaction` repository root, with the pinned upstream checkout available at `.upstream/kkrieger-wasm` and Emscripten 6.0.9 configured:

```bash
bash tools/kkrieger-wasm/build-singlefile.sh .upstream/kkrieger-wasm
node tools/kkrieger-wasm/verify-singlefile.mjs work/kkrieger-singlefile/kkrieger_standalone.html
```

For browser smoke testing:

```bash
npm install --no-save --ignore-scripts --no-audit --no-fund playwright@1.63.0 pngjs@7.0.0
node node_modules/playwright/cli.js install chromium
python3 -m http.server 8765 --bind 127.0.0.1 --directory work/kkrieger-singlefile
KK_URL=http://127.0.0.1:8765/kkrieger_standalone.html node tools/kkrieger-wasm/browser-smoke.mjs
KK_URL=http://127.0.0.1:8765/kkrieger_standalone.html node tools/kkrieger-wasm/mobile-smoke.mjs
```

The GitHub workflow is the canonical reproducible build path if local Emscripten is unavailable.

## Production workflow

`.github/workflows/kkrieger-standalone.yml`:

1. checks out this repository
2. checks out the pinned upstream kkrieger-wasm SHA
3. installs Emscripten 6.0.9
4. builds one autonomous HTML
5. verifies no runtime sidecars
6. runs direct `file://` smoke
7. runs HTTP desktop smoke
8. runs synthetic mobile portrait/landscape smoke
9. uploads the artifact
10. on `main`, copies the result to `kkrieger/index.html`
11. commits the generated file with `build(kkrieger): publish verified standalone HTML [skip ci]`
12. waits until GitHub Pages serves the exact same bytes
13. runs live desktop/mobile smoke tests

The production workflow for the current runtime completed successfully, including exact-live-bytes and live mobile/browser smoke. This DOES NOT override the physical-iPhone bug reports above.

## Recent Scratch PR history

- PR #29 — true single-file WebAssembly browser port
- PR #30 — mobile fullscreen controls
- PR #31 — portrait/aim/USE changes
- PR #32 — iOS viewport/start/USE follow-up

All are in:
https://github.com/mpaykin1/scratch-chain-reaction/pulls

## World Server integration

World Server repository:
https://github.com/mpaykin1/World_server

Open integration PR:
https://github.com/mpaykin1/World_server/pull/355

Current PR head at handoff time:
`be30bfe5b6559679fb1ba448d5fc579090950e13`

That PR adds a reproducible kkrieger WebAssembly single-file bridge and maps the procedural engine subsystems for World Server. It is not the canonical public-game deployment; the public game is owned by `scratch-chain-reaction`.

## Licensing/provenance

The build retains license notices in the generated autonomous HTML.

Important provenance:

- farbrausch / .theprodukkt werkkzeug3 / .kkrieger source: BSD-style license in upstream `LICENSE.txt`
- MojoShader: license in upstream `wasm/mojoshader/LICENSE.txt`

Do not strip those notices.

## What is real vs prototype

REAL / currently present:

- original C/C++ kkrieger/werkkzeug3 code path
- Emscripten WebAssembly
- WebGL2 browser rendering
- embedded procedural game data in one HTML
- procedural mesh/texture/material/scene/effect systems from the upstream engine
- V2 audio bridge
- touch joystick
- swipe-look bridge
- FIRE bridge
- mobile resize bridge
- GitHub Pages deployment
- autonomous single HTML build

CURRENTLY UNRELIABLE / NOT ACCEPTED BY USER:

- real USE weapon switching on physical iPhone
- deterministic START GAME on physical iPhone
- portrait fullscreen technique is solved and user-confirmed; porting that exact policy into the main /kkrieger/ build must preserve landscape

Do not describe those three as fixed until the user personally confirms them.

## Handoff rule for future chats

When continuing this work:

1. Fetch the repository and this file first.
2. Inspect the current `main`, because it may be newer than the baseline SHA written here.
3. Preserve the working landscape mode and graphics.
4. Read `KRIEGER_PORTRAIT_FULLSCREEN_PROOF.md` before touching aspect-ratio/fullscreen code.
5. Do not accept DOM-only or synthetic-event-only evidence for USE/START.
6. For portrait regressions, compare master viewport, projection aspect, RT dimensions and actual textured scene coverage; canvas size alone is not enough.
7. Keep the public URL permanent.
8. Update this handoff and the known-issues record when behavior changes.
