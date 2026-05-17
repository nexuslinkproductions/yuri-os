#!/usr/bin/env node

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PULSE_TRACE_LEDGER_SCHEMA_VERSION = 1;
const DEFAULT_TRACE_ROOT = path.join(os.homedir(), '.nudimmud', 'pulse-trace');
const FORBIDDEN_TRACE_KEYS = new Set([
  'chainOfThought',
  'chain_of_thought',
  'hiddenReasoning',
  'hidden_reasoning',
  'hiddenCot',
  'hidden_cot',
  'cot',
]);

export function resolvePulseTracePaths(options = {}) {
  const root = path.resolve(options.root || process.env.PULSE_TRACE_ROOT || DEFAULT_TRACE_ROOT);
  return {
    root,
    ledgerPath: path.join(root, 'ledger.ndjson'),
    snapshotsDir: path.join(root, 'snapshots'),
  };
}

export function appendPulseTraceEvent(event, options = {}) {
  const paths = resolvePulseTracePaths(options);
  const payload = scrubJson(event.payload || {});
  assertNoHiddenReasoningKeys(payload);

  const normalized = {
    schema_version: PULSE_TRACE_LEDGER_SCHEMA_VERSION,
    event_id: event.eventId || `pulse-event-${Date.now()}-${process.pid}-${randomId()}`,
    trace_id: stringOr(event.traceId || event.trace_id, 'unknown-trace'),
    type: stringOr(event.type, 'pulse.event'),
    status: stringOr(event.status, 'recorded'),
    stage_id: stringOr(event.stageId || event.stage_id, ''),
    lane_id: stringOr(event.laneId || event.lane_id, ''),
    created_at: event.createdAt || new Date().toISOString(),
    payload_sha256: sha256(stableStringify(payload)),
    payload,
  };

  mkdirSync(paths.root, { recursive: true });
  appendFileSync(paths.ledgerPath, `${JSON.stringify(normalized)}\n`, 'utf8');
  return { ...normalized, ledger_path: paths.ledgerPath };
}

export function writePulseTraceSnapshot(traceId, snapshot, options = {}) {
  const paths = resolvePulseTracePaths(options);
  const safeTraceId = sanitizeTraceId(traceId || snapshot?.trace_id || 'unknown-trace');
  const compact = scrubJson(snapshot || {});
  assertNoHiddenReasoningKeys(compact);

  mkdirSync(paths.snapshotsDir, { recursive: true });
  const snapshotPath = path.join(paths.snapshotsDir, `${safeTraceId}.json`);
  writeFileSync(snapshotPath, `${JSON.stringify(compact, null, 2)}\n`, 'utf8');
  return snapshotPath;
}

export function compactPulseSnapshot(plan, executorResult = null) {
  const stages = plan?.symbioticPulse?.stages || [];
  const activationGraph = plan?.symbioticPulse?.activationGraph || {};
  const resultStages = executorResult?.stages || [];

  return {
    schema_version: PULSE_TRACE_LEDGER_SCHEMA_VERSION,
    trace_id: plan?.pulseTrace?.traceId || executorResult?.pulse_trace_id || 'unknown-trace',
    created_at: new Date().toISOString(),
    stores_hidden_reasoning: false,
    plan: {
      schema_version: plan?.schema_version || null,
      contract: plan?.contract || '',
      mode: plan?.mode || '',
      intent_sha256: plan?.intent?.sha256 || '',
      route: plan?.route || {},
      pulse_seed: {
        privacy_class: plan?.pulseSeed?.privacyClass || '',
        objective_sha256: sha256(plan?.pulseSeed?.objective || ''),
        risks: plan?.pulseSeed?.risks || [],
        capability_hints: plan?.pulseSeed?.capabilityHints || [],
        work_packets: (plan?.pulseSeed?.workPackets || []).map((packet) => ({
          id: packet.id || '',
          capability: packet.capability || '',
          priority: packet.priority || '',
        })),
        legacy_aliases: plan?.pulseSeed?.legacyAliases || [],
      },
      selected_lanes: plan?.symbioticPulse?.selectedLanes || [],
      skipped_candidates: plan?.symbioticPulse?.skippedCandidates || [],
      activation_graph: {
        schema_version: activationGraph.schema_version || null,
        type: activationGraph.type || '',
        trigger_all_at_once: activationGraph.triggerAllAtOnce === true,
        nodes: (activationGraph.nodes || []).map((node) => node.id || node),
        edges: activationGraph.edges || [],
      },
      stages: stages.map(compactPlanStage),
    },
    executor_result: executorResult ? compactExecutorResult(executorResult, resultStages) : null,
  };
}

export function readPulseTraceEvents(options = {}) {
  const paths = resolvePulseTracePaths(options);
  if (!existsSync(paths.ledgerPath)) return [];
  return readFileSync(paths.ledgerPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid pulse trace ledger JSON at line ${index + 1}: ${error.message}`);
      }
    });
}

export function verifyPulseTraceLedger(options = {}) {
  const events = readPulseTraceEvents(options);
  const errors = [];
  for (const [index, event] of events.entries()) {
    if (event.schema_version !== PULSE_TRACE_LEDGER_SCHEMA_VERSION) {
      errors.push(`line ${index + 1}: schema_version mismatch`);
    }
    for (const key of ['event_id', 'trace_id', 'type', 'status', 'created_at', 'payload_sha256']) {
      if (!event[key]) errors.push(`line ${index + 1}: missing ${key}`);
    }
    const expectedHash = sha256(stableStringify(event.payload || {}));
    if (event.payload_sha256 !== expectedHash) {
      errors.push(`line ${index + 1}: payload hash mismatch`);
    }
    try {
      assertNoHiddenReasoningKeys(event.payload || {});
    } catch (error) {
      errors.push(`line ${index + 1}: ${error.message}`);
    }
  }
  return {
    ok: errors.length === 0,
    event_count: events.length,
    errors,
  };
}

function compactPlanStage(stage) {
  return {
    id: stage.id || '',
    capability: stage.capability || '',
    purpose_sha256: sha256(stage.purpose || ''),
    lane_ids: stage.laneIds || stage.lanes || [],
    skill_ids: stage.skillIds || [],
    native_only: stage.nativeOnly === true,
    depends_on: stage.dependsOn || [],
    trigger_all_at_once: stage.triggerAllAtOnce === true,
  };
}

function compactExecutorResult(result, stages) {
  return {
    mode: result.mode || '',
    verification_status: result.verification_status || 'not_run',
    trigger_all_at_once: result.trigger_all_at_once === true,
    selected_lane_ids: result.selected_lane_ids || [],
    stages: stages.map((stage) => ({
      id: stage.id || '',
      status: stage.status || '',
      lane_results: (stage.laneResults || stage.lane_results || []).map((lane) => ({
        lane_id: lane.laneId || lane.lane_id || '',
        status: lane.status || '',
        kind: lane.kind || '',
        model: lane.model || '',
        output_sha256: lane.outputSha256 || lane.output_sha256 || '',
        error_sha256: lane.error ? sha256(lane.error) : '',
        reason: lane.reason || '',
      })),
    })),
  };
}

function assertNoHiddenReasoningKeys(value, pathParts = []) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoHiddenReasoningKeys(item, [...pathParts, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_TRACE_KEYS.has(key)) {
      throw new Error(`forbidden hidden reasoning key in pulse trace payload: ${[...pathParts, key].join('.')}`);
    }
    assertNoHiddenReasoningKeys(child, [...pathParts, key]);
  }
}

function scrubJson(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(scrubJson);
  if (typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'function' || typeof child === 'symbol' || child === undefined) continue;
      out[key] = scrubJson(child);
    }
    return out;
  }
  if (typeof value === 'bigint') return String(value);
  return value;
}

function stableStringify(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortJson(child)]),
  );
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function sanitizeTraceId(value) {
  return String(value || 'unknown-trace').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 160);
}

function stringOr(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function randomId() {
  return crypto.randomBytes(4).toString('hex');
}

function printHelp() {
  process.stdout.write([
    'Usage:',
    '  node Scripts/pulse-trace-ledger.mjs path',
    '  node Scripts/pulse-trace-ledger.mjs tail [--limit n]',
    '  node Scripts/pulse-trace-ledger.mjs verify',
    '',
    'Environment:',
    '  PULSE_TRACE_ROOT=/path/to/trace-root',
  ].join('\n') + '\n');
}

function cli() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (command === 'path') {
    process.stdout.write(`${JSON.stringify(resolvePulseTracePaths(), null, 2)}\n`);
    return;
  }
  if (command === 'tail') {
    const limitIndex = args.indexOf('--limit');
    const limit = limitIndex >= 0 ? Number.parseInt(args[limitIndex + 1] || '20', 10) : 20;
    const events = readPulseTraceEvents().slice(-Math.max(1, Number.isFinite(limit) ? limit : 20));
    process.stdout.write(`${JSON.stringify(events, null, 2)}\n`);
    return;
  }
  if (command === 'verify') {
    const result = verifyPulseTraceLedger();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  printHelp();
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) cli();
