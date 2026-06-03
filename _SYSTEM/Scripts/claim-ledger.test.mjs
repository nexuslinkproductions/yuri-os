import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshLedger, applyClaimTransition, claimGateFields, ledgerSummary } from './claim-ledger.mjs';
import { gateProposal, computeU } from './math/yuri-energy.mjs';

const NOW = 1_700_000_000_000;
const t = (over) => ({ tool: '', filePath: '', success: true, isMutating: false, isBash: false, protectedHit: false, ...over });

test('freshLedger is an empty ledger', () => {
  const l = freshLedger();
  assert.deepEqual(l.claims, []);
  assert.equal(l.seq, 0);
});

test('a mutating success authors ONE fixture_ready claim with fixture evidence (not an over-claim)', () => {
  const l = applyClaimTransition(freshLedger(), t({ tool: 'Edit', filePath: 'a.mjs', isMutating: true, success: true }), NOW);
  assert.equal(l.claims.length, 1);
  assert.equal(l.claims[0].id, 'a.mjs');
  assert.equal(l.claims[0].claimedStatus, 'fixture_ready', 'a written-but-untested edit is honestly fixture_ready');
  assert.equal(l.claims[0].evidence[0].kind, 'fixture');
});

test('a second edit to the same file appends evidence, does not duplicate the claim', () => {
  let l = applyClaimTransition(freshLedger(), t({ tool: 'Edit', filePath: 'a.mjs', isMutating: true, success: true }), NOW);
  l = applyClaimTransition(l, t({ tool: 'Edit', filePath: 'a.mjs', isMutating: true, success: true }), NOW + 1000);
  assert.equal(l.claims.length, 1);
  assert.equal(l.claims[0].evidence.length, 2);
});

test('a passing Bash promotes recent claims with test (runtime-grade) evidence', () => {
  let l = applyClaimTransition(freshLedger(), t({ tool: 'Edit', filePath: 'a.mjs', isMutating: true, success: true }), NOW);
  l = applyClaimTransition(l, t({ tool: 'Bash', isBash: true, success: true }), NOW + 1000);
  assert.ok(l.claims[0].evidence.some((e) => e.kind === 'test'), 'the passing command added test evidence');
});

test('protected-path hits and failures author NO claim (tool-event axis owns those)', () => {
  assert.equal(applyClaimTransition(freshLedger(), t({ isMutating: true, success: true, filePath: '.env', protectedHit: true }), NOW).claims.length, 0);
  assert.equal(applyClaimTransition(freshLedger(), t({ tool: 'Edit', filePath: 'a.mjs', isMutating: true, success: false }), NOW).claims.length, 0);
  assert.equal(applyClaimTransition(freshLedger(), t({ tool: 'Read' }), NOW).claims.length, 0);
});

test('the ledger is capped (never grows unbounded)', () => {
  let l = freshLedger();
  for (let i = 0; i < 60; i += 1) l = applyClaimTransition(l, t({ tool: 'Edit', filePath: `f${i}.mjs`, isMutating: true, success: true }), NOW + i);
  assert.ok(l.claims.length <= 40, 'capped at LEDGER_CAP');
});

test('applyClaimTransition never mutates its input ledger', () => {
  const l0 = freshLedger();
  applyClaimTransition(l0, t({ tool: 'Edit', filePath: 'a.mjs', isMutating: true, success: true }), NOW);
  assert.equal(l0.claims.length, 0, 'input untouched');
});

// --- claimGateFields: the SAFE projection ---

test('claimGateFields on an empty ledger returns {} (cortex contributes nothing)', () => {
  assert.deepEqual(claimGateFields(freshLedger(), NOW), {});
});

test('claimGateFields returns ONLY the dark-term fields — never a veto field', () => {
  let l = freshLedger();
  l = applyClaimTransition(l, t({ tool: 'Edit', filePath: 'a.mjs', isMutating: true, success: true }), NOW);
  const f = claimGateFields(l, NOW);
  assert.ok('claimPromotionDistribution' in f && 'claimedDistribution' in f && 'verifiedDistribution' in f && 'priorState' in f && 'posteriorState' in f);
  // SAFETY INVARIANT: the veto fields must NEVER be present — merging this can raise U
  // but can never introduce a protected-path or structural-floor veto.
  assert.equal('promotionLadderInversions' in f, false);
  assert.equal('protectedPathViolations' in f, false);
  assert.equal('verifiedEvidenceCount' in f, false);
});

test('claimGateFields fails OPEN on a garbage ledger (never throws)', () => {
  assert.deepEqual(claimGateFields(null, NOW), {});
  assert.deepEqual(claimGateFields({ claims: 'nope' }, NOW), {});
  assert.deepEqual(claimGateFields({ claims: [] }, NOW), {});
});

// --- the safety property that broke the energy-tick test, now pinned ---

test('SAFETY — a lone edit does NOT raise U enough to flip the gate (no spurious over-claim)', () => {
  const before = computeU({}).result.U;
  let l = applyClaimTransition(freshLedger(), t({ tool: 'Edit', filePath: 'a.mjs', isMutating: true, success: true }), NOW);
  const after = computeU(claimGateFields(l, NOW)).result.U;
  // a single honest fixture_ready claim: no drift, no inversion -> U must not ascend.
  assert.ok(after <= before + 1e-9, `a normal edit must not push U up (before ${before}, after ${after})`);
});

test('a test-promotion produces real beta drift + an epsilon credit (the dark terms fire)', () => {
  let l = freshLedger();
  l = applyClaimTransition(l, t({ tool: 'Edit', filePath: 'a.mjs', isMutating: true, success: true }), NOW);
  l = applyClaimTransition(l, t({ tool: 'Edit', filePath: 'b.mjs', isMutating: true, success: true }), NOW + 1);
  l = applyClaimTransition(l, t({ tool: 'Bash', isBash: true, success: true }), NOW + 2); // promotes both past fixture
  const res = computeU(claimGateFields(l, NOW + 3)).result;
  const fired = (c) => c.skipped !== true && Number.isFinite(c.value);
  assert.ok(fired(res.components.klDivergence), 'beta (claimed fixture_ready vs verified runtime_tested) fires');
  assert.ok(fired(res.components.informationGain), 'epsilon (belief sharpening) fires');
});

// --- wire red-team regression: a poisoned persisted ledger must NOT throw ---

test('REGRESSION (wire) — a poisoned ledger element (null/non-object) is skipped, never throws', () => {
  const poisoned = { claims: [null, undefined, 42, 'x', { id: 'good.mjs', claimedStatus: 'fixture_ready', evidence: [] }], seq: 0 };
  let l;
  assert.doesNotThrow(() => { l = applyClaimTransition(poisoned, t({ tool: 'Edit', filePath: 'new.mjs', isMutating: true, success: true }), NOW); });
  // the valid claim survives, the new one is added, the garbage is dropped.
  assert.ok(l.claims.every((c) => c && typeof c === 'object'), 'no poisoned elements remain');
  assert.ok(l.claims.some((c) => c.id === 'good.mjs') && l.claims.some((c) => c.id === 'new.mjs'));
  // and a protected-hit tick (early return) also cleans it (cloneClaims runs first).
  assert.doesNotThrow(() => applyClaimTransition({ claims: [null], seq: 0 }, t({ isMutating: true, success: true, protectedHit: true, filePath: '.env' }), NOW));
  // claimGateFields over a poisoned ledger stays fail-open.
  assert.doesNotThrow(() => claimGateFields(poisoned, NOW));
});

test('determinism — same inputs, same fields', () => {
  const build = () => {
    let l = freshLedger();
    l = applyClaimTransition(l, t({ tool: 'Edit', filePath: 'a.mjs', isMutating: true, success: true }), NOW);
    return claimGateFields(l, NOW);
  };
  assert.deepEqual(build(), build());
});

test('ledgerSummary reports claim count by claimed status', () => {
  let l = freshLedger();
  l = applyClaimTransition(l, t({ tool: 'Edit', filePath: 'a.mjs', isMutating: true, success: true }), NOW);
  const s = ledgerSummary(l);
  assert.equal(s.claimCount, 1);
  assert.equal(s.byClaimedStatus.fixture_ready, 1);
});
