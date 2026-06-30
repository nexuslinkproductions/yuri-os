import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companyDispatch, planWorkstream } from './company-dispatch.mjs';

test('GREEN: planWorkstream WS-A has zero blocking held after owner lock', async () => {
  const entry = await planWorkstream('02_RESOURCES/TASKS/mure-buildout-ws-a-governance.json');
  assert.equal(entry.blockingHeld, 0);
  assert.equal(entry.blocked, false);
  assert.equal(entry.clearedHeld, 1);
});

test('GREEN: WS-G fully clears after owner lock with allowArming on steward gate', async () => {
  const entry = await planWorkstream('02_RESOURCES/TASKS/mure-buildout-ws-g-cline-pass.json');
  assert.equal(entry.held, 0);
  assert.equal(entry.blockingHeld, 0);
  assert.equal(entry.blocked, false);
  assert.ok(entry.glm >= 1);
  assert.equal(entry.clearedHeld, 1);
});

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

test('GREEN: extractBlockingLeaves helper deduplicates and filters null leafId', async () => {
  // Import the internal helper for testing
  const { extractBlockingLeaves } = await import('./company-dispatch.mjs');

  const roundLog = [
    {
      verdict: {
        blocking: [
          { layer: 'obligation-floor', leafId: 'leaf-1', reason: 'missing' },
          { layer: 'adversarial', leafId: 'leaf-2', reason: 'gap' },
        ],
      },
    },
    {
      verdict: {
        blocking: [
          { layer: 'convergence', leafId: 'leaf-1', reason: 'recheck' }, // duplicate
          { layer: 'obligation-floor', leafId: null, reason: 'cross-cutting' },
        ],
      },
    },
  ];

  const blocking = extractBlockingLeaves(roundLog);
  assert.equal(blocking.length, 2);
  assert.ok(blocking.includes('leaf-1'));
  assert.ok(blocking.includes('leaf-2'));
});
