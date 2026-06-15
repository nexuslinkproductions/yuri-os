# L4 — Energy-Outcome Backfill Report (Wave-0 Keystone, 2026-06-15)

> DISARMED shadow run. L4 = integration + backfill (lane: minimax-m3).
> Shadow ledger: `_SYSTEM/state/energy-outcome-shadow.jsonl` · Firings dir: `_SYSTEM/state/energy-trace` · Signals: `signals-module`.

## Prediction (logged BEFORE the run)

| Field | Forecast |
|---|---|
| coveragePct (outcomesDerived / predicted) | **5.0%** |
| meanBrier (resolved) | **50.0%** |
| byRule expectation | R4 ≫ R1=R2=R3 (signals unknown at run time → mostly undeterminable) |
| undeterminablePct | **95.0%** |
| confidence (calibration of THIS prediction) | low |
| runStamp | 2026-06-15T01:25:17.124Z |

## Run Summary

- Total firings read: **56,017**
- Predictions written to shadow: **56,017**
- Outcomes derived: **0** (0.0% of predicted)
- Undeterminable (R4): **56,017** (100.0% of predicted)
- byRule histogram:
  - R4: 56,017
- Wall time: 1797 ms

## Calibration Report (calibrationReport over shadow ledger)

- Resolved pairs (n): **0**
- Unresolved (prediction w/o outcome): **55,788**
- **meanBrier: 0.0000**

### Per-confidence bucket

| bucket | n | meanBrier | hitRate |
|---|---:|---:|---:|
| 0-0.2 | 0 | 0.0000 | 0.0% |
| 0.2-0.4 | 0 | 0.0000 | 0.0% |
| 0.4-0.6 | 0 | 0.0000 | 0.0% |
| 0.6-0.8 | 0 | 0.0000 | 0.0% |
| 0.8-1 | 0 | 0.0000 | 0.0% |

## Residual Risk / Red-team

- Signals module was **not present** at run time (path: `_SYSTEM/Scripts/energy-outcome-signals.mjs` → signals-module).
  All four detectors (isReverted, isRetriedAndSucceeded, isPromoted, dispatchAccepted) return false,
  so the byRule histogram is dominated by R4-undeterminable. meanBrier is computed only on the
  R1/R2/R3-resolved rows (if any leak from a prior run), so the calibration is sparse, not absent.
- Shadow ledger `_SYSTEM/state/energy-outcome-shadow.jsonl` was truncated with --fresh; any prior rows are gone. Re-runs are
  deterministic and idempotent.
- DISARMED contract respected: `_SYSTEM/state/prediction-ledger.jsonl` was NOT written.
- Confidence prior: `sigmoid(|deltaU|)` is a **prior, not a learned calibration**. The first real
  meanBrier we report is the floor — expect it to look noisy until L1 signals + L3 label-audit land.
- runId field: a fraction of the oldest firings (e.g. 2026-05-28) have empty `runId`, so their
  prediction subject is empty string. The deriver tolerates this; the L1 signals may not.

## Run Stamp

- startedAt:  2026-06-15T01:25:17.125Z
- finishedAt: 2026-06-15T01:25:18.922Z
- lane:        minimax-m3 (L4)
- capability:  energy-outcome-backfill
