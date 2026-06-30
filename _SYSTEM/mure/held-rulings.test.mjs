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

test('RED: arming subtask blocked without allowArming ruling', () => {
  const bundle = { map: new Map([['x', { approved: true }]]) };
  assert.equal(isSubtaskClearedByOwner('x', { arming: true }, bundle), false);
});

test('GREEN: allowArming ruling clears arming steward gate', () => {
  const b = loadHeldRulings();
  assert.equal(isSubtaskClearedByOwner('WS-G-S1-steward-gate', { arming: true }, b), true);
  assert.ok(b.map.get('WS-G-S1-steward-gate')?.allowArming);
});

test('GREEN: owner lock includes evolver-global ruling', () => {
  const b = loadHeldRulings();
  assert.ok(b.map.has('evolver-arm'));
});
