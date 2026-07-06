#!/usr/bin/env node
// @capability: perp-signals
// @serves: perp derived signals | funding carry signal | basis carry | crypto perpetuals factor overlay | observatory perp tilt
// @does: Turns the READ-ONLY perp-adapter's funding-rate + basis snapshots into bounded, advisory AFL signal objects (the same {factorId,value,side,confidence,ts} shape the observatory orchestrator already consumes), so the live crypto cycle gets a perp-positioning overlay on top of the OHLCV momentum/vol signals. Fail-open: any fetch/mapping error yields [] (the crypto cycle keeps running). Pure signal mappers are exported for unit test; the one network-bound entry (computePerpSignals) routes entirely through perp-adapter.setHttpGet.
// @use: Reach for this in the observatory crypto cycle (or any AFL loop) when you want funding/basis to TILT a crypto signal set without hard-coupling to Binance or adding an order path. Conventions are the established carry/contrarian ones (crowded-long funding fades; basis sign = leverage positioning) and are intentionally LOW-confidence (advisory overlay, never dominates price signals).
// @exports: cryptoMarketToPerpSymbol, fundingToSignal, basisToSignal, computePerpSignals, DEFAULT_FUNDING_APR_THRESHOLD, DEFAULT_BASIS_BPS_THRESHOLD
//
// CONSTRAINTS (master-brief §4): paper-only (INV-1 — no order path here, only reads via the adapter),
// no key reads (INV-2 — adapter is keyless), live reads OK (INV-3). Deterministic + offline-testable
// (all network through perp-adapter.setHttpGet). No new npm dep.

import * as PerpAdapter from './adapters/perp-adapter.mjs';
import { pathToFileURL } from 'node:url';

// Funding APR (annualized) magnitude beyond which we treat positioning as crowded.
// 0.10 = 10% APR. Below this the funding signal is suppressed (no edge / noise).
export const DEFAULT_FUNDING_APR_THRESHOLD = 0.10;
// Basis in bps beyond which the perp/spot dislocation is treated as a positioning tilt.
export const DEFAULT_BASIS_BPS_THRESHOLD = 25; // 0.25%

/**
 * cryptoMarketToPerpSymbol(market) -> string | null
 * Map a Coinbase-style crypto market ('BTC-USD') to a Binance USDⓈ-M perp symbol
 * ('BTCUSDT'). USD and USDC quote both map to USDT (the liquid perp quote).
 * Returns null for anything that doesn't look like a `<BASE>-<QUOTE>` crypto pair.
 */
export function cryptoMarketToPerpSymbol(market) {
  if (!market || typeof market !== 'string') return null;
  const parts = market.split('-');
  if (parts.length !== 2) return null;
  const [base, quote] = parts;
  if (!base || !quote) return null;
  if (!/^[A-Z0-9]{2,10}$/i.test(base)) return null;
  // USD / USDC / USDT quotes → the liquid USDT perp.
  if (!/^(USD|USDC|USDT)$/i.test(quote)) return null;
  return `${base.toUpperCase()}USDT`;
}

/**
 * fundingToSignal(annualizedFundingApr, market, ts) -> signal | null
 * CARRY/CONTRARIAN convention: persistently positive funding = longs paying shorts
 * = crowded long → fade (short bias) AND earn carry by being short the perp.
 * Strongly negative funding = crowded short → long bias. Below the threshold → null
 * (no edge). Confidence is intentionally modest (advisory overlay).
 */
export function fundingToSignal(annualizedFundingApr, market, ts, opts = {}) {
  const apr = Number(annualizedFundingApr);
  if (!Number.isFinite(apr)) return null;
  const threshold = Number.isFinite(opts.fundingThreshold) ? opts.fundingThreshold : DEFAULT_FUNDING_APR_THRESHOLD;
  if (Math.abs(apr) < threshold) return null;
  // Crowded long (apr>0) → short; crowded short (apr<0) → long.
  const side = apr > 0 ? 'short' : 'long';
  // Confidence: scale magnitude above threshold, capped well below price-signal confidence.
  const excess = Math.abs(apr) - threshold;
  const confidence = Math.min(0.70, 0.45 + excess * 0.8);
  return {
    factorId: `perp-funding-carry-${market}`,
    value: apr,
    side,
    confidence,
    ts,
    source: 'perp',
  };
}

/**
 * basisToSignal(basisBps, market, ts) -> signal | null
 * Basis = perp price - spot price (in bps). Positive basis (contango) reflects
 * leverage / long demand → mild long-positioning tilt; negative basis
 * (backwardation) → short tilt. Informational, LOW confidence. Below threshold → null.
 */
export function basisToSignal(basisBps, market, ts, opts = {}) {
  const bps = Number(basisBps);
  if (!Number.isFinite(bps)) return null;
  const threshold = Number.isFinite(opts.basisThreshold) ? opts.basisThreshold : DEFAULT_BASIS_BPS_THRESHOLD;
  if (Math.abs(bps) < threshold) return null;
  const side = bps > 0 ? 'long' : 'short';
  const excess = Math.abs(bps) - threshold;
  const confidence = Math.min(0.60, 0.40 + (excess / 100) * 0.5);
  return {
    factorId: `perp-basis-${market}`,
    value: bps,
    side,
    confidence,
    ts,
    source: 'perp',
  };
}

/**
 * computePerpSignals(cryptoMarket, opts?) -> Promise<signal[]>
 * Fetches the perp funding snapshot (and, when a spot-price getter is injected,
 * the basis) for the perp symbol mapped from `cryptoMarket`, and returns 0-2
 * advisory signals. FAIL-OPEN: on any error returns [] so the crypto cycle is
 * never broken by a perp hiccup.
 *
 * @param {string} cryptoMarket  e.g. 'BTC-USD'
 * @param {object} [opts]
 *   - getSpotPrice: async (perpSymbol) => number   (enables the basis signal)
 *   - fundingThreshold, basisThreshold: override the suppression thresholds
 *   - periodsPerYear: funding annualization periods (default 1095 = 8h funding)
 */
export async function computePerpSignals(cryptoMarket, opts = {}) {
  const symbol = cryptoMarketToPerpSymbol(cryptoMarket);
  if (!symbol) return [];
  const signals = [];
  let ts = Math.floor(Date.now() / 1000);

  // Funding (always attempted — keyless snapshot)
  try {
    const funding = await PerpAdapter.getFunding(symbol);
    if (funding && funding.timestamp != null) ts = Math.floor(Number(funding.timestamp) / 1000) || ts;
    const apr = PerpAdapter.annualizeFunding(
      funding?.fundingRate,
      Number.isFinite(opts.periodsPerYear) ? opts.periodsPerYear : undefined,
    );
    const sig = fundingToSignal(apr, cryptoMarket, ts, opts);
    if (sig) signals.push(sig);
  } catch (_e) {
    // fail-open — funding unavailable this cycle
  }

  // Basis (only if a spot-price getter is injected — avoids hard-coupling)
  if (typeof opts.getSpotPrice === 'function') {
    try {
      const basis = await PerpAdapter.getBasis(symbol, { getSpotPrice: opts.getSpotPrice });
      if (basis && basis.basisBps != null) {
        const sig = basisToSignal(basis.basisBps, cryptoMarket, ts, opts);
        if (sig) signals.push(sig);
      }
    } catch (_e) {
      // fail-open — basis unavailable (e.g. spot getter failed)
    }
  }

  return signals;
}

// ── --test self-test (deterministic, injected httpGet) ──────────────────────
const _runAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_runAsMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const assert = (c, label) => { if (c) pass++; else { fail++; console.error(`FAIL: ${label}`); } };

  // symbol mapping
  assert(cryptoMarketToPerpSymbol('BTC-USD') === 'BTCUSDT', 'BTC-USD -> BTCUSDT');
  assert(cryptoMarketToPerpSymbol('ETH-USDC') === 'ETHUSDT', 'ETH-USDC -> ETHUSDT (USDC->USDT)');
  assert(cryptoMarketToPerpSymbol('poly-0xabc') === null, 'non-crypto -> null');
  assert(cryptoMarketToPerpSymbol('BTC-EUR') === null, 'non-USD quote -> null');
  assert(cryptoMarketToPerpSymbol(null) === null, 'null -> null');

  // fundingToSignal conventions
  const sLong = fundingToSignal(-0.30, 'BTC-USD', 100);
  assert(sLong && sLong.side === 'long', 'crowded short (neg funding) -> long');
  const sShort = fundingToSignal(0.30, 'BTC-USD', 100);
  assert(sShort && sShort.side === 'short', 'crowded long (pos funding) -> short');
  assert(fundingToSignal(0.02, 'BTC-USD', 100) === null, 'sub-threshold funding -> null');
  assert(fundingToSignal(NaN, 'BTC-USD', 100) === null, 'NaN funding -> null');
  assert(sShort.confidence <= 0.70, 'funding confidence capped <= 0.70');
  assert(sShort.value === 0.30 && sShort.ts === 100, 'funding signal carries value+ts');

  // basisToSignal conventions
  const bLong = basisToSignal(120, 'BTC-USD', 100);
  assert(bLong && bLong.side === 'long', 'positive basis (contango) -> long');
  const bShort = basisToSignal(-120, 'BTC-USD', 100);
  assert(bShort && bShort.side === 'short', 'negative basis (backwardation) -> short');
  assert(basisToSignal(5, 'BTC-USD', 100) === null, 'sub-threshold basis -> null');
  assert(basisToSignal(Infinity, 'BTC-USD', 100) === null, 'Inf basis -> null');
  assert(bLong.confidence <= 0.60, 'basis confidence capped <= 0.60');

  // computePerpSignals end-to-end with injected mock httpGet (Binance premiumIndex)
  await (async () => {
    const fundingTime = 1_718_505_600_000; // ms
    const mockHttpGet = async (url) => {
      if (url.includes('premiumIndex')) {
        return { status: 200, headers: {}, body: JSON.stringify({
          symbol: 'BTCUSDT', markPrice: '65000.0', indexPrice: '64980.0',
          lastFundingRate: '0.0005', time: fundingTime, // 0.05% per 8h => ~54.75% APR
        }) };
      }
      return { status: 200, headers: {}, body: '{}' };
    };
    PerpAdapter.setHttpGet(mockHttpGet);
    const sigs = await computePerpSignals('BTC-USD');
    assert(Array.isArray(sigs), 'computePerpSignals returns array');
    assert(sigs.length === 1, `funding-only path -> 1 signal (got ${sigs.length})`);
    assert(sigs[0].factorId === 'perp-funding-carry-BTC-USD', 'funding factorId correct');
    assert(sigs[0].side === 'short', 'high positive funding (0.05%/8h ~55% APR) -> short (crowded long)');
    assert(sigs[0].ts === Math.floor(fundingTime / 1000), 'ts normalized to seconds');

    // basis path enabled by injecting a spot getter
    const sigs2 = await computePerpSignals('BTC-USD', { getSpotPrice: async () => 64000 });
    // mark 65000 vs spot 64000 => basis +1000 => basisBps ~ +156 (contango) -> long
    const basisSig = sigs2.find((s) => s.factorId === 'perp-basis-BTC-USD');
    assert(basisSig != null, 'basis signal present when spot getter injected');
    assert(basisSig.side === 'long', 'mark>spot (contango) -> long basis tilt');

    // fail-open: 500 from venue -> [] not throw
    PerpAdapter.setHttpGet(async () => ({ status: 500, headers: {}, body: 'err' }));
    const sigs3 = await computePerpSignals('BTC-USD');
    assert(Array.isArray(sigs3) && sigs3.length === 0, 'venue 500 -> [] (fail-open, no throw)');
  })();

  console.log(`perp-signals --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}
