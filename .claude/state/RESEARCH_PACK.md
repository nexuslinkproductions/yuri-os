# RESEARCH_PACK — Operator Center Revamp
**Distilled patterns from 14 reference cockpits + 4 motion references**
*Cap: 80 lines. No raw copy. Compact evidence.*

---

## 1) 10 DISTILLED PATTERNS

**1. Glance→Scan→Focus density tiers** — Every surface declares its reading depth. Glance: 1–3 KPIs (Datadog NextGen top bar). Scan: list/grid with sparklines (Linear). Focus: full detail (Stripe Workbench transaction view). Rationale: operator needs split-second triage before drill.

**2. Spine navigation via Cmd-K** — Primary action surface is keyboard palette, not sidebar. Linear, Raycast, Arc, Cursor all prove: palette-first reduces chrome to zero. Palette owns: search, nav, actions, recent, quick-create.

**3. Live telemetry as ambient texture** — Grafana 11, Sentry, Datadog NextGen: metrics animate subtly in background (mini sparklines, ticker bar, CPU rings). Not decorative — glanceable health. PostHog shows "live events" counter pulsing.

**4. Horizontal sectioned canvas** — Vercel dashboard, Railway, Cloudflare dashboard: content flows left→right in card lanes, not top→down CRUD tables. Each lane is a "surface" (bandwidth, deployments, logs). Supports glance scanning.

**5. Data visualization as UI — not widgets** — Supabase Studio: row counts ARE the table header. Stripe Workbench: timeline IS the navigation. Grafana 11: sparklines are link targets. Never a "chart here" box — data is the chrome.

**6. Glass/backdrop chrome** — Linear, Vercel, Resend: navigation chrome uses backdrop-filter blur with thin 1px border. Not opaque. Lets gradient/grain show through. Operator already uses `--nlp-void` gradients — amplify.

**7. Monospace for all telemetry numbers** — Datadog, Grafana, Sentry consistently use mono for: token counts, latency, error rates, CPU. Consumer CSS already has `--nlp-font-mono: 'JetBrains Mono'`. Adopt universally for data.

**8. Subtle gradient borders on hover—never box-shadows alone** — Linear cards, Vercel project tiles: hover reveals a subtle gradient border (purple/cyan edge glow). Box-shadow is either absent or extremely soft. Consumer already has this pattern on `.nlp-service-card:hover`: border + `--nlp-glow-purple-soft`.

**9. Empty states are personality** — Resend: "no API keys yet" with a drawn key icon. Railway: "deploy something" with playful illustration. Linear: empty view has a single CTA + ghost list. Never raw "No data." Extends to loading (skeleton shimmer, not spinner).

**10. Motion = state signal, not decoration** — Linear releases page: staggered fade-ups with 50ms cascade per item. Vercel marketing: text opacity shifts on scroll. Framer site: spring physics for micro-interactions. GSAP showcase: overshoot on exit. All follow: <16ms frame budget; purpose is focus direction or state change.

---

## 2) CMD-K PALETTE PATTERN NOTES

- **Trigger**: Cmd+K (macOS) / Ctrl+K (Windows). Arc browser also uses Cmd+T for tabs — consistent.
- **Structure**: Search bar + 3 sections below: Quick Actions | Recent | Navigate. Linear shows recent first 3, then search results.
- **Actions mode**: Type `>` or `/` prefix for commands (Raycast convention). Stripe Workbench uses `>` for admin commands.
- **Keyboard-first**: Arrow keys navigate, Enter selects, Escape dismisses. Never touch-required.
- **Empty state**: "Type to search or use `>` for commands" — with shortcut hints visible.
- **Density**: Menu items show: icon | label | shortcut hint (right-aligned mono). 44px min touch target.
- **Expose**: Palette opens from top-center (Linear) or center-screen (Raycast). Consumer nav could use top-center drop.
- **Reduced motion**: No spring animation. Simple fade 100ms, no translate.

---

## 3) LIVE-TELEMETRY DENSITY TIER PATTERNS

| Tier | Visual | Update freq | Content | Refs |
|------|--------|-------------|---------|------|
| Ambient | Pulse dot / thin bar | 1–5s | Heartbeat, active sessions | Grafana live ticker, Vercel status dot |
| Glance | Mini sparkline + value | 500ms–1s | Token/s rate, latency p50, queue depth | Datadog widget bar, PostHog live counter |
| Scan | Row with trend arrow + mini chart | 1–10s | Per-model spend, lane utilization, error rate | Cloudflare dashboard rows, Sentry issue list |
| Focus | Full detail with timeline/brush chart | On interaction | Session transcript, trace waterfall, token spend breakdown | Stripe Workbench timeline, Datadog trace view |

All tiers share: mono value font, cyan=good/amber=warn/red=bad semantic, sparklines are SVG path (no canvas, no canvas dependency).

---

## 4) MOTION VOCABULARY

**Timings** (all <16ms frame budget via `will-change` / `transform` + `opacity` only):
- Micro-interaction (hover, focus, toggle): **100–150ms**
- Element enter/exit (cards, panels): **200–300ms**
- Page/section transition (route change, palette open): **300–400ms**
- Stagger cascade delay per child: **30–50ms** (Linear releases pattern)
- Shimmer/skeleton: **1.5s loop** with `@keyframes`

**Easings** (Linear/Vercel/Framer shared vocabulary):
- `cubic-bezier(0.16, 1, 0.3, 1)` — "emphasized ease-out" for enters, reveals
- `cubic-bezier(0.4, 0, 0.2, 1)` — standard ease for hover, micro (matches `--nlp-ease`)
- `cubic-bezier(0.32, 0.72, 0, 1)` — overshoot for exit/dismiss (GSAP spring-lite)
- Linear: `cubic-bezier(0.16, 1, 0.3, 1)` is their sole motion token — applies everywhere.
- Apple Vision UI: use `spring(damping: 0.8, stiffness: 200)` for real physics; fallback to ease for reduced motion.

**Properties to animate**: `opacity` + `transform` (translate/scale) only. Never `width`, `height`, `top`, `left`, `box-shadow`.

---

## 5) COLOR/TYPOGRAPHY TOKEN RECOMMENDATIONS

**Harmonized with `src/consumer/consumer.css` (`--nlp-*` tokens):**
- Extend `:root` (or scoped `.operator-shell`) with operator-specific tokens, inheriting consumer base:
  - `--op-surface-card`: `var(--nlp-elevated)` — already exists ✓
  - `--op-surface-sidebar`: `var(--nlp-deep)` — already exists ✓
  - `--op-text-data`: `var(--nlp-text)` with `--nlp-font-mono` — just convention
  - `--op-accent-success`: `var(--nlp-cyan)` — reuse ✓
  - `--op-accent-warning`: `var(--nlp-warning)` — reuse ✓
  - `--op-accent-danger`: `var(--nlp-danger)` — reuse ✓
  - `--op-chart-grid`: `var(--nlp-border-subtle)` — extend
  - `--op-chart-line`: `var(--nlp-purple)` with 0.6 opacity — extend

**New operator-specific tokens needed:**
- `--op-surface-header`: `rgba(10, 10, 16, 0.85)` — glass nav bar
- `--op-radius-card`: `12px` (matches `--nlp-radius-md`)
- `--op-border-glass`: `rgba(255, 255, 255, 0.06)` — glass stroke
- `--op-sparkline-up`: `var(--nlp-cyan)` 
- `--op-sparkline-down`: `var(--nlp-danger)`

**Typography**: consumer's `--nlp-font-sans` (Outfit) for UI labels, `--nlp-font-heading` (Space Grotesk) for section titles, `--nlp-font-mono` (JetBrains Mono) for ALL data values — identical. No new font loads.

---

## 6) 5 ANTI-PATTERNS TO AVOID

**1. Table-driven admin panel** — CRUD table with columns, pagination, row actions. Anti-thesis of cockpit. Use card lanes, detail panels, and keyboard drill-down instead.

**2. Sidebar navigation as primary chrome** — Adds ~220px permanent chrome. Linear/Vercel/Stripe use top nav + Cmd-K. Sidebar reserved for secondary context (detail panel, not nav).

**3. Spinner-only loading states** — Spinner says nothing. Skeleton shimmer (matching card shape) or ghost text lines are faster to parse. PostHog loads skeleton first, data fills in.

**4. Data visualization as iframes or third-party widgets** — Adds 200ms+ load, styling mismatch, accessibility gap. All charts SVG inline. Grafana 11 and Supabase Studio prove lightweight inline SVG beats embedded.

**5. Form-heavy configuration** — Operator should avoid `<label><input><button type="submit">` patterns. Use inline editing (click-to-edit, Enter to confirm, Escape to cancel — Linear settings pattern), toggle switches, and Cmd-K quick-actions instead.

---

PHASE_1_DONE
