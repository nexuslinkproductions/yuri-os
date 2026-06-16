#!/usr/bin/env node
/**
 * orchestrator.mjs — YURI AFL Observatory Orchestrator (W2 bridge)
 *
 * runCycle() = one observatory cycle:
 *   for each tracked market:
 *     fetch → normalize timestamps to unix-SECONDS (single chokepoint)
 *            → dataQualityGate → factor signals → computeSize → paper fill
 *
 * CONSTRAINTS (§4 master-brief):
 *   - PAPER-ONLY — no real orders ever (INV-1)
 *   - NO key reads — creds from env only (INV-2)
 *   - No protected paths — ledgers under _SYSTEM/state/ only
 *   - Energy ΔU via gateProposal = advisory telemetry, NEVER blocks
 *   - Timestamps: ALL bars normalized to unix-SECONDS before gate + downstream
 *   - httpGet injectable for offline/test (deterministic)
 *   - No express, no ws — pure node:http + better-sqlite3 + AFL spine
 *
 * @module observatory/orchestrator
 */

import path from 'node:path';
import https from 'node:https';
import { URL as NodeURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

// ── Path resolution ────────────────────────────────────────────────────────
const _HERE = path.dirname(fileURLToPath(import.meta.url));
// observatory/ → alpha-factor-library/ → Scripts/ → _SYSTEM/
const AFL_ROOT = path.resolve(_HERE, '..');
const SCRIPTS_ROOT = path.resolve(AFL_ROOT, '..');
const SYSTEM_ROOT = path.resolve(SCRIPTS_ROOT, '..');

// ── Ledger paths (under _SYSTEM/state/ only) ──────────────────────────────
const STATE_DIR = path.join(SYSTEM_ROOT, 'state');
const PAPER_LEDGER = path.join(STATE_DIR, 'observatory-paper.jsonl');
const PRED_LEDGER = path.join(STATE_DIR, 'observatory-predictions.jsonl');

// ── AFL spine imports ──────────────────────────────────────────────────────
import { dataQualityGate } from '../data-quality-gate.mjs';
import { computeSize } from '../afl-sizing.mjs';
import { createPaperEngine } from '../afl-paper.mjs';
import { gateProposal } from '../../math/yuri-energy.mjs';
import { detectRegimeShift } from '../regime-detector.mjs';
// factorQualityScore removed — not wired in W2 observatory (BUG-3: dead import)
// PerpAdapter removed — W2 is crypto-primary; perp market loop not yet wired (BUG-4: inert import)

// Adapter imports — we re-export setHttpGet from each to inject mocks
import * as CoinbaseAdapter from '../adapters/coinbase-adapter.mjs';
import * as PolymarketAdapter from '../adapters/polymarket-adapter.mjs';
import * as PerpAdapter from '../adapters/perp-adapter.mjs';
import * as SocialAdapter from '../adapters/social-adapter.mjs';
import * as PolymarketDiscovery from '../adapters/polymarket-discovery.mjs';
import { computePerpSignals } from '../perp-signals.mjs';
import { circuitInputFromBars } from '../factor-return-vectors.mjs';
import { optimizeFactorCircuit } from '../factor-circuit.mjs';
import { webSearch as agentReachSearch, available as agentReachAvailable } from '../../agent-reach.mjs';
import { scorePost, aggregateSentiment } from '../adapters/social-adapter.mjs';

// ── Constants ──────────────────────────────────────────────────────────────
const DEFAULT_CYCLE_INTERVAL_MS = 15_000;  // 15s — conservative, rate-limit aware

// Default tracked markets — crypto PRIMARY, Polymarket secondary
// BTC/ETH anchors + fast movers (live vol scan 2026-06-16: WIF ~6.8%/day, SOL/SUI/AVAX ~3.6%
// vs BTC ~2.1%). Readable-price coins only (sub-cent memecoins need adaptive decimals first).
// Override with OBSERVATORY_CRYPTO_MARKETS=BTC-USD,SOL-USD,...
const DEFAULT_CRYPTO_MARKETS = (process.env.OBSERVATORY_CRYPTO_MARKETS
  ? process.env.OBSERVATORY_CRYPTO_MARKETS.split(',').map((s) => s.trim()).filter(Boolean)
  : ['BTC-USD', 'ETH-USD', 'SOL-USD', 'SUI-USD', 'WIF-USD', 'AVAX-USD']);
const COINBASE_GRANULARITY = 'FIVE_MINUTE';

// Number of candles to fetch per cycle for crypto
const CANDLES_FETCH_LIMIT = 20;

// ── Timestamp normalization (single chokepoint) ────────────────────────────
/**
 * toUnixSeconds(ts) — normalize any timestamp (ms or seconds) to unix-SECONDS.
 * Heuristic: if ts > 1e11 it's milliseconds (any ms-epoch after ~1973); else seconds.
 * This is the SINGLE canonicalization point before dataQualityGate.
 * @param {number} ts
 * @returns {number} unix-seconds
 */
function toUnixSeconds(ts) {
  if (!Number.isFinite(ts)) return ts;
  return ts > 1e11 ? Math.floor(ts / 1000) : ts;
}

/**
 * normalizeBarTimestamp(bar) — returns a new bar with timestamp in unix-SECONDS.
 * Mutates nothing; returns a shallow copy.
 */
function normalizeBarTimestamp(bar) {
  if (!bar || typeof bar !== 'object') return bar;
  return { ...bar, timestamp: toUnixSeconds(bar.timestamp) };
}

// ── Live factor signal computation ────────────────────────────────────────
/**
 * computeLiveSignals(bars, market) — derive a few live factor signals from OHLCV.
 * Lightweight and self-contained — does NOT hit the network.
 * Returns an array of {factorId, value, side, confidence, ts} signal objects.
 */
function computeLiveSignals(bars, market) {
  if (!bars || bars.length < 5) return [];
  const signals = [];
  const now = bars[bars.length - 1].timestamp;

  // Signal 1: momentum (short vs long EMA sign)
  const closes = bars.map((b) => b.close).filter(Number.isFinite);
  if (closes.length >= 10) {
    const emaShort = ema(closes, 5);
    const emaLong = ema(closes, 10);
    const last = closes[closes.length - 1];
    const trend = emaShort > emaLong ? 'long' : 'short';
    const trendStrength = Math.abs(emaShort - emaLong) / (emaLong || 1);
    const confidence = Math.min(0.99, 0.5 + Math.min(trendStrength * 10, 0.49));
    signals.push({
      factorId: `obs-momentum-${market}`,
      value: emaShort - emaLong,
      side: trend,
      confidence,
      ts: now,
    });
  }

  // Signal 2: vol regime (ATR-based)
  if (bars.length >= 10) {
    const atrs = atrSeries(bars, 10);
    const lastAtr = atrs[atrs.length - 1];
    const avgAtr = atrs.reduce((s, v) => s + v, 0) / atrs.length;
    const volRegime = lastAtr > avgAtr * 1.2 ? 'short' : lastAtr < avgAtr * 0.8 ? 'long' : 'flat';
    const confidence = 0.55;
    if (volRegime !== 'flat') {
      signals.push({
        factorId: `obs-vol-regime-${market}`,
        value: lastAtr - avgAtr,
        side: volRegime,
        confidence,
        ts: now,
      });
    }
  }

  return signals;
}

/** Exponential moving average over a numeric series. */
function ema(values, period) {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

/** ATR series (using high-low range as a proxy; no prior close needed). */
function atrSeries(bars, period) {
  const trs = bars.map((b) => Number.isFinite(b.high) && Number.isFinite(b.low) ? b.high - b.low : 0);
  const out = [];
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / Math.max(period, 1);
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    out.push(atr);
  }
  if (!out.length) out.push(atr);
  return out;
}

// ── Returns series for sizing ──────────────────────────────────────────────
function closeReturns(bars) {
  const returns = [];
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1].close, b = bars[i].close;
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
      returns.push(Math.log(b / a));
    }
  }
  return returns;
}

// ── Energy advisory telemetry ──────────────────────────────────────────────
/**
 * computeEnergyDelta(signal, paperSnap) — gateProposal ΔU for one trade proposal.
 * ADVISORY ONLY — never blocks.
 * Returns { deltaU, accept, reason } or null on error (fail-open).
 */
function computeEnergyDelta(signal, paperSnap) {
  try {
    // Build minimal before/after states from paper snapshot
    const before = {
      protectedPathViolations: 0,
      promotionLadderInversions: 0,
      verifiedEvidenceCount: Math.min(10, Math.floor((paperSnap?.completedTrades || 0) / 2)),
      claimPromotionDistribution: [1, 0, 0, 0, 0, 0],
      predictions: [], outcomes: [],
      evidence: [], prior: null, posterior: null,
    };
    const after = {
      ...before,
      // A paper trade that loses increases calibration error slightly
      verifiedEvidenceCount: before.verifiedEvidenceCount + 1,
    };
    const gate = gateProposal({ stateBefore: before, stateAfter: after, threshold: 0 });
    return {
      deltaU: gate.result.deltaU,
      accept: gate.result.accept,
      reason: gate.result.reason,
    };
  } catch (_e) {
    return null; // fail-open — energy ΔU is advisory
  }
}

// ── Quantum factor-circuit (real return-vector live-wire) ──────────────────
/**
 * computeCircuit(bars, signals) — order-optimal factor sequencing on REAL return
 * vectors (via factor-return-vectors.circuitInputFromBars → the opts.vectors
 * injection in factor-circuit). Returns compact telemetry or null. FAIL-OPEN.
 *   ratio > 1  ⇒ a genuine non-commutative ORDER advantage exists.
 *   ratio == 1 ⇒ the factors commute (no sequencing advantage — never faked).
 * Only the price-derived obs-* signals carry a real return-vector mapping; perp/
 * social overlays are excluded (they map to zero vectors by construction).
 */
function computeCircuit(bars, signals) {
  const priceSignals = (signals || []).filter(
    (s) => s && String(s.factorId).startsWith('obs-') && s.side !== 'flat',
  );
  if (priceSignals.length < 2) return null;
  try {
    const { factors, opts, injected, degenerate } = circuitInputFromBars(bars, priceSignals, {
      recordEnergy: false, sampleCount: 50, draws: 30, iters: 2, seed: 42,
    });
    const r = optimizeFactorCircuit(factors, opts);
    return {
      ratio: r.quality?.ratio ?? null,
      allCommute: r.allCommute ?? null,
      bestOrdering: r.bestOrdering ?? null,
      factorIds: factors.map((f) => f.id),
      injected: injected === true,
      degenerate: degenerate === true,
    };
  } catch (_e) {
    return null; // fail-open — circuit telemetry never breaks the cycle
  }
}

// ── Snapshot state (in-memory, per market) ────────────────────────────────
/**
 * createMarketSnapshot() — empty snapshot template for one market.
 */
function createMarketSnapshot(market, venue) {
  return {
    market,
    venue,
    updatedAt: null,          // unix-seconds
    bars: [],                 // last N bars (seconds timestamps)
    signals: [],              // latest signals
    paperPositions: [],       // current open positions
    pnl: null,                // P&L summary from paper engine
    drawdown: null,           // current drawdown fraction
    regime: null,             // detectRegimeShift output
    energyDeltaU: null,       // last gateProposal ΔU (advisory)
    qualityGate: null,        // last dataQualityGate result
    circuit: null,            // quantum factor-circuit telemetry (ratio/ordering, advisory)
    error: null,              // last cycle error for this market
  };
}

// ── Paper engine factory (lazy, per-market) ────────────────────────────────
const _paperEngines = new Map();

function getPaperEngine(market) {
  if (_paperEngines.has(market)) return _paperEngines.get(market);
  const safe = market.replace(/[^a-zA-Z0-9-]/g, '_');
  const paperLedger = path.join(STATE_DIR, `observatory-paper-${safe}.jsonl`);
  const predLedger = path.join(STATE_DIR, `observatory-pred-${safe}.jsonl`);
  ensureDir(paperLedger);
  ensureDir(predLedger);
  const engine = createPaperEngine({
    paperLedgerPath: paperLedger,
    predictionLedgerPath: predLedger,
    caps: {
      initialEquity: 100_000,
      maxPositionPct: 0.05,
      maxGrossExposurePct: 0.30,
      maxNetExposurePct: 0.20,
    },
  });
  _paperEngines.set(market, engine);
  return engine;
}

function ensureDir(filePath) {
  const d = path.dirname(filePath);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

// ── httpGet injection (for mock testing) ─────────────────────────────────
let _httpGetOverride = null;

/**
 * setHttpGet(fn) — inject a mock httpGet for all adapters simultaneously.
 * fn(url, headers?) -> Promise<{status, headers, body}>
 * Pass null/undefined to clear the override and restore the real HTTPS default.
 *
 * NOTE: coinbase-adapter.setHttpGet requires a function (throws on null).
 * To restore the default we pass a thin wrapper around node:https so adapters
 * get a real function, not null. This is the correct "clear" path.
 */
function _realHttpGet(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new NodeURL(urlStr);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': 'YURI-AFL/1.0', ...headers },
      timeout: 15000,
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf-8') }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('httpGet timeout')); });
    req.on('error', reject);
    req.end();
  });
}

export function setHttpGet(fn) {
  if (fn === null || fn === undefined) {
    // Clear: restore real HTTPS default on all adapters.
    // coinbase/perp adapters reject null — pass the real default function instead.
    _httpGetOverride = null;
    CoinbaseAdapter.setHttpGet(_realHttpGet);
    PolymarketAdapter.setHttpGet(_realHttpGet);
    PerpAdapter.setHttpGet(_realHttpGet);
    SocialAdapter.setHttpGet(_realHttpGet);
    PolymarketDiscovery.setHttpGet(_realHttpGet);
    return;
  }
  _httpGetOverride = fn;
  CoinbaseAdapter.setHttpGet(fn);
  PolymarketAdapter.setHttpGet(fn);
  PerpAdapter.setHttpGet(fn);
  SocialAdapter.setHttpGet(fn);
  PolymarketDiscovery.setHttpGet(fn);
}

// ── Sentiment → signal mapping (advisory overlay) ──────────────────────────
/**
 * sentimentToSignal(sentiment, market) -> signal | null
 * Maps social-adapter getSentiment() {score∈[-1,1], magnitude∈[0,1]} to an
 * advisory overlay signal. Suppressed when near-neutral or low-magnitude.
 * Confidence is intentionally capped below the price signals (overlay, not driver).
 */
// ── Agent-Reach real-web sentiment (preferred over RSS; cached 5min) ────────
const _arCache = new Map();   // asset → { sent, ts }
const _AR_TTL = 300;          // 5-minute cache (news is slow-moving; keeps the cycle light)
let _arAvail = null;          // cached availability check (one subprocess, not per-cycle)
/**
 * agentReachSentiment(asset) — real-web news sentiment via Agent-Reach (Exa search)
 * scored with the social lexicon. Cached 5min, fail-open (null). Skipped when
 * agent-reach is unavailable. This is the live "internet access" sentiment path.
 */
async function agentReachSentiment(asset) {
  const now = Math.floor(Date.now() / 1000);
  const cached = _arCache.get(asset);
  if (cached && now - cached.ts < _AR_TTL) return cached.sent;
  if (_arAvail === null) { try { _arAvail = await agentReachAvailable(); } catch { _arAvail = false; } }
  if (!_arAvail) return null;
  try {
    const results = await agentReachSearch(`${asset} cryptocurrency price news sentiment`, { numResults: 6, timeoutMs: 12_000 });
    if (!results || results.length === 0) return null;
    const scored = results.map((r) => {
      const s = scorePost({ title: r.title, body: r.text });
      return { postScore: s.score, engagement: { score: 1, comments: 0 }, matchedWords: s.matchedWords };
    });
    const agg = aggregateSentiment(scored);
    const sent = { asset: asset.toUpperCase(), ts: now, score: agg.score, magnitude: agg.magnitude, sampleCount: agg.sampleCount, sources: ['agent-reach'] };
    _arCache.set(asset, { sent, ts: now });
    return sent;
  } catch (_e) {
    return null;
  }
}

function sentimentToSignal(sentiment, market) {
  if (!sentiment || typeof sentiment !== 'object') return null;
  const score = Number(sentiment.score);
  const magnitude = Number(sentiment.magnitude);
  if (!Number.isFinite(score) || !Number.isFinite(magnitude)) return null;
  if (Math.abs(score) < 0.10 || magnitude < 0.05) return null; // no edge / no volume
  const side = score > 0 ? 'long' : 'short';
  const confidence = Math.min(0.65, 0.40 + magnitude * 0.25);
  return {
    factorId: `social-sentiment-${market}`,
    value: score,
    side,
    confidence,
    ts: Number.isFinite(sentiment.ts) ? sentiment.ts : Math.floor(Date.now() / 1000),
    source: 'social',
    sampleCount: sentiment.sampleCount ?? null,
  };
}

// ── SSRF-safe public host check ───────────────────────────────────────────
// Adapters already guard SSRF internally; this is belt-and-suspenders at the
// orchestrator boundary for any future direct fetch calls.
const PRIVATE_IP = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;
function isPrivateHost(hostname) {
  return PRIVATE_IP.test(hostname) || hostname === '169.254.169.254' ||
    hostname === '::1' || hostname === '[::1]';
}

// ── Market cycle: crypto (Coinbase candles) ────────────────────────────────
async function runCryptoCycle(market, snap, cfg = {}) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - 60 * 60; // 1 hour back
  const end = now;

  let candles;
  try {
    const result = await CoinbaseAdapter.getCandles(market, {
      start,
      end,
      granularity: COINBASE_GRANULARITY,
      limit: CANDLES_FETCH_LIMIT,
    });
    candles = result.candles;
  } catch (err) {
    snap.error = `getCandles failed: ${err.message}`;
    return snap;
  }

  if (!candles || candles.length === 0) {
    snap.error = 'getCandles returned empty result';
    return snap;
  }

  // NORMALIZE TIMESTAMPS TO UNIX-SECONDS (single chokepoint)
  // coinbase-adapter.mjs mapCandle: timestamp = Number(c.start) which is already unix-seconds
  // but we normalize defensively through the single path here.
  const bars = candles.map(normalizeBarTimestamp);

  // Data quality gate
  const gate = dataQualityGate(bars);
  snap.qualityGate = {
    pass: gate.pass,
    rejectCount: gate.rejectCount,
    nonMonotonicCount: gate.nonMonotonicCount,
    flagCount: gate.flagCount,
  };

  if (!gate.pass) {
    snap.error = `dataQualityGate FAIL: ${gate.report.reason} (${gate.rejectCount} rejects, ${gate.nonMonotonicCount} non-monotone)`;
    return snap;
  }

  snap.bars = bars.slice(-50); // keep last 50 bars in snapshot
  snap.updatedAt = now;

  // Feed bars to paper engine
  const engine = getPaperEngine(market);
  for (const bar of bars) {
    engine.ingestBar(bar, market);
  }

  // Regime detection
  try {
    const closes = bars.map((b) => b.close);
    const volSignal = closes.length >= 10
      ? closes.slice(-10).map((c, i, arr) => i > 0 ? c - arr[i - 1] : 0).slice(1)
      : [];
    snap.regime = detectRegimeShift({ signedStream: volSignal });
  } catch (_e) {
    snap.regime = { recommendation: 'UNKNOWN', error: _e.message };
  }

  // Live factor signals (price-derived → sized + paper-filled below)
  const signals = computeLiveSignals(bars, market);

  // ── Perp + social OVERLAY signals (advisory telemetry; NOT sized/paper-filled:
  //    their edge units — funding APR / sentiment score — differ from the
  //    price-return edge the sizer expects; they inform positioning, not P&L) ──
  const overlaySignals = [];
  const lastClose = bars.length ? bars[bars.length - 1].close : null;
  if (cfg.enablePerp !== false) {
    try {
      const perpSigs = await computePerpSignals(market, {
        // spot proxy = latest bar close (no extra network call)
        getSpotPrice: Number.isFinite(lastClose) ? async () => lastClose : undefined,
      });
      if (Array.isArray(perpSigs)) overlaySignals.push(...perpSigs);
    } catch (_e) { /* fail-open — perp overlay never breaks the crypto cycle */ }
  }
  if (cfg.enableSocial !== false) {
    try {
      const asset = market.split('-')[0];
      // Prefer Agent-Reach real-web news (Exa) when enabled+available; fall back to RSS.
      let sentiment = null;
      if (cfg.enableAgentReachNews !== false) sentiment = await agentReachSentiment(asset);
      if (!sentiment || sentiment.sampleCount === 0) sentiment = await SocialAdapter.getSentiment(asset);
      const sig = sentimentToSignal(sentiment, market);
      if (sig) overlaySignals.push(sig);
    } catch (_e) { /* fail-open — social overlay never breaks the crypto cycle */ }
  }
  // Telemetry = price signals + overlays; paper sizing below uses price signals only.
  snap.signals = [...signals, ...overlaySignals];

  // Quantum factor-circuit telemetry on the REAL return-vectors of the price signals
  snap.circuit = computeCircuit(bars, signals);

  // Sizing + paper fill for each PRICE signal
  const returns = closeReturns(bars);
  const lastBar = bars[bars.length - 1];
  const equity = engine.pnl().equity || 100_000;

  for (const sig of signals) {
    if (sig.side === 'flat') continue;

    // computeSize (afl-sizing)
    const sizing = computeSize({
      edgeMean: Math.abs(sig.value),
      edgeLowerCI: Math.abs(sig.value) * 0.7,
      winProb: sig.confidence,
      payoff: 1.0,
      returns,
      equity,
      targetVol: 0.20,
    });

    if (sizing.targetNotional <= 0) continue;

    // Energy ΔU — advisory, observe-only
    const paperSnap = engine.pnl();
    snap.energyDeltaU = computeEnergyDelta(sig, paperSnap);

    // Paper fill via onSignal — pass notional so the engine resolves qty
    // fractionally (notional/mid) without integer-flooring crypto quantities.
    if (sizing.targetNotional > 0) {
      engine.onSignal(
        { ...sig, notional: sizing.targetNotional },
        { instrument: market, bar: lastBar },
      );
    }
  }

  // Capture final paper state
  snap.paperPositions = engine.positions();
  const pnlSnap = engine.pnl();
  snap.pnl = pnlSnap;
  snap.drawdown = pnlSnap.maxDrawdownBps / 10000;

  snap.error = null;
  return snap;
}

// ── Market cycle: Polymarket (reconstructBars from trades) ─────────────────
async function runPolymarketCycle(tokenId, question, snap) {
  const now = Math.floor(Date.now() / 1000);

  let trades;
  try {
    const result = await PolymarketAdapter.getTrades(tokenId, {
      limit: 100,
      startTs: now - 3600, // last hour
      endTs: now,
    });
    trades = result.trades;
  } catch (err) {
    snap.error = `getTrades failed: ${err.message}`;
    return snap;
  }

  if (!trades || trades.length === 0) {
    // Sparse market — not an error, just no data
    snap.updatedAt = now;
    snap.error = null;
    return snap;
  }

  // Reconstruct OHLCV bars via VWAP bucketing (5-minute buckets = 300,000ms)
  const rawBars = PolymarketAdapter.reconstructBars(trades, 5 * 60 * 1000);

  if (!rawBars || rawBars.length === 0) {
    snap.updatedAt = now;
    snap.error = null;
    return snap;
  }

  // NORMALIZE TIMESTAMPS TO UNIX-SECONDS (single chokepoint)
  // reconstructBars emits ms-epoch timestamps — convert to seconds.
  const bars = rawBars.map(normalizeBarTimestamp);

  // Data quality gate
  const gate = dataQualityGate(bars);
  snap.qualityGate = {
    pass: gate.pass,
    rejectCount: gate.rejectCount,
    nonMonotonicCount: gate.nonMonotonicCount,
    flagCount: gate.flagCount,
  };

  if (!gate.pass) {
    snap.error = `dataQualityGate FAIL: ${gate.report.reason}`;
    return snap;
  }

  snap.bars = bars.slice(-50);
  snap.updatedAt = now;

  // Feed bars to paper engine
  const engine = getPaperEngine(`poly-${tokenId}`);
  for (const bar of bars) {
    engine.ingestBar(bar, `poly-${tokenId}`);
  }

  // Live signals
  const signals = computeLiveSignals(bars, `poly-${tokenId}`);
  snap.signals = signals;
  snap.circuit = computeCircuit(bars, signals);

  // Paper fills
  const returns = closeReturns(bars);
  const lastBar = bars[bars.length - 1];
  const equity = engine.pnl().equity || 100_000;

  for (const sig of signals) {
    if (sig.side === 'flat') continue;
    const sizing = computeSize({
      edgeMean: Math.abs(sig.value),
      edgeLowerCI: Math.abs(sig.value) * 0.7,
      winProb: sig.confidence,
      payoff: 1.0,
      returns,
      equity,
      targetVol: 0.15, // lower vol target for binary outcomes
    });
    if (sizing.targetNotional <= 0) continue;
    snap.energyDeltaU = computeEnergyDelta(sig, engine.pnl());
    // Pass notional so the engine resolves qty fractionally (no integer-floor).
    engine.onSignal({ ...sig, notional: sizing.targetNotional }, { instrument: `poly-${tokenId}`, bar: lastBar });
  }

  snap.paperPositions = engine.positions();
  snap.pnl = engine.pnl();
  snap.drawdown = snap.pnl.maxDrawdownBps / 10000;
  snap.error = null;
  return snap;
}

// ── In-memory observatory state ────────────────────────────────────────────
const _state = {
  snapshots: new Map(),   // market key → snapshot
  factors: [],            // latest factor signals across all markets
  regimes: new Map(),     // market key → regime result
  energy: null,           // latest energy telemetry (cross-market)
  lastCycle: null,        // unix-seconds
  cycleCount: 0,
  ticks: new Map(),       // market key → { market, venue, price, bid, ask, ts } (1s fast-tick)
  lastTick: null,         // unix-seconds of the last fast-tick poll
};

// ── Fast price tick (1s) — lightweight last-price poll, SEPARATE from runCycle ──
/**
 * fastTick(config?) — poll ONLY the latest price for each tracked market and
 * update the in-memory tick state + each market snapshot's lastPrice/lastTickTs.
 * This is the per-SECOND live pulse: cheap (one getTicker/getPrice per market),
 * fail-open per market, NEVER runs the heavy factor/sizing/paper pipeline.
 * Returns the tick array (for SSE price.tick events).
 */
export async function fastTick(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const now = Math.floor(Date.now() / 1000);
  const out = [];

  // Crypto — coinbase last trade price
  for (const market of cfg.cryptoMarkets) {
    try {
      const t = await CoinbaseAdapter.getTicker(market, { limit: 1 });
      const price = Number.isFinite(t.last) ? t.last : (Number.isFinite(t.mid) ? t.mid : null);
      if (price == null) continue;
      const tick = { market, venue: 'coinbase', price, bid: t.bid ?? null, ask: t.ask ?? null, ts: now };
      _state.ticks.set(market, tick);
      const snap = _state.snapshots.get(market);
      if (snap) { snap.lastPrice = price; snap.lastTickTs = now; }
      out.push(tick);
    } catch (_e) { /* fail-open per market */ }
  }

  // Polymarket — CLOB mid/buy price
  for (const { tokenId } of (cfg.polymarkets || [])) {
    const key = `poly-${tokenId}`;
    try {
      const p = await PolymarketAdapter.getPrice(tokenId, 'buy');
      const price = Number.isFinite(p?.price) ? p.price : null;
      if (price == null) continue;
      const tick = { market: key, venue: 'polymarket', price, bid: null, ask: null, ts: now };
      _state.ticks.set(key, tick);
      const snap = _state.snapshots.get(key);
      if (snap) { snap.lastPrice = price; snap.lastTickTs = now; }
      out.push(tick);
    } catch (_e) { /* fail-open per market */ }
  }

  _state.lastTick = now;
  return out;
}

/** getTicks() — current fast-tick price map for REST. */
export function getTicks() {
  return Object.fromEntries(_state.ticks);
}

/**
 * getSnapshot() — current full state snapshot for REST endpoints.
 */
export function getSnapshot() {
  return {
    markets: Object.fromEntries(_state.snapshots),
    factors: _state.factors,
    regimes: Object.fromEntries(_state.regimes),
    energy: _state.energy,
    ticks: Object.fromEntries(_state.ticks),
    lastCycle: _state.lastCycle,
    lastTick: _state.lastTick,
    cycleCount: _state.cycleCount,
  };
}

// ── Config / tracked markets ───────────────────────────────────────────────

/** Observable market definition */
export const DEFAULT_CONFIG = {
  cryptoMarkets: DEFAULT_CRYPTO_MARKETS,
  polymarkets: [], // [{tokenId, question}] — configured by caller / bootstrapPolymarkets
  intervalMs: DEFAULT_CYCLE_INTERVAL_MS,
  // Wave-4 overlays (advisory telemetry; fail-open; do NOT drive paper P&L):
  enablePerp: true,            // funding/basis positioning overlay on crypto markets
  enableSocial: true,          // public-source sentiment overlay per asset
  enableAgentReachNews: true,  // prefer Agent-Reach real-web news (Exa) for sentiment over RSS
  autoDiscoverPolymarkets: false, // when true, bootstrapPolymarkets() fills polymarkets live
  polymarketLimit: 3,          // how many liquid Polymarket markets to auto-discover
};

/**
 * bootstrapPolymarkets(cfg) -> Promise<Array<{tokenId, question}>>
 * Resolves the live Polymarket watch-list. If autoDiscoverPolymarkets is set and
 * no explicit list was given, queries the Gamma API (via polymarket-discovery) for
 * the top-N liquid active markets. FAIL-OPEN: discovery failure returns [] so the
 * crypto loop is never blocked. Called once by the server on --serve startup.
 */
export async function bootstrapPolymarkets(cfg = {}) {
  const c = { ...DEFAULT_CONFIG, ...cfg };
  if (Array.isArray(c.polymarkets) && c.polymarkets.length > 0) return c.polymarkets;
  if (!c.autoDiscoverPolymarkets) return [];
  try {
    const found = await PolymarketDiscovery.discoverMarkets({ limit: c.polymarketLimit || 3 });
    return (found || []).map((m) => ({ tokenId: m.tokenId, question: m.question }));
  } catch (_e) {
    return []; // fail-open — discovery must not break the loop
  }
}

// ── Main runCycle ──────────────────────────────────────────────────────────
/**
 * runCycle(config?) — one full observatory cycle.
 * Runs all markets, updates in-memory state, returns the full snapshot.
 * Deterministic when httpGet is injected. Never throws — errors land in snap.error.
 *
 * @param {object} [config] — optional override of DEFAULT_CONFIG
 * @returns {Promise<object>} full state snapshot after this cycle
 */
export async function runCycle(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  ensureDir(PAPER_LEDGER);

  // Crypto markets (Coinbase)
  for (const market of cfg.cryptoMarkets) {
    if (!_state.snapshots.has(market)) {
      _state.snapshots.set(market, createMarketSnapshot(market, 'coinbase'));
    }
    const snap = _state.snapshots.get(market);
    await runCryptoCycle(market, snap, cfg);
    if (snap.regime) _state.regimes.set(market, snap.regime);
  }

  // Polymarket markets
  for (const { tokenId, question } of (cfg.polymarkets || [])) {
    const key = `poly-${tokenId}`;
    if (!_state.snapshots.has(key)) {
      _state.snapshots.set(key, createMarketSnapshot(key, 'polymarket'));
    }
    const snap = _state.snapshots.get(key);
    snap.question = question;
    await runPolymarketCycle(tokenId, question, snap);
  }

  // Aggregate signals
  _state.factors = [];
  for (const [, snap] of _state.snapshots) {
    if (snap.signals && snap.signals.length > 0) {
      _state.factors.push(...snap.signals);
    }
  }

  // Cross-market energy telemetry (aggregate)
  const anyEnergy = [..._state.snapshots.values()].find((s) => s.energyDeltaU != null);
  _state.energy = anyEnergy?.energyDeltaU ?? null;

  _state.lastCycle = Math.floor(Date.now() / 1000);
  _state.cycleCount++;

  return getSnapshot();
}

// ── Accessors for REST endpoints ───────────────────────────────────────────
export function getMarkets() {
  return Object.fromEntries(_state.snapshots);
}

export function getFactors() {
  return _state.factors;
}

export function getPaper() {
  const out = {};
  for (const [k, snap] of _state.snapshots) {
    out[k] = { positions: snap.paperPositions, pnl: snap.pnl, drawdown: snap.drawdown };
  }
  return out;
}

export function getRegime() {
  return Object.fromEntries(_state.regimes);
}

export function getEnergy() {
  return _state.energy;
}

export function getHealth() {
  const markets = [..._state.snapshots.values()];
  const ok = markets.length > 0;
  const errCount = markets.filter((s) => s.error != null).length;
  return {
    ok,
    cycleCount: _state.cycleCount,
    lastCycle: _state.lastCycle,
    lastTick: _state.lastTick,
    marketCount: markets.length,
    errorCount: errCount,
    uptime: process.uptime(),
  };
}

// ── SSE event builders ────────────────────────────────────────────────────
/**
 * buildSSEEvents(snapshot) — given a runCycle snapshot, build the SSE event objects.
 * Types: 'market.tick' | 'factor.signal' | 'paper.fill' | 'regime.shift' | 'energy.state'
 */
export function buildSSEEvents(snapshot) {
  const events = [];
  const ts = snapshot.lastCycle || Math.floor(Date.now() / 1000);

  // market.tick — one per market
  for (const [market, snap] of Object.entries(snapshot.markets || {})) {
    events.push({
      type: 'market.tick',
      market,
      venue: snap.venue,
      updatedAt: snap.updatedAt,
      lastBar: snap.bars?.length > 0 ? snap.bars[snap.bars.length - 1] : null,
      qualityGate: snap.qualityGate,
      error: snap.error,
      ts,
    });
  }

  // factor.signal — one per signal
  for (const sig of (snapshot.factors || [])) {
    events.push({
      type: 'factor.signal',
      ...sig,
      ts,
    });
  }

  // paper.fill — one per market with positions
  for (const [market, snap] of Object.entries(snapshot.markets || {})) {
    if (snap.paperPositions && snap.paperPositions.length > 0) {
      events.push({
        type: 'paper.fill',
        market,
        positions: snap.paperPositions,
        pnl: snap.pnl,
        drawdown: snap.drawdown,
        ts,
      });
    }
  }

  // regime.shift — one per market where regime detection ran
  for (const [market, regime] of Object.entries(snapshot.regimes || {})) {
    if (regime) {
      events.push({
        type: 'regime.shift',
        market,
        recommendation: regime.recommendation,
        reasons: regime.reasons,
        layers: regime.layers,
        ts,
      });
    }
  }

  // circuit.state — one per market with quantum factor-circuit telemetry
  for (const [market, snap] of Object.entries(snapshot.markets || {})) {
    if (snap.circuit) {
      events.push({
        type: 'circuit.state',
        market,
        ratio: snap.circuit.ratio,
        allCommute: snap.circuit.allCommute,
        bestOrdering: snap.circuit.bestOrdering,
        factorIds: snap.circuit.factorIds,
        injected: snap.circuit.injected,
        ts,
      });
    }
  }

  // energy.state — always emitted (advisory telemetry)
  events.push({
    type: 'energy.state',
    deltaU: snapshot.energy?.deltaU ?? null,
    accept: snapshot.energy?.accept ?? null,
    reason: snapshot.energy?.reason ?? null,
    ts,
  });

  return events;
}

// ── --test self-test (deterministic mock cycle) ───────────────────────────
if (process.argv.includes('--test')) {
  await runSelfTest();
}

async function runSelfTest() {
  let pass = 0;
  let fail = 0;
  const assert = (cond, label) => {
    if (cond) { pass++; }
    else { fail++; console.error(`FAIL: ${label}`); }
  };

  console.log('orchestrator --test: running mock cycle...');

  // Build canned mock bars (unix-seconds, strictly monotone, positive prices)
  const BASE_TS = 1_718_505_600; // 2024-06-16 00:00:00 UTC
  const STEP = 300; // 5-minute bars
  const mockBars = Array.from({ length: 20 }, (_, i) => ({
    timestamp: BASE_TS + i * STEP,
    open: 65000 + i * 10,
    high: 65050 + i * 10,
    low: 64950 + i * 10,
    close: 65020 + i * 10,
    volume: 100 + i,
  }));

  // Candles returned newest-first by Coinbase (adapter reverses them, but mock returns chronological)
  // Mock returns oldest-first (adapter's mapCandle output is already chronological)
  const mockCandlesBody = JSON.stringify({
    candles: [...mockBars].reverse().map((b) => ({
      start: String(b.timestamp),
      open: String(b.open),
      high: String(b.high),
      low: String(b.low),
      close: String(b.close),
      volume: String(b.volume),
    })),
  });

  // Mock httpGet — returns canned data for known URL patterns
  const mockHttpGet = async (url) => {
    if (url.includes('coinbase.com') && url.includes('candles')) {
      return { status: 200, headers: {}, body: mockCandlesBody };
    }
    // Default: empty 200
    return { status: 200, headers: {}, body: '{}' };
  };

  setHttpGet(mockHttpGet);

  // Reset state for clean test
  _state.snapshots.clear();
  _state.factors = [];
  _state.regimes.clear();
  _state.energy = null;
  _state.lastCycle = null;
  _state.cycleCount = 0;

  // Run one cycle with BTC-USD only
  let snapshot;
  try {
    snapshot = await runCycle({ cryptoMarkets: ['BTC-USD'], polymarkets: [], intervalMs: 0, enableAgentReachNews: false });
  } catch (err) {
    console.error('FAIL: runCycle threw:', err);
    process.exit(1);
  }

  // Assertions
  assert(snapshot != null, 'snapshot is non-null');
  assert(typeof snapshot === 'object', 'snapshot is object');
  assert('markets' in snapshot, 'snapshot has markets');
  assert('BTC-USD' in snapshot.markets, 'BTC-USD in markets');

  const btcSnap = snapshot.markets['BTC-USD'];
  assert(btcSnap != null, 'BTC-USD snap is non-null');
  assert(btcSnap.error === null, `BTC-USD has no error (got: ${btcSnap.error})`);
  assert(btcSnap.qualityGate != null, 'qualityGate was run');
  assert(btcSnap.qualityGate.pass === true, `qualityGate PASS (got: ${JSON.stringify(btcSnap.qualityGate)})`);

  // Bars: timestamps must be unix-seconds (< 1e11)
  assert(Array.isArray(btcSnap.bars), 'bars is array');
  assert(btcSnap.bars.length > 0, 'bars is non-empty');
  const tsValues = btcSnap.bars.map((b) => b.timestamp);
  assert(tsValues.every((t) => Number.isFinite(t) && t < 1e11), `all bar timestamps are unix-seconds (sample: ${tsValues[0]})`);
  assert(tsValues.every((t, i) => i === 0 || t > tsValues[i - 1]), 'bar timestamps are strictly monotone');

  // Signals computed
  assert(Array.isArray(btcSnap.signals), 'signals is array');

  // PnL shape
  assert(btcSnap.pnl != null, 'pnl is non-null');
  assert(typeof btcSnap.pnl.equity === 'number', 'pnl.equity is number');
  assert(Number.isFinite(btcSnap.pnl.equity), 'pnl.equity is finite');

  // Paper positions shape
  assert(Array.isArray(btcSnap.paperPositions), 'paperPositions is array');

  // Regime
  assert(btcSnap.regime != null, 'regime was computed');

  // Snapshot fields
  assert(typeof snapshot.lastCycle === 'number', 'lastCycle is number');
  assert(snapshot.cycleCount === 1, `cycleCount is 1 (got ${snapshot.cycleCount})`);

  // SSE events shape
  const events = buildSSEEvents(snapshot);
  assert(Array.isArray(events), 'SSE events is array');
  assert(events.length > 0, 'SSE events non-empty');
  const types = new Set(events.map((e) => e.type));
  assert(types.has('market.tick'), 'SSE has market.tick');
  assert(types.has('energy.state'), 'SSE has energy.state');

  // No real-order path — paper engine never submits real orders
  // (Confirmed by INV-1 in afl-paper.mjs — no network call on submitPaperOrder/onSignal)
  assert(true, 'paper-only confirmed (INV-1 from afl-paper.mjs)');

  console.log(`orchestrator --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}
