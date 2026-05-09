# Trading Bot — Phase 3: Research Pipeline

**Status:** Architecture  
**Date:** 2026-05-05  
**Input:** Candidate markets from Phase 2 scanner  
**Output:** Evidence packets for ensemble inference

---

## Research Pipeline Architecture

```
Phase 2 Scanner Output (candidate_features.jsonl)
  │
  ├─→ News/RSS Ingester (Reuters, CoinDesk, CoinTelegraph)
  │     ├─ Fetch RSS feeds
  │     ├─ Parse headlines, summaries, timestamps
  │     └─ Tag: market, asset, sentiment_signal
  │
  ├─→ Social Sentiment Collector (X/Twitter, Reddit)
  │     ├─ Query social APIs for asset mentions
  │     ├─ Aggregate sentiment metrics
  │     └─ Rate-limit: max 1 query per 5 min per asset
  │
  ├─→ Source Confidence Scorer
  │     ├─ Per-source reliability ratings
  │     ├─ Historical accuracy tracking
  │     └─ Freshness-weighted decay
  │
  └─→ Deduplication + Freshness Engine
        ├─ Content hash dedup
        ├─ Staleness flagging (>24h = stale)
        └─ Write evidence_packet.jsonl
```

---

## Decision Tree for Research Collection

```
START: Candidate market received
  │
  ├─ Has news data been fetched in last 60s?
  │   YES → Use cached news
  │   NO  → Fetch RSS feeds
  │
  ├─ Has social data been fetched in last 300s?
  │   YES → Use cached social
  │   NO  → Query social APIs
  │
  ├─ Are all sources fresh? (≤ 24h)
  │   YES → freshness = 1.0
  │   NO  → freshness = max(0, 1 - age_hours/24)
  │
  ├─ Is this a duplicate evidence packet?
  │   YES → Skip (log dedup)
  │   NO  → Continue
  │
  └─ Build evidence packet
      ├─ Consensus summary
      ├─ Dissent summary
      ├─ Source scores
      └─ Write to evidence_packet.jsonl
END
```

---

## Data Sources

### Primary Sources

| Source | Type | Endpoint | Rate Limit | Confidence Base |
|--------|------|----------|------------|-----------------|
| Reuters | RSS | reuters.com/news/rss | 1 req/60s | 0.85 |
| CoinDesk | RSS | coindesk.com/arc/outboundfeeds/news | 1 req/60s | 0.80 |
| CoinTelegraph | RSS | cointelegraph.com/rss | 1 req/60s | 0.75 |
| X/Twitter | API | api.twitter.com/2/tweets/search | 1 req/300s | 0.55 (noisy) |
| Reddit | API | reddit.com/r/cryptocurrency/.json | 1 req/300s | 0.50 (noisy) |

### Confidence Adjustment Formula

```
source_confidence = base_confidence 
  * freshness_factor 
  * historical_accuracy 
  * (1 - noise_penalty)
```

---

## Evidence Packet Schema

```json
{
  "evidence_id": "hash(content + timestamp)",
  "market_id": "BTC-USD",
  "timestamp": "2026-05-05T12:34:56.789Z",
  
  "news_signals": [
    {
      "source": "reuters",
      "headline": "...",
      "sentiment": 0.65,
      "relevance": 0.90,
      "timestamp": "...",
      "confidence": 0.85
    }
  ],
  
  "social_signals": [
    {
      "source": "twitter",
      "mention_count": 1500,
      "sentiment_aggregate": 0.58,
      "confidence": 0.55
    }
  ],
  
  "consensus_summary": {
    "direction": "bullish",
    "strength": 0.72,
    "key_themes": ["institutional adoption", "ETF inflows"],
    "source_count": 5
  },
  
  "dissent_summary": {
    "counter_themes": ["regulatory uncertainty"],
    "dissenter_count": 1,
    "dissenter_weight": 0.15
  },
  
  "aggregate_confidence": 0.78,
  "freshness_score": 0.95,
  "is_duplicate": false,
  "research_quality": 0.81
}
```

---

## Source Confidence Scoring

### Per-Source Reliability

| Source | Base | Historical Adj. | Final Weight |
|--------|------|-----------------|--------------|
| Reuters | 0.85 | ±0.05 | 0.80-0.90 |
| CoinDesk | 0.80 | ±0.05 | 0.75-0.85 |
| CoinTelegraph | 0.75 | ±0.05 | 0.70-0.80 |
| X/Twitter | 0.55 | ±0.10 | 0.45-0.65 |
| Reddit | 0.50 | ±0.10 | 0.40-0.60 |

### Historical Accuracy Tracking

Each source tracks Brier Score against actual market moves:
- Score ≤ 0.20 → boost (+0.05)
- Score 0.20-0.30 → neutral (+0.00)
- Score 0.30-0.40 → penalty (-0.05)
- Score > 0.40 → severe penalty (-0.10)

---

## Deduplication

### Content Hash

```
hash = sha256(headline + source + timestamp_day)
```

If hash matches existing packet → mark as duplicate, skip write.

### Freshness Flagging

```
if age > 24h: stale, freshness = max(0, 1 - (age_hours - 24) / 48)
if age > 72h: discard entirely (too stale)
```

---

## Output

**File:** `.claude/trading-bot/data/evidence_packet.jsonl`

**Retention:** 30 days rolling

**Usage:** Fed into Phase 4 Ensemble Inference as context

---

## Validation Checklist

- [ ] RSS feeds fetch reliably (handle 404s, timeouts)
- [ ] Social APIs rate-limited correctly
- [ ] Deduplication catches >95% of repeats
- [ ] Freshness flags accurate
- [ ] Evidence packets contain consensus AND dissent
- [ ] Source confidence scores in valid ranges
- [ ] Pipeline runs idempotent (same input = same output)

---

## Next Phase

→ **Phase 4: Ensemble Inference**

Multi-model probability aggregation using evidence packets.
