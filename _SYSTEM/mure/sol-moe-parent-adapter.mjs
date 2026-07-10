#!/usr/bin/env node
// @capability: sol-moe-parent-adapter
// @serves: bind the pure native reducer to the pure native shadow observer around one OpenClaw push event
// @does: validates native acceptance receipts, resolves a pushed child-completion payload against the reducer
//   state that is awaiting it and translates it into the reducer's exact completion-event form, applies the
//   reducer while mirroring the identical action/admission/completion lifecycle into the native shadow
//   observer, and extracts terminal task results. Never calls sessions_spawn, never spawns a subprocess,
//   never persists anything — the parent OpenClaw session owns execution and I/O.
// @use: const admitted = admitNativeAcceptance(state, shadow, action, receipt);
//       const applied = applyPushedCompletion(admitted.state, admitted.shadow, payload);
// @exports: validateAcceptanceReceipt, mirrorNativeAction, admitNativeAcceptance, translatePushedCompletion, applyPushedCompletion, extractTerminalTaskResult, extractTerminalTaskResults

import { recordNativeSpawnAccepted, reduceNativeDispatch } from './sol-moe-native-dispatch.mjs';
import { observeNativeAction, observeNativeAdmission, observeNativeCompletion } from './native-dispatch-shadow.mjs';

const NATIVE_DISPATCH_SCHEMA_VERSION = 'sol-moe-native-dispatch-v1';
const TERMINAL_STATUSES = new Set(['passed', 'fail-loud', 'owner-held', 'blocked']);
const CHILD_SESSION_KEY_PATTERN = /^agent:[A-Za-z0-9._-]+:subagent:[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Structurally validate a native admission receipt before it is trusted by either the reducer or the shadow. */
export function validateAcceptanceReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new TypeError('acceptance receipt must be an object');
  }
  if (receipt.status !== 'accepted') throw new TypeError('acceptance receipt status must be "accepted"');
  const childSessionKey = nonEmpty(receipt.childSessionKey, 'receipt.childSessionKey');
  const runId = nonEmpty(receipt.runId, 'receipt.runId');
  const resolvedModel = nonEmpty(receipt.resolvedModel, 'receipt.resolvedModel');
  if (!CHILD_SESSION_KEY_PATTERN.test(childSessionKey)) {
    throw new TypeError('acceptance receipt childSessionKey is not a native subagent session key');
  }
  return Object.freeze({ status: 'accepted', childSessionKey, runId, resolvedModel });
}

/** Mirror a reducer action (from reduceNativeDispatch) into the task-scoped shadow observer. */
export function mirrorNativeAction(shadow, action) {
  return observeNativeAction(shadow, action);
}

/** Record one accepted native admission into both the reducer state and the shadow observer, in lockstep. */
export function admitNativeAcceptance(state, shadow, action, rawReceipt) {
  const receipt = validateAcceptanceReceipt(rawReceipt);
  const reduction = recordNativeSpawnAccepted(state, action, receipt);
  const nextShadow = observeNativeAdmission(shadow, receipt);
  return Object.freeze({ state: reduction.state, action: reduction.action, shadow: nextShadow });
}

/**
 * Translate an OpenClaw pushed completion payload into the reducer's exact event form.
 * The pushed payload only carries what OpenClaw knows (childSessionKey, ok, output/error) — the
 * taskId/entryId/purpose are resolved by finding the one task whose accepted admission matches
 * the payload's childSessionKey, never guessed or supplied by the caller.
 */
export function translatePushedCompletion(state, payload) {
  validateReducerState(state);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('pushed completion payload must be an object');
  }
  const childSessionKey = nonEmpty(payload.childSessionKey, 'payload.childSessionKey');
  const task = findAwaitingTaskByChildSessionKey(state, childSessionKey);
  if (!task) {
    throw new TypeError(`no task is awaiting an accepted native child for childSessionKey: ${childSessionKey}`);
  }
  if (typeof payload.ok !== 'boolean') throw new TypeError('pushed completion payload ok must be boolean');
  const accepted = task.awaiting.accepted;
  const runId = payload.runId === undefined ? accepted.runId : nonEmpty(payload.runId, 'payload.runId');
  if (runId !== accepted.runId) {
    throw new TypeError('pushed completion payload runId does not match the accepted native admission');
  }

  const event = {
    id: nonEmpty(payload.eventId ?? `${task.taskId}:${task.awaiting.entry.id}:${runId}`, 'event id'),
    taskId: task.taskId,
    entryId: task.awaiting.entry.id,
    purpose: task.awaiting.purpose,
    childSessionKey,
    runId,
    ok: payload.ok,
  };
  if (payload.ok) {
    if (payload.output !== undefined) event.output = payload.output;
    if (payload.verdict !== undefined) event.verdict = payload.verdict;
  } else {
    if (payload.failureKind !== undefined) event.failureKind = String(payload.failureKind);
    if (payload.error !== undefined) event.error = String(payload.error);
  }
  return Object.freeze(event);
}

/**
 * Translate + apply one pushed completion: reduce it through the native reducer and mirror the
 * identical event and any chained follow-up action into the shadow observer, in one pure step.
 */
export function applyPushedCompletion(state, shadow, payload, options = {}) {
  const event = translatePushedCompletion(state, payload);
  const reduction = reduceNativeDispatch(state, event, { cwd: options.cwd });
  const nextShadow = observeNativeCompletion(shadow, event, reduction, options.evidence || {});
  return Object.freeze({ state: reduction.state, action: reduction.action, event, shadow: nextShadow });
}

/** Extract the normalized terminal result for one task, or null if the task has not reached a terminal status. */
export function extractTerminalTaskResult(state, taskId) {
  validateReducerState(state);
  const task = state.tasks[String(taskId)];
  if (!task) throw new TypeError(`unknown taskId: ${taskId}`);
  if (!TERMINAL_STATUSES.has(task.status)) return null;
  return Object.freeze({
    taskId: task.taskId,
    status: task.status,
    producer: task.producer,
    evidence: task.evidence,
    priorVerifier: task.priorVerifier,
    failure: task.failure || null,
  });
}

/** Extract normalized terminal results for every task currently in a terminal status. */
export function extractTerminalTaskResults(state) {
  validateReducerState(state);
  const results = {};
  for (const task of Object.values(state.tasks)) {
    if (TERMINAL_STATUSES.has(task.status)) {
      results[task.taskId] = extractTerminalTaskResult(state, task.taskId);
    }
  }
  return Object.freeze(results);
}

function findAwaitingTaskByChildSessionKey(state, childSessionKey) {
  for (const task of Object.values(state.tasks)) {
    if (task.status === 'awaiting' && task.awaiting?.accepted?.childSessionKey === childSessionKey) {
      return task;
    }
  }
  return null;
}

function validateReducerState(state) {
  if (!state || typeof state !== 'object' || state.schemaVersion !== NATIVE_DISPATCH_SCHEMA_VERSION
      || !state.tasks || typeof state.tasks !== 'object') {
    throw new TypeError('invalid native dispatch state');
  }
}

function nonEmpty(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} is required`);
  return text;
}
