# YURI Motion Doctrine v2
Generated: 2026-05-20 | Author: Shintai council (Lane 5 synthesis)

---

## 1. ARCHITECTURE DECISION: Two Motion Grammars

**One motion grammar does NOT work for both HUD and Kagami.** They require fundamentally different motion models.

Evidence from catalog extraction:
- Aceternity/Componentry (Kagami-aligned): framer-motion spring physics, useScroll+useTransform, WebGL shaders — cinematic, physics-driven, expensive
- DotMatrix (HUD-aligned): Tailwind CSS keyframes only — zero JS, zero deps, instant, mechanical
- Cult-UI: spring stiffness=400/damping=30 — spring physics with clear parameters

Forcing one grammar produces HUD that feels elastic when it should snap, and Kagami that feels mechanical when it should breathe.

**Decision:** Independent motion grammars. Shared naming convention only (`--yuri-hud-motion-*`, `--yuri-kagami-motion-*`).

---

## 2. MOTION GRAMMAR

### HUD Surface — `--yuri-hud-motion-*`
```css
:root {
  --yuri-hud-ease-snap:    cubic-bezier(0.42, 0, 0.58, 1);    /* headings, state switches — quick-punch */
  --yuri-hud-ease-out:     cubic-bezier(0, 0, 0.2, 1);        /* panel entry, drawer open */
  --yuri-hud-ease-neural:  cubic-bezier(0.23, 1, 0.32, 1);   /* default interactive — overshoot-free */
  --yuri-hud-dur-micro:    100ms;   /* tap, chip select */
  --yuri-hud-dur-ui:       200ms;   /* hover, focus */
  --yuri-hud-dur-panel:    280ms;   /* screen transition, panel entry */
  --yuri-hud-dur-meter:    900ms;   /* score meters, progress fills */
}
```

### Kagami Surface — `--yuri-kagami-motion-*`
```css
:root {
  --yuri-kagami-ease-glide: cubic-bezier(0.25, 0.8, 0.5, 1);       /* panels/cards — soft-lag */
  --yuri-kagami-ease-pop:   cubic-bezier(0.68, -0.4, 0.265, 1.4);  /* badges/buttons — overshoot */
  --yuri-kagami-ease-snap:  cubic-bezier(0.42, 0, 0.58, 1);        /* headings — quick-punch */
  --yuri-kagami-dur-micro:  150ms;   /* text reveal triggers */
  --yuri-kagami-dur-ui:     300ms;   /* card hover, reveal */
  --yuri-kagami-dur-scene:  600ms;   /* section transition */
  --yuri-kagami-dur-pin:    varies;  /* GSAP ScrollTrigger pin = scroll distance, not time */
}
```

---

## 3. DURATION TIER SYSTEM

| Tier | HUD | Kagami | Use |
|------|-----|--------|-----|
| micro | 100ms | 150ms | Tap, chip, icon swap |
| ui | 200ms | 300ms | Hover, focus ring, tooltip |
| component | 280ms | — | Panel entry, drawer, modal |
| scene | — | 600ms | Section reveal, choreography |
| cinematic | — | scroll-driven | GSAP pin, Three.js, WebGL |
| meter | 900ms | — | HUD score fill, progress bar |

---

## 4. TRIGGER VOCABULARY (shared names, surface-specific implementations)

| Trigger | HUD behavior | Kagami behavior |
|---------|-------------|-----------------|
| `hover` | scale 1.02, 200ms neural | transform/glow, 300ms glide |
| `tap` | scale 0.97, 100ms snap | ripple or none |
| `mount` | opacity+y, 280ms out | stagger children, 300ms glide |
| `scroll` | none (fixed-viewport) | GSAP ScrollTrigger pin+scrub |
| `state-change` | color transition, 200ms neural | layout animation, 300ms glide |
| `load` | stagger rows 0.06s | section choreography |
| `3d-enter` | none | IntersectionObserver lazy Three.js init |

---

## 5. HUD MOTION PERSONALITY

**Identity:** Mechanical, precise, operator. Every motion communicates state. Nothing decorative.

**3 canonical patterns:**
1. **Panel entry** — `y: 8→0, opacity 0→1, 280ms --yuri-hud-ease-out` (AnimatePresence mode="wait")
2. **Stagger reveal** — `staggerChildren: 0.06, each: opacity 0→1, y 16→0`
3. **State switch** — `color/border transition, 200ms --yuri-hud-ease-neural` (no layout shift)

**Explicitly banned:**
- Spring bouncing on any UI element (no cubic-bezier overshoot)
- Scale animations on text elements
- Continuous background animation while user is interacting
- Parallax on fixed-viewport shell elements
- GSAP (not used in HUD — framer-motion or CSS only)
- Stagger delays >100ms per item
- AnimatePresence with layout shift

---

## 6. KAGAMI MOTION PERSONALITY

**Identity:** Cinematic, editorial, choreographed. Motion is composition, not feedback.

**3 canonical patterns:**
1. **Scroll pin** — GSAP ScrollTrigger, unique pin distances per scene (V3:3.2vh, V4:2.8vh, V10:2.4vh, S12:3.4vh), Lenis ticker integrated
2. **3D scene** — Three.js lazy-init via IntersectionObserver, 3-light rig (cyan key #00D4FF + accent fill #47C01B + amber rim #FF8800), no bloom pass
3. **Text choreography** — framer-motion useScroll+useTransform OR velocity scroll, never GSAP for text

**Explicitly banned:**
- Bloom pass on Three.js (MRT alpha-clipping regression — confirmed hotfix lesson)
- Parallel Sankey branches (flow must be linear: CLI→Router→fan-out→SSE)
- Portal/cover rotation on parent container (portal object rotates, POV camera stays fixed)
- `animation-delay: 0` stagger (asymmetry is intentional — pin distances must differ per scene)
- Reduced-motion bypass (mobile <760px + prefers-reduced-motion = all pins disabled, Three.js falls to SVG)

---

## 7. REDUCED MOTION RULES

**HUD:** `useReducedMotion()` from framer-motion
- Disable canvas RAF (background particles stop)
- All framer transitions → `duration: 0`
- Score meter fills apply immediately (skip setTimeout delay)
- State colors still transition (opacity only, no transform)

**Kagami:** `@media (prefers-reduced-motion: reduce)` + JS check
- All GSAP ScrollTrigger pins disabled
- Three.js scenes → static SVG fallback
- Stagger delays removed
- Marquee animations paused

---

## 8. ANTI-PATTERNS (≥10, specific, with rationale)

1. **Purple-blue gradient wash** — generic SaaS background seen in 60%+ of AI products. Signals zero visual identity. Banned on both surfaces.
2. **Generic hero block** — oversized empty marketing hero with centered text. HUD doesn't have heroes. Kagami heroes must earn their space with motion.
3. **Reflexive HUD/card/glowing grid** — default AI output aesthetic. Banned unless the product surface explicitly requires operator-grid density.
4. **Bounce spring on UI controls** — elastic overshoot on buttons/chips feels toy-like. HUD uses zero overshoot. Kagami allows pop easing on badges only.
5. **GSAP in HUD** — over-coupling to scroll library in a fixed-viewport shell. Use framer-motion or CSS transitions only.
6. **framer-motion for Kagami 3D** — Three.js and framer-motion can coexist but Three.js scenes must not be wrapped in framer AnimatePresence. Separate lifecycle.
7. **Stagger delay >100ms** (HUD) — visible lag in dense operator dashboards. Max 60ms per item.
8. **Background motion while modal is open** — RAF/canvas must pause when overlay/modal is active. Compute cost + distraction.
9. **bloom pass on Three.js** (Kagami) — confirmed regression from kagami v15 hotfix. MRT alpha-clipping breaks with bloom. Hard ban.
10. **Uniform pin scroll distances** — Kagami scenes must have asymmetric pin distances (not all 3vh). Uniformity reads as template, not composition.
11. **opacity: 0 reveal without y-offset** — flat fades look broken, not designed. Always pair opacity with y-translate (HUD: y 8-16px, Kagami: y 24-40px).
12. **CSS-only scroll effects in Kagami** — scroll-driven CSS animations don't have the frame-perfect control GSAP ScrollTrigger provides for pinned scenes. Use GSAP for anything requiring pin.

---

## 9. PER-CATEGORY MOTION MAPPING

| Category | Surface | Pattern | Easing | Trigger |
|----------|---------|---------|--------|---------|
| layout | HUD | none (fixed-viewport) | — | — |
| layout | Kagami | GSAP pin+scrub | scroll-driven | scroll |
| hero | Kagami | Three.js + choreography | scroll-driven | scroll/load |
| card | HUD | panel entry (y+opacity) | --yuri-hud-ease-out | mount |
| card | Kagami | framer-motion spring, layered | --yuri-kagami-ease-glide | hover/mount |
| nav | HUD | state switch (color/opacity) | --yuri-hud-ease-neural | state-change |
| nav | Kagami | slide-out drawer | --yuri-kagami-ease-glide | tap |
| form | HUD | focus ring expand | --yuri-hud-ease-neural | focus |
| form | Kagami | layout animation | --yuri-kagami-ease-glide | state-change |
| button | HUD | scale 1.02/0.97 | --yuri-hud-ease-snap | hover/tap |
| button | Kagami | pop easing badge, glide panel | --yuri-kagami-ease-pop | hover/tap |
| animation | HUD | DotMatrix CSS loaders (no JS) | CSS keyframe | state-change |
| animation | Kagami | Componentry WebGL/framer | WebGL/spring | load/scroll |
| text | HUD | stagger reveal 0.06s | --yuri-hud-ease-out | mount |
| text | Kagami | velocity scroll / char scramble | scroll-driven/spring | scroll/mount |
| data | HUD | scaleX meter 900ms | --yuri-hud-ease-neural | load |
| data | Kagami | count-up, depth gradient | --yuri-kagami-ease-glide | scroll |
| effect | HUD | glow border transition | --yuri-hud-ease-neural | state-change |
| effect | Kagami | SVG feTurbulence, WebGL shader | WebGL | load |
