#!/usr/bin/env node
// @capability: data-quality-gate
// @serves: data quality | OHLCV validation | bad tick | outlier | look-ahead | data poisoning | ingest gate
// @does: AFL ingest gate (FM-3 fix) — hard-rejects malformed OHLCV bars (deterministic), detects non-monotone timestamps across a series, and flags statistical bad-tick outliers via a scalar Kalman NIS chi-sq(1) gate over the close stream — BEFORE any factor computation, so one corrupted bar can't silently poison every downstream factor.
// @use: call dataQualityGate(bars) on a freshly-ingested OHLCV series before running the factor evaluator / factor circuit; PASS only when there are zero hard-rejects and zero non-monotone timestamps (flags are advisory). Reach here instead of trusting raw vendor/exchange bars.
// @exports: validateBar, validateSeries, dataQualityGate
/**
 * data-quality-gate.mjs — AFL data-quality gate (the FM-3 fix).
 *
 * THE FAILURE (FM-3): a single corrupted OHLCV bar (a fat-finger high<low, a
 * negative volume, a NaN close, a teleported timestamp, a 100x spike tick)
 * flows unchecked into factor computation. Rolling means, returns, volatilities,
 * and the quantum factor circuit's embedding all silently inherit the poison —
 * the factor scores look plausible, the bug surfaces only downstream as
 * unexplainable alpha drift. This gate stops it at the door.
 *
 * THREE LAYERS, escalating from deterministic to statistical:
 *   1. validateBar  — pure, per-bar HARD rejects (structural OHLCV invariants).
 *                     No stats, no series context. NaN-safe (finite checked first).
 *   2. validateSeries — per-bar hard rejects + NON-MONOTONE timestamp detection
 *                       across the series (look-ahead / out-of-order guard) +
 *                       STATISTICAL outlier FLAGS via scalarKalman's NIS gate.
 *   3. dataQualityGate — the verdict: PASS iff ZERO hard-rejects and ZERO
 *                        non-monotone timestamps. Flags are advisory by default
 *                        (opt-in opts.maxFlagFraction to fail on excess outliers).
 *                        FAIL-CLOSED on malformed input.
 *
 * CAPABILITY-FIRST: the statistical outlier detector COMPOSES scalarKalman from
 * math-kernel.mjs — a scalar Kalman recovery filter with a one-sided NIS gate
 * against chi-square(1) = 3.841. We read its per-step `nis` field directly and
 * flag a bar (in EITHER direction) when nis > the chi-sq(1) threshold, rather
 * than relying on its one-sided `surprised` field (which only flags upward jumps
 * — a downward bad-tick crash must be caught too). No Kalman is reimplemented.
 *
 * HARD CONSTRAINTS (YURI-OS): ESM .mjs, fileURLToPath for paths, no commit/push,
 * no protected paths. Writes only this file. Advisory until local evidence
 * verifies it.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { scalarKalman, median } from '../math/math-kernel.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));

// chi-square(1) at the 0.95 quantile — the same constant scalarKalman defaults to.
const CHI2_1_95 = 3.841458820694124;

// ───────────────────────────────────────────────────────────────────────────
// §1 — PER-BAR HARD REJECTS (pure, deterministic, NaN-safe)
// ───────────────────────────────────────────────────────────────────────────

/**
 * validateBar(bar) -> { ok:boolean, rejects:[reason] }
 *
 * DETERMINISTIC structural OHLCV invariants. Pure — no stats, no series context.
 * Collects ALL violations (does not short-circuit) so the report names every
 * problem in one pass. Reason strings are stable identifiers, not prose.
 *
 * Rejects:
 *   - any non-finite o/h/l/c/v (NaN / Infinity / missing / non-number)
 *   - high < low                  (the bar's range is inverted)
 *   - open  outside [low, high]   (open printed outside the bar's range)
 *   - close outside [low, high]   (close printed outside the bar's range)
 *   - volume < 0                  (negative traded volume is impossible)
 *   - (if `timestamp` present) non-finite timestamp
 *
 * NaN-SAFETY: finiteness is checked FIRST. NaN comparisons are always false, so
 * `high < low` would silently PASS a NaN high — the non-finite reject fires
 * instead, and the range/bound checks are skipped for the non-finite field so we
 * don't emit a misleading "high<low" on garbage input.
 */
export function validateBar(bar, opts = {}) {
  // requirePositivePrice (default true): a close/open/high/low <= 0 is structurally finite and can sit
  // inside [low,high], so it PASSES every other check — yet for equities/crypto a non-positive price is
  // always corrupt (null coerced to 0, feed gap) and would poison log-returns (log(0)=-Inf) AND slip
  // the gate entirely (the log-return stream skips non-positive prices). Hard-reject it. Markets with
  // legitimately non-positive prices (some commodities/options) pass {requirePositivePrice:false}.
  // (peer-review/Mimo+DeepSeek fix.)
  const requirePositivePrice = opts.requirePositivePrice !== false;
  const rejects = [];

  if (bar == null || typeof bar !== 'object') {
    return { ok: false, rejects: ['non-object-bar'] };
  }

  const { open, high, low, close, volume } = bar;
  const oF = Number.isFinite(open);
  const hF = Number.isFinite(high);
  const lF = Number.isFinite(low);
  const cF = Number.isFinite(close);
  const vF = Number.isFinite(volume);

  if (!oF) rejects.push('non-finite-open');
  if (!hF) rejects.push('non-finite-high');
  if (!lF) rejects.push('non-finite-low');
  if (!cF) rejects.push('non-finite-close');
  if (!vF) rejects.push('non-finite-volume');

  // Range / bound checks only run on the fields proven finite, so a single NaN
  // field doesn't spawn a cascade of misleading comparison rejects.
  if (hF && lF && high < low) rejects.push('high-lt-low');
  if (oF && hF && lF) {
    if (open < low || open > high) rejects.push('open-outside-range');
  }
  if (cF && hF && lF) {
    if (close < low || close > high) rejects.push('close-outside-range');
  }
  if (vF && volume < 0) rejects.push('negative-volume');

  // Non-positive price reject (finite-checked first; one reason per offending field).
  if (requirePositivePrice) {
    if (oF && open <= 0) rejects.push('non-positive-open');
    if (hF && high <= 0) rejects.push('non-positive-high');
    if (lF && low <= 0) rejects.push('non-positive-low');
    if (cF && close <= 0) rejects.push('non-positive-close');
  }

  // Timestamp is optional, but if present it must be finite (a NaN/Infinity ts
  // breaks the monotonicity check downstream and signals a corrupt feed).
  if ('timestamp' in bar) {
    if (!Number.isFinite(bar.timestamp)) rejects.push('non-finite-timestamp');
  }

  return { ok: rejects.length === 0, rejects };
}

// ───────────────────────────────────────────────────────────────────────────
// §2 — SERIES VALIDATION (hard rejects + non-monotone ts + statistical flags)
// ───────────────────────────────────────────────────────────────────────────

/**
 * validateSeries(bars, opts) ->
 *   { clean:[idx], rejected:[{index,rejects}], flagged:[{index,reason,nis}],
 *     nonMonotonic:[idx], stats }
 *
 * Layers:
 *   1. Per-bar hard rejects (validateBar). A rejected bar is NEVER fed to the
 *      Kalman filter (a NaN close would poison the whole filter state).
 *   2. NON-MONOTONE timestamp detection across the series: if timestamps are
 *      present, every bar whose timestamp is <= the previous in-order timestamp
 *      is recorded (an out-of-order / duplicate / teleported bar — the
 *      look-ahead and replay guard). Only hard-clean bars participate (a
 *      rejected bar's ts is already untrustworthy).
 *   3. STATISTICAL outlier flags: a scalar Kalman filter (composed from
 *      math-kernel) is run over the hard-clean close stream (or log-return
 *      stream when opts.useLogReturn). Each step's NIS is compared to the
 *      chi-square(1) gate; a bar whose NIS exceeds it (in EITHER direction) is
 *      flagged as a statistical bad-tick. Flags are ADVISORY — they do not
 *      reject the bar, only surface it.
 *
 * opts:
 *   q, r, threshold  — passed straight to scalarKalman (process/measurement
 *                      noise, NIS gate). threshold defaults to chi-sq(1)@0.95.
 *   useLogReturn     — run the filter over log-returns of close instead of raw
 *                      close (level-invariant; needs >= 2 clean bars).
 *   strictMonotonic  — if true, equal (duplicate) timestamps also count as
 *                      non-monotone (default true; a duplicate bar is a feed bug).
 *
 * FAIL-CLOSED: a non-array `bars` returns an all-empty result with stats.malformed
 * = true rather than throwing into the caller's ingest loop.
 */
export function validateSeries(bars, opts = {}) {
  const {
    q = 1e-4,
    r,
    threshold = CHI2_1_95,
    // DEFAULT to log-returns (red-team HIGH fix): a raw OHLCV close is a non-stationary random walk, so
    // the whole-stream-variance r mis-specifies the chi²(1) NIS gate — autocorrelated false positives,
    // spike under-detection, and a trailing cascade after a level shift. Log-returns are ~stationary,
    // where the NIS gate is well-specified. Callers with an already-stationary stream can pass useLogReturn:false.
    useLogReturn = true,
    strictMonotonic = true,
    requirePositivePrice = true,
  } = opts;

  const empty = {
    clean: [],
    rejected: [],
    flagged: [],
    nonMonotonic: [],
    stats: {
      total: 0, cleanCount: 0, rejectCount: 0, flagCount: 0,
      nonMonotonicCount: 0, hasTimestamps: false, kalmanRan: false, malformed: true,
    },
  };
  if (!Array.isArray(bars)) return empty;

  const total = bars.length;
  const rejected = [];
  const cleanIdx = [];          // original indices that pass hard rejects
  const cleanCloses = [];       // their close values, parallel to cleanIdx
  let hasTimestamps = false;

  for (let i = 0; i < total; i++) {
    const bar = bars[i];
    const v = validateBar(bar, { requirePositivePrice });
    if (!v.ok) {
      rejected.push({ index: i, rejects: v.rejects });
      continue;
    }
    cleanIdx.push(i);
    cleanCloses.push(bar.close);
    if (bar && typeof bar === 'object' && 'timestamp' in bar && Number.isFinite(bar.timestamp)) {
      hasTimestamps = true;
    }
  }

  // ── NON-MONOTONE TIMESTAMPS (across the hard-clean bars, in original order) ──
  // A bar is non-monotone if its ts is not strictly greater than the last
  // accepted ts (or >= under non-strict). Only meaningful when timestamps exist
  // on every clean bar — a partially-stamped series is reported as having no
  // usable monotonicity signal (we still check the stamped ones pairwise).
  const nonMonotonic = [];
  if (hasTimestamps) {
    let prevTs = null;
    for (const i of cleanIdx) {
      const ts = bars[i].timestamp;
      if (!Number.isFinite(ts)) continue; // already excluded by validateBar, defensive
      if (prevTs !== null) {
        const bad = strictMonotonic ? !(ts > prevTs) : ts < prevTs;
        if (bad) nonMonotonic.push(i);
      }
      prevTs = ts;
    }
  }

  // ── STATISTICAL OUTLIER FLAGS via scalarKalman NIS gate ──
  const flagged = [];
  let kalmanRan = false;
  let kalmanError = null;
  // Build the stream the filter runs over (close, or log-return of close).
  let stream = cleanCloses;
  let streamIdx = cleanIdx;     // original index for each stream element
  if (useLogReturn) {
    const lr = [];
    const lrIdx = [];
    for (let k = 1; k < cleanCloses.length; k++) {
      const prev = cleanCloses[k - 1];
      const cur = cleanCloses[k];
      // log-return undefined for non-positive prices; skip (those bars are still
      // hard-clean, just not part of the return stream).
      if (prev > 0 && cur > 0) {
        lr.push(Math.log(cur / prev));
        lrIdx.push(cleanIdx[k]);
      }
    }
    stream = lr;
    streamIdx = lrIdx;
  }

  // scalarKalman needs a non-empty stream; flag detection needs >= 2 points to
  // have a meaningful innovation (the first point seeds the estimate, NIS ~ 0).
  if (stream.length >= 2) {
    // measurement noise r: ROBUST scale (peer-review HIGH fix). The old full-stream VARIANCE includes
    // the very outliers it must detect — one spike inflates r and deflates every later bar's NIS, so a
    // second corrupt bar silently passes (FM-3 persisting). MAD (median abs deviation × 1.4826 ≈ σ for
    // Gaussian) is outlier-resistant; floored so r > 0 even for a flat stream.
    let rUse = r;
    if (!Number.isFinite(rUse)) {
      const med = median(stream);
      const mad = median(stream.map((x) => Math.abs(x - med))) * 1.4826;
      rUse = Math.max(mad * mad, 1e-12);
    }
    // FAIL-CLOSED (Mimo HIGH fix): a thrown scalarKalman (overflow / NaN state / shape) must NOT crash
    // the gate into a fail-OPEN. On error, flag EVERY stream bar so dataQualityGate cannot pass
    // vacuously, and record kalmanError for the gate to veto on.
    try {
      const kal = scalarKalman(stream, { q, r: rUse, threshold });
      kalmanRan = true;
      // surprises: [{ index, nis, surprised }] — index is into `stream`. We flag on nis > threshold in
      // EITHER direction (not the one-sided `surprised`), skipping index 0 (degenerate seed innovation).
      for (const s of kal.surprises) {
        if (s.index === 0) continue;
        if (s.nis > threshold) {
          flagged.push({
            index: streamIdx[s.index],
            reason: useLogReturn ? 'kalman-nis-logreturn-outlier' : 'kalman-nis-outlier',
            nis: s.nis,
          });
        }
      }
    } catch (err) {
      kalmanError = String((err && err.message) || err);
      for (const idx of streamIdx) {
        flagged.push({ index: idx, reason: 'kalman-runtime-error', nis: Infinity });
      }
    }
  }

  return {
    clean: cleanIdx,
    rejected,
    flagged,
    nonMonotonic,
    stats: {
      total,
      cleanCount: cleanIdx.length,
      rejectCount: rejected.length,
      flagCount: flagged.length,
      nonMonotonicCount: nonMonotonic.length,
      hasTimestamps,
      kalmanRan,
      kalmanError,
      streamLength: stream.length,
      threshold,
      malformed: false,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// §3 — THE GATE (the verdict)
// ───────────────────────────────────────────────────────────────────────────

/**
 * dataQualityGate(bars, opts) ->
 *   { pass:boolean, rejectCount, flagCount, nonMonotonicCount, report }
 *
 * PASS iff there are ZERO hard-rejects AND ZERO non-monotone timestamps. Flags
 * (statistical outliers) are ADVISORY by default — they surface suspicious bars
 * without failing the gate, because a legitimate gap/news spike is a real
 * outlier, not corrupt data. Set opts.maxFlagFraction (e.g. 0.05) to ALSO fail
 * the gate when the flagged fraction of clean bars exceeds it (excess outliers
 * imply a systematically dirty feed, not a one-off event).
 *
 * FAIL-CLOSED: malformed input (non-array, or an empty series when
 * opts.requireNonEmpty) fails the gate rather than passing vacuously.
 *
 * opts: all of validateSeries's opts, plus:
 *   maxFlagFraction  — if set, fail when flagCount/cleanCount > this (default off).
 *   requireNonEmpty  — if true, an empty `bars` fails the gate (default true:
 *                      an ingest of zero bars is a problem, not a clean pass).
 */
export function dataQualityGate(bars, opts = {}) {
  const { maxFlagFraction = null, requireNonEmpty = true } = opts;

  // FAIL-CLOSED on malformed / empty input.
  if (!Array.isArray(bars)) {
    return {
      pass: false,
      rejectCount: 0,
      flagCount: 0,
      nonMonotonicCount: 0,
      report: { reason: 'malformed-input', detail: 'bars is not an array', series: null },
    };
  }
  if (requireNonEmpty && bars.length === 0) {
    return {
      pass: false,
      rejectCount: 0,
      flagCount: 0,
      nonMonotonicCount: 0,
      report: { reason: 'empty-series', detail: 'zero bars to validate', series: null },
    };
  }

  const series = validateSeries(bars, opts);
  const { rejectCount, flagCount, nonMonotonicCount, cleanCount, kalmanError } = series.stats;

  // Core verdict: structural integrity must be perfect. A Kalman runtime error FAILS the gate
  // (fail-closed) rather than passing because the statistical layer silently didn't run. (Mimo fix.)
  let pass = rejectCount === 0 && nonMonotonicCount === 0 && !kalmanError;

  // Optional excess-outlier veto.
  let flagFraction = null;
  let flagVeto = false;
  if (Number.isFinite(maxFlagFraction) && cleanCount > 0) {
    flagFraction = flagCount / cleanCount;
    if (flagFraction > maxFlagFraction) {
      flagVeto = true;
      pass = false;
    }
  }

  return {
    pass,
    rejectCount,
    flagCount,
    nonMonotonicCount,
    report: {
      reason: pass
        ? 'clean'
        : (rejectCount > 0 ? 'hard-rejects'
          : nonMonotonicCount > 0 ? 'non-monotone-timestamps'
            : flagVeto ? 'excess-outliers' : 'unknown'),
      flagFraction,
      maxFlagFraction: Number.isFinite(maxFlagFraction) ? maxFlagFraction : null,
      flagAdvisory: !flagVeto, // flags did not fail the gate
      series,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// §4 — SMOKE TEST (node data-quality-gate.mjs --smoke)
// ───────────────────────────────────────────────────────────────────────────

function makeCleanSeries(nBars = 60, { start = 100, drift = 0.05, ts0 = 1_700_000_000_000, tsStep = 60_000 } = {}) {
  // A smooth synthetic OHLCV series: deterministic gentle drift + tiny bounded
  // wiggle so closes move but no single bar is an outlier. high/low straddle the
  // open/close honestly; volume positive; strictly increasing timestamps.
  const bars = [];
  let level = start;
  for (let i = 0; i < nBars; i++) {
    const wiggle = Math.sin(i * 0.7) * 0.15; // small, bounded, deterministic
    const open = level;
    const close = level + drift + wiggle;
    const high = Math.max(open, close) + 0.2;
    const low = Math.min(open, close) - 0.2;
    bars.push({
      open: round6(open),
      high: round6(high),
      low: round6(low),
      close: round6(close),
      volume: 1000 + i,
      timestamp: ts0 + i * tsStep,
    });
    level = close;
  }
  return bars;
}

function round6(x) { return Number(x.toFixed(6)); }

function smoke() {
  const out = { tests: {} };

  // (a) clean synthetic series -> pass:true, 0 rejects.
  {
    const bars = makeCleanSeries(60);
    const g = dataQualityGate(bars);
    out.tests.a_clean = {
      pass: g.pass,
      rejectCount: g.rejectCount,
      flagCount: g.flagCount,
      nonMonotonicCount: g.nonMonotonicCount,
      reason: g.report.reason,
      expect: 'pass:true, rejectCount:0, nonMonotonicCount:0',
      ok: g.pass === true && g.rejectCount === 0 && g.nonMonotonicCount === 0,
    };
  }

  // (b) inject high<low and volume<0 -> both hard-rejected with right reasons, pass:false.
  {
    const bars = makeCleanSeries(60);
    // Bar 10: high < low (inverted range).
    bars[10] = { open: 100, high: 99, low: 101, close: 100, volume: 500, timestamp: bars[10].timestamp };
    // Bar 20: negative volume.
    bars[20] = { ...bars[20], volume: -42 };
    const g = dataQualityGate(bars);
    const r10 = g.report.series.rejected.find((x) => x.index === 10);
    const r20 = g.report.series.rejected.find((x) => x.index === 20);
    out.tests.b_hardRejects = {
      pass: g.pass,
      rejectCount: g.rejectCount,
      reason: g.report.reason,
      bar10Rejects: r10 ? r10.rejects : null,
      bar20Rejects: r20 ? r20.rejects : null,
      // bar10 also trips open/close-outside-range (open=100,close=100 with low=101,high=99) — that's correct.
      ok: g.pass === false
        && !!r10 && r10.rejects.includes('high-lt-low')
        && !!r20 && r20.rejects.includes('negative-volume'),
      expect: 'pass:false; bar10 has high-lt-low; bar20 has negative-volume',
    };
  }

  // (c) inject a single extreme close spike -> flagged by Kalman NIS, NOT hard-rejected.
  {
    const bars = makeCleanSeries(60);
    // Bar 30: a 100x close spike that still respects high/low (so NOT a hard reject)
    // — keep open/close inside an artificially widened range so the only thing
    // wrong is that it's a statistical outlier.
    const spikeClose = 100 * 100; // ~10000 vs ~level 100
    bars[30] = {
      open: bars[30].open,
      high: spikeClose + 1,
      low: Math.min(bars[30].low, bars[30].open),
      close: spikeClose,
      volume: bars[30].volume,
      timestamp: bars[30].timestamp,
    };
    const g = dataQualityGate(bars);
    const wasRejected = g.report.series.rejected.some((x) => x.index === 30);
    const flaggedIdx = g.report.series.flagged.map((x) => x.index);
    const spikeFlag = g.report.series.flagged.find((x) => x.index === 30 || x.index === 31);
    out.tests.c_outlierFlag = {
      rejectCount: g.rejectCount,
      flagCount: g.flagCount,
      flaggedIndices: flaggedIdx,
      bar30HardRejected: wasRejected,
      spikeFlagNis: spikeFlag ? Number(spikeFlag.nis.toFixed(4)) : null,
      // gate STILL passes by default (flags advisory, no hard rejects, monotone ts).
      gatePassDefault: g.pass,
      ok: wasRejected === false && g.report.series.flagged.length >= 1,
      expect: 'bar30 NOT hard-rejected; flagged.length>=1; gate still passes (flags advisory)',
    };

    // (c2) same spike, now WITH maxFlagFraction -> the gate fails on excess outliers.
    const g2 = dataQualityGate(bars, { maxFlagFraction: 0.0 });
    out.tests.c2_flagVeto = {
      pass: g2.pass,
      reason: g2.report.reason,
      flagFraction: g2.report.flagFraction != null ? Number(g2.report.flagFraction.toFixed(4)) : null,
      ok: g2.pass === false && g2.report.reason === 'excess-outliers',
      expect: 'pass:false, reason:excess-outliers when maxFlagFraction:0',
    };
  }

  // (d) shuffled (non-monotone) timestamp series -> nonMonotonic detected.
  {
    const bars = makeCleanSeries(60);
    // Swap two timestamps so the series is no longer strictly increasing.
    const t = bars[40].timestamp;
    bars[40].timestamp = bars[42].timestamp;
    bars[42].timestamp = t; // now bar41 > bar40-after? actually bar40 jumps ahead, bar42 falls behind
    const g = dataQualityGate(bars);
    out.tests.d_nonMonotone = {
      pass: g.pass,
      nonMonotonicCount: g.nonMonotonicCount,
      nonMonotonicIndices: g.report.series.nonMonotonic,
      reason: g.report.reason,
      ok: g.pass === false && g.nonMonotonicCount >= 1,
      expect: 'pass:false; nonMonotonicCount>=1; reason:non-monotone-timestamps',
    };
  }

  // (e) FAIL-CLOSED on malformed input.
  {
    const gNull = dataQualityGate(null);
    const gNum = dataQualityGate(42);
    const gEmpty = dataQualityGate([]);
    out.tests.e_failClosed = {
      nullPass: gNull.pass, nullReason: gNull.report.reason,
      numberPass: gNum.pass, numberReason: gNum.report.reason,
      emptyPass: gEmpty.pass, emptyReason: gEmpty.report.reason,
      ok: gNull.pass === false && gNum.pass === false && gEmpty.pass === false,
      expect: 'all pass:false (malformed-input / empty-series)',
    };
  }

  // (f) validateBar unit checks (NaN-safety + bound checks).
  {
    const good = validateBar({ open: 10, high: 12, low: 9, close: 11, volume: 100 });
    const nanHigh = validateBar({ open: 10, high: NaN, low: 9, close: 11, volume: 100 });
    const openOut = validateBar({ open: 50, high: 12, low: 9, close: 11, volume: 100 });
    const badTs = validateBar({ open: 10, high: 12, low: 9, close: 11, volume: 100, timestamp: Infinity });
    out.tests.f_validateBar = {
      goodOk: good.ok,
      nanHighRejects: nanHigh.rejects, // should be ['non-finite-high'] only — NOT high-lt-low
      openOutRejects: openOut.rejects, // ['open-outside-range']
      badTsRejects: badTs.rejects,     // ['non-finite-timestamp']
      ok: good.ok === true
        && nanHigh.rejects.length === 1 && nanHigh.rejects[0] === 'non-finite-high'
        && openOut.rejects.includes('open-outside-range')
        && badTs.rejects.includes('non-finite-timestamp'),
      expect: 'good ok; NaN high -> only non-finite-high (no cascade); open-outside-range; non-finite-timestamp',
    };
  }

  const allOk = Object.values(out.tests).every((t) => t.ok === true);
  out.ALL_PASS = allOk;
  console.log(JSON.stringify(out, null, 2));
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--smoke')) {
    try { const r = smoke(); process.exit(r.ALL_PASS ? 0 : 1); }
    catch (e) { console.error('SMOKE FAILED:', e); process.exit(1); }
  } else {
    console.log('data-quality-gate: AFL ingest gate (FM-3 fix) — OHLCV hard-rejects + non-monotone ts + Kalman NIS outlier flags.');
    console.log('  node data-quality-gate.mjs --smoke');
    console.log('  import { dataQualityGate, validateSeries, validateBar } from "./data-quality-gate.mjs"');
  }
}
