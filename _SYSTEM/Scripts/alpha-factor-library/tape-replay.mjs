// @capability: tape-replay
// @serves: recorded tape replay | offline book reconstruction | synthetic tape | JSONL tape | tape order book | fill simulation offline | maker fill replay | BTC tape playback | depth replay | trade replay
// @does: Reconstructs L2 book state and simulates maker order fills from a recorded JSONL tape (snap/diff/trade events as written by tape-recorder). Pure offline — no network calls. Tape.bookAt(ts) seeds from the latest snap ≤ ts then applies diffs; Tape.tradesBetween filters/maps trades; Tape.bookSeries emits mid/spreadBps over a window; Tape.simulateOrder runs a queue-honest fill sim via maker-exec-measure. Fail-open throughout.
// @use: const tape = await loadTape(filePath); tape.bookAt(ts) for book-state-at-time; tape.simulateOrder({side,price,size,joinTs,horizonSec}) for offline fill research.
// @exports: loadTape, Tape

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { applyLevels, extractTopN } from './observatory/depth-book.mjs';
import { newMakerOrder, onTrade, onBookUpdate } from './maker-exec-measure.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// ── ts-sorted binary search ───────────────────────────────────────────────────
// All event arrays (_snaps/_diffs/_trades) are time-sorted ascending. These
// replace O(n) prefix scans that made replay quadratic on large tapes
// (bookAt/tradesBetween were re-scanning from index 0 on every call → 22-min
// runs on an 80k-event tape). O(log n) each. 2026-06-19.
/** First index with arr[i].ts >= target (arr.length if none). */
function lowerBoundByTs(arr, target) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid].ts < target) lo = mid + 1; else hi = mid; }
  return lo;
}
/** First index with arr[i].ts > target (arr.length if none). */
function upperBoundByTs(arr, target) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid].ts <= target) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Parse a single JSONL line; return null on any error. */
function parseLine(line) {
  const s = line.trim();
  if (!s || s.startsWith('//')) return null;
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * Classify and validate a raw event object from the tape.
 * Returns null for unrecognised / malformed entries (fail-open).
 */
function classifyEvent(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.t !== 'string') return null;
  const { t, ts } = raw;
  if (!isNum(ts)) return null;

  if (t === 'snap') {
    if (typeof raw.s !== 'string') return null;
    if (!isNum(Number(raw.lastUpdateId))) return null;
    if (!Array.isArray(raw.bids) || !Array.isArray(raw.asks)) return null;
    return { kind: 'snap', ts, s: raw.s, lastUpdateId: Number(raw.lastUpdateId), bids: raw.bids, asks: raw.asks };
  }

  if (t === 'diff') {
    if (typeof raw.s !== 'string') return null;
    const b = Array.isArray(raw.b) ? raw.b : [];
    const a = Array.isArray(raw.a) ? raw.a : [];
    return { kind: 'diff', ts, s: raw.s, U: raw.U, u: raw.u, pu: raw.pu, b, a };
  }

  if (t === 'trade') {
    if (typeof raw.s !== 'string') return null;
    const p = Number(raw.p), q = Number(raw.q);
    if (!isNum(p) || !isNum(q)) return null;
    // m===true → the buyer was the market maker → aggressor is 'sell'
    const aggressorSide = raw.m === true ? 'sell' : 'buy';
    return { kind: 'trade', ts, s: raw.s, p, q, aggressorSide };
  }

  return null; // unknown type — skip, fail-open
}

// ─────────────────────────────────────────────────────────────────────────────
// Tape class
// ─────────────────────────────────────────────────────────────────────────────

export class Tape {
  /**
   * @param {object[]} events — pre-classified, time-ordered event objects
   */
  constructor(events) {
    // Partition by kind for fast lookup.  All arrays are time-sorted ascending.
    this._all = events;
    this._snaps = events.filter((e) => e.kind === 'snap');
    this._diffs = events.filter((e) => e.kind === 'diff');
    this._trades = events.filter((e) => e.kind === 'trade');
  }

  // ── bookAt(ts) ─────────────────────────────────────────────────────────────

  /**
   * Reconstruct the order book at timestamp `ts`.
   *
   * Steps:
   *   1. Find the latest snap with snap.ts ≤ ts → seed bids/asks Maps.
   *   2. Apply all diffs with diff.ts > snapTs AND diff.ts ≤ ts in order.
   *   3. Derive mid, spreadBps, topBids, topAsks via extractTopN.
   *
   * Returns null when no snap ≤ ts exists (fail-open).
   *
   * @param {number} ts
   * @returns {{ bids:Map, asks:Map, mid:number|null, spreadBps:number|null, topBids:object[], topAsks:object[] }|null}
   */
  bookAt(ts) {
    try {
      if (!isNum(ts)) return null;

      // Latest snap with snap.ts ≤ ts (binary search; snaps time-sorted ascending)
      const si = upperBoundByTs(this._snaps, ts) - 1;
      if (si < 0) return null;
      const snap = this._snaps[si];
      const snapTs = snap.ts;

      // Seed book from snap
      const bids = new Map();
      const asks = new Map();
      applyLevels(bids, snap.bids);
      applyLevels(asks, snap.asks);

      // Apply diffs: snapTs < diff.ts ≤ ts (binary-search the start; absolute level sets, qty=0 = delete)
      for (let di = upperBoundByTs(this._diffs, snapTs); di < this._diffs.length; di++) {
        const diff = this._diffs[di];
        if (diff.ts > ts) break; // sorted, so we can stop early
        applyLevels(bids, diff.b);
        applyLevels(asks, diff.a);
      }

      // Derive top levels + mid
      const { bids: topBids, asks: topAsks } = extractTopN(bids, asks, 20);
      const mid = (topBids.length > 0 && topAsks.length > 0)
        ? (topBids[0].price + topAsks[0].price) / 2
        : null;
      const spreadBps = (mid && mid > 0 && topBids.length > 0 && topAsks.length > 0)
        ? ((topAsks[0].price - topBids[0].price) / mid) * 1e4
        : null;

      return { bids, asks, mid, spreadBps, topBids, topAsks };
    } catch {
      return null; // fail-open
    }
  }

  // ── tradesBetween(t0, t1) ──────────────────────────────────────────────────

  /**
   * Return trade events in the closed interval [t0, t1].
   *
   * @param {number} t0
   * @param {number} t1
   * @returns {{ ts:number, tradePrice:number, tradeSize:number, aggressorSide:'buy'|'sell' }[]}
   */
  tradesBetween(t0, t1) {
    try {
      if (!isNum(t0) || !isNum(t1)) return [];
      const result = [];
      for (let i = lowerBoundByTs(this._trades, t0); i < this._trades.length; i++) {
        const ev = this._trades[i];
        if (ev.ts > t1) break; // sorted, early exit
        result.push({ ts: ev.ts, tradePrice: ev.p, tradeSize: ev.q, aggressorSide: ev.aggressorSide });
      }
      return result;
    } catch {
      return [];
    }
  }

  // ── bookSeries(t0, t1, stepMs) ────────────────────────────────────────────

  /**
   * Yield { ts, mid, spreadBps } at every step across [t0, t1].
   * Entries where bookAt returns null are silently skipped (fail-open).
   *
   * @param {number} t0
   * @param {number} t1
   * @param {number} stepMs
   * @returns {{ ts:number, mid:number, spreadBps:number|null }[]}
   */
  bookSeries(t0, t1, stepMs) {
    try {
      if (!isNum(t0) || !isNum(t1) || !isNum(stepMs) || stepMs <= 0) return [];
      const result = [];
      // Incremental walk: one full reconstruction at t0, then advance snaps+diffs
      // forward across steps instead of a fresh bookAt per step (was O(steps×diffs)
      // and the dominant cost in adverse-attribution). Equivalent to the prior
      // [bookAt(ts) for ts in steps] loop. 2026-06-19.
      const seed = this.bookAt(t0);
      let bids = seed ? new Map(seed.bids) : new Map();
      let asks = seed ? new Map(seed.asks) : new Map();
      let haveBook = !!seed;
      let si = upperBoundByTs(this._snaps, t0);
      let di = upperBoundByTs(this._diffs, t0);
      const advanceTo = (upto) => {
        while (si < this._snaps.length && this._snaps[si].ts <= upto) {
          const snap = this._snaps[si];
          bids = new Map(); asks = new Map();
          applyLevels(bids, snap.bids);
          applyLevels(asks, snap.asks);
          haveBook = true;
          di = upperBoundByTs(this._diffs, snap.ts);
          si++;
        }
        while (di < this._diffs.length && this._diffs[di].ts <= upto) {
          applyLevels(bids, this._diffs[di].b);
          applyLevels(asks, this._diffs[di].a);
          di++;
        }
      };
      for (let ts = t0; ts <= t1; ts += stepMs) {
        advanceTo(ts);
        if (!haveBook) continue; // no snap ≤ ts → bookAt would have been null
        const { bids: tb, asks: ta } = extractTopN(bids, asks, 20);
        const mid = (tb.length > 0 && ta.length > 0) ? (tb[0].price + ta[0].price) / 2 : null;
        if (!isNum(mid)) continue;
        const spreadBps = (mid > 0) ? ((ta[0].price - tb[0].price) / mid) * 1e4 : null;
        result.push({ ts, mid, spreadBps });
      }
      return result;
    } catch {
      return [];
    }
  }

  // ── simulateOrder({ side, price, size, joinTs, horizonSec }) ──────────────

  /**
   * Simulate a GTX post-only maker order on the recorded tape.
   *
   * Steps:
   *   1. bookAt(joinTs) → queueAheadAtJoin = visible size at `price` on our side.
   *   2. newMakerOrder({side, price, size, queueAheadAtJoin}).
   *   3. Feed tradesBetween(joinTs, joinTs + horizonSec*1000) through onTrade.
   *   4. After each trade, call onBookUpdate with the current level size for our price.
   *
   * Returns { filled, fillTs, fillQty, timeInBookMs, queueAheadAtJoin }.
   * If the order never fills within the horizon, filled=false, fillTs=null.
   *
   * Fail-open: bad inputs → { filled:false, fillTs:null, fillQty:0, timeInBookMs:null, queueAheadAtJoin:0 }
   *
   * @param {{ side:'buy'|'sell', price:number, size:number, joinTs:number, horizonSec:number }} opts
   * @returns {{ filled:boolean, fillTs:number|null, fillQty:number, timeInBookMs:number|null, queueAheadAtJoin:number }}
   */
  simulateOrder({ side, price, size, joinTs, horizonSec } = {}) {
    const noFill = { filled: false, fillTs: null, fillQty: 0, timeInBookMs: null, queueAheadAtJoin: 0 };
    try {
      if (!isNum(price) || !isNum(size) || !isNum(joinTs) || !isNum(horizonSec)) return noFill;
      if (side !== 'buy' && side !== 'sell') return noFill;

      const horizonEnd = joinTs + horizonSec * 1000;
      const priceKey = String(price);
      const useBids = side === 'buy';

      // Queue-ahead at join from one full book reconstruction. This is the ONLY
      // full bookAt; per-trade book state below is maintained incrementally
      // instead of reconstructing the whole book per trade (was O(trades×diffs)).
      const joinBook = this.bookAt(joinTs);
      let queueAheadAtJoin = 0;
      let haveBook = false;
      let sideLevels = new Map(); // mutable our-side level map (price→size)
      if (joinBook) {
        haveBook = true;
        const sm = useBids ? joinBook.bids : joinBook.asks;
        queueAheadAtJoin = sm.has(priceKey) ? sm.get(priceKey) : 0;
        sideLevels = new Map(sm); // seeded at joinTs
      }

      const order = newMakerOrder({ side, price, size, queueAheadAtJoin });
      if (order._invalid) return { ...noFill, queueAheadAtJoin };

      // Forward cursors into snaps/diffs for events in (joinTs, horizonEnd].
      // advanceTo(upto) brings sideLevels to exactly what bookAt(upto) would give
      // for our side: reseed at the latest snap ≤ upto, then apply diffs ≤ upto.
      let si = upperBoundByTs(this._snaps, joinTs);
      let di = upperBoundByTs(this._diffs, joinTs);
      const advanceTo = (upto) => {
        while (si < this._snaps.length && this._snaps[si].ts <= upto) {
          const snap = this._snaps[si];
          sideLevels = new Map();
          applyLevels(sideLevels, useBids ? snap.bids : snap.asks);
          haveBook = true;
          di = upperBoundByTs(this._diffs, snap.ts); // diffs ≤ snap.ts are subsumed by the reseed
          si++;
        }
        while (di < this._diffs.length && this._diffs[di].ts <= upto) {
          applyLevels(sideLevels, useBids ? this._diffs[di].b : this._diffs[di].a);
          di++;
        }
      };

      // Walk trades in [joinTs, horizonEnd] (matches tradesBetween's inclusive range).
      let fillTs = null;
      for (let i = lowerBoundByTs(this._trades, joinTs); i < this._trades.length; i++) {
        const trade = this._trades[i];
        if (trade.ts > horizonEnd) break;
        if (order.filled) break;

        const result = onTrade(order, {
          tradePrice: trade.p,
          tradeSize: trade.q,
          aggressorSide: trade.aggressorSide,
        });
        if (result.fillQty > 0 && fillTs === null) fillTs = trade.ts;
        if (order.filled) break;

        // Book-level size at this trade's ts for cancel inference (incremental).
        advanceTo(trade.ts);
        if (haveBook) {
          const levelSizeNow = sideLevels.has(priceKey) ? sideLevels.get(priceKey) : 0;
          onBookUpdate(order, levelSizeNow);
        }
      }

      const timeInBookMs = order.filled && fillTs !== null ? fillTs - joinTs : null;
      return {
        filled: order.filled,
        fillTs: order.filled ? fillTs : null,
        fillQty: order.fillQty,
        timeInBookMs,
        queueAheadAtJoin,
      };
    } catch {
      return noFill;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// loadTape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * loadTape(filePathOrLines) → Tape
 *
 * Accepts:
 *   - A file path string → reads the file, splits on newlines, parses JSONL.
 *   - An array of raw objects (for in-memory / test use) → classifies directly.
 *
 * Events are sorted by ts ascending before being stored in the Tape.
 * Malformed lines are silently skipped (fail-open).
 *
 * @param {string|object[]} filePathOrLines
 * @returns {Tape}
 */
export function loadTape(filePathOrLines) {
  try {
    let rawEvents = [];

    if (typeof filePathOrLines === 'string') {
      // File path: read + split JSONL
      let content;
      try {
        content = readFileSync(filePathOrLines, 'utf-8');
      } catch {
        // File not found / unreadable → return empty tape (fail-open)
        return new Tape([]);
      }
      rawEvents = content.split('\n').map(parseLine).filter(Boolean);
    } else if (Array.isArray(filePathOrLines)) {
      rawEvents = filePathOrLines;
    } else {
      return new Tape([]); // bad input → empty tape
    }

    // Classify + filter valid events
    const events = rawEvents
      .map(classifyEvent)
      .filter(Boolean)
      .sort((a, b) => a.ts - b.ts); // ensure time order

    return new Tape(events);
  } catch {
    return new Tape([]); // fail-open
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// --test (offline synthetic, no network)
// ─────────────────────────────────────────────────────────────────────────────

const _isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (_isMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (cond, label) => {
    if (cond) { pass++; }
    else { fail++; console.error('FAIL:', label); }
  };
  const near = (a, b, eps = 1e-9) => isNum(a) && isNum(b) && Math.abs(a - b) <= eps;

  // ── Build a synthetic in-memory tape ────────────────────────────────────────
  //
  // Timeline (all ts in ms):
  //   t=1000  snap:  bids=[['100','10'],['99','5']], asks=[['101','8'],['102','3']]
  //   t=1100  diff:  bid 100 qty→15, ask 101 qty→0 (delete), ask 102→6
  //   t=1200  diff:  bid 99 qty→0 (delete), ask 103→4
  //   t=1300  trade: price=101, qty=3, m=false (buy aggressor → aggressorSide='buy')
  //   t=1400  trade: price=100, qty=6, m=true  (sell aggressor)
  //   t=1500  trade: price=100, qty=12, m=true (sell aggressor — enough to drain the queue)

  const syntheticEvents = [
    // snap at t=1000
    { t: 'snap', ts: 1000, s: 'BTCUSDT', lastUpdateId: 500,
      bids: [['100', '10'], ['99', '5']], asks: [['101', '8'], ['102', '3']] },
    // diff at t=1100: bid 100 grows, ask 101 deleted, ask 102 updated
    { t: 'diff', ts: 1100, s: 'BTCUSDT', U: 501, u: 510, pu: 500,
      b: [['100', '15']], a: [['101', '0'], ['102', '6']] },
    // diff at t=1200: bid 99 removed, new ask level 103
    { t: 'diff', ts: 1200, s: 'BTCUSDT', U: 511, u: 520, pu: 510,
      b: [['99', '0']], a: [['103', '4']] },
    // trades
    { t: 'trade', ts: 1300, s: 'BTCUSDT', p: '101', q: '3', m: false },   // buy aggressor
    { t: 'trade', ts: 1400, s: 'BTCUSDT', p: '100', q: '6', m: true  },   // sell aggressor
    { t: 'trade', ts: 1500, s: 'BTCUSDT', p: '100', q: '12', m: true  },  // sell aggressor
  ];

  const tape = loadTape(syntheticEvents);

  // ── T1: bookAt(ts) — no snap before ts → null ───────────────────────────────
  ok(tape.bookAt(999) === null, 'T1: bookAt before any snap → null');

  // ── T2: bookAt at snap time → matches snap data ──────────────────────────────
  const b1000 = tape.bookAt(1000);
  ok(b1000 !== null, 'T2a: bookAt(1000) is not null');
  ok(b1000 && b1000.topBids[0].price === 100, `T2b: best bid at t=1000 = 100 (got ${b1000?.topBids[0]?.price})`);
  ok(b1000 && b1000.topAsks[0].price === 101, `T2c: best ask at t=1000 = 101 (got ${b1000?.topAsks[0]?.price})`);
  ok(b1000 && near(b1000.mid, 100.5), `T2d: mid at t=1000 = 100.5 (got ${b1000?.mid})`);

  // ── T3: bookAt(1100) — diffs applied: bid 100→15, ask 101 deleted, ask 102→6 ─
  const b1100 = tape.bookAt(1100);
  ok(b1100 !== null, 'T3a: bookAt(1100) not null');
  ok(b1100 && b1100.bids.get('100') === 15, `T3b: bid 100 size=15 after diff (got ${b1100?.bids.get('100')})`);
  ok(b1100 && !b1100.asks.has('101'), 'T3c: ask 101 deleted by diff (qty=0)');
  ok(b1100 && b1100.asks.get('102') === 6, `T3d: ask 102 size=6 after diff (got ${b1100?.asks.get('102')})`);
  // best ask is now 102
  ok(b1100 && b1100.topAsks[0].price === 102, `T3e: best ask at t=1100 = 102 (got ${b1100?.topAsks[0]?.price})`);

  // ── T4: bookAt(1200) — second diff applied: bid 99 deleted, ask 103 added ────
  const b1200 = tape.bookAt(1200);
  ok(b1200 && !b1200.bids.has('99'), 'T4a: bid 99 deleted by second diff');
  ok(b1200 && b1200.asks.get('103') === 4, `T4b: ask 103 added (got ${b1200?.asks.get('103')})`);

  // ── T5: tradesBetween ────────────────────────────────────────────────────────
  const trades_all = tape.tradesBetween(1300, 1500);
  ok(trades_all.length === 3, `T5a: 3 trades in [1300,1500] (got ${trades_all.length})`);
  ok(trades_all[0].aggressorSide === 'buy', `T5b: first trade aggressorSide=buy (m=false) (got ${trades_all[0]?.aggressorSide})`);
  ok(trades_all[1].aggressorSide === 'sell', `T5c: second trade aggressorSide=sell (m=true) (got ${trades_all[1]?.aggressorSide})`);
  ok(trades_all[0].tradePrice === 101, `T5d: first trade price=101 (got ${trades_all[0]?.tradePrice})`);
  ok(trades_all[1].tradeSize === 6, `T5e: second trade size=6 (got ${trades_all[1]?.tradeSize})`);

  const trades_partial = tape.tradesBetween(1350, 1400);
  ok(trades_partial.length === 1 && trades_partial[0].ts === 1400, `T5f: tradesBetween(1350,1400) = 1 trade at t=1400`);

  // ── T6: bookSeries ──────────────────────────────────────────────────────────
  const series = tape.bookSeries(1000, 1200, 100);
  ok(series.length === 3, `T6a: bookSeries(1000,1200,100) yields 3 points (got ${series.length})`);
  ok(series[0].ts === 1000 && isNum(series[0].mid), 'T6b: first series point has ts=1000 + valid mid');
  ok(series[1].ts === 1100, 'T6c: second series point at ts=1100');
  // mid at t=1100: best bid=100, best ask=102 → mid=101
  ok(series[1] && near(series[1].mid, 101), `T6d: mid at t=1100 = 101 (got ${series[1]?.mid})`);

  // ── T7: simulateOrder — fills ONLY after queueAhead consumed ─────────────────
  //
  // Join at t=1000: buy order at price=100, size=5.
  // queueAheadAtJoin = book.bids.get('100') = 10 (from snap).
  // Trades hitting our level (sell aggressor, price ≤ 100):
  //   t=1400: price=100, qty=6 sell → drains queue from 10→4 (no fill yet, queue not zero)
  //   t=1500: price=100, qty=12 sell → drains remaining queue 4→0, then fills us: min(5,8)=5
  //
  // Result: filled=true, fillTs=1500

  const simFill = tape.simulateOrder({ side: 'buy', price: 100, size: 5, joinTs: 1000, horizonSec: 1 });
  ok(simFill.queueAheadAtJoin === 10, `T7a: queueAheadAtJoin=10 at price=100 (got ${simFill.queueAheadAtJoin})`);
  ok(simFill.filled === true, `T7b: order fills after queueAhead consumed (filled=${simFill.filled})`);
  ok(simFill.fillTs === 1500, `T7c: fills at t=1500 (got ${simFill.fillTs})`);
  ok(simFill.fillQty === 5, `T7d: fillQty=5 (got ${simFill.fillQty})`);
  ok(isNum(simFill.timeInBookMs) && simFill.timeInBookMs === 500, `T7e: timeInBookMs=500 (got ${simFill.timeInBookMs})`);

  // ── T8: simulateOrder — price never trades through → no fill ─────────────────
  //
  // Ask order at price=105 (no buy aggressor ever hits 105). horizonSec=2 → no fill.

  const simNoFill = tape.simulateOrder({ side: 'sell', price: 105, size: 2, joinTs: 1000, horizonSec: 2 });
  ok(simNoFill.filled === false, `T8a: sell@105 never fills (price never trades there) (got ${simNoFill.filled})`);
  ok(simNoFill.fillTs === null, `T8b: fillTs=null when not filled (got ${simNoFill.fillTs})`);

  // ── T9: fail-open guards ─────────────────────────────────────────────────────
  ok(loadTape(null) instanceof Tape, 'T9a: loadTape(null) → empty Tape (fail-open)');
  ok(loadTape([]) instanceof Tape, 'T9b: loadTape([]) → empty Tape');
  ok(tape.bookAt(NaN) === null, 'T9c: bookAt(NaN) → null');
  ok(tape.tradesBetween(NaN, 1) .length === 0, 'T9d: tradesBetween bad args → []');
  ok(tape.bookSeries(1, 0, 100).length === 0, 'T9e: bookSeries t1<t0 → []');
  ok(tape.simulateOrder({}).filled === false, 'T9f: simulateOrder bad args → fail-open noFill');

  // ── T10: loadTape with JSONL string lines (via array → same path, already tested above)
  //         Verify JSONL file parsing path via a quick round-trip through parseLine.
  const jsonlLine = JSON.stringify({ t: 'snap', ts: 2000, s: 'BTCUSDT', lastUpdateId: 999, bids: [['50000', '1']], asks: [['50001', '1']] });
  const tapeFromArray = loadTape([JSON.parse(jsonlLine)]);
  const b2000 = tapeFromArray.bookAt(2000);
  ok(b2000 && near(b2000.mid, 50000.5), `T10: loadTape from array, bookAt round-trip mid=50000.5 (got ${b2000?.mid})`);

  // ── Result ───────────────────────────────────────────────────────────────────
  console.log(`tape-replay --test: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}
