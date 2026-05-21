import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  canonicalLaneForModel,
  clearCrashes,
  getHealthSummary,
  isQuarantined,
  recordCrash,
  recordEscalation,
  selectFallbackLane,
} from './kagami-overseer.mjs';

function withLedger(fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-kagami-overseer-'));
  const logPath = path.join(dir, 'kagami-ledger.jsonl');
  try {
    return fn(logPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('four crashes inside forty minutes quarantines a non-Codex lane and appends ledger evidence', () => withLedger((logPath) => {
  const base = Date.parse('2026-05-20T12:00:00.000Z');
  for (let i = 0; i < 4; i += 1) {
    recordCrash('nvidia-nemotron-120b', {
      logPath,
      timestamp: base + i * 10 * 60 * 1000,
      reason: 'provider-503',
      status: 503,
    });
  }

  assert.equal(isQuarantined('nvidia-nemotron-120b', { logPath, now: base + 40 * 60 * 1000 }), true);
  const ledger = readFileSync(logPath, 'utf8');
  assert.match(ledger, /"event":"quarantine"/);
  assert.match(ledger, /"triggerCount":3/);
}));

test('two crashes then a third after the sixty-minute window does not quarantine', () => withLedger((logPath) => {
  const base = Date.parse('2026-05-20T12:00:00.000Z');
  recordCrash('nvidia-glm', { logPath, timestamp: base, reason: 'fetch-failed' });
  recordCrash('nvidia-glm', { logPath, timestamp: base + 30 * 1000, reason: 'fetch-failed' });
  recordCrash('nvidia-glm', { logPath, timestamp: base + 61 * 60 * 1000, reason: 'fetch-failed' });

  const summary = getHealthSummary({ logPath, now: base + 61 * 60 * 1000 });
  assert.equal(summary.lanes['nvidia-glm'].crashCount, 1);
  assert.equal(summary.quarantinedLanes.includes('nvidia-glm'), false);
}));

test('health success clears crashes and quarantine', () => withLedger((logPath) => {
  const base = Date.parse('2026-05-20T12:00:00.000Z');
  for (let i = 0; i < 3; i += 1) {
    recordCrash('nvidia-qwen3-next', { logPath, timestamp: base + i * 1000, reason: 'provider-502' });
  }
  assert.equal(isQuarantined('nvidia-qwen3-next', { logPath, now: base + 3000 }), true);

  clearCrashes('nvidia-qwen3-next', { logPath, timestamp: base + 4000, reason: 'pong-ok' });
  assert.equal(isQuarantined('nvidia-qwen3-next', { logPath, now: base + 5000 }), false);
  assert.equal(getHealthSummary({ logPath, now: base + 5000 }).lanes['nvidia-qwen3-next'].crashCount, 0);
}));

test('Codex is exempt from quarantine', () => withLedger((logPath) => {
  const base = Date.parse('2026-05-20T12:00:00.000Z');
  for (let i = 0; i < 5; i += 1) {
    recordCrash('codex', { logPath, timestamp: base + i * 1000, reason: 'test' });
  }

  const summary = getHealthSummary({ logPath, now: base + 6000 });
  assert.equal(isQuarantined('codex', { logPath, now: base + 6000 }), false);
  assert.equal(summary.codexQuarantined, false);
  assert.equal(summary.status, 'ok');
}));

test('fallback selection skips quarantined candidates and model slugs normalize to canonical lanes', () => withLedger((logPath) => {
  const base = Date.parse('2026-05-20T12:00:00.000Z');
  for (let i = 0; i < 3; i += 1) {
    recordCrash('nvidia-nemotron-nano-30b', { logPath, timestamp: base + i * 1000, reason: 'provider-503' });
  }

  assert.equal(canonicalLaneForModel('nvidia/nemotron-3-super-120b-a12b'), 'nvidia-nemotron-120b');
  assert.equal(selectFallbackLane('nvidia-nemotron-120b', { logPath, now: base + 4000 }), 'nvidia-mistral-medium');
}));

test('auto-unquarantine clears stale quarantine only when requested', () => withLedger((logPath) => {
  const base = Date.parse('2026-05-20T12:00:00.000Z');
  for (let i = 0; i < 3; i += 1) {
    recordCrash('nvidia-glm', { logPath, timestamp: base + i * 1000, reason: 'provider-503' });
  }

  assert.equal(isQuarantined('nvidia-glm', { logPath, now: base + 121 * 60 * 1000 }), true);
  const summary = getHealthSummary({ logPath, now: base + 121 * 60 * 1000, autoUnquarantine: true });
  assert.equal(summary.quarantinedLanes.includes('nvidia-glm'), false);
  assert.match(readFileSync(logPath, 'utf8'), /"event":"unquarantine"/);
}));

test('escalations are appended as explicit evidence', () => withLedger((logPath) => {
  const result = recordEscalation('nvidia-nemotron-120b', {
    logPath,
    timestamp: Date.parse('2026-05-20T12:00:00.000Z'),
    code: 'NO_HEALTHY_LANE_FOR_TASK',
    candidates: ['nvidia-nemotron-nano-30b', 'nvidia-mistral-medium'],
  });

  assert.equal(result.ok, true);
  const ledger = readFileSync(logPath, 'utf8');
  assert.match(ledger, /"event":"escalation"/);
  assert.match(ledger, /NO_HEALTHY_LANE_FOR_TASK/);
}));
