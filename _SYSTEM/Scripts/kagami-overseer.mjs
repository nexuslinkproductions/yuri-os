#!/usr/bin/env node

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeRuntimePath } from './lane-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_KAGAMI_LEDGER_PATH = path.join(REPO_ROOT, '_SYSTEM', 'state', 'kagami-ledger.jsonl');
export const CRASH_WINDOW_MS = 60 * 60 * 1000;
export const QUARANTINE_THRESHOLD = 3;
export const AUTO_UNQUARANTINE_MS = 120 * 60 * 1000;

export const MODEL_TO_LANE = Object.freeze({
  'nvidia/nemotron-3-ultra-550b-a55b': 'nemotron-3-ultra-550b-a55b',
  'moonshotai/kimi-k2.6': 'kimi-k2.6',
});

const LANE_ALIASES = Object.freeze({
  nemotron: 'nemotron-3-ultra-550b-a55b',
  kimi: 'kimi-k2.6',
  codex: 'codex',
  'gpt-5.5': 'codex',
  'gpt-5.4': 'codex',
  'gpt-5.4-mini': 'codex',
});

const FALLBACK_LANES = Object.freeze({
});

export function resolveKagamiLedgerPath(options = {}) {
  if (options.logPath) return path.resolve(options.logPath);
  return safeRuntimePath('YURI_KAGAMI_LEDGER_PATH', DEFAULT_KAGAMI_LEDGER_PATH);
}

export function canonicalLaneForModel(model) {
  const key = String(model || '').trim().toLowerCase();
  return MODEL_TO_LANE[key] || '';
}

export function normalizeLaneId(value) {
  const raw = String(value || '').trim().replace(/^@/, '');
  if (!raw) return '';
  const lower = raw.toLowerCase();
  return MODEL_TO_LANE[lower] || LANE_ALIASES[lower] || lower;
}

export function isQuarantineExemptLane(laneId) {
  const lane = normalizeLaneId(laneId);
  return lane === 'codex' || lane.startsWith('gpt-5.');
}

export function recordCrash(laneId, options = {}) {
  const lane = normalizeLaneId(laneId);
  if (!lane) return { ok: false, error: 'missing lane id' };

  const logPath = resolveKagamiLedgerPath(options);
  if (!logPath) return { ok: false, error: 'unsafe kagami ledger path' };

  const timestamp = numericTimestamp(options.timestamp ?? Date.now());
  unquarantineIfStale({ ...options, logPath, now: timestamp });
  appendLedger(logPath, {
    event: 'crash',
    laneId: lane,
    timestamp,
    reason: options.reason || '',
    status: options.status ?? null,
    error: options.error || '',
  });

  const state = getQuarantineState({ ...options, logPath, now: timestamp });
  const laneState = state.lanes[lane] || emptyLaneState(lane);
  if (!laneState.quarantined && laneState.crashCount >= QUARANTINE_THRESHOLD && !isQuarantineExemptLane(lane)) {
    appendLedger(logPath, {
      event: 'quarantine',
      laneId: lane,
      timestamp,
      triggerCount: laneState.crashCount,
      windowMs: CRASH_WINDOW_MS,
      reason: options.reason || 'crash-threshold',
    });
    return { ok: true, laneId: lane, quarantined: true, crashCount: laneState.crashCount };
  }

  return { ok: true, laneId: lane, quarantined: laneState.quarantined, crashCount: laneState.crashCount };
}

export function clearCrashes(laneId, options = {}) {
  const lane = normalizeLaneId(laneId);
  if (!lane) return { ok: false, error: 'missing lane id' };

  const logPath = resolveKagamiLedgerPath(options);
  if (!logPath) return { ok: false, error: 'unsafe kagami ledger path' };

  appendLedger(logPath, {
    event: 'clear',
    laneId: lane,
    timestamp: numericTimestamp(options.timestamp ?? Date.now()),
    reason: options.reason || 'health-success',
  });
  return { ok: true, laneId: lane, quarantined: false, crashCount: 0 };
}

export function recordEscalation(laneId, options = {}) {
  const lane = normalizeLaneId(laneId || 'system');
  const logPath = resolveKagamiLedgerPath(options);
  if (!logPath) return { ok: false, error: 'unsafe kagami ledger path' };
  const timestamp = numericTimestamp(options.timestamp ?? Date.now());
  appendLedger(logPath, {
    event: 'escalation',
    laneId: lane,
    timestamp,
    code: options.code || 'ESCALATION',
    reason: options.reason || '',
    candidates: Array.isArray(options.candidates) ? options.candidates.map(normalizeLaneId) : [],
  });
  return { ok: true, laneId: lane, code: options.code || 'ESCALATION' };
}

export function unquarantineIfStale(options = {}) {
  const logPath = resolveKagamiLedgerPath(options);
  if (!logPath) return { ok: false, error: 'unsafe kagami ledger path', unquarantined: [] };
  const now = numericTimestamp(options.now ?? Date.now());
  const state = getQuarantineState({ ...options, logPath, now, autoUnquarantine: false });
  const unquarantined = [];

  for (const laneState of Object.values(state.lanes)) {
    if (!laneState.quarantined || isQuarantineExemptLane(laneState.laneId)) continue;
    const lastCrash = laneState.lastCrashTimestamp || laneState.quarantineTimestamp || 0;
    if (!lastCrash || now - lastCrash <= AUTO_UNQUARANTINE_MS) continue;
    appendLedger(logPath, {
      event: 'unquarantine',
      laneId: laneState.laneId,
      timestamp: now,
      reason: 'stale-quarantine-window-elapsed',
      previousLastCrashTimestamp: lastCrash,
    });
    unquarantined.push(laneState.laneId);
  }

  return { ok: true, logPath, unquarantined };
}

export function isQuarantined(laneId, options = {}) {
  const lane = normalizeLaneId(laneId);
  if (!lane || isQuarantineExemptLane(lane)) return false;
  const state = getQuarantineState(options);
  return Boolean(state.lanes[lane]?.quarantined);
}

export function selectFallbackLane(laneId, options = {}) {
  const lane = normalizeLaneId(laneId);
  const candidates = options.candidates || FALLBACK_LANES[lane] || [];
  for (const candidate of candidates.map(normalizeLaneId)) {
    if (!candidate || candidate === lane) continue;
    if (!isQuarantined(candidate, options)) return candidate;
  }
  return '';
}

export function getQuarantineState(options = {}) {
  const logPath = resolveKagamiLedgerPath(options);
  const now = numericTimestamp(options.now ?? Date.now());
  const lanes = {};

  for (const event of readLedger(logPath)) {
    const lane = normalizeLaneId(event.laneId);
    if (!lane) continue;

    const state = lanes[lane] || emptyLaneState(lane);
    lanes[lane] = state;
    const timestamp = numericTimestamp(event.timestamp ?? Date.parse(event.ts));

    if (event.event === 'clear' || event.event === 'success' || event.event === 'unquarantine') {
      state.crashTimestamps = [];
      state.quarantined = false;
      state.lastEvent = event.event;
      state.lastReason = event.reason || '';
      state.lastTimestamp = timestamp;
      continue;
    }

    if (event.event === 'crash') {
      state.crashTimestamps.push(timestamp);
      state.crashTimestamps = state.crashTimestamps.filter((value) => now - value <= CRASH_WINDOW_MS);
      state.lastEvent = 'crash';
      state.lastReason = event.reason || event.error || '';
      state.lastStatus = event.status ?? null;
      state.lastTimestamp = timestamp;
      state.lastCrashTimestamp = timestamp;
      continue;
    }

    if (event.event === 'quarantine' && !isQuarantineExemptLane(lane)) {
      state.quarantined = true;
      state.quarantineReason = event.reason || 'crash-threshold';
      state.quarantineTimestamp = timestamp;
      state.lastEvent = 'quarantine';
      state.lastTimestamp = timestamp;
    }
  }

  for (const state of Object.values(lanes)) {
    state.crashTimestamps = state.crashTimestamps.filter((value) => now - value <= CRASH_WINDOW_MS);
    state.crashCount = state.crashTimestamps.length;
    if (isQuarantineExemptLane(state.laneId)) state.quarantined = false;
  }

  return {
    ok: true,
    ledgerPath: logPath,
    now,
    windowMs: CRASH_WINDOW_MS,
    threshold: QUARANTINE_THRESHOLD,
    lanes,
  };
}

export function getHealthSummary(options = {}) {
  if (options.autoUnquarantine === true) unquarantineIfStale(options);
  const state = getQuarantineState(options);
  const quarantinedLanes = Object.values(state.lanes)
    .filter((lane) => lane.quarantined && !isQuarantineExemptLane(lane.laneId))
    .map((lane) => lane.laneId)
    .sort();
  const codexQuarantined = Boolean(state.lanes.codex?.quarantined);
  const status = codexQuarantined ? 'fail' : quarantinedLanes.length > 0 ? 'degraded' : 'ok';
  const crashCounts = Object.fromEntries(Object.values(state.lanes).map((lane) => [lane.laneId, lane.crashCount]));
  const lastCrashes = Object.fromEntries(
    Object.values(state.lanes)
      .filter((lane) => lane.lastCrashTimestamp)
      .map((lane) => [lane.laneId, lane.lastCrashTimestamp]),
  );

  return {
    ok: status !== 'fail',
    status,
    ledgerPath: state.ledgerPath,
    quarantinedLanes,
    codexQuarantined,
    crashWindowMs: state.windowMs,
    autoUnquarantineMs: AUTO_UNQUARANTINE_MS,
    threshold: state.threshold,
    crashCounts,
    lastCrashes,
    lanes: state.lanes,
  };
}

function appendLedger(logPath, payload) {
  mkdirSync(path.dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify({
    ts: new Date(payload.timestamp || Date.now()).toISOString(),
    ...payload,
  })}\n`);
}

function readLedger(logPath) {
  if (!logPath || !existsSync(logPath)) return [];
  const lines = readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      events.push({ event: 'malformed', line });
    }
  }
  return events;
}

function emptyLaneState(laneId) {
  return {
    laneId,
    crashTimestamps: [],
    crashCount: 0,
    quarantined: false,
    lastEvent: '',
    lastReason: '',
    lastStatus: null,
    lastTimestamp: null,
    quarantineReason: '',
    quarantineTimestamp: null,
    lastCrashTimestamp: null,
  };
}

function numericTimestamp(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : Date.now();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, laneId] = process.argv.slice(2);
  if (command === 'record-crash') {
    process.stdout.write(`${JSON.stringify(recordCrash(laneId), null, 2)}\n`);
  } else if (command === 'clear') {
    process.stdout.write(`${JSON.stringify(clearCrashes(laneId), null, 2)}\n`);
  } else if (command === 'record-escalation') {
    process.stdout.write(`${JSON.stringify(recordEscalation(laneId, { code: process.argv[4] || 'ESCALATION' }), null, 2)}\n`);
  } else if (command === 'is-quarantined') {
    process.stdout.write(`${JSON.stringify({ laneId: normalizeLaneId(laneId), quarantined: isQuarantined(laneId) }, null, 2)}\n`);
  } else if (command === 'unquarantine-stale') {
    process.stdout.write(`${JSON.stringify(unquarantineIfStale({ autoUnquarantine: true }), null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(getHealthSummary(), null, 2)}\n`);
  }
}
