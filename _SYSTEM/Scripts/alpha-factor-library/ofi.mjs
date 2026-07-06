#!/usr/bin/env node
// @capability: order-flow-imbalance
// @serves: OFI | order flow imbalance | Cont Kukanov Stoikov | price impact | flow measure | short-horizon alpha | bid lift | ask drop | microstructure
// @does: Computes per-event OFI contributions (e_n = B_n + C_n) from consecutive best-level snapshots, buckets them with depth-normalized/raw/z-scored variants, estimates the contemporaneous λ (price-impact coefficient) via rolling OLS, and optionally aggregates multi-level OFI across the top-N book levels (CKS §4). Pure math, fail-open, no network.
// @use: Feed consecutive {ts,bidPx,bidSz,askPx,askSz} snapshots to ofiContribution(); aggregate with computeOFI(); calibrate λ with estimateLambda(). For multi-level edge: computeMultiLevelOFI(prevBook, currBook, {levels:5}) sums per-level e_n across the top-N bids/asks to lift predictive R² (~0.65 L1 → ~0.85 top-3-5). Validation targets: contemporaneous R² ~0.65–0.87, predictive ~0.25–0.35 @1s; predictive R²>0.15 @100–500ms = meaningful, <0.10 = noise.
// @exports: ofiContribution, computeOFI, computeMultiLevelOFI, estimateLambda
//
// REFERENCE: Cont, Kukanov & Stoikov (2014) "The Price Impact of Order Book Events."
//   Journal of Financial Econometrics 12(1):47–88.
//   DOI: 10.1093/jjfinec/nbt003
//
// MECHANISM:
//   Each snapshot pair (prev, curr) yields a signed contribution e_n = B_n + C_n:
//     B_n (bid side):
//       bidPx↑  → +bidSz_curr   (new aggressive bid lifts; buy pressure)
//       bidPx=  → +(bidSz_curr − bidSz_prev)  (queue change at same price)
//       bidPx↓  → −bidSz_prev   (bid cancelled/moved away; pressure removed)
//     C_n (ask side, already signed for net buy):
//       askPx↓  → −askSz_curr   (ask drops to meet bid; aggressive sell)
//       askPx=  → −(askSz_curr − askSz_prev)  (queue change at same price)
//       askPx↑  → +askSz_prev   (ask cancelled/lifted; supply removed → buy signal)
//   Sign: positive e_n = net BUY pressure. Negative = net SELL pressure.
//
// VALIDATION TARGETS (documented from Cont-Kukanov-Stoikov 2014 + replication studies):
//   Contemporaneous R² (OFI vs Δmid in same window): ~0.65–0.87 on equities/futures.
//   Predictive R² (OFI → next-window Δmid):          ~0.25–0.35 at 1s horizon.
//   For YURI crypto perp usage:
//     predictive R² > 0.15 @ 100–500 ms window = meaningful edge worth tracking.
//     predictive R² < 0.10              = noise floor; do not use for sizing.
//
// CONSTRAINTS: pure math over injected snapshots (no network, no I/O), fail-open
//   (never throws; returns null/[] on bad input), no new npm deps.

import { pathToFileURL } from 'node:url';
import { computeMicroprice } from './orderbook-imbalance.mjs';

// ── ofiContribution ────────────────────────────────────────────────────────────

/**
 * ofiContribution(prev, curr) -> { e, crossedBook, skipped, bidContrib, askContrib }
 *
 * Computes the signed OFI event contribution e_n = B_n + C_n from two consecutive
 * best-level snapshots per Cont, Kukanov & Stoikov (2014) §2.
 *
 * Snapshot shape: { ts, bidPx, bidSz, askPx, askSz }
 *   ts     - Unix ms timestamp (optional, used for ordering only)
 *   bidPx  - best bid price
 *   bidSz  - best bid size (depth at best bid)
 *   askPx  - best ask price
 *   askSz  - best ask size (depth at best ask)
 *
 * Edge cases:
 *   - prev === null (first snapshot): e=0, skipped=false (no prior to diff against)
 *   - NaN / missing field in CURR: skipped=true, e=0
 *   - Crossed book in CURR (bidPx >= askPx): crossedBook=true, skipped=true, e=0
 *   - NaN in PREV only: treated as if prev bid/ask moved away (use fallback 0 for prev sizes)
 *
 * @param {object|null} prev  - previous snapshot (null → first event)
 * @param {object}      curr  - current snapshot
 * @returns {{ e: number, crossedBook: boolean, skipped: boolean, bidContrib: number, askContrib: number }}
 */
export function ofiContribution(prev, curr) {
  // ── validate curr ─────────────────────────────────────────────────────────
  const cBidPx = Number(curr?.bidPx);
  const cBidSz = Number(curr?.bidSz);
  const cAskPx = Number(curr?.askPx);
  const cAskSz = Number(curr?.askSz);

  if (
    !Number.isFinite(cBidPx) || !Number.isFinite(cBidSz) ||
    !Number.isFinite(cAskPx) || !Number.isFinite(cAskSz)
  ) {
    return { e: 0, crossedBook: false, skipped: true, bidContrib: 0, askContrib: 0 };
  }

  // Crossed or locked book guard
  if (cBidPx >= cAskPx) {
    return { e: 0, crossedBook: true, skipped: true, bidContrib: 0, askContrib: 0 };
  }

  // First snapshot — no prior to diff against; e=0 by convention
  if (prev === null || prev === undefined) {
    return { e: 0, crossedBook: false, skipped: false, bidContrib: 0, askContrib: 0 };
  }

  // ── extract prev (NaN-safe: fall back to 0 for sizes) ─────────────────────
  const pBidPx = Number(prev.bidPx);
  const pBidSz = Number.isFinite(Number(prev.bidSz)) ? Number(prev.bidSz) : 0;
  const pAskPx = Number(prev.askPx);
  const pAskSz = Number.isFinite(Number(prev.askSz)) ? Number(prev.askSz) : 0;

  // If prev prices are missing, treat as if both sides moved (worst-case: use neutral 0 contrib)
  const prevBidPxValid = Number.isFinite(pBidPx);
  const prevAskPxValid = Number.isFinite(pAskPx);

  // ── B_n: bid contribution ─────────────────────────────────────────────────
  let B = 0;
  if (prevBidPxValid) {
    if (cBidPx > pBidPx) {
      B = +cBidSz;                    // bid price lifted → pure buy pressure
    } else if (cBidPx === pBidPx) {
      B = +(cBidSz - pBidSz);         // same price, queue change
    } else {
      // cBidPx < pBidPx: bid pulled away
      B = -pBidSz;
    }
  }
  // if prevBidPx invalid: B stays 0 (conservative)

  // ── C_n: ask contribution (signed for net buy) ────────────────────────────
  let C = 0;
  if (prevAskPxValid) {
    if (cAskPx < pAskPx) {
      C = -cAskSz;                    // ask dropped (aggressive offer) → sell pressure
    } else if (cAskPx === pAskPx) {
      C = -(cAskSz - pAskSz);         // same price, queue change
    } else {
      // cAskPx > pAskPx: ask lifted / cancelled → supply removed → buy signal
      C = +pAskSz;
    }
  }
  // if prevAskPx invalid: C stays 0 (conservative)

  return {
    e: B + C,
    crossedBook: false,
    skipped: false,
    bidContrib: B,
    askContrib: C,
  };
}

// ── computeOFI ────────────────────────────────────────────────────────────────

/**
 * computeOFI(snapshots, opts) -> result object | null
 *
 * Computes bucketed, normalized Order Flow Imbalance over a snapshot buffer.
 *
 * Algorithm:
 *   1. Iterate snapshots pairwise, compute ofiContribution for each adjacent pair.
 *   2. Sum all valid e_n → rawOFI.
 *   3. Compute avgDepth = mean(bidSz + askSz) across ALL valid current snapshots.
 *   4. Normalize per opts.normalize:
 *      'depth-normalized' (default): ofi = rawOFI / avgDepth
 *      'raw':                        ofi = rawOFI
 *      'z-scored':                   ofi = (rawOFI - mean(zHistory)) / std(zHistory)
 *                                    where zHistory is an external rolling buffer of rawOFI values.
 *
 * @param {object[]} snapshots    - array of {ts,bidPx,bidSz,askPx,askSz} in chronological order
 * @param {{ normalize?: 'depth-normalized'|'raw'|'z-scored', zHistory?: number[] }} [opts]
 * @returns {{ ofi: number|null, sign: 1|-1|0, bucketsUsed: number, avgDepth: number, normalize: string }}
 *          ofi=null if <2 valid snapshots; sign=0 if ofi=null or ofi===0
 */
export function computeOFI(snapshots, opts = {}) {
  const normalize = opts.normalize ?? 'depth-normalized';

  if (!Array.isArray(snapshots) || snapshots.length < 2) {
    return { ofi: null, sign: 0, bucketsUsed: 0, avgDepth: 0, normalize };
  }

  let rawOFI = 0;
  let bucketsUsed = 0;
  let depthSum = 0;
  let depthCount = 0;

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];

    const contrib = ofiContribution(prev, curr);
    if (!contrib.skipped) {
      rawOFI += contrib.e;
      bucketsUsed++;
    }

    // Accumulate depth from CURR snapshot (skip invalid)
    const bidSz = Number(curr?.bidSz);
    const askSz = Number(curr?.askSz);
    if (Number.isFinite(bidSz) && Number.isFinite(askSz) && !contrib.crossedBook) {
      depthSum += bidSz + askSz;
      depthCount++;
    }
  }

  if (bucketsUsed < 1) {
    return { ofi: null, sign: 0, bucketsUsed: 0, avgDepth: 0, normalize };
  }

  const avgDepth = depthCount > 0 ? depthSum / depthCount : 0;

  let ofi;
  if (normalize === 'raw') {
    ofi = rawOFI;
  } else if (normalize === 'z-scored') {
    const hist = Array.isArray(opts.zHistory) ? opts.zHistory.filter(Number.isFinite) : [];
    if (hist.length < 2) {
      // Not enough history for z-score; fall back to raw
      ofi = rawOFI;
    } else {
      const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
      const variance = hist.reduce((s, v) => s + (v - mean) ** 2, 0) / hist.length;
      const std = Math.sqrt(variance);
      ofi = std < 1e-12 ? 0 : (rawOFI - mean) / std;
    }
  } else {
    // 'depth-normalized' (default)
    ofi = avgDepth < 1e-12 ? rawOFI : rawOFI / avgDepth;
  }

  const sign = ofi > 0 ? 1 : ofi < 0 ? -1 : 0;
  return { ofi, sign, bucketsUsed, avgDepth, normalize };
}

// ── computeMultiLevelOFI ──────────────────────────────────────────────────────

/**
 * _ofiLevelContribution(pLevel, cLevel) -> number  (internal, fail-open)
 *
 * Computes the CKS e_n contribution for ONE book level from two consecutive
 * snapshots of that level. This is the EXACT same B_n + C_n logic as
 * ofiContribution(), factored to operate on a single {bidPx,bidSz,askPx,askSz}
 * level object so it can be applied uniformly to level 0..N-1.
 *
 * Level-0 (best level) is byte-identical to ofiContribution().e — the
 * metamorphic identity guarantee depends on this: do NOT diverge the math.
 *
 * Fail-open: any non-finite field → 0 contribution for that level (never throws).
 *
 * @param {object} pLevel - previous snapshot of this level {bidPx,bidSz,askPx,askSz}
 * @param {object} cLevel - current  snapshot of this level {bidPx,bidSz,askPx,askSz}
 * @returns {number} signed e_n for this level (0 on any invalidity)
 */
function _ofiLevelContribution(pLevel, cLevel) {
  const cBidPx = Number(cLevel?.bidPx);
  const cBidSz = Number(cLevel?.bidSz);
  const cAskPx = Number(cLevel?.askPx);
  const cAskSz = Number(cLevel?.askSz);

  // Fail-open: invalid curr level → 0 contribution
  if (
    !Number.isFinite(cBidPx) || !Number.isFinite(cBidSz) ||
    !Number.isFinite(cAskPx) || !Number.isFinite(cAskSz)
  ) {
    return 0;
  }

  // Crossed/locked at this level → skip (0 contribution). Note: deeper levels
  // can transiently lock during fast updates; we treat them as no-information.
  if (cBidPx >= cAskPx) return 0;

  // No previous level at this depth (book grew shallower before) → 0
  if (pLevel === null || pLevel === undefined) return 0;

  const pBidPx = Number(pLevel.bidPx);
  const pBidSz = Number.isFinite(Number(pLevel.bidSz)) ? Number(pLevel.bidSz) : 0;
  const pAskPx = Number(pLevel.askPx);
  const pAskSz = Number.isFinite(Number(pLevel.askSz)) ? Number(pLevel.askSz) : 0;

  const prevBidPxValid = Number.isFinite(pBidPx);
  const prevAskPxValid = Number.isFinite(pAskPx);

  // B_n: bid contribution (identical branching to ofiContribution)
  let B = 0;
  if (prevBidPxValid) {
    if (cBidPx > pBidPx) {
      B = +cBidSz;
    } else if (cBidPx === pBidPx) {
      B = +(cBidSz - pBidSz);
    } else {
      B = -pBidSz;
    }
  }

  // C_n: ask contribution (identical branching to ofiContribution)
  let C = 0;
  if (prevAskPxValid) {
    if (cAskPx < pAskPx) {
      C = -cAskSz;
    } else if (cAskPx === pAskPx) {
      C = -(cAskSz - pAskSz);
    } else {
      C = +pAskSz;
    }
  }

  return B + C;
}

/**
 * computeMultiLevelOFI(prevBook, currBook, opts) -> { ofi, levels, weights, perLevel, sign }
 *
 * MULTI-LEVEL Order Flow Imbalance per Cont, Kukanov & Stoikov (2014) §4.
 *
 * Aggregates the per-level e_n contribution across the top N price levels of the
 * book:
 *
 *     OFI^N = Σ_{n=0}^{N-1}  w_n · e_n
 *
 * where each e_n is the CKS B_n + C_n contribution computed independently for
 * level n from its consecutive {bidPx,bidSz,askPx,askSz} snapshots. The
 * cumulative sum (equal-weight) is the CKS canonical multi-level OFI; supplying
 * a `weights` array applies optional level-decay (e.g. exponential) without an
 * API change.
 *
 * Book shape: each snapshot is an array of level objects, top-of-book first:
 *   prevBook = [ {bidPx,bidSz,askPx,askSz}, {bidPx,bidSz,askPx,askSz}, ... ]
 *   currBook = [ {bidPx,bidSz,askPx,askSz}, {bidPx,bidSz,askPx,askSz}, ... ]
 * This is the same {price,size}[] shape bookAt/extractTopN return, mapped to the
 * ofiContribution field names (bidPx/bidSz/askPx/askSz).
 *
 * WEIGHTING (justification):
 *   Default = equal weight (w_n = 1 for all n) → pure sum of e_n, the CKS
 *   canonical cumulative multi-level OFI. We do NOT force a decay default
 *   because level-decay is empirically fit per instrument/exchange (CKS Table 5
 *   fit it on the data); hardcoding a decay would be an unverified guess. The
 *   `weights: number[]` opt-in lets the caller plug fitted decay (e.g.
 *   weights=[1, 0.6, 0.3]) once λ-calibration produces it.
 *
 * IDENTITY GUARANTEE (metamorphic): with levels=1 (or N=1), level 0 IS the best
 * level and uses the same _ofiLevelContribution math as ofiContribution(), so
 * computeMultiLevelOFI(b,c,{levels:1}).ofi === ofiContribution(b[0],c[0]).e
 * exactly (verified by the --test metamorphic case).
 *
 * Fail-open: bad/empty/one-sided books → { ofi: null, ... } or 0 contributions,
 * never throws. A level present in curr but missing in prev (book grew deeper)
 * contributes 0 for that level. A level missing in curr (book shallowed) is
 * skipped (it contributes nothing — the depth vanished, no queue change to
 * measure).
 *
 * @param {object[]|null} prevBook   - previous top-N book levels (top-of-book first), null = first event
 * @param {object[]}      currBook   - current  top-N book levels (top-of-book first)
 * @param {{ levels?: number, weights?: number[] }} [opts]
 *   levels  - number of top levels to aggregate (default 5). Clamped to [1, available].
 *   weights - optional per-level weights array (length >= levels); equal weight if omitted/null.
 * @returns {{ ofi: number|null, levels: number, weights: number[]|null, perLevel: number[], sign: 1|-1|0 }}
 *   ofi = null if currBook is empty/malformed; sign derived from weighted sum.
 */
export function computeMultiLevelOFI(prevBook, currBook, opts = {}) {
  const levels = Math.max(1, Number.isFinite(opts.levels) ? Math.floor(opts.levels) : 5);
  const weights = Array.isArray(opts.weights) ? opts.weights : null;

  // Fail-open: empty/non-array currBook
  if (!Array.isArray(currBook) || currBook.length === 0) {
    return { ofi: null, levels, weights, perLevel: [], sign: 0 };
  }

  // First event (no prev) → OFI undefined; return 0 sum (consistent with
  // ofiContribution first-snapshot semantics where e=0).
  if (prevBook === null || prevBook === undefined) {
    return { ofi: 0, levels, weights, perLevel: new Array(levels).fill(0), sign: 0 };
  }
  if (!Array.isArray(prevBook)) {
    return { ofi: null, levels, weights, perLevel: [], sign: 0 };
  }

  // Number of levels actually aggregable = min(requested, curr depth, prev depth+1)
  // A curr level with no prev counterpart contributes 0 (handled in _ofiLevelContribution).
  const N = Math.min(levels, currBook.length);

  const perLevel = new Array(N).fill(0);
  let ofi = 0;

  for (let n = 0; n < N; n++) {
    const e = _ofiLevelContribution(prevBook[n] ?? null, currBook[n]);
    perLevel[n] = e;
    const w = (weights && n < weights.length && Number.isFinite(weights[n])) ? weights[n] : 1;
    ofi += w * e;
  }

  // If all per-level contributions were 0 due to invalidity AND N=0, fail-open.
  if (N < 1) {
    return { ofi: null, levels, weights, perLevel: [], sign: 0 };
  }

  const sign = ofi > 0 ? 1 : ofi < 0 ? -1 : 0;
  return { ofi, levels, weights, perLevel, sign };
}

// ── estimateLambda ────────────────────────────────────────────────────────────

/**
 * estimateLambda(pairs, minWindow) -> { lambda, alpha, rSquared, n }
 *
 * Estimates the OFI price-impact coefficient λ (and intercept α) via rolling OLS:
 *   Δmid ≈ λ · ofi + α
 *
 * From Cont, Kukanov & Stoikov (2014): λ > 0 is expected — positive OFI (net buy
 * pressure) predicts a positive mid-price change. The R² is the contemporaneous
 * fit statistic; typical values:
 *   Contemporaneous: R² ~ 0.65–0.87 (equities/futures from the paper)
 *   Predictive @1s:  R² ~ 0.25–0.35
 *   YURI crypto perp predictive @100–500ms: R²>0.15 = meaningful; <0.10 = noise.
 *
 * @param {{ ofi: number, deltaMid: number }[]} pairs - (ofi, deltaMid) observations
 * @param {number} [minWindow=30] - minimum observations required; returns nulls below
 * @returns {{ lambda: number|null, alpha: number|null, rSquared: number|null, n: number }}
 */
export function estimateLambda(pairs, minWindow = 30) {
  const nullResult = (n) => ({ lambda: null, alpha: null, rSquared: null, n });

  if (!Array.isArray(pairs)) return nullResult(0);

  // Filter valid pairs (both ofi and deltaMid must be finite)
  const valid = pairs.filter(
    p => Number.isFinite(p?.ofi) && Number.isFinite(p?.deltaMid)
  );
  const n = valid.length;

  if (n < minWindow) return nullResult(n);

  // ── OLS: Δmid = α + λ·ofi ────────────────────────────────────────────────
  // Normal equations in one pass:
  //   sumX, sumY, sumXX, sumXY, sumYY
  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0, sumYY = 0;
  for (const { ofi, deltaMid } of valid) {
    sumX  += ofi;
    sumY  += deltaMid;
    sumXX += ofi * ofi;
    sumXY += ofi * deltaMid;
    sumYY += deltaMid * deltaMid;
  }

  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-30) {
    // All OFI values identical → no variance; degenerate
    return nullResult(n);
  }

  const lambda = (n * sumXY - sumX * sumY) / denom;
  const alpha  = (sumY - lambda * sumX) / n;

  // ── R² ───────────────────────────────────────────────────────────────────
  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (const { ofi, deltaMid } of valid) {
    const predicted = alpha + lambda * ofi;
    ssTot += (deltaMid - meanY) ** 2;
    ssRes += (deltaMid - predicted) ** 2;
  }

  const rSquared = ssTot < 1e-30 ? 0 : Math.max(0, 1 - ssRes / ssTot);

  return { lambda, alpha, rSquared, n };
}

// ── --test self-test (deterministic, no network) ──────────────────────────────

const _runAsMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (_runAsMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;

  const assert = (cond, label) => {
    if (cond) { pass++; }
    else { fail++; console.error(`FAIL: ${label}`); }
  };

  const snap = (bidPx, bidSz, askPx, askSz, ts = 0) =>
    ({ ts, bidPx, bidSz, askPx, askSz });

  // ── ofiContribution ────────────────────────────────────────────────────────

  // T1: first snapshot (null prev) → e=0, not skipped
  const r1 = ofiContribution(null, snap(100, 10, 101, 10));
  assert(r1.e === 0 && !r1.skipped, `T1 first-snap → e=0 skipped=false (got e=${r1.e} skipped=${r1.skipped})`);

  // T2: pure bid lift (bidPx rises) → positive B, C=0 (ask same) → positive e
  // prev: bid=100/10, ask=101/10; curr: bid=100.5/12, ask=101/10
  // B: 100.5>100 → +12; C: ask same → -(10-10)=0 → e=+12
  const r2 = ofiContribution(snap(100, 10, 101, 10), snap(100.5, 12, 101, 10));
  assert(r2.e > 0 && !r2.skipped,
    `T2 bid lift → positive e (got e=${r2.e} skipped=${r2.skipped})`);
  assert(Math.abs(r2.e - 12) < 1e-10,
    `T2 bid lift B=+12 C=0 → e=12 (got ${r2.e})`);

  // T3: pure ask drop → negative e (aggressive offer)
  // prev: bid=100/10, ask=101/10; curr: bid=100/10, ask=100.5/8
  // B: same px → +(10-10)=0; C: 100.5<101 → -8 → e=-8
  const r3 = ofiContribution(snap(100, 10, 101, 10), snap(100, 10, 100.5, 8));
  assert(r3.e < 0 && !r3.skipped,
    `T3 ask drop → negative e (got e=${r3.e} skipped=${r3.skipped})`);
  assert(Math.abs(r3.e - (-8)) < 1e-10,
    `T3 ask drop C=-8 → e=-8 (got ${r3.e})`);

  // T4: bid pulled (price falls) → negative B
  // prev: bid=100/10, ask=101/10; curr: bid=99/8, ask=101/10
  // B: 99<100 → -10 (prev bidSz); C: ask same → 0 → e=-10
  const r4 = ofiContribution(snap(100, 10, 101, 10), snap(99, 8, 101, 10));
  assert(Math.abs(r4.e - (-10)) < 1e-10,
    `T4 bid pulled → B=-10 e=-10 (got ${r4.e})`);

  // T5: ask lifted / cancelled (price rises) → positive C (supply removed)
  // prev: bid=100/10, ask=101/10; curr: bid=100/10, ask=102/7
  // B: same → 0; C: 102>101 → +10 (prev askSz) → e=+10
  const r5 = ofiContribution(snap(100, 10, 101, 10), snap(100, 10, 102, 7));
  assert(Math.abs(r5.e - 10) < 1e-10,
    `T5 ask lifted → C=+10 e=+10 (got ${r5.e})`);

  // T6: crossed book in curr → skipped=true crossedBook=true
  const r6 = ofiContribution(snap(100, 10, 101, 10), snap(101.5, 10, 101, 10));
  assert(r6.skipped && r6.crossedBook,
    `T6 crossed book → skipped=true crossedBook=true (got skipped=${r6.skipped} crossed=${r6.crossedBook})`);

  // T7: NaN in curr → skipped=true
  const r7 = ofiContribution(snap(100, 10, 101, 10), snap(NaN, 10, 101, 10));
  assert(r7.skipped && !r7.crossedBook,
    `T7 NaN curr bidPx → skipped=true (got skipped=${r7.skipped})`);

  // T8: bid and ask sizes change at same price level
  // prev: bid=100/20, ask=101/15; curr: bid=100/8, ask=101/22
  // B: same px → +(8-20)=-12; C: same px → -(22-15)=-7 → e=-19
  const r8 = ofiContribution(snap(100, 20, 101, 15), snap(100, 8, 101, 22));
  assert(Math.abs(r8.e - (-19)) < 1e-10,
    `T8 same-price queue change → e=-19 (got ${r8.e})`);

  // ── computeOFI ────────────────────────────────────────────────────────────

  // T9: pure bid-lift sequence → positive OFI
  const bidLiftSeq = [
    snap(100, 10, 101, 10),
    snap(100.5, 12, 101, 10),
    snap(101, 15, 101.5, 10),
    snap(101.5, 18, 102, 10),
  ];
  const ofi9 = computeOFI(bidLiftSeq, { normalize: 'raw' });
  assert(ofi9.ofi !== null && ofi9.ofi > 0 && ofi9.sign === 1,
    `T9 bid-lift sequence → positive OFI (got ${ofi9.ofi})`);
  assert(ofi9.bucketsUsed === 3,
    `T9 bucketsUsed=3 (got ${ofi9.bucketsUsed})`);

  // T10: pure ask-drop sequence → negative OFI
  const askDropSeq = [
    snap(100, 10, 102, 10),
    snap(100, 10, 101.5, 8),
    snap(100, 10, 101, 6),
    snap(100, 10, 100.5, 5),
  ];
  const ofi10 = computeOFI(askDropSeq, { normalize: 'raw' });
  assert(ofi10.ofi !== null && ofi10.ofi < 0 && ofi10.sign === -1,
    `T10 ask-drop sequence → negative OFI (got ${ofi10.ofi})`);

  // T11: depth-normalized — OFI scaled by avgDepth
  const ofi11 = computeOFI(bidLiftSeq, { normalize: 'depth-normalized' });
  const ofi11r = computeOFI(bidLiftSeq, { normalize: 'raw' });
  assert(ofi11.ofi !== null && ofi11r.ofi !== null,
    'T11 depth-normalized: both non-null');
  // avgDepth for bidLiftSeq (3 valid curr snapshots):
  // (12+10 + 15+10 + 18+10) / 3 = (22+25+28)/3 = 75/3 = 25
  const expectedAvgDepth = 25;
  assert(Math.abs(ofi11.avgDepth - expectedAvgDepth) < 1e-6,
    `T11 avgDepth=${expectedAvgDepth} (got ${ofi11.avgDepth})`);
  assert(Math.abs(ofi11.ofi - ofi11r.ofi / expectedAvgDepth) < 1e-10,
    `T11 depth-norm = raw/avgDepth (got ${ofi11.ofi} vs ${ofi11r.ofi / expectedAvgDepth})`);

  // T12: fewer than 2 snapshots → ofi=null
  const ofi12a = computeOFI([], {});
  assert(ofi12a.ofi === null, `T12a empty → null (got ${ofi12a.ofi})`);
  const ofi12b = computeOFI([snap(100, 10, 101, 10)], {});
  assert(ofi12b.ofi === null, `T12b single snap → null (got ${ofi12b.ofi})`);

  // T13: all snapshots crossed → bucketsUsed=0 → ofi=null
  const crossedSeq = [
    snap(102, 10, 101, 10),  // crossed (bid >= ask)
    snap(103, 10, 101, 10),  // crossed
  ];
  const ofi13 = computeOFI(crossedSeq, {});
  assert(ofi13.ofi === null,
    `T13 all-crossed → ofi=null (got ${ofi13.ofi})`);

  // T14: z-scored with sufficient history
  const zHist = Array.from({ length: 20 }, (_, i) => i - 10); // -10 to 9
  // mean=−0.5, variance=33.25, std≈5.77
  const zMean = zHist.reduce((a, b) => a + b, 0) / zHist.length;
  const zVar  = zHist.reduce((s, v) => s + (v - zMean) ** 2, 0) / zHist.length;
  const zStd  = Math.sqrt(zVar);
  const rawOFI14 = ofi11r.ofi; // reuse the computed rawOFI from bidLiftSeq
  const expectedZScore = (rawOFI14 - zMean) / zStd;
  const ofi14 = computeOFI(bidLiftSeq, { normalize: 'z-scored', zHistory: zHist });
  assert(ofi14.ofi !== null && Math.abs(ofi14.ofi - expectedZScore) < 1e-8,
    `T14 z-scored correct (got ${ofi14.ofi} expected ${expectedZScore})`);

  // T15: z-scored with insufficient history (<2) → falls back to raw
  const ofi15 = computeOFI(bidLiftSeq, { normalize: 'z-scored', zHistory: [5] });
  assert(ofi15.ofi !== null && Math.abs(ofi15.ofi - ofi11r.ofi) < 1e-10,
    `T15 z-scored insufficient history → raw fallback (got ${ofi15.ofi} expected ${ofi11r.ofi})`);

  // ── estimateLambda ────────────────────────────────────────────────────────

  // T16: recover known positive slope from synthetic (deltaMid = λ·ofi + noise≈0)
  const LAMBDA_TRUE = 0.5;
  const ALPHA_TRUE  = 0.002;
  const syntheticPairs = Array.from({ length: 60 }, (_, i) => {
    const ofi = (i - 30) * 0.1;            // spans −3 to +2.9
    const deltaMid = ALPHA_TRUE + LAMBDA_TRUE * ofi;  // exact linear, no noise
    return { ofi, deltaMid };
  });
  const est16 = estimateLambda(syntheticPairs, 30);
  assert(est16.lambda !== null,
    `T16 lambda non-null (got ${est16.lambda})`);
  assert(est16.lambda > 0,
    `T16 lambda positive (got ${est16.lambda})`);
  assert(Math.abs(est16.lambda - LAMBDA_TRUE) < 1e-8,
    `T16 lambda recovered ${LAMBDA_TRUE} (got ${est16.lambda})`);
  assert(Math.abs(est16.alpha - ALPHA_TRUE) < 1e-8,
    `T16 alpha recovered ${ALPHA_TRUE} (got ${est16.alpha})`);
  assert(Math.abs(est16.rSquared - 1) < 1e-8,
    `T16 R²=1 on exact linear (got ${est16.rSquared})`);
  assert(est16.n === 60, `T16 n=60 (got ${est16.n})`);

  // T17: insufficient data (n < minWindow) → null fields
  const est17 = estimateLambda(syntheticPairs.slice(0, 10), 30);
  assert(est17.lambda === null && est17.alpha === null && est17.rSquared === null,
    `T17 insufficient data → null fields (got λ=${est17.lambda} α=${est17.alpha} R²=${est17.rSquared})`);
  assert(est17.n === 10, `T17 n=10 (got ${est17.n})`);

  // T18: NaN pairs skipped
  const pairsWithNaN = [
    ...syntheticPairs,
    { ofi: NaN, deltaMid: 0.1 },
    { ofi: 0.5, deltaMid: NaN },
  ];
  const est18 = estimateLambda(pairsWithNaN, 30);
  assert(est18.n === 60, // NaN pairs skipped, same 60 valid
    `T18 NaN pairs filtered, n=60 (got ${est18.n})`);

  // T19: empty pairs → nulls
  const est19 = estimateLambda([], 30);
  assert(est19.lambda === null && est19.n === 0,
    `T19 empty → nulls n=0 (got λ=${est19.lambda} n=${est19.n})`);

  // T20: constant OFI (zero variance) → null (degenerate)
  const constPairs = Array.from({ length: 30 }, () => ({ ofi: 1.0, deltaMid: 0.01 }));
  const est20 = estimateLambda(constPairs, 30);
  assert(est20.lambda === null,
    `T20 constant OFI → null lambda (got ${est20.lambda})`);

  // T21: verify computeMicroprice import works (sanity)
  // bids=[{price:100,size:10}], asks=[{price:102,size:10}]
  // microprice = (100×10 + 102×10)/20 = 101
  const mp = computeMicroprice(
    [{ price: 100, size: 10 }],
    [{ price: 102, size: 10 }],
  );
  assert(Math.abs(mp - 101) < 1e-10,
    `T21 computeMicroprice import → 101 (got ${mp})`);

  // ── computeMultiLevelOFI (multi-level OFI, CKS §4) ─────────────────────────

  // Helper: build a book level object
  const lvl = (bidPx, bidSz, askPx, askSz) => ({ bidPx, bidSz, askPx, askSz });

  // M1 (GREEN): hand-computed 3-level book delta → expected multi-level OFI.
  // prev levels:                  curr levels:
  //   L0: bid 100/10  ask 101/10    L0: bid 100.5/12 ask 101/10   (bid lift)
  //   L1: bid  99/20  ask 102/20    L1: bid  99.5/22 ask 102/20   (bid lift at L1)
  //   L2: bid  98/30  ask 103/30    L2: bid  98/30   ask 103/25   (ask queue shrink at L2)
  //
  // Hand-compute each level's e_n (same CKS B_n + C_n as ofiContribution):
  //   L0: B: 100.5>100 → +12; C: ask same → -(10-10)=0       → e_0 = +12
  //   L1: B:  99.5>99  → +22; C: ask same → -(20-20)=0       → e_1 = +22
  //   L2: B:  98=98    → +(30-30)=0; C: ask same → -(25-30)=+5 → e_2 = +5
  //   Sum (equal weight) = 12 + 22 + 5 = +39
  const prevBook3 = [ lvl(100, 10, 101, 10), lvl(99, 20, 102, 20), lvl(98, 30, 103, 30) ];
  const currBook3 = [ lvl(100.5, 12, 101, 10), lvl(99.5, 22, 102, 20), lvl(98, 30, 103, 25) ];
  const ml1 = computeMultiLevelOFI(prevBook3, currBook3, { levels: 3 });
  assert(ml1.ofi !== null,
    `M1 multi-level OFI non-null (got ${ml1.ofi})`);
  assert(Math.abs(ml1.ofi - 39) < 1e-9,
    `M1 3-level sum = +39 (got ${ml1.ofi})`);
  assert(Math.abs(ml1.perLevel[0] - 12) < 1e-9,
    `M1 L0 e_0=+12 (got ${ml1.perLevel[0]})`);
  assert(Math.abs(ml1.perLevel[1] - 22) < 1e-9,
    `M1 L1 e_1=+22 (got ${ml1.perLevel[1]})`);
  assert(Math.abs(ml1.perLevel[2] - 5) < 1e-9,
    `M1 L2 e_2=+5 (got ${ml1.perLevel[2]})`);
  assert(ml1.sign === 1, `M1 sign=+1 (got ${ml1.sign})`);

  // M2 (METAMORPHIC — identity): levels=1 reproduces single-level ofiContribution EXACTLY.
  // The opt-in/identity guarantee: computeMultiLevelOFI(...,{levels:1}).ofi === ofiContribution(b0,c0).e
  const prevBook1 = [ lvl(100, 10, 101, 10), lvl(99, 20, 102, 20), lvl(98, 30, 103, 30) ];
  const currBook1 = [ lvl(100.5, 12, 101, 10), lvl(99.5, 22, 102, 20), lvl(98, 30, 103, 25) ];
  const ml2 = computeMultiLevelOFI(prevBook1, currBook1, { levels: 1 });
  const single = ofiContribution(prevBook1[0], currBook1[0]);
  assert(Math.abs(ml2.ofi - single.e) < 1e-12,
    `M2 levels=1 === ofiContribution.e EXACT (ml=${ml2.ofi} single=${single.e})`);
  assert(Math.abs(ml2.ofi - 12) < 1e-9,
    `M2 levels=1 = +12 (best-level bid lift) (got ${ml2.ofi})`);
  assert(ml2.perLevel.length === 1,
    `M2 levels=1 → perLevel has 1 entry (got ${ml2.perLevel.length})`);

  // M3 (METAMORPHIC — monotonic): more levels with flow in the same direction →
  // larger-magnitude OFI. The 3-level book (M1) has all buy-positive flow, so
  // |OFI(levels=3)| > |OFI(levels=1)|.
  const ml3a = computeMultiLevelOFI(prevBook3, currBook3, { levels: 1 });
  const ml3b = computeMultiLevelOFI(prevBook3, currBook3, { levels: 3 });
  assert(ml3b.ofi > ml3a.ofi && ml3b.ofi > 0,
    `M3 more levels same-direction → larger OFI (1L=${ml3a.ofi} 3L=${ml3b.ofi})`);
  assert(Math.abs(ml3a.ofi - 12) < 1e-9 && Math.abs(ml3b.ofi - 39) < 1e-9,
    `M3 1L=+12 < 3L=+39 (got ${ml3a.ofi}, ${ml3b.ofi})`);

  // M4 (WEIGHTS): custom weights scale the per-level sum.
  // weights=[1, 0.5, 0] → 1·12 + 0.5·22 + 0·5 = 12 + 11 + 0 = +23
  const ml4 = computeMultiLevelOFI(prevBook3, currBook3, { levels: 3, weights: [1, 0.5, 0] });
  assert(Math.abs(ml4.ofi - 23) < 1e-9,
    `M4 weighted [1,0.5,0] → 1·12+0.5·22+0·5=+23 (got ${ml4.ofi})`);

  // M5 (WEIGHTS decay): exponential decay weights=[1, 0.6, 0.36]
  // → 1·12 + 0.6·22 + 0.36·5 = 12 + 13.2 + 1.8 = +27
  const ml5 = computeMultiLevelOFI(prevBook3, currBook3, { levels: 3, weights: [1, 0.6, 0.36] });
  assert(Math.abs(ml5.ofi - 27) < 1e-9,
    `M5 exp-decay [1,0.6,0.36] → +27 (got ${ml5.ofi})`);

  // M6 (RED — empty currBook): → ofi=null, no throw
  const ml6 = computeMultiLevelOFI(prevBook3, [], { levels: 3 });
  assert(ml6.ofi === null,
    `M6 empty currBook → null (got ${ml6.ofi})`);

  // M7 (RED — null prevBook = first event): → ofi=0, no throw
  const ml7 = computeMultiLevelOFI(null, currBook3, { levels: 3 });
  assert(ml7.ofi === 0,
    `M7 null prevBook (first event) → ofi=0 (got ${ml7.ofi})`);

  // M8 (RED — malformed levels with NaN): NaN fields → 0 contribution, no throw
  const badPrev = [ lvl(100, 10, 101, 10), lvl(NaN, 20, 102, 20) ];
  const badCurr = [ lvl(100, 10, 101, 10), lvl(99, NaN, 102, 20) ];
  const ml8 = computeMultiLevelOFI(badPrev, badCurr, { levels: 2 });
  assert(ml8.ofi === 0,
    `M8 malformed/NaN levels → 0 contribution, no throw (got ${ml8.ofi})`);
  assert(ml8.perLevel[0] === 0 && ml8.perLevel[1] === 0,
    `M8 perLevel all 0 (got [${ml8.perLevel}])`);

  // M9 (RED — one-sided / crossed level): crossed level skipped → 0 contribution
  const crossedPrev = [ lvl(100, 10, 101, 10) ];
  const crossedCurr = [ lvl(101, 10, 101, 10) ]; // locked (bid>=ask)
  const ml9 = computeMultiLevelOFI(crossedPrev, crossedCurr, { levels: 1 });
  assert(ml9.ofi === 0,
    `M9 crossed/locked level → 0 contribution (got ${ml9.ofi})`);

  // M10 (deeper curr than prev): level present in curr but not prev → 0 for that level
  // prev has 1 level, curr has 3. L0 = bid lift (+12); L1,L2 have no prev → 0.
  const ml10 = computeMultiLevelOFI(
    [ lvl(100, 10, 101, 10) ],
    [ lvl(100.5, 12, 101, 10), lvl(99, 20, 102, 20), lvl(98, 30, 103, 30) ],
    { levels: 3 }
  );
  assert(Math.abs(ml10.ofi - 12) < 1e-9,
    `M10 curr-deeper-than-prev → only L0 contributes +12 (got ${ml10.ofi})`);
  assert(ml10.perLevel[1] === 0 && ml10.perLevel[2] === 0,
    `M10 L1,L2 = 0 (no prev) (got [${ml10.perLevel}])`);

  // M11 (default levels=5 when omitted): clamps to available depth
  const ml11 = computeMultiLevelOFI(prevBook3, currBook3); // no opts
  assert(ml11.levels === 5 && ml11.ofi !== null,
    `M11 default levels=5, clamped to 3 available → non-null (levels=${ml11.levels} ofi=${ml11.ofi})`);
  assert(Math.abs(ml11.ofi - 39) < 1e-9,
    `M11 clamped to 3 levels → +39 (got ${ml11.ofi})`);

  // ── summary ───────────────────────────────────────────────────────────────
  console.log(`ofi --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}
