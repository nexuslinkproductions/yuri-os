// MURE goal-engine — red/grey/green over PROPOSE→SCORE→GATE with hard caps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGoalCycle, scoreGoal, preFilter, SCORE_WEIGHTS, ADVANCE_THRESHOLD, MAX_CYCLES } from './goal-engine.mjs';

const GOOD = Object.freeze({ id: 'g', role: 'engineer', scope: 'build', capabilityFit: 0.95, reversible: true, blastRadius: 'LOW', evidenceDecidable: true, inDoctrine: true });

// ── GREEN ───────────────────────────────────────────────────────────────────
test('GREEN: a strong goal scores >= threshold and is selected', () => {
  const sc = scoreGoal(GOOD);
  assert.ok(sc.composite >= ADVANCE_THRESHOLD, `composite ${sc.composite}`);
  assert.equal(sc.advance, true);
  const cyc = runGoalCycle([GOOD], { tags: ['build'] }, { goalScope: ['build'] });
  assert.equal(cyc.selected.length, 1);
  assert.equal(cyc.selected[0].goal.id, 'g');
});

// ── RED ───────────────────────────────────────────────────────────────────
test('RED: a weak goal is parked (below threshold), not selected', () => {
  const weak = { ...GOOD, id: 'w', capabilityFit: 0.1, reversible: false, blastRadius: 'HIGH', evidenceDecidable: false };
  const cyc = runGoalCycle([weak], {}, { goalScope: ['build'] });
  assert.equal(cyc.selected.length, 0);
  assert.equal(cyc.parked.length, 1);
});

test('RED: constitution hard-stops DISCARD before scoring (protected / arming / outward / scope / gate-self-mod)', () => {
  const cyc = runGoalCycle([
    { ...GOOD, id: 'p', files: ['.env'] },
    { ...GOOD, id: 'a', arming: true },
    { ...GOOD, id: 'o', outwardFacing: true },
    { ...GOOD, id: 's', scope: 'launch-missiles' },
    { ...GOOD, id: 'self', files: ['_SYSTEM/mure/governance.mjs'] },
  ], {}, { goalScope: ['build'] });
  const reasons = Object.fromEntries(cyc.discarded.map((d) => [d.goal.id, d.reason]));
  assert.equal(reasons.p, 'protected-path-hard-stop');
  assert.equal(reasons.a, 'arming-hard-stop');
  assert.equal(reasons.o, 'outward-facing-hard-stop');
  assert.equal(reasons.s, 'scope-violation:launch-missiles');
  assert.equal(reasons.self, 'gate-self-modification');
  assert.equal(cyc.selected.length, 0);
});

test('RED: iteration ceiling halts the cycle', () => {
  const cyc = runGoalCycle([GOOD], {}, { goalScope: ['build'] }, { cycle: MAX_CYCLES });
  assert.equal(cyc.halted, true);
  assert.equal(cyc.haltReason, 'iteration-ceiling');
});

test('RED: intent-drift discards a goal whose tags do not overlap the context', () => {
  const cyc = runGoalCycle([{ ...GOOD, tags: ['unrelated'] }], { tags: ['build', 'feature'] }, { goalScope: ['build'] });
  assert.ok(cyc.discarded.some((d) => d.reason === 'intent-drift'));
});

// ── GREY ───────────────────────────────────────────────────────────────────
test('GREY (weights sum to 1)', () => {
  const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum ${sum}`);
});

test('GREY (composite bounded [0,1] over random goals)', () => {
  const rnd = (s) => { let x = s; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; };
  const r = rnd(42);
  for (let i = 0; i < 200; i += 1) {
    const g = { capabilityFit: r(), reversible: r() > 0.5, blastRadius: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][Math.floor(r() * 4)], evidenceDecidable: r() > 0.5, inDoctrine: r() > 0.5 };
    const c = scoreGoal(g).composite;
    assert.ok(c >= 0 && c <= 1, `composite ${c} out of range`);
  }
});

test('GREY (monotonicity): raising capabilityFit never lowers the composite', () => {
  let prev = -1;
  for (const cf of [0, 0.25, 0.5, 0.75, 1]) {
    const c = scoreGoal({ ...GOOD, capabilityFit: cf }).composite;
    assert.ok(c >= prev, `composite must be non-decreasing in capabilityFit (${c} < ${prev})`);
    prev = c;
  }
});

test('GREY (hard-stop dominates score): a protected goal with a perfect score is still discarded', () => {
  const perfectButProtected = { ...GOOD, id: 'pp', capabilityFit: 1, files: ['backend/data/x'] };
  assert.ok(scoreGoal(perfectButProtected).composite >= ADVANCE_THRESHOLD); // would-be selected on score alone
  const cyc = runGoalCycle([perfectButProtected], {}, { goalScope: ['build'] });
  assert.equal(cyc.selected.length, 0);
  assert.equal(cyc.discarded.length, 1);
});

test('GREY (determinism): identical cycle inputs produce identical classification', () => {
  const a = runGoalCycle([GOOD], { tags: ['build'] }, { goalScope: ['build'] });
  const b = runGoalCycle([GOOD], { tags: ['build'] }, { goalScope: ['build'] });
  assert.deepEqual(a.selected.map((s) => s.goal.id), b.selected.map((s) => s.goal.id));
});
