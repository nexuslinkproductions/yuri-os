# Trading Bot — Phase 5: Risk Engine

**Status:** Architecture & Specification  
**Date:** 2026-05-05  
**Purpose:** Deterministic risk gates, Kelly position sizing, drawdown/loss halts, execution approval

---

## Overview

Risk engine enforces deterministic gates before trade execution. All decisions are reproducible, logged, and reversible via kill-switch.

```
Prediction Result + Market Conditions + Portfolio State
  ↓
Apply Data Freshness Gate (≤60s old)
  ↓
Apply Liquidity Gate (volume ≥$500k, spread ≤25bps)
  ↓
Apply Net Edge Gate (≥4% after fees/slippage)
  ↓
Apply Confidence Gate (confidence ≥0.60, dispersion ≤0.08)
  ↓
Calculate Kelly-Sized Position (quarter-Kelly, 5% bankroll cap)
  ↓
Apply Concentration Gate (max 3 positions, ≤15% total)
  ↓
Apply Drawdown Gate (halt if underwater >8%)
  ↓
Apply Daily Loss Gate (halt if lost >15% today)
  ↓
Apply Kill-Switch Override (manual arm required)
  ↓
Output: risk_decision.jsonl
```

---

## Risk Gates (Deterministic, All Must Pass)

### 1. Data Freshness Gate
**Rule:** Market snapshot timestamp must be ≤60 seconds old  
**Formula:** `now - snapshot_timestamp ≤ 60000 ms`  
**Failure reason:** `GATE_FAILED_DATA_STALE`

### 2. Liquidity Gate
**Rule:** Volume ≥$500k AND spread ≤25 basis points  
**Formula:**
```
volume_24h >= 500000 AND spread_bps <= 25
```
**Failure reason:** `GATE_FAILED_LIQUIDITY_INSUFFICIENT`

### 3. Net Edge Gate
**Rule:** Risk-adjusted probability edge ≥4% after accounting for fees, slippage, and market friction  
**Formula:**
```
net_edge = (p_model - p_market) - (flat_fee_rate + slippage_bps/10000)
```
Where:
- `p_model` = ensemble probability (0-1)
- `p_market` = implied market probability from current price (0-1)
- `flat_fee_rate` = Coinbase taker fee (~0.005 = 0.5%)
- `slippage_bps` = worst-case slippage in basis points (estimated 10-20 bps for this market)

**Example:**
```
p_model = 0.65
p_market = 0.58 (implied from mid-price relative to target)
flat_fee = 0.005
slippage = 0.0015
net_edge = (0.65 - 0.58) - (0.005 + 0.0015) = 0.0635 = 6.35%
PASS (≥4%)
```

**Failure reason:** `GATE_FAILED_EDGE_INSUFFICIENT`

### 4. Confidence Gate
**Rule:** Ensemble confidence ≥0.60 AND model disagreement (dispersion) ≤0.08  
**Formula:**
```
confidence >= 0.60 AND dispersion <= 0.08
```
**Rationale:** High confidence + low disagreement = robust prediction  
**Failure reason:** `GATE_FAILED_CONFIDENCE_LOW` or `GATE_FAILED_DISPERSION_HIGH`

### 5. Kelly Sizing Gate
**Rule:** Calculate quarter-Kelly position size; cap at 5% of bankroll  
**Formula:**
```
raw_kelly = (edge * odds - 1) / odds
quarter_kelly = raw_kelly / 4
position_size = min(quarter_kelly * bankroll, 0.05 * bankroll)
```

Where:
- `edge` = net_edge (as decimal, e.g., 0.06 for 6%)
- `odds` = market odds (2.0 for binary yes/no, derived from p_model)
- `bankroll` = current available capital

**Example (assuming $100 bankroll):**
```
edge = 0.06 (6%)
odds = 2.0
raw_kelly = (0.06 * 2.0 - 1) / 2.0 = 0.02 = 2%
quarter_kelly = 0.02 / 4 = 0.005 = 0.5%
position_size = min(0.005 * 100, 5) = $0.50
```

**Output:** `kelly_allocation` (position size in USD)

### 6. Concentration Gate
**Rule:** Max 3 concurrent open positions AND total exposure ≤15% of bankroll  
**Formula:**
```
open_position_count <= 3 AND (sum_of_all_position_sizes / bankroll) <= 0.15
```
**Failure reason:** `GATE_FAILED_CONCENTRATION_EXCEEDED`

### 7. Drawdown Halt Gate
**Rule:** If portfolio is underwater by >8%, reject all new trades until reset  
**Formula:**
```
current_equity = bankroll - cumulative_losses
drawdown_pct = (initial_bankroll - current_equity) / initial_bankroll
if drawdown_pct > 0.08: REJECT
```
**Reset condition:** Manual reset or end-of-week refresh (Sunday UTC)  
**Failure reason:** `GATE_FAILED_DRAWDOWN_HALT`

### 8. Daily Loss Halt Gate
**Rule:** If total loss today (calendar day UTC) >15%, reject all new trades  
**Formula:**
```
daily_loss = sum of all losses (realized + unrealized) since midnight UTC
daily_loss_pct = daily_loss / bankroll
if daily_loss_pct > 0.15: REJECT
```
**Reset condition:** Automatic at midnight UTC  
**Failure reason:** `GATE_FAILED_DAILY_LOSS_HALT`

### 9. Kill-Switch Override Gate
**Rule:** Manual override flag must be ARMED for any trade execution  
**Formula:**
```
if kill_switch_armed == false: REJECT
```
**Rationale:** Prevents accidental or automated execution without human acknowledgment  
**Failure reason:** `GATE_FAILED_KILL_SWITCH_DISARMED`

---

## Risk Decision Schema

**File Format:** `risk_decision.jsonl` (append-only)

```json
{
  "trade_id": "550e8400-e29b-41d4-a716-446655440000",
  "market_id": "BTC-USD",
  "decision": "APPROVE",
  "gates_passed": [
    "DATA_FRESHNESS",
    "LIQUIDITY",
    "NET_EDGE",
    "CONFIDENCE",
    "KELLY_SIZING",
    "CONCENTRATION",
    "DRAWDOWN",
    "DAILY_LOSS",
    "KILL_SWITCH"
  ],
  "gates_failed": [],
  "risk_assessment": {
    "edge_pct": 6.35,
    "kelly_raw": 2.0,
    "kelly_quarter": 0.5,
    "kelly_allocation_usd": 0.50,
    "position_size_usd": 0.50,
    "confidence_score": 0.78,
    "dispersion": 0.024,
    "current_equity": 100.00,
    "drawdown_pct": 0.00,
    "daily_loss_usd": 0.00,
    "open_positions": 1,
    "total_exposure_pct": 0.50
  },
  "timestamp": "2026-05-05T12:34:56.789Z"
}
```

---

## Conditional Reject Example

```json
{
  "trade_id": "550e8400-e29b-41d4-a716-446655440001",
  "market_id": "ETH-USD",
  "decision": "REJECT",
  "gates_passed": ["DATA_FRESHNESS", "LIQUIDITY"],
  "gates_failed": [
    {
      "gate": "NET_EDGE",
      "reason": "Insufficient edge: 1.5% < 4% minimum",
      "actual": 0.015,
      "threshold": 0.04
    }
  ],
  "risk_assessment": {
    "edge_pct": 1.5,
    "kelly_raw": -0.7,
    "kelly_quarter": -0.175,
    "kelly_allocation_usd": 0.0,
    "position_size_usd": 0.0,
    "confidence_score": 0.62,
    "dispersion": 0.09,
    "current_equity": 100.00,
    "drawdown_pct": 0.00,
    "daily_loss_usd": 0.00,
    "open_positions": 1,
    "total_exposure_pct": 0.50
  },
  "timestamp": "2026-05-05T12:40:00.000Z"
}
```

---

## Implementation: risk-engine.mjs

**Location:** `Scripts/trading-bot/risk-engine.mjs`

**Interface:**
```typescript
async function evaluateRiskDecision(
  marketId: string,
  predictionResult: PredictionResult,
  marketSnapshot: MarketSnapshot,
  portfolioState: PortfolioState
): Promise<RiskDecision>

function checkDataFreshness(snapshotTimestamp: number): boolean
function checkLiquidity(volume: number, spreadBps: number): boolean
function calculateNetEdge(
  pModel: number,
  pMarket: number,
  flatFeeRate: number,
  slippageBps: number
): number

function calculateKellySize(
  edge: number,
  odds: number,
  bankroll: number,
  kellyFraction: number = 0.25
): number

function checkConcentration(
  openPositions: number,
  totalExposureRatio: number
): boolean

function checkDrawdownHalt(
  currentEquity: number,
  initialEquity: number,
  haltThreshold: number = 0.08
): boolean

function checkDailyLossHalt(
  dailyLoss: number,
  bankroll: number,
  haltThreshold: number = 0.15
): boolean

function checkKillSwitch(killSwitchArmed: boolean): boolean

async function generateRiskReport(
  trades: RiskDecision[],
  outcomes: TradeOutcome[]
): Promise<RiskReport>
```

**Error Handling:**
- Gate failure → log reason code, reject trade, continue
- Portfolio state error → fail safely with REJECT
- Timestamp parse error → use current time, note in decision
- Zero-division protection → all division operations guarded

**Output Validation:**
- Decision = APPROVE or REJECT
- All gate reasons must be in predefined set
- Position size ≤ 5% bankroll
- Edge ≥ 4% only if APPROVE
- Timestamps ISO 8601

---

## Risk Reporting

**Generated every 10 trades:**

```markdown
# Risk Report — 2026-05-05

## Gate Performance
- Data Freshness: 45/45 ✅
- Liquidity: 44/45 (1 failed)
- Net Edge: 40/45 (5 failed)
- Confidence: 43/45 (2 failed)
- Concentration: 45/45 ✅
- Drawdown: 45/45 ✅
- Daily Loss: 45/45 ✅
- Kill-Switch: 45/45 ✅

## Position Sizing
- Average Kelly allocation: 0.47% of bankroll
- Max position: 1.2% of bankroll
- Total exposure after 45 trades: 3.2% bankroll

## Risk Incidents
- 2 days with trades stopped by confidence gate
- 0 drawdown halts
- 0 daily loss halts

## Calibration Status
- Expected approval rate: 85% (observed 88%)
- Expected avg position: 0.5% (observed 0.47%)
- Issues: None
```

---

## Next: Phase 6 Execution Engine

Risk decisions feed into order lifecycle, idempotent submission, and audit trail logging.
