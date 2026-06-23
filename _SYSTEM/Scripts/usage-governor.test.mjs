#!/usr/bin/env node
// usage-governor.test.mjs — node:test suite (RED/GREY/GREEN)
// run: node --test _SYSTEM/Scripts/usage-governor.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  tierOf,
  paceSignal,
  aggregateRows,
  DEFAULT_BUDGET,
} from './usage-governor.mjs';
import { calculateCostUsd, getPricingPolicy } from './token-ledger.mjs';

// ── tierOf ───────────────────────────────────────────────────────────────────

test('tierOf: real opus model string → opus', () => {
  assert.equal(tierOf('claude-opus-4-8'), 'opus');
  assert.equal(tierOf('claude-opus-4-7'), 'opus');
});

test('tierOf: real sonnet model string → sonnet', () => {
  assert.equal(tierOf('claude-sonnet-4-6'), 'sonnet');
  assert.equal(tierOf('claude-sonnet-3-5'), 'sonnet');
});

test('tierOf: real haiku model string → haiku', () => {
  assert.equal(tierOf('claude-haiku-4-5-20251001'), 'haiku');
  assert.equal(tierOf('claude-haiku-3'), 'haiku');
});

test('tierOf: non-Anthropic models → other', () => {
  assert.equal(tierOf('glm-5.2'), 'other');
  assert.equal(tierOf('gpt-4o'), 'other');
  assert.equal(tierOf('deepseek-v4-pro'), 'other');
  assert.equal(tierOf(''), 'other');
  assert.equal(tierOf(null), 'other');
});

// ── aggregateRows (in-memory, no filesystem) ─────────────────────────────────

const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

function makeRow(tier, model, input, output, cacheRead = 0, cacheCreate = 0, ageMs = DAY_MS) {
  return { ts: NOW - ageMs, tier, model, input, output, cacheRead, cacheCreate };
}

const FIXTURE_ROWS = [
  // opus rows — 2 events in window
  makeRow('opus', 'claude-opus-4-8', 5000, 1000, 2000, 500, DAY_MS),
  makeRow('opus', 'claude-opus-4-8', 3000, 800, 1000, 200, 2 * DAY_MS),
  // sonnet rows — 3 events in window
  makeRow('sonnet', 'claude-sonnet-4-6', 10000, 2000, 5000, 1000, DAY_MS),
  makeRow('sonnet', 'claude-sonnet-4-6', 8000, 1500, 3000, 800, 3 * DAY_MS),
  makeRow('sonnet', 'claude-sonnet-4-6', 4000, 500, 0, 0, 6 * DAY_MS),
  // haiku row
  makeRow('haiku', 'claude-haiku-4-5-20251001', 2000, 400, 500, 100, DAY_MS),
  // other (glm) — should not count toward Anthropic budget
  makeRow('other', 'glm-5.2', 1000, 200, 0, 0, DAY_MS),
  // OUT OF WINDOW row (8 days ago) — must be excluded
  makeRow('opus', 'claude-opus-4-8', 99999, 99999, 0, 0, 8 * DAY_MS),
];

test('aggregateRows: all in-window events counted, out-of-window excluded', () => {
  const report = aggregateRows(FIXTURE_ROWS, { now: NOW, windowDays: 7 });
  // 8-day-old opus row must be excluded
  assert.equal(report.perTier.opus.events, 2, 'opus: 2 in-window events');
  assert.equal(report.perTier.sonnet.events, 3, 'sonnet: 3 in-window events');
  assert.equal(report.perTier.haiku.events, 1, 'haiku: 1 event');
  assert.equal(report.perTier.other.events, 1, 'other: 1 glm event');
  assert.equal(report.totals.events, 7, 'totals: 7 in-window events');
});

test('aggregateRows: token counts sum correctly for opus', () => {
  const report = aggregateRows(FIXTURE_ROWS, { now: NOW, windowDays: 7 });
  const o = report.perTier.opus;
  assert.equal(o.input, 5000 + 3000, 'opus input');
  assert.equal(o.output, 1000 + 800, 'opus output');
  assert.equal(o.cacheRead, 2000 + 1000, 'opus cacheRead');
  assert.equal(o.cacheCreate, 500 + 200, 'opus cacheCreate');
});

test('aggregateRows: costUsd > 0 for known opus row', () => {
  // Use the exact pricing-table key — findModelPricing does substring match:
  // 'claude-opus-4-7' IS a substring of 'claude-opus-4-7'; 'claude-opus-4-8' is NOT.
  const opusOnly = [makeRow('opus', 'claude-opus-4-7', 5000, 1000, 2000, 500, DAY_MS)];
  const report = aggregateRows(opusOnly, { now: NOW, windowDays: 7 });
  assert.ok(report.perTier.opus.costUsd > 0, `expected costUsd > 0, got ${report.perTier.opus.costUsd}`);
});

test('aggregateRows: costUsd > 0 for known sonnet row', () => {
  const sonnetOnly = [makeRow('sonnet', 'claude-sonnet-4-6', 10000, 2000, 5000, 1000, DAY_MS)];
  const report = aggregateRows(sonnetOnly, { now: NOW, windowDays: 7 });
  assert.ok(report.perTier.sonnet.costUsd > 0, `expected costUsd > 0, got ${report.perTier.sonnet.costUsd}`);
});

test('aggregateRows: zero-token rows contribute 0 cost (synthetic skipped upstream by scanTranscripts)', () => {
  // scanTranscripts skips rows where model === '<synthetic>' or all tokens are zero.
  // aggregateRows receives pre-filtered rows; verify that a zero-token row
  // (which scanTranscripts would never emit) produces 0 cost if it somehow arrived.
  // The row has tier 'opus' (hardcoded) and model '<synthetic>' with all-zero counts.
  const zeroRow = [makeRow('opus', '<synthetic>', 0, 0, 0, 0, DAY_MS)];
  const report = aggregateRows(zeroRow, { now: NOW, windowDays: 7 });
  // tier is 'opus' (first arg to makeRow) — so opus bucket gets 1 event, cost 0
  assert.equal(report.perTier.opus.events, 1, 'zero row lands in opus bucket (tier from makeRow)');
  assert.equal(report.perTier.opus.costUsd, 0, 'no cost for zero-token row');
});

test('aggregateRows: with budget sets pctOfBudget and pace', () => {
  const report = aggregateRows(FIXTURE_ROWS, {
    now: NOW,
    windowDays: 7,
    budget: { opusWeeklyTokens: 100_000, sonnetWeeklyTokens: 500_000, haikuWeeklyTokens: 200_000 },
  });
  assert.ok(report.perTier.opus.pctOfBudget !== null, 'opus pct should be set');
  assert.ok(report.perTier.opus.pace !== null, 'opus pace should be set');
  assert.ok(typeof report.perTier.opus.pace.throttle === 'string');
});

test('aggregateRows: no budget → pctOfBudget null, pace null', () => {
  const report = aggregateRows(FIXTURE_ROWS, { now: NOW, windowDays: 7, budget: DEFAULT_BUDGET });
  assert.equal(report.perTier.opus.pctOfBudget, null);
  assert.equal(report.perTier.opus.pace, null);
});

// ── paceSignal ───────────────────────────────────────────────────────────────

test('paceSignal: no budget → hold with no-budget message', () => {
  const sig = paceSignal(50_000, null, 3, 7);
  assert.equal(sig.throttle, 'hold');
  assert.match(sig.reason, /no budget/i);
});

test('paceSignal: under pace → up', () => {
  // 3 days elapsed, budget 700k; expected = 300k; consumed = 100k (33% of expected → under 80%)
  const sig = paceSignal(100_000, 700_000, 3, 7);
  assert.equal(sig.throttle, 'up', `expected 'up', got '${sig.throttle}'`);
  assert.equal(sig.onPace, true);
});

test('paceSignal: over pace → down', () => {
  // 3 days elapsed, budget 100k; expected = ~43k; consumed = 90k (>110% of expected)
  const sig = paceSignal(90_000, 100_000, 3, 7);
  assert.equal(sig.throttle, 'down', `expected 'down', got '${sig.throttle}'`);
  assert.equal(sig.onPace, false);
});

test('paceSignal: exactly on pace → hold', () => {
  // 3.5 days elapsed (half of 7), budget 200k; expected = 100k; consumed = 100k → exactly 100%
  const sig = paceSignal(100_000, 200_000, 3.5, 7);
  assert.equal(sig.throttle, 'hold');
});

test('paceSignal: projectedEndOfWeek is numeric when daysElapsed > 0', () => {
  const sig = paceSignal(50_000, 700_000, 3.5, 7);
  assert.ok(Number.isFinite(sig.projectedEndOfWeek), 'projectedEndOfWeek should be finite');
  // 50k/3.5d * 7d = 100k projected
  assert.equal(sig.projectedEndOfWeek, Math.round((50_000 / 3.5) * 7));
});

// ── calculateCostUsd sanity (via token-ledger directly) ──────────────────────

test('calculateCostUsd: known opus row yields expected cost', () => {
  const policy = getPricingPolicy();
  const cost = calculateCostUsd({
    request_model: 'claude-opus-4-7',
    input_tokens: 1_000_000,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
  }, policy);
  // $15 per million input tokens
  assert.ok(Math.abs(cost - 15) < 0.0001, `expected ~$15 for 1M opus input tokens, got $${cost}`);
});

test('calculateCostUsd: sonnet output pricing', () => {
  const policy = getPricingPolicy();
  const cost = calculateCostUsd({
    request_model: 'claude-sonnet-4-6',
    input_tokens: 0,
    output_tokens: 1_000_000,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
  }, policy);
  // $15 per million output tokens for sonnet
  assert.ok(Math.abs(cost - 15) < 0.0001, `expected ~$15 for 1M sonnet output tokens, got $${cost}`);
});
