# MURE Company Build-Out — Phase 2 Architect/Engineer Rewire

**Date:** 2026-06-29  
**Authority:** `_SYSTEM/reports/MURE_COMPANY_BUILD_PLAN_2026-06-29.md` Phase 2  
**Prior:** Phase 1 commit `21c882d4`, audit `MURE_COMPANY_BUILD_01_SENTINEL_AUDIT.md`  
**RESULT_LABEL:** `02R1_MURE_REWIRE_X_PASS_COMMITTED`  
**Posture:** ARMED (named build-out exception — unchanged)

---

## Executive summary

Phase 2 mechanism rewires landed: dashboard drill-down UI wired to existing APIs, ollama sidecar discoverable in plan metadata, MLP advisory feedback stub on runFleet dry-run, WS-B..F task packets created. Governance tests remain green (127/127). No protected paths touched; no arm flags modified.

| Deliverable | Status |
|-------------|--------|
| Dashboard drill-down UI | ✅ run/role/artifacts/trends |
| Ollama sidecar metadata | ✅ `company.mjs` + `runFleet.mjs` |
| MLP feedback stub | ✅ `recordMlpFeedbackStub` (persist:false) |
| WS-B..F task packets | ✅ 5 JSON files |
| Governance tests | ✅ 127/127 |
| GitNexus re-index | ⏭ Done Phase 1 |

---

## Changes

### 1. Dashboard drill-down (`_SYSTEM/mure/dashboard.html`)

- Run stream rows clickable → `GET /api/run?id=` → detail drawer (roles, outputs, artifacts)
- Constellation role click → `GET /api/artifacts?role=` → recent artifacts in drawer
- Insights panel loads `GET /api/trends?type=throughput|convergence|productivity` (30s cache)
- Shared `showDrawer()` / `fetchJson()` helpers; matches existing NEXUS LINK style

### 2. Ollama sidecar contract

**`company.mjs` — `planCompany` return adds `ollamaSidecar`:**
- `eligible` list for scout/artificer casts + router ollama hints
- `spawn` command template for manual ollama-fleet invocation

**`runFleet.mjs`:**
- `buildOllamaSidecar(plan)` — generates ollama-fleet task array
- `--ollama-sidecar` CLI flag writes `.claude/jobs/<runId>/ollama-tasks.json`
- Result JSON includes full `ollamaSidecar` block (discoverable, DISARMED)

### 3. MLP feedback stub

**`fleet-router-mlp.mjs`:** `updateFromOutcome` accepts `opts.persist === false` to skip weight save.

**`runFleet.mjs`:** `recordMlpFeedbackStub(plan)` called on dry-run completion:
- Computes prediction error for each leaf with `routerSuggestion`
- Does **not** persist weights (DISARMED-safe advisory)

### 4. Task packets (`02_RESOURCES/TASKS/`)

| File | Workstream |
|------|------------|
| `mure-buildout-ws-b-fleet.json` | WS-B Fleet substrate |
| `mure-buildout-ws-c-visual.json` | WS-C Visual control |
| `mure-buildout-ws-d-knowledge.json` | WS-D Knowledge & doctrine |
| `mure-buildout-ws-f-router.json` | WS-F Router learning |
| `yuri-public-release-phase2-8.json` | WS-E Public release tail |

WS-A (`mure-buildout-ws-a-governance.json`) unchanged from Phase 1.

---

## Verification evidence

| Check | Command | Result |
|-------|---------|--------|
| MURE tests | `node --test _SYSTEM/mure/*.test.mjs` | 127 pass · 0 fail |
| MURE roster | `node _SYSTEM/mure/mure.mjs --validate` | 20 roles OK |
| MURE demo | `node _SYSTEM/mure/mure.mjs --demo` | DISARMED plan, 1 held |
| runFleet dry-run | `runFleet.mjs --task-file …ws-b-fleet.json --dry-run` | ollamaSidecar + mlpFeedback |
| Scout ollama pick | scout-only task dry-run | eligibleCount=1 |
| Dashboard smoke | `:4272` curl overview/run/artifacts/trends | all 200 |
| Dashboard HTML | grep `/api/run` in dashboard.html | 3 endpoint refs |

### Dashboard smoke (2026-06-29)

```json
{"overview":200,"run":200,"artifacts":200,"trends":200,"hasRunApi":true}
```

### MLP stub sample

```json
{"advisory":true,"persisted":false,"count":6,"records":[{"id":"WS-B-R1-ollama-sidecar","substrate":"glm","error":-0.126}]}
```

---

## Files changed

| Path | Change |
|------|--------|
| `_SYSTEM/mure/dashboard.html` | Drill-down UI |
| `_SYSTEM/mure/company.mjs` | `ollamaSidecar` in plan |
| `_SYSTEM/Scripts/runFleet.mjs` | Sidecar builder, MLP stub, CLI flag |
| `_SYSTEM/Scripts/fleet-router-mlp.mjs` | `persist:false` option |
| `02_RESOURCES/TASKS/mure-buildout-ws-b-fleet.json` | New |
| `02_RESOURCES/TASKS/mure-buildout-ws-c-visual.json` | New |
| `02_RESOURCES/TASKS/mure-buildout-ws-d-knowledge.json` | New |
| `02_RESOURCES/TASKS/mure-buildout-ws-f-router.json` | New |
| `02_RESOURCES/TASKS/yuri-public-release-phase2-8.json` | New |
| `_SYSTEM/reports/MURE_COMPANY_BUILD_02_REWIRE.md` | This report |

---

## Residual risk

| Risk | Severity | Mitigation |
|------|----------|------------|
| Ollama still manual spawn (not auto-dispatched) | MEDIUM | Phase 4 arm ceremony + `--apply` integration |
| MLP stub does not train on real outcomes yet | LOW | Wire ledger ingest with `persist:true` when armed |
| Held queue UI not wired | LOW | Phase 5-A stub (WS-C-R2) |
| Approval queue backend missing | MEDIUM | Phase 5 scope |
| skills-registry-lint 29 drift | LOW | Non-blocking doc drift |
| ARMED posture accidental spend | HIGH | Owner exception documented; Phase 4 ceremony |

---

## Ready for Phase 3

- All six workstream task packets exist (WS-A..F + release tail)
- Mechanisms wired for Helmsman dry-run decomposition:
  ```bash
  node _SYSTEM/mure/company.mjs --task-file 02_RESOURCES/TASKS/mure-buildout-ws-a-governance.json --dry-run
  node _SYSTEM/Scripts/runFleet.mjs --task-file 02_RESOURCES/TASKS/mure-buildout-ws-b-fleet.json --dry-run
  ```
- Dashboard operator drill-down functional (read-only)
- Phase 3: role coverage matrix validation, held register, visual-plan gate on WS-C

---

*Produced under ARMED build-out exception. No arm flags modified. No protected paths read.*
