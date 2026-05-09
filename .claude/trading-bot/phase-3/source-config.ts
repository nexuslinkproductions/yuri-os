/**
 * Phase 3 — Source Configuration
 * 
 * Per-source reliability ratings, rate limits, confidence bases.
 * All values deterministic and derived from RESEARCH.md architecture spec.
 */

import type { SourceConfig, SourceHistoricalTrack } from './types';

// ---------------------------------------------------------------------------
// Historical accuracy tracking (Brier Score based)
// ---------------------------------------------------------------------------

export const SOURCE_HISTORICAL: Record<string, SourceHistoricalTrack> = {
  reuters: {
    brier_score: 0.18,       // ≤ 0.20 → boost
    adjustment: +0.05,
    sample_size: 847,
    last_updated: '2026-05-01T00:00:00.000Z',
  },
  coindesk: {
    brier_score: 0.22,       // 0.20–0.30 → neutral
    adjustment: 0.00,
    sample_size: 623,
    last_updated: '2026-05-01T00:00:00.000Z',
  },
  cointelegraph: {
    brier_score: 0.26,       // 0.20–0.30 → neutral
    adjustment: 0.00,
    sample_size: 481,
    last_updated: '2026-05-01T00:00:00.000Z',
  },
  twitter: {
    brier_score: 0.34,       // 0.30–0.40 → penalty
    adjustment: -0.05,
    sample_size: 2156,
    last_updated: '2026-05-01T00:00:00.000Z',
  },
  reddit: {
    brier_score: 0.38,       // 0.30–0.40 → penalty
    adjustment: -0.05,
    sample_size: 1432,
    last_updated: '2026-05-01T00:00:00.000Z',
  },
};

// ---------------------------------------------------------------------------
// Per-source configuration
// ---------------------------------------------------------------------------

export const SOURCE_CONFIGS: Record<string, SourceConfig> = {
  reuters: {
    id: 'reuters',
    name: 'Reuters',
    type: 'rss',
    base_confidence: 0.85,
    rate_limit_ms: 60_000,
    endpoints: [
      'https://www.reuters.com/news/rss',
      'https://www.reuters.com/technology/crypto/rss',
    ],
    noise_penalty: 0.05,
    freshness_weight: 0.15,
  },
  coindesk: {
    id: 'coindesk',
    name: 'CoinDesk',
    type: 'rss',
    base_confidence: 0.80,
    rate_limit_ms: 60_000,
    endpoints: [
      'https://www.coindesk.com/arc/outboundfeeds/news',
    ],
    noise_penalty: 0.08,
    freshness_weight: 0.15,
  },
  cointelegraph: {
    id: 'cointelegraph',
    name: 'CoinTelegraph',
    type: 'rss',
    base_confidence: 0.75,
    rate_limit_ms: 60_000,
    endpoints: [
      'https://cointelegraph.com/rss',
    ],
    noise_penalty: 0.10,
    freshness_weight: 0.15,
  },
  twitter: {
    id: 'twitter',
    name: 'X/Twitter',
    type: 'social',
    base_confidence: 0.55,
    rate_limit_ms: 300_000,
    endpoints: [
      'https://api.twitter.com/2/tweets/search/recent',
    ],
    noise_penalty: 0.25,
    freshness_weight: 0.30,
  },
  reddit: {
    id: 'reddit',
    name: 'Reddit',
    type: 'social',
    base_confidence: 0.50,
    rate_limit_ms: 300_000,
    endpoints: [
      'https://www.reddit.com/r/CryptoCurrency/.json',
      'https://www.reddit.com/r/Bitcoin/.json',
      'https://www.reddit.com/r/ethereum/.json',
    ],
    noise_penalty: 0.30,
    freshness_weight: 0.30,
  },
};

// ---------------------------------------------------------------------------
// Freshness thresholds (from RESEARCH.md)
// ---------------------------------------------------------------------------

export const FRESHNESS_CONFIG = {
  /** Articles older than this (hours) begin decaying */
  fresh_threshold_hours: 6,
  /** Articles older than this (hours) are marked stale */
  stale_threshold_hours: 24,
  /** Articles older than this (hours) are discarded entirely */
  discard_threshold_hours: 72,
  /** Decay window after stale: freshness = max(0, 1 - (age - 24) / 48) */
  decay_window_hours: 48,
};

// ---------------------------------------------------------------------------
// Compute final source confidence
// ---------------------------------------------------------------------------

export function computeSourceConfidence(sourceId: string): number {
  const cfg = SOURCE_CONFIGS[sourceId];
  const hist = SOURCE_HISTORICAL[sourceId];
  if (!cfg || !hist) return 0.0;

  // formula: base * freshness_factor * historical_accuracy * (1 - noise_penalty)
  // freshness_factor is applied per-packet, here we compute the static multiplier
  const historical_multiplier = 1.0 + hist.adjustment;
  const noise_multiplier = 1.0 - cfg.noise_penalty;

  const raw = cfg.base_confidence * historical_multiplier * noise_multiplier;
  return clamp(raw, 0.0, 1.0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** All RSS source IDs */
export const RSS_SOURCE_IDS = ['reuters', 'coindesk', 'cointelegraph'];

/** All social source IDs */
export const SOCIAL_SOURCE_IDS = ['twitter', 'reddit'];

/** All source IDs */
export const ALL_SOURCE_IDS = [...RSS_SOURCE_IDS, ...SOCIAL_SOURCE_IDS];
