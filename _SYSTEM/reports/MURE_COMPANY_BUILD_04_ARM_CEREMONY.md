# MURE Phase 4 — Fleet Arm Ceremony Runbook

**Date:** 2026-06-29  
**Owner lock:** Named **ARMED exception** holds for active build-out — this doc records ordered ceremony, smokes, rollback under current armed posture (not a return to DISARMED-first).  
**Cross-link:** `_SYSTEM/reports/MURE_COMPANY_BUILD_PLAN_2026-06-29.md` § Phase 4  
**RESULT_LABEL:** `04R1_ARM_CEREMONY_X_PASS_COMMITTED`

---

## Purpose

Controlled, documented arming for live multi-substrate dispatch. **Never auto-arm.** Every step requires owner intent; held subtasks stay owner-gated regardless of arm flags.

---

## Pre-flight (Step 0 — always DISARMED-safe)

Run before any live spend or after disarm:

```bash
# Roster + governance
node _SYSTEM/mure/mure.mjs --validate
node --test _SYSTEM/mure/*.test.mjs

# Dry-run all workstream task files
node _SYSTEM/mure/helmsman-run.mjs --dry-run-all --out _SYSTEM/lane-output/phase4

# Per-WS spot checks
node _SYSTEM/mure/company.mjs --task-file 02_RESOURCES/TASKS/mure-buildout-ws-a-governance.json --dry-run
node _SYSTEM/Scripts/runFleet.mjs --task-file 02_RESOURCES/TASKS/mure-buildout-ws-b-fleet.json --dry-run --ollama-sidecar

# Status snapshot
node _SYSTEM/mure/mure.mjs --status
```

**Pass criteria:** 0 test failures; helmsman-summary `errors: []`; held register matches owner lock (WS-A-S1, P4-S1, P8-H1, evolver, sentinel arm).

---

## Arm sequence (strict order)

| Step | Gate | Flag / env | Keys | Rollback |
|------|------|------------|------|----------|
| **0. Pre-flight** | Dry-run all WS | — | — | — |
| **1. GLM fleet** | Owner token: "arm glm" | `touch _SYSTEM/state/glm-fleet.enabled` or `YURI_GLM_FLEET=1` | z.ai API key (keychain) | `rm _SYSTEM/state/glm-fleet.enabled` |
| **2. Swarm convergence** | After GLM smoke | `YURI_SWARM_CONVERGENCE=1` | (bundled with GLM) | `unset YURI_SWARM_CONVERGENCE` |
| **3. MURE orchestrator** | After 1–2 green | `touch _SYSTEM/state/mure.enabled` or `YURI_MURE_ARMED=1` | (uses GLM from step 1) | `rm _SYSTEM/state/mure.enabled` |
| **4. Ollama sidecar** | Parallel bulk only | `touch _SYSTEM/state/ollama-fleet.enabled` or `YURI_OLLAMA_FLEET=1` | Ollama Pro key (keychain) | `rm _SYSTEM/state/ollama-fleet.enabled` |
| **5. Native substrate** | Opus/Cursor session | (same as MURE) | Anthropic weekly pool | disarm MURE |
| **6. Cline Pass** | **Separate owner gate** (Phase 4+) | `cline auth` + credit budget doc | ClinePass OAuth (`~/.cline`) | do not spawn; no flag file yet |
| **7. Evolver** | Oracle green + explicit authorize | — | — | **never auto** |

---

## Smoke commands (per substrate)

```bash
# Step 1 — GLM only
YURI_GLM_FLEET=1 node _SYSTEM/Scripts/glm-fleet.mjs --smoke

# Step 3 — MURE armed single-leaf
YURI_MURE_ARMED=1 node _SYSTEM/mure/mure.mjs --demo
# then small real task with bounded blast

# Step 4 — Ollama 3-model smoke
YURI_OLLAMA_FLEET=1 node _SYSTEM/Scripts/ollama-fleet.mjs --smoke

# Step 6 — Cline Pass (owner manual; DISARMED in automation)
# cline -P clinepass -m glm-5.2 -c $REPO "smoke prompt → RESULT_LABEL"

# Full tri-substrate plan (after smokes green)
node _SYSTEM/Scripts/runFleet.mjs --task-file 02_RESOURCES/TASKS/mure-buildout-ws-b-fleet.json --apply
# parallel: node _SYSTEM/Scripts/ollama-fleet.mjs --tasks-file <generated-sidecar.json>
```

---

## Sentinel pre-arm checklist

- [ ] No secrets in task prompts, visual plans, or blackboard exports
- [ ] No protected paths in subtask `files` arrays (`backend/data/`, `.env`, `.claude/state/`, etc.)
- [ ] Held register reviewed — owner confirms or defers each held subtask
- [ ] Quartermaster cost ceiling documented for smoke + first workstream
- [ ] GitNexus index fresh if large refactors planned (`npx gitnexus analyze --skip-agents-md`)
- [ ] ClinePass: credit budget doc exists before any live Cline dispatch

---

## Disarm (one command)

```bash
rm -f _SYSTEM/state/{mure,glm-fleet,ollama-fleet}.enabled
unset YURI_MURE_ARMED YURI_GLM_FLEET YURI_OLLAMA_FLEET YURI_SWARM_CONVERGENCE
node _SYSTEM/mure/mure.mjs --status   # expect DISARMED
```

Cline has no repo flag file — disarm = stop spawning CLI; OAuth remains in `~/.cline`.

---

## Held dispatch log (owner-gated — locked 2026-06-29)

| Subtask ID | Role | Owner action |
|------------|------|--------------|
| `WS-A-S1-steward-gate` | steward | Confirm WS-A governance gate before finalize |
| `P4-S1-steward-gate` | steward | Confirm release-tail phase 4 steward gate |
| `P8-H1-helmsman-finalize` | helmsman | Owner-only finalize on public release phase 8 |
| `evolver` | evolver | Oracle green + explicit evolver authorization |
| `sentinel arm actions` | sentinel | Owner confirm on sentinel arm actions |
| `cline-live-dispatch` | quartermaster | Credit budget doc + `cline auth` before M2 sidecar |

---

## Phase 4 smoke evidence (2026-06-29 session)

| Check | Command | Result |
|-------|---------|--------|
| helmsman dry-run-all | `node _SYSTEM/mure/helmsman-run.mjs --dry-run-all` | **PASS** — 6 task files, 3 held, 0 errors |
| WS-A dry-run | `company.mjs --task-file mure-buildout-ws-a-governance.json --dry-run` | **PASS** — 1 held (steward), 2 glm, 1 native |
| runFleet + ollama metadata | `runFleet.mjs --task-file ws-b-fleet.json --dry-run` | **PASS** — ollamaSidecar + mlpFeedback stub |
| MLP advisory | planCompany routerSuggestion on leaves | **PASS** — attached per leaf |
| MURE status | `mure.mjs --status` | **ARMED** (named exception) |

---

## Named ARMED exception (owner lock)

Build-out session keeps `mure.enabled`, `glm-fleet.enabled`, `ollama-fleet.enabled` present. Live dispatch still subject to:

- 6-gate charter on every subtask
- Owner-gated roles (helmsman, steward, evolver, sentinel arm)
- No finalize without adjudicator pass + owner
- Phase 6 remains **dry-run only** for end-to-end armed company dispatch

---

## References

- `_SYSTEM/mure/README.md`
- `_SYSTEM/reports/MURE_COMPANY_BUILD_PLAN_2026-06-29.md`
- `_SYSTEM/reports/CLINE_PASS_INTEGRATION_2026-06-29.md`
- `_SYSTEM/lane-output/phase3/helmsman-summary.json`

---

*Ceremony documented under ARMED exception. No arm flags modified during authoring.*
