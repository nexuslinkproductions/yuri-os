import test from 'node:test';
import assert from 'node:assert/strict';

import { executeSolMoePlan } from './sol-moe-executor.mjs';

function entry(taskId, purpose, model) {
  return {
    id: `${taskId}:${purpose}:${model}`,
    taskId,
    purpose,
    role: 'test-role',
    agentId: `agent-${model}`,
    model,
    thinking: 'low',
    prompt: `work on ${taskId}`,
    execution: 'sessions_spawn',
  };
}

function routeRecord(taskId, options = {}) {
  return {
    taskId,
    role: options.role || 'test-role',
    held: options.held === true,
    route: {
      policyVersion: 'test-policy-v1',
      taskId,
      selection: options.selection || 'primary',
      classification: {
        riskClass: options.riskClass || 'R2',
        taskType: options.taskType || 'implementation',
        requiresVerifier: options.verifier !== false,
      },
      producer: {
        id: 'primary',
        agentId: `agent-${options.primaryModel || 'primary'}`,
        model: options.primaryModel || 'primary',
      },
      verifier: options.verifier === false ? null : {
        id: 'verifier',
        agentId: `agent-${options.verifierModel || 'verifier'}`,
        model: options.verifierModel || 'verifier',
        required: true,
      },
    },
  };
}

function makePlan(routeOptions, queueOverrides = {}) {
  const records = Array.isArray(routeOptions) ? routeOptions : [routeOptions];
  const routes = records.map((options) => routeRecord(options.taskId, options));
  const producers = routes.map(({ taskId, route }) => entry(taskId, 'producer', route.producer.model));
  const verifiers = routes
    .filter(({ route }) => route.verifier)
    .map(({ taskId, route }) => entry(taskId, 'verifier', route.verifier.model));
  return {
    schemaVersion: 'sol-moe-company-v1',
    mode: 'manifest-only-disarmed',
    routes,
    queues: {
      producers,
      verifiers,
      evidence: [],
      availabilityFallbacks: [],
      qualityEscalations: [],
      ...queueOverrides,
    },
    blocked: [],
  };
}

test('executes the primary producer and passes its output to the verifier', async () => {
  const plan = makePlan({ taskId: 'primary-task' });
  const calls = [];
  const result = await executeSolMoePlan(plan, {
    spawn: async (request) => {
      calls.push(request);
      if (request.purpose === 'producer') {
        return { ok: true, output: 'primary-output', durationMs: 11 };
      }
      assert.equal(request.upstream.producer.output, 'primary-output');
      return { ok: true, accepted: true, output: { verdict: 'pass' }, durationMs: 7 };
    },
  });

  assert.deepEqual(calls.map((call) => call.purpose), ['producer', 'verifier']);
  assert.equal(result.status, 'passed');
  assert.equal(result.results[0].status, 'passed');
  assert.equal(result.results[0].selectedRouteKind, 'primary');
  assert.deepEqual(result.telemetry.map((event) => event.durationMs), [11, 7]);
  assert.deepEqual(result.telemetry.map((event) => event.attempt), [1, 2]);
});

test('uses only availability fallbacks after transport or availability failure', async () => {
  const plan = makePlan({ taskId: 'fallback-task' }, {
    availabilityFallbacks: [entry('fallback-task', 'availability-fallback', 'fallback-1')],
  });
  const calls = [];
  const result = await executeSolMoePlan(plan, {
    spawn: async (request) => {
      calls.push(request.model);
      if (request.model === 'primary') {
        return { ok: false, failureKind: 'transport', error: 'provider unavailable' };
      }
      if (request.purpose === 'verifier') return { ok: true, accepted: true, output: 'pass' };
      return { ok: true, output: 'fallback-output' };
    },
  });

  assert.deepEqual(calls, ['primary', 'fallback-1', 'verifier']);
  assert.equal(result.results[0].selectedRouteKind, 'availability-fallback');
  assert.equal(result.results[0].producer.model, 'fallback-1');
  assert.deepEqual(
    result.results[0].attempts.map((attempt) => attempt.routeKind),
    ['primary', 'availability-fallback', 'verification'],
  );
});

test('verifier rejection triggers quality escalation and never consumes availability fallback', async () => {
  const plan = makePlan({ taskId: 'quality-task' }, {
    availabilityFallbacks: [entry('quality-task', 'availability-fallback', 'availability-only')],
    qualityEscalations: [entry('quality-task', 'quality-escalation', 'quality-1')],
  });
  const calls = [];
  let verifierRuns = 0;
  const result = await executeSolMoePlan(plan, {
    spawn: async (request) => {
      calls.push(request.model);
      if (request.purpose === 'verifier') {
        verifierRuns += 1;
        return verifierRuns === 1
          ? { ok: true, accepted: false, output: { verdict: 'reject' } }
          : { ok: true, accepted: true, output: { verdict: 'pass' } };
      }
      return { ok: true, output: `${request.model}-output` };
    },
  });

  assert.deepEqual(calls, ['primary', 'verifier', 'quality-1', 'verifier']);
  assert.ok(!calls.includes('availability-only'));
  assert.equal(result.results[0].selectedRouteKind, 'quality-escalation');
  assert.equal(result.results[0].producer.model, 'quality-1');
  assert.equal(result.results[0].verifier.accepted, true);
});

test('semantic verifier failure also triggers quality escalation', async () => {
  const plan = makePlan({ taskId: 'semantic-verifier-task' }, {
    qualityEscalations: [entry('semantic-verifier-task', 'quality-escalation', 'quality-1')],
  });
  let verifierRuns = 0;
  const result = await executeSolMoePlan(plan, {
    spawn: async (request) => {
      if (request.purpose !== 'verifier') return { ok: true, output: `${request.model}-output` };
      verifierRuns += 1;
      return verifierRuns === 1
        ? { ok: false, failureKind: 'semantic', error: 'schema-invalid verdict' }
        : { ok: true, accepted: true, output: 'pass' };
    },
  });

  assert.equal(result.results[0].status, 'passed');
  assert.equal(result.results[0].selectedRouteKind, 'quality-escalation');
  assert.deepEqual(
    result.results[0].attempts.map((attempt) => attempt.routeKind),
    ['primary', 'verification', 'quality-escalation', 'verification'],
  );
});

test('an unstructured verifier response fails closed and triggers quality escalation', async () => {
  const plan = makePlan({ taskId: 'unstructured-verifier' }, {
    qualityEscalations: [entry('unstructured-verifier', 'quality-escalation', 'quality-1')],
  });
  let verifierRuns = 0;
  const result = await executeSolMoePlan(plan, {
    spawn: async (request) => {
      if (request.purpose !== 'verifier') return { ok: true, output: `${request.model}-output` };
      verifierRuns += 1;
      return verifierRuns === 1
        ? { ok: true, output: 'looks fine to me' }
        : { ok: true, verdict: 'pass', output: { verdict: 'pass' } };
    },
  });

  assert.equal(result.results[0].status, 'passed');
  assert.equal(result.results[0].selectedRouteKind, 'quality-escalation');
  assert.deepEqual(
    result.results[0].attempts.map((attempt) => attempt.status),
    ['succeeded', 'rejected', 'succeeded', 'accepted'],
  );
});

test('held routes never spawn even if malformed queues contain runnable entries', async () => {
  const plan = makePlan({ taskId: 'held-task', held: true }, {
    evidence: [entry('held-task', 'evidence', 'evidence-1')],
    availabilityFallbacks: [entry('held-task', 'availability-fallback', 'fallback-1')],
    qualityEscalations: [entry('held-task', 'quality-escalation', 'quality-1')],
  });
  let calls = 0;
  const result = await executeSolMoePlan(plan, {
    spawn: async () => {
      calls += 1;
      return { ok: true, output: 'must-not-run' };
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.results[0].status, 'owner-held');
  assert.equal(result.telemetry.length, 0);
});

test('exhausted important route fails loud after verifier rejection', async () => {
  const plan = makePlan({ taskId: 'important-task', riskClass: 'R3' }, {
    qualityEscalations: [entry('important-task', 'quality-escalation', 'quality-1')],
  });
  const result = await executeSolMoePlan(plan, {
    spawn: async (request) => {
      if (request.purpose === 'verifier') {
        return { ok: true, accepted: false, output: { verdict: 'reject' } };
      }
      if (request.purpose === 'quality-escalation') {
        return { ok: false, failureKind: 'semantic', error: 'inadequate answer' };
      }
      return { ok: true, output: 'candidate-output' };
    },
  });

  assert.equal(result.status, 'fail-loud');
  assert.equal(result.results[0].status, 'fail-loud');
  assert.equal(result.results[0].failure.code, 'QUALITY_ESCALATION_EXHAUSTED');
});

test('bounds evidence parallelism and preserves manifest order in telemetry', async () => {
  const evidence = Array.from({ length: 5 }, (_, index) => entry('evidence-task', 'evidence', `evidence-${index + 1}`));
  const plan = makePlan({ taskId: 'evidence-task', verifier: false, riskClass: 'R1' }, { evidence });
  let active = 0;
  let peak = 0;
  const starts = [];
  const result = await executeSolMoePlan(plan, {
    maxConcurrency: 2,
    spawn: async (request) => {
      if (request.purpose === 'evidence') {
        active += 1;
        peak = Math.max(peak, active);
        starts.push(request.model);
        await new Promise((resolve) => setTimeout(resolve, request.model === 'evidence-1' ? 15 : 1));
        active -= 1;
        return { ok: true, output: `${request.model}-output`, durationMs: 3 };
      }
      assert.equal(request.upstream.evidence.length, 5);
      return { ok: true, output: 'producer-output' };
    },
  });

  assert.equal(peak, 2);
  assert.deepEqual(starts.slice(0, 2), ['evidence-1', 'evidence-2']);
  assert.deepEqual(
    result.telemetry.filter((event) => event.phase === 'evidence').map((event) => event.model),
    evidence.map((item) => item.model),
  );
  assert.equal(result.results[0].status, 'passed');
});

test('all execution queues are scoped by taskId', async () => {
  const plan = makePlan([
    { taskId: 'task-a' },
    { taskId: 'task-b' },
  ], {
    availabilityFallbacks: [
      entry('task-b', 'availability-fallback', 'fallback-b'),
      entry('task-a', 'availability-fallback', 'fallback-a'),
    ],
  });
  const calls = [];
  const result = await executeSolMoePlan(plan, {
    spawn: async (request) => {
      calls.push(`${request.taskId}:${request.model}`);
      if (request.taskId === 'task-a' && request.purpose === 'producer') {
        return { ok: false, failureKind: 'availability', error: 'primary down' };
      }
      if (request.purpose === 'verifier') return { ok: true, accepted: true, output: 'pass' };
      return { ok: true, output: `${request.taskId}-output` };
    },
  });

  assert.deepEqual(calls, [
    'task-a:primary',
    'task-a:fallback-a',
    'task-a:verifier',
    'task-b:primary',
    'task-b:verifier',
  ]);
  assert.equal(result.results[0].producer.model, 'fallback-a');
  assert.equal(result.results[1].producer.model, 'primary');
});

test('semantic producer failure does not consume an availability fallback', async () => {
  const plan = makePlan({ taskId: 'semantic-task', riskClass: 'R2' }, {
    availabilityFallbacks: [entry('semantic-task', 'availability-fallback', 'must-not-run')],
  });
  const calls = [];
  const result = await executeSolMoePlan(plan, {
    spawn: async (request) => {
      calls.push(request.model);
      return { ok: false, failureKind: 'semantic', error: 'invalid result' };
    },
  });

  assert.deepEqual(calls, ['primary']);
  assert.equal(result.results[0].status, 'fail-loud');
  assert.equal(result.results[0].selectedRouteKind, 'primary');
  assert.equal(result.results[0].failure.code, 'PRODUCER_SEMANTIC_FAILURE');
});
