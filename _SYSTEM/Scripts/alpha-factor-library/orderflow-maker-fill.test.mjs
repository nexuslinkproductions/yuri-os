// Hermetic tests for orderflow-maker-fill.mjs — synthetic books only, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makerFillDecision, DEFAULT_FEES } from './orderflow-maker-fill.mjs';

// Synthetic BTCUSDT-scale book helper. tick=0.1 like the real venue.
function makeBook({ bid = 62000.0, ask = 62001.0, bidSize = 5, askSize = 5, spreadBps } = {}) {
  const mid = (bid + ask) / 2;
  return {
    bids: [[bid, bidSize]],
    asks: [[ask, askSize]],
    mid,
    spreadBps: spreadBps ?? ((ask - bid) / mid) * 1e4,
  };
}

test('(a) wide spread + low urgency -> mode maker, feeType maker', () => {
  // BTC book with a wide 20bps spread (bid 62000 / ask 62124 ≈ 20bps) — well above the 2x maker
  // fee floor (2*0.0002*1e4 = 4bps) and the 1bps minSpreadBps default.
  const bid = 62000, ask = 62000 * 1.002; // ~20bps spread
  const book = makeBook({ bid, ask, bidSize: 5, askSize: 5 });
  const d = makerFillDecision(
    { side: 'buy', book, urgency: 0.1, queueState: { queueAhead: 1, levelDepth: 5 } },
  );
  assert.equal(d.mode, 'maker');
  assert.equal(d.feeType, 'maker');
  assert.ok(d.expectedFillProb > 0 && d.expectedFillProb <= 1, `expectedFillProb in (0,1], got ${d.expectedFillProb}`);
});

test('(b) high urgency -> mode taker, feeType taker', () => {
  const book = makeBook({ bid: 62000, ask: 62000 * 1.002 }); // wide spread, would otherwise rest
  const d = makerFillDecision(
    { side: 'buy', book, urgency: 0.9, queueState: { queueAhead: 1, levelDepth: 5 } },
  );
  assert.equal(d.mode, 'taker');
  assert.equal(d.feeType, 'taker');
  assert.equal(d.expectedFillProb, 1);
});

test('(c) tight spread / no edge -> mode skip', () => {
  // Spread of 0.1 tick on a $62000 book ≈ 0.016bps — far below both minSpreadBps (1bps) and the
  // 2x maker-fee floor (4bps). No edge survives a round trip here.
  const bid = 62000.0, ask = 62000.1;
  const book = makeBook({ bid, ask });
  const d = makerFillDecision(
    { side: 'buy', book, urgency: 0.1, queueState: { queueAhead: 1, levelDepth: 5 } },
  );
  assert.equal(d.mode, 'skip');
  assert.equal(d.expectedFillProb, 0);
});

test('(d) refPrice sits on correct side of book for buy vs sell (maker mode)', () => {
  const bid = 62000, ask = 62000 * 1.002;
  const book = makeBook({ bid, ask });

  const buyDecision = makerFillDecision(
    { side: 'buy', book, urgency: 0.1, queueState: { queueAhead: 1, levelDepth: 5 } },
  );
  assert.equal(buyDecision.mode, 'maker');
  // A maker BUY rests at the bid (our own side), never crosses to the ask.
  assert.equal(buyDecision.refPrice, bid);

  const sellDecision = makerFillDecision(
    { side: 'sell', book, urgency: 0.1, queueState: { queueAhead: 1, levelDepth: 5 } },
  );
  assert.equal(sellDecision.mode, 'maker');
  // A maker SELL rests at the ask (our own side), never crosses to the bid.
  assert.equal(sellDecision.refPrice, ask);
});

test('(d2) refPrice sits on correct (crossing) side for taker mode', () => {
  const bid = 62000, ask = 62000 * 1.002;
  const book = makeBook({ bid, ask });

  const buyTaker = makerFillDecision(
    { side: 'buy', book, urgency: 0.95, queueState: { queueAhead: 1, levelDepth: 5 } },
  );
  assert.equal(buyTaker.mode, 'taker');
  // A taker BUY crosses the spread and takes the ask.
  assert.equal(buyTaker.refPrice, ask);

  const sellTaker = makerFillDecision(
    { side: 'sell', book, urgency: 0.95, queueState: { queueAhead: 1, levelDepth: 5 } },
  );
  assert.equal(sellTaker.mode, 'taker');
  // A taker SELL crosses the spread and takes the bid.
  assert.equal(sellTaker.refPrice, bid);
});

// ── Additional edge-case coverage (fail-open + queue-depth escalation) ─────────────────────────

test('invalid side -> skip, fail-open (no throw)', () => {
  const book = makeBook({});
  const d = makerFillDecision({ side: 'invalid', book, urgency: 0, queueState: {} });
  assert.equal(d.mode, 'skip');
  assert.equal(d.reason, 'invalid_side');
});

test('invalid book (missing mid) -> skip, fail-open (no throw)', () => {
  const d = makerFillDecision({ side: 'buy', book: { bids: [], asks: [] }, urgency: 0, queueState: {} });
  assert.equal(d.mode, 'skip');
  assert.equal(d.reason, 'invalid_book');
});

test('crossed/inverted book (ask <= bid) -> skip', () => {
  const book = makeBook({ bid: 62000, ask: 61999 }); // inverted, malformed
  const d = makerFillDecision({ side: 'buy', book, urgency: 0.1, queueState: {} });
  assert.equal(d.mode, 'skip');
  assert.equal(d.reason, 'invalid_touch');
});

test('very deep queue with nonzero urgency escalates to taker (queue too deep to rest)', () => {
  const bid = 62000, ask = 62000 * 1.002; // wide spread, would otherwise rest
  const book = makeBook({ bid, ask });
  // queueAhead >> levelDepth → fillProb ~0 → with any urgency > 0, decision falls back to taker.
  const d = makerFillDecision(
    { side: 'buy', book, urgency: 0.05, queueState: { queueAhead: 100000, levelDepth: 5 } },
  );
  assert.equal(d.mode, 'taker');
  assert.ok(d.reason.startsWith('queue_too_deep_to_rest'));
});

test('very deep queue with ZERO urgency still rests (no urgency to force escalation)', () => {
  const bid = 62000, ask = 62000 * 1.002;
  const book = makeBook({ bid, ask });
  const d = makerFillDecision(
    { side: 'buy', book, urgency: 0, queueState: { queueAhead: 100000, levelDepth: 5 } },
  );
  assert.equal(d.mode, 'maker');
  assert.ok(d.expectedFillProb < 0.05);
});

test('DEFAULT_FEES matches binance-vip0 asymmetry (maker < taker)', () => {
  assert.ok(DEFAULT_FEES.maker < DEFAULT_FEES.taker);
  assert.equal(DEFAULT_FEES.maker, 0.0002);
  assert.equal(DEFAULT_FEES.taker, 0.0005);
});

test('object-form book levels ({price,size}) are accepted (not just [price,size] tuples)', () => {
  const book = {
    bids: [{ price: 62000, size: 5 }],
    asks: [{ price: 62124, size: 5 }],
    mid: 62062,
    spreadBps: ((62124 - 62000) / 62062) * 1e4,
  };
  const d = makerFillDecision({ side: 'sell', book, urgency: 0.1, queueState: { queueAhead: 1, levelDepth: 5 } });
  assert.equal(d.mode, 'maker');
  assert.equal(d.refPrice, 62124);
});
