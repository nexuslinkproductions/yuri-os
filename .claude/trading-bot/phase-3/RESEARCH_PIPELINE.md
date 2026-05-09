# Trading Bot — Phase 3: Research Pipeline

**Status:** Architecture & Specification  
**Date:** 2026-05-05  
**Purpose:** Evidence collection, source aggregation, consensus/dissent analysis

---

## Overview

Research pipeline collects market-relevant information from multiple sources, deduplicates, scores source credibility, and produces consensus/dissent summaries for ensemble input.

```
News Feeds (Reuters, CoinDesk, etc.)
Social (X/Twitter, Reddit)
Market Data (Volume spikes, anomalies)
  ↓
Fetch & Parse
  ↓
Deduplicate
  ↓
Score Source Confidence
  ↓
Aggregate Timeline
  ↓
Extract Consensus/Dissent
  ↓
Output: evidence_packet.jsonl
```

---

## Data Sources

### Tier-1: News (High Confidence)
- Reuters crypto news feed
- CoinDesk
- The Block
- Cointelegraph (institutional news)

### Tier-2: Social (Medium Confidence)
- X/Twitter (verified accounts, @CoinDesk, @Reuters)
- Reddit r/cryptocurrency (upvoted posts)

### Tier-3: Market Data (Auto-detected)
- Unusual volume spikes (>2σ)
- Price discontinuities (>5% hourly)
- Liquidation cascades

---

## Source Confidence Scoring

| Source Type | Outlet | Confidence | Decay |
|------------|--------|-----------|--------|
| News | Reuters | 0.95 | 24h half-life |
| News | CoinDesk | 0.90 | 24h half-life |
| Social | Verified accounts | 0.70 | 12h half-life |
| Social | Reddit (upvoted) | 0.60 | 8h half-life |
| Market | Volume spike | 0.80 | 4h half-life |

**Freshness Decay:** `confidence_t = confidence_0 * 0.5^(hours_old / half_life)`

---

## Evidence Packet Schema

**File Format:** `evidence_packet.jsonl` (append-only)

```json
{
  "market_id": "BTC-USD",
  "sources": [
    {
      "url": "https://reuters.com/...",
      "outlet_type": "news",
      "headline": "Bitcoin reaches new high",
      "timestamp": "2026-05-05T10:00:00Z",
      "confidence": 0.95,
      "initial_confidence": 0.95
    }
  ],
  "event_timeline": [
    {
      "time": "2026-05-05T10:00:00Z",
      "event": "Major fund announces Bitcoin position",
      "impact": "bullish"
    }
  ],
  "consensus_summary": "Institutional adoption continuing, supply constraints supportive",
  "dissent_summary": "Some analysts warn of overvaluation at current levels",
  "freshness_flags": ["stable", "diverse_sources"],
  "quality_score": 0.85,
  "timestamp": "2026-05-05T12:34:56.789Z"
}
```

---

## Deduplication Logic

**Identify duplicates if:**
- Same headline (cosine similarity > 0.85 on embeddings)
- Same URL
- Same event reported by multiple sources within 30 minutes

**Keep:** First source, highest confidence
**Discard:** Subsequent duplicates

---

## Consensus/Dissent Extraction

**Consensus:** When ≥70% of sources agree on sentiment direction  
**Dissent:** When 10-30% of sources disagree  
**Conflicted:** When sources split 40-60%

**Algorithm:**
```
1. Classify each source by sentiment (bullish, bearish, neutral)
2. Weight by source confidence
3. Aggregate: sum(confidence * sentiment_value)
4. Normalize: result / total_confidence
5. If > 0.3: bullish consensus
6. If < -0.3: bearish consensus
7. Else: conflicted/neutral
```

---

## Freshness Flags

Add to evidence packet:

- ✅ `stable` — consistent narrative over past 24h
- ⚠️ `old_evidence` — all sources > 12h old
- ⚠️ `low_diversity` — all sources from same outlet type
- ⚠️ `contradictory` — severe dissent (40-60 split)
- ⚠️ `rumor` — only social sources, no news confirmation

---

## Implementation: evidence-collector.mjs

**Location:** `Scripts/trading-bot/evidence-collector.mjs`

**Interface:**
```typescript
async function collectEvidence(
  marketId: string,
  lookbackHours: number = 24
): Promise<EvidencePacket>

async function fetchNewsFeeds(): Promise<NewsItem[]>
async function fetchSocialSignals(): Promise<SocialPost[]>
async function deduplicateSources(sources: Source[]): Source[]
async function extractConsensus(sources: Source[]): string
function scoreConfidence(source: Source, ageHours: number): number
```

**Error handling:**
- Network timeout → log and continue with available sources
- Parse error → skip malformed item
- Rate limiting → implement backoff with jitter
- Never fail entire collection on partial source failure

**Output validation:**
- Evidence packet matches schema
- All timestamps ISO 8601
- Confidence scores 0-1 range
- Quality score calculated correctly

---

## Testing & Validation

- [ ] Collect evidence for 5 markets, verify output format
- [ ] Check deduplication removes exact duplicates
- [ ] Verify consensus extraction matches manual review
- [ ] Test freshness decay calculations
- [ ] Confirm no API credentials in logs

---

## Next: Phase 4 Ensemble Inference

Output from research pipeline feeds into multi-model probability aggregation.
