import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';

import {
  buildDelegateEnvironment,
  evaluateUniversalPreTool,
  normalizePreToolEvent,
  renderHookDecision,
  runCli,
  runExternalDelegate,
} from './yuri-hook-adapter.mjs';
import {
  ROOT,
  loadRegistry,
  providerHealth,
  renderProvider,
  sparseBootstrapPlan,
  validateRegistry,
} from './yuri-hook-registry.mjs';

function capture() {
  let value = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      value += chunk.toString();
      callback();
    },
  });
  return { stream, read: () => value };
}

test('canonical registry validates hashes, roles, and dependency closure', () => {
  const result = validateRegistry(loadRegistry());
  assert.deepEqual(result, { ok: true, hooks: 2, hashedPaths: 8 });
});

test('provider projections are worktree-rooted and contain no canonical clone path', () => {
  const claude = JSON.stringify(renderProvider('claude'));
  const codex = JSON.stringify(renderProvider('codex'));
  const omp = renderProvider('omp');
  assert.match(claude, /CLAUDE_PROJECT_DIR/u);
  assert.match(codex, /git rev-parse --show-toplevel/u);
  assert.match(codex, /\[\[hooks\.PreToolUse\.hooks\]\]/u);
  assert.doesNotMatch(codex, /hooks\s*=\s*\[/u);
  assert.doesNotMatch(`${claude}${codex}`, /\/Users\/marcelspatz\/YURI-OS-MUSUBI/u);
  assert.equal(omp.module, '.omp/hooks/pre/url-safety-guard.js');
});

test('rendered Codex projection works from a nested worktree cwd and never exits 1', () => {
  const registry = loadRegistry();
  const command = registry.hooks
    .find((hook) => hook.hookId === 'yuri.pre-tool.enforcement')
    .providerAdapters.find((adapter) => adapter.provider === 'codex').command;
  const event = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git reset --hard HEAD' } });
  const result = spawnSync(command, {
    cwd: path.join(ROOT, '_SYSTEM/Scripts/policy'),
    encoding: 'utf8',
    input: event,
    shell: true,
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('health reports pending live projections and behavioral parity gaps without false-green activation', async () => {
  const health = await providerHealth();
  assert.equal(health.ok, false);
  assert.equal(health.checks.find((check) => check.id === 'omp-shared-safety-core').ok, true);
  assert.equal(health.checks.find((check) => check.id === 'omp-universal-pretool-parity').ok, false);
  assert.equal(health.checks.find((check) => check.id === 'canonical-protected-read-enforcement').ok, false);
  assert.equal(health.checks.find((check) => check.id === 'codex-root-anchored-pretool').ok, false);
  assert.equal(health.checks.find((check) => check.id === 'claude-universal-pretool').ok, false);
  assert.equal(health.checks.find((check) => check.id === 'claude-bounded-october-prompt').ok, false);
  assert.equal(health.checks.find((check) => check.id === 'codex-bounded-october-prompt').ok, false);
});

test('sparse bootstrap plan is no-write and the current dependency closure is materialized', () => {
  const plan = sparseBootstrapPlan();
  assert.equal(plan.mutates, false);
  assert.deepEqual(plan.missing, []);
  assert.equal(plan.command, null);
  assert.ok(plan.required.includes('_SYSTEM/Scripts/yuri-hook-adapter.mjs'));
});

test('Claude, Codex, and OMP inputs normalize onto one logical PreToolUse decision', () => {
  const claude = normalizePreToolEvent({ tool_name: 'Bash', tool_input: { command: 'echo ok' } }, 'claude');
  const codex = normalizePreToolEvent({ tool_name: 'Bash', tool_input: { command: 'echo ok' } }, 'codex');
  const omp = normalizePreToolEvent({ toolName: 'bash', input: { command: 'echo ok' } }, 'omp');
  assert.deepEqual(claude.toolInput, codex.toolInput);
  assert.deepEqual(codex.toolInput, omp.toolInput);
  for (const [harness, event] of [['claude', claude], ['codex', codex], ['omp', omp]]) {
    assert.equal(evaluateUniversalPreTool(event, { harness }).allowed, true);
  }
});

test('destructive command is a structured deny with harness-native output', () => {
  const event = { tool_name: 'Bash', tool_input: { command: 'git reset --hard HEAD' }, cwd: ROOT };
  const decision = evaluateUniversalPreTool(event, { harness: 'codex' });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /git reset --hard/u);
  assert.equal(renderHookDecision('codex', decision).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(renderHookDecision('claude', decision).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(renderHookDecision('omp', decision).block, true);
});

test('hook CLI never maps malformed JSON to exit 1', async () => {
  const out = capture();
  const code = await runCli(['--harness', 'codex'], {
    stdin: Readable.from(['{not-json']),
    stdout: out.stream,
  });
  assert.equal(code, 0);
  assert.equal(JSON.parse(out.read()).hookSpecificOutput.permissionDecision, 'deny');
});

test('check mode uses exit 0 for allow and exit 2 for deny', async () => {
  const benignOut = capture();
  const benign = await runCli(['--harness', 'codex', '--check'], {
    stdin: Readable.from([JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'echo ok' } })]),
    stdout: benignOut.stream,
  });
  assert.equal(benign, 0);
  assert.equal(benignOut.read(), '');

  const denyOut = capture();
  const denied = await runCli(['--harness', 'codex', '--check'], {
    stdin: Readable.from([JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git reset --hard HEAD' } })]),
    stdout: denyOut.stream,
  });
  assert.equal(denied, 2);
  assert.equal(JSON.parse(denyOut.read()).hookSpecificOutput.permissionDecision, 'deny');
});

test('October prompt delegate times out internally, emits no output, and remains fail-soft', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'yuri-hook-delegate-'));
  const script = path.join(directory, 'stall.mjs');
  writeFileSync(script, "setTimeout(() => process.stdout.write('late'), 1000);\n");
  try {
    const start = Date.now();
    const result = await runExternalDelegate({ script, mode: 'pre-prompt', timeoutMs: 40 });
    assert.equal(result.ok, false);
    assert.equal(result.timedOut, true);
    assert.equal(result.stdout, '');
    assert.ok(Date.now() - start < 500);

    const out = capture();
    const code = await runCli(['--delegate-october', 'pre-prompt', '--timeout-ms', '40'], {
      stdin: Readable.from(['{}']),
      stdout: out.stream,
      delegateScript: script,
    });
    assert.equal(code, 0);
    assert.equal(out.read(), '');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('synchronous delegate spawn defects resolve fail-soft instead of throwing or exiting 1', async () => {
  const result = await runExternalDelegate({
    script: import.meta.filename,
    mode: 'pre-prompt',
    spawnImpl() {
      throw new Error('fixture spawn failure');
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.timedOut, false);
  assert.match(result.reason, /fixture spawn failure/u);
});

test('October delegate receives only the minimal bus/process environment, never provider secrets', () => {
  const result = buildDelegateEnvironment({
    HOME: '/tmp/home',
    PATH: '/usr/bin',
    OCTOBER_BUS_PORT: '1234',
    OCTOBER_BUS_CANVAS: 'canvas',
    OCTOBER_BUS_NODE: 'node',
    OPENAI_API_KEY: 'must-not-pass',
    DEEPSEEK_API_KEY: 'must-not-pass',
  });
  assert.deepEqual(result, {
    HOME: '/tmp/home',
    OCTOBER_BUS_CANVAS: 'canvas',
    OCTOBER_BUS_NODE: 'node',
    OCTOBER_BUS_PORT: '1234',
    PATH: '/usr/bin',
  });
});
