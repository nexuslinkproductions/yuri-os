#!/usr/bin/env node
// @capability: tick-stream
// @serves: real-time price ticks | websocket tick feed | event-driven execution | live trade exits | sub-second risk exit
// @does: Connects to the Coinbase Exchange PUBLIC websocket ticker feed and calls onTick({market,price,bid,ask}) on every real exchange tick — turning the engine's 1s REST poll into an event-driven sub-second pulse so fastRiskExit fires at the actual touch (caps the overshoot losers). Zero new dependency (built-in global WebSocket, Node>=21). Fail-open + auto-reconnect with exponential backoff. The actual price-data IS view-only (no orders, no auth — public market-data feed).
// @use: startTickStream({markets,onTick}) from observatory-server when cfg.enableTickStream is armed (DISARMED by default — the 1s REST poll stays the fallback floor). parseTickerMessage is the pure, unit-tested mapper.
// @exports: COINBASE_WS_URL, parseTickerMessage, startTickStream
//
// CONSTRAINTS: paper/view-only (INV-1 — market-data feed only, no order path, no auth/keys INV-2),
// fail-open (a dropped/failed socket never throws into the caller; the REST poll keeps the floor),
// no new npm dependency (Node built-in WebSocket). Coinbase Exchange public feed needs no API key.

import { pathToFileURL } from 'node:url';

// Coinbase Exchange (ex-Pro) PUBLIC market-data websocket — no auth for the ticker channel.
// product_id format is '<BASE>-<QUOTE>' (e.g. 'BTC-USD') — identical to our market keys.
export const COINBASE_WS_URL = 'wss://ws-feed.exchange.coinbase.com';

/**
 * parseTickerMessage(raw) -> {market, price, bid, ask} | null
 * Pure mapper for a Coinbase Exchange 'ticker' message. Returns null for any
 * non-ticker frame (subscriptions ack, heartbeat, error) or malformed price.
 */
export function parseTickerMessage(raw) {
  let m;
  try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!m || m.type !== 'ticker' || !m.product_id) return null;
  const price = Number(m.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const bid = Number(m.best_bid);
  const ask = Number(m.best_ask);
  return {
    market: m.product_id,
    price,
    bid: Number.isFinite(bid) && bid > 0 ? bid : null,
    ask: Number.isFinite(ask) && ask > 0 ? ask : null,
  };
}

/**
 * startTickStream({ markets, onTick, onStatus?, url?, WebSocketImpl?, maxBackoffMs? }) -> { stop() }
 * Connects to the Coinbase ticker feed, subscribes to `markets`, and calls
 * onTick(parsed) on every ticker frame. Auto-reconnects with exponential backoff.
 * FAIL-OPEN: bad args / missing WebSocket → a no-op handle (caller keeps its REST floor).
 * WebSocketImpl is injectable for tests (defaults to the global built-in WebSocket).
 */
export function startTickStream({
  markets = [],
  onTick,
  onStatus = () => {},
  url = COINBASE_WS_URL,
  WebSocketImpl,
  maxBackoffMs = 30000,
} = {}) {
  const WS = WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  if (!WS) { onStatus('no-websocket-impl'); return { stop() {} }; }
  if (!Array.isArray(markets) || markets.length === 0 || typeof onTick !== 'function') {
    onStatus('bad-args');
    return { stop() {} };
  }

  let ws = null;
  let stopped = false;
  let backoff = 1000;

  const scheduleReconnect = () => {
    if (stopped) return;
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, maxBackoffMs);
  };

  function connect() {
    if (stopped) return;
    try { ws = new WS(url); } catch (e) { onStatus(`connect-error:${e?.message || e}`); return scheduleReconnect(); }

    ws.onopen = () => {
      backoff = 1000; // reset backoff on a healthy connection
      onStatus('open');
      try {
        ws.send(JSON.stringify({ type: 'subscribe', product_ids: markets, channels: ['ticker'] }));
      } catch (_e) { /* fail-open — a failed subscribe will surface as no ticks → reconnect */ }
    };
    ws.onmessage = (ev) => {
      const parsed = parseTickerMessage(ev?.data);
      if (parsed) { try { onTick(parsed); } catch (_e) { /* caller error never kills the stream */ } }
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

  // parseTickerMessage
  const t = parseTickerMessage(JSON.stringify({ type: 'ticker', product_id: 'BTC-USD', price: '64000.12', best_bid: '63999.5', best_ask: '64000.5' }));
  ok(t && t.market === 'BTC-USD' && t.price === 64000.12, 'parse ticker → market+price');
  ok(t && t.bid === 63999.5 && t.ask === 64000.5, 'parse ticker → bid/ask');
  ok(parseTickerMessage(JSON.stringify({ type: 'subscriptions', channels: [] })) === null, 'non-ticker frame → null');
  ok(parseTickerMessage('not json') === null, 'garbage → null');
  ok(parseTickerMessage(JSON.stringify({ type: 'ticker', product_id: 'BTC-USD', price: 'NaN' })) === null, 'bad price → null');
  ok(parseTickerMessage(JSON.stringify({ type: 'ticker', product_id: 'BTC-USD', price: '-5' })) === null, 'negative price → null');
  ok(parseTickerMessage(JSON.stringify({ type: 'ticker', price: '1' })) === null, 'missing product_id → null');
  // accepts a pre-parsed object too
  ok(parseTickerMessage({ type: 'ticker', product_id: 'SOL-USD', price: 71.5 })?.market === 'SOL-USD', 'object input parses');
  ok(parseTickerMessage({ type: 'ticker', product_id: 'X-USD', price: 1 })?.bid === null, 'missing bid → null bid (not NaN)');

  // startTickStream with a mock WebSocket — open→subscribe, message→onTick, bad-args→noop
  class MockWS {
    constructor() { this.sent = []; MockWS.last = this; setTimeout(() => this.onopen && this.onopen(), 0); }
    send(s) { this.sent.push(s); }
    close() { this.closed = true; }
  }
  const ticks = [];
  const statuses = [];
  const h = startTickStream({ markets: ['BTC-USD', 'SOL-USD'], onTick: (x) => ticks.push(x), onStatus: (s) => statuses.push(s), WebSocketImpl: MockWS });
  await new Promise((r) => setTimeout(r, 5)); // let the mock "open" fire
  ok(statuses.includes('open'), 'mock open status fired');
  const sub = JSON.parse(MockWS.last.sent[0] || '{}');
  ok(sub.type === 'subscribe' && sub.channels?.includes('ticker'), 'subscribe frame sent');
  ok(Array.isArray(sub.product_ids) && sub.product_ids.length === 2, 'subscribe carries both markets');
  MockWS.last.onmessage({ data: JSON.stringify({ type: 'ticker', product_id: 'BTC-USD', price: '64100' }) });
  ok(ticks.length === 1 && ticks[0].price === 64100, 'onTick fired on ticker frame');
  MockWS.last.onmessage({ data: 'garbage' });
  ok(ticks.length === 1, 'garbage frame ignored (no onTick)');
  h.stop();
  ok(MockWS.last.closed === true, 'stop() closes the socket');

  const noop = startTickStream({ markets: [], onTick: () => {}, WebSocketImpl: MockWS });
  ok(typeof noop.stop === 'function', 'bad-args → safe no-op handle');

  console.log(`tick-stream --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

// ── --smoke (REAL Coinbase WS — verifies URL + schema by connecting) ────────
if (_main && process.argv.includes('--smoke')) {
  const markets = ['BTC-USD', 'SOL-USD'];
  let n = 0;
  console.log(`[smoke] connecting ${COINBASE_WS_URL} for ${markets.join(',')} ...`);
  const h = startTickStream({
    markets,
    onTick: (t) => { n++; console.log(`[smoke] tick #${n}: ${t.market} px=${t.price} bid=${t.bid} ask=${t.ask}`); if (n >= 5) { h.stop(); console.log('[smoke] OK — real ticks received, schema verified'); process.exit(0); } },
    onStatus: (s) => console.log(`[smoke] status: ${s}`),
  });
  setTimeout(() => { h.stop(); console.error(n ? `[smoke] partial: ${n} ticks` : '[smoke] FAIL — no ticks in 15s'); process.exit(n ? 0 : 1); }, 15000);
}
