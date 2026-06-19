#!/usr/bin/env node
// @capability: as-baseline
// @serves: A-S baseline paper run | inventory skew baseline | bucketed maker PnL | spread-capture attribution | adverse-selection cost | inventory MTM | fee attribution | DISARMED offline maker sim | two-sided quote harness | kappa-driven quotes
// @does: DISARMED offline A-S baseline paper-run harness over a recorded tape. Walks the tape at a sample cadence, maintains per-second EWMA vol (return→price conversion), places two-sided A-S quotes (reservationPrice + optimalSpread) with inventory skew and a hard q-limit, simulates BOTH legs via the queue-honest fill model, and attributes PnL into SEPARATE buckets: spread-capture, adverse-selection, inventory/MTM, and fees. Pure offline analysis — NO orders, NO network, NO daemon writes. Fail-open throughout.
// @use: node as-baseline.mjs --run <tape.jsonl> [--gamma 0.2] [--kappa-from <fill-surface.json>] [--kappa 0.07] [--adverse 0.16] [--qmax 3] [--requote 5] [--mid 62700] [--sample 5] [--fee-rt 4.0] [--size 0.001]; or --test for self-test.
// @exports: runBaseline, attributePnl, sumFills

// ─────────────────────────────────────────────────────────────────────────────
// DISCLAIMER: DISARMED — pure offline analysis. NO exchange orders, NO network,
// NO daemon writes. Reads the tape, replays, attributes PnL. Output is an
// offline research artifact, never a live trading signal.
//
// MATH ANCHOR (glm-5.2 design, 2026-06-19):
//   - σ pipeline: sigmaEwma(1s log-return²) → per-second RETURN vol → sigmaPrice(σ, mid)
//     → per-second PRICE vol. BOTH conversions mandatory (A-S AXIS-2 bug fix).
//   - quotes() from avellaneda-stoikov.mjs: reservationPrice + optimalSpread,
//     anchored on microprice. κ must be in PRICE units (per $) to match the
//     price-scale halfSpread. kappa-fit gives kappaPrice (per $) AND kappaBps.
//   - PnL attribution: spread-capture (maker edge per fill = halfSpread),
//     adverse-selection (mid move against fill over an attribution window),
//     inventory/MTM (q × Δmid realized at position close), fees (round-trip).
//
// CAVEAT — CROSSED BOOK (observed 2026-06-19 tape): bookAt mid/topBids/topAsks
// show a persistently CROSSED book (bid > ask, negative spread) on this tape —
// likely a snapshot-seed or L2-level-sorting artifact in the recorder. The mid
// is still used as a centroid fair-value anchor (robust to crossing), and
// simulateOrder fills from real trade-queue drainage (independent of the
// crossed L2). BUT: microprice and spread-derived signals are unreliable when
// crossed. The harness flags the crossed-book ratio and uses mid (not
// microprice) as the anchor when the book is crossed, microprice when clean.
// This is a RECORDING artifact to REPORT, not a bug in this module.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadTape } from './tape-replay.mjs';
import { sigmaEwma, sigmaPrice, reservationPrice, optimalSpread, quotes } from './avellaneda-stoikov.mjs';
import { computeMicroprice } from './orderbook-imbalance.mjs';
import { fitKappa } from './kappa-fit.mjs';
import { regimeBreaker } from './regime-breaker.mjs';
import { fundingSkew } from './funding-skew.mjs';

// ── GUARDS ───────────────────────────────────────────────────────────────────

const fin = (x) => typeof x === 'number' && Number.isFinite(x);

// ── loadKappa: from fill-surface JSON or explicit --kappa (price units) ───────

/**
 * Resolve kappa in PRICE units (per $) for quotes().
 * If kappaFromPath is given, load + fitKappa → pooled.kappaPrice.
 * Else if explicitKappa given (interpreted as per-$), use it.
 * Else null (caller must handle).
 * @returns {{ kappaPrice:number|null, kappaBps:number|null, r2:number|null, source:string }}
 */
function resolveKappa({ kappaFromPath, explicitKappa, mid, tickSize }) {
  const safeMid = fin(mid) && mid > 0 ? mid : 62700;
  const safeTick = fin(tickSize) && tickSize > 0 ? tickSize : 0.1;
  if (kappaFromPath) {
    try {
      const j = JSON.parse(readFileSync(kappaFromPath, 'utf8'));
      const fit = fitKappa(j.surface, { mid: safeMid, tickSize: safeTick });
      if (fit.pooled && fin(fit.pooled.kappaPrice) && fit.pooled.kappaPrice > 0) {
        return { kappaPrice: fit.pooled.kappaPrice, kappaBps: fit.pooled.kappaBps, r2: fit.pooled.r2, source: `fitKappa(${kappaFromPath})` };
      }
      return { kappaPrice: null, kappaBps: null, r2: null, source: `fitKappa(${kappaFromPath}) → no usable pooled fit` };
    } catch {
      return { kappaPrice: null, kappaBps: null, r2: null, source: `fitKappa read-fail: ${kappaFromPath}` };
    }
  }
  if (fin(explicitKappa) && explicitKappa > 0) {
    // explicitKappa interpreted as per-$ (price units) directly
    const kappaBps = explicitKappa * safeMid / 1e4;
    return { kappaPrice: explicitKappa, kappaBps, r2: null, source: '--kappa (per $)' };
  }
  return { kappaPrice: null, kappaBps: null, r2: null, source: 'none (no kappa → quotes null)' };
}

// ── attributePnl: single fill PnL decomposition ──────────────────────────────

/**
 * Attribute a single fill into spread-capture, adverse-selection, inventory, fees.
 *
 * @param {object} opts
 * @param {'buy'|'sell'} opts.side
 * @param {number} opts.fillPrice  - price the fill occurred at
 * @param {number} opts.halfSpread - half-spread in PRICE units at quote time (maker edge)
 * @param {number} opts.midAtFill  - mid at fill time
 * @param {number} opts.midAtWindow - mid after attribution window (for AS measurement)
 * @param {number} opts.adverseBpsParam - if provided, use this AS cost (bps) instead of measuring
 * @param {number} opts.feeRtBps   - round-trip fee in bps
 * @param {number} opts.mid        - reference mid (for bps conversion)
 * @returns {{ spreadBps:number, adverseBps:number, feeBps:number, netBps:number }|null}
 */
export function attributePnl(opts = {}) {
  try {
    if (!opts || typeof opts !== 'object') return null;
    const { side, fillPrice, halfSpread, midAtFill, midAtWindow, adverseBpsParam, feeRtBps = 4.0, mid } = opts;
    if ((side !== 'buy' && side !== 'sell') || !fin(fillPrice) || !fin(mid) || mid <= 0) return null;
    const refMid = fin(midAtFill) && midAtFill > 0 ? midAtFill : mid;

    // (a) Spread-capture: the maker edge = halfSpread, in bps
    const hsBps = fin(halfSpread) && halfSpread >= 0 ? (halfSpread / refMid) * 1e4 : 0;

    // (b) Adverse-selection: mid moves AGAINST us over the window.
    // Buy fill: we're long, adverse if mid drops. AS = max(0, midAtFill - midAtWindow)/mid * 1e4
    // Sell fill: we're short, adverse if mid rises. AS = max(0, midAtWindow - midAtFill)/mid * 1e4
    let adverseBps;
    if (fin(adverseBpsParam) && adverseBpsParam >= 0) {
      adverseBps = adverseBpsParam;
    } else if (fin(midAtWindow) && midAtWindow > 0) {
      const moveBps = ((midAtWindow - refMid) / refMid) * 1e4;
      adverseBps = side === 'buy' ? Math.max(0, -moveBps) : Math.max(0, moveBps);
    } else {
      adverseBps = 0;
    }

    // (c) Fees: round-trip (entry + exit maker), in bps
    const feeBps = fin(feeRtBps) && feeRtBps >= 0 ? feeRtBps : 4.0;

    // Net per fill
    const netBps = hsBps - adverseBps - feeBps;

    return { spreadBps: hsBps, adverseBps, feeBps, netBps };
  } catch {
    return null;
  }
}

// ── sumFills: aggregate bucketed PnL across all fills ────────────────────────

/**
 * @param {object[]} fillResults - array of attributePnl outputs + inventory events
 * @param {object} opts - { inventoryPnlBps (realized MTM), totalNotionalMid, bookMid }
 * @returns {object} summary
 */
export function sumFills(fillResults, opts = {}) {
  try {
    if (fillResults == null) return null;
    const { inventoryPnlBps = 0, maxInventory = 0, sampleCount = 0 } = opts || {};
    const fills = (fillResults || []).filter((f) => f && fin(f.netBps));
    const n = fills.length;
    if (n === 0) {
      return {
        fills: 0, fillRate: 0,
        grossSpreadBps: 0, adverseSelBps: 0, feeBps: 0, inventoryPnlBps: fin(inventoryPnlBps) ? inventoryPnlBps : 0,
        netBps: 0, maxInventory: fin(maxInventory) ? maxInventory : 0,
        fillRatePerSide: { bid: 0, ask: 0 },
      };
    }
    const avg = (key) => fills.reduce((s, f) => s + (f[key] || 0), 0) / n;
    const grossSpreadBps = avg('spreadBps');
    const adverseSelBps = avg('adverseBps');
    const feeBps = avg('feeBps');
    const invBps = fin(inventoryPnlBps) ? inventoryPnlBps / n : 0; // per-fill-normalized inventory
    const netBps = grossSpreadBps - adverseSelBps - feeBps + invBps;
    const bidFills = fills.filter((f) => f.side === 'buy').length;
    const askFills = fills.filter((f) => f.side === 'sell').length;
    return {
      fills: n,
      fillRate: sampleCount > 0 ? n / (sampleCount * 2) : 0, // 2 sides per sample
      grossSpreadBps, adverseSelBps, feeBps,
      inventoryPnlBps: invBps,
      netBps,
      maxInventory: fin(maxInventory) ? maxInventory : 0,
      fillRatePerSide: {
        bid: sampleCount > 0 ? bidFills / sampleCount : 0,
        ask: sampleCount > 0 ? askFills / sampleCount : 0,
      },
    };
  } catch {
    return null;
  }
}

// ── runBaseline: the main harness ────────────────────────────────────────────

/**
 * DISARMED A-S baseline paper run over a tape.
 *
 * @param {object} opts
 * @param {string} opts.tapePath - path to the JSONL tape
 * @param {number} [opts.gamma=0.2]
 * @param {number} [opts.kappaPrice] - explicit κ per $ (mutually exclusive with kappaFrom)
 * @param {string}  [opts.kappaFrom] - path to fill-surface JSON for fitKappa
 * @param {number}  [opts.adverseBps=0.16] - adverse-selection cost in bps (param; 0 = measure from tape)
 * @param {number}  [opts.measureAdverseSec=5] - window to measure AS from tape if adverseBps=0
 * @param {number}  [opts.qmax=3] - inventory hard limit (± lots)
 * @param {number}  [opts.requoteSec=5] - requote/fill horizon in seconds
 * @param {number}  [opts.sampleEverySec=5] - sampling cadence
 * @param {number}  [opts.feeRtBps=4.0] - round-trip fee bps
 * @param {number}  [opts.size=0.001] - order size in base units
 * @param {number}  [opts.mid=62700] - reference mid for bps conversion / kappa fit
 * @param {number}  [opts.tickSize=0.1]
 * @param {number}  [opts.tau=1] - A-S time-to-horizon
 * @param {number}  [opts.volHalfLifeSec=30] - EWMA half-life for sigmaEwma
 * @param {number}  [opts.maxSamples=Infinity] - cap samples (for quick runs)
 * @returns {Promise<object|null>} summary or null on fatal error
 */
export async function runBaseline(opts = {}) {
  const {
    tapePath, gamma = 0.2, kappaPrice: explicitKappa, kappaFrom,
    adverseBps = 0.16, measureAdverseSec = 5, qmax = 3,
    requoteSec = 5, sampleEverySec = 5, feeRtBps = 4.0, size = 0.001,
    mid = 62700, tickSize = 0.1, tau = 1, volHalfLifeSec = 30,
    maxSamples = Infinity,
    // ── PASS-1 DISARMED hardening opts (all default undefined = OFF) ──
    // WIRE 1: A-S quote guards. Threaded into quotes() ONLY when finite.
    //   minHalfSpreadBps/maxHalfSpreadBps: spread floor/ceiling (bps).
    //   maxSkewTicks: clamp the reservation-price inventory-skew (passed to quotes()).
    //   quoteQMax: quotes()'s OWN price-suppression qMax (distinct from the harness qmax).
    //     When |q|≥quoteQMax, quotes() nulls the inventory-increasing side's px.
    minHalfSpreadBps, maxHalfSpreadBps, maxSkewTicks, quoteQMax,
    // WIRE 2: regime-breaker. Truthy object {zWiden,zHalt,widenMult} or true → ON.
    //   halt → skip quoting this sample; widen → multiply halfSpread by widenMult (default 1.5).
    regimeBreak,
    // WIRE 3: funding-skew. fundingRate finite & nonzero → add reservationAdjPrice to anchor.
    //   secsToFunding default undefined → fundingSkew treats as at-settlement (max proximity).
    fundingRate, secsToFunding,
  } = opts;

  // ── fail-open param checks ──
  if (!tapePath || typeof tapePath !== 'string') return null;
  if (!fin(gamma) || gamma <= 0) return null;
  if (!fin(qmax) || qmax <= 0) return null;
  if (!fin(requoteSec) || requoteSec <= 0) return null;
  if (!fin(sampleEverySec) || sampleEverySec <= 0) return null;

  const useAdverseParam = fin(adverseBps) && adverseBps > 0;

  // ── PASS-1 hardening flag resolution (DISARMED: all default OFF) ──
  const useMinSpread = fin(minHalfSpreadBps);
  const useMaxSpread = fin(maxHalfSpreadBps);
  const useMaxSkew = fin(maxSkewTicks) && fin(tickSize) && tickSize > 0;
  const useQuoteQMax = fin(quoteQMax);
  // regimeBreak: truthy object (or true) → ON. Resolve widenMult (default 1.5) + thresholds.
  const regimeOn = !!regimeBreak;
  const widenMult = (regimeOn && regimeBreak !== true && fin(regimeBreak.widenMult) && regimeBreak.widenMult > 0)
    ? regimeBreak.widenMult : 1.5;
  const rbZWiden = (regimeOn && regimeBreak !== true && fin(regimeBreak.zWiden) && regimeBreak.zWiden > 0)
    ? regimeBreak.zWiden : 2;
  const rbZHalt = (regimeOn && regimeBreak !== true && fin(regimeBreak.zHalt) && regimeBreak.zHalt > 0)
    ? regimeBreak.zHalt : 3;
  // fundingRate: finite & nonzero → ON. secsToFunding default undefined → at-settlement.
  const useFunding = fin(fundingRate) && fundingRate !== 0;

  // ── load tape ──
  let tape;
  try {
    tape = await loadTape(tapePath);
  } catch {
    return null;
  }
  if (!tape || !tape._all || tape._all.length === 0) return null;

  // ── derive span (Tape has no .span property; derive from event array) ──
  const tStart = tape._all[0].ts;
  const tEnd = tape._all[tape._all.length - 1].ts;
  if (!fin(tStart) || !fin(tEnd) || tEnd <= tStart) return null;
  const spanMs = tEnd - tStart;

  // ── resolve kappa ──
  const kappa = resolveKappa({ kappaFromPath: kappaFrom, explicitKappa, mid, tickSize });
  if (!kappa.kappaPrice || kappa.kappaPrice <= 0) {
    return { error: `no usable kappa (${kappa.source})`, kappaSource: kappa.source, tapePath, spanMs };
  }

  // ── walk samples ──
  const stepMs = sampleEverySec * 1000;
  const horizonMs = requoteSec * 1000;
  const advWindowMs = measureAdverseSec * 1000;
  let sampleCount = 0;
  let crossedCount = 0;
  let nullBookCount = 0;
  let skipInventoryCount = 0;
  let regimeHaltCount = 0;     // PASS-1 WIRE 2: samples skipped by regime halt
  let regimeWidenCount = 0;    // PASS-1 WIRE 2: samples widened by regime widen
  let fundingSkewTicksAccum = 0; // PASS-1 WIRE 3: sum of |reservationAdjPrice|/tickSize (mean reported)

  // EWMA vol state
  let prevMidForRet = null;
  let prevVar = null;

  // Inventory + PnL accumulators
  let q = 0; // signed inventory in base units
  let maxQ = 0;
  const fillResults = [];
  let realizedInventoryPnl = 0; // in PRICE units (summed)
  let totalNotionalMid = 0;     // for converting inventory PnL to bps

  for (let ts = tStart + stepMs; ts <= tEnd - horizonMs; ts += stepMs) {
    if (sampleCount >= maxSamples) break;
    const book = tape.bookAt(ts);
    if (!book || !fin(book.mid) || book.mid <= 0) { nullBookCount++; continue; }
    sampleCount++;

    const currentMid = book.mid;
    totalNotionalMid += currentMid;

    // detect crossed book
    const isCrossed = fin(book.spreadBps) && book.spreadBps < 0;
    if (isCrossed) crossedCount++;

    // ── update EWMA vol from 1s log-return ──
    let r = NaN; // hoisted: PASS-1 WIRE 2 regime-breaker reads r (1s log-return)
    if (prevMidForRet && prevMidForRet > 0) {
      r = Math.log(currentMid / prevMidForRet);
      if (fin(r)) {
        const ew = sigmaEwma(r * r, prevVar, volHalfLifeSec);
        if (ew) prevVar = ew.variance;
      }
    }
    prevMidForRet = currentMid;

    // per-second PRICE vol
    const sigmaRet = prevVar != null ? Math.sqrt(prevVar) : null;
    const sigmaP = sigmaRet != null ? sigmaPrice(sigmaRet, currentMid) : null;

    // ── anchor: microprice when clean, mid when crossed ──
    let anchor;
    if (isCrossed) {
      anchor = currentMid;
    } else {
      const mp = computeMicroprice(book.topBids, book.topAsks);
      anchor = fin(mp) && mp > 0 ? mp : currentMid;
    }

    // ── WIRE 3: funding-skew nudge to anchor (DISARMED: OFF → anchor unchanged) ──
    // Add fundingSkew's signed reservationAdjPrice to the anchor BEFORE quotes().
    // Positive funding → negative adj → reservation DOWN (mirrors A-S reservationPrice).
    if (useFunding) {
      const fs = fundingSkew({ fundingRate, q, secsToFunding, tickSize });
      if (fs && fin(fs.reservationAdjPrice)) {
        anchor += fs.reservationAdjPrice;
        fundingSkewTicksAccum += Math.abs(fs.skewTicks);
      }
    }

    // ── WIRE 2: regime-breaker (DISARMED: OFF → no call, action='normal') ──
    // Uses the loop's own r (1s log-return) and sigmaRet (per-second return vol).
    let regimeAction = 'normal';
    if (regimeOn && fin(r) && fin(sigmaRet) && sigmaRet > 0) {
      const rb = regimeBreaker({ ret: r, sigma: sigmaRet }, { zWiden: rbZWiden, zHalt: rbZHalt });
      regimeAction = rb && rb.action ? rb.action : 'normal';
    }
    if (regimeAction === 'halt') { regimeHaltCount++; continue; } // skip quoting this sample

    // ── A-S quotes (WIRE 1: guards threaded only when finite) ──
    const qres = quotes({
      microprice: anchor, q, gamma, sigma: sigmaP, tau, kappa: kappa.kappaPrice,
      ...(useMinSpread ? { minHalfSpreadBps } : {}),
      ...(useMaxSpread ? { maxHalfSpreadBps } : {}),
      ...(useMaxSkew ? { maxSkewTicks, tickSize } : {}),
      ...(useQuoteQMax ? { qMax: quoteQMax } : {}),
    });
    // SEAM FIX (was line ≈298): quotes()'s qMax guard deliberately nulls ONE side
    // (bidPx XOR askPx) to suppress an inventory-breaching leg. The old guard
    // skipped the WHOLE sample if either side was null. New guard: require qres +
    // finite halfSpread + AT LEAST ONE finite side; each leg below checks its own px.
    // When NO guards passed, quotes() returns both sides finite → identical to today.
    if (!qres || !fin(qres.halfSpread) || (!fin(qres.bidPx) && !fin(qres.askPx))) continue;

    let { bidPx, askPx } = qres;
    let halfSpread = qres.halfSpread;

    // ── WIRE 2 (widen): recompute bid/ask around qres.reservation with widened half ──
    // Keep halfSpread consistent with what was actually quoted (attributePnl uses it).
    if (regimeAction === 'widen' && fin(qres.reservation)) {
      halfSpread = halfSpread * widenMult;
      bidPx = qres.reservation - halfSpread;
      askPx = qres.reservation + halfSpread;
      regimeWidenCount++;
    }

    // ── inventory hard-limit: skip the side that would breach ──
    let canBuy = true, canSell = true;
    if (q + size > qmax * size) canBuy = false;   // would exceed +long limit
    if (q - size < -qmax * size) canSell = false;  // would exceed -short limit
    if (!canBuy && !canSell) { skipInventoryCount++; continue; }

    // ── simulate BOTH legs (only those allowed by inventory limit + finite px) ──
    // Per-leg finite-px check: a leg whose px is null (quotes() qMax suppression)
    // is skipped, not the whole sample. When no guards passed, both px are finite.
    if (canBuy && fin(bidPx)) {
      const sim = tape.simulateOrder({ side: 'buy', price: bidPx, size, joinTs: ts, horizonSec: requoteSec });
      if (sim && sim.filled && fin(sim.fillTs)) {
        const midAtFill = tape.bookAt(sim.fillTs)?.mid ?? currentMid;
        const midAtWindow = tape.bookAt(sim.fillTs + advWindowMs)?.mid ?? midAtFill;
        const attr = attributePnl({
          side: 'buy', fillPrice: bidPx, halfSpread, midAtFill, midAtWindow,
          adverseBpsParam: useAdverseParam ? adverseBps : null, feeRtBps, mid: currentMid,
        });
        if (attr) { attr.side = 'buy'; fillResults.push(attr); }
        q += size; // we bought → long
      }
    }

    if (canSell && fin(askPx)) {
      const sim = tape.simulateOrder({ side: 'sell', price: askPx, size, joinTs: ts, horizonSec: requoteSec });
      if (sim && sim.filled && fin(sim.fillTs)) {
        const midAtFill = tape.bookAt(sim.fillTs)?.mid ?? currentMid;
        const midAtWindow = tape.bookAt(sim.fillTs + advWindowMs)?.mid ?? midAtFill;
        const attr = attributePnl({
          side: 'sell', fillPrice: askPx, halfSpread, midAtFill, midAtWindow,
          adverseBpsParam: useAdverseParam ? adverseBps : null, feeRtBps, mid: currentMid,
        });
        if (attr) { attr.side = 'sell'; fillResults.push(attr); }
        q -= size; // we sold → short
      }
    }

    // ── inventory MTM: realize PnL when we reduce toward zero ──
    // (simplified: track unrealized at end; realized on offsetting fills)
    const absQ = Math.abs(q);
    if (absQ > maxQ) maxQ = absQ;
  }

  // ── inventory unrealized MTM at end (mark-to-market residual position) ──
  const finalBook = tape.bookAt(tEnd);
  const finalMid = finalBook?.mid ?? mid;
  // approximate avg entry: use mid at first sample as proxy if q != 0
  // This is a rough MTM — the per-fill inventory is better captured per-fill.
  // We report realized (0 here — no explicit close events) + unrealized residual.
  const unrealizedInvPnlPrice = q * (finalMid - mid); // vs reference mid; rough
  const unrealizedInvPnlBps = totalNotionalMid > 0 ? (unrealizedInvPnlPrice / (totalNotionalMid / sampleCount)) * 1e4 : 0;

  // ── sum ──
  const summary = sumFills(fillResults, {
    inventoryPnlBps: unrealizedInvPnlBps,
    maxInventory: maxQ / size, // in lots
    sampleCount,
  });

  if (!summary) return null;

  // ── enrich with metadata ──
  summary.tapePath = tapePath;
  summary.spanMs = spanMs;
  summary.spanHours = spanMs / 3600000;
  summary.sampleCount = sampleCount;
  summary.crossedBookRatio = sampleCount > 0 ? crossedCount / sampleCount : 0;
  summary.nullBookCount = nullBookCount;
  summary.skipInventoryCount = skipInventoryCount;
  // ── PASS-1 hardening summary fields (0 when OFF → DISARMED-degrade) ──
  summary.regimeHaltCount = regimeHaltCount;
  summary.regimeWidenCount = regimeWidenCount;
  summary.fundingSkewTicks = sampleCount > 0 ? fundingSkewTicksAccum / sampleCount : 0; // mean |skewTicks|/sample
  summary.gamma = gamma;
  summary.kappaSource = kappa.source;
  summary.kappaPrice = kappa.kappaPrice;
  summary.kappaBps = kappa.kappaBps;
  summary.kappaR2 = kappa.r2;
  summary.adverseMode = useAdverseParam ? `param (${adverseBps} bps)` : `measured (${measureAdverseSec}s window)`;
  summary.qmaxLots = qmax;
  summary.requoteSec = requoteSec;
  summary.feeRtBps = feeRtBps;
  summary.sizeBase = size;
  summary.residualInventoryLots = q / size;
  summary.disarmed = true;
  summary.note = 'DISARMED offline analysis — NOT a live trading signal. Mechanics-only below the glm data bar (≥230h, ≥3 multi-day regimes).';

  return summary;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const _isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

function getArg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

if (_isMain && process.argv.includes('--run')) {
  const tapePath = getArg('--run');
  const gamma = Number(getArg('--gamma', '0.2'));
  const kappaFrom = getArg('--kappa-from', null);
  const explicitKappa = Number(getArg('--kappa', 'NaN'));
  const adverseBps = Number(getArg('--adverse', '0.16'));
  const qmax = Number(getArg('--qmax', '3'));
  const requoteSec = Number(getArg('--requote', '5'));
  const sampleEverySec = Number(getArg('--sample', '5'));
  const feeRtBps = Number(getArg('--fee-rt', '4.0'));
  const size = Number(getArg('--size', '0.001'));
  const mid = Number(getArg('--mid', '62700'));
  const tickSize = Number(getArg('--tick', '0.1'));
  const measureAdverseSec = Number(getArg('--measure-adverse-sec', '5'));

  const summary = await runBaseline({
    tapePath, gamma,
    kappaFrom: kappaFrom || undefined,
    kappaPrice: Number.isFinite(explicitKappa) ? explicitKappa : undefined,
    adverseBps, measureAdverseSec, qmax, requoteSec, sampleEverySec, feeRtBps, size, mid, tickSize,
  });

  if (!summary) {
    console.error('FATAL: runBaseline returned null (bad params or unreadable tape).');
    process.exit(1);
  }
  if (summary.error) {
    console.error(`FATAL: ${summary.error}`);
    process.exit(1);
  }

  // ── print summary ──
  console.log('═══ A-S BASELINE (DISARMED) ═══');
  console.log(`tape: ${summary.tapePath}`);
  console.log(`span: ${summary.spanHours.toFixed(2)}h | samples: ${summary.sampleCount} | crossed-book ratio: ${(summary.crossedBookRatio * 100).toFixed(1)}%`);
  console.log(`γ=${summary.gamma} | κ=${summary.kappaBps != null ? summary.kappaBps.toFixed(4) + '/bps' : 'n/a'} (${summary.kappaSource}, R²=${summary.kappaR2 != null ? summary.kappaR2.toFixed(3) : 'n/a'})`);
  console.log(`qmax=±${summary.qmaxLots} lots | requote=${summary.requoteSec}s | fee-rt=${summary.feeRtBps}bps | AS mode: ${summary.adverseMode}`);
  console.log('─── PnL BUCKETS (per fill, bps) ───');
  console.log(`  fills: ${summary.fills} (bid ${Math.round(summary.fillRatePerSide.bid * summary.sampleCount)} / ask ${Math.round(summary.fillRatePerSide.ask * summary.sampleCount)})`);
  console.log(`  fill rate: ${(summary.fillRate * 100).toFixed(2)}% (of ${summary.sampleCount * 2} possible side-slots)`);
  console.log(`  (a) spread-capture : ${summary.grossSpreadBps.toFixed(3)} bps`);
  console.log(`  (b) adverse-sel    : -${summary.adverseSelBps.toFixed(3)} bps`);
  console.log(`  (c) inventory/MTM  : ${summary.inventoryPnlBps.toFixed(3)} bps`);
  console.log(`  (d) fees (rt)      : -${summary.feeBps.toFixed(3)} bps`);
  console.log(`  ─────────────────────────────`);
  const net = summary.netBps;
  console.log(`  NET per fill       : ${net.toFixed(3)} bps  ${net > 0 ? '✚ POSITIVE' : '✗ NEGATIVE'}`);
  console.log(`  max inventory      : ${summary.maxInventory.toFixed(1)} lots | residual: ${summary.residualInventoryLots.toFixed(1)} lots`);
  console.log(`  ${summary.note}`);

  // ── write JSON ──
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outPath = `_SYSTEM/state/as-baseline-${date}.json`;
  try {
    writeFileSync(outPath, JSON.stringify(summary, null, 2));
    console.log(`\nwrote: ${outPath}`);
  } catch (e) {
    console.error(`warn: could not write ${outPath}: ${e.message}`);
  }
  process.exit(0);
}

// ── --test self-test ─────────────────────────────────────────────────────────

if (_isMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const assert = (cond, label) => {
    if (cond) { pass++; console.log(`  PASS: ${label}`); }
    else { fail++; console.error(`  FAIL: ${label}`); }
  };
  const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

  console.log('═══ as-baseline --test ═══');

  // ── GREEN: attributePnl basic ──
  // Buy fill: halfSpread=$3, mid=$62700 → spread = 3/62700*1e4 = 0.4785 bps
  // AS param 0.16 bps, fee 4.0 bps → net = 0.4785 - 0.16 - 4.0 = -3.6815
  const a1 = attributePnl({ side: 'buy', fillPrice: 62697, halfSpread: 3, midAtFill: 62700, mid: 62700, adverseBpsParam: 0.16, feeRtBps: 4.0 });
  assert(a1 !== null, 'attributePnl buy fill returns non-null');
  assert(near(a1.spreadBps, 3 / 62700 * 1e4, 1e-6), `attributePnl spread-capture = halfSpread/mid*1e4 (got ${a1.spreadBps.toFixed(6)})`);
  assert(near(a1.adverseBps, 0.16), `attributePnl uses AS param when provided (got ${a1.adverseBps})`);
  assert(near(a1.feeBps, 4.0), `attributePnl fee = feeRtBps (got ${a1.feeBps})`);
  assert(near(a1.netBps, a1.spreadBps - 0.16 - 4.0), `attributePnl net = spread - AS - fee (got ${a1.netBps})`);

  // ── GREEN: attributePnl measured AS (no param) ──
  // Buy fill at mid 62700, window mid 62695 → mid dropped 5 → adverse for buyer
  // AS_measured = (62700-62695)/62700*1e4 = 0.7974 bps
  const a2 = attributePnl({ side: 'buy', fillPrice: 62697, halfSpread: 3, midAtFill: 62700, midAtWindow: 62695, adverseBpsParam: null, feeRtBps: 4.0, mid: 62700 });
  assert(a2 !== null && near(a2.adverseBps, 5 / 62700 * 1e4, 1e-6), `attributePnl measures AS from window when no param (buy, mid drops → adverse, got ${a2?.adverseBps})`);

  // Sell fill, mid rises → adverse for seller
  const a3 = attributePnl({ side: 'sell', fillPrice: 62703, halfSpread: 3, midAtFill: 62700, midAtWindow: 62705, adverseBpsParam: null, feeRtBps: 4.0, mid: 62700 });
  assert(a3 !== null && near(a3.adverseBps, 5 / 62700 * 1e4, 1e-6), `attributePnl measures AS (sell, mid rises → adverse, got ${a3?.adverseBps})`);

  // Sell fill, mid drops → NO adverse (good for seller)
  const a4 = attributePnl({ side: 'sell', fillPrice: 62703, halfSpread: 3, midAtFill: 62700, midAtWindow: 62695, adverseBpsParam: null, feeRtBps: 4.0, mid: 62700 });
  assert(a4 !== null && near(a4.adverseBps, 0), `attributePnl AS=0 when mid moves in our favor (got ${a4?.adverseBps})`);

  // ── RED (negative): bad params → null, never throw ──
  assert(attributePnl({ side: 'invalid', fillPrice: 100, mid: 100 }) === null, 'attributePnl: bad side → null (no throw)');
  assert(attributePnl({ side: 'buy', fillPrice: NaN, mid: 100 }) === null, 'attributePnl: NaN fillPrice → null');
  assert(attributePnl({ side: 'buy', fillPrice: 100, mid: -5 }) === null, 'attributePnl: negative mid → null');
  assert(attributePnl(null) === null, 'attributePnl: null opts → null');

  // ── GREEN: sumFills aggregation ──
  const fr = [
    { side: 'buy', spreadBps: 0.5, adverseBps: 0.1, feeBps: 4.0, netBps: -3.6 },
    { side: 'sell', spreadBps: 0.6, adverseBps: 0.2, feeBps: 4.0, netBps: -3.6 },
  ];
  const s1 = sumFills(fr, { inventoryPnlBps: 0, maxInventory: 2, sampleCount: 10 });
  assert(s1 !== null && s1.fills === 2, `sumFills counts fills (got ${s1?.fills})`);
  assert(near(s1.grossSpreadBps, 0.55), `sumFills avg spread (got ${s1.grossSpreadBps})`);
  assert(near(s1.fillRate, 2 / 20), `sumFills fillRate = fills/(samples*2) (got ${s1.fillRate})`);

  // ── RED: sumFills empty ──
  const s2 = sumFills([], { sampleCount: 5 });
  assert(s2 !== null && s2.fills === 0 && s2.netBps === 0, 'sumFills: empty → zeros (no throw)');
  assert(sumFills(null) === null, 'sumFills: null input → null');

  // ── GREEN: resolveKappa explicit ──
  const k1 = resolveKappa({ explicitKappa: 0.0736, mid: 62700, tickSize: 0.1 });
  assert(k1.kappaPrice === 0.0736, `resolveKappa explicit kappaPrice (got ${k1.kappaPrice})`);
  assert(near(k1.kappaBps, 0.0736 * 62700 / 1e4, 1e-9), `resolveKappa kappaBps conversion (got ${k1.kappaBps})`);

  // ── RED: resolveKappa no input ──
  const k2 = resolveKappa({ mid: 62700, tickSize: 0.1 });
  assert(k2.kappaPrice === null, 'resolveKappa: no path, no explicit → null');

  // ── RED: resolveKappa bad path ──
  const k3 = resolveKappa({ kappaFromPath: '/nonexistent/path.json', mid: 62700, tickSize: 0.1 });
  assert(k3.kappaPrice === null, 'resolveKappa: unreadable path → null (no throw)');

  // ── METAMORPHIC: wider γ → wider spread (from optimalSpread formula) ──
  // δ = γσ²τ + (2/γ)ln(1+γ/κ). At fixed σ,τ,κ: γ↑ → first term ↑, second term ↓.
  // For small γ relative to κ (our regime: γ=0.2 vs κ=0.07, γ>κ), the ln term
  // dominates and SHRINKS as γ grows. So wider γ → wider spread is NOT always
  // true. Instead test the actual monotonic relationship that DOES hold:
  // at fixed γ, higher κ (deeper book) → tighter spread.
  const sigmaP = 0.8; // $/√s
  const sp1 = optimalSpread({ gamma: 0.2, sigma: sigmaP, tau: 1, kappa: 0.05 });
  const sp2 = optimalSpread({ gamma: 0.2, sigma: sigmaP, tau: 1, kappa: 0.5 });
  assert(sp1 !== null && sp2 !== null && sp2 < sp1,
    `METAMORPHIC: higher κ (deeper book) → tighter spread (κ=0.05→${sp1?.toFixed(4)} vs κ=0.5→${sp2?.toFixed(4)})`);

  // ── METAMORPHIC 2: higher σ → wider spread (vol-adaptive width, the PRIMARY lever) ──
  const sp3 = optimalSpread({ gamma: 0.2, sigma: 0.5, tau: 1, kappa: 0.0736 });
  const sp4 = optimalSpread({ gamma: 0.2, sigma: 2.0, tau: 1, kappa: 0.0736 });
  assert(sp3 !== null && sp4 !== null && sp4 > sp3,
    `METAMORPHIC: higher σ → wider spread (σ=0.5→${sp3?.toFixed(4)} vs σ=2.0→${sp4?.toFixed(4)})`);

  // ── METAMORPHIC 3: tighter spread → higher fill rate (structural, via simulateOrder) ──
  // We can't easily test this without a tape in --test, so verify the relationship
  // at the quote level: quotes closer to mid = tighter = should fill more.
  // Instead verify: qmax=0 → no fills possible (inventory blocks both sides).
  // (runBaseline with qmax → skipInventory; tested via the qmax logic below.)

  // ── GREEN: reservationPrice sign check (A-S skew direction) ──
  // q>0 (long) → reservation < anchor (skew down to sell more)
  const rpLong = reservationPrice({ s: 62700, q: 1, gamma: 0.2, sigma: 0.8, tau: 1 });
  const rpShort = reservationPrice({ s: 62700, q: -1, gamma: 0.2, sigma: 0.8, tau: 1 });
  assert(rpLong !== null && rpLong < 62700, `reservationPrice: q>0 → r < anchor (got ${rpLong})`);
  assert(rpShort !== null && rpShort > 62700, `reservationPrice: q<0 → r > anchor (got ${rpShort})`);

  // ── GREEN: sigmaPrice units (A-S AXIS-2 fix) ──
  const sigP = sigmaPrice(1e-5, 62700);
  assert(fin(sigP) && near(sigP, 1e-5 * 62700), `sigmaPrice: return-vol × mid = price-vol (got ${sigP})`);
  assert(sigmaPrice(-1, 62700) === null, 'sigmaPrice: negative sigma → null');
  assert(sigmaPrice(1e-5, -5) === null, 'sigmaPrice: negative mid → null');

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS-1 WIRING TESTS (the DISARMED-degrade proof + each-flag-on behavioral)
  // ═══════════════════════════════════════════════════════════════════════════
  // Build a tiny DETERMINISTIC synthetic tape: a clean uncrossed book around
  // mid=62700, drifting slightly so vol>0, with sell-aggressor trades that sweep
  // deep enough to fill resting bids and buy-aggressor trades that lift asks.
  {
    const tapePath = pathJoin(tmpdir(), `asb-test-${process.pid}-${Date.now()}.jsonl`);
    // Book brackets the A-S quote region (halfSpread≈6.6 → bid≈62693, ask≈62707).
    // Mid DRIFTS each step (nonzero returns → regime-breaker can trip). Aggressive
    // trades sweep DEEP enough to cross the resting quotes regardless of drift.
    const events = [];
    events.push({ t: 'snap', ts: 0, s: 'BTCUSDT', lastUpdateId: 1,
      bids: [['62695', '5'], ['62693', '10'], ['62690', '20']],
      asks: [['62705', '5'], ['62707', '10'], ['62710', '20']] });
    for (let s = 1; s <= 40; s++) {
      const ts = s * 1000;
      // asymmetric drift via FRESH SNAPS (replaces the whole book → mid actually moves).
      // This creates nonzero log-returns between samples → regime-breaker can trip.
      const drift = (s % 4 === 0) ? -3 : (s % 3 === 0 ? 3 : 0);
      if (drift !== 0) {
        const bb = 62695 + drift, ba = 62705 + drift;
        events.push({ t: 'snap', ts: ts + 50, s: 'BTCUSDT', lastUpdateId: 999 + s,
          bids: [[String(bb), '5'], ['62690', '20']], asks: [[String(ba), '5'], ['62710', '20']] });
      }
      // every 5s: a sell-aggressor trade deep enough to sweep bids (62690)
      if (s % 5 === 0) events.push({ t: 'trade', ts, s: 'BTCUSDT', p: '62690', q: '8', m: true });
      // every 7s: a buy-aggressor trade deep enough to lift asks (62710)
      if (s % 7 === 0) events.push({ t: 'trade', ts: ts + 100, s: 'BTCUSDT', p: '62710', q: '8', m: false });
    }
    writeFileSync(tapePath, events.map((e) => JSON.stringify(e)).join('\n'));

    const baseOpts = {
      tapePath, gamma: 0.2, kappaPrice: 0.0736, adverseBps: 0.16,
      qmax: 3, requoteSec: 5, sampleEverySec: 5, feeRtBps: 4.0, size: 0.001,
      mid: 62700, tickSize: 0.1, maxSamples: 5,
    };

    try {
      const base = await runBaseline(baseOpts);
      assert(base !== null && !base.error, `WIRING: baseline run produces a summary (got ${base?.error ?? 'null'})`);
      assert(base && base.fills >= 1, `WIRING: baseline has ≥1 fill (got ${base?.fills})`);

      // ── OFF-IDENTITY (the core DISARMED-degrade proof) ──
      // flags-omitted vs flags-explicitly-OFF must be DEEP-EQUAL.
      const offExplicit = await runBaseline({
        ...baseOpts,
        minHalfSpreadBps: undefined, maxHalfSpreadBps: undefined, maxSkewTicks: undefined,
        quoteQMax: undefined, regimeBreak: undefined, fundingRate: undefined, secsToFunding: undefined,
      });
      const deepEq = JSON.stringify(base) === JSON.stringify(offExplicit);
      assert(deepEq, 'WIRING OFF-IDENTITY: flags-omitted === flags-explicitly-OFF (DEEP-EQUAL)');

      // NEUTRAL-flag identity: regimeBreak with impossible thresholds + no funding → same net/fills.
      const neutral = await runBaseline({
        ...baseOpts, regimeBreak: { zWiden: 999, zHalt: 1000 }, fundingRate: undefined,
      });
      assert(neutral && neutral.fills === base.fills && near(neutral.netBps, base.netBps, 1e-9),
        `WIRING NEUTRAL-IDENTITY: regimeBreak untrippable + no funding → same fills/net (fills ${neutral?.fills}/${base.fills})`);

      // DISARMED summary fields are 0/absent when OFF.
      assert(base.regimeHaltCount === 0 && base.regimeWidenCount === 0 && base.fundingSkewTicks === 0,
        `WIRING DISARMED: regime/funding summary fields are 0 when OFF (got halt=${base.regimeHaltCount} widen=${base.regimeWidenCount} fund=${base.fundingSkewTicks})`);

      // ── EACH-FLAG-ON behavioral (the RED layer — proves the wire does something) ──

      // (1) minHalfSpreadBps set above natural → spread-capture floor rises (grossSpreadBps ≥ floor, on fills).
      const minSp = await runBaseline({ ...baseOpts, minHalfSpreadBps: 2 });
      assert(minSp && minSp.fills >= 1 && minSp.grossSpreadBps >= 2 - 1e-9,
        `WIRING minHalfSpreadBps=2: grossSpreadBps ≥ floor on fills (${minSp?.grossSpreadBps.toFixed(4)} bps, ${minSp?.fills} fills)`);

      // (2) regimeBreak trips on everything (zWiden/zHalt tiny) → halts/widens, fills ≤ baseline.
      const regTrip = await runBaseline({ ...baseOpts, regimeBreak: { zWiden: 0.0001, zHalt: 0.0002 } });
      assert(regTrip && (regTrip.regimeHaltCount > 0 || regTrip.regimeWidenCount > 0),
        `WIRING regimeBreak trips: halt=${regTrip?.regimeHaltCount} widen=${regTrip?.regimeWidenCount}`);
      assert(regTrip && regTrip.fills <= base.fills,
        `WIRING regimeBreak trips: fills ≤ baseline (${regTrip?.fills} vs ${base.fills})`);

      // (3) fundingRate → fundingSkewTicks≠0, run still completes (netBps finite).
      const fund = await runBaseline({ ...baseOpts, fundingRate: 0.001, secsToFunding: 60 });
      assert(fund && fund.fundingSkewTicks !== 0,
        `WIRING fundingRate=0.001: fundingSkewTicks≠0 (got ${fund?.fundingSkewTicks})`);
      assert(fund && fin(fund.netBps),
        `WIRING fundingRate: run completes, netBps finite (got ${fund?.netBps})`);

      // (4) quoteQMax=0 → one-sided suppression engages, fills ≤ baseline, no crash.
      const qQm = await runBaseline({ ...baseOpts, quoteQMax: 0 });
      assert(qQm !== null && !qQm.error,
        `WIRING quoteQMax=0: no crash from relaxed line-298 seam (got ${qQm?.error ?? 'ok'})`);
      assert(qQm && qQm.fills <= base.fills,
        `WIRING quoteQMax=0: fills ≤ baseline (${qQm?.fills} vs ${base.fills})`);
    } finally {
      try { unlinkSync(tapePath); } catch { /* best-effort cleanup */ }
    }
  }

  // ── summary ──
  console.log(`\n─── as-baseline --test: ${pass} PASS, ${fail} FAIL ───`);
  process.exit(fail > 0 ? 1 : 0);
}
