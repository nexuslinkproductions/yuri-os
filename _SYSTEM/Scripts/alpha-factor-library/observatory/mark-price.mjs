#!/usr/bin/env node
// @capability: mark-price
// @serves: mark price | index price | funding rate | liquidation price | honest PnL | futures risk | premium index | mark-price stream
// @does: Tracks the Binance USDⓈ-M futures MARK price (the smoothed index-based price perp PnL/funding/liquidation are settled against — NOT last-trade or order-book mid) via the public <sym>@markPrice@1s WebSocket on fstream + the REST /fapi/v1/premiumIndex snapshot. A maker engine tracks mark for honest PnL/risk; using mid would lie about both. Mirrors depth-book.mjs/tick-stream.mjs (injectable WebSocketImpl + httpGet, fail-open, exp-backoff reconnect, --test offline with mocks, --smoke live). View-only market data — no orders, no auth.
// @use: startMarkPriceStream({symbols,onMark}) to maintain latest mark per symbol; onMark({symbol,markPrice,indexPrice,fundingRate,nextFundingTime,ts}) fires on every 1s push. fetchMarkPrice(symbol,httpGet) for a one-shot REST snapshot. parseMarkPriceMessage is the pure unit-tested mapper. DISARMED standalone — wiring into the live daemon/orchestrator/risk module is a separate owner-gated step.
// @exports: parseMarkPriceMessage, fetchMarkPrice, startMarkPriceStream
// @ws-stream: <sym>@markPrice@1s  (combined: /stream?streams=<sym>@markPrice@1s/<sym>@markPrice@1s)
//
// CONSTRAINTS: view-only (INV-1 no order path; INV-2 no keys — public keyless market data), fail-open
// (a dropped socket / bad REST / malformed frame never throws into the caller), no new npm dep (Node built-in
// WebSocket + node:https). SSRF allowlist: only FAPI_HOST (fapi.binance.com) + FSTREAM_WS_URL (wss://fstream.binance.com),
// imported read-only from depth-book.mjs (single source of truth for the host allowlist).
// PROTOCOL verified against Binance USDⓈ-M docs (2026-06-19):
//   WS markPriceUpdate frame: { e:"markPriceUpdate", E, s, p:markPrice, i:indexPrice, P:estSettlePrice, r:fundingRate, T:nextFundingTime }
//   REST premiumIndex:        { symbol, markPrice, indexPrice, estimatedSettlePrice, lastFundingRate, interestRate, nextFundingTime, time }
//   Both p/markPrice and r/lastFundingRate arrive as STRINGS — must be Number()-coerced. fundingRate is a fraction (e.g. 0.0001 = 1bp).

import https from 'node:https';
import { pathToFileURL } from 'node:url';
import { FSTREAM_WS_URL, FAPI_HOST } from './depth-book.mjs';

function isNum(x) { return typeof x === 'number' && Number.isFinite(x); }
function num(x) { const n = Number(x); return isNum(n) ? n : null; }

// ─────────────────────────────────────────────────────────────────────────────
// §1 — parseMarkPriceMessage (pure)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * parseMarkPriceMessage(raw) -> { symbol, markPrice, indexPrice?, fundingRate?, nextFundingTime?, ts } | null
 * Handles BOTH the WS markPriceUpdate frame and the REST premiumIndex object (unified normal form).
 *   WS  : { e:'markPriceUpdate', E, s, p, i, P, r, T }  (p=markPrice, i=indexPrice, r=fundingRate, T=nextFundingTime)
 *   REST: { symbol, markPrice, indexPrice, lastFundingRate, nextFundingTime, time }
 * markPrice is REQUIRED (the whole point); indexPrice/fundingRate/nextFundingTime are optional but parsed if present.
 * Returns null for any non-markPrice frame, malformed JSON, or a frame whose markPrice is missing/non-finite.
 */
export function parseMarkPriceMessage(raw) {
  let m;
  try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!m || typeof m !== 'object') return null;
  const d = m.data && typeof m.data === 'object' ? m.data : m; // unwrap combined-stream envelope
  // Accept only markPriceUpdate (WS) or a REST object with a symbol + markPrice
  const isWs = d.e === 'markPriceUpdate';
  const symbol = isWs ? d.s : d.symbol;
  if (typeof symbol !== 'string' || !symbol) return null;
  // markPrice: WS uses 'p', REST uses 'markPrice'
  const markPrice = num(isWs ? d.p : d.markPrice);
  if (markPrice === null || markPrice <= 0) return null; // markPrice is the one hard requirement
  const indexPrice = num(isWs ? d.i : d.indexPrice);
  const fundingRate = num(isWs ? d.r : d.lastFundingRate);
  const nextFundingTime = num(isWs ? d.T : d.nextFundingTime);
  const ts = num(isWs ? d.E : d.time) ?? (nextFundingTime ?? null);
  return {
    symbol,
    markPrice,
    indexPrice: indexPrice !== null && indexPrice > 0 ? indexPrice : null,
    fundingRate: fundingRate !== null ? fundingRate : null,
    nextFundingTime: nextFundingTime !== null && nextFundingTime > 0 ? nextFundingTime : null,
    ts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 — fetchMarkPrice (REST premiumIndex snapshot, injectable httpGet)
// ─────────────────────────────────────────────────────────────────────────────

function defaultHttpGet(urlStr) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject(e); }
    if (u.hostname !== FAPI_HOST) return reject(new Error(`SSRF denied: ${u.hostname}`)); // single-host allowlist (mirrors depth-book)
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'YURI-AFL/mark-price/1.0' }, timeout: 15000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8') }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('premiumIndex timeout')); });
    req.on('error', reject);
    req.end();
  });
}

/**
 * fetchMarkPrice(symbol, httpGet?) -> { symbol, markPrice, indexPrice?, fundingRate?, nextFundingTime?, ts } | null
 * REST GET /fapi/v1/premiumIndex?symbol=<SYMBOL> → normalized via parseMarkPriceMessage.
 * FAIL-OPEN: any error (network, bad status, malformed body, SSRF) → returns null, NEVER throws.
 */
export async function fetchMarkPrice(symbol, httpGet) {
  try {
    const url = `https://${FAPI_HOST}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(String(symbol).toUpperCase())}`;
    const res = await (httpGet || defaultHttpGet)(url);
    if (!res || res.status < 200 || res.status >= 300) return null;
    const json = JSON.parse(res.body);
    return parseMarkPriceMessage(json);
  } catch {
    return null; // fail-open — a bad snapshot never throws into the caller
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 — startMarkPriceStream (collector + fail-open + exp-backoff reconnect)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * startMarkPriceStream({ symbols, onMark, onStatus?, url?, httpGet?, WebSocketImpl?, maxBackoffMs? }) -> { stop(), latest(symbol) }
 * Connects to the Binance fstream combined markPrice@1s feed for `symbols`, maintains the latest mark per symbol,
 * and calls onMark(parsed) on every push. Auto-reconnects with exponential backoff (mirrors depth-book/tick-stream).
 * FAIL-OPEN: bad args / no WebSocket → a no-op handle (latest() returns null).
 * WebSocketImpl + httpGet are injectable for offline tests (no live network in --test).
 */
export function startMarkPriceStream({
  symbols = [], onMark, onStatus = () => {},
  url = FSTREAM_WS_URL, httpGet, WebSocketImpl,
  maxBackoffMs = 30_000,
} = {}) {
  const WS = WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  if (!WS) { onStatus('no-websocket-impl'); return { stop() {}, latest() { return null; } }; }
  if (!Array.isArray(symbols) || symbols.length === 0 || typeof onMark !== 'function') {
    onStatus('bad-args');
    return { stop() {}, latest() { return null; } };
  }

  const syms = symbols.map((s) => String(s).toUpperCase());
  const latestMap = new Map(); // SYMBOL -> last parsed mark object
  let ws = null, stopped = false, backoff = 1000;

  function ingest(parsed) {
    if (!parsed || !parsed.symbol) return;
    const sym = parsed.symbol.toUpperCase();
    if (!syms.includes(sym)) return; // ignore out-of-set symbols
    latestMap.set(sym, parsed);
    try { onMark(parsed); } catch { /* caller error never kills the stream */ }
  }

  function onFrame(rawData) {
    const parsed = parseMarkPriceMessage(rawData);
    if (parsed) ingest(parsed);
  }

  // Optional: seed each symbol from REST on first connect (best-effort, fail-open).
  async function seedFromRest() {
    if (stopped) return;
    for (const sym of syms) {
      if (stopped) return;
      const snap = await fetchMarkPrice(sym, httpGet);
      if (snap && !stopped) ingest(snap); // fill before/alongside the first WS push
    }
  }

  const scheduleReconnect = () => {
    if (stopped) return;
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, maxBackoffMs);
  };

  function connect() {
    if (stopped) return;
    try {
      ws = new WS(url + '/stream?streams=' + syms.map((s) => `${s.toLowerCase()}@markPrice@1s`).join('/'));
    } catch (e) {
      onStatus(`connect-error:${e?.message || e}`);
      return scheduleReconnect();
    }
    ws.onopen = () => {
      backoff = 1000; // reset on healthy connection
      onStatus('open');
      void seedFromRest(); // best-effort seed; the WS push is authoritative once it arrives
    };
    ws.onmessage = (ev) => { onFrame(ev?.data); };
    ws.onclose = () => { if (!stopped) { onStatus('close'); scheduleReconnect(); } };
    ws.onerror = (e) => { onStatus(`error:${e?.message || 'ws'}`); try { ws.close(); } catch { /* noop */ } };
  }

  connect();
  return {
    stop() { stopped = true; try { ws && ws.close(); } catch { /* noop */ } },
    latest(symbol) { return latestMap.get(String(symbol).toUpperCase()) || null; },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 — --test (OFFLINE, deterministic, mock WebSocket + mock httpGet)
// ─────────────────────────────────────────────────────────────────────────────
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_main && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };

  // ── GREEN: parseMarkPriceMessage — WS markPriceUpdate frame
  const wsFrame = {
    e: 'markPriceUpdate', E: 1700000000000, s: 'BTCUSDT',
    p: '67000.5', i: '66998.2', P: '67001.0', r: '0.00010000', T: 1700000400000,
  };
  const wsParsed = parseMarkPriceMessage(JSON.stringify(wsFrame));
  ok(wsParsed && wsParsed.symbol === 'BTCUSDT', 'WS parse → symbol');
  ok(wsParsed && wsParsed.markPrice === 67000.5, 'WS parse → markPrice (p→number)');
  ok(wsParsed && wsParsed.indexPrice === 66998.2, 'WS parse → indexPrice (i→number)');
  ok(wsParsed && wsParsed.fundingRate === 0.0001, 'WS parse → fundingRate (r→number, fraction)');
  ok(wsParsed && wsParsed.nextFundingTime === 1700000400000, 'WS parse → nextFundingTime (T→number)');
  ok(wsParsed && wsParsed.ts === 1700000000000, 'WS parse → ts (E→number)');

  // combined-stream envelope unwrap
  const combined = { stream: 'btcusdt@markPrice@1s', data: wsFrame };
  const cParsed = parseMarkPriceMessage(JSON.stringify(combined));
  ok(cParsed && cParsed.symbol === 'BTCUSDT' && cParsed.markPrice === 67000.5, 'combined-stream envelope unwrapped');

  // REST premiumIndex object (pre-parsed)
  const restObj = {
    symbol: 'ETHUSDT', markPrice: '3500.1', indexPrice: '3499.8', estimatedSettlePrice: '3500.2',
    lastFundingRate: '-0.00005000', interestRate: '0.00010000', nextFundingTime: 1700000400000, time: 1700000000000,
  };
  const restParsed = parseMarkPriceMessage(restObj);
  ok(restParsed && restParsed.symbol === 'ETHUSDT' && restParsed.markPrice === 3500.1, 'REST parse → symbol+markPrice');
  ok(restParsed && restParsed.fundingRate === -0.00005, 'REST parse → negative fundingRate (short pays long)');
  ok(restParsed && restParsed.indexPrice === 3499.8 && restParsed.nextFundingTime === 1700000400000, 'REST parse → indexPrice+nextFundingTime');

  // accepts a raw object too
  ok(parseMarkPriceMessage({ e: 'markPriceUpdate', E: 1, s: 'X', p: '2', i: '1.5', r: '0', T: 3 })?.markPrice === 2, 'object input parses');

  // ── RED: malformed / non-mark frames → null, no throw
  ok(parseMarkPriceMessage('not json') === null, 'garbage string → null');
  ok(parseMarkPriceMessage(null) === null, 'null → null');
  ok(parseMarkPriceMessage(undefined) === null, 'undefined → null');
  ok(parseMarkPriceMessage(JSON.stringify({ e: 'depthUpdate', s: 'BTCUSDT', U: 1, u: 2, b: [], a: [] })) === null, 'depthUpdate frame → null (not markPriceUpdate)');
  ok(parseMarkPriceMessage(JSON.stringify({ e: 'markPriceUpdate', s: 'BTCUSDT', p: 'NaN' })) === null, 'NaN markPrice → null');
  ok(parseMarkPriceMessage(JSON.stringify({ e: 'markPriceUpdate', s: 'BTCUSDT', p: '-5' })) === null, 'negative markPrice → null');
  ok(parseMarkPriceMessage(JSON.stringify({ e: 'markPriceUpdate', s: 'BTCUSDT' })) === null, 'missing p → null (markPrice required)');
  ok(parseMarkPriceMessage(JSON.stringify({ symbol: 'BTCUSDT' })) === null, 'REST object missing markPrice → null');
  ok(parseMarkPriceMessage(JSON.stringify({ e: 'markPriceUpdate', p: '5' })) === null, 'missing symbol → null');
  // fundingRate absent → null (not NaN), markPrice still parsed
  ok(parseMarkPriceMessage({ symbol: 'SOLUSDT', markPrice: '150' })?.fundingRate === null, 'absent fundingRate → null');

  // ── GREEN: fetchMarkPrice via mock httpGet (premiumIndex snapshot)
  const mockGet = async (urlStr) => {
    if (urlStr.includes('symbol=BAD')) return { status: 400, body: '{"code":-1121,"msg":"Invalid symbol."}' };
    if (urlStr.includes('symbol=CRASH')) throw new Error('ECONNRESET');
    return { status: 200, body: JSON.stringify({
      symbol: 'BTCUSDT', markPrice: '67000.5', indexPrice: '66998.2', estimatedSettlePrice: '67001.0',
      lastFundingRate: '0.00010000', interestRate: '0.00010000', nextFundingTime: 1700000400000, time: 1700000000000,
    }) };
  };
  const snap = await fetchMarkPrice('BTCUSDT', mockGet);
  ok(snap && snap.symbol === 'BTCUSDT' && snap.markPrice === 67000.5, 'fetchMarkPrice → snapshot via mock httpGet');
  ok(snap && snap.fundingRate === 0.0001 && snap.indexPrice === 66998.2, 'fetchMarkPrice → fundingRate+indexPrice');
  // RED: bad status + thrown error → null (fail-open, no throw)
  ok(await fetchMarkPrice('BAD', mockGet) === null, 'fetchMarkPrice bad status → null (no throw)');
  ok(await fetchMarkPrice('CRASH', mockGet) === null, 'fetchMarkPrice network error → null (no throw)');
  ok(await fetchMarkPrice('BTCUSDT', async () => ({ status: 200, body: 'not json' })) === null, 'fetchMarkPrice bad body → null');

  // ── GREEN: startMarkPriceStream via mock WS → onMark + latest()
  class MockWS {
    constructor() { this.sent = []; MockWS.last = this; setTimeout(() => this.onopen && this.onopen(), 0); }
    send(s) { this.sent.push(s); }
    close() { this.closed = true; }
  }
  const marks = [], statuses = [];
  const h = startMarkPriceStream({
    symbols: ['BTCUSDT', 'ETHUSDT'], onMark: (m) => marks.push(m),
    onStatus: (s) => statuses.push(s), WebSocketImpl: MockWS, httpGet: mockGet,
  });
  await new Promise((r) => setTimeout(r, 10)); // let mock "open" + REST seed fire
  ok(statuses.includes('open'), 'mock WS open status fired');
  // REST seed should have delivered a BTCUSDT mark
  ok(marks.some((m) => m.symbol === 'BTCUSDT' && m.markPrice === 67000.5), 'REST seed delivered a BTCUSDT mark to onMark');
  ok(h.latest('BTCUSDT')?.markPrice === 67000.5, 'latest(BTCUSDT) returns seeded mark');
  ok(h.latest('ethusdt') === null || typeof h.latest('ethusdt') === 'object', 'latest is case-insensitive (seed may or may not have arrived)');
  // WS push for ETHUSDT
  MockWS.last.onmessage({ data: JSON.stringify({
    e: 'markPriceUpdate', E: 1700000001000, s: 'ETHUSDT', p: '3500.0', i: '3499.5', P: '3500.1', r: '0.00002000', T: 1700000400000,
  }) });
  ok(marks.some((m) => m.symbol === 'ETHUSDT' && m.markPrice === 3500.0), 'WS push delivered ETHUSDT mark to onMark');
  ok(h.latest('ETHUSDT')?.markPrice === 3500.0, 'latest(ETHUSDT) returns WS-pushed mark');
  // WS garbage frame ignored
  MockWS.last.onmessage({ data: 'garbage' });
  ok(marks.length === 2 || marks.every((m) => m.symbol !== undefined), 'garbage WS frame ignored (no throw, no extra mark)');
  // out-of-set symbol ignored
  MockWS.last.onmessage({ data: JSON.stringify({ e: 'markPriceUpdate', E: 1, s: 'DOGEUSDT', p: '0.1', i: '0.09', r: '0', T: 2 }) });
  ok(h.latest('DOGEUSDT') === null, 'out-of-set symbol ignored by latest()');
  h.stop();
  ok(MockWS.last.closed === true, 'stop() closes the socket');

  // bad-args → safe no-op handle
  const noop = startMarkPriceStream({ symbols: [], onMark: () => {}, WebSocketImpl: MockWS });
  ok(typeof noop.stop === 'function' && typeof noop.latest === 'function' && noop.latest('BTCUSDT') === null, 'bad-args → safe no-op handle');
  // no-WS → safe no-op handle
  const noop2 = startMarkPriceStream({ symbols: ['BTCUSDT'], onMark: () => {}, WebSocketImpl: null });
  ok(typeof noop2.stop === 'function' && noop2.latest('BTCUSDT') === null, 'no WebSocketImpl → safe no-op handle');

  console.log(`mark-price --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 — --smoke (REAL Binance fstream — verifies URL + schema by connecting)
// ─────────────────────────────────────────────────────────────────────────────
if (_main && process.argv.includes('--smoke')) {
  const symbols = ['BTCUSDT', 'ETHUSDT'];
  let n = 0;
  console.log(`[smoke] connecting ${FSTREAM_WS_URL} markPrice@1s for ${symbols.join(',')} ...`);
  const h = startMarkPriceStream({
    symbols,
    onMark: (m) => {
      n++;
      console.log(`[smoke] mark #${n}: ${m.symbol} mark=${m.markPrice} idx=${m.indexPrice} fund=${m.fundingRate} nextFund=${m.nextFundingTime} ts=${m.ts}`);
      if (n >= 5) { h.stop(); console.log('[smoke] OK — real mark-price pushes received, schema verified'); process.exit(0); }
    },
    onStatus: (s) => console.log(`[smoke] status: ${s}`),
  });
  setTimeout(() => { h.stop(); console.error(n ? `[smoke] partial: ${n} marks` : '[smoke] FAIL — no marks in 15s'); process.exit(n ? 0 : 1); }, 15000);
}
