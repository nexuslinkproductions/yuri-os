# Trading Bot — Phase 6: Execution Engine

**Status:** Architecture & Specification  
**Date:** 2026-05-05  
**Purpose:** Deterministic order submission, idempotent operations, Coinbase API integration, audit trails

---

## Overview

Execution engine submits approved trades to Coinbase Advanced Trade API with full idempotency and audit trail.

```
Risk Decision (APPROVE)
  ↓
Generate Order (deterministic ID)
  ↓
Submit to Coinbase (POST /orders)
  ↓
Poll Order Status
  ↓
Record Execution Event
  ↓
Output: execution_event.jsonl
```

---

## Idempotent Order Submission

**Problem:** Network failures can cause duplicate submissions. Solution: deterministic client order IDs (idempotency keys).

**Formula:**
```
client_order_id = sha256(
  trade_id + market_id + side + size + price + timestamp_bucket(5s)
)
```

**Coinbase Integration:**
```
POST /api/v1/brokerage/orders

{
  "client_order_id": "550e8400-e29b-41d4-a716-446655440000",
  "product_id": "BTC-USD",
  "order_configuration": {
    "limit_limit_gtc": {
      "base_size": "0.00500",
      "limit_price": "42500.50",
      "post_only": false
    }
  },
  "order_type": "LIMIT",
  "side": "BUY",
  "time_in_force": "GOOD_UNTIL_CANCELLED"
}
```

**Idempotency Guarantee:**
- Same `client_order_id` within 24h → Coinbase returns existing order, no duplicate
- Re-submission after network error → safe, automatic deduplication

---

## Order Lifecycle

### States
1. **PENDING** — Order submitted, awaiting confirmation
2. **OPEN** — Order live on exchange, waiting for fill
3. **FILLED** — Completely filled at target price
4. **PARTIALLY_FILLED** — Partially filled, waiting for rest
5. **CANCELLED** — User or bot cancelled
6. **FAILED** — Order rejected by exchange

### Polling Strategy
```
For each order:
  - Poll every 2 seconds for first 30 seconds (order confirmation phase)
  - Poll every 10 seconds for next 5 minutes (active phase)
  - Poll every 60 seconds for rest of day (trailing phase)
  - Stop polling after 24 hours (order expires)
```

### Exit Conditions
- Order filled completely → record EXECUTION_COMPLETE
- Order cancelled by user → record CANCELLED
- 24h timeout → cancel order, record TIMEOUT
- Cumulative fill ≥ desired size → cancel remainder, record PARTIAL_FILLED

---

## Execution Event Schema

**File Format:** `execution_event.jsonl` (append-only)

```json
{
  "execution_id": "550e8400-e29b-41d4-a716-446655440001",
  "trade_id": "550e8400-e29b-41d4-a716-446655440000",
  "market_id": "BTC-USD",
  "client_order_id": "550e8400-e29b-41d4-a716-446655440000",
  "exchange_order_id": "12345-67890",
  "side": "BUY",
  "status": "FILLED",
  "order_type": "LIMIT",
  "requested_size_usd": 0.50,
  "requested_price": 42500.50,
  "filled_size_btc": 0.0000118,
  "filled_size_usd": 0.502,
  "average_fill_price": 42542.50,
  "fill_events": [
    {
      "sequence": 1,
      "timestamp": "2026-05-05T12:34:58.000Z",
      "size_btc": 0.0000118,
      "price": 42542.50
    }
  ],
  "fees_usd": 0.0025,
  "net_cost_usd": 0.5045,
  "slippage_bps": 10,
  "rejection_reason": null,
  "submitted_at": "2026-05-05T12:34:56.789Z",
  "first_fill_at": "2026-05-05T12:34:57.500Z",
  "completed_at": "2026-05-05T12:34:58.000Z",
  "total_latency_ms": 1211,
  "exchange_latency_ms": 744,
  "bot_latency_ms": 467
}
```

---

## Error Handling

### API Errors
- 400 Bad Request → log, reject trade, continue
- 401 Unauthorized → HALT, check credentials
- 403 Forbidden → HALT, check permissions
- 429 Too Many Requests → exponential backoff (2s, 4s, 8s), max 3 retries
- 500+ Server Error → backoff, max 5 retries over 30 seconds

### Network Errors
- Timeout on submission → check order with client_order_id, proceed
- Timeout on polling → mark as "pending verification", retry polling next batch
- Connection refused → exponential backoff, max 5 retries

### Execution Failures
- Insufficient funds → HALT, alert user
- Market closed → REJECT, retry after market open
- Price moved >10% → REJECT, re-evaluate (potential flash crash)
- Order rejected by exchange → log rejection reason, classify as failure type C

---

## Implementation: execution-engine.mjs

**Location:** `Scripts/trading-bot/execution-engine.mjs`

**Interface:**
```typescript
async function submitOrder(
  riskDecision: RiskDecision,
  marketSnapshot: MarketSnapshot
): Promise<ExecutionEvent>

async function pollOrderStatus(
  exchangeOrderId: string,
  clientOrderId: string
): Promise<ExecutionEvent>

function calculateDeterministicClientOrderId(
  tradeId: string,
  marketId: string,
  side: string,
  size: number,
  price: number
): string

async function cancelOrder(
  exchangeOrderId: string
): Promise<ExecutionEvent>

function recordExecutionEvent(
  executionEvent: ExecutionEvent
): void

async function generateExecutionReport(
  events: ExecutionEvent[],
  startTime: Date,
  endTime: Date
): Promise<ExecutionReport>
```

**Coinbase Auth:**
```typescript
const authHeaders = {
  'CB-ACCESS-KEY': process.env.COINBASE_API_KEY,
  'CB-ACCESS-SIGN': cryptoSignature,
  'CB-ACCESS-TIMESTAMP': Math.floor(Date.now() / 1000),
  'CB-ACCESS-PASSPHRASE': process.env.COINBASE_API_PASSPHRASE
};
```

**Error Validation:**
- All order IDs validated (non-empty, >8 chars)
- All prices > 0
- All sizes > 0
- Timestamps ISO 8601
- No null execution IDs

---

## Audit Trail

Every execution event is immutable (append-only JSONL). Full history:
- Request payload
- Response status + latency
- Fill events with exact prices
- Fees and slippage
- Rejection reasons

Enables post-mortem analysis and failure classification (Phase 7).

---

## Next: Phase 7 Paper Trading Validation

Execution events feed into post-mortem classification and Brier Score calibration.
