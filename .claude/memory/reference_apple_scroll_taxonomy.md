---
name: Apple.com scroll motion taxonomy — declarative DSL via data attributes
description: Apple's internal AC framework decoded — HTML owns motion intent, JS owns execution, CSS holds visual contract. Yuri should adopt a similar declarative system.
type: reference
originSessionId: a25a2f2f-3aa5-4be4-a52c-3799ebe85490
---
Full research at `/tmp/shintai-audit/research-apple-scroll.md` (122 lines, Codex-scraped from production apple.com pages).

## The single biggest insight
**Apple built a motion OS.** HTML declares motion intent via `data-anim-*` attributes; JS registers controllers that read those declarations; CSS holds the visual contract. Motion is INSPECTABLE, TESTABLE, REUSABLE — not buried in JS callbacks.

Yuri's equivalent: every animated element should declare its motion contract in HTML, with a single registered controller reading it. No more per-section bespoke GSAP timelines hard-coded in script tags.

## Apple's declarative grammar (decoded from production HTML)

```html
data-anim-tween='{"start":"100rh - 50vh","end":"100rh - 30vh","opacity":[0.999,0.5],"ease":1}'
data-anim-event='{"event":"inline-video-play","start":"72rh"}'
data-anim-classname='{"class":"is-visible","start":"-10rh","end":"40rh"}'
data-anim-disabled-when='["reduced-motion","static-interaction"]'
data-anim-lazy-image
data-download-area-keyframe
data-inline-media-load-keyframe
data-progressive-image="emit-event"
```

Key units:
- `rh` = relative-height (resilient to device viewport size)
- `vh` = viewport-height
- Mixed expressions: `"100rh - 50vh"` — Apple's CSS-calc-style for animation ranges

## Apple's component taxonomy (5 patterns to mirror)

| Apple | Yuri equivalent name | Purpose |
|---|---|---|
| `HeroMedia` | `HeroMedia` | Big static-into-motion hero block |
| `PinnedReveal` | `PinnedReveal` | Section pins, content unfolds, releases |
| `ScrollGallery` | `ScrollGallery` | Horizontal/vertical scroll-tied gallery |
| `TileOverlay` | `TileOverlay` | Floating callout boxes synced to scroll |
| `InlineSequence` | `InlineSequence` | Pre-rendered frame sequence scrubbed on scroll |
| `CanvasBurst` | `CanvasBurst` | Programmatic canvas effect bounded by scroll window |
| `ThemeChapter` | `ThemeChapter` | Section drives CSS variable (color/theme) |
| `L2Modal` | `L2Modal` | Deeper modal layer, not page nav |

## Performance discipline (the invisible craft — copy this)

1. `preload="none"` on heavy inline media
2. Empty `src=""` until the keyframe window opens — then JS sets src
3. `data-download-area-keyframe` defines preload range (NEAR viewport)
4. `data-inline-media-load-keyframe` defines play range (AT viewport)
5. **Download window ≠ play window** — separates decode work from reveal moment
6. `disabledWhen: ["reduced-motion", "static-interaction"]` baked into every motion declaration
7. `will-change` ONLY toggled inside scroll windows via `data-anim-classname` (not permanent)
8. Static start/end frames hide decode flashes and first-frame jank
9. Responsive asset tiers: `_small`, `_medium`, `_large`, `_2x`
10. `data-progressive-image="emit-event"` — media readiness EMITS event, dependent animations LISTEN
11. **Sticky wrappers are section-local** — no giant scroll god-object reading position globally

## Yuri patches from Apple study (ranked)

### 1. `MotionDataAttributes` convention (CRITICAL — adopt now)
HTML declares motion via `data-yuri-tween`, `data-yuri-event`, `data-yuri-disabled-when`, `data-yuri-classname`. Single JS registry reads them and wires GSAP timelines / IntersectionObservers. Inspectable in DevTools. Testable via grep.

```html
<div class="hero" 
     data-yuri-tween='{"start":"top 80%","end":"top 30%","opacity":[0,1],"y":[40,0]}'
     data-yuri-disabled-when='["reduced-motion","mobile-small"]'>
```

Implementation cost: ~80 LOC for the registry + parser. Massive ROI — every future Yuri design uses this contract.

### 2. `InlineSequence` block (image-sequence scrubbing)
Add to Kagami audit template as a reusable pattern. Fields: `basePath`, `startFrame`, `endFrame`, `loadRange`, `playRange`, `reducedMotionPoster`. Forces Apple-style separation of preload and play.

### 3. `StickyRelay` audit rubric  
Every long-scroll section requires: section-local sticky wrapper, named chapter, defined release point, next-pin handoff. No long sticky god-sections.

### 4. `rh` units helper
Add CSS custom property `--rh: var(--viewport-h, 1vh)` that JS recalculates on resize. Use `calc(100 * var(--rh) - 50vh)` for resilient animation ranges.

## The Rick read
> Apple ain't winging scroll animation. They built a motion operating system.
> HTML says what should happen. JS decides when and how hard. CSS holds the visual contract.
> Every heavy thing has a loading window. Every reveal has a fallback frame.
> Every sticky scene has a release valve. Every animation knows what disables it.

That last line is the lock. **Every animation knows what disables it.** Bake `data-yuri-disabled-when` into every motion-bearing element from this point forward.
