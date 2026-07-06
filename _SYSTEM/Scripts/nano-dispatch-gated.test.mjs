// nano-dispatch-gated.test.mjs — hermetic (mocked lanes, no real spawns).
// @capability-test: nano-dispatch-gated
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dispatchGated, defaultCheckArtifact, buildExecutePrompt, buildDesignPrompt, aiHydratedLlmRunner } from './nano-dispatch-gated.mjs';

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
    assert.equal(runLane.calls[0].model, 'nemotron-3-ultra:cloud'); // design model (cost-routed default, owner 2026-06-15)
    assert.equal(runLane.calls[1].model, 'minimax-m3:cloud');       // execute model
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

describe('aiHydratedLlmRunner — keychain-hydrated dispatch (the 2026-06-16 hydration fix)', () => {
  // mock spawn so no real lane fires; capture the invocation to assert the wrapper routing + flag forwarding.
  function mockSpawn(result = { status: 0, stdout: '', stderr: '' }) {
    const calls = [];
    const spawn = (cmd, args, optsArg) => { calls.push({ cmd, args, opts: optsArg }); return result; };
    spawn.calls = calls;
    return spawn;
  }

  test('routes through `bash <…/ai> llm` (hydration path), NOT `node llm-lane.mjs`', () => {
    const spawn = mockSpawn();
    aiHydratedLlmRunner({ lane: 'ollama-cloud', prompt: 'P' }, { spawn, readFile: () => 'OUT' });
    const { cmd, args } = spawn.calls[0];
    assert.equal(cmd, 'bash');                       // spawned via bash so the wrapper's keychain hydration runs
    assert.match(args[0], /\/ai$/);                  // first arg is the ai wrapper, not llm-lane.mjs
    assert.equal(args[1], 'llm');                    // ai subcommand
    assert.equal(args[2], 'ollama-cloud');           // lane
    assert.equal(args[3], 'P');                       // prompt
  });

  test('forwards --out/--max-iters/--reasoning/--model/--context verbatim', () => {
    const spawn = mockSpawn();
    aiHydratedLlmRunner(
      { lane: 'ollama-cloud', prompt: 'P', reasoning: 'xhigh', model: 'minimax-m3:cloud', maxIters: 200, contextFiles: ['a.mjs', 'b.mjs'] },
      { spawn, readFile: () => 'OUT' },
    );
    const a = spawn.calls[0].args;
    assert.ok(a.includes('--out'));
    assert.equal(a[a.indexOf('--max-iters') + 1], '200');
    assert.equal(a[a.indexOf('--reasoning') + 1], 'xhigh');
    assert.equal(a[a.indexOf('--model') + 1], 'minimax-m3:cloud');
    assert.equal(a[a.indexOf('--context') + 1], 'a.mjs,b.mjs');  // joined CSV — llm-lane parses it
  });

  test('omits optional flags when absent (no --reasoning/--model/--context)', () => {
    const spawn = mockSpawn();
    aiHydratedLlmRunner({ lane: 'ollama-cloud', prompt: 'P' }, { spawn, readFile: () => 'OUT' });
    const a = spawn.calls[0].args;
    assert.ok(!a.includes('--reasoning'));
    assert.ok(!a.includes('--model'));
    assert.ok(!a.includes('--context'));
    assert.equal(a[a.indexOf('--max-iters') + 1], '200');        // default cap still present
  });

  test('captures lane output from the --out file', () => {
    const spawn = mockSpawn({ status: 0, stdout: 'STDOUT-NOISE', stderr: '' });
    const r = aiHydratedLlmRunner({ lane: 'ollama-cloud', prompt: 'P' }, { spawn, readFile: () => 'THE REAL LANE OUTPUT' });
    assert.equal(r.output, 'THE REAL LANE OUTPUT');               // prefers the out-file over stdout
    assert.equal(r.exitCode, 0);
  });

  test('falls back to stdout when the out file is unreadable (lane died early)', () => {
    const spawn = mockSpawn({ status: 1, stdout: 'partial stdout', stderr: 'boom' });
    const r = aiHydratedLlmRunner({ lane: 'ollama-cloud', prompt: 'P' }, { spawn, readFile: () => { throw new Error('ENOENT'); } });
    assert.equal(r.output, 'partial stdout');
    assert.equal(r.exitCode, 1);
    assert.equal(r.stderr, 'boom');
  });

  test('never reads a secret itself — env is passed through, key hydration is the wrapper’s job', () => {
    const spawn = mockSpawn();
    aiHydratedLlmRunner({ lane: 'ollama-cloud', prompt: 'P' }, { spawn, readFile: () => 'OUT' });
    // the runner must not inject OLLAMA_API_KEY (it doesn't read it); the wrapper hydrates downstream.
    const { opts } = spawn.calls[0];
    assert.equal(opts.env.OLLAMA_API_KEY, process.env.OLLAMA_API_KEY); // unchanged passthrough, no injection
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
