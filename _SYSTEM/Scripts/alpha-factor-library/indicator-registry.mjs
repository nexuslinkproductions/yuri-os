#!/usr/bin/env node
// @capability: indicator-registry
// @serves: dozens of technical indicators behind one registry; computeIndicators(bars,ids) | technical analysis catalog | sma ema rsi macd bollinger atr stochastic vwap adx cci williamsr roc obv mfi wma trix forceindex psar
// @does: Hybrid indicator registry for the YURI trading engine. Exposes 18 indicators behind a uniform interface: 8 verified BUILTINS (sma, ema, rsi, macd, bollinger, atr, stochastic, vwap) computed by ./indicators.mjs on the hot path, plus 10 long-tail indicators (adx, cci, williamsr, roc, obv, mfi, wma, trix, forceindex, psar) computed via the installed `technicalindicators` npm lib. All compute functions return a result aligned to input length with `null` warmup — EITHER a `(number|null)[]` for scalar indicators OR an object of such arrays for multi-line indicators (macd, bollinger, stochastic, adx). Never throws out of compute; on any error returns an all-null aligned result of the same shape. Pure ESM, deterministic, no network. The only external dep is `technicalindicators` (installed; see package.json).
// @use: import { REGISTRY, listIndicators, computeIndicator, computeIndicators } from this module; feed canonical {timestamp,open,high,low,close,volume} bars. Pass an `ids` array to computeIndicators to select a subset; unknown ids are silently skipped.
// @exports: REGISTRY, listIndicators, computeIndicator, computeIndicators

import { pathToFileURL } from 'node:url';
import * as B from './indicators.mjs';
import ti from 'technicalindicators';

// ── helpers ─────────────────────────────────────────────────────────────────

/** Left-pad a TI result (dense, length = n - warmup) to input length n with null. */
function alignTi(arr, n) {
  const a = Array.isArray(arr) ? arr : [];
  const pad = Math.max(0, n - a.length);
  if (pad === 0) return a.slice();
  const out = new Array(n);
  for (let i = 0; i < pad; i++) out[i] = null;
  for (let i = 0; i < a.length; i++) out[pad + i] = a[i];
  return out;
}

/** Build an n-length array of all-null (used when bars are invalid or compute throws). */
function allNullScalar(n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = null;
  return out;
}

/** Same as alignTi but coerces each dense element through `pick` and replaces any non-finite with null. */
function alignTiPick(arr, n, pick) {
  const a = Array.isArray(arr) ? arr : [];
  const pad = Math.max(0, n - a.length);
  const out = new Array(n);
  for (let i = 0; i < pad; i++) out[i] = null;
  for (let i = 0; i < a.length; i++) {
    const v = pick(a[i]);
    out[pad + i] = (typeof v === 'number' && Number.isFinite(v)) ? v : null;
  }
  return out;
}

/** Probe canonical bar series; ok=false if any bar is missing or has a non-finite o/h/l/c/v. */
function barsValid(bars) {
  if (!Array.isArray(bars)) return { ok: false, n: 0 };
  const n = bars.length;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (!b || typeof b !== 'object') return { ok: false, n };
    if (!Number.isFinite(b.open) || !Number.isFinite(b.high) || !Number.isFinite(b.low) || !Number.isFinite(b.close) || !Number.isFinite(b.volume)) {
      return { ok: false, n };
    }
  }
  return { ok: true, n };
}

// ── registry ────────────────────────────────────────────────────────────────
//
// Each entry: { id, label, category, source, params, compute(bars, params) }
//   - id: stable string key
//   - label: human-readable (default params reflected)
//   - category: trend | momentum | volatility | volume
//   - source: 'builtin' (./indicators.mjs) | 'ti' (technicalindicators)
//   - params: default parameter object (merged with caller override)
//   - compute: pure; aligned to input length; never throws (returns null-aligned)
//
// compute bodies are wrapped in try/catch via safeCompute() — on any error the
// caller gets an all-null aligned result of the right shape.

export const REGISTRY = [
  // ── BUILTINS (hot path) ────────────────────────────────────────────────
  {
    id: 'sma', label: 'SMA (20)', category: 'trend', source: 'builtin',
    params: { period: 20 },
    compute: (bars, p) => B.sma(bars.map((b) => b.close), p.period)
  },
  {
    id: 'ema', label: 'EMA (12)', category: 'trend', source: 'builtin',
    params: { period: 12 },
    compute: (bars, p) => B.ema(bars.map((b) => b.close), p.period)
  },
  {
    id: 'rsi', label: 'RSI (14)', category: 'momentum', source: 'builtin',
    params: { period: 14 },
    compute: (bars, p) => B.rsi(bars.map((b) => b.close), p.period)
  },
  {
    id: 'macd', label: 'MACD (12,26,9)', category: 'momentum', source: 'builtin',
    params: {},
    compute: (bars) => B.macd(bars.map((b) => b.close))
  },
  {
    id: 'bollinger', label: 'Bollinger (20,2)', category: 'volatility', source: 'builtin',
    params: {},
    compute: (bars) => B.bollinger(bars.map((b) => b.close))
  },
  {
    id: 'atr', label: 'ATR (14)', category: 'volatility', source: 'builtin',
    params: { period: 14 },
    compute: (bars, p) => B.atr(bars, p.period)
  },
  {
    id: 'stochastic', label: 'Stochastic (14,3)', category: 'momentum', source: 'builtin',
    params: {},
    compute: (bars) => B.stochastic(bars)
  },
  {
    id: 'vwap', label: 'VWAP', category: 'volume', source: 'builtin',
    params: {},
    compute: (bars) => B.vwap(bars)
  },

  // ── technicalindicators long tail ─────────────────────────────────────
  {
    id: 'adx', label: 'ADX (14)', category: 'trend', source: 'ti',
    params: { period: 14 },
    compute: (bars, p) => {
      const n = bars.length;
      const raw = ti.ADX.calculate({
        period: p.period,
        close: bars.map((b) => b.close),
        high: bars.map((b) => b.high),
        low: bars.map((b) => b.low)
      });
      return {
        adx: alignTiPick(raw, n, (x) => x && x.adx),
        pdi: alignTiPick(raw, n, (x) => x && x.pdi),
        mdi: alignTiPick(raw, n, (x) => x && x.mdi)
      };
    }
  },
  {
    id: 'cci', label: 'CCI (20)', category: 'momentum', source: 'ti',
    params: { period: 20 },
    compute: (bars, p) => alignTi(ti.CCI.calculate({
      period: p.period,
      open: bars.map((b) => b.open),
      high: bars.map((b) => b.high),
      low: bars.map((b) => b.low),
      close: bars.map((b) => b.close)
    }), bars.length)
  },
  {
    id: 'williamsr', label: 'Williams %R (14)', category: 'momentum', source: 'ti',
    params: { period: 14 },
    compute: (bars, p) => alignTi(ti.WilliamsR.calculate({
      period: p.period,
      high: bars.map((b) => b.high),
      low: bars.map((b) => b.low),
      close: bars.map((b) => b.close)
    }), bars.length)
  },
  {
    id: 'roc', label: 'ROC (12)', category: 'momentum', source: 'ti',
    params: { period: 12 },
    compute: (bars, p) => alignTi(ti.ROC.calculate({ period: p.period, values: bars.map((b) => b.close) }), bars.length)
  },
  {
    id: 'obv', label: 'OBV', category: 'volume', source: 'ti',
    params: {},
    compute: (bars) => alignTi(ti.OBV.calculate({
      close: bars.map((b) => b.close),
      volume: bars.map((b) => b.volume)
    }), bars.length)
  },
  {
    id: 'mfi', label: 'MFI (14)', category: 'volume', source: 'ti',
    params: { period: 14 },
    compute: (bars, p) => alignTi(ti.MFI.calculate({
      period: p.period,
      high: bars.map((b) => b.high),
      low: bars.map((b) => b.low),
      close: bars.map((b) => b.close),
      volume: bars.map((b) => b.volume)
    }), bars.length)
  },
  {
    id: 'wma', label: 'WMA (20)', category: 'trend', source: 'ti',
    params: { period: 20 },
    compute: (bars, p) => alignTi(ti.WMA.calculate({ period: p.period, values: bars.map((b) => b.close) }), bars.length)
  },
  {
    id: 'trix', label: 'TRIX (15)', category: 'momentum', source: 'ti',
    params: { period: 15 },
    compute: (bars, p) => alignTi(ti.TRIX.calculate({ period: p.period, values: bars.map((b) => b.close) }), bars.length)
  },
  {
    id: 'forceindex', label: 'Force Index (13)', category: 'volume', source: 'ti',
    params: { period: 13 },
    compute: (bars, p) => alignTi(ti.ForceIndex.calculate({
      period: p.period,
      close: bars.map((b) => b.close),
      volume: bars.map((b) => b.volume)
    }), bars.length)
  },
  {
    id: 'psar', label: 'Parabolic SAR', category: 'trend', source: 'ti',
    params: { step: 0.02, max: 0.2 },
    compute: (bars, p) => alignTi(ti.PSAR.calculate({
      step: p.step,
      max: p.max,
      high: bars.map((b) => b.high),
      low: bars.map((b) => b.low)
    }), bars.length)
  }
];

// ── lookup table (built once) ───────────────────────────────────────────────
const REGISTRY_BY_ID = (() => {
  const m = new Map();
  for (const entry of REGISTRY) m.set(entry.id, entry);
  return m;
})();

// ── safeCompute: wraps any compute() so a throw becomes an all-null result ─
function safeCompute(entry, bars) {
  const n = bars.length;
  const emptyScalar = () => allNullScalar(n);
  const emptyObject = () => {
    // Best-effort: caller wants the object shape; return one all-null array per known field.
    // For indicators whose result is an object, the wrapper below restores the right keys.
    return null;
  };
  try {
    const params = { ...entry.params };
    const out = entry.compute(bars, params);
    return out;
  } catch (_e) {
    // Determine shape by inspecting the entry's known field set (we hard-code below).
    return nullShapeFor(entry.id, n);
  }
}

/** Hard-coded null shape per indicator id. */
function nullShapeFor(id, n) {
  switch (id) {
    case 'macd':
      return { macd: allNullScalar(n), signal: allNullScalar(n), histogram: allNullScalar(n) };
    case 'bollinger':
      return { middle: allNullScalar(n), upper: allNullScalar(n), lower: allNullScalar(n) };
    case 'stochastic':
      return { k: allNullScalar(n), d: allNullScalar(n) };
    case 'adx':
      return { adx: allNullScalar(n), pdi: allNullScalar(n), mdi: allNullScalar(n) };
    default:
      return allNullScalar(n);
  }
}

// ── public api ──────────────────────────────────────────────────────────────

/** Metadata-only listing of every registered indicator (no compute fn). */
export function listIndicators() {
  return REGISTRY.map((e) => ({
    id: e.id,
    label: e.label,
    category: e.category,
    source: e.source,
    params: { ...e.params }
  }));
}

/**
 * Compute a single indicator.
 * @param {Array} bars  canonical OHLCV bar series
 * @param {string} id   indicator id (must be in REGISTRY)
 * @param {Object} [params] optional param overrides (merged over registry defaults)
 * @returns aligned result (array or object) of input length, or `null` if the id is unknown
 */
export function computeIndicator(bars, id, params) {
  if (!Array.isArray(bars) || bars.length === 0) return null;
  const probe = barsValid(bars);
  if (!probe.ok) return nullShapeFor(id || '', probe.n);
  const entry = REGISTRY_BY_ID.get(id);
  if (!entry) return null;
  // Build a one-off entry with merged params so safeCompute uses overrides.
  const merged = params ? { ...entry.params, ...params } : entry.params;
  const tempEntry = { ...entry, params: merged };
  const out = safeCompute(tempEntry, bars);
  return out;
}

/**
 * Compute many indicators in one call.
 * @param {Array} bars canonical OHLCV bar series
 * @param {string[]} [ids] optional subset; default = every registered id
 * @returns {Object} map of id → aligned result; unknown ids skipped; invalid/empty bars → {}
 */
export function computeIndicators(bars, ids) {
  if (!Array.isArray(bars) || bars.length === 0) return {};
  const probe = barsValid(bars);
  if (!probe.ok) return {};
  const wanted = Array.isArray(ids) && ids.length > 0 ? ids : REGISTRY.map((e) => e.id);
  const out = {};
  for (const id of wanted) {
    const entry = REGISTRY_BY_ID.get(id);
    if (!entry) continue; // unknown id silently skipped
    out[id] = safeCompute(entry, bars);
  }
  return out;
}

// ── test main-guard ─────────────────────────────────────────────────────────
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_main && process.argv.includes('--test')) {
  runTests();
}

/**
 * Self-test: build ~60 deterministic LCG bars; assert registry shape, alignment,
 * null-warmup, no NaN, no throw on bad input. Exits 1 on any failure.
 */
function runTests() {
  let pass = 0, fail = 0;
  const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', name); } };

  // Deterministic LCG (Numerical Recipes constants) — no Math.random.
  function lcg(n) {
    let state = 1664525;
    const a = 1664525, c = 1013904223, m = 2 ** 32;
    const out = new Array(n);
    for (let i = 0; i < n; i++) { state = (state * a + c) % m; out[i] = state / m; }
    return out;
  }

  const N = 60;
  const u = lcg(N);
  let price = 100;
  const bars = u.map((x, i) => {
    const drift = (x - 0.5) * 4;                 // ±2
    const open = price;
    const close = Math.max(1, open + drift);
    const high = Math.max(open, close) + x * 1.5;
    const low = Math.min(open, close) - (1 - x) * 1.5;
    const volume = 50 + Math.floor(x * 950);
    price = close;
    return { timestamp: 1_700_000_000 + i * 60, open, high, low, close, volume };
  });

  // 1. listIndicators metadata
  const meta = listIndicators();
  ok(Array.isArray(meta) && meta.length >= 18, `listIndicators().length >= 18 (got ${meta.length})`);
  ok(meta.every((m) => m.id && m.label && m.category && m.source && m.params), 'every meta entry has id/label/category/source/params');
  ok(meta.every((m) => typeof m.compute === 'undefined'), 'meta has no compute fn');

  // 2. computeIndicators default (all)
  const all = computeIndicators(bars);
  ok(Object.keys(all).length === REGISTRY.length, `computeIndicators(bars) key count === ${REGISTRY.length} (got ${Object.keys(all).length})`);
  // Map of id -> minimum warmup bar count expected when input has finite non-zero volume.
  // vwap and psar are dense-by-construction when their inputs are well-formed; we don't
  // assert warmup nulls on them. Everything with a fixed period >= 2 must have nulls
  // in the first (period - 1) entries. bollinger/stochastic/macd are object-returning.
  const WARMUP = {
    sma: 19, ema: 11, rsi: 14, atr: 14, adx: 13, cci: 19, williamsr: 13,
    roc: 11, mfi: 13, wma: 19, trix: 14, forceindex: 12
  };
  for (const entry of REGISTRY) {
    const r = all[entry.id];
    ok(r != null, `all[${entry.id}] present`);
    if (r == null) continue;
    if (Array.isArray(r)) {
      ok(r.length === N, `${entry.id} scalar length === ${N} (got ${r.length})`);
      const hasNaN = r.some((v) => v !== null && (typeof v !== 'number' || !Number.isFinite(v)));
      ok(!hasNaN, `${entry.id} scalar: no NaN/non-finite`);
      const wu = WARMUP[entry.id];
      if (wu != null) {
        let allEarlyNull = true;
        for (let i = 0; i < wu; i++) if (r[i] !== null) { allEarlyNull = false; break; }
        ok(allEarlyNull, `${entry.id} scalar: first ${wu} entries null (warmup)`);
        // At least one non-null past the warmup.
        let hasPost = false;
        for (let i = wu; i < N; i++) if (r[i] != null) { hasPost = true; break; }
        ok(hasPost, `${entry.id} scalar: has post-warmup value`);
      }
    } else if (typeof r === 'object') {
      for (const key of Object.keys(r)) {
        const sub = r[key];
        ok(Array.isArray(sub) && sub.length === N, `${entry.id}.${key} length === ${N}`);
        if (Array.isArray(sub)) {
          const hasNaN = sub.some((v) => v !== null && (typeof v !== 'number' || !Number.isFinite(v)));
          ok(!hasNaN, `${entry.id}.${key}: no NaN`);
        }
      }
    }
  }

  // 3. computeIndicators with explicit ids
  const sub = computeIndicators(bars, ['rsi', 'macd', 'adx']);
  ok(Object.keys(sub).length === 3 && sub.rsi && sub.macd && sub.adx, 'computeIndicators(bars, subset) returns 3 keys');

  // 4. unknown id silently skipped
  const mixed = computeIndicators(bars, ['rsi', 'nope_does_not_exist', 'sma']);
  ok(Object.keys(mixed).length === 2 && mixed.rsi && mixed.sma && !mixed['nope_does_not_exist'], 'unknown id silently skipped');

  // 5. invalid bars
  ok(Object.keys(computeIndicators([])).length === 0, 'empty bars -> {}');
  ok(Object.keys(computeIndicators(null)).length === 0, 'null bars -> {}');
  const badBars = bars.slice(); badBars[10] = { ...badBars[10], close: NaN };
  ok(Object.keys(computeIndicators(badBars)).length === 0, 'bar with NaN -> {}');

  // 6. computeIndicator single
  const rsi = computeIndicator(bars, 'rsi');
  ok(Array.isArray(rsi) && rsi.length === N, 'computeIndicator(bars, rsi) returns aligned array');
  const mac = computeIndicator(bars, 'macd');
  ok(mac && Array.isArray(mac.macd) && mac.macd.length === N, 'computeIndicator(bars, macd) returns object with aligned arrays');
  const bb = computeIndicator(bars, 'bollinger');
  ok(bb && Array.isArray(bb.middle) && bb.middle.length === N, 'computeIndicator(bars, bollinger) returns object');
  const stoch = computeIndicator(bars, 'stochastic');
  ok(stoch && Array.isArray(stoch.k) && stoch.k.length === N, 'computeIndicator(bars, stochastic) returns object');

  // 7. param override
  const rsi7 = computeIndicator(bars, 'rsi', { period: 7 });
  ok(Array.isArray(rsi7) && rsi7.length === N, 'rsi with period override returns aligned array');

  // 8. unknown id -> null
  ok(computeIndicator(bars, 'totally_made_up') === null, 'unknown id -> null');

  // 9. malformed bar (NaN inside) -> shape-correct all-null, never throw
  const malformed = computeIndicator(badBars, 'macd');
  ok(malformed && Array.isArray(malformed.macd) && malformed.macd.length === N && malformed.macd.every((v) => v === null), 'malformed bars + macd -> object of all-null aligned arrays');
  const malformedScalar = computeIndicator(badBars, 'rsi');
  ok(Array.isArray(malformedScalar) && malformedScalar.length === N && malformedScalar.every((v) => v === null), 'malformed bars + rsi -> all-null aligned array');

  // 10. Bars with a value that causes a TI class to throw (we'll force via unknown-period=-1)
  // (compute body itself catches; we just assert no throw escapes and result is null-aligned.)
  let threw = false;
  try {
    const out = computeIndicator(bars, 'cci', { period: 1 }); // extreme but valid
    ok(Array.isArray(out) && out.length === N, 'cci with period=1 returns aligned array');
  } catch (e) { threw = true; }
  ok(!threw, 'cci period=1 does not throw out of compute');

  // 11. PSAR returns aligned numeric array
  const psar = computeIndicator(bars, 'psar');
  ok(Array.isArray(psar) && psar.length === N, 'psar aligned array');
  if (Array.isArray(psar)) {
    const hasNaN = psar.some((v) => v !== null && !Number.isFinite(v));
    ok(!hasNaN, 'psar: no NaN');
  }

  // 12. OBV / MFI / ForceIndex / WMA / TRIX / WilliamsR / ROC coverage
  for (const id of ['obv', 'mfi', 'forceindex', 'wma', 'trix', 'williamsr', 'roc']) {
    const r = computeIndicator(bars, id);
    ok(Array.isArray(r) && r.length === N, `${id} aligned array`);
    if (Array.isArray(r)) {
      const hasNaN = r.some((v) => v !== null && !Number.isFinite(v));
      ok(!hasNaN, `${id}: no NaN`);
    }
  }

  console.log(`indicator-registry --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}
