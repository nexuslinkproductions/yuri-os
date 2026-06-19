#!/usr/bin/env node
// @capability: perp-adapter
// @serves: crypto perpetuals | perp venue | funding rate | open interest | mark price | basis | term structure | crypto-native factors
// @does: READ-ONLY crypto perpetuals adapter (Binance USDⓈ-M public REST as the default venue) — funding rate, open interest (snapshot + hist), and basis (perp vs spot) are mapped to AFL-unified shapes that match the crypto factors' data_inputs (funding_rate, open_interest, future_price, spot_price, basis). SSRF-guarded, keyless by default (env-gated when venue requires it), injected HTTP for offline tests, injected spot-getter for the basis calc so it does not hard-couple to the coinbase adapter. INV-1 (no order path), INV-2 (no key reads), INV-3 (live reads OK), INV-6 (parseNum at boundary, ''→null), INV-7 (deterministic + offline-testable) all honored.
// @use: Reach for this before any code that needs perp funding / OI / basis to feed the crypto-native factors (crypto-funding-price-reaction, crypto-price-oi-quadrant, crypto-basis-term-structure-carry, crypto-lvr-aware-lp). All exports pure except the HTTP-bound ones (getFunding/getOpenInterest/getBasis/getMarkets/getCandles), which route through setHttpGet.
// @exports: getFunding, getOpenInterest, getBasis, getMarkets, getCandles, getOrderBook, getTicker, mapFunding, mapOpenInterest, mapKline, annualizeFunding, setHttpGet, parseNum, hasCreds, VenueApiError, MappingError, SsrfError

import https from 'node:https';
import { URL } from 'node:url';

// ───────────────────────────────────────────────────────────────────────────
// §0 — CONSTANTS (BINANCE USDⓈ-M FUTURES, public read endpoints)
// ───────────────────────────────────────────────────────────────────────────
//
// Venue: Binance USDⓈ-M futures (fapi.binance.com) — public, keyless for the
// funding / OI / premium-index endpoints we need. The read shape maps to:
//   - premiumIndex    → current mark + index (spot) + last funding rate
//   - fundingRate     → historical funding rate records
//   - openInterest    → OI in contracts (multiplied by contractSize for notional)
//   - exchangeInfo    → perp universe (symbols, contractSize, pricePrecision)
//
// The adapter is venue-swappable: setHttpGet lets tests inject a mock; the
// URL builder is local to the small fetch helpers so a future venue swap is
// a single function replace. The basis calc accepts the spot price via
// `getSpotPrice(symbol)` injection (no hard-coupling to coinbase-adapter.mjs).

const BASE_HOST = 'fapi.binance.com';
const PREFIX = '/fapi/v1';
const ALLOWED_HOSTS = new Set([BASE_HOST]);

// fundingRate is published every 8h by default for most Binance USDⓈ-M perps,
// so annualizeFunding's default period count is 1095 (= 3 * 365).
export const DEFAULT_PERIODS_PER_YEAR_8H = 1095;

// ───────────────────────────────────────────────────────────────────────────
// §1 — ERROR CLASSES
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
    super(`Perp API ${status}`);
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
 * for offline testing. The default uses node:https.
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
      headers: { 'User-Agent': 'YURI-AFL/perp-adapter/1.0', ...headers },
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
// §3 — SSRF GUARD (public-venue allowlist; deny private/loopback/metadata)
// ───────────────────────────────────────────────────────────────────────────
//
// Hard-deny: raw IPv4 private/loopback/link-local, the cloud-metadata IP, and
// IPv6 loopback/link-local. Then ALLOW only the explicit public venue host
// (single-host allowlist for perp reads). Unknown public hosts are denied by
// default — the perp adapter is single-venue by design; if a new venue is
// added, register it in ALLOWED_HOSTS deliberately.

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
// §5 — CREDENTIAL DETECTION (INV-2: env-only, never .env, never echoed)
// ───────────────────────────────────────────────────────────────────────────
//
// The default venue (Binance USDⓈ-M public reads) is keyless. hasCreds() still
// exists for forward-compat: if a future venue swap needs an API key, gate it
// behind PERP_API_KEY + hasCreds() and no-op the keyed path silently. Until
// then, hasCreds() returns false and the keyless public path is the only path.

export function hasCreds() {
  return !!(process.env.PERP_API_KEY && process.env.PERP_API_SECRET);
}

// ───────────────────────────────────────────────────────────────────────────
// §6 — RESPONSE UNWRAP + SSRF HOST CHECK
// ───────────────────────────────────────────────────────────────────────────

async function fetchJson(urlStr, headers = {}) {
  const u = new URL(urlStr);
  guardHost(u.hostname);
  const res = await httpGet(urlStr, headers);
  if (res.status < 200 || res.status >= 300) {
    throw new VenueApiError(res.status, res.body);
  }
  // Binance sometimes returns 200 with an error payload (`code`/`msg`); surface it.
  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch (e) {
    throw new MappingError(`perp: non-JSON body from ${urlStr}`, res.body?.slice?.(0, 200));
  }
  if (parsed && typeof parsed === 'object' && 'code' in parsed && 'msg' in parsed && parsed.code !== 200) {
    throw new VenueApiError(parsed.code, parsed.msg);
  }
  return parsed;
}

// ───────────────────────────────────────────────────────────────────────────
// §7 — UNIFIED MAPPERS (pure, exported for unit test)
// ───────────────────────────────────────────────────────────────────────────
//
// Output field names match the crypto factors' data_inputs:
//   funding_rate, open_interest, future_price, spot_price, basis

/**
 * mapFunding(row) -> unified FundingRecord
 *
   Binance `premiumIndex` shape (subset, all strings):
     { symbol, markPrice, indexPrice, lastFundingRate,
       nextFundingTime, time, interestRate }
   Binance `fundingRate` (history) shape:
     { symbol, fundingTime, fundingRate, markPrice }
 *
   Output:
     { venue:'binance-um', symbol, timestamp(ms),
       fundingRate: number|null,
       markPrice:   number|null,
       indexPrice:  number|null }
 */
export function mapFunding(row) {
  if (!row || typeof row !== 'object') throw new MappingError('mapFunding: expected object', row);
  // Funding history uses `fundingTime`; premiumIndex uses `time`. Take whichever is present.
  const tsRaw = row.fundingTime ?? row.time ?? row.nextFundingTime;
  if (tsRaw == null) throw new MappingError('mapFunding: missing timestamp', row);
  const tsMs = Number(tsRaw);
  if (!Number.isFinite(tsMs)) throw new MappingError(`mapFunding: non-finite timestamp "${tsRaw}"`, row);
  if (!row.symbol || typeof row.symbol !== 'string') throw new MappingError('mapFunding: missing symbol', row);
  return {
    venue: 'binance-um',
    symbol: row.symbol,
    timestamp: tsMs,
    fundingRate: parseNum(row.lastFundingRate ?? row.fundingRate),
    markPrice:   parseNum(row.markPrice),
    indexPrice:  parseNum(row.indexPrice),
  };
}

/**
 * mapOpenInterest(row) -> unified OpenInterestRecord
 *
   Binance `openInterest` shape:
     { symbol, openInterest, time }
   OI is in CONTRACTS (not base or quote). To get base notional multiply by
   contractSize from exchangeInfo; the caller can derive it via getMarkets().
 */
export function mapOpenInterest(row) {
  if (!row || typeof row !== 'object') throw new MappingError('mapOpenInterest: expected object', row);
  const tsRaw = row.time ?? row.timestamp;
  if (tsRaw == null) throw new MappingError('mapOpenInterest: missing time', row);
  const tsMs = Number(tsRaw);
  if (!Number.isFinite(tsMs)) throw new MappingError(`mapOpenInterest: non-finite time "${tsRaw}"`, row);
  if (!row.symbol || typeof row.symbol !== 'string') throw new MappingError('mapOpenInterest: missing symbol', row);
  const oi = parseNum(row.openInterest ?? row.sumOpenInterest);
  if (oi == null) throw new MappingError('mapOpenInterest: missing openInterest', row);
  return {
    venue: 'binance-um',
    symbol: row.symbol,
    timestamp: tsMs,
    openInterest: oi,                  // contracts (NOT base/quote notional)
    openInterestNotional: null,         // caller can populate via getMarkets() + markPrice
  };
}

/**
 * annualizeFunding(rate, periodsPerYear = 1095) -> number
 *
   Returns the APR-equivalent funding rate. Default 1095 periods/year for 8h
   funding (3 per day × 365). For 1h funding venues, pass 8760; for 4h, 2190.
   NaN/Infinity on the input is rejected (fail-closed). Null/undefined rate
   returns null so a missing wire field is propagated rather than zero-filled.
 */
export function annualizeFunding(rate, periodsPerYear = DEFAULT_PERIODS_PER_YEAR_8H) {
  if (rate == null) return null;
  const n = Number(rate);
  if (!Number.isFinite(n)) throw new MappingError(`annualizeFunding: non-finite rate "${rate}"`, rate);
  if (!Number.isFinite(periodsPerYear) || periodsPerYear <= 0) {
    throw new MappingError(`annualizeFunding: invalid periodsPerYear "${periodsPerYear}"`, periodsPerYear);
  }
  return n * periodsPerYear;
}

// ───────────────────────────────────────────────────────────────────────────
// §8 — HTTP-BOUND EXPORTS (read-only, INV-1, no order path anywhere)
// ───────────────────────────────────────────────────────────────────────────

/**
 * getFunding(symbol) -> unified FundingRecord
 *
   Hits `GET /fapi/v1/premiumIndex?symbol=...` — current mark + index + last
   funding rate for one perp symbol. Returns ONE record (not an array) because
   the perps the AFL factors care about (BTCUSDT, ETHUSDT, ...) are tracked
   individually. For history, use `getFundingHistory` (below).
 */
export async function getFunding(symbol) {
  if (!symbol || typeof symbol !== 'string') throw new MappingError('getFunding: symbol required', symbol);
  const sym = encodeURIComponent(symbol);
  const url = `https://${BASE_HOST}${PREFIX}/premiumIndex?symbol=${sym}`;
  const json = await fetchJson(url);
  return mapFunding(json);
}

/**
 * getFundingHistory(symbol, { limit?, startTime?, endTime? }) -> FundingRecord[]
 *
   Hits `GET /fapi/v1/fundingRate`. Useful for the funding-x-price-reaction
   factor which needs a series, not just a snapshot. Newest-first per Binance;
   we DO NOT reverse here — callers consuming the crypto factors expect
   newest-first (same direction as Coinbase candles, which the data-quality-
   gate already accepts as newest-first per the master-brief §3).
 */
export async function getFundingHistory(symbol, opts = {}) {
  if (!symbol || typeof symbol !== 'string') throw new MappingError('getFundingHistory: symbol required', symbol);
  const params = new URLSearchParams();
  params.set('symbol', symbol);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.startTime != null) params.set('startTime', String(opts.startTime));
  if (opts.endTime != null) params.set('endTime', String(opts.endTime));
  const url = `https://${BASE_HOST}${PREFIX}/fundingRate?${params.toString()}`;
  const json = await fetchJson(url);
  if (!Array.isArray(json)) throw new MappingError('getFundingHistory: expected array', json);
  return json.map(mapFunding);
}

/**
 * getOpenInterest(symbol, { hist?, period?, limit? }) -> unified OpenInterestRecord | OpenInterestRecord[]
 *
   Snapshot (hist=false, default):
     Hits `GET /fapi/v1/openInterest?symbol=...` — current OI in CONTRACTS.
     Returns one unified OpenInterestRecord { symbol, timestamp(ms), openInterest, openInterestNotional }.

   History (hist=true):
     Hits `GET /futures/data/openInterestHist?symbol=...&period=PERIOD&limit=LIMIT`.
     Valid periods: 5m 15m 30m 1h 2h 4h 6h 12h 1d (Binance default 5m).
     Returns ascending array of OpenInterestRecord (oldest-first, matches kline convention).
     Hist rows from Binance: { timestamp(unix-ms), sumOpenInterest, sumOpenInterestValue }.
     sumOpenInterestValue (quote notional) is stored in openInterestNotional when present.

   OI is in CONTRACTS (not base or quote). For base or quote notional, multiply by
   contractSize (from getMarkets) and markPrice (from getFunding.markPrice).
 */
export async function getOpenInterest(symbol, { hist = false, period = '1h', limit = 30 } = {}) {
  if (!symbol || typeof symbol !== 'string') throw new MappingError('getOpenInterest: symbol required', symbol);
  const sym = encodeURIComponent(symbol);

  if (!hist) {
    // Snapshot: /fapi/v1/openInterest
    const url = `https://${BASE_HOST}${PREFIX}/openInterest?symbol=${sym}`;
    const json = await fetchJson(url);
    return mapOpenInterest(json);
  }

  // History: /futures/data/openInterestHist (different path prefix, same host)
  const lim = Math.min(Math.max(1, Number(limit) || 30), 500); // Binance max 500
  const params = new URLSearchParams({ symbol, period, limit: String(lim) });
  const url = `https://${BASE_HOST}/futures/data/openInterestHist?${params.toString()}`;
  const json = await fetchJson(url);
  if (!Array.isArray(json)) throw new MappingError('getOpenInterest hist: expected array', json);

  // Hist rows: { timestamp(unix-ms), sumOpenInterest, sumOpenInterestValue } — no symbol field
  // Inject symbol + map through mapOpenInterest (which handles sumOpenInterest fallback).
  // Preserve Binance ascending order (oldest-first).
  return json.map((row) => {
    const rec = mapOpenInterest({ ...row, symbol });
    // Enrich notional from sumOpenInterestValue if present
    const notional = parseNum(row.sumOpenInterestValue ?? null);
    return { ...rec, openInterestNotional: notional ?? rec.openInterestNotional };
  });
}

/**
 * getMarkets() -> unified Market[]
 *
   Hits `GET /fapi/v1/exchangeInfo`. Returns a list of perp symbols (those
   whose `contractType` or `contractStatus` indicates a perpetual). Each
   market has the contract size + price precision needed to translate OI
   from contracts → base notional in downstream factors.
 */
export async function getMarkets() {
  const url = `https://${BASE_HOST}${PREFIX}/exchangeInfo`;
  const json = await fetchJson(url);
  if (!json || !Array.isArray(json.symbols)) throw new MappingError('getMarkets: missing symbols[]', json);
  return json.symbols
    .filter((s) => s && (s.contractType === 'PERPETUAL' || s.contractType === ' perpetual'))
    .map((s) => ({
      venue: 'binance-um',
      symbol: s.symbol,
      base: s.baseAsset,
      quote: s.quoteAsset,
      contractType: s.contractType,
      status: s.status,
      contractSize: parseNum(s.contractSize) ?? 1,
      pricePrecision: s.pricePrecision ?? null,
      quantityPrecision: s.quantityPrecision ?? null,
      onboardDate: s.onboardDate != null ? Number(s.onboardDate) : null,
    }));
}

/**
 * mapKline(k) -> unified Candle { timestamp(unix-sec), open, high, low, close, volume }
 *
   Binance USDⓈ-M futures kline array shape (indices):
     [0]=openTime(ms) [1]=open [2]=high [3]=low [4]=close [5]=volume
     [6]=closeTime [7]=quoteVol [8]=trades [9]=takerBuyBase [10]=takerBuyQuote [11]=ignore
   timestamp is converted ms→unix-SECONDS to match the coinbase-adapter candle shape, so the
   orchestrator + data-quality-gate consume Binance bars through the SAME unified
   {timestamp,open,high,low,close,volume} contract (drop-in venue swap).
 */
export function mapKline(k) {
  if (!Array.isArray(k) || k.length < 6) throw new MappingError('mapKline: expected kline array', k);
  const tMs = Number(k[0]);
  if (!Number.isFinite(tMs)) throw new MappingError(`mapKline: non-finite openTime "${k[0]}"`, k);
  return {
    timestamp: Math.floor(tMs / 1000), // ms → unix-seconds (match coinbase candle shape)
    open: parseNum(k[1]),
    high: parseNum(k[2]),
    low: parseNum(k[3]),
    close: parseNum(k[4]),
    volume: parseNum(k[5]),
  };
}

/**
 * getCandles(symbol, { interval?, limit?, startTime?, endTime? }) -> { candles: Candle[] }
 *
   Hits `GET /fapi/v1/klines` — Binance USDⓈ-M futures OHLCV. Binance returns klines
   ASCENDING by openTime (oldest-first) = the chronological order the data-quality-gate +
   factor warmup expect, so NO reverse is needed (unlike coinbase's newest-first candles).
   Default interval '1m', default limit 300 (the engine's CANDLES_FETCH_LIMIT warmup), Binance
   max 1500. startTime/endTime are unix-MILLISECONDS per the Binance API. READ-ONLY (INV-1),
   keyless public endpoint (INV-2), SSRF-guarded via fetchJson.
 */
export async function getCandles(symbol, opts = {}) {
  if (!symbol || typeof symbol !== 'string') throw new MappingError('getCandles: symbol required', symbol);
  const params = new URLSearchParams();
  params.set('symbol', symbol);
  params.set('interval', opts.interval || '1m');
  params.set('limit', String(opts.limit != null ? Math.min(Math.max(1, Number(opts.limit)), 1500) : 300));
  if (opts.startTime != null) params.set('startTime', String(opts.startTime));
  if (opts.endTime != null) params.set('endTime', String(opts.endTime));
  const url = `https://${BASE_HOST}${PREFIX}/klines?${params.toString()}`;
  const json = await fetchJson(url);
  if (!Array.isArray(json)) throw new MappingError('getCandles: expected kline array', json);
  return { candles: json.map(mapKline) };
}

/**
 * getOrderBook(symbol, { limit }) -> unified L2 book (matches coinbase-adapter.mapBook shape)
 *   { venue:'binance-um', symbol, bids:[{price,size}], asks:[{price,size}], mid, spreadBps }
 * Binance USDⓈ-M REST depth (fapi/v1/depth). Keyless public endpoint (INV-2), SSRF-guarded via fetchJson.
 */
export async function getOrderBook(symbol, opts = {}) {
  if (!symbol || typeof symbol !== 'string') throw new MappingError('getOrderBook: symbol required', symbol);
  // Binance USDⓈ-M depth accepts ONLY enumerated limits — snap up to the nearest allowed (else HTTP 400).
  const ALLOWED_DEPTH = [5, 10, 20, 50, 100, 500, 1000];
  const want = opts.limit != null ? Math.max(1, Number(opts.limit)) : 20;
  const limit = ALLOWED_DEPTH.find((v) => v >= want) || 1000;
  const url = `https://${BASE_HOST}${PREFIX}/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
  const json = await fetchJson(url);
  if (!json || !Array.isArray(json.bids) || !Array.isArray(json.asks)) throw new MappingError('getOrderBook: expected {bids,asks}', json);
  const bids = json.bids.map((l) => ({ price: parseNum(l[0]), size: parseNum(l[1]) })).filter((l) => Number.isFinite(l.price));
  const asks = json.asks.map((l) => ({ price: parseNum(l[0]), size: parseNum(l[1]) })).filter((l) => Number.isFinite(l.price));
  const bestBid = bids[0]?.price, bestAsk = asks[0]?.price;
  const mid = (Number.isFinite(bestBid) && Number.isFinite(bestAsk)) ? (bestBid + bestAsk) / 2 : null;
  const spreadBps = (mid && mid > 0) ? ((bestAsk - bestBid) / mid) * 1e4 : null;
  return { venue: 'binance-um', symbol, bids, asks, mid, spreadBps };
}

/**
 * getTicker(symbol) -> { symbol, price, bid, ask } (matches the fastTick consumer shape)
 * Binance USDⓈ-M REST bookTicker (fapi/v1/ticker/bookTicker). price = mid of best bid/ask.
 * Keyless public endpoint (INV-2), SSRF-guarded via fetchJson.
 */
export async function getTicker(symbol, _opts = {}) {
  if (!symbol || typeof symbol !== 'string') throw new MappingError('getTicker: symbol required', symbol);
  const url = `https://${BASE_HOST}${PREFIX}/ticker/bookTicker?symbol=${encodeURIComponent(symbol)}`;
  const json = await fetchJson(url);
  if (!json || (json.bidPrice == null && json.askPrice == null)) throw new MappingError('getTicker: expected bookTicker', json);
  const bid = parseNum(json.bidPrice), ask = parseNum(json.askPrice);
  const price = (Number.isFinite(bid) && Number.isFinite(ask)) ? (bid + ask) / 2 : (Number.isFinite(bid) ? bid : ask);
  return { symbol, price, bid: Number.isFinite(bid) ? bid : null, ask: Number.isFinite(ask) ? ask : null };
}

/**
 * getBasis(symbol, { getSpotPrice }) -> unified BasisRecord
 *
   basis = (perp_mark - spot) / spot
   Spot is NOT fetched internally: pass `getSpotPrice` (e.g. an async function
   that calls the coinbase-adapter). This keeps the perp adapter decoupled
   from the spot venue — the basis factor (crypto-basis-term-structure-carry)
   can plug in any spot source (coinbase, kraken, chainlink, etc.) without
   modifying this module. If spot is null/NaN, the basis is null (no division
   by zero; no silent zero-fill that would mislead the factor).
 */
export async function getBasis(symbol, opts = {}) {
  if (!symbol || typeof symbol !== 'string') throw new MappingError('getBasis: symbol required', symbol);
  const getSpotPrice = opts.getSpotPrice;
  if (typeof getSpotPrice !== 'function') {
    throw new MappingError('getBasis: opts.getSpotPrice (async fn) is required to avoid hard-coupling to a spot venue', null);
  }
  const [perp, spot] = await Promise.all([
    getFunding(symbol),                      // pulls markPrice
    Promise.resolve().then(() => getSpotPrice(symbol)),
  ]);
  const mark = perp.markPrice;
  if (mark == null) throw new MappingError(`getBasis: missing markPrice for ${symbol}`, perp);
  if (spot == null || !Number.isFinite(Number(spot))) {
    // Spot unavailable — emit a record with basis:null rather than throwing,
    // so the factor can decide how to weight a missing-basis observation.
    return {
      venue: 'binance-um',
      symbol,
      timestamp: perp.timestamp,
      perpPrice: mark,
      spotPrice: null,
      basis: null,
      basisBps: null,
    };
  }
  const s = Number(spot);
  if (s <= 0) {
    return {
      venue: 'binance-um',
      symbol,
      timestamp: perp.timestamp,
      perpPrice: mark,
      spotPrice: s,
      basis: null,
      basisBps: null,
    };
  }
  const basis = (mark - s) / s;
  return {
    venue: 'binance-um',
    symbol,
    timestamp: perp.timestamp,
    perpPrice: mark,
    spotPrice: s,
    basis,
    basisBps: basis * 10_000,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// §9 — RE-EXPORTS FOR CONVENIENCE (snapshot helpers composed from the above)
// ───────────────────────────────────────────────────────────────────────────
//
// These are pure compositions of the HTTP-bound exports so the AFL factor
// code can do `await getFundingRate(symbol)` without remembering the
// canonical record shape. `getFundingRate` returns just the rate (number|null),
// `getOpenInterestContracts` returns just the OI contracts (number|null).

export async function getFundingRate(symbol) {
  const r = await getFunding(symbol);
  return r.fundingRate;
}

export async function getOpenInterestContracts(symbol) {
  const r = await getOpenInterest(symbol);
  return r.openInterest;
}
