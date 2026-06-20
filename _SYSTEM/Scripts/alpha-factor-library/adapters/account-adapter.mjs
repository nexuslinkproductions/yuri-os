#!/usr/bin/env node
// @capability: account-adapter
// @serves: binance account read | real balance | open positions | wallet equity | HMAC signed GET | view-only account | spot fallback
// @does: READ-ONLY Binance account reads (HMAC-SHA256 signed GET) — tries USDⓈ-M futures first (/fapi/v2/balance + /fapi/v2/positionRisk on fapi.binance.com), falls back to spot (/api/v3/account on api.binance.com) when the key lacks futures permission (HTTP 401 or code -2015). Returns a normalized {connected,venue,balances,positions,realEquityUsd,advisory} shape. VIEW-ONLY: calls ONLY read endpoints (no /order). SSRF-guarded (two-host allowlist), setHttpGet-injectable for offline tests, fail-open (no key/error → {connected:false,advisory}). INV-2: the SECRET is used for HMAC in-memory ONLY; NEVER logged/errored/committed.
// @use: Reach for this to surface the owner's REAL Binance balance/positions on the observatory board (refreshAccount wires it in). Do NOT use for order placement — the key has no trade permission and this adapter calls no order endpoints. Inject setHttpGet with a mock for deterministic tests.
// @exports: getAccountView, signedGet, setHttpGet, hasCreds, parseNum, VenueApiError, SsrfError, MappingError

import crypto from 'node:crypto';
import https from 'node:https';
import { URL } from 'node:url';

// ───────────────────────────────────────────────────────────────────────────
// §0 — CONSTANTS (two-host allowlist: Binance USDⓈ-M futures + spot)
// ───────────────────────────────────────────────────────────────────────────
const FUTURES_HOST = 'fapi.binance.com';
const SPOT_HOST = 'api.binance.com';
const ALLOWED_HOSTS = new Set([FUTURES_HOST, SPOT_HOST]);

const USD_STABLE = new Set(['USD', 'USDC', 'USDT', 'DAI', 'PYUSD', 'USDP', 'GUSD', 'FDUSD', 'TUSD']);

// ───────────────────────────────────────────────────────────────────────────
// §1 — ERROR CLASSES (mirrors perp-adapter; INV-2: no cred in messages)
// ───────────────────────────────────────────────────────────────────────────

export class MappingError extends Error {
  constructor(msg, raw) {
    super(msg);
    this.name = 'MappingError';
    this.raw = raw;
  }
}

export class VenueApiError extends Error {
  constructor(status, code, body) {
    // INV-2: NEVER include the key/secret/signature in the message. code is the
    // Binance numeric error code (e.g. -2015) or the HTTP status; body is the
    // raw response which Binance returns as `{"code":-2015,"msg":"..."}` — the
    // msg does NOT contain creds, but we cap its length defensively.
    super(`Account API ${status}${code != null ? ` (code ${code})` : ''}`);
    this.name = 'VenueApiError';
    this.status = status;
    this.code = code;
    this.body = typeof body === 'string' ? body.slice(0, 200) : body;
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
      headers: { 'User-Agent': 'YURI-AFL/account-adapter/1.0', ...headers },
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
// §3 — SSRF GUARD (two-host allowlist: futures + spot; deny everything else)
// ───────────────────────────────────────────────────────────────────────────

const IPV4_PRIVATE = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;

function guardHost(hostname) {
  if (ALLOWED_HOSTS.has(hostname)) return;
  if (IPV4_PRIVATE.test(hostname)) throw new SsrfError(hostname);
  if (hostname === '169.254.169.254') throw new SsrfError(hostname);
  if (hostname === '::1' || hostname === '[::1]' || hostname.startsWith('fe80:')) throw new SsrfError(hostname);
  throw new SsrfError(hostname); // unknown host: deny by default (two-venue allowlist is the contract)
}

// ───────────────────────────────────────────────────────────────────────────
// §4 — parseNum (INV-6: wire strings → number; ''→null; fail-closed on non-finite)
// ───────────────────────────────────────────────────────────────────────────

export function parseNum(x) {
  if (x == null || x === '') return null;
  const n = Number(x);
  if (!Number.isFinite(n)) throw new MappingError(`parseNum: non-finite value`, x);
  return n;
}

// ───────────────────────────────────────────────────────────────────────────
// §5 — CREDENTIAL DETECTION (INV-2: env-only; hydrated by binance-creds at startup)
// ───────────────────────────────────────────────────────────────────────────

export function hasCreds() {
  return !!(process.env.PERP_API_KEY && process.env.PERP_API_SECRET);
}

// ───────────────────────────────────────────────────────────────────────────
// §6 — HMAC-SHA256 SIGNED GET (the core primitive)
// ───────────────────────────────────────────────────────────────────────────
//
// Binance signed reads: build the query with timestamp + recvWindow + params,
// compute HMAC_SHA256(query, secret) as hex, append &signature=<sig>, and send
// the API key in the X-MBX-APIKEY header. INV-2: the secret is used HERE ONLY
// to compute the signature; it is never placed in the URL (except as the sig),
// never in a header, never logged, never in a thrown error.

/**
 * signedGet(host, path, params?) -> Promise<{status, headers, body, parsed}>
 *
   Builds: GET https://{host}{path}?timestamp=<now>&recvWindow=5000&{params}&signature=<hmac>
   Header: X-MBX-APIKEY carries the hydrated PERP_API_KEY (read from env, never logged).
   Throws VenueApiError on non-2xx OR a Binance {code,msg} error payload (code !== 200).
   Throws SsrfError if host is not in the allowlist. The signature is computed
   from the FULL query string EXCLUDING the signature itself (Binance contract).
 *
 * @param {string} host  - fapi.binance.com | api.binance.com (allowlist-enforced)
 * @param {string} path  - e.g. '/fapi/v2/balance' (must start with /)
 * @param {object} [params] - extra query params (key→value), url-encoded
 */
export async function signedGet(host, path, params = {}) {
  if (!hasCreds()) throw new VenueApiError(0, null, 'missing PERP_API_KEY/SECRET (hydrate binance-creds first)');
  if (!ALLOWED_HOSTS.has(host)) throw new SsrfError(host);
  if (!path || !path.startsWith('/')) throw new MappingError('signedGet: path must start with /', path);

  const query = new URLSearchParams();
  query.set('timestamp', String(Date.now()));
  query.set('recvWindow', '5000');
  for (const [k, v] of Object.entries(params)) {
    if (v != null) query.set(k, String(v));
  }
  // HMAC over the query EXCLUDING signature (Binance signs the pre-signature query string).
  const queryStr = query.toString();
  const sig = crypto.createHmac('sha256', process.env.PERP_API_SECRET).update(queryStr).digest('hex');
  const url = `https://${host}${path}?${queryStr}&signature=${sig}`;

  const res = await httpGet(url, { 'X-MBX-APIKEY': process.env.PERP_API_KEY });

  let parsed;
  try {
    parsed = res.body ? JSON.parse(res.body) : null;
  } catch {
    // Non-JSON body — surface as VenueApiError with the status (no creds in body).
    if (res.status < 200 || res.status >= 300) throw new VenueApiError(res.status, null, res.body);
    throw new MappingError(`signedGet: non-JSON body from ${path}`, res.body?.slice?.(0, 200));
  }

  // Binance returns 200 with an error payload {code,msg} on auth/permission failures.
  if (parsed && typeof parsed === 'object' && 'code' in parsed && 'msg' in parsed && parsed.code !== 200) {
    throw new VenueApiError(res.status, parsed.code, parsed.msg);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new VenueApiError(res.status, parsed?.code, res.body);
  }
  return { status: res.status, headers: res.headers, body: res.body, parsed };
}

// ───────────────────────────────────────────────────────────────────────────
// §7 — FUTURES PATH (/fapi/v2/balance + /fapi/v2/positionRisk)
// ───────────────────────────────────────────────────────────────────────────

/**
 * _readFutures() -> { balances, positions }
 *
   GET /fapi/v2/balance  → wallet balances per asset [{accountAlias,asset,balance,availableBalance,crossWalletBalance,...}]
   GET /fapi/v2/positionRisk → open positions [{symbol,positionAmt,entryPrice,markPrice,unRealizedProfit,positionSide,...}]
   Both signed. positionRisk returns ALL symbols the account has ever interacted with, so we
   filter to positionAmt !== '0' (actual open positions). Balances: free=availableBalance, locked=balance-availableBalance.
 */
async function _readFutures() {
  const [balRes, posRes] = await Promise.all([
    signedGet(FUTURES_HOST, '/fapi/v2/balance'),
    signedGet(FUTURES_HOST, '/fapi/v2/positionRisk'),
  ]);
  const balRows = Array.isArray(balRes.parsed) ? balRes.parsed : [];
  const posRows = Array.isArray(posRes.parsed) ? posRes.parsed : [];

  const balances = balRows
    .filter((r) => r && r.asset && parseNum(r.balance) !== 0)
    .map((r) => {
      const bal = parseNum(r.balance) ?? 0;
      const avail = parseNum(r.availableBalance) ?? 0;
      return {
        asset: r.asset,
        free: avail,
        locked: Math.max(0, bal - avail),
      };
    });

  const positions = posRows
    .filter((r) => r && r.symbol && parseNum(r.positionAmt) !== 0)
    .map((r) => {
      const qty = parseNum(r.positionAmt) ?? 0;
      return {
        symbol: r.symbol,
        side: qty > 0 ? 'long' : 'short',
        qty,
        entryPx: parseNum(r.entryPrice),
        unrealizedPnl: parseNum(r.unRealizedProfit),
      };
    });

  return { balances, positions };
}

// ───────────────────────────────────────────────────────────────────────────
// §8 — SPOT FALLBACK PATH (/api/v3/account)
// ───────────────────────────────────────────────────────────────────────────
//
// Triggered when the view-only key lacks futures permission (HTTP 401 or code -2015).
// Spot /api/v3/account returns accountBalances + balances; we use .balances which
// is the array of {asset,free,locked}. No positions on spot (spot has no perps).

async function _readSpot() {
  const res = await signedGet(SPOT_HOST, '/api/v3/account');
  const acct = res.parsed && typeof res.parsed === 'object' ? res.parsed : {};
  const balRows = Array.isArray(acct.balances) ? acct.balances : [];

  const balances = balRows
    .filter((r) => r && r.asset && (parseNum(r.free) !== 0 || parseNum(r.locked) !== 0))
    .map((r) => ({
      asset: r.asset,
      free: parseNum(r.free) ?? 0,
      locked: parseNum(r.locked) ?? 0,
    }));

  return { balances, positions: [] };
}

// ───────────────────────────────────────────────────────────────────────────
// §9 — realEquityUsd (best-effort: USD-pegged stablecoins at face value)
// ───────────────────────────────────────────────────────────────────────────
//
// No extra API call: sum free+locked of USD-pegged stablecoins at face value.
// Non-stable balances are NOT priced here (would need a spot quote per asset);
// they appear in balances[] but are excluded from realEquityUsd. This matches
// the orchestrator's existing USD_STABLE convention + the "zero extra API calls"
// contract. Downstream can enrich with mark prices if desired.

function _equityFromBalances(balances) {
  let sum = 0;
  let hasStable = false;
  for (const b of balances) {
    if (USD_STABLE.has(b.asset)) {
      sum += (b.free || 0) + (b.locked || 0);
      hasStable = true;
    }
  }
  return hasStable ? Number(sum.toFixed(8)) : null;
}

// ───────────────────────────────────────────────────────────────────────────
// §10 — PUBLIC ENTRY: getAccountView({venue?}) → normalized shape
// ───────────────────────────────────────────────────────────────────────────

/**
 * getAccountView({ venue?: 'perp'|'spot' }) -> { connected, venue, balances, positions, realEquityUsd, advisory, ts }
 *
   Tries FUTURES first (/fapi/v2/balance + /fapi/v2/positionRisk). On a permission
   error (HTTP 401 OR Binance code -2015 — "Invalid API-key, IP, or permissions"),
   falls back to SPOT /api/v3/account. Pass venue:'spot' to skip the futures probe.
   Fail-open: no creds / any error → { connected:false, advisory }. Never throws
   to the caller (the orchestrator cycle must not break on an account read).
 *
   @returns {{connected:boolean, venue:string|null, balances:Array, positions:Array, realEquityUsd:number|null, advisory:string|null, ts:number}}
 */
export async function getAccountView(opts = {}) {
  const forceVenue = opts && opts.venue;
  const ts = Math.floor(Date.now() / 1000);

  if (!hasCreds()) {
    return { connected: false, venue: null, balances: [], positions: [], realEquityUsd: null, advisory: 'no binance creds (keyless; hydrate binance-creds)', ts };
  }

  // ── Futures-first (default), spot-fallback on permission error ──
  if (forceVenue !== 'spot') {
    try {
      const { balances, positions } = await _readFutures();
      const realEquityUsd = _equityFromBalances(balances);
      return { connected: true, venue: 'perp', balances, positions, realEquityUsd, advisory: null, ts };
    } catch (err) {
      const isPermissionError = err instanceof VenueApiError && (err.status === 401 || err.code === -2015 || err.code === -2014);
      if (!isPermissionError) {
        // Non-permission error (network, SSRF, mapping) — fail-open with the reason (masked).
        return { connected: false, venue: null, balances: [], positions: [], realEquityUsd: null, advisory: `futures read failed: ${err.name}`, ts };
      }
      // Permission error → fall through to spot.
    }
  }

  // ── Spot fallback ──
  try {
    const { balances, positions } = await _readSpot();
    const realEquityUsd = _equityFromBalances(balances);
    return { connected: true, venue: 'spot', balances, positions, realEquityUsd, advisory: balances.length ? null : 'spot connected; no non-zero balances', ts };
  } catch (err) {
    return { connected: false, venue: null, balances: [], positions: [], realEquityUsd: null, advisory: `spot read failed: ${err.name}`, ts };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// §11 — CLI self-check (reports connected/venue/counts ONLY; never the key/values)
// ───────────────────────────────────────────────────────────────────────────

const _main = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (_main) {
  // Hydrate creds from keychain (binance-creds), then probe. NEVER prints the key/secret/raw response.
  const { hydrateBinanceCreds } = await import('./binance-creds.mjs');
  hydrateBinanceCreds();
  const view = await getAccountView();
  console.log(JSON.stringify({
    connected: view.connected,
    venue: view.venue,
    balances: view.balances.length,
    positions: view.positions.length,
    realEquityUsd: view.realEquityUsd,
    advisory: view.advisory,
  }));
}
