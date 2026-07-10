import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CWD,
  compileNativeSpawn,
  createNativeDispatchState,
  createProviderCalibrationReport,
  recordNativeSpawnAccepted,
  reduceNativeDispatch,
} from './sol-moe-native-dispatch.mjs';

function entry(taskId, purpose, model = null) {
  const defaultModels = {
    producer: 'minimax-portal/MiniMax-M3',
    verifier: 'anthropic/claude-sonnet-5',
    'availability-fallback': 'anthropic/claude-sonnet-5',
    'quality-escalation': 'openai/gpt-5.6-terra',
    evidence: 'deepseek/deepseek-v4-flash',
  };
  model ||= defaultModels[purpose];
  const agentByModel = {
    'minimax-portal/MiniMax-M3': 'mure-synthesist',
    'zai/glm-5.2': 'mure-architect',
    'openai/gpt-5.6-terra': 'mure-engineer',
    'openai/gpt-5.6-luna': 'mure-adjudicator',
    'anthropic/claude-opus-4-8': 'mure-sentinel',
    'anthropic/claude-sonnet-5': 'mure-calibrator',
    'deepseek/deepseek-v4-flash': 'deepseek-flash',
    'opencode-go/mimo-v2.5': 'mure-artificer',
  };
  return {
    id: `${taskId}:${purpose}:${String(model).replace(/[^A-Za-z0-9._:-]+/g, '-')}`,
    taskId,
    purpose,
    role: 'engineer',
    agentId: agentByModel[model] || `mure-${purpose}`,
    model,
    thinking: 'high',
    prompt: `Complete only ${taskId}.`,
  };
}

function plan(options = {}) {
  const taskId = options.taskId || 'task-a';
  const verifier = options.verifier === false ? [] : [entry(taskId, 'verifier')];
  return {
    routes: [{
      taskId,
      held: options.held === true,
      route: {
        selection: 'primary',
        classification: {
          riskClass: options.riskClass || (options.verifier === false ? 'R1' : 'R2'),
          requiresVerifier: options.verifier !== false,
        },
        verifier: options.verifier === false ? null : { required: true },
      },
    }],
    queues: {
      producers: [entry(taskId, 'producer')],
      verifiers: verifier,
      availabilityFallbacks: options.fallbacks || [],
      qualityEscalations: options.escalations || [],
      calibrationAlternatives: options.calibrationAlternatives || [],
    },
    blocked: options.blocked || [],
    providerCalibration: options.providerCalibration || null,
  };
}

const providerCalibration = {
  metric: 'native child dispatch count',
  windowDispatches: 50,
  minimumSamples: 30,
  activeTargets: {
    openai: { min: 0, max: 0.12 },
    minimax: { min: 0, max: 1 },
  },
};

function historyEntry(family, index) {
  const modelByFamily = {
    openai: 'openai/gpt-5.6-terra',
    minimax: 'minimax-portal/MiniMax-M3',
    anthropic: 'anthropic/claude-sonnet-5',
    deepseek: 'deepseek/deepseek-v4-flash',
  };
  const agentId = `mure-history-${family}`;
  return {
    entryId: `${family}-${index}`,
    model: modelByFamily[family],
    agentId,
    providerFamily: family,
    childSessionKey: `agent:${agentId}:subagent:${index}`,
    runId: `run-${family}-${index}`,
    resolvedModel: modelByFamily[family],
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
  assert.throws(() => compileNativeSpawn({ ...valid, model: 'cheap/custom-model' }), /not an allowed MURE worker/);
  assert.throws(() => compileNativeSpawn({ ...valid, agentId: 'mure-engineer' }), /agentId must be mure-synthesist/);
  assert.throws(() => compileNativeSpawn(valid, { taskId: 'other-task' }), /taskId must match/);
  assert.throws(() => compileNativeSpawn(valid, { cwd: 'relative' }), /absolute path/);
  assert.throws(() => compileNativeSpawn({ ...valid, agentId: 'mure-yuri' }), /cannot be compiled as a native child worker/);
  assert.throws(() => compileNativeSpawn({ ...valid, model: 'openai/gpt-5.6-sol' }), /cannot be compiled as a native child worker/);
  assert.throws(() => compileNativeSpawn({
    ...valid,
    agentId: 'mure-engineer',
    model: 'openai/gpt-5.6-terra',
    providerFamily: 'minimax',
  }), /providerFamily does not match model provider/);
});

test('compiler accepts catalog-backed DeepSeek, Ollama, Cline, Cursor, and Haiku route identities', () => {
  const routes = [
    ['deepseek-v4-flash:direct', 'deepseek-flash'],
    ['ollama-cloud/deepseek-v4-flash:cloud', 'deepseek-flash'],
    ['cline-pass/cline-pass/deepseek-v4-flash', 'mure-scout'],
    ['cursor-cli/gemini-3.5-flash', 'mure-scout'],
    ['anthropic/claude-haiku-4-5', 'mure-scout'],
  ];
  for (const [model, agentId] of routes) {
    const compiled = compileNativeSpawn({ ...entry('route-identity', 'evidence', model), agentId }, { taskId: 'route-identity' });
    assert.equal(compiled.model, model);
    assert.equal(compiled.agentId, agentId);
  }
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
  assert.match(next.action.args.task, /"entryId":"task-a:producer:minimax-portal-MiniMax-M3"/);
  const admittedVerifier = accept(next.state, next.action, 'verifier-accepted');
  assert.equal(admittedVerifier.state.providerCalibration.history.at(-1).purpose, 'verifier');
});

test('transport, quota, timeout, and auth failures take the next task-scoped availability fallback', () => {
  for (const failureKind of ['transport', 'quota', 'timeout', 'auth']) {
    const fallback = entry('task-a', 'availability-fallback');
    const first = reduceNativeDispatch(createNativeDispatchState(plan({ fallbacks: [fallback] })));
    const next = acceptedCompletion(first.state, first.action, `event-${failureKind}`, {
      ok: false,
      failureKind,
      error: `${failureKind} unavailable`,
    });
    assert.equal(next.action.type, 'sessions_spawn');
    assert.equal(next.action.purpose, 'producer');
    assert.equal(next.action.routeKind, 'availability-fallback');
    assert.equal(next.action.args.model, 'anthropic/claude-sonnet-5');
    const admittedFallback = accept(next.state, next.action, `fallback-${failureKind}-accepted`);
    assert.equal(admittedFallback.state.providerCalibration.history.at(-1).routeKind, 'availability-fallback');
  }
});

test('semantic child failures fail loud without consuming availability fallback', () => {
  const fallback = entry('task-a', 'availability-fallback');
  const first = reduceNativeDispatch(createNativeDispatchState(plan({ fallbacks: [fallback] })));
  const next = acceptedCompletion(first.state, first.action, 'event-semantic', {
    ok: false,
    failureKind: 'semantic',
  });
  assert.deepEqual(next.action.type, 'fail-loud');
  assert.equal(next.action.code, 'SEMANTIC_FAILURE');
});

test('verifier rejection runs quality escalation and then re-runs the verifier', () => {
  const escalation = entry('task-a', 'quality-escalation');
  const first = reduceNativeDispatch(createNativeDispatchState(plan({ escalations: [escalation] })));
  const verifier = acceptedCompletion(first.state, first.action, 'event-producer');
  const quality = acceptedCompletion(verifier.state, verifier.action, 'event-reject', { verdict: 'reject' });
  assert.equal(quality.action.type, 'sessions_spawn');
  assert.equal(quality.action.purpose, 'quality-escalation');
  assert.equal(quality.action.args.model, 'openai/gpt-5.6-terra');
  const admittedQuality = accept(quality.state, quality.action, 'quality-accepted');
  assert.equal(admittedQuality.state.providerCalibration.history.at(-1).routeKind, 'quality-escalation');
  const verifierAgain = reduceNativeDispatch(admittedQuality.state, complete(quality.action, 'quality-accepted'));
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
      { taskId: 'task-a', held: false, route: { classification: { riskClass: 'R1', requiresVerifier: false } } },
      { taskId: 'task-b', held: false, route: { classification: { riskClass: 'R1', requiresVerifier: false } } },
    ],
    queues: {
      producers: [entry('task-a', 'producer'), entry('task-b', 'producer')],
      verifiers: [],
      availabilityFallbacks: [entry('task-b', 'availability-fallback')],
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
  assert.equal(fallback.action.args.model, 'anthropic/claude-sonnet-5');
});

test('admission records native ids and rejects a silently resolved model change', () => {
  const first = reduceNativeDispatch(createNativeDispatchState(plan()));
  const accepted = recordNativeSpawnAccepted(first.state, first.action, {
    status: 'accepted',
    childSessionKey: `agent:${first.action.args.agentId}:subagent:abc`,
    runId: 'run-abc',
    resolvedModel: first.action.args.model,
  });
  assert.equal(accepted.action.reason, 'spawn-accepted');
  assert.equal(accepted.state.tasks['task-a'].awaiting.accepted.runId, 'run-abc');

  const mismatch = recordNativeSpawnAccepted(first.state, first.action, {
    status: 'accepted',
    childSessionKey: `agent:${first.action.args.agentId}:subagent:def`,
    runId: 'run-def',
    resolvedModel: 'unexpected/model',
  });
  assert.equal(mismatch.action.code, 'RESOLVED_MODEL_MISMATCH');

  assert.throws(() => recordNativeSpawnAccepted(first.state, first.action, {
    status: 'accepted',
    childSessionKey: 'not-a-native-session-key',
    runId: 'run-malformed',
    resolvedModel: first.action.args.model,
  }), /must identify/);
  assert.throws(() => recordNativeSpawnAccepted(first.state, first.action, {
    status: 'accepted',
    childSessionKey: 'agent:',
    runId: 'run-empty-agent',
    resolvedModel: first.action.args.model,
  }), /must identify/);
  assert.throws(() => recordNativeSpawnAccepted(first.state, first.action, {
    status: 'accepted',
    childSessionKey: 'agent:wrong-agent:subagent:abc',
    runId: 'run-wrong-agent',
    resolvedModel: first.action.args.model,
  }), /must identify/);
  assert.throws(() => recordNativeSpawnAccepted(first.state, first.action, {
    status: 'accepted',
    childSessionKey: `agent:${first.action.args.agentId}:subagent:abc\n`,
    runId: 'run-trailing-newline',
    resolvedModel: first.action.args.model,
  }), /must identify/);
});

test('custom policy entries cannot inject Sol or Yuri as a child worker', () => {
  const producerPlan = plan({ verifier: false });
  producerPlan.queues.producers = [{
    ...producerPlan.queues.producers[0],
    agentId: 'mure-yuri',
    model: 'openai/gpt-5.6-sol',
    providerFamily: 'openai',
  }];
  const producer = reduceNativeDispatch(createNativeDispatchState(producerPlan));
  assert.equal(producer.action.type, 'fail-loud');
  assert.equal(producer.action.code, 'SOL_PARENT_WORKER_FORBIDDEN');

  const verifierPlan = plan();
  verifierPlan.queues.producers[0] = {
    ...verifierPlan.queues.producers[0],
    model: 'minimax-portal/MiniMax-M3',
    providerFamily: 'minimax',
  };
  verifierPlan.queues.verifiers = [{
    ...verifierPlan.queues.verifiers[0],
    agentId: 'mure-yuri',
    model: 'openai/gpt-5.6-sol',
    providerFamily: 'openai',
  }];
  const initial = reduceNativeDispatch(createNativeDispatchState(verifierPlan));
  const verifier = acceptedCompletion(initial.state, initial.action, 'producer-complete');
  assert.equal(verifier.action.type, 'fail-loud');
  assert.equal(verifier.action.code, 'SOL_PARENT_WORKER_FORBIDDEN');
});

test('custom manifests cannot bypass cheap semantic and verifier floors', () => {
  const r2ProducerPlan = plan({ verifier: false });
  r2ProducerPlan.routes[0].route.classification = { riskClass: 'R2', requiresVerifier: false };
  r2ProducerPlan.queues.producers = [{
    ...r2ProducerPlan.queues.producers[0],
    agentId: 'deepseek-flash',
    model: 'deepseek/deepseek-v4-flash',
    providerFamily: 'deepseek',
  }];
  const cheapProducer = reduceNativeDispatch(createNativeDispatchState(r2ProducerPlan));
  assert.equal(cheapProducer.action.type, 'fail-loud');
  assert.equal(cheapProducer.action.code, 'CHEAP_SEMANTIC_WORK_FORBIDDEN');

  const r2VerifierPlan = plan({ providerCalibration });
  r2VerifierPlan.routes[0].route.classification = { riskClass: 'R2', requiresVerifier: true };
  r2VerifierPlan.queues.producers[0] = {
    ...r2VerifierPlan.queues.producers[0],
    model: 'minimax-portal/MiniMax-M3',
    providerFamily: 'minimax',
  };
  r2VerifierPlan.queues.verifiers[0] = {
    ...r2VerifierPlan.queues.verifiers[0],
    agentId: 'deepseek-flash',
    model: 'deepseek/deepseek-v4-flash',
    providerFamily: 'deepseek',
  };
  const producer = reduceNativeDispatch(createNativeDispatchState(r2VerifierPlan));
  const cheapVerifier = acceptedCompletion(producer.state, producer.action, 'r2-producer-complete');
  assert.equal(cheapVerifier.action.type, 'fail-loud');
  assert.equal(cheapVerifier.action.code, 'CHEAP_VERIFIER_FORBIDDEN');

  const r3VerifierPlan = structuredClone(r2VerifierPlan);
  r3VerifierPlan.routes[0].route.classification = { riskClass: 'R3', requiresVerifier: true };
  r3VerifierPlan.queues.verifiers[0] = {
    ...r3VerifierPlan.queues.verifiers[0],
    agentId: 'mure-calibrator',
    model: 'anthropic/claude-sonnet-5',
    providerFamily: 'anthropic',
  };
  const r3Producer = reduceNativeDispatch(createNativeDispatchState(r3VerifierPlan));
  const wrongR3Verifier = acceptedCompletion(r3Producer.state, r3Producer.action, 'r3-producer-complete');
  assert.equal(wrongR3Verifier.action.type, 'fail-loud');
  assert.equal(wrongR3Verifier.action.code, 'R3_OPUS_VERIFIER_REQUIRED');

  const r3OpusProducerPlan = plan({ riskClass: 'R3' });
  r3OpusProducerPlan.queues.producers[0] = {
    ...r3OpusProducerPlan.queues.producers[0],
    agentId: 'mure-sentinel',
    model: 'anthropic/claude-opus-4-8',
    providerFamily: 'anthropic',
  };
  const opusProducer = reduceNativeDispatch(createNativeDispatchState(r3OpusProducerPlan));
  assert.equal(opusProducer.action.type, 'fail-loud');
  assert.equal(opusProducer.action.code, 'R3_OPUS_RESERVED_FOR_VERIFICATION');

  const invalidRiskPlan = plan();
  invalidRiskPlan.routes[0].route.classification.riskClass = 'R9';
  assert.throws(() => createNativeDispatchState(invalidRiskPlan), /invalid riskClass/);
});

test('provider history and entry metadata cannot spoof an OpenAI model as another family', () => {
  const primary = { ...entry('task-a', 'producer', 'openai/gpt-5.6-terra'), providerFamily: 'minimax' };
  const alternative = { ...entry('task-a', 'producer', 'minimax-portal/MiniMax-M3'), providerFamily: 'minimax' };
  const p = plan({ providerCalibration, verifier: false, calibrationAlternatives: [alternative] });
  p.queues.producers = [primary];
  const history = [
    ...Array.from({ length: 6 }, (_, index) => historyEntry('openai', index)),
    ...Array.from({ length: 43 }, (_, index) => historyEntry('minimax', index)),
  ];
  const selected = reduceNativeDispatch(createNativeDispatchState(p, { providerHistory: history }));
  assert.equal(selected.action.routeKind, 'calibration-rebalance');
  assert.equal(selected.action.args.model, 'minimax-portal/MiniMax-M3');

  assert.throws(() => createNativeDispatchState(p, { providerHistory: [{
    ...historyEntry('openai', 'spoofed'),
    providerFamily: 'minimax',
  }] }), /providerFamily does not match model provider/);
  const resolvedMismatch = { ...historyEntry('openai', 'resolved-mismatch'), resolvedModel: 'openai/gpt-5.6-luna' };
  assert.throws(() => createNativeDispatchState(p, { providerHistory: [resolvedMismatch] }), /resolvedModel must match model/);
  assert.throws(() => createProviderCalibrationReport(providerCalibration, [resolvedMismatch]), /resolvedModel must match model/);
});

test('provider telemetry normalizes execution providers instead of leaking model prefixes', () => {
  const history = [
    {
      model: 'deepseek-v4-flash:direct', agentId: 'deepseek-flash',
      childSessionKey: 'agent:deepseek-flash:subagent:direct-1', runId: 'run-direct',
      resolvedModel: 'deepseek-v4-flash:direct',
    },
    {
      model: 'ollama-cloud/deepseek-v4-flash:cloud', agentId: 'deepseek-flash',
      childSessionKey: 'agent:deepseek-flash:subagent:ollama-1', runId: 'run-ollama',
      resolvedModel: 'ollama-cloud/deepseek-v4-flash:cloud',
    },
    {
      model: 'cline-pass/cline-pass/deepseek-v4-flash', agentId: 'mure-scout',
      childSessionKey: 'agent:mure-scout:subagent:cline-1', runId: 'run-cline',
      resolvedModel: 'cline-pass/cline-pass/deepseek-v4-flash',
    },
    {
      model: 'cursor-cli/gemini-3.5-flash', agentId: 'mure-scout',
      childSessionKey: 'agent:mure-scout:subagent:cursor-1', runId: 'run-cursor',
      resolvedModel: 'cursor-cli/gemini-3.5-flash',
    },
  ];
  assert.deepEqual(createProviderCalibrationReport({ windowDispatches: 10, minimumSamples: 1 }, history).counts, {
    deepseek: 1,
    ollama: 1,
    cline: 1,
    cursor: 1,
  });
});

test('custom manifests cannot bypass default-masked model canary proof', () => {
  const p = plan({ verifier: false });
  p.queues.producers[0] = entry('task-a', 'producer', 'zai/glm-5.2');
  const blocked = reduceNativeDispatch(createNativeDispatchState(p));
  assert.equal(blocked.action.type, 'fail-loud');
  assert.equal(blocked.action.code, 'MODEL_AVAILABILITY_UNPROVEN');

  p.availabilityEvidence = {
    'zai/glm-5.2': {
      source: 'native-completion-event',
      status: 'completed-native-canary',
      ok: true,
      resolvedModel: 'zai/glm-5.2',
      childSessionKey: 'agent:mure-architect:subagent:proven',
      runId: 'run-proven',
    },
  };
  const admitted = reduceNativeDispatch(createNativeDispatchState(p));
  assert.equal(admitted.action.type, 'sessions_spawn');
  assert.equal(admitted.action.args.model, 'zai/glm-5.2');
});

test('actual native admissions enforce the OpenAI worker ceiling through a non-OpenAI peer', () => {
  const primary = { ...entry('task-a', 'producer', 'openai/gpt-5.6-terra'), providerFamily: 'openai' };
  const alternative = { ...entry('task-a', 'producer', 'minimax-portal/MiniMax-M3'), providerFamily: 'minimax' };
  const p = plan({ providerCalibration, calibrationAlternatives: [alternative] });
  p.queues.producers = [primary];
  const history = [
    ...Array.from({ length: 6 }, (_, index) => historyEntry('openai', index)),
    ...Array.from({ length: 43 }, (_, index) => historyEntry('minimax', index)),
  ];
  const first = reduceNativeDispatch(createNativeDispatchState(p, { providerHistory: history }));
  assert.equal(first.action.routeKind, 'calibration-rebalance');
  assert.equal(first.action.args.model, 'minimax-portal/MiniMax-M3');
  const admitted = accept(first.state, first.action, 'balanced-admission');
  assert.equal(admitted.state.providerCalibration.report.sampleSize, 50);
  assert.equal(admitted.state.providerCalibration.report.counts.openai, 6);
  assert.equal(admitted.state.providerCalibration.report.counts.minimax, 44);
  assert.equal(admitted.state.providerCalibration.report.status, 'within-band');
});

test('OpenAI worker ceiling fails loud when no non-OpenAI peer remains', () => {
  const primary = { ...entry('task-a', 'producer', 'openai/gpt-5.6-terra'), providerFamily: 'openai' };
  const p = plan({ providerCalibration });
  p.queues.producers = [primary];
  const history = [
    ...Array.from({ length: 6 }, (_, index) => historyEntry('openai', index)),
    ...Array.from({ length: 43 }, (_, index) => historyEntry('minimax', index)),
  ];
  const result = reduceNativeDispatch(createNativeDispatchState(p, { providerHistory: history }));
  assert.equal(result.action.type, 'fail-loud');
  assert.equal(result.action.code, 'PROVIDER_CALIBRATION_CEILING');
});

test('OpenAI ceiling is hard on short histories and applies to verifier spawns', () => {
  const primary = { ...entry('task-a', 'producer', 'openai/gpt-5.6-terra'), providerFamily: 'openai' };
  const alternative = { ...entry('task-a', 'producer', 'minimax-portal/MiniMax-M3'), providerFamily: 'minimax' };
  const shortPlan = plan({ providerCalibration, verifier: false, calibrationAlternatives: [alternative] });
  shortPlan.queues.producers = [primary];
  const sevenNonOpenAi = Array.from({ length: 7 }, (_, index) => historyEntry('minimax', index));
  const scheduled = reduceNativeDispatch(createNativeDispatchState(shortPlan, { providerHistory: sevenNonOpenAi }));
  assert.equal(scheduled.action.routeKind, 'calibration-rebalance');
  assert.equal(scheduled.action.args.model, 'minimax-portal/MiniMax-M3');

  const verifierPlan = plan({ providerCalibration });
  verifierPlan.queues.producers[0] = {
    ...verifierPlan.queues.producers[0],
    model: 'minimax-portal/MiniMax-M3',
    providerFamily: 'minimax',
  };
  verifierPlan.queues.verifiers[0] = {
    ...verifierPlan.queues.verifiers[0],
    model: 'openai/gpt-5.6-luna',
    providerFamily: 'openai',
  };
  const sixNonOpenAi = Array.from({ length: 6 }, (_, index) => historyEntry('minimax', `prior-${index}`));
  const producer = reduceNativeDispatch(createNativeDispatchState(verifierPlan, { providerHistory: sixNonOpenAi }));
  const blockedVerifier = acceptedCompletion(producer.state, producer.action, 'minimax-producer-complete');
  assert.equal(blockedVerifier.action.type, 'fail-loud');
  assert.equal(blockedVerifier.action.code, 'PROVIDER_CALIBRATION_CEILING');
});

test('50 accepted implementation workers cannot exceed the 12 percent OpenAI ceiling', () => {
  const routes = [];
  const producers = [];
  const calibrationAlternatives = [];
  for (let index = 0; index < 50; index += 1) {
    const taskId = `implementation-${index}`;
    routes.push({ taskId, held: false, route: { selection: 'primary', classification: { riskClass: 'R1', requiresVerifier: false } } });
    producers.push({ ...entry(taskId, 'producer', 'openai/gpt-5.6-terra'), providerFamily: 'openai' });
    calibrationAlternatives.push({ ...entry(taskId, 'producer', 'minimax-portal/MiniMax-M3'), providerFamily: 'minimax' });
  }
  let state = createNativeDispatchState({
    routes,
    queues: { producers, verifiers: [], availabilityFallbacks: [], qualityEscalations: [], calibrationAlternatives },
    blocked: [],
    providerCalibration,
  });
  for (let index = 0; index < 50; index += 1) {
    const scheduled = reduceNativeDispatch(state);
    assert.equal(scheduled.action.type, 'sessions_spawn');
    const id = `accepted-${index}`;
    const admitted = accept(scheduled.state, scheduled.action, id);
    const acceptedReport = admitted.state.providerCalibration.report;
    const acceptedOpenAiShare = (acceptedReport.counts.openai || 0) / acceptedReport.sampleSize;
    assert.ok(acceptedOpenAiShare <= 0.12, `prefix ${acceptedReport.sampleSize} exceeded ceiling: ${acceptedOpenAiShare}`);
    const completed = reduceNativeDispatch(admitted.state, complete(scheduled.action, id));
    assert.equal(completed.action.reason, 'task-passed');
    state = completed.state;
  }
  assert.equal(state.providerCalibration.report.sampleSize, 50);
  assert.equal(state.providerCalibration.report.counts.openai, 6);
  assert.equal(state.providerCalibration.report.counts.minimax, 44);
  assert.equal(state.providerCalibration.report.status, 'within-band');
});

test('evidence and producer admissions are counted from accepted native spawns', () => {
  const p = plan({ providerCalibration, verifier: false });
  p.queues.producers[0] = {
    ...p.queues.producers[0],
    model: 'minimax-portal/MiniMax-M3',
    providerFamily: 'minimax',
  };
  p.queues.evidence = [{ ...entry('task-a', 'evidence', 'deepseek/deepseek-v4-flash'), providerFamily: 'deepseek' }];
  const evidence = reduceNativeDispatch(createNativeDispatchState(p));
  const admittedEvidence = accept(evidence.state, evidence.action, 'evidence-accepted');
  assert.deepEqual(admittedEvidence.state.providerCalibration.report.counts, { deepseek: 1 });
  const producer = reduceNativeDispatch(admittedEvidence.state, complete(evidence.action, 'evidence-accepted'));
  const admittedProducer = accept(producer.state, producer.action, 'producer-accepted');
  assert.deepEqual(admittedProducer.state.providerCalibration.report.counts, { deepseek: 1, minimax: 1 });
});

test('evidence completes before producer and is injected into the producer task', () => {
  const p = plan({ verifier: false });
  p.queues.evidence = [entry('task-a', 'evidence')];
  const evidence = reduceNativeDispatch(createNativeDispatchState(p));
  assert.equal(evidence.action.purpose, 'evidence');
  const producer = acceptedCompletion(evidence.state, evidence.action, 'evidence-done', { output: 'bounded-evidence' });
  assert.equal(producer.action.purpose, 'producer');
  assert.match(producer.action.args.task, /bounded-evidence/);
});

test('verifier execution failure fails loud and never consumes producer fallbacks', () => {
  const p = plan({ fallbacks: [entry('task-a', 'availability-fallback')] });
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
  p.queues.producers = [entry('task-a', 'producer', 'anthropic/claude-sonnet-5')];
  const producer = reduceNativeDispatch(createNativeDispatchState(p));
  const failed = acceptedCompletion(producer.state, producer.action, 'producer-done');
  assert.equal(failed.action.code, 'VERIFIER_NOT_INDEPENDENT');
});

test('post-fallback producer cannot become its own verifier', () => {
  const fallback = entry('task-a', 'availability-fallback', 'anthropic/claude-sonnet-5');
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
  const escalation = entry('task-a', 'quality-escalation', 'anthropic/claude-sonnet-5');
  const p = plan({ escalations: [escalation] });
  const primary = reduceNativeDispatch(createNativeDispatchState(p));
  const verifier = acceptedCompletion(primary.state, primary.action, 'primary-done');
  const quality = acceptedCompletion(verifier.state, verifier.action, 'verifier-reject', { verdict: 'reject' });
  const failed = acceptedCompletion(quality.state, quality.action, 'quality-done');
  assert.equal(failed.action.code, 'VERIFIER_NOT_INDEPENDENT');
});
