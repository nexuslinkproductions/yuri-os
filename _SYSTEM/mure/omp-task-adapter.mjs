#!/usr/bin/env node
// @capability: omp-task-adapter
// @serves: parse/normalize OMP TaskTool observations into dispatch-reducer evidence
// @does: validates spawn receipts {jobId,agent}, task results {id,agent,status,duration,output},
//   and path-confined transcript JSONL (session, model_change, thinking_level_change, yield).
//   Never calls TaskTool, never spawns a subprocess, never touches live state.
// @use: const receipt = parseOmpSpawnReceipt(raw);
//       const result = parseOmpTaskResult(raw);
//       const evidence = loadOmpTranscript(jobId, artifactsDir);
//       const id = deterministicOmpTaskId(entry);
// @exports: parseOmpSpawnReceipt, parseOmpTaskResult, parseOmpTranscript, loadOmpTranscript,
//           validateOmpJobId, isTerminalStatus, deterministicOmpTaskId, OMP_OBSERVATION_CONTRACT_VERSION

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const OMP_OBSERVATION_CONTRACT_VERSION = 'omp-observation-v1';
const JOB_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const TASK_ID_PATTERN = /^[A-Z][A-Za-z0-9]{0,31}$/;
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'timeout']);
const TRANSCRIPT_EVENT_TYPES = Object.freeze(new Set(['session', 'model_change', 'thinking_level_change', 'yield']));
const VALID_THINKING_LEVELS = Object.freeze(new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'adaptive', 'max']));
const VALID_AGENT_IDS = Object.freeze(new Set([
  'mure-synthesist', 'mure-synthesist-m3', 'mure-architect', 'mure-engineer', 'mure-adjudicator',
  'mure-sentinel', 'mure-calibrator-sonnet5', 'mure-scout', 'mure-artificer',
  'deepseek-flash', 'mure-yuri',
  // Promoted (canary-proven) MoE worker cards — live WORKER_BINDINGS targets
  // in sol-moe-native-dispatch.mjs; admissible producer/verifier/fallback cards.
  'mure-deliberator', 'mure-adjudicator-luna', 'mure-helmsman-glm-glm51',
  'composer-fast-c25', 'mure-ideator-grok45',
  // Evidence-only canary-bootstrap agent cards (WORKER_BINDINGS in
  // sol-moe-native-dispatch.mjs); never used as producer/verifier/fallback.
  'deepseek-flash-bootstrap', 'mure-engineer-kimi-bootstrap',
  'mure-deliberator-nemotron-bootstrap', 'mure-adjudicator-luna-bootstrap',
  'mure-helmsman-glm51-bootstrap', 'composer-25-bootstrap',
  'mure-ideator-grok45-bootstrap',
]));
const MODEL_PATTERN = /^[A-Za-z0-9._:/-]+$/;

// --- public exports ---

/** Validate and normalize a spawn receipt: { jobId, agent }. */
export function parseOmpSpawnReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new TypeError('OMP spawn receipt must be an object');
  }
  const jobId = nonEmpty(receipt.jobId, 'receipt.jobId');
  if (!JOB_ID_PATTERN.test(jobId)) {
    throw new TypeError(`OMP spawn receipt jobId is malformed: ${truncate(jobId, 64)}`);
  }
  const agent = nonEmpty(receipt.agent, 'receipt.agent');
  if (!VALID_AGENT_IDS.has(agent)) {
    throw new TypeError(`OMP spawn receipt agent is not a known card id: ${agent}`);
  }
  return Object.freeze({ jobId, agent });
}

/** Validate a task result: { id, agent, status, duration, output }. */
export function parseOmpTaskResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError('OMP task result must be an object');
  }
  const id = nonEmpty(result.id, 'result.id');
  if (!TASK_ID_PATTERN.test(id)) {
    throw new TypeError(`OMP task result id is not valid CamelCase ≤32: ${truncate(id, 32)}`);
  }
  const agent = nonEmpty(result.agent, 'result.agent');
  if (!VALID_AGENT_IDS.has(agent)) {
    throw new TypeError(`OMP task result agent is not a known card id: ${agent}`);
  }
  const status = nonEmpty(result.status, 'result.status');
  // Status validation is deferred to the parent adapter — only exact 'completed' yields ok:true.
  // OMP may emit variant failure statuses like 'failed (exit 1)' that are terminal.
  if (!('duration' in result)) throw new TypeError('result.duration is required');
  const duration = nonNegativeOrNull(result.duration, 'result.duration');
  if (!('output' in result)) throw new TypeError('result.output key is required');
  if (result.output === undefined) throw new TypeError('result.output must not be undefined');
  const output = result.output === null ? null : String(result.output);
  return Object.freeze({ id, agent, status, duration, output });
}

/**
 * Load and parse a path-confined OMP transcript.
 * Constructs path as `artifactsDir/<jobId>.jsonl`, validates no traversal escape,
 * reads the file, and delegates to parseOmpTranscript.
 */
export function loadOmpTranscript(jobId, artifactsDir) {
  const safeJobId = nonEmpty(jobId, 'jobId');
  if (!JOB_ID_PATTERN.test(safeJobId)) {
    throw new TypeError(`OMP transcript jobId is malformed: ${truncate(safeJobId, 64)}`);
  }
  const base = nonEmpty(artifactsDir, 'artifactsDir');
  const resolvedBase = path.resolve(base);
  if (resolvedBase !== base && !base.startsWith('/')) {
    throw new TypeError('OMP transcript artifactsDir must be an absolute path');
  }
  // Canonicalize base to guard against symlink escape
  let realBase;
  try {
    realBase = fs.realpathSync(resolvedBase);
  } catch {
    throw new TypeError(`OMP transcript artifactsDir is not accessible: ${truncate(resolvedBase, 128)}`);
  }
  const filename = `${safeJobId}.jsonl`;
  const resolved = path.resolve(resolvedBase, filename);
  // String-containment guard against ../ traversal
  if (!resolved.startsWith(resolvedBase + path.sep)) {
    throw new TypeError(`OMP transcript path escaped confinement: ${truncate(resolved, 128)}`);
  }
  // Canonicalize target to guard against in-directory symlinks
  let realTarget;
  try {
    realTarget = fs.realpathSync(resolved);
  } catch {
    throw new TypeError(`OMP transcript not accessible at ${truncate(resolved, 128)}`);
  }
  if (!realTarget.startsWith(realBase + path.sep)) {
    throw new TypeError(`OMP transcript symlink escaped confinement: ${truncate(realTarget, 128)}`);
  }
  // Reject non-regular files (directories, FIFOs, sockets)
  try {
    if (!fs.statSync(realTarget).isFile()) {
      throw new TypeError(`OMP transcript is not a regular file: ${truncate(realTarget, 128)}`);
    }
  } catch (err) {
    if (err instanceof TypeError) throw err;
    throw new TypeError(`OMP transcript stat failed at ${truncate(realTarget, 128)}: ${err.message}`);
  }
  let raw;
  try {
    raw = fs.readFileSync(realTarget, 'utf8');
  } catch (err) {
    throw new TypeError(`OMP transcript not readable at ${truncate(realTarget, 128)}: ${err.message}`);
  }
  return parseOmpTranscript(raw, safeJobId);
}

/**
 * Parse raw transcript JSONL into structured evidence.
 * Requires: exactly one session, exactly one model_change, at least one
 * thinking_level_change. Yield is optional corroboration; parent
 * &lt;task-result&gt; status/output is the terminal authority.
 * Rejects: duplicate session/model_change/yield, unknown event types,
 * non-JSON lines, non-object lines.
 */
export function parseOmpTranscript(raw, jobId = null) {
  if (typeof raw !== 'string') throw new TypeError('OMP transcript must be a string');
  const lines = raw.split('\n').filter((line) => line.trim());
  if (lines.length === 0) throw new TypeError('OMP transcript is empty');

  let session = null;
  let modelChange = null;
  const thinkingLevelChanges = [];
  let terminalYield = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new TypeError(`OMP transcript line ${index + 1} is not valid JSON: ${truncate(line, 80)}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new TypeError(`OMP transcript line ${index + 1} is not a JSON object`);
    }
    const type = nonEmpty(parsed.type, `transcript line ${index + 1} type`);
    if (!TRANSCRIPT_EVENT_TYPES.has(type)) {
      throw new TypeError(`OMP transcript line ${index + 1} has unknown event type: ${type}`);
    }

    switch (type) {
      case 'session': {
        if (session) throw new TypeError('OMP transcript contains duplicate session event');
        session = normalizeSessionEvent(parsed, index + 1);
        break;
      }
      case 'model_change': {
        if (modelChange) throw new TypeError('OMP transcript contains duplicate model_change event');
        modelChange = normalizeModelChangeEvent(parsed, index + 1);
        break;
      }
      case 'thinking_level_change': {
        thinkingLevelChanges.push(normalizeThinkingLevelChangeEvent(parsed, index + 1));
        break;
      }
      case 'yield': {
        if (terminalYield) throw new TypeError('OMP transcript contains duplicate yield event');
        terminalYield = normalizeYieldEvent(parsed, index + 1);
        break;
      }
    }
  }

  if (!session) throw new TypeError('OMP transcript is missing a session event');
  if (!modelChange) throw new TypeError('OMP transcript is missing a model_change event');
  if (thinkingLevelChanges.length === 0) throw new TypeError('OMP transcript is missing thinking_level_change events');
  // yield is optional — parent <task-result> status/output is terminal authority

  return Object.freeze({
    session,
    modelChange,
    thinkingLevelChanges: Object.freeze(thinkingLevelChanges),
    terminalYield,
    _jobId: jobId,
  });
}

/** Validate an OMP job ID format. */
export function validateOmpJobId(value) {
  return typeof value === 'string' && JOB_ID_PATTERN.test(value) && value === value.trim();
}

/** Returns true if a task result status is terminal. */
export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(String(status));
}

/**
 * Generate a deterministic CamelCase task ID ≤32 chars.
 * Always includes an 8-char hex hash suffix for collision resistance.
 * Format: PascalStem(≤24 chars) + 8 hex = ≤32 chars
 */
export function deterministicOmpTaskId(entry) {
  const stem = pascalCase(`${safeToken(entry.taskId, 16)}${entry.purpose}`);
  const digest = createHash('sha256').update(JSON.stringify({
    id: entry.id,
    taskId: entry.taskId,
    purpose: entry.purpose,
    agentId: entry.agentId,
    model: entry.model,
  })).digest('hex').slice(0, 8);
  const truncated = stem.slice(0, 24);
  return `${truncated}${digest}`;
}

// --- private helpers ---

function normalizeSessionEvent(parsed, lineNum) {
  const sessionId = nonEmpty(parsed.sessionId ?? parsed.id, `transcript line ${lineNum} sessionId`);
  return Object.freeze({ sessionId });
}

function normalizeModelChangeEvent(parsed, lineNum) {
  const model = nonEmpty(parsed.model, `transcript line ${lineNum} model`);
  if (!MODEL_PATTERN.test(model) || model.startsWith('-')) {
    throw new TypeError(`transcript line ${lineNum} model is malformed: ${truncate(model, 64)}`);
  }
  return Object.freeze({ model });
}

function normalizeThinkingLevelChangeEvent(parsed, lineNum) {
  const level = nonEmpty(parsed.level ?? parsed.thinkingLevel, `transcript line ${lineNum} level`);
  if (!VALID_THINKING_LEVELS.has(level)) {
    throw new TypeError(`transcript line ${lineNum} thinking level is invalid: ${level}`);
  }
  return Object.freeze({ level });
}

function normalizeYieldEvent(parsed, lineNum) {
  let data;

  if (parsed.result !== undefined) {
    // MiniMax M3: yield.result.data (object with string-encoded JSON payload)
    // MiMo: yield.result is JSON string of entire result
    let result = parsed.result;
    if (typeof result === 'string' && result.trim()) {
      try { result = JSON.parse(result); } catch {
        throw new TypeError(`transcript line ${lineNum} yield.result JSON string is malformed`);
      }
    }
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      data = result.data;
      if (data === undefined) {
        // MiMo: entire result object IS the payload
        data = result;
      } else if (typeof data === 'string' && data.trim()) {
        try { data = JSON.parse(data); } catch { /* leave as string */ }
      }
    } else {
      throw new TypeError(`transcript line ${lineNum} yield.result must be object or JSON string`);
    }
  } else {
    // Flat format: yield.data
    data = parsed.data;
    if (typeof data === 'string' && data.trim()) {
      try { data = JSON.parse(data); } catch { /* leave as string */ }
    }
  }

  if (data !== undefined && data !== null && typeof data !== 'object') {
    throw new TypeError(`transcript line ${lineNum} yield data must be object/null/JSON-string`);
  }
  return Object.freeze({
    yieldType: parsed.yieldType || 'result',
    data: data !== undefined ? data : null,
  });
}

function pascalCase(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function safeToken(value, max) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'task';
}

function nonEmpty(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} is required`);
  return text;
}

function nonNegativeOrNull(value, label) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) throw new TypeError(`${label} must be non-negative`);
  return num;
}

function truncate(value, max) {
  const s = String(value);
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
