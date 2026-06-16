#!/usr/bin/env node
// @capability: social-adapter
// @serves: crypto social sentiment | social media intake | sentiment signal | public-source sentiment | observatory depth | last30days
// @does: READ-ONLY public-source social-sentiment intake adapter for the Observatory — pulls posts from keyless public APIs (Reddit .json as the default venue), scores them with a transparent lexicon/heuristic, and produces a normalized sentiment signal per crypto asset (score∈[-1,1], magnitude∈[0,1]). SSRF-guarded, keyless by default (env-gated optional API tokens for CryptoPanic/NewsAPI), injected HTTP for offline tests. INV-1 (no execution/writes to external services), INV-2 (no key reads from filesystem — env-only), INV-3 (live public reads OK), INV-6 (parseNum at boundary, ''→null), INV-7 (deterministic + offline-testable) all honored.
// @use: Reach for this before any code that needs crypto social sentiment to feed observatory depth factors or sentiment-divergence signals. All exports pure except the HTTP-bound getSentiment, which routes through setHttpGet.
// @exports: getSentiment, mapPost, aggregateSentiment, scorePost, setHttpGet, parseNum, hasCreds, VenueApiError, MappingError, SsrfError

import https from 'node:https';
import { URL, pathToFileURL } from 'node:url';

// ───────────────────────────────────────────────────────────────────────────
// §0 — CONSTANTS (REDDIT PUBLIC .json — keyless, no auth required for reads)
// ───────────────────────────────────────────────────────────────────────────
//
// Primary keyless source: Reddit public .json API.
//   GET https://www.reddit.com/r/{subreddit}/search.json?q={asset}&sort=new&limit=25&restrict_sr=on
//   Requires only a User-Agent header (Reddit blocks requests without one).
//   Returns a Listing with children[].data.{title,selftext,created_utc,score,num_comments,id,permalink}.
//
// Optional keyed sources (gated by process.env):
//   - CryptoPanic: GET https://cryptopanic.com/api/v1/posts/?auth_token={token}&currencies={asset}&kind=news
//     Token from process.env.CRYPTOPANIC_AUTH_TOKEN.
//   - NewsAPI: GET https://newsapi.org/v2/everything?q={asset}+crypto&apiKey={key}
//     Key from process.env.NEWSAPI_KEY.
//
// The adapter is source-swappable: setHttpGet lets tests inject a mock; the
// fetch helper is local so a future source swap is a single function replace.

const REDDIT_BASE = 'www.reddit.com';
const ALLOWED_HOSTS = new Set([
  REDDIT_BASE,
  'oauth.reddit.com',        // future keyed path
  'cryptopanic.com',         // optional keyed
  'newsapi.org',             // optional keyed
]);

// Curated subreddits for crypto sentiment (public, high-signal).
const DEFAULT_SUBREDDITS = [
  'CryptoCurrency',
  'Bitcoin',
  'ethereum',
  'CryptoMarkets',
];

const DEFAULT_LIMIT = 25;

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
    super(`Social API ${status}`);
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
      headers: { 'User-Agent': 'YURI-AFL/social-adapter/1.0', ...headers },
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
// IPv6 loopback/link-local. Then ALLOW only the explicit public venue hosts
// in ALLOWED_HOSTS. Unknown public hosts are denied by default — the social
// adapter is curated-source by design; if a new source is added, register it
// in ALLOWED_HOSTS deliberately.

const IPV4_PRIVATE = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;
const IPV4_LINK_LOCAL = /^169\.254\./;
const CLOUD_META = '169.254.169.254';

function guardHost(hostname) {
  if (ALLOWED_HOSTS.has(hostname)) return;
  if (IPV4_PRIVATE.test(hostname)) throw new SsrfError(hostname);
  if (hostname === CLOUD_META) throw new SsrfError(hostname);
  if (IPV4_LINK_LOCAL.test(hostname)) throw new SsrfError(hostname);
  if (hostname === '::1' || hostname === '[::1]' || hostname.startsWith('fe80:')) throw new SsrfError(hostname);
  // Unknown host: deny by default. Curated-source allowlist is the contract.
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
// The default source (Reddit public .json) is keyless. hasCreds() returns true
// when optional API tokens are present in process.env for enriched sources.
// The adapter MUST work keyless against Reddit; keyed sources are additive.

export function hasCreds() {
  return !!(process.env.CRYPTOPANIC_AUTH_TOKEN || process.env.NEWSAPI_KEY);
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
  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch (e) {
    throw new MappingError(`social: non-JSON body from ${urlStr}`, res.body?.slice?.(0, 200));
  }
  return parsed;
}

// ───────────────────────────────────────────────────────────────────────────
// §7 — PURE MAPPERS (exported for unit test — no network dependency)
// ───────────────────────────────────────────────────────────────────────────

/**
 * mapPost(raw) -> unified SocialPost
 *
 * Normalizes a raw Reddit post (t3 kind) into a canonical shape.
 * Input shape (Reddit .json child):
 *   { kind: 't3', data: { title, selftext, created_utc, score, num_comments, subreddit, id, permalink } }
 *
 * Output:
 *   { source:'reddit', id, title, body, createdUtc(unix-seconds),
 *     engagement: { score, comments }, subreddit, permalink }
 *
 * Also accepts a minimal shape for CryptoPanic/NewsAPI posts (future):
 *   { title, body, created_at, source? } → mapped with source preserved.
 */
export function mapPost(raw) {
  if (!raw || typeof raw !== 'object') throw new MappingError('mapPost: expected object', raw);

  // Reddit shape: { kind, data: {...} }
  const d = raw.data ?? raw;
  if (!d || typeof d !== 'object') throw new MappingError('mapPost: missing data', raw);

  const title = d.title;
  if (!title || typeof title !== 'string') throw new MappingError('mapPost: missing title', raw);

  const createdUtc = d.created_utc ?? d.created_at ?? d.timestamp;
  if (createdUtc == null) throw new MappingError('mapPost: missing timestamp', raw);
  const ts = Number(createdUtc);
  if (!Number.isFinite(ts)) throw new MappingError(`mapPost: non-finite timestamp "${createdUtc}"`, raw);

  const source = d.source ?? (raw.kind === 't3' ? 'reddit' : 'unknown');

  return {
    source,
    id: d.id ?? d.url ?? null,
    title,
    body: (d.selftext ?? d.body ?? '').trim(),
    createdUtc: ts,
    engagement: {
      score: parseNum(d.score ?? d.engagement_score) ?? 0,
      comments: parseNum(d.num_comments ?? d.comment_count) ?? 0,
    },
    subreddit: d.subreddit ?? null,
    permalink: d.permalink ?? d.url ?? null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// §8 — LEXICON SENTIMENT SCORER (transparent, documented, no ML)
// ───────────────────────────────────────────────────────────────────────────
//
// A simple keyword-counting heuristic. Each word in the lexicon carries a
// sentiment value in [-1, 1]. The post score is the sum of matched word values
// divided by the count of matched words (so a post with one strong signal word
// gets that word's full value; a post with mixed signals gets a diluted average).
// Clamped to [-1, 1]. Posts with zero matched words get score 0.
//
// Lexicon design principles:
//   - Strong signals (±1.0): unambiguous directional words (moon, crash, scam)
//   - Moderate signals (±0.5): clear but context-dependent (bullish, dump, rally)
//   - Weak signals (±0.25): suggestive but noisy (support, correction, upgrade)
//   - Asset names themselves are neutral (not in lexicon)
//   - Common crypto slang included (wagmi, ngmi, rekt, bagholder)
//
// This is intentionally simple — the Observatory folds this as one factor
// among many; precision comes from aggregation + the factor-evaluator's
// walk-forward validation, not from a complex NLP model.

const LEXICON = new Map([
  // ── strong bullish (+1.0) ──
  ['moon', 1.0], ['moonshot', 1.0], ['rocket', 1.0], ['breakout', 1.0],
  ['parabolic', 1.0], ['liftoff', 1.0], ['inevitable', 1.0],
  // ── moderate bullish (+0.5) ──
  ['bullish', 0.5], ['rally', 0.5], ['pump', 0.5], ['surge', 0.5],
  ['buy', 0.5], ['long', 0.5], ['accumulate', 0.5], ['accumulation', 0.5],
  ['undervalued', 0.5], ['bottom', 0.5], ['bounce', 0.5], ['hodl', 0.5],
  ['wagmi', 0.5], ['adoption', 0.5], ['partnership', 0.5], ['upgrade', 0.5],
  ['launch', 0.5], ['institutional', 0.5], ['etf', 0.5],
  // ── weak bullish (+0.25) ──
  ['support', 0.25], ['buying', 0.25], ['green', 0.25], ['outperform', 0.25],
  ['beat', 0.25], ['positive', 0.25], ['optimistic', 0.25], ['recovery', 0.25],
  ['stable', 0.25], ['growth', 0.25],
  // ── strong bearish (-1.0) ──
  ['crash', -1.0], ['rugpull', -1.0], ['rug', -1.0], ['scam', -1.0],
  ['ponzi', -1.0], ['collapse', -1.0], ['bankrupt', -1.0], ['hacked', -1.0],
  ['exploit', -1.0], ['exploited', -1.0], ['drained', -1.0],
  // ── moderate bearish (-0.5) ──
  ['bearish', -0.5], ['dump', -0.5], ['dumping', -0.5], ['sell', -0.5],
  ['short', -0.5], ['shorting', -0.5], ['decline', -0.5], ['falling', -0.5],
  ['drop', -0.5], ['plunge', -0.5], ['correction', -0.5], ['overbought', -0.5],
  ['overvalued', -0.5], ['bubble', -0.5], ['fud', -0.5], ['ngmi', -0.5],
  ['rekt', -0.5], ['bagholder', -0.5], ['delist', -0.5], ['ban', -0.5],
  ['regulation', -0.5], ['regulatory', -0.5], ['crackdown', -0.5],
  // ── weak bearish (-0.25) ──
  ['resistance', -0.25], ['rejection', -0.25], ['rejected', -0.25],
  ['selling', -0.25], ['red', -0.25], ['underperform', -0.25],
  ['negative', -0.25], ['fear', -0.25], ['uncertainty', -0.25],
  ['volatile', -0.25], ['risk', -0.25], ['warning', -0.25],
]);

/**
 * scorePost(post) -> { score: number, matchedWords: number }
 *
 * Scores a single unified SocialPost (from mapPost) using the lexicon.
 * Tokenizes title + body into lowercase words, matches against LEXICON,
 * and returns the mean sentiment value clamped to [-1, 1].
 *
 * Posts with zero matched words get score 0 (neutral).
 */
export function scorePost(post) {
  if (!post || typeof post !== 'object') throw new MappingError('scorePost: expected object', post);
  const text = `${post.title ?? ''} ${post.body ?? ''}`.toLowerCase();
  const words = text.split(/[^a-z0-9]+/).filter(w => w.length > 1);

  let sum = 0;
  let matched = 0;

  for (const w of words) {
    const val = LEXICON.get(w);
    if (val !== undefined) {
      sum += val;
      matched++;
    }
  }

  if (matched === 0) return { score: 0, matchedWords: 0 };

  const raw = sum / matched;
  const clamped = Math.max(-1, Math.min(1, raw));
  return { score: clamped, matchedWords: matched };
}

// ───────────────────────────────────────────────────────────────────────────
// §9 — AGGREGATION (pure, exported for unit test)
// ───────────────────────────────────────────────────────────────────────────

/**
 * aggregateSentiment(posts) -> { score, magnitude, sampleCount }
 *
 * Aggregates an array of { postScore, engagement } objects (output of scorePost
 * merged with mapPost engagement) into a single normalized sentiment signal.
 *
 *   score ∈ [-1, 1]: engagement-weighted mean of post scores.
 *     Weight = log(1 + engagement.score + engagement.comments) so a post with
 *     500 upvotes + 200 comments counts more than one with 1 upvote, but the
 *     log dampens the power-law extremes of Reddit.
 *
 *   magnitude ∈ [0, 1]: confidence measure based on sample count and consensus.
 *     magnitude = sampleFactor * consensusFactor, where:
 *       sampleFactor = min(1, log(1 + sampleCount) / log(1 + 25))
 *         → reaches 1.0 at 25 posts (the default fetch limit)
 *       consensusFactor = 1 - σ²  (where σ² is the variance of post scores,
 *         clamped so consensusFactor ∈ [0, 1])
 *     High consensus on many posts → magnitude near 1.0.
 *     Few posts or high disagreement → magnitude near 0.0.
 *
 *   sampleCount: number of posts aggregated.
 */
export function aggregateSentiment(posts) {
  if (!Array.isArray(posts)) throw new MappingError('aggregateSentiment: expected array', posts);
  if (posts.length === 0) return { score: 0, magnitude: 0, sampleCount: 0 };

  const weights = posts.map(p => {
    const eng = p.engagement ?? {};
    const s = (eng.score ?? 0);
    const c = (eng.comments ?? 0);
    return Math.log(1 + s + c);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  if (totalWeight === 0) {
    // All posts have zero engagement — unweighted mean
    const mean = posts.reduce((a, p) => a + (p.postScore ?? 0), 0) / posts.length;
    return { score: Math.max(-1, Math.min(1, mean)), magnitude: 0, sampleCount: posts.length };
  }

  // Weighted mean
  let weightedSum = 0;
  for (let i = 0; i < posts.length; i++) {
    weightedSum += weights[i] * (posts[i].postScore ?? 0);
  }
  const score = Math.max(-1, Math.min(1, weightedSum / totalWeight));

  // Magnitude: sample factor × consensus factor
  const sampleFactor = Math.min(1, Math.log(1 + posts.length) / Math.log(1 + DEFAULT_LIMIT));

  // Variance of post scores (population variance — small N, use simple formula)
  const scores = posts.map(p => p.postScore ?? 0);
  const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, s) => a + (s - meanScore) ** 2, 0) / scores.length;
  // Max possible variance for scores in [-1,1] is 1.0 (half at -1, half at +1)
  const consensusFactor = Math.max(0, 1 - variance);

  const magnitude = Math.min(1, sampleFactor * consensusFactor);

  return { score, magnitude, sampleCount: posts.length };
}

// ───────────────────────────────────────────────────────────────────────────
// §10 — getSentiment (the main async export — HTTP-bound, routes through setHttpGet)
// ───────────────────────────────────────────────────────────────────────────

/**
 * getSentiment(asset, opts?) -> Promise<{ asset, ts, score, magnitude, sampleCount, sources, raw? }>
 *
 * Fetches social posts for a crypto asset from keyless public sources (Reddit
 * by default), scores them with the lexicon, and aggregates into a normalized
 * sentiment signal.
 *
 *   asset: string — the crypto asset symbol (e.g. 'BTC', 'ETH', 'SOL').
 *     Used as the search query. Case-insensitive for search; preserved in output.
 *
 *   opts:
 *     sources: string[] — which sources to query. Default: ['reddit'].
 *       'reddit' is always keyless. 'cryptopanic'/'newsapi' require hasCreds().
 *     subreddits: string[] — for Reddit. Default: curated crypto list.
 *     limit: number — max posts per source. Default: 25.
 *     includeRaw: boolean — include raw mapped posts in output. Default: false.
 *
 *   Returns canonical shape:
 *     { asset, ts (unix-SECONDS), score ∈ [-1,1], magnitude ∈ [0,1],
 *       sampleCount, sources: string[], raw?: SocialPost[] }
 */
export async function getSentiment(asset, opts = {}) {
  if (!asset || typeof asset !== 'string') throw new MappingError('getSentiment: asset required', asset);

  const sources = opts.sources ?? ['reddit'];
  const subreddits = opts.subreddits ?? DEFAULT_SUBREDDITS;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const includeRaw = opts.includeRaw ?? false;

  const allPosts = [];
  const usedSources = [];

  for (const src of sources) {
    if (src === 'reddit') {
      // Keyless Reddit search across curated subreddits
      for (const sr of subreddits) {
        const q = encodeURIComponent(asset);
        const url = `https://${REDDIT_BASE}/r/${encodeURIComponent(sr)}/search.json?q=${q}&sort=new&limit=${limit}&restrict_sr=on`;
        try {
          const json = await fetchJson(url);
          if (!json || !json.data || !Array.isArray(json.data.children)) {
            continue; // empty subreddit or malformed response — skip gracefully
          }
          for (const child of json.data.children) {
            if (child.kind !== 't3') continue;
            try {
              allPosts.push(mapPost(child));
            } catch (_) {
              // skip malformed individual posts
            }
          }
        } catch (e) {
          if (e instanceof VenueApiError && e.status === 429) {
            // Rate-limited — stop fetching more subreddits for this source
            break;
          }
          // Other errors: skip this subreddit, try next
        }
      }
      usedSources.push('reddit');
    } else if (src === 'cryptopanic') {
      if (!process.env.CRYPTOPANIC_AUTH_TOKEN) continue; // keyless contract: skip silently
      const token = process.env.CRYPTOPANIC_AUTH_TOKEN;
      const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${encodeURIComponent(token)}&currencies=${encodeURIComponent(asset)}&kind=news&limit=${limit}`;
      try {
        const json = await fetchJson(url);
        const results = json?.results ?? [];
        for (const r of results) {
          try {
            allPosts.push(mapPost({
              title: r.title,
              body: r.body ?? '',
              created_at: r.created_at,
              source: 'cryptopanic',
              id: r.id ?? r.url,
              url: r.url,
              engagement_score: r.votes ?? null,
              comment_count: null,
            }));
          } catch (_) { /* skip malformed */ }
        }
        usedSources.push('cryptopanic');
      } catch (_) { /* skip on error */ }
    } else if (src === 'newsapi') {
      if (!process.env.NEWSAPI_KEY) continue;
      const key = process.env.NEWSAPI_KEY;
      const q = encodeURIComponent(`${asset} crypto`);
      const url = `https://newsapi.org/v2/everything?q=${q}&apiKey=${encodeURIComponent(key)}&pageSize=${limit}&sortBy=publishedAt`;
      try {
        const json = await fetchJson(url);
        const articles = json?.articles ?? [];
        for (const a of articles) {
          try {
            allPosts.push(mapPost({
              title: a.title,
              body: a.description ?? '',
              created_at: a.publishedAt ? new Date(a.publishedAt).getTime() / 1000 : null,
              source: 'newsapi',
              id: a.url,
              url: a.url,
              engagement_score: null,
              comment_count: null,
            }));
          } catch (_) { /* skip malformed */ }
        }
        usedSources.push('newsapi');
      } catch (_) { /* skip on error */ }
    }
  }

  // Score each post
  const scored = allPosts.map(p => {
    const s = scorePost(p);
    return { postScore: s.score, engagement: p.engagement, matchedWords: s.matchedWords };
  });

  // Aggregate
  const agg = aggregateSentiment(scored);

  const result = {
    asset: asset.toUpperCase(),
    ts: Math.floor(Date.now() / 1000),
    score: agg.score,
    magnitude: agg.magnitude,
    sampleCount: agg.sampleCount,
    sources: [...new Set(usedSources)],
  };

  if (includeRaw) {
    result.raw = allPosts;
  }

  return result;
}

// ───────────────────────────────────────────────────────────────────────────
// §11 — SELF-TEST (run via `node social-adapter.mjs --test`)
// ───────────────────────────────────────────────────────────────────────────

const _runAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_runAsMain && process.argv.includes('--test')) {
  let pass = 0;
  let fail = 0;
  const assert = (cond, msg) => {
    if (cond) { pass++; } else { console.error(`FAIL: ${msg}`); fail++; }
  };

  // ── parseNum ──
  assert(parseNum('123.45') === 123.45, 'parseNum string');
  assert(parseNum('') === null, 'parseNum empty → null');
  assert(parseNum(null) === null, 'parseNum null → null');
  assert(parseNum(undefined) === null, 'parseNum undefined → null');
  try { parseNum('not-a-number'); assert(false, 'should throw'); } catch (e) { assert(e instanceof MappingError, 'parseNum bad string → MappingError'); }

  // ── SSRF guard ──
  try { guardHost('169.254.169.254'); assert(false, 'SSRF should deny cloud meta'); } catch (e) { assert(e instanceof SsrfError, 'SSRF cloud meta'); }
  try { guardHost('127.0.0.1'); assert(false, 'SSRF should deny loopback'); } catch (e) { assert(e instanceof SsrfError, 'SSRF loopback'); }
  try { guardHost('192.168.1.1'); assert(false, 'SSRF should deny private'); } catch (e) { assert(e instanceof SsrfError, 'SSRF private'); }
  try { guardHost('10.0.0.1'); assert(false, 'SSRF should deny 10.x'); } catch (e) { assert(e instanceof SsrfError, 'SSRF 10.x'); }
  try { guardHost('172.16.0.1'); assert(false, 'SSRF should deny 172.16'); } catch (e) { assert(e instanceof SsrfError, 'SSRF 172.16'); }
  try { guardHost('::1'); assert(false, 'SSRF should deny IPv6 loopback'); } catch (e) { assert(e instanceof SsrfError, 'SSRF IPv6 loopback'); }
  // Allowed hosts should NOT throw
  guardHost('www.reddit.com'); // no throw = pass
  assert(true, 'SSRF allowed host www.reddit.com');
  guardHost('cryptopanic.com'); // no throw = pass
  assert(true, 'SSRF allowed host cryptopanic.com');

  // ── mapPost (Reddit shape) ──
  const redditChild = {
    kind: 't3',
    data: {
      title: 'BTC is looking extremely bullish right now',
      selftext: 'The charts show a clear breakout pattern forming. I think we moon soon.',
      created_utc: 1718505600,
      score: '142',
      num_comments: '38',
      subreddit: 'CryptoCurrency',
      id: 'abc123',
      permalink: '/r/CryptoCurrency/comments/abc123/btc_bullish/',
    },
  };
  const mapped = mapPost(redditChild);
  assert(mapped.source === 'reddit', 'mapPost source reddit');
  assert(mapped.id === 'abc123', 'mapPost id');
  assert(mapped.title === 'BTC is looking extremely bullish right now', 'mapPost title');
  assert(mapped.body === 'The charts show a clear breakout pattern forming. I think we moon soon.', 'mapPost body');
  assert(mapped.createdUtc === 1718505600, 'mapPost createdUtc unix-seconds');
  assert(mapped.engagement.score === 142, 'mapPost engagement score');
  assert(mapped.engagement.comments === 38, 'mapPost engagement comments');
  assert(mapped.subreddit === 'CryptoCurrency', 'mapPost subreddit');

  // ── mapPost (minimal / CryptoPanic shape) ──
  const cpRaw = { title: 'Ethereum upgrade live', body: 'ETH surges on upgrade news', created_at: 1718505700, source: 'cryptopanic', id: 'cp1' };
  const cpMapped = mapPost(cpRaw);
  assert(cpMapped.source === 'cryptopanic', 'mapPost cryptopanic source');
  assert(cpMapped.title === 'Ethereum upgrade live', 'mapPost cp title');
  assert(cpMapped.createdUtc === 1718505700, 'mapPost cp createdUtc');

  // ── scorePost (lexicon) ──
  const bullishPost = { title: 'BTC moon breakout rally', body: 'bullish surge buy now' };
  const bullScore = scorePost(bullishPost);
  assert(bullScore.score > 0, 'scorePost bullish → positive score');
  assert(bullScore.score <= 1, 'scorePost bullish score ≤ 1');
  assert(bullScore.matchedWords > 0, 'scorePost bullish matched words');

  const bearishPost = { title: 'ETH crash dump bearish', body: 'scam rugpull sell everything' };
  const bearScore = scorePost(bearishPost);
  assert(bearScore.score < 0, 'scorePost bearish → negative score');
  assert(bearScore.score >= -1, 'scorePost bearish score ≥ -1');
  assert(bearScore.matchedWords > 0, 'scorePost bearish matched words');

  const neutralPost = { title: 'The weather is nice today', body: 'I had a sandwich for lunch' };
  const neutScore = scorePost(neutralPost);
  assert(neutScore.score === 0, 'scorePost neutral → 0');
  assert(neutScore.matchedWords === 0, 'scorePost neutral matched 0');

  const mixedPost = { title: 'BTC moon', body: 'but also crash possible' };
  const mixedScore = scorePost(mixedPost);
  assert(mixedScore.matchedWords === 2, 'scorePost mixed matched 2');
  // moon(+1) + crash(-1) = 0 / 2 = 0
  assert(mixedScore.score === 0, 'scorePost mixed cancels to 0');

  // ── aggregateSentiment ──
  const emptyAgg = aggregateSentiment([]);
  assert(emptyAgg.score === 0, 'aggregateSentiment empty → score 0');
  assert(emptyAgg.magnitude === 0, 'aggregateSentiment empty → magnitude 0');
  assert(emptyAgg.sampleCount === 0, 'aggregateSentiment empty → sampleCount 0');

  const singleAgg = aggregateSentiment([{ postScore: 0.8, engagement: { score: 100, comments: 50 } }]);
  assert(Math.abs(singleAgg.score - 0.8) < 1e-12, 'aggregateSentiment single → score matches');
  assert(singleAgg.sampleCount === 1, 'aggregateSentiment single → sampleCount 1');
  assert(singleAgg.magnitude > 0, 'aggregateSentiment single → magnitude > 0');
  assert(singleAgg.magnitude <= 1, 'aggregateSentiment single → magnitude ≤ 1');

  // High-consensus bullish
  const bullAgg = aggregateSentiment([
    { postScore: 0.9, engagement: { score: 200, comments: 80 } },
    { postScore: 0.8, engagement: { score: 150, comments: 60 } },
    { postScore: 0.85, engagement: { score: 100, comments: 40 } },
    { postScore: 0.7, engagement: { score: 50, comments: 20 } },
    { postScore: 0.95, engagement: { score: 300, comments: 100 } },
  ]);
  assert(bullAgg.score > 0.7, 'aggregateSentiment bullish consensus → score > 0.7');
  assert(bullAgg.score <= 1, 'aggregateSentiment bullish consensus → score ≤ 1');
  assert(bullAgg.magnitude > 0.5, 'aggregateSentiment bullish consensus → high magnitude');
  assert(bullAgg.sampleCount === 5, 'aggregateSentiment bullish consensus → sampleCount 5');

  // Low-consensus mixed
  const mixedAgg = aggregateSentiment([
    { postScore: 0.9, engagement: { score: 100, comments: 50 } },
    { postScore: -0.8, engagement: { score: 100, comments: 50 } },
    { postScore: 0.1, engagement: { score: 10, comments: 2 } },
  ]);
  assert(mixedAgg.magnitude < 0.5, 'aggregateSentiment mixed → low magnitude (low consensus)');
  assert(mixedAgg.sampleCount === 3, 'aggregateSentiment mixed → sampleCount 3');

  // ── getSentiment with injected mock httpGet (keyless path) ──
  const mockRedditResponse = {
    kind: 'Listing',
    data: {
      children: [
        { kind: 't3', data: { title: 'BTC to the moon! Breakout confirmed', selftext: 'Bullish rally incoming. Buy now.', created_utc: 1718505600, score: '250', num_comments: '80', subreddit: 'CryptoCurrency', id: 'post1', permalink: '/r/CC/post1' } },
        { kind: 't3', data: { title: 'BTC looking strong', selftext: 'Support held at 65k. Accumulation phase.', created_utc: 1718505600, score: '120', num_comments: '45', subreddit: 'CryptoCurrency', id: 'post2', permalink: '/r/CC/post2' } },
        { kind: 't3', data: { title: 'Is BTC overvalued?', selftext: 'Bearish divergence on the daily. Might dump.', created_utc: 1718505600, score: '80', num_comments: '60', subreddit: 'CryptoCurrency', id: 'post3', permalink: '/r/CC/post3' } },
        { kind: 't3', data: { title: 'BTC ETF inflows surge', selftext: 'Institutional adoption accelerating.', created_utc: 1718505600, score: '300', num_comments: '100', subreddit: 'CryptoCurrency', id: 'post4', permalink: '/r/CC/post4' } },
        { kind: 't3', data: { title: 'BTC scam alert', selftext: 'New phishing site targeting BTC holders. Stay safe.', created_utc: 1718505600, score: '50', num_comments: '30', subreddit: 'CryptoCurrency', id: 'post5', permalink: '/r/CC/post5' } },
      ],
    },
  };

  // Also need mock responses for the other 3 default subreddits
  const emptyListing = { kind: 'Listing', data: { children: [] } };

  let callCount = 0;
  setHttpGet(async (url, _headers) => {
    callCount++;
    // Return mock data only for BTC queries to CryptoCurrency; empty for everything else
    if (url.includes('CryptoCurrency') && url.includes('q=BTC')) return { status: 200, headers: {}, body: JSON.stringify(mockRedditResponse) };
    return { status: 200, headers: {}, body: JSON.stringify(emptyListing) };
  });

  const result = await getSentiment('BTC');
  assert(callCount === 4, 'getSentiment called 4 subreddits');
  assert(result.asset === 'BTC', 'getSentiment asset');
  assert(typeof result.ts === 'number' && result.ts > 1_700_000_000, 'getSentiment ts unix-seconds');
  assert(result.score >= -1 && result.score <= 1, 'getSentiment score ∈ [-1,1]');
  assert(result.magnitude >= 0 && result.magnitude <= 1, 'getSentiment magnitude ∈ [0,1]');
  assert(result.sampleCount === 5, 'getSentiment sampleCount 5');
  assert(result.sources.includes('reddit'), 'getSentiment sources includes reddit');
  assert(result.sources.length === 1, 'getSentiment sources length 1 (keyless only)');

  // ── getSentiment with includeRaw ──
  const resultRaw = await getSentiment('ETH', { includeRaw: true });
  assert(Array.isArray(resultRaw.raw), 'getSentiment includeRaw → raw array');
  assert(resultRaw.raw.length === 0, 'getSentiment ETH → 0 posts (empty mocks)');
  assert(resultRaw.sampleCount === 0, 'getSentiment ETH → sampleCount 0');
  assert(resultRaw.score === 0, 'getSentiment ETH → score 0 (no posts)');
  assert(resultRaw.magnitude === 0, 'getSentiment ETH → magnitude 0 (no posts)');

  // ── hasCreds (no env set in test) ──
  assert(hasCreds() === false, 'hasCreds false without env');

  // ── setHttpGet type guard ──
  try { setHttpGet('not-a-function'); assert(false, 'should throw'); } catch (e) { assert(e instanceof TypeError, 'setHttpGet non-function → TypeError'); }

  // ── FINAL ──
  console.log(`social-adapter self-test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}
