#!/usr/bin/env node
// @capability: funding-carry-harvester
// @serves: funding carry | delta neutral harvest | cash and carry | basis trade | funding rate harvest | perp spot carry | engine 1
// @does: DISARMED paper funding-carry harvester (Engine 1). Delta-neutral long-spot/short-perp lifecycle — 7d-avg funding + carry-to-vol entry gate, hold to 8h settlement, exit on funding-flip / crowding / regime-break. Built as an HONEST MEASUREMENT instrument, not a profit engine: it accounts the REAL asymmetric leg fees (Binance perp 0.02% + a configurable spot venue), the entry+exit BASIS cost, and discrete 8h-settlement funding — then prints the overstatement caveats. Reuses perp-adapter (data), carry-vol-signal (vol-normalized gate), crypto-structural-signals + multi-tf-confluence (exit-intel), afl-paper (the carry book). NEVER sizes the live daemon.
// @use: Reach for this to MEASURE whether crypto funding-carry clears its real cost stack in the CURRENT regime on a small book, BEFORE any capital. CLI: --probe <market> (live snapshot+gate), --backtest (offline synthetic), --test. Wiring into the live orchestrator/daemon, and raising the spot threshold, are SEPARATE owner-gated arming steps.
// @exports: computeSevenDayAvgFunding, entryGate, exitDecision, clampFundingRate, createCarryBook, openCarryPair, settleCarry, closeCarryPair, carryReport, runCarryBacktest, CARRY_DEFAULTS, CARRY_CAVEAT
//
// CONSTRAINTS: paper-only (INV-1 — NO order path anywhere; all execution is afl-paper, all venue I/O is the read-only keyless perp-adapter), no key reads (INV-2), fail-open (gate/exit never throw on bad data → safe default), no new npm dep.
// PROVENANCE (per research grounding, 2026-06-18): thresholds tagged [SOURCED]/[INTERNAL]/[VERIFY]. Sharpe ~6.45 / ~8% APY are a 2020–2025 FULL-SAMPLE artifact — carry went NEGATIVE in 2025 (arXiv:2510.14435). This module makes NO forward-return promise; it measures the live regime.

import { createPaperEngine, binanceFeeModel } from './afl-paper.mjs';
import * as PerpAdapter from './adapters/perp-adapter.mjs';
import { realizedVol, carryToVol } from './carry-vol-signal.mjs';
import { computeOiQuadrant } from './crypto-structural-signals.mjs';
import { cryptoMarketToPerpSymbol } from './perp-signals.mjs';
import { pathToFileURL } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// §0 — DEFAULTS (grounded; see PROVENANCE)
// ─────────────────────────────────────────────────────────────────────────────

export const CARRY_DEFAULTS = {
  // ENTRY: 7-day avg funding per 8h must exceed this to enter.
  // 0.01% was the original blueprint number but it is 7× below breakeven for short holds
  // and is an INTERNAL engineering choice, not a pro standard. Unanimous peer + research
  // verdict (2026-06-18): 0.03%/8h is the practical floor for a small book. [SOURCED-converged]
  fundingThreshold8h: 0.0003,        // 0.03% per 8h
  // Vol-normalized gate (mimo: "don't chase 0.01% funding when realized vol is 120%").
  // carryToVol = annualized funding APR / annualized realized vol; >= this to pass. [SOURCED carry-vol-signal]
  carryToVolMin: 0.15,
  minHistoryRecords: 14,             // < 14 funding records (<4.7d) → INSUFFICIENT_HISTORY [INTERNAL]
  sevenDayRecords: 21,               // 3 settlements/day × 7d [SOURCED Binance 8h schedule]
  // Funding rate cap clamp (safety): Binance default ±0.75%/8h; BTCUSDT often ±0.3%; up to ±2%
  // per-contract. Pull live per-symbol via GET /fapi/v1/fundingInfo before arming. [VERIFY per-symbol]
  fundingCap8h: 0.0075,
  // FEES (per leg, fraction). Binance USDⓈ-M VIP0 maker = 0.02% (all 4 sources agree). [SOURCED]
  perpMakerFee: 0.0002,
  // SPOT leg fee is the DOMINANT, venue-dependent cost. Binance spot VIP0 maker ≈ 0.10%;
  // Coinbase Advanced maker ≈ 0.40% (turns this into a fee trap at €300). Default to the
  // cheaper same-exchange option; the report shows both. [SOURCED — venue is the owner decision]
  spotMakerFee: 0.0010,
  // BASIS round-trip cost (entry+exit perp−spot gap) in bps of perp notional. Intraday BTCUSDT
  // basis fluctuates 5–30bps; 5 is a conservative-ish default. Unmodeled by naive equity-cancellation. [SOURCED red-team]
  basisBps: 5,
  // Exit tuning
  fundingFlipBand8h: 0.00005,        // 0.005%/8h noise band before a flip counts [INTERNAL]
  fundingFlipSettlements: 2,         // consecutive unfavorable settlements → exit [SOURCED practitioner]
  oiCrowdGrowth24h: 0.15,            // OI +15% in 24h (≈3σ) + distribution quadrant → crowding [INTERNAL proxy]
  regimeConfluenceMin: 0.70,         // multi-TF confluence ≥ → basis-stress exit [INTERNAL]
  regimeAgreementMin: 4,
  fundingExtremeWarn8h: 0.002,       // |rate| > 0.2%/8h → mean-reversion risk HIGH (advisory) [SOURCED contrarian]
  // BOOK
  pool: 300,                         // €300 paper pool
  legNotional: 150,                  // €150 per leg (delta-neutral 150/150) [INTERNAL — 50/50 split]
};

export const CARRY_CAVEAT = [
  '⚠ PAPER FUNDING-CARRY — KNOWN OVERSTATEMENTS (read before trusting any P&L):',
  '  1. FILL: both legs assumed to fill at maker. Live GTX (post-only) can reject or fill ONE leg → naked directional risk.',
  '  2. SETTLEMENT: funding credited only for settlements HELD THROUGH (00/08/16 UTC). Enter just before settle = full credit; exit before = ZERO.',
  '  3. BASIS: perp−spot gap at entry+exit is a real round-trip cost (5–30bps); modeled here as basisBps, not zero.',
  '  4. SPOT FEES: the spot venue dominates. Binance spot maker ~0.10% vs Coinbase ~0.40% (28–41d breakeven = fee trap).',
  '  5. CROWDING/ADL TAIL: funding can go deeply negative (Ethena 2025); ADL can force-close the perp leg → unhedged. Exit may lag.',
  '  6. NEUTRALITY: contract rounding breaks exact 1:1 → residual delta. Sharpe ~6.45 is a 2020–2025 artifact; 2025 carry went NEGATIVE.',
  '  → Figures are an UPPER BOUND. Live expected P&L is materially lower. DISARMED: this never sizes the live book.',
].join('\n');

function isNum(x) { return typeof x === 'number' && Number.isFinite(x); }
function round2(x) { return Math.round(x * 100) / 100; }
function round4(x) { return Math.round(x * 1e4) / 1e4; }

// ─────────────────────────────────────────────────────────────────────────────
// §1 — computeSevenDayAvgFunding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * computeSevenDayAvgFunding(records, opts) -> { avgFunding8h, count, sufficient }
 * Arithmetic mean of fundingRate over the most-recent N (=21) settlements.
 * Order-DEFENSIVE: sorts descending by timestamp itself — the perp-adapter's wire order
 * is ambiguous (comment says newest-first; Binance docs say ascending). Fail-open: returns
 * { avgFunding8h: NaN, count: 0, sufficient: false } on empty/garbage rather than throwing.
 * @param {Array<{timestamp:number, fundingRate:number|null}>} records  raw getFundingHistory output
 */
export function computeSevenDayAvgFunding(records, opts = {}) {
  const N = isNum(opts.window) ? opts.window : CARRY_DEFAULTS.sevenDayRecords;
  const minN = isNum(opts.minRecords) ? opts.minRecords : CARRY_DEFAULTS.minHistoryRecords;
  if (!Array.isArray(records) || records.length === 0) {
    return { avgFunding8h: NaN, count: 0, sufficient: false };
  }
  const sorted = [...records]
    .filter((r) => r && isNum(Number(r.timestamp)))
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp)) // newest first, regardless of wire order
    .slice(0, N);
  const rates = sorted.map((r) => (r.fundingRate == null ? NaN : Number(r.fundingRate))).filter((x) => isNum(x));
  if (rates.length === 0) return { avgFunding8h: NaN, count: 0, sufficient: false };
  const avg = rates.reduce((s, v) => s + v, 0) / rates.length;
  return { avgFunding8h: avg, count: rates.length, sufficient: rates.length >= minN };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 — entryGate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * entryGate({ avgFunding8h, recordCount, realizedVol, market, opts }) -> decision
 * decision = { enter, perpSide, spotSide, reason, absRate, carryToVolRatio, warning }
 *
 * Gates (all must pass to enter):
 *   1. history sufficiency (recordCount >= minHistoryRecords)
 *   2. |avgFunding8h| >= fundingThreshold8h
 *   3. carry-to-vol >= carryToVolMin   (ONLY when realizedVol is provided — the vol-normalized gate)
 * Side: funding>0 → SHORT perp + LONG spot (receive funding); funding<0 → LONG perp + SHORT spot.
 * Fail-open: missing/NaN inputs → { enter:false }.
 */
export function entryGate({ avgFunding8h, recordCount, realizedVol: rv, market, opts = {} } = {}) {
  const o = { ...CARRY_DEFAULTS, ...opts };
  const out = { enter: false, perpSide: null, spotSide: null, reason: '', absRate: NaN, carryToVolRatio: null, warning: null };
  if (!isNum(avgFunding8h)) { out.reason = 'no_funding_data'; return out; }
  out.absRate = Math.abs(avgFunding8h);

  if (isNum(recordCount) && recordCount < o.minHistoryRecords) { out.reason = 'insufficient_history'; return out; }
  if (out.absRate < o.fundingThreshold8h) { out.reason = `below_threshold(${round4(out.absRate * 100)}%<${o.fundingThreshold8h * 100}%/8h)`; return out; }

  // Vol-normalized gate (only when vol is known). carryToVol = annualized APR / annualized vol.
  if (isNum(rv) && rv > 0) {
    const apr = avgFunding8h * PerpAdapter.DEFAULT_PERIODS_PER_YEAR_8H; // ×1095
    const ratio = carryToVol(Math.abs(apr), rv);
    out.carryToVolRatio = isNum(ratio) ? round4(ratio) : null;
    if (isNum(ratio) && ratio < o.carryToVolMin) { out.reason = `carry_to_vol_too_low(${round4(ratio)}<${o.carryToVolMin})`; return out; }
  }

  // Direction
  if (avgFunding8h > 0) { out.perpSide = 'short'; out.spotSide = 'long'; }   // shorts receive +funding
  else { out.perpSide = 'long'; out.spotSide = 'short'; }                    // longs receive −funding

  // Extreme-funding advisory (NOT a block — extreme funding is the highest-carry regime, also highest reversion risk)
  if (out.absRate > o.fundingExtremeWarn8h) out.warning = `extreme_funding(${round4(out.absRate * 100)}%/8h) — mean-reversion risk HIGH`;

  out.enter = true;
  out.reason = 'funding_above_threshold';
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 — clampFundingRate (safety)
// ─────────────────────────────────────────────────────────────────────────────

/** Clamp |rate8h| to the symbol cap so a bad/extreme wire value can't inflate paper carry. */
export function clampFundingRate(rate8h, cap = CARRY_DEFAULTS.fundingCap8h) {
  if (!isNum(rate8h)) return 0;
  const c = isNum(cap) && cap > 0 ? cap : CARRY_DEFAULTS.fundingCap8h;
  return Math.max(-c, Math.min(c, rate8h));
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 — THE CARRY BOOK (reuses afl-paper; fees accounted EXPLICITLY in this layer)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createCarryBook({ market, rate8h, pool, perpFee, spotFee, basisBps, ledgerDir }) -> book
 * A dedicated afl-paper engine for ONE delta-neutral pair:
 *   perpMode=true, leverage=1 (→ no liquidation), fundingRates={ '<sym>-PERP': clamp(rate8h)/8 } ONLY.
 *   feeModel = ()=>0  — the engine charges NO fee; this layer accounts the REAL asymmetric leg fees
 *   + basis explicitly so every cost is a visible line item (the honest model). Funding + delta-neutral
 *   price cancellation are what afl-paper provides (and its funding sign/side/mark math is verified).
 */
export function createCarryBook({ market, rate8h, pool = CARRY_DEFAULTS.pool, perpFee = CARRY_DEFAULTS.perpMakerFee, spotFee = CARRY_DEFAULTS.spotMakerFee, basisBps = CARRY_DEFAULTS.basisBps, fundingCap = CARRY_DEFAULTS.fundingCap8h, ledgerDir = '/tmp' } = {}) {
  const symbol = cryptoMarketToPerpSymbol(market) || String(market || 'BTCUSDT');
  const perpInst = `${symbol}-PERP`;
  const spotInst = `${symbol}-SPOT`;
  const hourly = clampFundingRate(rate8h, fundingCap) / 8; // 8h rate → hourly (applyFunding uses hrs)
  const safe = symbol.replace(/[^A-Za-z0-9_-]/g, '');
  const engine = createPaperEngine({
    paperLedgerPath: `${ledgerDir}/carry-${safe}.paper.jsonl`,
    predictionLedgerPath: `${ledgerDir}/carry-${safe}.pred.jsonl`,
    feeModel: () => 0, // fees accounted in this layer, not the engine
    caps: {
      initialEquity: pool,
      maxPositionPct: 0.50,        // €150 leg = 50% of €300 (verified: avoids per-position clamp)
      maxGrossExposurePct: 1.00,   // gross = spot+perp = 2× equity notional
      maxNetExposurePct: 0.50,     // first leg = 50%; pair nets to 0 after both open
      softDrawdown: 0.05, hardDrawdown: 0.10, maxDrawdown: 0.20, tailMultiplier: 3,
      minNotional: 1, perpMode: true, leverage: 1,
      maintenanceMarginRate: 0.004,
      fundingRates: { [perpInst]: hourly },
      qtyStep: 1e-8, venue: 'binance-um',
    },
  });
  return {
    engine, market, symbol, perpInst, spotInst,
    cfg: { rate8h, clampedRate8h: clampFundingRate(rate8h, fundingCap), hourly, perpFee, spotFee, basisBps, pool },
    acc: { entryFees: 0, exitFees: 0, basisCost: 0, settlements: 0, perpSide: null, notional: 0, fundingClean: 0, opened: false, closed: false },
  };
}

/**
 * openCarryPair(book, { perpSide, notional, perpBar, spotBar, perpBars, spotBars, ts }) -> { ok, reason }
 * Opens the PERP leg FIRST (net-exposure cap ordering), then the SPOT leg, at equal notional.
 * Records the explicit asymmetric entry fees + the entry half of the basis cost.
 */
export function openCarryPair(book, { perpSide, notional = CARRY_DEFAULTS.legNotional, perpBar, spotBar, perpBars, spotBars, ts }) {
  if (!book || book.acc.opened) return { ok: false, reason: 'already_open_or_no_book' };
  if (!['long', 'short'].includes(perpSide)) return { ok: false, reason: 'bad_perpSide' };
  const spotSide = perpSide === 'short' ? 'long' : 'short';
  const { engine, perpInst, spotInst, cfg } = book;
  engine.ingestBar(perpBar, perpInst);
  engine.ingestBar(spotBar, spotInst);
  const rPerp = engine.onSignal(
    { factorId: 'carry-perp', side: perpSide, notional, ts, value: 1, confidence: 1 },
    { instrument: perpInst, bar: perpBar, barHistory: perpBars });
  const rSpot = engine.onSignal(
    { factorId: 'carry-spot', side: spotSide, notional, ts, value: 1, confidence: 1 },
    { instrument: spotInst, bar: spotBar, barHistory: spotBars });
  const okPerp = rPerp.action === 'OPEN' || rPerp.action === 'ADD' || rPerp.action === 'FLIP';
  const okSpot = rSpot.action === 'OPEN' || rSpot.action === 'ADD' || rSpot.action === 'FLIP';
  if (!okPerp || !okSpot) return { ok: false, reason: `leg_open_failed perp=${rPerp.action}/${rPerp.reason || ''} spot=${rSpot.action}/${rSpot.reason || ''}` };
  // Explicit honest costs (the engine charged 0)
  book.acc.entryFees = round4(notional * cfg.perpFee + notional * cfg.spotFee);
  book.acc.basisCost = round4((cfg.basisBps / 1e4) * notional);       // entry half
  book.acc.perpSide = perpSide;
  book.acc.notional = notional;
  book.acc.opened = true;
  return { ok: true, reason: 'opened' };
}

/**
 * settleCarry(book, { ts, perpBar, spotBar }) -> markResult
 * Ingest current bars + mark EXACTLY at an 8h settlement boundary (so continuous accrual == discrete).
 * Caller is responsible for only calling this at 8h boundaries while the position is held through them.
 */
export function settleCarry(book, { ts, perpBar, spotBar, rate8h } = {}) {
  const { engine, perpInst, spotInst, cfg, acc } = book;
  if (perpBar) engine.ingestBar(perpBar, perpInst);
  if (spotBar) engine.ingestBar(spotBar, spotInst);
  const m = engine.mark(ts, {});
  // CLEAN (live-faithful) funding for the held-through settlement = rate × notional, signed by side.
  // The engine's cumFunding cent-rounds each accrual (round2) — a PAPER artifact that inflates carry at
  // small notional (€0.075/settle → €0.08). This clean figure is the headline (live funding is precise);
  // the engine's cent-rounded number is reported alongside as a cross-check. Receiver side is positive.
  const r = isNum(rate8h) ? clampFundingRate(rate8h, CARRY_DEFAULTS.fundingCap8h) : cfg.clampedRate8h;
  if (acc.opened && !acc.closed && isNum(r)) {
    const sign = acc.perpSide === 'short' ? 1 : -1; // short receives +funding; long receives −funding
    acc.fundingClean = round4((acc.fundingClean || 0) + sign * r * acc.notional);
  }
  acc.settlements += 1;
  return m;
}

/**
 * closeCarryPair(book, { ts, perpBar, spotBar, perpBars, spotBars }) -> { ok }
 * Flattens both legs (maker) and records the explicit exit fees + the exit half of the basis cost.
 */
export function closeCarryPair(book, { ts, perpBar, spotBar, perpBars, spotBars }) {
  if (!book || !book.acc.opened || book.acc.closed) return { ok: false, reason: 'not_open' };
  const { engine, perpInst, spotInst, cfg, acc } = book;
  if (perpBar) engine.ingestBar(perpBar, perpInst);
  if (spotBar) engine.ingestBar(spotBar, spotInst);
  engine.onSignal({ factorId: 'carry-perp', side: 'flat', ts, value: 0, confidence: 1 },
    { instrument: perpInst, bar: perpBar, barHistory: perpBars });
  engine.onSignal({ factorId: 'carry-spot', side: 'flat', ts, value: 0, confidence: 1 },
    { instrument: spotInst, bar: spotBar, barHistory: spotBars });
  acc.exitFees = round4(acc.notional * cfg.perpFee + acc.notional * cfg.spotFee);
  acc.basisCost = round4(acc.basisCost + (cfg.basisBps / 1e4) * acc.notional); // + exit half
  acc.closed = true;
  return { ok: true };
}

/**
 * carryReport(book) -> honest line-item report.
 * fundingReceived = −engine totalFunding (receiver sees cumFunding go negative).
 * priceResidual = engine equity delta − fundingReceived (≈0 if delta-neutral; nonzero = execution slippage residual).
 * netHonest = fundingReceived − entryFees − exitFees − basisCost + priceResidual.
 */
export function carryReport(book) {
  const p = book.engine.pnl();
  const rawTotalFunding = isNum(p.totalFunding) ? p.totalFunding : 0;
  const engineFundingCentRounded = round4(-rawTotalFunding);        // engine's cent-rounded (paper artifact)
  const fundingReceived = round4(book.acc.fundingClean || 0);       // clean, live-faithful headline
  const equityDelta = round4((isNum(p.equity) ? p.equity : book.cfg.pool) - book.cfg.pool);
  const executionResidual = round4(equityDelta - engineFundingCentRounded); // per-leg fill spread/impact (≈0 if neutral)
  const { entryFees, exitFees, basisCost, settlements, perpSide, notional } = book.acc;
  const totalFees = round4(entryFees + exitFees);
  const netHonest = round4(fundingReceived - totalFees - basisCost + executionResidual);
  const apy = settlements > 0 ? round2((netHonest / book.cfg.pool) * (365 / (settlements * 8 / 24)) * 100) : null;
  return {
    market: book.market, perpSide, notional, settlements,
    fundingReceived, totalFees, basisCost, executionResidual, netHonest,
    netApyPct: apy, // simple, non-compounded; null if no settlement held
    engineFundingCentRounded, engineEquity: round2(isNum(p.equity) ? p.equity : book.cfg.pool),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 — exitDecision (3 rules, fail-open, priority funding-flip > crowding > regime)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * exitDecision(position, marketData, opts) -> Promise<{ exit, reason }>
 * position: { perpSide:'short'|'long', market, settlementsHeld? }
 * marketData: { getCandles?, oiSeries?, closes?, ts? }  (injected; keeps network at the edges)
 * Fail-open: any rule whose data is missing/throws does NOT force an exit (returns hold for that rule).
 */
export async function exitDecision(position, marketData = {}, opts = {}) {
  const o = { ...CARRY_DEFAULTS, ...opts };
  const symbol = cryptoMarketToPerpSymbol(position.market) || String(position.market || '');
  const band = o.fundingFlipBand8h;

  // ── RULE 1: FUNDING-FLIP (highest priority) ──────────────────────────────────
  try {
    const hist = await PerpAdapter.getFundingHistory(symbol, { limit: 5 });
    const sorted = [...(hist || [])]
      .filter((r) => r && isNum(Number(r.timestamp)) && isNum(Number(r.fundingRate)))
      .sort((a, b) => Number(b.timestamp) - Number(a.timestamp)); // newest first (order-defensive)
    if (sorted.length >= o.fundingFlipSettlements) {
      const recent = sorted.slice(0, o.fundingFlipSettlements).map((r) => Number(r.fundingRate));
      const unfavorable = position.perpSide === 'short'
        ? (r) => r < -band   // short entered on +funding; flip = negative
        : (r) => r > band;   // long entered on −funding; flip = positive
      if (recent.every(unfavorable)) {
        return { exit: true, reason: `funding-flip: ${o.fundingFlipSettlements} consecutive unfavorable [${recent.map((x) => round4(x)).join(',')}]` };
      }
    }
  } catch { /* fail-open: hold */ }

  // ── RULE 2: CROWDING (OI surge + distribution quadrant; honest proxy, not literal 5%-of-OI) ──
  try {
    const oi = await PerpAdapter.getOpenInterest(symbol, { hist: true, period: '1h', limit: 24 });
    if (Array.isArray(oi) && oi.length >= 2) {
      const first = Number(oi[0].openInterest), last = Number(oi[oi.length - 1].openInterest);
      if (isNum(first) && first > 0 && isNum(last)) {
        const growth = (last - first) / first;
        const quad = computeOiQuadrant({
          closes: marketData.closes, oiSeries: marketData.oiSeries || oi.map((r) => Number(r.openInterest)),
          market: position.market, ts: marketData.ts || Math.floor((last && oi[oi.length - 1].timestamp / 1000) || 0),
        });
        const distribution = quad.length > 0 && quad[0].side === 'short';
        if (growth >= o.oiCrowdGrowth24h && distribution) {
          return { exit: true, reason: `crowding: OI +${round2(growth * 100)}%/24h + distribution quadrant` };
        }
      }
    }
  } catch { /* fail-open: hold */ }

  // ── RULE 3: REGIME-BREAK (basis-stress; multi-TF confluence, direction-agnostic) ─────────────
  try {
    if (typeof marketData.getConfluence === 'function') {
      const c = await marketData.getConfluence({ getCandles: marketData.getCandles, symbol, market: position.market, regimeAnchor: '1h' });
      if (c && isNum(c.confluence) && isNum(c.agreement) && isNum(c.activeTfs)) {
        if (c.activeTfs >= 3 && c.confluence >= o.regimeConfluenceMin && c.agreement >= o.regimeAgreementMin) {
          return { exit: true, reason: `regime-break: confluence=${round2(c.confluence)} agree=${c.agreement}/${c.activeTfs} (basis-stress)` };
        }
      }
    }
  } catch { /* fail-open: hold */ }

  return { exit: false, reason: 'hold' };
}

// ─────────────────────────────────────────────────────────────────────────────
// §6 — runCarryBacktest (offline, injected series — the honest economics replay)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * runCarryBacktest({ market, fundingRate8h, settlements, perpPath, spotPath, opts }) -> report
 * Replays a single delta-neutral carry over `settlements` 8h periods using injected price paths.
 * perpPath/spotPath: arrays of close prices, length = settlements+1 (entry … each settlement).
 * Deterministic + offline (no network). Returns carryReport(book).
 */
export function runCarryBacktest({ market = 'BTC-USD', fundingRate8h, settlements = 21, perpPath, spotPath, opts = {} } = {}) {
  const o = { ...CARRY_DEFAULTS, ...opts };
  const gate = entryGate({ avgFunding8h: fundingRate8h, recordCount: o.minHistoryRecords, market, opts: o });
  if (!gate.enter) return { entered: false, gate };

  const book = createCarryBook({ market, rate8h: fundingRate8h, pool: o.pool, perpFee: o.perpMakerFee, spotFee: o.spotMakerFee, basisBps: o.basisBps });
  const t0 = 1_700_000_000;
  const mkBars = (px) => Array.from({ length: 5 }, (_, i) => ({ timestamp: t0 - (5 - i) * 60, open: px, high: px, low: px, close: px, volume: 1000 }));
  const pp = Array.isArray(perpPath) ? perpPath : Array(settlements + 1).fill(100);
  const sp = Array.isArray(spotPath) ? spotPath : pp;
  const bar = (px, ts) => ({ timestamp: ts, open: px, high: px, low: px, close: px, volume: 1000 });

  const open = openCarryPair(book, {
    perpSide: gate.perpSide, notional: o.legNotional,
    perpBar: bar(pp[0], t0), spotBar: bar(sp[0], t0), perpBars: mkBars(pp[0]), spotBars: mkBars(sp[0]), ts: t0,
  });
  if (!open.ok) return { entered: false, gate, openError: open.reason };

  for (let i = 1; i <= settlements; i++) {
    const ts = t0 + i * 8 * 3600; // exact 8h boundary
    settleCarry(book, { ts, perpBar: bar(pp[i] ?? pp[pp.length - 1], ts), spotBar: bar(sp[i] ?? sp[sp.length - 1], ts) });
  }
  const tClose = t0 + (settlements + 1) * 8 * 3600;
  closeCarryPair(book, {
    ts: tClose, perpBar: bar(pp[pp.length - 1], tClose), spotBar: bar(sp[sp.length - 1], tClose),
    perpBars: mkBars(pp[pp.length - 1]), spotBars: mkBars(sp[sp.length - 1]),
  });
  return { entered: true, gate, report: carryReport(book) };
}

// ─────────────────────────────────────────────────────────────────────────────
// §7 — probeLive (read-only live snapshot → gate decision + projected economics)
// ─────────────────────────────────────────────────────────────────────────────

/** probeLive(market, opts) -> Promise<probe>  READ-ONLY: getFundingHistory + getCandles (keyless). No orders. */
export async function probeLive(market, opts = {}) {
  const o = { ...CARRY_DEFAULTS, ...opts };
  const symbol = cryptoMarketToPerpSymbol(market) || String(market);
  const out = { market, symbol, ts: Math.floor(Date.now() / 1000) };
  try {
    const hist = await PerpAdapter.getFundingHistory(symbol, { limit: o.sevenDayRecords });
    const avg = computeSevenDayAvgFunding(hist, o);
    out.avgFunding8h = isNum(avg.avgFunding8h) ? round4(avg.avgFunding8h) : null;
    out.records = avg.count;
    // realized vol from recent candles (for the carry-to-vol gate)
    let rv = NaN;
    try {
      const { candles } = await PerpAdapter.getCandles(symbol, { interval: '1m', limit: 240 });
      const series = (candles || []).map((c) => [c.timestamp, c.close]);
      rv = realizedVol(series, { periodsPerYear: 525600, minObs: 30 });
    } catch { /* vol optional */ }
    out.realizedVol = isNum(rv) ? round4(rv) : null;
    const gate = entryGate({ avgFunding8h: avg.avgFunding8h, recordCount: avg.count, realizedVol: rv, market, opts: o });
    out.gate = gate;
    // Projected economics at the current rate (one delta-neutral pair, honest costs)
    if (isNum(avg.avgFunding8h)) {
      const fees = o.legNotional * o.perpMakerFee + o.legNotional * o.spotMakerFee; // entry
      const roundTripFees = round4(fees * 2);
      const basis = round4((o.basisBps / 1e4) * o.legNotional * 2);
      const fundingPerSettle = round4(Math.abs(avg.avgFunding8h) * o.legNotional);
      const breakeven = fundingPerSettle > 0 ? Math.ceil((roundTripFees + basis) / fundingPerSettle) : Infinity;
      out.economics = {
        fundingPerSettlementEur: fundingPerSettle, roundTripFeesEur: roundTripFees, basisCostEur: basis,
        settlementsToBreakeven: breakeven, daysToBreakeven: isFinite(breakeven) ? round2(breakeven * 8 / 24) : null,
        net7dEur: round4(fundingPerSettle * 21 - roundTripFees - basis),
      };
    }
  } catch (e) {
    out.error = String(e && e.message || e);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// §8 — CLI + --test
// ─────────────────────────────────────────────────────────────────────────────

const _isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (_isMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, label) => { if (c) pass++; else { fail++; console.error(`FAIL: ${label}`); } };
  const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

  // computeSevenDayAvgFunding
  {
    const recs = Array.from({ length: 21 }, (_, i) => ({ timestamp: 1000 + i * 28800000, fundingRate: 0.0001 }));
    const r = computeSevenDayAvgFunding(recs);
    ok(approx(r.avgFunding8h, 0.0001) && r.count === 21 && r.sufficient, `avg 21×0.0001 = 0.0001 (got ${r.avgFunding8h})`);
    // order-defensive: ascending input, newest has a spike → still uses newest 21 by timestamp (here all 21)
    ok(computeSevenDayAvgFunding([]).sufficient === false, 'empty → not sufficient');
    ok(computeSevenDayAvgFunding([{ timestamp: 1, fundingRate: null }]).count === 0, 'all-null → count 0');
    const short = Array.from({ length: 10 }, (_, i) => ({ timestamp: i, fundingRate: 0.0002 }));
    ok(computeSevenDayAvgFunding(short).sufficient === false, '10 records (<14) → not sufficient');
    ok(approx(computeSevenDayAvgFunding(short).avgFunding8h, 0.0002), '10 records still averages');
    // only newest 21 selected
    const many = Array.from({ length: 40 }, (_, i) => ({ timestamp: i, fundingRate: i < 19 ? 0.01 : 0.0001 }));
    // newest 21 are timestamps 19..39 → all 0.0001
    ok(approx(computeSevenDayAvgFunding(many).avgFunding8h, 0.0001), 'selects newest 21 by timestamp');
  }

  // entryGate
  {
    const base = { recordCount: 21, market: 'BTC-USD' };
    ok(entryGate({ ...base, avgFunding8h: 0.0005 }).enter === true, 'enter at 0.05%/8h');
    ok(entryGate({ ...base, avgFunding8h: 0.0005 }).perpSide === 'short', '+funding → short perp');
    ok(entryGate({ ...base, avgFunding8h: -0.0005 }).perpSide === 'long', '−funding → long perp');
    ok(entryGate({ ...base, avgFunding8h: 0.0001 }).enter === false, '0.01%/8h below 0.03% threshold → no enter');
    ok(entryGate({ ...base, avgFunding8h: 0.0005, recordCount: 5 }).enter === false, 'insufficient history → no enter');
    ok(entryGate({ avgFunding8h: NaN, ...base }).enter === false, 'NaN funding → no enter');
    // carry-to-vol gate: 0.05%/8h = 54.75% APR; at 600% vol → ratio 0.09 < 0.15 → reject
    ok(entryGate({ ...base, avgFunding8h: 0.0005, realizedVol: 6.0 }).enter === false, 'high vol → carry-to-vol rejects');
    ok(entryGate({ ...base, avgFunding8h: 0.0005, realizedVol: 0.8 }).enter === true, 'normal vol → carry-to-vol passes');
    ok(entryGate({ ...base, avgFunding8h: 0.003 }).warning !== null, 'extreme funding → warning set');
  }

  // clampFundingRate
  {
    ok(approx(clampFundingRate(0.05), 0.0075), 'clamp 5% → 0.75% cap');
    ok(approx(clampFundingRate(-0.05), -0.0075), 'clamp −5% → −0.75%');
    ok(approx(clampFundingRate(0.0003), 0.0003), 'in-range unchanged');
    ok(clampFundingRate(NaN) === 0, 'NaN → 0');
  }

  // runCarryBacktest — flat price (pure carry), short on +funding
  {
    const r = runCarryBacktest({ market: 'BTC-USD', fundingRate8h: 0.0005, settlements: 21, opts: { basisBps: 5 } });
    ok(r.entered === true, 'backtest enters at 0.05%/8h');
    ok(r.report && r.report.perpSide === 'short', 'backtest short perp on +funding');
    ok(r.report.fundingReceived > 0, `funding received > 0 (got ${r.report?.fundingReceived})`);
    // funding ≈ 0.0005 × 150 × 21 = 1.575 ; fees = 2×(150×0.0002 + 150×0.001)=2×0.18=0.36 ; basis=5bp×150×2/1e4=0.15
    ok(approx(r.report.fundingReceived, 1.575, 0.05), `funding ≈ €1.575 (got ${r.report.fundingReceived})`);
    ok(approx(r.report.totalFees, 0.36, 0.01), `fees ≈ €0.36 (got ${r.report.totalFees})`);
    ok(approx(r.report.basisCost, 0.15, 0.01), `basis ≈ €0.15 (got ${r.report.basisCost})`);
    ok(r.report.netHonest > 0, `net positive at 0.05%/8h over 7d (got ${r.report.netHonest})`);
    ok(Math.abs(r.report.executionResidual) < 0.5, `execution residual ~0 delta-neutral (got ${r.report.executionResidual})`);
  }

  // backtest — gate rejects below threshold
  {
    const r = runCarryBacktest({ market: 'BTC-USD', fundingRate8h: 0.0001, settlements: 21 });
    ok(r.entered === false, '0.01%/8h → backtest does not enter (fee trap)');
  }

  // backtest — delta-neutral under a price move: price residual stays ~0
  {
    const up = Array.from({ length: 23 }, (_, i) => 100 * (1 + i * 0.01)); // +1%/settlement both legs
    const r = runCarryBacktest({ market: 'BTC-USD', fundingRate8h: 0.0005, settlements: 21, perpPath: up, spotPath: up });
    ok(r.entered && Math.abs(r.report.executionResidual) < 1.5, `delta-neutral holds under +22% move (residual ${r.report?.executionResidual})`);
  }

  // negative-funding carry: long perp receives, still positive
  {
    const r = runCarryBacktest({ market: 'BTC-USD', fundingRate8h: -0.0005, settlements: 21 });
    ok(r.report && r.report.perpSide === 'long', 'neg funding → long perp');
    ok(r.report.fundingReceived > 0, `long perp receives on −funding (got ${r.report?.fundingReceived})`);
  }

  console.log(`funding-carry --test: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

if (_isMain && process.argv.includes('--backtest')) {
  console.log(CARRY_CAVEAT + '\n');
  for (const f of [0.0001, 0.0003, 0.0005, 0.001]) {
    const r = runCarryBacktest({ market: 'BTC-USD', fundingRate8h: f, settlements: 21 });
    if (!r.entered) { console.log(`funding ${(f * 100).toFixed(3)}%/8h → NO ENTRY (${r.gate.reason})`); continue; }
    const x = r.report;
    console.log(`funding ${(f * 100).toFixed(3)}%/8h → net €${x.netHonest} (funding €${x.fundingReceived} − fees €${x.totalFees} − basis €${x.basisCost}) | ${x.netApyPct}% APY`);
  }
}

if (_isMain && process.argv.includes('--probe')) {
  const i = process.argv.indexOf('--probe');
  const market = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : 'BTC-USD';
  console.log(CARRY_CAVEAT + '\n');
  probeLive(market).then((p) => { console.log(JSON.stringify(p, null, 2)); process.exit(0); })
    .catch((e) => { console.error('probe error:', e.message); process.exit(1); });
}
