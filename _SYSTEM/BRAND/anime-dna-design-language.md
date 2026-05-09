# Anime DNA Design Language
*Extension Pack for Yuri OS — Japanese Aesthetics + Anime Visual Language*
*Version 1.0 — Apply to NUDIMMUD, Yuri OS, and any agent-facing surfaces*

> This is not a separate design system. It is an extension layer that sits on top of the Yuri OS design system (`_SYSTEM/BRAND/design-system.md`). Every principle here works within Yuri OS constraints — it does not replace them.

---

## Table of Contents
1. [Integration with Yuri OS](#1-integration-with-yuri-os)
2. [The 5 Core Principles](#2-the-5-core-principles)
3. [Color System](#3-color-system)
4. [Typography](#4-typography)
5. [Spacing System (Ma-Based)](#5-spacing-system-ma-based)
6. [Texture System](#6-texture-system)
7. [Animation System](#7-animation-system)
8. [Component Patterns](#8-component-patterns)
9. [Page Templates](#9-page-templates)
10. [HUD Application](#10-hud-application)
11. [Style Audit Checklist](#11-style-audit-checklist)

---

## 1. Integration with Yuri OS

### What This Extension Changes

| Yuri OS Element | Default Behavior | Anime DNA Extension |
|-----------------|------------------|---------------------|
| Backgrounds | Solid `#050505` | Paper grain overlay at 4%, indigo atmosphere |
| Accent colors | Functional (cyan, gold, green, red) | Extended with amber, sakura, jade, indigo |
| Typography | Single sans-serif stack | Serif display + sans body + mono data + accent hand-drawn |
| Spacing | Standard 8px grid | Ma-based 4-8-16-24-48 with principle-driven gaps |
| Transitions | Standard ease-in-out | Narrative-weighted, anticipation curves, seasonal cadence |
| Empty states | "Nothing here" | Canvases with invitation, sakura drift, Ma |
| Cards | Symmetrical grid, flat surfaces | Asymmetrical offset, hand-drawn texture, four-act expansion |
| Critical states | Red indicator | Battle damage crack pattern + red |
| Loading | Spinner or progress bar | Ink-spread animation, energy-converge pattern |
| Destructive actions | Confirmation dialog | 200ms hold ceremony, fade-to-black weight |

### Compatibility Rules

1. **Extension, not replacement.** All Yuri OS tokens remain valid. Anime DNA adds new tokens and overrides visual treatment, not structural logic.
2. **Function first.** If an anime DNA treatment conflicts with usability, the usability wins. The extension applies where aesthetics don't impede function.
3. **Progressive enhancement.** A user in the terminal gets the full functional system. A user in the portal UI gets the full anime DNA treatment. The system degrades gracefully.
4. **Component override only.** Individual components can opt into anime DNA treatment. The system does not force aesthetic onto data-dense or high-frequency interaction surfaces.

---

## 2. The 5 Core Principles

### 2.1 Ma (間) — Negative Space as Structural Power

**Philosophy:** Silence in music is not the absence of sound — it's the frame that gives sound meaning. Ma treats every gap, margin, and pause as a designed structural element.

**Usage Rules (concrete):**

| Element | Ma Application | CSS / Token |
|---------|---------------|-------------|
| Unrelated components | Minimum 24px gap | `--ma-gap: 24px` |
| Related components | 12px gap | `--ma-gap-related: 12px` |
| Sections | 48px spacing | `--ma-section: 48px` |
| Card internal padding | 24px minimum | `--ma-card-pad: 24px` |
| Animation completion pause | 200ms hold at 80% | `--ma-pause: 200ms` |
| Empty state | Full frame canvas | No compression of space |
| Page margins | 48px sides, 64px top | `--ma-page-margin: 48px 64px` |

**Code pattern — card grid with Ma:**

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--ma-gap); /* 24px — unrelated cards need space */
  padding: var(--ma-section); /* 48px from parent edges */
}

.card-grid .card:nth-child(3n) {
  /* Wabi-sabi offset: every third card shifts 8px */
  margin-top: 8px;
}
```

**Empty state — Ma canvas:**

```html
<!-- Not: "No items found" with a tiny illustration -->
<div class="empty-canvas">
  <div class="canvas-hint">Your items will appear here</div>
  <div class="sakura-drifter"></div> <!-- Subtle animation -->
</div>
```

```css
.empty-canvas {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: var(--paper-grain);
  /* The space itself is a design element — it says "ready and waiting" */
}

.canvas-hint {
  font-family: var(--font-accent);
  color: var(--text-dim);
  opacity: 0.6;
}
```

### 2.2 Wabi-sabi (侘寂) — Beauty in Imperfection

**Philosophy:** Perfection is not the goal. Slight asymmetries, natural color variations, organic curves over rigid grids. The hand-drawn line is more alive than the machine-straight one.

**Visual Application Matrix:**

| Surface | Default Yuri OS | Wabi-sabi Treatment |
|---------|----------------|---------------------|
| Card background | Flat `#0a0a0a` | Radial gradient with off-center focus, 3% paper grain overlay |
| Button | Solid fill | 5-8% top-to-bottom brightness gradient (like hand-applied glaze) |
| Divider line | 1px solid | Slight wobble: 0.5deg rotation, 0.5px variation in thickness |
| Card grid | Perfect alignment | Every 3rd card offset 8px vertically |
| Text gradients | Linear 0→100 | Radial with off-center focal point |
| Icon fills | Solid | Subtle noise scatter on interior fill |

**Code pattern — Wabi-sabi card:**

```css
.card {
  background: radial-gradient(
    ellipse at 45% 40%,    /* Off-center — not perfect 50% */
    var(--surface-raised) 0%,
    color-mix(in srgb, var(--surface-raised) 95%, var(--ink-scatter)) 100%
  );
  /* Paper grain as pseudo-element or background overlay */
  &::before {
    content: '';
    position: absolute; inset: 0;
    opacity: 0.04;
    background-image: url('/textures/washi.png');
    mix-blend-mode: overlay;
    pointer-events: none;
  }
}

/* Imperfect divider */
.divider {
  width: 100%;
  height: 1px;
  transform: rotate(-0.5deg) scaleY(0.5);
  background: linear-gradient(90deg,
    transparent 0%,
    var(--border-default) 20%,
    var(--border-default) 80%,
    transparent 100%
  );
}
```

### 2.3 Mushin (無心) — No-Mind Flow State

**Philosophy:** The interface disappears when in flow. No friction, no cognitive overhead. Hidden UI that reveals on intent. The tool becomes an extension of the user's body.

**Implementation Rules:**

1. **Chrome hides after 3 seconds of inactivity** — header, sidebar, status bar fade to 1px lines
2. **Hover on edges reveals chrome** — top 8px hover reveals header, left 8px hover reveals sidebar
3. **Keyboard shortcut shown on first hover** of any element, then never again (learned)
4. **Type "/" for command palette** — searches all actions, no browsing menus
5. **Escape returns to flow** — closes any open panel, dialog, or menu in one keypress
6. **Status indicators collapse to a single pixel line** when the user starts typing or interacting

**Code pattern — Mushin chrome:**

```css
.chrome-header {
  transition: all var(--ma-pause) var(--curve-standard);
  opacity: 1;
  transform: translateY(0);
}

body:has(.main-content:focus-within) .chrome-header {
  opacity: 0;
  transform: translateY(-100%);
  pointer-events: none;
}

/* Edge hover reveals */
.chrome-trigger {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 8px;
  z-index: 100;
}

.chrome-trigger:hover + .chrome-header,
.chrome-header:hover {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
```

### 2.4 Mono no aware (物の哀れ) — The Awareness of Transience

**Philosophy:** Loading states are anticipation, not waiting. Deleting feels like letting go. Closing a workspace feels like leaving a room. The interface acknowledges that every moment passes.

**Transition Weight Matrix:**

| Action | Weight | Animation | Duration | Notes |
|--------|--------|-----------|----------|-------|
| Page navigation | Heavy | Dual fade (→ black → reveal) | 400-600ms | The space between pages is real |
| Modal dismiss | Medium | Content dissolves upward, backdrop fades | 350ms | Like a thought passing |
| Delete item | Heavy | Item fades center-out, particles drift west | 500ms + 200ms hold | "Goodbye" weight |
| Notification | Light | Slides in from top-right, lingers, fades | 300ms in / 4000ms hold / 300ms out | Ephemeral by design |
| Panel collapse | Medium | Slides right, leaves subtle glow trail | 300ms | The echo of its presence |
| Error state | Heavy | 200ms hold before display — the weight of "you need to see this" | 200ms pause + reveal | Breath before bad news |

**Code pattern — Mono no aware page transition:**

```css
.page-enter {
  animation: mono-aware-enter 600ms var(--curve-standard);
}

.page-exit {
  animation: mono-aware-exit 400ms var(--curve-fade);
}

@keyframes mono-aware-enter {
  0%   { opacity: 0; filter: blur(4px); }
  40%  { opacity: 0; filter: blur(2px); }
  100% { opacity: 1; filter: blur(0); }
}

@keyframes mono-aware-exit {
  0%   { opacity: 1; }
  60%  { opacity: 0.4; filter: blur(2px); }
  100% { opacity: 0; filter: blur(8px); }
}

/* Destructive action: the 200ms hold */
.delete-button {
  transition: all 200ms;
}

.delete-button.active {
  /* Hold state — user must wait 200ms */
  background: var(--accent-red);
  animation: delete-ceremony 200ms;
}

@keyframes delete-ceremony {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.05); }
  100% { transform: scale(1); }
}
```

### 2.5 Kishōtenketsu (起承転結) — Four-Act Narrative Structure

**Philosophy:** Information reveals itself in narrative order. Introduction → Development → Twist → Resolution. No conflict required — just contrast, a shift in perspective, a new angle.

**Narrative Architecture Schema:**

```
KI (起) — INTRODUCTION
   → What is this? / What am I looking at?
   → Establishes context, subject, setting
   → 25% of content / attention

SHŌ (承) — DEVELOPMENT
   → How does it work? / What's the detail?
   → Builds on the introduction with depth
   → 35% of content / attention

TEN (転) — TWIST / TURN
   → What's interesting / unexpected here?
   → Contrast, insight, connection, surprise
   → 20% of content / attention

KETSU (結) — RESOLUTION
   → What do I do now? / What's the takeaway?
   → Actionable conclusion, forward path
   → 20% of content / attention
```

**Applied to Page Types:**

| Page Type | Ki | Shō | Ten | Ketsu |
|-----------|----|-----|-----|-------|
| Dashboard | Summary stats (what's happening) | Detail panels (drill down) | Connected insight / anomaly | Action buttons / next step |
| List view | Title and count | Filtered results | Hover reveals unexpected metadata | Select + action |
| Detail view | Hero image / title | Content blocks | Related or contrasting item | CTA / share / close |
| Settings | Section title | Configuration fields | Context-aware help tip | Apply / save button |
| Error state | "Something went wrong" | What happened | Why it matters / what was lost | What to do next |
| Form | Section header ("who") | Fields ("what") | Context or benefit ("why") | Submit / confirm ("do") |

**Code pattern — Kishōtenketsu card expansion:**

```javascript
// Card expansion follows narrative timing
function expandCard(card) {
  // Ki (0-300ms): Show title, subject
  card.querySelector('.card-title').animate([
    { opacity: 0, transform: 'translateY(8px)' },
    { opacity: 1, transform: 'translateY(0)' }
  ], { duration: 300, fill: 'forwards' });

  // Shō (300-700ms): Show content
  setTimeout(() => {
    card.querySelector('.card-content').animate([
      { opacity: 0, transform: 'translateY(12px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 400, fill: 'forwards' });
  }, 300);

  // Ten (700-1000ms): Show twist/insight
  setTimeout(() => {
    card.querySelector('.card-insight').animate([
      { opacity: 0 },
      { opacity: 1 }
    ], { duration: 300, fill: 'forwards' });
  }, 700);

  // Ketsu (1000-1300ms): Show CTA
  setTimeout(() => {
    card.querySelector('.card-action').animate([
      { opacity: 0, transform: 'scale(0.95)' },
      { opacity: 1, transform: 'scale(1)' }
    ], { duration: 300, fill: 'forwards' });
  }, 1000);
}
```

---

## 3. Color System

### Full Extended Palette

```css
:root {
  /* ══════════════════════════════════════
     YURI OS BASE (retained, unmodified)
     ══════════════════════════════════════ */

  --terminal-bg:        #050505;
  --surface-raised:     #0a0a0a;
  --surface-glass:      rgba(10, 10, 10, 0.85);
  --surface-hover:      #111111;

  --border-subtle:      rgba(255, 255, 255, 0.06);
  --border-default:     rgba(255, 255, 255, 0.10);
  --border-active:      rgba(255, 255, 255, 0.18);

  --accent-cyan:        #00e5bf;
  --accent-gold:        #76b900;
  --accent-red:         #ff5252;
  --accent-purple:      #9B59FF;
  --accent-green:       #00e676;

  --text-primary:       rgba(255, 255, 255, 0.92);
  --text-secondary:     rgba(255, 255, 255, 0.72);
  --text-dim:           rgba(255, 255, 255, 0.45);
  --text-inverse:       #0a0a0a;

  --status-active:      #00e676;
  --status-warning:     #76b900;
  --status-critical:    #ff5252;
  --status-idle:        rgba(255, 255, 255, 0.20);
  --status-pulse:       #9B59FF;

  /* ══════════════════════════════════════
     ANIME DNA — EXTENSION LAYER
     ══════════════════════════════════════ */

  /* ——— Core Atmosphere Colors ——— */
  --indigo-deep:         #0a0b1e;  /* Night sky backdrop (Mushin night mode) */
  --indigo-mid:          #1a1b30;  /* Card surfaces in immersive contexts */
  --indigo-dim:          #2a2b45;  /* Elevated surfaces, hover states */

  --warm-amber:          #c8a45c;  /* Golden hour / lantern light — warmth + nostalgia */
  --warm-amber-dim:      #a8883c;  /* Amber subdued — secondary amber uses */
  --warm-amber-glow:     #e8c47c;  /* Amber highlight — glow effects, active states */

  --sakura-pink:         #e8a0a0;  /* Cherry blossom — transience, soft power */
  --sakura-pink-dim:     #c88080;  /* Subdued sakura — background sakura */
  --sakura-pink-glow:    #f8c0c0;  /* Bright sakura — indicators, spot emphasis */

  --jade-green:          #5a8a6a;  /* Growth, patience, forest depth */
  --jade-green-dim:      #4a7a5a;  /* Subdued jade — secondary green uses */
  --jade-green-bright:   #6a9a7a;  /* Active jade — positive indicators */

  --ink-black:           #1c1c1c;  /* Sumi ink — solid presence, calligraphy base */
  --ink-wash:            #2a2a2a;  /* Diluted ink — secondary dark surface */

  --rice-paper:          #f5f0e8;  /* Warm white — for light surfaces */
  --rice-paper-dim:      #e5e0d8;  /* Subdued paper — secondary light surfaces */

  /* ——— Anime Accent Colors ——— */
  --anime-cyan:          #64d8e6;  /* Spirit energy, flowing water, technique glow */
  --anime-cyan-dim:      #44b8c6;  /* Subdued spirit energy */
  --anime-cyan-pulse:    #84e8f6;  /* Technique activation, focus state */

  --anime-purple:        #b388ff;  /* Cursed energy, domain expansion, rare signaling */
  --anime-purple-dim:    #9368df;  /* Subdued cursed energy */
  --anime-purple-glow:   #d3a8ff;  /* Domain expansion boundary glow */

  --anime-crimson:       #d32f2f;  /* Battle damage, critical state, sacrifice */
  --anime-crimson-dim:   #b31f1f;  /* Subdued crimson */
  --anime-crimson-glow:  #e34f3f;  /* Critical alert glow */

  --anime-gold:          #ffd54f;  /* Achievement, special technique, rare drop */
  --anime-gold-dim:      #dfb52f;  /* Subdued achievement */
  --anime-gold-glow:     #ffe56f;  /* Achievement unlock burst */

  /* ——— Semantic Overrides (when Anime DNA mode is active) ——— */

  /* The base accent remains functional. These override specific contexts. */
  --anime-text-normal:   #e8e4dc;  /* Slightly warm text for rice-paper moments */
}
```

### Color Usage Rules

| Token Category | When to Use | When NOT to Use |
|----------------|-------------|-----------------|
| `--indigo-*` | Backgrounds, atmosphere, depth layers | Text body, small UI elements |
| `--warm-amber` | Accents in standard UI, glow effects, nostalgic contexts | Critical alerts, destructive actions |
| `--sakura-pink` | Soft states, ephemeral indicators, time-sensitive markers | High-urgency alerts, primary CTAs |
| `--jade-green` | Growth, waiting states, patience indicators, secondary positive | Completion confirmations (use Yuri OS green) |
| `--ink-black` | Typography (light mode), divider lines, solid presences | Background surfaces (use Yuri OS blacks) |
| `--anime-cyan` | Processing, energy flow states, technique activation | Static backgrounds, permanent indicators |
| `--anime-purple` | Cursed energy, domain expansion, rare events | Routine operations, standard state |
| `--anime-crimson` | Critical errors, destructive actions, battle states | Warnings, secondary alerts |
| `--anime-gold` | Achievements, unlocks, special completions | Standard success, confirmations |

### Color Ratios

| Surface Type | Anime DNA Rule |
|-------------|----------------|
| Background | 90% indigo-deep + 10% terminal-bg |
| Card surface | 85% surface-raised + 15% indigo-mid atmosphere |
| Glow effects | < 5% of total visual area |
| Sakura tint | < 3% of any surface — imperceptible atmosphere |
| Paper grain | 4% opacity overlay on all backgrounds |

---

## 4. Typography

### Type Stack

```css
:root {
  /* ——— Display / Title ——— */
  --font-display: 'Noto Serif JP', 'EB Garamond', 'Georgia', serif;
  /* Sharp horizontal strokes. Kanji-heavy. For hero, section headers, quotes. */

  /* ——— Body / Navigation ——— */
  --font-sans: 'Inter', 'Noto Sans JP', -apple-system, sans-serif;
  /* Neutral, legible, multi-weight. Default reading experience. */

  /* ——— Data / Mono ——— */
  --font-mono: 'JetBrains Mono', 'Noto Sans Mono', 'SF Mono', monospace;
  /* Metrics, logs, code, timestamps, data displays. */

  /* ——— Accent / Hand-drawn ——— */
  --font-accent: 'Zen Kurenaido', 'Yuji Syuku', cursive;
  /* Ephemeral notes, pull quotes, emphasis, ceremonial text. */
}
```

### Type Scale

```css
:root {
  /* Base: 16px (1rem) */
  --text-xs:   0.75rem;   /* 12px — metadata, timestamps */
  --text-sm:   0.875rem;  /* 14px — labels, secondary info */
  --text-base: 1rem;      /* 16px — body text */
  --text-lg:   1.125rem;  /* 18px — large body, entry text */
  --text-xl:   1.25rem;   /* 20px — card titles, subheaders */
  --text-2xl:  1.5rem;    /* 24px — section headers */
  --text-3xl:  2rem;      /* 32px — page headers */
  --text-4xl:  2.5rem;    /* 40px — hero headers */
  --text-5xl:  3.5rem;    /* 56px — display headers, rare */
}
```

### Typography Animation Rules

| Element | Animation | Duration | Trigger |
|---------|-----------|----------|---------|
| Display/Title | Letter-spacing: 0 → 0.08em, opacity 0→1 | 600ms, ease-out | Page enter |
| Body text | Opacity 0→1, translateY 8px→0 | 400ms, ease-out | Visibility enter |
| Data/Mono | Typewriter reveal (char-by-char) | Variable | On data load |
| Accent/Handwritten | Subtle 1px oscillation (2s period) | Continuous | Always when visible |
| Labels/Metadata | Fade in, no movement | 200ms | On content ready |
| Links | Underline slides in from left edge | 300ms | On hover |
| Blockquotes | Left border slides down from top | 400ms | On scroll into view |

### Typography Hierarchy — Usage Matrix

| Element | Font | Weight | Size | Tracking | Line Height |
|---------|------|--------|------|----------|-------------|
| Hero title | Display | 700 | 3xl-5xl | 0.05em | 1.1 |
| Page title | Display | 700 | 2xl-3xl | 0.03em | 1.2 |
| Section header | Display | 600 | xl-2xl | 0.02em | 1.3 |
| Card title | Sans | 600 | lg-xl | 0 | 1.3 |
| Body text | Sans | 400 | base | 0 | 1.6 |
| Secondary text | Sans | 400 | sm | 0 | 1.5 |
| Label | Sans | 500 | xs | 0.02em | 1.4 |
| Data value | Mono | 400 | base | 0 | 1.4 |
| Data label | Mono | 400 | sm | 0.01em | 1.3 |
| Code block | Mono | 400 | sm | 0 | 1.8 |
| Pull quote | Accent | 400 | lg-xl | 0.02em | 1.4 |
| Ephemeral note | Accent | 400 | sm-base | 0.01em | 1.5 |
| Ceremonial text | Accent | 400 | 2xl-3xl | 0.05em | 1.2 |

---

## 5. Spacing System (Ma-Based)

### Base Unit: 4px

The Ma spacing system uses a non-linear scale — pauses between sizes are deliberate, not stepped evenly.

| Token | Value | Use Case |
|-------|-------|----------|
| `--ma-1` | 4px | Micro breathing — icons from text, label margins |
| `--ma-2` | 8px | Tight related elements — button padding, inline spacing |
| `--ma-3` | 16px | Comfortable — card padding, list item spacing |
| `--ma-4` | 24px | **Structural gap** — between unrelated components, default gap |
| `--ma-5` | 32px | Section breathing — between content groups |
| `--ma-6` | 48px | **Major section** — between major page sections |
| `--ma-7` | 64px | Page margins — horizontal content margins |
| `--ma-8` | 96px | Hero/presentation spacing — hero section padding |

```css
:root {
  --ma-1: 4px;
  --ma-2: 8px;
  --ma-3: 16px;
  --ma-4: 24px;  /* ◄ Default structural gap */
  --ma-5: 32px;
  --ma-6: 48px;  /* ◄ Major section separation */
  --ma-7: 64px;  /* ◄ Page margin */
  --ma-8: 96px;
}
```

### Spacing Rules by Component

| Component | Internal Padding | Gap from Neighbors | Gap from Section |
|-----------|-----------------|-------------------|------------------|
| Card | `--ma-3` (16px) | `--ma-4` (24px) | `--ma-6` (48px) |
| Button (min) | `--ma-2 --ma-3` (8px 16px) | `--ma-2` (8px) | `--ma-4` (24px) |
| Input field | `--ma-2 --ma-3` (8px 16px) | `--ma-3` (16px) | `--ma-5` (32px) |
| List item | `--ma-2` (8px) | `--ma-2` (8px) | `--ma-4` (24px) |
| Modal/popover | `--ma-4` (24px) | Center of viewport | N/A |
| Navigation link | `--ma-2` (8px) | `--ma-3` (16px) | `--ma-4` (24px) |
| Data table cell | `--ma-2 --ma-3` (8px 16px) | 0 (borders touch) | `--ma-4` (24px) |
| Hero section | N/A | `--ma-8` (96px) | `--ma-7` (64px) |

### The "Ma Compression Rule"

When viewport width is reduced, compress spacing in this order — never all at once:

1. Reduce `--ma-6` to `--ma-5` (48px → 32px)
2. Reduce section margin `--ma-7` to `--ma-6` (64px → 48px)
3. Reduce card gap `--ma-4` to `--ma-3` (24px → 16px)
4. Reduce card padding `--ma-3` to `--ma-2` (16px → 8px)
5. Only then: consider layout change (single column, etc.)

Never compress to less than `--ma-2` (8px) for any internal element. Below 8px, Ma is destroyed.

---

## 6. Texture System

### Texture Presets

```css
:root {
  /* ——— Washi Paper Grain ——— */
  --texture-washi: url('/textures/washi.png');
  --texture-washi-opacity: 0.04;

  /* ——— Sumi Ink Scatter ——— */
  --texture-sumi: radial-gradient(
    circle at 30% 70%, transparent 60%,
    rgba(28,28,28,0.03) 100%
  );
  --texture-sumi-opacity: 0.03;

  /* ——— Silk Gradient (off-center radial) ——— */
  --texture-silk: radial-gradient(
    ellipse at 45% 55%,
    rgba(255,255,255,0.03) 0%,
    transparent 70%
  );

  /* ——— Sakura Atmosphere ——— */
  --texture-sakura: radial-gradient(
    ellipse at 80% 20%,
    rgba(232, 160, 160, 0.03) 0%,
    transparent 60%
  );

  /* ——— Amber Warmth ——— */
  --texture-amber: radial-gradient(
    ellipse at 20% 80%,
    rgba(200, 164, 92, 0.03) 0%,
    transparent 60%
  );

  /* ——— Ink Bloom (hover/focus state) ——— */
  --texture-bloom: radial-gradient(
    circle at var(--cursor-x, 50%) var(--cursor-y, 50%),
    rgba(255,255,255,0.04) 0%,
    transparent 60%
  );
}
```

### Texture Layering Rules

| Layer Depth | Texture | Opacity | Blend Mode |
|-------------|---------|---------|------------|
| Base (z-0) | Washi grain | 4% | Overlay |
| Background (z-1) | Silk gradient | 3% | Normal |
| Atmosphere (z-2) | Sakura OR Amber tint | 3% | Normal |
| Surface (z-3) | Sumi scatter | 3% | Overlay |
| Interactive (z-4) | Ink bloom | 4% | Normal |

### Implementation Pattern

```css
/* Textured surface layer (card/panel) */
.textured-surface {
  position: relative;
  background: var(--surface-raised);
  overflow: hidden;
}

.textured-surface::before {
  content: '';
  position: absolute; inset: 0;
  background-image: var(--texture-washi);
  opacity: var(--texture-washi-opacity);
  mix-blend-mode: overlay;
  pointer-events: none;
}

.textured-surface::after {
  content: '';
  position: absolute; inset: 0;
  background: var(--texture-silk);
  pointer-events: none;
}

/* Hover state adds ink bloom */
.textured-surface:hover::after {
  background: var(--texture-bloom);
  transition: background-image 200ms;
}
```

---

## 7. Animation System

### Curve Definitions

```css
:root {
  /* ——— Core Curves ——— */
  --curve-standard:    cubic-bezier(0.25, 0.1, 0.25, 1);      /* Deliberate, natural */
  --curve-spring:     cubic-bezier(0.34, 1.56, 0.64, 1);       /* Responsive, anime reaction */
  --curve-fade:       cubic-bezier(0.55, 0.085, 0.68, 0.53);   /* Fading out, mono no aware exit */
  --curve-anticipe:   cubic-bezier(0.86, 0, 0.07, 1);           /* Anticipation — slow build, fast reveal */
  --curve-in:         cubic-bezier(0.0, 0.0, 0.2, 1);           /* Fast entrance */
  --curve-out:        cubic-bezier(0.4, 0.0, 1, 1);             /* Fast exit */
}
```

### Duration Map

```css
:root {
  --dur-micro:    150ms;   /* Hover states, micro-interactions */
  --dur-fast:     200ms;   /* Button press, toggle switch */
  --dur-normal:   300ms;   /* Standard transitions, hover reveals */
  --dur-slow:     400ms;   /* Panel transitions, modal opens/closes */
  --dur-narrative:600ms;   /* Page transitions, destructive ceremony */
  --dur-ceremony: 800ms;   /* Major state changes, domain expansion */
  --dur-ritual:   1200ms;  /* Full narrative sequences, loading rituals */
}
```

### Animation Presets

```css
/* ——— Standard Entrance ——— */
@keyframes ma-enter {
  0%   { opacity: 0; transform: translateY(12px); }
  60%  { opacity: 0.6; }
  100% { opacity: 1; transform: translateY(0); }
}

/* ——— Mushin Reveal (element appears on intent) ——— */
@keyframes mushin-reveal {
  0%   { opacity: 0; transform: scale(0.95); filter: blur(2px); }
  100% { opacity: 1; transform: scale(1); filter: blur(0); }
}

/* ——— Mono no Aware Exit ——— */
@keyframes mono-fade {
  0%   { opacity: 1; transform: scale(1); filter: blur(0); }
  100% { opacity: 0; transform: scale(0.97); filter: blur(4px); }
}

/* ——— Ink Bloom (loading state) ——— */
@keyframes ink-bloom {
  0%   { transform: scale(0); opacity: 0.8; }
  50%  { transform: scale(1.2); opacity: 0.4; }
  100% { transform: scale(1.5); opacity: 0; }
}

/* ——— Sakura Drift (idle state, empty canvas) ——— */
@keyframes sakura-drift {
  0%   { transform: translate(0, 0) rotate(0deg); opacity: 0; }
  20%  { opacity: 0.3; }
  80%  { opacity: 0.1; }
  100% { transform: translate(80px, 120px) rotate(360deg); opacity: 0; }
}

/* ——— Energy Converge (processing/loading — anime technique activation) ——— */
@keyframes energy-converge {
  0%   { clip-path: circle(0% at 50% 50%); }
  100% { clip-path: circle(100% at 50% 50%); }
}

/* ——— Afterimage Trail ——— */
@keyframes afterimage {
  0%   { opacity: 0.2; }
  100% { opacity: 0; }
}
```

### Animation Application Rules

| Trigger | Animation | Curve | Duration | Stagger |
|---------|-----------|-------|----------|---------|
| Page enter | `ma-enter` on elements | standard | 400-600ms | 40ms between siblings |
| Page exit | `mono-fade` on container | fade | 400ms | None (all at once) |
| Hover state | Scale 1→1.02, brighter | spring | 200ms | N/A |
| Focus state | Ring glow with ink bloom | standard | 300ms | N/A |
| Loading start | `energy-converge` on icon | anticipe | 800ms | N/A |
| Loading complete | Content fades in | standard | 400ms | N/A |
| Error appear | Slide down from top, wobble | spring | 300ms | N/A |
| Success flash | Brief opacity oscillation | standard | 400ms | N/A |
| Drag start | Slight scale up, shadow deepens | spring | 200ms | N/A |
| Notification | Slide in, pause, mono-fade out | standard + fade | 300+4000+300ms | N/A |

### Stagger Grid System

For groups of elements entering a viewport simultaneously, apply stagger:

```css
.element:nth-child(1) { animation-delay: 0ms; }
.element:nth-child(2) { animation-delay: 60ms; }
.element:nth-child(3) { animation-delay: 120ms; }
/* ... continues +60ms per child, max 600ms total delay */
```

---

## 8. Component Patterns

### 8.1 Card — The Four-Act Vessel

**States:** Default | Hover | Expanded | Loading

```html
<div class="card" data-state="default">
  <div class="card-header">
    <h3 class="card-title">Mission Briefing</h3>
    <span class="card-metadata">2 minutes ago</span>
  </div>
  <div class="card-preview">
    <p class="card-summary">Content preview that hints at depth...</p>
  </div>
  <!-- Hidden content revealed on expansion -->
  <div class="card-ki hidden">What: Analysis of signal patterns</div>
  <div class="card-sho hidden">How: 3-phase spectral decomposition</div>
  <div class="card-ten hidden">Insight: Same pattern detected in Q3 2025</div>
  <div class="card-ketsu hidden">Action: [Deep Dive] [Share]</div>
</div>
```

```css
.card {
  background: var(--surface-raised);
  padding: var(--ma-card-pad, 16px);
  border: 1px solid var(--border-subtle);
  border-radius: 4px; /* Intentionally not fully rounded — Wabi-sabi avoids perfect radii */
  position: relative;
  overflow: hidden;
  transition: all var(--dur-normal) var(--curve-standard);
}

/* Wabi-sabi: paper grain overlay */
.card::before {
  content: '';
  position: absolute; inset: 0;
  background: var(--texture-washi);
  opacity: var(--texture-washi-opacity);
  mix-blend-mode: overlay;
  pointer-events: none;
}

/* Wabi-sabi: off-center silk gradient */
.card::after {
  content: '';
  position: absolute; inset: 0;
  background: var(--texture-silk);
  pointer-events: none;
}

.card:hover {
  border-color: var(--border-default);
  transform: translateY(-2px);
  /* Ink bloom on hover */
  background: radial-gradient(
    circle at 45% 40%,
    var(--surface-hover) 0%,
    var(--surface-raised) 100%
  );
}

/* Expanded state */
.card[data-state="expanded"] {
  grid-column: span 2;
  padding: var(--ma-4);
}

/* Loading state */
.card[data-state="loading"] .card-preview {
  background: linear-gradient(90deg,
    var(--surface-hover) 0%,
    var(--border-subtle) 50%,
    var(--surface-hover) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 2px;
  height: 1em;
}
```

### 8.2 Button — The Intent Manifest

**States:** Default | Hover | Active | Loading | Disabled | Critical

```html
<button class="btn btn--primary" data-intent="action">
  <span class="btn-text">Execute</span>
  <span class="btn-glow"></span>
</button>

<button class="btn btn--critical" data-intent="destroy">
  <span class="btn-text">Delete</span>
</button>

<button class="btn btn--ghost">
  <span class="btn-text">Cancel</span>
</button>
```

```css
.btn {
  position: relative;
  padding: var(--ma-2) var(--ma-3);
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 500;
  letter-spacing: 0.02em;
  transition: all var(--dur-fast) var(--curve-standard);
  overflow: hidden;
}

/* Primary — center-fill technique activation */
.btn--primary {
  background: linear-gradient(
    180deg,
    var(--accent-cyan) 0%,
    color-mix(in srgb, var(--accent-cyan) 90%, black) 100%
  );
  color: var(--text-inverse);
  /* Glaze gradient (wabi-sabi) */
}

.btn--primary:hover {
  transform: scale(1.02);
  box-shadow: 0 0 24px rgba(0, 229, 191, 0.2);
}

.btn--primary::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(
    circle at center,
    rgba(255,255,255,0.3) 0%,
    transparent 60%
  );
  opacity: 0;
  transition: opacity var(--dur-fast);
  /* Center-fill technique activation on click */
}

.btn--primary:active::before {
  opacity: 1;
  transform: scale(2);
}

/* Critical button with mono no aware hold */
.btn--critical {
  background: var(--anime-crimson);
  color: white;
}

.btn--critical:active {
  animation: delete-ceremony 200ms;
}

/* Critical button requires hold confirmation */
.btn--critical[data-hold="true"] {
  /* After 200ms hold, visual confirmation appears */
  background: var(--anime-crimson-glow);
  box-shadow: 0 0 16px rgba(211, 47, 47, 0.4);
}

/* Ghost button — Mushin, only appears when needed */
.btn--ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid transparent;
}

.btn--ghost:hover {
  border-color: var(--border-subtle);
  color: var(--text-primary);
}
```

### 8.3 Transitions & Page Navigation

```css
/* Page container */
.page {
  position: relative;
}

/* Page enters */
.page-enter {
  animation: page-enter 600ms var(--curve-standard);
}

.page-enter .page-title {
  animation: title-enter 600ms var(--curve-anticipe);
}

.page-enter .page-content {
  animation: ma-enter 400ms var(--curve-standard) 200ms both;
}

.page-enter .page-footer {
  animation: ma-enter 400ms var(--curve-standard) 400ms both;
}

@keyframes page-enter {
  0%   { opacity: 0; }
  40%  { opacity: 0.3; }  /* The "in-between" moment */
  100% { opacity: 1; }
}

@keyframes title-enter {
  0%   { letter-spacing: 0.08em; opacity: 0; }
  100% { letter-spacing: var(--title-tracking, 0.03em); opacity: 1; }
}

/* Page exits */
.page-exit {
  animation: page-exit 400ms var(--curve-fade) both;
}

@keyframes page-exit {
  0%   { opacity: 1; filter: blur(0); }
  60%  { opacity: 0.3; filter: blur(4px); }
  100% { opacity: 0; filter: blur(8px); opacity: 0; }
}
```

### 8.4 Modal / Dialog — The Ceremonial Container

```css
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  animation: overlay-enter 300ms var(--curve-standard);
}

.modal {
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 480px;
  max-height: 80vh;
  background: var(--surface-raised);
  border: 1px solid var(--border-default);
  padding: var(--ma-4);
  animation: modal-enter 400ms var(--curve-standard);
}

@keyframes modal-enter {
  0%   { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

/* Modal closing — mono no aware fade */
.modal-closing {
  animation: modal-exit 350ms var(--curve-fade);
}

@keyframes modal-exit {
  0%   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -45%) scale(0.97); }
}
```

### 8.5 Loading State — The Anticipation Ritual

Loading is not waiting. It's preparation.

```html
<div class="loading-state">
  <div class="loading-technique">
    <div class="energy-line line-1"></div>
    <div class="energy-line line-2"></div>
    <div class="energy-line line-3"></div>
  </div>
  <span class="loading-text font-accent">Preparing...</span>
</div>
```

```css
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ma-3);
  min-height: 160px;
}

.loading-technique {
  position: relative;
  width: 48px;
  height: 48px;
}

/* Energy lines converge to center, then burst (anime technique activation) */
.energy-line {
  position: absolute;
  width: 2px;
  height: 24px;
  background: var(--anime-cyan);
  opacity: 0.6;
  transform-origin: bottom center;
}

.line-1 { transform: rotate(0deg) translateY(-12px); animation: converge 1s infinite; }
.line-2 { transform: rotate(120deg) translateY(-12px); animation: converge 1s infinite 0.15s; }
.line-3 { transform: rotate(240deg) translateY(-12px); animation: converge 1s infinite 0.3s; }

@keyframes converge {
  0%   { opacity: 0; height: 0; }
  30%  { opacity: 0.6; height: 24px; }
  70%  { opacity: 0.2; height: 12px; transform: translateY(-6px); }
  100% { opacity: 0; height: 0; transform: translateY(0); }
}

.loading-text {
  color: var(--text-dim);
  font-family: var(--font-accent);
  letter-spacing: 0.05em;
}
```

### 8.6 Empty State — The Ma Canvas

```html
<div class="empty-canvas">
  <div class="canvas-atmosphere"></div>
  <div class="canvas-content">
    <div class="canvas-symbol">⏤</div>
    <p class="canvas-text font-accent">Your log entries will appear here</p>
    <p class="canvas-hint">Start recording to fill this space</p>
  </div>
  <div class="sakura-drifter">
    <span class="petal"></span>
  </div>
</div>
```

```css
.empty-canvas {
  position: relative;
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border-subtle);
  background: var(--texture-washi);
  overflow: hidden;
}

.canvas-atmosphere {
  position: absolute; inset: 0;
  background: var(--texture-sakura);
  opacity: 0.3;
}

.canvas-content {
  position: relative;
  text-align: center;
  z-index: 1;
}

.canvas-symbol {
  font-size: var(--text-3xl);
  color: var(--text-dim);
  opacity: 0.3;
  margin-bottom: var(--ma-3);
}

.canvas-text {
  color: var(--text-secondary);
  font-family: var(--font-accent);
  margin-bottom: var(--ma-2);
}

.canvas-hint {
  color: var(--text-dim);
  font-size: var(--text-sm);
}

/* Sakura petal drifter — appears every 10 seconds */
.sakura-drifter {
  position: absolute;
  top: 0; left: 0;
  animation: sakura-cycle 10s infinite;
}

@keyframes sakura-cycle {
  0%, 100% { opacity: 0; }
  60% { opacity: 0; }
  65% { opacity: 0.8; }
  95% { opacity: 0.2; }
}
```

### 8.7 Navigation — Mushin Vanishing Chrome

```css
.nav-bar {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 48px;
  background: var(--surface-glass);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-subtle);
  transition: all var(--dur-slow) var(--curve-standard);
  z-index: 50;

  /* Mushin hidden state — collapses to 1px line */
  &.hidden {
    transform: translateY(-100%);
    opacity: 0;
  }

  /* Compressed state — collapsed to 1px border line */
  &.compressed {
    height: 1px;
    transform: translateY(0);
    opacity: 0.2;
  }
}

/* Reveal trigger — hover top 8px reveals nav */
.nav-trigger {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 8px;
  z-index: 51;
}

.nav-trigger:hover ~ .nav-bar,
.nav-bar:hover {
  transform: translateY(0);
  opacity: 1;
  height: 48px;
}
```

---

## 9. Page Templates

### 9.1 Landing Page

**Structure:** Hero → Feature Grid → Insight Section → CTA

```
┌─────────────────────────────────────────────┐
│  [Nav — Mushin, collapsed by default]        │
│                                               │
│  ┌─── MA (96px) ──────────────────────────┐  │
│  │   KI: Hero                               │  │
│  │   - Display title (letter-spacing anim)  │  │
│  │   - Subtitle (sans, secondary)           │  │
│  │   - CTA button (primary)                 │  │
│  └──────────────────────────────────────────┘  │
│                                               │
│  ┌─── MA (48px) ──────────────────────────┐  │
│  │   SHŌ: Feature Grid (3-column)          │  │
│  │   ┌──────┐ ┌──────┐ ┌──────┐            │  │
│  │   │ Card │ │ Card │ │ Card │            │  │
│  │   │ Wabi  │ │ Ma   │ │ Mush │            │  │
│  │   └──────┘ └──────┘ └──────┘            │  │
│  │   - 3rd card offset 8px (wabi-sabi)     │  │
│  └──────────────────────────────────────────┘  │
│                                               │
│  ┌─── MA (48px) ──────────────────────────┐  │
│  │   TEN: Insight Section                   │  │
│  │   - Pull quote (accent font)             │  │
│  │   - Contrasting illustration/pattern      │  │
│  └──────────────────────────────────────────┘  │
│                                               │
│  ┌─── MA (48px) ──────────────────────────┐  │
│  │   KETSU: CTA Block                       │  │
│  │   - Primary action button                │  │
│  │   - Secondary link                       │  │
│  └──────────────────────────────────────────┘  │
│                                               │
│  [Footer — minimal, dim]                      │
└─────────────────────────────────────────────┘
```

### 9.2 List Page

**Structure:** Header → Filter/Controls → Results Grid

```
┌─────────────────────────────────────────────┐
│  Header (Ki: "Your Missions")               │
│  Controls (Shō: Filter, Sort, Search)        │
│                                               │
│  ┌──────┐ ┌──────┐ ┌──────┐                  │
│  │ Card │ │ Card │ │ Card │ ← 3rd offset 8px │
│  ├──────┤ ├──────┤ ├──────┤                  │
│  │ Card │ │ Card │ │ Card │                  │
│  └──────┘ └──────┘ └──────┘                  │
│                                               │
│  Ten: Empty state with sakura drift           │
│  Ketsu: "+ New" FAB (bottom-right)            │
└─────────────────────────────────────────────┘
```

### 9.3 Detail Page

**Structure:** Hero → Content → Insight → Action

```
┌─────────────────────────────────────────────┐
│  KI: Hero Image / Title                      │
│  - Full-bleed or contained, with grain       │
│                                               │
│  SHŌ: Content Blocks                         │
│  - Body text with Ma spacing                 │
│  - Data/mono values for metrics              │
│                                               │
│  TEN: Related / Contrasting Item              │
│  "This is connected to..."                   │
│                                               │
│  KETSU: Action Bar                            │
│  [Edit] [Share] [Delete - with ceremony]      │
└─────────────────────────────────────────────┘
```

### 9.4 Flow Page (Wizard / Multi-Step)

**Structure:** Each step is one Kishōtenketsu act

```
Step 1: Ki — "What are we doing?"
  [Title input] [Description]

Step 2: Shō — "How should it work?"
  [Configuration fields]

Step 3: Ten — "Here's something interesting..."
  [Unexpected insight / benefit / preview]

Step 4: Ketsu — "Let's execute"
  [Review] [Confirm - with ceremony animation]
```

### 9.5 Error Page

**Structure:** Ki-Shō-Ten-Ketsu applied to failure

```
┌─── KI (0-200ms) ────────────────────────
│  "Something went wrong"
│  [Subtle battle damage crack pattern]

┌─── SHŌ (200-500ms) ─────────────────────
│  "Here's what happened: [error detail]"
│  But no stack traces — human-readable

┌─── TEN (500-800ms) ─────────────────────
│  "What this means: [impact context]"
│  "Your data is safe" / "Nothing was lost"

┌─── KETSU (800ms+) ──────────────────────
│  "What to do:"
│  [Retry] [Go Back] [Contact Support]
```

---

## 10. HUD Application

### How Each Principle Changes the Current HUD Design

#### Ma on the HUD

| Current HUD Element | Ma Treatment |
|--------------------|-------------|
| Panel grid | 24px gaps between panels (from current 12px) |
| Status indicators | 8px gap between icon and label (from current 4px) |
| Data readouts | 16px padding within readout cards |
| Timeline | 48px between timeline events (creating breathing room for mental processing) |
| Alert stack | 12px between alerts (related = 12px; unrelated would be 24px) |
| Headers | 32px below header before content begins |

#### Wabi-sabi on the HUD

| Current HUD Element | Wabi-sabi Treatment |
|--------------------|-------------------|
| Card backgrounds | 3% paper grain overlay + off-center silk gradient |
| Progress bars | Slightly irregular fill pattern (not perfectly smooth) |
| Data visualization | Grid lines at slightly asymmetrical intervals |
| Border radii | Mix of 2px and 4px (not uniform — organic difference) |
| Color fills | Subtle 5% gradient variance top-to-bottom |
| Icon fills | 1% noise scatter within solid fills |

#### Mushin on the HUD

| Current HUD Element | Mushin Treatment |
|--------------------|------------------|
| Sidebar | Hidden until hover on left 8px zone |
| Top bar | Collapses to 1px line after 3s inactivity |
| Status indicators | Collapse to 1px colored dot when user is focused on main area |
| Mouse cursor | Invisible after 2s of inactivity — revealed on movement |
| Keyboard hint | Shown once on first hover, then never again |
| Command palette | "/" trigger — always accessible, never in the way |

#### Mono no aware on the HUD

| Current HUD Element | Mono no aware Treatment |
|--------------------|------------------------|
| Closing a panel | 300ms dissolve with slight glow trail |
| Deleting a mission | 500ms ceremony with hold confirmation |
| Switching views | 400ms fade-to-dark between modes |
| Notification clearing | Fades out with 5s linger — ephemeral by design |
| Session timeout | Warning glow 30s before — acknowledgment of departing |
| Data refresh | Current data fades (not cuts) before new data appears |

#### Kishōtenketsu on the HUD

| Current Screen | Ki | Shō | Ten | Ketsu |
|----------------|----|-----|-----|-------|
| Dashboard | System status summary | Detail panels per agent | Connection insight between agents | Action buttons |
| Agent profile | Name, type, status | Capabilities, history | Related agents / conflict patterns | Assign, message, deactivate |
| Memory browser | Search bar + results count | Memory list with preview | Unexpected connection to another memory | Open, relate, archive |
| Settings | Category tabs (Ki = label) | Configuration fields | Context help bubble with contrast insight | Apply / reset |
| Query results | Result count + time | Result cards | Pattern / insight from across results | Export, save, share |

---

## 11. Style Audit Checklist

### 11.1 Ma Audit

- [ ] Every unrelated element has minimum 24px gap
- [ ] Related elements (form groups, button sets) have 12px
- [ ] Page margins are minimum 64px horizontal, 48px vertical
- [ ] No element touches another unless functionally grouped
- [ ] Empty states use full canvas — not "nothing here" with icon
- [ ] Card internal padding is minimum 16px
- [ ] Major sections have 48px separation
- [ ] Animation timing includes deliberate pauses (Ma-pause)

### 11.2 Wabi-sabi Audit

- [ ] No perfectly flat background (paper grain applied)
- [ ] Card grid has at least one asymmetrical element per viewport
- [ ] Gradients are off-center radial, not perfect linear
- [ ] No uniform border radii across all surface types
- [ ] Color fills have 5-8% gradient variance
- [ ] Divider lines have slight rotation or thickness variation
- [ ] Textures are visible but imperceptible (< 5% opacity)
- [ ] Imperfections feel intentional, not accidental

### 11.3 Mushin Audit

- [ ] Chrome hides after 3 seconds of inactivity
- [ ] Edge hover zones reveal hidden UI (top, left edges)
- [ ] Every action has a keyboard shortcut
- [ ] "/" opens command palette
- [ ] Escape closes any open dialog/menu in one keypress
- [ ] Decorative elements removed — each visual has a function
- [ ] New users get affordance; power users get vanishing chrome

### 11.4 Mono no aware Audit

- [ ] Page transitions use fade-based (not cut or slide) patterns
- [ ] Destructive actions have weight-appropriate ceremony
- [ ] Loading states feel like anticipation, not waiting
- [ ] Ephemeral data has different visual weight than permanent data
- [ ] Delete animation is a fade-to-nothing, not a slide-to-trash
- [ ] Time sensitivity reflected in UI temperature/opacity
- [ ] Seasonal or time-of-day shifts in atmosphere (optional)
- [ ] Every closing action has a moment of pause

### 11.5 Kishōtenketsu Audit

- [ ] Information on each page follows four-act narrative flow
- [ ] The "twist" (Ten) provides a contrasting perspective
- [ ] Resolution (Ketsu) offers actionable next steps
- [ ] No page presents all information at the same weight
- [ ] Card expansion reveals in narrative order
- [ ] Error states follow Ki-Shō-Ten-Ketsu structure
- [ ] Form flows grouped into narrative acts, not flat inputs
- [ ] Loading/transition states are part of the narrative, not interruptions

---

## Appendix A: CSS Token Reference

```css
/* ─── Spacing ─── */
--ma-1: 4px;    --ma-2: 8px;   --ma-3: 16px;
--ma-4: 24px;   --ma-5: 32px;  --ma-6: 48px;
--ma-7: 64px;   --ma-8: 96px;

/* ─── Durations ─── */
--dur-micro:    150ms;  --dur-fast:     200ms;
--dur-normal:   300ms;  --dur-slow:     400ms;
--dur-narrative:600ms;  --dur-ceremony: 800ms;
--dur-ritual:   1200ms;

/* ─── Curves ─── */
--curve-standard: cubic-bezier(0.25, 0.1, 0.25, 1);
--curve-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);
--curve-fade:     cubic-bezier(0.55, 0.085, 0.68, 0.53);
--curve-anticipe: cubic-bezier(0.86, 0, 0.07, 1);
--curve-in:       cubic-bezier(0.0, 0.0, 0.2, 1);
--curve-out:      cubic-bezier(0.4, 0.0, 1, 1);

/* ─── Anime DNA Colors ─── */
--indigo-deep:         #0a0b1e;
--indigo-mid:          #1a1b30;
--warm-amber:          #c8a45c;
--sakura-pink:         #e8a0a0;
--jade-green:          #5a8a6a;
--ink-black:           #1c1c1c;
--rice-paper:          #f5f0e8;
--anime-cyan:          #64d8e6;
--anime-purple:        #b388ff;
--anime-crimson:       #d32f2f;
--anime-gold:          #ffd54f;

/* ─── Texture Overlays ─── */
--texture-washi-opacity: 0.04;
--texture-sumi-opacity: 0.03;
--texture-silk-opacity: 0.03;

/* ─── Fonts ─── */
--font-display: 'Noto Serif JP', 'EB Garamond', 'Georgia', serif;
--font-sans: 'Inter', 'Noto Sans JP', -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', 'Noto Sans Mono', 'SF Mono', monospace;
--font-accent: 'Zen Kurenaido', 'Yuji Syuku', cursive;
```

---

*This document extends the Yuri OS design system. For base tokens and architecture, see `_SYSTEM/BRAND/design-system.md`. For implementation skill, see `.agents/skills/anime-dna-extensions/SKILL.md`.*
