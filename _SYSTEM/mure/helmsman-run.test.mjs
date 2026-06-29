// helmsman-run visual-plan gate — green/red/grey over checkVisualPlanGate
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkVisualPlanGate } from './helmsman-run.mjs';

// ── GREEN ───────────────────────────────────────────────────────────────────
test('GREEN: visualPlanApproved satisfies gate when visualPlanUrl is set', () => {
  const g = checkVisualPlanGate({
    visualPlanUrl: '/visual-plan',
    visualPlanSlug: 'recap-fb61bca8b66d4ba8',
    visualPlanHostedUrl: 'https://plan.agent-native.com/recap-fb61bca8b66d4ba8',
    visualPlanApproved: true,
    visualRecapUrl: '/visual-recap',
    tags: ['visual', 'dashboard'],
    subtasks: [{}, {}, {}, {}, {}],
  });
  assert.equal(g.required, true);
  assert.equal(g.satisfied, true);
  assert.equal(g.reason, 'visual plan present');
  assert.equal(g.visualPlanSlug, 'recap-fb61bca8b66d4ba8');
});

// ── RED ─────────────────────────────────────────────────────────────────────
test('RED: visualPlanUrl without approval or hosted slug is unsatisfied', () => {
  const g = checkVisualPlanGate({
    visualPlanUrl: '/visual-plan',
    tags: ['visual'],
    subtasks: [{}, {}, {}, {}],
  });
  assert.equal(g.required, true);
  assert.equal(g.satisfied, false);
  assert.match(g.reason, /visualPlanUrl/);
});

// ── GREY ────────────────────────────────────────────────────────────────────
test('GREY: small non-visual task with requiresVisualPlan false is not required', () => {
  const g = checkVisualPlanGate({
    requiresVisualPlan: false,
    tags: ['mure', 'fleet'],
    subtasks: [{}, {}, {}],
  });
  assert.equal(g.required, false);
  assert.equal(g.satisfied, false);
  assert.equal(g.reason, 'not required');
});
