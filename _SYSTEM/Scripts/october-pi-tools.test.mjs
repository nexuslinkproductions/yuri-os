import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import registerExtension, {
  OCTOBER_PI_TOOL_NAMES,
  registerOctoberPiTools,
} from '../../.omp/extensions/october-bus-tools.mjs';

function schema() {
  return {
    describe() { return this; },
    optional() { return this; },
  };
}

function mockPi(existing = []) {
  const tools = [];
  const errors = [];
  const handlers = {};
  const sent = [];
  return {
    tools,
    errors,
    handlers,
    sent,
    zod: {
      z: {
        string: () => schema(),
        array: () => schema(),
        object: (shape) => ({ shape }),
      },
    },
    logger: {
      debug() {},
      error(message) { errors.push(message); },
    },
    getAllTools: () => existing,
    registerTool(tool) { tools.push(tool); },
    on(event, handler) { handlers[event] = handler; },
    sendMessage(message, options) { sent.push({ message, options }); },
  };
}

const ATTACHED = {
  OCTOBER_BUS_PORT: '54903',
  OCTOBER_BUS_CANVAS: 'fixture-canvas',
  OCTOBER_BUS_NODE: 'fixture-node',
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LAUNCHER = path.join(ROOT, '_SYSTEM/Scripts/october-omp/pi');

function fakeOmpHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-october-omp-'));
  const bin = path.join(home, '.bun/bin');
  fs.mkdirSync(bin, { recursive: true });
  const omp = path.join(bin, 'omp');
  fs.writeFileSync(omp, `#!/bin/zsh
print -r -- "binding=\${YURI_HARNESS_BINDING:-}"
print -r -- "port=\${OCTOBER_BUS_PORT:-}"
for arg in "$@"; do print -r -- "arg=\${arg}"; done
`);
  fs.chmodSync(omp, 0o755);
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function runLauncher(home, args = [], extraEnv = {}) {
  return spawnSync(LAUNCHER, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      HOME: home,
      PATH: '/usr/bin:/bin',
      TMPDIR: os.tmpdir(),
      ...extraEnv,
    },
  });
}

test('registers exactly five essential OMP tools with no TypeBox dependency', () => {
  const pi = mockPi();
  const verdict = registerOctoberPiTools(pi, {
    env: ATTACHED,
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, text: 'ok' }) }),
  });
  assert.deepEqual(verdict, { registered: [...OCTOBER_PI_TOOL_NAMES], status: 'registered' });
  assert.deepEqual(pi.tools.map((tool) => tool.name), OCTOBER_PI_TOOL_NAMES);
  assert.ok(pi.tools.every((tool) => tool.loadMode === 'essential'));
  assert.equal(pi.tools.find((tool) => tool.name === 'list_tasks').approval, 'read');
  assert.ok(pi.tools.filter((tool) => tool.name !== 'list_tasks').every((tool) => tool.approval === 'write'));
});

test('message_peer posts alias-by-name attachment data only to the attached loopback port', async () => {
  const pi = mockPi();
  const calls = [];
  registerOctoberPiTools(pi, {
    env: ATTACHED,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  const result = await pi.tools.find((tool) => tool.name === 'message_peer').execute(
    'fixture-call',
    { peer: 'Hermes', message: 'receipt received' },
  );
  assert.equal(result.content[0].text, 'Sent to Hermes.');
  assert.equal(calls[0].url, 'http://127.0.0.1:54903/hook/message-peer');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    canvas: 'fixture-canvas',
    node: 'fixture-node',
    peer: 'Hermes',
    message: 'receipt received',
  });
});

test('task tools surface a failed October response as a tool error', async () => {
  const pi = mockPi();
  registerOctoberPiTools(pi, {
    env: ATTACHED,
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: false, reason: 'board-unavailable' }) }),
  });
  const result = await pi.tools.find((tool) => tool.name === 'claim_task').execute('fixture-call', {});
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, 'Could not use task board: board-unavailable');
});

test('fails closed and logs partial attachment or partial duplicate state', () => {
  const partialEnv = mockPi();
  assert.equal(registerOctoberPiTools(partialEnv, {
    env: { OCTOBER_BUS_PORT: '54903' },
  }).status, 'invalid-attachment');
  assert.equal(partialEnv.tools.length, 0);
  assert.equal(partialEnv.errors.length, 1);

  const partialDuplicate = mockPi(['message_peer']);
  assert.equal(registerOctoberPiTools(partialDuplicate, { env: ATTACHED }).status, 'partial-conflict');
  assert.equal(partialDuplicate.tools.length, 0);
  assert.equal(partialDuplicate.errors.length, 1);
});

test('is inert without October attachment and defers to a complete host registration', () => {
  const unattached = mockPi();
  const saved = Object.fromEntries(Object.keys(ATTACHED).map((key) => [key, process.env[key]]));
  for (const key of Object.keys(ATTACHED)) delete process.env[key];
  try {
    assert.deepEqual(registerExtension(unattached), { registered: [], status: 'not-attached' });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  assert.equal(unattached.tools.length, 0);
  assert.equal(unattached.errors.length, 0);

  const existing = mockPi(OCTOBER_PI_TOOL_NAMES);
  const verdict = registerOctoberPiTools(existing, { env: ATTACHED });
  assert.equal(verdict.status, 'host-adapter-active');
  assert.equal(existing.tools.length, 0);
});

test('delegated non-host sessions cannot register parent October tools', () => {
  const pi = mockPi();
  const env = { ...ATTACHED, CAMPFIRE_SESSION_ROLE: 'worker' };
  assert.equal(registerOctoberPiTools(pi, { env }).status, 'non-host-session');
  assert.equal(pi.tools.length, 0);
});

test('default adapter leaves inbound ownership to October native delivery', () => {
  const pi = mockPi();
  const saved = Object.fromEntries(Object.keys(ATTACHED).map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const originalSetInterval = globalThis.setInterval;
  let fetchCalls = 0;
  let intervalCalls = 0;
  Object.assign(process.env, ATTACHED);
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('registration must not pull inbound state');
  };
  globalThis.setInterval = (...args) => {
    intervalCalls += 1;
    return originalSetInterval(...args);
  };
  try {
    const verdict = registerExtension(pi);
    assert.equal(verdict.status, 'registered');
    assert.deepEqual(pi.tools.map((tool) => tool.name), OCTOBER_PI_TOOL_NAMES);
    assert.deepEqual(pi.handlers, {});
    assert.equal(fetchCalls, 0);
    assert.equal(intervalCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setInterval = originalSetInterval;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('launcher rejects a complete-looking but invalid October attachment', (t) => {
  const result = runLauncher(fakeOmpHome(t), [], {
    ...ATTACHED,
    OCTOBER_BUS_PORT: 'not-a-port',
  });
  assert.equal(result.status, 78);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /invalid OCTOBER_BUS_\*/);
});

test('launcher strips parent October identity and implicit approval for non-host workers', (t) => {
  const result = runLauncher(fakeOmpHome(t), ['--model=fixture'], {
    ...ATTACHED,
    CAMPFIRE_SESSION_ROLE: 'worker',
  });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines.includes('binding='));
  assert.ok(lines.includes('port='));
  assert.ok(lines.includes('arg=--model=fixture'));
  assert.equal(lines.some((line) => line === 'arg=--auto-approve'), false);
  assert.equal(lines.some((line) => line.startsWith('arg=--approval-mode')), false);
  assert.equal(lines.some((line) => line.startsWith('arg=--append-system-prompt=')), false);
});

test('explicit approval mode wins over shortcuts and host implicit approval', (t) => {
  const result = runLauncher(fakeOmpHome(t), [
    '--approved',
    '--approval-mode=write',
    '--model=fixture',
  ], ATTACHED);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines.includes('binding=omp'));
  assert.ok(lines.includes('port=54903'));
  assert.ok(lines.includes('arg=--approval-mode=write'));
  assert.ok(lines.includes('arg=--model=fixture'));
  assert.equal(lines.filter((line) => line === 'arg=--auto-approve').length, 0);
  assert.equal(lines.filter((line) => line.startsWith('arg=--approval-mode')).length, 1);
  assert.equal(lines.filter((line) => line.startsWith('arg=--append-system-prompt=')).length, 1);
});

test('attached host receives safe write approval mode and never implicit YOLO', (t) => {
  const result = runLauncher(fakeOmpHome(t), ['--model=fixture'], ATTACHED);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.filter((line) => line === 'arg=--approval-mode=write').length, 1);
  assert.equal(lines.filter((line) => line === 'arg=--auto-approve').length, 0);
});

test('attached host preserves an explicit owner auto-approval shortcut', (t) => {
  const result = runLauncher(fakeOmpHome(t), ['--auto-approve', '--model=fixture'], ATTACHED);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.filter((line) => line === 'arg=--auto-approve').length, 1);
  assert.equal(lines.filter((line) => line.startsWith('arg=--approval-mode')).length, 0);
});
