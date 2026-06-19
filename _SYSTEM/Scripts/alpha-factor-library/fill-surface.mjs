// @capability: fill-surface
// @serves: fill probability surface | P(fill) calibration | level-offset fill rate | maker fill research | order fill model | fill probability by offset size horizon regime
// @does: Computes P(fill | level-offset, size, time-in-book, regime) surface from a recorded tape. Samples the book every sampleEverySec, simulates maker orders at each (offset, size, horizon) combo using tape-replay's simulateOrder, buckets results by a realized-vol tercile regime, and returns a structured surface table. Pure offline analysis — no network, no orders. Fail-open throughout.
// @use: const tape = await loadTape(path); const result = computeFillSurface(tape, opts); → result.surface[{offset,size,horizonSec,regime,pFill,n}]. The surface sharpens as the tape grows — a small tape gives noisy P but the pipeline is correct.
// @exports: computeFillSurface, surfaceToTable

import { loadTape } from './tape-replay.mjs';
import { realizedVol } from './carry-vol-signal.mjs';
import { createWriteStream, writeFileSync, readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_OPTS = {
  levelOffsets: [0, 1, 2, 3, 5, 10], // ticks from best on our side
  sizes: [0.001, 0.01, 0.05, 0.1],   // BTC
  horizonSecs: [5, 10, 30, 60],
  sampleEverySec: 60,
  tickSize: 0.1,
  side: 'both',                       // 'buy' | 'sell' | 'both'
};

// Minimum mids needed for a vol estimate at the sampling point.
// We use a 20-sample window (shorter than carry-vol's 30 to cope with small tapes).
const VOL_WINDOW = 20;
const VOL_PERIODS_PER_YEAR = 525600; // 1-min bars; recalculated per step below

// ─────────────────────────────────────────────────────────────────────────────
// Regime bucketing (realized-vol tercile)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given a small array of recent (ts, mid) pairs, compute trailing realized-vol
 * and return one of 'low' | 'med' | 'high' | 'unknown'.
 *
 * We use the same realizedVol() from carry-vol-signal. The periods-per-year
 * is set for the actual inter-sample frequency so the annualized figure is
 * comparable across different sampleEverySec settings.
 *
 * The tercile cut-offs are derived from the distribution of vol estimates seen
 * across ALL sampling points so we can split evenly. When < 3 valid vol
 * estimates exist we fall back to hard-coded crypto perp thresholds:
 *   low  < 0.50  (50% ann vol)
 *   med  < 1.20  (120% ann vol)
 *   high >= 1.20
 */
function tercileBuckets(volEstimates) {
  const valid = volEstimates.filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length < 3) return null; // caller uses hard-coded fallback
  valid.sort((a, b) => a - b);
  return [
    valid[Math.floor(valid.length / 3)],
    valid[Math.floor((2 * valid.length) / 3)],
  ];
}

function classifyRegime(vol, cuts) {
  if (!Number.isFinite(vol)) return 'unknown';
  if (!cuts) {
    // Hard-coded crypto perp thresholds
    if (vol < 0.5) return 'low';
    if (vol < 1.2) return 'med';
    return 'high';
  }
  if (vol < cuts[0]) return 'low';
  if (vol < cuts[1]) return 'med';
  return 'high';
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: computeFillSurface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * computeFillSurface(tape, opts) → { surface, samples, span }
 *
 * surface: [{offset, size, horizonSec, regime, pFill, n}]
 *   offset     — tick offset from best (0 = touch, 1 = 1 tick behind best, …)
 *   size       — order size in BTC
 *   horizonSec — max time-in-book seconds
 *   regime     — 'low' | 'med' | 'high' | 'unknown'
 *   pFill      — P(fill) estimate [0,1]
 *   n          — sample count (sample trials, not fills)
 *
 * samples — total book-sample points attempted
 * span    — { t0, t1, durationMs }
 *
 * Fail-open: any per-sample error is swallowed; the offending sample is skipped.
 *
 * @param {import('./tape-replay.mjs').Tape} tape
 * @param {object} [opts]
 */
export function computeFillSurface(tape, opts = {}) {
  const {
    levelOffsets,
    sizes,
    horizonSecs,
    sampleEverySec,
    tickSize,
    side,
  } = { ...DEFAULT_OPTS, ...opts };

  // ── Determine tape span ────────────────────────────────────────────────────
  const allTs = tape._all.map((e) => e.ts).filter(Number.isFinite);
  if (allTs.length === 0) {
    return { surface: [], samples: 0, span: null, warn: 'empty tape' };
  }
  // Loop min/max — Math.min(...allTs) overflows V8's arg-stack on large tapes (live-seam crash, 2026-06-19).
  let t0 = allTs[0], t1 = allTs[0];
  for (let i = 1; i < allTs.length; i++) { const v = allTs[i]; if (v < t0) t0 = v; if (v > t1) t1 = v; }
  const span = { t0, t1, durationMs: t1 - t0 };

  // ── Pass 1: collect mid series for vol computation + tercile cuts ──────────
  const stepMs = sampleEverySec * 1000;
  const sampleTimes = [];
  for (let t = t0; t <= t1; t += stepMs) sampleTimes.push(t);

  // mid series: [[ts, mid], ...]
  const midSeries = [];
  for (const ts of sampleTimes) {
    try {
      const book = tape.bookAt(ts);
      if (book && Number.isFinite(book.mid)) midSeries.push([ts, book.mid]);
    } catch { /* skip */ }
  }

  // Compute a vol estimate at each sample using a trailing window of mids
  // periodsPerYear for the actual step frequency
  const periodsPerYear = Number.isFinite(sampleEverySec) && sampleEverySec > 0
    ? (365.25 * 24 * 3600) / sampleEverySec
    : VOL_PERIODS_PER_YEAR;

  const volAtSample = []; // parallel to midSeries
  for (let i = 0; i < midSeries.length; i++) {
    const window = midSeries.slice(Math.max(0, i - VOL_WINDOW + 1), i + 1);
    const vol = realizedVol(window, { periodsPerYear, minObs: 5 });
    volAtSample.push(vol);
  }

  const tercileCuts = tercileBuckets(volAtSample);

  // Build a lookup: ts → (mid, vol, regime)
  const midMap = new Map();
  for (let i = 0; i < midSeries.length; i++) {
    const [ts, mid] = midSeries[i];
    const vol = volAtSample[i];
    const regime = classifyRegime(vol, tercileCuts);
    midMap.set(ts, { mid, vol, regime });
  }

  // ── Pass 2: simulate orders ────────────────────────────────────────────────
  // Accumulator: key → { filled, total }
  // key = `${offset}|${size}|${horizonSec}|${regime}`
  const acc = new Map();

  const key = (offset, size, horizonSec, regime) =>
    `${offset}|${size}|${horizonSec}|${regime}`;

  const bump = (offset, size, horizonSec, regime, filled) => {
    const k = key(offset, size, horizonSec, regime);
    if (!acc.has(k)) acc.set(k, { offset, size, horizonSec, regime, filled: 0, total: 0 });
    const entry = acc.get(k);
    entry.total++;
    if (filled) entry.filled++;
  };

  const sides = side === 'both' ? ['buy', 'sell'] : [side];
  let samples = 0;

  for (const [ts, info] of midMap) {
    try {
      const book = tape.bookAt(ts);
      if (!book) continue;

      const bestBid = book.topBids.length > 0 ? book.topBids[0].price : null;
      const bestAsk = book.topAsks.length > 0 ? book.topAsks[0].price : null;

      const { regime } = info;

      for (const orderSide of sides) {
        const best = orderSide === 'buy' ? bestBid : bestAsk;
        if (!Number.isFinite(best)) continue;

        for (const offset of levelOffsets) {
          // buy: passive below best (bid - offset*tick); sell: passive above best (ask + offset*tick)
          const price = orderSide === 'buy'
            ? Math.round((best - offset * tickSize) * 1e8) / 1e8
            : Math.round((best + offset * tickSize) * 1e8) / 1e8;

          for (const sz of sizes) {
            for (const horizonSec of horizonSecs) {
              try {
                const result = tape.simulateOrder({
                  side: orderSide,
                  price,
                  size: sz,
                  joinTs: ts,
                  horizonSec,
                });
                bump(offset, sz, horizonSec, regime, result.filled);
              } catch {
                // simulateOrder fail-open already; swallow residual
              }
            }
          }
        }
      }
      samples++;
    } catch {
      /* per-sample failure is non-fatal */
    }
  }

  // ── Build surface ──────────────────────────────────────────────────────────
  const surface = [];
  for (const [, entry] of acc) {
    const pFill = entry.total > 0 ? entry.filled / entry.total : null;
    surface.push({
      offset: entry.offset,
      size: entry.size,
      horizonSec: entry.horizonSec,
      regime: entry.regime,
      pFill,
      n: entry.total,
    });
  }

  // Sort for stable output: offset asc, size asc, horizonSec asc, regime
  surface.sort((a, b) =>
    a.offset - b.offset ||
    a.size - b.size ||
    a.horizonSec - b.horizonSec ||
    a.regime.localeCompare(b.regime),
  );

  return { surface, samples, span };
}

// ─────────────────────────────────────────────────────────────────────────────
// surfaceToTable — compact ASCII table for terminal output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a compact ASCII table from a surface array.
 * Groups by (regime, horizonSec) for readability.
 *
 * @param {object[]} surface
 * @returns {string}
 */
export function surfaceToTable(surface) {
  if (!surface || surface.length === 0) return '(empty surface)';

  const header = [
    'offset(ticks)', 'size(BTC)', 'horizon(s)', 'regime', 'pFill', 'n',
  ];
  const rows = surface.map((r) => [
    String(r.offset),
    String(r.size),
    String(r.horizonSec),
    r.regime,
    r.pFill !== null ? r.pFill.toFixed(3) : 'null',
    String(r.n),
  ]);

  const cols = header.length;
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );

  const fmt = (cells) => cells.map((c, i) => c.padStart(widths[i])).join('  ');
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');

  const lines = [fmt(header), sep, ...rows.map(fmt)];
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanity assertions (used by --test)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assert monotonicity and range properties of the surface.
 * Returns [] on pass, or an array of failure strings.
 *
 * Checks:
 *   1. pFill ∈ [0,1] for all entries with n > 0.
 *   2. pFill does NOT increase as offset increases (deeper → lower P(fill)).
 *   3. pFill does NOT increase as size increases (larger → lower P(fill)).
 *   4. pFill does NOT decrease as horizonSec increases (more time → higher P(fill)).
 *
 * Each check is applied per (regime, horizonSec) sub-group for 2 and 3,
 * and per (regime, offset, size) sub-group for 4.
 * We only flag when ALL points in the comparison have n >= MIN_N.
 */
const MIN_N = 1; // minimum samples before we trust the comparison

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}

export function assertSurfaceMonotonicity(surface) {
  const failures = [];
  const valid = surface.filter((r) => r.n >= MIN_N && r.pFill !== null);

  // 1. range check
  for (const r of valid) {
    if (r.pFill < 0 || r.pFill > 1) {
      failures.push(`pFill out of range [0,1]: offset=${r.offset} size=${r.size} horizon=${r.horizonSec} regime=${r.regime} pFill=${r.pFill}`);
    }
  }

  // 2. pFill non-increasing with offset (for fixed regime, size, horizon)
  const byRegSizeHorizon = groupBy(valid, (r) => `${r.regime}|${r.size}|${r.horizonSec}`);
  for (const [gk, group] of byRegSizeHorizon) {
    const sorted = [...group].sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (curr.pFill > prev.pFill + 1e-9) {
        failures.push(
          `monotonicity FAIL (offset): group=${gk} offset ${prev.offset}→${curr.offset} pFill ${prev.pFill.toFixed(3)}→${curr.pFill.toFixed(3)} (increased)`,
        );
      }
    }
  }

  // 3. pFill non-increasing with size (for fixed regime, offset, horizon)
  const byRegOffHorizon = groupBy(valid, (r) => `${r.regime}|${r.offset}|${r.horizonSec}`);
  for (const [gk, group] of byRegOffHorizon) {
    const sorted = [...group].sort((a, b) => a.size - b.size);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (curr.pFill > prev.pFill + 1e-9) {
        failures.push(
          `monotonicity FAIL (size): group=${gk} size ${prev.size}→${curr.size} pFill ${prev.pFill.toFixed(3)}→${curr.pFill.toFixed(3)} (increased)`,
        );
      }
    }
  }

  // 4. pFill non-decreasing with horizonSec (for fixed regime, offset, size)
  const byRegOffSize = groupBy(valid, (r) => `${r.regime}|${r.offset}|${r.size}`);
  for (const [gk, group] of byRegOffSize) {
    const sorted = [...group].sort((a, b) => a.horizonSec - b.horizonSec);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (curr.pFill < prev.pFill - 1e-9) {
        failures.push(
          `monotonicity FAIL (horizon): group=${gk} horizon ${prev.horizonSec}→${curr.horizonSec} pFill ${prev.pFill.toFixed(3)}→${curr.pFill.toFixed(3)} (decreased)`,
        );
      }
    }
  }

  return failures;
}

// ─────────────────────────────────────────────────────────────────────────────
// Synthetic tape builder (used by --test)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal in-memory tape (array of raw event objects) where:
 * - bestBid = 62000, bestAsk = 62001 (tick=1.0 for clarity)
 * - Large trades (2 BTC) at touch price every 2s → near-touch orders fill.
 * - No trades near deep levels → deep-offset orders don't fill in short horizons.
 *
 * Returns an array of raw event objects (not JSONL strings) accepted by loadTape(array).
 */
function buildSyntheticTapeLines() {
  const BASE_TS = 1700000000000;
  const DURATION_MS = 300_000; // 5 minutes
  const SNAP_INTERVAL_MS = 60_000;
  const TRADE_INTERVAL_MS = 2_000;

  const BEST_BID = 62000.0;
  const BEST_ASK = 62001.0;

  // tickSize=1.0 for synthetic tape so offsets land on distinct prices
  const TICK = 1.0;

  const events = [];

  // Base snap
  const makeSnap = (ts, idOff) => ({
    t: 'snap', ts, s: 'BTCUSDT', lastUpdateId: idOff,
    bids: [
      [String(BEST_BID), '5.000'],
      [String(BEST_BID - TICK), '3.000'],
      [String(BEST_BID - 2 * TICK), '2.000'],
      [String(BEST_BID - 3 * TICK), '1.500'],
      [String(BEST_BID - 5 * TICK), '1.000'],
      [String(BEST_BID - 10 * TICK), '0.500'],
    ],
    asks: [
      [String(BEST_ASK), '5.000'],
      [String(BEST_ASK + TICK), '3.000'],
      [String(BEST_ASK + 2 * TICK), '2.000'],
      [String(BEST_ASK + 3 * TICK), '1.500'],
      [String(BEST_ASK + 5 * TICK), '1.000'],
      [String(BEST_ASK + 10 * TICK), '0.500'],
    ],
  });

  events.push(makeSnap(BASE_TS, 1));

  // Periodic snaps to keep bookAt happy over the full duration
  for (let dt = SNAP_INTERVAL_MS; dt <= DURATION_MS; dt += SNAP_INTERVAL_MS) {
    events.push(makeSnap(BASE_TS + dt, dt / 1000));
  }

  // Trades: aggressor=sell hits BID (m:true → aggressor is sell → fills resting buys).
  //         aggressor=buy  hits ASK (m:false → aggressor is buy → fills resting sells).
  // Large trades (2 BTC) at touch price so near-touch queue gets consumed.
  for (let dt = TRADE_INTERVAL_MS; dt <= DURATION_MS; dt += TRADE_INTERVAL_MS) {
    const ts = BASE_TS + dt;
    // sell aggressor at bestBid → fills resting buy orders at bestBid
    events.push({ t: 'trade', ts,     s: 'BTCUSDT', p: String(BEST_BID), q: '2.000', m: true });
    // buy aggressor at bestAsk → fills resting sell orders at bestAsk
    events.push({ t: 'trade', ts: ts + 1, s: 'BTCUSDT', p: String(BEST_ASK), q: '2.000', m: false });
  }

  return events;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

async function runTest() {
  console.log('-- FILL-SURFACE --test --');

  // Build synthetic tape (array of raw event objects)
  const syntheticEvents = buildSyntheticTapeLines();
  const tape = await loadTape(syntheticEvents);

  // Use tickSize=1.0 to match synthetic tape pricing
  const result = computeFillSurface(tape, {
    levelOffsets: [0, 1, 2, 3, 5, 10],
    sizes: [0.001, 0.01, 0.05, 0.1],
    horizonSecs: [5, 10, 30, 60],
    sampleEverySec: 60,
    tickSize: 1.0,       // synthetic tape uses tick=1.0
    side: 'both',
  });

  console.log(`span: ${result.span ? `${result.span.durationMs}ms (${(result.span.durationMs/1000).toFixed(0)}s)` : 'null'}`);
  console.log(`samples: ${result.samples}`);
  console.log(`surface entries: ${result.surface.length}`);
  if (result.warn) console.warn('WARN:', result.warn);

  // Print compact table
  console.log('\n' + surfaceToTable(result.surface));

  // Run assertions
  const failures = assertSurfaceMonotonicity(result.surface);

  if (failures.length === 0) {
    console.log('\n[PASS] All monotonicity + range assertions satisfied.');
    return true;
  } else {
    console.error('\n[FAIL] Assertions failed:');
    for (const f of failures) console.error('  ' + f);
    return false;
  }
}

async function runReal(tapeFile) {
  console.log(`-- FILL-SURFACE --run ${tapeFile} --`);

  const tape = await loadTape(tapeFile);
  const result = computeFillSurface(tape, {
    // Real tape: BTC/USDT with 0.1 tick
    levelOffsets: [0, 1, 2, 3, 5, 10],
    sizes: [0.001, 0.01, 0.05, 0.1],
    horizonSecs: [5, 10, 30, 60],
    sampleEverySec: 60,
    tickSize: 0.1,
    side: 'both',
  });

  if (!result.span) {
    console.warn('WARN: No span derived — tape may be empty or unreadable.');
  } else {
    const dur = result.span.durationMs;
    const t0iso = new Date(result.span.t0).toISOString();
    const t1iso = new Date(result.span.t1).toISOString();
    console.log(`tape: ${t0iso} → ${t1iso} (${(dur / 3600000).toFixed(2)}h)`);
  }

  console.log(`samples: ${result.samples}`);
  console.log(`surface entries: ${result.surface.length}`);

  if (result.surface.length === 0) {
    console.warn('WARN: Surface is empty — no bookAt hits. Tape may lack snap events.');
  } else {
    // Honesty notice for small tapes
    const maxN = Math.max(...result.surface.map((r) => r.n));
    if (maxN < 20) {
      console.log(`\nHONESTY: max sample count = ${maxN}. Small tape → noisy P(fill). Pipeline is correct; surface sharpens as tape grows.`);
    }

    console.log('\n' + surfaceToTable(result.surface));
  }

  // Write JSON output
  const stateDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../_SYSTEM/state',
  );
  try {
    mkdirSync(stateDir, { recursive: true });
  } catch { /* exists */ }

  const utcDate = new Date().toISOString().slice(0, 10);
  const outPath = resolve(stateDir, `fill-surface-${utcDate}.json`);
  const payload = {
    generatedAt: new Date().toISOString(),
    tapeFile,
    samples: result.samples,
    span: result.span,
    surface: result.surface,
    honesty: 'pFill estimates are noisy on small tapes; they converge as tape grows.',
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\nOutput written → ${outPath}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const testFlag = args.includes('--test');
  const runIdx = args.indexOf('--run');
  const tapeFile = runIdx !== -1 ? args[runIdx + 1] : null;

  if (testFlag) {
    runTest().then((ok) => process.exit(ok ? 0 : 1)).catch((err) => {
      console.error('FATAL:', err);
      process.exit(1);
    });
  } else if (tapeFile) {
    runReal(tapeFile).then(() => process.exit(0)).catch((err) => {
      console.error('FATAL:', err);
      process.exit(1);
    });
  } else {
    console.error('Usage: fill-surface.mjs --test | --run <tapeFile>');
    process.exit(1);
  }
}
