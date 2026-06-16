#!/usr/bin/env node
// @capability: observatory-timeframes
// @serves: timeframe ladder | candle granularity | multi-timeframe OHLCV | chart timeframe selector | aggregate candles | 5s 1m 1h 1d 1w view
// @does: Maps the Observatory's 16-preset timeframe ladder (5s,10s,30s,1m,5m,30m,1h,3h,5h,12h,1D,3D,1W,1M,1Q,1Y) onto the venues' native candle granularities + aggregates native candles up into the larger buckets. Returns canonical OHLCV with an honest `supported` flag per (venue,tf) — sub-minute is unsupported until a tick recorder exists; coinbase serves 1m→native and 3h+ via aggregation (capped by the 350-candle source limit); Polymarket reconstructs from trades at the bucket size. Pure aggregation (aggregateCandles) is exported + unit-tested; the one network-bound entry (getCandlesAtTimeframe) routes entirely through the adapters' injected httpGet.
// @use: Reach for this from the observatory server's /candles endpoint (or any chart) to fetch OHLCV at a chosen timeframe. Use availableTimeframes(venue) to drive a selector (disable unsupported tfs); aggregateCandles(bars, bucketSec) to roll fine candles into coarser ones anywhere.
// @exports: TIMEFRAMES, getTimeframe, availableTimeframes, aggregateCandles, getCandlesAtTimeframe

import { pathToFileURL } from 'node:url';
import * as Coinbase from '../adapters/coinbase-adapter.mjs';
import * as Polymarket from '../adapters/polymarket-adapter.mjs';

// ── Timeframe ladder (owner spec) ──────────────────────────────────────────
// sec   = bar interval in seconds
// src   = coinbase native granularity to fetch (null = needs sub-second tick recording, not yet available)
// agg   = how many src candles fold into one bar (1 = native)
// bars  = target number of bars to show
const G = {
  M1: 'ONE_MINUTE', M5: 'FIVE_MINUTE', M15: 'FIFTEEN_MINUTE', M30: 'THIRTY_MINUTE',
  H1: 'ONE_HOUR', H2: 'TWO_HOUR', H6: 'SIX_HOUR', D1: 'ONE_DAY',
};

export const TIMEFRAMES = [
  { id: '5s',  label: '5s',  sec: 5,        src: null, agg: 1, bars: 120 },
  { id: '10s', label: '10s', sec: 10,       src: null, agg: 1, bars: 120 },
  { id: '30s', label: '30s', sec: 30,       src: null, agg: 1, bars: 120 },
  { id: '1m',  label: '1m',  sec: 60,       src: G.M1,  agg: 1,  bars: 120 },
  { id: '5m',  label: '5m',  sec: 300,      src: G.M5,  agg: 1,  bars: 120 },
  { id: '30m', label: '30m', sec: 1800,     src: G.M30, agg: 1,  bars: 120 },
  { id: '1h',  label: '1h',  sec: 3600,     src: G.H1,  agg: 1,  bars: 120 },
  { id: '3h',  label: '3h',  sec: 10800,    src: G.H1,  agg: 3,  bars: 110 },
  { id: '5h',  label: '5h',  sec: 18000,    src: G.H1,  agg: 5,  bars: 70  },
  { id: '12h', label: '12h', sec: 43200,    src: G.H6,  agg: 2,  bars: 120 },
  { id: '1D',  label: '1D',  sec: 86400,    src: G.D1,  agg: 1,  bars: 200 },
  { id: '3D',  label: '3D',  sec: 259200,   src: G.D1,  agg: 3,  bars: 110 },
  { id: '1W',  label: '1W',  sec: 604800,   src: G.D1,  agg: 7,  bars: 50  },
  { id: '1M',  label: '1M',  sec: 2592000,  src: G.D1,  agg: 30, bars: 12  },
  { id: '1Q',  label: '1Q',  sec: 7776000,  src: G.D1,  agg: 90, bars: 6   },
  { id: '1Y',  label: '1Y',  sec: 31536000, src: G.D1,  agg: 365, bars: 5  },
];

const COINBASE_MAX_CANDLES = 350; // venue per-request cap

export function getTimeframe(id) {
  return TIMEFRAMES.find((t) => t.id === id) || null;
}

/**
 * availableTimeframes(venue) -> [{ id, label, supported, reason? }]
 * Drives the selector — disable unsupported (venue,tf) combos.
 */
export function availableTimeframes(venue = 'coinbase') {
  return TIMEFRAMES.map((t) => {
    let supported = true;
    let reason;
    if (t.src === null) { supported = false; reason = 'sub-minute needs tick recording (not yet available)'; }
    else if (t.agg * t.bars > COINBASE_MAX_CANDLES && venue === 'coinbase') {
      // Still supported, just fewer bars than ideal — flag the cap honestly.
      reason = `history capped at ${COINBASE_MAX_CANDLES} source candles`;
    }
    if (venue === 'polymarket' && t.sec < 60) { supported = false; reason = 'prediction-market trades are sparse below 1m'; }
    return { id: t.id, label: t.label, sec: t.sec, supported, ...(reason ? { reason } : {}) };
  });
}

/**
 * aggregateCandles(bars, bucketSec) -> coarser OHLCV bars (pure).
 * bars: ascending [{timestamp(sec),open,high,low,close,volume}]. Buckets by
 * floor(ts/bucketSec)*bucketSec; open=first, high=max, low=min, close=last, volume=sum.
 */
export function aggregateCandles(bars, bucketSec) {
  if (!Array.isArray(bars) || bars.length === 0 || !(bucketSec > 0)) return [];
  const buckets = new Map();
  const order = [];
  for (const b of bars) {
    if (!b || !Number.isFinite(b.timestamp)) continue;
    const key = Math.floor(b.timestamp / bucketSec) * bucketSec;
    let agg = buckets.get(key);
    if (!agg) {
      agg = { timestamp: key, open: b.open, high: b.high, low: b.low, close: b.close, volume: 0 };
      buckets.set(key, agg);
      order.push(key);
    }
    agg.high = Math.max(agg.high, b.high);
    agg.low = Math.min(agg.low, b.low);
    agg.close = b.close; // bars ascending → last wins
    agg.volume += Number.isFinite(b.volume) ? b.volume : 0;
  }
  return order.map((k) => buckets.get(k));
}

/**
 * getCandlesAtTimeframe(market, tfId, { venue }) ->
 *   Promise<{ market, venue, tf, sec, supported, candles, reason? }>
 * FAIL-OPEN: on any venue/mapping error returns supported:false with [] candles.
 */
export async function getCandlesAtTimeframe(market, tfId, opts = {}) {
  const venue = opts.venue || (String(market).startsWith('poly-') ? 'polymarket' : 'coinbase');
  const tf = getTimeframe(tfId);
  if (!tf) return { market, venue, tf: tfId, sec: null, supported: false, candles: [], reason: 'unknown timeframe' };

  // Sub-minute: not yet available (no tick recorder).
  if (tf.src === null && venue === 'coinbase') {
    return { market, venue, tf: tfId, sec: tf.sec, supported: false, candles: [], reason: 'sub-minute needs tick recording (not yet available)' };
  }

  const now = Math.floor(Date.now() / 1000);

  try {
    if (venue === 'polymarket') {
      if (tf.sec < 60) return { market, venue, tf: tfId, sec: tf.sec, supported: false, candles: [], reason: 'prediction-market trades sparse below 1m' };
      const tokenId = String(market).replace(/^poly-/, '');
      const windowSec = tf.sec * tf.bars;
      const res = await Polymarket.getTrades(tokenId, { limit: 1000, startTs: now - windowSec, endTs: now });
      const bars = (Polymarket.reconstructBars(res.trades, tf.sec * 1000) || [])
        .map((b) => ({ ...b, timestamp: b.timestamp > 1e11 ? Math.floor(b.timestamp / 1000) : b.timestamp }));
      const candles = tf.agg > 1 ? aggregateCandles(bars, tf.sec) : bars;
      return { market, venue, tf: tfId, sec: tf.sec, supported: true, candles };
    }

    // coinbase
    const srcSec = tf.sec / tf.agg;             // native bar interval
    const need = Math.min(tf.agg * tf.bars, COINBASE_MAX_CANDLES);
    const start = now - need * srcSec;
    const { candles: raw } = await Coinbase.getCandles(market, { start, end: now, granularity: tf.src, limit: COINBASE_MAX_CANDLES });
    const bars = (raw || [])
      .map((b) => ({ ...b, timestamp: b.timestamp > 1e11 ? Math.floor(b.timestamp / 1000) : b.timestamp }))
      .sort((a, b) => a.timestamp - b.timestamp);
    const candles = tf.agg > 1 ? aggregateCandles(bars, tf.sec) : bars;
    const capped = candles.length >= tf.bars && tf.agg * tf.bars > COINBASE_MAX_CANDLES;
    return { market, venue, tf: tfId, sec: tf.sec, supported: true, candles: candles.slice(-tf.bars), ...(capped ? { reason: 'history capped' } : {}) };
  } catch (e) {
    return { market, venue, tf: tfId, sec: tf.sec, supported: false, candles: [], reason: `fetch failed: ${e.message}` };
  }
}

// ── --test (deterministic, injected mock httpGet) ──────────────────────────
const _runAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_runAsMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, l) => { if (c) pass++; else { fail++; console.error('FAIL:', l); } };

  // aggregateCandles: 6 hourly bars → 3h buckets (agg 3) = 2 bars
  const hourly = Array.from({ length: 6 }, (_, i) => ({
    timestamp: i * 3600, open: 100 + i, high: 105 + i, low: 95 + i, close: 102 + i, volume: 10,
  }));
  const agg3 = aggregateCandles(hourly, 10800);
  ok(agg3.length === 2, `agg 6h→3h = 2 buckets (got ${agg3.length})`);
  ok(agg3[0].open === hourly[0].open, 'bucket open = first');
  ok(agg3[0].close === hourly[2].close, 'bucket close = last of bucket');
  ok(agg3[0].high === Math.max(...hourly.slice(0, 3).map((b) => b.high)), 'bucket high = max');
  ok(agg3[0].low === Math.min(...hourly.slice(0, 3).map((b) => b.low)), 'bucket low = min');
  ok(agg3[0].volume === 30, 'bucket volume = sum');
  ok(agg3[0].timestamp % 10800 === 0, 'bucket ts aligned');

  // availableTimeframes: sub-minute unsupported, 1h supported
  const av = availableTimeframes('coinbase');
  ok(av.length === 16, `16 timeframes (got ${av.length})`);
  ok(av.find((t) => t.id === '5s').supported === false, '5s unsupported (no tick recorder)');
  ok(av.find((t) => t.id === '1h').supported === true, '1h supported');
  ok(availableTimeframes('polymarket').find((t) => t.id === '30s').supported === false, 'poly 30s unsupported');

  // getCandlesAtTimeframe coinbase 1h via mock
  await (async () => {
    const base = 1_700_000_000;
    const mk = (n) => ({ candles: Array.from({ length: n }, (_, i) => ({
      start: String(base + i * 3600), open: '100', high: '110', low: '90', close: '105', volume: '5',
    })) });
    Coinbase.setHttpGet(async (url) => {
      if (url.includes('candles')) return { status: 200, headers: {}, body: JSON.stringify(mk(120)) };
      return { status: 200, headers: {}, body: '{}' };
    });
    const r = await getCandlesAtTimeframe('BTC-USD', '1h');
    ok(r.supported === true, '1h supported result');
    ok(Array.isArray(r.candles) && r.candles.length > 0, `1h returns candles (${r.candles.length})`);
    ok(r.candles.every((b) => Number.isFinite(b.timestamp) && b.timestamp < 1e11), 'candles ts in seconds');
    ok(r.candles.every((b, i, a) => i === 0 || b.timestamp > a[i - 1].timestamp), 'candles ascending');

    const r3 = await getCandlesAtTimeframe('BTC-USD', '3h');
    ok(r3.supported === true && r3.candles.length > 0, '3h aggregated returns candles');
    ok(r3.candles[0].timestamp % 10800 === 0, '3h bucket aligned');

    const rsub = await getCandlesAtTimeframe('BTC-USD', '5s');
    ok(rsub.supported === false && rsub.candles.length === 0, '5s unsupported, empty');
  })();

  console.log(`timeframes --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}
