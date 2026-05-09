# Analyzed Websites — Full Reference Library

> 21 sites, fetched and documented. Each entry: what they do, how they do it,
> what to steal, and our current capability gap to build something similar.

---

## 1. BRUNO SIMON — bruno-simon.com

**Category:** WebGL/3D Portfolio

**What it does:** A fully navigable 3D world rendered in-browser. You drive a toy truck around a physics-simulated environment that IS the portfolio. The entire site is a game engine, not a webpage.

**How it works:**
- **Three.js** for 3D rendering (WebGL + WebGPU via TSL shading language)
- **Rapier** (Rust WASM) for physics — rigidbody simulation on the truck
- **Howler.js** for audio — licensed CC0 music from Kounine
- **Blender** for asset creation — all low-poly models exported as glTF/GLB
- **TSL (Three.js Shading Language)** — enables both WebGL and WebGPU from same codebase

**What to steal:**
- The WASD + SHIFT + SPACE control scheme for 3D navigation
- The achievement system (tracking time spent, discoveries, hidden collectibles)
- The "whisper" system — users leave messages in-world, max 30, visible to all
- The backend architecture (simple, but keeps scores and whispers)
- The music toggle + quality settings in an in-game options menu

**Source code:** Open source on [GitHub](https://github.com/brunosimon/folio-2025) under MIT license. Even the Blender files.

**Our gap:** HIGH — This requires Three.js expertise, 3D asset pipeline (Blender), physics engine integration. Start by learning Three.js Journey (he made the course) before attempting anything in this direction.

---

## 2. LUSION — lusion.co

**Category:** WebGL/3D Studio Portfolio

**What it does:** Full-screen 3D scenes synced to scroll position. Mobile gets gyroscope camera control. Every project on their site is a bespoke WebGL experience.

**How it works:**
- Three.js WebGL canvas composited over DOM
- Scroll position drives 3D camera via rAF (requestAnimationFrame) binding
- DeviceOrientation API for mobile gyro camera control
- GSAP for scroll-triggered animation timelines

**What to steal:**
- The scroll-binding approach: `scrollY / docHeight` mapped to camera position
- The mobile gyro fallback
- The "Play Reel" button as a hero interaction trigger

**Our gap:** HIGH-MEDIUM — The concept is straightforward (scroll binds to 3D), but the 3D scenes themselves require 3D artists or procedural generation skills.

---

## 3. IGLOO — igloo.inc (Awwwards SOTY 2024)

**Category:** Full-WebGL UI

**What it does:** Everything — text, buttons, particles, ice crystals — is rendered inside WebGL. Zero HTML DOM rendering. Text uses SDF (Signed Distance Field) fonts. Ice crystals use procedural growth algorithms in shaders.

**How it works:**
- **SDF text rendering** — glyphs rendered as GPU textures, not HTML
- **GLSL ShaderMaterial** — vertex displacement, ice crystal growth, glitch effects all in custom fragment shaders
- **Procedural geometry** — L-systems or cellular automata for crystal formation
- **Full-WebGL UI** — no DOM, no CSS, everything is a Three.js mesh

**What to steal:**
- The SDF text approach for custom typography that HTML can't do
- The ice crystal procedural generation algorithm
- The glitch text as a fragment shader effect

**Our gap:** VERY HIGH — This is advanced graphics programming. Understanding GLSL shaders, SDF rendering, and procedural geometry requires foundational computer graphics knowledge. Start with Book of Shaders (thebookofshaders.com).

---

## 4. STRIPE PRESS — press.stripe.com

**Category:** 3D + Performance Paradox

**What it does:** 3D book covers rendered in-browser with scroll-driven 3D perspective. The books rotate and stack as you scroll. Despite being 3D-heavy, it performs like a static site.

**How it works:**
- **CSS perspective + rotateY** chained to scroll progress (not Three.js for the 3D)
- **Geometry instancing** — same book mesh drawn multiple times with different transforms, single draw call
- **IntersectionObserver** for lazy-activation of 3D elements
- **Compositor-only properties** — animating only `transform` and `opacity`, no layout reflow
- **Above-the-fold prioritization** — critical CSS inlined, non-critical deferred

**What to steal:**
- The scroll-driven 3D perspective (CSS-only approach, no WebGL needed)
- The lazy loading strategy with IntersectionObserver
- The entire performance architecture — this is the gold standard for "looks heavy, loads fast"

**Our gap:** LOW-MEDIUM — The CSS perspective approach is achievable now. The geometry instancing requires Three.js knowledge but the concept is copyable. Start with the CSS 3D scroll effect.

---

## 5. NEAL.FUN — neal.fun/space-elevator / neal.fun/deep-sea

**Category:** Scrollytelling

**What it does:** Vertical scroll journeys where distance IS the narrative. Scroll "kilometers" into the ocean or up into space. The scroll position maps to real-world depth/altitude data.

**How it works:**
- **Scroll-progress mapping** — `scrollY / totalHeight` normalized to 0→1, then mapped to real-world units
- **IntersectionObserver** for scroll-triggered reveals
- **Virtual scroll** — the page isn't actually kilometers tall; math converts pixel-scroll to narrative distance
- **Canvas/WebGL** for the visual environment (varies by page)

**What to steal:**
- The scroll-progress → data mapping pattern
- The "scroll as unit of measurement" concept for any data storytelling
- The simple but effective reveal pattern

**Our gap:** LOW — This is achievable with basic scroll event listeners and canvas drawing. The hard part is the content/data, not the code.

---

## 6. LOCOMOTIVE — locomotive.ca

**Category:** Scroll Library / Agency

**What it does:** Created Locomotive Scroll (the library that powers "buttery smooth" scrolling on hundreds of award sites). Their own site demonstrates the scroll engine.

**How it works:**
- **Lenis** — the underlying scroll normalization layer that emits uniform scroll events
- **Lerp (linear interpolation)** — `current = lerp(current, target, 0.1)` each frame for smooth catch-up
- **data-lag, data-speed attributes** — HTML attributes that control parallax behavior
- **Scroll-direction awareness** — different animation behavior scrolling up vs. down

**What to steal:**
- The lerp-based smooth scroll formula
- The HTML attribute-based parallax system
- The scroll-direction-aware animations
- The entire library — it's open source

**Our gap:** LOW — Locomotive Scroll is a drop-in library. Use it directly.

---

## 7. CUBERTO — cuberto.com

**Category:** Cursor & Interaction Design

**What it does:** The cursor IS the interface. It follows slower than the mouse, morphs shape on hover targets, and buttons magnetically pull the cursor toward them. They open-sourced their cursor system.

**How it works:**
- **Cursor follower with lerp** — `dotX = lerp(dotX, mouseX, 0.1)` each frame
- **Magnetic button effect** — cursor displaced toward nearest interactive element's center using distance math
- **Cursor state machine** — different shapes for different hover targets (text, button, image, link)
- **GSAP** for `expo.out` easing on cursor position

**What to steal:**
- The cursor lerp formula (literally 3 lines of code)
- The magnetic button distance calculation
- The cursor state machine pattern
- Their open-source cursor library

**Our gap:** LOW — This is the most immediately usable pattern. Implement the cursor follower in an afternoon.

---

## 8. LANDO NORRIS — landonorris.com (Awwwards SOTY 2025)

**Category:** WebGL Cursor Mask

**What it does:** On hover over an F1 helmet, a liquid blob masks the image beneath it. The mask is a shader effect responding to mouse position. Built in Webflow with custom WebGL injected.

**How it works:**
- **SDF metaball shader** — Signed Distance Field-based reveal, UV-computed in screen space
- **Texture masking** — helmet texture applied to material with UV coordinates from camera position
- **GLSL ShaderMaterial** — vertex displacement on text mesh based on mouse distance
- Webflow CMS with WebGL overlay injected

**What to steal:**
- The liquid blob cursor mask concept (SDF in GLSL)
- Webflow + custom WebGL as a hybrid approach (CMS control + shader power)
- The overall "cursor-reactive WebGL overlay" pattern

**Our gap:** HIGH — SDF shaders and metaball effects require GLSL knowledge. But the hybrid approach (Webflow + injected WebGL) is a pragmatic path.

---

## 9. ACTIVE THEORY — activetheory.net

**Category:** Spatial Interaction

**What it does:** The cursor is a navigation tool — you interact spatially rather than clicking menus. Builders of Google I/O experiences.

**How it works:**
- **Spatial UI** — no conventional navigation, movement IS interaction
- **Hover proximity** — elements react to mousemove event distance
- **Particle trail** — each mousemove spawns a particle that decays over time via rAF
- **Custom renderer** — likely custom WebGL pipeline

**What to steal:**
- The hover-proximity pattern (distance-based reactivity, not just boolean hover)
- The particle trail on cursor
- The spatial navigation concept

**Our gap:** MEDIUM — The hover proximity math is simple. The full spatial UI requires architectural commitment.

---

## 10. CODROPS — tympanus.net/codrops

**Category:** Tutorial Reference

**What it does:** The canonical source for web animation tutorials. Stroke-path animations, 3D audio visualizers, kinetic typography, WebGL tutorials.

**Key tutorials to use:**
- **SVG stroke-dashoffset animation** — letters drawing themselves
- **3D Audio Visualizer** — Three.js + GSAP + Web Audio API sphere that deforms to music
- **Split-text staggered reveal** — text appearing word by word
- **Variable font axis animation** — @keyframes targeting font-variation-settings

**Our gap:** ZERO — Codrops is the learning resource. Use their tutorials as your curriculum.

---

## 11. LINEAR — linear.app

**Category:** Performance Paradox (Web App)

**What it does:** The benchmark for "instant." Dense data app (issue tracking, project management) that feels like a native app. 60fps transitions, optimistic updates.

**How it works:**
- **Optimistic UI** — UI updates before server responds, rolls back on failure
- **View Transitions API** — smooth route transitions
- **Client-side routing with prefetching** — routes pre-loaded on hover, data cached
- **Design token system** — Inter Display font, strict weight/size tokens
- **CLS avoidance** — layout never jumps

**What to steal:**
- The design token system (Inter Display, strict size/weight tokens)
- The optimistic update pattern
- The route prefetching on hover

**Our gap:** LOW-MEDIUM — The design token system is copyable. Optimistic updates require a good API design underneath. The engineering effort is in the data layer, not the frontend.

---

## 12. STRIPE.COM — stripe.com (2026 Homepage)

**Category:** Performance Paradox (Marketing Site)

**What it does:** Bento grid layout with live GDP counter, animated product demos. Lighthouse scores above 90 despite heavy visuals.

**How it works:**
- **Bento grid** — named after Japanese lunch boxes, modular variable-size tiles
- **Server-sent events** for the live counter
- **Critical rendering path optimization** — only blocking resources above the fold
- **Compositor-thread animation** — offloading to GPU via `will-change: transform`
- **CSS variable typography** — Inter Display with strict design tokens

**What to steal:**
- The bento grid layout (CSS Grid with variable column spans, responsive)
- The critical rendering path approach (inline above-fold CSS, defer the rest)
- The `will-change: transform` compositor hint
- The design token system

**Our gap:** LOW — The bento grid is CSS Grid. The performance approach is a well-documented pattern. Stripe's edge is in execution detail, not secret technology.

---

## 13. TONE.JS — tonejs.github.io

**Category:** Audio-Visual Library

**What it does:** DAW-like Web Audio framework. Synthesizers, effects, scheduling, transport clock — all in-browser.

**How it works:**
- **Web Audio API** — OscillatorNode → FilterNode → GainNode → AudioDestination
- **AudioContext scheduling** — sample-accurate timing via `AudioContext.currentTime`
- **Transport clock** — Tone.js's internal timeline, like a DAW playhead
- **AnalyserNode** for FFT frequency analysis

**What to steal:**
- The Web Audio API node graph pattern
- AnalyserNode.getByteFrequencyData() for audio-reactive visuals
- Tone.js Transport for audio scheduling

**Our gap:** LOW-MEDIUM — Web Audio API is well-documented. The challenge is making it sound good (sound design is a craft).

---

## Quick Reference: Our Capability Gaps

| Site | Gap Level | Can We Build This? |
|------|-----------|--------------------|
| neal.fun | LOW | Yes, now |
| locomotive.ca | LOW | Yes, use the library |
| cuberto.com | LOW | Yes, implement cursor in a day |
| tonejs.github.io | LOW-MEDIUM | Yes, with Web Audio study |
| linear.app | LOW-MEDIUM | Design tokens yes, optimistic UI needs API work |
| stripe.com | LOW | Bento grid + performance patterns are documented |
| press.stripe.com | LOW-MEDIUM | CSS 3D is achievable |
| lusion.co | HIGH-MEDIUM | 3D scenes need Three.js skills |
| bruno-simon.com | HIGH | Needs 3D, physics, Blender pipeline |
| landonorris.com | HIGH | SDF shaders are hard |
| igloo.inc | VERY HIGH | Full-WebGL UI is advanced graphics programming |
| activetheory.net | MEDIUM | Proximity patterns yes, spatial UI needs architecture |

---

## How to Use This File

1. **Reference when planning:** Before building, scan the gap column. Pick techniques from LOW-gap sites to implement immediately. Learn from HIGH-gap sites gradually.

2. **Component extraction:** Each site has a "what to steal" section. These are concrete, implementable patterns — not abstract inspiration.

3. **Tech stack building:** As you learn new techniques, update the gap column. This file becomes your progress tracker.

4. **Generate from brain dump:** When you dump "I want something like stripe.com + that liquid blob cursor thing from lando's site," the decoder can cross-reference this file for the exact techniques needed.
