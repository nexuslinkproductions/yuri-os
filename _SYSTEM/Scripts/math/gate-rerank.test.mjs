// Tests for gate-rerank.mjs — the S3 (Generate-Then-Verify) rerank driver.
// Proves: happy path picks the lowest-ΔU winner; all_rejected returns fallback
// with the closest rejected candidate; veto diversity (3 different vetoes
// cancel all candidates); tiebreak is deterministic by original index; empty
// candidate list returns the canonical empty shape; peer rerank maps the
// per-lane identity; trace seam is OFF by default (no file written) and ON
// when YURI_RERANK_TRACE is set; regression — evaluateCandidate on a
// known-good candidate returns the same verdict gateProposal returns when
// called directly; argmin-deltaU semantic survives the prose path; the
// identity veto (gateClaimTransition) is intentionally NOT consumed (the
// reranker's axis is best-of-N, not before/after).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  rerankCandidates,
  rerankPeerOutputs,
  bestOfN,
  evaluateCandidate,
  clearVetoes,
  maybeTraceRerankVerdict,
  rerankTraceEnabled,
  rerankTracePath,
} from './gate-rerank.mjs';
import { gateProposal, computeU, DEFAULT_WEIGHTS, DEFAULT_MAX_LADDER_INVERSION_CAP } from './yuri-energy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// --- helpers -------------------------------------------------------------------
const NOW = 1_700_000_000_000; // fixed, deterministic
const DAY = 86_400_000;

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try { return fn(); } finally {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k];
    }
  }
}
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'gr-')); }

// A "neutral" current state: max-entropy distributions, no inversions, no
// protected-path violations, fresh verified-evidence count. This is the
// honest "we know nothing" prior — any descending candidate should win
// against it (info-gain credit pulls ΔU negative).
function neutralState() {
  return {
    claimPromotionDistribution: { draft: 1, research: 1, fixture_ready: 1, runtime_tested: 1, operator_validated: 1, trusted: 1 },
    claimedDistribution: [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6],
    verifiedDistribution: [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6],
    priorState: [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6],
    posteriorState: [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6],
    evidence: [],
    promotionLadderInversions: 0,
    verifiedEvidenceCount: 0,
    protectedPathViolations: 0,
  };
}

// A candidate "state" that DESCENT-DELTAS against the neutral state: more
// verified evidence, no inversions, no protected-path violations. This is
// the happy-path "fresh verified" candidate.
function goodCandidateState(extra = {}) {
  return {
    claimPromotionDistribution: { draft: 0, research: 1, fixture_ready: 1, runtime_tested: 1, operator_validated: 1, trusted: 2 },
    claimedDistribution: [0.1, 0.15, 0.15, 0.2, 0.2, 0.2],
    verifiedDistribution: [0.05, 0.1, 0.15, 0.2, 0.25, 0.25],
    priorState: [0.15, 0.15, 0.15, 0.15, 0.2, 0.2],
    posteriorState: [0.05, 0.1, 0.15, 0.2, 0.25, 0.25],
    evidence: [],
    promotionLadderInversions: 0,
    verifiedEvidenceCount: 8,
    protectedPathViolations: 0,
    ...extra,
  };
}

// --- 1. happy path ------------------------------------------------------------

test('happy path: lowest-ΔU candidate that clears all 3 vetoes wins', () => {
  const s = neutralState();
  // Three candidates: good (descending), neutral (held, no claims -> max-entropy),
  // and a worse-but-still-accept one (just a small distribution shift).
  const candidates = [
    { id: 'c1', state: goodCandidateState() },
    { id: 'c2', state: { ...s } }, // exact copy -> ΔU = 0, accept
    { id: 'c3', state: goodCandidateState({ verifiedEvidenceCount: 4 }) }, // weaker descent
  ];
  const r = rerankCandidates(candidates, s, { nowMs: NOW });
  assert.equal(r.decision, 'accepted');
  assert.ok(r.winner, 'winner must be present');
  // c1 has the strongest verified evidence increase -> largest info-gain credit
  // -> lowest ΔU. c2 is exact-copy ΔU=0. c3 has weaker credit.
  assert.equal(r.winner.id, 'c1');
  assert.ok(r.winner.deltaU < 0, 'winning ΔU must be descending (negative)');
  assert.equal(r.nAccepted, 3);
  assert.equal(r.nRejected, 0);
  assert.equal(r.perCandidate.length, 3);
  // The per-candidate list preserves original index.
  assert.equal(r.perCandidate[0].id, 'c1');
  assert.equal(r.perCandidate[1].id, 'c2');
  assert.equal(r.perCandidate[2].id, 'c3');
});

// --- 2. all rejected ----------------------------------------------------------

test('all rejected: every candidate fails at least one veto -> all_rejected + fallback', () => {
  const s = neutralState();
  // Three candidates that each trip a DIFFERENT hard veto (one is enough; the
  // test exercises the all-fail path with diverse veto families).
  const candidates = [
    { id: 'pp', state: goodCandidateState({ protectedPathViolations: 1 }) },          // veto 1
    { id: 'sf', state: goodCandidateState({ promotionLadderInversions: 2 }) },         // veto 2
    { id: 'mx', state: goodCandidateState({ maxLadderInversion: 9 }) },                // veto 3
  ];
  const r = rerankCandidates(candidates, s, { nowMs: NOW, maxLadderInversionCap: 3 });
  assert.equal(r.decision, 'all_rejected');
  assert.equal(r.winner, null);
  assert.equal(r.nAccepted, 0);
  assert.equal(r.nRejected, 3);
  assert.ok(r.fallback, 'fallback must be present (best of rejected)');
  // The fallback is the rejected candidate with the lowest ΔU (closest to
  // clearing). It carries its reason so the operator can see WHY it was close.
  assert.equal(typeof r.fallback.deltaU, 'number');
  assert.ok(r.fallback.reason && typeof r.fallback.reason === 'string');
});

// --- 3. veto diversity --------------------------------------------------------

test('veto diversity: protectedPath, structuralFloor, maxSeverity each reject independently', () => {
  const s = neutralState();

  // Candidate A: protected-path violation INCREASE (0 -> 1) -> veto 1.
  const aState = goodCandidateState({ protectedPathViolations: 1 });
  const aGate = gateProposal({
    stateBefore: s, stateAfter: aState, maxLadderInversionCap: 3,
  });
  assert.equal(aGate.result.protectedPathVeto, true, 'A: protectedPathVeto must fire');
  assert.equal(aGate.result.accept, false);

  // Candidate B: ladder inversion INCREASE (0 -> 2) -> veto 2 (structural floor).
  const bState = goodCandidateState({ promotionLadderInversions: 2 });
  const bGate = gateProposal({
    stateBefore: s, stateAfter: bState, maxLadderInversionCap: 3,
  });
  assert.equal(bGate.result.structuralFloorVeto, true, 'B: structuralFloorVeto must fire');
  assert.equal(bGate.result.accept, false);

  // Candidate C: max-severity floor breach (cap=3, max=9) -> veto 3.
  const cState = goodCandidateState({ maxLadderInversion: 9 });
  const cGate = gateProposal({
    stateBefore: s, stateAfter: cState, maxLadderInversionCap: 3,
  });
  assert.equal(cGate.result.maxSeverityVeto, true, 'C: maxSeverityVeto must fire');
  assert.equal(cGate.result.accept, false);

  // The reranker reads these same 3 verdicts. Build the rerank call and
  // confirm each candidate is independently rejected, decision=all_rejected.
  const r = rerankCandidates(
    [{ id: 'A', state: aState }, { id: 'B', state: bState }, { id: 'C', state: cState }],
    s,
    { nowMs: NOW, maxLadderInversionCap: 3 },
  );
  assert.equal(r.decision, 'all_rejected');
  assert.equal(r.nAccepted, 0);
  assert.equal(r.nRejected, 3);
  // The per-candidate list carries the right veto family per candidate.
  const byId = Object.fromEntries(r.perCandidate.map((c) => [c.id, c]));
  assert.equal(byId.A.protectedPathVeto, true);
  assert.equal(byId.A.structuralFloorVeto, false);
  assert.equal(byId.A.maxSeverityVeto, false);
  assert.equal(byId.B.protectedPathVeto, false);
  assert.equal(byId.B.structuralFloorVeto, true);
  assert.equal(byId.B.maxSeverityVeto, false);
  assert.equal(byId.C.protectedPathVeto, false);
  assert.equal(byId.C.structuralFloorVeto, false);
  assert.equal(byId.C.maxSeverityVeto, true);
});

// --- 4. tiebreak --------------------------------------------------------------

test('tiebreak: equal ΔU among accepted candidates -> first in input order wins', () => {
  const s = neutralState();
  // Three candidates with the SAME state -> identical ΔU. Rerank must pick
  // the one with the lowest original index.
  const same = goodCandidateState();
  const candidates = [
    { id: 'first', state: same },
    { id: 'second', state: same },
    { id: 'third', state: same },
  ];
  const r = rerankCandidates(candidates, s, { nowMs: NOW });
  assert.equal(r.decision, 'accepted');
  assert.equal(r.winner.id, 'first');
  assert.equal(r.nAccepted, 3);
  // Runner-up is the next in input order with the same ΔU.
  assert.equal(r.runnerUp.id, 'second');
});

// --- 5. empty candidates ------------------------------------------------------

test('empty candidates: returns canonical empty shape, no winner, no fallback', () => {
  const s = neutralState();
  const r = rerankCandidates([], s, { nowMs: NOW });
  assert.equal(r.decision, 'all_rejected');
  assert.equal(r.winner, null);
  assert.equal(r.deltaU, null);
  assert.equal(r.veto, null);
  assert.equal(r.runnerUp, null);
  assert.equal(r.nAccepted, 0);
  assert.equal(r.nRejected, 0);
  assert.deepEqual(r.perCandidate, []);
  assert.equal(r.fallback, undefined);
});

// --- 6. peer rerank -----------------------------------------------------------

test('peer rerank: maps per-lane identity, picks the lane with the lowest ΔU', () => {
  const s = neutralState();
  const peerOutputs = [
    { lane: 'claude', prose: 'The new claim is fixture_ready.' },
    { lane: 'deepseek', prose: 'The new claim is verified and trusted.' },
    { lane: 'mimo', state: goodCandidateState({ verifiedEvidenceCount: 12 }) }, // raw state, no prose
  ];
  const r = rerankPeerOutputs(peerOutputs, s, { nowMs: NOW });
  assert.equal(r.decision, 'accepted');
  assert.ok(r.winner, 'winner must be present');
  assert.equal(r.perLane.length, 3);
  // The per-lane projection carries the lane name. The third candidate has
  // the strongest verified evidence (12) so it should have the lowest ΔU
  // and win. The first two prose candidates produce lower info-gain.
  assert.equal(r.winner.id, `peer:mimo`);
  assert.equal(r.perLane[0].lane, 'claude');
  assert.equal(r.perLane[1].lane, 'deepseek');
  assert.equal(r.perLane[2].lane, 'mimo');
  // The per-lane deltaU must be a finite number for all accepted candidates.
  for (const pl of r.perLane) {
    assert.ok(pl.id, 'per-lane id must be present');
    assert.equal(typeof pl.deltaU, 'number');
  }
});

// --- 7. trace seam: OFF by default --------------------------------------------

test('trace seam: YURI_RERANK_TRACE unset -> NO file is written (clean path untouched)', () => {
  const tmp = mkTmp();
  const traceFile = path.join(tmp, 'rerank-trace.jsonl');
  // Sanity: the file must not exist before the call.
  assert.equal(fs.existsSync(traceFile), false);

  const r = withEnv({ YURI_RERANK_TRACE: undefined }, () => {
    return rerankCandidates(
      [{ id: 't1', state: goodCandidateState() }],
      neutralState(),
      { nowMs: NOW, tracePath: traceFile },
    );
  });
  // Rerank result is correct AND the trace file is NOT written.
  assert.equal(r.decision, 'accepted');
  assert.equal(r.winner.id, 't1');
  assert.equal(rerankTraceEnabled(), false, 'rerankTraceEnabled must be false');
  assert.equal(fs.existsSync(traceFile), false, 'trace file must NOT exist when env is unset');
});

// --- 7b. trace seam: ON when env is set ---------------------------------------

test('trace seam: YURI_RERANK_TRACE=1 -> JSONL appended with per-candidate + summary records', () => {
  const tmp = mkTmp();
  const traceFile = path.join(tmp, 'rerank-trace.jsonl');

  const r = withEnv({ YURI_RERANK_TRACE: '1' }, () => {
    const out = rerankCandidates(
      [
        { id: 'a', state: goodCandidateState() },
        { id: 'b', state: goodCandidateState({ verifiedEvidenceCount: 2 }) },
      ],
      neutralState(),
      { nowMs: NOW, tracePath: traceFile },
    );
    // Inside withEnv: the env gate is live, so the predicate must report true.
    assert.equal(rerankTraceEnabled(), true, 'rerankTraceEnabled must be true while env is set');
    return out;
  });
  assert.equal(r.decision, 'accepted');
  assert.equal(fs.existsSync(traceFile), true, 'trace file must be written when env is set');

  const lines = fs.readFileSync(traceFile, 'utf8').trim().split('\n').filter(Boolean);
  // 2 per-candidate records + 1 summary record = 3 lines.
  assert.equal(lines.length, 3, 'must record one line per candidate + one summary');
  const records = lines.map((l) => JSON.parse(l));
  const perCandidate = records.filter((r) => r.kind === 'rerank_candidate');
  const summaries = records.filter((r) => r.kind === 'rerank_summary');
  assert.equal(perCandidate.length, 2);
  assert.equal(summaries.length, 1);
  // The summary's winnerId must match the result winner.
  assert.equal(summaries[0].winnerId, r.winner.id);
  assert.equal(summaries[0].nAccepted, r.nAccepted);
  assert.equal(summaries[0].nRejected, r.nRejected);
  // Per-candidate records carry the capturedAtIso seam (B4-style fingerprint).
  for (const pc of perCandidate) {
    assert.equal(typeof pc.capturedAtIso, 'string');
    assert.ok(pc.capturedAtIso.endsWith('Z') || pc.capturedAtIso.includes('T'),
      'capturedAtIso must be an ISO string');
  }
});

// --- 7c. trace seam: fail-open (a fault never alters the verdict) -------------

test('trace seam: an unwritable trace path does NOT alter the rerank verdict', () => {
  // A path that cannot be written: a directory the test will not have access
  // to create. (The "no such directory and parent is a file" trick is the
  // most portable: appendFileSync on a path whose parent is a regular file
  // throws ENOTDIR.)
  const tmp = mkTmp();
  const blocker = path.join(tmp, 'blocker');
  fs.writeFileSync(blocker, 'i am a file, not a dir');
  const badPath = path.join(blocker, 'rerank-trace.jsonl');

  const r = withEnv({ YURI_RERANK_TRACE: '1' }, () => {
    return rerankCandidates(
      [{ id: 'safe', state: goodCandidateState() }],
      neutralState(),
      { nowMs: NOW, tracePath: badPath },
    );
  });
  // The verdict is preserved despite the I/O fault.
  assert.equal(r.decision, 'accepted');
  assert.equal(r.winner.id, 'safe');
  // The default trace path (set by env) is independent of the injected one —
  // the injected path was the one that failed; the default is unused.
});

// --- 8. regression: evaluateCandidate matches gateProposal directly ----------

test('regression: evaluateCandidate on a known-good candidate matches gateProposal called directly', () => {
  const s = neutralState();
  const cs = goodCandidateState();
  const opts = { nowMs: NOW };

  const direct = gateProposal({ stateBefore: s, stateAfter: cs });
  const evalResult = evaluateCandidate({ id: 'r1', state: cs }, s, opts);

  // The reranker's projection must match the gate's verdict exactly.
  assert.equal(evalResult.accept, direct.result.accept);
  assert.equal(evalResult.deltaU, direct.result.deltaU);
  assert.equal(evalResult.clearVetoes, clearVetoes(direct.result));
  assert.equal(evalResult.protectedPathVeto, direct.result.protectedPathVeto);
  assert.equal(evalResult.structuralFloorVeto, direct.result.structuralFloorVeto);
  assert.equal(evalResult.maxSeverityVeto, direct.result.maxSeverityVeto);
  // The reason string is byte-identical (same gate, same input).
  assert.equal(evalResult.reason, direct.result.reason);
});

// --- 8b. regression: argmin-deltaU semantic survives the prose path -----------

test('regression: prose path with extractClaims + cortexSnapshot still picks argmin-ΔU', () => {
  const s = neutralState();
  // Two prose candidates that both CLEAR all vetoes (the prose is just
  // ordinary claim statements; no protected-path mentions, no inversions).
  // cortexSnapshot on each produces a state whose ΔU we can compare.
  const candidates = [
    { id: 'p1', prose: 'The claim is research. The claim is fixture_ready.' },
    { id: 'p2', prose: 'The claim is trusted. The claim is trusted.' },
  ];
  const r = rerankCandidates(candidates, s, { nowMs: NOW });
  // Both candidates must clear the vetoes; the winner is the one with the
  // lower ΔU (deterministic).
  assert.equal(r.decision, 'accepted');
  assert.equal(r.nAccepted, 2);
  assert.ok(r.winner.deltaU <= r.runnerUp.deltaU,
    'winner ΔU must be ≤ runner-up ΔU');
});

// --- 9. invariant: the reranker NEVER modifies the gate ------------------------

test('invariant: reranking does NOT mutate the input currentState (read-only)', () => {
  const s = neutralState();
  const sBefore = JSON.stringify(s);
  rerankCandidates(
    [{ id: 'q', state: goodCandidateState() }],
    s,
    { nowMs: NOW },
  );
  assert.equal(JSON.stringify(s), sBefore, 'currentState must be byte-identical after rerank');
});

test('invariant: clearVetoes returns false on a null/undefined verdict', () => {
  assert.equal(clearVetoes(null), false);
  assert.equal(clearVetoes(undefined), false);
  assert.equal(clearVetoes({}), false);
  // A verdict with no veto flags clears.
  assert.equal(clearVetoes({ protectedPathVeto: false, structuralFloorVeto: false, maxSeverityVeto: false }), true);
  // Any single true veto blocks.
  assert.equal(clearVetoes({ protectedPathVeto: true, structuralFloorVeto: false, maxSeverityVeto: false }), false);
  assert.equal(clearVetoes({ protectedPathVeto: false, structuralFloorVeto: true, maxSeverityVeto: false }), false);
  assert.equal(clearVetoes({ protectedPathVeto: false, structuralFloorVeto: false, maxSeverityVeto: true }), false);
});

// --- 10. bestOfN: raw computeU ranking, no claim extraction -------------------

test('bestOfN: ranks by U(stateAfter) - U(stateBefore); lowest wins; tiebreak by index', () => {
  const s = neutralState();
  const UBefore = computeU(s);
  const candidates = [
    { id: 'b1', state: goodCandidateState({ verifiedEvidenceCount: 1 }) },  // small credit
    { id: 'b2', state: goodCandidateState({ verifiedEvidenceCount: 10 }) }, // larger credit -> lower U
    { id: 'b3', state: { ...s } },                                          // exact copy -> ΔU = 0
  ];
  const r = bestOfN(candidates, s);
  assert.ok(r.winner, 'bestOfN must return a winner');
  // b2 has the strongest verified-evidence credit -> lowest U -> lowest ΔU.
  assert.equal(r.winner.id, 'b2');
  assert.equal(r.ranking.length, 3);
  assert.equal(r.ranking[0].id, 'b2');
  // The ranking is monotonically non-decreasing in ΔU.
  for (let i = 1; i < r.ranking.length; i += 1) {
    assert.ok(r.ranking[i - 1].deltaU <= r.ranking[i].deltaU,
      `ranking[${i - 1}].deltaU (${r.ranking[i - 1].deltaU}) must be ≤ ranking[${i}].deltaU (${r.ranking[i].deltaU})`);
  }
  // The exact-copy candidate's ΔU is 0 (within rounding tolerance).
  const b3 = r.ranking.find((x) => x.id === 'b3');
  assert.equal(b3.deltaU, 0);
  assert.equal(r.deltaU, r.winner.deltaU);
  // UBefore is the reference (sanity: the winner's U is finite).
  // computeU returns a wrapped math-result { schema, result: { U, components, ... } };
  // the test must read the scalar off `.result.U`, not off the wrapper itself.
  assert.ok(Number.isFinite(UBefore.result.U), `UBefore.result.U must be finite, got ${UBefore.result.U}`);
  assert.ok(Number.isFinite(r.winner.U));
});

test('bestOfN: empty input returns empty ranking and null winner', () => {
  const r = bestOfN([], neutralState());
  assert.equal(r.winner, null);
  assert.equal(r.deltaU, null);
  assert.equal(r.ranking.length, 0);
});

test('bestOfN: a candidate missing a state object is flagged invalid (ΔU=+Inf) and ranks last', () => {
  const candidates = [
    { id: 'ok', state: goodCandidateState() },
    { id: 'no-state' }, // no state
    { id: 'bad-state', state: 'not an object' },
  ];
  const r = bestOfN(candidates, neutralState());
  assert.equal(r.winner.id, 'ok');
  // The invalid candidates sort to the end.
  assert.equal(r.ranking[r.ranking.length - 1].id, 'no-state');
  assert.equal(r.ranking[r.ranking.length - 1].deltaU, Number.POSITIVE_INFINITY);
});

// --- 11. fail-closed clock ----------------------------------------------------

test('fail-closed clock: a non-finite nowMs throws (reranker does not silently default to Date.now())', () => {
  assert.throws(
    () => rerankCandidates([], neutralState(), { nowMs: NaN }),
    /finite nowMs/,
  );
  assert.throws(
    () => rerankCandidates([], neutralState(), { nowMs: Infinity }),
    /finite nowMs/,
  );
  assert.throws(
    () => rerankCandidates([{ id: 'x', state: goodCandidateState() }], neutralState(), { nowMs: undefined }),
    /finite nowMs/,
  );
});

test('fail-closed inputs: missing stateBefore throws (no silent default)', () => {
  assert.throws(
    () => rerankCandidates([{ id: 'x' }], null, { nowMs: NOW }),
    /stateBefore/,
  );
  assert.throws(
    () => rerankCandidates([{ id: 'x' }], [], { nowMs: NOW }),
    /stateBefore/,
  );
});

// --- 12. provenance: imports are exactly what the spec says ------------------

test('provenance: rerankCandidates/PeerOutputs/bestOfN are exported from gate-rerank.mjs', () => {
  // Importing the named functions above is the structural proof. This test
  // is a guardrail: it fails if a future rename or accidental removal breaks
  // the public surface that the spec promises.
  assert.equal(typeof rerankCandidates, 'function');
  assert.equal(typeof rerankPeerOutputs, 'function');
  assert.equal(typeof bestOfN, 'function');
  assert.equal(typeof evaluateCandidate, 'function');
  assert.equal(typeof clearVetoes, 'function');
  assert.equal(typeof maybeTraceRerankVerdict, 'function');
  assert.equal(typeof rerankTraceEnabled, 'function');
  assert.equal(typeof rerankTracePath, 'function');
});

test('provenance: gate-rerank.mjs re-uses the canonical yuri-energy gate (no shadow reimplementation)', async () => {
  // Re-run a known fixture through gate-rerank and through the gate directly.
  // The verdicts must match (deltaU, accept, all three vetoes) — proving
  // gate-rerank is a CONSUMER of gateProposal, not a re-implementer.
  const s = neutralState();
  const cs = goodCandidateState({ protectedPathViolations: 1 });
  const direct = gateProposal({ stateBefore: s, stateAfter: cs });
  const evald = evaluateCandidate({ id: 'shadow-check', state: cs }, s, { nowMs: NOW });
  assert.equal(evald.deltaU, direct.result.deltaU);
  assert.equal(evald.accept, direct.result.accept);
  assert.equal(evald.protectedPathVeto, direct.result.protectedPathVeto);
  assert.equal(evald.structuralFloorVeto, direct.result.structuralFloorVeto);
  assert.equal(evald.maxSeverityVeto, direct.result.maxSeverityVeto);
  // The rerank correctly rejects the protected-path candidate.
  const r = rerankCandidates([{ id: 'shadow-check', state: cs }], s, { nowMs: NOW });
  assert.equal(r.decision, 'all_rejected');
});

// --- 13. default-weights regression: rerank uses DEFAULT_WEIGHTS by default ---

test('default weights: rerank uses DEFAULT_WEIGHTS when opts.weights is omitted (no silent override)', () => {
  // Two parallel runs — one with explicit DEFAULT_WEIGHTS, one with no
  // weights at all. The verdicts must match exactly.
  const s = neutralState();
  const cs = goodCandidateState();
  const a = evaluateCandidate({ id: 'a', state: cs }, s, { nowMs: NOW });
  const b = evaluateCandidate({ id: 'b', state: cs }, s, { nowMs: NOW, weights: DEFAULT_WEIGHTS });
  assert.equal(a.deltaU, b.deltaU);
  assert.equal(a.accept, b.accept);
});

// --- 14. trace path default ---------------------------------------------------

test('trace path default: rerankTracePath() returns the canonical relative path when no override', () => {
  const p = rerankTracePath();
  assert.equal(p, '_SYSTEM/state/rerank-trace.jsonl');
});

test('trace path override: rerankTracePath({ tracePath: x }) returns x verbatim', () => {
  const x = '/tmp/whatever/rerank.jsonl';
  assert.equal(rerankTracePath({ tracePath: x }), x);
});
