import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileOmpSpawn,
  createNativeDispatchState,
  createProviderCalibrationReport,
  recordNativeSpawnAccepted,
  reduceNativeDispatch,
} from './sol-moe-native-dispatch.mjs';
import { deterministicOmpTaskId } from './omp-task-adapter.mjs';

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
    'anthropic/claude-sonnet-5': 'mure-calibrator-sonnet5',
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
  metric: 'OMP TaskTool dispatch count',
  windowDispatches: 50,
  minimumSamples: 30,
  activeTargets: {
    openai: { min: 0, max: 0.12 },
    minimax: { min: 0, max: 1 },
  },
};

// Agent-id → model lookup for test helpers. Covers every agent dispatched by
// the manifest entries above.  mure-scout is multi-model — tests that complete
// scout actions must pass `model` explicitly.
function resolveModel(action) {
  const agent = action.args.tasks[0].agent;
  if (agent === 'mure-synthesist') return 'minimax-portal/MiniMax-M3';
  if (agent === 'mure-calibrator-sonnet5') return 'anthropic/claude-sonnet-5';
  if (agent === 'mure-engineer') return 'openai/gpt-5.6-terra';
  if (agent === 'mure-adjudicator') return 'openai/gpt-5.6-luna';
  if (agent === 'mure-sentinel') return 'anthropic/claude-opus-4-8';
  if (agent === 'mure-architect') return 'zai/glm-5.2';
  if (agent === 'mure-artificer') return 'opencode-go/mimo-v2.5';
  if (agent === 'deepseek-flash') return 'deepseek/deepseek-v4-flash';
  return '';
}

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
    jobId: `job-${family}-${index}`,
    agent: agentId,
  };
}

function complete(action, id, fields = {}) {
  const { model: explicitModel, output, ...rest } = fields;
  const ok = rest.ok !== false;
  const completionModel = explicitModel || resolveModel(action);
  return {
    id,
    taskId: action.taskId,
    entryId: action.entryId,
    purpose: action.purpose,
    jobId: id,
    ok,
    ...(output !== undefined ? { output } : ok ? { output: 'work-product' } : {}),
    ...(ok ? { modelChange: { model: completionModel } } : {}),
    ...rest,
  };
}

function accept(state, action, id = action.entryId.replace(/[^a-z0-9]+/gi, '-')) {
  const receipt = {
    jobId: id,
    agent: action.args.tasks[0].agent,
  };
  return { ...recordNativeSpawnAccepted(state, action, receipt), receipt };
}

function acceptedCompletion(state, action, id, fields = {}) {
  const admitted = accept(state, action, id);
  return reduceNativeDispatch(admitted.state, complete(action, id, fields));
}

test('compiler emits exactly the OMP TaskTool dispatch shape and deterministic task ID', () => {
  const manifest = entry('alpha-task', 'producer', 'openai/gpt-5.6-terra');
  const a = compileOmpSpawn(manifest, { attempt: 2 });
  const b = compileOmpSpawn(manifest, { attempt: 2 });
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a).sort(), ['context', 'i', 'tasks']);
  assert.ok(!('agent' in a), 'compiled action must not contain a top-level agent');
  assert.ok(Array.isArray(a.tasks) && a.tasks.length === 1);
  const task = a.tasks[0];
  assert.deepEqual(Object.keys(task).sort(), ['agent', 'name', 'task']);
  for (const legacy of ['assignment', 'id', 'description', 'role']) {
    assert.ok(!(legacy in task), `tasks[0] must not contain legacy field "${legacy}"`);
  }
  assert.equal(task.agent, manifest.agentId);
  assert.equal(task.name, deterministicOmpTaskId(manifest));
  assert.equal(typeof task.task, 'string');
  assert.ok(task.task.length > 0);
  assert.ok(/^[A-Z][A-Za-z0-9]{0,31}$/.test(task.name), `task name ${task.name} must be CamelCase ≤32 chars`);
  assert.ok(typeof a.i === 'string' && a.i.length > 0);
  assert.ok(typeof a.context === 'string' && a.context.length > 0);
  for (const forbidden of ['cwd', 'model', 'thinking', 'taskName', 'agentId', 'runtime', 'sandbox', 'cleanup', 'mode', 'label']) {
    assert.ok(!(forbidden in a), `forbidden key "${forbidden}" should not be in compiled action`);
  }
});

test('compiler rejects missing or invalid manifest fields and mismatched task context', () => {
  const valid = entry('task-a', 'producer');
  assert.throws(() => compileOmpSpawn({ ...valid, id: '' }), /id is required/);
  assert.throws(() => compileOmpSpawn({ ...valid, model: '' }), /model is required/);
  assert.throws(() => compileOmpSpawn({ ...valid, purpose: 'unknown' }), /purpose is invalid/);
  assert.throws(() => compileOmpSpawn({ ...valid, agentId: 'agent bad' }), /agentId contains unsupported/);
  assert.throws(() => compileOmpSpawn({ ...valid, thinking: 'turbo' }), /thinking is invalid/);
  assert.throws(() => compileOmpSpawn({ ...valid, model: 'cheap/custom-model' }), /not an allowed MURE worker/);
  assert.throws(() => compileOmpSpawn({ ...valid, agentId: 'mure-engineer' }), /agentId must be mure-synthesist/);
  assert.throws(() => compileOmpSpawn(valid, { taskId: 'other-task' }), /taskId must match/);
  assert.throws(() => compileOmpSpawn(valid, { cwd: 'relative' }), /absolute path/);
  assert.throws(() => compileOmpSpawn({ ...valid, agentId: 'mure-yuri' }), /cannot be compiled as a native child worker/);
  assert.throws(() => compileOmpSpawn({ ...valid, model: 'openai/gpt-5.6-sol' }), /cannot be compiled as a native child worker/);
  assert.throws(() => compileOmpSpawn({
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
    const compiled = compileOmpSpawn({ ...entry('route-identity', 'evidence', model), agentId }, { taskId: 'route-identity' });
    assert.ok(!('agent' in compiled), 'compiled action must not contain a top-level agent');
    assert.equal(compiled.tasks[0].agent, agentId);
  }
});

test('canary-bootstrap agent models compile for purpose evidence and reject purpose producer', () => {
  const bootstrapRoutes = [
    ['ollama-cloud/deepseek-v4-flash', 'deepseek-flash-bootstrap'],
    ['ollama-cloud/kimi-k2.7-code', 'mure-engineer-kimi-bootstrap'],
    ['ollama-cloud/nemotron-3-ultra', 'mure-deliberator-nemotron-bootstrap'],
    ['openai-codex/gpt-5.6-luna', 'mure-adjudicator-luna-bootstrap'],
    ['zai/glm-5.1', 'mure-helmsman-glm51-bootstrap'],
    ['cursor/composer-2.5', 'composer-25-bootstrap'],
    ['cursor/grok-4.5-xhigh', 'mure-ideator-grok45-bootstrap'],
  ];
  for (const [model, agentId] of bootstrapRoutes) {
    const compiled = compileOmpSpawn(
      { ...entry('bootstrap-identity', 'evidence', model), agentId },
      { taskId: 'bootstrap-identity' },
    );
    assert.equal(compiled.tasks[0].agent, agentId, `${model} must compile evidence purpose to ${agentId}`);

    assert.throws(
      () => compileOmpSpawn({ ...entry('bootstrap-identity', 'producer', model), agentId }, { taskId: 'bootstrap-identity' }),
      /evidence-only and may not compile for purpose: producer/,
      `${agentId} must reject purpose producer`,
    );
  }
});

test('anthropic/claude-sonnet-5 binds to mure-calibrator-sonnet5', () => {
  const compiled = compileOmpSpawn(entry('task-a', 'verifier'));
  assert.equal(compiled.tasks[0].agent, 'mure-calibrator-sonnet5');
});

test('only verifier prompts demand strict JSON verdicts', () => {
  const producer = compileOmpSpawn(entry('task-a', 'producer'));
  const verifier = compileOmpSpawn(entry('task-a', 'verifier'));
  assert.match(verifier.tasks[0].task, /VERIFIER CONTRACT/);
  assert.match(verifier.tasks[0].task, /\{"verdict":"pass"\}/);
  assert.doesNotMatch(producer.tasks[0].task, /VERIFIER CONTRACT|\{"verdict":"pass"\}/);
  assert.match(producer.tasks[0].task, /Task ID: task-a/);
});

test('producer success advances only its own task to a verifier', () => {
  const state = createNativeDispatchState(plan());
  const first = reduceNativeDispatch(state);
  assert.equal(first.action.type, 'omp-task-spawn');
  assert.equal(first.action.purpose, 'producer');
  const next = acceptedCompletion(first.state, first.action, 'event-producer');
  assert.equal(next.action.type, 'omp-task-spawn');
  assert.equal(next.action.purpose, 'verifier');
  assert.match(next.action.args.tasks[0].task, /"entryId":"task-a:producer:minimax-portal-MiniMax-M3"/);
  const admittedVerifier = accept(next.state, next.action, 'verifier-accepted');
  assert.ok(admittedVerifier.state.tasks['task-a'].awaiting.accepted);
  assert.equal(admittedVerifier.state.tasks['task-a'].awaiting.accepted.jobId, 'verifier-accepted');
  assert.equal(admittedVerifier.state.tasks['task-a'].awaiting.accepted.agent, 'mure-calibrator-sonnet5');
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
    assert.equal(next.action.type, 'omp-task-spawn');
    assert.equal(next.action.purpose, 'producer');
    assert.equal(next.action.routeKind, 'availability-fallback');
    assert.equal(next.action.args.tasks[0].agent, 'mure-calibrator-sonnet5');
    const admittedFallback = accept(next.state, next.action, `fallback-${failureKind}-accepted`);
    assert.equal(admittedFallback.state.tasks['task-a'].awaiting.accepted.agent, 'mure-calibrator-sonnet5');
    assert.equal(admittedFallback.state.tasks['task-a'].awaiting.routeKind, 'availability-fallback');
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
  assert.equal(quality.action.type, 'omp-task-spawn');
  assert.equal(quality.action.purpose, 'quality-escalation');
  assert.equal(quality.action.args.tasks[0].agent, 'mure-engineer');
  const admittedQuality = accept(quality.state, quality.action, 'quality-accepted');
  assert.equal(admittedQuality.state.tasks['task-a'].awaiting.routeKind, 'quality-escalation');
  const verifierAgain = reduceNativeDispatch(admittedQuality.state, complete(quality.action, 'quality-accepted'));
  assert.equal(verifierAgain.action.type, 'omp-task-spawn');
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

test('verifier rejection fails loud when quality escalation is exhausted', () => {
  const producer = reduceNativeDispatch(createNativeDispatchState(plan()));
  const verifier = acceptedCompletion(producer.state, producer.action, 'producer-before-exhaustion');
  const exhausted = acceptedCompletion(verifier.state, verifier.action, 'verifier-reject-exhausted', { verdict: 'reject' });
  assert.equal(exhausted.action.type, 'fail-loud');
  assert.equal(exhausted.action.code, 'QUALITY_ESCALATION_EXHAUSTED');
});

test('missing producer and required verifier fail loud with exact codes', () => {
  const noProducer = plan();
  noProducer.queues.producers = [];
  const producerMissing = reduceNativeDispatch(createNativeDispatchState(noProducer));
  assert.equal(producerMissing.action.type, 'fail-loud');
  assert.equal(producerMissing.action.code, 'PRODUCER_MISSING');

  const noVerifier = plan();
  noVerifier.queues.verifiers = [];
  const producer = reduceNativeDispatch(createNativeDispatchState(noVerifier));
  const verifierMissing = acceptedCompletion(producer.state, producer.action, 'producer-without-verifier');
  assert.equal(verifierMissing.action.type, 'fail-loud');
  assert.equal(verifierMissing.action.code, 'REQUIRED_VERIFIER_MISSING');
});

test('completion before OMP spawn admission fails loud', () => {
  const scheduled = reduceNativeDispatch(createNativeDispatchState(plan()));
  const premature = reduceNativeDispatch(scheduled.state, complete(scheduled.action, 'premature-completion'));
  assert.equal(premature.action.type, 'fail-loud');
  assert.equal(premature.action.code, 'COMPLETION_BEFORE_ACCEPTANCE');
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
    jobId: 'wrong-job', ok: true, modelChange: { model: 'minimax-portal/MiniMax-M3' },
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
  assert.equal(fallback.action.args.tasks[0].agent, 'mure-calibrator-sonnet5');
});

test('admission records OMP jobId and agent, rejects agent mismatch', () => {
  const first = reduceNativeDispatch(createNativeDispatchState(plan()));
  const accepted = recordNativeSpawnAccepted(first.state, first.action, {
    jobId: 'admission-abc',
    agent: first.action.args.tasks[0].agent,
  });
  assert.equal(accepted.action.reason, 'spawn-accepted');
  assert.equal(accepted.state.tasks['task-a'].awaiting.accepted.jobId, 'admission-abc');
  assert.equal(accepted.state.tasks['task-a'].awaiting.accepted.agent, first.action.args.tasks[0].agent);

  assert.throws(() => recordNativeSpawnAccepted(first.state, first.action, {
    jobId: 'agent-mismatch-job',
    agent: 'wrong-card-agent',
  }), /does not match dispatched card/);

  assert.throws(() => recordNativeSpawnAccepted(first.state, first.action, {
    jobId: 'not-valid job id with spaces',
    agent: first.action.args.tasks[0].agent,
  }), /malformed/);

  assert.throws(() => recordNativeSpawnAccepted(first.state, first.action, {
    jobId: '',
    agent: first.action.args.tasks[0].agent,
  }), /required/);

  assert.throws(() => recordNativeSpawnAccepted(first.state, first.action, null), /must be an object/);
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
    agentId: 'mure-calibrator-sonnet5',
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
  assert.equal(selected.action.args.tasks[0].agent, 'mure-synthesist');

  assert.throws(() => createNativeDispatchState(p, { providerHistory: [{
    ...historyEntry('openai', 'spoofed'),
    providerFamily: 'minimax',
  }] }), /providerFamily does not match model provider/);
  const agentMismatch = { ...historyEntry('openai', 'agent-mismatch'), agent: 'different-agent' };
  assert.throws(() => createNativeDispatchState(p, { providerHistory: [agentMismatch] }), /agent must match agentId/);
  assert.throws(() => createProviderCalibrationReport(providerCalibration, [agentMismatch]), /agent must match agentId/);
});

test('provider telemetry normalizes execution providers instead of leaking model prefixes', () => {
  const history = [
    {
      model: 'deepseek-v4-flash:direct', agentId: 'deepseek-flash',
      jobId: 'job-direct-1', agent: 'deepseek-flash',
    },
    {
      model: 'ollama-cloud/deepseek-v4-flash:cloud', agentId: 'deepseek-flash',
      jobId: 'job-ollama-1', agent: 'deepseek-flash',
    },
    {
      model: 'cline-pass/cline-pass/deepseek-v4-flash', agentId: 'mure-scout',
      jobId: 'job-cline-1', agent: 'mure-scout',
    },
    {
      model: 'cursor-cli/gemini-3.5-flash', agentId: 'mure-scout',
      jobId: 'job-cursor-1', agent: 'mure-scout',
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
      source: 'omp-task-result',
      status: 'completed-omp-canary',
      ok: true,
      jobId: 'glm-canary-proven',
      model: 'zai/glm-5.2',
      agentId: 'mure-architect',
    },
  };
  const admitted = reduceNativeDispatch(createNativeDispatchState(p));
  assert.equal(admitted.action.type, 'omp-task-spawn');
  assert.equal(admitted.action.args.tasks[0].agent, 'mure-architect');
});

test('a canary proof minted for a different model cannot unmask GLM by replay', () => {
  const p = plan({ verifier: false });
  p.queues.producers[0] = entry('task-a', 'producer', 'zai/glm-5.2');
  p.availabilityEvidence = {
    'zai/glm-5.2': {
      source: 'omp-task-result',
      status: 'completed-omp-canary',
      ok: true,
      jobId: 'glm-canary-proven',
      model: 'minimax-portal/MiniMax-M3',
      agentId: 'mure-architect',
    },
  };
  const blocked = reduceNativeDispatch(createNativeDispatchState(p));
  assert.equal(blocked.action.type, 'fail-loud');
  assert.equal(blocked.action.code, 'MODEL_AVAILABILITY_UNPROVEN');
});

test('a canary proof minted for a different agent cannot unmask GLM by replay', () => {
  const p = plan({ verifier: false });
  p.queues.producers[0] = entry('task-a', 'producer', 'zai/glm-5.2');
  p.availabilityEvidence = {
    'zai/glm-5.2': {
      source: 'omp-task-result',
      status: 'completed-omp-canary',
      ok: true,
      jobId: 'glm-canary-proven',
      model: 'zai/glm-5.2',
      agentId: 'mure-synthesist',
    },
  };
  const blocked = reduceNativeDispatch(createNativeDispatchState(p));
  assert.equal(blocked.action.type, 'fail-loud');
  assert.equal(blocked.action.code, 'MODEL_AVAILABILITY_UNPROVEN');
});

test('legacy native-completion proof fields cannot unmask a default-masked model', () => {
  const p = plan({ verifier: false });
  p.queues.producers[0] = entry('task-a', 'producer', 'zai/glm-5.2');
  p.availabilityEvidence = {
    'zai/glm-5.2': {
      source: 'native-completion-event',
      status: 'completed-native-canary',
      ok: true,
      resolvedModel: 'zai/glm-5.2',
      childSessionKey: 'agent:test:subagent:zai-glm-5-2',
      runId: 'run-zai-glm-5-2',
    },
  };
  const blocked = reduceNativeDispatch(createNativeDispatchState(p));
  assert.equal(blocked.action.type, 'fail-loud');
  assert.equal(blocked.action.code, 'MODEL_AVAILABILITY_UNPROVEN');
});

test('actual OMP spawn admissions enforce the OpenAI worker ceiling through a non-OpenAI peer', () => {
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
  assert.equal(first.action.args.tasks[0].agent, 'mure-synthesist');
  const admitted = accept(first.state, first.action, 'balanced-admission');
  // Calibration recorded at completion, not admission — report still shows initial 49 entries
  assert.equal(admitted.state.providerCalibration.report.sampleSize, 49);
  assert.equal(admitted.state.providerCalibration.report.counts.openai, 6);
  assert.equal(admitted.state.providerCalibration.report.counts.minimax, 43);
  // Completion records the MiniMax entry, bumping sample to 50
  const completed = reduceNativeDispatch(admitted.state, complete(first.action, 'balanced-admission'));
  assert.equal(completed.state.providerCalibration.report.sampleSize, 50);
  assert.equal(completed.state.providerCalibration.report.counts.minimax, 44);
  assert.equal(completed.state.providerCalibration.report.status, 'within-band');
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
  assert.equal(scheduled.action.args.tasks[0].agent, 'mure-synthesist');

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
    assert.equal(scheduled.action.type, 'omp-task-spawn');
    const id = `accepted-${index}`;
    const admitted = accept(scheduled.state, scheduled.action, id);
    const completed = reduceNativeDispatch(admitted.state, complete(scheduled.action, id));
    assert.equal(completed.action.reason, 'task-passed');
    // Calibration recorded at completion; check post-completion report
    const postReport = completed.state.providerCalibration.report;
    const postOpenAiShare = (postReport.counts.openai || 0) / postReport.sampleSize;
    assert.ok(postOpenAiShare <= 0.12, `sample ${postReport.sampleSize} exceeded ceiling: ${postOpenAiShare}`);
    state = completed.state;
  }
  assert.equal(state.providerCalibration.report.sampleSize, 50);
  assert.equal(state.providerCalibration.report.counts.openai, 6);
  assert.equal(state.providerCalibration.report.counts.minimax, 44);
  assert.equal(state.providerCalibration.report.status, 'within-band');
});

test('evidence and producer admissions are counted from completed OMP spawns', () => {
  const p = plan({ providerCalibration, verifier: false });
  p.queues.producers[0] = {
    ...p.queues.producers[0],
    model: 'minimax-portal/MiniMax-M3',
    providerFamily: 'minimax',
  };
  p.queues.evidence = [{ ...entry('task-a', 'evidence', 'deepseek/deepseek-v4-flash'), providerFamily: 'deepseek' }];
  const evidence = reduceNativeDispatch(createNativeDispatchState(p));
  const admittedEvidence = accept(evidence.state, evidence.action, 'evidence-accepted');
  // Calibration recorded at completion, not admission
  assert.equal(admittedEvidence.state.providerCalibration.report.sampleSize, 0);
  const evidenceDone = reduceNativeDispatch(admittedEvidence.state, complete(evidence.action, 'evidence-accepted'));
  assert.deepEqual(evidenceDone.state.providerCalibration.report.counts, { deepseek: 1 });
  // evidenceDone already contains the producer spawn (scheduleTask chains after evidence completion)
  const admittedProducer = accept(evidenceDone.state, evidenceDone.action, 'producer-accepted');
  // Still just evidence until producer completes
  assert.deepEqual(admittedProducer.state.providerCalibration.report.counts, { deepseek: 1 });
  const producerDone = reduceNativeDispatch(admittedProducer.state, complete(evidenceDone.action, 'producer-accepted'));
  assert.deepEqual(producerDone.state.providerCalibration.report.counts, { deepseek: 1, minimax: 1 });
});

test('evidence completes before producer and is injected into the producer task', () => {
  const p = plan({ verifier: false });
  p.queues.evidence = [entry('task-a', 'evidence')];
  const evidence = reduceNativeDispatch(createNativeDispatchState(p));
  assert.equal(evidence.action.purpose, 'evidence');
  const producer = acceptedCompletion(evidence.state, evidence.action, 'evidence-done', { output: 'bounded-evidence' });
  assert.equal(producer.action.purpose, 'producer');
  assert.match(producer.action.args.tasks[0].task, /bounded-evidence/);
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
