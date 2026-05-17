# MASTER PROMPT — Nexus Link Productions Website

> Target: GPT-5.5 at extra-high reasoning
> Stack: React + Vite + Framer Motion + TypeScript
> Source: /Users/marcelspatz/YURI-OS-MUSUBI/
> Dev server: http://127.0.0.1:4200/ (auto-reloads on save)

---

## YOUR MISSION

Rebuild the entire Nexus Link Productions website. The current site exists at the path above — read all the source files first to understand structure, then rewrite every page.

The site needs **spatial depth, personality, and visual storytelling**. Not a template. Not safe design. A website that feels like walking into a room where content floats at different depths.

---

## BRAND IDENTITY

**Name:** Nexus Link Productions
**Founder:** Marcel Spatz — Social Media Manager / Content Creator
**Location:** Vienna, Austria
**Founded:** 2026 (but 6 years of professional content creation journey)
**Tagline:** Frames that define.
**Positioning:** Premium brand content, campaign assets, short-form video, motion design
**Instagram:** @nexuslinkproductions

**Personality:**
- Dark, architectural, Gnostic-geometric
- Not industrial/cold — warm depth (crimson accent, not sterile)
- Uncomfortable in a good way — challenges the viewer
- Every geometric element means something (triquetra = three disciplines)
- Text feels projected / floating, not pinned to the page
- Rough edges that feel intentional, not templated

**Color palette (NO GREEN ANYWHERE):**
- Background: #0c0c14 (deep void) to #14141e (raised surface)
- Accent: #dc2626 (crimson) — the only accent color
- Text: #e8e8ee (primary), #9a9aaa (secondary), #6a6a7a (tertiary)
- Borders: rgba(255,255,255,0.04-0.16) — subtle white, never colored
- No cyan, no purple, no teal, no green. Crimson only.

---

## SPATIAL UI LAYOUT (The Most Important Instruction)

The page must feel like a 3D room, not a flat document. Use these techniques:

### 1. Perspective Floor Grid
A fixed-position SVG or CSS grid that recedes toward a vanishing point (center-top of viewport). Looks like an architectural blueprint floor. Lines get closer together as they approach the horizon. The triquetra (three intersecting circles, vesicae piscis) sits at the vanishing point, pulsating slowly.

### 2. Z-Space Floating
Every card, section, and UI element sits at a different depth:
- Background floor: Z: -50px (receding grid)
- Section content: Z: 0px (baseline)
- Cards and panels: Z: 20-40px (floating forward)
- Navigation and CTAs: Z: 60-80px (closer to viewer)
- Cursor: Z: 9999px (always on top)

Use `transform: perspective(Xpx) translateZ(Ypx)` to push elements forward/back.

### 3. Magnetic Tilt (Cuberto pattern)
Every card and interactive element subtly angles toward the cursor. On mousemove, calculate distance from cursor to each element's center, then apply rotateX/rotateY in the OPPOSITE direction (so it feels like the element is following the cursor in 3D space). Smooth reset on mouseleave with 0.5s ease-out transition.

### 4. Floating Hover
Cards slowly bob at different speeds (CSS animation, 4-8s cycles, translateY 4-10px). Different depths get different speeds. Never synchronized — each element has its own rhythm.

### 5. Diagonal Section Lines
Section boundaries get diagonal cut lines (repeating-linear-gradient at -45deg, subtle crimson at 0.03 opacity). Like architectural section drawings.

### 6. Frame Corners
Every major section has four corner bracket marks (📐 style) in crimson at 0.15 opacity. Creates the feeling of looking through a viewfinder.

---

## PAGES TO BUILD

### Home Page (/)
- Hero: "FRAMES THAT DEFINE." in massive type (clamp 64px-140px)
- Scramble text effect on load (letters randomize then settle)
- CTA buttons with magnetic tilt and glass hover glow
- Process section (4 steps: Discover, Develop, Produce, Deliver) — cards with 3D tilt
- Stats bar: Wide / Portfolio | 6 / Years | 3 / Partners
- Testimonial quote
- Smooth scroll progress bar at top (crimson gradient, fills as you scroll)

### Work Page (/work)
- Bento grid layout (varied card sizes, not identical)
- Cards have: blank image slot (user adds own), project title, client, category, year
- 3D hover tilt on each card
- Data-proximity attribute for Active Theory-style glow near cards
- Image slots are empty (user fills later)

### Services Page (/services)
- 5 services (reduced spacing, NOT 100vh each):
  1. Brand Content & Campaigns
  2. Corporate & Documentary
  3. Editing, Color & Motion
  4. Short-Form & Social
  5. Audio-Visual Production
- Each service gets its own section with staggered scroll reveal
- Orbital navigation at top (clickable station names)
- Synthesis section at bottom

### About Page (/about)
- Hero with NEXUS LINK text
- Narrative section: CV story highlighting:
  - Senior Social Media Manager / Content Creator
  - R. Tattoo x Barber (by RAF Camora)
  - CØRBO luxury apparel (by RAF Camora)
  - Mike Sommerfeld (IFBB Pro, 2024 Mr. Olympia runner-up)
  - Mike Sommerfeld ("Mike the Badass") — IFBB Pro Classic Physique, 2024 Mr. Olympia runner-up, German bodybuilder known for aesthetic classic lines, coach relationship with Patrick Tuor/Dennis James
  - R. / TATTOO X BARBER by RAF Camora — Vienna's largest tattoo studio, concept store blending barber and tattoo culture, part of RAF's multi-brand ecosystem including CØRBO clothing, Karneval Vodka, and R. Cosmetics
  - CØRBO by RAF CAMORA — luxury streetwear label, fashion pillar of RAF's lifestyle brand universe
  - RAF Camora — Austrian multi-platinum rapper and entrepreneur, built ecosystem of music, fashion, tattoo/barber, vodka, and cosmetics
  - Full career arc: Oldschoolgym24 → Apollon Nutrition → Public Figure → R. Tattoo x Barber → Nexus Link
- Instagram link: @nexuslinkproductions
- Career Arc section (visual scrollable timeline with year badges, red dots, connecting lines, geometric background)
- Network section (cards for collaborators)
- Stats: Wide / Portfolio | 6 Years | 3 Partners
- Philosophy section (End-to-End, Brand First, Systems Thinking)
- CV data source: /Users/marcelspatz/Downloads/marcel-spatz-cv-nexus-link-may2026.html

### Contact Page (/contact)
- Multi-step form: DISCOVER → DEVELOP → PRODUCE → DELIVER
- Each step has a phase label, contextual description, and visual indicator
- Sidebar with contact info and contextual phase description
- Project type selection, vision textarea, budget range, timeline, contact info
- Review step before submission
- Success state with confirmation

### Navigation (global)
- Sticky, transparent → glass on scroll
- Links: Home, Work, Services, About, Contact
- Route prefetching (load page on hover)
- "Start a Project" CTA pill button
- Brand is "NEXUS LINK" text (NO SVG LOGO — removed green box)

### Footer (global)
- Brand, studio links, services links, contact info
- Clean, minimal, dark

---

## TECHNICAL REQUIREMENTS

**DO NOT:**
- Use Lenis or any smooth scroll library (causes conflicts with scroll listeners)
- Use React.lazy or lazy loading (causes navigation delay — eager import all pages)
- Import the nudimmud-logo.svg (contains green)
- Add ANY green, teal, cyan, or purple anywhere
- Use the old .nlp-shell consumer.css (outdated, not in use)
- Create placeholder images with text labels (keep image slots completely empty)
- Use the Showreel page (remove from routes — not ready yet)

**DO:**
- Import pages eagerly (no React.lazy)
- Use framer-motion for ALL animations
- Use `var(--font-display)` and `var(--font-body)` for typography
- Use `var(--color-crimson)` for all accent colors
- Use `var(--color-bg-abzu)`, `var(--color-bg-void)`, etc. for backgrounds
- Add `data-proximity` attribute to sections for Active Theory-style cursor proximity effects
- Add `data-magnetic` attribute to interactive elements for magnetic cursor pull
- Keep image/video slots completely empty (just a transparent or faint background)
- Use CSS perspective for 3D depth (no Three.js, no WebGL)
- Make the ArchitecturalGrid visible on ALL pages with pulsing triquetra

**Entry point:** index.tsx (not main.tsx) — must import CSS there
**Router:** BrowserRouter with Routes in App.tsx
**Scroll listener:** Use native window.addEventListener('scroll', ...) — NOT Lenis

---

## REFERENCE PATTERNS (Steal These)

From analyzed sites (RAG-MLM-HANDOVER / 06-ANALYZED-WEBSITES.md):

| Pattern | Source | Implementation |
|---------|--------|----------------|
| Scroll-triggered section reveals | neal.fun | whileInView with stagger |
| Magnetic cursor pull | cuberto.com | CineGlow cursor component |
| CSS 3D perspective on cards | press.stripe.com | perspective + rotateX/Y on hover |
| Hover proximity glow | activetheory.net | data-proximity + radial gradient |
| Grid noise overlay | INFINITYCRE8 (Lilly) | body::before with grid |
| Bento grid layout | stripe.com | CSS Grid with variable spans |
| Route prefetching | linear.app | React Router prefetch="intent" |
| Touch swipe navigation | linear.app | Touch event horizontal swipe |
| Frame corners | INFINITYCRE8 | .frame-corner CSS utility class |
| Scramble text reveal | codrops | character-by-character animation |

---

## EXISTING COMPONENTS (Read Before Overwriting)

Key files in /Users/marcelspatz/YURI-OS-MUSUBI/src/:

- **App.tsx** — main router, renders ArchitecturalGrid + CineGlow globally
- **index.tsx** — ENTRY POINT, imports CSS (do NOT switch to main.tsx)
- **components/ui/CineGlow.tsx** — canvas-based light cursor with magnetic pull
- **components/ui/ArchitecturalGrid.tsx** — fixed SVG with triquetra + grid lines (improve visibility)
- **components/Navigation.tsx** — nav with prefetch, pills, mobile drawer
- **components/Footer.tsx** — dark footer with links
- **components/CTABanner.tsx** — CTA section with glass hover
- **styles/tokens.css** — design tokens (crimson only, no green)
- **styles/global.css** — global styles with !important overrides for Albedo CSS
- **pages/HomePage.tsx** — hero + process + testimonial + CTABanner
- **pages/WorkPage.tsx** — bento grid + WorkGallery component
- **pages/ServicesPage.tsx** — 5 services + synthesis
- **pages/AboutPage.tsx** — narrative + roadmap + network + partners + stats
- **pages/ContactPage.tsx** — multi-step form with sidebar
- **components/ui/MagneticCursor.tsx** — alternative cursor (NOT in use, but available)

**ALSO READ:** RESEARCH/06-ANALYZED-WEBSITES.md — all 21 reference sites documented with exact techniques
**ALSO READ:** RESEARCH/08-SPATIAL-UI-PLAN.md — the spatial UI implementation plan

---

## FIRST STEPS

1. Read ALL the source files listed above to understand structure
2. Read the reference analysis files
3. Plan the rebuild focusing on spatial depth and visual storytelling
4. Implement page by page, starting with the ArchitecturalGrid (visual foundation)
5. Test each page after implementing

The dev server auto-reloads on save. Source is at /Users/marcelspatz/YURI-OS-MUSUBI/src/.
