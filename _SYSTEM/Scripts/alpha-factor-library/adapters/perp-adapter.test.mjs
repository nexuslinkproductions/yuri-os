#!/usr/bin/env node
/**
 * Tests for perp-adapter.mjs — Binance USDⓈ-M futures candle (kline) fetch.
 *
 * Coverage (Phase 1 of the Binance training-data swap):
 *   1. mapKline — Binance kline array → unified candle shape, ms→unix-sec conversion
 *   2. mapKline — fail-closed on malformed / non-finite input
 *   3. getCandles — fetch + map, chronological order preserved (no reverse), URL build
 *   4. getCandles — defaults (interval=1m, limit=300) + limit clamp to 1500
 *   5. getCandles — fail-closed on missing symbol + venue error body
 *
 * Each test that needs the network injects its own httpGet mock (setHttpGet rejects
 * non-functions by contract, so there is no null-reset; tests are self-contained).
 *
 * Run: node --test _SYSTEM/Scripts/alpha-factor-library/adapters/perp-adapter.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getCandles, mapKline, setHttpGet, MappingError } from './perp-adapter.mjs';

// Binance USDⓈ-M kline array: [openTime(ms), o, h, l, c, v, closeTime, quoteVol, trades, takerBuyBase, takerBuyQuote, ignore]
const KLINES = [
  [1700000000000, '42000.0', '42100.0', '41900.0', '42050.0', '123.45', 1700000059999, '5187000', 100, '60', '2520000', '0'],
  [1700000060000, '42050.0', '42200.0', '42000.0', '42180.0', '98.76', 1700000119999, '4160000', 90, '50', '2100000', '0'],
];

test('mapKline maps a Binance kline array to the unified candle shape (ms→unix-sec)', () => {
  const c = mapKline(KLINES[0]);
  assert.equal(c.timestamp, 1700000000); // 1700000000000 ms → unix-seconds
  assert.equal(c.open, 42000);
  assert.equal(c.high, 42100);
  assert.equal(c.low, 41900);
  assert.equal(c.close, 42050);
  assert.equal(c.volume, 123.45);
});

test('mapKline fails closed on malformed / non-finite input', () => {
  assert.throws(() => mapKline(null), MappingError);
  assert.throws(() => mapKline([1, 2, 3]), MappingError);                    // too short
  assert.throws(() => mapKline(['x', '1', '1', '1', '1', '1']), MappingError); // non-finite openTime
});

test('getCandles fetches + maps klines, preserves ascending order, builds correct URL', async () => {
  let seenUrl = null;
  setHttpGet(async (url) => {
    seenUrl = url;
    return { status: 200, headers: {}, body: JSON.stringify(KLINES) };
  });
  const { candles } = await getCandles('BTCUSDT', { interval: '1m', limit: 2 });
  assert.equal(candles.length, 2);
  assert.equal(candles[0].timestamp, 1700000000); // oldest-first preserved (Binance is ascending — no reverse)
  assert.equal(candles[1].timestamp, 1700000060);
  assert.ok(candles[0].timestamp < candles[1].timestamp, 'chronological ascending');
  assert.equal(candles[1].close, 42180);
  assert.match(seenUrl, /fapi\.binance\.com\/fapi\/v1\/klines/);
  assert.match(seenUrl, /symbol=BTCUSDT/);
  assert.match(seenUrl, /interval=1m/);
  assert.match(seenUrl, /limit=2/);
});

test('getCandles defaults interval=1m + limit=300 and clamps limit to Binance max 1500', async () => {
  let seenUrl = null;
  setHttpGet(async (url) => { seenUrl = url; return { status: 200, headers: {}, body: '[]' }; });
  await getCandles('BTCUSDT');
  assert.match(seenUrl, /interval=1m/);
  assert.match(seenUrl, /limit=300/);
  await getCandles('BTCUSDT', { limit: 99999 });
  assert.match(seenUrl, /limit=1500/);
});

test('getCandles fails closed on missing symbol + venue error body', async () => {
  await assert.rejects(() => getCandles(), MappingError); // no symbol
  setHttpGet(async () => ({ status: 200, headers: {}, body: '{"code":-1121,"msg":"Invalid symbol."}' }));
  await assert.rejects(() => getCandles('NOPE')); // Binance 200-with-error-payload → surfaced as a throw
});
