import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findLatestHelmsmanSummary, loadHeldQueue } from './work-dashboard.mjs';

test('GREEN: findLatestHelmsmanSummary prefers newest helmsman-summary', () => {
  const latest = findLatestHelmsmanSummary();
  assert.ok(latest?.abs, 'expected a helmsman-summary on disk');
  assert.match(latest.rel, /helmsman-summary\.json$/);
});

test('GREEN: loadHeldQueue reads from latest summary path', () => {
  const latest = findLatestHelmsmanSummary();
  const hq = loadHeldQueue();
  if (latest) assert.equal(hq.source, latest.rel);
  assert.ok(Array.isArray(hq.items));
  assert.ok(Array.isArray(hq.visualPlanGates));
});
