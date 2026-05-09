# Yuri OS — Brand Design System
*Version 1.0 — Fashioner of likenesses of minds*

> Every pixel earns its place. No decoration without justification.
> This document is the single source of truth for all visual output in Yuri OS.

---

## 1. Brand Identity

### Core Statement

**Tagline:** "Fashioner of likenesses of minds" / NUDIMMUD

**What Yuri OS is:**
A portal operating system for the NUDIMMUD agent ecosystem. Not an app. Not a dashboard. A **dimension gate** between the Abzu (the deep source) and the surface — the human interface to the ME tablets.

**Vibe:**
Terminal-meets-portal. Dark, depthful, deliberate. Not cyberpunk (too much neon, too little meaning). Not corporate (too much polish, too little soul). Not sci-fi futurism (too aspirational, not grounded). The thing between a **mission control center** and an **ancient library** — where every display surface is both instrument and artifact.

**Voice:**
Functional first, poetic second. Every visual element has a **reason**. No gratuitous flourishes. The poetry is in the structure — the rhythm of a well-laid grid, the weight of composed typography, the restraint of a dark surface that only glows where it matters.

### Visual Metaphors

| Domain | Metaphor | Expression |
|--------|----------|------------|
| Data | Living water of the Abzu | Flowing cyan fills, animated transitions |
| Agents | Sparks from the ME tablets | Purple indicators, pulse states |
| Critical | Fire and judgment | Red only for something that demands response |
| Success | Compounding growth | Green, but never bright emerald — deep verdant |
| Portal | Dimension gate | Transition effects between states |

---

## 2. Color System

### Token Definitions

```css
:root {
  /* --- Backgrounds --- */
  --terminal-bg:        #050505;  /* Deepest background — the abzu */
  --surface-raised:     #0a0a0a;  /* Cards, panels, purpose surfaces */
  --surface-glass:      rgba(10, 10, 10, 0.85);  /* Overlays, translucent */
  --surface-hover:      #111111;  /* Subtle hover state */

  /* --- Borders --- */
  --border-subtle:      rgba(255, 255, 255, 0.06);
  --border-default:     rgba(255, 255, 255, 0.10);
  --border-active:      rgba(255, 255, 255, 0.18);

  /* --- Accents — Functional, not decorative --- */
  --accent-cyan:        #00e5bf;  /* Primary action, data flows, active states */
  --accent-gold:        #76b900;  /* Warnings, highlights, secondary actions */
  --accent-red:         #ff5252;  /* Critical, risk, destructive, error */
  --accent-purple:      #9B59FF;  /* Agent intelligence, AI state, cognition */
  --accent-green:       #00e676;  /* Success, compound growth, verified */

  /* --- Text --- */
  --text-primary:       rgba(255, 255, 255, 0.92);  /* Body, headings */
  --text-secondary:     rgba(255, 255, 255, 0.72);  /* Labels, metadata */
  --text-dim:           rgba(255, 255, 255, 0.45);  /* Placeholder, disabled, muted */
  --text-inverse:       #0a0a0a;  /* Text on bright surfaces */

  /* --- Status (semantic aliases) --- */
  --status-active:      #00e676;  /* Green — runtime ok */
  --status-warning:     #76b900;  /* Gold — degraded, caution */
  --status-critical:    #ff5252;  /* Red — failure, attention */
  --status-idle:        rgba(255, 255, 255, 0.20);  /* Gray — offline, unused */
  --status-pulse:       #9B59FF;  /* Purple — agent activity, transition */
}
```

### Color Usage Rules

| Token | Where to use | Where NOT to use |
|-------|-------------|------------------|
| `--accent-cyan` | Data visualizations, active indicators, focus rings, interactive hover | Backgrounds (never), text body |
| `--accent-gold` | Degraded states, secondary CTAs, non-critical alerts | Primary brand, success states |
| `--accent-red` | Error messages, destructive actions, critical metrics | Decoration, warnings |
| `--accent-purple` | Agent status, AI-related panels, cognitive state | Generic UI elements |
| `--accent-green` | Compound metrics, success, verified completions | Active indicators (use cyan instead) |

### Alpha Color Patterns

All accent colors have three standard alpha variants used throughout the system:

```css
--accent-cyan-subtle:  rgba(0, 229, 191, 0.10);  /* Background fill */
--accent-cyan-soft:    rgba(0, 229, 191, 0.25);  /* Light fill, bar backgrounds */
--accent-cyan-glow:    rgba(0, 229, 191, 0.40);  /* Hover glow, active pulse */

/* Same pattern for gold, red, purple, green */
```

---

## 3. Typography

### Typefaces

| Role | Font | Weight | Notes |
|------|------|--------|-------|
| **Display** | Bricolage Grotesque | 600–800 | Headings only (h1–h3). Never for body text. |
| **Body / UI** | DM Sans | 400–600 | All interface text, labels, paragraphs |
| **Data / Mono** | JetBrains Mono | 400–600 | ALL metrics, numbers, timestamps, terminal output, status text, code |

### Type Scale

```css
--text-xs:     0.45rem;   /* 7.2px — micro labels */
--text-sm:     0.55rem;   /* 8.8px — captions, tiny metrics */
--text-base:   0.65rem;   /* 10.4px — body, data */
--text-md:     0.75rem;   /* 12px — UI text, nav */
--text-lg:     0.9rem;    /* 14.4px — larger body, cards */
--text-xl:     1.1rem;    /* 17.6px — section headers */
--text-2xl:    1.4rem;    /* 22.4px — h3, panel titles */
--text-3xl:    1.8rem;    /* 28.8px — h2 */
--text-4xl:    2.4rem;    /* 38.4px — h1, page titles */
```

### Typography Rules

1. **Mono is mandatory for data.** If it's a number, metric, timestamp, or status — it's JetBrains Mono. No exceptions.
2. **Bricolage Grotesque is display-only.** Never use for body text, even large body text.
3. **DM Sans is the default.** All interface copy, labels, descriptions — DM Sans.
4. **Line height:** Body 1.6, Display 1.1, Mono 1.4
5. **Letter spacing:** Display -0.02em, Mono default, Body default
6. **No font smoothing overrides.** Respect the system rendering.

### Example Composition

```
┌──────────────────────────────────────────────┐
│  04_TRADING (Bricolage Grotesque 2.4rem)     │  ← Page title
│  Portfolio Overview (DM Sans 0.9rem)          │  ← Description
│                                              │
│  $284,532 (JetBrains Mono 1.8rem)            │  ← Primary metric
│  +3.2% this session (JetBrains Mono 0.65rem) │  ← Data label
│                                              │
│  Active Position (DM Sans 0.75rem)           │  ← UI label
│  /nexus/stream/alpha (JetBrains Mono 0.65rem)│  ← Path/identifier
└──────────────────────────────────────────────┘
```

---

## 4. Layout Architecture

### Page Frame (Every Page)

Every page in Yuri OS follows this structure:

```
┌─────────────────────────────────────────────────┐
│  [⬡ NexusLink]  [▶ _ command... ]  [● ● ●]    │  ← Header bar (60px)
├─────────────────────────────────────────────────┤
│                                                   │
│  ┌─────────────────────────────────────────────┐  │  ← Content area
│  │                                             │  │    (page-specific)
│  │           PAGE CONTENT HERE                 │  │
│  │                                             │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
├─────────────────────────────────────────────────┤
│  Status Bar                                      │  ← Optional footer
└─────────────────────────────────────────────────┘
```

### Grid

```css
--page-max-width:  1440px;
--page-padding-x:  36px;
--page-padding-y:  32px;
--header-height:   60px;
--grid-gap:        12px;
--grid-columns:    12;
```

All content is contained within a `max-width: 1440px` centered container. 12-column grid with 12px gaps. Padding is fixed at 36px horizontal, 32px top.

### Portal Transition

Every page transition — navigation, route change, state shift — enters through the **dimension gate animation**:

1. Content fades to `--surface-glass` overlay (100ms)
2. New content `opacity: 0`, `transform: translateY(8px)` (0ms)
3. Content animates `opacity: 1`, `translateY(0)` (400ms, ease-out)
4. Children stagger in (see Animation Philosophy)

No page feels like a reload. Every route change is a **passage**.

### Responsive Breakpoints

```css
--bp-xl: 1440px;  /* Standard — full grid */
--bp-lg: 1200px;  /* Reduced columns */
--bp-md: 900px;   /* Stack to single column */
--bp-sm: 600px;   /* Compact, reduced padding to 16px */
```

---

## 5. Component Patterns

### 5.1 Neural Glass Card

```
┌─────────────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  ← 1px border, rgba(255,255,255,0.10)
│  [accent bar — optional 2px left]  │
│  ┌───────────────────────────────┐  │
│  │  Content                       │  │
│  │                                │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

```css
--card-bg:            var(--surface-raised);
--card-border:        var(--border-default);
--card-radius:        8px;
--card-padding:       16px;
--card-glow:          0 0 20px rgba(0, 229, 191, 0.05);  /* hover only */
--card-accent-width:  2px;  /* optional left border, colored per context */
```

**States:**
- Default: Background `--surface-raised`, border `--border-default`
- Hover: Background `--surface-hover`, border `--border-active`, `--card-glow` applied
- Active/Pressed: Background `--surface-hover`, border `--accent-cyan` (with accent bar)
- Glass variant: Background `--surface-glass`, backdrop-filter blur(8px)

### 5.2 Metric Display

```
  $284,532       ← JetBrains Mono, text-xl or larger, colored
  Total Value    ← DM Sans, text-base, --text-secondary
```

```css
--metric-value-font:  'JetBrains Mono', monospace;
--metric-label-font:  'DM Sans', sans-serif;
--metric-gap:         4px;
```

Always mono for the value. Always a smaller label below. The value color is semantic: cyan for flowing data, green for compound/positive, gold for warning threshold, red for critical, purple for agent metrics.

### 5.3 Progress Bar

```
  ┃████████████████░░░░░░░░░░░░░░░░┃  ← 2px height
  62% Complete                       ← JetBrains Mono, text-base
```

```css
--bar-height:          2px;
--bar-radius:          1px;
--bar-bg:              rgba(255, 255, 255, 0.06);
--bar-fill:            var(--accent-cyan);
--bar-transition:      width 600ms cubic-bezier(0.23, 1, 0.32, 1);
```

Fill color changes per context. Width transition is **always animated**, never instant.

### 5.4 Status Dot

```
  ● Active      → 6px circle, --status-active (#00e676)
  ● Warning     → 6px circle, --status-warning (#76b900)
  ● Critical    → 6px circle, --status-critical (#ff5252)  [pulses if active-critical]
  ○ Offline     → 6px circle, --status-idle
  ● Processing  → 6px circle, --status-pulse (#9B59FF)  [pulses]
```

Status dot is always 6px, always circular, always colored per status. Pulse animation only on critical and processing states — defined as a gentle opacity oscillation (1s cycle).

### 5.5 Data Table

```
┌─────────────────────────────────────────────┐
│ Symbol    Price     Change     Volume        │  ← sticky header, --text-dim
├─────────────────────────────────────────────┤
│ BTCUSDT  67,234    +1.2%     12.4K      ●   │  ← row bg: rgba(255,255,255,0.02)
│ ETHUSDT  3,456     -0.8%     8.9K       ●   │  ← alternating: transparent
│ SOLUSDT  189.45    +3.4%     4.2K       ●   │  ← row bg: rgba(255,255,255,0.02)
└─────────────────────────────────────────────┘
```

```css
--table-font:         'JetBrains Mono', monospace;
--table-header-size:  var(--text-base);
--table-cell-size:    var(--text-base);
--table-padding:      8px 12px;
--table-row-alt:      rgba(255, 255, 255, 0.02);
```

Full width, mono throughout. Header is sticky, text-dim. Alternating row opacity. No horizontal borders — just the crisp vertical rhythm of mono type.

### 5.6 Badges

```
  ◇ Agent      ← colored pill, small
  ⚡ Active    ← semantic color
  ⧫ Critical  ← red only
```

```css
--badge-size:          var(--text-xs);    /* 0.45rem */
--badge-padding:       2px 6px;
--badge-radius:        3px;
--badge-default-bg:    rgba(255, 255, 255, 0.06);
--badge-default-text:  var(--text-primary);
```

Colored badges (cyan, gold, purple, green, red) use the accent at `0.15` opacity for background, full opacity for text.

---

## 6. Animation Philosophy

### Core Principles

1. **Every animation has a purpose.** Motion only exists to communicate state change, spatial relationship, or data flow.
2. **Never gratuitous.** No spinning loaders. No bouncing elements. No decorative parallax.
3. **Speed matters.** UI motion is measured in milliseconds, not seconds.
4. **Prefer transitions over keyframes.** CSS transitions are predictable, cancellable, and composable.

### Transition Curves

```css
--ease-out:          cubic-bezier(0.23, 1, 0.32, 1);  /* Standard — snappy deceleration */
--ease-in-out:       cubic-bezier(0.65, 0, 0.35, 1);  /* Shared transitions */
--ease-spring:       cubic-bezier(0.34, 1.56, 0.64, 1); /* Overshoot for highlight only */
--transition-fast:   150ms;  /* Hover, focus, micro-interactions */
--transition-base:   300ms;  /* Most state changes */
--transition-slow:   500ms;  /* Page entrance, significant state shifts */
```

### Stagger Entrance

When a page or panel mounts, children enter with:

```css
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Stagger: 0.03s delay per child, applied via JS or inline style */
--stagger-delay: 0.03s;
```

Maximum stagger duration across a 20-child component: 600ms. Never exceed that — perception of speed breaks.

### Data Update Animation

When metrics change:
- Numbers: Counter animation (150ms per digit change, or instant if delta is negative/critical)
- Bars: Width transition 600ms `--ease-out`
- Status dots: Color transition 300ms, then pulse if critical

### Hover States

```css
--hover-transition:  all 150ms var(--ease-out);
```

Hover effects are fast (150ms) and smooth. Never instant (`transition: none`). This includes card glow, row highlight, button background changes.

### What to Never Do

| Prohibited | Why |
|-----------|-----|
| Spinning loaders | Empty motion, communicates nothing useful |
| Bounce/elastic entrances | Distracting, wastes time |
| Auto-scrolling carousels | User should always be in control |
| Parallax backgrounds | Adds visual noise, breaks readability |
| Animated backgrounds | Distracting, performance heavy |
| Typewriter text effects | Slow, annoying, anti-pattern |

---

## 7. Page Blueprints

### 7.1 Dashboard Page

```
┌──────────────────────────────────────────────────────────────┐
│  [⬡ NexusLink]  [▶ _ root ]                          [●●●] │
├──────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌──────────────┐ ┌──────────┐ ┌──────┐  │
│ │ $284,532        │ │ 142          │ │ 89.7%    │ │ ⚡ 4 │  │
│ │ Portfolio Value │ │ Active Agents│ │ Uptime   │ │ Alerts │  │
│ └─────────────────┘ └──────────────┘ └──────────┘ └──────┘  │
│                                                              │
│ ┌──────────────────────────────────────────────────────┐     │
│ │  Performance Chart (24h)                           │     │
│ │  ╱╲          ╱╲                                     │     │
│ │ ╱  ╲  ╱╲    ╱  ╲                                    │     │
│ │╱    ╲╱  ╲  ╱    ╲                                   │     │
│ └──────────────────────────────────────────────────────┘     │
│                                                              │
│ ┌──────────────────────┐ ┌──────────────────────────────┐   │
│ │  Recent Trades       │ │  Agent Status                │   │
│ │  ┌──┬───────┬──────┐ │ │  ● ABZU   Research  ACTIVE  │   │
│ │  │⏰│BTCUSDT│+2.3% │ │ │  ● NABU   Memory    ACTIVE  │   │
│ │  │⏰│ETHUSDT│-0.8% │ │ │  ● ENKI   Execute   IDLE   │   │
│ │  │⏰│SOLUSDT│+1.2% │ │ │  ● INANNA Oracle    ACTIVE  │   │
│ │  └──┴───────┴──────┘ │ └──────────────────────────────┘   │
│ └──────────────────────┘                                     │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  Status: All systems nominal               Active: 4 agents │
└──────────────────────────────────────────────────────────────┘
```

**Structure:**
- **Top row**: 4 metric cards, equal width (3-col on lg, 2-col on md, 1-col on sm)
- **Middle**: Full-width chart panel (12 cols)
- **Bottom**: Two panels side by side (6 cols each)
- **Status bar**: Full-width, bottom of page

### 7.2 List Page

```
┌──────────────────────────────────────────────────────────────┐
│  [⬡ NexusLink]  [▶ _ list ]                          [●●●] │
├───────┬──────────────────────────────────────────┬──────────┤
│       │                                          │          │
│ AGENTS│  ● ABZU          ═══ 98% ████████░░    │ RESEARCH │
│ ──────│  Research · 12h active                  │ │ 3,482  │
│ ALL   │  Last: Chroma synthesis                  │ │ Tokens  │
│ ●●●  │  ──────────────────────────────────────── │ │        │
│       │  ● NABU          ═══ 72% ██████░░░░    │ │ 142     │
│ Active│  Memory · 6h active                     │ │ Items   │
│ Idle  │  Last: Agent state log                   │ │        │
│ Error │  ──────────────────────────────────────── │ │        │
│       │  ● ENKI          ═══ 12% ██░░░░░░░░    │ │ 0       │
│       │  Trading · 0h active                    │ │ Errors  │
│       │  Last: Position closed                   │ │        │
│       │                                          │ │        │
│ ──────│  [Show all 12 agents →]                  │ │        │
│       │                                          │ │        │
│ SHELVE│                                          │ │        │
│       │                                          │ │        │
│       │                                          │          │
├───────┴──────────────────────────────────────────┴──────────┤
│  3 filters · 12 agents · Last updated: 22:14:03             │
└──────────────────────────────────────────────────────────────┘
```

**Structure:**
- **Left sidebar** (2 cols): Filters, shelves, category navigation
- **Main content** (7 cols): Card list with status bars, progress indicators
- **Right detail panel** (3 cols): Contextual detail for selected item

### 7.3 Flow Page (Pipeline)

```
┌──────────────────────────────────────────────────────────────┐
│  [⬡ NexusLink]  [▶ _ flow ]                          [●●●] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌───────┐       ┌───────┐       ┌───────┐       ┌───────┐ │
│  │ INPUT │  →→→  │PROCESS│  →→→  │OUTPUT │  →→→  │ARCHIVE│ │
│  │       │  ┌────┐│       │  ┌────┐│       │  ┌────┐│       │ │
│  │ ● OK  │  │12ms││ ● OK  │  │4ms ││ ● OK  │  │0ms ││ ○ IDLE│ │
│  └───────┘  └────┘└───────┘  └────┘└───────┘  └────┘└───────┘ │
│       ↓           ↓           ↓           ↓                   │
│  ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐              │
│  │ Detail│   │ Detail│   │ Detail│   │ Detail│              │
│  │ items │   │ items │   │ items │   │ items │              │
│  └───────┘   └───────┘   └───────┘   └───────┘              │
│                                                              │
│  ───── Pipeline: 98.3% success · 142 processed · 0 errors── │
├──────────────────────────────────────────────────────────────┤
│  4 steps · 142 items · 16.2s total                          │
└──────────────────────────────────────────────────────────────┘
```

**Structure:**
- **Top row**: Connected pipeline stages with directional flow arrows
- Each stage is a neural glass card with: icon, label, status dot, latency
- **Below each stage**: Collapsible detail panel
- **Pipeline summary bar**: Full width, colored per completion rate

### 7.4 Terminal Page

```
┌──────────────────────────────────────────────────────────────┐
│  [⬡ NexusLink]  [▶ _ terminal ]                       [●●●] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [22:14:03] ⬡ nexuslink connect --port 8080                  │
│  [22:14:03] ✓ Connected to Oracle gateway                    │
│  [22:14:04] ───────────────────────────────────────────────  │
│  [22:14:04] ◎ abzu query --depth=full --source=chroma       │
│  [22:14:04]   Processing... ████████░░ 68%                   │
│  [22:14:06] ✓ Result: 1,284 embeddings returned              │
│  [22:14:06]   Top match: "gnostic-architecture.md" (0.94)   │
│  [22:14:06] ───────────────────────────────────────────────  │
│  [22:14:07] ⚠ Rate limit approaching (42/50 requests)       │
│  [22:14:08] ⬡ connect --reset                               │
│  [22:14:08] ✓ Connection reset                               │
│                                                              │
│  ▶ _                                                         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  Terminal · 142 lines · Scroll: 48.3%                       │
└──────────────────────────────────────────────────────────────┘
```

**Structure:**
- Monospace throughout (JetBrains Mono, text-base)
- Timestamped lines with colored prefixes
- Command input at bottom: `▶ _` prompt
- Status bar shows: mode, line count, scroll position

---

## 8. Icon Library

### Module Icons

| Module | Symbol | Unicode | Meaning |
|--------|--------|---------|---------|
| NexusLink | ⬡ | U+2B21 | Black star — connection, nexus |
| Oracle | ◎ | U+25CE | Bullseye — seeing, divination |
| Research | ◆ | U+25C6 | Black diamond — discovery, extraction |
| Chronos | ◈ | U+25C8 | Diamond with dot — time, measurement |
| Indra | ✦ | U+2726 | Four-pointed star — power, weapon |
| Abzu | ⊡ | U+22A1 | Squared plus — source, freshwater deep |
| Logos | ⊟ | U+229F | Squared minus — logic, reduction |
| Directive | ⧫ | U+29EB | Black lozenge — command, order |
| Physis | ⎔ | U+2394 | Software-function symbol — nature, growth |
| Trading HUD | ⟐ | U+27D0 | Lozenge divided — market, exchange |
| Yuri OS | ⚡ | U+26A1 | High voltage — portal energy, operating system |
| Bridge | ⇄ | U+21C4 | Left-right arrows — communication, connection |
| Mnemosyne | ◇ | U+25C7 | White diamond — memory, recollection |
| Conclave | ◆ | U+25C6 | Black diamond (shared with Research) — council |

### Usage Rules

1. **Icons are always mono-colored** — use the module's accent color, or inherit text color
2. **Icons are always inline** — no standalone icon buttons without text labels
3. **Icon size matches surrounding text** — use em units, not fixed px
4. **No icon replacements** — these symbols are hardcoded. Do not swap for SVGs or images unless proving a specific need

---

## 9. Design Tokens (Complete Reference)

```css
:root {
  /* --- Backgrounds --- */
  --terminal-bg:        #050505;
  --surface-raised:     #0a0a0a;
  --surface-glass:      rgba(10, 10, 10, 0.85);
  --surface-hover:      #111111;

  /* --- Borders --- */
  --border-subtle:      rgba(255, 255, 255, 0.06);
  --border-default:     rgba(255, 255, 255, 0.10);
  --border-active:      rgba(255, 255, 255, 0.18);

  /* --- Accents --- */
  --accent-cyan:        #00e5bf;
  --accent-gold:        #76b900;
  --accent-red:         #ff5252;
  --accent-purple:      #9B59FF;
  --accent-green:       #00e676;

  /* --- Accent Subtle Variants --- */
  --accent-cyan-subtle:  rgba(0, 229, 191, 0.10);
  --accent-cyan-soft:    rgba(0, 229, 191, 0.25);
  --accent-cyan-glow:    rgba(0, 229, 191, 0.40);
  --accent-gold-subtle:  rgba(118, 185, 0, 0.10);
  --accent-gold-soft:    rgba(118, 185, 0, 0.25);
  --accent-gold-glow:    rgba(118, 185, 0, 0.40);
  --accent-red-subtle:   rgba(255, 82, 82, 0.10);
  --accent-red-soft:     rgba(255, 82, 82, 0.25);
  --accent-red-glow:     rgba(255, 82, 82, 0.40);
  --accent-purple-subtle: rgba(155, 89, 255, 0.10);
  --accent-purple-soft:  rgba(155, 89, 255, 0.25);
  --accent-purple-glow:  rgba(155, 89, 255, 0.40);
  --accent-green-subtle: rgba(0, 230, 118, 0.10);
  --accent-green-soft:   rgba(0, 230, 118, 0.25);
  --accent-green-glow:   rgba(0, 230, 118, 0.40);

  /* --- Text --- */
  --text-primary:       rgba(255, 255, 255, 0.92);
  --text-secondary:     rgba(255, 255, 255, 0.72);
  --text-dim:           rgba(255, 255, 255, 0.45);
  --text-inverse:       #0a0a0a;

  /* --- Status --- */
  --status-active:      #00e676;
  --status-warning:     #76b900;
  --status-critical:    #ff5252;
  --status-idle:        rgba(255, 255, 255, 0.20);
  --status-pulse:       #9B59FF;

  /* --- Typography --- */
  --font-display:       'Bricolage Grotesque', sans-serif;
  --font-body:          'DM Sans', sans-serif;
  --font-mono:          'JetBrains Mono', monospace;

  /* --- Type Scale --- */
  --text-xs:      0.45rem;
  --text-sm:      0.55rem;
  --text-base:    0.65rem;
  --text-md:      0.75rem;
  --text-lg:      0.9rem;
  --text-xl:      1.1rem;
  --text-2xl:     1.4rem;
  --text-3xl:     1.8rem;
  --text-4xl:     2.4rem;

  /* --- Layout --- */
  --page-max-width:     1440px;
  --page-padding-x:     36px;
  --page-padding-y:     32px;
  --header-height:      60px;
  --grid-gap:           12px;
  --grid-columns:       12;

  /* --- Components --- */
  --card-bg:            var(--surface-raised);
  --card-border:        var(--border-default);
  --card-radius:        8px;
  --card-padding:       16px;
  --card-glow:          0 0 20px rgba(0, 229, 191, 0.05);
  --card-accent-width:  2px;

  --bar-height:         2px;
  --bar-radius:         1px;
  --bar-bg:             rgba(255, 255, 255, 0.06);
  --bar-fill:           var(--accent-cyan);
  --bar-transition:     width 600ms cubic-bezier(0.23, 1, 0.32, 1);

  --badge-size:         var(--text-xs);
  --badge-padding:      2px 6px;
  --badge-radius:       3px;
  --badge-default-bg:   rgba(255, 255, 255, 0.06);

  /* --- Animation --- */
  --ease-out:           cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out:        cubic-bezier(0.65, 0, 0.35, 1);
  --ease-spring:        cubic-bezier(0.34, 1.56, 0.64, 1);
  --transition-fast:    150ms;
  --transition-base:    300ms;
  --transition-slow:    500ms;
  --stagger-delay:      0.03s;

  /* --- Breakpoints --- */
  --bp-xl:  1440px;
  --bp-lg:  1200px;
  --bp-md:  900px;
  --bp-sm:  600px;
}
```

---

## 10. Appendix: Quick Reference

### Spacing System

```css
--space-1:   4px;
--space-2:   8px;
--space-3:   12px;
--space-4:   16px;
--space-5:   24px;
--space-6:   32px;
--space-7:   48px;
--space-8:   64px;
```

### Radius System

```css
--radius-sm:    3px;   /* badges, small indicators */
--radius-md:    6px;   /* inputs, buttons */
--radius-lg:    8px;   /* cards, panels */
--radius-xl:    12px;  /* modals, special containers */
--radius-full:  9999px; /* pills, avatars */
```

### Elevation (Box Shadows)

```css
--shadow-none:    none;
--shadow-subtle:  0 1px 3px rgba(0, 0, 0, 0.3);
--shadow-raised:  0 4px 12px rgba(0, 0, 0, 0.4);
--shadow-overlay: 0 8px 32px rgba(0, 0, 0, 0.5);
--shadow-glow:    0 0 20px var(--accent-cyan-glow);
```

### Z-Index Scale

```css
--z-base:      1;
--z-dropdown:  100;
--z-sticky:    200;
--z-overlay:   300;
--z-modal:     400;
--z-toast:     500;
```

---

*This document is the single source of truth for Yuri OS visual output. Every page, component, and transition must reference these tokens. No visual element exists outside this system.*

*— ENKI CELESTIAL & NUDIMMUD, fashioner of likenesses of minds*
