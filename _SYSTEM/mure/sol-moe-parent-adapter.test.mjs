import test from 'node:test';
import assert from 'node:assert/strict';

import { createNativeDispatchState, reduceNativeDispatch } from './sol-moe-native-dispatch.mjs';
import { createNativeDispatchShadow } from './native-dispatch-shadow.mjs';
import {
  admitNativeAcceptance,
  applyPushedCompletion,
  extractTerminalTaskResult,
  extractTerminalTaskResults,
  mirrorNativeAction,
  translatePushedCompletion,
  validateAcceptanceReceipt,
} from './sol-moe-parent-adapter.mjs';

function entry(taskId, purpose, model = null) {
  const defaultModels = {
    producer: 'minimax-portal/MiniMax-M3',
    verifier: 'anthropic/claude-sonnet-5',
    'availability-fallback': 'anthropic/claude-sonnet-5',
  };
  model ||= defaultModels[purpose];
  const agentByModel = {
    'minimax-portal/MiniMax-M3': 'mure-synthesist',
    'anthropic/claude-sonnet-5': 'mure-calibrator',
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

function receiptFor(action, id) {
  return {
    status: 'accepted',
    childSessionKey: `agent:${action.args.agentId}:subagent:${id}`,
    runId: `run-${id}`,
    resolvedModel: action.args.model,
  };
}

function admit(state, shadow, action, id) {
  return admitNativeAcceptance(state, shadow, action, receiptFor(action, id));
}

// --- validateAcceptanceReceipt ---

test('validateAcceptanceReceipt accepts a well-formed receipt and freezes it', () => {
  const receipt = validateAcceptanceReceipt({
    status: 'accepted',
    childSessionKey: 'agent:mure-scout:subagent:run-a',
    runId: 'run-a',
    resolvedModel: 'minimax-portal/MiniMax-M3',
  });
  assert.equal(receipt.childSessionKey, 'agent:mure-scout:subagent:run-a');
  assert.ok(Object.isFrozen(receipt));
});

test('validateAcceptanceReceipt rejects a non-accepted status', () => {
  assert.throws(() => validateAcceptanceReceipt({
    status: 'pending',
    childSessionKey: 'agent:mure-scout:subagent:run-a',
    runId: 'run-a',
    resolvedModel: 'minimax-portal/MiniMax-M3',
  }), /status must be "accepted"/);
});

test('validateAcceptanceReceipt rejects a malformed childSessionKey', () => {
  assert.throws(() => validateAcceptanceReceipt({
    status: 'accepted',
    childSessionKey: 'not-a-native-session-key',
    runId: 'run-a',
    resolvedModel: 'minimax-portal/MiniMax-M3',
  }), /native subagent session key/);
});

test('validateAcceptanceReceipt rejects missing runId', () => {
  assert.throws(() => validateAcceptanceReceipt({
    status: 'accepted',
    childSessionKey: 'agent:mure-scout:subagent:run-a',
    resolvedModel: 'minimax-portal/MiniMax-M3',
  }), /runId is required/);
});

// --- mirrorNativeAction ---

test('mirrorNativeAction forwards a sessions_spawn action into the task-scoped shadow', () => {
  const state = createNativeDispatchState(plan());
  const shadow = createNativeDispatchShadow(baseTicket);
  const scheduled = reduceNativeDispatch(state, null);
  const nextShadow = mirrorNativeAction(shadow, scheduled.action);
  assert.equal(nextShadow.awaiting.purpose, 'producer');
});

test('mirrorNativeAction tolerates a non-spawn action without throwing', () => {
  const shadow = createNativeDispatchShadow(baseTicket);
  const nextShadow = mirrorNativeAction(shadow, { type: 'none', reason: 'no-runnable-task' });
  assert.equal(nextShadow.awaiting, null);
});

// --- admitNativeAcceptance ---

test('admitNativeAcceptance records the same admission into reducer state and shadow in lockstep', () => {
  const state = createNativeDispatchState(plan());
  let shadow = createNativeDispatchShadow(baseTicket);
  const scheduled = reduceNativeDispatch(state, null);
  shadow = mirrorNativeAction(shadow, scheduled.action);

  const admitted = admit(scheduled.state, shadow, scheduled.action, 'a');
  assert.equal(admitted.state.tasks['task-a'].awaiting.accepted.childSessionKey,
    `agent:${scheduled.action.args.agentId}:subagent:a`);
  assert.equal(admitted.shadow.admissions.length, 1);
  assert.equal(admitted.shadow.awaiting.admission.runId, 'run-a');
});

test('admitNativeAcceptance rejects a receipt whose resolvedModel diverges from the requested model', () => {
  const state = createNativeDispatchState(plan());
  let shadow = createNativeDispatchShadow(baseTicket);
  const scheduled = reduceNativeDispatch(state, null);
  shadow = mirrorNativeAction(shadow, scheduled.action);

  const badReceipt = { ...receiptFor(scheduled.action, 'a'), resolvedModel: 'anthropic/claude-opus-4-8' };
  assert.throws(() => admitNativeAcceptance(scheduled.state, shadow, scheduled.action, badReceipt));
});

// --- translatePushedCompletion ---

function scheduleAndAdmit(taskPlan = plan(), ticket = baseTicket, id = 'a') {
  const state = createNativeDispatchState(taskPlan);
  let shadow = createNativeDispatchShadow(ticket);
  const scheduled = reduceNativeDispatch(state, null);
  shadow = mirrorNativeAction(shadow, scheduled.action);
  const admitted = admit(scheduled.state, shadow, scheduled.action, id);
  return { action: scheduled.action, state: admitted.state, shadow: admitted.shadow, id };
}

test('translatePushedCompletion resolves taskId/entryId/purpose from state by childSessionKey', () => {
  const { action, state, id } = scheduleAndAdmit();
  const event = translatePushedCompletion(state, {
    childSessionKey: `agent:${action.args.agentId}:subagent:${id}`,
    ok: true,
    output: '{"summary":"ok"}',
  });
  assert.equal(event.taskId, 'task-a');
  assert.equal(event.entryId, action.entryId);
  assert.equal(event.purpose, 'producer');
  assert.equal(event.runId, `run-${id}`);
  assert.equal(event.output, '{"summary":"ok"}');
});

test('translatePushedCompletion carries failureKind and error only on failure', () => {
  const { action, state, id } = scheduleAndAdmit();
  const event = translatePushedCompletion(state, {
    childSessionKey: `agent:${action.args.agentId}:subagent:${id}`,
    ok: false,
    failureKind: 'timeout',
    error: 'worker timed out',
  });
  assert.equal(event.ok, false);
  assert.equal(event.failureKind, 'timeout');
  assert.equal(event.error, 'worker timed out');
  assert.equal(event.output, undefined);
});

test('translatePushedCompletion throws when no task awaits that childSessionKey', () => {
  const { state } = scheduleAndAdmit();
  assert.throws(() => translatePushedCompletion(state, {
    childSessionKey: 'agent:unknown-agent:subagent:ghost',
    ok: true,
  }), /no task is awaiting/);
});

test('translatePushedCompletion throws on a runId mismatch', () => {
  const { action, state, id } = scheduleAndAdmit();
  assert.throws(() => translatePushedCompletion(state, {
    childSessionKey: `agent:${action.args.agentId}:subagent:${id}`,
    runId: 'wrong-run',
    ok: true,
  }), /runId does not match/);
});

// --- applyPushedCompletion: full producer -> verifier -> passed loop ---

test('applyPushedCompletion drives producer completion into a mirrored verifier dispatch', () => {
  const { action, state, shadow, id } = scheduleAndAdmit();
  const applied = applyPushedCompletion(state, shadow, {
    childSessionKey: `agent:${action.args.agentId}:subagent:${id}`,
    ok: true,
    output: '{"summary":"ok"}',
  }, { evidence: { TERM_COUNT: '4', FILE_COUNT: '1' } });

  assert.equal(applied.action.type, 'sessions_spawn');
  assert.equal(applied.action.purpose, 'verifier');
  assert.equal(applied.state.tasks['task-a'].status, 'awaiting');
  assert.equal(applied.shadow.awaiting.purpose, 'verifier');
});

test('applyPushedCompletion carries a verifier pass through to a mirrored accepted ledger', () => {
  const first = scheduleAndAdmit();
  const producerApplied = applyPushedCompletion(first.state, first.shadow, {
    childSessionKey: `agent:${first.action.args.agentId}:subagent:${first.id}`,
    ok: true,
    output: '{"summary":"ok"}',
  }, { evidence: { TERM_COUNT: '4', FILE_COUNT: '1' } });

  assert.equal(producerApplied.shadow.awaiting.purpose, 'verifier');
  const verifierAdmitted = admit(producerApplied.state, producerApplied.shadow, producerApplied.action, 'v');

  const finalApplied = applyPushedCompletion(verifierAdmitted.state, verifierAdmitted.shadow, {
    childSessionKey: `agent:${producerApplied.action.args.agentId}:subagent:v`,
    ok: true,
    verdict: 'pass',
  });

  assert.equal(finalApplied.state.tasks['task-a'].status, 'passed');
  assert.equal(finalApplied.action.type, 'none');

  const terminal = extractTerminalTaskResult(finalApplied.state, 'task-a');
  assert.equal(terminal.status, 'passed');
  assert.equal(terminal.producer.model, first.action.args.model);
});

// --- extractTerminalTaskResult / extractTerminalTaskResults ---

test('extractTerminalTaskResult returns null for a task still in flight', () => {
  const { state } = scheduleAndAdmit();
  assert.equal(extractTerminalTaskResult(state, 'task-a'), null);
});

test('extractTerminalTaskResult throws for an unknown taskId', () => {
  const { state } = scheduleAndAdmit();
  assert.throws(() => extractTerminalTaskResult(state, 'ghost-task'), /unknown taskId/);
});

test('extractTerminalTaskResult surfaces failure detail once a task fails loud', () => {
  const noVerifierPlan = {
    routes: [{
      taskId: 'task-b',
      held: false,
      route: { selection: 'primary', classification: { riskClass: 'R1', requiresVerifier: false } },
    }],
    queues: {
      producers: [],
      verifiers: [],
      availabilityFallbacks: [],
      qualityEscalations: [],
      calibrationAlternatives: [],
    },
    blocked: [],
    providerCalibration: null,
  };
  const state = createNativeDispatchState(noVerifierPlan);
  const scheduled = reduceNativeDispatch(state, null);
  assert.equal(scheduled.action.type, 'fail-loud');
  assert.equal(scheduled.action.code, 'PRODUCER_MISSING');

  const terminal = extractTerminalTaskResult(scheduled.state, 'task-b');
  assert.equal(terminal.status, 'fail-loud');
  assert.equal(terminal.failure.code, 'PRODUCER_MISSING');
});

test('extractTerminalTaskResults reports only tasks that reached a terminal status', () => {
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
