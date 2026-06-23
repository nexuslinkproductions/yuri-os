// Build Doctrine reader — red/grey/green. The safety-critical surface is the self-grading guardrail: A8b
// (the goalposts) must NEVER be a self-improvement target, an unevidenced advance must downgrade, churn must
// sink a fake advance, and a floor-axis regression must veto auto-exec. These are the alignment regressions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadDoctrine, directionFit, grade, underServedAxes, shouldAutoExec, blend, rankByDirection, weightOf, axisCoverage,
} from './doctrine.mjs';

const D = loadDoctrine({ fresh: true });

// ── GREEN ───────────────────────────────────────────────────────────────────
test('GREEN: doctrine loads v2 with the split/new axes', () => {
  assert.equal(D.version, 2);
  assert.equal(D.axes.length, 11);
  for (const id of ['A8a', 'A8b', 'A10']) assert.ok(D.axes.find((a) => a.id === id), `axis ${id} present`);
});

test('GREEN: directionFit sums weight·fit; type-hint infers fit', () => {
  const f = directionFit({ type: 'infra' }, { doctrine: D }); // infra → A1,A6 (weights 2,3)
  assert.equal(f.byAxis.A1.contrib + f.byAxis.A6.contrib, f.score);
  assert.ok(f.score > 0);
});

test('GREEN: rankByDirection sorts by priorityScore desc + preserves the priority label', () => {
  const jobs = [
    { id: 'a', type: 'gap', title: 'a', priority: 'high', mass: 3.0 },
    { id: 'b', type: 'infra', title: 'b', priority: 'low', mass: 3.0 },
  ];
  const r = rankByDirection(jobs, { doctrine: D });
  for (let i = 1; i < r.length; i += 1) assert.ok(r[i - 1].priorityScore >= r[i].priorityScore, 'desc priorityScore');
  assert.ok(r.every((j) => typeof j.priority === 'string'), 'priority LABEL not clobbered by the blended score');
  assert.equal(r[0].id, 'b', 'infra (A1+A6) outranks gap (A1) at equal mass');
});

// ── RED (safety / alignment) ─────────────────────────────────────────────────
test('RED: a claimed advance with NO evidence downgrades to none', () => {
  assert.equal(grade({ axis: 'A2', verdict: 'advanced', evidence: '' }, { doctrine: D }).verdict, 'none');
  assert.equal(grade({ axis: 'A2', verdict: 'partial', evidence: '   ' }, { doctrine: D }).verdict, 'none');
});

test('RED: an invalid verdict falls back to none', () => {
  assert.equal(grade({ axis: 'A1', verdict: 'amazing', evidence: 'x' }, { doctrine: D }).verdict, 'none');
});

test('RED (floor veto): a job regressing a floor axis is never auto-exec-eligible, even if urgent', () => {
  const f = directionFit({ type: 'x', fit: { A7: -1 } }, { doctrine: D });
  assert.equal(f.floorViolation, true);
  assert.equal(shouldAutoExec(99, f, { doctrine: D }), false);
});

// ── GREY (the Goodhart guardrails) ───────────────────────────────────────────
test('GREY (goalpost lock): A8b is NEVER a self-improvement target; A8a is', () => {
  const us = underServedAxes({}, { doctrine: D }).map((u) => u.axis);
  assert.ok(!us.includes('A8b'), 'company cannot earn credit for moving its own goalposts');
  assert.ok(!us.includes('A7'), 'floor axis is not a push target');
  assert.ok(us.includes('A8a'), 'engine machinery IS a target');
  assert.equal(weightOf('A8b', D.currentVector).weight, 0);
});

test('GREY (anti-churn): churn sinks a fake reliability advance toward/under zero', () => {
  const clean = grade({ axis: 'A2', verdict: 'advanced', evidence: 'green 11/11', churn: 0 }, { doctrine: D });
  const churny = grade({ axis: 'A2', verdict: 'advanced', evidence: 'green 11/11', churn: 2 }, { doctrine: D });
  assert.equal(clean.net, 1);
  assert.ok(churny.net < clean.net, 'churn reduces net'); assert.equal(churny.net, -1);
});

test('GREY (deterministic blend): priority = OpenMass + wDir·directionFit; stable across calls', () => {
  const a = blend(3, { score: 4 }, { doctrine: D });
  const b = blend(3, { score: 4 }, { doctrine: D });
  assert.equal(a, b); assert.equal(a, 3 + (D.selectionRubric.wDir ?? 1) * 4);
});

test('GREY (stale veto): zero-direction + low urgency is held; urgent OR directional runs', () => {
  assert.equal(shouldAutoExec(1.0, { score: 0 }, { doctrine: D }), false); // stale + no direction
  assert.equal(shouldAutoExec(9.0, { score: 0 }, { doctrine: D }), true);  // urgent enough
  assert.equal(shouldAutoExec(1.0, { score: 5 }, { doctrine: D }), true);  // directional
});

test('GREY: axisCoverage sums graded net per axis', () => {
  const cov = axisCoverage([
    grade({ axis: 'A2', verdict: 'advanced', evidence: 'x' }, { doctrine: D }),
    grade({ axis: 'A2', verdict: 'regressed', evidence: 'x' }, { doctrine: D }),
  ], { doctrine: D });
  assert.equal(cov.A2, 0, '+1 advanced and -1 regressed net to 0');
});
