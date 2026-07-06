// @capability: orderflow-maker-fill
// @serves: maker fill | passive fill | post-only | maker vs taker | fee bleed | queue position | orderflow execution
// @does: Pure maker-vs-taker fill-decision model — defaults orderflow-paper.mjs entries/exits to a
//   post-only resting order at the near touch (maker fee, often a rebate) instead of always crossing
//   the spread (taker fee), escalating to taker only when urgency is high and skipping when the
//   spread is too tight for the edge to survive round-trip cost.
// @use: const d = makerFillDecision({ side, book, urgency, queueState }, opts); use d.mode to route
//   orderflow-paper.mjs's onBook callback to a resting post-only order (maker) vs an immediate
//   submitPaperOrder crossing the spread (taker), or to withhold the order entirely (skip).
// @exports: makerFillDecision

/**
 * orderflow-maker-fill.mjs — maker/taker/skip fill-decision model
 *
 * WHY THIS EXISTS: orderflow-paper.mjs currently CROSSES THE SPREAD (taker) on every entry/exit —
 * a 45s live BTCUSDT run lost -15.8 bps largely to taker fees over 8 round-trips. This module is
 * the fee-bleed stopper: default to POSTING PASSIVELY (maker fee, often a rebate on the real venue)
 * and only pay taker when the signal would decay before a passive fill could land.
 *
 * COMPOSITION (capability-first — no new fill/fee machinery invented here):
 *   - Queue-honest fill mechanics from maker-exec-measure.mjs (newMakerOrder / onTrade): a resting
 *     order joins the BACK of the queue and only fills once the size ahead of it is consumed. We
 *     reuse that exact queueAhead-drain arithmetic (scaled to a probability) to estimate
 *     expectedFillProb from queueState instead of inventing a second fill-probability formula.
 *   - Fee-schedule constants from maker-fill-sim.mjs (FEE_SCHEDULES['binance-vip0']: maker 0.0002 /
 *     taker 0.0005 per side) — the same asymmetry afl-paper.mjs's binanceFeeModel('maker'|'taker')
 *     charges live. A maker fill both CAPTURES the half-spread and pays the lower per-side fee;
 *     that double asymmetry is the whole point of posting instead of crossing.
 *   - The book shape ({bids, asks, mid, spreadBps}) matches exactly what orderflow-paper.mjs's
 *     onBook callback already receives and forwards into engine.onSignal(ctx.book) — so the caller
 *     can wire this straight in without reshaping data.
 *
 * PURE: no I/O, no network, no Date.now() — every input (book, urgency, queueState) arrives from
 * the caller. Fail-open: malformed input degrades to a safe 'skip' rather than throwing.
 */

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Per-side fee rates — mirrors maker-fill-sim.mjs FEE_SCHEDULES['binance-vip0'] /
 *  afl-paper.mjs binanceFeeModel('maker'|'taker') VIP0 tier (2bps maker / 5bps taker per side). */
export const DEFAULT_FEES = { maker: 0.0002, taker: 0.0005 };

/** Round-trip taker cost = 2 × taker fee (both legs cross the spread and pay taker).
 *  Round-trip maker cost = 2 × maker fee, but a filled maker CAPTURES ~spread instead of paying it —
 *  see SKIP logic below. */
const DEFAULT_URGENCY_THRESHOLD = 0.7;

/** Minimum spread (bps) for a passive rest to have any edge left after round-trip maker fees. Below
 *  this, even a maker fill nets negative before the strategy's own gross edge is counted — skip. */
const DEFAULT_MIN_SPREAD_BPS = 1.0;

/**
 * Queue-honest fill-probability proxy, reusing the maker-exec-measure.mjs queue-drain model:
 * a resting order fills once the size ahead of it (queueAhead) is consumed by opposing volume.
 * Rather than simulate a trade tape here (that's maker-exec-measure's job — onTrade/onBookUpdate),
 * we collapse its steady-state intuition into a monotone probability:
 *   fillProb = levelDepth / (levelDepth + queueAhead)   — thin/no queue ahead → high P(fill);
 *   deep queue ahead relative to visible level depth → low P(fill).
 * This is the same queueAhead-drives-fill-probability mechanism as newMakerOrder/onTrade, expressed
 * as an expectation instead of an event sequence (this module has no tape to replay against).
 *
 * @param {{queueAhead?: number, levelDepth?: number}} queueState
 * @returns {number} probability in [0,1]
 */
function queueFillProb(queueState) {
  const qa = isNum(queueState?.queueAhead) && queueState.queueAhead >= 0 ? queueState.queueAhead : 0;
  const depth = isNum(queueState?.levelDepth) && queueState.levelDepth > 0 ? queueState.levelDepth : 1;
  // qa === 0 (front of queue, e.g. a fresh/thin level) → fillProb 1. Deep queue → asymptotes to 0.
  return clamp01(depth / (depth + qa));
}

/**
 * makerFillDecision({ side, book, urgency, queueState }, opts) → decision
 *
 * @param {{
 *   side: 'buy'|'sell',
 *   book: { bids: Array<[number,number]|{price:number,size:number}>, asks: Array<[number,number]|{price:number,size:number}>, mid: number, spreadBps?: number },
 *   urgency?: number,       // 0..1, how fast the signal decays if not filled now (default 0)
 *   queueState?: { queueAhead?: number, levelDepth?: number },
 * }} input
 * @param {{
 *   fees?: { maker: number, taker: number },
 *   urgencyThreshold?: number,   // urgency >= this → escalate to taker (default 0.7)
 *   minSpreadBps?: number,       // spread below this → skip (default 1.0 bps)
 *   minFillProbToRest?: number,  // below this, resting isn't worth it even at low urgency (default 0.05)
 * }} [opts]
 * @returns {{ mode: 'maker'|'taker'|'skip', refPrice: number, expectedFillProb: number, feeType: 'maker'|'taker', reason: string }}
 */
export function makerFillDecision(input, opts = {}) {
  const fees = { ...DEFAULT_FEES, ...(opts.fees || {}) };
  const urgencyThreshold = isNum(opts.urgencyThreshold) ? opts.urgencyThreshold : DEFAULT_URGENCY_THRESHOLD;
  const minSpreadBps = isNum(opts.minSpreadBps) ? opts.minSpreadBps : DEFAULT_MIN_SPREAD_BPS;
  const minFillProbToRest = isNum(opts.minFillProbToRest) ? opts.minFillProbToRest : 0.05;

  const side = input?.side;
  const book = input?.book;
  const urgency = isNum(input?.urgency) ? clamp01(input.urgency) : 0;
  const queueState = input?.queueState || {};

  // Fail-open: malformed core input → skip (never throw, never guess a price).
  if (side !== 'buy' && side !== 'sell') {
    return { mode: 'skip', refPrice: NaN, expectedFillProb: 0, feeType: 'maker', reason: 'invalid_side' };
  }
  if (!book || !isNum(book.mid) || book.mid <= 0) {
    return { mode: 'skip', refPrice: NaN, expectedFillProb: 0, feeType: 'maker', reason: 'invalid_book' };
  }

  const bestBid = topOf(book.bids);
  const bestAsk = topOf(book.asks);
  if (!isNum(bestBid) || !isNum(bestAsk) || bestAsk <= bestBid) {
    return { mode: 'skip', refPrice: NaN, expectedFillProb: 0, feeType: 'maker', reason: 'invalid_touch' };
  }

  const spreadBps = isNum(book.spreadBps) ? book.spreadBps : ((bestAsk - bestBid) / book.mid) * 1e4;

  // ── SKIP: spread too tight for a maker round-trip to survive cost ──────────────────────────
  // A filled maker CAPTURES the spread and pays 2×makerFee round-trip; if the spread itself is
  // thinner than the round-trip maker fee, there is no edge left even before the strategy's own
  // gross signal is counted — resting here is pure fee-bleed with extra steps.
  const makerRtFeeBps = 2 * fees.maker * 1e4;
  if (spreadBps < minSpreadBps || spreadBps <= makerRtFeeBps) {
    return {
      mode: 'skip',
      refPrice: side === 'buy' ? bestBid : bestAsk,
      expectedFillProb: 0,
      feeType: 'maker',
      reason: `spread_too_tight (spreadBps=${round(spreadBps)} < floor=${round(Math.max(minSpreadBps, makerRtFeeBps))})`,
    };
  }

  // ── TAKER: urgency high enough that passive resting risks missing the signal ───────────────
  if (urgency >= urgencyThreshold) {
    return {
      mode: 'taker',
      refPrice: side === 'buy' ? bestAsk : bestBid, // taker crosses to the opposite side's touch
      expectedFillProb: 1,
      feeType: 'taker',
      reason: `urgency_high (${round(urgency)} >= ${round(urgencyThreshold)})`,
    };
  }

  // ── MAKER (default): rest passively at the near touch on our own side ──────────────────────
  const refPrice = side === 'buy' ? bestBid : bestAsk; // maker rests ON our own side's touch, never crosses
  const expectedFillProb = queueFillProb(queueState);

  // Deep queue + low urgency: still worth resting (fee saved > opportunity cost) UNLESS fill
  // probability is so low the order is functionally decorative. At that point taker is the
  // honest fallback rather than silently never filling.
  if (expectedFillProb < minFillProbToRest && urgency > 0) {
    return {
      mode: 'taker',
      refPrice: side === 'buy' ? bestAsk : bestBid,
      expectedFillProb: 1,
      feeType: 'taker',
      reason: `queue_too_deep_to_rest (expectedFillProb=${round(expectedFillProb)} < ${round(minFillProbToRest)})`,
    };
  }

  return {
    mode: 'maker',
    refPrice,
    expectedFillProb,
    feeType: 'maker',
    reason: `post_only_default (spreadBps=${round(spreadBps)}, urgency=${round(urgency)}, expectedFillProb=${round(expectedFillProb)})`,
  };
}

/** Normalize a book side's top level to a plain price number.
 *  Accepts [price, size] tuples (Binance depth shape) or {price, size} objects. */
function topOf(levels) {
  if (!Array.isArray(levels) || levels.length === 0) return NaN;
  const top = levels[0];
  if (Array.isArray(top)) return Number(top[0]);
  if (top && typeof top === 'object') return Number(top.price);
  return NaN;
}

function round(x) {
  return isNum(x) ? Math.round(x * 1e4) / 1e4 : x;
}
