# Nexus Link Productions — Full Cross-Reference Audit

> Your entire site (all pages at localhost:4200) compared against all 21
> reference sites. Every gap, every stealable pattern, every quick win.

---

## Your Site in One Look

**Framework:** React SPA with Vite + Framer Motion  
**Pages:** Home, Work, Services, About, Contact, Showreel (+ operator shell at /operator)  
**Typography:** Inter (body/display, one font family)  
**Accent:** Crimson red (#dc2626)  
**Background:** Dark (#0e0e18, #13131e, #161620)  
**Interactions:** Framer Motion entry animations, word-level scramble, scroll-based opacity transforms  
**Notable features:** Scramble text effect on hero, character-by-character reveal on services, orbital nav, noise texture overlay, scan line, marquee client strip  
**Dead components:** MagneticCursor.tsx + LightCursor.tsx exist but do nothing. `data-magnetic` attributes on buttons but no magnetic behavior.

---

## Cross-Reference: Where You Are vs. Where They Are

### 1. BRUNO SIMON — bruno-simon.com
**What to steal (LOW):** Achievement system — hidden Easter egg, quality/settings toggle, user "whisper" messages  
**Gap:** HIGH (full 3D world). But the gamification UX is copyable.

### 2. LUSION — lusion.co
**What to steal (LOW-MEDIUM):** A single subtle Three.js scene on services page — rotating geometric shape synced to scroll  
**Gap:** HIGH-MEDIUM

### 3. IGLOO — igloo.inc
**Gap:** VERY HIGH. Skip until shader foundation.

### 4. STRIPE PRESS — press.stripe.com ← STEAL THIS
**What to steal (LOW):**
- CSS perspective + rotateY on project cards (no WebGL needed)
- IntersectionObserver-based lazy activation
- Compositor-only animations (transform + opacity only, will-change hints)
**Gap:** LOW-MEDIUM. Highest ROI source for you right now.

### 5. NEAL.FUN — neal.fun/space-elevator
**What to steal (LOW):** Scroll-progress narrative on About page — "scroll 8 years of Nexus Link" with milestone markers  
**Gap:** LOW

### 6. LOCOMOTIVE — locomotive.ca ← DO THIS
**What to steal (LOW):**
- Proper Lenis smooth scroll integration (hook already exists, not wired)
- data-lag parallax on hero background orbs
- Scroll-direction-aware animations
**Gap:** LOW. Single biggest "feels premium" gap in your current site.

### 7. CUBERTO — cuberto.com ← DO THIS
**What to steal (LOW):**
- Cursor follower with lerp (components already exist, not imported)
- Magnetic button effect (data-magnetic attributes exist, no behavior)
- Cursor state machine
**Gap:** LOW. Most embarrassing gap — you have the components, they're just unused.

### 8. LANDO NORRIS — landonorris.com
**What to steal (simplified, LOW):** Radial gradient div that follows cursor over hero images (not real SDF shader)  
**Gap:** HIGH for real thing. LOW for simplified.

### 9. ACTIVE THEORY — activetheory.net
**What to steal (MEDIUM):** Hover proximity — work cards glow more as cursor approaches, not just on exact hover  
**Gap:** MEDIUM

### 10. CODROPS — tympanus.net/codrops
**Your gap:** ZERO. Use their tutorials for every animation technique.
**Apply now:** Variable font axis animation (weight shifts on scroll), SVG stroke-dashoffset (logo draws itself)

### 11. LINEAR — linear.app ← APPLY THIS
**What to steal (LOW-MEDIUM):**
- Merge your TWO token systems (tokens.css + consumer.css use different fonts and colors)
- Route prefetching (nav links load on hover)
- CLS avoidance (reserve space for stats row)
**Gap:** LOW-MEDIUM. Token unification is a one-hour fix.

### 12. STRIPE.COM — stripe.com ← APPLY THIS
**What to steal (LOW):**
- Bento grid on Work page (variable tile sizes vs. identical cards)
- Critical CSS inlining (Inter font blocks first paint)
- will-change: transform hints
**Gap:** LOW

### 13. TONE.JS — tonejs.github.io
**Gap:** LOW-MEDIUM. Audio-reactive is optional for a production studio. Skip.

---

## Priority Plan: This Week

| Order | Pattern | Source | Effort | Why |
|-------|---------|--------|--------|-----|
| 1 | Wire cursor + magnetic components | cuberto.com | 30min | Already exists, unused. Immediate polish. |
| 2 | Install Lenis smooth scroll | locomotive.ca | 1hr | Biggest "premium feel" win |
| 3 | Merge dual token systems | linear.app | 1hr | Consistency across all pages |
| 4 | Bento grid on Work page | stripe.com | 1hr | Visual variety from identical cards |
| 5 | CSS 3D perspective on project cards | press.stripe.com | 2hr | Depth without WebGL |

Want me to start writing the actual code changes? I can begin with step 1 (cursor) and step 3 (token unification) — those gate everything else and take an hour total.
