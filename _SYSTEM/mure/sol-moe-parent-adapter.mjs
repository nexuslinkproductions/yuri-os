#!/usr/bin/env node
// @capability: sol-moe-parent-adapter
// @serves: bind the pure native reducer to the pure native shadow observer around OMP TaskTool observations
// @does: validates OMP spawn receipts, resolves task results against awaiting admissions
//   by jobId, loads path-confined transcript evidence, enriches completion events with
//   model_change, and applies the reducer while mirroring the lifecycle into the shadow.
//   Never calls TaskTool, never spawns a subprocess, never persists anything — the parent
//   OMP session owns execution and I/O.
// @use: const admitted = admitOmpSpawn(state, shadow, action, receipt);
//       const applied = applyOmpCompletion(state, shadow, result, jobId, transcriptJsonl, opts);
//       // or from disk:
//       const applied = applyOmpCompletionFromDisk(state, shadow, result, jobId, artifactsDir, opts);
// @exports: admitOmpSpawn, applyOmpCompletion, applyOmpCompletionFromDisk,
//           extractTerminalTaskResult, extractTerminalTaskResults

import { recordNativeSpawnAccepted, reduceNativeDispatch } from './sol-moe-native-dispatch.mjs';
import { observeNativeAction, observeNativeAdmission, observeNativeCompletion } from './native-dispatch-shadow.mjs';
import {
  parseOmpSpawnReceipt, parseOmpTaskResult, parseOmpTranscript, loadOmpTranscript,
} from './omp-task-adapter.mjs';

const NATIVE_DISPATCH_SCHEMA_VERSION = 'sol-moe-native-dispatch-v2';
const TERMINAL_STATUSES = new Set(['passed', 'fail-loud', 'owner-held', 'blocked']);

/**
 * Mirror a reducer action (from reduceNativeDispatch) into the task-scoped shadow observer.
 */
export function mirrorOmpSpawnAction(shadow, action) {
  return observeNativeAction(shadow, action);
}

/**
 * Record one accepted OMP spawn into both the reducer state and the shadow, in lockstep.
 * Receipt: { jobId, agent } — returned by OMP `task` tool.
 * The shadow must already have the action mirrored via mirrorOmpSpawnAction.
 */
export function admitOmpSpawn(state, shadow, action, rawReceipt) {
  const receipt = parseOmpSpawnReceipt(rawReceipt);
  const reduction = recordNativeSpawnAccepted(state, action, receipt);
  const nextShadow = observeNativeAdmission(shadow, receipt);
  return Object.freeze({ state: reduction.state, action: reduction.action, shadow: nextShadow, receipt });
}
export function applyOmpCompletion(state, shadow, rawResult, jobId, transcriptJsonl, options = {}) {
  const result = parseOmpTaskResult(rawResult);
  const event = translateOmpCompletion(state, jobId, result, transcriptJsonl);
  const reduction = reduceNativeDispatch(state, event, { cwd: options.cwd });
  const nextShadow = observeNativeCompletion(shadow, event, reduction, options.evidence || {});
  return Object.freeze({ state: reduction.state, action: reduction.action, event, shadow: nextShadow });
}

/**
 * Load transcript from disk (path-confined) and apply completion.
 */
export function applyOmpCompletionFromDisk(state, shadow, rawResult, jobId, artifactsDir, options = {}) {
  const transcript = loadOmpTranscript(jobId, artifactsDir);
  return applyOmpCompletion(state, shadow, rawResult, jobId, transcript, options);
}

// --- translation helpers ---

/**
 * Translate a parsed task result into the reducer's exact event form.
 * Correlates by jobId → awaiting admission, validates agent + task id,
 * and enriches with model_change from transcript evidence.
 */
function translateOmpCompletion(state, jobId, result, transcriptJsonl) {
  validateReducerState(state);
  if (!jobId || typeof jobId !== 'string') throw new TypeError('jobId is required to correlate completion');

  const task = findAwaitingTaskByJobId(state, jobId);
  if (!task) {
    throw new TypeError(`no task is awaiting an accepted OMP child for jobId: ${jobId}`);
  }

  const accepted = task.awaiting.accepted;
  if (result.agent !== accepted.agent) {
    throw new TypeError(`result agent ${result.agent} does not match admission agent ${accepted.agent}`);
  }
  if (result.id !== task.awaiting.emittedTaskId) {
    throw new TypeError(`result id ${result.id} does not match emitted task id ${task.awaiting.emittedTaskId}`);
  }

  const ok = result.status === 'completed';
  const event = {
    id: `${task.taskId}:${task.awaiting.entry.id}:${jobId}`,
    taskId: task.taskId,
    entryId: task.awaiting.entry.id,
    purpose: task.awaiting.purpose,
    jobId,
    ok,
  };

  if (ok) {
    if (transcriptJsonl == null) {
      throw new TypeError('transcript is required for successful completion evidence');
    }
    const transcript = typeof transcriptJsonl === 'object'
      ? transcriptJsonl  // already parsed by loadOmpTranscript
      : parseOmpTranscript(transcriptJsonl, jobId);
    if (transcript._jobId && transcript._jobId !== jobId) {
      throw new TypeError(`transcript _jobId ${transcript._jobId} does not match completion jobId ${jobId}`);
    }

    event.modelChange = Object.freeze({ model: transcript.modelChange.model });
    event.output = result.output;

    // Try to extract verdict for verifier events from output
    if (result.output !== null) {
      try {
        const parsed = typeof result.output === 'string' ? JSON.parse(result.output) : result.output;
        if (parsed?.verdict === 'pass' || parsed?.verdict === 'reject') {
          event.verdict = parsed.verdict;
        }
      } catch { /* not JSON — no verdict */ }
    }
  } else {
    event.failureKind = result.status === 'timeout' ? 'timeout'
      : result.status === 'cancelled' ? 'cancelled'
      : 'semantic';
    event.error = `OMP task ended with status: ${result.status}`;
  }

  return Object.freeze(event);
}

/** Extract the normalized terminal result for one task, or null if in flight. */
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

/** Extract normalized terminal results for every task. */
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

function findAwaitingTaskByJobId(state, jobId) {
  for (const task of Object.values(state.tasks)) {
    if (task.status === 'awaiting' && task.awaiting?.accepted?.jobId === jobId) {
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
