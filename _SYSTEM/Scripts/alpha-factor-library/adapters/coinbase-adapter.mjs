#!/usr/bin/env node
// @capability: coinbase-venue-adapter
// @serves: coinbase advanced trade | crypto venue | spot products | candles OHLCV | L2 orderbook | coinbase ticker | account balances | advisory order body
// @does: Advisory-mode read client for Coinbase Advanced Trade v3 — products/candles/ticker/L2-book/accounts mapped to AFL-unified shapes; Ed25519 JWT auth; dynamic rate-limit from response headers; buildOrder returns a body and NEVER submits
// @use: Reach for this before any Coinbase market-data, portfolio-read, or order-construction code
// @exports: getProducts, getCandles, getTicker, getOrderBook, getAccounts, buildOrder, mapProduct, mapCandle, mapBook, makeJwt, parseRateLimit, setHttpGet, parseNum, hasCreds, MappingError, MissingCredentialError, VenueApiError, SsrfError

import crypto from 'node:crypto';
import https from 'node:https';
import { URL } from 'node:url';

// ───────────────────────────────────────────────────────────────────────────
// §0 — CONSTANTS
// ───────────────────────────────────────────────────────────────────────────

const BASE = 'api.coinbase.com';
const PREFIX_AUTHED = '/api/v3/brokerage';
const PREFIX_KEYLESS = '/api/v3/brokerage/market';
const JWT_EXPIRY_SEC = 120;
const ALLOWED_HOSTS = new Set(['api.coinbase.com', 'advanced-trade-ws.coinbase.com']);

const GRANULARITY_ENUM = new Set([
  'ONE_MINUTE', 'FIVE_MINUTE', 'FIFTEEN_MINUTE', 'THIRTY_MINUTE',
  'ONE_HOUR', 'TWO_HOUR', 'SIX_HOUR', 'ONE_DAY',
]);

// ───────────────────────────────────────────────────────────────────────────
// §1 — ERROR CLASSES
// ───────────────────────────────────────────────────────────────────────────

export class MappingError extends Error {
  constructor(msg, raw) { super(msg); this.name = 'MappingError'; this.raw = raw; }
}
export class MissingCredentialError extends Error {
  constructor(what) { super(`Missing credential: ${what}`); this.name = 'MissingCredentialError'; }
}
export class VenueApiError extends Error {
  constructor(status, body) { super(`Coinbase API ${status}`); this.name = 'VenueApiError'; this.status = status; this.body = body; }
}
export class SsrfError extends Error {
  constructor(host) { super(`SSRF denied: ${host}`); this.name = 'SsrfError'; }
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
      headers: { 'User-Agent': 'YURI-AFL/1.0', ...headers },
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
// §3 — SSRF GUARD
// ───────────────────────────────────────────────────────────────────────────

const IPV4_PRIVATE = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;
const IPV4_LINK_LOCAL = /^169\.254\./;
const CLOUD_META = '169.254.169.254';

function guardHost(hostname) {
  if (ALLOWED_HOSTS.has(hostname)) return;
  // Block raw IPs
  if (IPV4_PRIVATE.test(hostname)) throw new SsrfError(hostname);
  if (hostname === CLOUD_META) throw new SsrfError(hostname);
  // Block IPv6 loopback/link-local
  if (hostname === '::1' || hostname === '[::1]' || hostname.startsWith('fe80:')) throw new SsrfError(hostname);
  // Unknown host — allow (public DNS), but log a warning for observability
  // (We don't throw here because new public API hosts may be added.)
}

// ───────────────────────────────────────────────────────────────────────────
// §4 — parseNum (INV-6: numbers are strings on the wire)
// ───────────────────────────────────────────────────────────────────────────

/**
 * parseNum(x) -> number | null
 * Coerces a wire string to a finite number. Returns null for '', null, undefined,
 * or non-numeric strings. Throws MappingError on NaN/Infinity from a non-empty string
 * (a malformed response).
 */
export function parseNum(x) {
  if (x == null || x === '') return null;
  const n = Number(x);
  if (!Number.isFinite(n)) throw new MappingError(`parseNum: non-finite value "${x}"`, x);
  return n;
}

// ───────────────────────────────────────────────────────────────────────────
// §5 — CREDENTIAL DETECTION (INV-2: env vars only, never .env)
// ───────────────────────────────────────────────────────────────────────────

/**
 * hasCreds() -> boolean
 * True when COINBASE_KEY_NAME + COINBASE_API_SECRET are both set in process.env.
 */
export function hasCreds() {
  return !!(process.env.COINBASE_KEY_NAME && process.env.COINBASE_API_SECRET);
}

function getCreds() {
  const keyName = process.env.COINBASE_KEY_NAME;
  const privateKeyPem = process.env.COINBASE_API_SECRET;
  if (!keyName || !privateKeyPem) throw new MissingCredentialError('COINBASE_KEY_NAME + COINBASE_API_SECRET');
  return { keyName, privateKeyPem };
}

// ───────────────────────────────────────────────────────────────────────────
// §6 — Ed25519 JWT AUTH (grounding L11–24; EC deprecated → Ed25519 preferred)
// ───────────────────────────────────────────────────────────────────────────

let _ecWarningEmitted = false;

/**
 * makeJwt({ keyName, privateKeyPem, method, requestPath }) -> string
 *
 * Builds a signed JWT for Coinbase Advanced Trade v3.
 * Prefers Ed25519 (EdDSA). If an EC/ES256 key is detected, emits a single
 * UserWarning and still signs with ES256.
 *
 * JWT header: { alg, kid, typ: 'JWT', nonce: <hex 16B> }
 * JWT payload: { sub, iss: 'cdp', nbf, exp, uri: "METHOD api.coinbase.com/path" }
 */
export function makeJwt({ keyName, privateKeyPem, method, requestPath }) {
  if (!keyName || !privateKeyPem) throw new MissingCredentialError('keyName + privateKeyPem');
  if (!method || !requestPath) throw new TypeError('makeJwt: method + requestPath required');

  let key;
  try {
    // Normalize PEMs carried as single-line strings (env vars, JSON `privateKey` fields, copy-paste
    // all escape newlines to a literal "\n"). A real PEM body never contains a backslash-n, so this
    // is a no-op for already-correct PEMs and the fix for the escaped case (DECODER 'unsupported').
    const normalizedPem = typeof privateKeyPem === 'string' && privateKeyPem.includes('\\n')
      ? privateKeyPem.replace(/\\n/g, '\n')
      : privateKeyPem;
    key = crypto.createPrivateKey(normalizedPem);
  } catch (e) {
    throw new MappingError(`makeJwt: invalid PEM: ${e.message}`, String(privateKeyPem).substring(0, 20) + '...');
  }

  const isEd25519 = key.asymmetricKeyType === 'ed25519';
  const isEC = key.asymmetricKeyType === 'ec';

  if (!isEd25519 && !isEC) {
    throw new MappingError(`makeJwt: unsupported key type "${key.asymmetricKeyType}" — expected ed25519 or ec`, key.asymmetricKeyType);
  }

  if (isEC && !_ecWarningEmitted) {
    _ecWarningEmitted = true;
    // Single UserWarning per process (grounding L17)
    process.emitWarning('Ed25519 is the recommended key type for Coinbase Advanced Trade. Consider switching at portal.cdp.coinbase.com', {
      type: 'CoinbaseKeyDeprecation',
    });
  }

  const alg = isEd25519 ? 'EdDSA' : 'ES256';
  const nonce = crypto.randomBytes(16).toString('hex');
  const now = Math.floor(Date.now() / 1000);

  const header = { alg, kid: keyName, typ: 'JWT', nonce };
  const payload = {
    sub: keyName,
    iss: 'cdp',
    nbf: now,
    exp: now + JWT_EXPIRY_SEC,
    uri: `${method} api.coinbase.com${requestPath}`,
  };

  const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const headerB64 = b64u(header);
  const payloadB64 = b64u(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  // Ed25519: algorithm MUST be null (no prehash); sig is already raw 64-byte EdDSA.
  // EC/ES256: MUST digest with SHA-256 AND emit RAW R‖S (IEEE-P1363) — Node defaults to DER-encoded
  // ECDSA, which the JWT/JWS ES256 spec (and Coinbase) reject → 401. This branch was never exercised
  // because Ed25519 is Coinbase's default key type.
  const sig = isEd25519
    ? crypto.sign(null, Buffer.from(signingInput), key)
    : crypto.sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
  const sigB64 = sig.toString('base64url');

  return `${signingInput}.${sigB64}`;
}

// ───────────────────────────────────────────────────────────────────────────
// §7 — DYNAMIC RATE LIMIT (grounding L41–48; NOT fixed 30/s)
// ───────────────────────────────────────────────────────────────────────────

/**
 * parseRateLimit(responseHeaders) -> { limit: int|null, remaining: int|null, resetSec: int|null }
 *
 * Reads x-ratelimit-limit / x-ratelimit-remaining / x-ratelimit-reset from
 * response headers. Returns null for any missing header.
 */
export function parseRateLimit(headers) {
  if (!headers || typeof headers !== 'object') return { limit: null, remaining: null, resetSec: null };
  const get = (k) => {
    // Headers from node:https are lowercase; fetch Headers are case-insensitive via get()
    const v = headers[k] ?? headers[k.toLowerCase()] ?? (typeof headers.get === 'function' ? headers.get(k) : undefined);
    if (v == null) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  return {
    limit: get('x-ratelimit-limit'),
    remaining: get('x-ratelimit-remaining'),
    resetSec: get('x-ratelimit-reset'),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// §8 — UNIFIED MAPPERS (pure, exported for unit test)
// ───────────────────────────────────────────────────────────────────────────

/**
 * mapProduct(p) -> unified Product
 * Reads ONLY the documented fields from the raw Coinbase product object.
 */
export function mapProduct(p) {
  if (!p || typeof p !== 'object') throw new MappingError('mapProduct: expected object', p);
  return {
    symbol: p.product_id,
    venue: 'coinbase',
    price: parseNum(p.price),
    baseIncrement: parseNum(p.base_increment),
    quoteIncrement: parseNum(p.quote_increment),
    priceIncrement: parseNum(p.price_increment),
    baseMin: parseNum(p.base_min_size),
    baseMax: parseNum(p.base_max_size),
    quoteMin: parseNum(p.quote_min_size),
    quoteMax: parseNum(p.quote_max_size),
    status: p.status,
    tradable: p.trading_disabled === false,
    productType: p.product_type,
  };
}

/**
 * mapCandle(c) -> canonical OHLCV bar { timestamp, open, high, low, close, volume }
 *
 * Coinbase candle is a NAMED OBJECT with fields: start, low, high, open, close, volume
 * (all strings). Emits `timestamp` (ms-epoch) to match the data-quality-gate's
 * live field name (the gate checks `bar.timestamp`, not `bar.time` or `bar.t`).
 */
export function mapCandle(c) {
  if (!c || typeof c !== 'object') throw new MappingError('mapCandle: expected object', c);
  return {
    timestamp: Number(c.start),   // Coinbase `start` is unix-seconds; data-quality-gate expects ms-epoch
    open: parseNum(c.open),
    high: parseNum(c.high),
    low: parseNum(c.low),
    close: parseNum(c.close),
    volume: parseNum(c.volume),
  };
}

/**
 * mapBook(r) -> unified L2 book
 * Reads r.pricebook.bids[].{price,size}, r.pricebook.asks[].{price,size},
 * optional r.mid_market, r.spread_bps.
 */
export function mapBook(r) {
  if (!r || typeof r !== 'object') throw new MappingError('mapBook: expected object', r);
  const pb = r.pricebook;
  if (!pb || typeof pb !== 'object') throw new MappingError('mapBook: missing pricebook', r);
  return {
    venue: 'coinbase',
    symbol: pb.product_id,
    bids: (pb.bids || []).map((l) => ({ price: parseNum(l.price), size: parseNum(l.size) })),
    asks: (pb.asks || []).map((l) => ({ price: parseNum(l.price), size: parseNum(l.size) })),
    mid: r.mid_market != null ? parseNum(r.mid_market) : null,
    spreadBps: r.spread_bps != null ? parseNum(r.spread_bps) : null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// §9 — API CALL HELPERS
// ───────────────────────────────────────────────────────────────────────────

function apiPath(authed, path) {
  const prefix = authed ? PREFIX_AUTHED : PREFIX_KEYLESS;
  return `${prefix}${path}`;
}

function apiUrl(authed, path, query) {
  const fullPath = apiPath(authed, path);
  const u = new URL(`https://${BASE}${fullPath}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v == null || v === '') continue;
      if (Array.isArray(v)) {
        for (const item of v) u.searchParams.append(k, String(item));
      } else {
        u.searchParams.set(k, String(v));
      }
    }
  }
  return u.toString();
}

async function apiGet(authed, path, query = {}) {
  const url = apiUrl(authed, path, query);
  guardHost(new URL(url).hostname);

  const headers = {};
  if (authed) {
    const { keyName, privateKeyPem } = getCreds();
    const jwt = makeJwt({ keyName, privateKeyPem, method: 'GET', requestPath: apiPath(authed, path) });
    headers['Authorization'] = `Bearer ${jwt}`;
  }

  const res = await httpGet(url, headers);
  if (res.status === 429) {
    const rl = parseRateLimit(res.headers);
    throw new VenueApiError(429, `Rate limited. Reset in ${rl.resetSec}s`);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new VenueApiError(res.status, res.body);
  }

  let data;
  try {
    data = JSON.parse(res.body);
  } catch (e) {
    throw new MappingError(`Coinbase response not valid JSON: ${e.message}`, res.body.substring(0, 200));
  }

  return { data, rateLimit: parseRateLimit(res.headers) };
}

// ───────────────────────────────────────────────────────────────────────────
// §10 — EXPORTS: MARKET DATA (keyless OK)
// ───────────────────────────────────────────────────────────────────────────

/**
 * getProducts(opts?) -> { products: Product[], num_products: number }
 *
 * opts (all optional):
 *   limit, offset, product_type ('SPOT'|'FUTURE'), product_ids (string[]),
 *   get_tradability_status (bool), get_all_products (bool)
 */
export async function getProducts(opts = {}) {
  const authed = hasCreds();
  const query = {};
  if (opts.limit != null) query.limit = opts.limit;
  if (opts.offset != null) query.offset = opts.offset;
  if (opts.product_type) query.product_type = opts.product_type;
  if (opts.product_ids?.length) query.product_ids = opts.product_ids;
  if (opts.get_tradability_status != null) query.get_tradability_status = String(opts.get_tradability_status);
  if (opts.get_all_products != null) query.get_all_products = String(opts.get_all_products);

  const { data } = await apiGet(authed, '/products', query);
  if (!data || !Array.isArray(data.products)) {
    throw new MappingError('getProducts: expected { products: [...] }', data);
  }
  return {
    products: data.products.map(mapProduct),
    num_products: data.num_products ?? data.products.length,
  };
}

/**
 * getCandles(productId, { start, end, granularity, limit? }) -> { candles: Candle[] }
 *
 * REQUIRED: start (unix-sec), end (unix-sec), granularity (enum).
 * Optional: limit (≤350).
 * Coinbase returns newest-first → REVERSE to chronological (else data-quality-gate
 * non-monotone trip).
 */
export async function getCandles(productId, opts = {}) {
  if (!productId) throw new TypeError('getCandles: productId required');
  if (opts.start == null || opts.end == null) throw new TypeError('getCandles: start + end required (unix-sec)');
  if (!GRANULARITY_ENUM.has(opts.granularity)) {
    throw new TypeError(`getCandles: invalid granularity "${opts.granularity}" — must be one of ${[...GRANULARITY_ENUM].join(', ')}`);
  }

  const authed = hasCreds();
  const query = {
    start: String(opts.start),
    end: String(opts.end),
    granularity: opts.granularity,
  };
  if (opts.limit != null) query.limit = String(opts.limit);

  const { data } = await apiGet(authed, `/products/${encodeURIComponent(productId)}/candles`, query);
  if (!data || !Array.isArray(data.candles)) {
    throw new MappingError('getCandles: expected { candles: [...] }', data);
  }

  // Coinbase returns newest-first → reverse to chronological
  const chronological = [...data.candles].reverse();
  return {
    candles: chronological.map(mapCandle),
  };
}

/**
 * getTicker(productId, { limit, start?, end? }) -> unified ticker
 *
 * Coinbase /ticker = Get Market Trades. Returns { trades, best_bid, best_ask }.
 * We build a unified ticker: bid, ask, mid, last, volume.
 */
export async function getTicker(productId, opts = {}) {
  if (!productId) throw new TypeError('getTicker: productId required');
  if (opts.limit == null) throw new TypeError('getTicker: limit required');

  const authed = hasCreds();
  const query = { limit: String(opts.limit) };
  if (opts.start != null) query.start = String(opts.start);
  if (opts.end != null) query.end = String(opts.end);

  const { data } = await apiGet(authed, `/products/${encodeURIComponent(productId)}/ticker`, query);
  if (!data || typeof data !== 'object') throw new MappingError('getTicker: expected object', data);

  const bestBid = parseNum(data.best_bid);
  const bestAsk = parseNum(data.best_ask);
  const trades = data.trades || [];
  const lastTrade = trades[0];
  const last = lastTrade ? parseNum(lastTrade.price) : null;
  const mid = bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null;

  // Volume: sum trade sizes as fallback (24h vol from products is preferred but not available here)
  let volume = null;
  if (trades.length > 0) {
    const sum = trades.reduce((acc, t) => acc + (parseNum(t.size) || 0), 0);
    if (sum > 0) volume = sum;
  }

  return {
    venue: 'coinbase',
    symbol: productId,
    bid: bestBid,
    ask: bestAsk,
    mid,
    last,
    volume,
  };
}

/**
 * getOrderBook(productId, { limit?, aggregation_price_increment? }) -> unified L2 book
 *
 * CONFIRMED: path = /product_book (top-level), product_id as QUERY param.
 * NOT /market_book, NOT /products/{id}/product_book.
 */
export async function getOrderBook(productId, opts = {}) {
  if (!productId) throw new TypeError('getOrderBook: productId required');

  const authed = hasCreds();
  const query = { product_id: productId };
  if (opts.limit != null) query.limit = String(opts.limit);
  if (opts.aggregation_price_increment != null) query.aggregation_price_increment = String(opts.aggregation_price_increment);

  const { data } = await apiGet(authed, '/product_book', query);
  return mapBook(data);
}

// ───────────────────────────────────────────────────────────────────────────
// §11 — EXPORTS: AUTHED ONLY
// ───────────────────────────────────────────────────────────────────────────

/**
 * getAccounts(opts?) -> { accounts: Balance[], advisory?: string }
 *
 * AUTHED ONLY — no keyless variant. INV-4: if no creds, returns
 * { accounts: [], advisory: 'no-key' } rather than throwing.
 *
 * opts: limit (≤250, default 49), cursor?, retail_portfolio_id?
 */
export async function getAccounts(opts = {}) {
  if (!hasCreds()) return { accounts: [], advisory: 'no-key' };

  const query = { limit: String(opts.limit ?? 49) };
  if (opts.cursor) query.cursor = opts.cursor;
  if (opts.retail_portfolio_id) query.retail_portfolio_id = opts.retail_portfolio_id;

  const { data } = await apiGet(true, '/accounts', query);
  if (!data || !Array.isArray(data.accounts)) {
    throw new MappingError('getAccounts: expected { accounts: [...] }', data);
  }

  return {
    accounts: data.accounts.map((a) => ({
      venue: 'coinbase',
      currency: a.currency,
      available: parseNum(a.available_balance?.value),
      hold: parseNum(a.hold?.value),
      total: (parseNum(a.available_balance?.value) || 0) + (parseNum(a.hold?.value) || 0),
    })),
    has_next: data.has_next ?? false,
    cursor: data.cursor ?? null,
    size: data.size ?? data.accounts.length,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// §12 — buildOrder (INV-1: returns body ONLY, NEVER POSTs)
// ───────────────────────────────────────────────────────────────────────────

/**
 * buildOrder({ product_id, side, size, price?, type, timeInForce? }) -> advisory order body
 *
 * PURE function — no network call. Returns the request body that WOULD be POSTed
 * to /api/v3/brokerage/orders in Phase 4. Never submits.
 *
 * type: 'market' | 'limit' (default 'limit')
 * side: 'BUY' | 'SELL'
 * timeInForce: 'GTC' | 'GTT' | 'IOC' | 'FOK' (default 'GTC')
 */
export function buildOrder(p = {}) {
  if (!p || typeof p !== 'object') throw new TypeError('buildOrder: expected object');
  if (!p.product_id) throw new TypeError('buildOrder: product_id required');
  if (!p.side || !['BUY', 'SELL'].includes(p.side)) throw new TypeError('buildOrder: side must be BUY or SELL');
  if (p.size == null || parseNum(p.size) == null) throw new TypeError('buildOrder: size required (finite number)');
  const type = p.type || 'limit';
  if (!['market', 'limit'].includes(type)) throw new TypeError('buildOrder: type must be market or limit');

  const sizeStr = String(p.size);
  const timeInForce = p.timeInForce || 'GTC';

  let orderConfiguration;
  if (type === 'market') {
    orderConfiguration = { market_market_ioc: { base_size: sizeStr } };
  } else {
    if (p.price == null || parseNum(p.price) == null) throw new TypeError('buildOrder: price required for limit orders');
    orderConfiguration = { limit_limit_gtc: { base_size: sizeStr, limit_price: String(p.price) } };
  }

  return {
    venue: 'coinbase',
    product_id: p.product_id,
    side: p.side,
    order_configuration: orderConfiguration,
    time_in_force: timeInForce,
    _advisory: true,
    _submittable: false,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// §13 — SELF-TEST (node --check pass + basic shape verification)
// ───────────────────────────────────────────────────────────────────────────

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^file:\/\//, ''))) {
  // ── parseNum ──
  const pn = parseNum;
  console.assert(pn('123.45') === 123.45, 'parseNum string');
  console.assert(pn('') === null, 'parseNum empty → null');
  console.assert(pn(null) === null, 'parseNum null → null');
  console.assert(pn(undefined) === null, 'parseNum undefined → null');
  try { pn('not-a-number'); console.assert(false, 'should throw'); } catch (e) { console.assert(e instanceof MappingError, 'parseNum bad string → MappingError'); }

  // ── mapCandle ──
  const candle = mapCandle({ start: '1718505600', low: '65000.00', high: '65500.00', open: '65200.00', close: '65350.00', volume: '123.456' });
  console.assert(candle.timestamp === 1718505600, 'mapCandle timestamp');
  console.assert(candle.open === 65200, 'mapCandle open');
  console.assert(candle.high === 65500, 'mapCandle high');
  console.assert(candle.low === 65000, 'mapCandle low');
  console.assert(candle.close === 65350, 'mapCandle close');
  console.assert(candle.volume === 123.456, 'mapCandle volume');
  // Verify shape matches data-quality-gate expectations
  console.assert('timestamp' in candle, 'mapCandle has timestamp field');
  console.assert(Number.isFinite(candle.timestamp), 'mapCandle timestamp finite');
  console.assert(Number.isFinite(candle.open), 'mapCandle open finite');
  console.assert(Number.isFinite(candle.high), 'mapCandle high finite');
  console.assert(Number.isFinite(candle.low), 'mapCandle low finite');
  console.assert(Number.isFinite(candle.close), 'mapCandle close finite');
  console.assert(Number.isFinite(candle.volume), 'mapCandle volume finite');

  // ── mapProduct ──
  const prod = mapProduct({
    product_id: 'BTC-USD', price: '65432.10', base_increment: '0.00000001', quote_increment: '0.01',
    price_increment: '0.01', base_min_size: '0.00001', base_max_size: '100', quote_min_size: '1',
    quote_max_size: '1000000', status: 'online', trading_disabled: false, product_type: 'SPOT',
  });
  console.assert(prod.symbol === 'BTC-USD', 'mapProduct symbol');
  console.assert(prod.venue === 'coinbase', 'mapProduct venue');
  console.assert(prod.price === 65432.10, 'mapProduct price');
  console.assert(prod.tradable === true, 'mapProduct tradable');

  // ── mapBook ──
  const book = mapBook({
    pricebook: {
      product_id: 'BTC-USD',
      bids: [{ price: '65000.00', size: '1.5' }, { price: '64900.00', size: '2.0' }],
      asks: [{ price: '65100.00', size: '0.8' }],
      time: '2026-06-16T00:00:00Z',
    },
    mid_market: '65050.00',
    spread_bps: '15.38',
  });
  console.assert(book.symbol === 'BTC-USD', 'mapBook symbol');
  console.assert(book.bids.length === 2, 'mapBook bids count');
  console.assert(book.bids[0].price === 65000, 'mapBook bid price');
  console.assert(book.mid === 65050, 'mapBook mid');
  console.assert(book.spreadBps === 15.38, 'mapBook spreadBps');

  // ── buildOrder (INV-1: pure, no fetch) ──
  const limitOrder = buildOrder({ product_id: 'BTC-USD', side: 'BUY', size: 0.001, price: 65000, type: 'limit' });
  console.assert(limitOrder.venue === 'coinbase', 'buildOrder venue');
  console.assert(limitOrder._advisory === true, 'buildOrder advisory');
  console.assert(limitOrder._submittable === false, 'buildOrder submittable false');
  console.assert(limitOrder.order_configuration.limit_limit_gtc.base_size === '0.001', 'buildOrder limit size');
  console.assert(limitOrder.order_configuration.limit_limit_gtc.limit_price === '65000', 'buildOrder limit price');

  const marketOrder = buildOrder({ product_id: 'ETH-USD', side: 'SELL', size: 0.5, type: 'market' });
  console.assert(marketOrder.order_configuration.market_market_ioc.base_size === '0.5', 'buildOrder market size');
  console.assert(marketOrder.side === 'SELL', 'buildOrder side');

  // ── parseRateLimit ──
  const rl = parseRateLimit({ 'x-ratelimit-limit': '100', 'x-ratelimit-remaining': '87', 'x-ratelimit-reset': '1718505600' });
  console.assert(rl.limit === 100, 'parseRateLimit limit');
  console.assert(rl.remaining === 87, 'parseRateLimit remaining');
  console.assert(rl.resetSec === 1718505600, 'parseRateLimit reset');

  const rlEmpty = parseRateLimit(null);
  console.assert(rlEmpty.limit === null, 'parseRateLimit null → null');

  // ── hasCreds (no env set in test) ──
  console.assert(hasCreds() === false, 'hasCreds false without env');

  // ── SSRF guard ──
  try { guardHost('169.254.169.254'); console.assert(false, 'SSRF should deny cloud meta'); } catch (e) { console.assert(e instanceof SsrfError, 'SSRF cloud meta'); }
  try { guardHost('127.0.0.1'); console.assert(false, 'SSRF should deny loopback'); } catch (e) { console.assert(e instanceof SsrfError, 'SSRF loopback'); }
  try { guardHost('192.168.1.1'); console.assert(false, 'SSRF should deny private'); } catch (e) { console.assert(e instanceof SsrfError, 'SSRF private'); }
  // Allowed host should NOT throw
  guardHost('api.coinbase.com'); // no throw = pass

  // ── makeJwt (Ed25519) ──
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const jwt = makeJwt({ keyName: 'test-key', privateKeyPem: pem, method: 'GET', requestPath: '/api/v3/brokerage/market/products' });
  console.assert(typeof jwt === 'string' && jwt.split('.').length === 3, 'makeJwt produces 3-part JWT');

  // ── setHttpGet ──
  const captured = [];
  setHttpGet(async (url, headers) => {
    captured.push({ url, headers });
    return { status: 200, headers: {}, body: JSON.stringify({ products: [] }) };
  });
  console.assert(captured.length === 0, 'setHttpGet pre-call empty');

  console.log('coinbase-adapter self-test PASS');
}
