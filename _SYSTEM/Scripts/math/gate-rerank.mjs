#!/usr/bin/env node
// @capability: gate-rerank-driver
// @serves: rerank | best of N | generate then verify | argmin delta U | candidate selection | hard veto | peer lane rerank | RLVR S3
// @does: N candidate proposals -> extractClaims -> cortexSnapshot -> gateProposal -> accept the argmin-deltaU candidate that clears all 3 hard vetoes (protectedPathVeto, structuralFloorVeto, maxSeverityVeto). Standalone, DISARMED, no live wiring. Pure selection.
// @use: Reach for this when a YURI control-plane decision has multiple candidate outputs (model rerank, peer-lane fan-in, ablation picks) and the energy gate should pick the best-of-N. Reuses gateProposal as the verdict oracle, so any future gate core change propagates here without re-implementation.
// @exports: rerankCandidates, rerankPeerOutputs, bestOfN, maybeTraceRerankVerdict
/**
 * gate-rerank.mjs — Generate-Then-Verify Rerank Driver (S3, Wave-1)
 *
 * Pipeline per candidate:
 *   1. extractClaims(candidate.prose) -> claims array (advisory shadow)
 *   2. cortexSnapshot(claims, { nowMs }) -> computeU-shaped state snapshot
 *   3. gateProposal({ stateBefore, stateAfter, ... }) -> { accept, deltaU, veto family }
 * Accept the candidate with the LOWEST deltaU that clears ALL 3 hard vetoes
 * (protectedPathVeto, structuralFloorVeto, maxSeverityVeto). If NO candidate
 * clears all vetoes, return { decision: 'all_rejected', fallback: bestOfRejected }.
 *
 * DISARMED contract (Wave-1, owner-asleep build):
 *   - NO modification to gateProposal, computeU, cortexSnapshot, llm-lane.
 *   - NO live wiring into dispatch. Callable but not called by any hot path.
 *   - NO write to the live prediction ledger. Shadow trace only via
 *     YURI_RERANK_TRACE env gate (fail-open, opt-in).
 *   - extractClaims is ADVISORY (shadow ledger contract). Rerank uses it for
 *     scoring, not for enforcement.
 *   - Arming (wiring rerank into llm-lane.mjs dispatch or live override) is
 *     OWNER-GATED.
 *
 * Hard vetoes (all THREE must be false for accept=true; the reranker mirrors
 * this by treating accept=true as the unique "clears all vetoes" signal):
 *   1. protectedPathVeto       — catastrophic, non-offsettable (eta=100)
 *   2. structuralFloorVeto     — ladder inversion non-offsettable (theta=10)
 *   3. maxSeverityVeto         — L∞ max-severity floor (absolute depth, when cap armed)
 *
 * Identity veto (gateClaimTransition) is intentionally NOT consumed here: that
 * gate requires a claimsBefore/claimsAfter pair and is the identity-axis veto;
 * the reranker's axis is BEST-OF-N over fresh proposals, so the identity veto
 * belongs at the dispatch integration (Wave-3, owner-gated) and the per-claim
 * shape lives at the ledger layer. Composing the identity veto here would
 * require callers to fabricate a before-state per candidate, which is exactly
 * the kind of speculation this driver avoids.
 *
 * Determinism: no Date.now() in the core. nowMs is required explicitly; trace
 * I/O uses an injected tracePath (defaults to a stable relative path) and the
 * env-gated seam is fail-open.
 *
 * Related:
 *   - _SYSTEM/Scripts/math/yuri-energy.mjs         (gateProposal, computeU)
 *   - _SYSTEM/Scripts/claim-cortex.mjs             (cortexSnapshot, gateClaimTransition)
 *   - _SYSTEM/Scripts/prose-claim-extractor.mjs    (extractClaims, advisory)
 *   - _SYSTEM/Scripts/math/yuri-energy-gate-trace.mjs (trace pattern reference)
 *   - 02_RESOURCES/RESEARCH/wave0-keystone-2026-06-15/wave1-specs/02-gate-rerank-spec.md
 */

import {
  gateProposal,
  computeU,
  DEFAULT_WEIGHTS,
  DEFAULT_MAX_LADDER_INVERSION_CAP,
} from './yuri-energy.mjs';
import { cortexSnapshot } from '../claim-cortex.mjs';
import { extractClaims } from '../prose-claim-extractor.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RERANK_TRACE_ENV = 'YURI_RERANK_TRACE';
const RERANK_TRACE_PATH_DEFAULT = '_SYSTEM/state/rerank-trace.jsonl';
const ENERGY_PRECISION = 1e9;

// Rerank information-gain amplification (K). The reranker's axis is
// "best-of-N by info-gain", not "threshold gate." The gate's U is a composite
// (entropy + W1 + overconfidence + logLoss + brier + infoGain + credit + ...)
// designed to gate ONE transition. The reranker wants to weight the
// information-gain credit more heavily than the gate does, because the
// rerank is specifically selecting on info-gain across a candidate set.
// K=20 means the verified-evidence credit counts 20x its weight in the gate
// — enough to overcome the W1/entropy terms for a fresh-verified candidate
// while keeping the gate's veto discipline intact (vetoes are checked
// separately, not through the score). This is a design constant, not a
// learned parameter; cross-family verify (2026-06-14) confirms it preserves
// the gate's hard-veto invariant (vetoes still fire on protectedPath /
// structuralFloor / maxSeverity regardless of K).
const RERANK_INFO_GAIN_AMPLIFICATION = 20;

function roundEnergy(x) {
  if (!Number.isFinite(x)) return x;
  return Math.round(x * ENERGY_PRECISION) / ENERGY_PRECISION;
}

function requireFiniteClock(nowMs) {
  if (!Number.isFinite(Number(nowMs))) {
    throw new Error('gate-rerank requires a finite nowMs (fail-closed clock)');
  }
  return Number(nowMs);
}

// ---------------------------------------------------------------------------
// Rerank scoring
// ---------------------------------------------------------------------------

/**
 * The reranker's selection score for ONE candidate. Computed from the
 * candidate's state and the stateBefore. This is a pure function of two
 * computeU-shaped states — no claim extraction, no gate call, no side
 * effects. The score is the rerank's "info-gain delta": the raw U delta
 * plus an amplified verified-evidence credit delta. Lower is better
 * (matches the gate's "descending = better" convention).
 *
 *   score = U(after) - U(before)
 *         + K · (verifiedEvidenceCredit(after) - verifiedEvidenceCredit(before))
 *
 * where verifiedEvidenceCredit = -w.iota · log1p(min(count, 50)) per
 * yuri-energy.mjs. The amplification K makes the credit dominate the
 * selection for fresh-verified candidates whose W1 / entropy terms would
 * otherwise mask the info-gain. Hard vetoes are NOT consulted here —
 * they are checked separately via clearVetoes on the gate verdict.
 *
 * Returns { score, gateDeltaU, creditDelta, components } so the caller can
 * surface both the rerank score (for ranking) and the gate deltaU (for the
 * evaluateCandidate regression contract).
 */
export function rerankScore(stateBefore, stateAfter, opts = {}) {
  if (!stateBefore || typeof stateBefore !== 'object' || Array.isArray(stateBefore)) {
    throw new Error('rerankScore requires a stateBefore object');
  }
  if (!stateAfter || typeof stateAfter !== 'object' || Array.isArray(stateAfter)) {
    throw new Error('rerankScore requires a stateAfter object');
  }
  const weights = opts.weights || DEFAULT_WEIGHTS;
  const K = Number.isFinite(Number(opts.infoGainAmplification))
    ? Number(opts.infoGainAmplification)
    : RERANK_INFO_GAIN_AMPLIFICATION;

  const before = computeU(stateBefore, weights);
  const after = computeU(stateAfter, weights);
  // computeU returns a wrapped math-result; extract the scalar U and the
  // verifiedEvidenceCredit contribution.
  const UBefore = before.result && Number.isFinite(before.result.U) ? before.result.U : null;
  const UAfter = after.result && Number.isFinite(after.result.U) ? after.result.U : null;
  const creditBefore = before.result && before.result.contributions
    ? Number(before.result.contributions.verifiedEvidenceCredit) || 0
    : 0;
  const creditAfter = after.result && after.result.contributions
    ? Number(after.result.contributions.verifiedEvidenceCredit) || 0
    : 0;

  if (!Number.isFinite(UBefore) || !Number.isFinite(UAfter)) {
    // Fail-closed: if computeU couldn't produce finite scalars, the rerank
    // cannot rank. Return +Infinity so the candidate sorts to the end.
    return {
      score: Number.POSITIVE_INFINITY,
      gateDeltaU: Number.NaN,
      creditDelta: 0,
      UBefore: UBefore,
      UAfter: UAfter,
      creditBefore: creditBefore,
      creditAfter: creditAfter,
    };
  }
  const gateDeltaU = roundEnergy(UAfter - UBefore);
  const creditDelta = roundEnergy(creditAfter - creditBefore);
  const score = roundEnergy(gateDeltaU + K * creditDelta);
  return { score, gateDeltaU, creditDelta, UBefore, UAfter, creditBefore, creditAfter };
}

// ---------------------------------------------------------------------------
// Verdict assembly
// ---------------------------------------------------------------------------

/**
 * Decide whether a gateProposal verdict "clears all 3 hard vetoes".
 * Surfaces the veto family as a bitmask-style string for human reading.
 *   clearVetoes(v) === true  ⇔  none of the 3 veto flags are true.
 *   clearVetoes(v) === false ⇔  at least one of the 3 veto flags is true
 *                                 (the candidate must be rejected from winner
 *                                 selection regardless of deltaU).
 */
export function clearVetoes(verdict) {
  if (!verdict || typeof verdict !== 'object') return false;
  // The verdict must EXPLICITLY carry all three veto flags (own properties).
  // An object missing the flags is NOT a real gate verdict — treat as
  // fail-closed (does not clear). This prevents a typo'd or partial verdict
  // object from accidentally clearing the hard-veto discipline.
  if (!Object.hasOwn(verdict, 'protectedPathVeto')) return false;
  if (!Object.hasOwn(verdict, 'structuralFloorVeto')) return false;
  if (!Object.hasOwn(verdict, 'maxSeverityVeto')) return false;
  return !(
    verdict.protectedPathVeto === true ||
    verdict.structuralFloorVeto === true ||
    verdict.maxSeverityVeto === true
  );
}

/**
 * Run the canonical generate-then-verify pipeline against ONE candidate and
 * return the gate's verdict mapped into the reranker's input shape.
 * Public so the test can regress single-candidate behavior against gateProposal.
 */
export function evaluateCandidate(candidate, currentState, opts = {}) {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('rerank candidate must be an object with { id, prose, state? }');
  }
  const nowMs = requireFiniteClock(opts.nowMs);
  const weights = opts.weights || DEFAULT_WEIGHTS;
  const threshold = Number.isFinite(Number(opts.threshold)) ? Number(opts.threshold) : 0;
  const allowOverride = opts.allowOverride === true;
  const maxLadderInversionCap = Number.isFinite(Number(opts.maxLadderInversionCap))
    ? Number(opts.maxLadderInversionCap)
    : DEFAULT_MAX_LADDER_INVERSION_CAP;

  // Step 1: prose -> claims (ADVISORY shadow). extractClaims is shadow-only;
  // it never writes the live prediction ledger, and the reranker reads it for
  // scoring only. A candidate that omits prose (or whose prose is empty)
  // produces a zero-claim snapshot — that's an honest "no claims asserted",
  // not a fault; computeU on an empty ledger collapses to max-entropy.
  const prose = candidate.prose != null ? String(candidate.prose) : '';
  const claims = prose.length > 0
    ? extractClaims(prose, { nowMs, repoRoot: opts.repoRoot })
    : [];

  // Step 2: claims -> state snapshot. If the caller supplied a candidate.state
  // (the "raw state" path used by bestOfN), prefer it — the prose path is for
  // the reranker proper. The two paths share the SAME gate call, so the
  // hard-veto discipline is identical.
  let candidateState;
  if (candidate.state && typeof candidate.state === 'object' && !Array.isArray(candidate.state)) {
    candidateState = candidate.state;
  } else {
    const snap = cortexSnapshot(claims, { nowMs, weights });
    candidateState = {
      ...snap.state,
      maxLadderInversion: snap.maxLadderInversion,
    };
  }

  // Step 3: gateProposal is the verifier. result.delegate = the bitmask the
  // reranker reads. We DELIBERATELY use the delta-gate's accept (it already
  // implements the 3-veto family + the threshold pass + override) — we just
  // re-key on the veto family for clarity, and we never OVERRIDE the gate.
  const verdict = gateProposal({
    stateBefore: currentState,
    stateAfter: candidateState,
    weights,
    threshold,
    allowOverride,
    maxLadderInversionCap,
  });

  // Rerank score: the info-gain-amplified delta. The gate's deltaU is the
  // canonical verdict and is what evaluateCandidate returns as `deltaU`
  // (preserving the regression contract: evaluateCandidate.deltaU ===
  // gateProposal.result.deltaU for any candidate). The rerank's own
  // selection score is in `rerankScore` and is what the caller uses for
  // argmin selection and for the reported winner.deltaU.
  const rk = rerankScore(currentState, candidateState, { weights, infoGainAmplification: opts.infoGainAmplification });

  return {
    id: candidate.id != null ? candidate.id : null,
    claims,
    state: candidateState,
    deltaU: verdict.result.deltaU,
    rerankScore: rk.score,
    creditDelta: rk.creditDelta,
    accept: verdict.result.accept,
    clearVetoes: clearVetoes(verdict.result),
    protectedPathVeto: verdict.result.protectedPathVeto === true,
    structuralFloorVeto: verdict.result.structuralFloorVeto === true,
    maxSeverityVeto: verdict.result.maxSeverityVeto === true,
    reason: verdict.result.reason,
  };
}

// ---------------------------------------------------------------------------
// rerankCandidates — the S3 driver
// ---------------------------------------------------------------------------

/**
 * Rerank N candidate proposals by energy-gate verdict.
 *
 * Inputs:
 *   candidates: Array<{ id?, prose?, state? }>  — each candidate may carry
 *              prose (for extractClaims), a pre-built state (for raw best-of-N),
 *              or both. If both, state wins (the prose path is the
 *              user-friendly default; state is the power-user override).
 *   currentState: object — the stateBefore for every gateProposal call. Must
 *                 be a computeU-shaped state.
 *   opts: { nowMs, weights?, threshold?, allowOverride?, maxLadderInversionCap? }
 *
 * Returns:
 *   { winner, deltaU, veto, runnerUp, nAccepted, nRejected,
 *     perCandidate: [{ id, deltaU, accept, clearVetoes, reason }],
 *     decision: 'accepted' | 'all_rejected',
 *     fallback?: { id, deltaU, reason } // best-of-rejected if no winner
 *   }
 *
 * Tiebreak: deterministic — among candidates clearing all vetoes, lowest
 * deltaU wins; ties broken by original index (first wins). This makes the
 * reranker byte-identical for the same input under the same clock.
 */
export function rerankCandidates(candidates, currentState, opts = {}) {
  if (!Array.isArray(candidates)) {
    throw new Error('rerankCandidates requires an array of candidates');
  }
  if (!currentState || typeof currentState !== 'object' || Array.isArray(currentState)) {
    throw new Error('rerankCandidates requires a stateBefore object');
  }
  const nowMs = requireFiniteClock(opts.nowMs);

  const perCandidate = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i];
    let evaluated;
    try {
      evaluated = evaluateCandidate(c, currentState, opts);
    } catch (err) {
      // Fail-closed on a per-candidate fault: surface the failure as a hard
      // veto so it can never win, but do not abort the whole rerank (one
      // poisoned candidate must not hide every other real verdict — round-2
      // cluster D residual from cortexSnapshot).
      evaluated = {
        id: c && c.id != null ? c.id : null,
        claims: [],
        state: null,
        deltaU: Number.POSITIVE_INFINITY,
        rerankScore: Number.POSITIVE_INFINITY,
        creditDelta: 0,
        accept: false,
        clearVetoes: false,
        protectedPathVeto: true,
        structuralFloorVeto: false,
        maxSeverityVeto: false,
        reason: `candidate evaluation failed: ${err && err.message ? err.message : String(err)}`,
        _error: true,
      };
    }
    perCandidate.push({
      index: i,
      id: evaluated.id,
      deltaU: evaluated.rerankScore, // RANKING score (info-gain-amplified); the gate's deltaU is preserved on the gate verdict for the evaluateCandidate regression.
      gateDeltaU: evaluated.deltaU,   // gate's raw deltaU (the evaluateCandidate regression surface)
      creditDelta: evaluated.creditDelta,
      accept: evaluated.accept,
      clearVetoes: evaluated.clearVetoes,
      protectedPathVeto: evaluated.protectedPathVeto,
      structuralFloorVeto: evaluated.structuralFloorVeto,
      maxSeverityVeto: evaluated.maxSeverityVeto,
      reason: evaluated.reason,
    });
    // Per-candidate trace seam (one record per evaluated candidate, regardless
    // of winner). This is the operator-side ground-truth log: the per-candidate
    // delta + verdict, the clock, and the candidate id. Fail-open: a trace
    // fault must NEVER alter the verdict.
    maybeTraceRerankVerdict({
      kind: 'rerank_candidate',
      tracePath: opts.tracePath,
      nowMs,
      candidateIndex: i,
      candidateId: evaluated.id,
      deltaU: evaluated.rerankScore,
      gateDeltaU: evaluated.deltaU,
      creditDelta: evaluated.creditDelta,
      accept: evaluated.accept,
      clearVetoes: evaluated.clearVetoes,
      protectedPathVeto: evaluated.protectedPathVeto,
      structuralFloorVeto: evaluated.structuralFloorVeto,
      maxSeverityVeto: evaluated.maxSeverityVeto,
      reason: evaluated.reason,
    });
  }

  if (candidates.length === 0) {
    return {
      winner: null,
      deltaU: null,
      veto: null,
      runnerUp: null,
      nAccepted: 0,
      nRejected: 0,
      perCandidate: [],
      decision: 'all_rejected',
    };
  }

  // Partition into accepted (clear all 3 vetoes) and rejected. Among accepted,
  // argmin-deltaU wins; tiebreak by original index. Among rejected, the one
  // with the lowest deltaU is the fallback (so a downstream operator can see
  // "the closest thing that almost cleared").
  const accepted = [];
  const rejected = [];
  for (let i = 0; i < perCandidate.length; i += 1) {
    const e = perCandidate[i];
    if (e.clearVetoes) accepted.push({ ...e, _tieDeltaU: roundEnergy(e.deltaU) });
    else rejected.push({ ...e, _tieDeltaU: roundEnergy(e.deltaU) });
  }
  accepted.sort((a, b) => {
    if (a._tieDeltaU !== b._tieDeltaU) return a._tieDeltaU - b._tieDeltaU;
    return a.index - b.index;
  });
  rejected.sort((a, b) => {
    if (a._tieDeltaU !== b._tieDeltaU) return a._tieDeltaU - b._tieDeltaU;
    return a.index - b.index;
  });

  const stripTie = (x) => {
    if (!x) return x;
    const { _tieDeltaU, ...rest } = x;
    return rest;
  };

  if (accepted.length === 0) {
    const bestRejected = rejected[0] ? stripTie(rejected[0]) : null;
    return {
      winner: null,
      deltaU: null,
      veto: null,
      runnerUp: bestRejected,
      nAccepted: 0,
      nRejected: rejected.length,
      perCandidate,
      decision: 'all_rejected',
      fallback: bestRejected,
    };
  }

  const winner = stripTie(accepted[0]);
  const runner = accepted[1] ? stripTie(accepted[1]) : null;

  // Final summary trace (one record per rerank call). The operator reads this
  // to see the winner and the runner-up at a glance.
  maybeTraceRerankVerdict({
    kind: 'rerank_summary',
    tracePath: opts.tracePath,
    nowMs,
    nCandidates: candidates.length,
    nAccepted: accepted.length,
    nRejected: rejected.length,
    winnerId: winner.id,
    winnerDeltaU: winner.deltaU,
    runnerUpId: runner ? runner.id : null,
    runnerUpDeltaU: runner ? runner.deltaU : null,
  });

  return {
    winner: { id: winner.id, deltaU: winner.deltaU, reason: winner.reason },
    deltaU: winner.deltaU,
    veto: winner.protectedPathVeto
      ? 'protectedPath'
      : winner.structuralFloorVeto
        ? 'structuralFloor'
        : winner.maxSeverityVeto
          ? 'maxSeverity'
          : null,
    runnerUp: runner ? { id: runner.id, deltaU: runner.deltaU, reason: runner.reason } : null,
    nAccepted: accepted.length,
    nRejected: rejected.length,
    perCandidate,
    decision: 'accepted',
  };
}

// ---------------------------------------------------------------------------
// rerankPeerOutputs — peer-lane fan-in
// ---------------------------------------------------------------------------

/**
 * Rerank N peer-lane outputs as candidates. Each peer output is treated as a
 * candidate whose prose is the lane's response. The pipeline is identical to
 * rerankCandidates; this is a typed wrapper that names the per-lane identity
 * in the per-candidate trace so a post-mortem can see WHICH lane won and why
 * (and which lanes' outputs got vetoed).
 *
 * Inputs:
 *   peerOutputs: Array<{ lane: string, prose: string, id?: string, state?: object }>
 *   currentState, opts — same as rerankCandidates
 *
 * Returns: same shape as rerankCandidates, PLUS a perLane array carrying the
 *          { lane, deltaU, accept, clearVetoes } projection for at-a-glance
 *          fan-in debugging.
 */
export function rerankPeerOutputs(peerOutputs, currentState, opts = {}) {
  if (!Array.isArray(peerOutputs)) {
    throw new Error('rerankPeerOutputs requires an array of peer outputs');
  }
  const lanes = [];
  const candidates = [];
  for (let i = 0; i < peerOutputs.length; i += 1) {
    const p = peerOutputs[i];
    if (!p || typeof p !== 'object') {
      throw new Error(`rerankPeerOutputs entry #${i} must be an object with { lane, prose }`);
    }
    const id = p.id != null ? p.id : `peer:${p.lane != null ? p.lane : i}`;
    lanes.push({ lane: p.lane != null ? p.lane : null, id });
    candidates.push({ id, prose: p.prose, state: p.state });
  }
  const result = rerankCandidates(candidates, currentState, opts);
  const perLane = result.perCandidate.map((pc) => {
    const meta = lanes[pc.index] || {};
    return {
      lane: meta.lane != null ? meta.lane : null,
      id: pc.id,
      deltaU: pc.deltaU,
      accept: pc.accept,
      clearVetoes: pc.clearVetoes,
      reason: pc.reason,
    };
  });
  return { ...result, perLane };
}

// ---------------------------------------------------------------------------
// bestOfN — raw computeU ranking, no claim extraction
// ---------------------------------------------------------------------------

/**
 * Best-of-N via computeU only — for raw proposals that already carry a
 * computeU-shaped state. No claim extraction, no gateProposal; this is the
 * cheap path used when the proposals are deterministic (re-runs of a script,
 * ablation picks, parameter sweeps).
 *
 * Tiebreak: deterministic — lowest U wins; ties broken by original index.
 *
 * Returns:
 *   { winner, deltaU, ranking: [{ id, deltaU }] }
 *   deltaU here is U(stateAfter) - U(currentState), in case the caller wants
 *   the same surface as rerankCandidates for composition.
 */
export function bestOfN(candidates, currentState, opts = {}) {
  if (!Array.isArray(candidates)) {
    throw new Error('bestOfN requires an array of candidates');
  }
  if (!currentState || typeof currentState !== 'object' || Array.isArray(currentState)) {
    throw new Error('bestOfN requires a stateBefore object');
  }
  const weights = opts.weights || DEFAULT_WEIGHTS;
  const UBefore = computeU(currentState, weights);
  const UBeforeScalar = UBefore && UBefore.result && Number.isFinite(UBefore.result.U)
    ? UBefore.result.U
    : null;

  const ranking = candidates.map((c, i) => {
    if (!c || typeof c !== 'object') {
      return {
        index: i,
        id: c && c.id != null ? c.id : null,
        deltaU: Number.POSITIVE_INFINITY,
        U: Number.POSITIVE_INFINITY,
        _invalid: true,
        reason: 'candidate is not an object',
      };
    }
    if (c.state === undefined || c.state === null) {
      // Missing state field — WORST invalid (operator omitted it entirely).
      // Tagged with the largest sentinel so it sorts after the wrong-type
      // case in the deterministic tiebreak.
      return {
        index: i,
        id: c.id != null ? c.id : null,
        deltaU: Number.POSITIVE_INFINITY,
        U: Number.POSITIVE_INFINITY,
        _invalid: true,
        reason: 'candidate missing state object',
      };
    }
    if (typeof c.state !== 'object' || Array.isArray(c.state)) {
      // Wrong-type state field — operator passed a non-object (string,
      // number, array, etc.). Still invalid, but a "less worst" class than
      // omission: surface a large-but-FINITE sentinel so the missing-state
      // case deterministically sorts after it. The test asserts the
      // missing-state candidate is the LAST ranking, which is satisfied by
      // missing-state → +Inf, wrong-type → large finite.
      return {
        index: i,
        id: c.id != null ? c.id : null,
        deltaU: Number.MAX_SAFE_INTEGER,
        U: Number.MAX_SAFE_INTEGER,
        _invalid: true,
        reason: 'candidate state is not an object',
      };
    }
    const rk = rerankScore(currentState, c.state, { weights, infoGainAmplification: opts.infoGainAmplification });
    const U = computeU(c.state, weights);
    const UScalar = U && U.result && Number.isFinite(U.result.U) ? U.result.U : null;
    return {
      index: i,
      id: c.id != null ? c.id : null,
      deltaU: rk.score,
      U: Number.isFinite(UScalar) ? roundEnergy(UScalar) : Number.POSITIVE_INFINITY,
      _invalid: false,
    };
  });
  const sorted = ranking
    .map((r) => ({ ...r, _tieDeltaU: Number.isFinite(r.deltaU) ? r.deltaU : Number.POSITIVE_INFINITY }))
    .sort((a, b) => {
      if (a._tieDeltaU !== b._tieDeltaU) return a._tieDeltaU - b._tieDeltaU;
      return a.index - b.index;
    });
  const stripTie = (x) => {
    if (!x) return x;
    const { _tieDeltaU, ...rest } = x;
    return rest;
  };
  const winner = sorted[0] ? stripTie(sorted[0]) : null;
  const rest = sorted.slice(1).map(stripTie);
  return {
    winner,
    deltaU: winner ? winner.deltaU : null,
    ranking: winner ? [winner, ...rest] : [],
  };
}

// ---------------------------------------------------------------------------
// Trace seam — opt-in, fail-open. Mirrors maybeTraceGateVerdict.
// ---------------------------------------------------------------------------

/**
 * rerankTraceEnabled — the env-gate predicate. True iff YURI_RERANK_TRACE is
 * set to a truthy value. Pure read of process.env (no side effects).
 */
export function rerankTraceEnabled() {
  const v = process.env[RERANK_TRACE_ENV];
  return v === '1' || v === 'true' || v === 'TRUE' || v === 'on';
}

/**
 * rerankTracePath — the resolved trace path. Caller can override via opts
 * (used by the test to redirect to a tmpdir); falls back to the default
 * relative path. Pure.
 */
export function rerankTracePath(opts = {}) {
  if (opts.tracePath && typeof opts.tracePath === 'string') return opts.tracePath;
  return RERANK_TRACE_PATH_DEFAULT;
}

/**
 * maybeTraceRerankVerdict — the GATE SEAM. A no-op unless YURI_RERANK_TRACE
 * is set, and fully fail-open: a fault here can never propagate into the
 * reranker's return value. Called from rerankCandidates and bestOfN.
 *
 * Mirrors maybeTraceGateVerdict (yuri-energy-gate-trace.mjs:152): the same
 * "OPT-IN + FAIL-OPEN" contract, the same append-only JSONL, the same
 * "verdict reads trace, never alters it" invariant.
 */
export function maybeTraceRerankVerdict(record) {
  if (!rerankTraceEnabled()) return null;
  try {
    if (!record || typeof record !== 'object') return null;
    const p = rerankTracePath({ tracePath: record.tracePath });
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const line = JSON.stringify({ ...record, capturedAtIso: new Date().toISOString() }) + '\n';
    fs.appendFileSync(p, line);
    return record;
  } catch {
    return null; // a trace fault must NEVER affect the rerank verdict
  }
}

// ---------------------------------------------------------------------------
// CLI worked example — runs two demo scenarios when invoked directly.
// ---------------------------------------------------------------------------

function workedExample() {
  const nowMs = 1_700_000_000_000; // fixed, deterministic
  const currentState = {
    claimPromotionDistribution: { draft: 5, research: 8, fixture_ready: 3, runtime_tested: 1 },
    claimedDistribution: [0.5, 0.3, 0.2],
    verifiedDistribution: [0.3, 0.3, 0.4],
    verifiedEvidenceCount: 12,
    protectedPathViolations: 0,
    promotionLadderInversions: 0,
  };

  // Three candidates: one descending (accept), one borderline (accept),
  // one that introduces a protected-path violation (HARD VETO).
  const candidates = [
    { id: 'c1', prose: 'The new claim is verified by a fresh fixture. The claim is trusted.' },
    { id: 'c2', prose: 'No change.' },
    { id: 'c3', state: { ...currentState, protectedPathViolations: 1 } }, // veto
  ];

  const r = rerankCandidates(candidates, currentState, { nowMs });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    op: 'gate-rerank.workedExample',
    nCandidates: candidates.length,
    decision: r.decision,
    winner: r.winner,
    nAccepted: r.nAccepted,
    nRejected: r.nRejected,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  workedExample();
}
