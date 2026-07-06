# MURE Company Build-Out — Phase 5 Visual Control

**Date:** 2026-06-29  
**Authority:** `_SYSTEM/reports/MURE_COMPANY_BUILD_PLAN_2026-06-29.md` Phase 5  
**Prior:** Phase 4 `_SYSTEM/reports/MURE_COMPANY_BUILD_04_ARM_CEREMONY.md`  
**RESULT_LABEL:** `05V1_VISUAL_CONTROL_X_PASS_COMMITTED`  
**Posture:** DISARMED — read-only dashboard surfaces; held approval is stub (disabled), not live dispatch

---

## Executive summary

Phase 5 ships visual-plan gates in helmsman dry-run, a visual-plans registry on the work dashboard API, dashboard polish (visual plans strip, held-queue stub, convergence trend), and operator docs. No Dispatch template fork; incremental `dashboard.html` only.

| Deliverable | Status |
|-------------|--------|
| P5-A dashboard drill-down | ✅ `/api/run`, `/api/artifacts`, `/api/trends` wired |
| P5-A held queue panel | ✅ from `helmsman-summary` via `/api/overview` |
| P5-A visual plans strip | ✅ `visualPlans` from task JSON registry |
| P5-A convergence trend | ✅ `/api/trends?type=convergence` under gauge |
| P5-B `checkVisualPlanGate` | ✅ exported + helmsman integration |
| P5-B task metadata | ✅ WS-C slug/approval; WS-B `requiresVisualPlan: false` |
| P5-C work-dashboard registry | ✅ `loadVisualPlanRegistry()` + `/api/visual-plans` |
| P5-D analytics | ⏸ deferred — ledger feedback not live |
| Verification | ✅ tests + helmsman dry-run + capability-scan |

---

## P5-A checklist (evidence)

### Endpoints wired (`_SYSTEM/mure/dashboard.html`)

| Endpoint | Consumer | Evidence |
|----------|----------|----------|
| `GET /api/overview` | poll tick (3s) | KPIs, runs, jobs, held, visualPlans |
| `GET /api/run?id=` | `openRun()` drawer | run detail + artifacts |
| `GET /api/artifacts?role=` | `openRole()` drawer | recent artifacts by role |
| `GET /api/trends?type=throughput` | insights sparkline | `loadTrends()` |
| `GET /api/trends?type=convergence` | `#convTrend` label | `renderInsights()` |
| `GET /api/trends?type=productivity` | cached in `TRENDS` | ready for future panel |

### Held queue

- Source: `_SYSTEM/lane-output/phase3/helmsman-summary.json` → `heldQueue` on overview
- Panel: `#heldPanel` / `#heldList`
- Phase 5 stub: disabled **Request owner approve** per item (`title="Owner-gated — Phase 5 stub"`)

### Visual plans strip

- Source: `loadVisualPlanRegistry()` → `visualPlans[]` on overview
- Panel: `#vplanPanel` — slug, hosted URL link, recap hint

### Run filter (nice-to-have)

- Clicking a run sets `runFilter` and adds a chip on work products table

---

## P5-B visual-plan gate convention

Task JSON fields:

| Field | Purpose |
|-------|---------|
| `visualPlanUrl` | Local slash path (e.g. `/visual-plan`) — triggers gate when set |
| `visualPlanSlug` | Hosted recap id (e.g. `recap-fb61bca8b66d4ba8`) — satisfies gate |
| `visualPlanHostedUrl` | Full share URL — satisfies gate |
| `visualPlanApproved` | Owner sign-off boolean — satisfies gate |
| `visualRecapUrl` | Local recap path hint |
| `requiresVisualPlan` | Explicit override (`false` skips tag heuristic) |

**Required when:** `requiresVisualPlan: true`, OR `visualPlanUrl` set, OR (`subtasks.length >= 4` AND tags include `visual` / `dashboard` / `ui`).

**Satisfied when:** `visualPlanApproved === true`, OR non-empty `visualPlanSlug`, OR non-empty `visualPlanHostedUrl`.

**Helmsman behavior:** dry-run attaches `visualPlanGate` per file; unsatisfied gates → `errors[]` with `status: 'advisory'` (exit 0). Hard failures (company/runFleet) still exit 1.

### Helmsman dry-run output snippet

```json
{
  "visualPlanGates": [
    {
      "file": "02_RESOURCES/TASKS/mure-buildout-ws-c-visual.json",
      "required": true,
      "satisfied": true,
      "reason": "visual plan present",
      "visualPlanUrl": "/visual-plan",
      "visualPlanSlug": "recap-fb61bca8b66d4ba8",
      "visualRecapUrl": "/visual-recap"
    }
  ],
  "visualPlanGateHints": [
    {
      "file": "02_RESOURCES/TASKS/mure-buildout-ws-c-visual.json",
      "required": true,
      "satisfied": true,
      "reason": "visual plan present",
      "visualPlanSlug": "recap-fb61bca8b66d4ba8",
      "visualRecapUrl": "/visual-recap"
    }
  ]
}
```

---

## P5-D deferred

Agent-Native **analytics** template (cost, throughput, router confidence charts) remains deferred until work-ledger ingest exposes live fleet/token feedback loops. Dashboard trends today are ledger-derived only.

---

## Verification commands

```bash
node --test _SYSTEM/mure/helmsman-run.test.mjs _SYSTEM/mure/*.test.mjs
node _SYSTEM/mure/helmsman-run.mjs --dry-run-all --out _SYSTEM/lane-output/phase5
node _SYSTEM/Scripts/capability-scan.mjs --check
node _SYSTEM/Scripts/work-dashboard.mjs --serve   # optional smoke: /api/visual-plans
```

---

## Residual risk

- Held approve button is cosmetic only — no owner arm path wired
- Visual plan gate is advisory on dry-run; armed dispatch does not yet hard-block
- `helmsman-summary` path still points at `phase3` lane output (held queue staleness if not re-run)
