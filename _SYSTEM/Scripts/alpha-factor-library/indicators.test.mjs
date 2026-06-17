#!/usr/bin/env node
// _SYSTEM/Scripts/alpha-factor-library/indicators.test.mjs
// GREEN / RED / GREY differential test for indicators.mjs
// Run: node _SYSTEM/Scripts/alpha-factor-library/indicators.test.mjs
//
// PROVENANCE: authored by the kimi-k2.7-code nano-swarm peer (W5.1, 2026-06-16); persisted +
// adversarially cleaned by the main session (fixed a missing-brace bug in close() where
// console.error ran unconditionally). The lane produced the artifact but couldn't write it to
// disk (llm-lane build-nudge bug, fixed v2) — so the main session persisted kimi's work.

import * as prod from './indicators.mjs';

let pass = 0;
let fail = 0;
const EPS = 1e-9;

function ok(cond, label) {
  if (cond) pass++;
  else { fail++; console.error('FAIL', label); }
}

function close(a, b, label) {
  if (a === null && b === null) { pass++; return; }
  if (a === null || b === null) {
    fail++; console.error('FAIL', label, `null mismatch a=${a} b=${b}`);
    return;
  }
  if (Math.abs(a - b) <= EPS) { pass++; }
  else { fail++; console.error('FAIL', label, `|${a}-${b}|=${Math.abs(a - b)} > ${EPS}`); }
}

function arrayClose(a, b, label) {
  ok(Array.isArray(a) && Array.isArray(b) && a.length === b.length, `${label} length`);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) close(a[i], b[i], `${label}[${i}]`);
}

function objClose(a, b, keys, label) {
  for (const k of keys) arrayClose(a[k], b[k], `${label}.${k}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// GREEN — hand-computed fixtures (not echoes of the implementation)
// ═══════════════════════════════════════════════════════════════════════════

// SMA: [1,2,3,4,5], period 3
{
  const v = [1, 2, 3, 4, 5];
  const out = prod.sma(v, 3);
  ok(out.length === 5, 'GREEN sma length');
  ok(out[0] === null && out[1] === null, 'GREEN sma warmup null');
  close(out[2], 2, 'GREEN sma[2]=(1+2+3)/3');
  close(out[3], 3, 'GREEN sma[3]=(2+3+4)/3');
  close(out[4], 4, 'GREEN sma[4]=(3+4+5)/3');
}

// EMA: [1,2,3,4,5], period 3, k=0.5, seed SMA=2
{
  const v = [1, 2, 3, 4, 5];
  const out = prod.ema(v, 3);
  ok(out.length === 5, 'GREEN ema length');
  ok(out[0] === null && out[1] === null, 'GREEN ema warmup null');
  close(out[2], 2, 'GREEN ema[2] seed');
  close(out[3], 3, 'GREEN ema[3]=(4-2)*0.5+2');
  close(out[4], 4, 'GREEN ema[4]=(5-3)*0.5+3');
}

// RSI: monotonic up 16 bars, period 14 -> all gains, no losses -> 100
{
  const v = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
  const out = prod.rsi(v, 14);
  ok(out.length === 16, 'GREEN rsi length');
  for (let i = 0; i < 14; i++) ok(out[i] === null, `GREEN rsi warmup[${i}]`);
  close(out[14], 100, 'GREEN rsi[14]=100');
  close(out[15], 100, 'GREEN rsi[15]=100');
}

// MACD: linear 50-bar series slope 0.5, fast=12 slow=26 signal=9
{
  const v = [];
  for (let i = 0; i < 50; i++) v.push(100 + i * 0.5);
  const { macd: m, signal: s, histogram: h } = prod.macd(v, 12, 26, 9);
  ok(m.length === 50 && s.length === 50 && h.length === 50, 'GREEN macd lengths');
  for (let i = 0; i < 25; i++) ok(m[i] === null, `GREEN macd warmup[${i}]`);
  for (let i = 0; i < 33; i++) ok(s[i] === null, `GREEN signal warmup[${i}]`);
  for (let i = 0; i < 33; i++) ok(h[i] === null, `GREEN hist warmup[${i}]`);
  close(m[25], 3.5, 'GREEN macd[25] linear');
  close(s[33], 3.5, 'GREEN signal[33] linear');
  close(h[33], 0, 'GREEN hist[33] linear');
  close(h[49], 0, 'GREEN hist[49]->0');
  close(m[49], s[49], 'GREEN macd[49]==signal[49]');
}

// Bollinger: [1,2,3,4,5], period 5, mult 2, population stddev
{
  const v = [1, 2, 3, 4, 5];
  const { middle, upper, lower } = prod.bollinger(v, 5, 2);
  ok(middle.length === 5, 'GREEN bollinger length');
  for (let i = 0; i < 4; i++) ok(middle[i] === null, `GREEN bollinger warmup[${i}]`);
  close(middle[4], 3, 'GREEN bollinger middle[4]');
  close(upper[4], 3 + 2 * Math.sqrt(2), 'GREEN bollinger upper[4]');
  close(lower[4], 3 - 2 * Math.sqrt(2), 'GREEN bollinger lower[4]');
}

// ATR: 5 toy bars, period 3, all true ranges = 2
{
  const bars = [
    { timestamp: 0, open: 9,  high: 10, low: 8,  close: 9,  volume: 1 },
    { timestamp: 1, open: 10, high: 11, low: 9,  close: 10, volume: 1 },
    { timestamp: 2, open: 11, high: 12, low: 10, close: 11, volume: 1 },
    { timestamp: 3, open: 12, high: 13, low: 11, close: 12, volume: 1 },
    { timestamp: 4, open: 13, high: 14, low: 12, close: 13, volume: 1 },
  ];
  const out = prod.atr(bars, 3);
  ok(out.length === 5, 'GREEN atr length');
  for (let i = 0; i < 3; i++) ok(out[i] === null, `GREEN atr warmup[${i}]`);
  close(out[3], 2, 'GREEN atr[3]');
  close(out[4], 2, 'GREEN atr[4]');
}

// Stochastic: 4 bars, kPeriod=2, dPeriod=2
{
  const bars = [
    { timestamp: 0, open: 8.5, high: 10, low: 8,  close: 9,  volume: 1 },
    { timestamp: 1, open: 9.5, high: 11, low: 9,  close: 10, volume: 1 },
    { timestamp: 2, open: 10.5, high: 12, low: 10, close: 11, volume: 1 },
    { timestamp: 3, open: 11.5, high: 13, low: 11, close: 12, volume: 1 },
  ];
  const { k, d } = prod.stochastic(bars, 2, 2);
  ok(k.length === 4 && d.length === 4, 'GREEN stoch length');
  ok(k[0] === null, 'GREEN stoch k[0] null');
  ok(d[0] === null && d[1] === null, 'GREEN stoch d warmup');
  close(k[1], 200 / 3, 'GREEN stoch k[1]');
  close(k[2], 200 / 3, 'GREEN stoch k[2]');
  close(k[3], 200 / 3, 'GREEN stoch k[3]');
  close(d[2], 200 / 3, 'GREEN stoch d[2]');
  close(d[3], 200 / 3, 'GREEN stoch d[3]');
}

// VWAP: 5 toy bars with unit volume
{
  const bars = [
    { timestamp: 0, open: 9,  high: 10, low: 8,  close: 9,  volume: 1 },
    { timestamp: 1, open: 10, high: 11, low: 9,  close: 10, volume: 1 },
    { timestamp: 2, open: 11, high: 12, low: 10, close: 11, volume: 1 },
    { timestamp: 3, open: 12, high: 13, low: 11, close: 12, volume: 1 },
    { timestamp: 4, open: 13, high: 14, low: 12, close: 13, volume: 1 },
  ];
  const out = prod.vwap(bars);
  ok(out.length === 5, 'GREEN vwap length');
  close(out[0], 9,   'GREEN vwap[0]');
  close(out[1], 9.5, 'GREEN vwap[1]');
  close(out[2], 10,  'GREEN vwap[2]');
  close(out[3], 10.5,'GREEN vwap[3]');
  close(out[4], 11,  'GREEN vwap[4]');
}

// computeAll smoke
{
  const bars = [];
  for (let i = 0; i < 50; i++) {
    bars.push({ timestamp: 1700000000 + i * 60, open: 99, high: 101, low: 99, close: 100, volume: 1000 });
  }
  const all = prod.computeAll(bars);
  ok(all && typeof all.latest === 'object', 'GREEN computeAll object');
  ok(all.latest.rsi !== undefined, 'GREEN computeAll has rsi');
}

// ═══════════════════════════════════════════════════════════════════════════
// RED — mutants / edge cases
// ═══════════════════════════════════════════════════════════════════════════

// Empty inputs
{
  ok(prod.sma([], 3).length === 0, 'RED sma empty');
  ok(prod.ema([], 3).length === 0, 'RED ema empty');
  ok(prod.rsi([], 14).length === 0, 'RED rsi empty');
  const m = prod.macd([], 12, 26, 9);
  ok(m.macd.length === 0 && m.signal.length === 0 && m.histogram.length === 0, 'RED macd empty');
  const b = prod.bollinger([], 20, 2);
  ok(b.middle.length === 0, 'RED bollinger empty');
  ok(prod.atr([], 14).length === 0, 'RED atr empty');
  const st = prod.stochastic([], 14, 3);
  ok(st.k.length === 0, 'RED stoch empty');
  ok(prod.vwap([]).length === 0, 'RED vwap empty');
}

// Correct null-warmup lengths
{
  const v = [];
  for (let i = 0; i < 50; i++) v.push(100 + i * 0.1);
  const p = 10;
  const s = prod.sma(v, p);
  const e = prod.ema(v, p);
  const r = prod.rsi(v, p);
  for (let i = 0; i < p - 1; i++) ok(s[i] === null, `RED sma warmup[${i}]`);
  for (let i = p - 1; i < 50; i++) ok(s[i] !== null, `RED sma live[${i}]`);
  for (let i = 0; i < p - 1; i++) ok(e[i] === null, `RED ema warmup[${i}]`);
  for (let i = 0; i < p; i++) ok(r[i] === null, `RED rsi warmup[${i}]`);
  const bars = [];
  for (let i = 0; i < 50; i++) bars.push({ timestamp: i, open: 99, high: 101, low: 99, close: 100, volume: 1000 });
  const a = prod.atr(bars, p);
  for (let i = 0; i < p; i++) ok(a[i] === null, `RED atr warmup[${i}]`);
  const st = prod.stochastic(bars, p, 3);
  for (let i = 0; i < p - 1; i++) ok(st.k[i] === null, `RED stoch k warmup[${i}]`);
  for (let i = 0; i < p + 1; i++) ok(st.d[i] === null, `RED stoch d warmup[${i}]`);
}

// period > length -> all null
{
  const v = [1, 2, 3];
  ok(prod.sma(v, 5).every(x => x === null), 'RED sma period>length');
  ok(prod.ema(v, 5).every(x => x === null), 'RED ema period>length');
  ok(prod.rsi(v, 5).every(x => x === null), 'RED rsi period>length');
  ok(prod.bollinger(v, 5, 2).middle.every(x => x === null), 'RED bollinger period>length');
  const bars = [{ timestamp: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 }];
  ok(prod.atr(bars, 2).every(x => x === null), 'RED atr period>=length');
  ok(prod.stochastic(bars, 2, 2).k.every(x => x === null), 'RED stoch period>length');
}

// NaN input -> all null, never NaN output
{
  const v = [1, 2, NaN, 4, 5];
  ok(prod.sma(v, 3).every(x => x === null), 'RED sma NaN');
  ok(prod.ema(v, 3).every(x => x === null), 'RED ema NaN');
  ok(prod.rsi(v, 14).every(x => x === null), 'RED rsi NaN');
  const bars = [
    { timestamp: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 },
    { timestamp: 1, open: 2, high: 2, low: 1, close: 2, volume: 1 },
    { timestamp: 2, open: 2, high: 3, low: 2, close: NaN, volume: 1 },
  ];
  ok(prod.atr(bars, 2).every(x => x === null), 'RED atr NaN');
  ok(prod.stochastic(bars, 2, 2).k.every(x => x === null), 'RED stoch NaN');
  ok(prod.vwap(bars).every(x => x === null), 'RED vwap NaN');
}

// All-equal closes -> RSI not NaN (50), Bollinger bands collapse
{
  const v = new Array(30).fill(100);
  const r = prod.rsi(v, 14);
  ok(r.slice(14).every(x => x === 50), 'RED rsi all-equal=50');
  ok(!r.some(x => Number.isNaN(x)), 'RED rsi all-equal no NaN');
  const b = prod.bollinger(v, 20, 2);
  ok(b.middle.slice(19).every(x => x === 100), 'RED bollinger all-equal middle');
  ok(b.upper.slice(19).every(x => x === 100), 'RED bollinger all-equal upper');
  ok(b.lower.slice(19).every(x => x === 100), 'RED bollinger all-equal lower');
}

// Single bar
{
  const v = [100];
  ok(prod.sma(v, 3).length === 1 && prod.sma(v, 3)[0] === null, 'RED sma single');
  ok(prod.ema(v, 3).length === 1 && prod.ema(v, 3)[0] === null, 'RED ema single');
  ok(prod.rsi(v, 14).length === 1 && prod.rsi(v, 14)[0] === null, 'RED rsi single');
  const bars = [{ timestamp: 0, open: 100, high: 101, low: 99, close: 100, volume: 1000 }];
  ok(prod.atr(bars, 14).length === 1 && prod.atr(bars, 14)[0] === null, 'RED atr single');
  ok(prod.vwap(bars).length === 1 && prod.vwap(bars)[0] === 100, 'RED vwap single');
}

// ═══════════════════════════════════════════════════════════════════════════
// GREY — differential oracle vs indicators-reference.mjs
// ═══════════════════════════════════════════════════════════════════════════

let ref = null;
let differentialActive = false;
try {
  ref = await import('./indicators-reference.mjs');
  differentialActive = true;
} catch (e) {
  console.log('reference not present — differential skipped');
}

if (differentialActive && ref) {
  // Deterministic LCG — Math.random is banned
  let s = 12345;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  const bars = [];
  let close = 100;
  for (let i = 0; i < 200; i++) {
    close += (rnd() - 0.5) * 0.2;
    const halfRange = 0.2 + rnd() * 0.3;
    const high = close + halfRange;
    const low = close - halfRange;
    const open = low + rnd() * (high - low);
    const volume = 1000 + rnd() * 1000;
    bars.push({ timestamp: 1700000000 + i * 60, open, high, low, close, volume });
  }
  const closes = bars.map(b => b.close);

  arrayClose(prod.sma(closes, 14), ref.sma(closes, 14), 'GREY sma(14)');
  arrayClose(prod.ema(closes, 14), ref.ema(closes, 14), 'GREY ema(14)');
  arrayClose(prod.rsi(closes, 14), ref.rsi(closes, 14), 'GREY rsi(14)');

  const pBb = prod.bollinger(closes, 20, 2);
  const rBb = ref.bollinger(closes, 20, 2);
  objClose(pBb, rBb, ['middle', 'upper', 'lower'], 'GREY bollinger');

  const pMacd = prod.macd(closes, 12, 26, 9);
  const rMacd = ref.macd(closes, 12, 26, 9);
  objClose(pMacd, rMacd, ['macd', 'signal', 'histogram'], 'GREY macd');

  arrayClose(prod.atr(bars, 14), ref.atr(bars, 14), 'GREY atr(14)');

  const pStoch = prod.stochastic(bars, 14, 3);
  const rStoch = ref.stochastic(bars, 14, 3);
  objClose(pStoch, rStoch, ['k', 'd'], 'GREY stochastic');

  arrayClose(prod.vwap(bars), ref.vwap(bars), 'GREY vwap');
}

// ═══════════════════════════════════════════════════════════════════════════
// Report
// ═══════════════════════════════════════════════════════════════════════════

console.log(`indicators.test: ${pass} pass, ${fail} fail`);
if (!differentialActive) {
  console.log('differential oracle: SKIPPED (indicators-reference.mjs not present)');
} else {
  console.log('differential oracle: ACTIVE');
}
process.exit(fail > 0 ? 1 : 0);
