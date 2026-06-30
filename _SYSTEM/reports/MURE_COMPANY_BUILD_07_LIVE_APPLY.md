# MURE Company Build 07 — Live Apply Evidence

**Date:** 2026-06-30  
**Dispatch:** `company-dispatch.mjs --apply --mlp-learn --ollama-sidecar --cline-sidecar`  
**Out:** `_SYSTEM/lane-output/dispatch-live-full`  
**Final manifest:** `dispatch-mqzwtxwn/manifest.json` (exit 0, ~7.6h elapsed)

## WS-A (governance) — original + full re-run

| Field | Value |
|---|---|
| Original swarm | `swarm-mqzvywo8-7a00b5` (pid 44269) — ended without `dispatch-live/` manifest |
| Full re-run swarm | `swarm-mqzwtxwu-96b1ac` |
| Converged | `true` (`forced-stop:marginal-value-cutoff`, 2 rounds, blocking=7) |
| Key labels | `02R1_GOVERNANCE_TESTS_X_PASS_COMMITTED`, `01V1_GOVERNANCE_VERIFY_X_PASS_COMMITTED` |
| mlpFeedback | `persisted: true`, `count: 3`, `advisory: false` |
| Per-stream train | epochs=2, examples=17, preError=0.471 → meanError=0.297 |

## Full company-ops dispatch streams

| Workstream | Status | Swarm | Converged | mlp persisted | mlp count |
|---|---|---|---|---|---|
| WS-A governance | applied | swarm-mqzwtxwu-96b1ac | true | true | 3 |
| WS-B fleet | applied | swarm-mqzx7syr-fb29ca | true | true | 6 |
| WS-F router | applied | swarm-mr02nswk-96f713 | true | true | 2 |
| WS-C visual | applied | swarm-mr05nv52-12a841 | true | true | 5 |
| WS-D knowledge | applied | swarm-mr0821g2-2b7fee | true | true | 3 |
| WS-G cline-pass | applied | swarm-mr0a728v-67d3f1 | true | true | 4 |

- **errors:** 0  
- **skipped:** 0  
- **release tail:** not included (`--include-release` omitted per WS-A partial-green policy)

Notable labels (sample): `02B1_OLLAMA_SIDECAR_X_PASS_COMMITTED`, `02B2_RUNFLEET_HOOK_X_PASS_COMMITTED`, `02B6_FLEET_VERIFY_X_PASS_COMMITTED`, `02C1_DASHBOARD_DRILLDOWN_X_PASS_COMMITTED`.

All swarms finalized via `forced-stop:marginal-value-cutoff` with residual blocking leaves (owner-gated / held subtasks).

## Post-dispatch train

```
node _SYSTEM/Scripts/train-fleet-router-from-ledger.mjs --epochs=2
Found 57 trainable examples. epochs=2 lr=0.015
epoch 1/2  mean|err|=0.0995
epoch 2/2  mean|err|=0.0955
Weights updated and saved.
Pre-training neutral error ~0.491 (baseline).
```

## Capability scan

```
node _SYSTEM/Scripts/capability-scan.mjs --check
OK: capability registry current (224 capabilities).
```

## Top residual risks / failures

1. Original WS-A live run wrote no `dispatch-live/` manifest (terminal truncated; evidence from full re-run).
2. All MLP outcome records report `success: 0` (substrate prediction misses on native-routed leaves e.g. WS-A-R1, WS-C-E1, WS-G-R1).
3. Swarm forced-stop with blocking leaves remains (steward/oracle held, WS-G 1 held ruling).
4. No `--include-release` tail — release workstream not exercised.

## RESULT_LABEL

`07L1_LIVE_APPLY_X_PASS_COMMITTED`
