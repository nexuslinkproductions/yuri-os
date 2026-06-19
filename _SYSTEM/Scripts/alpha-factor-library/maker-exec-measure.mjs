// @capability: maker-exec-measure
// @serves: queue-honest maker fill | queue position | order fill model | GTX post-only | adverse selection | OFI predictivity | order flow imbalance measurement | maker execution measurement | fill model
// @does: (A) Queue-honest GTX maker fill model — tracks queueAhead at join, consumes it via opposing aggressor trades, fires fill only when queue exhausted, measures adverse selection bps. (B) OFI predictivity harness — Pearson correlation(ofi, futureΔmid) per lag, R², directional hit-rate, meaningful/marginal/noise verdict. Pure compute, fail-open.
// @use: newMakerOrder + onTrade + onBookUpdate + trackAdverseSelection for per-order queue sim; measureOfiPredictivity + summarizeOfi for offline OFI edge measurement before promoting to live sizing.
// @exports: newMakerOrder, onTrade, onBookUpdate, trackAdverseSelection, measureOfiPredictivity, summarizeOfi

/**
 * maker-exec-measure.mjs
 *
 * Two execution-measurement instruments the red team demanded:
 *   (A) QUEUE-HONEST MAKER FILL MODEL — a GTX post-only limit joins the BACK of the
 *       queue at its price level. It fills ONLY after the size resting AHEAD of it is
 *       consumed by opposing aggressor trades. "Filled when touched" is a fiction; this
 *       module is the honest counter.
 *   (B) OFI PREDICTIVITY MEASUREMENT HARNESS — measures empirically whether order flow
 *       imbalance (OFI) correlates with future mid-price moves at the latencies we
 *       actually operate at. R² < 0.10 at all lags = noise; never size on it.
 *
 * CONSTRAINTS
 *   - Pure compute (no network, no I/O beyond --test console)
 *   - Fail-open: every exported function returns a safe sentinel on any error, never throws
 *   - No new npm dependencies
 *   - Offline-testable via --test self-test
 *
 * RESIDUAL OPTIMISM in the queue model (documented, not hidden):
 *   1. queueAhead = visible level size at join time. Hidden/iceberg orders are NOT counted
 *      here. The true queue ahead is ≥ queueAhead. So fills arrive LATER than we model.
 *   2. We don't know exact rank within the level — we assume we're at the absolute back,
 *      which is correct for a fresh join but optimistic if the level was thin and we
 *      re-queued after a partial cancel.
 *   3. onBookUpdate cancel inference is proportional (pro-rata model). Real cancels may
 *      cluster ahead of or behind us; we can't distinguish without the authenticated
 *      user-data stream (Coinbase Advanced order updates). When the owner plugs in the
 *      read-key order stream, replace onBookUpdate inference with exact queue events.
 *   4. Adverse selection is measured post-fill against a mid series. It is an estimate;
 *      the true cost includes the opportunity cost of capital resting at the level.
 */

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ─────────────────────────────────────────────────────────────────────────────
// (A) QUEUE-HONEST MAKER FILL MODEL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ORDER STATE SHAPE
 * {
 *   side:          'buy' | 'sell'
 *   price:         number          — limit price
 *   size:          number          — total order size (base units)
 *   queueAhead:    number          — size resting AHEAD of us at join (visible; see residual optimism #1)
 *   remaining:     number          — unfilled portion of our order
 *   filled:        boolean         — true once queueAhead ≤ 0 AND a trade reaches our price
 *   fillQty:       number          — total filled so far
 *   _tradeConsumed: number         — total trade size already used to drain queueAhead (for cancel inference)
 * }
 */

/**
 * newMakerOrder({ side, price, size, queueAheadAtJoin })
 *
 * Creates a new GTX post-only maker order state. The order joins the BACK of the
 * queue at `price`. `queueAheadAtJoin` is the visible resting size at that level
 * at the moment we submit. Fail-open: bad inputs produce a sentinel with filled=true
 * and remaining=0 so callers can safely ignore it.
 *
 * @param {{ side: 'buy'|'sell', price: number, size: number, queueAheadAtJoin: number }} opts
 * @returns {object} order state
 */
export function newMakerOrder({ side, price, size, queueAheadAtJoin } = {}) {
  try {
    const s = side === 'buy' || side === 'sell' ? side : null;
    const p = isNum(price) && price > 0 ? price : null;
    const sz = isNum(size) && size > 0 ? size : null;
    const qa = isNum(queueAheadAtJoin) && queueAheadAtJoin >= 0 ? queueAheadAtJoin : null;
    if (!s || !p || !sz || qa === null) {
      // Fail-open sentinel: treated as already done / invalid
      return { side: s || 'buy', price: p || 0, size: sz || 0, queueAhead: 0, remaining: 0, filled: true, fillQty: 0, _tradeConsumed: 0, _invalid: true };
    }
    return { side: s, price: p, size: sz, queueAhead: qa, remaining: sz, filled: false, fillQty: 0, _tradeConsumed: 0 };
  } catch (_) {
    return { side: 'buy', price: 0, size: 0, queueAhead: 0, remaining: 0, filled: true, fillQty: 0, _tradeConsumed: 0, _invalid: true };
  }
}

/**
 * onTrade(order, { tradePrice, tradeSize, aggressorSide })
 *
 * Called on each public trade event. Decrement queueAhead by trades that HIT OUR
 * LEVEL on the opposing aggressor side, then fill us when queue is exhausted and a
 * trade reaches our price.
 *
 * Aggressor matching logic:
 *   Our order is 'buy' (resting bid) → filled by 'sell' aggressors hitting our price.
 *   Our order is 'sell' (resting ask) → filled by 'buy' aggressors lifting our price.
 *
 * The queue drains proportionally: any trade at our price on the correct aggressor side
 * consumes from queueAhead first, then from our own remaining size.
 *
 * FAIL-OPEN: mutates the order in place only when inputs are valid; returns safe default.
 *
 * @param {object} order — mutable order state from newMakerOrder
 * @param {{ tradePrice: number, tradeSize: number, aggressorSide: 'buy'|'sell' }} trade
 * @returns {{ filled: boolean, fillQty: number, remaining: number }}
 */
export function onTrade(order, { tradePrice, tradeSize, aggressorSide } = {}) {
  const noFill = { filled: false, fillQty: 0, remaining: order?.remaining ?? 0 };
  try {
    if (!order || order.filled || order.remaining <= 0) return { filled: order?.filled ?? false, fillQty: 0, remaining: order?.remaining ?? 0 };
    if (!isNum(tradePrice) || !isNum(tradeSize) || tradeSize <= 0) return noFill;

    // Determine if this trade hits our resting level.
    // buy order (resting bid at price P) fills when a SELL aggressor hits price <= P.
    // sell order (resting ask at price P) fills when a BUY aggressor lifts price >= P.
    const hitsBuy = order.side === 'buy' && aggressorSide === 'sell' && tradePrice <= order.price;
    const hitsAsk = order.side === 'sell' && aggressorSide === 'buy' && tradePrice >= order.price;
    if (!hitsBuy && !hitsAsk) return noFill;

    // This trade hits our level. Drain queueAhead first.
    let tradeLeft = tradeSize;

    if (order.queueAhead > 0) {
      const drainQueue = Math.min(order.queueAhead, tradeLeft);
      order.queueAhead -= drainQueue;
      order._tradeConsumed += drainQueue;
      tradeLeft -= drainQueue;
    }

    // If queue is exhausted and there is trade volume left, fill our order.
    let fillQty = 0;
    if (order.queueAhead <= 0 && tradeLeft > 0) {
      fillQty = Math.min(order.remaining, tradeLeft);
      order.remaining -= fillQty;
      order.fillQty += fillQty;
      order._tradeConsumed += fillQty;
      if (order.remaining <= 0) {
        order.filled = true;
      }
    }

    return { filled: order.filled, fillQty, remaining: order.remaining };
  } catch (_) {
    return noFill;
  }
}

/**
 * onBookUpdate(order, levelSizeNow)
 *
 * Called when the book snapshot for our price level is updated. If the level's
 * visible size shrank MORE than trades alone explain (i.e., cancellations ahead
 * of us), we proportionally reduce queueAhead.
 *
 * MODEL ASSUMPTION (proportional pro-rata cancel inference):
 *   We don't know whether cancels happened ahead of or behind us in the queue.
 *   We assume cancels are uniformly distributed across the level's resting size.
 *   The fraction of the level that was cancelled applies equally to queueAhead.
 *   This is a CONSERVATIVE assumption: if cancels cluster ahead, queueAhead
 *   shrinks faster → we fill sooner. If cancels cluster behind, this overestimates
 *   our queue position. With authenticated user-data stream, replace with exact events.
 *
 * FAIL-OPEN: mutates order in place; returns safe default on bad input.
 *
 * @param {object} order — mutable order state
 * @param {number} levelSizeNow — current visible resting size at our price level
 * @returns {{ queueAhead: number, cancelledInferred: number }}
 */
export function onBookUpdate(order, levelSizeNow) {
  try {
    if (!order || order.filled || order.remaining <= 0) {
      return { queueAhead: order?.queueAhead ?? 0, cancelledInferred: 0 };
    }
    if (!isNum(levelSizeNow) || levelSizeNow < 0) {
      return { queueAhead: order.queueAhead, cancelledInferred: 0 };
    }

    // Total level size that SHOULD be present based on what we've seen:
    // original queueAhead + our own remaining, minus what trades consumed.
    // If levelSizeNow is less than what trades explain, the difference is cancels.
    const expectedFromTrades = Math.max(0, order.queueAhead + order.remaining);
    const levelChange = expectedFromTrades - levelSizeNow;

    if (levelChange <= 0) {
      // Level grew or stayed same (new orders added, or no net shrink) → no cancel inference.
      return { queueAhead: order.queueAhead, cancelledInferred: 0 };
    }

    // levelChange > 0: more shrinkage than our model accounts for → infer cancels.
    // Apply proportionally to queueAhead fraction of the expected level.
    const queueFrac = expectedFromTrades > 0 ? order.queueAhead / expectedFromTrades : 0;
    const cancelAhead = Math.min(order.queueAhead, levelChange * queueFrac);

    order.queueAhead = Math.max(0, order.queueAhead - cancelAhead);

    return { queueAhead: order.queueAhead, cancelledInferred: cancelAhead };
  } catch (_) {
    return { queueAhead: order?.queueAhead ?? 0, cancelledInferred: 0 };
  }
}

/**
 * trackAdverseSelection(fill, midSeries)
 *
 * Measures the adverse-selection cost of a fill: how much did the mid price
 * move AGAINST our side in the N milliseconds after the fill?
 *
 * fill = { side: 'buy'|'sell', fillPrice: number, fillTs: number, windowMs: number }
 *   side       — 'buy' or 'sell'
 *   fillPrice  — the price at which we were filled
 *   fillTs     — timestamp (ms) of the fill
 *   windowMs   — how many ms to look forward for adverse move (default 1000ms)
 *
 * midSeries = [{ ts: number (ms), mid: number }]  sorted ascending by ts
 *
 * Returns bps of adverse selection (positive = we lost money relative to fill mid).
 * A buy fill is adversely selected if mid FALLS after fill (we bought when sellers
 * were informed). A sell fill is adversely selected if mid RISES after fill.
 *
 * Returns NaN if insufficient data.
 *
 * @param {{ side: 'buy'|'sell', fillPrice: number, fillTs: number, windowMs?: number }} fill
 * @param {{ ts: number, mid: number }[]} midSeries
 * @returns {number} bps (NaN if cannot compute)
 */
export function trackAdverseSelection(fill, midSeries) {
  try {
    if (!fill || !Array.isArray(midSeries) || midSeries.length === 0) return NaN;
    const { side, fillPrice, fillTs, windowMs = 1000 } = fill;
    if (!isNum(fillPrice) || fillPrice <= 0) return NaN;
    if (!isNum(fillTs)) return NaN;
    if (side !== 'buy' && side !== 'sell') return NaN;

    // Find mid at fill time (closest ts <= fillTs)
    let midAtFill = NaN;
    for (const pt of midSeries) {
      if (isNum(pt?.ts) && isNum(pt?.mid) && pt.ts <= fillTs) {
        midAtFill = pt.mid;
      } else if (isNum(pt?.ts) && pt.ts > fillTs) {
        break;
      }
    }
    if (!isNum(midAtFill) || midAtFill <= 0) return NaN;

    // Find mid at fillTs + windowMs
    const lookAhead = fillTs + windowMs;
    let midAfter = NaN;
    for (const pt of midSeries) {
      if (isNum(pt?.ts) && isNum(pt?.mid) && pt.ts >= lookAhead) {
        midAfter = pt.mid;
        break;
      }
    }
    if (!isNum(midAfter) || midAfter <= 0) return NaN;

    // Adverse move:
    //   buy fill → adverse if mid falls → adverseSel = (midAtFill - midAfter) / midAtFill
    //   sell fill → adverse if mid rises → adverseSel = (midAfter - midAtFill) / midAtFill
    const directedMove = side === 'buy'
      ? (midAtFill - midAfter) / midAtFill   // positive = price fell after buy fill = bad
      : (midAfter - midAtFill) / midAtFill;  // positive = price rose after sell fill = bad

    return Math.round(directedMove * 1e6) / 100; // bps (2 dp)
  } catch (_) {
    return NaN;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// (B) OFI PREDICTIVITY MEASUREMENT HARNESS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pearson correlation between two equal-length arrays.
 * Returns NaN if n < 2 or zero variance in either array.
 */
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return NaN;
  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) { sumX += xs[i]; sumY += ys[i]; }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let cov = 0, varX = 0, varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return NaN;
  return cov / Math.sqrt(varX * varY);
}

/**
 * measureOfiPredictivity(records, lags)
 *
 * For each lag (ms): align each record to the future mid at +lag, compute:
 *   - Pearson correlation(ofi, futureΔmid)
 *   - R² = correlation²
 *   - Directional hit-rate: fraction where sign(ofi) === sign(futureΔmid)
 *   - n: sample count
 *
 * records = [{ ts: number (ms), ofi: number, mid: number }] sorted ascending by ts.
 * lags = number[] (ms), e.g. [100, 200, 300, 500, 1000].
 *
 * FAIL-OPEN: returns empty array on invalid input; per-lag entries with insufficient
 * data return NaN stats rather than throwing.
 *
 * @param {{ ts: number, ofi: number, mid: number }[]} records
 * @param {number[]} lags
 * @returns {{ lag: number, correlation: number, r2: number, directionalHitRate: number, n: number }[]}
 */
export function measureOfiPredictivity(records, lags) {
  try {
    if (!Array.isArray(records) || records.length < 2) return [];
    if (!Array.isArray(lags) || lags.length === 0) return [];

    // Filter valid records
    const valid = records.filter(r => isNum(r?.ts) && isNum(r?.ofi) && isNum(r?.mid) && r.mid > 0);
    if (valid.length < 2) return [];

    return lags.map((lag) => {
      if (!isNum(lag) || lag <= 0) return { lag, correlation: NaN, r2: NaN, directionalHitRate: NaN, n: 0 };

      const ofis = [];
      const deltaMids = [];

      for (const rec of valid) {
        // Find the closest record at ts + lag (first record with ts >= rec.ts + lag)
        const target = rec.ts + lag;
        let future = null;
        // Binary search would be more efficient but this is an offline measurement harness
        for (const other of valid) {
          if (other.ts >= target) {
            future = other;
            break;
          }
        }
        if (!future || future === rec) continue;

        const deltaMid = (future.mid - rec.mid) / rec.mid; // fractional mid move
        if (!isNum(deltaMid)) continue;

        ofis.push(rec.ofi);
        deltaMids.push(deltaMid);
      }

      const n = ofis.length;
      if (n < 2) return { lag, correlation: NaN, r2: NaN, directionalHitRate: NaN, n };

      const correlation = pearson(ofis, deltaMids);
      const r2 = isNum(correlation) ? correlation * correlation : NaN;

      let hits = 0;
      for (let i = 0; i < n; i++) {
        if (Math.sign(ofis[i]) === Math.sign(deltaMids[i]) && ofis[i] !== 0 && deltaMids[i] !== 0) {
          hits++;
        }
      }
      // Exclude zeros from directional denominator
      const nonZero = ofis.filter((v, i) => v !== 0 && deltaMids[i] !== 0).length;
      const directionalHitRate = nonZero > 0 ? hits / nonZero : NaN;

      return {
        lag,
        correlation: isNum(correlation) ? Math.round(correlation * 1e6) / 1e6 : NaN,
        r2: isNum(r2) ? Math.round(r2 * 1e6) / 1e6 : NaN,
        directionalHitRate: isNum(directionalHitRate) ? Math.round(directionalHitRate * 1e4) / 1e4 : NaN,
        n,
      };
    });
  } catch (_) {
    return [];
  }
}

/**
 * summarizeOfi(lagStats)
 *
 * Labels each lag result: meaningful (R²>0.15), marginal (0.10-0.15), noise (<0.10 or NaN).
 * Returns { meaningful, marginal, noise } arrays plus a headline verdict.
 *
 * @param {ReturnType<typeof measureOfiPredictivity>} lagStats
 * @returns {{ meaningful: object[], marginal: object[], noise: object[], verdict: string }}
 */
export function summarizeOfi(lagStats) {
  try {
    if (!Array.isArray(lagStats) || lagStats.length === 0) {
      return { meaningful: [], marginal: [], noise: [], verdict: 'NO_DATA' };
    }
    const meaningful = [];
    const marginal = [];
    const noise = [];

    for (const s of lagStats) {
      const labeled = { ...s, label: '' };
      if (isNum(s.r2) && s.r2 > 0.15) {
        labeled.label = 'meaningful';
        meaningful.push(labeled);
      } else if (isNum(s.r2) && s.r2 >= 0.10) {
        labeled.label = 'marginal';
        marginal.push(labeled);
      } else {
        labeled.label = 'noise';
        noise.push(labeled);
      }
    }

    let verdict;
    if (meaningful.length > 0) {
      const best = meaningful.reduce((a, b) => a.r2 > b.r2 ? a : b);
      verdict = `OFI_MEANINGFUL: best R²=${best.r2} at lag=${best.lag}ms (n=${best.n}). Edge candidate — validate out-of-sample before sizing.`;
    } else if (marginal.length > 0) {
      const best = marginal.reduce((a, b) => a.r2 > b.r2 ? a : b);
      verdict = `OFI_MARGINAL: best R²=${best.r2} at lag=${best.lag}ms. Weak signal — do not size. Collect more data.`;
    } else {
      verdict = `OFI_NOISE: R²<0.10 at all lags. OFI has no detectable predictive power at these latencies. Do not use.`;
    }

    return { meaningful, marginal, noise, verdict };
  } catch (_) {
    return { meaningful: [], marginal: [], noise: [], verdict: 'ERROR' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// --test SELF-TEST
// ─────────────────────────────────────────────────────────────────────────────

import { pathToFileURL } from 'node:url';

const _isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (_isMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (cond, label) => {
    if (cond) { pass++; }
    else { fail++; console.error('FAIL:', label); }
  };
  const near = (a, b, eps = 1e-9) => isNum(a) && isNum(b) && Math.abs(a - b) <= eps;

  // ── PART A: QUEUE-HONEST MAKER FILL MODEL ──────────────────────────────────

  // A1: Bad inputs → fail-open sentinel (filled=true, remaining=0)
  const bad = newMakerOrder({});
  ok(bad.filled === true && bad.remaining === 0, 'A1: bad input → fail-open sentinel filled=true');

  // A2: Valid order starts unfilled, queueAhead set correctly
  const o1 = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 50 });
  ok(!o1.filled && o1.remaining === 10 && o1.queueAhead === 50, 'A2: valid order starts unfilled, queueAhead=50');

  // A3: Trade on wrong side (buy aggressor against our buy order) → no fill
  const o2 = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 20 });
  const r3 = onTrade(o2, { tradePrice: 100, tradeSize: 5, aggressorSide: 'buy' });
  ok(!r3.filled && r3.fillQty === 0 && o2.queueAhead === 20, 'A3: buy aggressor → no drain on buy resting order');

  // A4: Trade at wrong price → no fill
  const o3 = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 20 });
  const r4 = onTrade(o3, { tradePrice: 101, tradeSize: 30, aggressorSide: 'sell' });
  ok(!r4.filled && r4.fillQty === 0 && o3.queueAhead === 20, 'A4: trade at price 101 > our buy 100 → no drain');

  // A5: Sell aggressor at our price → drains queue first, no fill while queueAhead > 0
  const o4 = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 30 });
  const r5a = onTrade(o4, { tradePrice: 100, tradeSize: 20, aggressorSide: 'sell' });
  ok(!r5a.filled && r5a.fillQty === 0 && o4.queueAhead === 10, 'A5a: 20 drains queueAhead from 30→10, no fill yet');

  // A6: Drain remaining queue → fills our order
  const r5b = onTrade(o4, { tradePrice: 100, tradeSize: 15, aggressorSide: 'sell' });
  // queueAhead was 10: first 10 drain queue, remaining 5 fills our 10-size order (partial fill)
  ok(!r5b.filled && r5b.fillQty === 5 && o4.remaining === 5, 'A6: partial fill after queue exhausted');

  // A7: Another trade fills remaining
  const r5c = onTrade(o4, { tradePrice: 100, tradeSize: 10, aggressorSide: 'sell' });
  ok(r5c.filled && o4.fillQty === 10 && o4.remaining === 0, 'A7: second trade completes fill, filled=true');

  // A8: Once filled, onTrade is a no-op
  const r5d = onTrade(o4, { tradePrice: 100, tradeSize: 100, aggressorSide: 'sell' });
  ok(r5d.filled && r5d.fillQty === 0, 'A8: already-filled order → onTrade no-op');

  // A9: Sell order fills on buy aggressor lifting our ask
  const o5 = newMakerOrder({ side: 'sell', price: 105, size: 5, queueAheadAtJoin: 0 });
  const r9 = onTrade(o5, { tradePrice: 105, tradeSize: 5, aggressorSide: 'buy' });
  ok(r9.filled && r9.fillQty === 5, 'A9: sell order fills on buy aggressor at our price, zero queue ahead');

  // A10: Buy aggressor at price < our ask → no fill on sell order
  const o6 = newMakerOrder({ side: 'sell', price: 105, size: 5, queueAheadAtJoin: 0 });
  const r10 = onTrade(o6, { tradePrice: 104, tradeSize: 10, aggressorSide: 'buy' });
  ok(!r10.filled && r10.fillQty === 0, 'A10: buy aggressor at 104 < ask 105 → no fill on sell order');

  // A11: onBookUpdate — level shrinks more than trades explain → queueAhead reduced proportionally
  // Setup: queueAhead=40, remaining=10, total expected level=50. levelSizeNow=30 → shrink=20.
  // queueFrac = 40/50 = 0.8. cancelAhead = 20 × 0.8 = 16. new queueAhead = 40-16 = 24.
  const o7 = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 40 });
  const r11 = onBookUpdate(o7, 30);
  ok(near(r11.cancelledInferred, 16, 1e-6) && near(o7.queueAhead, 24, 1e-6),
    `A11: cancel inference: queueAhead 40→24, cancelled=16 (got qa=${o7.queueAhead}, cancelled=${r11.cancelledInferred})`);

  // A12: Level grows → no cancel inference
  const o8 = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 20 });
  const r12 = onBookUpdate(o8, 50); // bigger than expected → fresh orders added
  ok(r12.cancelledInferred === 0 && o8.queueAhead === 20, 'A12: level grows → no cancel inference');

  // A13: Adverse selection — buy fill, mid falls after → positive bps (we overpaid)
  const fillTs = 1000;
  const midSeries = [
    { ts: 900, mid: 100 },
    { ts: 1000, mid: 100 },
    { ts: 1500, mid: 99 }, // mid fell 1% 500ms after fill
    { ts: 2000, mid: 98.5 },
  ];
  const adv = trackAdverseSelection({ side: 'buy', fillPrice: 100, fillTs, windowMs: 500 }, midSeries);
  // midAtFill=100, midAfter=99, adverse = (100-99)/100 = 0.01 = 100bps
  ok(near(adv, 100, 1e-3), `A13: buy fill, mid drops 1% → 100bps adverse selection (got ${adv})`);

  // A14: Sell fill, mid rises after → positive bps
  const adv2 = trackAdverseSelection({ side: 'sell', fillPrice: 100, fillTs, windowMs: 500 }, midSeries);
  // midAfter=99, (99-100)/100 = -0.01 → sell: (midAfter-midAtFill)/midAtFill = -0.01 → -100bps
  // price fell which is GOOD for a sell (we got out above the future mid) → negative adverse = favorable
  ok(near(adv2, -100, 1e-3), `A14: sell fill, mid drops → -100bps (favorable for seller, got ${adv2})`);

  // A15: Bad input to adverse selection → NaN
  const adv3 = trackAdverseSelection(null, []);
  ok(!isNum(adv3) || isNaN(adv3), 'A15: null fill → NaN');

  // ── PART B: OFI PREDICTIVITY MEASUREMENT HARNESS ──────────────────────────

  // B1: Construct a series where mid moves proportionally to lagged OFI.
  // For lag=100ms: mid at t+100 = mid_t + k × ofi_t, where k=0.001.
  // This should produce high correlation at lag=100, lower at 200/300 (noise takes over).
  const N = 200;
  const k = 0.001; // mid moves k × ofi at lag 100ms
  const syntheticRecords = [];
  const rng = (() => { let s = 42; return () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; }; })();

  for (let i = 0; i < N; i++) {
    const ofi = (rng() - 0.5) * 20; // ±10 range
    syntheticRecords.push({ ts: i * 100, ofi, mid: 100 });
  }
  // Now set mid[i] = 100 + k × ofi[i-1] (so lag=100ms is the "correct" lag)
  // We rebuild midpoints in a second pass
  const anchored = syntheticRecords.map((r, i) => {
    if (i === 0) return r;
    const prevOfi = syntheticRecords[i - 1].ofi;
    return { ...r, mid: 100 + k * prevOfi };
  });

  const lagStats = measureOfiPredictivity(anchored, [100, 200, 300, 500, 1000]);

  ok(Array.isArray(lagStats) && lagStats.length === 5, 'B1: 5 lag results returned');

  const lag100 = lagStats.find(s => s.lag === 100);
  ok(lag100 && isNum(lag100.r2) && lag100.r2 > 0.15,
    `B1: lag=100ms recovers high R² in constructed series (R²=${lag100?.r2})`);

  const lag1000 = lagStats.find(s => s.lag === 1000);
  ok(lag1000 && isNum(lag1000.r2) && lag1000.r2 < lag100.r2,
    `B1: lag=1000ms R² lower than lag=100ms (signal decays; 1000=${lag1000?.r2}, 100=${lag100?.r2})`);

  ok(lag100 && isNum(lag100.correlation), 'B1: correlation is a number');
  ok(lag100 && isNum(lag100.directionalHitRate) && lag100.directionalHitRate > 0.5,
    `B1: directional hit-rate > 0.5 at correct lag (got ${lag100?.directionalHitRate})`);
  ok(lag100 && lag100.n > 0, 'B1: n > 0');

  // B2: Empty / bad input → []
  ok(Array.isArray(measureOfiPredictivity([], [100, 200])) && measureOfiPredictivity([], [100]).length === 0, 'B2: empty records → []');
  ok(Array.isArray(measureOfiPredictivity(anchored, [])) && measureOfiPredictivity(anchored, []).length === 0, 'B2: empty lags → []');
  ok(Array.isArray(measureOfiPredictivity(null, [100])) && measureOfiPredictivity(null, [100]).length === 0, 'B2: null records → []');

  // B3: summarizeOfi labels correctly
  const summary = summarizeOfi(lagStats);
  ok(typeof summary.verdict === 'string' && summary.verdict.length > 0, 'B3: verdict is a non-empty string');
  ok(Array.isArray(summary.meaningful) && Array.isArray(summary.marginal) && Array.isArray(summary.noise), 'B3: all three buckets present');
  ok(summary.meaningful.length > 0 || summary.marginal.length > 0 || summary.noise.length > 0, 'B3: at least one bucket populated');
  // The constructed series should produce a meaningful result at lag=100
  ok(summary.meaningful.some(s => s.lag === 100), `B3: lag=100ms in meaningful bucket (R²=${lag100?.r2})`);

  // B4: All-noise series
  const noiseSeries = Array.from({ length: 50 }, (_, i) => ({ ts: i * 100, ofi: 0, mid: 100 }));
  const noiseStats = measureOfiPredictivity(noiseSeries, [100, 200]);
  const noiseSummary = summarizeOfi(noiseStats);
  ok(noiseSummary.noise.length > 0 || noiseStats.every(s => !isNum(s.r2) || isNaN(s.r2)), 'B4: zero-ofi series → noise or NaN');

  // B5: summarizeOfi with empty input → NO_DATA verdict
  const emptySum = summarizeOfi([]);
  ok(emptySum.verdict === 'NO_DATA', 'B5: empty lagStats → NO_DATA');

  // ── RESULT ──────────────────────────────────────────────────────────────────
  console.log(`maker-exec-measure --test: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}
