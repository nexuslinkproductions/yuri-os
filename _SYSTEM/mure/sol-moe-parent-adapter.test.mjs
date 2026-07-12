import test from 'node:test';
import assert from 'node:assert/strict';

import { createNativeDispatchState, reduceNativeDispatch } from './sol-moe-native-dispatch.mjs';
import { createNativeDispatchShadow } from './native-dispatch-shadow.mjs';
import { shadowSnapshot } from './native-dispatch-shadow.mjs';
import {
  mirrorOmpSpawnAction,
  admitOmpSpawn,
  applyOmpCompletion,
  extractTerminalTaskResult,
  extractTerminalTaskResults,
} from './sol-moe-parent-adapter.mjs';
import { parseOmpTranscript } from './omp-task-adapter.mjs';

// --- helpers ---

function transcript(model = 'minimax-portal/MiniMax-M3') {
  return [
    JSON.stringify({ type: 'session', sessionId: 'sess-1' }),
    JSON.stringify({ type: 'model_change', model }),
    JSON.stringify({ type: 'thinking_level_change', level: 'high' }),
    JSON.stringify({ type: 'yield', yieldType: 'result', data: {} }),
  ].join('\n');
}

function transcriptEvidence(model, jobId) {
  return parseOmpTranscript(transcript(model), jobId);
}

const modelToAgent = {
  'minimax-portal/MiniMax-M3': 'mure-synthesist',
  'anthropic/claude-sonnet-5': 'mure-calibrator',
};

function entry(taskId, purpose, model = null) {
  const defaultModels = {
    producer: 'minimax-portal/MiniMax-M3',
    verifier: 'anthropic/claude-sonnet-5',
    'availability-fallback': 'anthropic/claude-sonnet-5',
  };
  model ||= defaultModels[purpose];
  return {
    id: `${taskId}:${purpose}:${String(model).replace(/[^A-Za-z0-9._:-]+/g, '-')}`,
    taskId,
    purpose,
    role: 'engineer',
    agentId: modelToAgent[model] || `mure-${purpose}`,
    model,
    thinking: 'high',
    prompt: `Complete only ${taskId}.`,
  };
}

function plan(options = {}) {
  const taskId = options.taskId || 'task-a';
  return {
    routes: [{
      taskId,
      held: false,
      route: {
        selection: 'primary',
        classification: { riskClass: 'R2', requiresVerifier: true },
        verifier: { required: true },
      },
    }],
    queues: {
      producers: [entry(taskId, 'producer')],
      verifiers: [entry(taskId, 'verifier')],
      availabilityFallbacks: options.fallbacks || [],
      qualityEscalations: [],
      calibrationAlternatives: [],
    },
    blocked: [],
    providerCalibration: null,
  };
}

const baseTicket = {
  id: 'task-a',
  from: 'control',
  to: 'worker',
  actors: { issuer: 'sol-parent', assignee: 'worker-a' },
  scope: ['_SYSTEM/mure/'],
  expectedOutcome: 'bounded evidence',
  constraints: ['read-only'],
  evidenceRequirements: ['TERM_COUNT', 'FILE_COUNT'],
  escalationRule: 'return to control on ambiguity',
  writeSet: [],
};

const producerEvidence = { evidence: { TERM_COUNT: '4', FILE_COUNT: '1' } };

function receiptFor(action, id) {
  return {
    jobId: `job-${id}`,
    agent: action.args.tasks[0].agent,
  };
}

function spawnResult(base, model) {
  const selectedModel = model || 'minimax-portal/MiniMax-M3';
  return {
    id: base.id,
    agent: modelToAgent[selectedModel] || 'mure-producer',
    status: 'completed',
    duration: 100,
    output: base.output || '{"summary":"ok"}',
  };
}

function admit(state, shadow, action, id) {
  const mirrorShadow = mirrorOmpSpawnAction(shadow, action);
  return admitOmpSpawn(state, mirrorShadow, action, receiptFor(action, id));
}

function scheduleAndAdmit(taskPlan = plan(), ticket = baseTicket, id = 'a') {
  const state = createNativeDispatchState(taskPlan);
  const shadow = createNativeDispatchShadow(ticket);
  const scheduled = reduceNativeDispatch(state, null);
  const admitted = admit(scheduled.state, shadow, scheduled.action, id);
  return { action: scheduled.action, state: admitted.state, shadow: admitted.shadow, id, jobId: `job-${id}` };
}

// --- mirrorOmpSpawnAction ---

test('mirrorOmpSpawnAction forwards omp-task-spawn action into shadow', () => {
  const state = createNativeDispatchState(plan());
  const shadow = createNativeDispatchShadow(baseTicket);
  const scheduled = reduceNativeDispatch(state, null);
  const nextShadow = mirrorOmpSpawnAction(shadow, scheduled.action);
  assert.equal(nextShadow.awaiting.purpose, 'producer');
});

test('mirrorOmpSpawnAction tolerates non-spawn action', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const nextShadow = mirrorOmpSpawnAction(shadow, { type: 'none', reason: 'no-runnable-task' });
  assert.equal(nextShadow.awaiting, null);
});

// --- admitOmpSpawn ---

test('admitOmpSpawn records admission into reducer state and shadow in lockstep', () => {
  const state = createNativeDispatchState(plan());
  let shadow = createNativeDispatchShadow(baseTicket);
  const scheduled = reduceNativeDispatch(state, null);
  shadow = mirrorOmpSpawnAction(shadow, scheduled.action);

  const admitted = admitOmpSpawn(scheduled.state, shadow, scheduled.action, receiptFor(scheduled.action, 'a'));
  assert.equal(admitted.state.tasks['task-a'].awaiting.accepted.jobId, 'job-a');
  assert.equal(admitted.shadow.admissions.length, 1);
  assert.equal(admitted.shadow.awaiting.admission.jobId, 'job-a');
});

test('admitOmpSpawn rejects receipt whose agent diverges from dispatched card', () => {
  const state = createNativeDispatchState(plan());
  let shadow = createNativeDispatchShadow(baseTicket);
  const scheduled = reduceNativeDispatch(state, null);
  shadow = mirrorOmpSpawnAction(shadow, scheduled.action);

  const badReceipt = { ...receiptFor(scheduled.action, 'a'), agent: 'mure-calibrator' };
  assert.throws(
    () => admitOmpSpawn(scheduled.state, shadow, scheduled.action, badReceipt),
    /receipt agent/,
  );
});

// --- applyOmpCompletion ---

test('applyOmpCompletion resolves taskId/entryId/purpose from state by jobId', () => {
  const { action, state, shadow, jobId } = scheduleAndAdmit();
  const applied = applyOmpCompletion(state, shadow,
    spawnResult({ id: action.args.tasks[0].name, output: '{"summary":"ok"}' }),
    jobId,
    transcriptEvidence('minimax-portal/MiniMax-M3', jobId),
    producerEvidence);

  assert.equal(applied.event.taskId, 'task-a');
  assert.equal(applied.event.entryId, action.entryId);
  assert.equal(applied.event.purpose, 'producer');
  assert.equal(applied.event.output, '{"summary":"ok"}');
});

test('applyOmpCompletion carries failure on non-completed status', () => {
  const { action, state, shadow, jobId } = scheduleAndAdmit();
  const applied = applyOmpCompletion(state, shadow, {
    id: action.args.tasks[0].name,
    agent: action.args.tasks[0].agent,
    status: 'failed',
    duration: 100,
    output: null,
  }, jobId, null);

  assert.equal(applied.event.ok, false);
  assert.equal(applied.event.failureKind, 'semantic');
});

test('applyOmpCompletion rejects on agent mismatch', () => {
  const { action, state, shadow, jobId } = scheduleAndAdmit();
  assert.throws(() => applyOmpCompletion(state, shadow, {
    id: action.args.tasks[0].name,
    agent: 'mure-calibrator',
    status: 'completed',
    duration: 100,
    output: '{}',
  }, jobId, transcriptEvidence('minimax-portal/MiniMax-M3', jobId), producerEvidence), /result agent/);
});

test('applyOmpCompletion rejects on emitted task id mismatch', () => {
  const { action, state, shadow, jobId } = scheduleAndAdmit();
  assert.throws(() => applyOmpCompletion(state, shadow, {
    id: 'WrongTaskIdentifier',
    agent: action.args.tasks[0].agent,
    status: 'completed',
    duration: 100,
    output: '{}',
  }, jobId, transcriptEvidence('minimax-portal/MiniMax-M3', jobId), producerEvidence), /result id/);
});

test('applyOmpCompletion drives producer→verifier→passed loop', () => {
  const first = scheduleAndAdmit();
  const producerApplied = applyOmpCompletion(first.state, first.shadow,
    spawnResult({ id: first.action.args.tasks[0].name, output: '{"summary":"ok"}' }),
    first.jobId,
    transcriptEvidence('minimax-portal/MiniMax-M3', first.jobId),
    producerEvidence);

  assert.equal(producerApplied.action.type, 'omp-task-spawn');
  assert.equal(producerApplied.action.purpose, 'verifier');
  assert.equal(producerApplied.state.tasks['task-a'].status, 'awaiting');
  assert.equal(producerApplied.shadow.awaiting.purpose, 'verifier');

  // Admit verifier — shadow already mirrors the verifier action from producer completion
  const verifierAdmitted = admitOmpSpawn(
    producerApplied.state,
    producerApplied.shadow,
    producerApplied.action,
    receiptFor(producerApplied.action, 'v'),
  );

  const finalApplied = applyOmpCompletion(
    verifierAdmitted.state,
    verifierAdmitted.shadow,
    {
      id: producerApplied.action.args.tasks[0].name,
      agent: producerApplied.action.args.tasks[0].agent,
      status: 'completed',
      duration: 100,
      output: '{"verdict":"pass"}',
    },
    'job-v',
    transcriptEvidence('anthropic/claude-sonnet-5', 'job-v'),
  );

  assert.equal(finalApplied.state.tasks['task-a'].status, 'passed');
  assert.equal(finalApplied.action.type, 'none');

  const terminal = extractTerminalTaskResult(finalApplied.state, 'task-a');
  assert.equal(terminal.status, 'passed');
  assert.equal(terminal.producer.model, 'minimax-portal/MiniMax-M3');
});

test('applyOmpCompletion carries verifier pass through to accepted ledger', () => {
  const first = scheduleAndAdmit();
  const producerApplied = applyOmpCompletion(first.state, first.shadow,
    spawnResult({ id: first.action.args.tasks[0].name, output: '{"summary":"ok"}' }),
    first.jobId,
    transcriptEvidence('minimax-portal/MiniMax-M3', first.jobId),
    producerEvidence);

  assert.equal(producerApplied.shadow.awaiting.purpose, 'verifier');

  const verifierAdmitted = admitOmpSpawn(
    producerApplied.state,
    producerApplied.shadow,
    producerApplied.action,
    receiptFor(producerApplied.action, 'v'),
  );

  const finalApplied = applyOmpCompletion(
    verifierAdmitted.state,
    verifierAdmitted.shadow,
    {
      id: producerApplied.action.args.tasks[0].name,
      agent: producerApplied.action.args.tasks[0].agent,
      status: 'completed',
      duration: 100,
      output: '{"verdict":"pass"}',
    },
    'job-v',
    transcriptEvidence('anthropic/claude-sonnet-5', 'job-v'),
  );

  assert.equal(finalApplied.state.tasks['task-a'].status, 'passed');
  assert.equal(finalApplied.action.type, 'none');
  assert.equal(shadowSnapshot(finalApplied.shadow).ledgerStatus, 'accepted');

  const terminal = extractTerminalTaskResult(finalApplied.state, 'task-a');
  assert.equal(terminal.status, 'passed');
  assert.equal(terminal.producer.model, 'minimax-portal/MiniMax-M3');
});

// --- extractTerminalTaskResult / extractTerminalTaskResults ---

test('extractTerminalTaskResult returns null for in-flight task', () => {
  const { state } = scheduleAndAdmit();
  assert.equal(extractTerminalTaskResult(state, 'task-a'), null);
});

test('extractTerminalTaskResult throws for unknown taskId', () => {
  const { state } = scheduleAndAdmit();
  assert.throws(() => extractTerminalTaskResult(state, 'ghost-task'), /unknown taskId/);
});

test('extractTerminalTaskResult surfaces failure on fail-loud', () => {
  const { action, state, shadow, jobId } = scheduleAndAdmit();
  // Use a transcript with a mismatched model to trigger MODEL_MISMATCH
  const applied = applyOmpCompletion(state, shadow,
    spawnResult({ id: action.args.tasks[0].name, output: '{"summary":"ok"}' }),
    jobId,
    transcriptEvidence('anthropic/claude-sonnet-5', jobId),  // model doesn't match entry (minimax-portal/MiniMax-M3)
    producerEvidence);

  assert.equal(applied.state.tasks['task-a'].status, 'fail-loud');
  assert.equal(applied.state.tasks['task-a'].failure.code, 'MODEL_MISMATCH');

  const terminal = extractTerminalTaskResult(applied.state, 'task-a');
  assert.equal(terminal.status, 'fail-loud');
  assert.equal(terminal.failure.code, 'MODEL_MISMATCH');
});

test('extractTerminalTaskResults reports only terminal tasks', () => {
  const twoTaskPlan = plan({ taskId: 'task-a' });
  twoTaskPlan.routes.push({
    taskId: 'task-c',
    held: false,
    route: { selection: 'primary', classification: { riskClass: 'R1', requiresVerifier: false } },
  });
  const state = createNativeDispatchState(twoTaskPlan);
  const afterTaskA = reduceNativeDispatch(state, null);
  assert.equal(afterTaskA.state.tasks['task-a'].status, 'awaiting');
  const afterTaskC = reduceNativeDispatch(afterTaskA.state, null);
  assert.equal(afterTaskC.state.tasks['task-c'].status, 'fail-loud');

  const results = extractTerminalTaskResults(afterTaskC.state);
  assert.deepEqual(Object.keys(results), ['task-c']);
  assert.equal(results['task-c'].failure.code, 'PRODUCER_MISSING');
});

// --- regression: failed (exit 1) ---

test('applyOmpCompletion rejects success on failed (exit 1) status with valid-looking output', () => {
  const { action, state, shadow, jobId } = scheduleAndAdmit();
  const applied = applyOmpCompletion(state, shadow, {
    id: action.args.tasks[0].name,
    agent: action.args.tasks[0].agent,
    status: 'failed (exit 1)',
    duration: 100,
    output: '{"result":"looks ok"}',
  }, jobId, null);

  assert.equal(applied.state.tasks['task-a'].status, 'fail-loud');
  assert.equal(applied.event.ok, false);
  assert.equal(applied.event.failureKind, 'semantic');
  assert.equal(applied.state.providerCalibration.history.length, 0);
});
