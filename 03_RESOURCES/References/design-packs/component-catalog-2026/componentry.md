## Site: Componentry
## URL: https://componentry.fun/docs
## Total resources found: 42 | Extracted: 42 (100% inventory, props captured)
## Install pattern: pnpm dlx shadcn@latest add @componentry/<component-name>
## Framework: React + Tailwind + Framer Motion + WebGL/GLSL
## Categories: text, animation, hero, effect, interactive, card, layout

---
## INVENTORY — All 42 Components

### TEXT ANIMATIONS
| # | Component | URL | Description |
|---|-----------|-----|-------------|
| 1 | Hyper Text | /docs/components/hyper-text | Text scramble cycling through characters before revealing final |
| 2 | Text Animate | /docs/components/text-animate | Staggered character animations, customizable effects |
| 3 | Velocity Scroll | /docs/components/scroll-based-velocity | Text moving horizontally based on scroll speed |
| 4 | Letter Cascade | /docs/components/letter-cascade | Letters scatter outward with spring physics and blur |
| 5 | Text Repel | /docs/components/text-repel | Physics-based letters reacting to cursor proximity via spring |
| 6 | Particle Typography | /docs/components/cursor-driven-particle-typography | Typography from particles responding to cursor |

### COMPONENTS
| # | Component | URL | Description |
|---|-----------|-----|-------------|
| 7 | Sticky Scroll Cards | /docs/components/sticky-scroll-cards | Scroll-driven card stack — images pin and scale on scroll |
| 8 | Music Player | /docs/components/music-player | Interactive vinyl record player with swinging tonearm |
| 9 | Scroll Split Card | /docs/components/scroll-split-card | Card splits and flips into multiple panels on scroll |
| 10 | Mac Keyboard | /docs/components/mac-keyboard | Realistic Mac keyboard with interactive keys |
| 11 | Circuit Board | /docs/components/circuit-board | Animated circuit board with nodes and connections |
| 12 | Command Menu | /docs/components/command-menu | Fast, accessible, composable command menu for React |
| 13 | Flight Status Card | /docs/components/flight-status-card | Card with animated flight information display |
| 14 | Magnetic Dock | /docs/components/magnetic-dock | macOS-style dock scaling items by mouse proximity |
| 15 | Showcase Card | /docs/components/showcase-card | Card for presenting projects/features |
| 16 | Spotlight Card | /docs/components/spotlight-card | Card revealing spotlight effect on hover |
| 17 | Auth Modal | /docs/components/auth-modal | Authentication modal with beautiful transitions |
| 18 | Testimonial Marquee | /docs/components/testimonial-marquee | Infinite scrolling marquee for testimonials |
| 19 | Collection Surfer | /docs/components/collection-surfer | Smooth surfing interaction for browsing collections |
| 20 | Github Calendar | /docs/components/github-calendar | GitHub-style contribution calendar heatmap |
| 21 | Scrub Input | /docs/components/scrub-input | Inline interactive slider styled as pill |
| 22 | Scroll Choreography | /docs/components/scroll-choreography | Scroll-driven image choreography via Framer Motion |
| 23 | Layered Stack | /docs/components/layered-stack | Stack of layered cards interacting with mouse hover |
| 24 | Split Flap Display | /docs/components/split-flap-display | Premium split-flap display, vintage departure board aesthetic |
| 25 | Eye Tracking | /docs/components/eye-tracking | Hyper-realistic eyes following cursor with spring physics |
| 26 | Signature | /docs/components/signature | Animated SVG signature drawing out text as if handwritten |

### HERO BACKGROUNDS
| # | Component | URL | Description |
|---|-----------|-----|-------------|
| 27 | Hero Geometric | /docs/components/hero-geometric | Geometric shapes and patterns for hero sections |
| 28 | Dither Prism Hero | /docs/components/dither-prism-hero | WebGL hero with dithering, prismatic refraction, holographic iridescence |
| 29 | WebGL Liquid | /docs/components/webgl-liquid | Cinematic liquid shader hero with premium gradients |
| 30 | Closing Plasma | /docs/components/closing-plasma | Plasma field for footer and CTA sections |
| 31 | Animated Gradient | /docs/components/animated-gradient | Animated WebGL gradient with noise capabilities |

### VISUAL EFFECTS
| # | Component | URL | Description |
|---|-----------|-----|-------------|
| 32 | Image Trail | /docs/components/image-trail | Trail of images behind cursor with premium delay fade |
| 33 | Image Ripple Effect | /docs/components/image-ripple-effect | WebGL cursor ripples displacing layered image cards real-time |
| 34 | Infinite Image Field | /docs/components/infinite-image-field | Endless cursor-driven photo canvas tiling images infinitely |
| 35 | Border Beam | /docs/components/border-beam | Animated beam of light traveling along border |
| 36 | Dither Gradient | /docs/components/dither-gradient | Gradient background with dithering noise |
| 37 | Liquid Blob | /docs/components/liquid-blob | Animated liquid blob shape |
| 38 | Magnet Lines | /docs/components/magnet-lines | Lines reacting to cursor like magnetic field |
| 39 | Noise Texture | /docs/components/noise-texture | Subtle noise texture overlay |
| 40 | Particle Galaxy | /docs/components/particle-galaxy | Interactive 3D particle system resembling galaxy |
| 41 | Pixel Canvas | /docs/components/pixel-canvas | Canvas where pixels react to interaction |
| 42 | Matrix Rain | /docs/components/matrix-rain | Classic Matrix digital rain effect |

---
## SELECTED COMPONENT SPECS

### Dither Prism Hero
**Deps:** WebGL (GLSL shaders), framer-motion, @componentry/dither-prism-hero
**Motion:** Real-time WebGL rendering, configurable speed
**Props:**
- `title1` string (required)
- `title2` string (required)
- `color1` string (default "#0f0f23") — gradient color 1
- `color2` string (default "#6366f1") — gradient color 2
- `color3` string (default "#ec4899") — gradient color 3
- `speed` number (default 1) — animation speed multiplier
- `ditherIntensity` number (default 0.15) — dithering strength
- `prismIntensity` number (default 0.5) — prismatic refraction amount
- `showParticles` boolean (default true)
- `particleCount` number (default 50)
- `particleColor` string (default "#ffffff")
- `children` ReactNode
- `className` string

### Eye Tracking
**Deps:** framer-motion (spring physics), @componentry/eye-tracking
**Motion:** Spring-based pupil tracking, blinking, idle animation
**Props:** `eyeSize` number (default 140), `gap` number (default 50)

### Split Flap Display
**Deps:** framer-motion, @componentry/split-flap-display
**Motion:** Character flip animation, vintage departure board physics
**Usage:** `<SplitFlapDisplay text="BOARDING" />`

### Scroll Choreography
**Deps:** framer-motion (useScroll, useTransform), @componentry/scroll-choreography
**Motion:** Framer Motion scroll-driven — images orchestrate on scroll progress

---
## INSTALL PATTERN
```bash
pnpm dlx shadcn@latest add @componentry/<component-name>
# Examples:
pnpm dlx shadcn@latest add @componentry/dither-prism-hero
pnpm dlx shadcn@latest add @componentry/eye-tracking
pnpm dlx shadcn@latest add @componentry/magnetic-dock
```
