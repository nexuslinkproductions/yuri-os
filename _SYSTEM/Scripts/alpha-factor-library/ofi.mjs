#!/usr/bin/env node
// @capability: order-flow-imbalance
// @serves: OFI | order flow imbalance | Cont Kukanov Stoikov | price impact | flow measure | short-horizon alpha | bid lift | ask drop | microstructure
// @does: Computes per-event OFI contributions (e_n = B_n + C_n) from consecutive best-level snapshots, buckets them with depth-normalized/raw/z-scored variants, and estimates the contemporaneous λ (price-impact coefficient) via rolling OLS. Pure math, fail-open, no network.
// @use: Feed consecutive {ts,bidPx,bidSz,askPx,askSz} snapshots to ofiContribution(); aggregate with computeOFI(); calibrate λ with estimateLambda(). Validation targets: contemporaneous R² ~0.65–0.87, predictive ~0.25–0.35 @1s; predictive R²>0.15 @100–500ms = meaningful, <0.10 = noise.
// @exports: ofiContribution, computeOFI, estimateLambda
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

  // ── summary ───────────────────────────────────────────────────────────────
  console.log(`ofi --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}
