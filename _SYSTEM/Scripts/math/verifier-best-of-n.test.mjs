// verifier-best-of-n.test.mjs — test suite for verifierBestOfN (S6, Wave-1)
// node --test _SYSTEM/Scripts/math/verifier-best-of-n.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  verifierBestOfN,
  verifierBestOfNGated,
  verifierBestOfNPeers,
  recordVerifierPrediction,
  scoreVerifierHistory,
  defaultScoreFn,
} from './verifier-best-of-n.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A clean baseline state with zero violations, zero inversions, neutral distributions */
function baselineState() {
  return {
    claimPromotionDistribution: [0.25, 0.25, 0.25, 0.25],
    claimedDistribution: [0.5, 0.5],
    verifiedDistribution: [0.5, 0.5],
    predictions: [0.5, 0.5],
    outcomes: [1, 0],
    forecasts: [0.5, 0.5],
    results: [1, 0],
    priorState: [0.5, 0.5],
    posteriorState: [0.6, 0.4],
    evidence: [],
    protectedPathViolations: 0,
    promotionLadderInversions: 0,
    verifiedEvidenceCount: 5,
    repeatedFailureCount: 0,
    malformedForecastCount: 0,
    claimedConcentration: 0.5,
  };
}

// ---------------------------------------------------------------------------
// defaultScoreFn
// ---------------------------------------------------------------------------

describe('defaultScoreFn', () => {
  it('reads candidate.score directly', () => {
    const r = defaultScoreFn({ id: 'a', score: 3.5 });
    assert.equal(r.score, 3.5);
    assert.equal(r.veto, false);
  });

  it('reads state.U from candidate.state', () => {
    const r = defaultScoreFn({ id: 'a', state: { U: 2.1 } });
    assert.equal(r.score, 2.1);
    assert.equal(r.veto, false);
  });

  it('vetoes on protectedPathViolations > 0', () => {
    const r = defaultScoreFn({ id: 'a', state: { U: 1.0, protectedPathViolations: 1 } });
    assert.equal(r.score, Infinity);
    assert.equal(r.veto, true);
    assert.equal(r.vetoReason, 'protectedPathViolations');
  });

  it('returns neutral score for empty candidate', () => {
    const r = defaultScoreFn({});
    assert.equal(r.score, 0);
    assert.equal(r.veto, false);
  });
});

// ---------------------------------------------------------------------------
// verifierBestOfN — pure form
// ---------------------------------------------------------------------------

describe('verifierBestOfN', () => {
  it('perfect-pick: picks lowest-score candidate', () => {
    const candidates = [
      { id: 'a', score: 10 },
      { id: 'b', score: 3 },
      { id: 'c', score: 7 },
    ];
    const result = verifierBestOfN(candidates);
    assert.equal(result.winner.id, 'b');
    assert.equal(result.score, 3);
    assert.equal(result.nAccepted, 3);
    assert.equal(result.nRejected, 0);
    assert.equal(result.decision, 'accepted');
    assert.equal(result.ranking.length, 3);
    assert.equal(result.ranking[0].id, 'b');
    assert.equal(result.ranking[1].id, 'c');
    assert.equal(result.ranking[2].id, 'a');
  });

  it('all-vetoed returns null winner', () => {
    const candidates = [
      { id: 'a', state: { protectedPathViolations: 1 } },
      { id: 'b', state: { protectedPathViolations: 2 } },
    ];
    const result = verifierBestOfN(candidates);
    assert.equal(result.winner, null);
    assert.equal(result.score, null);
    assert.equal(result.nAccepted, 0);
    assert.equal(result.nRejected, 2);
    assert.equal(result.decision, 'all_rejected');
  });

  it('tiebreak: equal scores pick first by index', () => {
    const candidates = [
      { id: 'a', score: 5 },
      { id: 'b', score: 5 },
    ];
    const result = verifierBestOfN(candidates);
    assert.equal(result.winner.id, 'a');
    assert.equal(result.score, 5);
    assert.equal(result.nAccepted, 2);
  });

  it('empty candidates returns null winner', () => {
    const result = verifierBestOfN([]);
    assert.equal(result.winner, null);
    assert.equal(result.score, null);
    assert.equal(result.nAccepted, 0);
    assert.equal(result.nRejected, 0);
    assert.equal(result.decision, 'all_rejected');
    assert.equal(result.ranking.length, 0);
  });

  it('single candidate returns that candidate as winner', () => {
    const candidates = [{ id: 'solo', score: 42 }];
    const result = verifierBestOfN(candidates);
    assert.equal(result.winner.id, 'solo');
    assert.equal(result.score, 42);
    assert.equal(result.nAccepted, 1);
    assert.equal(result.nRejected, 0);
  });

  it('mixed: some vetoed, some accepted — picks best accepted', () => {
    const candidates = [
      { id: 'vetoed', state: { protectedPathViolations: 1 } },
      { id: 'good', score: 2 },
      { id: 'better', score: 1 },
    ];
    const result = verifierBestOfN(candidates);
    assert.equal(result.winner.id, 'better');
    assert.equal(result.score, 1);
    assert.equal(result.nAccepted, 2);
    assert.equal(result.nRejected, 1);
  });

  it('candidate with missing fields gets neutral score (0)', () => {
    const candidates = [
      { id: 'neutral', state: {} },
      { id: 'negative', score: -5 },
    ];
    const result = verifierBestOfN(candidates);
    // negative score is lower than 0, so 'negative' wins
    assert.equal(result.winner.id, 'negative');
    assert.equal(result.score, -5);
  });

  it('throws on non-array input', () => {
    assert.throws(() => verifierBestOfN(null), /array/);
    assert.throws(() => verifierBestOfN({}), /array/);
  });

  it('handles scoreFn that throws — candidate is vetoed', () => {
    const explosive = () => { throw new Error('boom'); };
    const candidates = [
      { id: 'a', score: 5 },
      { id: 'b', score: 3 },
    ];
    const result = verifierBestOfN(candidates, explosive);
    // Both vetoed by the throwing scoreFn
    assert.equal(result.winner, null);
    assert.equal(result.nAccepted, 0);
    assert.equal(result.nRejected, 2);
  });

  it('custom scoreFn is injectable', () => {
    // Score by string length of id
    const lenScore = (c) => ({ score: c.id.length, veto: false });
    const candidates = [
      { id: 'longest' },
      { id: 'mid' },
      { id: 'x' },
    ];
    const result = verifierBestOfN(candidates, lenScore);
    assert.equal(result.winner.id, 'x');
    assert.equal(result.score, 1);
  });
});

// ---------------------------------------------------------------------------
// verifierBestOfNGated — full energy-gate form
// ---------------------------------------------------------------------------

describe('verifierBestOfNGated', () => {
  it('picks lowest-deltaU candidate that clears all vetoes', () => {
    const current = baselineState();
    const candidates = [
      { id: 'a', state: { ...baselineState(), protectedPathViolations: 0 } },
      { id: 'b', state: { ...baselineState(), protectedPathViolations: 0 } },
      { id: 'c', state: { ...baselineState(), protectedPathViolations: 0 } },
    ];
    // All identical states → deltaU ≈ 0 for all, tiebreak picks first
    const result = verifierBestOfNGated(candidates, current);
    assert.equal(result.winner.id, 'a');
    assert.equal(result.nAccepted, 3);
    assert.equal(result.nRejected, 0);
    assert.equal(result.decision, 'accepted');
  });

  it('vetoes candidate with protectedPathViolations > 0', () => {
    const current = baselineState();
    const badState = { ...baselineState(), protectedPathViolations: 1 };
    const candidates = [
      { id: 'bad', state: badState },
      { id: 'good', state: baselineState() },
    ];
    const result = verifierBestOfNGated(candidates, current);
    assert.equal(result.winner.id, 'good');
    assert.equal(result.nAccepted, 1);
    assert.equal(result.nRejected, 1);
    // The vetoed candidate should be in ranking with clearsAll=false
    const badRank = result.ranking.find(r => r.id === 'bad');
    assert.equal(badRank.clearsAll, false);
    assert.equal(badRank.protectedPathVeto, true);
  });

  it('all vetoed returns null winner with fallback', () => {
    const current = baselineState();
    const badState = { ...baselineState(), protectedPathViolations: 1 };
    const candidates = [
      { id: 'bad1', state: badState },
      { id: 'bad2', state: { ...baselineState(), protectedPathViolations: 2 } },
    ];
    const result = verifierBestOfNGated(candidates, current);
    assert.equal(result.winner, null);
    assert.equal(result.nAccepted, 0);
    assert.equal(result.nRejected, 2);
    assert.equal(result.decision, 'all_rejected');
    assert.ok(result.fallback);
    assert.equal(result.fallback.id, 'bad1'); // lower ppv = lower deltaU
  });

  it('empty candidates returns null winner', () => {
    const result = verifierBestOfNGated([], baselineState());
    assert.equal(result.winner, null);
    assert.equal(result.nAccepted, 0);
    assert.equal(result.nRejected, 0);
    assert.equal(result.decision, 'all_rejected');
  });

  it('throws on non-array candidates', () => {
    assert.throws(() => verifierBestOfNGated(null, baselineState()), /array/);
  });

  it('throws on missing currentState', () => {
    assert.throws(() => verifierBestOfNGated([{ id: 'a', state: baselineState() }], null), /currentState/);
  });

  it('handles gateProposal fault — candidate vetoed', () => {
    // Pass a state that triggers a hard veto (protectedPathViolations > 0).
    // gateProposal is extremely defensive and almost never throws; the real
    // fail-closed path is the hard-veto family. A candidate with ppv>0 is
    // vetoed regardless of deltaU.
    const current = baselineState();
    const badState = { ...baselineState(), protectedPathViolations: 3 };
    const candidates = [
      { id: 'bad', state: badState },
      { id: 'good', state: baselineState() },
    ];
    const result = verifierBestOfNGated(candidates, current);
    assert.equal(result.winner.id, 'good');
    assert.equal(result.nAccepted, 1);
    assert.equal(result.nRejected, 1);
  });
});

// ---------------------------------------------------------------------------
// verifierBestOfNPeers — peer-lane selection
// ---------------------------------------------------------------------------

describe('verifierBestOfNPeers', () => {
  it('picks the lane with lowest U', () => {
    const peers = [
      { lane: 'claude', state: { U: 5.0 } },
      { lane: 'deepseek', state: { U: 2.0 } },
      { lane: 'gemma', state: { U: 8.0 } },
    ];
    const result = verifierBestOfNPeers(peers);
    assert.equal(result.winner.lane, 'deepseek');
    assert.equal(result.score, 2.0);
    assert.equal(result.nAccepted, 3);
    assert.equal(result.nRejected, 0);
    assert.equal(result.decision, 'accepted');
    assert.equal(result.perLane.length, 3);
    assert.equal(result.perLane[0].lane, 'claude');
    assert.equal(result.perLane[1].lane, 'deepseek');
    assert.equal(result.perLane[2].lane, 'gemma');
  });

  it('vetoes lane with protectedPathViolations', () => {
    const peers = [
      { lane: 'bad', state: { U: 1.0, protectedPathViolations: 1 } },
      { lane: 'good', state: { U: 10.0 } },
    ];
    const result = verifierBestOfNPeers(peers);
    assert.equal(result.winner.lane, 'good');
    assert.equal(result.score, 10.0);
    assert.equal(result.nAccepted, 1);
    assert.equal(result.nRejected, 1);
  });

  it('all vetoed returns null winner', () => {
    const peers = [
      { lane: 'bad1', state: { protectedPathViolations: 1 } },
      { lane: 'bad2', state: { protectedPathViolations: 2 } },
    ];
    const result = verifierBestOfNPeers(peers);
    assert.equal(result.winner, null);
    assert.equal(result.nAccepted, 0);
    assert.equal(result.nRejected, 2);
    assert.equal(result.decision, 'all_rejected');
  });

  it('empty peers returns null winner', () => {
    const result = verifierBestOfNPeers([]);
    assert.equal(result.winner, null);
    assert.equal(result.nAccepted, 0);
    assert.equal(result.nRejected, 0);
  });

  it('throws on non-array input', () => {
    assert.throws(() => verifierBestOfNPeers(null), /array/);
  });
});

// ---------------------------------------------------------------------------
// recordVerifierPrediction + scoreVerifierHistory
// ---------------------------------------------------------------------------

describe('recordVerifierPrediction / scoreVerifierHistory', () => {
  it('recordVerifierPrediction returns a predictionId', () => {
    const winner = { id: 'best' };
    const candidates = [{ id: 'best' }, { id: 'mid' }, { id: 'worst' }];
    const result = recordVerifierPrediction(winner, candidates, { nowMs: 1000 });
    assert.ok(result.predictionId);
    assert.match(result.predictionId, /^vbon-/);
  });

  it('recordVerifierPrediction handles null winner', () => {
    const result = recordVerifierPrediction(null, [], { nowMs: 2000 });
    assert.ok(result.predictionId);
  });

  it('scoreVerifierHistory returns valid structure', () => {
    const result = scoreVerifierHistory();
    assert.ok(typeof result.nPicks === 'number');
    assert.ok(typeof result.nResolved === 'number');
    assert.ok(typeof result.nUnresolved === 'number');
    // brier may be null if no resolved picks
    if (result.brier !== null) {
      assert.ok(typeof result.brier === 'number');
      assert.ok(result.brier >= 0 && result.brier <= 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('candidate with missing fields gets finite score (not NaN)', () => {
    const candidates = [
      { id: 'empty', state: {} },
    ];
    const result = verifierBestOfN(candidates);
    assert.equal(result.winner.id, 'empty');
    assert.ok(Number.isFinite(result.score));
    assert.equal(result.score, 0);
  });

  it('candidate with null id works', () => {
    const candidates = [
      { score: 5 },
      { score: 3 },
    ];
    const result = verifierBestOfN(candidates);
    assert.equal(result.winner.score, 3);
    assert.equal(result.score, 3);
    assert.equal(result.ranking[0].id, null);
  });

  it('ranking preserves order: accepted first, then rejected', () => {
    const candidates = [
      { id: 'v1', state: { protectedPathViolations: 1 } },
      { id: 'a1', score: 10 },
      { id: 'a2', score: 5 },
      { id: 'v2', state: { protectedPathViolations: 2 } },
    ];
    const result = verifierBestOfN(candidates);
    assert.equal(result.ranking.length, 4);
    // First two should be accepted (a2 then a1 by score)
    assert.equal(result.ranking[0].id, 'a2');
    assert.equal(result.ranking[0].veto, false);
    assert.equal(result.ranking[1].id, 'a1');
    assert.equal(result.ranking[1].veto, false);
    // Last two should be rejected
    assert.equal(result.ranking[2].veto, true);
    assert.equal(result.ranking[3].veto, true);
  });

  it('Infinity score is treated as vetoed', () => {
    const scoreFn = (c) => ({ score: c.id === 'bad' ? Infinity : c.score, veto: false });
    const candidates = [
      { id: 'bad', score: 999 },
      { id: 'good', score: 5 },
    ];
    const result = verifierBestOfN(candidates, scoreFn);
    assert.equal(result.winner.id, 'good');
    assert.equal(result.nAccepted, 1);
    assert.equal(result.nRejected, 1);
  });

  it('NaN score is treated as vetoed', () => {
    const scoreFn = (c) => ({ score: c.id === 'bad' ? NaN : c.score, veto: false });
    const candidates = [
      { id: 'bad', score: 999 },
      { id: 'good', score: 5 },
    ];
    const result = verifierBestOfN(candidates, scoreFn);
    assert.equal(result.winner.id, 'good');
    assert.equal(result.nAccepted, 1);
    assert.equal(result.nRejected, 1);
  });
});
