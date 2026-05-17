/**
 * ⬡ YURI_TRADING :: tradingHudBridge.ts
 *
 * Data fetch bridge between the Trading HUD React components and the
 * backend proxy routes on :3004 (which in turn proxy to feed-aggregator :4201).
 *
 * All higher layers (useFeedPolling, panels) talk only to this module,
 * so caching, debouncing, and fallback logic can be added here later
 * without touching UI code.
 */

import { apiFetch } from './runtime';

// ── Response Types (proxied from feed-aggregator shapes) ──────────────

export interface DexPair {
  chainId: string;
  pairAddress: string;
  baseToken: string;
  quoteToken: string;
  priceUsd: number;
  liquidity: number;
  volume1h: number;
  volumeSpikePct: number;
  age: number;
  dex: string;
  url: string;
}

export interface DexFeedResponse {
  feed: string;
  status: string;
  count: number;
  lastUpdated: string;
  pairs: DexPair[];
}

export interface FundingAsset {
  asset: string;
  index: number;
  markPx: number;
  fundingRate: number;
  funding8h: number;
  openInterest: number;
  signal: 'SHORT_BIAS' | 'LONG_BIAS' | 'NEUTRAL';
  signalEmoji: string;
}

export interface FundingFeedResponse {
  feed: string;
  status: string;
  count: number;
  lastUpdated: string;
  assets: FundingAsset[];
}

export interface WhaleTransaction {
  id: string;
  timestamp: string | null;
  blockchain: string;
  symbol: string;
  amount: number;
  amountUsd: number;
  fromAddress: string;
  fromOwner: string;
  toAddress: string;
  toOwner: string;
  hash: string;
  type: string;
}

export interface WhaleFeedResponse {
  feed: string;
  status: string;
  count: number;
  lastUpdated: string;
  transactions: WhaleTransaction[];
}

export interface HealthResponse {
  status: string;
  service: string;
  uptime: number;
  feeds: {
    dex: string;
    funding: string;
    whale: string;
    coinbase: string;
  };
  coinbaseEnv: {
    keySet: boolean;
    secretSet: boolean;
    ready: boolean;
  };
}

export interface AllFeedsResponse {
  dex: DexFeedResponse;
  funding: FundingFeedResponse;
  whale: WhaleFeedResponse;
  health: HealthResponse;
  ts: string;
}

// ── API Functions ─────────────────────────────────────────────────────

export async function fetchDexFeed(): Promise<DexFeedResponse> {
  const res = await apiFetch('/api/trading/feeds/dex');
  if (!res.ok) throw new Error(`DEX ${res.status}`);
  return res.json();
}

export async function fetchFundingFeed(): Promise<FundingFeedResponse> {
  const res = await apiFetch('/api/trading/feeds/funding');
  if (!res.ok) throw new Error(`FUNDING ${res.status}`);
  return res.json();
}

export async function fetchWhaleFeed(): Promise<WhaleFeedResponse> {
  const res = await apiFetch('/api/trading/feeds/whale');
  if (!res.ok) throw new Error(`WHALE ${res.status}`);
  return res.json();
}

export async function fetchAllFeeds(): Promise<AllFeedsResponse> {
  const res = await apiFetch('/api/trading/feeds/all');
  if (!res.ok) throw new Error(`ALL ${res.status}`);
  return res.json();
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await apiFetch('/api/trading/health');
  if (!res.ok) throw new Error(`HEALTH ${res.status}`);
  return res.json();
}

// ── Phase 2: Scored Signals ────────────────────────────────────────────

export interface ScoredDexPair {
  token: string; chainId: string; dex: string; age: number;
  priceUsd: number; liquidity: number; volume1h: number;
  volumeSpikePct: number;
  subScores: { volumeSpike: number; liquidity: number; ageFreshness: number };
  score: number; confidence: 'LOW'|'MEDIUM'|'HIGH';
  urgency: 'CRITICAL'|'ELEVATED'|'WATCH'|'NEUTRAL';
  source: 'dex'; signals: string[];
}

export interface ScoredFundingAsset {
  token: string; markPx: number; fundingRate: number; funding8h: number;
  openInterest: number; signalBias: string;
  subScores: { rateBias: number; openInterest: number };
  score: number; confidence: 'LOW'|'MEDIUM'|'HIGH';
  urgency: 'CRITICAL'|'ELEVATED'|'WATCH'|'NEUTRAL';
  source: 'funding'; signals: string[];
}

export interface ScoredWhaleTransaction {
  id: string; token: string; blockchain: string; amountUsd: number;
  fromOwner: string; toOwner: string; type: string; timestamp: string|null;
  subScores: { amountMagnitude: number; accumulationSignal: number };
  score: number; confidence: 'LOW'|'MEDIUM'|'HIGH';
  urgency: 'CRITICAL'|'ELEVATED'|'WATCH'|'NEUTRAL';
  source: 'whale'; signals: string[];
}

export interface MergedSignal {
  token: string; sources: string[]; sourceCount: number;
  aggregateScore: number; maxConfidence: 'LOW'|'MEDIUM'|'HIGH';
  urgency: 'CRITICAL'|'ELEVATED'|'WATCH'|'NEUTRAL';
  topSignals: string[];
  evidence: string[];
  sourceSet: string[];
}

export interface SignalReport {
  ts: string;
  summary: {
    totalDexSignals: number; totalFundingSignals: number;
    totalWhaleSignals: number; mergedTokens: number;
    criticalCount: number; elevatedCount: number;
  };
  topMerged: MergedSignal[];
}

export async function fetchSignals(): Promise<SignalReport> {
  const res = await apiFetch('/api/trading/signals');
  if (!res.ok) throw new Error(`SIGNALS ${res.status}`);
  return res.json();
}

export async function fetchMergedSignals(): Promise<{ ts: string; summary: SignalReport['summary']; signals: MergedSignal[] }> {
  const res = await apiFetch('/api/trading/signals/merged');
  if (!res.ok) throw new Error(`MERGED ${res.status}`);
  return res.json();
}
