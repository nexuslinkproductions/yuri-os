/**
 * Phase 3: RSS/News Ingester
 * 
 * Fetches RSS feeds from Reuters, CoinDesk, CoinTelegraph.
 * Parses headlines, summaries, timestamps.
 * Tags: market, asset, sentiment_signal.
 * 
 * Deterministic: same input always produces same output.
 * Simulated feeds with swappable live endpoints.
 */

import {
  NewsSignal,
  SourceName,
  SentimentLabel,
  EvidenceTag,
  RSSFeedConfig,
} from './types';

import {
  SOURCE_CONFIGS,
  FRESHNESS_WINDOW_HOURS,
  MAX_ITEM_AGE_HOURS,
  RETRY_BACKOFF_MS,
  MAX_RETRIES,
} from './source-config';

// ─── Simulated Feed Data (deterministic, timestamp-keyed) ─────────────────────

interface SimFeedItem {
  headline: string;
  summary: string;
  sentiment: SentimentLabel;
  sentimentVal: number;
  relevance: number;
  tags: string[]; // market_ids like "BTC-USD", "ETH-USD"
  lagMinutes: number; // how many minutes ago "published"
}

const SIM_REUTERS: SimFeedItem[] = [
  {
    headline: 'Bitcoin ETF inflows surpass $500M for third consecutive week',
    summary: 'Institutional investors continue pouring capital into spot Bitcoin ETFs, with cumulative inflows exceeding $500 million for the third straight week, signaling sustained demand.',
    sentiment: 'bullish',
    sentimentVal: 0.78,
    relevance: 0.95,
    tags: ['BTC-USD', 'ETH-USD'],
    lagMinutes: 12,
  },
  {
    headline: 'Fed signals potential rate pause amid cooling inflation data',
    summary: 'Federal Reserve officials indicated they may hold rates steady at the next meeting after CPI data came in below expectations, boosting risk asset sentiment.',
    sentiment: 'bullish',
    sentimentVal: 0.68,
    relevance: 0.85,
    tags: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
    lagMinutes: 45,
  },
  {
    headline: 'SEC postpones decision on multiple crypto ETF applications',
    summary: 'The U.S. Securities and Exchange Commission has delayed rulings on several cryptocurrency exchange-traded fund proposals, extending the review period by 45 days.',
    sentiment: 'bearish',
    sentimentVal: -0.42,
    relevance: 0.88,
    tags: ['BTC-USD', 'ETH-USD'],
    lagMinutes: 90,
  },
  {
    headline: 'Dollar strength weighs on crypto markets ahead of G7 meeting',
    summary: 'A strengthening U.S. dollar index is pressuring cryptocurrency prices as traders reposition ahead of the G7 finance ministers meeting in London.',
    sentiment: 'bearish',
    sentimentVal: -0.55,
    relevance: 0.82,
    tags: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
    lagMinutes: 30,
  },
  {
    headline: 'Major bank launches institutional crypto custody service',
    summary: 'JPMorgan announced the launch of a new institutional-grade digital asset custody platform, expanding its crypto services for hedge fund and pension fund clients.',
    sentiment: 'bullish',
    sentimentVal: 0.72,
    relevance: 0.90,
    tags: ['BTC-USD', 'ETH-USD'],
    lagMinutes: 60,
  },
];

const SIM_COINDESK: SimFeedItem[] = [
  {
    headline: 'Bitcoin holds $98K support as on-chain metrics turn bullish',
    summary: 'BTC price action stabilizes above the $98,000 support level with on-chain data showing accumulation by long-term holders and declining exchange reserves.',
    sentiment: 'bullish',
    sentimentVal: 0.65,
    relevance: 0.92,
    tags: ['BTC-USD'],
    lagMinutes: 8,
  },
  {
    headline: 'Ethereum Layer-2 TVL hits all-time high of $45 billion',
    summary: 'Total value locked across Ethereum Layer-2 networks reached a record $45 billion, driven by Arbitrum and Optimism ecosystem growth.',
    sentiment: 'bullish',
    sentimentVal: 0.70,
    relevance: 0.88,
    tags: ['ETH-USD'],
    lagMinutes: 25,
  },
  {
    headline: 'Solana network suffers third partial outage this quarter',
    summary: 'The Solana blockchain experienced degraded performance for approximately 4 hours, marking the third incident this quarter, raising reliability concerns.',
    sentiment: 'bearish',
    sentimentVal: -0.60,
    relevance: 0.93,
    tags: ['SOL-USD'],
    lagMinutes: 120,
  },
  {
    headline: 'Coinbase reports record quarterly revenue on trading volume surge',
    summary: 'Coinbase Global reported its highest-ever quarterly revenue of $3.2 billion, driven by surging retail and institutional trading volumes.',
    sentiment: 'bullish',
    sentimentVal: 0.58,
    relevance: 0.80,
    tags: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
    lagMinutes: 180,
  },
  {
    headline: 'Regulatory clarity bill advances in Senate committee',
    summary: 'A bipartisan crypto market structure bill advanced out of the Senate Banking Committee, potentially providing clear jurisdiction boundaries between the CFTC and SEC.',
    sentiment: 'bullish',
    sentimentVal: 0.74,
    relevance: 0.91,
    tags: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
    lagMinutes: 55,
  },
];

const SIM_COINTELEGRAPH: SimFeedItem[] = [
  {
    headline: 'Bitcoin whale accumulation mirrors 2020 pre-bull run pattern',
    summary: 'On-chain data reveals Bitcoin whales have accumulated over 150,000 BTC in the past 30 days, a pattern reminiscent of the accumulation phase before the 2020-2021 bull market.',
    sentiment: 'bullish',
    sentimentVal: 0.80,
    relevance: 0.90,
    tags: ['BTC-USD'],
    lagMinutes: 15,
  },
  {
    headline: 'Crypto VC funding rebounds with $3.8B deployed in April',
    summary: 'Venture capital investment in crypto startups reached $3.8 billion in April, marking the highest monthly total since the 2021 bull market peak.',
    sentiment: 'bullish',
    sentimentVal: 0.66,
    relevance: 0.78,
    tags: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
    lagMinutes: 40,
  },
  {
    headline: 'Treasury official warns of DeFi money laundering risks',
    summary: 'A senior Treasury Department official raised concerns about decentralized finance platforms being used for money laundering, signaling potential regulatory action.',
    sentiment: 'bearish',
    sentimentVal: -0.48,
    relevance: 0.84,
    tags: ['ETH-USD'],
    lagMinutes: 200,
  },
  {
    headline: 'Spot Ethereum ETF trading volume reaches new monthly high',
    summary: 'Trading volume for spot Ethereum ETFs hit a new monthly record of $12 billion, reflecting growing institutional demand for ETH exposure.',
    sentiment: 'bullish',
    sentimentVal: 0.71,
    relevance: 0.89,
    tags: ['ETH-USD'],
    lagMinutes: 35,
  },
  {
    headline: 'Solana DeFi ecosystem surpasses $10B in total value locked',
    summary: 'The Solana decentralized finance ecosystem crossed $10 billion in total value locked for the first time, driven by new protocols and liquid staking growth.',
    sentiment: 'bullish',
    sentimentVal: 0.62,
    relevance: 0.86,
    tags: ['SOL-USD'],
    lagMinutes: 50,
  },
];

// Map source names to their simulated feed arrays
const SIM_FEEDS: Record<SourceName, SimFeedItem[]> = {
  reuters: SIM_REUTERS,
  coindesk: SIM_COINDESK,
  cointelegraph: SIM_COINTELEGRAPH,
};

// ─── Hash Functions ───────────────────────────────────────────────────────────

/**
 * Deterministic hash for dedup fingerprinting.
 * Uses DJB2 (simple, fast, deterministic).
 */
export function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Create a deterministic fingerprint for a news item.
 */
export function newsFingerprint(
  source: SourceName,
  headline: string,
  timestamp: string
): string {
  const raw = `${source}|${headline.trim().toLowerCase()}|${timestamp}`;
  return djb2Hash(raw);
}

// ─── RSS Simulator ────────────────────────────────────────────────────────────

export interface RSSFetchOptions {
  source: SourceName;
  /** Simulated "now" — pass same timestamp for deterministic output */
  now: Date;
  /** Optional market filter */
  marketId?: string;
}

export interface RSSFetchResult {
  signals: NewsSignal[];
  source: SourceName;
  fetchedAt: string;
  itemCount: number;
  cached: boolean;
  error?: string;
}

/**
 * Simulated RSS feed fetch. Replace with real HTTP fetch for live mode.
 */
export function fetchRSSFeed(opts: RSSFetchOptions): RSSFetchResult {
  const { source, now, marketId } = opts;
  const config = SOURCE_CONFIGS[source];
  const fetchedAt = now.toISOString();

  // Validate source is an RSS source
  if (config.type !== 'rss') {
    return {
      signals: [],
      source,
      fetchedAt,
      itemCount: 0,
      cached: false,
      error: `Source "${source}" is not an RSS feed (type: ${config.type})`,
    };
  }

  const feed = SIM_FEEDS[source];
  if (!feed) {
    return {
      signals: [],
      source,
      fetchedAt,
      itemCount: 0,
      cached: false,
      error: `No feed data configured for source "${source}"`,
    };
  }

  // Build signals from feed items, applying age and relevance filters
  const signals: NewsSignal[] = [];

  for (const item of feed) {
    // Calculate item's "published" time
    const publishedAt = new Date(now.getTime() - item.lagMinutes * 60_000);

    // Age check: discard if too old
    const ageMs = now.getTime() - publishedAt.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours > MAX_ITEM_AGE_HOURS) {
      continue;
    }

    // Market filter
    if (marketId && !item.tags.includes(marketId)) {
      continue;
    }

    // Map sentiment label to numeric
    let sentiment: number;
    if (item.sentiment === 'bullish') {
      sentiment = item.sentimentVal;
    } else if (item.sentiment === 'bearish') {
      sentiment = item.sentimentVal; // already negative
    } else {
      sentiment = 0;
    }

    // Evidence tags
    const tags: EvidenceTag[] = item.tags.map((t) => t as EvidenceTag);

    // Freshness factor for confidence adjustment
    const freshnessFactor = Math.max(0, 1 - ageHours / FRESHNESS_WINDOW_HOURS);

    // Final confidence: base_confidence * freshness * relevance
    const confidence = parseFloat(
      (config.baseConfidence * freshnessFactor * item.relevance).toFixed(4)
    );

    const signal: NewsSignal = {
      source,
      sourceType: 'rss',
      headline: item.headline,
      summary: item.summary,
      url: `${config.endpoint}#${newsFingerprint(source, item.headline, publishedAt.toISOString())}`,
      publishedAt: publishedAt.toISOString(),
      fetchedAt,
      sentiment,
      sentimentLabel: item.sentiment,
      relevance: item.relevance,
      confidence,
      tags,
      fingerprint: newsFingerprint(source, item.headline, publishedAt.toISOString()),
    };

    signals.push(signal);
  }

  return {
    signals,
    source,
    fetchedAt,
    itemCount: signals.length,
    cached: false,
  };
}

// ─── Aggregate Fetch (all RSS sources) ───────────────────────────────────────

export interface AllRSSResult {
  signals: NewsSignal[];
  bySource: Record<SourceName, RSSFetchResult>;
  fetchedAt: string;
  totalItems: number;
}

export function fetchAllRSSFeeds(
  now: Date,
  marketId?: string
): AllRSSResult {
  const rssSources: SourceName[] = ['reuters', 'coindesk', 'cointelegraph'];
  const bySource: Record<string, RSSFetchResult> = {};
  const allSignals: NewsSignal[] = [];

  for (const source of rssSources) {
    const result = fetchRSSFeed({ source, now, marketId });
    bySource[source] = result;
    allSignals.push(...result.signals);
  }

  return {
    signals: allSignals,
    bySource,
    fetchedAt: now.toISOString(),
    totalItems: allSignals.length,
  };
}

// ─── Testing Helpers ─────────────────────────────────────────────────────────

/**
 * Verify output determinism: two calls with same timestamp should match.
 */
export function assertDeterministic(): boolean {
  const now = new Date('2026-05-05T12:00:00Z');
  const result1 = fetchAllRSSFeeds(now, 'BTC-USD');
  const result2 = fetchAllRSSFeeds(new Date('2026-05-05T12:00:00Z'), 'BTC-USD');

  const json1 = JSON.stringify(result1);
  const json2 = JSON.stringify(result2);

  if (json1 !== json2) {
    console.error('NON-DETERMINISTIC: RSS feed results differ for same timestamp');
    return false;
  }

  console.log(`✓ RSS deterministic: ${result1.totalItems} items across 3 sources`);
  return true;
}
