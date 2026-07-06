# Wave-1 Spec: `verifierBestOfN` — computeU over N Proposals

> Build-spec for S6: the cheapest path to "test-time compute" — spend cycles on verification, not model size. `computeU` over N proposals → pick the survivor.

## Target Path

`_SYSTEM/Scripts/verifier-best-of-n.mjs`

## Ground Truth (read from real files)

- **`yuri-energy.mjs:617`** — `computeU(state, weights)`: scalar potential over a YURI control-plane state snapshot. Returns `{ U, components, warnings }`. 12-term weighted composite. Lower U = better state.
- **`yuri-energy.mjs:728`** — `computeDeltaU(stateBefore, stateAfter)`: `computeU(after) - computeU(before)`. Positive ΔU = state got worse.
- **`yuri-energy.mjs:766`** — `gateProposal({ stateBefore, stateAfter, ... })`: Lyapunov gate. Returns `{ decision, deltaU, veto, ... }`. Three hard vetoes.
- **`claim-cortex.mjs:769`** — `cortexSnapshot(claims, opts)`: claim ledger → `computeU`-shaped state. The bridge between claims and energy.
- **`claim-cortex.mjs:942`** — `gateClaimTransition(claimsBefore, claimsAfter, opts)`: ΔU over a claim transition.
- **`energy-outcome-deriver.mjs`** — `calibrate()`: Brier report. The verifier's own calibration can be used to score `verifierBestOfN`'s picks post-hoc.
- **`prediction-ledger.mjs`** — `recordPrediction`, `recordOutcome`, `calibrationReport`: the learn-loop store. `verifierBestOfN` records its picks as predictions for later scoring.
- **`gate-rerank.mjs`** (spec 02) — The generate-then-verify driver. `verifierBestOfN` is the simpler, cheaper subset: no claim extraction, no cortex snapshot — just `computeU` over raw state snapshots.

## Interface

```js
// verifier-best-of-n.mjs — computeU over N proposals → pick the survivor
// The cheapest path to test-time compute: spend cycles on verification, not model size.

import { computeU, computeDeltaU, gateProposal, DEFAULT_WEIGHTS } from './math/yuri-energy.mjs';
import { recordPrediction } from './prediction-ledger.mjs';

/**
 * Best-of-N: computeU over each candidate's proposed state, pick the one with
 * the LOWEST U (best state). Returns the winner + full ranking.
 * This is the PURE form: no claim extraction, no cortex snapshot.
 * Candidates are raw state snapshots in computeU's input shape.
 */
export function verifierBestOfN(candidates, opts = {})  // -> { winner, deltaU, ranking: [{ id, U, deltaU }], nAccepted, nRejected }

/**
 * Best-of-N with gate: for each candidate, compute gateProposal over the
 * transition from currentState to candidateState. Accept only candidates
 * that clear ALL 3 hard vetoes. Pick the lowest-ΔU among accepted.
 * This is the GATED form: uses the full gate, not just computeU.
 */
export function verifierBestOfNGated(candidates, currentState, opts = {})  // -> { winner, deltaU, veto, ranking }

/**
 * Best-of-N over peer-lane outputs: each output is a candidate state.
 * Same as verifierBestOfN but accepts an array of { lane, state } pairs.
 */
export function verifierBestOfNPeers(peerStates, opts = {})  // -> { winner, perLane: [{ lane, U, deltaU }] }

/**
 * Record the verifier's pick as a prediction for later scoring.
 * Uses prediction-ledger.recordPrediction (shadow ledger only).
 */
export function recordVerifierPrediction(winner, candidates, opts = {})  // -> { predictionId }

/**
 * Score the verifier's historical picks against known outcomes.
 * Uses prediction-ledger.calibrationReport.
 * Returns Brier + per-bucket calibration.
 */
export function scoreVerifierHistory(opts = {})  // -> { brier, ece, nPicks, calibrationReport }
```

### State Shape

Candidates are objects in `computeU`'s input shape:

```js
{
  claimPromotionDistribution: [0.3, 0.4, 0.2, 0.1],  // α term
  claimed: [0.8, 0.2],                                 // β term (Wasserstein1)
  verified: [0.6, 0.4],
  predictions: [0.7, 0.3],                             // γ term (logLoss)
  outcomes: [1, 0],
  forecasts: [0.7, 0.3],                               // δ term (brierScore)
  results: [1, 0],
  prior: [0.5, 0.5],                                   // ε term (infoGain)
  posterior: [0.7, 0.3],
  evidence: [{ capturedAt: Date.now() - 86400000 }],   // ζ term (staleness)
  protectedPathViolations: 0,                           // η term
  promotionLadderInversions: 0,                         // θ term
  verifiedEvidenceCount: 5,                             // ι term
  repeatedFailureCount: 0,                              // κ term
  malformedForecastCount: 0,                            // λ term
  claimedConcentration: 0.8,                            // μ term (overconfidenceDrift)
}
```

## Dependencies

| Dep | Path | Why |
|---|---|---|
| `computeU` | `yuri-energy.mjs:617` | Core verifier — scalar potential |
| `computeDeltaU` | `yuri-energy.mjs:728` | ΔU for gated form |
| `gateProposal` | `yuri-energy.mjs:766` | Full gate for gated form |
| `DEFAULT_WEIGHTS` | `yuri-energy.mjs` | Gate weights |
| `recordPrediction` | `prediction-ledger.mjs` | Record picks for later scoring |
| `calibrationReport` | `prediction-ledger.mjs` | Score historical picks |

## DISARMED Contract

- **NO modification to `computeU`, `gateProposal`, or `llm-lane.mjs`.** `verifier-best-of-n.mjs` is a standalone consumer.
- **NO live wiring into dispatch.** The verifier is callable but not called by any hot path.
- **NO write to the live prediction ledger.** `recordVerifierPrediction` writes to the shadow ledger only (`_SYSTEM/state/verifier-shadow.jsonl`).
- **Arming** (inserting verifierBestOfN into `llm-lane.mjs` dispatch as a post-processing step) is OWNER-GATED.

## Test Plan

File: `_SYSTEM/Scripts/verifier-best-of-n.test.mjs`

1. **Happy path:** 3 candidates with known U values → winner is the lowest-U.
2. **Gated form:** 3 candidates, 1 fails protected-path veto → excluded; winner picked from remaining.
3. **Tiebreak:** 2 candidates with equal U → pick first (deterministic).
4. **Empty candidates:** returns `{ winner: null, nAccepted: 0 }`.
5. **Peer form:** 2 peer states, one lower-U → that lane wins.
6. **Prediction recording:** `recordVerifierPrediction` writes to shadow file; `scoreVerifierHistory` returns valid Brier.
7. **Regression:** `verifierBestOfN` with a single candidate returns that candidate as winner.
8. **Edge case:** candidate with missing fields → `computeU` handles via skipped components (returns finite U, not NaN).

## Ordered-Roadmap Note

Wave-1 builds the verifier as a standalone module. This is the CHEAPEST Wave-1 item: it's a thin wrapper around `computeU` with no new algorithms. Wave-2 adds the prediction-ledger scoring loop (auto-score historical picks). Wave-3 wires verifierBestOfN into `llm-lane.mjs` dispatch as an optional post-processing step (owner-gated). The verifier is also the foundation for the future SLM PRM: the 7B model distills the process-energy into a PRM that mimics `computeU`'s scoring, then `verifierBestOfN` uses the PRM instead of the full gate for cheaper test-time compute.
