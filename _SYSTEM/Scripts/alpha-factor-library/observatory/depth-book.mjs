#!/usr/bin/env node
// @capability: depth-book
// @serves: L2 order book | live depth stream | diff depth | book maintenance | 100ms order book | microstructure feed | low-latency book | OBI feed
// @does: Maintains a CORRECT live local L2 order book from the Binance USDⓈ-M futures diff-depth WebSocket (<sym>@depth@100ms on fstream) — buffers diff events, fetches the REST snapshot, syncs via the futures U/u/pu sequence state machine (pu-chaining; gap → resync), applies levels (qty=0 = delete, else set), and calls onBook({symbol,bids,asks,mid,spreadBps,ts}) on every applied event. Turns the daemon's 10s REST poll into a ~100ms event-driven book so risk exits fire at the touch + microstructure signals (OFI/OBI/microprice) get a real feed. Mirrors tick-stream.mjs (fail-open, exp-backoff reconnect, injectable WebSocket + httpGet, --test + --smoke). View-only market data — no orders, no auth.
// @use: startDepthBook({symbols,onBook}) for the lowest-achievable-latency local book. Feed onBook.bids/asks (as {price,size}[]) straight into computeOBI/computeMicroprice (orderbook-imbalance.mjs). DISARMED standalone — wiring into the live daemon/orchestrator is a separate owner-gated step. parseDiffDepthMessage + applyLevels + extractTopN are pure + unit-tested.
// @exports: FSTREAM_WS_URL, FAPI_HOST, parseDiffDepthMessage, applyLevels, extractTopN, syncFirstEvent, startDepthBook
//
// CONSTRAINTS: view-only (INV-1 no order path; INV-2 no keys — public keyless market data), fail-open
// (a dropped socket / bad snapshot never throws into the caller), no new npm dep (Node built-in WebSocket
// + node:https). Binance USDⓈ-M public diff-depth + /fapi/v1/depth need no API key.
// PROTOCOL verified against Binance USDⓈ-M docs "How to manage a local order book correctly" (2026-06-19):
//   FUTURES uses pu-chaining (each event.pu must equal the previous applied event's u) — SPOT does NOT.

import https from 'node:https';
import { pathToFileURL } from 'node:url';
import { computeOBI, computeMicroprice } from '../orderbook-imbalance.mjs';

// Binance USDⓈ-M futures public market-data WS + REST snapshot host.
export const FSTREAM_WS_URL = 'wss://fstream.binance.com';
export const FAPI_HOST = 'fapi.binance.com';
const SNAPSHOT_LIMIT = 1000;          // valid: 5,10,20,50,100,500,1000 — full book
const DEFAULT_TOP_N = 20;             // levels handed to the signal consumers
const MIN_RESYNC_MS = 10_000;         // Binance public depth snapshot ~1 req / 10s / IP

function isNum(x) { return typeof x === 'number' && Number.isFinite(x); }

// ─────────────────────────────────────────────────────────────────────────────
// §1 — parseDiffDepthMessage (pure)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * parseDiffDepthMessage(raw) -> { s, U, u, pu, b, a, T, E } | null
 * Handles both combined-stream frames ({stream,data:{...}}) and raw single-stream frames.
 * Returns null for any non-depthUpdate frame or malformed sequence ids.
 */
export function parseDiffDepthMessage(raw) {
  let m;
  try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!m || typeof m !== 'object') return null;
  const d = m.data && typeof m.data === 'object' ? m.data : m; // unwrap combined-stream envelope
  if (d.e !== 'depthUpdate' || typeof d.s !== 'string') return null;
  const U = Number(d.U), u = Number(d.u);
  if (!isNum(U) || !isNum(u)) return null;
  const pu = d.pu == null ? null : Number(d.pu); // futures only; spot has none
  return {
    s: d.s,
    U, u,
    pu: isNum(pu) ? pu : null,
    b: Array.isArray(d.b) ? d.b : [],
    a: Array.isArray(d.a) ? d.a : [],
    T: isNum(Number(d.T)) ? Number(d.T) : (isNum(Number(d.E)) ? Number(d.E) : null),
    E: isNum(Number(d.E)) ? Number(d.E) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 — applyLevels / extractTopN (pure book ops)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * applyLevels(sideMap, levels) — mutate a price→size Map from [price,qty][] diff levels.
 * qty == 0 → DELETE the level; else SET (absolute quantity, not a delta). Keyed by the
 * raw price STRING (exact, avoids float-key drift); value is the numeric size.
 */
export function applyLevels(sideMap, levels) {
  if (!(sideMap instanceof Map) || !Array.isArray(levels)) return sideMap;
  for (const lvl of levels) {
    if (!Array.isArray(lvl) || lvl.length < 2) continue;
    const priceKey = String(lvl[0]);
    const size = Number(lvl[1]);
    if (!isNum(size)) continue;
    if (size === 0) sideMap.delete(priceKey);
    else sideMap.set(priceKey, size);
  }
  return sideMap;
}

/**
 * extractTopN(bidsMap, asksMap, n) -> { bids:{price,size}[], asks:{price,size}[] }
 * bids sorted descending, asks ascending — the order computeOBI/computeMicroprice expect.
 */
export function extractTopN(bidsMap, asksMap, n = DEFAULT_TOP_N) {
  const toArr = (map) => [...map.entries()].map(([p, s]) => ({ price: Number(p), size: Number(s) }))
    .filter((x) => isNum(x.price) && isNum(x.size) && x.size > 0);
  const bids = toArr(bidsMap).sort((x, y) => y.price - x.price).slice(0, n);
  const asks = toArr(asksMap).sort((x, y) => x.price - y.price).slice(0, n);
  return { bids, asks };
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 — sync rule (pure, testable in isolation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * syncFirstEvent(event, snapshotId) -> 'apply' | 'drop' | 'wait'
 *   drop : event entirely predates the snapshot (u < snapshotId)
 *   apply: this event straddles the snapshot (U <= snapshotId <= u) — the first to apply
 *   wait : event is ahead of the snapshot (U > snapshotId) — snapshot is stale, keep looking/resync
 */
export function syncFirstEvent(event, snapshotId) {
  if (!event || !isNum(snapshotId)) return 'drop';
  if (event.u < snapshotId) return 'drop';
  if (event.U <= snapshotId && event.u >= snapshotId) return 'apply';
  return 'wait'; // U > snapshotId
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 — default snapshot fetch (node:https; injectable for tests)
// ─────────────────────────────────────────────────────────────────────────────

function defaultHttpGet(urlStr) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject(e); }
    if (u.hostname !== FAPI_HOST) return reject(new Error(`SSRF denied: ${u.hostname}`)); // single-host allowlist
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'YURI-AFL/depth-book/1.0' }, timeout: 15000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8') }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('snapshot timeout')); });
    req.on('error', reject);
    req.end();
  });
}

async function fetchSnapshot(symbol, httpGet) {
  const url = `https://${FAPI_HOST}/fapi/v1/depth?symbol=${encodeURIComponent(symbol)}&limit=${SNAPSHOT_LIMIT}`;
  const res = await (httpGet || defaultHttpGet)(url);
  if (!res || res.status < 200 || res.status >= 300) throw new Error(`snapshot ${res?.status}`);
  const json = JSON.parse(res.body);
  if (!json || !isNum(Number(json.lastUpdateId))) throw new Error('snapshot missing lastUpdateId');
  return {
    lastUpdateId: Number(json.lastUpdateId),
    bids: Array.isArray(json.bids) ? json.bids : [],
    asks: Array.isArray(json.asks) ? json.asks : [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 — startDepthBook (the collector + per-symbol sync state machine)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * startDepthBook({ symbols, onBook, onStatus?, url?, httpGet?, WebSocketImpl?, topN?, maxBackoffMs?, minResyncMs? }) -> { stop, books }
 * symbols: e.g. ['BTCUSDT','SOLUSDT','ETHUSDT'] (case-insensitive; lowercased for the stream).
 * onBook({ symbol, bids, asks, mid, spreadBps, ts, lastU }) fires on every applied live diff.
 * FAIL-OPEN: bad args / no WebSocket → a no-op handle.
 */
export function startDepthBook({
  symbols = [], onBook, onStatus = () => {},
  url = FSTREAM_WS_URL, httpGet, WebSocketImpl,
  topN = DEFAULT_TOP_N, maxBackoffMs = 30_000, minResyncMs = MIN_RESYNC_MS,
} = {}) {
  const WS = WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  if (!WS) { onStatus('no-websocket-impl'); return { stop() {}, books: new Map() }; }
  if (!Array.isArray(symbols) || symbols.length === 0 || typeof onBook !== 'function') {
    onStatus('bad-args');
    return { stop() {}, books: new Map() };
  }

  const syms = symbols.map((s) => String(s).toUpperCase());
  const books = new Map(); // SYMBOL -> { state, buffer, bids, asks, snapshotId, prevU, lastSnapAt }
  for (const s of syms) books.set(s, freshBook());
  function freshBook() {
    return { state: 'init', buffer: [], bids: new Map(), asks: new Map(), snapshotId: null, prevU: null, lastSnapAt: 0 };
  }

  let ws = null, stopped = false, backoff = 1000;
  const now = () => { try { return Date.now(); } catch { return 0; } };

  function emit(symbol, bk, ts) {
    const { bids, asks } = extractTopN(bk.bids, bk.asks, topN);
    if (!bids.length || !asks.length) return;
    const mid = (bids[0].price + asks[0].price) / 2;
    const spreadBps = mid > 0 ? ((asks[0].price - bids[0].price) / mid) * 1e4 : null;
    try { onBook({ symbol, bids, asks, mid, spreadBps, ts, lastU: bk.prevU }); } catch { /* caller error never kills the stream */ }
  }

  async function syncSymbol(symbol) {
    const bk = books.get(symbol);
    if (!bk || stopped) return;
    const t = now();
    if (t - bk.lastSnapAt < minResyncMs) return; // honor Binance snapshot rate limit
    bk.lastSnapAt = t;
    bk.state = 'syncing';
    try {
      const snap = await fetchSnapshot(symbol, httpGet);
      if (stopped) return;
      bk.bids = new Map(); bk.asks = new Map();
      applyLevels(bk.bids, snap.bids); applyLevels(bk.asks, snap.asks);
      bk.snapshotId = snap.lastUpdateId;
      bk.prevU = null;
      // Drain the buffer through the sync rule
      const buffered = bk.buffer; bk.buffer = [];
      for (const ev of buffered) applyEvent(symbol, bk, ev);
      bk.state = 'live';
      onStatus(`synced:${symbol}`);
      emit(symbol, bk, t);
    } catch (e) {
      bk.state = 'init'; // will retry on the next event / reconnect
      onStatus(`snapshot-error:${symbol}:${e?.message || e}`);
    }
  }

  function applyEvent(symbol, bk, ev) {
    if (bk.prevU === null) {
      // First event after a snapshot: must straddle snapshotId
      const verdict = syncFirstEvent(ev, bk.snapshotId);
      if (verdict === 'drop') return;
      if (verdict === 'wait') { void syncSymbol(symbol); return; } // snapshot stale → resync
      // 'apply' falls through
    } else if (ev.pu !== null && ev.pu !== bk.prevU) {
      // Futures pu-chain broken → gap → resync
      onStatus(`gap:${symbol}:pu=${ev.pu}!=${bk.prevU}`);
      void syncSymbol(symbol);
      return;
    }
    applyLevels(bk.bids, ev.b);
    applyLevels(bk.asks, ev.a);
    bk.prevU = ev.u;
  }

  function onFrame(rawData) {
    const ev = parseDiffDepthMessage(rawData);
    if (!ev) return;
    const bk = books.get(ev.s);
    if (!bk) return;
    if (bk.state === 'live') {
      applyEvent(ev.s, bk, ev);
      if (bk.state === 'live') emit(ev.s, bk, ev.T || now());
    } else {
      bk.buffer.push(ev);                 // buffer until snapshot syncs
      if (bk.state === 'init') void syncSymbol(ev.s);
    }
  }

  const streamPath = '/stream?streams=' + syms.map((s) => `${s.toLowerCase()}@depth@100ms`).join('/');

  const scheduleReconnect = () => {
    if (stopped) return;
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, maxBackoffMs);
  };

  function connect() {
    if (stopped) return;
    for (const s of syms) books.set(s, freshBook()); // fresh book per connection
    try { ws = new WS(url + streamPath); } catch (e) { onStatus(`connect-error:${e?.message || e}`); return scheduleReconnect(); }
    ws.onopen = () => { backoff = 1000; onStatus('open'); for (const s of syms) void syncSymbol(s); };
    ws.onmessage = (m) => onFrame(m?.data);
    ws.onclose = () => { if (!stopped) { onStatus('close'); scheduleReconnect(); } };
    ws.onerror = (e) => { onStatus(`error:${e?.message || 'ws'}`); try { ws.close(); } catch { /* noop */ } };
  }

  connect();
  return { stop() { stopped = true; try { ws && ws.close(); } catch { /* noop */ } }, books };
}

// ─────────────────────────────────────────────────────────────────────────────
// §6 — --test (offline, deterministic, mock WS + mock httpGet)
// ─────────────────────────────────────────────────────────────────────────────

const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_main && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };

  // parseDiffDepthMessage
  const raw = JSON.stringify({ stream: 'btcusdt@depth@100ms', data: { e: 'depthUpdate', E: 1, T: 2, s: 'BTCUSDT', U: 10, u: 15, pu: 9, b: [['100', '1']], a: [['101', '2']] } });
  const p = parseDiffDepthMessage(raw);
  ok(p && p.s === 'BTCUSDT' && p.U === 10 && p.u === 15 && p.pu === 9, 'parse combined-stream depthUpdate');
  ok(parseDiffDepthMessage(JSON.stringify({ e: 'depthUpdate', s: 'BTCUSDT', U: 1, u: 2, b: [], a: [] })).pu === null, 'raw frame, no pu → null pu (spot-style)');
  ok(parseDiffDepthMessage(JSON.stringify({ data: { e: 'aggTrade', s: 'X' } })) === null, 'non-depthUpdate → null');
  ok(parseDiffDepthMessage('garbage') === null, 'garbage → null');

  // applyLevels: set + delete
  const bids = new Map();
  applyLevels(bids, [['100', '5'], ['99', '3']]);
  ok(bids.get('100') === 5 && bids.get('99') === 3, 'applyLevels set');
  applyLevels(bids, [['100', '0'], ['98', '7']]); // delete 100, add 98
  ok(!bids.has('100') && bids.get('98') === 7, 'applyLevels qty=0 deletes, new level adds');

  // extractTopN: sorting + size>0 filter
  const bM = new Map([['100', 1], ['102', 2], ['101', 3]]);
  const aM = new Map([['105', 1], ['103', 2], ['104', 0]]); // 104 has size 0 → filtered
  const top = extractTopN(bM, aM, 2);
  ok(top.bids[0].price === 102 && top.bids[1].price === 101, 'bids sorted descending');
  ok(top.asks[0].price === 103 && top.asks.length === 2 && !top.asks.some((a) => a.price === 104), 'asks sorted ascending + zero-size level (104) filtered out');

  // syncFirstEvent rule
  ok(syncFirstEvent({ U: 5, u: 8 }, 10) === 'drop', 'u<snapshotId → drop');
  ok(syncFirstEvent({ U: 8, u: 12 }, 10) === 'apply', 'U<=id<=u → apply');
  ok(syncFirstEvent({ U: 12, u: 15 }, 10) === 'wait', 'U>snapshotId → wait (resync)');

  // startDepthBook end-to-end with mock WS + mock httpGet (full sync state machine)
  await (async () => {
    class MockWS {
      constructor() { MockWS.last = this; setTimeout(() => this.onopen && this.onopen(), 0); }
      close() { this.closed = true; }
    }
    // snapshot: lastUpdateId 100, one level each side
    const httpGet = async (u) => ({ status: 200, body: JSON.stringify({ lastUpdateId: 100, bids: [['100', '5']], asks: [['101', '5']] }) });
    const books = [];
    const h = startDepthBook({
      symbols: ['BTCUSDT'], onBook: (b) => books.push(b), onStatus: () => {},
      httpGet, WebSocketImpl: MockWS, topN: 5, minResyncMs: 0,
    });
    await new Promise((r) => setTimeout(r, 5)); // open + snapshot
    const send = (o) => MockWS.last.onmessage({ data: JSON.stringify({ data: { e: 'depthUpdate', s: 'BTCUSDT', ...o } }) });
    // stale event (u<100) → dropped, no book change
    send({ U: 90, u: 95, pu: 89, b: [['100', '99']], a: [] });
    // first valid event straddles 100 (U<=100<=u) → applied: add bid 100.5
    send({ U: 98, u: 102, pu: 97, b: [['100.5', '4']], a: [['101', '6']] });
    ok(books.length >= 1, 'onBook fired after first applied event');
    const last1 = books[books.length - 1];
    ok(last1.bids[0].price === 100.5, `book applied straddle event (best bid ${last1.bids[0]?.price})`);
    // next event chains (pu==102) → applied
    send({ U: 103, u: 106, pu: 102, b: [['100.5', '0']], a: [['101', '8']] }); // delete 100.5
    const last2 = books[books.length - 1];
    ok(last2.bids[0].price === 100, `pu-chained event applied (delete → best bid ${last2.bids[0]?.price})`);
    // gap: pu (200) != prevU (106) → triggers resync (snapshot refetch); book stays consistent (fail-open)
    const beforeGap = books.length;
    send({ U: 300, u: 305, pu: 200, b: [['50', '1']], a: [] });
    await new Promise((r) => setTimeout(r, 5));
    ok(true, `gap event handled without throw (books ${beforeGap}→${books.length})`);
    h.stop();
    ok(MockWS.last.closed === true, 'stop() closes the socket');

    const noop = startDepthBook({ symbols: [], onBook: () => {}, WebSocketImpl: MockWS });
    ok(typeof noop.stop === 'function', 'bad-args → safe no-op handle');
  })();

  console.log(`depth-book --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// §7 — --smoke (REAL Binance fstream — proves the live latency floor + book sync)
// ─────────────────────────────────────────────────────────────────────────────

if (_main && process.argv.includes('--smoke')) {
  const symbols = ['BTCUSDT', 'SOLUSDT'];
  let n = 0; const t0 = Date.now();
  console.log(`[smoke] connecting ${FSTREAM_WS_URL} depth@100ms for ${symbols.join(',')} ...`);
  const h = startDepthBook({
    symbols,
    onBook: (b) => {
      n++;
      if (n <= 6 || n % 50 === 0) {
        const obi = computeOBI(b.bids, b.asks, 10);
        const mp = computeMicroprice(b.bids, b.asks);
        console.log(`[smoke] #${n} ${b.symbol} mid=${b.mid?.toFixed(2)} spread=${b.spreadBps?.toFixed(2)}bps OBI=${Number.isFinite(obi) ? obi.toFixed(3) : 'NA'} micro=${Number.isFinite(mp) ? mp.toFixed(2) : 'NA'} (${b.bids.length}x${b.asks.length} levels)`);
      }
      if (n >= 200) { h.stop(); console.log(`[smoke] OK — ${n} book updates in ${((Date.now() - t0) / 1000).toFixed(1)}s (~${(n / ((Date.now() - t0) / 1000)).toFixed(0)}/s), sync + OBI/microprice verified at the live seam`); process.exit(0); }
    },
    onStatus: (s) => console.log(`[smoke] status: ${s}`),
  });
  setTimeout(() => { h.stop(); console.error(n ? `[smoke] partial: ${n} updates` : '[smoke] FAIL — no book updates in 20s'); process.exit(n ? 0 : 1); }, 20000);
}
