# Krieger Location Rebuild — physical iPhone success record

**Date:** 2026-09-30  
**Status:** HUMAN-CONFIRMED PARTIAL SUCCESS  
**Authority:** physical iPhone user observation

## What the user confirmed

The user opened the published Location Rebuild MVP on a physical iPhone and reported:

> «Локация немножко меняется — это уже хорошо»

This is the first direct human confirmation that our Krieger work has moved beyond an invisible/statistical operator mutation and into a **visibly changed location**.

That matters because the previous Surgery Lab passed automated pixel-diff gates but the user could not perceive the difference between ORIGINAL and MODIFIED.

## What succeeded

The Location Rebuild MVP now has three independent layers of evidence:

### 1. Source/runtime control

The rebuild changes native Krieger `Scene_Transform` operators in the real KX/C++/WASM execution path instead of drawing replacement JS/WebGL geometry.

### 2. Automated render proof

The verified public run reported:

- target transforms: 86;
- touched transforms: 48;
- full-frame changed-pixel ratio: about **46%**;
- center-scene changed-pixel ratio: about **48%**;
- portrait height coverage: **100%**;
- native `WeaponOptics` remains bound;
- native `WeaponShot` remains bound;
- FIRE reaches the real `KKriegerGame::FireShot`;
- ammo changes `100 -> 99`;
- exact public bytes match the tested artifact;
- public URL passes the same browser smoke test again.

### 3. Human-visible proof

Unlike Surgery Lab v1, the physical-iPhone user actually sees the location changing.

This is the crucial new milestone.

## What this does NOT prove yet

The user said the location changes **a little**.

So this is not yet “full control over Krieger graphics” and should not be mislabeled as such.

Still missing:

- a clearly authored new room composition rather than a modest deformation of the original;
- deliberate control over architectural grammar, not only transform perturbation;
- collision/portal semantics verified to follow large geometry edits;
- native material/light/texture parameters independently controlled;
- a custom level assembled from reusable Krieger-quality operator recipes;
- physical-iPhone confirmation that the new fixed viewport rule fully eliminates page dragging/rubber-band in this exact MVP.

## Why this success is important

The project now has a verified progression:

```
Level Lab v1
  renderer works, graphics primitive
        ↓
Surgery Lab
  native KOp control works, visual change too subtle
        ↓
Location Rebuild
  many native location transforms change
  + public framebuffer difference is large
  + physical-iPhone user sees the location changing
```

The lesson is that **human-visible control must be treated as a separate milestone from technical operator control**.

## New baseline for the next MVP

Do not go back to tiny parameter edits.

The next Krieger graphics-control MVP should make a deliberate architectural redesign that is obvious in one second while preserving the native rendering pipeline.

Recommended target:

```
ORIGINAL corridor
  -> controlled operator recipe edits
  -> visibly different room/corridor composition
  -> same Krieger materials / lighting / weapon / effects
```

A good next proof would visibly change at least three architectural properties at once, for example:

- bay spacing;
- column/arch proportions;
- ceiling height/profile;
- wall rhythm;
- light placement;
- floor/room width.

The result should still read as Krieger, but unmistakably be a different authored location.

## Permanent acceptance rule

For Krieger graphics-control work:

1. source provenance must show which native operators/subgraphs were changed;
2. automated framebuffer evidence must show a substantial change;
3. physical-device human confirmation decides whether the change is actually meaningful;
4. “pixel diff only” can never be promoted to a visual-success claim.

## Canonical public MVP

https://mpaykin1.github.io/scratch-chain-reaction/kkrieger-rebuild-lab/

Canonical successful workflow:

https://github.com/mpaykin1/scratch-chain-reaction/actions/runs/36679495033
