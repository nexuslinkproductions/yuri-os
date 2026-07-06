#!/usr/bin/env node
// Hermetic node:test suite for orderflow-signals.mjs (orderflow-confluence).
// Synthetic books + trades only — no network, no live data.
//
// IMPORTANT: footprint-amt.mjs's computeCVD/amtSignals are DISARMED-by-default (gated on
// _SYSTEM/state/mure-footprint.enabled, which is NOT present in this repo). To exercise the
// CVD lens at all we arm it via the documented test-sandbox override (MURE_FLAG_DIR — same
// pattern as footprint-amt.test.mjs), pointed at a throwaway tmpdir, BEFORE importing either
// footprint-amt.mjs or orderflow-signals.mjs. This does not touch the real repo flag.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const FLAG_DIR = mkdtempSync(path.join(tmpdir(), 'mure-fp-confluence-'));
process.env.MURE_FLAG_DIR = FLAG_DIR;
writeFileSync(path.join(FLAG_DIR, 'mure-footprint.enabled'), '1'); // ARMED for this test run only

test.after(() => { rmSync(FLAG_DIR, { recursive: true, force: true }); });

const { confluenceSignal, CONFLUENCE_CONFIDENCE_CAP } = await import('./orderflow-signals.mjs');

// ── fixtures ──────────────────────────────────────────────────────────────────

const bidHeavyBook = (ts = 1718000000) => ({
  bids: [
    { price: 100, size: 20 }, { price: 99, size: 20 }, { price: 98, size: 20 },
    { price: 97, size: 20 }, { price: 96, size: 20 },
  ],
  asks: [
    { price: 101, size: 4 }, { price: 102, size: 4 }, { price: 103, size: 4 },
    { price: 104, size: 4 }, { price: 105, size: 4 },
  ],
  mid: 100.5,
  spreadBps: 100,
  ts,
});

const askHeavyBook = (ts = 1718000000) => ({
  bids: [
    { price: 100, size: 4 }, { price: 99, size: 4 }, { price: 98, size: 4 },
    { price: 97, size: 4 }, { price: 96, size: 4 },
  ],
  asks: [
    { price: 101, size: 20 }, { price: 102, size: 20 }, { price: 103, size: 20 },
    { price: 104, size: 20 }, { price: 105, size: 20 },
  ],
  mid: 100.5,
  spreadBps: 100,
  ts,
});

const balancedBook = (ts = 1718000000) => ({
  bids: [
    { price: 100, size: 10 }, { price: 99, size: 10 }, { price: 98, size: 10 },
    { price: 97, size: 10 }, { price: 96, size: 10 },
  ],
  asks: [
    { price: 101, size: 10 }, { price: 102, size: 10 }, { price: 103, size: 10 },
    { price: 104, size: 10 }, { price: 105, size: 10 },
  ],
  mid: 100.5,
  spreadBps: 100,
  ts,
});

// A "prior" book with bids shallower than the bidHeavyBook, so that a fresh bid lift
// at level 0 registers as clear positive OFI (mirrors the ofi.mjs bid-lift test pattern).
const prevBookForBidHeavy = () => ({
  bids: [
    { price: 99.5, size: 5 }, { price: 99, size: 20 }, { price: 98, size: 20 },
    { price: 97, size: 20 }, { price: 96, size: 20 },
  ],
  asks: [
    { price: 101, size: 4 }, { price: 102, size: 4 }, { price: 103, size: 4 },
    { price: 104, size: 4 }, { price: 105, size: 4 },
  ],
  mid: 100.25,
  spreadBps: 100,
  ts: 1717999999,
});

// A "prior" book where asks have MORE size at level 0 than askHeavyBook's level 0,
// so the ask DROPS (in size) is what we want... actually for OFI SELL pressure we want
// the ask price to drop or ask size at same price to grow (queue build). Use a prior
// book with a higher best ask that gets undercut -> aggressive sell -> negative OFI.
const prevBookForAskHeavy = () => ({
  bids: [
    { price: 100, size: 4 }, { price: 99, size: 4 }, { price: 98, size: 4 },
    { price: 97, size: 4 }, { price: 96, size: 4 },
  ],
  asks: [
    { price: 101.5, size: 6 }, { price: 102, size: 20 }, { price: 103, size: 20 },
    { price: 104, size: 20 }, { price: 105, size: 20 },
  ],
  mid: 100.75,
  spreadBps: 100,
  ts: 1717999999,
});

// Trade record shape per footprint-amt.mjs normTrade(): accepts either
// { tradePrice, tradeSize, aggressorSide } or { price, qty, aggressorSide }.
const buyTrade = (ts, price, qty) => ({ ts, price, qty, aggressorSide: 'buy' });
const sellTrade = (ts, price, qty) => ({ ts, price, qty, aggressorSide: 'sell' });

const buyHeavyTrades = [
  buyTrade(1, 100.1, 10),
  buyTrade(2, 100.2, 15),
  sellTrade(3, 100.15, 3),
  buyTrade(4, 100.3, 12),
];

const sellHeavyTrades = [
  sellTrade(1, 100.1, 10),
  sellTrade(2, 100.0, 15),
  buyTrade(3, 100.05, 3),
  sellTrade(4, 99.9, 12),
];

// ── (a) 2+ agreeing lenses -> directional signal with correct side ──────────

test('confluence: OBI+CVD agree long (OFI neutral, no prevBook) -> long signal', () => {
  const sig = confluenceSignal(
    { book: bidHeavyBook(), prevBook: null, trades: buyHeavyTrades },
    { market: 'BTC-USD' },
  );
  assert.ok(sig, 'signal should not be null');
  assert.equal(sig.factorId, 'orderflow-confluence');
  assert.equal(sig.side, 'long');
  assert.ok(sig.confidence > 0, `confidence should be > 0 (got ${sig.confidence})`);
  assert.ok(sig.confidence <= CONFLUENCE_CONFIDENCE_CAP);
  assert.equal(sig.ts, 1718000000);
});

test('confluence: OBI+CVD agree short (OFI neutral, no prevBook) -> short signal', () => {
  const sig = confluenceSignal(
    { book: askHeavyBook(), prevBook: null, trades: sellHeavyTrades },
    { market: 'ETH-USD' },
  );
  assert.ok(sig, 'signal should not be null');
  assert.equal(sig.side, 'short');
  assert.ok(sig.confidence > 0 && sig.confidence <= CONFLUENCE_CONFIDENCE_CAP);
});

test('confluence: all 3 lenses agree long (OBI+OFI+CVD) -> long signal with higher confidence than 2-of-3', () => {
  const sig3 = confluenceSignal(
    { book: bidHeavyBook(), prevBook: prevBookForBidHeavy(), trades: buyHeavyTrades },
    { market: 'BTC-USD' },
  );
  assert.ok(sig3, 'signal should not be null');
  assert.equal(sig3.side, 'long');

  const sig2 = confluenceSignal(
    { book: bidHeavyBook(), prevBook: null, trades: buyHeavyTrades },
    { market: 'BTC-USD' },
  );
  assert.equal(sig2.side, 'long');

  // 3-of-3 base (0.60) should generally exceed 2-of-3 base (0.35) confidence.
  assert.ok(sig3.confidence > sig2.confidence,
    `3-lens confidence (${sig3.confidence}) should exceed 2-lens confidence (${sig2.confidence})`);
});

test('confluence: all 3 lenses agree short (OBI+OFI+CVD) -> short signal', () => {
  const sig = confluenceSignal(
    { book: askHeavyBook(), prevBook: prevBookForAskHeavy(), trades: sellHeavyTrades },
    { market: 'ETH-USD' },
  );
  assert.ok(sig, 'signal should not be null');
  assert.equal(sig.side, 'short');
});

// ── (b) lenses disagree -> flat ──────────────────────────────────────────────

test('confluence: OBI long vs CVD short (1-vs-1, OFI neutral) -> flat', () => {
  const sig = confluenceSignal(
    { book: bidHeavyBook(), prevBook: null, trades: sellHeavyTrades },
    { market: 'BTC-USD' },
  );
  assert.ok(sig, 'signal should not be null (flat is a valid signal, not null)');
  assert.equal(sig.side, 'flat');
  assert.equal(sig.confidence, 0);
});

test('confluence: OBI short vs CVD long (1-vs-1, OFI neutral) -> flat', () => {
  const sig = confluenceSignal(
    { book: askHeavyBook(), prevBook: null, trades: buyHeavyTrades },
    { market: 'ETH-USD' },
  );
  assert.ok(sig);
  assert.equal(sig.side, 'flat');
});

// ── (c) all-neutral -> flat ───────────────────────────────────────────────────

test('confluence: balanced book + no trades + no prevBook (all neutral) -> flat', () => {
  const sig = confluenceSignal(
    { book: balancedBook(), prevBook: null, trades: [] },
    { market: 'SOL-USD' },
  );
  assert.ok(sig, 'flat is a valid signal, not null');
  assert.equal(sig.side, 'flat');
  assert.equal(sig.value, 0);
  assert.equal(sig.confidence, 0);
});

test('confluence: balanced book + neutral trades (buy/sell cancel to zero net CVD) -> flat', () => {
  const neutralTrades = [
    buyTrade(1, 100.1, 10),
    sellTrade(2, 100.1, 10),
  ];
  const sig = confluenceSignal(
    { book: balancedBook(), prevBook: null, trades: neutralTrades },
    { market: 'SOL-USD' },
  );
  assert.ok(sig);
  assert.equal(sig.side, 'flat');
});

// ── structurally insufficient input -> null ─────────────────────────────────

test('confluence: empty book -> null', () => {
  const sig = confluenceSignal({ book: { bids: [], asks: [], mid: 100, spreadBps: 5, ts: 1 } });
  assert.equal(sig, null);
});

test('confluence: missing book -> null', () => {
  assert.equal(confluenceSignal({}), null);
  assert.equal(confluenceSignal({ book: null }), null);
});

test('confluence: one-sided book (no asks) -> null', () => {
  const sig = confluenceSignal({
    book: { bids: [{ price: 100, size: 10 }], asks: [], mid: 100, spreadBps: 0, ts: 1 },
  });
  assert.equal(sig, null);
});

// ── (d) confidence never exceeds the cap ─────────────────────────────────────

test('confluence: confidence never exceeds CONFLUENCE_CONFIDENCE_CAP across strong 3-lens agreement', () => {
  // Push all lenses toward maximal agreement/strength: extreme OBI, extreme OFI (large
  // prevBook->currBook delta), and heavily one-sided CVD.
  const extremeBidHeavy = {
    bids: [
      { price: 100, size: 1000 }, { price: 99, size: 1000 }, { price: 98, size: 1000 },
      { price: 97, size: 1000 }, { price: 96, size: 1000 },
    ],
    asks: [
      { price: 101, size: 1 }, { price: 102, size: 1 }, { price: 103, size: 1 },
      { price: 104, size: 1 }, { price: 105, size: 1 },
    ],
    mid: 100.5,
    spreadBps: 100,
    ts: 1718000000,
  };
  const extremePrev = {
    bids: [
      { price: 90, size: 1 }, { price: 89, size: 1 }, { price: 88, size: 1 },
      { price: 87, size: 1 }, { price: 86, size: 1 },
    ],
    asks: [
      { price: 101, size: 1 }, { price: 102, size: 1 }, { price: 103, size: 1 },
      { price: 104, size: 1 }, { price: 105, size: 1 },
    ],
    mid: 95.5,
    spreadBps: 100,
    ts: 1717999999,
  };
  const massiveBuyTrades = Array.from({ length: 50 }, (_, i) => buyTrade(i + 1, 100 + i * 0.01, 100));

  const sig = confluenceSignal(
    { book: extremeBidHeavy, prevBook: extremePrev, trades: massiveBuyTrades },
    { market: 'BTC-USD' },
  );
  assert.ok(sig);
  assert.equal(sig.side, 'long');
  assert.ok(sig.confidence <= CONFLUENCE_CONFIDENCE_CAP,
    `confidence ${sig.confidence} must be <= cap ${CONFLUENCE_CONFIDENCE_CAP}`);
});

test('confluence: confidence never exceeds cap on repeated random-ish fixtures', () => {
  // Sweep a handful of magnitude variants to probabe the cap holds broadly, not just at one point.
  const variants = [0.1, 1, 10, 100, 1000];
  for (const mag of variants) {
    const book = {
      bids: [{ price: 100, size: mag * 20 }, { price: 99, size: mag * 20 }],
      asks: [{ price: 101, size: mag }, { price: 102, size: mag }],
      mid: 100.5, spreadBps: 100, ts: 1718000000,
    };
    const prev = {
      bids: [{ price: 90, size: mag }, { price: 89, size: mag }],
      asks: [{ price: 101, size: mag }, { price: 102, size: mag }],
      mid: 95.5, spreadBps: 100, ts: 1717999999,
    };
    const trades = Array.from({ length: 10 }, (_, i) => buyTrade(i + 1, 100 + i, mag * 5));
    const sig = confluenceSignal({ book, prevBook: prev, trades }, { market: 'X' });
    assert.ok(sig);
    assert.ok(sig.confidence <= CONFLUENCE_CONFIDENCE_CAP,
      `mag=${mag}: confidence ${sig.confidence} must be <= cap`);
  }
});

// ── sanity: ts propagation from book.ts ──────────────────────────────────────

// ── DISARMED-CVD-as-neutral: the real-world default state (no mure-footprint.enabled flag) ──

test('confluence: CVD lens degrades to neutral when footprint-amt is DISARMED (repo default) — OBI alone is not enough', async () => {
  // Point MURE_FLAG_DIR at a fresh EMPTY tmpdir (no flag file written) to simulate the real
  // repo's disarmed state, without touching the armed FLAG_DIR used by the rest of this suite.
  const emptyDir = mkdtempSync(path.join(tmpdir(), 'mure-fp-disarmed-'));
  const saved = process.env.MURE_FLAG_DIR;
  process.env.MURE_FLAG_DIR = emptyDir;
  try {
    // footprint-amt.mjs's armed() check reads process.env.MURE_FLAG_DIR LIVE on every call
    // (FLAG_PATH() is a function, not cached at import time), so re-pointing the env var here
    // is sufficient — no re-import needed.
    const sig = confluenceSignal(
      { book: bidHeavyBook(), prevBook: null, trades: buyHeavyTrades },
      { market: 'BTC-USD' },
    );
    // Only OBI can vote (OFI neutral: no prevBook; CVD neutral: disarmed) -> 1 vote -> flat.
    assert.ok(sig);
    assert.equal(sig.side, 'flat',
      `expected flat with only 1 lens (OBI) able to vote under DISARMED CVD (got ${sig.side})`);
  } finally {
    process.env.MURE_FLAG_DIR = saved;
    rmSync(emptyDir, { recursive: true, force: true });
  }
});

test('confluence: ts is taken from book.ts, not wall clock', () => {
  const sig = confluenceSignal(
    { book: bidHeavyBook(1234567890), prevBook: null, trades: buyHeavyTrades },
    { market: 'BTC-USD' },
  );
  assert.ok(sig);
  assert.equal(sig.ts, 1234567890);
});
