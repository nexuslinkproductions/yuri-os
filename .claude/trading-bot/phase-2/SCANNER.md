# Trading Bot — Phase 2: Market Discovery & Scanner

**Status:** Architecture  
**Date:** 2026-05-05  
**Venue:** Coinbase Advanced Trade

---

## Market Discovery Pipeline

```
Fetch All Products (Coinbase API)
  ↓
Normalize Market Data
  ↓
Compute Features (liquidity, spread, volatility)
  ↓
Apply Filters (spread, volume, liquidity)
  ↓
Output: Candidate List
```

---

## Data Ingestion

### Source: Coinbase Advanced Trade API

**Endpoint:** `GET /products`

**Normalized Market Snapshot Schema:**
```json
{
  "market_id": "BTC-USD",
  "platform": "coinbase",
  "symbol": "BTC-USD",
  "last_price": 42500.50,
  "best_bid": 42498.00,
  "best_ask": 42502.00,
  "spread": 4.00,
  "spread_bps": 0.94,
  "volume_24h": 1250000.00,
  "timestamp": "2026-05-05T12:34:56.789Z",
  "status": "active"
}
```

**Polling:** Every 60 seconds (adjustable)

**Storage:** Append-only log: `.claude/trading-bot/data/market_snapshots.jsonl`

---

## Feature Scoring

Compute for each market:

| Feature | Formula | Range | Threshold |
|---------|---------|-------|-----------|
| **Liquidity Score** | (volume_24h / max_volume) * spread_quality | 0-1 | ≥ 0.3 |
| **Spread Score** | 1 - (spread_bps / 100) | 0-1 | ≥ 0.8 (spread < 20bps) |
| **Volatility Score** | recent_std_dev / historical_avg | 0-1 | 0.3-0.9 |
| **Execution Feasibility** | 1 - (est_slippage / position_size) | 0-1 | ≥ 0.85 |

**Composite Score:** `0.4 * liquidity + 0.2 * spread + 0.2 * volatility + 0.2 * execution`

---

## Candidate Selection Filters

**Hard Gates (All must pass):**

- ✅ Spread ≤ 25 basis points
- ✅ Volume (24h) ≥ $500k
- ✅ Status = `active`
- ✅ Composite Feature Score ≥ 0.5

**Soft Flags (Logged but non-blocking):**

- ⚠ Composite score 0.3-0.5: "marginal liquidity"
- ⚠ Spread 20-25 bps: "wider spread"
- ⚠ Volume < $1M: "lower volume"

---

## Output: Candidate Markets

**Schema:** `candidate_features.jsonl`

```json
{
  "market_id": "BTC-USD",
  "symbol": "BTC-USD",
  "composite_score": 0.74,
  "is_candidate": true,
  "liquidity_score": 0.95,
  "spread_bps": 0.94,
  "volatility_score": 0.62,
  "execution_feasibility_score": 0.88,
  "timestamp": "2026-05-05T12:34:56.789Z",
  "filter_rejection_reason": null
}
```

---

## Scanner Implementation

**Script:** `Scripts/trading-bot/scanner.mjs`

**Usage:**
```bash
# Single scan
node Scripts/trading-bot/scanner.mjs --once

# Continuous polling (60s interval)
node Scripts/trading-bot/scanner.mjs --daemon

# Parse & rank candidates
node Scripts/trading-bot/scanner.mjs --candidates --limit 10
```

---

## Validation Checklist

- [ ] Scanner runs reliably for ≥ 3 consecutive days
- [ ] Zero timeouts or network errors
- [ ] Snapshots saved to jsonl (append-only, not overwrite)
- [ ] Same input produces same ranked output (deterministic)
- [ ] Feature scores valid (0-1 range)
- [ ] Candidate lists stable (no spurious churn)
- [ ] Parse errors logged (not silently dropped)

---

## Next Phase

→ **Phase 3: Research Pipeline**

Build evidence packet generator for each candidate market.
