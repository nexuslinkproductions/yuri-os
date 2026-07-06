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
  // equivalent-mutant: Math.min→max and <→<= on loop bound — bids[i]?.size on out-of-range i is
  //   undefined → Number(undefined)=NaN → filtered by isFinite, so extra iterations are no-ops.
  for (let i = 0; i < Math.min(n, bids.length); i++) {
    const sz = Number(bids[i]?.size);
    // equivalent-mutant: sz>0→sz>=0 — bidVol += 0 is a no-op, output unchanged.
    if (Number.isFinite(sz) && sz > 0) bidVol += sz;
  }

  let askVol = 0;
  // equivalent-mutant: same as bid loop — Math.min→max / <→<= / sz>0→sz>=0 all no-op via ?.+isFinite.
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
    // equivalent-mutant: ||→&& in this 4-term chain — a non-finite bestBid/Ask[Size] makes the
    //   division below produce NaN anyway (Inf/Inf or NaN propagation), so the RETURN is identical.
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
    // equivalent-mutant: ||→&& here — asymmetric non-array (bids ok, asks not) makes the mutant
    //   continue and throw on .length, caught by the try/catch below → [] same as the direct return.
    if (!book || !Array.isArray(book.bids) || !Array.isArray(book.asks)) return [];
    if (book.bids.length === 0 || book.asks.length === 0) return [];

    const levels = Number.isFinite(opts.levels) && opts.levels > 0
      ? Math.floor(opts.levels)
      : DEFAULT_LEVELS;
    const threshold = Number.isFinite(opts.threshold) ? opts.threshold : DEFAULT_THRESHOLD;
    const market = typeof opts.market === 'string' ? opts.market : '';
    // equivalent-mutant: ts>0 → ts>=0 and &&→|| — if ts=0 slips past (mutant), obiToSignals'
    //   own ts guard falls back again, so the emitted signal.ts is the same. Only `0→1` (ts>1)
    //   is distinguishable for fractional ts in (0,1), covered in --test.
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

  // ── MUTATION-HARDENING: boundary + targeted math cases ──────────────────────

  // === computeOBI: levels=0 with sized entries → NaN (kills L63 `Math.max(0,...)` 0→1) ===
  // Mutant makes n=1 → sums 1 level each side → OBI=0 instead of NaN.
  assert(!Number.isFinite(computeOBI([{ price: 100, size: 10 }], [{ price: 101, size: 10 }], 0)),
    'computeOBI: levels=0 → NaN (n clamped to 0, zero volume summed)');

  // === computeOBI: fractional sizes below 1 → INCLUDED (kills L68/L74 `sz > 0` → `sz > 1`) ===
  // sizes 0.5 each side: bidVol=0.5, askVol=0.5 → OBI=0. Mutant excludes them → NaN.
  const obiFrac = computeOBI([{ price: 100, size: 0.5 }], [{ price: 101, size: 0.5 }], 1);
  assert(Number.isFinite(obiFrac) && Math.abs(obiFrac) < 1e-10,
    `computeOBI: fractional size 0.5 included → OBI=0 (got ${obiFrac})`);

  // === computeOBI: Infinity size filtered → uses finite side only (kills &&→|| on sz guard) ===
  // bid Infinity → filtered (isFinite false), ask 10 → askVol=10, bidVol=0 → OBI=-1.
  // Mutant (isFinite || sz>0): Infinity>0 true → bidVol=Inf → OBI=NaN. Differs.
  const obiInf = computeOBI([{ price: 100, size: Infinity }], [{ price: 101, size: 10 }], 1);
  assert(Number.isFinite(obiInf) && obiInf === -1,
    `computeOBI: Infinity size filtered → -1 (got ${obiInf})`);

  // === computeMicroprice: single-entry book computes valid microprice (kills L102/L107 0→1) ===
  // Mutant: bids.length===1 or asks[1] → NaN. Original: valid.
  const mpSingle = computeMicroprice([{ price: 100, size: 10 }], [{ price: 102, size: 10 }]);
  // microprice = (100×10 + 102×10)/20 = 101
  assert(Number.isFinite(mpSingle) && Math.abs(mpSingle - 101) < 1e-10,
    `computeMicroprice: single-entry book → 101 (got ${mpSingle})`);

  // === computeMicroprice: asymmetric invalid input → NaN, no throw (kills L101/L105 ||→&&) ===
  // bids non-empty array + asks non-array: L105 mutant `false && true`=false → continues →
  //   L106 bids.length>0, then asks.length throws (no try/catch in computeMicroprice). Original → NaN.
  const mpAsymInvalid = (() => { try { return computeMicroprice([{price:100,size:10}], null); } catch { return 'THREW'; } })();
  assert(mpAsymInvalid !== 'THREW' && !Number.isFinite(mpAsymInvalid),
    `computeMicroprice: bids ok + asks=null → NaN no-throw (got ${mpAsymInvalid})`);
  const mpAsymStr = (() => { try { return computeMicroprice([{price:100,size:10}], 'not-array'); } catch { return 'THREW'; } })();
  assert(mpAsymStr !== 'THREW' && !Number.isFinite(mpAsymStr),
    `computeMicroprice: asks=string → NaN no-throw (got ${mpAsymStr})`);

  // === obiToSignals: OBI exactly at +threshold → long (kills L150 >= → >) ===
  const sigAtThresh = obiToSignals(0.2, NaN, { mid: 100 }, { threshold: 0.2, market: 'T', ts: 1 });
  const obiAtT = sigAtThresh.find(s => s.factorId === 'crypto-obi-T');
  assert(obiAtT !== undefined && obiAtT.side === 'long',
    `obiToSignals: obi=+0.2=threshold → long (got ${obiAtT?.side})`);

  // === obiToSignals: OBI exactly at -threshold → short (kills L155 <= → <) ===
  const sigAtNegThresh = obiToSignals(-0.2, NaN, { mid: 100 }, { threshold: 0.2, market: 'T', ts: 1 });
  const obiAtNegT = sigAtNegThresh.find(s => s.factorId === 'crypto-obi-T');
  assert(obiAtNegT !== undefined && obiAtNegT.side === 'short',
    `obiToSignals: obi=-0.2=-threshold → short (got ${obiAtNegT?.side})`);

  // === obiToSignals: exact confidence value (kills L159 Math.min→max, +→-, *→/) ===
  // obi=0.5, threshold=0.2: excess=0.3, confidence = min(0.6, 0.25 + 0.3×0.5) = min(0.6, 0.4) = 0.4
  const sigConf = obiToSignals(0.5, NaN, { mid: 100 }, { threshold: 0.2, market: 'T', ts: 1 });
  const obiConf = sigConf.find(s => s.factorId === 'crypto-obi-T');
  assert(Number.isFinite(obiConf?.confidence) && Math.abs(obiConf.confidence - 0.4) < 1e-10,
    `obiToSignals: obi=0.5 confidence = 0.4 exactly (got ${obiConf?.confidence})`);

  // === obiToSignals: confidence cap hit (kills Math.min→max returning uncapped value) ===
  // obi=1.0, threshold=0.2: excess=0.8, 0.25+0.4=0.65 → capped at 0.60
  const sigCap = obiToSignals(1.0, NaN, { mid: 100 }, { threshold: 0.2, market: 'T', ts: 1 });
  const obiCap = sigCap.find(s => s.factorId === 'crypto-obi-T');
  assert(Number.isFinite(obiCap?.confidence) && Math.abs(obiCap.confidence - OBI_CONFIDENCE_CAP) < 1e-10,
    `obiToSignals: obi=1.0 confidence capped at ${OBI_CONFIDENCE_CAP} (got ${obiCap?.confidence})`);

  // === obiToSignals: microprice == mid → flat (kills L177 > → >=) ===
  // mp=100, mid=100: original mpSide='flat'; mutant '>=' → 'long'.
  const sigMpEq = obiToSignals(0.5, 100, { mid: 100 }, { threshold: 0.2, market: 'T', ts: 1 });
  const mpEqSig = sigMpEq.find(s => s.factorId === 'crypto-microprice-T');
  assert(mpEqSig !== undefined && mpEqSig.side === 'flat',
    `obiToSignals: microprice==mid → flat (got ${mpEqSig?.side})`);

  // === obiToSignals: microprice < mid → short (direction coverage) ===
  const sigMpBelow = obiToSignals(0.5, 99.5, { mid: 100 }, { threshold: 0.2, market: 'T', ts: 1 });
  const mpBelowSig = sigMpBelow.find(s => s.factorId === 'crypto-microprice-T');
  assert(mpBelowSig !== undefined && mpBelowSig.side === 'short',
    `obiToSignals: microprice<mid → short (got ${mpBelowSig?.side})`);

  // === obiToSignals: mpConfidence exact value (kills L180 Math.min→max) ===
  // mp=100.001, mid=100: |0.001|/100*200 = 0.002 → min(0.35, 0.002) = 0.002
  // Mutant Math.max → returns 0.35.
  const sigMpConf = obiToSignals(0.5, 100.001, { mid: 100 }, { threshold: 0.2, market: 'T', ts: 1 });
  const mpConfSig = sigMpConf.find(s => s.factorId === 'crypto-microprice-T');
  assert(Number.isFinite(mpConfSig?.confidence) && Math.abs(mpConfSig.confidence - 0.002) < 1e-6,
    `obiToSignals: small mp deviation confidence = 0.002 (got ${mpConfSig?.confidence})`);

  // === obiToSignals: mid=0 → no microprice signal (kills L175 mid>0 → mid>=0, 0→1, &&→||) ===
  // With mid=0: original skips (mid>0 false). Mutants: mid>=0 true, mid>1 false, Number.isFinite||...
  const sigMid0 = obiToSignals(0.5, 100, { mid: 0 }, { threshold: 0.2, market: 'T', ts: 1 });
  const mpMid0 = sigMid0.find(s => s.factorId === 'crypto-microprice-T');
  assert(mpMid0 === undefined,
    `obiToSignals: mid=0 → no microprice signal (got ${mpMid0})`);

  // === obiToSignals: ts=0 → falls back to Date.now() (kills L146 ts>0 → ts>=0, &&→||, 0→1) ===
  // ts=0: original (0>0 false) → fallback. Mutants: ts>=0 → returns 0; &&→|| → returns 0.
  const sigTs0 = obiToSignals(0.5, NaN, { mid: 100 }, { threshold: 0.2, market: 'T', ts: 0 });
  const obiTs0 = sigTs0.find(s => s.factorId === 'crypto-obi-T');
  // Fallback ts should be ~now (within last 5 min), NOT 0.
  assert(Number.isFinite(obiTs0?.ts) && obiTs0.ts > 0 && obiTs0.ts <= Math.floor(Date.now() / 1000) + 1,
    `obiToSignals: ts=0 → fallback to Date.now() (got ${obiTs0?.ts})`);

  // === obiToSignals: non-string market → '' (kills L145 && → ||) ===
  // market=123: original → ''. Mutant: (typeof==='string' || 123) → 123 → factorId=crypto-obi-123.
  const sigNumMarket = obiToSignals(0.5, NaN, { mid: 100 }, { threshold: 0.2, market: 123, ts: 1 });
  const obiNumMarket = sigNumMarket.find(s => s.factorId === 'crypto-obi-');
  assert(obiNumMarket !== undefined,
    `obiToSignals: numeric market → '' factorId (got ${sigNumMarket.map(s=>s.factorId).join(',')})`);

  // === computeOrderBookImbalance: single-entry book → signals (kills L215 0→1) ===
  // bids.length===1 mutant → []. Original proceeds → computes OBI.
  const sigsSingleEntry = computeOrderBookImbalance(
    { bids: [{ price: 100, size: 20 }], asks: [{ price: 101, size: 4 }], mid: 100.5, spreadBps: 100 },
    { levels: 5, market: 'S', ts: 1718000000 },
  );
  assert(Array.isArray(sigsSingleEntry) && sigsSingleEntry.length >= 1,
    `computeOrderBookImbalance: single-entry book → signals (got ${sigsSingleEntry.length})`);

  // === computeOrderBookImbalance: levels=0 → DEFAULT_LEVELS, signals (kills L217 levels>0 mutants) ===
  // levels=0: `isFinite(0) && 0>0` = false → DEFAULT_LEVELS=10 → computes. Mutants that accept 0
  //   (>=0, &&→||) → levels=0 → NaN → []. Assert original produces signals to kill them.
  const sigsLevels0 = computeOrderBookImbalance(
    { bids: [{ price: 100, size: 20 }], asks: [{ price: 101, size: 4 }], mid: 100.5, spreadBps: 100 },
    { levels: 0, market: 'S', ts: 1718000000 },
  );
  assert(Array.isArray(sigsLevels0) && sigsLevels0.length >= 1,
    `computeOrderBookImbalance: levels=0 → DEFAULT_LEVELS signals (got ${sigsLevels0.length})`);

  // === computeOrderBookImbalance: levels=1 → uses exactly 1 level (kills L217 0→1, levels>0→>1) ===
  // levels=1: original Math.floor(1)=1 → sums 1 level. Mutant `>1`: 1>1=false → DEFAULT=10 → sums all.
  // Book: bid L0=20, L1=5; ask L0=4, L1=20. levels=1 → OBI=(20-4)/24=0.667. levels=10 → (25-24)/49≈0.02.
  // At threshold=0.2: levels=1 fires (0.667>0.2), levels=10 also fires but weaker. Check side + value.
  const sigsLevels1 = computeOrderBookImbalance(
    { bids: [{ price: 100, size: 20 }, { price: 99, size: 5 }],
      asks: [{ price: 101, size: 4 }, { price: 102, size: 20 }],
      mid: 100.5, spreadBps: 100 },
    { levels: 1, market: 'S', ts: 1718000000, threshold: 0.2 },
  );
  const obiL1 = sigsLevels1.find(s => s.factorId === 'crypto-obi-S');
  // With levels=1: OBI=0.667 → confidence=0.25+(0.667-0.2)*0.5=0.4835.
  // With levels=10 (mutant): OBI=0.0204 → below threshold → no signal at all.
  assert(obiL1 !== undefined && obiL1.side === 'long' && Math.abs(obiL1.value - 0.6667) < 0.001,
    `computeOrderBookImbalance: levels=1 → OBI=0.667 (got ${obiL1?.value})`);

  // === computeOrderBookImbalance: ts=0 → fallback ts (kills L222 ts>0 → >=0, &&→||, 0→1) ===
  const sigsTs0 = computeOrderBookImbalance(
    { bids: [{ price: 100, size: 20 }], asks: [{ price: 101, size: 4 }], mid: 100.5, spreadBps: 100 },
    { levels: 5, market: 'S', ts: 0 },
  );
  const obiTs0Top = sigsTs0.find(s => s.factorId === 'crypto-obi-S');
  assert(obiTs0Top !== undefined && obiTs0Top.ts > 0 && obiTs0Top.ts <= Math.floor(Date.now() / 1000) + 1,
    `computeOrderBookImbalance: ts=0 → fallback ts (got ${obiTs0Top?.ts})`);

  // === computeMicroprice: totalSize === 1 → valid microprice (kills L121 0→1) ===
  // bestBidSize=0.5, bestAskSize=0.5 → totalSize=1. Mutant returns NaN. Original computes.
  const mpTotal1 = computeMicroprice([{ price: 100, size: 0.5 }], [{ price: 102, size: 0.5 }]);
  // microprice = (100×0.5 + 102×0.5)/1 = 101
  assert(Number.isFinite(mpTotal1) && Math.abs(mpTotal1 - 101) < 1e-10,
    `computeMicroprice: totalSize=1 → 101 (got ${mpTotal1})`);

  // === obiToSignals: 0 < mid < 1 → microprice signal emitted (kills L181 mid>0 → mid>1) ===
  // mid=0.5: original (0.5>0) → emits. Mutant (0.5>1 false) → skips.
  const sigMidSmall = obiToSignals(0.5, 0.6, { mid: 0.5 }, { threshold: 0.2, market: 'T', ts: 1 });
  const mpMidSmall = sigMidSmall.find(s => s.factorId === 'crypto-microprice-T');
  assert(mpMidSmall !== undefined,
    `obiToSignals: mid=0.5 → microprice signal emitted (got ${mpMidSmall})`);

  // === computeOrderBookImbalance: fractional ts in (0,1) → preserved (kills L230 0→1) ===
  // ts=0.5: original `0.5>0` true → returns 0.5 → obiToSignal preserves. Mutant `0.5>1` false → fallback.
  const sigsTsFrac = computeOrderBookImbalance(
    { bids: [{ price: 100, size: 20 }], asks: [{ price: 101, size: 4 }], mid: 100.5, spreadBps: 100 },
    { levels: 5, market: 'S', ts: 0.5 },
  );
  const obiTsFrac = sigsTsFrac.find(s => s.factorId === 'crypto-obi-S');
  assert(obiTsFrac !== undefined && obiTsFrac.ts === 0.5,
    `computeOrderBookImbalance: ts=0.5 preserved (got ${obiTsFrac?.ts})`);

  // === computeOBI: Infinity ask size filtered (kills L78 &&→||, sz>0→>=0) ===
  // ask Infinity → filtered; bid 10 → bidVol=10. OBI = 10/10 = 1. Mutant (isFinite || sz>0):
  //   Infinity>0 true → askVol=Inf → OBI=NaN. `sz>=0`: 0-included but += 0 no-op... need Infinity.
  const obiAskInf = computeOBI([{ price: 100, size: 10 }], [{ price: 101, size: Infinity }], 1);
  assert(Number.isFinite(obiAskInf) && obiAskInf === 1,
    `computeOBI: ask Infinity filtered → +1 (got ${obiAskInf})`);

  // === computeOBI: bid Infinity filtered (mirror, kills L71 &&→||) ===
  const obiBidInf = computeOBI([{ price: 100, size: Infinity }], [{ price: 101, size: 10 }], 1);
  assert(Number.isFinite(obiBidInf) && obiBidInf === -1,
    `computeOBI: bid Infinity filtered → -1 (got ${obiBidInf})`);

  console.log(`orderbook-imbalance --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}
