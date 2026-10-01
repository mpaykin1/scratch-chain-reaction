# Living Light Cat MVP — success/failure record

Date: 2026-10-01  
MVP: https://mpaykin1.github.io/scratch-chain-reaction/living-light-cat/  
Baseline implementation SHA: `0d6fbd02e19df767420cc365e02e4075eb8d8d54`

This file is a permanent handoff for future chats/agents. Treat the three findings below as verified product learnings from the first Living Light Cat MVP.

## 1) SUCCESS — luminous cat silhouette

Status: **SUCCESS**

What worked:
- The cat is immediately recognizable as a cat.
- The core visual concept “one luminous line in darkness” works.
- Black background + warm golden glow gives the intended mood.
- Ears, back, chest, seated body shape and overall pose read clearly.
- The approach is lightweight enough for mobile and works as an autonomous browser MVP.

Why it worked:
- A simple continuous Bezier/Path2D silhouette is enough to create a strong readable creature.
- Multiple bloom passes on the same geometry create convincing rim-light without a heavy 3D pipeline.
- The result proves that World Server can support a reusable “Living Light / Light Creature” rendering technique.

Reusable lesson:
> Preserve the strong silhouette first. Add complexity only if it improves readability or behavior.

Acceptance rule for future variants:
- The creature must remain readable at a glance on a phone-sized viewport.
- Glow may decorate the silhouette, but may not obscure its shape.

## 2) FAILURE — tail design

Status: **FAILURE**

Observed problem:
- In the target sketch/reference, the tail is a major compositional element: long, smooth, soft and forming a broad horizontal oval/loop beneath the body.
- In the MVP, the tail reads as a short technical continuation of the line rather than a natural cat tail.
- It is too straight, too short and does not visually balance the body.
- The transition from body to tail is weak, so the lower composition feels unfinished.

Root cause:
- Tail geometry was treated as the end of the path instead of as a primary silhouette shape.
- Control points prioritize keeping the line on-screen rather than preserving feline anatomy and the reference composition.
- The tail lacks length, curvature and a clean wide loop.

Required fix:
- Make the tail substantially longer.
- Give it a wide, smooth, horizontally stretched loop/oval.
- Make the base flow naturally from the body.
- Remove any broken or kinked feeling at the tip.
- Keep the whole tail inside portrait mobile framing without shrinking it into insignificance.

Acceptance rule:
- The tail must read as a cat tail immediately, not as an extra stroke.
- It must visibly contribute to the composition.
- Its plasticity should be close to the reference: long, soft and elegant.

Reusable lesson:
> For line creatures, appendages that define identity or composition must be modeled as first-class shapes, not as leftover path segments.

## 3) FAILURE — behavioral animation

Status: **FAILURE**

Observed problem:
- The current MVP has moving light / glow and tiny contour motion, but it does not convincingly animate the cat as a living creature.
- The required visible behaviors are missing:
  1. the cat turns its head;
  2. the cat swishes/wags its tail.

Why it failed:
- The first implementation animated the appearance of the line more than the anatomy.
- Path deformation was too small and too distributed to read as a deliberate head turn or tail movement.
- There is no explicit articulated behavior model for head and tail.

Required fix:
- Split the silhouette into behavioral control regions or parameterized path segments.
- Head: add a clearly readable left/right turn and optionally a small tilt.
- Tail: add a smooth, obvious cat-like swish with a larger amplitude.
- Keep breathing and ear twitch as secondary idle motion only.
- Preserve one-light-line aesthetics while changing the geometry itself, not just the glow.

Minimum idle loop:
1. subtle breathing;
2. head turn;
3. tail swish;
4. optional ear twitch.

Acceptance rule:
- With glow temporarily disabled, the movement must still clearly show a head turn and a tail swish.
- A viewer should describe the cat as “moving its head and tail,” not merely “the line is animated.”

Reusable lesson:
> A living-creature MVP is not proven by shader motion. Behavior must be legible in the underlying geometry.

## Next MVP target

Keep the successful luminous silhouette system unchanged as the baseline. Fix only the two failed areas first:
1. reference-quality tail geometry;
2. explicit head-turn + tail-swish animation.

Do not expand scope into more effects, 3D, particles or new creatures until these two acceptance rules pass.
