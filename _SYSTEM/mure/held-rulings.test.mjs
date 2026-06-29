import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadHeldRulings, isSubtaskClearedByOwner } from './held-rulings.mjs';
import { planCompany } from './company.mjs';

test('GREEN: owner lock clears WS-A steward gate for cast', async () => {
  const task = JSON.parse(fs.readFileSync('02_RESOURCES/TASKS/mure-buildout-ws-a-governance.json', 'utf8'));
  const p = await planCompany(task);
  assert.equal(p.clearedHeld?.length, 1);
  assert.equal(p.clearedHeld[0].subtaskId, 'WS-A-S1-steward-gate');
  assert.equal(p.held.length, 0);
  assert.ok(p.summary.glm >= 1);
});

test('RED: finalize subtasks never cleared by ruling', () => {
  const bundle = loadHeldRulings();
  assert.equal(isSubtaskClearedByOwner('any', { finalize: true }, bundle), false);
});

test('GREEN: loadHeldRulings reads committed owner lock', () => {
  const b = loadHeldRulings();
  assert.ok(b.source?.includes('mure-held-rulings-owner-lock.json'));
  assert.ok(b.map.has('WS-A-S1-steward-gate'));
  assert.ok(b.map.has('P8-H1-helmsman-finalize'));
});
