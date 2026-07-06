#!/usr/bin/env node
// nautilus-adapter.test.mjs — red/grey/green for the nautilus book seam (MURE boundary + C3).
// Run: node --test _SYSTEM/Scripts/alpha-factor-library/adapters/nautilus-adapter.test.mjs
//
// THE acceptance test here is the C3 ROUND-TRIP: recorder-emitted JSONL lines → tape-replay.loadTape
// (UNCHANGED) → bookAt/tradesBetween reproduce the mock nautilus book state exactly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const FLAG_DIR = mkdtempSync(path.join(tmpdir(), 'mure-naut-'));
const FLAG_ADAPTER = path.join(FLAG_DIR, 'mure-nautilus-adapter.enabled');
const FLAG_INSTR = path.join(FLAG_DIR, 'mure-instruments.enabled');
process.env.MURE_FLAG_DIR = FLAG_DIR;
const armAdapter = () => writeFileSync(FLAG_ADAPTER, '1');
const armInstruments = () => writeFileSync(FLAG_INSTR, '1');
const disarmAll = () => { for (const f of [FLAG_ADAPTER, FLAG_INSTR]) { try { unlinkSync(f); } catch { /* absent */ } } };

const { depth10ToBook, createDeltaBook, createTapeRecorder, ofiSnapshotsFromDepth10s, obiSignalsFromDepth10 } =
  await import('./nautilus-adapter.mjs');
const { loadTape } = await import('../tape-replay.mjs');
const { ofiContribution, computeOFI } = await import('../ofi.mjs');

test.after(() => { rmSync(FLAG_DIR, { recursive: true, force: true }); });

const NS = (sec) => BigInt(Math.round(sec * 1e9)); // unix-seconds → nanos (bigint, the u64 reality)
const mkDepth10 = (sec, bids, asks, id = 'ESM6.GLBX') => ({
  instrument_id: id, ts_event: NS(sec),
  bids: bids.map(([price, size]) => ({ price, size })),
  asks: asks.map(([price, size]) => ({ price, size })),
});

// ═══ RED — DISARMED: every export null ════════════════════════════════════════

test('DISARMED: every export returns null (callers fall through to Binance path)', () => {
  disarmAll();
  const d10 = mkDepth10(1_750_000_000, [[5000, 10]], [[5000.5, 8]]);
  assert.equal(depth10ToBook(d10), null);
  assert.equal(createDeltaBook(), null);
  assert.equal(createTapeRecorder({ market: 'ES-USD' }), null);
  assert.equal(ofiSnapshotsFromDepth10s([d10]), null);
  assert.equal(obiSignalsFromDepth10(d10), null);
});

// ═══ GREEN — depth10ToBook (the L2 seam) ══════════════════════════════════════

test('depth10ToBook: translation, sorting, ts nanos→seconds, symbol mapping', () => {
  armAdapter(); armInstruments();
  // Deliberately UNSORTED input — the adapter must sort (bids desc, asks asc).
  const d10 = mkDepth10(1_750_000_000.5,
    [[5000.0, 30], [5000.25, 12], [4999.75, 7]],
    [[5000.75, 22], [5000.5, 9]]);
  const book = depth10ToBook(d10);
  assert.ok(book, 'book produced');
  assert.equal(book.bids[0].price, 5000.25, 'best bid first (sorted desc)');
  assert.equal(book.asks[0].price, 5000.5, 'best ask first (sorted asc)');
  assert.equal(book.mid, (5000.25 + 5000.5) / 2);
  assert.ok(Math.abs(book.spreadBps - (0.25 / book.mid) * 1e4) < 1e-9, 'spreadBps exact');
  assert.ok(Math.abs(book.ts - 1_750_000_000.5) < 1e-6, 'ts_event nanos → unix-seconds');
  assert.equal(book.symbol, 'ES-USD', 'instrument_id ESM6.GLBX → YURI market via registry');
  // market override wins:
  assert.equal(depth10ToBook(d10, { market: 'CUSTOM' }).symbol, 'CUSTOM');
  // zero-size levels dropped:
  const withZero = mkDepth10(1_750_000_000, [[5000, 10], [4999, 0]], [[5000.5, 8]]);
  assert.equal(depth10ToBook(withZero).bids.length, 1, 'zero-size level dropped');
});

test('depth10ToBook: crossed/one-sided/garbage → null (fail-open)', () => {
  armAdapter(); armInstruments();
  assert.equal(depth10ToBook(mkDepth10(1e9, [[5001, 5]], [[5000.5, 8]])), null, 'crossed book refused');
  assert.equal(depth10ToBook(mkDepth10(1e9, [[5000, 5]], [[5000, 8]])), null, 'locked book refused');
  assert.equal(depth10ToBook(mkDepth10(1e9, [], [[5000.5, 8]])), null, 'one-sided refused');
  assert.equal(depth10ToBook({ bids: null, asks: [], ts_event: 1n }), null);
  assert.equal(depth10ToBook(null), null);
  assert.equal(depth10ToBook({ bids: [], asks: [], ts_event: 'garbage' }), null, 'bad ts refused');
});

test('depth10ToBook: instruments DISARMED → falls back to raw instrument_id as symbol', () => {
  disarmAll(); armAdapter(); // adapter armed, registry NOT
  const book = depth10ToBook(mkDepth10(1e9, [[5000, 10]], [[5000.5, 8]]));
  assert.ok(book);
  assert.equal(book.symbol, 'ESM6.GLBX', 'registry disarmed → passthrough id (no invented mapping)');
});

// ═══ GREEN — delta book (MBO seam → OFI) ══════════════════════════════════════

test('createDeltaBook: Add/Update/Delete/Clear semantics + best-level snapshots', () => {
  armAdapter(); armInstruments();
  const db = createDeltaBook();
  const delta = (sec, action, side, price, size) => ({ action, order: { price, size, side }, ts_event: NS(sec) });

  assert.equal(db.apply(delta(1, 'Add', 'Buy', 5000, 10)), null, 'one-sided book → no snapshot yet');
  let snap = db.apply(delta(2, 'Add', 'Sell', 5000.5, 8));
  assert.deepEqual(snap, { ts: 2, bidPx: 5000, bidSz: 10, askPx: 5000.5, askSz: 8 });

  snap = db.apply(delta(3, 'Update', 'Buy', 5000, 15)); // queue grows at best bid
  assert.equal(snap.bidSz, 15);
  snap = db.apply(delta(4, 'Add', 'Buy', 5000.25, 5)); // better bid arrives
  assert.equal(snap.bidPx, 5000.25);
  snap = db.apply(delta(5, 'Delete', 'Buy', 5000.25, 0)); // and is deleted
  assert.equal(snap.bidPx, 5000);
  snap = db.apply(delta(6, 'Update', 'Sell', 5000.5, 0)); // size-0 update = delete
  assert.equal(snap, null, 'ask side emptied → no snapshot');
  db.apply(delta(7, 'Add', 'Sell', 5001, 4));
  db.apply(delta(8, 'Clear', 'Buy', 0, 0));
  assert.equal(db.best(), null, 'Clear wipes both sides');
  // garbage deltas: ignored, never throw
  assert.equal(db.apply(null), null);
  assert.equal(db.apply({ action: 'Warp', order: { price: 1, size: 1, side: 'Buy' } }), null);
  assert.equal(db.apply({ action: 'Add', order: { price: NaN, size: 1, side: 'Buy' } }), null);
});

test('OFI integration: delta-book snapshots drive ofiContribution/computeOFI with correct sign', () => {
  armAdapter(); armInstruments();
  const db = createDeltaBook();
  const delta = (sec, action, side, price, size) => ({ action, order: { price, size, side }, ts_event: NS(sec) });
  db.apply(delta(1, 'Add', 'Buy', 5000, 10));
  const s0 = db.apply(delta(2, 'Add', 'Sell', 5000.5, 8));
  const s1 = db.apply(delta(3, 'Update', 'Buy', 5000, 18)); // bid queue +8 at same price → BUY pressure
  const c1 = ofiContribution(s0, s1);
  assert.equal(c1.e, 8, `same-price bid growth → e = +ΔbidSz (got ${c1.e})`);
  const s2 = db.apply(delta(4, 'Update', 'Buy', 5000, 6)); // bid queue −12 → SELL pressure
  const c2 = ofiContribution(s1, s2);
  assert.equal(c2.e, -12);
  // computeOFI over the sequence: net −4 raw → sign −1
  const agg = computeOFI([s0, s1, s2], { normalize: 'raw' });
  assert.equal(agg.ofi, -4);
  assert.equal(agg.sign, -1);
  assert.equal(agg.bucketsUsed, 2);
});

test('ofiSnapshotsFromDepth10s: frames → computeOFI-ready snapshots (invalid frames dropped)', () => {
  armAdapter(); armInstruments();
  const frames = [
    mkDepth10(1, [[5000, 10]], [[5000.5, 8]]),
    mkDepth10(2, [[5000, 14]], [[5000.5, 8]]),   // bid +4
    mkDepth10(3, [[5001, 5]], [[5000.5, 8]]),    // CROSSED → dropped
    mkDepth10(4, [[5000, 14]], [[5000.5, 3]]),   // ask −5 at same price → +5 buy pressure
  ];
  const snaps = ofiSnapshotsFromDepth10s(frames);
  assert.equal(snaps.length, 3, 'crossed frame dropped');
  const r = computeOFI(snaps, { normalize: 'raw' });
  assert.equal(r.ofi, 9, `+4 bid then +5 ask-pull → raw OFI 9 (got ${r.ofi})`);
  assert.equal(r.sign, 1);
});

// ═══ GREEN — C3 ROUND-TRIP: recorder lines → tape-replay UNCHANGED ════════════

test('C3 ROUND-TRIP: recorder JSONL → loadTape → bookAt/tradesBetween reproduce the mock book', () => {
  armAdapter(); armInstruments();
  const rec = createTapeRecorder({ market: 'ES-USD', snapEveryMs: 120_000 });
  const lines = [];
  const push = (l) => { if (l !== null) lines.push(l); };

  // t=1000s: first frame → snap
  push(rec.onDepth10(mkDepth10(1000, [[5000, 10], [4999.75, 5]], [[5000.25, 8], [5000.5, 3]])));
  // t=1001s: bid 5000 grows to 15, ask 5000.25 pulled, ask 5000.5 grows → diff
  push(rec.onDepth10(mkDepth10(1001, [[5000, 15], [4999.75, 5]], [[5000.5, 6]])));
  // t=1002s: unchanged frame → NO line
  const noLine = rec.onDepth10(mkDepth10(1002, [[5000, 15], [4999.75, 5]], [[5000.5, 6]]));
  assert.equal(noLine, null, 'unchanged frame emits nothing');
  // t=1003s: bid 4999.75 removed, new ask 5000.75 → diff
  push(rec.onDepth10(mkDepth10(1003, [[5000, 15]], [[5000.5, 6], [5000.75, 4]])));
  // trades: BUYER aggressor then SELLER aggressor
  push(rec.onTrade({ price: 5000.5, size: 3, aggressor_side: 'BUYER', trade_id: 77, instrument_id: 'ESM6.GLBX', ts_event: NS(1003.5) }));
  push(rec.onTrade({ price: 5000.0, size: 6, aggressor_side: 'SELLER', trade_id: 78, instrument_id: 'ESM6.GLBX', ts_event: NS(1004) }));
  // NO_AGGRESSOR → skipped
  assert.equal(rec.onTrade({ price: 5000, size: 1, aggressor_side: 'NO_AGGRESSOR', ts_event: NS(1004.5) }), null);

  assert.equal(lines.length, 5, `snap + 2 diffs + 2 trades (got ${lines.length})`);

  // ── the actual contract test: tape-replay consumes the lines UNCHANGED ──
  const tape = loadTape(lines.map((l) => JSON.parse(l)));

  const b0 = tape.bookAt(1000_000); // ms
  assert.ok(b0, 'bookAt(snap ts) reconstructs');
  assert.equal(b0.topBids[0].price, 5000);
  assert.equal(b0.topAsks[0].price, 5000.25);
  assert.equal(b0.mid, (5000 + 5000.25) / 2);

  const b1 = tape.bookAt(1001_000);
  assert.equal(b1.bids.get('5000'), 15, 'diff applied: bid size 10→15');
  assert.ok(!b1.asks.has('5000.25'), 'diff applied: pulled ask deleted via qty "0"');
  assert.equal(b1.topAsks[0].price, 5000.5, 'best ask moved to 5000.5');

  const b3 = tape.bookAt(1003_000);
  assert.ok(!b3.bids.has('4999.75'), 'second diff: bid level removed');
  assert.equal(b3.asks.get('5000.75'), 4, 'second diff: new ask level added');

  const trades = tape.tradesBetween(1003_000, 1005_000);
  assert.equal(trades.length, 2);
  assert.equal(trades[0].aggressorSide, 'buy', 'BUYER aggressor → m=false → "buy"');
  assert.equal(trades[1].aggressorSide, 'sell', 'SELLER aggressor → m=true → "sell"');
  assert.equal(trades[0].tradePrice, 5000.5);
  assert.equal(trades[1].tradeSize, 6);

  // File-path round trip too (the real consumption mode):
  const tapeFile = path.join(FLAG_DIR, 'es-roundtrip.jsonl');
  writeFileSync(tapeFile, lines.join('\n') + '\n');
  const tape2 = loadTape(tapeFile);
  assert.equal(tape2.bookAt(1001_000).bids.get('5000'), 15, 'file-path load identical');

  // simulateOrder runs on the synthetic tape (queue-honest sim wired end-to-end):
  const sim = tape2.simulateOrder({ side: 'buy', price: 5000, size: 2, joinTs: 1000_000, horizonSec: 10 });
  assert.equal(sim.queueAheadAtJoin, 10, 'queue-ahead from recorded snap');
});

test('recorder: snap cadence — a frame past snapEveryMs re-emits a full snap', () => {
  armAdapter(); armInstruments();
  const rec = createTapeRecorder({ market: 'ES-USD', snapEveryMs: 5_000 });
  const l1 = rec.onDepth10(mkDepth10(2000, [[100, 1]], [[101, 1]]));
  const l2 = rec.onDepth10(mkDepth10(2001, [[100, 2]], [[101, 1]]));
  const l3 = rec.onDepth10(mkDepth10(2006, [[100, 3]], [[101, 1]])); // 6s later → new snap
  assert.equal(JSON.parse(l1).t, 'snap');
  assert.equal(JSON.parse(l2).t, 'diff');
  assert.equal(JSON.parse(l3).t, 'snap', 'cadence forces a fresh snap (bounded replay seek window)');
});

// ═══ GREEN — OBI signal wire ══════════════════════════════════════════════════

test('obiSignalsFromDepth10: heavy-bid book → long OBI signal through the REUSED factor', () => {
  armAdapter(); armInstruments();
  const heavyBid = mkDepth10(1_750_000_000,
    [[5000, 100], [4999.75, 80], [4999.5, 60]],
    [[5000.25, 5], [5000.5, 4]]);
  const signals = obiSignalsFromDepth10(heavyBid, { market: 'ES-USD' });
  assert.ok(Array.isArray(signals) && signals.length >= 1, 'signals emitted');
  const obi = signals.find((s) => s.factorId.includes('obi'));
  assert.ok(obi, 'OBI signal present');
  assert.equal(obi.side, 'long', 'heavy bid depth → long');
  assert.ok(obi.factorId.includes('ES-USD'), `factorId carries the market (got ${obi.factorId})`);
  assert.equal(obi.ts, 1_750_000_000, 'signal ts in unix-seconds');
  // crossed frame → [] not null (armed path, fail-open downstream shape)
  assert.deepEqual(obiSignalsFromDepth10(mkDepth10(1e9, [[5001, 5]], [[5000, 5]]), { market: 'ES-USD' }), []);
});
