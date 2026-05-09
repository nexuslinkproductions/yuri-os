/**
 * Phase 3 Social Sentiment Collector
 * Simulated X/Twitter and Reddit social sentiment aggregation.
 * Deterministic — seed-based generation with swappable API connectors.
 */

import type { SocialSignal } from './types.ts';
import type { SocialSourceConfig } from './source-config.ts';

// ── Seedable PRNG (deterministic) ──────────────────────────────────────────

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Time-bucketed seed (deterministic per 5-min bucket) ────────────────────

function timeBucketSeed(base: string, windowSeconds: number = 300): number {
  const now = Date.now();
  const bucket = Math.floor(now / (windowSeconds * 1000));
  const str = `${base}:${bucket}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// ── Sentiment lexicon: keyword → sentiment_map ─────────────────────────────

const ASSET_KEYWORDS: Record<string, string[]> = {
  'BTC-USD': [
    'bitcoin', 'btc', '#bitcoin', '#btc', 'satoshi', 'digital gold',
    'hashrate', 'halving', 'ordinals', 'lightning network',
  ],
  'ETH-USD': [
    'ethereum', 'eth', '#ethereum', '#eth', 'vitalik', 'layer 2',
    'merge', 'eigenlayer', 'rollups', 'lido', 'staking',
  ],
  'SOL-USD': [
    'solana', 'sol', '#solana', '#sol', 'firedancer', 'phantom',
    'jupiter', 'pyth', 'wormhole', 'validators',
  ],
};

const BULLISH_PHRASES: string[] = [
  'bullish', 'moon', 'long', 'breakout', 'pump', 'buy', 'accumulation',
  'institutional', 'etf', 'adoption', 'partnership', 'upgrade',
  'ATH', 'new highs', 'rally', 'green', 'support held',
];

const BEARISH_PHRASES: string[] = [
  'bearish', 'dump', 'short', 'crash', 'sell', 'distribution',
  'regulation', 'sec', 'crackdown', 'hack', 'exploit', 'depeg',
  'liquidation', 'resistance', 'rejected', 'red',
];

const NEUTRAL_PHRASES: string[] = [
  'consolidation', 'range', 'sideways', 'support', 'resistance',
  'volume', 'open interest', 'funding rate', 'technical',
];

// ── Simulated mention generators ───────────────────────────────────────────

interface SimMention {
  platform: 'twitter' | 'reddit';
  text: string;
  sentiment: number; // -1 to 1
  reach: number; // estimated impressions
  timestamp: Date;
}

function sentiment(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of BULLISH_PHRASES) {
    if (lower.includes(w)) score += 0.25;
  }
  for (const w of BEARISH_PHRASES) {
    if (lower.includes(w)) score -= 0.25;
  }
  return Math.max(-1, Math.min(1, score));
}

function generateMentions(
  asset: string,
  count: number,
  seed: number,
): SimMention[] {
  const rng = mulberry32(seed);
  const keywords = ASSET_KEYWORDS[asset] ?? [asset.toLowerCase()];
  const platforms: Array<'twitter' | 'reddit'> = ['twitter', 'reddit'];
  const mentions: SimMention[] = [];

  const allPhrases = [...BULLISH_PHRASES, ...BEARISH_PHRASES, ...NEUTRAL_PHRASES];

  for (let i = 0; i < count; i++) {
    const platform = platforms[Math.floor(rng() * platforms.length)];
    const kw = keywords[Math.floor(rng() * keywords.length)];
    const phrase1 = allPhrases[Math.floor(rng() * allPhrases.length)];
    const phrase2 = allPhrases[Math.floor(rng() * allPhrases.length)];

    const templates = [
      `${kw} looking ${phrase1} today`,
      `${phrase1} on ${kw} — ${phrase2} setup forming`,
      `Just analyzed ${kw}: ${phrase1} signals with ${phrase2} confirmation`,
      `${kw} update: ${phrase1} momentum, watching ${phrase2}`,
      `${phrase1} ${kw} thread 🧵 ${phrase2}`,
    ];

    const text = templates[Math.floor(rng() * templates.length)];
    const s = sentiment(text);
    // Add noise
    const noisySentiment = s + (rng() - 0.5) * 0.4;
    const reach = Math.floor(rng() * 50000) + 100;

    mentions.push({
      platform,
      text,
      sentiment: Math.max(-1, Math.min(1, noisySentiment)),
      reach,
      timestamp: new Date(Date.now() - Math.floor(rng() * 3600_000)), // last hour
    });
  }

  return mentions;
}

// ── Reddit subreddit simulator ─────────────────────────────────────────────

interface RedditPost {
  title: string;
  selftext: string;
  upvotes: number;
  num_comments: number;
  upvote_ratio: number;
  created_utc: number;
}

function generateRedditPosts(asset: string, count: number, seed: number): RedditPost[] {
  const rng = mulberry32(seed);
  const keywords = ASSET_KEYWORDS[asset] ?? [asset.toLowerCase()];
  const subreddits = ['CryptoCurrency', 'Bitcoin', 'ethereum', 'solana'];
  const posts: RedditPost[] = [];

  for (let i = 0; i < count; i++) {
    const kw = keywords[Math.floor(rng() * keywords.length)];
    const sub = subreddits[Math.floor(rng() * subreddits.length)];
    const bullish_r = rng();
    const mood = bullish_r > 0.6 ? 'bullish' : bullish_r > 0.3 ? 'neutral' : 'bearish';

    const titles: Record<string, string[]> = {
      bullish: [
        `${kw} accumulation at these levels is a no-brainer`,
        `Why ${kw} is about to rip: technical breakdown`,
        `${kw} institutional flows hitting records`,
        `Bull case for ${kw} strengthening`,
      ],
      neutral: [
        `${kw} daily discussion thread`,
        `${kw} support and resistance levels for this week`,
        `Technical analysis: ${kw} at key inflection point`,
        `${kw} on-chain metrics mixed`,
      ],
      bearish: [
        `Warning signs for ${kw} holders`,
        `${kw} facing headwinds from macro`,
        `Is ${kw} distribution happening?`,
        `${kw} — reasons to be cautious`,
      ],
    };

    const title = titles[mood][Math.floor(rng() * titles[mood].length)];
    const upvotes = Math.floor(rng() * 2000) + 5;
    posts.push({
      title,
      selftext: `Discussion about ${kw} market conditions.`,
      upvotes,
      num_comments: Math.floor(rng() * 500) + 1,
      upvote_ratio: rng() * 0.3 + 0.7,
      created_utc: Math.floor(Date.now() / 1000) - Math.floor(rng() * 7200),
    });
  }

  return posts;
}

// ── Aggregate social signals ───────────────────────────────────────────────

function aggregateMentions(
  asset: string,
  mentions: SimMention[],
  redditPosts: RedditPost[],
): { twitter_signal: SocialSignal; reddit_signal: SocialSignal } {
  // Twitter aggregation
  const twMentions = mentions.filter(m => m.platform === 'twitter');
  const twSentiments = twMentions.map(m => m.sentiment);
  const twWeights = twMentions.map(m => Math.log10(m.reach + 1));
  const twWeightedSentiment = twSentiments.length > 0
    ? twSentiments.reduce((sum, s, i) => sum + s * twWeights[i], 0) /
      twWeights.reduce((a, b) => a + b, 0)
    : 0;

  const twitter_signal: SocialSignal = {
    source: 'twitter',
    mention_count: twMentions.length,
    sentiment_aggregate: parseFloat(twWeightedSentiment.toFixed(4)),
    confidence: 0.55,
    top_terms: twMentions.slice(0, 3).map(m => m.text.split(' ').slice(0, 3).join(' ')),
    timestamp: new Date().toISOString(),
  };

  // Reddit aggregation
  const redSentiments = redditPosts.map(p => {
    const lower = (p.title + ' ' + p.selftext).toLowerCase();
    let s = 0;
    for (const w of BULLISH_PHRASES) if (lower.includes(w)) s += 0.3;
    for (const w of BEARISH_PHRASES) if (lower.includes(w)) s -= 0.3;
    return Math.max(-1, Math.min(1, s));
  });
  const redWeights = redditPosts.map(p => Math.log10(p.upvotes + p.num_comments + 2));
  const redWeighted = redSentiments.length > 0
    ? redSentiments.reduce((sum, s, i) => sum + s * redWeights[i], 0) /
      redWeights.reduce((a, b) => a + b, 0)
    : 0;

  const reddit_signal: SocialSignal = {
    source: 'reddit',
    mention_count: redditPosts.length,
    sentiment_aggregate: parseFloat(redWeighted.toFixed(4)),
    confidence: 0.50,
    top_terms: redditPosts.slice(0, 3).map(p => p.title.split(' ').slice(0, 4).join(' ')),
    timestamp: new Date().toISOString(),
  };

  return { twitter_signal, reddit_signal };
}

// ── Main collector function ────────────────────────────────────────────────

export interface SocialCollectResult {
  twitter_signal: SocialSignal;
  reddit_signal: SocialSignal;
  fetched_at: string;
  rate_limit_ok: boolean;
}

export function collectSocialSentiment(
  asset: string,
  configs: SocialSourceConfig[],
): SocialCollectResult {
  const seed = timeBucketSeed(`social:${asset}`, 300);

  // Twitter/X
  const twitterConfig = configs.find(c => c.source === 'twitter')!;
  const twMentionCount = Math.floor(mulberry32(seed + 1)() * 40) + 5;

  // Reddit
  const redditConfig = configs.find(c => c.source === 'reddit')!;
  const redditPostCount = Math.floor(mulberry32(seed + 2)() * 25) + 3;

  // Generate deterministic content
  const mentions = generateMentions(asset, twMentionCount, seed + 3);
  const redditPosts = generateRedditPosts(asset, redditPostCount, seed + 4);

  const { twitter_signal, reddit_signal } = aggregateMentions(asset, mentions, redditPosts);

  return {
    twitter_signal,
    reddit_signal,
    fetched_at: new Date().toISOString(),
    rate_limit_ok: true,
  };
}

// ── Swappable real API connector stub ──────────────────────────────────────

export async function fetchTwitterRealtime(
  asset: string,
  bearerToken: string,
): Promise<SocialSignal> {
  // Real implementation:
  // const res = await fetch(
  //   `https://api.twitter.com/2/tweets/search/recent?query=${asset}&max_results=100`,
  //   { headers: { Authorization: `Bearer ${bearerToken}` } }
  // );
  // return parseTwitterResponse(await res.json());
  console.warn(`[twitter] Real API not configured for ${asset} — using simulation`);
  const result = collectSocialSentiment(asset, []);
  return result.twitter_signal;
}

export async function fetchRedditRealtime(
  asset: string,
  clientId: string,
): Promise<SocialSignal> {
  // Real implementation:
  // const res = await fetch(
  //   `https://oauth.reddit.com/r/CryptoCurrency/search?q=${asset}&sort=new&limit=100`,
  //   { headers: { Authorization: `Bearer ${accessToken}` } }
  // );
  // return parseRedditResponse(await res.json());
  console.warn(`[reddit] Real API not configured for ${asset} — using simulation`);
  const result = collectSocialSentiment(asset, []);
  return result.reddit_signal;
}
