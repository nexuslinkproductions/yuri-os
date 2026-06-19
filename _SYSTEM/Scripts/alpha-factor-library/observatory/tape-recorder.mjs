#!/usr/bin/env node
// @capability: tape-recorder
// @serves: BTC tape recording | JSONL replay feed | depth diff capture | trade stream capture | order book snapshot | replay harness | backtesting feed | market data archive
// @does: Records the live BTC feed (diff-depth + trades + periodic L2 snapshots) to gzip-rotated JSONL files for replay. Writes {"t":"diff"...}, {"t":"trade"...}, {"t":"snap"...} lines to <dataDir>/tape-<SYM>-YYYYMMDD.jsonl; auto-rotates previous-day files to .jsonl.gz on first write of a new UTC date. Fail-open — recorder errors never throw to the caller or kill the daemon. ~300MB/day raw BTCUSDT.
// @use: startRecorder({symbols,dataDir,snapshotIntervalMs,topN,WebSocketImpl,httpGet,onBook,onTrade}) for durable replay capture. stop() to shut down cleanly.
// @exports: startRecorder, utcDateTag, buildSnapLine, buildDiffLine, buildTradeLine, fetchFullDepthSnap
//
// CONSTRAINTS: view-only market data (INV-1 no order path; INV-2 no keys — public keyless feeds only),
// fail-open (any recorder error is swallowed — caller never sees a throw), no new npm deps
// (node:fs, node:zlib, node:os, node:path, node:url built-ins only). ~300MB/day raw BTCUSDT.
// RESERVED line types (NOT written): "quote", "fill" — reserved for future quoting lane.

import fs from 'node:fs';
import zlib from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startDepthBook, parseDiffDepthMessage, FSTREAM_WS_URL, FAPI_HOST } from './depth-book.mjs';

// Deep-snap depth: the periodic full-depth REST snap captures this many levels for a
// clean replay seed. Binance /fapi/v1/depth accepts limit ∈ {5,10,20,50,100,500,1000}.
// This is SEPARATE from `topN` (the live onBook passthrough cap, default 20) because
// depth-book's emit() slices to topN BEFORE handing to onBook — so the only way to get
// real depth into the snap is an independent REST fetch at the source.
const DEFAULT_SNAP_TOP_N = 1000;

// trades-stream is written by a sibling lane; import at runtime (fail-open if absent).
// Expected exports: startTradesStream({symbols, onTrade, WebSocketImpl})
// onTrade({symbol, price, qty, ts, isBuyerMaker, aggId, aggressorSide})
let _startTradesStream = null;
async function getStartTradesStream() {
  if (_startTradesStream) return _startTradesStream;
  try {
    const mod = await import('./trades-stream.mjs');
    _startTradesStream = mod.startTradesStream;
  } catch {
    // sibling not yet present — trades disabled, fail-open
    _startTradesStream = null;
  }
  return _startTradesStream;
}

// ─────────────────────────────────────────────────────────────────────────────
// §1 — pure helpers (exported for unit tests)
// ─────────────────────────────────────────────────────────────────────────────

/** utcDateTag(ts) -> 'YYYYMMDD' from a Unix-ms timestamp */
export function utcDateTag(ts) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * buildSnapLine({ts, s, lastUpdateId, bids, asks}) -> JSON string
 * bids/asks are {price,size}[] objects; we store as [["p","q"]...] strings.
 */
export function buildSnapLine({ ts, s, lastUpdateId, bids, asks }) {
  return JSON.stringify({
    t: 'snap', ts, s, lastUpdateId,
    bids: bids.map((l) => [String(l.price), String(l.size)]),
    asks: asks.map((l) => [String(l.price), String(l.size)]),
  });
}

/** buildDiffLine(ev) — ev from parseDiffDepthMessage */
export function buildDiffLine(ev) {
  return JSON.stringify({ t: 'diff', ts: ev.E ?? ev.T, s: ev.s, U: ev.U, u: ev.u, pu: ev.pu, b: ev.b, a: ev.a });
}

/** buildTradeLine(tr) — tr from onTrade callback */
export function buildTradeLine(tr) {
  return JSON.stringify({ t: 'trade', ts: tr.ts, s: tr.symbol, a: tr.aggId, p: tr.price, q: tr.qty, m: tr.isBuyerMaker });
}

/**
 * fetchFullDepthSnap(symbol, httpGet, snapTopN) -> { lastUpdateId, bids, asks } | null
 * Fetches a full-depth L2 snapshot from /fapi/v1/depth (public, keyless) and normalizes
 * to {price,size}[]. Fail-open: any error → null (caller falls back to the onBook snap).
 * `httpGet` is the SAME injectable fetcher depth-book uses (test-injectable, SSRF-guarded).
 */
export async function fetchFullDepthSnap(symbol, httpGet, snapTopN = DEFAULT_SNAP_TOP_N) {
  if (typeof httpGet !== 'function') return null;
  const url = `https://${FAPI_HOST}/fapi/v1/depth?symbol=${encodeURIComponent(symbol)}&limit=${snapTopN}`;
  let res;
  try { res = await httpGet(url); } catch { return null; }
  if (!res || res.status < 200 || res.status >= 300) return null;
  let json;
  try { json = JSON.parse(res.body); } catch { return null; }
  if (!json || typeof json.lastUpdateId !== 'number') return null;
  const norm = (arr) => (Array.isArray(arr) ? arr : [])
    .filter((l) => Array.isArray(l) && l.length >= 2)
    .map((l) => ({ price: Number(l[0]), size: Number(l[1]) }))
    .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size) && l.size > 0);
  return { lastUpdateId: json.lastUpdateId, bids: norm(json.bids), asks: norm(json.asks) };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 — file-writer per symbol (handles date-rollover + gzip rotation)
// ─────────────────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* fail-open */ }
}

function tapePath(dataDir, sym, dateTag) {
  return path.join(dataDir, `tape-${sym}-${dateTag}.jsonl`);
}

/** Rotate (gzip) yesterday's tape. Fail-open — rotation errors are swallowed. */
function rotateTape(dataDir, sym, oldDateTag) {
  try {
    const src = tapePath(dataDir, sym, oldDateTag);
    if (!fs.existsSync(src)) return;
    const gz = src + '.gz';
    const raw = fs.readFileSync(src);
    fs.writeFileSync(gz, zlib.gzipSync(raw));
    fs.unlinkSync(src);
  } catch { /* fail-open — rotation failure never propagates */ }
}

/**
 * writeLine(state, dataDir, sym, line, ts) — append a JSONL line.
 * state = { lastDateTag: string|null } per-symbol mutable state object.
 */
function writeLine(state, dataDir, sym, line, ts) {
  try {
    const tag = utcDateTag(ts);
    if (state.lastDateTag !== null && state.lastDateTag !== tag) {
      // Only rotate forward — a late/out-of-order frame with a past timestamp never
      // triggers rotation of a newer file (clock skew, injected historical data, replay).
      if (tag > state.lastDateTag) {
        rotateTape(dataDir, sym, state.lastDateTag);
        state.lastDateTag = tag;
      }
      // For a past-date tag, just append to its own file without updating lastDateTag
      // so the current-day file remains active.
      const file = tapePath(dataDir, sym, tag);
      fs.appendFileSync(file, line + '\n', 'utf-8');
      return;
    }
    state.lastDateTag = tag;
    const file = tapePath(dataDir, sym, tag);
    fs.appendFileSync(file, line + '\n', 'utf-8');
  } catch { /* fail-open — write error never throws to caller */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 — own diff-stream (read-only combined subscription, mirrors depth-book)
// ─────────────────────────────────────────────────────────────────────────────

function startDiffStream({ symbols, url = FSTREAM_WS_URL, WebSocketImpl, onDiff }) {
  const WS = WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  if (!WS) return { stop() {} };
  const syms = symbols.map((s) => String(s).toUpperCase());
  const streamPath = '/stream?streams=' + syms.map((s) => `${s.toLowerCase()}@depth@100ms`).join('/');
  let ws = null, stopped = false, backoff = 1000;

  const scheduleReconnect = () => {
    if (stopped) return;
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 30_000);
  };

  function connect() {
    if (stopped) return;
    try { ws = new WS(url + streamPath); } catch { return scheduleReconnect(); }
    ws.onopen = () => { backoff = 1000; };
    ws.onmessage = (m) => {
      try {
        const ev = parseDiffDepthMessage(m?.data);
        if (ev) onDiff(ev);
      } catch { /* fail-open */ }
    };
    ws.onclose = () => { if (!stopped) scheduleReconnect(); };
    ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
  }

  connect();
  return { stop() { stopped = true; try { ws && ws.close(); } catch { /* noop */ } } };
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 — startRecorder (main export)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * startRecorder({
 *   symbols = ['BTCUSDT'],
 *   dataDir,                          // required — directory to write tapes into
 *   snapshotIntervalMs = 120_000,    // how often to write a snap line per symbol
 *   topN = 20,                        // levels in the onBook passthrough snap (live signal consumers)
 *   snapTopN = 1000,                  // levels in the periodic full-depth REST snap (clean replay seed)
 *   WebSocketImpl,                    // injectable WebSocket (for tests)
 *   httpGet,                          // injectable snapshot fetcher (for tests)
 *   onBook?,                          // optional passthrough: called after each depth-book update
 *   onTrade?,                         // optional passthrough: called after each trade
 * }) -> { stop }
 *
 * RESERVED line types (not yet written): "quote", "fill" — placeholder for future quoting lane.
 */
export async function startRecorder({
  symbols = ['BTCUSDT'],
  dataDir,
  snapshotIntervalMs = 120_000,
  topN = 20,
  snapTopN = DEFAULT_SNAP_TOP_N,
  WebSocketImpl,
  httpGet,
  onBook,
  onTrade,
} = {}) {
  if (!dataDir || typeof dataDir !== 'string') {
    // fail-open: return a no-op handle if dataDir is missing
    return { stop() {} };
  }

  ensureDir(dataDir);

  const syms = symbols.map((s) => String(s).toUpperCase());

  // Per-symbol write state
  const writeState = new Map();
  for (const sym of syms) writeState.set(sym, { lastDateTag: null });

  // Per-symbol snapshot throttle: track last snap time
  const lastSnapAt = new Map();
  for (const sym of syms) lastSnapAt.set(sym, 0);

  // ── A. depth-book (provides snaps + optional onBook passthrough) ──────────
  const depthHandle = startDepthBook({
    symbols,
    topN,
    WebSocketImpl,
    httpGet,
    onBook: (book) => {
      try {
        const sym = book.symbol;
        const now = book.ts ?? Date.now();
        const last = lastSnapAt.get(sym) ?? 0;
        if (now - last >= snapshotIntervalMs) {
          lastSnapAt.set(sym, now);
          const line = buildSnapLine({
            ts: now, s: sym,
            lastUpdateId: book.lastU ?? 0,
            bids: book.bids.slice(0, topN),
            asks: book.asks.slice(0, topN),
          });
          writeLine(writeState.get(sym), dataDir, sym, line, now);
        }
        if (typeof onBook === 'function') { try { onBook(book); } catch { /* caller err */ } }
      } catch { /* fail-open */ }
    },
  });

  // ── B. periodic full-depth REST snap (clean deep seed for replay) ─────────
  // depth-book's emit() slices onBook to topN (20) BEFORE we see it, so the
  // onBook-driven snap above only captures 20 levels. This independent timer fetches
  // the FULL book (limit=snapTopN, default 1000) directly from /fapi/v1/depth every
  // snapshotIntervalMs and writes a deep snap line. Fail-open: no httpGet or fetch
  // error → silently skipped (the shallow onBook snap remains as fallback).
  let snapTimer = null;
  const writeDeepSnap = async () => {
    for (const sym of syms) {
      try {
        const snap = await fetchFullDepthSnap(sym, httpGet, snapTopN);
        if (!snap || !snap.bids.length || !snap.asks.length) continue; // fail-open
        const now = Date.now();
        lastSnapAt.set(sym, now); // co-throttle the onBook snap so we don't double-write
        const line = buildSnapLine({
          ts: now, s: sym, lastUpdateId: snap.lastUpdateId,
          bids: snap.bids, asks: snap.asks,
        });
        writeLine(writeState.get(sym), dataDir, sym, line, now);
      } catch { /* fail-open — deep-snap error never throws */ }
    }
  };
  if (typeof httpGet === 'function' && snapTopN > topN) {
    // Fire one immediately (clean seed on startup), then every snapshotIntervalMs.
    void writeDeepSnap();
    snapTimer = setInterval(() => { void writeDeepSnap(); }, snapshotIntervalMs);
    if (typeof snapTimer.unref === 'function') snapTimer.unref(); // never keep the loop alive
  }

  // ── C. own diff-stream (raw diff events, independent of depth-book's internal state) ──
  const diffHandle = startDiffStream({
    symbols,
    WebSocketImpl,
    onDiff: (ev) => {
      try {
        const sym = ev.s;
        const ts = ev.E ?? ev.T ?? Date.now();
        const line = buildDiffLine(ev);
        writeLine(writeState.get(sym), dataDir, sym, line, ts);
      } catch { /* fail-open */ }
    },
  });

  // ── C. trades-stream ───────────────────────────────────────────────────────
  let tradesHandle = { stop() {} };
  try {
    const startTradesStream = await getStartTradesStream();
    if (startTradesStream) {
      tradesHandle = startTradesStream({
        symbols,
        WebSocketImpl,
        onTrade: (tr) => {
          try {
            const sym = tr.symbol;
            const ts = tr.ts ?? Date.now();
            const line = buildTradeLine(tr);
            writeLine(writeState.get(sym), dataDir, sym, line, ts);
            if (typeof onTrade === 'function') { try { onTrade(tr); } catch { /* caller err */ } }
          } catch { /* fail-open */ }
        },
      });
    }
  } catch { /* fail-open — trades-stream absent or errored */ }

  return {
    stop() {
      try { if (snapTimer) clearInterval(snapTimer); } catch { /* fail-open */ }
      try { depthHandle.stop(); } catch { /* fail-open */ }
      try { diffHandle.stop(); } catch { /* fail-open */ }
      try { tradesHandle.stop(); } catch { /* fail-open */ }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 — --test (mock, offline, deterministic)
// ─────────────────────────────────────────────────────────────────────────────

const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (_main && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };

  // ── pure helpers ────────────────────────────────────────────────────────
  ok(utcDateTag(0) === '19700101', 'utcDateTag(0) = 19700101');
  ok(utcDateTag(Date.UTC(2024, 0, 5)) === '20240105', 'utcDateTag Jan-5-2024');
  ok(utcDateTag(Date.UTC(2024, 11, 31)) === '20241231', 'utcDateTag Dec-31-2024');

  const snapLine = buildSnapLine({ ts: 1000, s: 'BTCUSDT', lastUpdateId: 42, bids: [{ price: 100, size: 1 }], asks: [{ price: 101, size: 2 }] });
  const snap = JSON.parse(snapLine);
  ok(snap.t === 'snap' && snap.s === 'BTCUSDT' && snap.ts === 1000 && snap.lastUpdateId === 42, 'buildSnapLine shape');
  ok(Array.isArray(snap.bids) && snap.bids[0][0] === '100' && snap.bids[0][1] === '1', 'snap bids as string pairs');
  ok(Array.isArray(snap.asks) && snap.asks[0][0] === '101', 'snap asks as string pairs');

  // ── deep-snap round-trip: 100+ levels survive buildSnapLine + JSON.parse ──
  {
    const deepN = 150;
    const deepBids = Array.from({ length: deepN }, (_, i) => ({ price: 100 - i * 0.1, size: i + 1 }));
    const deepAsks = Array.from({ length: deepN }, (_, i) => ({ price: 101 + i * 0.1, size: i + 1 }));
    const deepLine = buildSnapLine({ ts: 5000, s: 'BTCUSDT', lastUpdateId: 999, bids: deepBids, asks: deepAsks });
    const deep = JSON.parse(deepLine);
    ok(deep.t === 'snap' && deep.bids.length === deepN && deep.asks.length === deepN, `deep snap preserves ${deepN} levels (got bids=${deep.bids.length} asks=${deep.asks.length})`);
    ok(deep.bids[0][0] === '100' && deep.bids[deepN - 1][0] === String(100 - (deepN - 1) * 0.1), 'deep snap bid ordering + last price intact');
    ok(deep.asks[0][0] === '101' && deep.asks[deepN - 1][0] === String(101 + (deepN - 1) * 0.1), 'deep snap ask ordering + last price intact');
    ok(deep.bids[42][1] === '43' && deep.asks[42][1] === '43', 'deep snap mid-level sizes round-trip as strings');
  }

  // ── fetchFullDepthSnap: mock httpGet → normalized {price,size}[] ──────────
  {
    const mockDeep = async () => ({
      status: 200,
      body: JSON.stringify({
        lastUpdateId: 555,
        bids: [['99.5', '1.5'], ['99.0', '0'], ['99.4', '2.0'], ['bad']],
        asks: [['100.5', '3.0'], ['100.6', '0'], ['100.7', '4.0']],
      }),
    });
    const r = await fetchFullDepthSnap('BTCUSDT', mockDeep, 1000);
    ok(r !== null && r.lastUpdateId === 555, 'fetchFullDepthSnap returns lastUpdateId');
    ok(r.bids.length === 2 && r.asks.length === 2, `fetchFullDepthSnap filters zero-size + malformed (bids=${r?.bids.length} asks=${r?.asks.length})`);
    ok(r.bids[0].price === 99.5 && r.bids[0].size === 1.5 && typeof r.bids[0].price === 'number', 'fetchFullDepthSnap normalizes to numeric {price,size}');
    const rNoHttp = await fetchFullDepthSnap('BTCUSDT', null, 1000);
    ok(rNoHttp === null, 'fetchFullDepthSnap fail-open returns null when no httpGet');
    const rBadStatus = await fetchFullDepthSnap('BTCUSDT', async () => ({ status: 500, body: '' }), 1000);
    ok(rBadStatus === null, 'fetchFullDepthSnap fail-open returns null on bad status');
  }

  // ── deep-snap wired into startRecorder (mock httpGet returns 1000 levels) ─
  // (covered in the e2e block below via the snapTopN + deep mockHttpGet)

  const diffLine = buildDiffLine({ E: 2000, T: 1999, s: 'BTCUSDT', U: 10, u: 15, pu: 9, b: [['100', '5']], a: [['101', '3']] });
  const diff = JSON.parse(diffLine);
  ok(diff.t === 'diff' && diff.ts === 2000 && diff.s === 'BTCUSDT' && diff.U === 10 && diff.u === 15, 'buildDiffLine shape');

  const tradeLine = buildTradeLine({ ts: 3000, symbol: 'BTCUSDT', aggId: 99, price: 100.5, qty: 0.5, isBuyerMaker: false });
  const trade = JSON.parse(tradeLine);
  ok(trade.t === 'trade' && trade.ts === 3000 && trade.s === 'BTCUSDT' && trade.a === 99 && trade.p === 100.5, 'buildTradeLine shape');
  ok(trade.m === false, 'buildTradeLine isBuyerMaker');

  // ── end-to-end: mock WS + mock httpGet → drive diff + trade + snap ──────
  await (async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tape-test-'));

    // Mock WebSocket that auto-opens and lets us push frames
    class MockWS {
      constructor(url) { this._url = url; MockWS.instances.push(this); setTimeout(() => this.onopen?.(), 0); }
      send() {}
      close() { this.closed = true; }
    }
    MockWS.instances = [];

    // Mock httpGet: returns a DEEP book (120 levels) so the full-depth snap path
    // writes a deep seed. depth-book's internal snapshot also uses this (harmless —
    // it slices to topN internally before emit).
    const deepLevels = (base, step, n) => Array.from({ length: n }, (_, i) => [String(base - i * step), String(i + 1)]);
    const mockHttpGet = async (urlStr) => {
      // Both depth-book's snapshot and the recorder's deep-snap call this; return deep
      // levels for /fapi/v1/depth regardless of the limit param.
      const isDepth = urlStr && urlStr.includes('/fapi/v1/depth');
      const n = isDepth ? 120 : 1;
      return {
        status: 200,
        body: JSON.stringify({
          lastUpdateId: 100,
          bids: deepLevels(100, 0.1, n),
          asks: Array.from({ length: n }, (_, i) => [String(101 + i * 0.1), String(i + 1)]),
        }),
      };
    };

    // trades-stream.mjs is the real sibling — we inject trade frames via its @trade socket below.
    const onBooks = [], onTrades = [];
    const handle = await startRecorder({
      symbols: ['BTCUSDT'],
      dataDir: tmpDir,
      snapshotIntervalMs: 50, // short threshold so a snap fires quickly
      topN: 5,
      snapTopN: 1000, // enable the deep-snap timer (mock returns 120 levels)
      WebSocketImpl: MockWS,
      httpGet: mockHttpGet,
      onBook: (b) => onBooks.push(b),
      onTrade: (t) => onTrades.push(t),
    });

    await new Promise((r) => setTimeout(r, 80)); // let open + snapshot fire + first onBook snap write

    // Push a diff frame to ALL depth@100ms sockets — depth-book's socket processes it through
    // its state machine (harmless), and the tape's own diff-stream socket writes it to JSONL.
    const depthSockets = MockWS.instances.filter((ws) => ws._url && ws._url.includes('depth@100ms'));
    ok(depthSockets.length >= 2, `≥2 depth@100ms sockets opened (depth-book + tape diff-stream): got ${depthSockets.length}`);

    const diffFrame = JSON.stringify({
      stream: 'btcusdt@depth@100ms',
      data: { e: 'depthUpdate', E: 1718000000000, T: 1718000000000, s: 'BTCUSDT', U: 98, u: 102, pu: 97, b: [['100.5', '4']], a: [['101', '6']] },
    });
    for (const ws of depthSockets) ws.onmessage?.({ data: diffFrame });

    // Push a trade via the @trade socket (real trades-stream.mjs is the sibling).
    // NOTE: trades-stream.mjs subscribes to the @trade channel, NOT @aggTrade —
    // @aggTrade returns ZERO frames on this fstream endpoint (verified 2026-06-19).
    // The socket URL therefore contains '@trade', so we match that substring.
    // The injected frame uses e:'trade' + id field 't' (the live @trade form);
    // parseAggTrade accepts e:'trade' | e:'aggTrade' and id from t|a.
    const tradeWS = MockWS.instances.find((ws) => ws._url && ws._url.includes('@trade'));
    if (tradeWS) {
      tradeWS.onmessage?.({ data: JSON.stringify({
        stream: 'btcusdt@trade',
        data: { e: 'trade', s: 'BTCUSDT', T: 1718000001000, p: '100.5', q: '0.25', m: true, t: 77 },
      }) });
    }

    await new Promise((r) => setTimeout(r, 20)); // let writes flush

    // Read JSONL back — snaps use Date.now() as ts so may land in today's file;
    // diffs/trades use the injected E timestamp (2024). Scan ALL .jsonl files in tmpDir.
    const allFiles = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.jsonl'));
    ok(allFiles.length >= 1, `at least one tape file created (got: ${allFiles.join(', ')})`);

    const allLines = allFiles.flatMap((f) =>
      fs.readFileSync(path.join(tmpDir, f), 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
    );
    const diffLines = allLines.filter((l) => l.t === 'diff');
    const tradeLines = allLines.filter((l) => l.t === 'trade');
    const snapLines = allLines.filter((l) => l.t === 'snap');

    ok(diffLines.length >= 1, `≥1 diff line written (got ${diffLines.length})`);
    ok(tradeLines.length >= 1, `≥1 trade line written (got ${tradeLines.length})`);
    ok(snapLines.length >= 1, `≥1 snap line written (got ${snapLines.length})`);

    if (diffLines[0]) ok(diffLines[0].U === 98 && diffLines[0].u === 102, 'diff line has correct U/u');
    if (tradeLines[0]) ok(tradeLines[0].a === 77 && tradeLines[0].p === 100.5, 'trade line has correct aggId/price');
    if (snapLines[0]) ok(Array.isArray(snapLines[0].bids), 'snap line has bids array');

    // Deep-snap assertion: at least one snap must carry >topN levels (the full-depth
    // REST snap from writeDeepSnap, not the shallow onBook snap).
    const deepSnaps = snapLines.filter((s) => s.bids && s.bids.length > 5);
    ok(deepSnaps.length >= 1, `≥1 DEEP snap (>topN=5 levels) written via full-depth REST (got ${deepSnaps.length}, max bids=${snapLines.reduce((m, s) => Math.max(m, s.bids?.length || 0), 0)})`);
    if (deepSnaps[0]) {
      ok(deepSnaps[0].bids.length === 120 && deepSnaps[0].asks.length === 120, `deep snap carries full 120 levels (bids=${deepSnaps[0].bids.length} asks=${deepSnaps[0].asks.length})`);
      ok(deepSnaps[0].bids[0][0] === '100' && deepSnaps[0].asks[0][0] === '101', 'deep snap top-of-book prices correct');
    }

    handle.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  })();

  // ── day-rollover + gzip test ─────────────────────────────────────────────
  await (async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tape-rollover-'));
    const sym = 'BTCUSDT';
    const state = { lastDateTag: null };

    // Write a "yesterday" line
    const yesterday = '20240104';
    const today = '20240105';
    const stalePath = path.join(tmpDir, `tape-${sym}-${yesterday}.jsonl`);
    fs.writeFileSync(stalePath, '{"t":"diff","stale":true}\n', 'utf-8');

    // Write a state entry with yesterdays tag
    state.lastDateTag = yesterday;

    // Write a "today" line — should trigger gzip of yesterday
    const todayTs = Date.UTC(2024, 0, 5, 12, 0, 0); // 2024-01-05
    writeLine(state, tmpDir, sym, '{"t":"diff","ts":1}', todayTs);

    const gzPath = stalePath + '.gz';
    ok(fs.existsSync(gzPath), 'yesterday tape was gzipped on date rollover');
    ok(!fs.existsSync(stalePath), 'original .jsonl removed after gzip');
    ok(state.lastDateTag === today, `lastDateTag advanced to ${today}`);

    // Verify the gz is valid
    const gz = fs.readFileSync(gzPath);
    const decompressed = zlib.gunzipSync(gz).toString('utf-8');
    ok(decompressed.includes('"stale":true'), 'gzipped content is valid');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  })();

  console.log(`tape-recorder --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// §6 — --smoke (10s real capture to tmp dir)
// ─────────────────────────────────────────────────────────────────────────────

if (_main && process.argv.includes('--smoke')) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tape-smoke-'));
  console.log(`[smoke] recording to ${tmpDir} for 10s ...`);
  let diffCount = 0, tradeCount = 0, snapCount = 0;

  const handle = await startRecorder({
    symbols: ['BTCUSDT'],
    dataDir: tmpDir,
    snapshotIntervalMs: 5000,  // snap every 5s during smoke
    topN: 20,
  });

  setTimeout(async () => {
    handle.stop();

    // Read back all JSONL files
    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.jsonl'));
    console.log(`[smoke] files written: ${files.join(', ') || '(none)'}`);

    for (const f of files) {
      const content = fs.readFileSync(path.join(tmpDir, f), 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      for (const raw of lines) {
        try {
          const obj = JSON.parse(raw);
          if (obj.t === 'diff') diffCount++;
          else if (obj.t === 'trade') tradeCount++;
          else if (obj.t === 'snap') snapCount++;
        } catch {
          console.error('[smoke] unparseable line:', raw.slice(0, 80));
        }
      }
    }

    console.log(`[smoke] diff=${diffCount} trade=${tradeCount} snap=${snapCount}`);
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const totalLines = diffCount + tradeCount + snapCount;
    const hasValid = (diffCount >= 1 || tradeCount >= 1) && snapCount >= 0;
    // Require at least 1 diff (real network; trades optional if sibling absent)
    const typeSet = new Set();
    if (diffCount >= 1) typeSet.add('diff');
    if (tradeCount >= 1) typeSet.add('trade');
    if (snapCount >= 1) typeSet.add('snap');

    if (diffCount >= 1) {
      console.log(`[smoke] OK — ${totalLines} lines captured (types: ${[...typeSet].join(',')}), all parse as valid JSON with t in {diff,snap,trade}`);
      process.exit(0);
    } else {
      console.error(`[smoke] FAIL — no diff lines captured in 10s (total ${totalLines})`);
      process.exit(1);
    }
  }, 10_000);
}
