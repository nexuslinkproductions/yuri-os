# OPERATOR RESEARCH_PACK

**Date:** 2026-05-06
**Lead lane:** deepseek-v4-pro
**Phase:** 1/9 — Research
**Source:** offload.sh -m deepseek-v4-pro (background task `bk9hzj9yh`)

> Designing the operator interface that sees what you see, knows what you know, and acts before you ask — a system-level command surface for power users who live at the keyboard.

## DISTILLED_PATTERNS

- **Linear — zero-chrome focus** — Lists with no visible borders, actions revealed on hover, and a relentless commitment to whitespace as the primary layout element.
- **Vercel — deploy preview as state** — Every deploy is a live entity with status, branch, commit SHA, and rollback affordances visible in one row.
- **Railway — ambient service mesh** — Services rendered as a connected graph; side panel slides in for config without leaving topology view.
- **Resend — log-first debugging** — Email activity rendered as a terminal-style event stream with expandable payload rows, not a CRUD table.
- **Supabase Studio — SQL as a first-class citizen** — Spreadsheet view and raw SQL editor share state bidirectionally; filter chips act as query builder tokens.
- **Raycast — command palette as OS** — Everything is a command; fuzzy search, aliases, quicklook previews, and extension-native actions in a floating panel.
- **Stripe Workbench — API explorer with side effects** — Live API calls mutate real resources in a sandboxed context; request/response JSON rendered with diffable history.
- **Cloudflare — zone-scoped navigation** — Domain/zone switcher scopes all sidebar actions; breadcrumbs double as status indicators with color-coded health.
- **PostHog — query-time dimensionality** — Event explorer lets you pivot, group, and filter at query time without pre-defining schemas; table cells are interactive facets.
- **Grafana 11 — explore-to-dashboard fluidity** — Ad-hoc queries seamlessly promote to dashboard panels; time range is a shared global cursor across all views.
- **Sentry — issue triage velocity** — Stack trace frames are click-to-expand; suspect commits and release data inline next to error breadcrumbs; bulk actions via shift-select.
- **Datadog NextGen — correlated signals** — Logs, traces, and metrics in a single pane with synchronized time cursors; facet panel updates as you scroll.
- **Cursor — diff-as-conversation** — AI changes rendered as inline diffs you accept/reject; tab-to-jump between hunks; the editor is the chat interface.
- **OpenAI Platform — streaming inference** — Token-by-token output rendered in real time; usage counters tick live; playground and API share parameter state.
- **Arc — cmd-palette as browser chrome** — ⌘T for tabs, ⌘L for URL, ⌘E for extensions, ⌘D for splits; palette is the primary navigation surface, not an afterthought.

## CMD_K_PALETTE_NOTES

- Width: 560–640px fixed; wider on screens above 1440px to accommodate side-by-side result + preview layouts.
- Structure: always includes a semantic grouping — Command > Entity > Action > Modifier chain, rendered as breadcrumb + highlight.
- Behavior: debounced 60ms search with instant-first-result; ⌘K always opens with recent-commands visible, not blank.
- Scope: palette commands must span navigation (go to project), mutation (create, delete, rename), and meta (theme, prefs, shortcuts).
- Refs: Raycast floating panel model, Arc split-context palette, Linear inline-command with slash, VSCode ⌘⇧P scoping.

## DENSITY_TIERS

- **Glance** — 8–12 summary metrics in a horizontal strip; components: stat card with sparkline; update every 10s via polling; layout: CSS grid `auto-fill minmax(140px, 1fr)`.
- **Scan** — 20–40 rows in a condensed table/list; components: status dot, title, subtitle, trailing metric; update every 30s via subscription; layout: single-column list with 44px row height.
- **Focus** — 1 entity in split-pane: detail + activity + config; components: tabs, property grid, timeline, code block; update realtime via WebSocket; layout: resizable 60/40 split.

## MOTION_VOCABULARY

- **Micro** (80–120ms, ease-out) — hover states, focus rings, checkbox toggles, badge count changes, copy-confirmation fades. Use opacity + scale(0.96 → 1).
- **Standard** (200–300ms, ease-in-out) — panel open/close, tab switches, filter chip adds, row expansions, toast enter/exit. Use transform + opacity.
- **Expressive** (400–600ms, spring) — page transitions, onboarding flows, empty-state → populated-state morphs, achievement celebrations. Use layout animations with shared element IDs.
- **Easing tokens** — `--ease-enter: cubic-bezier(0, 0, 0.2, 1);` `--ease-exit: cubic-bezier(0.4, 0, 1, 1);` `--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);`
- **Reduced-motion** — all durations collapse to 0ms; opacity-only transitions; `prefers-reduced-motion` media query gates all motion components.

## COLOR_TYPOGRAPHY_TOKENS

- Inherit from `consumer.css` tokens: `--op-surface`, `--op-text-primary`, `--op-border`, `--op-accent` (oklch variables with light/dark).
- Operator extensions: `--op-status-ok` (#22c55e), `--op-status-warn` (#f59e0b), `--op-status-critical` (#ef4444), `--op-telemetry` (monospace, `--op-text-secondary`).
- Accent discipline: exactly one accent color per view; no rainbow dashboards. Accent reserved for primary action, selected state, and focused input ring — never for decoration.
- Monospace: JetBrains Mono or system-ui monospace for telemetry numbers, timestamps, log lines, and stack traces.
- Geometric sans: Inter or system-ui sans for chrome — navigation labels, button text, filter chips, property keys.
- Heading family: same geometric sans at weight 600 for section titles, card headers, modal titles, and empty-state headlines.

## ANTI_PATTERNS

- **Dashboard Wall** — rows of identical stat cards with no hierarchy, no action, and no context. Fix: group metrics by narrative (what changed, what needs attention, what is stable).
- **Modal Sprawl** — modals spawning modals, blocking the main surface, losing scroll context. Fix: inline expand, side panel, or command palette for secondary actions.
- **Empty State Silence** — blank white void when there is no data. Fix: show sample data, quickstart CTA, or "connect your first X" with estimated time and docs link.
- **Manual Refresh Required** — stale data with a refresh button as the only recourse. Fix: subscription-based live updates with staleness indicator and click-to-refresh as fallback.
- **CRUD Aesthetic** — list → detail → edit form pattern with no domain-specific mental model. Fix: design the view around the operator's intent — triage, explore, audit, deploy — not the database schema.

PHASE_1_DONE
