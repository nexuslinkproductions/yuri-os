# Wave-1 Spec: `gate-rerank.mjs` — Generate-Then-Verify Driver

> Build-spec for the canonical RLVR pattern applied to YURI's OWN actions + peer-lane outputs (S3). N candidates → `extractClaims→cortexSnapshot→gateProposal` → accept argmin-ΔU clearing all 3 hard vetoes.

## Target Path

`_SYSTEM/Scripts/gate-rerank.mjs`

## Ground Truth (read from real files)

- **`yuri-energy.mjs:766`** — `gateProposal({ stateBefore, stateAfter, threshold, weights, maxLadderInversionCap, allowOverride })`: returns `{ decision, deltaU, veto, ... }`. Three hard vetoes: (1) `deltaU > threshold`, (2) `protectedPathViolations > 0` (η=100), (3) `maxLadderInversion > maxLadderInversionCap` (L∞ floor). `allowOverride` bypasses the deltaU check but NOT the vetoes.
- **`yuri-energy.mjs:617`** — `computeU(state, weights)`: scalar potential. `computeDeltaU(stateBefore, stateAfter)` = `computeU(after) - computeU(before)`.
- **`claim-cortex.mjs:769`** — `cortexSnapshot(claims, opts)`: aggregates a claim ledger into a `computeU`-shaped state snapshot. Returns `{ state, assessments, liveClaims }`.
- **`claim-cortex.mjs:942`** — `gateClaimTransition(claimsBefore, claimsAfter, opts)`: computes ΔU over a claim transition. Returns `{ deltaU, decision, ... }`.
- **`prose-claim-extractor.mjs`** — `extractClaims(prose)`: reads written prose, extracts structured claims, maps to ladder rungs. Returns `[{ target, claimType, claimedStatus, evidence, ... }]`. ADVISORY mode (shadow ledger only).
- **`yuri-energy.mjs:98`** — `DEFAULT_MAX_LADDER_INVERSION_CAP = 1`: a single honest VERIFY-FIRST inversion is workflow; ≥2 rungs is laundering and vetoes.
- **`yuri-energy.mjs:51-56`** — `maybeTraceGateVerdict`: the existing fail-open trace seam. `gate-rerank.mjs` reuses this pattern for its own trace.

## Interface

```js
// gate-rerank.mjs — Generate-Then-Verify Rerank Driver
// N candidates → extractClaims → cortexSnapshot → gateProposal → accept argmin-ΔU clearing all 3 hard vetoes.

import { gateProposal, computeU, DEFAULT_WEIGHTS } from './math/yuri-energy.mjs';
import { cortexSnapshot } from './claim-cortex.mjs';
import { extractClaims } from './prose-claim-extractor.mjs';

/**
 * Rerank N candidate proposals by energy-gate verdict.
 * For each candidate:
 *   1. extractClaims(candidate.prose) -> claims array
 *   2. cortexSnapshot(claims, { nowMs }) -> state snapshot
 *   3. gateProposal({ stateBefore: currentState, stateAfter: candidateState, ... }) -> { decision, deltaU, veto }
 * Accept the candidate with the LOWEST deltaU that clears ALL 3 hard vetoes.
 * If NO candidate clears all vetoes, return { decision: 'all_rejected', fallback: bestOfRejected }.
 */
export function rerankCandidates(candidates, currentState, opts = {})  // -> { winner, deltaU, veto, runnerUp, nAccepted, nRejected }

/**
 * Rerank peer-lane outputs: each output is a candidate.
 * Same pipeline but extracts claims from the lane's prose output.
 */
export function rerankPeerOutputs(peerOutputs, currentState, opts = {})  // -> { winner, perLane: [{ lane, deltaU, veto }] }

/**
 * Best-of-N via computeU only (no claim extraction — for raw proposals).
 * computeU over each candidate's proposed state, pick min-U.
 */
export function bestOfN(candidates, currentState, opts = {})  // -> { winner, deltaU, ranking: [{ id, deltaU }] }

/**
 * Trace seam: opt-in, fail-open capture of each rerank verdict.
 * Mirrors maybeTraceGateVerdict pattern from yuri-energy-gate-trace.mjs.
 */
export function maybeTraceRerankVerdict(verdict)  // NO-OP unless YURI_RERANK_TRACE is set
```

## Dependencies

| Dep | Path | Why |
|---|---|---|
| `gateProposal` | `yuri-energy.mjs:766` | The verifier — 3 hard vetoes |
| `computeU` | `yuri-energy.mjs:617` | Scalar potential for best-of-N |
| `cortexSnapshot` | `claim-cortex.mjs:769` | Claims → energy state |
| `extractClaims` | `prose-claim-extractor.mjs` | Prose → structured claims |
| `DEFAULT_WEIGHTS` | `yuri-energy.mjs` | Gate weights |
| `maybeTraceGateVerdict` | `yuri-energy-gate-trace.mjs` | Pattern reference for trace seam |

## DISARMED Contract

- **NO modification to `gateProposal`, `computeU`, or `llm-lane.mjs`.** `gate-rerank.mjs` is a standalone consumer.
- **NO live wiring into dispatch.** The reranker is callable but not called by any hot path.
- **NO write to the live prediction ledger.** Shadow trace only (`YURI_RERANK_TRACE` env gate).
- **`extractClaims` is ADVISORY** (shadow ledger only per `prose-claim-extractor.mjs` contract). Rerank uses it for scoring, not for enforcement.
- **Arming** (inserting rerank into `llm-lane.mjs` dispatch or `gateProposal` override) is OWNER-GATED.

## Test Plan

File: `_SYSTEM/Scripts/gate-rerank.test.mjs`

1. **Happy path:** 3 candidates, 1 clears all vetoes with lowest ΔU → winner selected.
2. **All rejected:** 3 candidates, all fail at least one veto → `all_rejected` with fallback.
3. **Veto diversity:** candidate A fails ΔU threshold, B fails L∞ cap, C fails protected-path → all rejected.
4. **Tiebreak:** 2 candidates with equal ΔU → pick first (deterministic).
5. **Empty candidates:** returns `{ winner: null, nAccepted: 0 }`.
6. **Peer rerank:** 2 peer outputs, one extracts to a lower-ΔU claim set → that lane wins.
7. **Trace seam:** `YURI_RERANK_TRACE` unset → no file written; set → trace written to `_SYSTEM/state/rerank-trace.jsonl`.
8. **Regression:** `rerankCandidates` with known-good candidate matches `gateProposal` called directly.

## Ordered-Roadmap Note

Wave-1 builds the reranker as a standalone module. Wave-2 adds grammar-constrain for locally-served lane output to the claim-cortex schema (XGrammar/Pre³ pattern). Wave-3 wires rerank into `llm-lane.mjs` dispatch as an optional post-processing step (owner-gated). The identity-leak red-team (Wave-2) MUST run first: verify that reranking by `gateProposal` doesn't just select the candidate that best matches the gate's own bias.
