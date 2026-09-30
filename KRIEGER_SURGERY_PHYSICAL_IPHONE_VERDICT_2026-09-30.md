# Krieger Surgery Lab — physical-iPhone verdict and next architecture

Date: 2026-09-30  
Authority: physical iPhone user observation outranks synthetic/local visual metrics.

## What succeeded

The Surgery Lab proved a narrow but important capability:

- a real native Krieger `KOp` can be modified at runtime;
- the original C++/WASM renderer remains active;
- native procedural material/bitmap dependencies remain attached;
- `WeaponOptics` and `WeaponShot` stay bound;
- FIRE reaches `KKriegerGame::FireShot`;
- portrait rendering fills the phone viewport.

This is genuine operator-graph control.

## What failed

The physical-iPhone user could not see an obvious difference between ORIGINAL and MODIFIED.

The automated test saw a local pixel delta and approximately 10% changed pixels in the weapon region. That was technically true but insufficient for the human goal.

Permanent lesson:

> A statistical pixel difference is not evidence of meaningful visual control if the physical-device user cannot recognize the change immediately.

The previous gate answered “did pixels change?” while the real question was “can we visibly rebuild Krieger graphics?”

## Second failure: the web page could move vertically

The same phone test found that the whole game surface could be pulled up/down.

The old portrait shell fixed `#wrap` but left the document/body insufficiently locked for iOS/Telegram visual viewport rubber-band behavior.

This is a release-blocking input regression because a drag gesture can belong to the browser instead of the game camera.

## Fixed-game viewport invariant

All new Krieger labs now require:

- fixed `html` and `body`;
- `overflow:hidden`;
- `touch-action:none`;
- `overscroll-behavior:none`;
- visualViewport-height synchronization;
- `touchmove` / Safari gesture prevention;
- forced `scrollTo(0,0)` if the browser attempts page movement;
- a test that attempts `window.scrollTo(0,500)` and requires scroll Y to remain zero.

The same principle must be used by all released World Server web games: gestures move the game world, never the HTML page.

## New MVP: native Location Rebuild

The next MVP expands control from one weapon transform to a large band of native location operators.

KX archaeology places substantial level architecture in Scene_Transform operators in the 2400–3908 band. The new lab changes a KX-derived whitelist of 31 topology-safe native architecture transforms deterministically while leaving:

- original meshes;
- procedural bitmaps;
- MatLink materials;
- normals;
- scene/sector/portal machinery;
- weapon graphs;
- effects;
- 2004 renderer

in the native Krieger pipeline.

The intended proof is:

```
ORIGINAL LOCATION
 -> mutate many native Scene_Transform KOps
 -> visibly REBUILT LOCATION
```

No replacement JS/WebGL geometry is accepted.

## Stronger acceptance gate

The new Location Rebuild lab must satisfy all of these before publication:

1. physical-style portrait canvas coverage >85%;
2. the KX-derived topology-safe whitelist contains 31 native architecture Scene_Transform KOps, and the current frame must exercise at least 8 of them;
3. full-frame changed-pixel ratio >=18%;
4. architecture-region changed-pixel ratio >=20%;
5. full-frame mean delta >=8;
6. architecture-region mean delta >=9;
7. native weapon optics/shot bindings survive;
8. FIRE still reaches the real game path;
9. page scroll remains exactly zero after an attempted forced scroll;
10. exact public bytes must equal the tested build;
11. the public URL must pass the same smoke test again.

The thresholds are deliberately much stronger than Surgery Lab because a future “PASS” must correspond to a difference a human can actually notice.

## Evidence hierarchy

For future Krieger graphics work:

1. physical iPhone / user-visible result;
2. public framebuffer evidence;
3. runtime KOp/game telemetry;
4. source-level provenance;
5. local synthetic tests.

A lower layer cannot overrule failure at a higher layer.
