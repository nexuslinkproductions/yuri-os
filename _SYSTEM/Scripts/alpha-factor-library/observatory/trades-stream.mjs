#!/usr/bin/env node
// @capability: trades-stream
// @serves: aggTrade stream | live trade feed | tape recording | trade flow | buyer maker | aggressor side | BTC trade collector | Engine 2 recorder
// @does: Connects to the Binance USDⓈ-M futures aggTrade combined WebSocket and calls onTrade({symbol,price,qty,ts,isBuyerMaker,aggressorSide,aggId}) on every aggTrade frame. Engine 2 recorder lane — BTC-only by design but multi-symbol capable. Mirrors tick-stream.mjs (fail-open, exp-backoff reconnect, injectable WebSocketImpl, --test + --smoke). Zero new npm dependency (Node built-in WebSocket). View-only market data — no orders, no auth.
// @use: startTradesStream({symbols,onTrade}) from observatory-server when the trade-flow recorder is armed. parseAggTrade is pure + unit-tested. DISARMED standalone — wiring into the live daemon is a separate owner-gated step.
// @exports: FSTREAM_WS_URL, parseAggTrade, startTradesStream
//
// CONSTRAINTS: view-only (INV-1 no order path; INV-2 no keys — public keyless market data), fail-open
// (a dropped socket never throws into the caller), no new npm dep (Node built-in WebSocket).
// Binance USDⓈ-M public aggTrade feed needs no API key.

import { pathToFileURL } from 'node:url';

// Binance USDⓈ-M futures public market-data WS — combined-stream endpoint.
export const FSTREAM_WS_URL = 'wss://fstream.binance.com';

/**
 * parseAggTrade(raw) -> { symbol, price, qty, ts, isBuyerMaker, aggressorSide, aggId } | null
 * Pure mapper for a Binance aggTrade message. Handles both combined-stream envelopes
 * ({stream, data:{...}}) and raw single-stream frames. Returns null for any non-aggTrade
 * frame, malformed data, or non-finite price/qty.
 *
 * aggressorSide derivation:
 *   isBuyerMaker === true  → buyer was the MAKER → trade was SELLER-initiated → 'sell'
 *   isBuyerMaker === false → buyer was the TAKER → trade was BUYER-initiated  → 'buy'
 */
export function parseAggTrade(raw) {
  let m;
  try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!m || typeof m !== 'object') return null;
  // unwrap combined-stream envelope: {stream, data:{...}}
  const d = m.data && typeof m.data === 'object' ? m.data : m;
  if (d.e !== 'aggTrade') return null;
  if (typeof d.s !== 'string' || !d.s) return null;
  const price = Number(d.p);
  const qty   = Number(d.q);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(qty)   || qty   <= 0) return null;
  const ts    = Number(d.T);
  const aggId = Number(d.a);
  const isBuyerMaker = d.m === true;
  return {
    symbol:        d.s,
    price,
    qty,
    ts:            Number.isFinite(ts)    ? ts    : Date.now(),
    isBuyerMaker,
    aggressorSide: isBuyerMaker ? 'sell' : 'buy',
    aggId:         Number.isFinite(aggId) ? aggId : null,
  };
}

/**
 * startTradesStream({ symbols, onTrade, onStatus?, url?, WebSocketImpl?, maxBackoffMs? }) -> { stop() }
 * Connects to wss://fstream.binance.com/stream?streams=<sym>@aggTrade/... and calls
 * onTrade(parsed) on every aggTrade frame. Auto-reconnects with exponential backoff.
 * FAIL-OPEN: bad args / missing WebSocket → a no-op handle (caller keeps its polling floor).
 * WebSocketImpl is injectable for tests (defaults to the global built-in WebSocket).
 */
export function startTradesStream({
  symbols = [],
  onTrade,
  onStatus = () => {},
  url = FSTREAM_WS_URL,
  WebSocketImpl,
  maxBackoffMs = 30_000,
} = {}) {
  const WS = WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  if (!WS) { onStatus('no-websocket-impl'); return { stop() {} }; }
  if (!Array.isArray(symbols) || symbols.length === 0 || typeof onTrade !== 'function') {
    onStatus('bad-args');
    return { stop() {} };
  }

  const syms = symbols.map((s) => String(s).toUpperCase());
  const streamPath = '/stream?streams=' + syms.map((s) => `${s.toLowerCase()}@aggTrade`).join('/');

  let ws      = null;
  let stopped = false;
  let backoff = 1000;

  const scheduleReconnect = () => {
    if (stopped) return;
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, maxBackoffMs);
  };

  function connect() {
    if (stopped) return;
    try { ws = new WS(url + streamPath); } catch (e) { onStatus(`connect-error:${e?.message || e}`); return scheduleReconnect(); }

    ws.onopen = () => {
      backoff = 1000; // reset backoff on a healthy connection
      onStatus('open');
    };
    ws.onmessage = (ev) => {
      const parsed = parseAggTrade(ev?.data);
      if (parsed) { try { onTrade(parsed); } catch (_e) { /* caller error never kills the stream */ } }
    };
    ws.onclose = () => { if (!stopped) { onStatus('close'); scheduleReconnect(); } };
    ws.onerror = (e) => { onStatus(`error:${e?.message || 'ws'}`); try { ws.close(); } catch (_e) { /* noop */ } };
  }

  connect();
  return {
    stop() { stopped = true; try { ws && ws.close(); } catch (_e) { /* noop */ } },
  };
}

// ── --test (offline, deterministic, mock WebSocket) ─────────────────────────
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_main && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };

  // ── parseAggTrade: raw frame
  const rawFrame = JSON.stringify({ e: 'aggTrade', s: 'BTCUSDT', p: '67890.50', q: '0.012', T: 1718000000000, a: 9999, m: false });
  const t1 = parseAggTrade(rawFrame);
  ok(t1 && t1.symbol === 'BTCUSDT',         'raw frame → symbol');
  ok(t1 && t1.price  === 67890.5,           'raw frame → price');
  ok(t1 && t1.qty    === 0.012,             'raw frame → qty');
  ok(t1 && t1.ts     === 1718000000000,     'raw frame → ts');
  ok(t1 && t1.aggId  === 9999,              'raw frame → aggId');

  // ── aggressorSide derivation
  ok(t1 && t1.isBuyerMaker === false && t1.aggressorSide === 'buy',  'isBuyerMaker=false → aggressorSide=buy');
  const t2 = parseAggTrade(JSON.stringify({ e: 'aggTrade', s: 'BTCUSDT', p: '68000', q: '0.1', T: 1, a: 1, m: true }));
  ok(t2 && t2.isBuyerMaker === true  && t2.aggressorSide === 'sell', 'isBuyerMaker=true  → aggressorSide=sell');

  // ── combined-stream envelope unwrapping
  const combinedRaw = JSON.stringify({ stream: 'btcusdt@aggTrade', data: { e: 'aggTrade', s: 'BTCUSDT', p: '70000', q: '1', T: 2, a: 2, m: false } });
  const t3 = parseAggTrade(combinedRaw);
  ok(t3 && t3.symbol === 'BTCUSDT' && t3.price === 70000, 'combined-stream envelope unwrapped');

  // ── object input (pre-parsed)
  const t4 = parseAggTrade({ e: 'aggTrade', s: 'ETHUSDT', p: '3500', q: '0.5', T: 3, a: 3, m: true });
  ok(t4 && t4.symbol === 'ETHUSDT' && t4.aggressorSide === 'sell', 'object input parses');

  // ── null cases: non-aggTrade, garbage, bad price
  ok(parseAggTrade(JSON.stringify({ e: 'depthUpdate', s: 'BTCUSDT' })) === null,      'non-aggTrade → null');
  ok(parseAggTrade('not json')                                          === null,      'garbage → null');
  ok(parseAggTrade(JSON.stringify({ e: 'aggTrade', s: 'BTCUSDT', p: 'NaN', q: '1', T: 0, a: 0, m: false })) === null, 'bad price → null');
  ok(parseAggTrade(JSON.stringify({ e: 'aggTrade', s: 'BTCUSDT', p: '-5',  q: '1', T: 0, a: 0, m: false })) === null, 'negative price → null');
  ok(parseAggTrade(JSON.stringify({ e: 'aggTrade', s: '',         p: '1',   q: '1', T: 0, a: 0, m: false })) === null, 'empty symbol → null');
  // combined-stream with non-aggTrade inner event
  ok(parseAggTrade(JSON.stringify({ stream: 'btcusdt@depth', data: { e: 'depthUpdate', s: 'BTCUSDT' } })) === null, 'combined non-aggTrade → null');

  // ── startTradesStream with a mock WebSocket
  class MockWS {
    constructor(u) { this.url = u; this.sent = []; MockWS.last = this; setTimeout(() => this.onopen && this.onopen(), 0); }
    send(s) { this.sent.push(s); }
    close() { this.closed = true; }
  }
  const trades   = [];
  const statuses = [];
  const h = startTradesStream({
    symbols:    ['BTCUSDT'],
    onTrade:    (x) => trades.push(x),
    onStatus:   (s) => statuses.push(s),
    WebSocketImpl: MockWS,
  });
  await new Promise((r) => setTimeout(r, 5)); // let mock "open" fire
  ok(statuses.includes('open'), 'mock open status fired');
  ok(MockWS.last.url.includes('btcusdt@aggTrade'), 'stream URL contains correct channel path');

  // feed a valid aggTrade frame → onTrade fires
  MockWS.last.onmessage({ data: JSON.stringify({ stream: 'btcusdt@aggTrade', data: { e: 'aggTrade', s: 'BTCUSDT', p: '67000', q: '0.05', T: 9, a: 10, m: false } }) });
  ok(trades.length === 1 && trades[0].price === 67000 && trades[0].aggressorSide === 'buy', 'onTrade fired with correct fields + aggressorSide');

  // feed garbage → ignored
  MockWS.last.onmessage({ data: 'garbage' });
  ok(trades.length === 1, 'garbage frame ignored (no onTrade)');

  // stop() closes the socket
  h.stop();
  ok(MockWS.last.closed === true, 'stop() closes the socket');

  // bad-args → safe no-op handle
  const noop = startTradesStream({ symbols: [], onTrade: () => {}, WebSocketImpl: MockWS });
  ok(typeof noop.stop === 'function', 'bad-args → safe no-op handle');

  // no WebSocketImpl in a context without a global → no-op
  const noWs = startTradesStream({ symbols: ['BTCUSDT'], onTrade: () => {}, WebSocketImpl: null });
  ok(typeof noWs.stop === 'function', 'no WS impl → safe no-op handle');

  console.log(`trades-stream --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

// ── --smoke (REAL Binance fstream — 15s, print first ~5 trades + count) ─────
if (_main && process.argv.includes('--smoke')) {
  const symbols = ['BTCUSDT'];
  let n = 0;
  console.log(`[smoke] connecting ${FSTREAM_WS_URL} aggTrade for ${symbols.join(',')} ...`);
  const h = startTradesStream({
    symbols,
    onTrade: (t) => {
      n++;
      if (n <= 5) console.log(`[smoke] trade #${n}: ${t.symbol} px=${t.price} qty=${t.qty} side=${t.aggressorSide} ts=${t.ts} aggId=${t.aggId}`);
      if (n >= 5) {
        h.stop();
        console.log(`[smoke] OK — ${n} aggTrades received, schema verified`);
        process.exit(0);
      }
    },
    onStatus: (s) => console.log(`[smoke] status: ${s}`),
  });
  setTimeout(() => {
    h.stop();
    console.error(n ? `[smoke] partial: ${n} trades in 15s` : '[smoke] FAIL — no trades in 15s');
    process.exit(n ? 0 : 1);
  }, 15000);
}
