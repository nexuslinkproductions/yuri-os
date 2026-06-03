import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BREAKER_STATE, DEFAULT_BREAKER_CFG, freshBreaker, normBreaker,
  isCatastrophic, transitionOnVerdict, evaluateGate, verdictFromStates, loadBreakerCfg,
} from './energy-breaker.mjs';

const VETO_PROTECTED = { accept: false, protectedPathVeto: true, structuralFloorVeto: false, deltaU: 100, dominantTerm: 'protectedPathViolations' };
const VETO_STRUCT = { accept: false, protectedPathVeto: false, structuralFloorVeto: true, deltaU: 10, dominantTerm: 'promotionLadderInversions' };
const CLEAN = { accept: true, protectedPathVeto: false, structuralFloorVeto: false, deltaU: -1, dominantTerm: null };

const HALF = () => ({ ...freshBreaker(), state: BREAKER_STATE.HALF_OPEN, halfOpenAt: 1000 });
const OPEN = () => ({ ...freshBreaker(), state: BREAKER_STATE.OPEN, openedAt: 1000, reason: 'protected-path veto' });

test('freshBreaker is CLOSED', () => {
  assert.equal(freshBreaker().state, BREAKER_STATE.CLOSED);
});

test('isCatastrophic flags only the non-offsettable veto classes', () => {
  assert.equal(isCatastrophic(VETO_PROTECTED), true);
  assert.equal(isCatastrophic(VETO_STRUCT), true);
  assert.equal(isCatastrophic(CLEAN), false);
  assert.equal(isCatastrophic(null), false);
  assert.equal(isCatastrophic({}), false);
});

test('transitionOnVerdict: protected-path veto trips CLOSED -> OPEN', () => {
  const b = transitionOnVerdict(freshBreaker(), VETO_PROTECTED, 1000);
  assert.equal(b.state, BREAKER_STATE.OPEN);
  assert.equal(b.openedAt, 1000);
  assert.match(b.reason, /protected-path/);
});

test('transitionOnVerdict: structural-floor veto trips -> OPEN', () => {
  const b = transitionOnVerdict(freshBreaker(), VETO_STRUCT, 1000);
  assert.equal(b.state, BREAKER_STATE.OPEN);
  assert.match(b.reason, /structural-floor/);
});

test('transitionOnVerdict: clean accept in CLOSED stays CLOSED', () => {
  assert.equal(transitionOnVerdict(freshBreaker(), CLEAN, 1000).state, BREAKER_STATE.CLOSED);
});

test('transitionOnVerdict: HALF_OPEN + clean -> CLOSED (probe recovered)', () => {
  assert.equal(transitionOnVerdict(HALF(), CLEAN, 2000).state, BREAKER_STATE.CLOSED);
});

test('transitionOnVerdict: HALF_OPEN + veto -> OPEN (probe failed)', () => {
  assert.equal(transitionOnVerdict(HALF(), VETO_PROTECTED, 2000).state, BREAKER_STATE.OPEN);
});

test('transitionOnVerdict never mutates the input', () => {
  const input = freshBreaker();
  const snapshot = JSON.stringify(input);
  transitionOnVerdict(input, VETO_PROTECTED, 1000);
  assert.equal(JSON.stringify(input), snapshot);
});

test('evaluateGate: OPEN within cooldown -> deny (fail-fast)', () => {
  const r = evaluateGate(OPEN(), 1000 + 5000, { ...DEFAULT_BREAKER_CFG, waitDurationMs: 20000 });
  assert.equal(r.decision, 'deny');
  assert.equal(r.breaker.state, BREAKER_STATE.OPEN);
  assert.match(r.reason, /OPEN/);
});

test('evaluateGate: OPEN after cooldown -> probe (OPEN -> HALF_OPEN)', () => {
  const r = evaluateGate(OPEN(), 1000 + 25000, { ...DEFAULT_BREAKER_CFG, waitDurationMs: 20000 });
  assert.equal(r.decision, 'probe');
  assert.equal(r.breaker.state, BREAKER_STATE.HALF_OPEN);
  assert.equal(r.breaker.halfOpenAt, 26000);
});

test('evaluateGate: OPEN with FUTURE openedAt (clock skew/tamper) -> probe, not permanent deny [bug-bounty regression]', () => {
  // openedAt in the future => elapsed negative => must NOT deny forever.
  const open = { ...freshBreaker(), state: BREAKER_STATE.OPEN, openedAt: 1000000, reason: 'protected-path veto' };
  const r = evaluateGate(open, 1000, { ...DEFAULT_BREAKER_CFG, waitDurationMs: 20000 });
  assert.equal(r.decision, 'probe');
  assert.equal(r.breaker.state, BREAKER_STATE.HALF_OPEN);
});

test('evaluateGate: HALF_OPEN within dwell -> probe', () => {
  const r = evaluateGate(HALF(), 1000 + 5000, { ...DEFAULT_BREAKER_CFG, maxHalfOpenMs: 60000 });
  assert.equal(r.decision, 'probe');
});

test('evaluateGate: HALF_OPEN past maxHalfOpen -> allow + auto-escape to CLOSED (anti-stuck)', () => {
  const r = evaluateGate(HALF(), 1000 + 90000, { ...DEFAULT_BREAKER_CFG, maxHalfOpenMs: 60000 });
  assert.equal(r.decision, 'allow');
  assert.equal(r.breaker.state, BREAKER_STATE.CLOSED);
});

test('evaluateGate: CLOSED normal -> allow', () => {
  assert.equal(evaluateGate(freshBreaker(), 1000).decision, 'allow');
});

test('evaluateGate: CLOSED with ascending deltaU window -> steer (advisory)', () => {
  const b = { ...freshBreaker(), recentDeltaU: [1, 2, 3, 4, 5] };
  const r = evaluateGate(b, 1000, { ...DEFAULT_BREAKER_CFG, steerAscentWindow: 5, steerAscentCount: 3 });
  assert.equal(r.decision, 'steer');
});

test('evaluateGate: CLOSED with mostly-descending deltaU -> allow (no false steer)', () => {
  const b = { ...freshBreaker(), recentDeltaU: [-1, -2, 1, -3, -1] };
  const r = evaluateGate(b, 1000, { ...DEFAULT_BREAKER_CFG, steerAscentWindow: 5, steerAscentCount: 3 });
  assert.equal(r.decision, 'allow');
});

test('evaluateGate: malformed breaker -> fail-open allow (every junk shape)', () => {
  for (const junk of [null, undefined, 'OPEN', 42, [], { state: 'NONSENSE', openedAt: 'x' }, { state: BREAKER_STATE.OPEN, openedAt: NaN }]) {
    const r = evaluateGate(junk, 1000);
    assert.equal(r.decision, 'allow', `junk=${JSON.stringify(junk)} should fail-open`);
  }
});

test('normBreaker coerces garbage to CLOSED + bounds + drops non-finite deltaU', () => {
  const b = normBreaker({ state: 'WAT', openedAt: NaN, halfOpenAt: 'no', reason: 5, recentDeltaU: [1, 'x', 2, Infinity, 3] });
  assert.equal(b.state, BREAKER_STATE.CLOSED);
  assert.equal(b.openedAt, 0);
  assert.equal(b.halfOpenAt, 0);
  assert.equal(b.reason, '');
  assert.deepEqual(b.recentDeltaU, [1, 2, 3]);
});

test('verdictFromStates: a protected-path transition produces protectedPathVeto (real gate)', () => {
  const before = { protectedPathViolations: 0, verifiedEvidenceCount: 0, evidence: [], promotionLadderInversions: 0, predictions: [], outcomes: [] };
  const after = { ...before, protectedPathViolations: 1 };
  const v = verdictFromStates(before, after);
  assert.equal(v.protectedPathVeto, true);
  assert.equal(v.accept, false);
});

test('verdictFromStates: clean progress accepts, no veto', () => {
  const before = { protectedPathViolations: 0, verifiedEvidenceCount: 0, evidence: [], promotionLadderInversions: 0, predictions: [], outcomes: [] };
  const after = { ...before, verifiedEvidenceCount: 1, evidence: [{ base: 1, age: 0 }] };
  const v = verdictFromStates(before, after);
  assert.equal(v.protectedPathVeto, false);
  assert.equal(v.accept, true);
});

test('verdictFromStates never throws on garbage -> fail-open clean verdict', () => {
  assert.doesNotThrow(() => verdictFromStates(null, undefined));
  const v = verdictFromStates(null, undefined);
  assert.equal(v.accept, true);
  assert.equal(v.protectedPathVeto, false);
});

test('loadBreakerCfg honors env overrides, rejects bad values', () => {
  const c = loadBreakerCfg({ YURI_ENERGY_BREAKER_WAIT_MS: '5000', YURI_ENERGY_BREAKER_HALFOPEN_MS: 'bad' });
  assert.equal(c.waitDurationMs, 5000);
  assert.equal(c.maxHalfOpenMs, DEFAULT_BREAKER_CFG.maxHalfOpenMs); // bad -> default
});

test('full lifecycle: CLOSED -> trip OPEN -> cooldown probe -> clean -> CLOSED', () => {
  let b = freshBreaker();
  b = transitionOnVerdict(b, VETO_PROTECTED, 1000);            // trip
  assert.equal(b.state, BREAKER_STATE.OPEN);
  let g = evaluateGate(b, 5000, { ...DEFAULT_BREAKER_CFG, waitDurationMs: 20000 });
  assert.equal(g.decision, 'deny');                            // within cooldown
  g = evaluateGate(b, 30000, { ...DEFAULT_BREAKER_CFG, waitDurationMs: 20000 });
  assert.equal(g.decision, 'probe');                           // cooldown elapsed -> probe
  b = g.breaker;                                               // now HALF_OPEN
  assert.equal(b.state, BREAKER_STATE.HALF_OPEN);
  b = transitionOnVerdict(b, CLEAN, 31000);                    // probe succeeds
  assert.equal(b.state, BREAKER_STATE.CLOSED);                 // recovered
});
