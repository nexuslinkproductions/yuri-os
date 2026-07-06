#!/usr/bin/env node
/**
 * Tests for afl-paper.mjs PERP MODE (Binance USDⓈ-M leveraged training).
 *
 * Phase 2 build:
 *   [2a] binanceFeeModel — base/tier rates, maker<<taker, env override
 *   [2b] liquidationPrice formula + engine perpMode: leverage cap, liqPx recorded, liquidation on mark
 *
 * Default (non-perp) behavior is unchanged — covered by the inline suite (node afl-paper.mjs --test, 41/0).
 *
 * Run: node --test _SYSTEM/Scripts/alpha-factor-library/afl-paper-perp.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { binanceFeeModel, liquidationPrice, createPaperEngine } from './afl-paper.mjs';

// ── helpers ──────────────────────────────────────────────────────────────────
let _n = 0;
function makeEngine(caps = {}) {
  _n += 1;
  return createPaperEngine({
    paperLedgerPath: `/tmp/afl-perp-paper-${process.pid}-${_n}.jsonl`,
    predictionLedgerPath: `/tmp/afl-perp-pred-${process.pid}-${_n}.jsonl`,
    feeModel: binanceFeeModel('taker'),
    caps,
  });
}
function mkBars(px, n = 6, ts0 = 1000) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push({ timestamp: ts0 + i * 60, open: px, high: px * 1.001, low: px * 0.999, close: px, volume: 100 });
  }
  return out;
}

// ── [2a] binanceFeeModel ─────────────────────────────────────────────────────

test('binanceFeeModel base tier (VIP0) = 0.020% maker / 0.050% taker', () => {
  assert.equal(binanceFeeModel('maker')('binance', 100, 100), 2); // 10,000 × 0.0002
  assert.equal(binanceFeeModel('taker')('binance', 100, 100), 5); // 10,000 × 0.0005
});

test('binanceFeeModel: maker far cheaper than taker, both far below Coinbase 0.6% taker', () => {
  const m = binanceFeeModel('maker')('binance', 1000, 10);
  const t = binanceFeeModel('taker')('binance', 1000, 10);
  assert.ok(m < t);
  assert.equal(m, 2);
  assert.equal(t, 5);
  assert.ok(t < 60); // vs $60 at the old Coinbase 0.6% taker on 10k
});

test('binanceFeeModel: rates decrease with 30d volume tier', () => {
  const base = binanceFeeModel('taker', 0)('binance', 100, 100);
  const vip3 = binanceFeeModel('taker', 200_000_000)('binance', 100, 100);
  assert.ok(vip3 < base);
});

test('binanceFeeModel: env override OBSERVATORY_FEE_TAKER calibrates the rate', () => {
  process.env.OBSERVATORY_FEE_TAKER = '0.001';
  try {
    assert.equal(binanceFeeModel('taker')('binance', 100, 100), 10);
  } finally {
    delete process.env.OBSERVATORY_FEE_TAKER;
  }
});

test('binanceFeeModel: zero fee on non-numeric input', () => {
  assert.equal(binanceFeeModel('taker')('binance', NaN, 100), 0);
  assert.equal(binanceFeeModel('maker')('binance', 100, undefined), 0);
});

// ── [2b] liquidationPrice (pure) ─────────────────────────────────────────────

test('liquidationPrice matches Binance worked examples (isolated, Tier-1 MMR 0.4%)', () => {
  assert.ok(Math.abs(liquidationPrice('long', 60000, 20, 0.004) - 57228.92) < 1, 'long 20x ≈ 57229 (−4.62%)');
  assert.ok(Math.abs(liquidationPrice('long', 60000, 50, 0.004) - 59036.14) < 1, 'long 50x ≈ 59036 (−1.61%)');
  assert.ok(Math.abs(liquidationPrice('long', 60000, 10, 0.004) - 54216.87) < 1, 'long 10x ≈ 54217 (−9.64%)');
  assert.ok(Math.abs(liquidationPrice('short', 60000, 20, 0.004) - 62749.00) < 1, 'short 20x ≈ 62749');
});

test('liquidationPrice: null at ≤1× (no liquidation) and on bad input', () => {
  assert.equal(liquidationPrice('long', 60000, 1, 0.004), null);
  assert.equal(liquidationPrice('long', 0, 20, 0.004), null);
  assert.equal(liquidationPrice('long', 60000, NaN, 0.004), null);
});

// ── [2b] engine perpMode ─────────────────────────────────────────────────────

test('perpMode: a leveraged long records leverage + a liquidation price below entry', () => {
  const eng = makeEngine({ initialEquity: 300, perpMode: true, leverage: 20, maxPositionPct: 1, maxGrossExposurePct: 5, maxNetExposurePct: 5, minNotional: 0.5 });
  const bars = mkBars(60000);
  for (const b of bars) eng.ingestBar(b, 'BTCUSDT');
  eng.onSignal({ factorId: 'f', ts: 1400, value: 1, side: 'long', confidence: 0.9, notional: 200 }, { instrument: 'BTCUSDT', barHistory: bars });
  const pos = eng.positions()[0];
  assert.ok(pos, 'position opened');
  assert.equal(pos.leverage, 20);
  assert.ok(pos.liquidationPrice > 0 && pos.liquidationPrice < pos.avgEntryPrice, 'long liq below entry');
  assert.ok(pos.liquidationPrice > 56000 && pos.liquidationPrice < 58000, `liq ~57229, got ${pos.liquidationPrice}`);
});

test('perpMode: leverage allows notional ABOVE account equity', () => {
  const eng = makeEngine({ initialEquity: 100, perpMode: true, leverage: 20, maxPositionPct: 0.5, maxGrossExposurePct: 0.5, maxNetExposurePct: 0.5, minNotional: 0.5 });
  const bars = mkBars(60000);
  for (const b of bars) eng.ingestBar(b, 'BTCUSDT');
  // 800 notional on 100 equity — only possible with leverage (cap = 0.5×100×20 = 1000)
  eng.onSignal({ factorId: 'f', ts: 1400, value: 1, side: 'long', confidence: 0.9, notional: 800 }, { instrument: 'BTCUSDT', barHistory: bars });
  const pos = eng.positions()[0];
  assert.ok(pos, 'leveraged position opened');
  assert.ok(pos.quantity * pos.avgEntryPrice > 100, `notional ${pos.quantity * pos.avgEntryPrice} should exceed equity 100`);
});

test('perpMode: position is LIQUIDATED when mark crosses the liquidation price', () => {
  const eng = makeEngine({ initialEquity: 300, perpMode: true, leverage: 20, maxPositionPct: 1, maxGrossExposurePct: 5, maxNetExposurePct: 5, minNotional: 0.5 });
  const bars = mkBars(60000);
  for (const b of bars) eng.ingestBar(b, 'BTCUSDT');
  eng.onSignal({ factorId: 'f', ts: 1400, value: 1, side: 'long', confidence: 0.9, notional: 200 }, { instrument: 'BTCUSDT', barHistory: bars });
  const liqPx = eng.positions()[0].liquidationPrice;
  eng.mark(1460, { 'BTCUSDT': liqPx - 100 }); // mark drops below liq
  assert.equal(eng.positions().length, 0, 'position liquidated (gone)');
  assert.ok(eng.pnl().grossRealizedPnl < 0, 'liquidation realized a loss');
});

test('non-perp (default): no liquidation price + spot position NOT liquidated on a deep drop', () => {
  const eng = makeEngine({ initialEquity: 300, maxPositionPct: 1, maxGrossExposurePct: 5, maxNetExposurePct: 5, minNotional: 0.5 });
  const bars = mkBars(60000);
  for (const b of bars) eng.ingestBar(b, 'BTCUSDT');
  eng.onSignal({ factorId: 'f', ts: 1400, value: 1, side: 'long', confidence: 0.9, notional: 200 }, { instrument: 'BTCUSDT', barHistory: bars });
  const pos = eng.positions()[0];
  assert.equal(pos.liquidationPrice, null);
  assert.equal(pos.leverage, 1);
  eng.mark(1460, { 'BTCUSDT': 30000 }); // −50% — spot has no liquidation, just unrealized loss
  assert.equal(eng.positions().length, 1, 'spot position survives (no liquidation)');
});
