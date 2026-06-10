---
name: Motion design manifesto — After Effects-grade interactive experience standard
description: Marcel's locked direction for every Yuri design — feel like a professional motion designer / visual artist composed it in After Effects, not a dev wiring CSS
type: feedback
originSessionId: a25a2f2f-3aa5-4be4-a52c-3799ebe85490
---
Marcel's vision for every Yuri design moving forward (locked 2026-05-19):

> "I want the whole experience within all the designs to feel like a professionally created After Effects interactive experience done by a professional visual artist / graphic and motion designer."

**Why this matters:** AE-grade work signals intent in every frame. Generic motion = AI tell. This bar is the difference between "AI-built dev portfolio" and "agency-grade product page."

**How to apply — 15 operating principles:**

### 1. Every motion has intent
Animate to TEACH (draw attention), RHYTHM (pace breath), TRANSITION (cover a cut), or DELIGHT (reward engagement). Never decoration alone. If a motion doesn't serve one of those four functions, cut it.

### 2. Layer composition like AE comps
Every section is a comp: background layer (deep z, low contrast), midground (mid z, supporting), content layer (focal), foreground accents (highest z, sparse). Z-depth must read. Parallax differentials between layers — never the same scroll velocity across z planes.

### 3. Choreography over orchestration
Multiple sub-motions in a COORDINATED timeline, not isolated component animations. Each timeline has labels (intro / build / climax / resolve). Stagger curves vary per element class. No three-element fade-in cluster — vary the entry direction and timing per element type.

### 4. Easing is identity
Use the established easing system:
- `--ease-snap` (cubic-bezier(.42, .0, .58, 1)) — headings, quick-punch
- `--ease-glide` (cubic-bezier(.25, .8, .5, 1)) — panels/cards, soft-lag
- `--ease-pop` (cubic-bezier(.68, -0.4, .265, 1.4)) — badges/buttons, snappy with overshoot

Default `cubic-bezier(0.4, 0, 0.2, 1)` (Material) = instant AI tell. Always custom.

### 5. Cinematography vocabulary
Use dollies, racks, parallax, depth-of-field, vignette, chromatic aberration AS REWARDS for moments — not as constants. A chromatic aberration that fires for 0.3s during a transition hits harder than a permanent CRT overlay.

### 6. Sound design IMPLIED by visual cadence
Even without audio, motion should feel like it has rhythm — beats, drops, accents, silences. Stagger timing to imply hits. A 5-element stagger at 0.08s each reads as a tom-tom fill. A single bold reveal after 1.2s of silence reads as a snare hit.

### 7. Asymmetry as craft
Symmetric grids = template. Master designers BREAK grids on purpose for emphasis. Pin distances vary (V3 3.2vh ≠ V10 2.4vh ≠ Results 2.0vh). Column ratios vary (1.2fr 1fr 0.8fr ≠ repeat(3, 1fr)). Animation intensity scales by section significance.

### 8. Stillness as power
Negative space, paused sections, content that DOESN'T move — these make the moving parts hit harder. One full-viewport silence section between major movements is more cinematic than 13 sections of motion.

### 9. Type is a character
Variable font axes (`wght`, `opsz`, `slnt`) animate too. Letter-by-letter reveals on hero text. Kerning compression on display sizes (-0.04em on h1). Subtle weight breathing on emphasis. Never uniform font weight across hierarchy.

### 10. The cursor is the camera
What the user does with their cursor IS part of the composition. Magnetic cursor with lerp trail. Weighted hover (cursor expands on interactive elements). Mouse hover should feel like a lens focusing — slight scale up, slight glow bloom on the target.

### 11. Effects are surgical
Glow, blur, chromatic aberration, scanlines — use PEAK INTENSITY for 200-600ms moments, not continuous opacity overlays. A glitch that fires once at a transition cut is craft. A constant 0.04 opacity scanline texture is template.

### 12. State changes earn drama
Section entries get cinematic openings. Loading states have personality. Error states feel alive. Hover states feel earned. Never have a static state — even resting elements breathe (subtle scale or opacity at 4-8s loops at 0.02 amplitude).

### 13. Mix the toolkit
2D editorial + 3D scene + raster artifact + line-only minimal — variety reads as craft. Pure consistency reads as template. The point isn't "use 3D everywhere" or "use boxes everywhere" — the point is the right tool per section, contextually.

### 14. Reduced motion has dignity
When `prefers-reduced-motion: reduce` or mobile fallback fires, the static composition must STILL be beautiful. No "this is the broken version." Final states must compose as if intentionally still.

### 15. Reuse with variation
Same design tokens, different application per section. Like a film composer reusing a theme with different orchestration. The 63% stat in V4 uses the same gradient-fill numeric system as the 12 workstreams stat in Results — but at different scale, different glow intensity, different reveal timing.

---

## ANTI-PATTERNS (instant rejection)

- Uniform fade-in on every element = template
- Same cubic-bezier on every transition = AI tell
- Symmetric 3-column grids everywhere = SaaS landing
- Constant opacity overlays masquerading as "depth" = lazy
- Decoration motion (something moves because "it should look alive") with no narrative function
- Boxes everywhere — vary surfaces (torn edges, glitch bars, line-only, bleed)
- Default font-weight 400 everywhere — use variable axes
- Static cursor — the cursor is a tool, design with it

---

## DECODE OF MARCEL'S PHRASE

"Professionally created After Effects interactive experience" = the user should feel like they're navigating a designed COMPOSITION, not a website. Every motion is a choice. Every still moment is composed. Every transition is choreographed. The cursor is part of the camera. The scroll is the timeline cursor.

Every Yuri design from now on holds this bar.

This is locked. This is the floor, not the ceiling.
