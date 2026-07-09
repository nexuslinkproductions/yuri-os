import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CWD,
  compileNativeSpawn,
  createNativeDispatchState,
  recordNativeSpawnAccepted,
  reduceNativeDispatch,
} from './sol-moe-native-dispatch.mjs';

function entry(taskId, purpose, model = `${purpose}-model`) {
  return {
    id: `${taskId}:${purpose}:${String(model).replace(/[^A-Za-z0-9._:-]+/g, '-')}`,
    taskId,
    purpose,
    role: 'engineer',
    agentId: `mure-${purpose}`,
    model,
    thinking: 'high',
    prompt: `Complete only ${taskId}.`,
  };
}

function plan(options = {}) {
  const taskId = options.taskId || 'task-a';
  const verifier = options.verifier === false ? [] : [entry(taskId, 'verifier', 'verifier-model')];
  return {
    routes: [{
      taskId,
      held: options.held === true,
      route: {
        selection: 'primary',
        classification: { requiresVerifier: options.verifier !== false },
        verifier: options.verifier === false ? null : { required: true },
      },
    }],
    queues: {
      producers: [entry(taskId, 'producer', 'primary-model')],
      verifiers: verifier,
      availabilityFallbacks: options.fallbacks || [],
      qualityEscalations: options.escalations || [],
    },
    blocked: options.blocked || [],
  };
}

function complete(action, id, fields = {}) {
  return {
    id,
    taskId: action.taskId,
    entryId: action.entryId,
    purpose: action.purpose,
    childSessionKey: `agent:${action.args.agentId}:subagent:${id}`,
    runId: `run-${id}`,
    ok: true,
    output: 'work-product',
    ...fields,
  };
}

function accept(state, action, id = action.entryId.replace(/[^a-z0-9]+/gi, '-')) {
  const receipt = {
    status: 'accepted',
    childSessionKey: `agent:${action.args.agentId}:subagent:${id}`,
    runId: `run-${id}`,
    resolvedModel: action.args.model,
  };
  return { ...recordNativeSpawnAccepted(state, action, receipt), receipt };
}

function acceptedCompletion(state, action, id, fields = {}) {
  const admitted = accept(state, action, id);
  return reduceNativeDispatch(admitted.state, complete(action, id, fields));
}

test('compiler emits exactly the native sessions_spawn allowlist and deterministic taskName', () => {
  const manifest = entry('alpha-task', 'producer', 'openai/gpt-5.6-terra');
  const a = compileNativeSpawn(manifest, { attempt: 2 });
  const b = compileNativeSpawn(manifest, { attempt: 2 });
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a).sort(), [
    'agentId', 'cleanup', 'context', 'cwd', 'label', 'mode', 'model', 'runtime', 'sandbox', 'task', 'taskName', 'thinking',
  ]);
  assert.equal(a.cwd, DEFAULT_CWD);
  assert.equal(a.runtime, 'subagent');
  assert.equal(a.mode, 'run');
  assert.equal(a.context, 'isolated');
  assert.equal(a.cleanup, 'keep');
  assert.equal(a.sandbox, 'inherit');
  for (const forbidden of ['sessionKey', 'timeout', 'deliver', 'channel', 'transport']) assert.ok(!(forbidden in a));
});

test('compiler rejects missing or invalid manifest fields and mismatched task context', () => {
  const valid = entry('task-a', 'producer');
  assert.throws(() => compileNativeSpawn({ ...valid, id: '' }), /id is required/);
  assert.throws(() => compileNativeSpawn({ ...valid, model: '' }), /model is required/);
  assert.throws(() => compileNativeSpawn({ ...valid, purpose: 'unknown' }), /purpose is invalid/);
  assert.throws(() => compileNativeSpawn({ ...valid, agentId: 'agent bad' }), /agentId contains unsupported/);
  assert.throws(() => compileNativeSpawn({ ...valid, thinking: 'turbo' }), /thinking is invalid/);
  assert.throws(() => compileNativeSpawn(valid, { taskId: 'other-task' }), /taskId must match/);
  assert.throws(() => compileNativeSpawn(valid, { cwd: 'relative' }), /absolute path/);
});

test('only verifier prompts demand strict JSON verdicts', () => {
  const producer = compileNativeSpawn(entry('task-a', 'producer'));
  const verifier = compileNativeSpawn(entry('task-a', 'verifier'));
  assert.match(verifier.task, /VERIFIER CONTRACT/);
  assert.match(verifier.task, /\{"verdict":"pass"\}/);
  assert.doesNotMatch(producer.task, /VERIFIER CONTRACT|\{"verdict":"pass"\}/);
  assert.match(producer.task, /Task ID: task-a/);
});

test('producer success advances only its own task to a verifier', () => {
  const state = createNativeDispatchState(plan());
  const first = reduceNativeDispatch(state);
  assert.equal(first.action.type, 'sessions_spawn');
  assert.equal(first.action.purpose, 'producer');
  const next = acceptedCompletion(first.state, first.action, 'event-producer');
  assert.equal(next.action.type, 'sessions_spawn');
  assert.equal(next.action.purpose, 'verifier');
  assert.match(next.action.args.task, /"entryId":"task-a:producer:primary-model"/);
});

test('transport, quota, timeout, and auth failures take the next task-scoped availability fallback', () => {
  for (const failureKind of ['transport', 'quota', 'timeout', 'auth']) {
    const fallback = entry('task-a', 'availability-fallback', `fallback-${failureKind}`);
    const first = reduceNativeDispatch(createNativeDispatchState(plan({ fallbacks: [fallback] })));
    const next = acceptedCompletion(first.state, first.action, `event-${failureKind}`, {
      ok: false,
      failureKind,
      error: `${failureKind} unavailable`,
    });
    assert.equal(next.action.type, 'sessions_spawn');
    assert.equal(next.action.purpose, 'producer');
    assert.equal(next.action.routeKind, 'availability-fallback');
    assert.equal(next.action.args.model, `fallback-${failureKind}`);
  }
});

test('semantic child failures fail loud without consuming availability fallback', () => {
  const fallback = entry('task-a', 'availability-fallback', 'fallback-model');
  const first = reduceNativeDispatch(createNativeDispatchState(plan({ fallbacks: [fallback] })));
  const next = acceptedCompletion(first.state, first.action, 'event-semantic', {
    ok: false,
    failureKind: 'semantic',
  });
  assert.deepEqual(next.action.type, 'fail-loud');
  assert.equal(next.action.code, 'SEMANTIC_FAILURE');
});

test('verifier rejection runs quality escalation and then re-runs the verifier', () => {
  const escalation = entry('task-a', 'quality-escalation', 'quality-model');
  const first = reduceNativeDispatch(createNativeDispatchState(plan({ escalations: [escalation] })));
  const verifier = acceptedCompletion(first.state, first.action, 'event-producer');
  const quality = acceptedCompletion(verifier.state, verifier.action, 'event-reject', { verdict: 'reject' });
  assert.equal(quality.action.type, 'sessions_spawn');
  assert.equal(quality.action.purpose, 'quality-escalation');
  assert.equal(quality.action.args.model, 'quality-model');
  const verifierAgain = acceptedCompletion(quality.state, quality.action, 'event-quality');
  assert.equal(verifierAgain.action.type, 'sessions_spawn');
  assert.equal(verifierAgain.action.purpose, 'verifier');
});

test('strict verifier semantic failure and exhausted fallback both fail loud', () => {
  const first = reduceNativeDispatch(createNativeDispatchState(plan()));
  const verifier = acceptedCompletion(first.state, first.action, 'event-producer');
  const invalid = acceptedCompletion(verifier.state, verifier.action, 'event-invalid', { output: { verdict: 'maybe' } });
  assert.equal(invalid.action.code, 'SEMANTIC_FAILURE');

  const unavailable = reduceNativeDispatch(createNativeDispatchState(plan()));
  const exhausted = acceptedCompletion(unavailable.state, unavailable.action, 'event-timeout', {
    ok: false,
    failureKind: 'timeout',
  });
  assert.equal(exhausted.action.code, 'AVAILABILITY_FALLBACK_EXHAUSTED');
});

test('held and blocked tasks emit no spawn actions', () => {
  const held = reduceNativeDispatch(createNativeDispatchState(plan({ held: true })));
  assert.deepEqual(held.action, { type: 'none', reason: 'no-runnable-task' });

  const blocked = reduceNativeDispatch(createNativeDispatchState({
    routes: [],
    queues: { producers: [], verifiers: [], availabilityFallbacks: [], qualityEscalations: [] },
    blocked: [{ taskId: 'blocked-task', code: 'NO_ROUTE', reason: 'No safe route.' }],
  }));
  assert.deepEqual(blocked.action, { type: 'none', reason: 'no-runnable-task' });
});

test('queues and completion events remain task-scoped and pushed events are idempotent', () => {
  const composite = {
    routes: [
      { taskId: 'task-a', held: false, route: { classification: { requiresVerifier: false } } },
      { taskId: 'task-b', held: false, route: { classification: { requiresVerifier: false } } },
    ],
    queues: {
      producers: [entry('task-a', 'producer', 'primary-a'), entry('task-b', 'producer', 'primary-b')],
      verifiers: [],
      availabilityFallbacks: [entry('task-b', 'availability-fallback', 'fallback-b')],
      qualityEscalations: [],
    },
    blocked: [],
  };
  const first = reduceNativeDispatch(createNativeDispatchState(composite));
  assert.equal(first.action.taskId, 'task-a');
  const admitted = accept(first.state, first.action, 'event-a-pass');
  const mismatch = reduceNativeDispatch(admitted.state, {
    id: 'wrong-task-event', taskId: 'task-b', entryId: 'task-b:producer:primary-b', purpose: 'producer',
    childSessionKey: 'agent:wrong:subagent:wrong', runId: 'run-wrong', ok: true,
  });
  assert.equal(mismatch.action.reason, 'stale-or-mismatched-event');
  const pass = reduceNativeDispatch(mismatch.state, complete(first.action, 'event-a-pass'));
  assert.equal(pass.action.reason, 'task-passed');
  const duplicate = reduceNativeDispatch(pass.state, complete(first.action, 'event-a-pass'));
  assert.equal(duplicate.action.reason, 'duplicate-event');
  const taskB = reduceNativeDispatch(duplicate.state);
  assert.equal(taskB.action.taskId, 'task-b');
  const fallback = acceptedCompletion(taskB.state, taskB.action, 'event-b-transport', { ok: false, failureKind: 'transport' });
  assert.equal(fallback.action.taskId, 'task-b');
  assert.equal(fallback.action.args.model, 'fallback-b');
});

test('admission records native ids and rejects a silently resolved model change', () => {
  const first = reduceNativeDispatch(createNativeDispatchState(plan()));
  const accepted = recordNativeSpawnAccepted(first.state, first.action, {
    status: 'accepted',
    childSessionKey: 'agent:mure-producer:subagent:abc',
    runId: 'run-abc',
    resolvedModel: first.action.args.model,
  });
  assert.equal(accepted.action.reason, 'spawn-accepted');
  assert.equal(accepted.state.tasks['task-a'].awaiting.accepted.runId, 'run-abc');

  const mismatch = recordNativeSpawnAccepted(first.state, first.action, {
    status: 'accepted',
    childSessionKey: 'agent:mure-producer:subagent:def',
    runId: 'run-def',
    resolvedModel: 'unexpected/model',
  });
  assert.equal(mismatch.action.code, 'RESOLVED_MODEL_MISMATCH');
});

test('evidence completes before producer and is injected into the producer task', () => {
  const p = plan({ verifier: false });
  p.queues.evidence = [entry('task-a', 'evidence', 'evidence-model')];
  const evidence = reduceNativeDispatch(createNativeDispatchState(p));
  assert.equal(evidence.action.purpose, 'evidence');
  const producer = acceptedCompletion(evidence.state, evidence.action, 'evidence-done', { output: 'bounded-evidence' });
  assert.equal(producer.action.purpose, 'producer');
  assert.match(producer.action.args.task, /bounded-evidence/);
});

test('verifier execution failure fails loud and never consumes producer fallbacks', () => {
  const p = plan({ fallbacks: [entry('task-a', 'availability-fallback', 'fallback-model')] });
  const producer = reduceNativeDispatch(createNativeDispatchState(p));
  const verifier = acceptedCompletion(producer.state, producer.action, 'producer-done');
  const failed = acceptedCompletion(verifier.state, verifier.action, 'verifier-timeout', {
    ok: false,
    failureKind: 'timeout',
  });
  assert.equal(failed.action.code, 'VERIFIER_EXECUTION_FAILURE');
});

test('independent verifier is enforced at the reducer boundary', () => {
  const p = plan();
  p.queues.verifiers = [{ ...p.queues.verifiers[0], agentId: p.queues.producers[0].agentId }];
  const producer = reduceNativeDispatch(createNativeDispatchState(p));
  const failed = acceptedCompletion(producer.state, producer.action, 'producer-done');
  assert.equal(failed.action.code, 'VERIFIER_NOT_INDEPENDENT');
});

test('post-fallback producer cannot become its own verifier', () => {
  const fallback = entry('task-a', 'availability-fallback', 'verifier-model');
  const p = plan({ fallbacks: [fallback] });
  const primary = reduceNativeDispatch(createNativeDispatchState(p));
  const fallbackAction = acceptedCompletion(primary.state, primary.action, 'primary-down', {
    ok: false,
    failureKind: 'transport',
  });
  const failed = acceptedCompletion(fallbackAction.state, fallbackAction.action, 'fallback-done');
  assert.equal(failed.action.code, 'VERIFIER_NOT_INDEPENDENT');
});

test('quality-escalation producer cannot become its own verifier', () => {
  const escalation = entry('task-a', 'quality-escalation', 'verifier-model');
  const p = plan({ escalations: [escalation] });
  const primary = reduceNativeDispatch(createNativeDispatchState(p));
  const verifier = acceptedCompletion(primary.state, primary.action, 'primary-done');
  const quality = acceptedCompletion(verifier.state, verifier.action, 'verifier-reject', { verdict: 'reject' });
  const failed = acceptedCompletion(quality.state, quality.action, 'quality-done');
  assert.equal(failed.action.code, 'VERIFIER_NOT_INDEPENDENT');
});
