import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companyDispatch, planWorkstream } from './company-dispatch.mjs';

test('GREEN: planWorkstream WS-A has zero blocking held after owner lock', async () => {
  const entry = await planWorkstream('02_RESOURCES/TASKS/mure-buildout-ws-a-governance.json');
  assert.equal(entry.blockingHeld, 0);
  assert.equal(entry.blocked, false);
  assert.equal(entry.clearedHeld, 1);
});

test('GREEN: WS-G partial dispatch when only arming subtask held', async () => {
  const entry = await planWorkstream('02_RESOURCES/TASKS/mure-buildout-ws-g-cline-pass.json');
  assert.equal(entry.held, 1);
  assert.equal(entry.blocked, false);
  assert.ok(entry.glm >= 1);
test('GREEN: companyDispatch dry-run-all produces manifest', async () => {
  const outDir = '_SYSTEM/lane-output/dispatch-test';
  const m = await companyDispatch({
    dryRunAll: true,
    apply: false,
    outDir: `${process.cwd()}/${outDir}`,
    taskFiles: [
      '02_RESOURCES/TASKS/mure-buildout-ws-a-governance.json',
      '02_RESOURCES/TASKS/mure-buildout-ws-b-fleet.json',
    ],
  });
  assert.ok(m.manifestPath);
  assert.equal(m.streams.length, 2);
  assert.equal(m.errors.length, 0);
  assert.ok(m.streams.every((s) => s.status === 'planned' || s.status === 'skipped-held'));
});
