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
    recordCrash('mimo-v2.5-pro[1m]', {
      logPath,
      timestamp: base + i * 10 * 60 * 1000,
      reason: 'provider-503',
      status: 503,
    });
  }

  assert.equal(isQuarantined('mimo-v2.5-pro[1m]', { logPath, now: base + 40 * 60 * 1000 }), true);
  const ledger = readFileSync(logPath, 'utf8');
  assert.match(ledger, /"event":"quarantine"/);
  assert.match(ledger, /"triggerCount":3/);
}));

test('two crashes then a third after the sixty-minute window does not quarantine', () => withLedger((logPath) => {
  const base = Date.parse('2026-05-20T12:00:00.000Z');
  recordCrash('mimo-v2-flash', { logPath, timestamp: base, reason: 'fetch-failed' });
  recordCrash('mimo-v2-flash', { logPath, timestamp: base + 30 * 1000, reason: 'fetch-failed' });
  recordCrash('mimo-v2-flash', { logPath, timestamp: base + 61 * 60 * 1000, reason: 'fetch-failed' });

  const summary = getHealthSummary({ logPath, now: base + 61 * 60 * 1000 });
  assert.equal(summary.lanes['mimo-v2-flash'].crashCount, 1);
  assert.equal(summary.quarantinedLanes.includes('mimo-v2-flash'), false);
}));

test('health success clears crashes and quarantine', () => withLedger((logPath) => {
  const base = Date.parse('2026-05-20T12:00:00.000Z');
  for (let i = 0; i < 3; i += 1) {
    recordCrash('mimo-v2.5-pro[1m]', { logPath, timestamp: base + i * 1000, reason: 'provider-502' });
  }
  assert.equal(isQuarantined('mimo-v2.5-pro[1m]', { logPath, now: base + 3000 }), true);

  clearCrashes('mimo-v2.5-pro[1m]', { logPath, timestamp: base + 4000, reason: 'pong-ok' });
  assert.equal(isQuarantined('mimo-v2.5-pro[1m]', { logPath, now: base + 5000 }), false);
  assert.equal(getHealthSummary({ logPath, now: base + 5000 }).lanes['mimo-v2.5-pro[1m]'].crashCount, 0);
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

test('model slugs normalize to consolidated canonical lanes', () => withLedger((logPath) => {
  const base = Date.parse('2026-05-20T12:00:00.000Z');
  for (let i = 0; i < 3; i += 1) {
    recordCrash('mimo-v2.5-pro[1m]', { logPath, timestamp: base + i * 1000, reason: 'provider-503' });
  }

  assert.equal(canonicalLaneForModel('mimo-v2.5-pro[1m]'), 'mimo-v2.5-pro[1m]');
  assert.equal(canonicalLaneForModel('mimo-v2-flash'), 'mimo-v2-flash');
  assert.equal(selectFallbackLane('mimo-v2.5-pro[1m]', { logPath, now: base + 4000 }), '');
}));

test('auto-unquarantine clears stale quarantine only when requested', () => withLedger((logPath) => {
  const base = Date.parse('2026-05-20T12:00:00.000Z');
  for (let i = 0; i < 3; i += 1) {
    recordCrash('mimo-v2-flash', { logPath, timestamp: base + i * 1000, reason: 'provider-503' });
  }

  assert.equal(isQuarantined('mimo-v2-flash', { logPath, now: base + 121 * 60 * 1000 }), true);
  const summary = getHealthSummary({ logPath, now: base + 121 * 60 * 1000, autoUnquarantine: true });
  assert.equal(summary.quarantinedLanes.includes('mimo-v2-flash'), false);
  assert.match(readFileSync(logPath, 'utf8'), /"event":"unquarantine"/);
}));

test('escalations are appended as explicit evidence', () => withLedger((logPath) => {
  const result = recordEscalation('mimo-v2.5-pro[1m]', {
    logPath,
    timestamp: Date.parse('2026-05-20T12:00:00.000Z'),
    code: 'NO_HEALTHY_LANE_FOR_TASK',
    candidates: ['mimo-v2-flash', 'codex'],
  });

  assert.equal(result.ok, true);
  const ledger = readFileSync(logPath, 'utf8');
  assert.match(ledger, /"event":"escalation"/);
  assert.match(ledger, /NO_HEALTHY_LANE_FOR_TASK/);
}));
