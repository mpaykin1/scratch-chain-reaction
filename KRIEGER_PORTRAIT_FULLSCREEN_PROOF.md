# Krieger Portrait Fullscreen — canonical solved recipe

Status: **SOLVED AND USER-CONFIRMED ON PHYSICAL iPhone**
Date: 2026-09-29

Canonical public proof:
https://mpaykin1.github.io/scratch-chain-reaction/kkrieger-portrait-proof/

Proof merge commit:
`25adc85578e50daf060a94a416360ac0fc1c2d82`

Published proof commit:
`242bd915f9e127333f33fc1a6171cc7aea921e8d`

Pinned upstream:
`MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`

## Why the first four attempts failed

The visible symptom looked like a CSS/fullscreen problem, but the real cause was inside the Krieger render policy.

The browser canvas could already fill the phone screen while the actual 3D scene remained a centered horizontal band.

The critical source-level policy is in `werkkzeug3_kkrieger/mainplayer.cpp`.

The WASM port explicitly selected the largest centered **2:1** rectangle:

```cpp
sInt bh = sMin(sSystem->ConfigX/2,sSystem->ConfigY);
sInt bw = 2*bh;
sInt x0 = (sSystem->ConfigX-bw)/2;
sInt y0 = (sSystem->ConfigY-bh)/2;
vp.Window.Init(x0,y0,x0+bw,y0+bh);
```

and then forced the projection aspect:

```cpp
Environment->Aspect = 2.0f;
```

So a portrait canvas could be 1170×2532 while the engine deliberately rendered the scene into a shallow 2:1 band inside it.

A second related constraint existed in `genoverlay.cpp`: the full-size postprocess/render target path also derived its size from a 2:1 assumption.

This is why CSS-only fixes, `object-fit`, full-size canvas checks, and postprocess-only patches could all produce false confidence.

## Correct fix

The successful proof changes the policy at the engine level.

### 1. Full portrait master viewport

In portrait only:

```cpp
if(sSystem->ConfigY > sSystem->ConfigX)
{
  vp.Window.Init(0,0,sSystem->ConfigX,sSystem->ConfigY);
}
else
{
  // preserve the original Krieger 2:1 landscape composition
  sInt bh = sMin(sSystem->ConfigX/2,sSystem->ConfigY);
  sInt bw = 2*bh;
  sInt x0 = (sSystem->ConfigX-bw)/2;
  sInt y0 = (sSystem->ConfigY-bh)/2;
  vp.Window.Init(x0,y0,x0+bw,y0+bh);
}
```

### 2. Projection aspect follows the real viewport

Instead of hard-coding `2.0f`:

```cpp
Environment->Aspect = vp.Window.YSize()
  ? 1.0f*vp.Window.XSize()/vp.Window.YSize()
  : 1.0f;
```

This is essential. Expanding the viewport without changing the projection produces the wrong camera geometry.

### 3. Full-size postprocess target can actually hold portrait dimensions

In `genoverlay.cpp`, portrait mode uses:

```cpp
if(sSystem->ConfigY > sSystem->ConfigX)
{
  bw = sSystem->ConfigX;
  bh = sSystem->ConfigY;
}
else
{
  bh = sMin(sSystem->ConfigX/2,sSystem->ConfigY);
  bw = 2*bh;
}
```

The existing power-of-two allocation logic then chooses a sufficiently large RT.

### 4. Canvas still fills the visual viewport

The shell uses a full-viewport canvas, but this is only the outermost layer. It is necessary, not sufficient.

The proof keeps:
- `viewport-fit=cover`
- `100dvw / 100dvh`
- full-screen canvas CSS
- `res=fit`

The key lesson is: **never treat full canvas size as proof of full 3D scene coverage.**

## The proof program

Source files:

- `tools/kkrieger-portrait-proof/patch-portrait-proof.py`
- `tools/kkrieger-portrait-proof/build.sh`
- `tools/kkrieger-portrait-proof/portrait-proof-smoke.mjs`
- `.github/workflows/kkrieger-portrait-proof.yml`

Generated public program:

- `kkrieger-portrait-proof/index.html`

Permanent URL:

https://mpaykin1.github.io/scratch-chain-reaction/kkrieger-portrait-proof/

It is built from the real C++/WASM Krieger source. It is not a JavaScript imitation.

## Evidence that proved the fix

The CI proof requires all of these simultaneously:

1. engine is actually running in portrait;
2. engine master viewport equals the full backing buffer;
3. projection aspect equals real width / height;
4. canvas fills the visible browser viewport;
5. the **real textured 3D scene** fills at least 85% of canvas height;
6. the same test passes again on the permanent GitHub Pages URL.

The successful public run measured:

- browser viewport: `390×844`
- DPR-backed engine surface: `1170×2532`
- engine config: `1170×2532`
- master viewport: `[0,0,1170,2532]`
- projection aspect: `0.46208531`
- requested full-size RT: `1170×2532`
- allocated RT: `2048×4096`
- textured scene height coverage: **1.0 / 100%**
- textured scene top: `0`
- textured scene bottom: `0.998815...`
- public exact-bytes verification: PASS
- public live portrait re-test: PASS

## Physical-device acceptance

After the public proof was published, the user tested it on the physical iPhone and explicitly confirmed:

**“Ура получилось.”**

Therefore, unlike previous synthetic-only PASS results, this technique is now accepted as a real-device solution for Krieger portrait fullscreen.

## Golden rule for future work

For any Krieger aspect-ratio or fullscreen bug, inspect this chain:

```text
physical screen
→ CSS / visual viewport
→ canvas CSS size
→ canvas backing buffer
→ engine ConfigX / ConfigY
→ mainplayer master viewport
→ Environment->Aspect
→ render-target dimensions
→ IPP/postprocess viewport
→ GL viewport
→ final framebuffer
→ textured scene coverage
```

The first stage where the dimensions/aspect diverge is the bug location.

Do not start with CSS unless the divergence is actually at the CSS/canvas stage.

## Regression policy

The following must remain true:

- portrait master viewport uses the full engine surface;
- portrait projection uses actual viewport aspect;
- portrait postprocess RT can hold the full scene;
- landscape may preserve the original 2:1 Krieger composition;
- automated tests must inspect the rendered 3D scene, not only canvas geometry;
- physical-device confirmation outranks synthetic browser success.

## Relationship to the main game

The proof demonstrates that the Krieger engine can render correctly in full portrait.

It does **not** mean every mobile bug in the main `/kkrieger/` build is solved.

As of this record:
- portrait fullscreen technique: **SOLVED / USER CONFIRMED**
- USE real weapon switching: **OPEN**
- START GAME reliability: **OPEN**

Future work should port this exact proven viewport/projection/RT policy into the main game without regressing landscape controls or graphics.

## Memory / handoff rule

Any future chat working on Krieger should read this file before attempting portrait/fullscreen changes.

Do not rediscover or replace this solution with CSS heuristics.

Canonical file:
`KRIEGER_PORTRAIT_FULLSCREEN_PROOF.md`
