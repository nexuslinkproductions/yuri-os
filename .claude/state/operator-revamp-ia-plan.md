# IA_PLAN — OPERATOR REVAMP

**Phase:** 2/9
**Date:** 2026-05-06
**Lead:** deepseek-v4-pro
**Source:** offload.sh -m deepseek-v4-pro (background task `b54jbm3jp`)

---

## ROUTE_MAP

| # | Route | Description |
|---|-------|-------------|
| 1 | `/operator` | Cockpit — live KPI strip, alert feed, lane utilization, recent sessions at-a-glance |
| 2 | `/operator/agents` | Agents & Swarm — running lanes, model routing graph, capacity, kill/restart stubs |
| 3 | `/operator/sessions` | Sessions — chronological feed, search, transcript drill-down |
| 4 | `/operator/skills` | Skills & Routing — catalog, trigger map, invocation heatmap |
| 5 | `/operator/tokenops` | Token Ops / FinOps — spend per model, budget pacing, offload efficiency |
| 6 | `/operator/design-audit` | Design Audit HUD — surface existing `src/components/DesignAuditHUD/*` |
| 7 | `/operator/oracle` | Oracle Console — voice/wake-word status, transcript, control surface |
| 8 | `/operator/health` | Deployment & Health — service health, port 3098 shell, launchd state |
| 9 | `/operator/settings` | Settings / Profile — operator identity, theme, preferences |

---

## COMPONENT_TREE

```
OperatorShell
├── CommandPalette              # Cmd-K spine: search, nav, action dispatch
├── OperatorNav                 # Section tabs, breadcrumb, status pills
├── OperatorRoutes
│   ├── CockpitSection
│   │   ├── TelemetryStrip      # AnimatedCounter × 6–8 KPIs
│   │   ├── AlertFeed           # LiveTicker-pattern alert stream
│   │   └── LaneUtilization     # Sparkline bars per agent lane
│   ├── AgentsSection
│   │   ├── LaneGrid            # Agent cards with status dots
│   │   └── RoutingGraph        # Model routing topology (stub)
│   ├── SessionsSection
│   │   ├── SessionFeed         # Chronological list, 44px rows
│   │   └── SessionDrilldown    # Expandable transcript panel
│   ├── SkillsSection
│   │   ├── SkillCatalog        # Filterable table with heatmap column
│   │   └── TriggerMap          # Skill → invocation Sankey stub
│   ├── TokenOpsSection
│   │   ├── SpendPerModel       # Bar chart + sparkline
│   │   └── BudgetPacing        # Gauge vs. budget threshold
│   ├── DesignAuditSection      # Wraps existing DesignAuditHUD
│   ├── OracleSection
│   │   ├── WakeWordStatus      # Live badge + command log
│   │   └── TranscriptPanel     # Stream display
│   ├── HealthSection
│   │   ├── ServiceGrid         # Port/process status cards
│   │   └── LaunchdTable        # Service state rows
│   └── SettingsSection
│       ├── ProfileCard
│       └── PreferencePanel
│
└── Shared Components/
    ├── StatusDot               # ok / warn / critical
    ├── MetricCard              # Glance-tier stat card
    ├── SectionHeader           # Title + density toggle
    ├── ShimmerRow              # Skeleton loader
    ├── EmptyState              # Personality placeholder
    └── LiveCounter             # Reuse AnimatedCounter from consumer
```

---

## DATA_SHAPES

```typescript
interface OperatorRoute {
  path: string;
  label: string;
  icon: string;
  density: "glance" | "scan" | "focus";
}

interface AgentLane {
  id: string;
  name: string;
  model: string;
  status: "running" | "idle" | "error" | "draining";
  capacity: number;
  activeCount: number;
  lastHeartbeat: number;
}

interface SessionRecord {
  id: string;
  agentId: string;
  startedAt: number;
  endedAt: number | null;
  transcriptCount: number;
  tokenTotal: number;
  status: "active" | "completed" | "interrupted";
}

interface SkillEntry {
  id: string;
  name: string;
  trigger: string;
  invocationCount: number;
  lastInvoked: number | null;
  avgLatencyMs: number;
}

interface TokenSpend {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  periodStart: number;
  periodEnd: number;
}

interface HealthCheck {
  service: string;
  port: number;
  status: "healthy" | "degraded" | "down";
  uptimeSeconds: number;
  lastChecked: number;
}
```

---

## STATE_SOURCES

| Section | Data Source | Notes |
|---------|------------|-------|
| Cockpit | Mock + TODO(data-source) | KPI generators in `data/mock-telemetry.ts`; alert feed computed from agent lane state |
| Agents | Mock | Static lane registry in `data/mock-agents.ts`; status toggled via UI stubs |
| Sessions | Mock | Generated feed in `data/mock-sessions.ts`; drilldown expands in-memory |
| Skills | Mock | Catalog in `data/mock-skills.ts`; invocation count randomized |
| TokenOps | Mock | Spend model in `data/mock-tokens.ts`; budget pacing computed from totals |
| Design Audit | Live | Existing `src/components/DesignAuditHUD/*` — passthrough |
| Oracle | Mock | Wake-word stub; transcript from `data/mock-oracle.ts` |
| Health | Computed | Poll `http://localhost:3098` health endpoint if reachable; else mock fallback |
| Settings | Computed | Read from `localStorage` + React context; theme from CSS custom props |

> All mocks flagged `// TODO(data-source): Replace with backend endpoint when available`.
> `backend/data/` is **off-limits**; no reads, no imports.

---

## MOTION_BUDGET

| Section | Frame Budget | Transitions | Reduced-Motion |
|---------|-------------|-------------|----------------|
| Cockpit | <8ms per KPI tick | Counter roll (opacity fade, 120ms) | Freeze counters; static display |
| Agents | <12ms per status toggle | Status dot color morph (200ms ease-in-out) | Instant color swap |
| Sessions | <10ms per row expand | Row expand via height + opacity (250ms) | Show all at full height |
| Skills | <16ms on filter | Chip add/remove scale(0.96→1, 150ms) | No scale; opacity only |
| TokenOps | <8ms per bar | Bar height spring (300ms) | Static bars |
| Design Audit | Inherits HUD | Passthrough — no new motion | Respects HUD prefs |
| Oracle | <6ms per transcript token | Token appear (opacity, 80ms) | Show full text instantly |
| Health | <10ms per poll | Pulsing dot (opacity 0.6↔1, 2s loop) | Static dot |
| Settings | <12ms on toggle | Toggle switch ease-out (120ms) | Instant toggle |

**Global:** `prefers-reduced-motion` gates all animations → `animation-duration: 0ms`.
**Cmd-K palette:** open/close spring (200ms, `--ease-enter`); reduced-motion → instant.

---

## DEPS_AUDIT

- **framer-motion v12.38** — confirmed installed via `package.json`.
- **New deps needed:** **ZERO**. All motion via framer-motion + CSS custom properties. No GSAP, no additional libraries.
- **Existing consumer deps reusable:** `framer-motion` for layout animations, `AnimatedCounter` pattern ported to operator sections.

---

## FILE_LAYOUT

```
src/operator/
├── OperatorShell.tsx                # Replaces current single-file; shell + route outlet
├── operator.css                     # Operator-specific tokens, extending consumer :root
├── sections/
│   ├── CockpitSection.tsx
│   ├── AgentsSection.tsx
│   ├── SessionsSection.tsx
│   ├── SkillsSection.tsx
│   ├── TokenOpsSection.tsx
│   ├── DesignAuditSection.tsx
│   ├── OracleSection.tsx
│   ├── HealthSection.tsx
│   └── SettingsSection.tsx
├── components/
│   ├── CommandPalette.tsx
│   ├── OperatorNav.tsx
│   ├── StatusDot.tsx
│   ├── MetricCard.tsx
│   ├── SectionHeader.tsx
│   ├── ShimmerRow.tsx
│   ├── EmptyState.tsx
│   └── LiveCounter.tsx              # Adapted AnimatedCounter wrapper
├── data/
│   ├── mock-telemetry.ts
│   ├── mock-agents.ts
│   ├── mock-sessions.ts
│   ├── mock-skills.ts
│   ├── mock-tokens.ts
│   └── mock-oracle.ts
└── hooks/
    ├── useOperatorPoll.ts           # Generic polling hook
    └── useReducedMotion.ts          # prefers-reduced-motion reactivity
```

---

## BREAKING_CHANGES

| Change | Impact | Mitigation |
|--------|--------|------------|
| Replace `OperatorShell.tsx` innerHTML pattern with React component tree | Current shell is a DOM-dump; new shell is declarative React | Old shell backed up as `OperatorShell.legacy.tsx.bak` |
| Add nested `<Routes>` under `/operator/*` inside `OperatorShell` | `App.tsx` catch-all must delegate to `<OperatorShell>` which owns sub-routes | Wrap in `<Routes><Route path="/operator/*" element={<OperatorShell/>}/></Routes>` — backward-compatible |
| Remove CDN THREE.js load from shell | Three.js background moves to a dedicated component or drops | If THREE.js background is critical, move to `ThreeBackground.tsx` loaded inside shell, not via CDN string injection |
| CSS: new `operator.css` imports from `consumer.css` token layer | No selector conflicts; both sheets coexist | Namespace operator classes with `op-` prefix |

> **Net effect on App.tsx:** The `/operator` catch-all route block is rewritten to `<Route path="/operator/*" element={<OperatorShell />} />`. This is backward-compatible — any path starting with `/operator` still resolves.

---

## RISKS

1. **THREE.js background dependency** — Current shell injects CDN script and boots `main.ts` engine. Moving to React may orphan the 3D background.
   *Mitigation:* Audit `main.ts` and `moduleRegistry` before removal; if critical, wrap in a `<ThreeBackground>` component using existing `@react-three/fiber` dep.

2. **Mission sidebar state loss** — Sidebar is inline HTML with global IDs (`mission-sidebar-*`). Rewriting as React component risks losing transient sidebar logic.
   *Mitigation:* Preserve sidebar as standalone `<MissionSidebar>` component with identical DOM IDs; extract from DOM-dump, not greenfield.

3. **Mock-data divergence** — All sections start on mocks. If backend endpoints ship later with different shapes, interfaces break.
   *Mitigation:* All mock generators export the TypeScript interfaces defined above; adapter layer in `data/` normalizes future real data to these shapes.

4. **Bundle size creep from 9 lazy sections** — Each section is a separate chunk; 9 sections + components may bloat initial download.
   *Mitigation:* All sections lazy-loaded via `React.lazy()`; shell + nav + palette load eagerly (<20KB). Sections load on-demand.

5. **Accessibility regression** — Current shell has no ARIA, no keyboard nav, no focus management. New shell must be WCAG AA.
   *Mitigation:* Cmd-K palette is the primary navigation surface — keyboard-first by design. Every section audited in Phase 8 (accessibility-review pass).

PHASE_2_DONE
