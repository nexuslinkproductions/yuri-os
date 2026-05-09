# DESIGN_SPEC — Phase 3/9
**Date:** 2026-05-06
**Lead:** deepseek-v4-pro
**Artifact:** `.claude/state/operator-revamp-DESIGN_SPEC.md`

---

## 1. DESIGN_TOKENS (`src/operator/operator.css` — extends consumer.css `:root`)

```css
/* ============================================================
   Operator Center — Design Tokens
   Extends: src/consumer/consumer.css (.nlp-shell scoped tokens)
   Scoped to: #operator-root (light) / #operator-root.dark (dark)
   ============================================================ */
#operator-root {
  /* Surfaces — 3-layer depth hierarchy */
  --op-surface: #0b0b13;              /* deepest, dashboard base */
  --op-surface-elevated: #12121e;     /* cards, panels, drawers */
  --op-surface-overlay: #181826;      /* modals, popovers, palette */

  /* Text — 3-tier opacity ladder */
  --op-text-primary: #f0f0f7;         /* headings, KPIs */
  --op-text-secondary: #9d9db5;       /* labels, secondary data */
  --op-text-tertiary: #5e5e78;        /* timestamps, meta, hints */

  /* Borders */
  --op-border: #1f1f30;
  --op-border-strong: #2d2d42;

  /* Accent — single primary action color */
  --op-accent: #7c3aed;               /* purple, inherits from nlp-purple */
  --op-accent-soft: rgba(124, 58, 237, 0.12);

  /* Semantic status */
  --op-status-ok: #10b981;
  --op-status-warn: #f59e0b;
  --op-status-critical: #ef4444;
  --op-status-info: #3b82f6;

  /* Mono / telemetry foreground */
  --op-mono-fg: #00ffa7;              /* cyan glow for live numbers */

  /* Geometry */
  --op-grid-radius: 10px;             /* card / panel rounding */

  /* Shadows — light to heavy depth */
  --op-shadow-sm: 0 1px 3px rgba(0,0,0,0.45);
  --op-shadow-md: 0 4px 16px rgba(0,0,0,0.55);
  --op-shadow-lg: 0 12px 40px rgba(0,0,0,0.65);

  /* Glass blur for overlays */
  --op-blur-glass: blur(18px);

  /* Motion durations */
  --op-dur-micro: 100ms;              /* hover on/off, button press */
  --op-dur-standard: 240ms;           /* show/hide panels, route transitions */
  --op-dur-expressive: 500ms;         /* dashboard enter, attention events */

  /* Easings */
  --op-ease-enter: cubic-bezier(0, 0, 0.2, 1);        /* decelerate in */
  --op-ease-exit: cubic-bezier(0.4, 0, 1, 1);         /* accelerate out */
  --op-ease-standard: cubic-bezier(0.2, 0, 0, 1);     /* hover/active */
  --op-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* bouncy micro */

  /* Z-index scale */
  --op-z-base: 0;
  --op-z-nav: 100;
  --op-z-palette: 300;
  --op-z-modal: 500;
  --op-z-toast: 700;

  /* Typography inheritance */
  --op-font-sans: var(--nlp-font-sans);
  --op-font-heading: var(--nlp-font-heading);
  --op-font-mono: 'JetBrains Mono', ui-monospace, 'Fira Code', monospace;
}

/* Dark variant (default) — no override needed */
#operator-root.dark { }

/* Light variant — inverted surfaces, softened text */
#operator-root.light {
  --op-surface: #f5f5fa;
  --op-surface-elevated: #ffffff;
  --op-surface-overlay: #fafafe;
  --op-text-primary: #0f0f1a;
  --op-text-secondary: #565675;
  --op-text-tertiary: #8888a0;
  --op-border: #e0e0ec;
  --op-border-strong: #c5c5d8;
  --op-shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
  --op-shadow-md: 0 4px 16px rgba(0,0,0,0.10);
  --op-shadow-lg: 0 12px 40px rgba(0,0,0,0.14);
  --op-mono-fg: #059669;
}
```

---

## 2. LAYOUT_GRID

- **Shell:** Full-bleed `#operator-root` wraps `grid-template-rows: auto 1fr; grid-template-columns: auto 1fr`.
- **Top bar:** 48px fixed height, `grid-row: 1`, spans full width, houses breadcrumb + quick-status + Cmd-K trigger.
- **Side nav:** `grid-row: 2`, width `240px` expanded / `64px` collapsed. Toggle via hamburger or `[` key. Contains section icon+label links, footer profile chip.
- **Content area:** `grid-row: 2; grid-column: 2`, `overflow-y: auto`, `max-width: 1440px`, centered via `margin: 0 auto`. Internal 12-column CSS grid with `24px` gutters.
- **Density tiers (padding):**
  - *Glance:* `8px` card padding, `4px` gaps — dashboard grid, KPI rows.
  - *Scan:* `16px` card padding, `12px` gaps — session list, agent table.
  - *Focus:* `24px` padding, `20px` gaps — detail drill-down, settings forms.

---

## 3. TYPOGRAPHY_SCALE

| Token | font-family | size | weight | line-height |
|---|---|---|---|---|
| `--op-type-display` | Space Grotesk | clamp(2.5rem, 6vw, 4rem) | 700 | 1.0 |
| `--op-type-h1` | Space Grotesk | 2rem (32px) | 700 | 1.15 |
| `--op-type-h2` | Space Grotesk | 1.5rem (24px) | 600 | 1.2 |
| `--op-type-h3` | Outfit | 1.125rem (18px) | 600 | 1.3 |
| `--op-type-body` | Outfit | 0.9375rem (15px) | 400 | 1.55 |
| `--op-type-caption` | Outfit | 0.75rem (12px) | 450 | 1.4 |
| `--op-type-mono-data` | JetBrains Mono | 0.875rem (14px) | 500 | 1.3 |
| `--op-type-mono-log` | JetBrains Mono | 0.6875rem (11px) | 400 | 1.45 |

All tokens consume `letter-spacing: -0.01em` (headings) / `0` (body) / `0.02em` (mono).

---

## 4. COMPONENT_SPECS

### CommandPalette
- **Dimensions:** 560×400px, `border-radius: 12px`.
- **States:** Closed → `opacity 0, scale 0.96`. Open → fade + scale spring. Input auto-focuses.
- **Animation:** `op-dur-standard`, `op-ease-enter`. Backdrop: `rgba(0,0,0,0.6) + blur`.
- **ARIA:** `role="dialog"`, `aria-label="Command palette"`, `aria-modal="true"`. Results in `role="listbox"`, items `role="option"`.

### OperatorNav
- **Dimensions:** 240×100% (expanded), 64×100% (collapsed). Icon-only labels in collapsed state.
- **States:** Active link gets `--op-accent-soft` bg + left 3px `--op-accent` border.
- **Animation:** Collapse/expand uses `width` transition `op-dur-standard`, `op-ease-standard`. Chevron icon rotates.
- **ARIA:** `<nav aria-label="Operator navigation">`, current link `aria-current="page"`.

### MetricCard
- **Dimensions:** ~280×120px, padding density-tier: glance (8px).
- **States:** Default shows label+value. Hover elevates via `--op-shadow-md` + `translateY(-2px)`. Loading = shimmer skeleton.
- **Animation:** Number ticks via `AnimatedCounter` (reuse consumer component). Status dot pulses when live.
- **ARIA:** `role="status"` if live, `aria-label` includes label + value.

### StatusDot
- **Dimensions:** 8×8px circle.
- **States:** `ok` = `--op-status-ok` steady, `warn` = `--op-status-warn` pulsing (2s), `critical` = `--op-status-critical` rapid pulse (0.8s), `idle` = `--op-text-tertiary` dim.
- **ARIA:** `aria-label="Status: OK"` etc., `role="img"`.

### ShimmerRow
- **Dimensions:** Full-width, 40px tall.
- **Animation:** Linear gradient sweep (`--op-border` → `--op-surface-elevated` → `--op-border`) over 1.2s, infinite, `op-ease-standard`.
- **ARIA:** `aria-busy="true"`, `aria-hidden="true"` on decorative shimmer.

### EmptyState
- **Dimensions:** 360×200pt centered.
- **Animation:** Fade-up on mount (`op-dur-standard`, `op-ease-enter`).
- **ARIA:** `<section aria-label="No results">` with descriptive text.

### LiveCounter
- **Dimensions:** Inline, inherits parent font.
- **Animation:** Number rolls use CSS `tab-size` trick or lightweight `requestAnimationFrame` spring to target. Mono cyan fg.
- **ARIA:** `aria-live="polite"`, `aria-atomic="true"`.

---

## 5. MOTION_SPEC

- **60fps target**, all animations via `transform` + `opacity` (GPU-composited). Zero layout-triggering properties.
- Use `will-change` sparingly: apply only during animation lifecycle (`will-change: transform` on mount, remove on animationend).
- **Entry pattern:** fade-up (`opacity 0→1, translateY(8→0)`) for cards, rows, panels.
- **Exit pattern:** fade-out + scale-down (`opacity 1→0, scale 1→0.96`) for modals, popovers.
- **Hover pattern:** `scale(1.01)` + `--op-shadow-md` on cards (`op-dur-micro`, `op-ease-standard`).
- **Reduced motion:** global override:
  ```css
  @media (prefers-reduced-motion: reduce) {
    #operator-root *, #operator-root *::before, #operator-root *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```

---

## 6. ACCESSIBILITY_SPEC

| Trigger | Action | Scope |
|---|---|---|
| `Cmd+K` / `Ctrl+K` | Open CommandPalette, focus input | Global |
| `/` | Focus search (when palette closed) | Global |
| `?` | Toggle keyboard shortcut help overlay | Global |
| `j` / `k` | Navigate down/up in list/table rows | List views |
| `Enter` | Activate focused row / submit command | List views, palette |
| `Esc` | Close palette, modal, or popover | Layered (z-index order) |

- **Focus indicators:** 2px solid ring, color `--op-accent` at 60% opacity, `outline-offset: 2px`. Visible on `:focus-visible` only.
- **Color contrast:** Body text ≥ 4.5:1 (AA). Large text (≥18px bold or ≥24px regular) ≥ 3:1. All status colors validated against `--op-surface-elevated`.
- **Landmarks:** `<main>`, `<nav aria-label="Operator">`, `<aside aria-label="Telemetry sidebar">`, `<footer>`.
- **Live region:** Telemetry updates use `<div aria-live="polite" aria-atomic="true">` wrapping KPIs. Alert-critical events use `aria-live="assertive"`.

---

## 7. ICONOGRAPHY

- **Library:** Lucide React (`lucide-react`) if installed, else inline SVG sprites.
- **Sizes:** 16px (inline meta), 20px (nav items, buttons), 24px (section headers).
- **Stroke:** 1.5px, `stroke-linecap: round`, `stroke-linejoin: round`.
- **Color:** Inherit from current text color via `currentColor`.

---

## 8. BRAND_HARMONY

1. **Token extension, not replacement:** Operator tokens (`--op-*`) consume consumer primitives (`--nlp-*`) rather than redefine them — the same purple, cyan, and void palette flows through both surfaces, ensuring a single brand identity.
2. **Typography continuity:** Operator inherits `Space Grotesk` headings and `Outfit` body directly from consumer; only mono telemetry faces (`JetBrains Mono`) are operator-specific. The type scale mirrors consumer's fluid clamp rhythm.
3. **Motion vocabulary shared:** The same `cubic-bezier` curves, blur-glass effects, fade-up entrance patterns, and `prefers-reduced-motion` strategy used in consumer sections carry into operator — the cockpit feels like a natural depth layer of the same application, not a separate product.

---

PHASE_3_DONE
