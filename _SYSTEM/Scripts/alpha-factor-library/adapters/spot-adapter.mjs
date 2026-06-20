#!/usr/bin/env node
// @capability: spot-adapter
// @serves: crypto spot | spot venue | spot orderbook | spot depth | binance spot | engine 1 spot leg
// @does: READ-ONLY crypto SPOT adapter (Binance Spot public REST as the venue) — depth (L2 book), ticker, and klines mapped to AFL-unified shapes. SSRF-guarded, KEYLESS (public market-data endpoints only — NO order path, NO API key, ever). Injected HTTP for offline tests, parseNum at boundary, fail-open. Sibling of perp-adapter (which reads the USDⓈ-M perp venue); this reads the SPOT venue so the funding-carry harvester's spot leg fills against the real spot book in paper.
// @use: Reach for this before any code that needs SPOT market depth / ticker / klines — the funding-carry harvester's spot leg (Engine 1), cross-venue basis calc (perp vs spot), spot-faithful paper fills. All exports pure except the HTTP-bound ones (getOrderBook/getTicker/getCandles/getMidPrice), which route through setHttpGet.
// @exports: getOrderBook, getTicker, getCandles, getMidPrice, mapDepth, mapTicker, mapSpotKline, setHttpGet, parseNum, hasCreds, VenueApiError, MappingError, SsrfError

import https from 'node:https';
import { URL } from 'node:url';

// ───────────────────────────────────────────────────────────────────────────
// §0 — CONSTANTS (BINANCE SPOT, public market-data endpoints only)
// ───────────────────────────────────────────────────────────────────────────
//
// Venue: Binance Spot (api.binance.com) — public, KEYLESS market-data endpoints.
// NO order endpoints (/api/v3/order, /api/v3/order/test) are ever called. This is
// strictly the read-only surface that mirrors perp-adapter's contract for the SPOT
// leg of the funding-carry harvester (Engine 1): a delta-neutral carry needs the
// spot book to fill the spot leg against, in paper.
//   - /api/v3/depth   → L2 order book (bids/asks) — the spot leg's GTX fill surface
//   - /api/v3/ticker/bookTicker → best bid/ask (mid for the leg's mark)
//   - /api/v3/klines  → OHLCV (same shape as perp klines)
//   - /api/v3/avgPrice → average price (optional mid proxy)
//
// SSRF allowlist is single-venue (api.binance.com), matching perp-adapter's
// single-venue contract. Unknown hosts are denied by default.

const BASE_HOST = 'api.binance.com';
const PREFIX = '/api/v3';
const ALLOWED_HOSTS = new Set([BASE_HOST]);

// ───────────────────────────────────────────────────────────────────────────
// §1 — ERROR CLASSES (mirror perp-adapter so consumers handle both uniformly)
// ───────────────────────────────────────────────────────────────────────────

export class MappingError extends Error {
  constructor(msg, raw) {
    super(msg);
    this.name = 'MappingError';
    this.raw = raw;
  }
}

export class VenueApiError extends Error {
  constructor(status, body) {
    super(`Spot API ${status}`);
    this.name = 'VenueApiError';
    this.status = status;
    this.body = body;
  }
}

export class SsrfError extends Error {
  constructor(host) {
    super(`SSRF denied: ${host}`);
    this.name = 'SsrfError';
  }
}

// ───────────────────────────────────────────────────────────────────────────
// §2 — INJECTABLE HTTP GET (offline-testable; default node:https)
// ───────────────────────────────────────────────────────────────────────────

let _httpGet = null;

/**
 * setHttpGet(fn) — inject a custom httpGet(url, headers) -> Promise<{status,headers,body}>
 * for offline testing. The default uses node:https. Mirrors perp-adapter.setHttpGet.
 */
export function setHttpGet(fn) {
  if (typeof fn !== 'function') throw new TypeError('setHttpGet: fn must be a function');
  _httpGet = fn;
}

function defaultHttpGet(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': 'YURI-AFL/spot-adapter/1.0', ...headers },
      timeout: 15000,
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('httpGet timeout')); });
    req.on('error', reject);
    req.end();
  });
}

async function httpGet(url, headers) {
  const fn = _httpGet || defaultHttpGet;
  return fn(url, headers);
}

// ───────────────────────────────────────────────────────────────────────────
// §3 — SSRF GUARD (single public-venue allowlist; deny private/loopback/metadata)
// ───────────────────────────────────────────────────────────────────────────

const IPV4_PRIVATE = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;
const IPV4_LINK_LOCAL = /^169\.254\./;
const CLOUD_META = '169.254.169.254';

function guardHost(hostname) {
  if (ALLOWED_HOSTS.has(hostname)) return;
  if (IPV4_PRIVATE.test(hostname)) throw new SsrfError(hostname);
  if (hostname === CLOUD_META) throw new SsrfError(hostname);
  if (IPV4_LINK_LOCAL.test(hostname)) throw new SsrfError(hostname);
  if (hostname === '::1' || hostname === '[::1]' || hostname.startsWith('fe80:')) throw new SsrfError(hostname);
  // Unknown host: deny by default. Single-venue allowlist is the contract.
  throw new SsrfError(hostname);
}

// ───────────────────────────────────────────────────────────────────────────
// §4 — parseNum (INV-6: numbers are strings on the wire; ''→null; fail-closed)
// ───────────────────────────────────────────────────────────────────────────

/**
 * parseNum(x) -> number | null
 * Coerces a wire string to a finite number. Returns null for '', null, undefined,
 * or non-numeric strings. Throws MappingError on NaN/Infinity from a non-empty
 * string (a malformed response is a hard error, not a silent NaN).
 */
export function parseNum(x) {
  if (x == null || x === '') return null;
  const n = Number(x);
  if (!Number.isFinite(n)) throw new MappingError(`parseNum: non-finite value "${x}"`, x);
  return n;
}

// ───────────────────────────────────────────────────────────────────────────
// §5 — CREDENTIAL DETECTION (INV-2: spot is KEYLESS by contract; this is a stub)
// ───────────────────────────────────────────────────────────────────────────
//
// Binance Spot PUBLIC market-data endpoints (depth, bookTicker, klines, avgPrice)
// are keyless. There is NO order path in this adapter (INV-1), ever. hasCreds()
// exists only for shape-parity with perp-adapter; it always returns false — the
// spot adapter has no keyed surface to gate.

export function hasCreds() {
  return false;
}

// ───────────────────────────────────────────────────────────────────────────
// §6 — RESPONSE UNWRAP + SSRF HOST CHECK
// ───────────────────────────────────────────────────────────────────────────

async function fetchJson(urlStr, headers = {}) {
  const u = new URL(urlStr);
  guardHost(u.hostname);
  // Owner's view-only key (hydrated by binance-creds at startup) → X-MBX-APIKEY header for higher rate limits.
  // INV-2: read from env, never logged. Absent → keyless public path.
  const h = process.env.PERP_API_KEY ? { ...headers, 'X-MBX-APIKEY': process.env.PERP_API_KEY } : headers;
  const res = await httpGet(urlStr, h);
  if (res.status < 200 || res.status >= 300) {
    throw new VenueApiError(res.status, res.body);
  }
  // Binance Spot sometimes returns 200 with an error payload (`code`/`msg`); surface it.
  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch (e) {
    throw new MappingError(`spot: non-JSON body from ${urlStr}`, res.body?.slice?.(0, 200));
  }
  if (parsed && typeof parsed === 'object' && 'code' in parsed && 'msg' in parsed && parsed.code !== 200) {
    throw new VenueApiError(parsed.code, parsed.msg);
  }
  return parsed;
}

// ───────────────────────────────────────────────────────────────────────────
// §7 — UNIFIED MAPPERS (pure, exported for unit test)
// ───────────────────────────────────────────────────────────────────────────

/**
 * mapDepth(json, symbol) -> unified L2 book (matches perp-adapter.getOrderBook shape)
 *
   Binance Spot /api/v3/depth shape:
     { lastUpdateId, bids:[[price,size],...], asks:[[price,size],...] }
   Output (shape-parity with perp-adapter.getOrderBook):
     { venue:'binance-spot', symbol, bids:[{price,size}], asks:[{price,size}], mid, spreadBps }
 */
export function mapDepth(json, symbol) {
  if (!json || !Array.isArray(json.bids) || !Array.isArray(json.asks)) throw new MappingError('mapDepth: expected {bids,asks}', json);
  const bids = json.bids.map((l) => ({ price: parseNum(l[0]), size: parseNum(l[1]) })).filter((l) => Number.isFinite(l.price));
  const asks = json.asks.map((l) => ({ price: parseNum(l[0]), size: parseNum(l[1]) })).filter((l) => Number.isFinite(l.price));
  const bestBid = bids[0]?.price, bestAsk = asks[0]?.price;
  const mid = (Number.isFinite(bestBid) && Number.isFinite(bestAsk)) ? (bestBid + bestAsk) / 2 : null;
  const spreadBps = (mid && mid > 0) ? ((bestAsk - bestBid) / mid) * 1e4 : null;
  return { venue: 'binance-spot', symbol, bids, asks, mid, spreadBps };
}

/**
 * mapTicker(json) -> { symbol, price, bid, ask }
 *
   Binance Spot /api/v3/ticker/bookTicker shape:
     { symbol, bidPrice, bidQty, askPrice, askQty }
   price = mid of best bid/ask (same convention as perp-adapter.getTicker).
 */
export function mapTicker(json) {
  if (!json || (json.bidPrice == null && json.askPrice == null)) throw new MappingError('mapTicker: expected bookTicker', json);
  const bid = parseNum(json.bidPrice), ask = parseNum(json.askPrice);
  const price = (Number.isFinite(bid) && Number.isFinite(ask)) ? (bid + ask) / 2 : (Number.isFinite(bid) ? bid : ask);
  return { symbol: json.symbol, price, bid: Number.isFinite(bid) ? bid : null, ask: Number.isFinite(ask) ? ask : null };
}

/**
 * mapSpotKline(k) -> unified Candle { timestamp(unix-sec), open, high, low, close, volume }
 *
   Binance Spot /api/v3/klines array shape (indices — IDENTICAL to perp klines):
     [0]=openTime(ms) [1]=open [2]=high [3]=low [4]=close [5]=volume
   timestamp ms→unix-SECONDS, matching the unified candle contract (drop-in venue swap).
 */
export function mapSpotKline(k) {
  if (!Array.isArray(k) || k.length < 6) throw new MappingError('mapSpotKline: expected kline array', k);
  const tMs = Number(k[0]);
  if (!Number.isFinite(tMs)) throw new MappingError(`mapSpotKline: non-finite openTime "${k[0]}"`, k);
  return {
    timestamp: Math.floor(tMs / 1000), // ms → unix-seconds (match unified candle shape)
    open: parseNum(k[1]),
    high: parseNum(k[2]),
    low: parseNum(k[3]),
    close: parseNum(k[4]),
    volume: parseNum(k[5]),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// §8 — HTTP-BOUND EXPORTS (read-only market data, INV-1, NO order path anywhere)
// ───────────────────────────────────────────────────────────────────────────

/**
 * getOrderBook(symbol, { limit }) -> unified L2 spot book
 *
   Hits `GET /api/v3/depth?symbol=...&limit=...` — the SPOT order book.
   KEYLESS public endpoint (INV-2), SSRF-guarded via fetchJson.
   Binance Spot depth accepts ONLY enumerated limits [5,10,20,50,100,500,1000]
   (a non-allowed limit → HTTP 400). Snap up to the nearest allowed.
   READ-ONLY: this returns market data; it NEVER places an order (INV-1).
 */
export async function getOrderBook(symbol, opts = {}) {
  if (!symbol || typeof symbol !== 'string') throw new MappingError('getOrderBook: symbol required', symbol);
  const ALLOWED_DEPTH = [5, 10, 20, 50, 100, 500, 1000];
  const want = opts.limit != null ? Math.max(1, Number(opts.limit)) : 20;
  const limit = ALLOWED_DEPTH.find((v) => v >= want) || 1000;
  const url = `https://${BASE_HOST}${PREFIX}/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
  const json = await fetchJson(url);
  return mapDepth(json, symbol);
}

/**
 * getTicker(symbol) -> { symbol, price, bid, ask }
 *
   Hits `GET /api/v3/ticker/bookTicker?symbol=...` — best bid/ask for the spot symbol.
   price = mid of best bid/ask (matches perp-adapter.getTicker consumer shape).
   KEYLESS public endpoint (INV-2), SSRF-guarded via fetchJson.
 */
export async function getTicker(symbol, _opts = {}) {
  if (!symbol || typeof symbol !== 'string') throw new MappingError('getTicker: symbol required', symbol);
  const url = `https://${BASE_HOST}${PREFIX}/ticker/bookTicker?symbol=${encodeURIComponent(symbol)}`;
  const json = await fetchJson(url);
  return mapTicker(json);
}

/**
 * getCandles(symbol, { interval?, limit?, startTime?, endTime? }) -> { candles: Candle[] }
 *
   Hits `GET /api/v3/klines` — Binance Spot OHLCV. Same shape + semantics as
   perp-adapter.getCandles (ascending by openTime, ms→unix-seconds, unified candle).
   Default interval '1m', default limit 300. READ-ONLY (INV-1), keyless (INV-2).
 */
export async function getCandles(symbol, opts = {}) {
  if (!symbol || typeof symbol !== 'string') throw new MappingError('getCandles: symbol required', symbol);
  const params = new URLSearchParams();
  params.set('symbol', symbol);
  params.set('interval', opts.interval || '1m');
  params.set('limit', String(opts.limit != null ? Math.min(Math.max(1, Number(opts.limit)), 1000) : 300));
  if (opts.startTime != null) params.set('startTime', String(opts.startTime));
  if (opts.endTime != null) params.set('endTime', String(opts.endTime));
  const url = `https://${BASE_HOST}${PREFIX}/klines?${params.toString()}`;
  const json = await fetchJson(url);
  if (!Array.isArray(json)) throw new MappingError('getCandles: expected kline array', json);
  return { candles: json.map(mapSpotKline) };
}

/**
 * getMidPrice(symbol) -> number | null
 *
   Convenience: just the mid price from bookTicker. Returns null on any failure
   (fail-open — the harvester's spot leg mark must never throw on a transient
   venue error; the daemon's carry beat stays alive).
 */
export async function getMidPrice(symbol) {
  try {
    const t = await getTicker(symbol);
    return Number.isFinite(t.price) ? t.price : null;
  } catch {
    return null;
  }
}
