# Design Implementation — Nexus Link Productions

> For **Claude Code**
> Pinterest refs: /Users/marcelspatz/NUDIMMUD/RESEARCH/pinterest-refs/
> Source: /Users/marcelspatz/NUDIMMUD/src/
> Server: http://127.0.0.1:4200/ (auto-reload)

---

## BEFORE YOU CODE

Read these files first:
1. RESEARCH/pinterest-refs/INDEX.md — all 17 reference images
2. Look at images in RESEARCH/pinterest-refs/ to absorb the aesthetic
3. src/App.tsx — router + layout
4. src/pages/ — all pages
5. src/components/ui/ — existing components (CineGlow, ArchitecturalGrid)
6. RESEARCH/MASTER-PROMPT-GPT5.md — full brand context
7. RESEARCH/07-NEXUS-LINK-AUDIT.md — gap analysis

---

## THE CRITICAL GAPS (What must be fixed)

### 1. Hero — Particle Canvas
Replace the static hero with a **Three.js or Canvas particle system** that reacts to cursor velocity. Particles should form the triquetra/vesicae piscis shape by default, then scatter on cursor movement, then reform. Use the dark crimson (#dc2626) color palette from the Pinterest refs.

### 2. Typography over canvas
Hero text ("FRAMES THAT DEFINE.") rendered with `mix-blend-mode: difference` over the particle canvas. Variable font weight animation on scroll depth.

### 3. Physics cursor
Replace the current CineGlow cursor with a **spring-mass-damper physics cursor**. On hover over interactive elements, the cursor should scale up and shift color to crimson. Use framer-motion's spring physics.

### 4. Animated stat counters
Replace "Wide / Portfolio · 6 / Years · 3 / Partners" with **real metrics** animated via IntersectionObserver count-up. Actual numbers from the CV.

### 5. Scrollytelling case studies
GSAP ScrollTrigger or framer-motion's useScroll with **sticky panels and clip-path wipes** instead of fade-ups. Split-screen reveals for project showcases.

### 6. Global motion system
- Stagger reveal clusters (50ms per child, direction-aware based on scroll direction)
- Page exit animations before enters
- Fluid typography with clamp() everywhere
- Noise overlay at 5% opacity (already exists in global.css, make it visible)

### 7. Interactive cards
Cards on Work page and process cards on Home page should:
- **Rotate** slightly on cursor proximity (magnetic tilt, 3-5 degrees)
- **Expand** on hover (scale 1.02-1.05)
- **Mutate** border glow on interaction (crimson glow intensifies)
- Background geometric lines should **shift position** based on scroll

---

## VISUAL LANGUAGE FROM PINTEREST REFS

The references show:
- **Sacred geometry** — intersecting circles, vesicae piscis, triquetra (already partially implemented in ArchitecturalGrid)
- **Architectural diagram** — blueprint-style grid lines, diagonal section cuts
- **Cosmic/mystical** — dark void with glowing crimson accents, celestial bodies
- **Origami** — folding/unfolding shapes, geometric transformations
- **Sci-fi abstract** — HUD-style frame elements, data visualization nodes, connecting lines

---

## PAGES TO APPLY TO

| Page | Effect |
|------|--------|
| Home | Particle canvas hero, physics cursor, animated counters, scrollytelling process |
| Work | Interactive cards (rotate, expand, mutate), bento grid with hover particle effects |
| Services | Orbital navigation with rotating geometry, expanding service detail panels |
| About | Scroll-driven timeline with particle connections between milestones |
| Contact | Multi-step form with shape mutations between steps (morphing geometry) |

---

## STARTUP

1. Read the Pinterest INDEX.md and look at images in /Users/marcelspatz/NUDIMMUD/RESEARCH/pinterest-refs/
2. Read all source files in /Users/marcelspatz/NUDIMMUD/src/pages/ and src/components/
3. Plan the implementation per the Critical Gaps above
4. Start with the particle canvas hero (Ship 1 — highest impact)
5. Implement each page one by one

Dev server: http://127.0.0.1:4200/ (auto-reloads on save)
Source: /Users/marcelspatz/NUDIMMUD/src/
