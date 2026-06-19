// @capability: maker-exec-measure
// @serves: queue-honest maker fill | queue position | order fill model | GTX post-only | adverse selection | OFI predictivity | order flow imbalance measurement | maker execution measurement | fill model
// @does: (A) Queue-honest GTX maker fill model — tracks queueAhead at join, consumes it via opposing aggressor trades, fires fill only when queue exhausted, measures adverse selection bps. Opt-in queueDecay model additionally credits queueAhead for cancellations observed via level-size shrinkage not explained by trades. (B) OFI predictivity harness — Pearson correlation(ofi, futureΔmid) per lag, R², directional hit-rate, meaningful/marginal/noise verdict. Pure compute, fail-open.
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
 *
 *   ── QUEUE-DECAY MODEL (opt-in via queueDecay:true or decayModel on newMakerOrder) ──
 *   _queueDecay:        boolean             — true when the cancel-aware decay model is active
 *   _cancelAheadShare:  number (0..1)       — fraction of inferred cancels credited to queue-ahead (default 0.5)
 *   _levelSizeTracked:  number              — last observed total level size (queueAhead + our remaining, updated each book update)
 *   _tradeSinceBook:    number              — trade volume consumed from our level since the last onBookUpdate call
 *                                             (lets onBookUpdate split a level-size drop into traded vs cancelled)
 * }
 *
 * QUEUE-DECAY ATTRIBUTION RULE (when _queueDecay === true):
 *   On each onBookUpdate(levelSizeNow):
 *     rawDrop = _levelSizeTracked - levelSizeNow          // how much the visible level shrank
 *     if rawDrop <= 0: _levelSizeTracked = levelSizeNow; no-op (level grew or held)   [size-INCREASE = no spurious advance]
 *     cancelVolume = max(0, rawDrop - _tradeSinceBook)    // shrinkage NOT explained by trades at our level = cancels
 *     cancelAhead  = cancelVolume × _cancelAheadShare      // only the ahead-portion helps our queue position
 *     queueAhead  -= cancelAhead  (floored at 0)
 *     _levelSizeTracked = levelSizeNow; _tradeSinceBook = 0
 *
 *   WHY: real maker queues shrink from BOTH executions AND cancellations of orders ahead of us.
 *   The OFF path only drains queueAhead on trades (plus a pro-rata book heuristic). The ON path
 *   isolates the cancel portion precisely by subtracting trades-at-our-level (tracked in
 *   _tradeSinceBook) from the raw level-size drop, then credits only _cancelAheadShare of those
 *   cancels to our queue. _cancelAheadShare defaults to 0.5 (uniform/pro-rata); raise it toward 1.0
 *   to model cancels clustering ahead of us (we advance faster); lower toward 0 to model cancels
 *   clustering behind us (cancels behind us do NOT help our fill). A cancel behind us never helps;
 *   a cancel ahead always helps — the share parameterizes our uncertainty about WHERE in the queue
 *   the cancels landed. This corrects the OFF-path drift (which recomputes "expected level" from an
 *   already-reduced queueAhead) by tracking the level size independently.
 */

/**
 * newMakerOrder({ side, price, size, queueAheadAtJoin, queueDecay, decayModel })
 *
 * Creates a new GTX post-only maker order state. The order joins the BACK of the
 * queue at `price`. `queueAheadAtJoin` is the visible resting size at that level
 * at the moment we submit. Fail-open: bad inputs produce a sentinel with filled=true
 * and remaining=0 so callers can safely ignore it.
 *
 * QUEUE-DECAY (opt-in, default OFF = byte-identical current behavior):
 *   queueDecay: true            — enable the cancel-aware queue-decay model with defaults
 *                                 (cancelAheadShare = 0.5, i.e. cancels credited pro-rata).
 *   decayModel: { enabled, cancelAheadShare }
 *                               — richer form. enabled:true turns it on; cancelAheadShare ∈ [0,1]
 *                                 sets the fraction of inferred cancels credited to queue-ahead.
 *                                 If both queueDecay and decayModel are given, decayModel wins.
 *
 * When OFF (neither given, or enabled falsy), the order state carries NO decay fields and
 * onBookUpdate/onTrade execute the exact legacy code path — tape-replay.simulateOrder is
 * unaffected unless the caller explicitly opts in.
 *
 * @param {{ side: 'buy'|'sell', price: number, size: number, queueAheadAtJoin: number, queueDecay?: boolean, decayModel?: { enabled?: boolean, cancelAheadShare?: number } }} opts
 * @returns {object} order state
 */
export function newMakerOrder({ side, price, size, queueAheadAtJoin, queueDecay, decayModel } = {}) {
  try {
    const s = side === 'buy' || side === 'sell' ? side : null;
    const p = isNum(price) && price > 0 ? price : null;
    const sz = isNum(size) && size > 0 ? size : null;
    const qa = isNum(queueAheadAtJoin) && queueAheadAtJoin >= 0 ? queueAheadAtJoin : null;
    if (!s || !p || !sz || qa === null) {
      // Fail-open sentinel: treated as already done / invalid
      return { side: s || 'buy', price: p || 0, size: sz || 0, queueAhead: 0, remaining: 0, filled: true, fillQty: 0, _tradeConsumed: 0, _invalid: true };
    }
    // Resolve the queue-decay option. decayModel (if provided and well-formed) takes precedence
    // over the simple queueDecay boolean. Bad decayModel → silently degrades to OFF (fail-open).
    let decayOn = false;
    let cancelAheadShare = 0.5;
    if (decayModel && typeof decayModel === 'object') {
      if (decayModel.enabled === true) decayOn = true;
      if (isNum(decayModel.cancelAheadShare) && decayModel.cancelAheadShare >= 0 && decayModel.cancelAheadShare <= 1) {
        cancelAheadShare = decayModel.cancelAheadShare;
      }
    } else if (queueDecay === true) {
      decayOn = true;
    }
    const base = { side: s, price: p, size: sz, queueAhead: qa, remaining: sz, filled: false, fillQty: 0, _tradeConsumed: 0 };
    if (decayOn) {
      base._queueDecay = true;
      base._cancelAheadShare = cancelAheadShare;
      base._levelSizeTracked = qa + sz;   // total visible level size at join
      base._tradeSinceBook = 0;
    }
    return base;
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
      if (order._queueDecay) order._tradeSinceBook += drainQueue;
      tradeLeft -= drainQueue;
    }

    // If queue is exhausted and there is trade volume left, fill our order.
    let fillQty = 0;
    if (order.queueAhead <= 0 && tradeLeft > 0) {
      fillQty = Math.min(order.remaining, tradeLeft);
      order.remaining -= fillQty;
      order.fillQty += fillQty;
      order._tradeConsumed += fillQty;
      if (order._queueDecay) order._tradeSinceBook += fillQty;
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
 * Called when the book snapshot for our price level is updated.
 *
 * OFF path (order._queueDecay falsy — the default): legacy pro-rata cancel inference.
 *   If the level's visible size shrank MORE than trades alone explain, we proportionally
 *   reduce queueAhead. This is the original behavior; tape-replay.simulateOrder hits this
 *   path unless it explicitly opts into queueDecay.
 *
 * ON path (order._queueDecay === true): cancel-aware queue-decay model. Tracks the level
 *   size independently (_levelSizeTracked) and the trade volume consumed since the last
 *   book update (_tradeSinceBook), so a level-size drop is split precisely into
 *   traded vs cancelled. Only the cancel-ahead portion (_cancelAheadShare of cancels)
 *   is credited to queueAhead. See the QUEUE-DECAY ATTRIBUTION RULE in the ORDER STATE
 *   SHAPE doc above.
 *
 * FAIL-OPEN: mutates order in place; returns safe default on bad input. A malformed
 * update (non-number, negative) is a no-op — never throws, never spurious-advances.
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

    // ── ON PATH: cancel-aware queue-decay model ──────────────────────────────
    if (order._queueDecay) {
      // Fail-open guard: if decay bookkeeping is somehow missing/corrupt, degrade to a
      // safe no-op rather than computing on undefined.
      if (!isNum(order._levelSizeTracked) || !isNum(order._tradeSinceBook) || !isNum(order._cancelAheadShare)) {
        return { queueAhead: order.queueAhead, cancelledInferred: 0 };
      }
      const rawDrop = order._levelSizeTracked - levelSizeNow;
      // Resync the tracked level size regardless (so the next call compares against this snapshot).
      order._levelSizeTracked = levelSizeNow;
      const tradedSince = order._tradeSinceBook;
      order._tradeSinceBook = 0;

      if (rawDrop <= 0) {
        // Level grew or held (new orders joined, or no net shrink) → no cancel to credit.
        // A size INCREASE must NEVER spuriously advance our queue.
        return { queueAhead: order.queueAhead, cancelledInferred: 0 };
      }

      // cancelVolume = shrinkage not explained by trades at our level.
      // Clamp at 0: if trades alone explain more than the drop (e.g. a trade hit a level
      // that also got new orders), there is no cancel to credit.
      const cancelVolume = Math.max(0, rawDrop - tradedSince);
      if (cancelVolume <= 0) {
        return { queueAhead: order.queueAhead, cancelledInferred: 0 };
      }

      // Only the ahead-portion of the cancels helps our queue position.
      const cancelAhead = Math.min(order.queueAhead, cancelVolume * order._cancelAheadShare);
      order.queueAhead = Math.max(0, order.queueAhead - cancelAhead);

      return { queueAhead: order.queueAhead, cancelledInferred: cancelAhead };
    }

    // ── OFF PATH: legacy pro-rata cancel inference (byte-identical to prior behavior) ──
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

  // ── PART A2: QUEUE-DECAY MODEL (opt-in cancel-aware queue advancement) ────

  // D1 (GREEN): level-size drop with NO trade → queueDecay ON advances queueAhead;
  //             queueDecay OFF leaves queueAhead unchanged (current behavior).
  //   Setup: queueAhead=40, size=10, total level=50. cancelAheadShare=1.0 (all cancels ahead).
  //   Book update: level 50→30 (20 cancelled, zero trades). cancelVolume=20, cancelAhead=20*1.0=20.
  //   ON: queueAhead 40→20. OFF: queueAhead stays 40.
  const dOn = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 40, decayModel: { enabled: true, cancelAheadShare: 1.0 } });
  ok(dOn._queueDecay === true && dOn._cancelAheadShare === 1.0 && dOn._levelSizeTracked === 50 && dOn._tradeSinceBook === 0,
    'D1: decay order seeded with _levelSizeTracked=50, _tradeSinceBook=0');
  const rD1on = onBookUpdate(dOn, 30);
  ok(near(dOn.queueAhead, 20, 1e-6) && near(rD1on.cancelledInferred, 20, 1e-6),
    `D1-ON: no-trade drop 50→30 with share=1.0 → queueAhead 40→20 (got qa=${dOn.queueAhead}, cancelled=${rD1on.cancelledInferred})`);

  const dOff = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 40 });
  ok(dOff._queueDecay === undefined, 'D1: default order has no _queueDecay field (OFF)');
  const rD1off = onBookUpdate(dOff, 30);
  // OFF path: expectedFromTrades=40+10=50, levelChange=50-30=20, queueFrac=40/50=0.8, cancelAhead=20*0.8=16 → qa=24
  ok(near(dOff.queueAhead, 24, 1e-6) && near(rD1off.cancelledInferred, 16, 1e-6),
    `D1-OFF: same drop via legacy pro-rata → queueAhead 40→24, cancelled=16 (got qa=${dOff.queueAhead}, cancelled=${rD1off.cancelledInferred})`);
  // The ON and OFF paths give DIFFERENT results for the same book event — confirms the model diverges as designed.
  ok(dOn.queueAhead !== dOff.queueAhead, 'D1: ON (qa=20) ≠ OFF (qa=24) for same drop — models diverge');

  // D2 (GREEN, default share 0.5): queueDecay:true shorthand seeds cancelAheadShare=0.5.
  const dHalf = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 40, queueDecay: true });
  ok(dHalf._queueDecay === true && dHalf._cancelAheadShare === 0.5, 'D2: queueDecay:true → cancelAheadShare defaults to 0.5');
  // Book 50→30, no trade: cancelVolume=20, cancelAhead=20*0.5=10 → qa=30.
  onBookUpdate(dHalf, 30);
  ok(near(dHalf.queueAhead, 30, 1e-6), `D2: share=0.5 → queueAhead 40→30 (got ${dHalf.queueAhead})`);

  // D3 (cancelAheadShare=0): cancels credited to zero ahead → queueAhead UNCHANGED (all cancels behind us).
  const dZero = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 40, decayModel: { enabled: true, cancelAheadShare: 0 } });
  onBookUpdate(dZero, 30);
  ok(near(dZero.queueAhead, 40, 1e-6), `D3: share=0 (cancels behind us) → queueAhead unchanged at 40 (got ${dZero.queueAhead})`);

  // D4 (RED — size INCREASE): level grows → no spurious advance on either path.
  const dGrow = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 40, queueDecay: true });
  const rD4 = onBookUpdate(dGrow, 80); // level grew 50→80 (new orders joined ahead/behind)
  ok(near(dGrow.queueAhead, 40, 1e-6) && rD4.cancelledInferred === 0,
    `D4-RED: size increase 50→80 → no advance, cancelled=0 (got qa=${dGrow.queueAhead}, cancelled=${rD4.cancelledInferred})`);
  ok(dGrow._levelSizeTracked === 80, 'D4: _levelSizeTracked resynced to 80 after growth');

  // D5 (RED — malformed update): non-number / negative → fail-open no-op, no throw.
  const dBad = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 40, queueDecay: true });
  const rNaN = onBookUpdate(dBad, NaN);
  const rNeg = onBookUpdate(dBad, -5);
  const rStr = onBookUpdate(dBad, 'big');
  ok(near(dBad.queueAhead, 40, 1e-6) && rNaN.cancelledInferred === 0 && rNeg.cancelledInferred === 0 && rStr.cancelledInferred === 0,
    'D5-RED: NaN/negative/string levelSize → fail-open no-op, queueAhead unchanged');
  // Calling onBookUpdate with a valid number after bad inputs still works (no state corruption).
  const rRecover = onBookUpdate(dBad, 30);
  ok(dBad.queueAhead < 40 && rRecover.cancelledInferred > 0, 'D5: valid update after bad inputs still infers cancels (state intact)');

  // D6 (RED — bad decayModel): malformed decayModel → silently OFF (fail-open).
  const dBadModel = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 40, decayModel: { enabled: 'yes' } });
  ok(dBadModel._queueDecay === undefined, 'D6: decayModel.enabled="yes" (non-bool) → decays to OFF');
  const dBadShare = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 40, decayModel: { enabled: true, cancelAheadShare: 1.5 } });
  ok(dBadShare._cancelAheadShare === 0.5, 'D6: cancelAheadShare=1.5 (out of range) → falls back to default 0.5');

  // D7 (trade+cancel split): a level drop partly from trades, partly from cancels — only the cancel
  //     portion credits queueAhead beyond what the trade already drained.
  //   queueAhead=40, size=10, share=1.0. Trade of 8 (sell aggressor) drains queue 40→32, _tradeSinceBook=8.
  //   Then book update: level 50→36. rawDrop=50-36=14. tradedSince=8. cancelVolume=max(0,14-8)=6. cancelAhead=6*1.0=6.
  //   queueAhead = 32 - 6 = 26.  (The trade already drained 8; the cancel drains 6 more; total drop 14 = 8 trade + 6 cancel.)
  const dSplit = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 40, decayModel: { enabled: true, cancelAheadShare: 1.0 } });
  const rT = onTrade(dSplit, { tradePrice: 100, tradeSize: 8, aggressorSide: 'sell' });
  ok(near(dSplit.queueAhead, 32, 1e-6) && rT.fillQty === 0, `D7: trade 8 drains queue 40→32 (got ${dSplit.queueAhead})`);
  ok(dSplit._tradeSinceBook === 8, 'D7: _tradeSinceBook=8 after trade');
  const rSplit = onBookUpdate(dSplit, 36);
  ok(near(dSplit.queueAhead, 26, 1e-6) && near(rSplit.cancelledInferred, 6, 1e-6),
    `D7: drop 50→36 with 8 traded → cancelVolume=6, queueAhead 32→26 (got qa=${dSplit.queueAhead}, cancelled=${rSplit.cancelledInferred})`);
  ok(dSplit._tradeSinceBook === 0, 'D7: _tradeSinceBook reset to 0 after book update');

  // D8 (cancel fully exhausts queue, then a trade fills us): cancels can clear queueAhead to 0,
  //     then the next trade at our price fills our order (decay accelerates fill).
  const dFill = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 40, decayModel: { enabled: true, cancelAheadShare: 1.0 } });
  onBookUpdate(dFill, 10); // level 50→10: rawDrop=40, no trade, cancelVolume=40, cancelAhead=40 → queueAhead=0
  ok(near(dFill.queueAhead, 0, 1e-6), `D8: 40 cancelled ahead → queueAhead 40→0 (got ${dFill.queueAhead})`);
  ok(!dFill.filled, 'D8: queue exhausted by cancels alone does NOT auto-fill (still needs a trade to cross)');
  const rFill = onTrade(dFill, { tradePrice: 100, tradeSize: 5, aggressorSide: 'sell' });
  ok(rFill.filled === false && rFill.fillQty === 5 && dFill.remaining === 5,
    `D8: after queue cleared by cancels, trade fills 5 of 10 (got fillQty=${rFill.fillQty}, remaining=${dFill.remaining})`);

  // D9 (METAMORPHIC): more cancels-ahead → fill at an earlier/equal trade index vs trades-only.
  //   Scenario: queueAhead=100, size=10. Feed a sequence of 5 trades of size 15 each (sell aggressors).
  //   - Pure-trades order (OFF): each trade drains 15 from queue. After 7 trades (105) queue hits 0,
  //     but we only have 5 trades → queueAhead = 100 - 75 = 25, never fills.
  //   - Decay order (ON, share=1.0): after each trade, a book update shows the level shrank by
  //     MORE than the trade (extra = cancels). We inject 20 cancel-volume per step. After 5 steps:
  //     trades drain 75, cancels drain 5*20=100 → queue drained 175 → queueAhead=0 well before trade 5 ends.
  //     The decay order fills; the trades-only order does NOT. More cancels → faster fill. ✓
  const tradesSeq = Array.from({ length: 5 }, () => ({ tradePrice: 100, tradeSize: 15, aggressorSide: 'sell' }));
  // Pure trades (OFF):
  const mOff = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 100 });
  let offFilled = false;
  for (const t of tradesSeq) { const r = onTrade(mOff, t); if (r.filled) { offFilled = true; break; } }
  ok(!offFilled, `D9: trades-only (OFF) does NOT fill in 5×15=75 < 100 queue (queueAhead=${mOff.queueAhead})`);
  // Decay (ON) with cancels injected between trades:
  const mOn = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 100, decayModel: { enabled: true, cancelAheadShare: 1.0 } });
  // level starts at 110 (100 queue + 10 ours). After trade 15 + cancel 20, level drops 35 each step.
  let onFilledTick = -1;
  let level = 110;
  for (let i = 0; i < tradesSeq.length; i++) {
    const r = onTrade(mOn, tradesSeq[i]);
    if (r.filled) { onFilledTick = i; break; }
    level -= 15 + 20; // trade 15 + cancel 20
    onBookUpdate(mOn, level);
    if (mOn.filled) { onFilledTick = i; break; }
  }
  ok(mOn.filled && onFilledTick >= 0,
    `D9: decay (ON) with cancels FILLS at trade index ${onFilledTick} (queueAhead=${mOn.queueAhead}, remaining=${mOn.remaining})`);
  ok(!offFilled && mOn.filled, 'D9 METAMORPHIC: more cancels-ahead → faster fill (ON fills, OFF does not)');

  // D10 (IDENTITY): OFF path reproduces the exact legacy fill outcomes for a full trade sequence.
  //     Run the same {trade, book} sequence through an OFF order and a pre-change reference; since we
  //     can't import the old version, we assert the OFF arithmetic matches the documented legacy formula
  //     on a known sequence (queueAhead=30, two trades + one book update).
  const idOff = newMakerOrder({ side: 'buy', price: 100, size: 10, queueAheadAtJoin: 30 });
  onTrade(idOff, { tradePrice: 100, tradeSize: 10, aggressorSide: 'sell' }); // queue 30→20
  onBookUpdate(idOff, 25); // expected=20+10=30, change=30-25=5, frac=20/30=0.667, cancelAhead=5*0.667=3.333 → qa=16.667
  onTrade(idOff, { tradePrice: 100, tradeSize: 20, aggressorSide: 'sell' }); // queue 16.667→0 (drain 16.667), fill 3.333 of 10
  ok(near(idOff.queueAhead, 0, 1e-6), `D10: OFF queueAhead=0 after drain (got ${idOff.queueAhead})`);
  // Precise identity check: fillQty should be 20 - 16.6667 = 3.3333
  ok(near(idOff.fillQty, 3.333333, 1e-3), `D10: OFF fillQty=3.3333 matches legacy formula (got ${idOff.fillQty})`);
  ok(idOff._queueDecay === undefined && idOff._levelSizeTracked === undefined && idOff._tradeSinceBook === undefined,
    'D10: OFF order has ZERO decay fields (byte-identical state shape)');

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
