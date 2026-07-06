#!/usr/bin/env node
// @capability: tick-stream
// @serves: real-time price ticks | websocket tick feed | event-driven execution | live trade exits | sub-second risk exit | binance bookTicker | top-of-book bid/ask
// @does: Connects to the Binance USDⓈ-M futures PUBLIC @bookTicker combined WebSocket (real-time TOP-OF-BOOK — best bid/ask on every book change) and calls onTick({market,price,bid,ask}) on every frame — turning the engine's 1s REST poll into an event-driven sub-second pulse so fastRiskExit fires at the actual touch (caps the overshoot losers). `price` is the mid (bid+ask)/2 — the honest mark for a maker engine's risk/sizing reference (last-trade is noisy/taker-side; this is complementary to mark-price.mjs's 1s settlement mark). Daemon markets ('BTC-USD') are mapped to Binance perp symbols ('BTCUSDT') via cryptoMarketToPerpSymbol (capability-first — reused, not rebuilt) and reverse-mapped back so the onTick contract is unchanged. Zero new dependency (Node built-in WebSocket). Fail-open + auto-reconnect with exponential backoff. View-only market data — no orders, no auth (INV-1/INV-2).
// @use: startTickStream({markets,onTick}) from observatory-server when OBSERVATORY_TICK_STREAM=1 is armed (DISARMED by default — the 1s REST poll stays the fallback floor). parseBookTicker is the pure, unit-tested mapper. Mirrors trades-stream.mjs (fail-open, exp-backoff, injectable WebSocketImpl, --test + --smoke).
// @exports: FSTREAM_WS_URL, parseBookTicker, startTickStream
//
// CONSTRAINTS: paper/view-only (INV-1 — market-data feed only, no order path, no auth/keys INV-2),
// fail-open (a dropped/failed socket never throws into the caller; the REST poll keeps the floor),
// no new npm dependency (Node built-in WebSocket). Binance USDⓈ-M public bookTicker feed needs no API key.
// Coinbase venue SCRAPPED (owner directive 2026-06-19) — this was a Coinbase WS feed, now Binance.
//
// CHANNEL CHOICE (empirically verified 2026-06-20, raw-frame probe /tmp/yuri-ticker-probe*.mjs):
// @ticker (24hrTicker) and @miniTicker are SILENT on this fstream endpoint (socket opens, zero frames
// in 8s+) — same Binance quirk trades-stream.mjs hit with @aggTrade (silent → switched to @trade).
// @bookTicker streams LIVE on both the combined (/stream?streams=) and raw (/ws/) paths and carries
// the bid/ask this feed's contract needs. Subscribe via the URL path (Binance convention, NOT a send-frame).

import { pathToFileURL } from 'node:url';
import { cryptoMarketToPerpSymbol } from '../perp-signals.mjs';

// Binance USDⓈ-M futures PUBLIC market-data WS — combined-stream endpoint. No auth for @bookTicker.
export const FSTREAM_WS_URL = 'wss://fstream.binance.com';

/**
 * parseBookTicker(raw) -> { symbol, price, bid, ask } | null
 * Pure mapper for a Binance USDⓈ-M bookTicker message (top-of-book). Handles both combined-stream
 * envelopes ({stream, data:{...}}) and raw single-stream frames. Returns null for any non-bookTicker
 * frame, malformed data, or a frame with no usable price (both sides invalid).
 *
 * Binance bookTicker fields: s=symbol, b=bestBidPrice, a=bestAskPrice (strings).
 * price = mid (bid+ask)/2 when both sides are valid; otherwise the single valid side.
 * `symbol` is the Binance perp symbol (e.g. 'BTCUSDT'); startTickStream reverse-maps it to the
 * daemon market ('BTC-USD') before calling onTick.
 */
export function parseBookTicker(raw) {
  let m;
  try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!m || typeof m !== 'object') return null;
  // unwrap combined-stream envelope: {stream, data:{...}}
  const d = m.data && typeof m.data === 'object' ? m.data : m;
  if (d.e !== 'bookTicker') return null;
  if (typeof d.s !== 'string' || !d.s) return null;
  const bid = Number(d.b);
  const ask = Number(d.a);
  const bidOk = Number.isFinite(bid) && bid > 0;
  const askOk = Number.isFinite(ask) && ask > 0;
  if (!bidOk && !askOk) return null; // no usable price at all
  const price = bidOk && askOk ? (bid + ask) / 2 : (bidOk ? bid : ask);
  return {
    symbol: d.s,
    price,
    bid: bidOk ? bid : null,
    ask: askOk ? ask : null,
  };
}

/**
 * startTickStream({ markets, onTick, onStatus?, url?, WebSocketImpl?, maxBackoffMs? }) -> { stop() }
 * Connects to wss://fstream.binance.com/stream?streams=<sym>@bookTicker/... and calls
 * onTick({market, price, bid, ask}) on every bookTicker frame. `market` is the original daemon
 * market ('BTC-USD'), reverse-mapped from the Binance symbol so observatory-server's applyTick
 * contract is unchanged. Auto-reconnects with exponential backoff.
 * FAIL-OPEN: bad args / missing WebSocket / no mappable markets → a no-op handle (caller keeps its REST floor).
 * WebSocketImpl is injectable for tests (defaults to the global built-in WebSocket).
 */
export function startTickStream({
  markets = [],
  onTick,
  onStatus = () => {},
  url = FSTREAM_WS_URL,
  WebSocketImpl,
  maxBackoffMs = 30000,
} = {}) {
  const WS = WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  if (!WS) { onStatus('no-websocket-impl'); return { stop() {} }; }
  if (!Array.isArray(markets) || markets.length === 0 || typeof onTick !== 'function') {
    onStatus('bad-args');
    return { stop() {} };
  }

  // Map daemon markets ('BTC-USD') → Binance perp symbols ('BTCUSDT') + build the reverse map.
  // cryptoMarketToPerpSymbol returns null for non-USD-quote / non-crypto markets → skipped (fail-open).
  const symbolToMarket = {};
  const syms = [];
  for (const mk of markets) {
    const sym = cryptoMarketToPerpSymbol(mk);
    if (typeof sym === 'string' && sym && !symbolToMarket[sym]) {
      symbolToMarket[sym] = mk;
      syms.push(sym);
    }
  }
  if (syms.length === 0) { onStatus('no-mappable-markets'); return { stop() {} }; }

  // @bookTicker (top-of-book) — subscribe via the combined-stream URL path (NOT a send-frame).
  const streamPath = '/stream?streams=' + syms.map((s) => `${s.toLowerCase()}@bookTicker`).join('/');

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
    try { ws = new WS(url + streamPath); } catch (e) { onStatus(`connect-error:${e?.message || e}`); return scheduleReconnect(); }

    ws.onopen = () => {
      backoff = 1000; // reset backoff on a healthy connection
      onStatus('open');
    };
    ws.onmessage = (ev) => {
      const parsed = parseBookTicker(ev?.data);
      if (parsed) {
        // reverse-map Binance symbol → daemon market; fall back to the raw symbol (benign passthrough)
        const market = symbolToMarket[parsed.symbol] || parsed.symbol;
        try { onTick({ market, price: parsed.price, bid: parsed.bid, ask: parsed.ask }); } catch (_e) { /* caller error never kills the stream */ }
      }
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

  // ── parseBookTicker: combined-stream bookTicker envelope (price = mid)
  const combinedRaw = JSON.stringify({ stream: 'btcusdt@bookTicker', data: { e: 'bookTicker', s: 'BTCUSDT', b: '63999.5', a: '64000.5', B: '1', A: '1', T: 1, u: 1 } });
  const t = parseBookTicker(combinedRaw);
  ok(t && t.symbol === 'BTCUSDT', 'combined envelope → symbol');
  ok(t && t.price === 64000, 'combined envelope → price=mid (63999.5+64000.5)/2=64000');
  ok(t && t.bid === 63999.5 && t.ask === 64000.5, 'combined envelope → bid/ask');

  // ── raw single-stream frame (no envelope)
  const t2 = parseBookTicker(JSON.stringify({ e: 'bookTicker', s: 'ETHUSDT', b: '3499', a: '3501' }));
  ok(t2 && t2.symbol === 'ETHUSDT' && t2.price === 3500, 'raw single-stream frame parses (mid=3500)');

  // ── object input (pre-parsed)
  const t3 = parseBookTicker({ e: 'bookTicker', s: 'SOLUSDT', b: 71.0, a: 72.0 });
  ok(t3 && t3.symbol === 'SOLUSDT' && t3.price === 71.5, 'object input parses (mid=71.5)');

  // ── one-sided frame: only bid valid → price=bid, ask=null (robustness)
  const t4 = parseBookTicker(JSON.stringify({ e: 'bookTicker', s: 'BTCUSDT', b: '64000', a: 'NaN' }));
  ok(t4 && t4.price === 64000 && t4.bid === 64000 && t4.ask === null, 'one-sided (bid only) → price=bid, ask=null');

  // ── null cases: non-bookTicker, garbage, both-sides-bad, negative, empty symbol, combined non-bookTicker inner
  ok(parseBookTicker(JSON.stringify({ stream: 'btcusdt@depth', data: { e: 'depthUpdate', s: 'BTCUSDT' } })) === null, 'non-bookTicker combined → null');
  ok(parseBookTicker(JSON.stringify({ e: '24hrTicker', s: 'BTCUSDT', c: '1' })) === null, '24hrTicker (wrong channel) → null');
  ok(parseBookTicker('not json') === null, 'garbage → null');
  ok(parseBookTicker(JSON.stringify({ e: 'bookTicker', s: 'BTCUSDT', b: 'NaN', a: 'NaN' })) === null, 'both sides invalid → null');
  // one valid side survives: negative bid rejected (≤0), valid ask → price=ask, bid=null
  const t5 = parseBookTicker(JSON.stringify({ e: 'bookTicker', s: 'BTCUSDT', b: '-5', a: '64000' }));
  ok(t5 && t5.price === 64000 && t5.bid === null && t5.ask === 64000, 'negative bid + valid ask → bid null, price=ask');
  ok(parseBookTicker(JSON.stringify({ e: 'bookTicker', s: '', b: '1', a: '1' })) === null, 'empty symbol → null');
  ok(parseBookTicker(null) === null, 'null input → null');

  // ── startTickStream with a mock WebSocket — URL-path subscription (NO send-frame), reverse-map, stop, noop
  class MockWS {
    constructor(u) { this.url = u; this.sent = []; MockWS.last = this; setTimeout(() => this.onopen && this.onopen(), 0); }
    send(s) { this.sent.push(s); }
    close() { this.closed = true; }
  }
  const ticks = [];
  const statuses = [];
  const h = startTickStream({ markets: ['BTC-USD', 'SOL-USD'], onTick: (x) => ticks.push(x), onStatus: (s) => statuses.push(s), WebSocketImpl: MockWS });
  await new Promise((r) => setTimeout(r, 5)); // let the mock "open" fire
  ok(statuses.includes('open'), 'mock open status fired');
  ok(MockWS.last.url.includes('btcusdt@bookTicker') && MockWS.last.url.includes('solusdt@bookTicker'), 'subscribe via URL path (@bookTicker channels in URL)');
  ok(MockWS.last.sent.length === 0, 'Binance convention: NO subscribe send-frame (URL-path subscription)');
  ok(MockWS.last.url.startsWith('wss://fstream.binance.com/stream?streams='), 'connects to Binance fstream combined-stream URL');

  // feed a combined-stream bookTicker frame → onTick fires with the REVERSE-MAPPED daemon market + mid price
  MockWS.last.onmessage({ data: JSON.stringify({ stream: 'btcusdt@bookTicker', data: { e: 'bookTicker', s: 'BTCUSDT', b: '64099', a: '64101' } }) });
  ok(ticks.length === 1 && ticks[0].price === 64100, 'onTick fired on bookTicker frame (mid=64100)');
  ok(ticks[0].market === 'BTC-USD', 'market reverse-mapped BTCUSDT→BTC-USD (onTick contract preserved)');
  ok(ticks[0].bid === 64099 && ticks[0].ask === 64101, 'onTick carries bid/ask');

  // feed garbage → ignored
  MockWS.last.onmessage({ data: 'garbage' });
  ok(ticks.length === 1, 'garbage frame ignored (no onTick)');

  // feed a non-bookTicker frame (depthUpdate) on the same socket → ignored
  MockWS.last.onmessage({ data: JSON.stringify({ stream: 'btcusdt@depth', data: { e: 'depthUpdate', s: 'BTCUSDT' } }) });
  ok(ticks.length === 1, 'non-bookTicker frame on shared socket ignored');

  // stop() closes the socket
  h.stop();
  ok(MockWS.last.closed === true, 'stop() closes the socket');

  // bad-args → safe no-op handle
  ok(typeof startTickStream({ markets: [], onTick: () => {}, WebSocketImpl: MockWS }).stop === 'function', 'bad-args → safe no-op handle');

  // no mappable markets (all non-USD-quote, e.g. polymarket) → safe no-op handle
  const noMap = startTickStream({ markets: ['BTC-EUR', 'poly-0xabc'], onTick: () => {}, WebSocketImpl: MockWS });
  ok(typeof noMap.stop === 'function', 'no mappable markets → safe no-op handle');

  // no WebSocketImpl in a context without a global → no-op
  const noWs = startTickStream({ markets: ['BTC-USD'], onTick: () => {}, WebSocketImpl: null });
  ok(typeof noWs.stop === 'function', 'no WS impl → safe no-op handle');

  console.log(`tick-stream --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

// ── --smoke (REAL Binance fstream — 15s, print first ~5 ticks, verify reverse-map end-to-end) ─
if (_main && process.argv.includes('--smoke')) {
  const markets = ['BTC-USD']; // daemon format → mapped to BTCUSDT internally, reverse-mapped back on print
  let n = 0;
  console.log(`[smoke] connecting ${FSTREAM_WS_URL} @bookTicker for ${markets.join(',')} (→BTCUSDT) ...`);
  const h = startTickStream({
    markets,
    onTick: (t) => {
      n++;
      if (n <= 5) console.log(`[smoke] tick #${n}: market=${t.market} px=${t.price} (mid) bid=${t.bid} ask=${t.ask}`);
      if (n >= 5) {
        h.stop();
        console.log(`[smoke] OK — ${n} bookTicker frames received, schema verified, price=mid, market reverse-mapped to daemon format`);
        process.exit(0);
      }
    },
    onStatus: (s) => console.log(`[smoke] status: ${s}`),
  });
  setTimeout(() => {
    h.stop();
    console.error(n ? `[smoke] partial: ${n} ticks in 15s` : '[smoke] FAIL — no ticks in 15s');
    process.exit(n ? 0 : 1);
  }, 15000);
}
