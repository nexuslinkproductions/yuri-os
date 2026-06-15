// nano-dispatch-gated.test.mjs — hermetic (mocked lanes, no real spawns).
// @capability-test: nano-dispatch-gated
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dispatchGated, defaultCheckArtifact, buildExecutePrompt, buildDesignPrompt } from './nano-dispatch-gated.mjs';

function mockRunner(seq) {
  const calls = [];
  const runLane = async (args) => { calls.push(args); return seq.shift() ?? { output: 'ok', exitCode: 0 }; };
  runLane.calls = calls;
  return runLane;
}
const tmpSpec = () => mkdtempSync(join(tmpdir(), 'g-spec-'));

describe('dispatchGated — artifact-gated 2-stage', () => {
  test('happy path: design -> execute -> gate ok on attempt 1', async () => {
    const runLane = mockRunner([{ output: 'THE SPEC', exitCode: 0 }, { output: '', exitCode: 0 }]);
    const r = await dispatchGated(
      { task: 't', artifactPath: 'x.mjs', testCmd: 'node --test x' },
      { runLane, checkArtifact: () => ({ ok: true, exists: true, fresh: true, testPass: true }), now: () => 1000, specDir: tmpSpec() },
    );
    assert.equal(r.ok, true);
    assert.equal(r.attempts, 1);
    assert.match(runLane.calls[0].prompt, /DESIGN ONLY/);          // stage 1 is design
    assert.match(runLane.calls[1].prompt, /CONSTRUCTION ONLY/);    // stage 2 is construction
    assert.match(runLane.calls[1].prompt, /THE SPEC/);             // execute lane fed the design spec
    assert.equal(runLane.calls[0].model, 'deepseek-v4-pro:cloud'); // design model
    assert.equal(runLane.calls[1].model, 'minimax-m3:cloud');      // execute model
  });

  test('re-prompt loop: gate fails attempt 1, passes attempt 2', async () => {
    const runLane = mockRunner([{ output: 'SPEC', exitCode: 0 }, { output: '', exitCode: 0 }, { output: '', exitCode: 0 }]);
    const results = [{ ok: false, exists: false, fresh: false, testPass: false }, { ok: true, exists: true, fresh: true, testPass: true }];
    const r = await dispatchGated(
      { task: 't', artifactPath: 'x.mjs', maxExecuteAttempts: 3 },
      { runLane, checkArtifact: () => results.shift(), now: () => 1, specDir: tmpSpec() },
    );
    assert.equal(r.ok, true);
    assert.equal(r.attempts, 2);
    const execPrompts = runLane.calls.filter((c) => /CONSTRUCTION ONLY/.test(c.prompt));
    assert.match(execPrompts[1].prompt, /RE-ATTEMPT 2/);           // the forcing escalation fired
  });

  test('exhaustion: gate never passes -> ok=false after maxExecuteAttempts', async () => {
    const runLane = mockRunner([{ output: 'SPEC', exitCode: 0 }]);
    const r = await dispatchGated(
      { task: 't', artifactPath: 'x.mjs', maxExecuteAttempts: 2 },
      { runLane, checkArtifact: () => ({ ok: false, exists: false }), now: () => 1, specDir: tmpSpec() },
    );
    assert.equal(r.ok, false);
    assert.equal(r.attempts, 2);
    assert.equal(r.stage, 'execute');
  });

  test('design produces no spec -> ok=false stage design, execute never fires', async () => {
    const runLane = mockRunner([{ output: '', exitCode: 0 }]);
    const r = await dispatchGated({ task: 't', artifactPath: 'x.mjs' }, { runLane, now: () => 1, specDir: tmpSpec() });
    assert.equal(r.ok, false);
    assert.equal(r.stage, 'design');
    assert.equal(runLane.calls.length, 1);
  });

  test('preconditions fail closed', async () => {
    assert.equal((await dispatchGated({ artifactPath: 'x' })).ok, false);
    assert.equal((await dispatchGated({ task: 't' })).ok, false);
  });
});

describe('buildExecutePrompt escalation', () => {
  test('attempt 1 has no RE-ATTEMPT; attempt>1 does', () => {
    assert.doesNotMatch(buildExecutePrompt('s', { artifactPath: 'a', attempt: 1 }), /RE-ATTEMPT/);
    assert.match(buildExecutePrompt('s', { artifactPath: 'a', attempt: 3 }), /RE-ATTEMPT 3/);
  });
  test('buildDesignPrompt forbids writing', () => {
    assert.match(buildDesignPrompt('do x', { artifactPath: 'a.mjs' }), /do NOT write or edit any file/i);
  });
});

describe('defaultCheckArtifact', () => {
  test('missing file -> not ok', () => {
    const r = defaultCheckArtifact({ artifactPath: '/no/such/file.mjs', sinceMs: 0 });
    assert.equal(r.ok, false);
    assert.equal(r.exists, false);
  });
  test('fresh file (mtime >= sinceMs) + no testCmd -> ok', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ca-')); const p = join(dir, 'f.mjs');
    writeFileSync(p, 'x');
    const r = defaultCheckArtifact({ artifactPath: p, sinceMs: 1000, cwd: dir });
    assert.equal(r.ok, true);
    assert.equal(r.fresh, true);
    rmSync(dir, { recursive: true, force: true });
  });
  test('stale file (mtime before sinceMs) -> not fresh -> not ok', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ca-')); const p = join(dir, 'f.mjs');
    writeFileSync(p, 'x');
    const r = defaultCheckArtifact({ artifactPath: p, sinceMs: Date.now() + 3_600_000, cwd: dir });
    assert.equal(r.exists, true);
    assert.equal(r.fresh, false);
    assert.equal(r.ok, false);
    rmSync(dir, { recursive: true, force: true });
  });
});
