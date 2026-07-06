// MURE governance gate — red/grey/green.
// GREEN: a fully-safe decision self-governs; each gate reads true on a safe input.
// RED:   every single failure (each gate + each veto) forces owner-gated; missing info is conservatively gated.
// GREY:  exhaustive 2^6 truth-table (mutation-survivor sweep) — self-governable IFF all six gates pass;
//        monotonicity (a new failure never un-gates); veto dominance; determinism.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGovernance, evaluateGates, constitutionVeto, CLASS, GATES, BLAST } from './governance.mjs';

const SAFE = Object.freeze({ id: 'safe', reversible: true, evidenceDecidable: true, inDoctrine: true, blastRadius: 'LOW', outwardFacing: false, contended: false });

// ── GREEN ───────────────────────────────────────────────────────────────────
test('GREEN: a fully-safe decision is self-governable', () => {
  const r = evaluateGovernance(SAFE);
  assert.equal(r.class, CLASS.SELF);
  assert.equal(r.failures.length, 0);
  assert.equal(r.veto, false);
  for (const g of GATES) assert.equal(r.gates[g], true, `gate ${g} should pass`);
});

test('GREEN: blast=MEDIUM is still self-governable (boundary is <=MEDIUM)', () => {
  assert.equal(evaluateGovernance({ ...SAFE, blastRadius: 'MEDIUM' }).class, CLASS.SELF);
});

// ── RED ───────────────────────────────────────────────────────────────────
const SINGLE_FAILS = {
  'not-reversible': { reversible: false },
  'not-evidence-decidable': { evidenceDecidable: false },
  'out-of-doctrine': { inDoctrine: false },
  'blast-HIGH': { blastRadius: 'HIGH' },
  'blast-CRITICAL': { blastRadius: 'CRITICAL' },
  'outward-facing': { outwardFacing: true },
  'contended': { contended: true },
};
for (const [name, patch] of Object.entries(SINGLE_FAILS)) {
  test(`RED: ${name} → owner-gated`, () => {
    assert.equal(evaluateGovernance({ ...SAFE, ...patch }).class, CLASS.OWNER);
  });
}

test('RED: protected-path file → owner-gated via constitution veto', () => {
  const r = evaluateGovernance({ ...SAFE, files: ['backend/data/x.db'] });
  assert.equal(r.class, CLASS.OWNER);
  assert.equal(r.veto, true);
  assert.ok(r.vetoReasons.some((x) => x.includes('protected-path')));
});

test('RED: arming a gate → owner-gated even with everything else safe', () => {
  const r = evaluateGovernance({ ...SAFE, arming: true });
  assert.equal(r.class, CLASS.OWNER);
  assert.ok(r.vetoReasons.includes('arming-a-gate'));
});

test('RED: secrets → owner-gated', () => {
  assert.equal(evaluateGovernance({ ...SAFE, touchesSensitive: true }).class, CLASS.OWNER);
});

test('RED: empty/missing decision is conservatively owner-gated', () => {
  assert.equal(evaluateGovernance({}).class, CLASS.OWNER);
  // missing blast defaults to HIGH (conservative), missing booleans default to fail
  assert.equal(evaluateGates({}).blastRadius, false);
});

// ── RED (regression — adversarial-verification round, 2026-06-22) ──────────────
test('RED regression (native#1): a negative/malformed numeric blast reads as HIGH, not "safer than LOW"', () => {
  assert.equal(evaluateGovernance({ ...SAFE, blastRadius: -1 }).class, CLASS.OWNER);
  assert.equal(evaluateGovernance({ ...SAFE, blastRadius: 99 }).class, CLASS.OWNER);
  assert.equal(evaluateGovernance({ ...SAFE, blastRadius: 1.5 }).class, CLASS.OWNER);
});

test('RED regression (native#3): a truthy non-boolean outward/contended/arming gates (no === true bypass)', () => {
  assert.equal(evaluateGovernance({ ...SAFE, outwardFacing: 'true' }).class, CLASS.OWNER);
  assert.equal(evaluateGovernance({ ...SAFE, contended: 1 }).class, CLASS.OWNER);
  assert.equal(evaluateGovernance({ ...SAFE, arming: 'yes' }).class, CLASS.OWNER);
});

test('RED regression (GLM#1 + re-verify): the gate cannot authorize editing ITSELF, any case or separator', () => {
  assert.equal(evaluateGovernance({ ...SAFE, files: ['_SYSTEM/mure/governance.mjs'] }).class, CLASS.OWNER);
  assert.equal(evaluateGovernance({ ...SAFE, files: ['_SYSTEM/MURE/Governance.mjs'] }).class, CLASS.OWNER);
  assert.equal(evaluateGovernance({ ...SAFE, files: ['_SYSTEM\\mure\\governance.mjs'] }).class, CLASS.OWNER); // backslash variant
});

test('RED regression (native#2): protected paths are matched case-insensitively (case-insensitive FS)', () => {
  assert.equal(evaluateGovernance({ ...SAFE, files: ['BACKEND/data/x'] }).class, CLASS.OWNER);
  assert.equal(evaluateGovernance({ ...SAFE, files: ['.ENV'] }).class, CLASS.OWNER);
});

// ── GREY ───────────────────────────────────────────────────────────────────
// Map a 6-bit vector → a decision exercising exactly the six gates.
function fromBits(b) {
  return {
    reversible: !!b[0], evidenceDecidable: !!b[1], inDoctrine: !!b[2],
    blastRadius: b[3] ? 'LOW' : 'HIGH', outwardFacing: !b[4], contended: !b[5],
  };
}

test('GREY (mutation-survivor sweep): all 2^6 gate combos — self-governable IFF all six pass', () => {
  let selfCount = 0;
  for (let mask = 0; mask < 64; mask += 1) {
    const bits = Array.from({ length: 6 }, (_, i) => (mask >> i) & 1);
    const all = bits.every(Boolean);
    const cls = evaluateGovernance(fromBits(bits)).class;
    if (all) { assert.equal(cls, CLASS.SELF, `all-pass mask ${mask} must self-govern`); selfCount += 1; }
    else assert.equal(cls, CLASS.OWNER, `mask ${mask} (a gate fails) must owner-gate`);
  }
  assert.equal(selfCount, 1, 'exactly one of 64 combos (all-true) self-governs');
});

test('GREY (monotonicity): adding any failure to a safe decision never un-gates it', () => {
  // From all-true, flip every non-empty subset of gates to fail → must be owner-gated, never self.
  for (let mask = 1; mask < 64; mask += 1) {
    const bits = Array.from({ length: 6 }, (_, i) => (((mask >> i) & 1) ? 0 : 1)); // 1 in mask = that gate FAILS
    assert.equal(evaluateGovernance(fromBits(bits)).class, CLASS.OWNER, `mask ${mask} introduced a failure → owner-gated`);
  }
});

test('GREY (veto dominance): a veto owner-gates even when all six gates pass', () => {
  const allPass = fromBits([1, 1, 1, 1, 1, 1]);
  assert.equal(evaluateGovernance(allPass).class, CLASS.SELF); // baseline
  assert.equal(evaluateGovernance({ ...allPass, files: ['.env'] }).class, CLASS.OWNER);
  assert.equal(evaluateGovernance({ ...allPass, arming: true }).class, CLASS.OWNER);
});

test('GREY (determinism): identical input yields identical ruling', () => {
  const a = evaluateGovernance(SAFE);
  const b = evaluateGovernance(SAFE);
  assert.deepEqual(a, b);
});

test('GREY (independent oracle): constitutionVeto agrees with the full ruling on veto presence', () => {
  for (const d of [SAFE, { ...SAFE, files: ['.env'] }, { ...SAFE, arming: true }, { ...SAFE, files: ['.claude/state/x'] }]) {
    const veto = constitutionVeto(d).veto;
    const ruling = evaluateGovernance(d);
    assert.equal(veto, ruling.veto, 'constitutionVeto must match ruling.veto');
    if (veto) assert.equal(ruling.class, CLASS.OWNER);
  }
});

test('GREY (blast ordering invariant): higher blast is never more permissive', () => {
  const order = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  let prevSelf = true;
  for (const b of order) {
    const isSelf = evaluateGovernance({ ...SAFE, blastRadius: b }).class === CLASS.SELF;
    if (!prevSelf) assert.equal(isSelf, false, `blast ${b} must not be self when a lower blast was already gated`);
    prevSelf = isSelf;
  }
  assert.equal(BLAST.LOW < BLAST.HIGH, true);
});
