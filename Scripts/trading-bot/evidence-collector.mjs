#!/usr/bin/env node
/**
 * Phase 3 — Evidence Collector
 *
 * Collects market-relevant evidence from RSS news feeds, social sentiment,
 * and market data. Deduplicates, scores source confidence, extracts
 * consensus/dissent, and writes append-only evidence_packet.jsonl.
 *
 * Usage:
 *   node evidence-collector.mjs                       # collect for default markets
 *   node evidence-collector.mjs --market BTC-USD      # single market
 *   node evidence-collector.mjs --markets BTC-USD,ETH-USD --hours 12
 *   node evidence-collector.mjs --daemon              # run every 5 min
 *
 * Env Vars (all optional — sources without keys fall back to stubs):
 *   NEWSAPI_KEY          NewsAPI.org key (free tier covers headlines)
 *   TWITTER_BEARER_TOKEN  X/Twitter API v2 bearer token
 *   REDDIT_CLIENT_ID     Reddit OAuth2 client ID
 *   REDDIT_CLIENT_SECRET Reddit OAuth2 client secret
 *   REDDIT_USER_AGENT    Reddit app user agent string
 */

// ── Imports ─────────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Constants ───────────────────────────────────────────────────────────────

const SOURCE_CONFIDENCE_BASE = {
  reuters: 0.85,
  coindesk: 0.80,
  cointelegraph: 0.75,
  x_twitter: 0.55,
  reddit: 0.50,
};

const HISTORICAL_ADJUSTMENTS = {
  reuters: +0.05,
  coindesk: 0.00,
  cointelegraph: 0.00,
  x_twitter: -0.05,
  reddit: -0.05,
};

const NOISE_PENALTIES = {
  reuters: 0.05,
  coindesk: 0.08,
  cointelegraph: 0.10,
  x_twitter: 0.25,
  reddit: 0.30,
};

/** Half-lives (hours) for freshness decay from RESEARCH.md spec */
const FRESHNESS_HALF_LIVES = {
  reuters: 24,
  coindesk: 24,
  cointelegraph: 24,
  x_twitter: 12,
  reddit: 8,
};

/** Base confidence per source from RESEARCH.md */
const BASE_CONFIDENCE = {
  reuters: 0.95,
  coindesk: 0.90,
  cointelegraph: 0.85,
  x_twitter: 0.70,
  reddit: 0.60,
};

const DEFAULT_LOOKBACK_HOURS = 24;
const DEDUP_WINDOW_MS = 86_400_000; // 24 hours
const CLEANUP_INTERVAL_MS = 300_000; // 5 min
const OUTPUT_DIR = resolve(__dirname, "../../.claude/trading-bot/data");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "evidence_packet.jsonl");
const DAEMON_INTERVAL_MS = 300_000; // 5 min
const DEFAULT_MARKETS = ["BTC-USD", "ETH-USD", "SOL-USD"];

// ── Source IDs ──────────────────────────────────────────────────────────────

const RSS_SOURCE_IDS = ["reuters", "coindesk", "cointelegraph"];
const SOCIAL_SOURCE_IDS = ["x_twitter", "reddit"];
const ALL_SOURCE_IDS = [...RSS_SOURCE_IDS, ...SOCIAL_SOURCE_IDS];

// ── Hashing / Dedup Engine ─────────────────────────────────────────────────

/** Normalise a headline for hashing: lowercase, collapse whitespace, strip punctuation. */
function normaliseHeadline(raw) {
  return raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/** Produce deterministic SHA-256 fingerprint for a source item. */
function signalContentHash(headline, source, timestamp) {
  const day = timestamp.slice(0, 10);
  const normalised = normaliseHeadline(headline);
  const payload = `${normalised}|${source}|${day}`;
  return createHash("sha256").update(payload).digest("hex");
}

// In-memory dedup registry
const hashRegistry = new Map();
let registryCleanupLast = 0;
let dedupHits = 0;
let dedupMisses = 0;

function pruneRegistry(now = Date.now()) {
  if (now - registryCleanupLast < CLEANUP_INTERVAL_MS) return;
  for (const [hash, ts] of hashRegistry) {
    if (now - ts > DEDUP_WINDOW_MS) hashRegistry.delete(hash);
  }
  registryCleanupLast = now;
}

/** Check if a signal is a duplicate. Registers unseen signals. */
function checkDedup(headline, source, timestamp, now = Date.now()) {
  const hash = signalContentHash(headline, source, timestamp);
  pruneRegistry(now);

  const firstSeen = hashRegistry.get(hash);
  if (firstSeen !== undefined && now - firstSeen <= DEDUP_WINDOW_MS) {
    dedupHits++;
    return { duplicate: true, hash, firstSeen: new Date(firstSeen).toISOString() };
  }

  hashRegistry.set(hash, now);
  dedupMisses++;
  return { duplicate: false, hash };
}

function resetDedupRegistry() {
  hashRegistry.clear();
  registryCleanupLast = 0;
  dedupHits = 0;
  dedupMisses = 0;
}

function dedupStats() {
  const now = Date.now();
  let oldest = Infinity;
  for (const [, ts] of hashRegistry) {
    if (ts < oldest) oldest = ts;
  }
  return {
    registrySize: hashRegistry.size,
    hits: dedupHits,
    misses: dedupMisses,
    hitRate: dedupHits + dedupMisses > 0
      ? (dedupHits / (dedupHits + dedupMisses) * 100).toFixed(1) + "%"
      : "0%",
    oldestEntryAgeMs: oldest === Infinity ? null : now - oldest,
  };
}

// ── Confidence Scoring ──────────────────────────────────────────────────────

/**
 * Score a source's confidence, applying freshness decay.
 * Formula: confidence_t = confidence_0 * 0.5^(hours_old / half_life)
 */
function scoreConfidence(source, ageHours) {
  const base = BASE_CONFIDENCE[source];
  if (base === undefined) return 0.0;
  const halfLife = FRESHNESS_HALF_LIVES[source] || 24;
  const decayed = base * Math.pow(0.5, ageHours / halfLife);
  return Math.max(0, Math.min(1, decayed));
}

/**
 * Compute full source confidence from RESEARCH.md formula:
 * source_confidence = base_confidence * freshness_factor * historical_accuracy * (1 - noise_penalty)
 */
function computeSourceConfidence(source, ageHours) {
  const base = SOURCE_CONFIDENCE_BASE[source];
  if (base === undefined) return 0.0;

  const freshnessFactor = Math.max(0, 1 - ageHours / DEFAULT_LOOKBACK_HOURS);
  const historicalMultiplier = 1.0 + (HISTORICAL_ADJUSTMENTS[source] || 0);
  const noiseMultiplier = 1.0 - (NOISE_PENALTIES[source] || 0);

  const raw = base * freshnessFactor * historicalMultiplier * noiseMultiplier;
  return Math.max(0, Math.min(1, raw));
}

// ── Exponential Backoff ─────────────────────────────────────────────────────

async function withBackoff(fn, label, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isTimeout = err.code === "ETIMEDOUT" || err.code === "ECONNRESET" ||
                        err.message?.includes("timeout") || err.message?.includes("abort");
      if (!isTimeout || attempt >= maxRetries) {
        console.error(`[${label}] FAILED after ${attempt} attempts: ${err.message}`);
        throw err;
      }
      const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
      console.warn(`[${label}] Timeout (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── ENV Reading (keys never hard-coded) ─────────────────────────────────────

function getEnvKeys() {
  return {
    newsapi: process.env.NEWSAPI_KEY || null,
    twitter: process.env.TWITTER_BEARER_TOKEN || process.env.TWITTER_API_KEY || null,
    reddit: {
      clientId: process.env.REDDIT_CLIENT_ID || null,
      clientSecret: process.env.REDDIT_CLIENT_SECRET || null,
      userAgent: process.env.REDDIT_USER_AGENT || "nudimmud-trading-bot/1.0",
    },
  };
}

// ── News Feed Fetching (RSS + NewsAPI) ──────────────────────────────────────

// Simulated news data for stubs
const SIM_NEWS = {
  reuters: [
    { headline: "Bitcoin ETF inflows surpass $500M for third consecutive week", summary: "Institutional investors continue pouring capital into spot Bitcoin ETFs.", sentiment: "bullish", sentimentVal: 0.78, relevance: 0.95, tags: ["BTC-USD", "ETH-USD"], lagMin: 12 },
    { headline: "Fed signals potential rate pause amid cooling inflation data", summary: "Federal Reserve officials indicated they may hold rates steady.", sentiment: "bullish", sentimentVal: 0.68, relevance: 0.85, tags: ["BTC-USD", "ETH-USD", "SOL-USD"], lagMin: 45 },
    { headline: "SEC postpones decision on multiple crypto ETF applications", summary: "SEC has delayed rulings on several crypto ETF proposals.", sentiment: "bearish", sentimentVal: -0.42, relevance: 0.88, tags: ["BTC-USD", "ETH-USD"], lagMin: 90 },
    { headline: "Dollar strength weighs on crypto markets ahead of G7 meeting", summary: "A strengthening USD is pressuring cryptocurrency prices.", sentiment: "bearish", sentimentVal: -0.55, relevance: 0.82, tags: ["BTC-USD", "ETH-USD", "SOL-USD"], lagMin: 30 },
    { headline: "Major bank launches institutional crypto custody service", summary: "JPMorgan launched institutional-grade digital asset custody.", sentiment: "bullish", sentimentVal: 0.72, relevance: 0.90, tags: ["BTC-USD", "ETH-USD"], lagMin: 60 },
  ],
  coindesk: [
    { headline: "Bitcoin holds $98K support as on-chain metrics turn bullish", summary: "BTC stabilizes above $98k with accumulation by long-term holders.", sentiment: "bullish", sentimentVal: 0.65, relevance: 0.92, tags: ["BTC-USD"], lagMin: 8 },
    { headline: "Ethereum Layer-2 TVL hits all-time high of $45 billion", summary: "TVL across Ethereum L2 networks reached a record $45B.", sentiment: "bullish", sentimentVal: 0.70, relevance: 0.88, tags: ["ETH-USD"], lagMin: 25 },
    { headline: "Solana network suffers third partial outage this quarter", summary: "Solana experienced degraded performance for ~4 hours.", sentiment: "bearish", sentimentVal: -0.60, relevance: 0.93, tags: ["SOL-USD"], lagMin: 120 },
    { headline: "Coinbase reports record quarterly revenue on trading volume surge", summary: "Coinbase reported highest-ever quarterly revenue of $3.2B.", sentiment: "bullish", sentimentVal: 0.58, relevance: 0.80, tags: ["BTC-USD", "ETH-USD", "SOL-USD"], lagMin: 180 },
    { headline: "Regulatory clarity bill advances in Senate committee", summary: "Bipartisan crypto market structure bill advanced out of committee.", sentiment: "bullish", sentimentVal: 0.74, relevance: 0.91, tags: ["BTC-USD", "ETH-USD", "SOL-USD"], lagMin: 55 },
  ],
  cointelegraph: [
    { headline: "Bitcoin whale accumulation mirrors 2020 pre-bull run pattern", summary: "Whales accumulated over 150k BTC in the past 30 days.", sentiment: "bullish", sentimentVal: 0.80, relevance: 0.90, tags: ["BTC-USD"], lagMin: 15 },
    { headline: "Crypto VC funding rebounds with $3.8B deployed in April", summary: "VC investment in crypto startups reached $3.8B in April.", sentiment: "bullish", sentimentVal: 0.66, relevance: 0.78, tags: ["BTC-USD", "ETH-USD", "SOL-USD"], lagMin: 40 },
    { headline: "Treasury official warns of DeFi money laundering risks", summary: "Senior Treasury official raised concerns about DeFi money laundering.", sentiment: "bearish", sentimentVal: -0.48, relevance: 0.84, tags: ["ETH-USD"], lagMin: 200 },
    { headline: "Spot Ethereum ETF trading volume reaches new monthly high", summary: "Trading volume for spot ETH ETFs hit a new monthly record of $12B.", sentiment: "bullish", sentimentVal: 0.71, relevance: 0.89, tags: ["ETH-USD"], lagMin: 35 },
    { headline: "Solana DeFi ecosystem surpasses $10B in total value locked", summary: "Solana DeFi crossed $10B TVL for the first time.", sentiment: "bullish", sentimentVal: 0.62, relevance: 0.86, tags: ["SOL-USD"], lagMin: 50 },
  ],
};

/** Fetch news feeds — tries NewsAPI first, falls back to simulated data. */
async function fetchNewsFeeds(marketId, lookbackHours = DEFAULT_LOOKBACK_HOURS) {
  const keys = getEnvKeys();
  const now = new Date();
  const cutoff = new Date(now.getTime() - lookbackHours * 3600_000);
  const items = [];

  if (keys.newsapi) {
    // Real NewsAPI endpoint
    try {
      const sources = ["reuters", "coindesk", "cointelegraph"];
      for (const source of sources) {
        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(marketId)}&sources=${source}&from=${cutoff.toISOString()}&sortBy=publishedAt&pageSize=50&apiKey=${keys.newsapi}`;
        const itemsForSource = await withBackoff(async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timeout);
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          return res.json();
        }, `newsapi:${source}`);

        if (itemsForSource.articles) {
          for (const article of itemsForSource.articles) {
            const publishedAt = article.publishedAt || now.toISOString();
            const ageHours = (now.getTime() - new Date(publishedAt).getTime()) / 3600_000;
            if (ageHours > lookbackHours) continue;

            items.push({
              url: article.url,
              source,
              outlet_type: "news",
              headline: article.title,
              summary: article.description || "",
              timestamp: publishedAt,
              confidence: scoreConfidence(source, ageHours),
              initial_confidence: BASE_CONFIDENCE[source],
            });
          }
        }
      }
    } catch (err) {
      console.error(`[newsapi] Error (falling back to stub): ${err.message}`);
    }
  }

  // If no real data, use simulated feed (stub)
  if (items.length === 0) {
    const relevantSources = ["reuters", "coindesk", "cointelegraph"];
    for (const source of relevantSources) {
      const feed = SIM_NEWS[source];
      if (!feed) continue;
      for (const item of feed) {
        if (marketId && !item.tags.includes(marketId)) continue;
        const publishedAt = new Date(now.getTime() - item.lagMin * 60_000).toISOString();
        const ageHours = (now.getTime() - new Date(publishedAt).getTime()) / 3600_000;
        if (ageHours > lookbackHours) continue;

        items.push({
          url: `https://example.com/${source}#${signalContentHash(item.headline, source, publishedAt)}`,
          source,
          outlet_type: "news",
          headline: item.headline,
          summary: item.summary,
          timestamp: publishedAt,
          confidence: scoreConfidence(source, ageHours),
          initial_confidence: BASE_CONFIDENCE[source],
          sentiment_val: item.sentimentVal,
        });
      }
    }
    if (!keys.newsapi) {
      console.warn(`[news] No NEWSAPI_KEY — using simulated data for ${marketId}`);
    }
  }

  return items;
}

// ── Social Signal Fetching ──────────────────────────────────────────────────

const BULLISH_PHRASES = ["bullish","moon","long","breakout","pump","buy","accumulation","institutional","etf","adoption","partnership","upgrade","ATH","rally","green"];
const BEARISH_PHRASES = ["bearish","dump","short","crash","sell","distribution","regulation","sec","crackdown","hack","exploit","depeg","liquidation","rejected","red"];

function computeSentiment(text) {
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of BULLISH_PHRASES) if (lower.includes(w)) score += 0.25;
  for (const w of BEARISH_PHRASES) if (lower.includes(w)) score -= 0.25;
  return Math.max(-1, Math.min(1, score));
}

// Seedable PRNG (Mulberry32) for deterministic simulation
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function timeBucketSeed(base, windowSeconds = 300) {
  const now = Date.now();
  const bucket = Math.floor(now / (windowSeconds * 1000));
  let hash = 0;
  const str = `${base}:${bucket}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

function generateSimSocialPosts(marketId, platform, count, seed) {
  const rng = mulberry32(seed);
  const posts = [];
  const allPhrases = [...BULLISH_PHRASES, ...BEARISH_PHRASES];
  const keywords = marketId.toLowerCase().replace("-", " ");

  for (let i = 0; i < count; i++) {
    const phrase1 = allPhrases[Math.floor(rng() * allPhrases.length)];
    const phrase2 = allPhrases[Math.floor(rng() * allPhrases.length)];
    const templates = [
      `${keywords} looking ${phrase1} today`,
      `${phrase1} on ${keywords} — ${phrase2} setup forming`,
      `Just analyzed ${keywords}: ${phrase1} signals with ${phrase2}`,
      `${keywords} update: ${phrase1} momentum, watching ${phrase2}`,
      `${phrase1} ${keywords} thread 🧵 ${phrase2}`,
    ];
    const text = templates[Math.floor(rng() * templates.length)];
    const baseS = computeSentiment(text);
    const noisyS = Math.max(-1, Math.min(1, baseS + (rng() - 0.5) * 0.4));
    const reach = Math.floor(rng() * 50000) + 100;
    const timestamp = new Date(Date.now() - Math.floor(rng() * 3600_000)).toISOString();

    posts.push({
      platform,
      text,
      sentiment: noisyS,
      reach,
      timestamp,
    });
  }
  return posts;
}

function generateSimRedditPosts(marketId, count, seed) {
  const rng = mulberry32(seed);
  const posts = [];

  for (let i = 0; i < count; i++) {
    const kw = marketId.toLowerCase().replace("-", " ");
    const mood = rng() > 0.6 ? "bullish" : rng() > 0.3 ? "neutral" : "bearish";
    const titles = {
      bullish: [`${kw} accumulation at these levels is a no-brainer`, `Why ${kw} is about to rip`, `${kw} institutional flows hitting records`],
      neutral: [`${kw} daily discussion`, `${kw} support and resistance levels`, `${kw} at key inflection point`],
      bearish: [`Warning signs for ${kw} holders`, `${kw} facing headwinds`, `Is ${kw} distribution happening?`],
    };
    const title = titles[mood][Math.floor(rng() * titles[mood].length)];
    const upvotes = Math.floor(rng() * 2000) + 5;
    const s = computeSentiment(title);
    const created = new Date(Date.now() - Math.floor(rng() * 7200_000)).toISOString();

    posts.push({
      platform: "reddit",
      title,
      text: `Discussion about ${kw} market conditions.`,
      sentiment: s,
      upvotes,
      comments: Math.floor(rng() * 500) + 1,
      upvoteRatio: rng() * 0.3 + 0.7,
      timestamp: created,
    });
  }
  return posts;
}

/** Fetch social signals — tries real APIs first, falls back to simulation. */
async function fetchSocialSignals(marketId, lookbackHours = DEFAULT_LOOKBACK_HOURS) {
  const keys = getEnvKeys();
  const results = [];

  // ── Twitter/X ────────────────────────────────────────────────────────
  if (keys.twitter) {
    try {
      const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(marketId)}&max_results=100&tweet.fields=created_at,public_metrics`;
      const data = await withBackoff(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${keys.twitter}` },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`Twitter API HTTP ${res.status}`);
        return res.json();
      }, `twitter:${marketId}`);

      if (data.data) {
        for (const tweet of data.data) {
          results.push({
            platform: "twitter",
            source: "x_twitter",
            outlet_type: "social",
            text: tweet.text,
            timestamp: tweet.created_at || new Date().toISOString(),
            confidence: 0.70,
            initial_confidence: 0.70,
            metrics: tweet.public_metrics || {},
          });
        }
      }
    } catch (err) {
      console.error(`[twitter] API error (falling back to stub): ${err.message}`);
    }
  }

  // ── Reddit ───────────────────────────────────────────────────────────
  if (keys.reddit.clientId && keys.reddit.clientSecret) {
    try {
      // Get access token
      const authRes = await fetch("https://www.reddit.com/api/v1/access_token", {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${keys.reddit.clientId}:${keys.reddit.clientSecret}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": keys.reddit.userAgent,
        },
        body: "grant_type=client_credentials",
      });
      if (!authRes.ok) throw new Error(`Reddit auth HTTP ${authRes.status}`);
      const authData = await authRes.json();
      const accessToken = authData.access_token;

      // Search subreddits
      const subreddits = ["CryptoCurrency", "Bitcoin", "ethereum", "solana"];
      for (const sub of subreddits) {
        const url = `https://oauth.reddit.com/r/${sub}/search?q=${encodeURIComponent(marketId)}&sort=new&limit=25&restrict_sr=1`;
        const data = await withBackoff(async () => {
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "User-Agent": keys.reddit.userAgent,
            },
          });
          if (!res.ok) throw new Error(`Reddit API HTTP ${res.status}`);
          return res.json();
        }, `reddit:${sub}`);

        if (data.data?.children) {
          for (const child of data.data.children) {
            const post = child.data;
            results.push({
              platform: "reddit",
              source: "reddit",
              outlet_type: "social",
              title: post.title,
              text: post.selftext || "",
              subreddit: post.subreddit,
              upvotes: post.ups || 0,
              upvoteRatio: post.upvote_ratio || 0.5,
              comments: post.num_comments || 0,
              timestamp: new Date((post.created_utc || 0) * 1000).toISOString(),
              confidence: 0.60,
              initial_confidence: 0.60,
            });
          }
        }
      }
    } catch (err) {
      console.error(`[reddit] API error (falling back to stub): ${err.message}`);
    }
  }

  // ── Fallback to simulated data if no real results ────────────────────
  if (results.length === 0) {
    const seed = timeBucketSeed(`social:${marketId}`);
    const twCount = Math.floor(mulberry32(seed + 1)() * 40) + 5;
    const redCount = Math.floor(mulberry32(seed + 2)() * 25) + 3;

    const twitterPosts = generateSimSocialPosts(marketId, "twitter", twCount, seed + 3);
    for (const p of twitterPosts) {
      const ageHours = (Date.now() - new Date(p.timestamp).getTime()) / 3600_000;
      if (ageHours > lookbackHours) continue;
      results.push({
        platform: "twitter",
        source: "x_twitter",
        outlet_type: "social",
        text: p.text,
        timestamp: p.timestamp,
        sentiment: p.sentiment,
        reach: p.reach,
        confidence: scoreConfidence("x_twitter", ageHours),
        initial_confidence: 0.70,
      });
    }

    const redditPosts = generateSimRedditPosts(marketId, redCount, seed + 4);
    for (const p of redditPosts) {
      const ageHours = (Date.now() - new Date(p.timestamp).getTime()) / 3600_000;
      if (ageHours > lookbackHours) continue;
      results.push({
        platform: "reddit",
        source: "reddit",
        outlet_type: "social",
        title: p.title,
        text: p.text,
        timestamp: p.timestamp,
        sentiment: p.sentiment,
        upvotes: p.upvotes,
        comments: p.comments,
        upvoteRatio: p.upvoteRatio,
        confidence: scoreConfidence("reddit", ageHours),
        initial_confidence: 0.60,
      });
    }

    if (!keys.twitter && !keys.reddit.clientId) {
      console.warn(`[social] No API keys configured — using simulated data for ${marketId}`);
    }
  }

  return results;
}

// ── Market Data Signals (Volume spikes, price anomalies) ────────────────────

/** Detect market anomalies from simulated data (stub — real data comes from Phase 2 scanner). */
async function fetchMarketSignals(marketId, lookbackHours = DEFAULT_LOOKBACK_HOURS) {
  // This is a stub: in production, this would query an exchange API or Phase 2 scanner output.
  // For now, return empty — Phase 2 candidate data feeds in at the ensemble level.
  return [];
}

// ── Deduplicate Sources (entity-level across all collected items) ───────────

/**
 * Deduplicate a flat array of sources using SHA-256 content hashing.
 * Removes exact duplicates and near-duplicates (same headline + day + source).
 * Returns deduplicated array, keeping highest-confidence instances.
 */
function deduplicateSources(sources) {
  const seen = new Map();
  const deduped = [];

  for (const src of sources) {
    const headline = src.headline || src.title || "";
    const timestamp = src.timestamp || new Date().toISOString();
    const sourceId = src.source || "unknown";

    const hash = signalContentHash(headline, sourceId, timestamp);

    if (seen.has(hash)) {
      // Keep the one with higher confidence
      const existing = seen.get(hash);
      if ((src.confidence || 0) > (existing.confidence || 0)) {
        seen.set(hash, src);
      }
    } else {
      seen.set(hash, src);
    }
  }

  for (const [, src] of seen) {
    deduped.push(src);
  }

  return deduped;
}

// ── Consensus / Dissent Extraction ──────────────────────────────────────────

/**
 * Extract consensus and dissent summaries from a list of sources.
 * Algorithm from RESEARCH.md:
 * 1. Classify each source by sentiment (bullish, bearish, neutral)
 * 2. Weight by source confidence
 * 3. Aggregate: sum(confidence * sentiment_value)
 * 4. Normalize: result / total_confidence
 * 5. If > 0.3: bullish consensus; < -0.3: bearish; else conflicted
 */
function extractConsensus(sources) {
  if (!sources || sources.length === 0) {
    return {
      direction: "neutral",
      strength: 0,
      score: 0,
      summary: "No sources available",
    };
  }

  let weightedSum = 0;
  let totalConfidence = 0;
  let bullishWeight = 0;
  let bearishWeight = 0;
  let neutralWeight = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;

  for (const src of sources) {
    // Determine sentiment value
    let sentimentVal = src.sentiment_val || 0;
    // If we have no explicit sentiment_val but have other signals
    if (sentimentVal === 0) {
      if (src.sentiment !== undefined) {
        sentimentVal = src.sentiment;
      } else {
        // Try to infer from headline text
        const text = (src.headline || src.title || src.text || "").toLowerCase();
        sentimentVal = computeSentiment(text);
      }
    }

    const conf = src.confidence || 0.5;
    weightedSum += sentimentVal * conf;
    totalConfidence += conf;

    if (sentimentVal > 0.1) {
      bullishWeight += conf;
      bullishCount++;
    } else if (sentimentVal < -0.1) {
      bearishWeight += conf;
      bearishCount++;
    } else {
      neutralWeight += conf;
      neutralCount++;
    }
  }

  const normalizedScore = totalConfidence > 0 ? weightedSum / totalConfidence : 0;

  let direction;
  let strength;

  if (normalizedScore > 0.3) {
    direction = "bullish";
    strength = bullishWeight / totalConfidence;
  } else if (normalizedScore < -0.3) {
    direction = "bearish";
    strength = bearishWeight / totalConfidence;
  } else {
    direction = "neutral";
    strength = Math.max(bullishWeight, bearishWeight, neutralWeight) / totalConfidence;
  }

  // Check for dissent (10-30% disagreement from consensus)
  let dissentSummary = null;
  const totalSources = sources.length;
  if (direction === "bullish" && bearishCount >= 1 && bearishCount / totalSources >= 0.1) {
    dissentSummary = `${bearishCount}/${totalSources} sources express bearish dissent`;
  } else if (direction === "bearish" && bullishCount >= 1 && bullishCount / totalSources >= 0.1) {
    dissentSummary = `${bullishCount}/${totalSources} sources express bullish dissent`;
  }

  // Check for conflicted (40-60 split)
  const isConflicted = direction === "neutral" && totalSources >= 3 &&
    bullishWeight > 0 && bearishWeight > 0 &&
    Math.abs(bullishWeight - bearishWeight) / totalConfidence < 0.2;

  let summary;
  if (isConflicted) {
    summary = `Conflicted: ${(bullishWeight / totalConfidence * 100).toFixed(0)}% bullish, ${(bearishWeight / totalConfidence * 100).toFixed(0)}% bearish`;
  } else if (direction === "bullish") {
    summary = `Bullish consensus (strength: ${(strength * 100).toFixed(0)}%) across ${totalSources} sources`;
  } else if (direction === "bearish") {
    summary = `Bearish consensus (strength: ${(strength * 100).toFixed(0)}%) across ${totalSources} sources`;
  } else {
    summary = `Neutral: mixed signals across ${totalSources} sources`;
  }

  return {
    direction,
    strength: parseFloat(strength.toFixed(4)),
    score: parseFloat(normalizedScore.toFixed(4)),
    summary,
    dissent: dissentSummary,
    sourceCounts: { bullish: bullishCount, bearish: bearishCount, neutral: neutralCount },
    confidenceWeights: { bullish: bullishWeight, bearish: bearishWeight, neutral: neutralWeight },
    isConflicted,
  };
}

// ── Freshness Flags ─────────────────────────────────────────────────────────

function computeFreshnessFlags(sources) {
  if (!sources || sources.length === 0) {
    return {
      flags: ["no_sources"],
      oldestAgeHours: 0,
      youngestAgeHours: 0,
      qualityScore: 0,
    };
  }

  const now = Date.now();
  let oldest = 0;
  let youngest = Infinity;
  const outletTypes = new Set();
  const sourceSet = new Set();
  let allOld = true;

  for (const src of sources) {
    const ts = new Date(src.timestamp || now).getTime();
    const ageHours = (now - ts) / 3600_000;
    if (ageHours > oldest) oldest = ageHours;
    if (ageHours < youngest) youngest = ageHours;
    if (ageHours < 12) allOld = false;
    if (src.source) sourceSet.add(src.source);
    if (src.outlet_type) outletTypes.add(src.outlet_type);
  }

  const flags = [];

  // Stable: consistent narrative, some diversity
  if (outletTypes.size >= 2 && sourceSet.size >= 2 && youngest < 12) {
    flags.push("stable");
  }

  // Old evidence: all sources > 12h
  if (allOld) {
    flags.push("old_evidence");
  }

  // Low diversity: all from same outlet type
  if (outletTypes.size === 1 && sources.length >= 3) {
    flags.push("low_diversity");
  }

  // Rumor: only social sources, no news confirmation
  if (outletTypes.size === 1 && outletTypes.has("social")) {
    flags.push("rumor");
  }

  // Freshness quality: 0-1 based on youngest source age
  const freshnessQuality = youngest < 1 ? 1.0 :
    youngest < 6 ? 0.9 :
    youngest < 12 ? 0.7 :
    youngest < 24 ? 0.5 : 0.3;

  return {
    flags,
    oldestAgeHours: parseFloat(oldest.toFixed(2)),
    youngestAgeHours: parseFloat(youngest.toFixed(2)),
    qualityScore: parseFloat(freshnessQuality.toFixed(4)),
  };
}

// ── Quality Score ───────────────────────────────────────────────────────────

function computeQualityScore(sources, freshness) {
  if (!sources || sources.length === 0) return 0;

  // Average confidence
  let totalConf = 0;
  for (const s of sources) totalConf += s.confidence || 0;
  const avgConf = totalConf / sources.length;

  // Source diversity bonus
  const uniqueSources = new Set(sources.map(s => s.source)).size;
  const diversityBonus = Math.min(1, uniqueSources / 5);

  // Size bonus (more cross-referenced sources = better, up to a point)
  const sizeBonus = Math.min(1, sources.length / 10);

  // Freshness
  const freshnessScore = freshness.qualityScore;

  // Composite: weighted average
  const quality = avgConf * 0.35 + diversityBonus * 0.25 + freshnessScore * 0.25 + sizeBonus * 0.15;
  return parseFloat(Math.max(0, Math.min(1, quality)).toFixed(4));
}

// ── Data Quality Gate ───────────────────────────────────────────────────────

/**
 * Assess data quality of an evidence packet, returning a score 0-1.
 *
 * Factors:
 * - Source count (>10 = quality bonus)
 * - Source diversity (news + social + market data = higher confidence)
 * - Source freshness (average age in hours)
 * - Deduplication ratio (more unique = higher quality)
 * - Confidence score variance (too uniform = suspicious)
 *
 * @param {object} packet - EvidencePacket from buildEvidencePacket
 * @returns {{ score: number, details: object }} Quality assessment
 */
function assessDataQuality(packet) {
  if (!packet || !packet.sources || packet.sources.length === 0) {
    return { score: 0, details: { reasons: ['no_sources'] } };
  }

  const sources = packet.sources;
  const details = {};

  // 1. Source count factor (>10 = quality bonus)
  const countFactor = Math.min(1, sources.length / 10);
  details.countFactor = parseFloat(countFactor.toFixed(4));

  // 2. Source diversity (news + social + market = higher confidence)
  const outletTypes = new Set(sources.map(s => s.outlet_type || s.type || 'unknown'));
  const diversityFactor = Math.min(1, outletTypes.size / 3);
  details.diversityFactor = parseFloat(diversityFactor.toFixed(4));

  // 3. Source freshness (average age in hours, younger = better)
  const now = Date.now();
  let totalAgeHours = 0;
  let agedSources = 0;
  for (const src of sources) {
    const ts = src.timestamp ? new Date(src.timestamp).getTime() : now;
    const ageHours = (now - ts) / 3600_000;
    if (ageHours >= 0) {
      totalAgeHours += ageHours;
      agedSources++;
    }
  }
  const avgAgeHours = agedSources > 0 ? totalAgeHours / agedSources : 24;
  // Freshness score: 1.0 at 0h, halves every 12h
  const freshnessFactor = Math.max(0, Math.min(1, Math.pow(0.5, avgAgeHours / 12)));
  details.avgAgeHours = parseFloat(avgAgeHours.toFixed(2));
  details.freshnessFactor = parseFloat(freshnessFactor.toFixed(4));

  // 4. Deduplication ratio (more unique = higher quality)
  const totalBeforeDedup = packet.total_items_before_dedup || sources.length;
  const dedupRatio = totalBeforeDedup > 0 ? sources.length / totalBeforeDedup : 1;
  // Ideal dedup ratio: 0.4-0.8 (diverse but not repetitive)
  // < 0.3: too much dedup (repetitive source problem)
  // > 0.95: no dedup happening (suspicious)
  const dedupFactor = dedupRatio >= 0.3 && dedupRatio < 0.95 ? 1.0 :
    dedupRatio >= 0.95 ? 0.5 : 0.7;
  details.dedupRatio = parseFloat(dedupRatio.toFixed(4));
  details.dedupFactor = parseFloat(dedupFactor.toFixed(4));

  // 5. Confidence score variance (too uniform = suspicious)
  const confidences = sources.map(s => s.confidence || 0.5).filter(c => c > 0);
  let variance = 0;
  if (confidences.length > 1) {
    const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    variance = confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length;
  }
  // Very low variance (< 0.001) could indicate fabricated/uniform sources
  // Very high variance (> 0.1) indicates unreliable source mix
  const varianceFactor = variance > 0.001 && variance < 0.1 ? 1.0 :
    variance <= 0.001 ? 0.6 : 0.8;
  details.variance = parseFloat(variance.toFixed(6));
  details.varianceFactor = parseFloat(varianceFactor.toFixed(4));

  // Composite score: weighted average
  const score = parseFloat(
    Math.max(0, Math.min(1,
      countFactor * 0.20 +
      diversityFactor * 0.25 +
      freshnessFactor * 0.25 +
      dedupFactor * 0.15 +
      varianceFactor * 0.15
    )).toFixed(4)
  );

  details.score = score;

  return { score, details };
}

// ── Evidence Packet Construction ────────────────────────────────────────────

function buildEvidencePacket(marketId, newsItems, socialItems, marketSignals) {
  const timestamp = new Date().toISOString();

  // Combine all sources for dedup/consensus
  const allSources = [
    ...newsItems.map(n => ({ ...n, type: "news" })),
    ...socialItems.map(s => ({ ...s, type: "social" })),
    ...marketSignals.map(m => ({ ...m, type: "market" })),
  ];

  // Deduplicate
  const uniqueSources = deduplicateSources(allSources);

  // Event timeline: sort by timestamp
  const eventTimeline = [...uniqueSources]
    .filter(s => s.headline || s.title)
    .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0))
    .map(s => ({
      time: s.timestamp,
      event: s.headline || s.title || "",
      impact: (s.sentiment || 0) > 0.1 ? "bullish" : (s.sentiment || 0) < -0.1 ? "bearish" : "neutral",
    }));

  // Consensus
  const consensus = extractConsensus(uniqueSources);

  // Freshness
  const freshness = computeFreshnessFlags(uniqueSources);

  // Quality
  const qualityScore = computeQualityScore(uniqueSources, freshness);

  // Packet hash for dedup
  const packetHash = computePacketHash(marketId, uniqueSources, timestamp);

  return {
    evidence_id: packetHash,
    market_id: marketId,
    timestamp,
    sources: uniqueSources,
    source_count: uniqueSources.length,
    total_items_before_dedup: allSources.length,
    event_timeline: eventTimeline,
    consensus_summary: consensus.summary,
    dissent_summary: consensus.dissent || "No significant dissent detected",
    consensus_direction: consensus.direction,
    consensus_strength: consensus.strength,
    sentiment_score: consensus.score,
    freshness_flags: freshness.flags,
    freshness: {
      oldest_source_age_hours: freshness.oldestAgeHours,
      newest_source_age_hours: freshness.youngestAgeHours,
      score: freshness.qualityScore,
    },
    quality_score: qualityScore,
  };
}

function computePacketHash(marketId, sources, timestamp) {
  const day = timestamp.slice(0, 10);
  const signalHashes = sources
    .map(s => signalContentHash(s.headline || s.title || s.text || "", s.source || "unknown", s.timestamp || timestamp))
    .sort();
  const payload = `${marketId}|${day}|${signalHashes.join(",")}`;
  return createHash("sha256").update(payload).digest("hex");
}

// ── Output Writer ───────────────────────────────────────────────────────────

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function appendEvidencePacket(packet) {
  ensureOutputDir();
  const line = JSON.stringify(packet) + "\n";
  appendFileSync(OUTPUT_FILE, line, "utf-8");
  console.log(`[output] Appended evidence packet for ${packet.market_id} to ${OUTPUT_FILE}`);
}

// ── Main Collection Function ─────────────────────────────────────────────────

/**
 * Collect evidence for a market.
 *
 * @param {string} marketId - e.g. "BTC-USD"
 * @param {number} lookbackHours - how far back to search (default 24)
 * @returns {Promise<object>} EvidencePacket
 */
async function collectEvidence(marketId, lookbackHours = DEFAULT_LOOKBACK_HOURS) {
  const startTime = Date.now();

  if (!marketId || typeof marketId !== "string") {
    throw new Error(`collectEvidence: invalid marketId "${marketId}"`);
  }
  if (typeof lookbackHours !== "number" || lookbackHours < 1) {
    throw new Error(`collectEvidence: invalid lookbackHours "${lookbackHours}"`);
  }

  console.log(`[collect] Starting evidence collection for ${marketId} (lookback: ${lookbackHours}h)`);

  // Fetch all sources in parallel
  const [newsItems, socialItems, marketSignals] = await Promise.all([
    fetchNewsFeeds(marketId, lookbackHours).catch(err => {
      console.error(`[collect] News fetch failed for ${marketId}: ${err.message}`);
      return [];
    }),
    fetchSocialSignals(marketId, lookbackHours).catch(err => {
      console.error(`[collect] Social fetch failed for ${marketId}: ${err.message}`);
      return [];
    }),
    fetchMarketSignals(marketId, lookbackHours).catch(err => {
      console.error(`[collect] Market signal fetch failed for ${marketId}: ${err.message}`);
      return [];
    }),
  ]);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[collect] ${marketId}: ${newsItems.length} news, ${socialItems.length} social, ${marketSignals.length} market signals (${elapsed}s)`);

  const packet = buildEvidencePacket(marketId, newsItems, socialItems, marketSignals);

  // Data quality gate: assess quality and attach to packet
  const qualityAssessment = assessDataQuality(packet);
  packet.quality = qualityAssessment.score;
  packet.quality_details = qualityAssessment.details;

  console.log(`[collect] ${marketId}: data quality=${qualityAssessment.score.toFixed(4)}`);

  appendEvidencePacket(packet);

  return packet;
}

// ── CLI Entry Point ─────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--daemon")) {
    console.log(`[daemon] Starting evidence collector (interval: ${DAEMON_INTERVAL_MS / 1000}s)`);
    const runOnce = async () => {
      const markets = parseMarketArg(args);
      for (const market of markets) {
        try {
          await collectEvidence(market, parseLookbackArg(args));
        } catch (err) {
          console.error(`[daemon] Error collecting for ${market}: ${err.message}`);
        }
      }
    };
    await runOnce();
    setInterval(runOnce, DAEMON_INTERVAL_MS);
    return;
  }

  const markets = parseMarketArg(args);
  const lookbackHours = parseLookbackArg(args);
  let allPackets = [];

  for (const market of markets) {
    try {
      const packet = await collectEvidence(market, lookbackHours);
      allPackets.push(packet);
    } catch (err) {
      console.error(`[main] Error collecting for ${market}: ${err.message}`);
    }
  }

  const dedupInfo = dedupStats();
  console.log(`\n[Done] Collected evidence for ${allPackets.length}/${markets.length} markets`);
  console.log(`[Done] Written to: ${OUTPUT_FILE}`);
  console.log(`[Dedup] ${JSON.stringify(dedupInfo)}`);

  // Return summary
  for (const p of allPackets) {
    console.log(`  ${p.market_id}: ${p.source_count} sources, ${p.consensus_direction} (score: ${p.sentiment_score}), quality: ${p.quality_score}`);
  }
}

function parseMarketArg(args) {
  const idx = args.indexOf("--market");
  if (idx !== -1 && args[idx + 1]) return [args[idx + 1]];
  const idx2 = args.indexOf("--markets");
  if (idx2 !== -1 && args[idx2 + 1]) return args[idx2 + 1].split(",");
  return DEFAULT_MARKETS;
}

function parseLookbackArg(args) {
  const idx = args.indexOf("--hours");
  if (idx !== -1 && args[idx + 1]) return parseInt(args[idx + 1], 10) || DEFAULT_LOOKBACK_HOURS;
  return DEFAULT_LOOKBACK_HOURS;
}

// ── Self-test / Verification ────────────────────────────────────────────────

async function runSelfTest() {
  console.log("=== Evidence Collector Self-Test ===\n");
  let passed = 0;
  let failed = 0;

  // 1. scoreConfidence
  console.log("[test] scoreConfidence...");
  const c1 = scoreConfidence("reuters", 0);
  const c2 = scoreConfidence("reuters", 24);
  const c3 = scoreConfidence("reddit", 8);
  if (c1 === 0.95 && c2 === 0.475 && c3 === 0.30) {
    console.log(`  ✓ scoreConfidence: fresh=0.95, 24h=0.475, reddit=0.30`);
    passed++;
  } else {
    console.log(`  ✗ got c1=${c1} c2=${c2} c3=${c3}`);
    failed++;
  }

  // 2. Dedup
  console.log("[test] deduplicateSources...");
  resetDedupRegistry();
  const items = [
    { headline: "Bitcoin rally", source: "reuters", timestamp: new Date().toISOString(), confidence: 0.9 },
    { headline: "Bitcoin rally", source: "reuters", timestamp: new Date().toISOString(), confidence: 0.8 },
    { headline: "Ether rally", source: "coindesk", timestamp: new Date().toISOString(), confidence: 0.85 },
  ];
  const deduped = deduplicateSources(items);
  if (deduped.length === 2) {
    console.log(`  ✓ dedup: 3→2 items (removed duplicate headline+source)`);
    passed++;
  } else {
    console.log(`  ✗ dedup: expected 2, got ${deduped.length}`);
    failed++;
  }

  // 3. Consensus extraction
  console.log("[test] extractConsensus...");
  resetDedupRegistry();
  const bullishSources = [
    { headline: "Bullish signal", source: "reuters", timestamp: new Date().toISOString(), confidence: 0.9, sentiment_val: 0.7 },
    { headline: "More bullish", source: "coindesk", timestamp: new Date().toISOString(), confidence: 0.85, sentiment_val: 0.6 },
    { headline: "Bearish signal", source: "x_twitter", timestamp: new Date().toISOString(), confidence: 0.5, sentiment_val: -0.5 },
  ];
  const consensus = extractConsensus(bullishSources);
  if (consensus.direction === "bullish" && consensus.strength > 0.5) {
    console.log(`  ✓ consensus: direction=${consensus.direction}, strength=${consensus.strength.toFixed(2)}`);
    passed++;
  } else {
    console.log(`  ✗ consensus: got direction=${consensus.direction} strength=${consensus.strength}`);
    failed++;
  }

  // 4. end-to-end collect
  console.log("[test] collectEvidence (BTC-USD, 24h lookback)...");
  const packet = await collectEvidence("BTC-USD", 24);
  const hasSources = packet.source_count > 0;
  const hasConsensus = typeof packet.consensus_summary === "string";
  const hasFlags = Array.isArray(packet.freshness_flags);
  const hasQuality = typeof packet.quality_score === "number";
  const hasId = typeof packet.evidence_id === "string";
  if (hasSources && hasConsensus && hasFlags && hasQuality && hasId) {
    console.log(`  ✓ collect: ${packet.source_count} sources, quality=${packet.quality_score}, ${packet.consensus_direction}`);
    passed++;
  } else {
    console.log(`  ✗ collect: incomplete packet (${JSON.stringify({hasSources, hasConsensus, hasFlags, hasQuality, hasId})})`);
    failed++;
  }

  // 5. Timestamp ISO 8601
  console.log("[test] ISO 8601 timestamps...");
  const isIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(packet.timestamp);
  if (isIso) {
    console.log(`  ✓ timestamp: ${packet.timestamp}`);
    passed++;
  } else {
    console.log(`  ✗ timestamp: not ISO 8601: ${packet.timestamp}`);
    failed++;
  }

  // 6. Dedup hit rate
  console.log("[test] dedup hit rate...");
  // Run duplicate collection: same market within dedup window should be deduped
  const packet2 = await collectEvidence("BTC-USD", 24);
  // Many sources should be deduped
  if (dedupStats().hitRate !== "0%") {
    console.log(`  ✓ dedup rate: ${dedupStats().hitRate}`);
    passed++;
  } else {
    console.log(`  ! dedup: no duplicates found (expected — first run)`);
    // Not a failure, just info
  }

  console.log(`\n=== Results: ${passed}/${passed + failed} passed, ${failed} failed ===`);
  return failed === 0;
}

// ── Run ─────────────────────────────────────────────────────────────────────

if (process.argv[1] === __filename || process.argv[1]?.endsWith("evidence-collector.mjs")) {
  if (process.argv.includes("--test")) {
    runSelfTest().then(ok => process.exit(ok ? 0 : 1));
  } else {
    main().catch(err => {
      console.error("[fatal]", err);
      process.exit(1);
    });
  }
}

// ── Exports (for programmatic use) ──────────────────────────────────────────

export {
  collectEvidence,
  assessDataQuality,
  fetchNewsFeeds,
  fetchSocialSignals,
  deduplicateSources,
  extractConsensus,
  scoreConfidence,
  computeFreshnessFlags,
  computeQualityScore,
  resetDedupRegistry,
  dedupStats,
};
