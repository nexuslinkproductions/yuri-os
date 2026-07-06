#!/usr/bin/env node
// Tests for nano-compact-gate.mjs — the HARD 500k context ceiling (G2). The two load-bearing
// SAFETY invariants get explicit tests: (1) it NEVER acts outside a nano session (no bricking the
// operator), (2) it FAILS OPEN on no signal (no bricking a nano on missing telemetry).
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { decideCompact, readTokenSignal, isNanoSession, runGate, DEFAULT_THRESHOLD_TOKENS } from './nano-compact-gate.mjs';

// ---- decideCompact (pure) ----
test('SAFETY: a non-nano session is ALWAYS allow (never touch the operator session)', () => {
  assert.equal(decideCompact({ isNano: false, tokenCount: 9_000_000, armed: true }).decision, 'allow');
});

test('SAFETY: no token signal -> allow (fail-open, never brick on missing telemetry)', () => {
  assert.equal(decideCompact({ isNano: true, armed: true }).decision, 'allow');
  assert.equal(decideCompact({ isNano: true, armed: true, tokenCount: null, usedPct: null }).reason, 'no-token-signal (fail-open)');
});

test('allowlist: the compaction action itself is never denied', () => {
  assert.equal(decideCompact({ isNano: true, armed: true, tokenCount: 9e6, tool: 'compact' }).decision, 'allow');
});

test('tokens over ceiling: would_deny disarmed, deny armed', () => {
  assert.equal(decideCompact({ isNano: true, tokenCount: 500_000, armed: false }).decision, 'would_deny');
  assert.equal(decideCompact({ isNano: true, tokenCount: 500_000, armed: true }).decision, 'deny');
  assert.equal(decideCompact({ isNano: true, tokenCount: 499_999, armed: true }).decision, 'allow');
});

test('pct path used only when no absolute tokenCount; tokenCount takes precedence', () => {
  assert.equal(decideCompact({ isNano: true, usedPct: 90, thresholdPct: 75, armed: true }).decision, 'deny');
  assert.equal(decideCompact({ isNano: true, usedPct: 50, thresholdPct: 75, armed: true }).decision, 'allow');
  // tokenCount present + under ceiling wins over a high pct (precedence)
  assert.equal(decideCompact({ isNano: true, tokenCount: 100, usedPct: 99, thresholdPct: 75, armed: true }).decision, 'allow');
});

test('SAFETY (red-team A): a 0/negative threshold DISABLES the axis, never a deny-everything trap', () => {
  // pct path: "0" is the intuitive disable value — must NOT deny at 0%
  assert.equal(decideCompact({ isNano: true, usedPct: 0, thresholdPct: 0, armed: true }).decision, 'allow');
  assert.equal(decideCompact({ isNano: true, usedPct: 50, thresholdPct: -10, armed: true }).decision, 'allow');
  // tokens path: a negative threshold (was truthy past `|| DEFAULT`) must NOT deny everything
  assert.equal(decideCompact({ isNano: true, tokenCount: 10, thresholdTokens: -5, armed: true }).decision, 'allow');
  assert.equal(decideCompact({ isNano: true, tokenCount: 10, thresholdTokens: 0, armed: true }).decision, 'allow');
});

test('SAFETY (red-team A): runGate env PCT="0" / TOKENS="-5" do not arm a brick', () => {
  // fresh nano at 0% with PCT="0" armed: the brick scenario -> must be allow, no deny output
  const r = runGate({ tool_name: 'Edit', context_window: { used_percentage: 0 } }, { YURI_NANO_ID: 'n1', YURI_NANO_COMPACT_ENFORCE: '1', YURI_NANO_COMPACT_PCT: '0' });
  assert.equal(r.verdict.decision, 'allow');
  assert.equal(r.output, null);
  // TOKENS="-5" falls back to the 500k default (not a negative deny-trap); a normal count stays under
  const r2 = runGate({ tool_name: 'Edit', transcript_path: '/nonexistent' }, { YURI_NANO_ID: 'n1', YURI_NANO_COMPACT_ENFORCE: '1', YURI_NANO_COMPACT_TOKENS: '-5' });
  assert.equal(r2.verdict.decision, 'allow');
});

test('default threshold is 500k', () => {
  assert.equal(DEFAULT_THRESHOLD_TOKENS, 500_000);
  assert.equal(decideCompact({ isNano: true, tokenCount: 500_000, armed: true }).over, true);
});

// ---- isNanoSession ----
test('isNanoSession: YURI_NANO_ID env, or a nano-stamped session_id', () => {
  assert.equal(isNanoSession({ YURI_NANO_ID: 'nano-3' }, {}), true);
  assert.equal(isNanoSession({}, { session_id: 'swarm-nano-7' }), true);
  assert.equal(isNanoSession({}, { session_id: 'main-operator' }), false);
  assert.equal(isNanoSession({}, {}), false);
});

// ---- readTokenSignal ----
test('readTokenSignal: context_window.used_percentage', () => {
  const s = readTokenSignal({ context_window: { used_percentage: 42 } });
  assert.equal(s.usedPct, 42);
  assert.ok(s.sources.includes('context_window.used_percentage'));
});

test('readTokenSignal: transcript_path cumulative token sum', () => {
  const d = path.join(os.tmpdir(), `ncg-${process.pid}-${crypto.randomBytes(3).toString('hex')}`);
  fs.mkdirSync(d, { recursive: true });
  const tp = path.join(d, 't.jsonl');
  fs.writeFileSync(tp, [
    JSON.stringify({ message: { usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10 } } }),
    'garbage line',
    JSON.stringify({ message: { usage: { input_tokens: 200, output_tokens: 40, cache_creation_input_tokens: 5 } } }),
  ].join('\n'));
  const s = readTokenSignal({ transcript_path: tp });
  assert.equal(s.tokenCount, 100 + 50 + 10 + 200 + 40 + 5);
  assert.ok(s.sources.includes('transcript_path'));
});

test('readTokenSignal: neither field -> nulls', () => {
  const s = readTokenSignal({});
  assert.equal(s.tokenCount, null);
  assert.equal(s.usedPct, null);
  assert.deepEqual(s.sources, []);
});

// ---- runGate (orchestration) ----
test('runGate SAFETY: non-nano env -> allow, NO deny output ever', () => {
  const r = runGate({ tool_name: 'Edit', context_window: { used_percentage: 99 } }, { /* no YURI_NANO_ID */ YURI_NANO_COMPACT_ENFORCE: '1', YURI_NANO_COMPACT_PCT: '50' });
  assert.equal(r.verdict.decision, 'allow');
  assert.equal(r.output, null);
});

test('runGate: nano + over + DISARMED -> would_deny, no block output', () => {
  const r = runGate({ tool_name: 'Edit', context_window: { used_percentage: 90 } }, { YURI_NANO_ID: 'n1', YURI_NANO_COMPACT_PCT: '75' });
  assert.equal(r.verdict.decision, 'would_deny');
  assert.equal(r.output, null, 'disarmed -> metrics-only, never emits a deny');
});

test('runGate: nano + over + ARMED -> deny with permissionDecision output', () => {
  const r = runGate({ tool_name: 'Edit', context_window: { used_percentage: 90 } }, { YURI_NANO_ID: 'n1', YURI_NANO_COMPACT_ENFORCE: '1', YURI_NANO_COMPACT_PCT: '75' });
  assert.equal(r.verdict.decision, 'deny');
  assert.equal(r.output.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(r.output.hookSpecificOutput.permissionDecisionReason, /NANO_COMPACT_GATE/);
});

test('runGate: never throws -> fail-open verdict on a bad signal reader', () => {
  const r = runGate({ transcript_path: 123 }, { YURI_NANO_ID: 'n1', YURI_NANO_COMPACT_ENFORCE: '1' }, {
    sumTranscript: () => { throw new Error('reader blew up'); },
  });
  assert.equal(r.verdict.decision, 'allow'); // fail-open
  assert.equal(r.output, null);
});
