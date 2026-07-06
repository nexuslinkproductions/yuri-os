---
name: AE-grade Yuri capability gap research + top 3 patches
description: Codex deep research on how Yuri reaches professional motion-designer quality autonomously; honest gap audit + 8 ranked patches with effort estimates
type: reference
originSessionId: a25a2f2f-3aa5-4be4-a52c-3799ebe85490
---
Full research at `/tmp/shintai-audit/research-ae-grade-yuri.md` (238 lines).

## The single most important insight
**Yuri must become a motion director before becoming a motion coder.** AE-grade quality comes from sequence design and art direction, not library choice. Yuri's weakest area is not syntax — it's iterative visual correction and storyboarding.

## Top 3 patches (one-sprint achievable)

### 1. `motion-brief` skill — XS effort, no dependencies
**Problem:** Yuri starts coding before deciding what motion is supposed to do.
**Creates:** `.agents/skills/motion-brief/SKILL.md` with output schema:
```json
{ "section": "", "trigger": "", "subject": "", "intent": "", "timeline": "", "easing": "", "reducedMotion": "", "performanceBudget": "" }
```
Required step before any HTML/CSS generation for animated content.

### 2. Motion recipes library — S effort, depends on motion-brief
**Problem:** No internal memory of professional parameter ranges (bloom intensity, RGB split offset, stagger timing).
**Creates:**
- `_SYSTEM/design/motion-recipes/gsap-scroll.json`
- `_SYSTEM/design/motion-recipes/postfx.json`
- `_SYSTEM/design/motion-recipes/svg-filters.json`
- `_SYSTEM/design/motion-recipes/lottie-safe-subset.json`

Each recipe carries craft-vs-slop parameter bounds (e.g. UnrealBloomPass strength 0.15-0.42, threshold 0.85+ to avoid MRT alpha-clipping).

### 3. Preview/refine loop — M effort, depends on recipes
**Problem:** Yuri cannot see motion quality — only final screenshots.
**Creates:** `Scripts/motion-preview.mjs` that captures 0/25/50/75/100% scroll frames + mobile + reduced-motion + canvas-nonblank check. Loops render → inspect → adjust → re-render.

## Locked tool stack (no more library churn)
- **GSAP + ScrollTrigger** — master timing layer (3.13+ has all bonus plugins free: DrawSVG, MorphSVG, MotionPath, Physics2D)
- **Three.js** — immersive brand/product scenes (no bloom default — MRT alpha-clipping risk per yuri-os-dashboard v15 hotfix)
- **Theatre.js** — when motion needs editing/reuse (the missing code↔timeline bridge)
- **Motion (motion.dev)** — everyday UI micro-interactions
- **Lottie** — icons/loaders/data moments ONLY, as constrained JSON subset (not arbitrary AE replacement)
- **gl-transitions** — ready-made shader transition corpus (300+ free)
- **SVG filters** — `feTurbulence`, `feDisplacementMap`, `feColorMatrix` for cheap AE-like texture

## Locked exclusions (do not add)
- Rive — runtime is good but not ready as Yuri's programmatic authoring core
- v0 / Galileo / Framer AI — won't solve motion taste
- Anime.js — GSAP wins where it counts
- Material Design easings — instant AI tell

## How to apply
- Every section requiring motion gets a `motion-brief` filled FIRST
- Recipes are parameterised — Yuri picks intent (`peak-emphasis`, `transition-cover`, `breath-loop`) and recipe enforces bounds
- Preview loop verifies final state, mid-scroll, reduced-motion fallback, mobile, and canvas non-blank before commit
- Reference decoder workflow: when scraping a reference site, store MECHANISM (`reference-decode.md` template: stack, interaction grammar, timeline map, postfx, assets, fallback, reproduce-cost), not screenshots

## Other 5 patches (after top 3 prove out)
4. `lottie-author` skill + JSON schema validator (M)
5. `shader-pack` skill — `_SYSTEM/design/shaders/{transitions,postfx}/*.glsl` (M)
6. Theatre.js motion lab — `tools/motion-lab/` (L)
7. Asset atlas — `_SYSTEM/design/assets/{noise,particles,sprites,sequences}` + manifest (M)
8. Reference decoder workflow — `reference-decode.md` template (XS)
