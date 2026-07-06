#!/usr/bin/env node
// @capability: nautilus-adapter
// @serves: nautilus order book translation | OrderBookDepth10 | OrderBookDelta | Databento MBP-10 | tape recorder equities futures | JSONL tape contract | book seam | OFI snapshots from nautilus | OBI signals from nautilus
// @does: The nautilus/Databento → YURI data-translation seam (MURE nautilusAdapterBoundary + build-correction C3): OrderBookDepth10 → the canonical {bids,asks,mid,spreadBps,ts,symbol} book computeOrderBookImbalance consumes; OrderBookDelta → a maintained L2 book emitting the {ts,bidPx,bidSz,askPx,askSz} snapshot pairs ofiContribution expects; and a tape recorder emitting the EXACT snap/diff/trade JSONL line contract tape-replay.mjs already consumes — so OFI/OBI/edge-audit/decision-sim/horizon-ladder light up on ES/NQ with ZERO downstream rewrite.
// @use: depth10ToBook(d10) per MBP-10 event; createDeltaBook() for MBO delta streams feeding OFI; createTapeRecorder({market}) to write replayable tapes; obiSignalsFromDepth10 for direct OBI signals. DISARMED-first: without _SYSTEM/state/mure-nautilus-adapter.enabled every export returns null (callers fall through to the existing Binance depth-book path).
// @exports: depth10ToBook, createDeltaBook, createTapeRecorder, ofiSnapshotsFromDepth10s, obiSignalsFromDepth10
//
// MURE nautilusAdapterBoundary (MURE_GAP_SEAM_DESIGN_2026-07-06.mjs). Pure translation leaf —
// no network (nautilus events are INJECTED from the python side or fixtures); no reverse path
// (YURI never sends book state back to nautilus).
//
// INPUT SHAPES (nautilus_trader v2, Lane A — Databento mapping MBO→OrderBookDelta, MBP_10→OrderBookDepth10):
//   OrderBookDepth10: { bids:[{price,size}×≤10], asks:[{price,size}×≤10], instrument_id, ts_event }
//   OrderBookDelta:   { action:'Add'|'Update'|'Delete'|'Clear', order:{price,size,side:'Buy'|'Sell'}, instrument_id, ts_event }
//   TradeTick:        { price, size, aggressor_side:'BUYER'|'SELLER', trade_id, instrument_id, ts_event }
//   ts_event: unix-NANOSECONDS (u64 — number | bigint | string all accepted).
//
// TIMESTAMP CONVENTIONS (three seams, three units — deliberate, documented):
//   book/signal surfaces (depth10ToBook, OBI signals) → unix-SECONDS (orchestrator convention)
//   ofi snapshot pairs (createDeltaBook, ofiSnapshotsFromDepth10s) → unix-SECONDS (ofi uses ts for ordering only)
//   tape JSONL lines (createTapeRecorder) → unix-MILLISECONDS (tape-replay's native unit: horizonSec*1000 math)
//
// TAPE LINE CONTRACT (Lane B §10/§12 — the true interchange contract; verified round-trip in tests):
//   {"t":"snap","ts":ms,"s":sym,"lastUpdateId":n,"bids":[["p","q"]...],"asks":[[...]]}
//   {"t":"diff","ts":ms,"s":sym,"U":n,"u":n,"pu":n,"b":[["p","q"]...],"a":[...]}   (q "0" = delete)
//   {"t":"trade","ts":ms,"s":sym,"a":id,"p":price,"q":qty,"m":isBuyerMaker}
//   m mapping: aggressor SELLER → the buyer was the maker → m=true → tape-replay aggressorSide 'sell'.
//   Line builders REUSED from observatory/tape-recorder.mjs (buildSnapLine/buildDiffLine/buildTradeLine)
//   — the format is never re-implemented here.
//
// DISARMED CONTRACT: flag _SYSTEM/state/mure-nautilus-adapter.enabled (creation owner-gated;
// MURE_FLAG_DIR is the unit-test sandbox override only). Disarmed → EVERY export returns null.
// No throw, no console spam.

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { applyLevels, extractTopN } from '../observatory/depth-book.mjs';
import { buildSnapLine, buildDiffLine, buildTradeLine } from '../observatory/tape-recorder.mjs';
import { computeOrderBookImbalance } from '../orderbook-imbalance.mjs';
import { resolveYuriMarket } from '../instrument-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLAG_NAME = 'mure-nautilus-adapter.enabled';
const FLAG_PATH = () => path.join(
  process.env.MURE_FLAG_DIR || path.resolve(__dirname, '..', '..', '..', 'state'),
  FLAG_NAME,
);
const armed = () => { try { return existsSync(FLAG_PATH()); } catch { return false; } };

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** unix-nanos (number|bigint|string) → { sec, ms } — null on garbage. */
function fromNanos(tsEvent) {
  let ns;
  if (typeof tsEvent === 'bigint') ns = Number(tsEvent);
  else if (typeof tsEvent === 'string') ns = Number(tsEvent);
  else ns = tsEvent;
  if (!isNum(ns) || ns < 0) return null;
  return { sec: ns / 1e9, ms: ns / 1e6 };
}

/** Normalize one nautilus BookLevel-ish entry → {price,size} or null. */
function level(l) {
  const price = Number(l?.price);
  const size = Number(l?.size);
  if (!isNum(price) || !isNum(size) || size < 0) return null;
  return { price, size };
}

// ═══════════════════════════════════════════════════════════════════════════
// depth10ToBook — the L2 seam (OrderBookDepth10 / Databento MBP-10 → YURI book).
// ═══════════════════════════════════════════════════════════════════════════
/**
 * @param {{bids:object[], asks:object[], instrument_id?:string, ts_event?:number|bigint|string}} depth10
 * @param {{market?:string}} [opts]  market overrides the instrument-registry reverse lookup
 * @returns {{bids:{price,size}[], asks:{price,size}[], mid:number, spreadBps:number, ts:number, symbol:string}|null}
 *   bids sorted DESC, asks ASC, zero-size levels dropped. Crossed/one-sided books → null (fail-open;
 *   ofi/obi both refuse crossed books anyway — refusing here keeps garbage out of every consumer).
 */
export function depth10ToBook(depth10, { market } = {}) {
  if (!armed()) return null;
  try {
    if (!depth10 || !Array.isArray(depth10.bids) || !Array.isArray(depth10.asks)) return null;
    const t = fromNanos(depth10.ts_event ?? depth10.ts);
    if (!t) return null;
    const bids = depth10.bids.map(level).filter((l) => l && l.size > 0).sort((a, b) => b.price - a.price);
    const asks = depth10.asks.map(level).filter((l) => l && l.size > 0).sort((a, b) => a.price - b.price);
    if (bids.length === 0 || asks.length === 0) return null;
    if (bids[0].price >= asks[0].price) return null; // crossed/locked → refuse (fail-open)
    const mid = (bids[0].price + asks[0].price) / 2;
    const spreadBps = ((asks[0].price - bids[0].price) / mid) * 1e4;
    const symbol = (typeof market === 'string' && market)
      || resolveYuriMarket(depth10.instrument_id)
      || (typeof depth10.instrument_id === 'string' ? depth10.instrument_id : '');
    return { bids, asks, mid, spreadBps, ts: t.sec, symbol };
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════
// createDeltaBook — the MBO seam (OrderBookDelta stream → maintained book → OFI snapshots).
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Maintains an L2 book from nautilus OrderBookDelta events and emits the best-level
 * {ts, bidPx, bidSz, askPx, askSz} snapshot ofiContribution(prev, curr) expects.
 * Level semantics: Add/Update = absolute SET at order.price (size 0 = delete); Delete = remove;
 * Clear = wipe both sides. (Aggregated-by-price L2 view of the MBO stream — the same reduction
 * Databento MBP does; per-order queue identity is not tracked at this seam.)
 *
 * @returns {{apply:(delta)=>object|null, best:()=>object|null, topN:(n?)=>{bids,asks}}|null}
 *   apply → the post-event snapshot (null while one side is empty or book is crossed).
 */
export function createDeltaBook() {
  if (!armed()) return null;
  const bids = new Map();
  const asks = new Map();
  let lastTs = null;

  const best = () => {
    const { bids: tb, asks: ta } = extractTopN(bids, asks, 1);
    if (tb.length === 0 || ta.length === 0) return null;
    if (tb[0].price >= ta[0].price) return null; // crossed → no snapshot (ofi would skip it anyway)
    return { ts: lastTs, bidPx: tb[0].price, bidSz: tb[0].size, askPx: ta[0].price, askSz: ta[0].size };
  };

  return {
    apply(delta) {
      try {
        if (!delta || typeof delta.action !== 'string') return null;
        const t = fromNanos(delta.ts_event ?? delta.ts);
        if (t) lastTs = t.sec;
        const action = delta.action;
        if (action === 'Clear') { bids.clear(); asks.clear(); return null; }
        const o = delta.order || {};
        const price = Number(o.price);
        const size = Number(o.size);
        const side = o.side === 'Buy' ? bids : o.side === 'Sell' ? asks : null;
        if (!side || !isNum(price)) return null;
        if (action === 'Delete') applyLevels(side, [[String(price), '0']]);
        else if (action === 'Add' || action === 'Update') {
          if (!isNum(size)) return null;
          applyLevels(side, [[String(price), String(size)]]); // 0 → delete, else absolute set (REUSED semantics)
        } else return null; // unknown action → ignore, fail-open
        return best();
      } catch { return null; }
    },
    best,
    topN(n = 10) { return extractTopN(bids, asks, n); },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// createTapeRecorder — C3: the ONE new recorder; downstream reuses unchanged.
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Translates nautilus/Databento events into the tape JSONL contract. Snap/diff strategy for an
 * MBP-10 stream (each event is a FULL top-10 state): emit a 'snap' line on the first frame and
 * every snapEveryMs thereafter; between snaps emit 'diff' lines carrying only the CHANGED levels
 * (removed levels as qty "0") — exactly the absolute-set/delete semantics tape-replay's
 * applyLevels applies. Trades map aggressor_side → the Binance m flag tape-replay classifies.
 *
 * Writing to disk is the CALLER's job (this stays pure/testable): each handler returns the JSON
 * line string to append, or null when nothing should be emitted.
 *
 * @param {{market?:string, snapEveryMs?:number}} [opts]
 * @returns {{onDepth10:(d10)=>string|null, onTrade:(tick)=>string|null}|null}
 */
export function createTapeRecorder({ market, snapEveryMs = 120_000 } = {}) {
  if (!armed()) return null;
  let prevBids = null; // Map<priceStr, size>
  let prevAsks = null;
  let lastSnapMs = -Infinity;
  let seq = 0;

  const toMap = (levels) => {
    const m = new Map();
    for (const l of levels) m.set(String(l.price), l.size);
    return m;
  };
  /** Changed levels prev→curr as [["p","q"]...] with removals as "0" (absolute-set contract). */
  const diffSide = (prev, curr) => {
    const out = [];
    for (const [p, s] of curr) { if (!prev.has(p) || prev.get(p) !== s) out.push([p, String(s)]); }
    for (const p of prev.keys()) { if (!curr.has(p)) out.push([p, '0']); }
    return out;
  };

  return {
    onDepth10(d10) {
      try {
        if (!d10 || !Array.isArray(d10.bids) || !Array.isArray(d10.asks)) return null;
        const t = fromNanos(d10.ts_event ?? d10.ts);
        if (!t) return null;
        const ts = Math.round(t.ms);
        const s = (typeof market === 'string' && market)
          || (typeof d10.instrument_id === 'string' ? d10.instrument_id : 'UNKNOWN');
        const bids = d10.bids.map(level).filter((l) => l && l.size > 0);
        const asks = d10.asks.map(level).filter((l) => l && l.size > 0);
        const bidMap = toMap(bids);
        const askMap = toMap(asks);
        seq += 1;
        if (prevBids === null || ts - lastSnapMs >= snapEveryMs) {
          prevBids = bidMap; prevAsks = askMap; lastSnapMs = ts;
          return buildSnapLine({ ts, s, lastUpdateId: seq, bids, asks }); // REUSED builder
        }
        const b = diffSide(prevBids, bidMap);
        const a = diffSide(prevAsks, askMap);
        prevBids = bidMap; prevAsks = askMap;
        if (b.length === 0 && a.length === 0) return null; // no change → no line
        return buildDiffLine({ E: ts, s, U: seq, u: seq, pu: seq - 1, b, a }); // REUSED builder
      } catch { return null; }
    },
    onTrade(tick) {
      try {
        if (!tick) return null;
        const t = fromNanos(tick.ts_event ?? tick.ts);
        const price = Number(tick.price);
        const qty = Number(tick.size ?? tick.qty);
        if (!t || !isNum(price) || !isNum(qty) || qty <= 0) return null;
        const aggr = String(tick.aggressor_side ?? tick.aggressorSide ?? '').toUpperCase();
        if (aggr !== 'BUYER' && aggr !== 'SELLER') return null; // NO_AGGRESSOR etc → skip (fail-open)
        const s = (typeof market === 'string' && market)
          || (typeof tick.instrument_id === 'string' ? tick.instrument_id : 'UNKNOWN');
        return buildTradeLine({ // REUSED builder
          ts: Math.round(t.ms), symbol: s,
          aggId: tick.trade_id ?? tick.aggId ?? null,
          price, qty,
          isBuyerMaker: aggr === 'SELLER', // seller aggresses → buyer was the maker → m=true → 'sell'
        });
      } catch { return null; }
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Convenience wires — straight into the existing pure-math consumers.
// ═══════════════════════════════════════════════════════════════════════════
/**
 * ofiSnapshotsFromDepth10s(frames) → [{ts, bidPx, bidSz, askPx, askSz}] — the chronological
 * snapshot array computeOFI(snapshots) consumes directly. Invalid/crossed/one-sided frames are
 * dropped (computeOFI's own guards would skip them; dropping keeps avgDepth honest).
 */
export function ofiSnapshotsFromDepth10s(frames) {
  if (!armed()) return null;
  if (!Array.isArray(frames)) return [];
  const out = [];
  for (const f of frames) {
    const b = depth10ToBook(f, { market: 'x' }); // market irrelevant for the snapshot fields
    if (!b) continue;
    out.push({ ts: b.ts, bidPx: b.bids[0].price, bidSz: b.bids[0].size, askPx: b.asks[0].price, askSz: b.asks[0].size });
  }
  return out;
}

/**
 * obiSignalsFromDepth10(d10, opts) → signal[] — one hop to computeOrderBookImbalance (REUSED):
 * translate the frame, hand the canonical book straight to the existing OBI/microprice factor.
 */
export function obiSignalsFromDepth10(depth10, { market, levels, threshold } = {}) {
  if (!armed()) return null;
  const book = depth10ToBook(depth10, { market });
  if (!book) return [];
  return computeOrderBookImbalance(book, {
    market: book.symbol,
    ts: Math.floor(book.ts),
    ...(isNum(levels) ? { levels } : {}),
    ...(isNum(threshold) ? { threshold } : {}),
  });
}

export default { depth10ToBook, createDeltaBook, createTapeRecorder, ofiSnapshotsFromDepth10s, obiSignalsFromDepth10 };

// ── CLI smoke: node adapters/nautilus-adapter.mjs --smoke ────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--smoke')) {
  console.log(`armed=${armed()} flag=${FLAG_PATH()}`);
  const NS = 1_750_000_000n * 1_000_000_000n;
  const d10 = {
    instrument_id: 'ESM6.GLBX', ts_event: NS,
    bids: [{ price: 5000.25, size: 12 }, { price: 5000.0, size: 30 }],
    asks: [{ price: 5000.5, size: 9 }, { price: 5000.75, size: 22 }],
  };
  console.log('book:', JSON.stringify(depth10ToBook(d10)));
  console.log('obi :', JSON.stringify(obiSignalsFromDepth10(d10, { market: 'ES-USD' })));
}
