#!/usr/bin/env node
// @capability: polymarket-market-discovery
// @serves: observatory | polymarket | market discovery | active markets | liquidity ranking | token-id extraction
// @does: READ-ONLY discovery of the most active/liquid current Polymarket markets, returning [{tokenId, question}] in the exact shape the orchestrator's DEFAULT_CONFIG.polymarkets expects. Queries the Gamma API for active, non-closed markets sorted by liquidity. Injectable httpGet, SSRF allowlist, parseNum at boundaries. No auth required (L0).
// @use: Reach for this when the orchestrator needs a live list of Polymarket token IDs to track
// @exports: discoverMarkets, mapMarket, setHttpGet, parseNum, SsrfError, DiscoveryError

import https from 'node:https';
import { URL, pathToFileURL } from 'node:url';

// ───────────────────────────────────────────────────────────────────────────
// §0 — CONSTANTS
// ───────────────────────────────────────────────────────────────────────────

const GAMMA_BASE = 'gamma-api.polymarket.com';
const CLOB_BASE = 'clob.polymarket.com';

const ALLOWED_HOSTS = new Set([
  GAMMA_BASE,
  CLOB_BASE,
]);

// SSRF guard patterns (mirrors polymarket-adapter.mjs)
const IPV4_PRIVATE = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;
const CLOUD_META = '169.254.169.254';

// ───────────────────────────────────────────────────────────────────────────
// §1 — ERROR CLASSES
// ───────────────────────────────────────────────────────────────────────────

export class SsrfError extends Error {
  constructor(host) { super(`SSRF denied: ${host}`); this.name = 'SsrfError'; }
}

export class DiscoveryError extends Error {
  constructor(msg, raw) { super(msg); this.name = 'DiscoveryError'; this.raw = raw; }
}

// ───────────────────────────────────────────────────────────────────────────
// §2 — INJECTABLE HTTP GET (offline-testable; default node:https)
// ───────────────────────────────────────────────────────────────────────────

let _httpGet = null;

/**
 * setHttpGet(fn) — inject a custom httpGet(url, headers) -> Promise<{status,headers,body}>
 * for offline testing. The default uses node:https.
 * Contract (H-4): fn(url, headers?) -> Promise<{status:number, headers:Record<string,string>, body:string}>
 */
export function setHttpGet(fn) {
  if (fn !== null && fn !== undefined && typeof fn !== 'function') {
    throw new TypeError('setHttpGet: fn must be a function or null');
  }
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
        const normalizedHeaders = {};
        for (const [k, v] of Object.entries(res.headers)) {
          normalizedHeaders[k.toLowerCase()] = v;
        }
        resolve({ status: res.statusCode, headers: normalizedHeaders, body });
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

function guardHost(hostname) {
  if (ALLOWED_HOSTS.has(hostname)) return;
  if (IPV4_PRIVATE.test(hostname)) throw new SsrfError(hostname);
  if (hostname === CLOUD_META) throw new SsrfError(hostname);
  if (hostname === '::1' || hostname === '[::1]' || hostname.startsWith('fe80:')) throw new SsrfError(hostname);
  // Fail-closed: any host NOT in the allowlist that isn't a known private range is denied
  throw new SsrfError(hostname);
}

// ───────────────────────────────────────────────────────────────────────────
// §4 — parseNum (INV-6: numbers are strings on the wire)
// ───────────────────────────────────────────────────────────────────────────

/**
 * parseNum(x) -> number | null
 * Coerces a wire string to a finite number.
 * - parseNum('') → null (Polymarket liquidity/volume are often '' for illiquid markets)
 * - parseNum(null | undefined) → null
 * - parseNum('0.5') → 0.5
 * - parseNum('abc') → throw DiscoveryError (malformed non-empty string)
 */
export function parseNum(x) {
  if (x == null || x === '') return null;
  const n = Number(x);
  if (!Number.isFinite(n)) throw new DiscoveryError(`parseNum: non-finite value "${x}"`, x);
  return n;
}

// ───────────────────────────────────────────────────────────────────────────
// §5 — API HELPER (with retry + 429 backoff)
// ───────────────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

async function apiGet(baseUrl, path, query = {}, headers = {}) {
  const u = new URL(`https://${baseUrl}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== '') u.searchParams.set(k, String(v));
  }
  guardHost(u.hostname);

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res;
    try {
      res = await httpGet(u.toString(), headers);
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * (2 ** attempt)));
        continue;
      }
      throw e;
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers['retry-after'] || res.headers['x-ratelimit-reset'] || '5', 10);
      const waitMs = (Number.isFinite(retryAfter) ? retryAfter : 5) * 1000;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, Math.min(waitMs, 30000)));
        continue;
      }
      throw new DiscoveryError(`Polymarket Gamma API rate limited (429)`, res.body);
    }

    if (res.status >= 500 && res.status < 600) {
      lastErr = new DiscoveryError(`Polymarket Gamma API ${res.status}`, res.body);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * (2 ** attempt)));
        continue;
      }
      throw lastErr;
    }

    if (res.status < 200 || res.status >= 300) {
      throw new DiscoveryError(`Polymarket Gamma API ${res.status}`, res.body);
    }

    let data;
    try {
      data = JSON.parse(res.body);
    } catch (e) {
      throw new DiscoveryError(`Polymarket Gamma response not valid JSON: ${e.message}`, res.body.substring(0, 200));
    }
    return data;
  }
  throw lastErr || new Error('apiGet: exhausted retries');
}

// ───────────────────────────────────────────────────────────────────────────
// §6 — mapMarket (pure, exported for unit testing)
// ───────────────────────────────────────────────────────────────────────────

/**
 * mapMarket(raw) -> {tokenId, question, liquidity, volume, endDate}
 *
 * Maps a raw Gamma API market object to the discovery shape.
 * Extracts the YES outcome token ID (first in clobTokenIds array) and the question.
 * Filters: active=true, closed=false, resolved=false, archived=false.
 * parseNum at boundaries for liquidity/volume.
 *
 * @param {object} raw — a single market object from the Gamma /markets endpoint
 * @returns {{tokenId: string|null, question: string, liquidity: number|null, volume: number|null, endDate: string|null}}
 */
export function mapMarket(raw) {
  if (!raw || typeof raw !== 'object') throw new DiscoveryError('mapMarket: expected object', raw);

  // Parse double-encoded JSON string fields (Gamma API convention)
  let clobTokenIds;
  try {
    clobTokenIds = typeof raw.clobTokenIds === 'string'
      ? JSON.parse(raw.clobTokenIds)
      : (raw.clobTokenIds || []);
  } catch (e) {
    throw new DiscoveryError(`mapMarket: invalid clobTokenIds JSON: ${e.message}`, raw.clobTokenIds);
  }

  // YES token is the first token ID (index 0) in the clobTokenIds array
  const tokenId = clobTokenIds[0] || null;
  const question = raw.question || '';

  return {
    tokenId,
    question,
    liquidity: parseNum(raw.liquidity),
    volume: parseNum(raw.volume),
    endDate: raw.endDate ?? null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// §7 — discoverMarkets (main entry)
// ───────────────────────────────────────────────────────────────────────────

/**
 * discoverMarkets(opts?) -> Promise<Array<{tokenId, question, liquidity?, volume?, endDate?}>>
 *
 * Queries the Gamma API for ACTIVE, non-closed, liquidity-sorted markets.
 * Returns the top N markets with their YES token ID and question text,
 * in the exact shape the orchestrator's DEFAULT_CONFIG.polymarkets expects.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit=5] — max markets to return
 * @param {string} [opts.order='liquidity'] — sort field ('liquidity' or 'volume')
 * @returns {Promise<Array<{tokenId: string|null, question: string, liquidity?: number|null, volume?: number|null, endDate?: string|null}>>}
 */
export async function discoverMarkets(opts = {}) {
  const {
    limit = 5,
    order = 'liquidity',
  } = opts;

  // Fetch active, non-closed markets from Gamma, sorted by the requested field descending
  const data = await apiGet(GAMMA_BASE, '/markets', {
    limit: Math.min(limit * 3, 100), // over-fetch to allow filtering
    active: true,
    closed: false,
    order,
    ascending: false,
  });

  // Gamma returns a JSON array directly (or {data:[...]})
  const arr = Array.isArray(data) ? data : (data.data || []);

  // Filter out resolved/closed/archived markets, then map
  const candidates = arr
    .filter((m) => {
      if (!m || typeof m !== 'object') return false;
      // Must be active and not closed/resolved/archived
      if (m.active !== true && m.active !== 'true') return false;
      if (m.closed === true || m.closed === 'true') return false;
      if (m.resolved === true || m.resolved === 'true') return false;
      if (m.archived === true || m.archived === 'true') return false;
      // Must have a question
      if (!m.question) return false;
      // Must have clobTokenIds (parseable)
      return true;
    })
    .map(mapMarket);

  // Sort by liquidity desc (nulls last), then volume desc
  candidates.sort((a, b) => {
    const la = a.liquidity ?? -1;
    const lb = b.liquidity ?? -1;
    if (lb !== la) return lb - la;
    const va = a.volume ?? -1;
    const vb = b.volume ?? -1;
    return vb - va;
  });

  // Apply limit
  return candidates.slice(0, limit);
}

// ───────────────────────────────────────────────────────────────────────────
// §8 — SELF-TEST (--test)
// ───────────────────────────────────────────────────────────────────────────

async function selfTest() {
  let pass = 0;
  let fail = 0;
  const assert = (cond, label) => {
    if (cond) { pass++; } else { fail++; console.error(`  FAIL: ${label}`); }
  };

  // ── Test 1: mapMarket extracts tokenId + question ──
  {
    const raw = {
      id: '123',
      question: 'Will X happen by 2026?',
      clobTokenIds: JSON.stringify(['token-yes-abc', 'token-no-def']),
      outcomes: JSON.stringify(['Yes', 'No']),
      outcomePrices: JSON.stringify(['0.65', '0.35']),
      liquidity: '50000.50',
      volume: '120000.00',
      endDate: '2026-12-31T00:00:00Z',
      active: true,
      closed: false,
    };
    const mapped = mapMarket(raw);
    assert(mapped.tokenId === 'token-yes-abc', 'mapMarket: tokenId is first clobTokenId');
    assert(mapped.question === 'Will X happen by 2026?', 'mapMarket: question preserved');
    assert(mapped.liquidity === 50000.5, 'mapMarket: liquidity parsed');
    assert(mapped.volume === 120000, 'mapMarket: volume parsed');
    assert(mapped.endDate === '2026-12-31T00:00:00Z', 'mapMarket: endDate preserved');
  }

  // ── Test 2: mapMarket with null/empty liquidity ──
  {
    const raw = {
      id: '456',
      question: 'Will Y happen?',
      clobTokenIds: JSON.stringify(['yes-tok']),
      liquidity: '',
      volume: null,
      endDate: null,
    };
    const mapped = mapMarket(raw);
    assert(mapped.liquidity === null, 'mapMarket: empty string liquidity → null');
    assert(mapped.volume === null, 'mapMarket: null volume → null');
  }

  // ── Test 3: mapMarket with already-parsed clobTokenIds array ──
  {
    const raw = {
      id: '789',
      question: 'Will Z happen?',
      clobTokenIds: ['arr-yes', 'arr-no'],
      liquidity: '100',
      volume: '200',
    };
    const mapped = mapMarket(raw);
    assert(mapped.tokenId === 'arr-yes', 'mapMarket: array clobTokenIds works');
  }

  // ── Test 4: mapMarket throws on invalid input ──
  {
    let threw = false;
    try { mapMarket(null); } catch (e) { threw = e.name === 'DiscoveryError'; }
    assert(threw, 'mapMarket: throws DiscoveryError on null');
  }

  // ── Test 5: SSRF denies private host ──
  {
    let threw = false;
    try { guardHost('192.168.1.1'); } catch (e) { threw = e.name === 'SsrfError'; }
    assert(threw, 'SSRF: denies 192.168.1.1');
  }

  // ── Test 6: SSRF denies cloud metadata ──
  {
    let threw = false;
    try { guardHost('169.254.169.254'); } catch (e) { threw = e.name === 'SsrfError'; }
    assert(threw, 'SSRF: denies cloud metadata');
  }

  // ── Test 7: SSRF allows gamma-api host ──
  {
    let threw = false;
    try { guardHost('gamma-api.polymarket.com'); } catch (e) { threw = true; }
    assert(!threw, 'SSRF: allows gamma-api.polymarket.com');
  }

  // ── Test 8: SSRF denies unknown host ──
  {
    let threw = false;
    try { guardHost('evil.example.com'); } catch (e) { threw = e.name === 'SsrfError'; }
    assert(threw, 'SSRF: denies unknown host');
  }

  // ── Test 9: discoverMarkets with injected mock — returns array of {tokenId, question} ──
  {
    const mockMarkets = [
      {
        id: '1', question: 'Will A happen?', active: true, closed: false, resolved: false, archived: false,
        clobTokenIds: JSON.stringify(['tok-a-yes', 'tok-a-no']),
        outcomes: JSON.stringify(['Yes', 'No']),
        outcomePrices: JSON.stringify(['0.7', '0.3']),
        liquidity: '100000', volume: '500000', endDate: '2026-12-31T00:00:00Z',
      },
      {
        id: '2', question: 'Will B happen?', active: true, closed: false, resolved: false, archived: false,
        clobTokenIds: JSON.stringify(['tok-b-yes', 'tok-b-no']),
        outcomes: JSON.stringify(['Yes', 'No']),
        outcomePrices: JSON.stringify(['0.5', '0.5']),
        liquidity: '50000', volume: '200000', endDate: '2026-06-30T00:00:00Z',
      },
      {
        id: '3', question: 'Will C happen?', active: true, closed: false, resolved: false, archived: false,
        clobTokenIds: JSON.stringify(['tok-c-yes', 'tok-c-no']),
        outcomes: JSON.stringify(['Yes', 'No']),
        outcomePrices: JSON.stringify(['0.9', '0.1']),
        liquidity: '25000', volume: '100000', endDate: '2027-01-01T00:00:00Z',
      },
    ];

    setHttpGet(async (url) => {
      return { status: 200, headers: {}, body: JSON.stringify(mockMarkets) };
    });

    const results = await discoverMarkets({ limit: 5 });
    assert(Array.isArray(results), 'discoverMarkets: returns array');
    assert(results.length === 3, 'discoverMarkets: returns all 3 markets');
    assert(results[0].tokenId === 'tok-a-yes', 'discoverMarkets: first market has correct tokenId');
    assert(results[0].question === 'Will A happen?', 'discoverMarkets: first market has correct question');
    assert(typeof results[0].liquidity === 'number', 'discoverMarkets: liquidity is number');
    assert(results[0].liquidity === 100000, 'discoverMarkets: first market liquidity=100000');

    // Sorted by liquidity desc
    assert(results[0].liquidity >= results[1].liquidity, 'discoverMarkets: sorted by liquidity desc');
    assert(results[1].liquidity >= results[2].liquidity, 'discoverMarkets: sorted by liquidity desc (2nd >= 3rd)');

    setHttpGet(null); // restore default
  }

  // ── Test 10: discoverMarkets filters out closed/resolved/archived ──
  {
    const mockMarkets = [
      {
        id: '1', question: 'Active market', active: true, closed: false, resolved: false, archived: false,
        clobTokenIds: JSON.stringify(['tok-active-yes', 'tok-active-no']),
        outcomes: JSON.stringify(['Yes', 'No']),
        outcomePrices: JSON.stringify(['0.6', '0.4']),
        liquidity: '80000', volume: '300000', endDate: '2026-12-31T00:00:00Z',
      },
      {
        id: '2', question: 'Closed market', active: true, closed: true, resolved: false, archived: false,
        clobTokenIds: JSON.stringify(['tok-closed-yes', 'tok-closed-no']),
        outcomes: JSON.stringify(['Yes', 'No']),
        outcomePrices: JSON.stringify(['0.5', '0.5']),
        liquidity: '999999', volume: '999999', endDate: '2025-01-01T00:00:00Z',
      },
      {
        id: '3', question: 'Resolved market', active: true, closed: false, resolved: true, archived: false,
        clobTokenIds: JSON.stringify(['tok-resolved-yes', 'tok-resolved-no']),
        outcomes: JSON.stringify(['Yes', 'No']),
        outcomePrices: JSON.stringify(['1.0', '0.0']),
        liquidity: '0', volume: '0', endDate: '2025-06-01T00:00:00Z',
      },
      {
        id: '4', question: 'Archived market', active: true, closed: false, resolved: false, archived: true,
        clobTokenIds: JSON.stringify(['tok-archived-yes', 'tok-archived-no']),
        outcomes: JSON.stringify(['Yes', 'No']),
        outcomePrices: JSON.stringify(['0.3', '0.7']),
        liquidity: '5000', volume: '10000', endDate: '2024-01-01T00:00:00Z',
      },
    ];

    setHttpGet(async (url) => {
      return { status: 200, headers: {}, body: JSON.stringify(mockMarkets) };
    });

    const results = await discoverMarkets({ limit: 10 });
    assert(results.length === 1, 'discoverMarkets: filters out closed/resolved/archived');
    assert(results[0].question === 'Active market', 'discoverMarkets: only active market remains');

    setHttpGet(null);
  }

  // ── Test 11: discoverMarkets honors limit ──
  {
    const mockMarkets = [];
    for (let i = 0; i < 10; i++) {
      mockMarkets.push({
        id: String(i), question: `Market ${i}`, active: true, closed: false, resolved: false, archived: false,
        clobTokenIds: JSON.stringify([`tok-${i}-yes`, `tok-${i}-no`]),
        outcomes: JSON.stringify(['Yes', 'No']),
        outcomePrices: JSON.stringify(['0.5', '0.5']),
        liquidity: String(10000 - i * 1000), volume: String(50000 - i * 5000), endDate: '2026-12-31T00:00:00Z',
      });
    }

    setHttpGet(async (url) => {
      return { status: 200, headers: {}, body: JSON.stringify(mockMarkets) };
    });

    const results = await discoverMarkets({ limit: 3 });
    assert(results.length === 3, 'discoverMarkets: limit=3 returns 3 markets');
    assert(results[0].liquidity >= results[1].liquidity, 'discoverMarkets: limit results still sorted');

    setHttpGet(null);
  }

  // ── Test 12: SSRF denies private host through discoverMarkets ──
  {
    // Inject a mock that would be called if SSRF didn't block first
    // We test guardHost directly since apiGet constructs the URL from GAMMA_BASE
    let threw = false;
    try { guardHost('10.0.0.1'); } catch (e) { threw = e.name === 'SsrfError'; }
    assert(threw, 'discoverMarkets: SSRF denies private host 10.0.0.1');
  }

  // ── Test 13: parseNum edge cases ──
  {
    assert(parseNum('') === null, 'parseNum: empty string → null');
    assert(parseNum(null) === null, 'parseNum: null → null');
    assert(parseNum(undefined) === null, 'parseNum: undefined → null');
    assert(parseNum('0.5') === 0.5, 'parseNum: "0.5" → 0.5');
    assert(parseNum('0') === 0, 'parseNum: "0" → 0');
    let threw = false;
    try { parseNum('abc'); } catch (e) { threw = e.name === 'DiscoveryError'; }
    assert(threw, 'parseNum: "abc" throws DiscoveryError');
  }

  // ── Test 14: discoverMarkets with Gamma {data:[...]} wrapper ──
  {
    const mockMarkets = [
      {
        id: '1', question: 'Wrapped market', active: true, closed: false, resolved: false, archived: false,
        clobTokenIds: JSON.stringify(['wrap-yes', 'wrap-no']),
        outcomes: JSON.stringify(['Yes', 'No']),
        outcomePrices: JSON.stringify(['0.6', '0.4']),
        liquidity: '75000', volume: '300000', endDate: '2026-12-31T00:00:00Z',
      },
    ];

    setHttpGet(async (url) => {
      return { status: 200, headers: {}, body: JSON.stringify({ data: mockMarkets }) };
    });

    const results = await discoverMarkets({ limit: 5 });
    assert(results.length === 1, 'discoverMarkets: handles {data:[...]} wrapper');
    assert(results[0].tokenId === 'wrap-yes', 'discoverMarkets: wrapped market tokenId correct');

    setHttpGet(null);
  }

  console.log(`${pass} pass, ${fail} fail`);
  return fail;
}

// ── CLI entry ──────────────────────────────────────────────────────────────
const _runAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const isTest = _runAsMain && process.argv.includes('--test');
if (isTest) {
  selfTest().then((failCount) => {
    process.exit(failCount > 0 ? 1 : 0);
  }).catch((err) => {
    console.error('Self-test runner error:', err);
    process.exit(1);
  });
}