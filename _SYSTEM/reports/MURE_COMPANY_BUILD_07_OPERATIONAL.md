# MURE Phase 7 — Operational Company + MLP Learning Loop

**Date:** 2026-06-29  
**RESULT_LABEL:** `07O1_OPERATIONAL_MLP_X_PASS_COMMITTED`

---

## Executive summary

Phase 7 closes the gap between dry-run verification (Phase 6) and **operational company use**:

- **Held register unblocked** via committed owner lock (`mure-held-rulings-owner-lock.json`) — steward/helmsman gate subtasks cast with `clearedHeld` metadata; `finalize:true` and `arming:true` remain hard-vetoed.
- **MLP learning loop** wired: `fleet-mlp-feedback.mjs` → predict → dispatch → outcome → `updateFromOutcome` (persist when `YURI_MLP_LEARN=1` or `mlp-learn.enabled`).
- **`company-dispatch.mjs`** — ordered end-to-end orchestrator for WS-A→B→F→C→D→G (+ optional release tail).

---

## MLP loop

```
planCompany (routerSuggestion per leaf)
    → recordMlpPredictions (prediction-ledger)
    → runCompany / runSwarm (when armed)
    → deriveLeafOutcome (poolOutputs + RESULT_LABEL)
    → updateFromOutcome (weights, opt-in persist)
    → train-fleet-router-from-ledger (post-run, when persist)
```

| Flag | Effect |
|------|--------|
| `YURI_MLP_LEARN=1` | Persist weight updates + ledger |
| `touch _SYSTEM/state/mlp-learn.enabled` | Same |
| `--mlp-learn` on runFleet / company-dispatch | Same on apply path |
| dry-run / no flag | advisory only (`persisted: false`) |

---

## Held rulings (owner lock)

**File:** `02_RESOURCES/TASKS/mure-held-rulings-owner-lock.json`

| Subtask | Cleared for cast | Still blocked |
|---------|------------------|---------------|
| `WS-A-S1-steward-gate` | ✅ | — |
| `P4-S1-steward-gate` | ✅ | git push / publish |
| `P8-H1-helmsman-finalize` | ✅ | `finalize:true` runtime path |

**Not cleared:** evolver, arming subtasks, any `finalize:true` subtask.

---

## Company dispatch

```bash
# Safe — full manifest
node _SYSTEM/mure/company-dispatch.mjs --dry-run-all --include-release

# Live (requires mure.enabled + owner keys)
node _SYSTEM/mure/company-dispatch.mjs --apply --mlp-learn --ollama-sidecar --cline-sidecar
```

Workstream order: **WS-A → WS-B → WS-F → WS-C → WS-D → WS-G** (+ release tail with `--include-release`).

---

## Verification (2026-06-29)

| Check | Result |
|-------|--------|
| `_SYSTEM/mure/*.test.mjs` | 136+ pass |
| `held-rulings.test.mjs` | WS-A `clearedHeld:1`, `held:0` |
| `company-dispatch --dry-run-all --include-release` | All streams `planned`, 0 blocking held |
| `runFleet --dry-run --mlp-learn` | advisory feedback |

---

## Live smokes (deferred — owner keys)

```bash
YURI_GLM_FLEET=1 node _SYSTEM/Scripts/glm-fleet.mjs --smoke
YURI_MURE_ARMED=1 node _SYSTEM/mure/mure.mjs --demo
YURI_OLLAMA_FLEET=1 node _SYSTEM/Scripts/ollama-fleet.mjs --smoke
# Cline: cline -P clinepass -m glm-5.2 -c $REPO "smoke → RESULT_LABEL"
```

---

## Residual risks

| Risk | Status |
|------|--------|
| Native Agent spawn E2E | OPEN — Opus/Cursor session required |
| Live `--apply` spend | OPEN — run when budget allows |
| Evolver self-mod | OPEN by design |
| MLP cold start | Warming via `--apply --mlp-learn` cycles |

---

*Cross-link: [MURE_BUILDOUT_VERIFICATION_2026-06-29.md](./MURE_BUILDOUT_VERIFICATION_2026-06-29.md)*
