---
name: Portal-as-rotation-subject — the object spins, not the POV camera
description: When building the kagami cover scroll animation, the PORTAL canvas itself rotates on its own Y-axis. The camera POV stays fixed. Do not rotate the parent scene container.
type: feedback
originSessionId: 973b4a30-5488-4377-9ec6-4fdbc8742131
---

## Verbatim correction (2026-05-19 session end)
> "the implementation is absolutely wrong, the actual portal is the object that spins rather than the 'pov cam', worse implementation as the first true fly through we did. kagami doesnt appear for the first few swipes and then awkwardly just appears and spins around, completely wrong vision."

## The rule
On the kagami audit cover, the **portal canvas is the rotation subject**. The user's viewpoint (camera POV) does NOT orbit around the scene. Specifically:

- **DO** apply `transform: rotateY(N)` driven by ScrollTrigger to `.portal-orb-canvas` (or whichever portal element is canonical).
- **DO NOT** apply rotation to `#cover .inner`, `#cover`, or any parent scene container.
- **DO** keep `<h1>KAGAMI 神鏡</h1>`, subtitle, tagline, and chevron at their natural position. They should remain readable throughout the early scroll. Camera doesn't move them.
- **DO** restrict camera motion (if any) to the Z-axis — a "dolly into the portal" effect is acceptable. Y-axis rotation is the PORTAL's job.

## KAGAMI visibility rule
> "kagami doesnt appear for the first few swipes and then awkwardly just appears and spins around"

KAGAMI 神鏡 must be **at full opacity from frame 1**. Letter disassembly fires ONLY at the peak fly-through moment (scroll progress ~0.5+), never before. To guarantee this with GSAP ScrollTrigger scrub:

```js
// BEFORE the timeline, set explicit baseline state for every animated property
gsap.set('#cover h1 .char', { autoAlpha: 1, x: 0, y: 0, z: 0, rotateZ: 0, scale: 1 });
// THEN build the timeline. Disassembly tweens only from progress >= 0.45
tl.to(coverChars, { /* swarm vectors */ }, 0.45);
```

Never use a scrub timeline that animates letters from a non-baseline state without an explicit `gsap.set()` first — scrub-progress backfill will paint inconsistent frames at scroll=0.

## Reference: the 4-5am "first true fly-through" was better
Marcel praised an earlier (4-5am, 2026-05-19) implementation as "the first true fly through we did." The current Pass 14 P3 is described as "worse implementation." The 30 Rick decisions from task `byjd20ir4.output` describe what made that version work. Re-read those before any cover rework.

## Where the wrong impl lives (for next-session rip-out)
- File: `_SYSTEM/reports/kagami-sprint-audit-2026-05-19.html`
- GSAP timeline at lines ~2160–2200 (`coverScene = makePinnedScene('#cover', ...)`)
- Wrong rotation target: `#cover .inner` rotateY 0→360°
- Fix: move rotateY to `.portal-orb-canvas` only. Remove all `#cover .inner` rotations.
