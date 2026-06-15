#!/usr/bin/env node
// @capability: verifier-best-of-n
// @serves: best-of-N | test-time compute | candidate selection | argmin score | hard veto | peer lane selection | RLVR S6
// @does: Score N candidate proposals, pick the argmin-score candidate that clears all hard vetoes. Pure function, injectable scoreFn. The cheapest path to test-time compute: spend cycles on verification, not model size.
// @use: Reach for this when you have N candidate outputs and need to pick the best one by a deterministic score. The default scoreFn is a simple ΔU comparator (reads candidate.score or candidate.state.U, vetoes protectedPathViolations>0). Inject computeU/gateProposal for the full energy-gate form via verifierBestOfNGated.
// @exports: verifierBestOfN, verifierBestOfNGated, verifierBestOfNPeers, recordVerifierPrediction, scoreVerifierHistory, defaultScoreFn

import { computeU, computeDeltaU, gateProposal, DEFAULT_WEIGHTS } from './yuri-energy.mjs';
import { recordPrediction, calibrationReport } from '../prediction-ledger.mjs';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Shadow ledger — DISARMED: writes to _SYSTEM/state/verifier-shadow.jsonl ONLY.
// Never touches the live prediction ledger.
// ---------------------------------------------------------------------------

const SHADOW_LEDGER_PATH = '_SYSTEM/state/verifier-shadow.jsonl';

function ensureShadowDir() {
  try { mkdirSync(dirname(SHADOW_LEDGER_PATH), { recursive: true }); } catch { /* fail-open */ }
}

function appendShadow(row) {
  ensureShadowDir();
  try {
    appendFileSync(SHADOW_LEDGER_PATH, JSON.stringify(row) + '\n', 'utf8');
  } catch (e) {
    // fail-open: a shadow write fault must never alter the verifier verdict
    process.stderr.write(`[verifier-best-of-n] shadow write failed: ${e.message}\n`);
  }
}

function readShadowLines() {
  try {
    const raw = readFileSync(SHADOW_LEDGER_PATH, 'utf8');
    return raw.split('\n').filter(l => l.trim()).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Default score function — simple ΔU comparator, NO live gate dependency.
// Reads candidate.score or candidate.state.U; vetoes protectedPathViolations>0.
// This is the injectable default so the test needs no live gate.
// ---------------------------------------------------------------------------

/**
 * Default score function: reads a pre-computed score from the candidate.
 * Vetoes candidates with protectedPathViolations > 0.
 *
 * Candidate shape: { id?, score?, state?: { U?, protectedPathViolations? } }
 *
 * Returns { score: number, veto: boolean, vetoReason?: string }
 * Lower score = better. Infinity = vetoed.
 */
export function defaultScoreFn(candidate, opts = {}) {
  const state = candidate.state || candidate;

  // Hard veto: protected path violations (mirrors the gate's η term)
  const ppv = state.protectedPathViolations;
  if (typeof ppv === 'number' && ppv > 0) {
    return { score: Infinity, veto: true, vetoReason: 'protectedPathViolations' };
  }

  // Explicit score on the candidate wins
  if (typeof candidate.score === 'number' && Number.isFinite(candidate.score)) {
    return { score: candidate.score, veto: false };
  }

  // U field on the state (pre-computed by caller)
  if (state && typeof state.U === 'number' && Number.isFinite(state.U)) {
    return { score: state.U, veto: false };
  }

  // Fallback: zero score (neutral)
  return { score: 0, veto: false };
}

// ---------------------------------------------------------------------------
// verifierBestOfN — pure form, injectable scoreFn
// ---------------------------------------------------------------------------

/**
 * Best-of-N: score each candidate with scoreFn, pick the argmin-score candidate
 * that clears all hard vetoes. Returns null winner if none clear.
 *
 * @param {Array} candidates - Array of candidate objects
 * @param {Function} scoreFn - (candidate, opts) => { score, veto, vetoReason? }
 * @param {Object} opts - Options passed through to scoreFn
 * @returns {{ winner, score, ranking, nAccepted, nRejected, decision }}
 */
export function verifierBestOfN(candidates, scoreFn = defaultScoreFn, opts = {}) {
  if (!Array.isArray(candidates)) {
    throw new Error('verifierBestOfN requires an array of candidates');
  }

  const scored = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    let result;
    try {
      result = scoreFn(c, opts);
    } catch (err) {
      result = { score: Infinity, veto: true, vetoReason: `scoreFn error: ${err.message}` };
    }
    scored.push({
      index: i,
      id: c != null && c.id != null ? c.id : null,
      candidate: c,
      score: result.score,
      veto: result.veto === true,
      vetoReason: result.vetoReason || null,
    });
  }

  // Separate accepted (finite score, no veto) from rejected
  const accepted = scored.filter(s => !s.veto && Number.isFinite(s.score));
  const rejected = scored.filter(s => s.veto || !Number.isFinite(s.score));

  // Sort accepted by score ascending, then by original index (deterministic tiebreak)
  accepted.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.index - b.index;
  });

  // Build ranking: accepted first (best→worst), then rejected
  const ranking = [
    ...accepted.map(s => ({
      id: s.id,
      score: s.score,
      veto: false,
      vetoReason: null,
    })),
    ...rejected.map(s => ({
      id: s.id,
      score: s.score,
      veto: true,
      vetoReason: s.vetoReason,
    })),
  ];

  const winner = accepted.length > 0 ? accepted[0].candidate : null;
  const winnerScore = accepted.length > 0 ? accepted[0].score : null;

  return {
    winner,
    score: winnerScore,
    ranking,
    nAccepted: accepted.length,
    nRejected: rejected.length,
    decision: accepted.length > 0 ? 'accepted' : 'all_rejected',
  };
}

// ---------------------------------------------------------------------------
// verifierBestOfNGated — full energy-gate form
// ---------------------------------------------------------------------------

/**
 * Best-of-N with the full energy gate: for each candidate, compute gateProposal
 * over the transition from currentState to candidateState. Accept only candidates
 * that clear ALL 3 hard vetoes (protectedPathVeto, structuralFloorVeto,
 * maxSeverityVeto). Pick the lowest-ΔU among accepted.
 *
 * @param {Array} candidates - Array of { id?, state } — each state is a computeU-shaped snapshot
 * @param {Object} currentState - The stateBefore for every gateProposal call
 * @param {Object} opts - { weights?, threshold?, allowOverride?, maxLadderInversionCap? }
 * @returns {{ winner, deltaU, veto, ranking, nAccepted, nRejected, decision, fallback? }}
 */
export function verifierBestOfNGated(candidates, currentState, opts = {}) {
  if (!Array.isArray(candidates)) {
    throw new Error('verifierBestOfNGated requires an array of candidates');
  }
  if (!currentState || typeof currentState !== 'object' || Array.isArray(currentState)) {
    throw new Error('verifierBestOfNGated requires a currentState object');
  }

  const weights = opts.weights || DEFAULT_WEIGHTS;
  const threshold = Number.isFinite(Number(opts.threshold)) ? Number(opts.threshold) : 0;
  const allowOverride = opts.allowOverride === true;
  const maxLadderInversionCap = Number.isFinite(Number(opts.maxLadderInversionCap))
    ? Number(opts.maxLadderInversionCap)
    : undefined;

  const scored = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const candidateState = (c && c.state) ? c.state : c;

    let verdict;
    try {
      verdict = gateProposal({
        stateBefore: currentState,
        stateAfter: candidateState,
        weights,
        threshold,
        allowOverride,
        maxLadderInversionCap,
      });
    } catch (err) {
      // Fail-closed: a gate fault is treated as all-vetoes
      verdict = {
        result: {
          accept: false,
          deltaU: Number.POSITIVE_INFINITY,
          protectedPathVeto: true,
          structuralFloorVeto: true,
          maxSeverityVeto: true,
          reason: `gateProposal error: ${err.message}`,
        },
      };
    }

    const r = verdict.result;
    const clearsAll = !(
      r.protectedPathVeto === true ||
      r.structuralFloorVeto === true ||
      r.maxSeverityVeto === true
    );

    scored.push({
      index: i,
      id: c != null && c.id != null ? c.id : null,
      candidate: c,
      deltaU: r.deltaU,
      accept: r.accept === true,
      clearsAll,
      protectedPathVeto: r.protectedPathVeto === true,
      structuralFloorVeto: r.structuralFloorVeto === true,
      maxSeverityVeto: r.maxSeverityVeto === true,
      reason: r.reason,
    });
  }

  const accepted = scored.filter(s => s.clearsAll && Number.isFinite(s.deltaU));
  const rejected = scored.filter(s => !s.clearsAll || !Number.isFinite(s.deltaU));

  // Sort accepted by deltaU ascending, then by index (deterministic tiebreak)
  accepted.sort((a, b) => {
    if (a.deltaU !== b.deltaU) return a.deltaU - b.deltaU;
    return a.index - b.index;
  });

  // Build ranking
  const ranking = [
    ...accepted.map(s => ({
      id: s.id,
      deltaU: s.deltaU,
      clearsAll: true,
      protectedPathVeto: s.protectedPathVeto,
      structuralFloorVeto: s.structuralFloorVeto,
      maxSeverityVeto: s.maxSeverityVeto,
      reason: s.reason,
    })),
    ...rejected.map(s => ({
      id: s.id,
      deltaU: s.deltaU,
      clearsAll: false,
      protectedPathVeto: s.protectedPathVeto,
      structuralFloorVeto: s.structuralFloorVeto,
      maxSeverityVeto: s.maxSeverityVeto,
      reason: s.reason,
    })),
  ];

  const winner = accepted.length > 0 ? accepted[0].candidate : null;
  const winnerDeltaU = accepted.length > 0 ? accepted[0].deltaU : null;

  // Fallback: best-of-rejected (lowest deltaU among rejected) for operator inspection
  let fallback = null;
  if (accepted.length === 0 && rejected.length > 0) {
    const bestRejected = [...rejected].sort((a, b) => {
      if (a.deltaU !== b.deltaU) return a.deltaU - b.deltaU;
      return a.index - b.index;
    })[0];
    fallback = {
      id: bestRejected.id,
      deltaU: bestRejected.deltaU,
      reason: bestRejected.reason,
    };
  }

  return {
    winner,
    deltaU: winnerDeltaU,
    veto: accepted.length === 0,
    ranking,
    nAccepted: accepted.length,
    nRejected: rejected.length,
    decision: accepted.length > 0 ? 'accepted' : 'all_rejected',
    ...(fallback ? { fallback } : {}),
  };
}

// ---------------------------------------------------------------------------
// verifierBestOfNPeers — peer-lane selection
// ---------------------------------------------------------------------------

/**
 * Best-of-N over peer-lane outputs: each peer is { lane, state }.
 * Uses the pure form with defaultScoreFn (reads state.U).
 *
 * @param {Array} peerStates - Array of { lane, state }
 * @param {Object} opts - Options passed through to verifierBestOfN
 * @returns {{ winner, score, perLane, nAccepted, nRejected, decision }}
 */
export function verifierBestOfNPeers(peerStates, opts = {}) {
  if (!Array.isArray(peerStates)) {
    throw new Error('verifierBestOfNPeers requires an array of peer states');
  }

  // Map peers to candidates with id = lane
  const candidates = peerStates.map(p => ({
    id: p.lane,
    state: p.state,
  }));

  const result = verifierBestOfN(candidates, defaultScoreFn, opts);

  // Build per-lane breakdown
  const perLane = peerStates.map(p => {
    const entry = result.ranking.find(r => r.id === p.lane);
    return {
      lane: p.lane,
      score: entry ? entry.score : null,
      veto: entry ? entry.veto : true,
    };
  });

  return {
    winner: result.winner ? { lane: result.winner.id, state: result.winner.state } : null,
    score: result.score,
    perLane,
    nAccepted: result.nAccepted,
    nRejected: result.nRejected,
    decision: result.decision,
  };
}

// ---------------------------------------------------------------------------
// recordVerifierPrediction — shadow ledger only
// ---------------------------------------------------------------------------

/**
 * Record the verifier's pick as a prediction in the SHADOW ledger.
 * NEVER writes to the live prediction ledger.
 *
 * @param {Object} winner - The winning candidate
 * @param {Array} candidates - All candidates
 * @param {Object} opts - { nowMs?, reason? }
 * @returns {{ predictionId: string }}
 */
export function recordVerifierPrediction(winner, candidates, opts = {}) {
  const nowMs = opts.nowMs || Date.now();
  const predictionId = `vbon-${nowMs}-${Math.random().toString(36).slice(2, 8)}`;

  const row = {
    type: 'verifier-prediction',
    predictionId,
    ts: nowMs,
    winnerId: winner != null && winner.id != null ? winner.id : null,
    candidateIds: Array.isArray(candidates)
      ? candidates.map(c => (c != null && c.id != null ? c.id : null))
      : [],
    nCandidates: Array.isArray(candidates) ? candidates.length : 0,
    reason: opts.reason || null,
  };

  appendShadow(row);

  return { predictionId };
}

// ---------------------------------------------------------------------------
// scoreVerifierHistory — calibration over shadow ledger
// ---------------------------------------------------------------------------

/**
 * Score the verifier's historical picks from the shadow ledger.
 * Reads the shadow ledger, pairs predictions with outcomes (if any),
 * and returns calibration stats.
 *
 * @param {Object} opts - { file?: string } (defaults to shadow ledger)
 * @returns {{ nPicks, nResolved, brier, calibration }}
 */
export function scoreVerifierHistory(opts = {}) {
  const rows = readShadowLines();

  const predictions = rows.filter(r => r.type === 'verifier-prediction');
  const outcomes = rows.filter(r => r.type === 'verifier-outcome');
  const outcomeMap = new Map(outcomes.map(o => [o.predictionId, o]));

  let resolved = 0;
  let brierSum = 0;
  const unresolved = [];

  for (const pred of predictions) {
    const out = outcomeMap.get(pred.predictionId);
    if (!out) {
      unresolved.push(pred.predictionId);
      continue;
    }
    resolved++;
    // Brier: (1 - correct)^2 where correct=1 if winnerId matches observedBestId
    const correct = pred.winnerId === out.observedBestId ? 1 : 0;
    brierSum += (1 - correct) ** 2;
  }

  return {
    nPicks: predictions.length,
    nResolved: resolved,
    nUnresolved: unresolved.length,
    brier: resolved > 0 ? brierSum / resolved : null,
    calibration: resolved > 0
      ? { note: 'binary correct/incorrect per pick; full calibrationReport available via prediction-ledger.mjs' }
      : null,
    unresolved,
  };
}
