import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadActiveProcesses } from './work-dashboard.mjs';

test('loadActiveProcesses returns structured process list', () => {
  const r = loadActiveProcesses({ limit: 5 });
  assert.ok(Array.isArray(r.processes));
  assert.ok(typeof r.openCount === 'number');
  assert.ok(r.generatedAt);
});

test('loadActiveProcesses includes recent ollama smoke spawns when present', () => {
  const r = loadActiveProcesses({ limit: 20 });
  const olf = r.processes.filter((p) => p.runId?.startsWith('olf-'));
  if (olf.length) {
    assert.ok(olf.some((p) => p.label && p.lane));
  }
});
