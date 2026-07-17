import assert from 'node:assert/strict';
import test from 'node:test';

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
  return {
    tools,
    errors,
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
  };
}

const ATTACHED = {
  OCTOBER_BUS_PORT: '54903',
  OCTOBER_BUS_CANVAS: 'fixture-canvas',
  OCTOBER_BUS_NODE: 'fixture-node',
};

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
