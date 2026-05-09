/**
 * Phase 3: Research Pipeline — Type Definitions
 * Deterministic evidence packet collection and scoring for crypto markets.
 */

// ── Source Identifiers ──────────────────────────────────────────────
export type SourceId = 'reuters' | 'coindesk' | 'cointelegraph' | 'x_twitter' | 'reddit';

export const RSS_SOURCES: SourceId[] = ['reuters', 'coindesk', 'cointelegraph'];
export const SOCIAL_SOURCES: SourceId[] = ['x_twitter', 'reddit'];
export const ALL_SOURCES: SourceId[] = [...RSS_SOURCES, ...SOCIAL_SOURCES];

// ── Source Confidence Base ──────────────────────────────────────────
export const SOURCE_CONFIDENCE_BASE: Record<SourceId, number> = {
  reuters: 0.85,
  coindesk: 0.80,
  cointelegraph: 0.75,
  x_twitter: 0.55,
  reddit: 0.50,
};

// ── Historical Accuracy Tracking ────────────────────────────────────
export interface SourceAccuracyRecord {
  source: SourceId;
  brier_score: number;       // lower = better
  adjustment: number;        // -0.10 to +0.05
  samples: number;
  last_updated: string;
}

export function brierAdjustment(brierScore: number): number {
  if (brierScore <= 0.20) return +0.05;
  if (brierScore <= 0.30) return 0.00;
  if (brierScore <= 0.40) return -0.05;
  return -0.10;
}

// ── News Signal ─────────────────────────────────────────────────────
export interface NewsSignal {
  source: SourceId;
  headline: string;
  summary: string;
  url: string;
  sentiment: number;        // -1.0 (bearish) to +1.0 (bullish)
  relevance: number;        // 0.0 to 1.0 (to target asset)
  confidence: number;       // adjusted source confidence
  published_at: string;     // ISO 8601
  fetched_at: string;       // ISO 8601
}

// ── Social Signal ───────────────────────────────────────────────────
export interface SocialSignal {
  source: SourceId;
  platform: 'x' | 'reddit';
  mention_count: number;
  sentiment_aggregate: number;  // -1.0 to +1.0
  top_terms: string[];
  confidence: number;
  fetched_at: string;
}

// ── Consensus / Dissent ─────────────────────────────────────────────
export type MarketDirection = 'bullish' | 'bearish' | 'neutral';

export interface ConsensusSummary {
  direction: MarketDirection;
  strength: number;          // 0.0 to 1.0
  key_themes: string[];
  source_count: number;
  agreeing_sources: SourceId[];
}

export interface DissentSummary {
  counter_themes: string[];
  dissenter_count: number;
  dissenter_weight: number;  // proportion of total confidence
  dissenting_sources: SourceId[];
}

// ── Freshness Flags ─────────────────────────────────────────────────
export interface FreshnessFlags {
  score: number;             // 0.0 to 1.0, decays with age
  oldest_source_age_hours: number;
  newest_source_age_hours: number;
  is_stale: boolean;         // any source > 24h
  is_expired: boolean;       // all sources > 72h → discard
  staleness_detail: Record<SourceId, number>;  // age hours per source
}

// ── Evidence Packet (output) ────────────────────────────────────────
export interface EvidencePacket {
  evidence_id: string;       // sha256(content hash)
  market_id: string;
  timestamp: string;         // ISO 8601, packet creation

  sources: SourceId[];       // all sources contributed
  news_signals: NewsSignal[];
  social_signals: SocialSignal[];

  consensus_summary: ConsensusSummary;
  dissent_summary: DissentSummary;

  aggregate_confidence: number;  // 0.0 to 1.0
  freshness_flags: FreshnessFlags;
  research_quality: number;      // 0.0 to 1.0

  is_duplicate: boolean;
}

// ── Pipeline Config ─────────────────────────────────────────────────
export interface ResearchPipelineConfig {
  rss_cache_ttl_ms: number;       // default 60_000 (60s)
  social_cache_ttl_ms: number;    // default 300_000 (300s)
  freshness_max_hours: number;    // default 24
  freshness_expire_hours: number; // default 72
  consensus_threshold: number;    // default 0.6 (to call direction)
  dissent_min_weight: number;     // default 0.10
  output_path: string;
}

export const DEFAULT_CONFIG: ResearchPipelineConfig = {
  rss_cache_ttl_ms: 60_000,
  social_cache_ttl_ms: 300_000,
  freshness_max_hours: 24,
  freshness_expire_hours: 72,
  consensus_threshold: 0.6,
  dissent_min_weight: 0.10,
  output_path: '.claude/trading-bot/data/evidence_packet.jsonl',
};

// ── Candidate Input (from Phase 2) ──────────────────────────────────
export interface CandidateFeatures {
  market_id: string;
  symbol: string;
  liquidity_score: number;
  urgency_score: number;
  volatility_score: number;
  execution_feasibility_score: number;
  composite_score: number;
  is_candidate: boolean;
  filter_rejection_reason: string | null;
  timestamp: string;
}
