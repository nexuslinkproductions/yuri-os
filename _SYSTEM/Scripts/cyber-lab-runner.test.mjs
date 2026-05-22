import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { materializeCyberLabHarness } from './cyber-lab-harness.mjs';
import { EXECUTABLE_TEST_PATH, runCyberLab, runCyberLabs } from './cyber-lab-runner.mjs';

test('cyber lab runner proves every materialized local fixture with benign controls', () => {
  const runs = runCyberLabs();

  assert.equal(runs.length, 7);
  assert.ok(runs.every((run) => run.state === 'proven'));
  assert.ok(runs.every((run) => run.executableTest === EXECUTABLE_TEST_PATH));
  assert.ok(runs.every((run) => /fixture proof only/i.test(run.claim)));
  assert.ok(runs.every((run) => run.results.length >= 2));
  assert.ok(runs.every((run) => run.results.every((result) => result.ok === true)));
  assert.ok(runs.every((run) => run.results.some((result) => result.evidence.expectedThreat === false)));
});

test('cyber lab runner can execute a freshly materialized harness', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-cyber-lab-runner-'));
  try {
    materializeCyberLabHarness({ labRoot: path.join(dir, 'labs') });
    const runs = runCyberLabs({ labRoot: path.join(dir, 'labs') });

    assert.equal(runs.length, 7);
    assert.ok(runs.every((run) => run.state === 'proven'));
    assert.ok(runs.every((run) => run.results.every((result) => result.ok === true)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cyber lab runner fails closed when an evaluator is unknown', () => {
  const run = runCyberLab({
    id: 'unknown-lab',
    fixture: 'fixtures/prompt-injection-replay.json',
    fixtureKind: 'json',
  });

  assert.equal(run.state, 'failed');
  assert.equal(run.results[0].ok, false);
  assert.match(run.results[0].reason, /no deterministic evaluator/);
});

test('cyber lab runner fails closed when fixture is missing', () => {
  const run = runCyberLab({
    id: 'prompt-injection-replay',
    fixture: 'fixtures/does-not-exist.json',
    fixtureKind: 'json',
  });

  assert.equal(run.state, 'missing-fixture');
  assert.equal(run.executableTest, null);
  assert.deepEqual(run.results, []);
  assert.equal(existsSync(path.join(os.tmpdir(), 'does-not-exist.json')), false);
});
