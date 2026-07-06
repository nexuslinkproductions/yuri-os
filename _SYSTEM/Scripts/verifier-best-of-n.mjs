#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
// @capability: verifier-best-of-n
// @serves: verifier | best-of-n | computeU over N proposals | pick survivor | test-time compute | peer lane ranking | gated proposal selection
// @does: verifierBestOfN(candidates, scoreFn) -> runs computeU/gate scoring over N proposals, returns the survivor (argmin-deltaU clearing hard vetoes). The cheapest test-time-compute path: spend cycles on verification not model size.
// @use: Reach for this when you have N candidate states and need the best one by energy score. Pure form uses computeU only; gated form uses gateProposal with hard vetoes. DISARMED — no live wiring into dispatch.
// @exports: verifierBestOfN, verifierBestOfNGated, verifierBestOfNPeers, recordVerifierPrediction, scoreVerifierHistory
/**
 * verifier-best-of-n.mjs — computeU over N proposals → pick the survivor
 *
 * The cheapest path to test-time compute: spend cycles on verification, not model size.
 * Pure function, DISARMED. No modification to computeU, gateProposal, or llm-lane.mjs.
 *
 * DISARMED Contract:
 *   - NO modification to computeU, gateProposal, or llm-lane.mjs
 *   - NO live wiring into dispatch
 *   - NO write to the live prediction ledger (shadow ledger only)
 *   - Arming (inserting into llm-lane.mjs dispatch) is OWNER-GATED
 *
 * Related:
 *   - _SYSTEM/Scripts/math/yuri-energy.mjs (computeU, gateProposal, DEFAULT_WEIGHTS)
 *   - _SYSTEM/Scripts/prediction-ledger.mjs (recordPrediction, calibrationReport)
 *   - 02_RESOURCES/RESEARCH/wave0-keystone-2026-06-15/wave1-specs/05-verifier-best-of-n-spec.md
 */

import { computeU, computeDeltaU, gateProposal, DEFAULT_WEIGHTS } from './math/yuri-energy.mjs';
import { recordPrediction, calibrationReport } from './prediction-ledger.mjs';

// Shadow ledger path — DISARMED, no live prediction ledger writes.
const SHADOW_LEDGER_FILE = '_SYSTEM/state/verifier-shadow.jsonl';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Score a single candidate state using computeU.
 * Returns { id, U, components, contributions, warnings }.
 */
function scoreCandidate(candidate, weights, id) {
  const result = computeU(candidate, weights);
  return {
    id: id ?? candidate.id ?? 'unknown',
    U: result.result.U,
    components: result.result.components,
    contributions: result.result.contributions,
    warnings: result.result.validationWarnings ?? [],
  };
}

/**
 * Score a candidate transition using gateProposal.
 * Returns { id, deltaU, accept, reason, veto, dominantTerm, componentDeltas }.
 */
function gateCandidate(candidate, currentState, weights, threshold, maxLadderInversionCap, id) {
  const result = gateProposal({
    stateBefore: currentState,
    stateAfter: candidate,
    weights,
    threshold,
    maxLadderInversionCap,
  });
  return {
    id: id ?? candidate.id ?? 'unknown',
    deltaU: result.result.deltaU,
    accept: result.result.accept,
    reason: result.result.reason,
    veto: {
      protectedPathVeto: result.result.protectedPathVeto,
      structuralFloorVeto: result.result.structuralFloorVeto,
      maxSeverityVeto: result.result.maxSeverityVeto,
    },
    dominantTerm: result.result.dominantTerm,
    componentDeltas: result.result.componentDeltas,
  };
}

// ---------------------------------------------------------------------------
// verifierBestOfN — pure form: computeU over each candidate, pick lowest U
// ---------------------------------------------------------------------------

/**
 * Best-of-N: computeU over each candidate's proposed state, pick the one with
 * the LOWEST U (best state). Returns the winner + full ranking.
 * This is the PURE form: no claim extraction, no cortex snapshot.
 * Candidates are raw state snapshots in computeU's input shape.
 *
 * @param {Array<object>} candidates - Array of state snapshots (computeU input shape)
 * @param {object} [opts] - Options
 * @param {object} [opts.weights] - Weight overrides for computeU (default: DEFAULT_WEIGHTS)
 * @param {function} [opts.scoreFn] - Optional custom scoring function: (candidate, id) => { id, U }
 * @returns {{ winner: object|null, deltaU: number|null, ranking: Array<{id, U, deltaU}>, nAccepted: number, nRejected: number }}
 */
export function verifierBestOfN(candidates, opts = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { winner: null, deltaU: null, ranking: [], nAccepted: 0, nRejected: 0 };
  }

  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const scoreFn = opts.scoreFn ?? scoreCandidate;

  const ranking = candidates.map((c, i) => {
    const scored = scoreFn(c, weights, c.id ?? `candidate-${i}`);
    return {
      id: scored.id,
      U: scored.U,
      deltaU: 0, // placeholder; computed relative to winner below
      candidate: c,
      components: scored.components,
      contributions: scored.contributions,
      warnings: scored.warnings,
    };
  });

  // Sort by U ascending (lower U = better state)
  ranking.sort((a, b) => a.U - b.U);

  // Compute deltaU relative to the winner
  const winnerU = ranking[0].U;
  for (const r of ranking) {
    r.deltaU = r.U - winnerU;
  }

  const winner = ranking[0].candidate;

  return {
    winner,
    deltaU: 0, // winner's deltaU is always 0
    ranking: ranking.map(r => ({
      id: r.id,
      U: r.U,
      deltaU: r.deltaU,
    })),
    nAccepted: ranking.length,
    nRejected: 0,
  };
}

// ---------------------------------------------------------------------------
// verifierBestOfNGated — gated form: gateProposal over each, pick lowest ΔU
// ---------------------------------------------------------------------------

/**
 * Best-of-N with gate: for each candidate, compute gateProposal over the
 * transition from currentState to candidateState. Accept only candidates
 * that clear ALL 3 hard vetoes. Pick the lowest-ΔU among accepted.
 * This is the GATED form: uses the full gate, not just computeU.
 *
 * @param {Array<object>} candidates - Array of candidate state snapshots
 * @param {object} currentState - The current state (stateBefore for gateProposal)
 * @param {object} [opts] - Options
 * @param {object} [opts.weights] - Weight overrides (default: DEFAULT_WEIGHTS)
 * @param {number} [opts.threshold] - ΔU threshold for gateProposal (default: 0)
 * @param {number} [opts.maxLadderInversionCap] - L∞ cap (default: Infinity = disabled)
 * @returns {{ winner: object|null, deltaU: number|null, veto: object|null, ranking: Array<{id, deltaU, accept, reason, veto}>, nAccepted: number, nRejected: number }}
 */
export function verifierBestOfNGated(candidates, currentState, opts = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { winner: null, deltaU: null, veto: null, ranking: [], nAccepted: 0, nRejected: 0 };
  }
  if (!currentState) {
    throw new Error('verifierBestOfNGated requires currentState');
  }

  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const threshold = opts.threshold ?? 0;
  const maxLadderInversionCap = opts.maxLadderInversionCap ?? Infinity;

  const ranking = candidates.map((c, i) => {
    const gated = gateCandidate(c, currentState, weights, threshold, maxLadderInversionCap, c.id ?? `candidate-${i}`);
    return {
      id: gated.id,
      deltaU: gated.deltaU,
      accept: gated.accept,
      reason: gated.reason,
      veto: gated.veto,
      dominantTerm: gated.dominantTerm,
      componentDeltas: gated.componentDeltas,
      candidate: c,
    };
  });

  const accepted = ranking.filter(r => r.accept);
  const rejected = ranking.filter(r => !r.accept);

  if (accepted.length === 0) {
    // No candidate cleared the gate — return the one with the smallest |ΔU| among rejected
    // as a fallback, but mark it as rejected.
    rejected.sort((a, b) => Math.abs(a.deltaU) - Math.abs(b.deltaU));
    return {
      winner: null,
      deltaU: null,
      veto: rejected[0]?.veto ?? null,
      ranking: ranking.map(r => ({
        id: r.id,
        deltaU: r.deltaU,
        accept: r.accept,
        reason: r.reason,
        veto: r.veto,
      })),
      nAccepted: 0,
      nRejected: rejected.length,
    };
  }

  // Among accepted, pick the one with the lowest ΔU (best transition)
  accepted.sort((a, b) => a.deltaU - b.deltaU);
  const winner = accepted[0];

  return {
    winner: winner.candidate,
    deltaU: winner.deltaU,
    veto: null, // no veto — winner cleared the gate
    ranking: ranking.map(r => ({
      id: r.id,
      deltaU: r.deltaU,
      accept: r.accept,
      reason: r.reason,
      veto: r.veto,
    })),
    nAccepted: accepted.length,
    nRejected: rejected.length,
  };
}

// ---------------------------------------------------------------------------
// verifierBestOfNPeers — peer-lane form
// ---------------------------------------------------------------------------

/**
 * Best-of-N over peer-lane outputs: each output is a candidate state.
 * Same as verifierBestOfN but accepts an array of { lane, state } pairs.
 *
 * @param {Array<{lane: string, state: object}>} peerStates - Array of peer lane outputs
 * @param {object} [opts] - Options (same as verifierBestOfN)
 * @returns {{ winner: {lane: string, state: object}|null, perLane: Array<{lane, U, deltaU}>, nAccepted: number }}
 */
export function verifierBestOfNPeers(peerStates, opts = {}) {
  if (!Array.isArray(peerStates) || peerStates.length === 0) {
    return { winner: null, perLane: [], nAccepted: 0 };
  }

  const weights = opts.weights ?? DEFAULT_WEIGHTS;

  const scored = peerStates.map((ps, i) => {
    const result = computeU(ps.state, weights);
    return {
      lane: ps.lane ?? `peer-${i}`,
      state: ps.state,
      U: result.result.U,
    };
  });

  scored.sort((a, b) => a.U - b.U);

  const winnerU = scored[0].U;
  const perLane = scored.map(s => ({
    lane: s.lane,
    U: s.U,
    deltaU: s.U - winnerU,
  }));

  return {
    winner: { lane: scored[0].lane, state: scored[0].state },
    perLane,
    nAccepted: scored.length,
  };
}

// ---------------------------------------------------------------------------
// recordVerifierPrediction — shadow ledger write (DISARMED)
// ---------------------------------------------------------------------------

/**
 * Record the verifier's pick as a prediction for later scoring.
 * Uses prediction-ledger.recordPrediction with the shadow ledger file.
 * DISARMED: writes to _SYSTEM/state/verifier-shadow.jsonl, NOT the live ledger.
 *
 * @param {object} winner - The winning candidate state
 * @param {Array<object>} candidates - All candidates considered
 * @param {object} [opts] - Options
 * @param {string} [opts.subject] - Subject label for the prediction
 * @param {string} [opts.source] - Source label (default: 'verifier-best-of-n')
 * @returns {{ predictionId: string|null }}
 */
export function recordVerifierPrediction(winner, candidates, opts = {}) {
  if (!winner || !Array.isArray(candidates) || candidates.length === 0) {
    return { predictionId: null };
  }

  const subject = opts.subject ?? 'verifier-best-of-n';
  const source = opts.source ?? 'verifier-best-of-n';
  const ts = opts.ts ?? Date.now();

  const result = recordPrediction({
    subject,
    change: `verifier picked candidate from ${candidates.length} options`,
    predictedEffects: [
      {
        target: 'verifier-pick',
        effect: 'best-by-energy',
        confidence: 1 / candidates.length, // uniform prior; refined by scoreVerifierHistory
      },
    ],
    source,
    ts,
  }, { file: SHADOW_LEDGER_FILE });

  return { predictionId: result.row?.id ?? null };
}

// ---------------------------------------------------------------------------
// scoreVerifierHistory — calibration over shadow ledger
// ---------------------------------------------------------------------------

/**
 * Score the verifier's historical picks against known outcomes.
 * Uses prediction-ledger.calibrationReport on the shadow ledger.
 * Returns Brier + per-bucket calibration.
 *
 * @param {object} [opts] - Options
 * @returns {{ brier: number, ece: number, nPicks: number, calibrationReport: object }}
 */
export function scoreVerifierHistory(opts = {}) {
  const report = calibrationReport({ file: SHADOW_LEDGER_FILE, ...opts });

  // Expected Calibration Error: mean absolute deviation of hitRate from confidence midpoint
  let ece = 0;
  let eceCount = 0;
  for (const b of report.byConfidenceBucket) {
    if (b.n > 0) {
      const mid = (BUCKET_MIDPOINTS[b.bucket] ?? 0.5);
      ece += Math.abs(b.hitRate - mid) * b.n;
      eceCount += b.n;
    }
  }
  ece = eceCount > 0 ? ece / eceCount : 0;

  return {
    brier: report.meanBrier,
    ece,
    nPicks: report.n,
    calibrationReport: report,
  };
}

// Bucket midpoints for ECE calculation
const BUCKET_MIDPOINTS = {
  '0-0.2': 0.1,
  '0.2-0.4': 0.3,
  '0.4-0.6': 0.5,
  '0.6-0.8': 0.7,
  '0.8-1': 0.9,
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  if (cmd === 'report') {
    const r = scoreVerifierHistory();
    console.log(`verifier-best-of-n history: n=${r.nPicks} meanBrier=${r.brier.toFixed(4)} ECE=${r.ece.toFixed(4)}`);
    for (const b of r.calibrationReport.byConfidenceBucket) {
      if (b.n > 0) {
        console.log(`  ${b.bucket.padEnd(10)} n=${String(b.n).padStart(4)} brier=${b.meanBrier.toFixed(4)} hitRate=${(b.hitRate * 100).toFixed(1)}%`);
      }
    }
    if (r.nPicks === 0) console.log('  (no verifier predictions recorded yet)');
  } else {
    console.log(`verifier-best-of-n — computeU over N proposals → pick the survivor.
  node verifier-best-of-n.mjs report   # calibration report over shadow ledger`);
  }
}
