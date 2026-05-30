// Adversarial regression suite for the 2026-05-30 hardening pass. The happy-path
// suites codify normal behavior; THESE codify each closed attack so it can never
// silently regress. One test per verified bug from energy-hardening-attack-2026-05-30.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeU, gateProposal, DEFAULT_WEIGHTS } from './yuri-energy.mjs';
import { buildTraceRecord, CANONICAL_PROMOTION_LABELS } from './yuri-energy-trace.mjs';
import { PROMOTION_LADDER_LABELS } from './yuri-energy-sanitize.mjs';

// --- Bug #3: KL non-monotonic -> maximal drift must REJECT, not skip-to-accept ---
test('bug#3 — a provable-lie verified distribution yields a FINITE KL and REJECTS', () => {
  const before = { claimedDistribution: [0.5, 0.5], verifiedDistribution: [0.5, 0.5], verifiedEvidenceCount: 5 };
  // claimed says [1,0] but verified evidence says [0,1] — maximal drift / provable lie.
  const after = { claimedDistribution: [1, 0], verifiedDistribution: [0, 1], verifiedEvidenceCount: 5 };
  const uAfter = computeU(after);
  // Pre-fix: klDivergence threw "infinite" -> component skipped -> contributed 0.
  // (serializeComponent omits `skipped` entirely when a component fires.)
  assert.notEqual(uAfter.result.components.klDivergence.skipped, true, 'KL must not be skipped');
  assert.ok(Number.isFinite(uAfter.result.components.klDivergence.value), 'KL must have a finite value');
  const g = gateProposal({ stateBefore: before, stateAfter: after });
  assert.ok(g.result.deltaU > 0, 'maximal drift must raise U');
  assert.equal(g.result.accept, false, 'the worst case must be rejected, not accepted');
});

// --- Bug #4: protected-path veto is non-offsettable (evidence + override) ---
test('bug#4 — a protected-path increase masked by evidence inflation is VETOED', () => {
  const g = gateProposal({
    stateBefore: { protectedPathViolations: 0, verifiedEvidenceCount: 0 },
    stateAfter: { protectedPathViolations: 1, verifiedEvidenceCount: 100000 },
  });
  assert.equal(g.result.accept, false);
  assert.equal(g.result.protectedPathVeto, true, 'masking by evidence must not offset the veto');
});

test('bug#4 — allowOverride CANNOT bypass the protected-path veto', () => {
  const g = gateProposal({
    stateBefore: { protectedPathViolations: 0 },
    stateAfter: { protectedPathViolations: 1 },
    allowOverride: true,
  });
  assert.equal(g.result.accept, false, 'override must not accept a protected-path increase');
  assert.equal(g.result.override, false);
  assert.equal(g.result.protectedPathVeto, true);
});

// --- Bug #5: a secret smuggled as a distribution KEY must be dropped, not persisted ---
test('bug#5 — a secret-shaped claimPromotionDistribution KEY never reaches the record', () => {
  const SECRET = 'sk-proj-AKIA1234SECRETxyz';
  const record = buildTraceRecord({
    lane: 'test', runId: 'r1',
    stateBefore: { claimPromotionDistribution: { draft: 5, [SECRET]: 3, 'Bearer TOKEN': 1 } },
    stateAfter: { claimPromotionDistribution: { draft: 5 } },
  });
  const serialized = JSON.stringify(record);
  assert.ok(!serialized.includes(SECRET), 'secret key must not be persisted verbatim');
  assert.ok(!serialized.includes('Bearer TOKEN'), 'non-canonical keys must be dropped');
  // The canonical label survives.
  assert.equal(record.stateBefore_summary.claimPromotionDistribution.draft, 5);
  assert.equal(Object.keys(record.stateBefore_summary.claimPromotionDistribution).length, 1);
});

// --- Bug #6: repeated confidently-wrong forecasts must keep raising U (no plateau) ---
test('bug#6 — the Nth confidently-wrong forecast still raises U (no windowed-mean plateau)', () => {
  const one = computeU({ predictions: [0.95], outcomes: [0] }).result.U;
  const five = computeU({ predictions: [0.95, 0.95, 0.95, 0.95, 0.95], outcomes: [0, 0, 0, 0, 0] }).result.U;
  // logLoss/brier are MEANS (identical for both); only the per-event count penalty
  // grows -> U must strictly increase with each additional failure.
  assert.ok(five > one, 'repeated failures must keep raising U');
  assert.ok(five - one > 15, `expected ~kappa*(5-1)=20 incremental penalty, got ${five - one}`);
});

// --- Bound-U: the verified-evidence credit saturates (U has a finite infimum) ---
test('bound-U — verified-evidence credit saturates at the cap (U bounded below)', () => {
  const atCap = computeU({ verifiedEvidenceCount: 50 }).result.contributions.verifiedEvidenceCredit;
  const huge = computeU({ verifiedEvidenceCount: 1e9 }).result.contributions.verifiedEvidenceCredit;
  assert.equal(huge, atCap, 'credit must not grow past the cap — no unbounded masking budget');
  assert.ok(huge > -1, 'credit is bounded (finite infimum)');
  assert.ok(huge < 0, 'evidence still lowers U, just boundedly');
});

// --- Weight-masking: zeroing eta must NOT disable the structural protected veto ---
test('bug#4 — zeroing the protected weight (eta=0) does not disable the structural veto', () => {
  const g = gateProposal({
    stateBefore: { protectedPathViolations: 0 },
    stateAfter: { protectedPathViolations: 1 },
    weights: { ...DEFAULT_WEIGHTS, eta: 0 },
  });
  assert.equal(g.result.accept, false, 'veto is structural, not weight-based');
  assert.equal(g.result.protectedPathVeto, true);
});

// =====================================================================
// Round 2 — regressions for the 2026-05-30 multi-agent attack findings.
// =====================================================================

test('attack — KL length mismatch is treated as maximal drift and REJECTS', () => {
  const before = { claimedDistribution: [0.34, 0.33, 0.33], verifiedDistribution: [0.34, 0.33, 0.33] };
  const after = { claimedDistribution: [0.999, 0.0005, 0.0005], verifiedDistribution: [0.5, 0.5] };
  const u = computeU(after);
  assert.notEqual(u.result.components.klDivergence.skipped, true, 'length mismatch must not skip');
  assert.equal(gateProposal({ stateBefore: before, stateAfter: after }).result.accept, false);
});

test('attack — fractional outcomes cannot evade the repeated-failure penalty', () => {
  const u = computeU({ predictions: Array(200).fill(0.99), outcomes: Array(200).fill(0.0001) });
  assert.equal(u.result.contributions.repeatedFailure, DEFAULT_WEIGHTS.kappa * 200, 'all 200 must count');
});

test('attack — p=0.5 max-uncertainty is never counted confidently-wrong (either polarity)', () => {
  const zeros = computeU({ predictions: Array(100).fill(0.5), outcomes: Array(100).fill(0) });
  const ones = computeU({ predictions: Array(100).fill(0.5), outcomes: Array(100).fill(1) });
  assert.equal(zeros.result.contributions.repeatedFailure ?? 0, 0);
  assert.equal(ones.result.contributions.repeatedFailure ?? 0, 0);
});

test('attack — out-of-range outcome fails CLOSED, gate REJECTS (was: all terms skip -> accept)', () => {
  const g = gateProposal({ stateBefore: { predictions: [], outcomes: [] }, stateAfter: { predictions: [0.99], outcomes: [2] } });
  assert.equal(g.result.accept, false, 'malformed input must not slip a transition through');
  const u = computeU({ predictions: [0.99], outcomes: [2] });
  assert.ok(u.result.contributions.malformedForecast > 0, 'malformed input must raise U');
});

test('attack — secret distribution keys (and split chunks) are dropped via closed-set projection', () => {
  const secret = 'ghp_' + 'a'.repeat(76); // 80 chars: defeats the old ≤40 length cap by splitting
  const rec = buildTraceRecord({
    lane: 't', runId: 'r',
    stateBefore: { claimPromotionDistribution: { draft: 5, [secret]: 3, [secret.slice(0, 40)]: 1, [secret.slice(40)]: 1 } },
    stateAfter: {},
  });
  assert.ok(!JSON.stringify(rec).includes('ghp_'), 'no secret chunk may reach the record');
  assert.deepEqual(Object.keys(rec.stateBefore_summary.claimPromotionDistribution), ['draft']);
});

test('drift — trace CANONICAL_PROMOTION_LABELS equals sanitize PROMOTION_LADDER_LABELS', () => {
  assert.deepEqual([...CANONICAL_PROMOTION_LABELS], [...PROMOTION_LADDER_LABELS]);
});
