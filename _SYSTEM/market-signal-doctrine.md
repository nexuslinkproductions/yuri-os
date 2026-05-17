# Market Signal Doctrine — Yuri OS

## Overview

Signal aggregation layer for market intelligence. Read-only signal detection — no order execution, no private key handling, no exchange account authentication.

**Feed Aggregator:** `http://localhost:4201` (REST API backend)

---

## Data Sources

| Source | Type | Auth | Endpoint | Interval |
|--------|------|------|----------|----------|
| DEX Screener | REST | None | `token-profiles/latest/v1` | 30s |
| Hyperliquid | REST + WS | None (read) | `api.hyperliquid.xyz/info` | 15s |
| Whale Alert | REST | API key | `api.whale-alert.io/v1/transactions` | 60s |
| Binance Announcements | RSS | None | `binance.com/en/support/announcement/rss` | Manual |
| Bybit Announcements | RSS | None | `announcements.bybit.com/en/rss/` | Manual |
| **Coinbase Advanced Trade** | **REST + WS** | **API key + Secret** | **api.coinbase.com** | **Lane T2** |

### DEX Screener API
- **Profiles endpoint:** `https://api.dexscreener.com/token-profiles/latest/v1`
- **Search endpoint:** `https://api.dexscreener.com/latest/dex/search?q={tokenAddress}`
- **Filter parameters:**
  - Pair age: < 86,400 seconds (24 hours)
  - Liquidity: > $10,000 USD
  - 1h volume spike: > 200% vs prior 1h average
- No authentication required

### Hyperliquid API
- **Info endpoint:** `https://api.hyperliquid.xyz/info` (POST)
- **Payload:** `{"type": "metaAndAssetCtxs"}`
- **Fields extracted:** `funding`, `markPx`, `oi` for each asset
- No authentication required for read access
- **WebSocket:** `wss://api.hyperliquid.xyz/ws` (reserved for future real-time use)

### Whale Alert API
- **Endpoint:** `https://api.whale-alert.io/v1/transactions`
- **Parameters:** `api_key`, `min_value=500000`, `limit=10`
- Free tier: 10 requests per minute
- **Requires:** `WHALE_ALERT_API_KEY` environment variable
- Graceful degradation: if env var absent, feed logs warning and returns empty

### Coinbase Advanced Trade API (Lane T2 — Scaffolded)
- **Endpoint:** `https://api.coinbase.com` (REST)
- **WebSocket:** `wss://advanced-trade-ws.coinbase.com` (reserved)
- **Requires:** `COINBASE_API_KEY` + `COINBASE_API_SECRET` environment variables
- **Current status:** `501 Not Implemented` — endpoint stubbed in feed-aggregator
- Designated CEX connector for all future CEX integration needs

---

## Feed Aggregator Architecture

**Service:** `_SYSTEM/Scripts/feeds/feed-aggregator.mjs`
**Port:** `127.0.0.1:4201`
**Dependencies:** Node.js built-in `http` module only
**CORS:** `Access-Control-Allow-Origin: *` on all responses

| Route | Method | Description |
|-------|--------|-------------|
| `/health` | GET | Service health, uptime, feed statuses |
| `/feeds/dex` | GET | Latest DEX new pairs matching filters |
| `/feeds/funding` | GET | Top 20 perps by absolute funding rate |
| `/feeds/whale` | GET | Recent whale transactions > $500k |
| `/feeds/coinbase` | GET | **501 Not Implemented** — Lane T2 stub |

---

## Signal Interpretation Rules

### Funding Rate Signals

| Condition | Signal | Interpretation |
|-----------|--------|---------------|
| Funding rate > +0.10% | SHORT_BIAS | Longs crowded, short bias expected |
| Funding rate < -0.10% | LONG_BIAS | Shorts crowded, long bias expected |
| Between -0.10% and +0.10% | NEUTRAL | No clear directional bias |

### Whale Transaction Classification

| Type | Interpretation |
|------|---------------|
| `EXCHANGE_DEPOSIT` | Tokens moving TO exchange — potential sell pressure |
| `EXCHANGE_WITHDRAWAL` | Tokens moving FROM exchange — potential accumulation |
| `EXCHANGE_TO_EXCHANGE` | Arbitrage or cross-exchange positioning |
| `TRANSFER` | Wallet-to-wallet, non-exchange — neutral |

---

## Update Intervals

| Feed | Interval | Rationale |
|------|----------|-----------|
| DEX Screener | 30 seconds | New pairs are time-sensitive but rate limits apply |
| Hyperliquid Funding | 15 seconds | Funding rates change slowly; 15s balances freshness vs load |
| Whale Alert | 60 seconds | Free tier limit (10 req/min) |
| Aggregator Health | 15 seconds | Quick detection of aggregator outage |

---

## API Key Requirements

| Service | Key Required | Env Variable | Tier Needed |
|---------|-------------|-------------|-------------|
| DEX Screener | No | — | Free, no auth |
| Hyperliquid (read) | No | — | Free, no auth |
| Hyperliquid (trading) | Yes | `HL_PRIVATE_KEY` | Lane T2 only |
| Whale Alert | Yes | `WHALE_ALERT_API_KEY` | Free tier: 10 req/min |
| Binance (read) | Optional | `BINANCE_API_KEY` | Free |
| Arkham | No | — | Free public feed |
| Coinbase Advanced Trade | Yes | `COINBASE_API_KEY` + `COINBASE_API_SECRET` | Lane T2 |

**Doctrine:** All API keys must be stored in `.env` only. Never hardcoded. Never committed to git.

---

## Execution Lane Prerequisites

### Lane T2 — Exchange Integration (Read-Only)
- [ ] Feed aggregator running stably for 7+ days with < 1% error rate
- [ ] Coinbase Advanced Trade API credentials provisioned and tested
- [ ] `HL_PRIVATE_KEY` stored in `.env` only (never in code)
- [ ] WebSocket connection to Hyperliquid established for account data

### Lane T3 — Momentum Scanner
- [ ] Lane T2 complete (needs live price data)
- [ ] RSI, volume/mcap, on-chain composite scoring operational

### Lane T4 — Funding Rate Arbitrage Detection
- [ ] Lane T2 + Binance API key scaffold complete
- [ ] Cross-exchange funding rate delta monitor operational
- [ ] Alert threshold: delta > 0.05% between Hyperliquid and Binance perps

### Lane T5 — Automation Engine (Order Execution)
- [ ] All prior T lanes complete and stable
- [ ] Marcel manual trading history reviewed for strategy patterns
- [ ] Paper trading mode verified for 30+ days
- [ ] Explicit written approval from Marcel to enable live execution

---

## Doctrine Principles

1. **Read before you trade.** Signals must be trusted before any execution lane opens.
2. **Graceful degradation over crashes.** Every feed handles its own failure silently.
3. **No key in code, ever.** Environment variables only. Missing key = disabled feed, never throw.
4. **Signal ≠ trade.** All trade decisions remain manual until Lane T5 is approved.
5. **Audit trail.** Every signal must be traceable to a raw API response.
6. **Coinbase is the designated CEX connector.** Reserved `/feeds/coinbase` endpoint as 501 stub.

---

## Files

| File | Purpose |
|------|---------|
| `_SYSTEM/Scripts/feeds/dex-feed.mjs` | DEX Screener new pairs poller, filters, normalizes output |
| `_SYSTEM/Scripts/feeds/hl-funding.mjs` | Hyperliquid funding rate monitor, top 20 by abs rate |
| `_SYSTEM/Scripts/feeds/whale-feed.mjs` | Whale Alert REST poller + Coinbase env var scaffold |
| `_SYSTEM/Scripts/feeds/feed-aggregator.mjs` | Lightweight HTTP server on port 4201, caches and serves feed data |

All feeds log with the prefix `⬡ MARKET_SIGNAL ::` for consistent ingestion by Yuri OS monitoring.
