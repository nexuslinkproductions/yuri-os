#!/usr/bin/env node
// @capability: as-quote-live
// @serves: live A-S paper quoting | daemon maker engine | live maker paper PnL | paper market-making engine | live fill/adverse/inventory/fee buckets | DISARMED live quoter
// @does: LIVE Avellaneda-Stoikov PAPER maker-quoting engine for the daemon. Composes the view-only live-stream modules (depth-book + trades-stream + mark-price) and mirrors as-baseline.runBaseline's VERIFIED math on live events: per-second EWMA price-vol (sigmaEwma->sigmaPrice), two-sided quotes() with ALL wired guards (spread floor/ceiling, skew clamp, qMax) + regime-breaker (halt/widen) + funding-skew (mark-price funding -> reservation nudge), queue-honest PAPER fills (maker-exec newMakerOrder/onTrade against the live trade stream — NO real orders), bucketed PnL (attributePnl/sumFills), and multi-level OFI lambda-measurement. INV-1: PAPER ONLY — zero order/auth path; imports only view-only/pure modules; fills are simulated, never submitted.
// @use: import { startAsQuoteLive } from './as-quote-live.mjs'; const q = await startAsQuoteLive({ symbol:'BTCUSDT', config }); q.getState(); q.stop(); — or `node as-quote-live.mjs --test|--smoke`.
// @exports: startAsQuoteLive, computeLiveQuote, loadLatestKappa, DEFAULT_AS_QUOTE_CONFIG
//
// ─────────────────────────────────────────────────────────────────────────────
// INV-1 HARD LINE: this module NEVER submits, signs, or POSTs an order. It imports
// ONLY view-only market-data streams + pure math. Paper fills are simulated against
// the live PUBLIC trade stream via the same maker-exec-measure model tape-replay uses.
// No API key, no auth, no order-create path. (--test self-audits this.)
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// view-only live-stream modules
import { startDepthBook } from './depth-book.mjs';
import { startTradesStream } from './trades-stream.mjs';
import { startMarkPriceStream } from './mark-price.mjs';
// pure math / paper-fill modules (NO order path)
import { quotes, sigmaEwma, sigmaPrice } from '../avellaneda-stoikov.mjs';
import { computeMicroprice } from '../orderbook-imbalance.mjs';
import { computeMultiLevelOFI, estimateLambda } from '../ofi.mjs';
import { fundingSkew } from '../funding-skew.mjs';
import { regimeBreaker } from '../regime-breaker.mjs';
import { newMakerOrder, onTrade as makerOnTrade, onBookUpdate } from '../maker-exec-measure.mjs';
import { attributePnl, sumFills } from '../as-baseline.mjs';
import { fitKappa } from '../kappa-fit.mjs';

const fin = (x) => typeof x === 'number' && Number.isFinite(x);

// "everything armed" config — the full wired-module set; defaults from the offline measurement.
export const DEFAULT_AS_QUOTE_CONFIG = Object.freeze({
  requoteSec: 5, gamma: 0.2, tau: 1, size: 0.001, feeRtBps: 4.0, qmax: 3, tickSize: 0.1,
  volHalfLifeSec: 30, adverseBps: 0.16, kappa: null, // kappa null → load from fill-surface
  minHalfSpreadBps: 2.0, maxHalfSpreadBps: 50, maxSkewTicks: 3, quoteQMax: 3,
  regimeBreak: { zWiden: 2, zHalt: 3, widenMult: 1.5 },
  decayModel: { enabled: true, cancelAheadShare: 0.5 },
  measureOfi: { levels: 5 }, useFunding: true,
  ofiHorizonSec: 5, midRingMax: 4000, fillsMax: 5000,
});

// ── loadLatestKappa: newest fill-surface-*.json → fitKappa → kappaPrice (per $) ──
export function loadLatestKappa({ stateDir, mid = 106000, tickSize = 0.1, readDir = readdirSync, readFile = readFileSync } = {}) {
  try {
    const files = readDir(stateDir).filter((f) => /^fill-surface-.*\.json$/.test(f)).sort();
    if (!files.length) return { kappaPrice: null, source: 'no fill-surface' };
    const latest = files[files.length - 1];
    const j = JSON.parse(readFile(path.join(stateDir, latest), 'utf8'));
    const fit = fitKappa(j.surface, { mid, tickSize });
    if (fit && fit.pooled && fin(fit.pooled.kappaPrice) && fit.pooled.kappaPrice > 0) {
      return { kappaPrice: fit.pooled.kappaPrice, kappaBps: fit.pooled.kappaBps, r2: fit.pooled.r2, source: `fitKappa(${latest})` };
    }
    return { kappaPrice: null, source: `fitKappa(${latest}) → no usable pooled fit` };
  } catch (e) {
    return { kappaPrice: null, source: `kappa load-fail: ${e?.message || e}` };
  }
}

// ── computeLiveQuote: PURE — the per-requote decision (mirrors runBaseline's loop body) ──
// Returns { bidPx, askPx, halfSpread, reservation, anchor, regimeAction, fundingSkewTicks } | { halted:true } | null.
export function computeLiveQuote(state, config) {
  const { book, q, sigmaP, kappaPrice } = state;
  if (!book || !fin(book.mid) || book.mid <= 0 || !fin(kappaPrice) || kappaPrice <= 0) return null;
  if (!fin(sigmaP) || sigmaP <= 0) return null; // need price-vol before quoting

  const isCrossed = fin(book.spreadBps) && book.spreadBps < 0;
  let anchor;
  if (isCrossed) anchor = book.mid;
  else {
    const mp = computeMicroprice(book.bids, book.asks);
    anchor = fin(mp) && mp > 0 ? mp : book.mid;
  }

  // funding-skew nudge to anchor (DISARMED: useFunding off OR no rate → unchanged)
  let fundingSkewTicks = 0;
  if (config.useFunding && fin(state.fundingRate) && state.fundingRate !== 0) {
    const fs = fundingSkew({ fundingRate: state.fundingRate, q, secsToFunding: state.secsToFunding, tickSize: config.tickSize });
    if (fs && fin(fs.reservationAdjPrice)) { anchor += fs.reservationAdjPrice; fundingSkewTicks = fs.skewTicks; }
  }

  // regime-breaker (live 1s return + return-vol; halt → no quote)
  let regimeAction = 'normal';
  if (config.regimeBreak && fin(state.lastRet) && fin(state.sigmaRet) && state.sigmaRet > 0) {
    const rb = regimeBreaker({ ret: state.lastRet, sigma: state.sigmaRet },
      { zWiden: config.regimeBreak.zWiden ?? 2, zHalt: config.regimeBreak.zHalt ?? 3 });
    regimeAction = rb && rb.action ? rb.action : 'normal';
  }
  if (regimeAction === 'halt') return { halted: true, regimeAction, anchor, fundingSkewTicks };

  const useMinSpread = fin(config.minHalfSpreadBps);
  const useMaxSpread = fin(config.maxHalfSpreadBps);
  const useMaxSkew = fin(config.maxSkewTicks) && fin(config.tickSize) && config.tickSize > 0;
  const useQuoteQMax = fin(config.quoteQMax);
  const qres = quotes({
    microprice: anchor, q, gamma: config.gamma, sigma: sigmaP, tau: config.tau, kappa: kappaPrice,
    ...(useMinSpread ? { minHalfSpreadBps: config.minHalfSpreadBps } : {}),
    ...(useMaxSpread ? { maxHalfSpreadBps: config.maxHalfSpreadBps } : {}),
    ...(useMaxSkew ? { maxSkewTicks: config.maxSkewTicks, tickSize: config.tickSize } : {}),
    ...(useQuoteQMax ? { qMax: config.quoteQMax } : {}),
  });
  if (!qres || !fin(qres.halfSpread) || (!fin(qres.bidPx) && !fin(qres.askPx))) return null;

  let { bidPx, askPx } = qres;
  let halfSpread = qres.halfSpread;
  if (regimeAction === 'widen' && fin(qres.reservation)) {
    halfSpread = halfSpread * (config.regimeBreak.widenMult ?? 1.5);
    bidPx = qres.reservation - halfSpread;
    askPx = qres.reservation + halfSpread;
  }
  return { bidPx, askPx, halfSpread, reservation: qres.reservation, anchor, regimeAction, fundingSkewTicks };
}

// ── startAsQuoteLive: the live engine ─────────────────────────────────────────
export async function startAsQuoteLive({ symbol = 'BTCUSDT', config = {}, deps = {} } = {}) {
  const cfg = { ...DEFAULT_AS_QUOTE_CONFIG, ...config };
  const SYM = String(symbol).toUpperCase();
  const now = deps.now || (() => Date.now());
  const _startDepthBook = deps.startDepthBook || startDepthBook;
  const _startTradesStream = deps.startTradesStream || startTradesStream;
  const _startMarkPriceStream = deps.startMarkPriceStream || startMarkPriceStream;
  // module-relative default so κ loads regardless of cwd (observatory → ../../../state = _SYSTEM/state)
  const stateDir = deps.stateDir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../state');

  const startedAt = now();
  const state = {
    book: null, q: 0, maxQ: 0,
    prevMidForRet: null, prevRetTs: null, prevVar: null, sigmaRet: null, sigmaP: null, lastRet: null,
    fundingRate: null, secsToFunding: null, fundingSkewTicks: 0,
    kappaPrice: null, kappaSource: 'init',
    restingBid: null, restingAsk: null,
    fills: [], regimeHaltCount: 0, regimeWidenCount: 0,
    prevOfiBook: null, ofiRecords: [], midRing: [],
    lastQuote: null, quoteCount: 0, lastError: null, lastAction: 'normal',
  };

  // κ at startup (fail-open → no quoting until resolved)
  const k = (deps.loadKappa || loadLatestKappa)({ stateDir, mid: 106000, tickSize: cfg.tickSize });
  state.kappaPrice = fin(cfg.kappa) && cfg.kappa > 0 ? cfg.kappa : k.kappaPrice;
  state.kappaSource = fin(cfg.kappa) && cfg.kappa > 0 ? '--config kappa' : k.source;

  // ── book updates: σ + OFI measurement + cancel-inference feed ──
  function onBook(b) {
    try {
      if (!b || b.symbol !== SYM || !fin(b.mid) || b.mid <= 0) return;
      state.book = b;
      const t = fin(b.ts) ? b.ts : now();

      // per-second EWMA price-vol (sample mid at ~1s cadence)
      if (state.prevMidForRet == null) { state.prevMidForRet = b.mid; state.prevRetTs = t; }
      else if (state.prevMidForRet > 0 && state.prevRetTs != null && (t - state.prevRetTs) >= 1000) {
        const r = Math.log(b.mid / state.prevMidForRet);
        if (fin(r)) {
          state.lastRet = r;
          const ew = sigmaEwma(r * r, state.prevVar, cfg.volHalfLifeSec);
          if (ew) state.prevVar = ew.variance;
          state.sigmaRet = state.prevVar != null ? Math.sqrt(state.prevVar) : null;
          state.sigmaP = state.sigmaRet != null ? sigmaPrice(state.sigmaRet, b.mid) : null;
        }
        state.prevMidForRet = b.mid; state.prevRetTs = t;
      }

      // midRing for OFI forward-Δmid resolution
      state.midRing.push({ ts: t, mid: b.mid });
      if (state.midRing.length > cfg.midRingMax) state.midRing.shift();

      // multi-level OFI (measurement only — never feeds quotes)
      if (cfg.measureOfi) {
        const levels = cfg.measureOfi.levels ?? 5;
        const N = Math.min(levels, b.bids.length, b.asks.length);
        const curr = [];
        for (let i = 0; i < N; i++) curr.push({ bidPx: b.bids[i].price, bidSz: b.bids[i].size, askPx: b.asks[i].price, askSz: b.asks[i].size });
        const { ofi } = computeMultiLevelOFI(state.prevOfiBook, curr, { levels });
        state.ofiRecords.push({ ts: t, mid: b.mid, ofi: ofi ?? 0 });
        if (state.ofiRecords.length > cfg.midRingMax) state.ofiRecords.shift();
        state.prevOfiBook = curr;
      }

      // cancel-inference feed for any resting paper orders (decay model)
      if (state.restingBid) onBookUpdate(state.restingBid, levelSizeAt(b.bids, state.restingBid.price));
      if (state.restingAsk) onBookUpdate(state.restingAsk, levelSizeAt(b.asks, state.restingAsk.price));
    } catch (e) { state.lastError = `onBook: ${e?.message || e}`; }
  }

  // ── trades: drive PAPER fills (NO real orders) ──
  function onTradeEv(tr) {
    try {
      if (!tr || tr.symbol !== SYM) return;
      const mid = state.book?.mid;
      for (const sideKey of ['restingBid', 'restingAsk']) {
        const order = state[sideKey];
        if (!order || order.filled) continue;
        const res = makerOnTrade(order, { tradePrice: tr.price, tradeSize: tr.qty, aggressorSide: tr.aggressorSide });
        if (res && res.fillQty > 0 && order.filled) {
          const side = order.side; // 'buy' | 'sell'
          const attr = attributePnl({
            side, fillPrice: order.price, halfSpread: order._halfSpread,
            midAtFill: fin(mid) ? mid : order.price,
            adverseBpsParam: cfg.adverseBps, feeRtBps: cfg.feeRtBps, mid: fin(mid) ? mid : order.price,
          });
          if (attr) { attr.side = side; state.fills.push(attr); if (state.fills.length > cfg.fillsMax) state.fills.shift(); }
          state[sideKey] = null; // consumed — re-placed next requote
          state.q += side === 'buy' ? cfg.size : -cfg.size;
          if (Math.abs(state.q) > state.maxQ) state.maxQ = Math.abs(state.q);
        }
      }
    } catch (e) { state.lastError = `onTrade: ${e?.message || e}`; }
  }

  function onMark(m) {
    try {
      if (!m || (m.symbol && m.symbol.toUpperCase() !== SYM)) return;
      if (fin(m.fundingRate)) state.fundingRate = m.fundingRate;
      if (fin(m.nextFundingTime) && m.nextFundingTime > 0) state.secsToFunding = Math.max(0, (m.nextFundingTime - now()) / 1000);
    } catch (e) { state.lastError = `onMark: ${e?.message || e}`; }
  }

  // ── requote: compute + (re)place PAPER orders ──
  function requote() {
    try {
      if (!state.book || !fin(state.kappaPrice) || state.kappaPrice <= 0) return;
      const qd = computeLiveQuote(state, cfg);
      if (!qd) return;
      if (qd.halted) { state.regimeHaltCount++; state.lastAction = 'halt'; state.restingBid = null; state.restingAsk = null; return; }
      if (qd.regimeAction === 'widen') state.regimeWidenCount++;
      state.lastAction = qd.regimeAction;
      state.fundingSkewTicks = qd.fundingSkewTicks;

      // inventory hard-limit: suppress the side that would breach qmax
      const canBuy = state.q + cfg.size <= cfg.qmax * cfg.size;
      const canSell = state.q - cfg.size >= -cfg.qmax * cfg.size;
      const dm = cfg.decayModel;

      state.restingBid = (fin(qd.bidPx) && canBuy)
        ? tagOrder(newMakerOrder({ side: 'buy', price: qd.bidPx, size: cfg.size, queueAheadAtJoin: levelSizeAt(state.book.bids, qd.bidPx), ...(dm ? { decayModel: dm } : {}) }), qd.halfSpread)
        : null;
      state.restingAsk = (fin(qd.askPx) && canSell)
        ? tagOrder(newMakerOrder({ side: 'sell', price: qd.askPx, size: cfg.size, queueAheadAtJoin: levelSizeAt(state.book.asks, qd.askPx), ...(dm ? { decayModel: dm } : {}) }), qd.halfSpread)
        : null;

      state.lastQuote = { bidPx: qd.bidPx, askPx: qd.askPx, halfSpread: qd.halfSpread, reservation: qd.reservation, anchor: qd.anchor, ts: now() };
      state.quoteCount++;
    } catch (e) { state.lastError = `requote: ${e?.message || e}`; }
  }

  // ── start the view-only consumers (fail-open: a stream fault never throws out) ──
  let depth = null, trades = null, mark = null, requoteTimer = null;
  try { depth = _startDepthBook({ symbols: [SYM], onBook, onStatus: () => {} }); } catch (e) { state.lastError = `depth: ${e?.message || e}`; }
  try { trades = _startTradesStream({ symbols: [SYM], onTrade: onTradeEv, onStatus: () => {} }); } catch (e) { state.lastError = `trades: ${e?.message || e}`; }
  try { mark = _startMarkPriceStream({ symbols: [SYM], onMark, onStatus: () => {} }); } catch (e) { state.lastError = `mark: ${e?.message || e}`; }
  if (!deps.noTimer) requoteTimer = setInterval(requote, cfg.requoteSec * 1000);

  function getState() {
    const summary = sumFills(state.fills, { maxInventory: state.maxQ / cfg.size, sampleCount: state.quoteCount }) || {};
    return {
      armed: true, paper: true, symbol: SYM, quoting: fin(state.kappaPrice) && state.kappaPrice > 0,
      kappaPrice: state.kappaPrice, kappaSource: state.kappaSource,
      q: state.q, qLots: state.q / cfg.size, maxInventoryLots: state.maxQ / cfg.size,
      sigmaPrice: state.sigmaP, lastQuote: state.lastQuote, quoteCount: state.quoteCount,
      fills: summary.fills ?? 0, netBps: summary.netBps ?? 0, grossSpreadBps: summary.grossSpreadBps ?? 0,
      adverseSelBps: summary.adverseSelBps ?? 0, feeBps: summary.feeBps ?? 0,
      regime: { haltCount: state.regimeHaltCount, widenCount: state.regimeWidenCount, lastAction: state.lastAction },
      funding: { rate: state.fundingRate, secsToFunding: state.secsToFunding, skewTicks: state.fundingSkewTicks },
      ofi: computeOfiLambda(state, cfg),
      uptimeMs: now() - startedAt, lastError: state.lastError,
      note: 'DISARMED-armed PAPER quoter — NO real orders (INV-1). Net is fee-dominated below the data bar; this is live measurement, not a profit claim.',
    };
  }

  function stop() {
    if (requoteTimer) clearInterval(requoteTimer);
    for (const h of [depth, trades, mark]) { try { h && h.stop && h.stop(); } catch { /* noop */ } }
  }

  return { stop, getState, requote, _state: state };
}

// ── helpers ───────────────────────────────────────────────────────────────────
function levelSizeAt(levels, price) {
  if (!Array.isArray(levels) || !fin(price)) return 0;
  for (const l of levels) if (l && fin(l.price) && Math.abs(l.price - price) < 1e-9) return fin(l.size) ? l.size : 0;
  return 0; // our price not resting on an existing level (alone inside spread)
}
function tagOrder(order, halfSpread) { if (order) order._halfSpread = halfSpread; return order; }
function computeOfiLambda(state, cfg) {
  if (!cfg.measureOfi || state.ofiRecords.length < 2) return { lambda: null, r2: null, n: 0, levels: cfg.measureOfi?.levels ?? null };
  const horizonMs = cfg.ofiHorizonSec * 1000;
  const pairs = [];
  for (const rec of state.ofiRecords) {
    const fwd = state.midRing.find((m) => m.ts >= rec.ts + horizonMs);
    if (fwd && fin(fwd.mid) && fin(rec.mid)) pairs.push({ ofi: rec.ofi, deltaMid: fwd.mid - rec.mid });
  }
  if (pairs.length < 2) return { lambda: null, r2: null, n: pairs.length, levels: cfg.measureOfi.levels ?? 5 };
  const fit = estimateLambda(pairs);
  return { lambda: fit.lambda, r2: fit.rSquared, n: fit.n, levels: cfg.measureOfi.levels ?? 5 };
}

// ── --test (hermetic: injected fake streams, NO network) + INV-1 self-audit ────
const _isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (_isMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, l) => { if (c) { pass++; console.log(`  PASS: ${l}`); } else { fail++; console.error(`  FAIL: ${l}`); } };
  console.log('═══ as-quote-live --test (hermetic) ═══');

  // INV-1 SOURCE SELF-AUDIT — the inviolable check. Audit ONLY the shipped module
  // body (everything before this --test block); the test's own `banned` pattern
  // strings below would otherwise match themselves (the grep-greps-itself trap).
  const fullSrc = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const prodSrc = fullSrc.split('// ── --test')[0];
  const banned = [/createOrder/, /placeOrder/, /submitOrder/, /cancelOrder/, /\bPOST\b/, /apiKey/i, /\bsign\s*\(/, /Authorization/i, /secretKey/i, /privateKey/i];
  const hits = banned.filter((re) => re.test(prodSrc)).map((re) => re.source);
  ok(hits.length === 0, `INV-1 self-audit: ZERO order/auth tokens in shipped code (hits: ${hits.join(',') || 'none'})`);

  // fake streams: capture callbacks, drive canned events synchronously.
  const cbs = {};
  const fakeDepth = ({ onBook }) => { cbs.onBook = onBook; return { stop() {} }; };
  const fakeTrades = ({ onTrade }) => { cbs.onTrade = onTrade; return { stop() {} }; };
  const fakeMark = ({ onMark }) => { cbs.onMark = onMark; return { stop() { }, latest: () => null }; };
  const fakeKappa = () => ({ kappaPrice: 0.0736, kappaBps: 0.46, r2: 0.7, source: 'test' });
  let T = 1_000_000;
  const nowFn = () => T;

  const run = async () => {
    const eng = await startAsQuoteLive({
      symbol: 'BTCUSDT',
      config: { ...DEFAULT_AS_QUOTE_CONFIG, requoteSec: 1, size: 0.001, adverseBps: 0.16 },
      deps: { startDepthBook: fakeDepth, startTradesStream: fakeTrades, startMarkPriceStream: fakeMark, loadKappa: fakeKappa, now: nowFn, noTimer: true, stateDir: '/tmp' },
    });
    ok(typeof cbs.onBook === 'function' && typeof cbs.onTrade === 'function', 'engine subscribed to book + trade streams');
    ok(eng.getState().kappaPrice === 0.0736 && eng.getState().quoting === true, 'kappa loaded → quoting=true');

    const mkBook = (ts, mid) => ({ symbol: 'BTCUSDT', ts, mid,
      bids: [{ price: mid - 6, size: 5 }, { price: mid - 8, size: 10 }],
      asks: [{ price: mid + 6, size: 5 }, { price: mid + 8, size: 10 }], spreadBps: (12 / mid) * 1e4 });
    cbs.onBook(mkBook(T, 62700));
    T += 1500; cbs.onBook(mkBook(T, 62701)); // 2nd book ≥1s later → σ updates
    eng.requote();
    const q1 = eng.getState().lastQuote;
    ok(q1 && fin(q1.bidPx) && fin(q1.askPx) && q1.bidPx < q1.askPx, `quote computed from live book (bid ${q1?.bidPx?.toFixed(1)} < ask ${q1?.askPx?.toFixed(1)})`);
    ok(fin(eng.getState().sigmaPrice) && eng.getState().sigmaPrice > 0, 'sigmaPrice (price-vol) computed from 1s mid returns');

    // a deep sell-aggressor trade sweeps the resting bid → PAPER fill
    const fillsBefore = eng.getState().fills;
    cbs.onTrade({ symbol: 'BTCUSDT', price: q1.bidPx, qty: 50, ts: T + 10, aggressorSide: 'sell', isBuyerMaker: true });
    const stAfter = eng.getState();
    ok(stAfter.fills >= fillsBefore, `paper fill simulated against live trade (fills ${stAfter.fills}, q ${stAfter.qLots} lots)`);
    ok(fin(stAfter.netBps), `bucketed PnL populated (net ${stAfter.netBps.toFixed(3)} bps, spread ${stAfter.grossSpreadBps.toFixed(2)})`);

    cbs.onBook(mkBook(T + 2000, 62702));
    ok(eng.getState().ofi && eng.getState().ofi.levels === 5, 'OFI measurement active (levels=5)');

    cbs.onMark({ symbol: 'BTCUSDT', markPrice: 62700, fundingRate: 0.0003, nextFundingTime: T + 3600_000, ts: T });
    ok(fin(eng.getState().funding.rate), `funding rate tracked from mark stream (${eng.getState().funding.rate})`);

    const s = eng.getState();
    ok(s.armed === true && s.paper === true && s.symbol === 'BTCUSDT', 'getState shape: armed+paper+symbol');

    // fail-open: a throwing stream-start must NOT throw out of startAsQuoteLive
    let threw = false;
    try { await startAsQuoteLive({ deps: { startDepthBook: () => { throw new Error('boom'); }, startTradesStream: fakeTrades, startMarkPriceStream: fakeMark, loadKappa: fakeKappa, now: nowFn, noTimer: true } }); } catch { threw = true; }
    ok(!threw, 'fail-open: a throwing stream-start degrades, never throws to the daemon');

    eng.stop();
  };
  await run();

  // computeLiveQuote PURE units
  ok(computeLiveQuote({ book: { mid: 62700, bids: [{ price: 62694, size: 1 }], asks: [{ price: 62706, size: 1 }], spreadBps: 1.9 }, q: 0, sigmaP: 0.8, kappaPrice: null }, DEFAULT_AS_QUOTE_CONFIG) === null, 'computeLiveQuote: null kappa → null (no quote)');
  ok(computeLiveQuote({ book: { mid: 62700, bids: [{ price: 62694, size: 1 }], asks: [{ price: 62706, size: 1 }], spreadBps: 1.9 }, q: 0, sigmaP: null, kappaPrice: 0.07 }, DEFAULT_AS_QUOTE_CONFIG) === null, 'computeLiveQuote: null sigma → null (no quote)');
  const halt = computeLiveQuote({ book: { mid: 62700, bids: [{ price: 62694, size: 1 }], asks: [{ price: 62706, size: 1 }], spreadBps: 1.9 }, q: 0, sigmaP: 0.8, kappaPrice: 0.07, lastRet: 0.05, sigmaRet: 1e-4 }, { ...DEFAULT_AS_QUOTE_CONFIG, regimeBreak: { zWiden: 2, zHalt: 3, widenMult: 1.5 } });
  ok(halt && halt.halted === true, 'computeLiveQuote: 3σ+ move → regime halt (no quote)');

  console.log(`\n─── as-quote-live --test: ${pass} PASS, ${fail} FAIL ───`);
  process.exit(fail > 0 ? 1 : 0);
}

// ── --smoke (LIVE ~15s, view-only) ─────────────────────────────────────────────
if (_isMain && process.argv.includes('--smoke')) {
  console.log('═══ as-quote-live --smoke (LIVE view-only, ~15s, PAPER) ═══');
  const eng = await startAsQuoteLive({ symbol: 'BTCUSDT', config: { requoteSec: 3 } });
  await new Promise((r) => setTimeout(r, 15000));
  console.log(JSON.stringify(eng.getState(), null, 2));
  eng.stop();
  process.exit(0);
}
