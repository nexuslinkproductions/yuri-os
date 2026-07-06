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

## Phase 4 dry-run evidence (2026-06-29)

Ordered **DRY-RUN ONLY** smokes — no live Cline/GLM/Ollama spend; sidecar JSON shows `armed: false` where applicable.

| # | Check | Command | Result |
|---|-------|---------|--------|
| 1 | MURE / GLM company plan tests | `node --test _SYSTEM/mure/*.test.mjs` | **PASS** — 128 tests, 0 fail (~2.3s) |
| 2 | runFleet WS-B + sidecars | `node _SYSTEM/Scripts/runFleet.mjs --task-file 02_RESOURCES/TASKS/mure-buildout-ws-b-fleet.json --dry-run --ollama-sidecar --cline-sidecar` | **PASS** — exit 0; 6 casts, 6 glmLeaves, 0 held; ollamaSidecar discoverable, eligibleCount 0; clineSidecar eligibleCount 2; mlpFeedback advisory×6 |
| 3a | Ollama fleet list | `node _SYSTEM/Scripts/ollama-fleet.mjs --list` | **PASS** — exit 0; roster + usage (flag file may show ARMED in banner; dry-run still DISARMED) |
| 3b | Ollama fleet dry-run | `node _SYSTEM/Scripts/ollama-fleet.mjs --dry-run --tasks '[{"tier":"flash","label":"P4","prompt":"phase4 dry"}]'` | **PASS** — `dryRun: true`, `armed: false`, lane P4 → deepseek-v4-flash:cloud |
| 4a | Cline fleet list | `node _SYSTEM/Scripts/cline-fleet.mjs --list` | **PASS** — exit 0; DISARMED banner, clinepass roster |
| 4b | Cline fleet dry-run | `node _SYSTEM/Scripts/cline-fleet.mjs --dry-run --tasks '[{"tier":"glm","label":"P4","prompt":"phase4 dry"}]'` | **PASS** — `dryRun: true`, `armed: false`, lane P4 → glm-5.2 |
| 5 | Helmsman dry-run-all | `node _SYSTEM/mure/helmsman-run.mjs --dry-run-all --ollama-sidecar --cline-sidecar` | **PASS** — 6 task files, `errors: []`, `ollamaEligible: 0`; held: WS-A-S1 steward, P4-S1 steward, P8-H1 helmsman |
| 6 | Sidecar unit tests | `node --test _SYSTEM/Scripts/cline-fleet.test.mjs _SYSTEM/Scripts/ollama-fleet.test.mjs` | **PASS** — 17 tests, 0 fail |

### Helmsman summary (smoke #5)

| Task file | held | glm | native |
|-----------|------|-----|--------|
| mure-buildout-ws-a-governance.json | 1 | 2 | 1 |
| mure-buildout-ws-b-fleet.json | 0 | 6 | 0 |
| mure-buildout-ws-c-visual.json | 0 | 4 | 1 |
| mure-buildout-ws-d-knowledge.json | 0 | 3 | 0 |
| mure-buildout-ws-f-router.json | 0 | 2 | 0 |
| yuri-public-release-phase2-8.json | 2 | 4 | 0 |

### Test totals (this session)

- MURE suite: **128** pass / **0** fail  
- cline-fleet + ollama-fleet: **17** pass / **0** fail  
- **Combined: 145** pass / **0** fail  

### Code fix bundled

- `_SYSTEM/Scripts/ollama-fleet.test.mjs` — `isArmed` GREY test uses exported `ARM_FLAG` instead of a fragile relative path.

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
