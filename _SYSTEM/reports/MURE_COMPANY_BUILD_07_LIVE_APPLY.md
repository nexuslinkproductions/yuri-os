# MURE Company Build 07 — Live Apply Report

**Generated:** 2026-06-30 (local)  
**Operator context:** WS-A pre-live apply completed (`swarm-mqzvywo8-7a00b5`). Full company pipeline authorized with `--apply --mlp-learn --ollama-sidecar --cline-sidecar`.

## Commands

### 1) Company dispatch (live)

```bash
node _SYSTEM/mure/company-dispatch.mjs --apply --mlp-learn --ollama-sidecar --cline-sidecar --out _SYSTEM/lane-output/dispatch-live-full
```

**Exit code:** `0`  
**Elapsed:** ~19,897,577 ms (~5h 31m)  
**Dispatch runId:** `dispatch-mqzx904o`  
**Manifest:** `_SYSTEM/lane-output/dispatch-live-full/dispatch-mqzx904o/manifest.json`

#### Stdout (swarm rounds + final JSON tail)

```
[runSwarm swarm-mqzx904v-e93aca] round 0: dispatch 2 leaf(s) → WS-A-R2-governance-tests, WS-A-V1-adjudicator-verify
[runSwarm swarm-mqzx904v-e93aca] round 0: blocked (blocking=7)
[runSwarm swarm-mqzx904v-e93aca] round 1: dispatch 2 leaf(s) → WS-A-R2-governance-tests, WS-A-V1-adjudicator-verify
[runSwarm swarm-mqzx904v-e93aca] round 1: forced-stop:marginal-value-cutoff (blocking=2)
[runSwarm swarm-mqzxmv98-4378bd] round 0: dispatch 6 leaf(s) → WS-B-R1-ollama-sidecar, WS-B-R2-runfleet-hook, WS-B-R3-mlp-feedback, WS-B-A1-architect-contract, WS-B-D1-deliberator-review, WS-B-V1-adjudicator-verify
[runSwarm swarm-mqzxmv98-4378bd] round 0: blocked (blocking=6)
[runSwarm swarm-mqzxmv98-4378bd] round 1: dispatch 6 leaf(s) → WS-B-R1-ollama-sidecar, WS-B-R2-runfleet-hook, WS-B-R3-mlp-feedback, WS-B-A1-architect-contract, WS-B-D1-deliberator-review, WS-B-V1-adjudicator-verify
[runSwarm swarm-mqzxmv98-4378bd] round 1: forced-stop:marginal-value-cutoff (blocking=6)
[runSwarm swarm-mr01ad62-40e3ba] round 0: dispatch 2 leaf(s) → WS-F-R1-mlp-stub, WS-F-D1-deliberator-policy
[runSwarm swarm-mr01ad62-40e3ba] round 0: blocked (blocking=2)
[runSwarm swarm-mr01ad62-40e3ba] round 1: dispatch 2 leaf(s) → WS-F-R1-mlp-stub, WS-F-D1-deliberator-policy
[runSwarm swarm-mr01ad62-40e3ba] round 1: forced-stop:marginal-value-cutoff (blocking=2)
[runSwarm swarm-mr04afi6-7a7f31] round 0: dispatch 4 leaf(s) → WS-C-R1-dashboard-drilldown, WS-C-R2-trends-charts, WS-C-H1-held-queue-stub, WS-C-C1-chronicler-docs
[runSwarm swarm-mr04afi6-7a7f31] round 0: blocked (blocking=4)
[runSwarm swarm-mr04afi6-7a7f31] round 1: dispatch 4 leaf(s) → WS-C-R1-dashboard-drilldown, WS-C-R2-trends-charts, WS-C-H1-held-queue-stub, WS-C-C1-chronicler-docs
[runSwarm swarm-mr04afi6-7a7f31] round 1: forced-stop:marginal-value-cutoff (blocking=4)
[runSwarm swarm-mr05rosz-f5d894] round 0: dispatch 3 leaf(s) → WS-D-S1-synthesist-doctrine, WS-D-I1-ideator-gaps, WS-D-C1-chronicler-runbook
[runSwarm swarm-mr05rosz-f5d894] round 0: blocked (blocking=3)
[runSwarm swarm-mr05rosz-f5d894] round 1: dispatch 3 leaf(s) → WS-D-S1-synthesist-doctrine, WS-D-I1-ideator-gaps, WS-D-C1-chronicler-runbook
[runSwarm swarm-mr05rosz-f5d894] round 1: forced-stop:marginal-value-cutoff (blocking=3)
[runSwarm swarm-mr065t4p-3f200c] round 0: dispatch 3 leaf(s) → WS-G-A1-architect-map, WS-G-K1-mlp-encode, WS-G-V1-adjudicator-verify
[runSwarm swarm-mr065t4p-3f200c] round 0: blocked (blocking=3)
[runSwarm swarm-mr065t4p-3f200c] round 1: dispatch 3 leaf(s) → WS-G-A1-architect-map, WS-G-K1-mlp-encode, WS-G-V1-adjudicator-verify
[runSwarm swarm-mr065t4p-3f200c] round 1: forced-stop:marginal-value-cutoff (blocking=3)
```

Final manifest summary: `dryRun=false`, `mureArmed=true`, `skipped=[]`, `errors=[]`.

### 2) Fleet router training

```bash
node _SYSTEM/Scripts/train-fleet-router-from-ledger.mjs --epochs=2
```

**Exit code:** `0`

```
Found 50 trainable examples. epochs=2 lr=0.015 
epoch 1/2  mean|err|=0.1093
epoch 2/2  mean|err|=0.1053
Weights updated and saved.
Pre-training neutral error ~0.490 (baseline). Training run complete.
```

## Streams applied / skipped

| Workstream | Status | Swarm ID | MLP persist (count) | Notes |
|------------|--------|----------|----------------------|-------|
| WS-A governance | **applied** | `swarm-mqzx904v-e93aca` | yes / **3** | `clearedHeld=1`; prior owner WS-A live: `swarm-mqzvywo8-7a00b5` |
| WS-B fleet | **applied** | `swarm-mqzxmv98-4378bd` | yes / **6** | ollama-sidecar path in plan |
| WS-F router | **applied** | `swarm-mr01ad62-40e3ba` | yes / **2** | |
| WS-C visual | **applied** | `swarm-mr04afi6-7a7f31` | yes / **5** | visual gate satisfied (`recap-fb61bca8b66d4ba8`) |
| WS-D knowledge | **applied** | `swarm-mr05rosz-f5d894` | yes / **3** | |
| WS-G Cline pass | **applied** | `swarm-mr065t4p-3f200c` | yes / **4** | `clearedHeld=1` (steward gate ruling) |

**Skipped:** none  
**Dispatch errors:** none  
**Total MLP feedback rows persisted (dispatch manifest):** 23 (`advisory: false` on all streams)

Apply artifacts under `_SYSTEM/lane-output/dispatch-live-full/`:

- `mure-buildout-ws-a-governance-apply.json`
- `mure-buildout-ws-b-fleet-apply.json`
- `mure-buildout-ws-f-router-apply.json`
- `mure-buildout-ws-c-visual-apply.json`
- `mure-buildout-ws-d-knowledge-apply.json`
- `mure-buildout-ws-g-cline-pass-apply.json`

## Cline / evolver / MLP arm status

| Flag file | Status |
|-----------|--------|
| `_SYSTEM/state/cline-fleet.enabled` | **ARMED** |
| `_SYSTEM/state/evolver.enabled` | **ARMED** |
| `_SYSTEM/state/mlp-learn.enabled` | **ARMED** |

Held rulings source: `02_RESOURCES/TASKS/mure-held-rulings-owner-lock.json` (owner ratified 2026-06-30; Cline + evolver arming approved; `finalize:true`, `governance.mjs` edits, and git push remain blocked without separate ceremony).

## Held / blocked workstreams

- **No workstream skipped or manifest-blocked** (`blockingHeld=0`, `blocked=false` on all six streams).
- **Swarm-level blocking:** every swarm logged `round 0: blocked` then `round 1: forced-stop:marginal-value-cutoff` with residual `blocking=N` (2–7). All swarms still report `converged: true` in the manifest.
- **Owner lock still holds** release-tail / ceremony items (e.g. `P8-H1-helmsman-finalize`, `finalize:true`) — not part of this company-ops dispatch tail.

## Residual risks

1. **Marginal-value cutoff** stopped second rounds with remaining blocking counts; verify leaf RESULT_LABELs and adjudicator outcomes in per-swarm job dirs before treating artifacts as release-grade.
2. **Long runtime (~5.5h)** — parallel `company-dispatch` from another session was observed during the run; confirm no output dir races if re-running concurrently.
3. **Cline / ollama sidecars** armed at plan level; default DISARMED spawn behavior must stay enforced until explicit owner spawn.
4. **MLP weights** updated from ledger (50 examples); router quality not independently validated on held-out tasks in this pass.
5. **No git commit/push** performed (per instruction).

## Failures

None — both authorized commands exited `0`.
