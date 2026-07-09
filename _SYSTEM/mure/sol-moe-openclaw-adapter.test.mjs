import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { createOpenClawSpawn } from './sol-moe-openclaw-adapter.mjs';

function request(overrides = {}) {
  return {
    id: 'task-7:producer:sol',
    taskId: 'task-7',
    purpose: 'producer',
    agentId: 'mure-engineer',
    model: 'openai/gpt-5.6-terra',
    thinking: 'high',
    prompt: 'Implement the bounded change.',
    routeKind: 'primary',
    attempt: 1,
    upstream: {
      evidence: [{ output: 'local evidence', model: 'deepseek/deepseek-v4-flash' }],
    },
    ...overrides,
  };
}

function jsonPayload(text) {
  return JSON.stringify({ payloads: [{ text }] });
}

function expectedSessionKey(item, executionId = 'test-execution') {
  const identity = JSON.stringify({
    executionId,
    taskId: item.taskId,
    purpose: item.purpose,
    entryId: item.id || null,
    routeKind: item.routeKind || null,
    attempt: item.attempt,
    agentId: item.agentId,
    model: item.model,
  });
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 24);
  return `agent:${item.agentId}:sol-moe:${digest}`;
}

test('is disarmed by default and never calls the process', async () => {
  let calls = 0;
  const spawn = createOpenClawSpawn({
    execFile: () => { calls += 1; },
  });
  const result = await spawn(request());

  assert.equal(calls, 0);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'disarmed');
  assert.equal(result.failureKind, 'availability');
  assert.equal(result.error.code, 'OPENCLAW_SPAWN_DISARMED');
});

test('requires both apply and owner confirmation', async () => {
  for (const gates of [{ apply: true }, { ownerConfirmed: true }]) {
    let calls = 0;
    const spawn = createOpenClawSpawn({
      ...gates,
      execFile: () => { calls += 1; },
    });
    const result = await spawn(request());
    assert.equal(calls, 0);
    assert.equal(result.error.code, 'OPENCLAW_SPAWN_DISARMED');
  }
});

test('uses exact safe argv and never enables delivery', async () => {
  const calls = [];
  const item = request();
  const spawn = createOpenClawSpawn({
    apply: true,
    ownerConfirmed: true,
    executionId: 'test-execution',
    timeoutMs: 12_345,
    execFile: (command, args, options, callback) => {
      calls.push({ command, args, options });
      callback(null, jsonPayload('producer result'), '');
    },
  });
  const result = await spawn(item);
  const prompt = calls[0].args[calls[0].args.indexOf('--message') + 1];

  assert.equal(result.ok, true);
  assert.deepEqual(calls[0].args, [
    'agent',
    '--agent', 'mure-engineer',
    '--model', 'openai/gpt-5.6-terra',
    '--thinking', 'high',
    '--session-key', expectedSessionKey(item),
    '--message', prompt,
    '--timeout', '13',
    '--json',
  ]);
  assert.equal(calls[0].command, 'openclaw');
  assert.equal(calls[0].options.timeout, 12_345);
  assert.match(prompt, /UPSTREAM EVIDENCE/);
  assert.match(prompt, /local evidence/);
  assert.ok(!calls[0].args.includes('--deliver'));
  assert.ok(!calls[0].args.some((arg) => String(arg).startsWith('--reply')));
});

test('fresh adapter instances isolate identical tasks into different sessions', async () => {
  const sessionKeys = [];
  const execFile = (_command, args, _options, callback) => {
    sessionKeys.push(args[args.indexOf('--session-key') + 1]);
    callback(null, JSON.stringify({ result: { payloads: [{ text: 'ok' }] } }), '');
  };
  const item = request();
  await createOpenClawSpawn({ apply: true, ownerConfirmed: true, execFile })(item);
  await createOpenClawSpawn({ apply: true, ownerConfirmed: true, execFile })(item);
  assert.equal(sessionKeys.length, 2);
  assert.notEqual(sessionKeys[0], sessionKeys[1]);
});

test('oversized prompts fail semantically before process execution', async () => {
  let calls = 0;
  const spawn = createOpenClawSpawn({
    apply: true,
    ownerConfirmed: true,
    maxPromptChars: 100,
    execFile: () => { calls += 1; },
  });
  const result = await spawn({ ...request(), prompt: 'x'.repeat(200) });
  assert.equal(calls, 0);
  assert.equal(result.failureKind, 'semantic');
  assert.equal(result.error.code, 'OPENCLAW_PROMPT_TOO_LARGE');
});

test('parses producer text from the OpenClaw JSON payload', async () => {
  const spawn = createOpenClawSpawn({
    apply: true,
    ownerConfirmed: true,
    execFile: (_command, _args, _options, callback) => {
      callback(null, jsonPayload('  finished artifact  '), '');
    },
  });

  const result = await spawn(request());
  assert.equal(result.ok, true);
  assert.equal(result.output, 'finished artifact');
  assert.ok(Number.isInteger(result.durationMs));
});

test('verifier prompt includes producer output and parses pass verdict', async () => {
  let prompt;
  const spawn = createOpenClawSpawn({
    apply: true,
    ownerConfirmed: true,
    execFile: (_command, args, _options, callback) => {
      prompt = args[args.indexOf('--message') + 1];
      callback(null, jsonPayload('{"verdict":"pass"}'), '');
    },
  });
  const result = await spawn(request({
    id: 'task-7:verifier:opus',
    purpose: 'verifier',
    upstream: {
      evidence: [{ output: 'test green' }],
      producer: { output: 'candidate patch', model: 'openai/gpt-5.6-terra' },
    },
  }));

  assert.match(prompt, /candidate patch/);
  assert.match(prompt, /The only valid outputs are \{"verdict":"pass"\} or \{"verdict":"reject"\}/);
  assert.equal(result.ok, true);
  assert.equal(result.verdict, 'pass');
  assert.equal(result.accepted, true);
  assert.deepEqual(result.output, { verdict: 'pass' });
});

test('parses verifier rejection without treating it as transport failure', async () => {
  const spawn = createOpenClawSpawn({
    apply: true,
    ownerConfirmed: true,
    execFile: (_command, _args, _options, callback) => {
      callback(null, jsonPayload('{"verdict":"reject"}'), '');
    },
  });
  const result = await spawn(request({ purpose: 'verifier' }));

  assert.equal(result.ok, true);
  assert.equal(result.verdict, 'reject');
  assert.equal(result.accepted, false);
  assert.equal(result.verifierPass, false);
});

test('invalid verifier output is a semantic failure and stays fail-closed', async () => {
  const spawn = createOpenClawSpawn({
    apply: true,
    ownerConfirmed: true,
    execFile: (_command, _args, _options, callback) => {
      callback(null, jsonPayload('{"answer":"looks good"}'), '');
    },
  });
  const result = await spawn(request({ purpose: 'verifier' }));

  assert.equal(result.ok, false);
  assert.equal(result.failureKind, 'semantic');
  assert.equal(result.error.code, 'OPENCLAW_VERDICT_INVALID');
});

test('verifier JSON with extra fields is rejected by the strict schema', async () => {
  const spawn = createOpenClawSpawn({
    apply: true,
    ownerConfirmed: true,
    execFile: (_command, _args, _options, callback) => {
      callback(null, jsonPayload('{"verdict":"pass","explanation":"trust me"}'), '');
    },
  });
  const result = await spawn(request({ purpose: 'verifier' }));

  assert.equal(result.ok, false);
  assert.equal(result.failureKind, 'semantic');
  assert.equal(result.error.code, 'OPENCLAW_VERDICT_INVALID');
});

test('quota reset errors are classified as rate-limit failures', async () => {
  const spawn = createOpenClawSpawn({
    apply: true,
    ownerConfirmed: true,
    execFile: (_command, _args, _options, callback) => {
      const error = Object.assign(new Error('agent command failed'), { code: 1 });
      callback(error, '', 'Quota limit reached; reset in 47 minutes.');
    },
  });
  const result = await spawn(request());

  assert.equal(result.ok, false);
  assert.equal(result.failureKind, 'rate-limit');
});

test('timeouts, auth availability, and generic process failures stay distinct', async () => {
  const cases = [
    [{ code: 'ETIMEDOUT', message: 'command timed out', killed: true }, '', 'timeout'],
    [{ code: 1, message: 'command failed' }, 'No available auth profile for provider anthropic', 'availability'],
    [{ code: 'EPIPE', message: 'broken pipe' }, 'gateway disconnected', 'transport'],
  ];
  for (const [shape, stderr, expected] of cases) {
    const spawn = createOpenClawSpawn({
      apply: true,
      ownerConfirmed: true,
      execFile: (_command, _args, _options, callback) => {
        callback(Object.assign(new Error(shape.message), shape), '', stderr);
      },
    });
    const result = await spawn(request());
    assert.equal(result.failureKind, expected);
  }
});
