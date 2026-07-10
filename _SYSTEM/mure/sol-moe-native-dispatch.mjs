#!/usr/bin/env node
// @capability: sol-moe-native-dispatch
// @serves: pure native OpenClaw sessions_spawn compilation and push-event reduction
// @does: compiles governed manifest entries into whitelist-only native sessions_spawn arguments and reduces child completion events without invoking tools or subprocesses.
// @use: const state = createNativeDispatchState(plan); const { state: next, action } = reduceNativeDispatch(state, event);
// @exports: DEFAULT_CWD, compileNativeSpawn, createNativeDispatchState, createProviderCalibrationReport, recordNativeSpawnAccepted, reduceNativeDispatch

import { createHash } from 'node:crypto';

export const DEFAULT_CWD = '/Users/marcelspatz/YURI-OS-MUSUBI';

const PURPOSES = new Set(['producer', 'availability-fallback', 'quality-escalation', 'verifier', 'evidence']);
const THINKING_LEVELS = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'adaptive', 'max']);
const AVAILABILITY_FAILURES = new Set(['availability', 'transport', 'quota', 'rate-limit', 'timeout', 'auth']);
const RISK_CLASSES = new Set(['R0', 'R1', 'R2', 'R3']);
const WORKER_BINDINGS = new Map([
  ['minimax-portal/MiniMax-M3', 'mure-synthesist'],
  ['zai/glm-5.2', 'mure-architect'],
  ['openai/gpt-5.6-terra', 'mure-engineer'],
  ['openai/gpt-5.6-luna', 'mure-adjudicator'],
  ['anthropic/claude-opus-4-8', 'mure-sentinel'],
  ['anthropic/claude-sonnet-5', 'mure-calibrator'],
  ['anthropic/claude-haiku-4-5', 'mure-scout'],
  ['deepseek/deepseek-v4-flash', 'deepseek-flash'],
  ['deepseek-v4-flash:direct', 'deepseek-flash'],
  ['ollama-cloud/deepseek-v4-flash', 'deepseek-flash'],
  ['cline-pass/cline-pass/deepseek-v4-flash', 'mure-scout'],
  ['cursor-cli/gemini-3.5-flash', 'mure-scout'],
  ['opencode-go/mimo-v2.5', 'mure-artificer'],
  ['cline-pass/cline-pass/mimo-v2.5', 'mure-artificer'],
]);
const DEFAULT_MASKED_MODELS = new Set(['zai/glm-5.2', 'opencode-go/mimo-v2.5']);
const CHEAP_PROVIDER_FAMILIES = new Set(['deepseek', 'mimo', 'ollama', 'cline', 'cursor']);
const R3_VERIFIER_MODEL = 'anthropic/claude-opus-4-8';

/**
 * Compile one manifest entry to the complete, whitelist-only sessions_spawn payload.
 * This function is pure: it neither calls sessions_spawn nor records session state.
 */
export function compileNativeSpawn(entry, context = {}) {
  const normalized = validateEntry(entry);
  const execution = validateContext(context, normalized.taskId);
  const task = buildTask(normalized, execution);
  return Object.freeze({
    task,
    taskName: deterministicTaskName(normalized, execution.attempt),
    label: nativeLabel(normalized),
    agentId: normalized.agentId,
    model: normalized.model,
    thinking: normalized.thinking,
    cwd: execution.cwd,
    runtime: 'subagent',
    mode: 'run',
    context: 'isolated',
    cleanup: 'keep',
    sandbox: 'inherit',
  });
}

/** Create serializable reducer state from a sol-moe-company manifest. */
export function createNativeDispatchState(plan, options = {}) {
  validatePlan(plan);
  const tasks = {};
  for (const routeRecord of plan.routes) {
    const taskId = String(routeRecord.taskId);
    if (tasks[taskId]) throw new TypeError(`plan contains duplicate taskId: ${taskId}`);
    tasks[taskId] = {
      taskId,
      status: routeRecord.held === true ? 'owner-held' : 'pending',
      route: routeRecord.route || {},
      awaiting: null,
      attempt: 0,
      producer: null,
      evidence: [],
      priorVerifier: null,
      attemptedEntryIds: [],
    };
  }
  for (const blocked of plan.blocked || []) {
    const taskId = String(blocked?.taskId || '');
    if (!taskId || tasks[taskId]) continue;
    tasks[taskId] = {
      taskId,
      status: 'blocked',
      route: {},
      awaiting: null,
      attempt: 0,
      producer: null,
      evidence: [],
      priorVerifier: null,
      attemptedEntryIds: [],
      failure: { code: blocked.code || 'BLOCKED_BY_PLAN', message: blocked.reason || 'Blocked by plan.' },
    };
  }
  return freeze({
    schemaVersion: 'sol-moe-native-dispatch-v1',
    plan: copyPlan(plan),
    tasks,
    processedEventIds: [],
    providerCalibration: createProviderCalibrationState(plan.providerCalibration, options.providerHistory),
  });
}

/** Summarize actual accepted native child dispatches, never planned queue entries. */
export function createProviderCalibrationReport(config, history = []) {
  const records = (Array.isArray(history) ? history : []).map(normalizeProviderHistoryRecord);
  const windowSize = positiveInteger(config?.windowDispatches, 50);
  const window = records.slice(-windowSize);
  const counts = {};
  for (const record of window) {
    const family = String(record?.providerFamily || 'unknown');
    counts[family] = (counts[family] || 0) + 1;
  }
  const sampleSize = window.length;
  const shares = Object.fromEntries(Object.entries(counts)
    .map(([family, count]) => [family, sampleSize ? count / sampleSize : 0]));
  const targets = config?.activeTargets || {};
  const deviations = [];
  for (const [family, range] of Object.entries(targets)) {
    const share = shares[family] || 0;
    if (share < Number(range.min) || share > Number(range.max)) {
      deviations.push({ family, share, min: Number(range.min), max: Number(range.max) });
    }
  }
  const minimumSamples = positiveInteger(config?.minimumSamples, 30);
  return freeze({
    metric: config?.metric || 'native child dispatch count',
    windowDispatches: windowSize,
    sampleSize,
    counts,
    shares,
    status: sampleSize < minimumSamples ? 'insufficient-sample' : deviations.length ? 'out-of-band' : 'within-band',
    deviations,
  });
}

/** Record native sessions_spawn admission without mistaking admission for completion. */
export function recordNativeSpawnAccepted(state, action, receipt) {
  validateState(state);
  if (!action || action.type !== 'sessions_spawn' || !action.taskId || !action.entryId) {
    throw new TypeError('accepted spawn requires a sessions_spawn action');
  }
  if (!receipt || receipt.status !== 'accepted') throw new TypeError('native spawn receipt must be accepted');
  nonEmpty(receipt.childSessionKey, 'childSessionKey');
  const childSessionKey = String(receipt.childSessionKey);
  if (!isNativeChildSessionKey(childSessionKey, action.args.agentId)) {
    throw new TypeError(`native childSessionKey must identify ${action.args.agentId} and a subagent id`);
  }
  const runId = nonEmpty(receipt.runId, 'runId');
  const resolvedModel = nonEmpty(receipt.resolvedModel, 'resolvedModel');
  const next = thaw(state);
  const task = next.tasks[action.taskId];
  if (!task?.awaiting || task.awaiting.entry.id !== action.entryId || task.awaiting.accepted) {
    throw new TypeError('accepted spawn does not match the pending native action');
  }
  if (resolvedModel !== action.args.model) {
    return fail(next, task, 'RESOLVED_MODEL_MISMATCH',
      `Requested ${action.args.model} but OpenClaw resolved ${resolvedModel}.`);
  }
  task.awaiting.accepted = { childSessionKey, runId, resolvedModel };
  recordAcceptedProviderDispatch(next, task, action, { childSessionKey, runId, resolvedModel });
  return result(next, Object.freeze({ type: 'none', reason: 'spawn-accepted' }));
}

/**
 * Reduce either an initial scheduling tick (event=null) or one pushed child completion.
 * The returned action is data for the caller to execute through native sessions_spawn.
 */
export function reduceNativeDispatch(state, event = null, options = {}) {
  validateState(state);
  const next = thaw(state);

  if (event === null) return schedulePending(next, options);
  validateEvent(event);
  if (next.processedEventIds.includes(event.id)) {
    return result(next, none('duplicate-event'));
  }
  next.processedEventIds.push(event.id);

  const task = next.tasks[event.taskId];
  if (!task || task.status === 'owner-held' || task.status === 'blocked') {
    return result(next, none('ignored-terminal-event'));
  }
  if (task.status !== 'awaiting' || !task.awaiting
      || task.awaiting.entry.id !== event.entryId || task.awaiting.purpose !== event.purpose) {
    return result(next, none('stale-or-mismatched-event'));
  }

  if (!task.awaiting.accepted) return fail(next, task, 'COMPLETION_BEFORE_ACCEPTANCE', 'Completion arrived before native spawn admission was recorded.');
  if (event.childSessionKey !== task.awaiting.accepted.childSessionKey
      || (event.runId && event.runId !== task.awaiting.accepted.runId)) {
    return result(next, none('stale-or-mismatched-event'));
  }

  const awaiting = task.awaiting;
  task.awaiting = null;
  if (!event.ok) return reduceFailure(next, task, awaiting, event, options);

  if (awaiting.purpose === 'verifier') return reduceVerifierSuccess(next, task, awaiting, event, options);
  if (awaiting.purpose === 'evidence') {
    task.evidence.push(producerRecord(awaiting, event));
    return scheduleTask(next, task, options);
  }

  task.producer = producerRecord(awaiting, event);
  task.priorVerifier = null;
  if (requiresVerifier(task)) {
    const verifier = firstTaskEntry(next.plan.queues.verifiers, task.taskId);
    if (!verifier) return fail(next, task, 'REQUIRED_VERIFIER_MISSING', 'Required verifier entry is missing.');
    return spawn(next, task, verifier, 'verification', 'verifier', options);
  }
  task.status = 'passed';
  return result(next, none('task-passed'));
}

function schedulePending(state, options) {
  for (const task of Object.values(state.tasks)) {
    if (task.status !== 'pending') continue;
    return scheduleTask(state, task, options);
  }
  return result(state, none('no-runnable-task'));
}

function scheduleTask(state, task, options) {
  const evidence = nextProviderBalancedTaskEntry(state, state.plan.queues.evidence || [], task, task.attemptedEntryIds);
  if (evidence) return spawn(state, task, evidence, 'evidence', 'evidence', options);
  const producer = firstTaskEntry(state.plan.queues.producers, task.taskId);
  if (!producer) return fail(state, task, 'PRODUCER_MISSING', 'Producer entry is missing.');
  const alternatives = (state.plan.queues.calibrationAlternatives || [])
    .filter((entry) => String(entry?.taskId) === task.taskId && entry.id !== producer.id);
  const selected = chooseProviderBalancedEntry(state, [producer, ...alternatives], task.attemptedEntryIds);
  if (!selected) {
    return fail(state, task, 'PROVIDER_CALIBRATION_CEILING', 'OpenAI worker ceiling reached and no non-OpenAI peer is available.');
  }
  const routeKind = selected?.id === producer.id ? routeKindFor(task) : 'calibration-rebalance';
  return spawn(state, task, selected, routeKind, 'producer', options);
}

function reduceFailure(state, task, awaiting, event, options) {
  const failureKind = String(event.failureKind || 'semantic').toLowerCase();
  if (awaiting.purpose === 'verifier') {
    return fail(state, task, 'VERIFIER_EXECUTION_FAILURE', 'The independent verifier did not execute successfully.', failureKind, event.error);
  }
  if (!AVAILABILITY_FAILURES.has(failureKind)) {
    return fail(state, task, 'SEMANTIC_FAILURE', `Child ${awaiting.purpose} failed semantically.`, failureKind, event.error);
  }
  const fallback = nextProviderBalancedTaskEntry(state, state.plan.queues.availabilityFallbacks, task, task.attemptedEntryIds);
  if (!fallback) {
    return fail(state, task, 'AVAILABILITY_FALLBACK_EXHAUSTED', 'No task-scoped availability fallback remains.', failureKind, event.error);
  }
  return spawn(state, task, fallback, 'availability-fallback', 'producer', options);
}

function reduceVerifierSuccess(state, task, awaiting, event, options) {
  const verdict = strictVerdict(event);
  if (!verdict) {
    return fail(state, task, 'SEMANTIC_FAILURE', 'Verifier completion did not contain a strict pass/reject verdict.', 'semantic');
  }
  task.priorVerifier = { entryId: awaiting.entry.id, verdict, output: event.output ?? null };
  if (verdict === 'pass') {
    task.status = 'passed';
    return result(state, none('task-passed'));
  }
  const escalation = nextProviderBalancedTaskEntry(state, state.plan.queues.qualityEscalations, task, task.attemptedEntryIds);
  if (!escalation) {
    return fail(state, task, 'QUALITY_ESCALATION_EXHAUSTED', 'Verifier rejected the producer and no quality escalation remains.');
  }
  return spawn(state, task, escalation, 'quality-escalation', 'quality-escalation', options);
}

function spawn(state, task, entry, routeKind, purpose, options) {
  if (isSolWorker(entry)) {
    return fail(state, task, 'SOL_PARENT_WORKER_FORBIDDEN', 'Sol/Yuri is the parent control plane and cannot be spawned as a child worker.');
  }
  const safetyViolation = workerSafetyViolation(state, task, entry, purpose);
  if (safetyViolation) return fail(state, task, safetyViolation.code, safetyViolation.message);
  if (wouldExceedOpenAiCeiling(state, entry)) {
    return fail(state, task, 'PROVIDER_CALIBRATION_CEILING', 'OpenAI worker ceiling reached for this accepted-dispatch window.');
  }
  const attempt = task.attempt + 1;
  const upstream = {
    evidence: task.evidence,
    producer: task.producer,
    priorVerifier: task.priorVerifier,
  };
  if (purpose === 'verifier' && task.producer
      && (entry.agentId === task.producer.agentId || entry.model === task.producer.model)) {
    return fail(state, task, 'VERIFIER_NOT_INDEPENDENT', 'Verifier must differ from the producer agent and model.');
  }
  if (purpose === 'verifier' && taskRiskClass(task) === 'R3' && task.producer
      && providerFamily(entry) === providerFamily(task.producer)) {
    return fail(state, task, 'VERIFIER_NOT_INDEPENDENT', 'R3 verifier must differ from the producer provider family.');
  }
  const args = compileNativeSpawn(entry, {
    cwd: options.cwd,
    attempt,
    taskId: task.taskId,
    upstream,
  });
  task.attempt = attempt;
  task.status = 'awaiting';
  task.awaiting = { entry, routeKind, purpose, attempt };
  task.attemptedEntryIds.push(entry.id);
  return result(state, Object.freeze({
    type: 'sessions_spawn',
    taskId: task.taskId,
    purpose,
    routeKind,
    attempt,
    entryId: entry.id,
    args,
  }));
}

function fail(state, task, code, message, failureKind = null, error = null) {
  task.status = 'fail-loud';
  task.failure = { code, message, failureKind, error };
  return result(state, Object.freeze({ type: 'fail-loud', taskId: task.taskId, code, message }));
}

function result(state, action) {
  return Object.freeze({ state: freeze(state), action });
}

function none(reason) {
  return Object.freeze({ type: 'none', reason });
}

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('manifest entry must be an object');
  const taskId = nonEmpty(entry.taskId, 'taskId');
  const purpose = nonEmpty(entry.purpose, 'purpose');
  const agentId = nonEmpty(entry.agentId, 'agentId');
  const model = nonEmpty(entry.model, 'model');
  const thinking = nonEmpty(entry.thinking, 'thinking');
  const prompt = nonEmpty(entry.prompt, 'prompt');
  const id = nonEmpty(entry.id, 'id');
  if (!PURPOSES.has(purpose)) throw new TypeError(`manifest entry purpose is invalid: ${purpose}`);
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) throw new TypeError('manifest entry id contains unsupported characters');
  if (!/^[A-Za-z0-9._:-]+$/.test(taskId)) throw new TypeError('manifest entry taskId contains unsupported characters');
  if (!/^[A-Za-z0-9._-]+$/.test(agentId)) throw new TypeError('manifest entry agentId contains unsupported characters');
  if (!/^[A-Za-z0-9._:/-]+$/.test(model) || model.startsWith('-')) throw new TypeError('manifest entry model contains unsupported characters');
  if (!THINKING_LEVELS.has(thinking)) throw new TypeError(`manifest entry thinking is invalid: ${thinking}`);
  if (agentId === 'mure-yuri' || model === 'openai/gpt-5.6-sol') {
    throw new TypeError('Sol/Yuri cannot be compiled as a native child worker');
  }
  const expectedAgentId = WORKER_BINDINGS.get(model);
  if (!expectedAgentId) throw new TypeError(`manifest entry model is not an allowed MURE worker: ${model}`);
  if (agentId !== expectedAgentId) throw new TypeError(`manifest entry agentId must be ${expectedAgentId} for ${model}`);
  const derivedProviderFamily = modelProviderFamily(model);
  if (entry.providerFamily !== undefined && String(entry.providerFamily) !== derivedProviderFamily) {
    throw new TypeError(`manifest entry providerFamily does not match model provider: ${model}`);
  }
  return { id, taskId, purpose, role: optionalText(entry.role), agentId, model, thinking, prompt };
}

function validateContext(context, taskId) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw new TypeError('spawn context must be an object');
  if (context.taskId !== undefined && String(context.taskId) !== taskId) throw new TypeError('spawn context taskId must match manifest taskId');
  const cwd = context.cwd === undefined ? DEFAULT_CWD : nonEmpty(context.cwd, 'cwd');
  if (!cwd.startsWith('/')) throw new TypeError('spawn cwd must be an absolute path');
  const attempt = context.attempt === undefined ? 1 : Number(context.attempt);
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new TypeError('spawn attempt must be a positive integer');
  if (context.upstream !== undefined && (!context.upstream || typeof context.upstream !== 'object' || Array.isArray(context.upstream))) {
    throw new TypeError('spawn upstream must be an object');
  }
  return { cwd, attempt, upstream: context.upstream || {} };
}

function buildTask(entry, context) {
  const lines = [
    'MURE SOL MOE NATIVE DISPATCH',
    `Task ID: ${entry.taskId}`,
    `Purpose: ${entry.purpose}`,
    `Role: ${entry.role || 'unassigned'}`,
    `Attempt: ${context.attempt}`,
    '',
    'TASK',
    entry.prompt,
  ];
  if (Object.keys(context.upstream).length) {
    lines.push('', 'UPSTREAM (advisory; task-scoped)', stableJson(context.upstream));
  }
  if (entry.purpose === 'verifier') {
    lines.push(
      '',
      'VERIFIER CONTRACT',
      'Independently verify the task-scoped producer output and upstream evidence.',
      'Return exactly one JSON object, with no markdown, explanation, or surrounding text.',
      'The only valid outputs are {"verdict":"pass"} or {"verdict":"reject"}.',
    );
  } else {
    lines.push('', 'Return the requested work product. Do not claim independent verification.');
  }
  return lines.join('\n');
}

function deterministicTaskName(entry, attempt) {
  const prefix = `${safeToken(entry.taskId, 24)}-${safeToken(entry.purpose, 18)}`;
  const digest = createHash('sha256').update(JSON.stringify({
    id: entry.id,
    taskId: entry.taskId,
    purpose: entry.purpose,
    agentId: entry.agentId,
    model: entry.model,
    attempt,
  })).digest('hex').slice(0, 12);
  return `mure-${prefix}-${digest}`;
}

function nativeLabel(entry) {
  return `MURE ${entry.purpose}: ${entry.taskId}${entry.role ? ` (${entry.role})` : ''}`;
}

function strictVerdict(event) {
  const value = event.verdict ?? event.output?.verdict;
  return value === 'pass' || value === 'reject' ? value : null;
}

function requiresVerifier(task) {
  const riskClass = taskRiskClass(task);
  return riskClass === 'R2' || riskClass === 'R3'
    || task.route?.classification?.requiresVerifier === true
    || task.route?.verifier?.required === true;
}

function routeKindFor(task) {
  return task.route?.selection === 'availability-fallback' ? 'availability-fallback' : 'primary';
}

function firstTaskEntry(entries, taskId) {
  return (Array.isArray(entries) ? entries : []).find((entry) => String(entry?.taskId) === taskId) || null;
}

function nextProviderBalancedTaskEntry(state, entries, task, attemptedEntryIds) {
  const candidates = (Array.isArray(entries) ? entries : []).filter((entry) => (
    String(entry?.taskId) === task.taskId && !attemptedEntryIds.includes(entry.id)
  ));
  return chooseProviderBalancedEntry(state, candidates, attemptedEntryIds);
}

function chooseProviderBalancedEntry(state, entries, attemptedEntryIds = []) {
  const candidates = entries.filter((entry) => entry && !attemptedEntryIds.includes(entry.id));
  const first = candidates[0] || null;
  if (!first || !wouldExceedOpenAiCeiling(state, first)) return first;
  return candidates.find((entry) => providerFamily(entry) !== 'openai') || null;
}

function wouldExceedOpenAiCeiling(state, entry) {
  if (providerFamily(entry) !== 'openai') return false;
  const calibration = state.providerCalibration;
  const maximum = Number(calibration?.config?.activeTargets?.openai?.max);
  if (!Number.isFinite(maximum)) return false;
  const windowSize = positiveInteger(calibration.config.windowDispatches, 50);
  const base = calibration.history.slice(-(windowSize - 1));
  const currentOpenAi = base.filter((record) => record.providerFamily === 'openai').length;
  return currentOpenAi + 1 > Math.floor(maximum * (base.length + 1));
}

function isSolWorker(entry) {
  return entry?.agentId === 'mure-yuri' || entry?.model === 'openai/gpt-5.6-sol';
}

function workerSafetyViolation(state, task, entry, purpose) {
  const riskClass = taskRiskClass(task);
  const family = providerFamily(entry);
  if (DEFAULT_MASKED_MODELS.has(entry?.model)
      && !hasNativeAvailabilityEvidence(state.plan.availabilityEvidence?.[entry.model], entry.model)) {
    return { code: 'MODEL_AVAILABILITY_UNPROVEN', message: `${entry.model} requires exact native canary evidence.` };
  }
  if (purpose === 'verifier' && CHEAP_PROVIDER_FAMILIES.has(family)) {
    return { code: 'CHEAP_VERIFIER_FORBIDDEN', message: 'Cheap models cannot perform final verification.' };
  }
  if (purpose !== 'evidence' && CHEAP_PROVIDER_FAMILIES.has(family) && riskClass !== 'R0') {
    return { code: 'CHEAP_SEMANTIC_WORK_FORBIDDEN', message: `Cheap models cannot perform ${riskClass || 'non-R0'} semantic work.` };
  }
  if (purpose !== 'evidence' && purpose !== 'verifier' && riskClass === 'R3' && family === 'anthropic') {
    return { code: 'R3_OPUS_RESERVED_FOR_VERIFICATION', message: 'R3 reserves the Anthropic family for independent Opus verification.' };
  }
  if (purpose === 'verifier' && riskClass === 'R3' && entry?.model !== R3_VERIFIER_MODEL) {
    return { code: 'R3_OPUS_VERIFIER_REQUIRED', message: 'R3 requires independent Opus 4.8 verification.' };
  }
  return null;
}

function taskRiskClass(task) {
  return String(task?.route?.classification?.riskClass || '');
}

function createProviderCalibrationState(config, history) {
  const normalizedConfig = config && typeof config === 'object' ? thaw(config) : null;
  const normalizedHistory = (Array.isArray(history) ? history : []).map(normalizeProviderHistoryRecord);
  const windowSize = positiveInteger(normalizedConfig?.windowDispatches, 50);
  const boundedHistory = normalizedHistory.slice(-windowSize);
  return {
    config: normalizedConfig,
    history: boundedHistory,
    report: createProviderCalibrationReport(normalizedConfig, boundedHistory),
  };
}

function normalizeProviderHistoryRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('provider history record must be an object');
  }
  const model = nonEmpty(record.model, 'provider history model');
  const agentId = nonEmpty(record.agentId, 'provider history agentId');
  nonEmpty(record.childSessionKey, 'provider history childSessionKey');
  const childSessionKey = String(record.childSessionKey);
  const runId = nonEmpty(record.runId, 'provider history runId');
  const resolvedModel = nonEmpty(record.resolvedModel, 'provider history resolvedModel');
  if (resolvedModel !== model) throw new TypeError('provider history resolvedModel must match model');
  if (!isNativeChildSessionKey(childSessionKey, agentId)) {
    throw new TypeError('provider history childSessionKey does not match its agentId');
  }
  const derivedProviderFamily = modelProviderFamily(model);
  if (record.providerFamily !== undefined && String(record.providerFamily) !== derivedProviderFamily) {
    throw new TypeError(`provider history providerFamily does not match model provider: ${model}`);
  }
  return { ...record, model, agentId, childSessionKey, runId, resolvedModel, providerFamily: derivedProviderFamily };
}

function recordAcceptedProviderDispatch(state, task, action, receipt) {
  const calibration = state.providerCalibration;
  if (!calibration) return;
  calibration.history.push({
    taskId: task.taskId,
    entryId: action.entryId,
    purpose: action.purpose,
    routeKind: action.routeKind,
    agentId: action.args.agentId,
    model: action.args.model,
    providerFamily: providerFamily(task.awaiting.entry),
    childSessionKey: receipt.childSessionKey,
    runId: receipt.runId,
    resolvedModel: receipt.resolvedModel,
  });
  const windowSize = positiveInteger(calibration.config?.windowDispatches, 50);
  calibration.history = calibration.history.slice(-windowSize);
  calibration.report = thaw(createProviderCalibrationReport(calibration.config, calibration.history));
}

function providerFamily(entry) {
  return modelProviderFamily(entry?.model);
}

function modelProviderFamily(model) {
  const value = String(model || '');
  const provider = value.split('/')[0];
  if (provider === 'minimax-portal') return 'minimax';
  if (provider === 'opencode-go') return 'mimo';
  if (provider === 'ollama-cloud') return 'ollama';
  if (provider === 'cline-pass') return 'cline';
  if (provider === 'cursor-cli' || provider === 'cursor') return 'cursor';
  if (provider === 'deepseek' || value.endsWith(':direct')) return 'deepseek';
  return provider || 'unknown';
}

function producerRecord(awaiting, event) {
  return {
    entryId: awaiting.entry.id,
    agentId: awaiting.entry.agentId,
    model: awaiting.entry.model,
    routeKind: awaiting.routeKind,
    output: event.output ?? null,
  };
}

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.routes) || !plan.queues || typeof plan.queues !== 'object') {
    throw new TypeError('plan must contain routes and queues');
  }
  for (const name of ['producers', 'verifiers', 'availabilityFallbacks', 'qualityEscalations']) {
    if (!Array.isArray(plan.queues[name])) throw new TypeError(`plan queues.${name} must be an array`);
  }
  for (const routeRecord of plan.routes) {
    const riskClass = String(routeRecord?.route?.classification?.riskClass || '');
    if (!RISK_CLASSES.has(riskClass)) throw new TypeError(`plan route has invalid riskClass: ${riskClass || 'missing'}`);
  }
  if (plan.queues.evidence !== undefined && !Array.isArray(plan.queues.evidence)) {
    throw new TypeError('plan queues.evidence must be an array');
  }
  if (plan.queues.calibrationAlternatives !== undefined && !Array.isArray(plan.queues.calibrationAlternatives)) {
    throw new TypeError('plan queues.calibrationAlternatives must be an array');
  }
}

function validateState(state) {
  if (!state || typeof state !== 'object' || state.schemaVersion !== 'sol-moe-native-dispatch-v1'
      || !state.plan || !state.tasks || !Array.isArray(state.processedEventIds) || !state.providerCalibration) {
    throw new TypeError('invalid native dispatch state');
  }
}

function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new TypeError('completion event must be an object');
  nonEmpty(event.id, 'completion event id');
  nonEmpty(event.taskId, 'completion event taskId');
  nonEmpty(event.entryId, 'completion event entryId');
  nonEmpty(event.purpose, 'completion event purpose');
  nonEmpty(event.childSessionKey, 'completion event childSessionKey');
  if (typeof event.ok !== 'boolean') throw new TypeError('completion event ok must be boolean');
  if (!event.ok && event.failureKind !== undefined && typeof event.failureKind !== 'string') {
    throw new TypeError('completion event failureKind must be a string');
  }
}

function copyPlan(plan) {
  return {
    routes: plan.routes.map((entry) => ({ ...entry })),
    queues: Object.fromEntries(Object.entries(plan.queues).map(([name, entries]) => [
      name,
      Array.isArray(entries) ? entries.map((entry) => ({ ...entry })) : [],
    ])),
    blocked: Array.isArray(plan.blocked) ? plan.blocked.map((entry) => ({ ...entry })) : [],
    providerCalibration: plan.providerCalibration ? thaw(plan.providerCalibration) : null,
    availabilityEvidence: plan.availabilityEvidence ? thaw(plan.availabilityEvidence) : null,
  };
}

function thaw(value) {
  return JSON.parse(JSON.stringify(value));
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}

function stableJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}

function safeToken(value, max) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'task';
}

function nonEmpty(value, name) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isNativeChildSessionKey(value, expectedAgentId = null) {
  if (typeof value !== 'string' || value !== value.trim()) return false;
  const match = /^agent:([A-Za-z0-9._-]+):subagent:([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(value);
  return Boolean(match && (!expectedAgentId || match[1] === expectedAgentId));
}

function hasNativeAvailabilityEvidence(proof, model) {
  return proof?.source === 'native-completion-event'
    && proof?.status === 'completed-native-canary'
    && proof?.ok === true
    && proof?.resolvedModel === model
    && isNativeChildSessionKey(proof?.childSessionKey)
    && typeof proof?.runId === 'string'
    && proof.runId.length > 0
    && proof.runId === proof.runId.trim();
}
