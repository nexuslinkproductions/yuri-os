---
name: Atmosphere must be visibly perceptible — not subtle background tint
description: When building atmospheric depth layers (particles, fog, parallax), opacity values <0.3 read as "darker dark" not as atmosphere. Real perceptible particle motion + visible depth layers required. CSS radial-gradient micro-dots are insufficient.
type: feedback
originSessionId: 973b4a30-5488-4377-9ec6-4fdbc8742131
---

## Verbatim correction (2026-05-19 session end)
> "there are no visible particles and depth atmosphere, none of it was implemented as the entire background, you just made the background move along, also cool but not what i described at all rick."

## The rule
"Atmospheric depth" means **perceivable floating particles + perceivable depth layers**, not subtle CSS overlay. Failure mode: making the background SUBTLY drift with mouse/scroll reads as "the page moved as one sheet" — not as a deep environment with motion behind the content.

**Required properties of any future kagami atmosphere:**
1. Each particle layer must be VISUALLY DISTINCT against the bg-void background. Opacity floor: ≥0.3 per layer.
2. Particles must have **independent motion** — drift, glow pulse, fade in/out — not just transform offset from scroll position.
3. **3+ depth planes** with distinctly different parallax speeds (deep slow, mid medium, near fast).
4. CSS `radial-gradient` micro-dots at 1px size with 260px+ tile gaps do NOT count as a particle layer. They render as near-uniform sheen. Use **actual Canvas2D particle field** or a SECOND `tsParticles` instance.
5. Mouse parallax must move LAYERS, not just translate offset. Visible Z-separation required.

## What this session shipped (P1) and why it failed
Pass 14 P1 added:
- `.atmos-deep` — 6 `radial-gradient` 1px dot layers at opacity 0.55, tile sizes 260–410px (= near-uniform dark sheen)
- `.atmos-fog` — 3 large drifting ellipse gradients at opacity 0.75 with `@property` keyframes (= slow color tint drift)
- `#tsparticles` — existing 60-particle layer at opacity 0.15 (= barely visible)
- `.bg-grid` — existing 44px grid lines at opacity 0.22 (= subtle texture)
- Mouse parallax via `--atmos-deep-x/y`, `--atmos-mid-x/y`, `--atmos-near-x/y` CSS vars

All technically present. All visually subtle. Marcel: "you just made the background move along, also cool but not what i described at all."

## Where the wrong impl lives (for next-session rework)
- File: `_SYSTEM/reports/kagami-sprint-audit-2026-05-19.html`
- CSS atmos layers: lines ~70-130 (`.atmos-deep`, `.atmos-fog`, `@keyframes fogDrift`, `@property` declarations)
- JS mouse-parallax wiring: lines ~2178-2186 (`--atmos-deep-x/y` etc.)
- HTML mount points: lines ~1182-1185 (`<div class="atmos-deep">`, `<div class="atmos-fog">`)

## Correct approach for next session
1. **Replace CSS `radial-gradient` micro-dot layers** with a second Canvas2D layer at z:0:
   ```js
   // ~80-120 visible particles drifting independently with Z-depth
   // Each particle: random position, slow Y-axis drift, soft glow, fade in/out
   // Distinct parallax speed per layer plane (3 planes minimum)
   ```
2. **Opacity floor 0.4 minimum** per layer until visual confirmation.
3. **CSS debug-mode class** `[data-atmos-debug]` that sets all atmos layers to opacity:1 with colored outlines — toggle during dev to confirm each layer exists, moves independently.
4. **Screenshot-verify** before declaring atmospheric work done. Take 2 screenshots: one static, one mid-scroll. Both must show visibly distinct particles, not uniform background tint.

## Skill patch reference
See `.claude/eot/2026-05-19_1900/SKILL_REFINEMENT_PATCH.md` patch `P-EOT-2026-05-19-003` (design-master: atmospheric perceptibility floor) for the canonical rule.
