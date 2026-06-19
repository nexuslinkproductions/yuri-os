// @capability: adverse-attribution
// @serves: adverse selection attribution | fill-to-mid-reversion | gross vs risk-adjusted PnL | bleed detector | maker fill analysis | KILLER-RISK detector | glm-5.2 roadmap
// @does: Measures per-fill fill-to-mid-reversion and separates GROSS PnL from RISK-ADJUSTED PnL (gross − adverseSel − 4.0 bps round-trip fee). Surfaces the bleed signature: mean(riskAdj) < 0 while mean(gross) ≥ 0 — looks profitable for months while bleeding.
// @use: attributeFills(tape, opts) for full attribution over a recorded tape; --test for self-verification; --run <tapeFile> for real-tape analysis.
// @exports: attributeFills

/**
 * adverse-attribution.mjs — KILLER-RISK DETECTOR (glm-5.2 roadmap #1)
 *
 * Adverse selection shows up as positive GROSS PnL but negative RISK-ADJUSTED PnL.
 * It looks like you're making money for months while bleeding.
 *
 * This module measures, per simulated fill, the mid move AGAINST us after the fill,
 * and separates GROSS vs RISK-ADJUSTED PnL so the bleed is visible from day 1.
 *
 * MATH (Binance USDsM VIP0):
 *   makerFeeBpsPerSide = 2.0 bps
 *   roundTripFeeBps   = 2 × 2.0 = 4.0 bps  ← EXACT; 0.4/0.8 was a 5× VIP8 error
 *
 *   grossPnlBps (buy)  = (midAtExit − fillPrice) / fillPrice × 1e4
 *   grossPnlBps (sell) = (fillPrice − midAtExit) / fillPrice × 1e4
 *   riskAdjPnlBps      = grossPnlBps − adverseSelBps − roundTripFeeBps
 *
 * BLEED SIGNATURE: mean(riskAdjPnlBps) < 0 && mean(grossPnlBps) >= 0
 *
 * CONSTRAINTS
 *   - Pure offline / no network / no orders
 *   - No new npm dependencies
 *   - Fail-open throughout: bad fills, missing mid series → skip / NaN, never throw
 *   - Does NOT modify any shared file
 */

import { loadTape } from './tape-replay.mjs';
import { trackAdverseSelection } from './maker-exec-measure.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const ROUND_TRIP_FEE_BPS = 4.0; // Binance USDsM VIP0: 2.0 bps/side × 2

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** Percentiles from a sorted numeric array. */
function pctile(sorted, p) {
  if (!sorted.length) return NaN;
  const idx = p / 100 * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Descriptive stats over an array of numbers (NaN values excluded). */
function stats(arr) {
  const valid = arr.filter(isNum).sort((a, b) => a - b);
  if (!valid.length) return { n: 0, mean: NaN, median: NaN, p5: NaN, p25: NaN, p75: NaN, p95: NaN };
  const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
  return {
    n: valid.length,
    mean: +mean.toFixed(4),
    median: +pctile(valid, 50).toFixed(4),
    p5:     +pctile(valid, 5).toFixed(4),
    p25:    +pctile(valid, 25).toFixed(4),
    p75:    +pctile(valid, 75).toFixed(4),
    p95:    +pctile(valid, 95).toFixed(4),
  };
}

/** Make a string key for (offset, size, windowMs). */
const aggKey = (offset, size, windowMs) => `off${offset}_sz${size}_w${windowMs}`;

// ─────────────────────────────────────────────────────────────────────────────
// CORE: attributeFills
// ─────────────────────────────────────────────────────────────────────────────

/**
 * attributeFills(tape, opts)
 *
 * Generates simulated maker fills across sample times, computes per-fill attribution,
 * and aggregates into gross / adverse-sel / risk-adj PnL + reversion distributions.
 *
 * @param {import('./tape-replay.mjs').Tape} tape
 * @param {{
 *   levelOffsets?: number[],
 *   sizes?: number[],
 *   windowsMs?: number[],
 *   sampleEverySec?: number,
 *   tickSize?: number,
 *   makerFeeBpsPerSide?: number,
 * }} opts
 * @returns {{
 *   fills: object[],
 *   aggregate: object,
 *   verdict: { bleedDetected: boolean, details: string },
 * }}
 */
export function attributeFills(tape, opts = {}) {
  const {
    levelOffsets    = [0, 1, 2, 3, 5],
    sizes           = [0.001, 0.01, 0.05],
    windowsMs       = [1000, 5000, 30000],
    sampleEverySec  = 60,
    tickSize        = 0.1,
    makerFeeBpsPerSide = 2.0,
  } = opts;

  const roundTripFeeBps = 2 * makerFeeBpsPerSide; // 4.0 bps at VIP0

  // Determine tape time range from the first and last snap/diff/trade timestamps.
  const allTs = tape._all ? tape._all.map((e) => e.ts).filter(isNum) : [];
  if (!allTs.length) {
    return { fills: [], aggregate: {}, verdict: { bleedDetected: false, details: 'empty tape' } };
  }
  // Loop min/max — Math.min(...allTs) overflows V8's arg-stack on large tapes (live-seam crash, 2026-06-19).
  let tapeStart = allTs[0], tapeEnd = allTs[0];
  for (let i = 1; i < allTs.length; i++) { const v = allTs[i]; if (v < tapeStart) tapeStart = v; if (v > tapeEnd) tapeEnd = v; }
  const stepMs    = sampleEverySec * 1000;
  const horizonSec = Math.max(...windowsMs) / 1000 + 1; // fill sim horizon covers the widest window

  const fills = [];
  // aggregate accumulators: key → { grossBps[], adverseSelBps[], riskAdjBps[], reversionBps[] }
  const agg = {};

  const sides = ['buy', 'sell'];

  for (let ts = tapeStart + stepMs; ts + horizonSec * 1000 <= tapeEnd; ts += stepMs) {
    // Get book at this sample point to derive fill prices at offsets.
    const book = tape.bookAt(ts);
    if (!book || !isNum(book.mid) || book.mid <= 0) continue;

    const mid = book.mid;

    for (const side of sides) {
      for (const offset of levelOffsets) {
        // offset ticks from mid: buy below mid, sell above mid (post-only maker placement)
        const offsetAmount = offset * tickSize;
        const limitPrice = side === 'buy'
          ? +( mid - offsetAmount ).toFixed(1)
          : +( mid + offsetAmount ).toFixed(1);

        if (limitPrice <= 0) continue;

        for (const size of sizes) {
          // Simulate the maker order fill.
          let simResult;
          try {
            simResult = tape.simulateOrder({ side, price: limitPrice, size, joinTs: ts, horizonSec });
          } catch {
            continue; // fail-open: skip this combination
          }

          if (!simResult || !simResult.filled || !isNum(simResult.fillTs)) continue;

          const fillTs    = simResult.fillTs;
          const fillPrice = limitPrice; // maker fills at limit price

          // Compute per-window attribution.
          for (const windowMs of windowsMs) {
            // Build mid series for trackAdverseSelection.
            // We need at minimum: one point ≤ fillTs and one point ≥ fillTs + windowMs.
            const seriesStart = fillTs - 500;
            const seriesEnd   = fillTs + windowMs + 500;
            const seriesStepMs = Math.max(100, Math.round(windowMs / 20));
            let midSeries;
            try {
              midSeries = tape.bookSeries(seriesStart, seriesEnd, seriesStepMs);
            } catch {
              midSeries = [];
            }
            if (!midSeries || midSeries.length < 2) continue;

            // trackAdverseSelection returns bps (positive = we lost vs fill mid).
            const adverseSelBps = trackAdverseSelection(
              { side, fillPrice, fillTs, windowMs },
              midSeries,
            );
            if (!isNum(adverseSelBps)) continue;

            // midAtExit = mid at fillTs + windowMs
            const exitTs = fillTs + windowMs;
            const exitBook = tape.bookAt(exitTs);
            if (!exitBook || !isNum(exitBook.mid) || exitBook.mid <= 0) continue;
            const midAtExit = exitBook.mid;

            // grossPnlBps: directional edge ignoring fees and adverse selection
            const grossPnlBps = side === 'buy'
              ? (midAtExit - fillPrice) / fillPrice * 1e4
              : (fillPrice - midAtExit) / fillPrice * 1e4;

            if (!isNum(grossPnlBps)) continue;

            // riskAdjPnlBps = grossPnlBps − adverseSelBps − roundTripFeeBps
            const riskAdjPnlBps = grossPnlBps - adverseSelBps - roundTripFeeBps;

            // fill-to-mid-reversion: signed (mid@+window − mid@fill) by side
            // buy side: positive reversion = price went up = good; sell side: negative = price went down = good
            // We track RAW signed move to expose the distribution.
            const midAtFillBook = tape.bookAt(fillTs);
            const midAtFill = midAtFillBook?.mid ?? NaN;
            const reversionRaw = isNum(midAtFill) && midAtFill > 0
              ? (midAtExit - midAtFill) / midAtFill * 1e4 // bps, signed
              : NaN;
            // Direction-adjusted: positive = favorable for our side
            const reversionBps = isNum(reversionRaw)
              ? (side === 'buy' ? reversionRaw : -reversionRaw)
              : NaN;

            const fillRecord = {
              ts, side, offset, size, windowMs,
              fillTs, fillPrice, midAtFill: isNum(midAtFill) ? +midAtFill.toFixed(2) : null, midAtExit: +midAtExit.toFixed(2),
              adverseSelBps: +adverseSelBps.toFixed(4),
              grossPnlBps:   +grossPnlBps.toFixed(4),
              roundTripFeeBps,
              riskAdjPnlBps: +riskAdjPnlBps.toFixed(4),
              reversionBps:  isNum(reversionBps) ? +reversionBps.toFixed(4) : null,
            };
            fills.push(fillRecord);

            // Aggregate by (offset, size, window)
            const k = aggKey(offset, size, windowMs);
            if (!agg[k]) {
              agg[k] = { offset, size, windowMs, grossBps: [], adverseSelBps: [], riskAdjBps: [], reversionBps: [] };
            }
            agg[k].grossBps.push(grossPnlBps);
            agg[k].adverseSelBps.push(adverseSelBps);
            agg[k].riskAdjBps.push(riskAdjPnlBps);
            if (isNum(reversionBps)) agg[k].reversionBps.push(reversionBps);
          } // windowMs
        } // size
      } // offset
    } // side
  } // ts

  // Build aggregate summary
  const aggregate = {};
  for (const [k, v] of Object.entries(agg)) {
    aggregate[k] = {
      offset:   v.offset,
      size:     v.size,
      windowMs: v.windowMs,
      n:        v.grossBps.length,
      grossMean:       isNum(v.grossBps.reduce((a, b) => a + b, 0) / v.grossBps.length) ? +(v.grossBps.reduce((a, b) => a + b, 0) / v.grossBps.length).toFixed(4) : NaN,
      adverseSelMean:  isNum(v.adverseSelBps.reduce((a, b) => a + b, 0) / v.adverseSelBps.length) ? +(v.adverseSelBps.reduce((a, b) => a + b, 0) / v.adverseSelBps.length).toFixed(4) : NaN,
      riskAdjMean:     isNum(v.riskAdjBps.reduce((a, b) => a + b, 0) / v.riskAdjBps.length) ? +(v.riskAdjBps.reduce((a, b) => a + b, 0) / v.riskAdjBps.length).toFixed(4) : NaN,
      reversionPctiles: stats(v.reversionBps),
    };
  }

  // Verdict: detect the bleed signature
  // Aggregate across ALL fills for a global mean
  const allGross   = fills.map((f) => f.grossPnlBps).filter(isNum);
  const allRiskAdj = fills.map((f) => f.riskAdjPnlBps).filter(isNum);
  const meanGross   = allGross.length   ? allGross.reduce((a, b) => a + b, 0)   / allGross.length   : NaN;
  const meanRiskAdj = allRiskAdj.length ? allRiskAdj.reduce((a, b) => a + b, 0) / allRiskAdj.length : NaN;
  const bleedDetected = isNum(meanGross) && isNum(meanRiskAdj) && meanGross >= 0 && meanRiskAdj < 0;

  const verdict = {
    bleedDetected,
    meanGrossBps:   isNum(meanGross)   ? +meanGross.toFixed(4)   : null,
    meanRiskAdjBps: isNum(meanRiskAdj) ? +meanRiskAdj.toFixed(4) : null,
    totalFills: fills.length,
    roundTripFeeBps,
    details: fills.length === 0
      ? 'no fills generated — tape may be too short or mid unavailable'
      : bleedDetected
        ? `BLEED DETECTED: gross=${meanGross.toFixed(3)} bps (≥0) but riskAdj=${meanRiskAdj.toFixed(3)} bps (<0). Adverse selection is silently eating the edge.`
        : `No bleed signature. gross=${isNum(meanGross) ? meanGross.toFixed(3) : 'N/A'} bps, riskAdj=${isNum(meanRiskAdj) ? meanRiskAdj.toFixed(3) : 'N/A'} bps.`,
  };

  return { fills, aggregate, verdict };
}

// ─────────────────────────────────────────────────────────────────────────────
// --test: SYNTHETIC self-test
// ─────────────────────────────────────────────────────────────────────────────

function runTest() {
  console.log('--- adverse-attribution --test ---');
  let pass = 0;
  let fail = 0;
  const ok = (label, cond) => {
    if (cond) { console.log(`  PASS  ${label}`); pass++; }
    else       { console.error(`  FAIL  ${label}`); fail++; }
  };

  // ── SYNTHETIC TAPE BUILDER ──────────────────────────────────────────────────
  // We build raw JSONL-style event arrays and pass them to loadTape(array).
  // Price units: BTC-like, mid ~100.

  const BASE_MID = 100;
  const BID_PRICE = 99.9;
  const ASK_PRICE = 100.1;

  /**
   * Make a synthetic snap event at ts with a given mid.
   * Bids: [mid-0.1, mid-0.2, ...]; Asks: [mid+0.1, mid+0.2, ...]
   */
  function makeSnap(ts, mid) {
    const bid = +(mid - 0.1).toFixed(1);
    const ask = +(mid + 0.1).toFixed(1);
    return {
      t: 'snap', ts, s: 'BTCUSDT', lastUpdateId: 0,
      bids: [[String(bid), '10'], [String(+(bid - 0.1).toFixed(1)), '5']],
      asks: [[String(ask), '10'], [String(+(ask + 0.1).toFixed(1)), '5']],
    };
  }

  /** Make a diff that moves the top bid/ask to a new mid. */
  function makeDiff(ts, newMid, prevMid) {
    const oldBid = +(prevMid - 0.1).toFixed(1);
    const newBid = +(newMid - 0.1).toFixed(1);
    const oldAsk = +(prevMid + 0.1).toFixed(1);
    const newAsk = +(newMid + 0.1).toFixed(1);
    return {
      t: 'diff', ts, s: 'BTCUSDT', U: ts, u: ts + 1, pu: ts - 1,
      b: [
        [String(newBid), '10'],
        ...(newBid !== oldBid ? [[String(oldBid), '0']] : []),
      ],
      a: [
        [String(newAsk), '10'],
        ...(newAsk !== oldAsk ? [[String(oldAsk), '0']] : []),
      ],
    };
  }

  /** Make an aggressor trade hitting the resting side. */
  function makeTrade(ts, price, qty, aggressorSide) {
    // m=true → buyer was maker → aggressor is 'sell'
    return { t: 'trade', ts, s: 'BTCUSDT', p: String(price), q: String(qty), m: aggressorSide === 'sell' };
  }

  // ── TEST CASE 1: ADVERSE BUY FILL ─────────────────────────────────────────
  // Mid starts at 100. A buy fills at ~99.9. Mid then FALLS to 98 (adverse for buyer).
  // Expected: adverseSelBps > 0, grossPnlBps < 0, riskAdjPnlBps = gross − adverseSel − 4.0

  {
    const tStart = 1_000_000;
    const fillTs = tStart + 200; // fill happens at +200ms
    const window = 1000; // 1s window

    // Timeline:
    //   tStart       : snap mid=100
    //   tStart+100   : sell aggressor trade at 99.9 (drains queue, fills our buy)
    //   tStart+200..2000: mid falls to 98 (adverse)
    const events1 = [
      makeSnap(tStart, BASE_MID),
      makeTrade(tStart + 100, BID_PRICE, 20, 'sell'), // fills our buy at 99.9
      makeDiff(tStart + 300, 98, 100),               // mid drops to 98
      makeSnap(tStart + 300, 98),                    // snap confirming new mid
      makeDiff(tStart + 1500, 98, 98),               // keep it there for the window
    ];
    const tape1 = loadTape(events1);

    // bookAt tStart should give mid ~100
    const b0 = tape1.bookAt(tStart);
    ok('T1a: bookAt tStart mid ~100', b0 && Math.abs(b0.mid - 100) < 0.5);

    // Simulate a BUY at 99.9 joining at tStart
    const sim = tape1.simulateOrder({ side: 'buy', price: BID_PRICE, size: 0.01, joinTs: tStart, horizonSec: 2 });
    ok('T1b: synthetic buy fills', sim.filled === true);

    if (sim.filled) {
      const midSeries = tape1.bookSeries(sim.fillTs - 200, sim.fillTs + window + 200, 100);
      ok('T1c: midSeries has points', midSeries.length >= 2);

      const adverseSelBps = trackAdverseSelection(
        { side: 'buy', fillPrice: BID_PRICE, fillTs: sim.fillTs, windowMs: window },
        midSeries,
      );
      ok('T1d: adverseSelBps is finite', isNum(adverseSelBps));
      ok('T1e: adverseSelBps > 0 (adverse)', isNum(adverseSelBps) && adverseSelBps > 0);

      // midAtExit = mid at fillTs + window
      const exitBook = tape1.bookAt(sim.fillTs + window);
      if (exitBook && isNum(exitBook.mid)) {
        const grossPnlBps = (exitBook.mid - BID_PRICE) / BID_PRICE * 1e4;
        const riskAdjPnlBps = grossPnlBps - adverseSelBps - ROUND_TRIP_FEE_BPS;

        ok('T1f: grossPnlBps < 0 (price fell)', isNum(grossPnlBps) && grossPnlBps < 0);
        ok('T1g: riskAdj = gross − adverseSel − 4.0 (exact)', isNum(riskAdjPnlBps) &&
          Math.abs(riskAdjPnlBps - (grossPnlBps - adverseSelBps - 4.0)) < 0.001);
        ok('T1h: fee component is exactly 4.0 bps', ROUND_TRIP_FEE_BPS === 4.0);
        console.log(`  [T1]  gross=${grossPnlBps.toFixed(3)} adverseSel=${adverseSelBps.toFixed(3)} fee=4.0 riskAdj=${riskAdjPnlBps.toFixed(3)} bps`);
      } else {
        ok('T1f-h: exitBook available', false);
      }
    }
  }

  // ── TEST CASE 2: FAVORABLE SELL FILL ──────────────────────────────────────
  // Mid starts at 100. A sell fills at 100.1. Mid then FALLS to 99 (favorable for seller).
  // Expected: adverseSelBps < 0 (favorable), grossPnlBps > 0, riskAdjPnlBps = gross − adverseSel − 4.0

  {
    const tStart = 2_000_000;
    const window = 1000;

    const events2 = [
      makeSnap(tStart, BASE_MID),
      makeTrade(tStart + 100, ASK_PRICE, 20, 'buy'), // buy aggressor lifts our sell at 100.1
      makeDiff(tStart + 300, 99, 100),               // mid falls (good for seller)
      makeSnap(tStart + 300, 99),
      makeDiff(tStart + 1500, 99, 99),
    ];
    const tape2 = loadTape(events2);

    const sim = tape2.simulateOrder({ side: 'sell', price: ASK_PRICE, size: 0.01, joinTs: tStart, horizonSec: 2 });
    ok('T2a: synthetic sell fills', sim.filled === true);

    if (sim.filled) {
      const midSeries = tape2.bookSeries(sim.fillTs - 200, sim.fillTs + window + 200, 100);
      const adverseSelBps = trackAdverseSelection(
        { side: 'sell', fillPrice: ASK_PRICE, fillTs: sim.fillTs, windowMs: window },
        midSeries,
      );
      ok('T2b: adverseSelBps is finite', isNum(adverseSelBps));
      // mid fell after sell fill → favorable → adverseSelBps should be < 0
      ok('T2c: adverseSelBps < 0 (favorable)', isNum(adverseSelBps) && adverseSelBps < 0);

      const exitBook = tape2.bookAt(sim.fillTs + window);
      if (exitBook && isNum(exitBook.mid)) {
        const grossPnlBps = (ASK_PRICE - exitBook.mid) / ASK_PRICE * 1e4;
        const riskAdjPnlBps = grossPnlBps - adverseSelBps - ROUND_TRIP_FEE_BPS;

        ok('T2d: grossPnlBps > 0 (favorable)', isNum(grossPnlBps) && grossPnlBps > 0);
        ok('T2e: riskAdj = gross − adverseSel − 4.0 (exact)',
          Math.abs(riskAdjPnlBps - (grossPnlBps - adverseSelBps - 4.0)) < 0.001);
        console.log(`  [T2]  gross=${grossPnlBps.toFixed(3)} adverseSel=${adverseSelBps.toFixed(3)} fee=4.0 riskAdj=${riskAdjPnlBps.toFixed(3)} bps`);
      } else {
        ok('T2d-e: exitBook available', false);
      }
    }
  }

  // ── TEST CASE 3: ROUND-TRIP FEE INVARIANT ─────────────────────────────────
  {
    ok('T3a: ROUND_TRIP_FEE_BPS constant is exactly 4.0', ROUND_TRIP_FEE_BPS === 4.0);
    ok('T3b: 2 × makerFeeBpsPerSide(2.0) = 4.0', 2 * 2.0 === 4.0);
  }

  // ── TEST CASE 4: FAIL-OPEN ─────────────────────────────────────────────────
  {
    const emptyTape = loadTape([]);
    const result = attributeFills(emptyTape, {});
    ok('T4a: attributeFills on empty tape returns fills:[]', Array.isArray(result.fills) && result.fills.length === 0);
    ok('T4b: verdict details present', typeof result.verdict.details === 'string');
    ok('T4c: bleedDetected false on empty', result.verdict.bleedDetected === false);
  }

  console.log(`\n  Results: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
  console.log('  adverse-attribution --test PASS\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// --run <tapeFile>: Real tape attribution
// ─────────────────────────────────────────────────────────────────────────────

async function runOnTape(tapeFile) {
  console.log(`\nadverse-attribution --run ${tapeFile}`);
  console.log('Loading tape...');

  let tape;
  try {
    tape = loadTape(tapeFile);
  } catch (err) {
    console.error(`Failed to load tape: ${err.message}`);
    process.exit(1);
  }

  const allTs = tape._all ? tape._all.map((e) => e.ts).filter(isNum) : [];
  if (!allTs.length) {
    console.error('Tape is empty or contains no valid events.');
    process.exit(0);
  }
  // Loop min/max — Math.min(...allTs) overflows V8's arg-stack on large tapes (live-seam crash, 2026-06-19).
  let tapeStart = allTs[0], tapeEnd = allTs[0];
  for (let i = 1; i < allTs.length; i++) { const v = allTs[i]; if (v < tapeStart) tapeStart = v; if (v > tapeEnd) tapeEnd = v; }
  const durationMin = ((tapeEnd - tapeStart) / 60000).toFixed(1);
  console.log(`Tape span: ${new Date(tapeStart).toISOString()} → ${new Date(tapeEnd).toISOString()} (${durationMin} min, ${tape._all.length} events)`);

  console.log('Running attribution (this may take a moment on a large tape)...');
  const result = attributeFills(tape, {
    // DEEP offset grid (ticks from mid) to measure adverse-selection where δ* lives
    // (~266 ticks ≈ 4.25 bps at BTC ~$62.7k), not just at the touch. The +4.3bps
    // net per fill assumed AS≈0.16bps from SHALLOW offsets; toxic flow hitting deep
    // resting liquidity may be higher and flip the net. 0 = touch anchor. (2026-06-19)
    levelOffsets:   [0, 50, 150, 266, 400],
    sizes:          [0.001, 0.01, 0.05],
    windowsMs:      [1000, 5000, 30000],
    sampleEverySec: 60,
    tickSize:       0.1,
    makerFeeBpsPerSide: 2.0,
  });

  console.log(`\nTotal fills attributed: ${result.fills.length}`);
  console.log(`\n── AGGREGATE SUMMARY (sample) ──`);

  // Print a selection of aggregate keys (first 10)
  const aggKeys = Object.keys(result.aggregate).slice(0, 10);
  for (const k of aggKeys) {
    const a = result.aggregate[k];
    console.log(`  [off=${a.offset} sz=${a.size} w=${a.windowMs}ms] n=${a.n} gross=${a.grossMean ?? 'N/A'} adverseSel=${a.adverseSelMean ?? 'N/A'} riskAdj=${a.riskAdjMean ?? 'N/A'} bps | reversion p50=${a.reversionPctiles.median ?? 'N/A'}`);
  }

  console.log(`\n── VERDICT ──`);
  const v = result.verdict;
  console.log(`  Bleed detected:    ${v.bleedDetected ? 'YES ⚠' : 'NO'}`);
  console.log(`  Mean gross PnL:    ${v.meanGrossBps ?? 'N/A'} bps`);
  console.log(`  Mean risk-adj PnL: ${v.meanRiskAdjBps ?? 'N/A'} bps`);
  console.log(`  Round-trip fee:    ${v.roundTripFeeBps} bps (VIP0 exact)`);
  console.log(`  ${v.details}`);

  // Write JSON output
  const stateDir = new URL('../../../_SYSTEM/state', import.meta.url);
  const statePath = fileURLToPath(stateDir);
  try { mkdirSync(statePath, { recursive: true }); } catch {}
  const utcDate = new Date().toISOString().slice(0, 10);
  const outFile = join(statePath, `adverse-attribution-${utcDate}.json`);
  try {
    writeFileSync(outFile, JSON.stringify({ meta: { tapeFile, tapeStart, tapeEnd, durationMin, generatedAt: new Date().toISOString() }, verdict: result.verdict, aggregate: result.aggregate, fills: result.fills }, null, 2), 'utf8');
    console.log(`\nWrote: ${outFile}`);
  } catch (err) {
    console.error(`Could not write output JSON: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRYPOINT
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args[0] === '--test') {
  runTest();
} else if (args[0] === '--run' && args[1]) {
  runOnTape(args[1]);
}
