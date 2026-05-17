# Terminology Index — Brain Dump Vocabulary

> Extracted from Perplexity research. Use these words to describe what you see
> and want. Bake them into prompts so the system knows exactly what you mean.

---

## Scroll & Motion

| You said | Now say |
|----------|---------|
| "cursor that follows slowly" | **lerped cursor follower** |
| "button that pulls the cursor" | **magnetic button effect** |
| "stuff happening on scroll" | **scroll-triggered animation / scrubbed GSAP timeline** |
| "smooth scrolling" | **inertial scroll with lerp / Lenis smooth scroll** |
| "nav hides on scroll down" | **scroll-direction-aware navigation** |
| "page transition" | **View Transitions API / FLIP animation** |
| "elements at different speeds" | **multi-layer parallax / data-lag parallax** |
| "scroll tells a story" | **scrollytelling / scroll-as-narrative** |
| "distance counter on scroll" | **scroll-progress mapping** |

## 3D & WebGL

| You said | Now say |
|----------|---------|
| "3D website" | **WebGL scene graph / Three.js with physics rigidbody** |
| "ice/crystal 3D effects" | **procedural geometry + SDF shader-driven UI** |
| "3D controlled by scroll" | **scroll-synced WebGL / rAF scroll binding** |
| "3D text" | **SDF text rendering (Signed Distance Field)** |
| "particle effects" | **GPU particle system / instanced geometry** |
| "smooth 3D transitions" | **lerped camera dolly / scene graph interpolation** |
| "glitch effect" | **GLSL shader-driven UV distortion** |

## Typography

| You said | Now say |
|----------|---------|
| "text animating in" | **split-text staggered reveal / clip-path wipe** |
| "font that changes weight" | **variable font wght axis animation** |
| "text that scales on scroll" | **scale-on-scroll typography** |
| "text that doesn't break" | **fluid typography with clamp()** |
| "letters drawing themselves" | **SVG stroke-dashoffset animation** |
| "text mask reveal" | **clip-path reveal / CSS mask wipe** |

## Performance

| You said | Now say |
|----------|---------|
| "fast despite looking heavy" | **compositor-thread animation / critical rendering path** |
| "instant app feel" | **optimistic UI updates** |
| "smooth navigation" | **client-side routing with prefetching** |
| "layout doesn't jump" | **CLS avoidance (Cumulative Layout Shift)** |
| "loading placeholder" | **skeleton screen / progressive blur-up** |
| "images load as needed" | **lazy loading with IntersectionObserver** |

## Visual Design

| You said | Now say |
|----------|---------|
| "blurry background" | **backdrop-filter: blur() / glassmorphism** |
| "that grid layout" | **bento grid** |
| "interactive without menus" | **gestural navigation / spatial UI** |
| "cursor changes on hover" | **cursor state machine / cursor morphing** |

## Audio-Visual

| You said | Now say |
|----------|---------|
| "reactive to music" | **FFT audio analysis + vertex displacement via uniform** |
| "visuals tied to beat" | **BPM detection + AnalyserNode sync** |
| "sound in browser" | **Web Audio oscillator / AudioContext scheduling** |
| "3D sphere reacting to music" | **audio-reactive vertex displacement + Fresnel effect** |

---

## How to Use This

Two ways:

1. **When dumping brain streams** — drop terms naturally. Say "I want a bento grid layout with scroll-triggered split-text reveals and a magnetic button on the CTA" instead of describing around it.

2. **When I decode your dumps** — I'll automatically translate your loose descriptions into correct terminology in my structured output. It's already baked into how I process input.
