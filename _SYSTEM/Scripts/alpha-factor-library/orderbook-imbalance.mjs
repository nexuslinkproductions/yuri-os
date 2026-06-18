#!/usr/bin/env node
// @capability: orderbook-imbalance
// @serves: order-book imbalance | OBI | microprice | bid-ask pressure | L2 buy pressure | crypto perp book signal
// @does: Computes OBI=(bidVol−askVol)/(bidVol+askVol) over top N levels and size-weighted microprice from a snapshot OrderBookData. Pure, no network. Emits directional signals when imbalance exceeds threshold. Advisory only (confidence ≤ 0.60); edge is real at short horizon but decays in seconds — survives only when aggregated/persistent.
// @use: Reach for this when you have an OrderBookData snapshot (bids/asks as {price,size}[]) and want a raw L2 pressure signal. Measure at 1m–5m horizon first; do not promote to sizing without DSR+FDR screen.
// @exports: computeOBI, computeMicroprice, obiToSignals, computeOrderBookImbalance
//
// CONSTRAINTS: pure math over injected book snapshot (no network, no I/O), fail-open
// (missing/empty/zero-vol book → []), no new npm deps. INV-1 paper-only, INV-2 no key reads.
//
// MECHANISM: A persistent positive OBI implies informed flow lifting the bid side faster than
// the ask, consistent with buy pressure from informed traders. The edge is probabilistic and
// real at tick/sub-second resolution on live L2 data; on 1m aggregated bars it degrades because
// the snapshot captures only the end-of-bar state, not the flow. HYPOTHESIS to be measured by
// trade-edge-audit, not proven edge.
//
// DECAY CAVEAT: L2 imbalance on a static snapshot decays fast — HFT refills the book within
// seconds. The confidence cap (0.60) encodes this honestly. Aggregate across multiple snapshots
// or use with volume confirmation before trusting directionally.

import { pathToFileURL } from 'node:url';

// ── THRESHOLDS ────────────────────────────────────────────────────────────────

/** Default number of price levels summed on each side for OBI. */
export const DEFAULT_LEVELS = 10;

/**
 * |OBI| threshold for firing a directional signal.
 * 0.2 = 20% net imbalance. Below this the book is approximately balanced
 * and the signal is indistinguishable from noise on aggregated 1m bars.
 */
export const DEFAULT_THRESHOLD = 0.2;

/**
 * Confidence cap for OBI signals.
 * 0.60: L2 imbalance from a snapshot decays in seconds; honest upper bound
 * for a single-snapshot L2 signal at 1m bar resolution.
 */
export const OBI_CONFIDENCE_CAP = 0.60;

// ── computeOBI ────────────────────────────────────────────────────────────────

/**
 * computeOBI(bids, asks, levels) -> number | NaN
 *
 * Order-Book Imbalance over the top `levels` price levels on each side.
 *
 *   OBI = (bidVol − askVol) / (bidVol + askVol)
 *
 * Range [-1, 1]:
 *   +1  = all volume on the bid (pure buy pressure)
 *   -1  = all volume on the ask (pure sell pressure)
 *    0  = balanced
 *
 * @param {{ price: number; size: number }[]} bids - price levels, best bid first (descending)
 * @param {{ price: number; size: number }[]} asks - price levels, best ask first (ascending)
 * @param {number} [levels=10] - how many levels to sum on each side
 * @returns {number} OBI in [-1,1] | NaN if total volume is zero or inputs are invalid
 */
export function computeOBI(bids, asks, levels = DEFAULT_LEVELS) {
  if (!Array.isArray(bids) || !Array.isArray(asks)) return NaN;
  const n = Math.max(0, Math.floor(levels));

  let bidVol = 0;
  for (let i = 0; i < Math.min(n, bids.length); i++) {
    const sz = Number(bids[i]?.size);
    if (Number.isFinite(sz) && sz > 0) bidVol += sz;
  }

  let askVol = 0;
  for (let i = 0; i < Math.min(n, asks.length); i++) {
    const sz = Number(asks[i]?.size);
    if (Number.isFinite(sz) && sz > 0) askVol += sz;
  }

  const total = bidVol + askVol;
  if (total === 0) return NaN;
  return (bidVol - askVol) / total;
}

// ── computeMicroprice ─────────────────────────────────────────────────────────

/**
 * computeMicroprice(bids, asks) -> number | NaN
 *
 * Size-weighted fair price (microprice):
 *
 *   microprice = (bestBid × bestAskSize + bestAsk × bestBidSize)
 *              / (bestBidSize + bestAskSize)
 *
 * Intuition: weights the best bid by the ask-side size (the market will move
 * toward bid if ask size is large relative to bid size, pulling price down) and
 * vice versa. microprice > mid → upward pressure; microprice < mid → downward.
 *
 * @param {{ price: number; size: number }[]} bids - best bid at index 0
 * @param {{ price: number; size: number }[]} asks - best ask at index 0
 * @returns {number} microprice | NaN if inputs are invalid or total size is zero
 */
export function computeMicroprice(bids, asks) {
  if (!Array.isArray(bids) || !Array.isArray(asks)) return NaN;
  if (bids.length === 0 || asks.length === 0) return NaN;

  const bestBid = Number(bids[0]?.price);
  const bestBidSize = Number(bids[0]?.size);
  const bestAsk = Number(asks[0]?.price);
  const bestAskSize = Number(asks[0]?.size);

  if (
    !Number.isFinite(bestBid) || !Number.isFinite(bestBidSize) ||
    !Number.isFinite(bestAsk) || !Number.isFinite(bestAskSize)
  ) return NaN;

  const totalSize = bestBidSize + bestAskSize;
  if (totalSize === 0) return NaN;

  return (bestBid * bestAskSize + bestAsk * bestBidSize) / totalSize;
}

// ── obiToSignals ──────────────────────────────────────────────────────────────

/**
 * obiToSignals(obi, microprice, book, opts) -> signal[]
 *
 * Converts a computed OBI + microprice into advisory directional signals.
 *
 * Signal shape (matches carry-vol-signal / signal array contract):
 *   { factorId, value, side, confidence, ts, source: 'perp' }
 *
 * Gates:
 *   1. |OBI| >= threshold → directional signal `crypto-obi-<market>`
 *   2. microprice emitted as secondary confirmation `crypto-microprice-<market>`
 *      (always emitted when microprice is finite, regardless of OBI gate)
 *
 * Confidence: scales with |OBI| above threshold, capped at OBI_CONFIDENCE_CAP (0.60).
 *   Base 0.25 + excess × 0.5, capped. Low cap is intentional — honest about snapshot decay.
 *
 * @param {number} obi - computed OBI in [-1,1] (NaN → [])
 * @param {number} microprice - computed microprice (NaN → skip microprice signal)
 * @param {{ mid: number; spreadBps: number }} book - for mid reference
 * @param {{ market?: string; ts?: number; threshold?: number }} opts
 * @returns {signal[]}
 */
export function obiToSignals(obi, microprice, book, opts = {}) {
  const market = (typeof opts.market === 'string' && opts.market) ? opts.market : '';
  const ts = Number.isFinite(opts.ts) && opts.ts > 0 ? opts.ts : Math.floor(Date.now() / 1000);
  const threshold = Number.isFinite(opts.threshold) ? Math.abs(opts.threshold) : DEFAULT_THRESHOLD;

  const signals = [];

  // ── OBI directional signal ────────────────────────────────────────────────
  if (Number.isFinite(obi)) {
    let side = 'flat';
    if (obi >= threshold) side = 'long';
    else if (obi <= -threshold) side = 'short';

    if (side !== 'flat') {
      const excess = Math.abs(obi) - threshold;
      const confidence = Math.min(OBI_CONFIDENCE_CAP, 0.25 + excess * 0.5);

      signals.push({
        factorId: `crypto-obi-${market}`,
        value: obi,
        side,
        confidence,
        ts,
        source: 'perp',
      });
    }
  }

  // ── Microprice secondary confirmation ─────────────────────────────────────
  if (Number.isFinite(microprice)) {
    const mid = Number(book?.mid);
    if (Number.isFinite(mid) && mid > 0) {
      // microprice > mid = upward pressure = long leaning; < mid = short leaning
      const mpSide = microprice > mid ? 'long' : microprice < mid ? 'short' : 'flat';
      // Microprice is a pure mechanical computation; confidence is intentionally low
      // (it's a point-in-time confirmation, not a standalone signal)
      const mpConfidence = Math.min(0.35, Math.abs(microprice - mid) / mid * 200);

      signals.push({
        factorId: `crypto-microprice-${market}`,
        value: microprice,
        side: mpSide,
        confidence: mpConfidence,
        ts,
        source: 'perp',
      });
    }
  }

  return signals;
}

// ── computeOrderBookImbalance ─────────────────────────────────────────────────

/**
 * computeOrderBookImbalance(book, opts) -> signal[]
 *
 * Top-level entry point. Accepts an OrderBookData snapshot (bids/asks as
 * {price:number, size:number}[], plus mid and spreadBps) and returns an array
 * of advisory directional signals.
 *
 * FAIL-OPEN: returns [] on any error, missing/empty book, or zero total volume.
 * Never throws.
 *
 * @param {{ bids: {price:number,size:number}[]; asks: {price:number,size:number}[]; mid: number; spreadBps: number }} book
 * @param {{ levels?: number; market?: string; ts?: number; threshold?: number }} [opts]
 * @returns {signal[]}
 */
export function computeOrderBookImbalance(book, opts = {}) {
  try {
    if (!book || !Array.isArray(book.bids) || !Array.isArray(book.asks)) return [];
    if (book.bids.length === 0 || book.asks.length === 0) return [];

    const levels = Number.isFinite(opts.levels) && opts.levels > 0
      ? Math.floor(opts.levels)
      : DEFAULT_LEVELS;
    const threshold = Number.isFinite(opts.threshold) ? opts.threshold : DEFAULT_THRESHOLD;
    const market = typeof opts.market === 'string' ? opts.market : '';
    const ts = Number.isFinite(opts.ts) && opts.ts > 0
      ? opts.ts
      : Math.floor(Date.now() / 1000);

    const obi = computeOBI(book.bids, book.asks, levels);
    if (!Number.isFinite(obi)) return []; // zero total volume or invalid

    const microprice = computeMicroprice(book.bids, book.asks);

    return obiToSignals(obi, microprice, book, { market, ts, threshold });
  } catch (_e) {
    // fail-open
    return [];
  }
}

// ── --test self-test (deterministic, no network) ──────────────────────────────
const _runAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_runAsMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const assert = (c, label) => {
    if (c) { pass++; }
    else { fail++; console.error(`FAIL: ${label}`); }
  };

  // Helper: build a simple book
  const makeBook = (bidPrices, bidSizes, askPrices, askSizes) => ({
    bids: bidPrices.map((p, i) => ({ price: p, size: bidSizes[i] })),
    asks: askPrices.map((p, i) => ({ price: p, size: askSizes[i] })),
    mid: (bidPrices[0] + askPrices[0]) / 2,
    spreadBps: ((askPrices[0] - bidPrices[0]) / bidPrices[0]) * 10000,
  });

  // ── computeOBI ─────────────────────────────────────────────────────────────

  // Balanced book → OBI near 0
  const balanced = makeBook(
    [100, 99, 98], [10, 10, 10],
    [101, 102, 103], [10, 10, 10],
  );
  const obiBalanced = computeOBI(balanced.bids, balanced.asks, 3);
  assert(Number.isFinite(obiBalanced) && Math.abs(obiBalanced) < 1e-10,
    `computeOBI: balanced book → 0 (got ${obiBalanced})`);

  // Bid-heavy: bidVol=30, askVol=10 → OBI = (30-10)/40 = 0.5
  const bidHeavy = makeBook(
    [100, 99, 98], [10, 10, 10],
    [101, 102, 103], [4, 3, 3],
  );
  const obiBidHeavy = computeOBI(bidHeavy.bids, bidHeavy.asks, 3);
  assert(Number.isFinite(obiBidHeavy) && Math.abs(obiBidHeavy - 0.5) < 1e-10,
    `computeOBI: bid-heavy (30 vs 10) → 0.5 (got ${obiBidHeavy})`);

  // Ask-heavy: bidVol=10, askVol=30 → OBI = (10-30)/40 = -0.5
  const askHeavy = makeBook(
    [100, 99, 98], [4, 3, 3],
    [101, 102, 103], [10, 10, 10],
  );
  const obiAskHeavy = computeOBI(askHeavy.bids, askHeavy.asks, 3);
  assert(Number.isFinite(obiAskHeavy) && Math.abs(obiAskHeavy - (-0.5)) < 1e-10,
    `computeOBI: ask-heavy (10 vs 30) → -0.5 (got ${obiAskHeavy})`);

  // Empty bids with non-empty asks: bidVol=0, askVol=10 → OBI=-1 (pure ask pressure, mathematically valid)
  const obiEmptyBids = computeOBI([], [{ price: 101, size: 10 }], 3);
  assert(Number.isFinite(obiEmptyBids) && obiEmptyBids === -1,
    `computeOBI: empty bids + sized asks → -1 (pure ask pressure) (got ${obiEmptyBids})`);

  // Empty asks with non-empty bids: bidVol=10, askVol=0 → OBI=+1 (pure bid pressure, mathematically valid)
  const obiEmptyAsks = computeOBI([{ price: 100, size: 10 }], [], 3);
  assert(Number.isFinite(obiEmptyAsks) && obiEmptyAsks === 1,
    `computeOBI: sized bids + empty asks → +1 (pure bid pressure) (got ${obiEmptyAsks})`);

  // Zero total volume → NaN
  const zeroVol = makeBook([100], [0], [101], [0]);
  assert(!Number.isFinite(computeOBI(zeroVol.bids, zeroVol.asks, 1)),
    'computeOBI: zero volume → NaN');

  // Non-array inputs → NaN
  assert(!Number.isFinite(computeOBI(null, [], 3)), 'computeOBI: null bids → NaN');

  // ── computeMicroprice ──────────────────────────────────────────────────────

  // Symmetric book: bestBid=100 (size=10), bestAsk=102 (size=10)
  // microprice = (100×10 + 102×10) / (10+10) = 2020/20 = 101
  const symBook = makeBook([100, 99], [10, 10], [102, 103], [10, 10]);
  const mpSym = computeMicroprice(symBook.bids, symBook.asks);
  assert(Number.isFinite(mpSym) && Math.abs(mpSym - 101) < 1e-10,
    `computeMicroprice: symmetric → 101 (got ${mpSym})`);

  // Bid-heavy ask side: bestBid=100 (size=5), bestAsk=102 (size=15)
  // microprice = (100×15 + 102×5) / 20 = (1500+510)/20 = 2010/20 = 100.5
  // microprice < mid(101) → downward pressure
  const asymBook = makeBook([100, 99], [5, 5], [102, 103], [15, 15]);
  const mpAsym = computeMicroprice(asymBook.bids, asymBook.asks);
  assert(Number.isFinite(mpAsym) && Math.abs(mpAsym - 100.5) < 1e-10,
    `computeMicroprice: large ask side → 100.5 (got ${mpAsym})`);
  assert(mpAsym < asymBook.mid,
    `computeMicroprice: large ask size → microprice < mid (${mpAsym} < ${asymBook.mid})`);

  // Large bid size: bestBid=100 (size=15), bestAsk=102 (size=5)
  // microprice = (100×5 + 102×15) / 20 = (500+1530)/20 = 2030/20 = 101.5
  // microprice > mid(101) → upward pressure
  const largeBid = makeBook([100, 99], [15, 5], [102, 103], [5, 5]);
  const mpLargeBid = computeMicroprice(largeBid.bids, largeBid.asks);
  assert(Number.isFinite(mpLargeBid) && Math.abs(mpLargeBid - 101.5) < 1e-10,
    `computeMicroprice: large bid size → 101.5 (got ${mpLargeBid})`);
  assert(mpLargeBid > largeBid.mid,
    `computeMicroprice: large bid size → microprice > mid (${mpLargeBid} > ${largeBid.mid})`);

  // Empty book → NaN
  assert(!Number.isFinite(computeMicroprice([], [{ price: 101, size: 10 }])),
    'computeMicroprice: empty bids → NaN');
  assert(!Number.isFinite(computeMicroprice([{ price: 100, size: 10 }], [])),
    'computeMicroprice: empty asks → NaN');

  // Zero size → NaN
  const zeroSizeBook = makeBook([100], [0], [102], [0]);
  assert(!Number.isFinite(computeMicroprice(zeroSizeBook.bids, zeroSizeBook.asks)),
    'computeMicroprice: zero sizes → NaN');

  // ── computeOrderBookImbalance (top-level) ──────────────────────────────────

  // Bid-heavy → long signal
  // OBI = 0.5 (above default threshold 0.2) → long
  // microprice > mid (bid size large) → long microprice confirmation
  const bidHeavyBook = makeBook(
    [100, 99, 98, 97, 96], [20, 20, 20, 20, 20],
    [101, 102, 103, 104, 105], [4, 4, 4, 4, 4],
  );
  // bidVol=100, askVol=20, OBI=(100-20)/120=0.667
  const sigsBidHeavy = computeOrderBookImbalance(bidHeavyBook, {
    levels: 5, market: 'BTC-USD', ts: 1718000000, threshold: 0.2,
  });
  assert(Array.isArray(sigsBidHeavy) && sigsBidHeavy.length >= 1,
    `computeOrderBookImbalance: bid-heavy → at least 1 signal (got ${sigsBidHeavy.length})`);
  const obiSig = sigsBidHeavy.find(s => s.factorId === 'crypto-obi-BTC-USD');
  assert(obiSig !== undefined, 'computeOrderBookImbalance: bid-heavy → crypto-obi-BTC-USD signal present');
  assert(obiSig?.side === 'long', `computeOrderBookImbalance: bid-heavy OBI → long (got ${obiSig?.side})`);
  assert(Number.isFinite(obiSig?.confidence) && obiSig.confidence <= OBI_CONFIDENCE_CAP,
    `computeOrderBookImbalance: confidence ≤ ${OBI_CONFIDENCE_CAP} (got ${obiSig?.confidence})`);
  assert(obiSig?.source === 'perp', 'computeOrderBookImbalance: source=perp');
  assert(obiSig?.ts === 1718000000, 'computeOrderBookImbalance: ts preserved');

  // Ask-heavy → short signal
  // OBI = -0.667 (below -0.2 threshold) → short
  const askHeavyBook = makeBook(
    [100, 99, 98, 97, 96], [4, 4, 4, 4, 4],
    [101, 102, 103, 104, 105], [20, 20, 20, 20, 20],
  );
  const sigsAskHeavy = computeOrderBookImbalance(askHeavyBook, {
    levels: 5, market: 'ETH-USD', ts: 1718000000, threshold: 0.2,
  });
  const obiSigAsk = sigsAskHeavy.find(s => s.factorId === 'crypto-obi-ETH-USD');
  assert(obiSigAsk !== undefined, 'computeOrderBookImbalance: ask-heavy → crypto-obi-ETH-USD signal present');
  assert(obiSigAsk?.side === 'short', `computeOrderBookImbalance: ask-heavy OBI → short (got ${obiSigAsk?.side})`);

  // Balanced → no OBI signal (below threshold), but microprice signal may appear
  const balancedBook = makeBook(
    [100, 99, 98, 97, 96], [10, 10, 10, 10, 10],
    [101, 102, 103, 104, 105], [10, 10, 10, 10, 10],
  );
  const sigsBalanced = computeOrderBookImbalance(balancedBook, {
    levels: 5, market: 'SOL-USD', ts: 1718000000, threshold: 0.2,
  });
  const obiSigBalanced = sigsBalanced.find(s => s.factorId === 'crypto-obi-SOL-USD');
  assert(obiSigBalanced === undefined,
    'computeOrderBookImbalance: balanced book → no OBI signal (below threshold)');

  // Microprice > mid on bid-heavy book
  // bestBid=100 (size=20), bestAsk=101 (size=4): microprice=(100×4+101×20)/24=(400+2020)/24=2420/24≈100.83
  // mid = 100.5, microprice(100.83) > mid → upward pressure
  const mpSig = sigsBidHeavy.find(s => s.factorId === 'crypto-microprice-BTC-USD');
  assert(mpSig !== undefined, 'computeOrderBookImbalance: bid-heavy → crypto-microprice signal present');
  assert(mpSig?.side === 'long',
    `computeOrderBookImbalance: bid-heavy microprice > mid → long (got ${mpSig?.side})`);

  // Empty book → []
  const sigsEmpty = computeOrderBookImbalance({ bids: [], asks: [], mid: 100, spreadBps: 5 }, {});
  assert(Array.isArray(sigsEmpty) && sigsEmpty.length === 0,
    'computeOrderBookImbalance: empty bids → []');

  // One-sided (no asks) → []
  const sigsOneSided = computeOrderBookImbalance(
    { bids: [{ price: 100, size: 10 }], asks: [], mid: 100, spreadBps: 0 }, {},
  );
  assert(Array.isArray(sigsOneSided) && sigsOneSided.length === 0,
    'computeOrderBookImbalance: one-sided (no asks) → []');

  // Zero volume → []
  const sigsZeroVol = computeOrderBookImbalance(
    { bids: [{ price: 100, size: 0 }], asks: [{ price: 101, size: 0 }], mid: 100.5, spreadBps: 10 }, {},
  );
  assert(Array.isArray(sigsZeroVol) && sigsZeroVol.length === 0,
    'computeOrderBookImbalance: zero volume → []');

  // Malformed book (null) → []
  const sigsMalformed = computeOrderBookImbalance(null, {});
  assert(Array.isArray(sigsMalformed) && sigsMalformed.length === 0,
    'computeOrderBookImbalance: null book → []');

  // Malformed book (missing bids key) → []
  const sigsMissingBids = computeOrderBookImbalance({ asks: [{ price: 101, size: 10 }], mid: 100.5, spreadBps: 5 }, {});
  assert(Array.isArray(sigsMissingBids) && sigsMissingBids.length === 0,
    'computeOrderBookImbalance: missing bids key → []');

  console.log(`orderbook-imbalance --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}
