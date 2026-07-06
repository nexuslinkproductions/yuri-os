# MURE Company Build-Out — Phase 6 Verification

**Date:** 2026-06-29  
**Posture:** Owner lock — **dry-run only** (no live armed dispatch, no spend smokes)  
**RESULT_LABEL:** `06V1_MURE_BUILDOUT_X_PASS_COMMITTED`

---

## Executive summary

**Company ops dry-run operational?** **Yes**, with caveats.

The 20-role roster validates; **150/150** automated tests pass; `planCompany` / `runFleet` / `helmsman-run` complete dry-run paths with ollama + cline sidecar metadata; the work dashboard serves `:4270` with healthy APIs including visual-plan registry. **ARMED** flag on `mure --status` is **expected** under the named build-out exception — this phase did **not** exercise live WS dispatch or spend smokes. Held subtasks remain in the register; native spawn is still stub-only; MLP feedback is advisory and not persisted.

---

## Verification checklist

| Status | Command | Evidence (one line) |
|--------|---------|---------------------|
| PASS | `node _SYSTEM/mure/mure.mjs --validate` | `{"ok":true,"errors":[],"roleCount":20}` |
| PASS | `node --test _SYSTEM/mure/*.test.mjs … work-dashboard-held.test.mjs` | `tests 150 · pass 150 · fail 0` (1819ms) |
| PASS (expected ARMED) | `node _SYSTEM/mure/mure.mjs --status` | `MURE 群れ — 20 roles · ARMED (flag)` — named exception per owner lock, not a Phase 6 fail |
| PASS | `node _SYSTEM/mure/mure.mjs --demo` | DISARMED sample plan: `held:1` (evolver), `glm:5`, `native:2`, zero spend |
| PASS | `runFleet.mjs … mure-buildout-ws-b-fleet.json --dry-run --ollama-sidecar --cline-sidecar` | `dryRun:true`, `held:[]`, sidecars `armed:false`, `mlpFeedback.advisory:true`, `persisted:false` |
| PASS | `helmsman-run.mjs --dry-run-all … --out _SYSTEM/lane-output/phase6` | `files:6`, `held:3`, `errors:0`; WS-C visual gate satisfied |
| PASS | `work-dashboard.mjs --serve` + curl | `/health` → `{"ok":true}`; `/api/overview` → `roleCount:20`; `/api/visual-plans` → WS-C slug `recap-fb61bca8b66d4ba8` |
| PASS | `node _SYSTEM/Scripts/capability-scan.mjs --check` | `OK: capability registry current (222 capabilities).` |
| DEFERRED | `npx gitnexus analyze --skip-agents-md` | Not run in Phase 6 window; last index activity ~2026-06-29 (`.gitnexus/edit-stale-warned.marker`) — re-run before large refactors |

Lane artifacts (reference only, **not committed**): `_SYSTEM/lane-output/phase6/` (`dryrun-*`, `runfleet-*`, helmsman aggregate).

---

## Cross-phase deliverable audit (Phases 0–5)

| Phase | Report | Label / outcome |
|-------|--------|-----------------|
| 0 | [MURE_COMPANY_BUILD_PLAN_2026-06-29.md](./MURE_COMPANY_BUILD_PLAN_2026-06-29.md) | Scope + armed exception locked |
| 1 | [MURE_COMPANY_BUILD_01_SENTINEL_AUDIT.md](./MURE_COMPANY_BUILD_01_SENTINEL_AUDIT.md) | Sentinel/scout inventory |
| 2 | [MURE_COMPANY_BUILD_02_REWIRE.md](./MURE_COMPANY_BUILD_02_REWIRE.md) | Mechanism rewire (fleet, governance regressions) |
| 3 | [MURE_COMPANY_BUILD_03_HELMSMAN.md](./MURE_COMPANY_BUILD_03_HELMSMAN.md) | Task packets + helmsman decomposition |
| 4 | [MURE_COMPANY_BUILD_04_ARM_CEREMONY.md](./MURE_COMPANY_BUILD_04_ARM_CEREMONY.md) | Arm ceremony documented (dry-run smokes) |
| 5 | [MURE_COMPANY_BUILD_05_VISUAL_CONTROL.md](./MURE_COMPANY_BUILD_05_VISUAL_CONTROL.md) | `05V1_VISUAL_CONTROL_X_PASS_COMMITTED` |
| 6 | **This file** | `06V1_MURE_BUILDOUT_X_PASS_COMMITTED` |

---

## Held register status (deferred — owner action required)

From latest `helmsman-run --dry-run-all` (phase6 output):

| Task file | Subtask | Role | Reason (abbrev.) |
|-----------|---------|------|------------------|
| `mure-buildout-ws-a-governance.json` | WS-A-S1-steward-gate | steward | Owner-gated role by posture |
| `yuri-public-release-phase2-8.json` | P4-S1-steward-gate | steward | Failed gates: blastRadius |
| `yuri-public-release-phase2-8.json` | P8-H1-helmsman-finalize | helmsman | Failed gates: reversible, blastRadius |

Dashboard held panel reads **helmsman-summary**; commit `f06073bc` fixes newest-summary selection (phase5 over phase3). **Clearance** of held items still requires explicit owner rulings — not automated in Phase 6.

---

## Adjudicator refutation (what could still fail in production)

Assume claims below are **false until live evidence**:

1. **Live dispatch** — Dry-run proves planning and file emission only; armed `runCompany` / GLM spend / real ollama fan-out could fail on keys, quotas, or race conditions not covered here.
2. **Native substrate** — Tests assert stub packets only; a real Opus/Cursor Agent spawn path is unproven end-to-end.
3. **Held queue UX** — API exposes held data; approval actions remain stub/disabled per Phase 5; operators could approve the wrong summary if lane-output is stale.
4. **MLP router** — Advisory errors computed in dry-run but `persisted:false`; cold weights may mis-route under real outcomes.
5. **Visual-plan gate** — WS-C satisfied in dry-run; a task without slug/approval could still ship UI that blocks or silently skips dispatch.
6. **GitNexus drift** — Index not refreshed this phase; impact analysis may under-rank structural edits.

---

## Residual risk register

| Risk | Phase mitigation | Status |
|------|------------------|--------|
| Ollama not in runFleet | P2/P4 sidecar wiring | **MITIGATED** (dry-run sidecar blocks present) |
| MURE test regressions | P2 rewire | **MITIGATED** (150 green) |
| Cline M2 integration | P2 fleet tests | **MITIGATED** (cline-fleet tests green) |
| Dashboard drill-down | P5 API + UI | **MITIGATED** (overview + visual-plans curl pass) |
| Visual-plan gates | P5 helmsman + registry | **MITIGATED** (WS-C gate satisfied in dry-run) |
| Native stub seam | — | **OPEN** |
| MLP cold weights / stub feedback | P2 advisory only | **OPEN** (`persisted:false`) |
| Evolver held / no self-mod | governance | **OPEN** (by design) |
| Live WS dispatch | — | **OPEN** (unproven; owner lock) |
| Held register uncleared | — | **OPEN** (3 items; owner action) |

---

## Owner summary

- **Works now:** Full dry-run company pipeline (validate → plan → runFleet → helmsman-all), green test matrix, dashboard health + visual-plan API, capability registry check, visual-plan gate on WS-C.
- **Deferred:** Live armed smokes, held-register clearance, MLP weight persistence, GitNexus re-index, public-release phase2–8 steward/finalize holds.
- **Recommended next actions:** (1) Optional owner-authorized live smokes with spend caps; (2) Wire MLP `updateFromOutcome` persistence when ledger outcomes exist; (3) One-token rulings on the three held rows; (4) Re-run `helmsman-run` after holds clear and refresh dashboard summary path; (5) `npx gitnexus analyze --skip-agents-md` before the next large refactor.

---

*Phase 6 executed under dry-run owner lock. No lane-output committed.*
