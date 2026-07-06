// usage-governor — red/grey/green. The MAX 20× model (corrected 2026-06-23): ALL Anthropic models EXCEPT
// Sonnet share ONE 'main' pool (weekly + 5h limits); SONNET is the only excluded model → its own separate
// weekly; 'other' = non-Anthropic (not quota). USAGE-not-cost: tokens are the signal, NEVER dollars.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierOf, poolOf, weightedTokens, aggregateRows, paceSignal, DEFAULT_BUDGET, POOLS } from './usage-governor.mjs';

const NOW = Date.parse('2026-06-23T12:00:00Z');
const recent = (h) => NOW - h * 3600 * 1000;
const row = (model, o = {}) => ({ ts: recent(1), tier: tierOf(model), model, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, ...o });

// ── GREEN ───────────────────────────────────────────────────────────────────
test('GREEN: tierOf maps the real model strings', () => {
  assert.equal(tierOf('claude-opus-4-8'), 'opus');
  assert.equal(tierOf('claude-sonnet-4-6'), 'sonnet');
  assert.equal(tierOf('claude-haiku-4-5-20251001'), 'haiku');
  assert.equal(tierOf('glm-5.2'), 'other');
});

test('GREEN: poolOf — Opus+Haiku→main, Sonnet is the ONLY excluded model (own pool), GLM→other', () => {
  assert.equal(poolOf('opus'), 'main');
  assert.equal(poolOf('haiku'), 'main');
  assert.equal(poolOf('sonnet'), 'sonnet');
  assert.equal(poolOf('other'), 'other');
});

test('GREEN: weightedTokens — cache-read discounted 0.1×, rest 1:1 (no $)', () => {
  assert.equal(weightedTokens({ input: 100, output: 200, cacheCreate: 50, cacheRead: 1000 }), 100 + 200 + 50 + 100);
});

test('GREEN: aggregateRows — Opus+Haiku roll into main; Sonnet stands alone; no cost field', () => {
  const rows = [
    row('claude-opus-4-8', { input: 1000, output: 2000 }),
    row('claude-haiku-4-5', { input: 100, output: 100 }),
    row('claude-sonnet-4-6', { input: 500, output: 500 }),
    row('glm-5.2', { input: 9999, output: 9999 }),
  ];
  const r = aggregateRows(rows, { now: NOW, budget: DEFAULT_BUDGET });
  assert.equal(r.perPool.main.events, 2, 'opus + haiku in main');
  assert.equal(r.perPool.main.usage, 3200, '1000+2000 + 100+100');
  assert.equal(r.perPool.sonnet.events, 1, 'sonnet alone');
  assert.equal(r.perPool.sonnet.usage, 1000);
  assert.equal(r.perPool.other.events, 1, 'glm separate (not quota)');
  assert.ok(!('costUsd' in r.perPool.main) && !('cost' in r.perPool.main), 'NO dollar field');
});

// ── RED ─────────────────────────────────────────────────────────────────────
test('RED: out-of-window rows excluded', () => {
  const rows = [row('claude-opus-4-8', { input: 100 }), row('claude-opus-4-8', { ts: NOW - 8 * 86400 * 1000, input: 999999 })];
  const r = aggregateRows(rows, { now: NOW });
  assert.equal(r.perPool.main.events, 1);
  assert.equal(r.perPool.main.input, 100);
});

test('RED: no budget → throttle HOLD + calibrate hint', () => {
  const p = paceSignal(5_000_000, null);
  assert.equal(p.throttle, 'hold');
  assert.match(p.reason, /no budget|calibrate/);
});

// ── GREY ────────────────────────────────────────────────────────────────────
test('GREY: paceSignal — under cap → UP, near cap → DOWN, mid → HOLD', () => {
  assert.equal(paceSignal(50, 100).throttle, 'up');
  assert.equal(paceSignal(95, 100).throttle, 'down');
  assert.equal(paceSignal(80, 100).throttle, 'hold');
});

test('GREY: windowKind selects the right budget key (weekly vs 5h) for the main pool', () => {
  const rows = [row('claude-opus-4-8', { input: 30, output: 30 })]; // main usage = 60
  const wk = aggregateRows(rows, { now: NOW, windowKind: 'weekly', budget: { mainWeeklyTokens: 100, main5hTokens: 40 } });
  assert.equal(wk.perPool.main.budgetTokens, 100, 'weekly window → mainWeeklyTokens');
  assert.equal(wk.perPool.main.pctOfBudget, 60);
  const h5 = aggregateRows(rows, { now: NOW, windowKind: '5h', budget: { mainWeeklyTokens: 100, main5hTokens: 40 } });
  assert.equal(h5.perPool.main.budgetTokens, 40, '5h window → main5hTokens');
  assert.equal(h5.perPool.main.pace.throttle, 'down', '60/40 = 150% → near/over cap');
});

test('GREY: POOLS + DEFAULT_BUDGET are the corrected main/sonnet model with 5h keys', () => {
  assert.deepEqual(POOLS, ['main', 'sonnet', 'other']);
  for (const k of ['mainWeeklyTokens', 'main5hTokens', 'sonnetWeeklyTokens', 'sonnet5hTokens']) assert.ok(k in DEFAULT_BUDGET, k);
  assert.ok(!('opusWeeklyTokens' in DEFAULT_BUDGET) && !('standardWeeklyTokens' in DEFAULT_BUDGET));
});
