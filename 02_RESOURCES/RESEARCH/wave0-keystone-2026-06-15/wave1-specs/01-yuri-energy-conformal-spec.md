# Wave-1 Spec: `yuri-energy-conformal.mjs` — Conformal C-Layer

> Build-spec for the GVF's explicitly-missing Energy C-layer (S4). Shadow-only: Platt/isotonic `pReject` + Mondrian conformal coverage. Reuses existing `conformalQuantile` from `eval-processing.mjs:195`.

## Target Path

`_SYSTEM/Scripts/math/yuri-energy-conformal.mjs`

## Ground Truth (read from real files)

- **`eval-processing.mjs:195`** — `conformalQuantile(calibScores, alpha = 0.1)`: returns the ⌈(n+1)(1-α)⌉-th order statistic of calibration nonconformity scores. Finite-sample guarantee: empirical miscoverage ≤ α. Already tested (`eval-processing.test.mjs:101`).
- **`yuri-energy.mjs:617`** — `computeU(state, weights)`: scalar potential, 12-term weighted composite. Returns `{ U, components, warnings }`.
- **`yuri-energy.mjs:766`** — `gateProposal({ stateBefore, stateAfter, threshold, weights, ... })`: Lyapunov gate. Returns `{ decision, deltaU, ... }`. The gate's `decision` is the binary verdict (accept/reject).
- **`yuri-energy.mjs`** — `DEFAULT_WEIGHTS` (12 named weights, hand-tuned). The gate has NO calibration layer — `pReject` is the raw `deltaU > threshold` comparison.
- **`energy-outcome-deriver.mjs`** — `calibrate()`: Brier report over the shadow ledger. Exists but is a post-hoc scorer, not a conformal C-layer.
- **`prediction-ledger.mjs`** — `calibrationReport()`: Brier + per-bucket calibration. Also post-hoc.

## Interface

```js
// yuri-energy-conformal.mjs — Conformal C-layer for the energy gate
// Shadow-only: NEVER writes the live gate. DISARMED by default.

import { conformalQuantile } from '../eval-processing.mjs';

/**
 * Platt-scaled pReject: sigmoid(a * |deltaU| + b).
 * Fits a,b via MLE over (|deltaU|, label) pairs from the shadow ledger.
 * Returns { pReject(deltaU), a, b, converged }.
 * SHADOW-ONLY: does NOT modify gateProposal.
 */
export function plattCalibrate(labeledPairs)  // [{ deltaU, label }] -> { a, b, pReject(deltaU) }

/**
 * Isotonic-regression pReject: monotone step function over |deltaU| bins.
 * Fits via PAV (pool-adjacent-violators) over the shadow ledger.
 * Returns { pReject(deltaU), bins, nViolations }.
 * SHADOW-ONLY.
 */
export function isotonicCalibrate(labeledPairs)  // -> { pReject, bins }

/**
 * Mondrian conformal coverage: partition the calibration set by regime/event/weightHash,
 * compute per-cell conformalQuantile, report per-cell coverage.
 * Returns { cells: [{ regime, qhat, nCalib, coverage }], overallQhat }.
 * SHADOW-ONLY.
 */
export function mondrianCoverage(labeledPairs, opts)  // opts.cellFn(pair) -> cellKey

/**
 * Conformal prediction set: given a new firing's |deltaU| and the Mondrian qhat for its cell,
 * return { covers: |deltaU| <= qhat, pValue, setSize }.
 * SHADOW-ONLY — never feeds gateProposal.
 */
export function conformalPrediction(deltaU, cellQhat)

/**
 * Full C-layer report: run Platt + isotonic + Mondrian over the shadow ledger,
 * emit comparison + corpus-size warning when n < 500.
 * SHADOW-ONLY.
 */
export function cLayerReport(opts)  // -> { platt, isotonic, mondrian, corpusWarning }
```

## Dependencies

| Dep | Path | Why |
|---|---|---|
| `conformalQuantile` | `eval-processing.mjs:195` | Core conformal quantile — already shipped, tested |
| `computeU` | `yuri-energy.mjs:617` | Source of `|deltaU|` values |
| `readFirings` | `energy-outcome-deriver.mjs` | Read trace firings for calibration |
| `calibrate` | `energy-outcome-deriver.mjs` | Existing Brier report (complement, not replacement) |
| `recordPrediction` | `prediction-ledger.mjs` | Record conformal forecasts (shadow only) |

## DISARMED Contract

- **NO import or call site inside `gateProposal` or `computeU`.** The C-layer is a standalone analysis module.
- **NO write to `_SYSTEM/state/prediction-ledger.jsonl`.** Shadow output only: `_SYSTEM/state/energy-conformal-shadow.jsonl`.
- **NO cron, NO launchd, NO live wiring.** Arming (inserting `pReject` into the gate's decision rule) is OWNER-GATED.
- **Corpus-size gate:** `conformalQuantile` requires n ≥ 500 for finite-sample guarantee. The C-layer report MUST emit a `corpusWarning` when n < 500 (Wave-3 corpus power analysis decides whether conformal is viable today).

## Test Plan

File: `_SYSTEM/Scripts/math/yuri-energy-conformal.test.mjs`

1. **Platt calibration on synthetic data:** generate 1000 pairs with known logistic relationship → recover a,b within 5%.
2. **Isotonic calibration on synthetic data:** monotone step function → PAV recovers bins within 1% RMSE.
3. **Mondrian coverage guarantee:** partition synthetic data by regime, compute per-cell qhat → empirical miscoverage ≤ α per cell (finite-sample).
4. **Corpus-size warning:** n=50 → `corpusWarning` emitted; n=500 → no warning.
5. **Shadow-only invariant:** no file write outside `_SYSTEM/state/energy-conformal-shadow.jsonl`.
6. **Regression against `conformalQuantile`:** Mondrian cell qhat matches direct call to `conformalQuantile(calibScores, alpha)` for each cell.

## Ordered-Roadmap Note

Wave-1 builds the C-layer as a standalone analysis module. Wave-2 runs the corpus power analysis (exact in-era v3 reject count ~94 vs conformal's 500+ minimum) to decide whether conformal is viable today. Wave-3 wires `pReject` into `gateProposal` as an optional override (owner-gated). The identity-leak red-team (Wave-2) MUST run before any live wiring: fit Platt on (U → gate's own verdict) and confirm it hits ~100% (worthless) — guards against calibrating the gate to itself.
