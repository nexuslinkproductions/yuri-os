// usage-governor — red/grey/green for the USAGE-first (not cost) two-pool quota governor. The point of the
// rework: MAX is a flat USAGE subscription, so we track TOKENS per Anthropic quota POOL (Opus / Standard =
// Sonnet+Haiku), NEVER dollars, and emit an advisory throttle vs a configured weekly budget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierOf, poolOf, weightedTokens, aggregateRows, paceSignal, DEFAULT_BUDGET, POOLS } from './usage-governor.mjs';

const NOW = Date.parse('2026-06-23T12:00:00Z');
const recent = (h) => NOW - h * 3600 * 1000; // h hours ago
const row = (model, o = {}) => ({ ts: recent(1), tier: tierOf(model), model, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, ...o });

// ── GREEN ───────────────────────────────────────────────────────────────────
test('GREEN: tierOf maps the real model strings', () => {
  assert.equal(tierOf('claude-opus-4-8'), 'opus');
  assert.equal(tierOf('claude-sonnet-4-6'), 'sonnet');
  assert.equal(tierOf('claude-haiku-4-5-20251001'), 'haiku');
  assert.equal(tierOf('glm-5.2'), 'other');
});

test('GREEN: poolOf — opus alone, sonnet+haiku→standard, other separate (the MAX two-pool split)', () => {
  assert.equal(poolOf('opus'), 'opus');
  assert.equal(poolOf('sonnet'), 'standard');
  assert.equal(poolOf('haiku'), 'standard');
  assert.equal(poolOf('other'), 'other');
});

test('GREEN: weightedTokens — cache-read discounted 0.1×, rest 1:1 (usage units, no $)', () => {
  assert.equal(weightedTokens({ input: 100, output: 200, cacheCreate: 50, cacheRead: 1000 }), 100 + 200 + 50 + 100);
});

test('GREEN: aggregateRows rolls sonnet+haiku into the standard pool + sums usage (no cost field)', () => {
  const rows = [
    row('claude-opus-4-8', { input: 1000, output: 2000 }),
    row('claude-sonnet-4-6', { input: 500, output: 500 }),
    row('claude-haiku-4-5', { input: 100, output: 100 }),
    row('glm-5.2', { input: 9999, output: 9999 }),
  ];
  const r = aggregateRows(rows, { now: NOW, budget: DEFAULT_BUDGET });
  assert.equal(r.perPool.opus.events, 1);
  assert.equal(r.perPool.standard.events, 2, 'sonnet + haiku combined');
  assert.equal(r.perPool.standard.usage, 1200, '500+500 + 100+100');
  assert.equal(r.perPool.other.events, 1, 'glm tracked but separate');
  assert.equal(r.perTier.sonnet.usage, 1000);
  assert.ok(!('costUsd' in r.perPool.opus) && !('cost' in r.perPool.opus), 'NO dollar field anywhere');
});

// ── RED ─────────────────────────────────────────────────────────────────────
test('RED: out-of-window rows are excluded', () => {
  const rows = [row('claude-opus-4-8', { ts: recent(1), input: 100 }), row('claude-opus-4-8', { ts: NOW - 8 * 86400 * 1000, input: 999999 })];
  const r = aggregateRows(rows, { now: NOW });
  assert.equal(r.perPool.opus.events, 1, 'the 8-day-old row is dropped from a 7-day window');
  assert.equal(r.perPool.opus.input, 100);
});

test('RED: no budget → throttle HOLD with a calibrate hint (never a false up/down)', () => {
  const p = paceSignal(5_000_000, null);
  assert.equal(p.throttle, 'hold');
  assert.match(p.reason, /no weekly budget|calibrate/);
});

// ── GREY ────────────────────────────────────────────────────────────────────
test('GREY: paceSignal — under cap → UP, near cap → DOWN, mid → HOLD', () => {
  assert.equal(paceSignal(50, 100).throttle, 'up');    // 50% < 70 → headroom
  assert.equal(paceSignal(95, 100).throttle, 'down');  // 95% > 90 → near ceiling
  assert.equal(paceSignal(80, 100).throttle, 'hold');  // 80% → on track
});

test('GREY: pctOfBudget + pace wire through aggregateRows per pool when budget set', () => {
  const rows = [row('claude-sonnet-4-6', { input: 30, output: 30 })]; // standard pool usage = 60
  const r = aggregateRows(rows, { now: NOW, budget: { opusWeeklyTokens: 1000, standardWeeklyTokens: 100 } });
  assert.equal(r.perPool.standard.pctOfBudget, 60);
  assert.equal(r.perPool.standard.pace.throttle, 'up'); // 60% < 70 → headroom → UP
});

test('GREY: POOLS constant + DEFAULT_BUDGET shape are the two-pool model', () => {
  assert.deepEqual(POOLS, ['opus', 'standard', 'other']);
  assert.ok('opusWeeklyTokens' in DEFAULT_BUDGET && 'standardWeeklyTokens' in DEFAULT_BUDGET);
  assert.ok(!('sonnetWeeklyTokens' in DEFAULT_BUDGET), 'sonnet folded into standard pool');
});
