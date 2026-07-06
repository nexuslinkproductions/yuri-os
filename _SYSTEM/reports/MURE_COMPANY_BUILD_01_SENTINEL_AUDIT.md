# MURE Company Build-Out — Phase 1 Sentinel/Scout Audit

**Date:** 2026-06-29  
**Authority:** Owner lock `_SYSTEM/reports/MURE_COMPANY_BUILD_PLAN_2026-06-29.md` § Owner lock  
**RESULT_LABEL:** `01R1_MURE_AUDIT_X_PASS_COMMITTED`  
**Posture:** ARMED (named build-out exception — flags retained per owner 2026-06-29)

---

## Executive summary

Phase 1 evidence-first audit completed DISARMED-safe (read-only + test fixes). **Governance test regressions cleared** (8 → 0 failures). **GitNexus re-indexed.** **WS-A governance task packet created.** Remaining gaps documented for Phase 2+.

| Deliverable | Status |
|-------------|--------|
| Sentinel/Scout audit inventory | ✅ This report |
| B02 governance test fixes | ✅ 127/127 pass |
| B05 GitNexus re-index | ✅ 74,664 nodes (42.3s) |
| B04 partial WS-A packet | ✅ `mure-buildout-ws-a-governance.json` |
| B01 disarm reset | ⏭ Deferred — owner armed exception |
| B04 WS-B..F packets | ❌ Still missing (Phase 3) |

---

## Test results

### Before (audit baseline)

| Suite | Pass | Fail | Notes |
|-------|------|------|-------|
| `_SYSTEM/mure/company.test.mjs` | 5 | **8** | `planCompany` async not awaited; self-arm test hung when fleet armed |
| `_SYSTEM/mure/*.test.mjs` (all) | ~119 | **8** | Same root cause in company.test.mjs |

**Failure modes enumerated:**

1. `planCompany casts every subtask…` — accessed Promise fields (`p.casts` undefined)
2. `arming subtask is HELD…` — same
3. `protected-path subtask is held…` — same
4. `finalize subtask is held…` — same
5. `substrate invariant…` — same
6. `conservation…` — same
7. `determinism…` — same
8. `runCompany({armed:true}) does NOT self-arm…` — hung on live runSwarm when `mure.enabled` present

**Root cause:** `planCompany` became `async` (MLP router integration) but tests remained synchronous. Self-arm regression test required hermetic disarm when fleet flags exist.

### After (Phase 1 fix)

```
node --test _SYSTEM/mure/*.test.mjs
ℹ tests 127 · pass 127 · fail 0 · duration_ms ~1367
```

**Fix applied:** `_SYSTEM/mure/company.test.mjs` — `await planCompany(...)`, `withDisarmed()` helper for self-arm hermetic test (temporarily clears arm flag, restores after).

---

## Fleet / lane health

| Check | Command | Result | Evidence |
|-------|---------|--------|----------|
| MURE roster | `node _SYSTEM/mure/mure.mjs --validate` | ✅ 20 roles, 0 errors | `{"ok":true,"roleCount":20}` |
| MURE posture | `node _SYSTEM/mure/mure.mjs --status` | ⚠️ **ARMED (flag)** | Owner exception documented |
| MURE demo | `node _SYSTEM/mure/mure.mjs --demo` | ✅ DISARMED plan, zero spend | 8 casts, 1 held (evolver) |
| MURE tests | `node --test _SYSTEM/mure/*.test.mjs` | ✅ 127/127 | See above |
| WS-A dry-run | `company.mjs --task-file …ws-a-governance.json --dry-run` | ✅ | 5 casts, 1 held (steward) |

### Arm flags inventory

| Flag | Present | Notes |
|------|---------|-------|
| `_SYSTEM/state/mure.enabled` | ✅ | Primary MURE arm |
| `_SYSTEM/state/glm-fleet.enabled` | ✅ | GLM spend lane |
| `_SYSTEM/state/ollama-fleet.enabled` | ✅ | Ollama sidecar |
| `_SYSTEM/state/company.enabled` | ✅ | Company mode |
| `_SYSTEM/state/swarm-convergence.enabled` | ✅ | Swarm rounds |

**Owner intent:** Keep armed for active build-out; 6-gate + owner-gated roles still enforce holds.

---

## Skill registry

| Check | Command | Result |
|-------|---------|--------|
| Manifest loader | `node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate` | ✅ `ok=250 drift=0 unregistered=0` |
| Registry lint | `node _SYSTEM/Scripts/skills-registry-lint.mjs` | ⚠️ **29 FAIL** — skills on disk without `skills-registry.md` row |

**Stale/broken:** Lint failures are registry-doc drift (unregistered SKILL.md rows), not loader hash drift. Phase 2+ can batch-register or prune.

---

## Work dashboard

| Endpoint | Backend | UI wired | Smoke |
|----------|---------|----------|-------|
| `/api/overview` | ✅ | ✅ (poll) | ✅ 200 — 151 runs, 589 artifacts |
| `/api/run?id=` | ✅ | ❌ | Backend ready |
| `/api/artifacts?role=&run=` | ✅ | ❌ | ✅ 200 |
| `/api/trends?type=` | ✅ | ❌ | Backend ready |
| Approval queue (held subtasks) | ❌ | ❌ | Phase 5 |

**Smoke:** `work-dashboard.mjs --serve --port 4271` → overview JSON valid; `dashboard.html` does not consume drill-down endpoints (grep: no `/api/run` references).

---

## Substrate / mechanism gaps

| Mechanism | State | Gap |
|-----------|-------|-----|
| `company.mjs` → GLM | ✅ Wired via runSwarm | — |
| `company.mjs` → native | ✅ Stub seam | Opus-only live spawn |
| `company.mjs` → ollama | ❌ Not wired | Manual sidecar only (`runFleet.mjs` note) |
| MLP router | ⚠️ Advisory | Cold weights; no `updateFromOutcome` loop |
| Native spawn loop | ✅ Stub packets | Hermetic tests pass |

---

## Task packet gap list

| File | Status |
|------|--------|
| `yuri-public-release-phase1-census.json` | ✅ Exists |
| `mure-buildout-ws-a-governance.json` | ✅ **Created Phase 1** |
| `mure-buildout-ws-b-fleet.json` | ❌ Missing |
| `mure-buildout-ws-c-visual.json` | ❌ Missing |
| `mure-buildout-ws-d-knowledge.json` | ❌ Missing |
| `yuri-public-release-phase2-8.json` | ❌ Missing |
| `mure-buildout-ws-f-router.json` | ❌ Missing |

---

## GitNexus index

| Metric | Before | After |
|--------|--------|-------|
| Staleness | ~3 commits behind (plan baseline) | Re-indexed 2026-06-29 |
| Command | — | `npx gitnexus analyze --skip-agents-md` |
| Result | — | 74,664 nodes · 105,541 edges · 42.3s |

---

## P0 backlog clearance

| ID | Item | Phase 1 status |
|----|------|----------------|
| B01 | DISARM reset | ⏭ **Deferred** — owner armed exception |
| B02 | Fix governance tests | ✅ **Cleared** |
| B03 | Scope decision | ✅ **Cleared** — company ops first, then release tail |
| B04 | Task packets | ⚠️ **Partial** — WS-A only |
| B05 | GitNexus re-index | ✅ **Cleared** |

---

## Phase 2 blockers / handoff

1. **WS-B..F task packets** — Helmsman decomposition (Phase 3 scope; partial B04 done)
2. **Ollama sidecar auto-wire** in `runFleet.mjs` / `company.mjs` (B06)
3. **Dashboard drill-down UI** — backend exists, HTML not wired (B07)
4. **MLP outcome feedback loop** (B08)
5. **skills-registry-lint** — 29 unregistered SKILL.md rows (non-blocking)
6. **Arm ceremony** — deferred to Phase 4; current ARMED posture is intentional

---

## Adversarial notes (adjudicator)

- First-run test green is verified by full suite re-run post-fix.
- Self-arm test uses temporary flag removal — restores flag; does not change owner posture.
- Skill lint FAIL is doc drift, not runtime loader failure — do not conflate.
- Dashboard overview works; drill-down is Phase 5-A scope.

---

*Audit produced under ARMED build-out exception. No arm flags modified. No protected paths read.*
