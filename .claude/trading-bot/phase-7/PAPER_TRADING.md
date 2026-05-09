# Trading Bot — Phase 7: Paper Trading Validation

**Status:** Architecture & Specification  
**Date:** 2026-05-05  
**Purpose:** Validate full trading pipeline across 50+ paper trades, post-mortem every loss via failure taxonomy, compute Brier Score ≤0.20, sign-off before live rollout

---

## Overview

Phase 7 is the mandatory paper-trading gate before Phase 8 (live rollout). Every trade flows through the complete pipeline — scanner → research → ensemble prediction → risk engine → execution — but **no real capital is deployed**. All orders are submitted to Coinbase sandbox or simulated with live market data.

```
Market Data (Live) + Sandbox/Simulated Execution
  ↓
Phase 2: Scanner produces candidate list
  ↓
Phase 3: Research pipeline generates evidence packet
  ↓
Phase 4: Ensemble runs inference → prediction_result.jsonl
  ↓
Phase 5: Risk engine evaluates gates → risk_decision.jsonl
  ↓
Phase 6: Execution engine submits to sandbox → execution_event.jsonl
  ↓
Phase 7: Outcome analysis, post-mortem, Brier Score calibration → trade_outcome.jsonl
  ↓
Phase 7 Sign-Off: All metrics met → Phase 8 live rollout
```

---

## Paper Trading Rules

### Environment
- **Venue:** Coinbase Advanced Trade API **sandbox** (no real funds)
- **Data:** Live market data (real-time BTC-USD, ETH-USD, SOL-USD)
- **Execution:** Sandbox order submission OR simulated fills at market prices
- **Duration:** Minimum 50 completed trades (filled or cancelled/rejected)
- **Capital Simulation:** $100 virtual bankroll, identical risk rules to live

### Trade Lifecycle
| Phase | Action | Record |
|-------|--------|--------|
| 0 | Scanner identifies candidate | `candidate_features.jsonl` |
| 1 | Research packet generated | `evidence_packet.jsonl` |
| 2 | Ensemble prediction | `prediction_result.jsonl` |
| 3 | Risk decision | `risk_decision.jsonl` |
| 4 | Order submitted to sandbox | `execution_event.jsonl` |
| 5 | Order fills or cancels | `execution_event.jsonl` (updated) |
| 6 | Trade closes → outcome analysis | `trade_outcome.jsonl` |

### Simulated Execution Mode (Fallback)
If Coinbase sandbox is unavailable, simulate fills:
- **Limit orders:** Fill at limit price if market touches price within 5 minutes; otherwise, cancel
- **Market orders:** Fill at best bid/ask + estimated slippage (10 bps)
- **Slippage model:** `slippage_bps = 5 + (order_size_usd / 100) * 2` (capped at 25 bps)
- **Fee model:** Coinbase taker fee 0.5% (50 bps), applied on fill

---

## Outcome Analysis Pipeline

### Per-Trade Analysis (Every Close)

```
Execution Event (FILLED / CANCELLED / FAILED / TIMEOUT)
  ↓
Join: prediction_result, risk_decision, market_snapshot at open & close
  ↓
Calculate P&L (realized + fees)
  ↓
Determine Resolution (WIN / LOSS / SCRATCH)
  ↓
Compute Brier Score Contribution
  ↓
If LOSS → Classify using Failure Taxonomy (A/B/C/D)
  ↓
Append to trade_outcome.jsonl
```

### Win/Loss/Scratch Classification

| Resolution | Definition | P&L Range |
|-----------|-----------|-----------|
| **WIN** | P&L ≥ fee_cost | Positive after fees |
| **LOSS** | P&L < fee_cost | Negative or zero after fees |
| **SCRATCH** | P&L ≈ fee_cost (± 1bp) | Effectively zero |

---

## Failure Taxonomy (Mandatory for Every Loss)

From SCOPE_LOCK.md. Every losing trade must be classified into one of four failure types.

| Type | Name | Definition | Diagnostic | Mitigation |
|------|------|------------|------------|------------|
| **A** | Prediction Error | Model probability diverged from outcome; ensemble was confidently wrong | `abs(p_model - outcome) > 0.30` and `dispersion < 0.08` | Recalibrate ensemble weights; check evidence quality |
| **B** | Timing Error | Correct directional prediction but wrong entry/exit timing; slippage killed EV | `sign(p_model - 0.5) == sign(outcome - 0.5)` but `net_pnl < 0` and `slippage_bps > 20` | Tighter limit orders; time-in-force adjustments |
| **C** | Execution Error | Order management failure: partial fill race, rejection, timeout, fee surprise | `status` in `[FAILED, CANCELLED, TIMEOUT]` or `slippage_bps > 50` | Improve order lifecycle; pre-flight balance checks |
| **D** | External Shock | Market structure changed mid-trade: venue outage, flash crash, regulatory event | `abs(close_price - open_price) / open_price > 0.05` in <60s or exchange error code | Circuit breakers; venue redundancy |

### Classification Decision Tree

```
Trade is a LOSS
  ↓
1. Was the order rejected, cancelled, or timed out? → Type C
2. Did exchange report an error or outage? → Type D
3. Did price move >5% in <60 seconds during trade? → Type D
4. Was the directional prediction correct (p_model >0.5 and price went up, or vice versa)? → Type B
5. Was the prediction wrong (p_model >0.5 and price went down, etc.)? → Type A
6. Unclear → Type A (default: prediction responsibility)
```

### Post-Mortem Template

```markdown
## Trade #{trade_id} — Post-Mortem

### Summary
- Market: {market_id}
- Direction: {BUY/SELL}
- Entry: {entry_price} @ {entry_time}
- Exit: {exit_price} @ {exit_time}
- P&L: ${net_pnl} ({pnl_pct}%)
- Resolution: LOSS

### Failure Classification: Type {A/B/C/D}
- **Reason:** {diagnosis}

### Prediction Review
- p_model: {p_model} (confidence: {confidence}, dispersion: {dispersion})
- Actual outcome: {outcome_binary} ({price_change_pct}%)
- Brier contribution: {brier_contribution}

### Execution Review
- Status: {execution_status}
- Slippage: {slippage_bps} bps
- Fees: ${fees_usd}
- Latency: {total_latency_ms}ms

### Lessons Learned
- {actionable_lesson}
- {process_change}

### Sign-Off
- [ ] Reviewed by trader
- [ ] Process improvement logged
- [ ] Model feedback filed
```

---

## Brier Score Tracking

### Definition

The Brier Score measures probabilistic accuracy:

```
Brier = (1/N) * Σ (p_i - o_i)²
```

Where:
- `N` = number of trades
- `p_i` = model probability for trade i (0 to 1)
- `o_i` = actual outcome (1 for WIN, 0 for LOSS)

### Per-Trade Contribution

```
brier_contribution = (p_model - outcome_binary)²
```

**Example:**
- p_model = 0.65, outcome = WIN (1.0) → contribution = (0.65 - 1.0)² = 0.1225
- p_model = 0.72, outcome = LOSS (0.0) → contribution = (0.72 - 0.0)² = 0.5184
- p_model = 0.55, outcome = WIN (1.0) → contribution = (0.55 - 1.0)² = 0.2025

### Target
```
Brier Score ≤ 0.20 over 50+ trades
```

A Brier Score of 0.20 means:
- Average error of sqrt(0.20) ≈ 0.447 between prediction and outcome
- Equivalent to: predicting 0.70 when outcome is 0 (error 0.49) OR predicting 0.60 when outcome is 1 (error 0.16)
- Beats naive baseline of 0.25 (always predicting 0.50)

### Calibration Buckets (Brier by Confidence)

| Confidence Bin | Expected Avg Brier | Interpretation |
|---------------|-------------------|----------------|
| ≥ 0.80 | ≤ 0.10 | Strong calibration, predictions reliable |
| 0.70–0.80 | ≤ 0.15 | Good calibration, minor overconfidence |
| 0.60–0.70 | ≤ 0.20 | Acceptable, use caution |
| < 0.60 | ≤ 0.25 | Weak, avoid large positions |

---

## Cumulative Metrics Dashboard

Updated after every trade, appended to `PAPER_TRADING_JOURNAL.md`.

```markdown
# Paper Trading Dashboard — {date}

## Cumulative Stats
- Trades Completed: {N}
- Wins: {wins} ({win_rate_pct}%)
- Losses: {losses} ({loss_rate_pct}%)
- Scratches: {scratches}

## P&L
- Gross P&L: ${gross_pnl}
- Total Fees: ${total_fees}
- Net P&L: ${net_pnl}
- Return on Bankroll: {ror_pct}%
- Peak Equity: ${peak_equity}
- Max Drawdown: {max_drawdown_pct}%

## Probabilistic Accuracy
- Brier Score: {brier_score}
- Avg Confidence: {avg_confidence}
- Avg Dispersion: {avg_dispersion}

## Risk Metrics
- Sharpe Ratio (annualized): {sharpe}
- Avg Position Size: ${avg_position_size}
- Max Position Size: ${max_position_size}
- Avg Holding Period: {avg_hold_hours}h

## Failure Breakdown
- Type A (Prediction): {count_a} ({pct_a}%)
- Type B (Timing): {count_b} ({pct_b}%)
- Type C (Execution): {count_c} ({pct_c}%)
- Type D (External): {count_d} ({pct_d}%)

## Gate Performance
- Total Proposals: {total_proposals}
- Approved: {approved} ({approval_rate}%)
- Rejected: {rejected}
  - Net Edge: {rejected_edge}
  - Confidence: {rejected_conf}
  - Liquidity: {rejected_liq}
  - Concentration: {rejected_conc}
  - Drawdown: {rejected_dd}
  - Daily Loss: {rejected_dl}

## Launch Readiness
- [ ] ≥ 50 trades completed
- [ ] Brier Score ≤ 0.20
- [ ] Win Rate ≥ 55%
- [ ] Max Drawdown ≤ 8%
- [ ] Sharpe Ratio ≥ 1.2
- [ ] All losses have post-mortems
- [ ] No unclassified failures
- [ ] Calibration report generated
```

---

## Calibration Report (Every 10 Trades)

### Model-Level Brier Score

| Model | Brier Score | Rank | Trend |
|-------|------------|------|-------|
| Grok | 0.195 | 2 | ↓ improving |
| Claude | 0.185 | 1 | → stable |
| GPT-4o | 0.204 | 3 | ↑ worsening |
| Gemini | 0.218 | 4 | → stable |
| DeepSeek | 0.190 | 2 | ↓ improving |

### Dispersion-Brier Relationship

| Dispersion Bucket | Trades | Avg Brier | Expected | Status |
|------------------|--------|-----------|----------|--------|
| < 0.05 | 8 | 0.12 | ≤0.10 | ⚠️ Slightly high |
| 0.05–0.10 | 15 | 0.17 | ≤0.15 | ⚠️ Slightly high |
| 0.10–0.15 | 20 | 0.22 | ≤0.20 | ⚠️ Slightly high |
| > 0.15 | 7 | 0.30 | ≤0.25 | ❌ High |

### Confidence Calibration Check

For well-calibrated predictions: in the 0.70–0.80 confidence bin, ~70–80% of trades should be wins.

| Confidence Bin | Predicted Win% | Actual Win% | Status |
|---------------|----------------|-------------|--------|
| 0.60–0.70 | 60–70% | 63% | ✅ |
| 0.70–0.80 | 70–80% | 74% | ✅ |
| 0.80–0.90 | 80–90% | 81% | ✅ |

### Action Items

- If Brier > 0.20 after 30 trades: halt, investigate model drift, recalibrate weights
- If any bucket shows Brier > 0.30: flag that dispersion range for manual review
- If confidence bin actual < predicted by >10%: overconfidence detected, adjust calibration

---

## Launch Gates (Non-Negotiable)

All gates must be **green** before Phase 8 live rollout.

| Gate | Threshold | Current | Status |
|------|-----------|---------|--------|
| Minimum Trades | ≥ 50 | {N} | {✅/❌} |
| Brier Score | ≤ 0.20 | {brier} | {✅/❌} |
| Win Rate | ≥ 55% | {wr}% | {✅/❌} |
| Max Drawdown | ≤ 8% | {dd}% | {✅/❌} |
| Sharpe Ratio | ≥ 1.2 | {sr} | {✅/❌} |
| Post-Mortems | 100% of losses | {pm}% | {✅/❌} |
| Failure Classification | 100% | {fc}% | {✅/❌} |
| Calibration Report | Signed off | — | {✅/❌} |
| Manual Review | Trader sign-off | — | {✅/❌} |

---

## Paper Trading Journal

**File:** `paper_trading_journal.md` (maintained alongside trade outcomes)

Every trade gets a journal entry:

```markdown
## Trade #{N} — {market_id} | {date}

### Pre-Trade
- Confidence: {confidence}
- p_model: {p_model}
- Dispersion: {dispersion}
- Net Edge: {edge_pct}%
- Position: ${position_size} ({position_pct}% of bankroll)

### Execution
- Side: {BUY/SELL}
- Entry: ${entry_price}
- Size: {filled_size}
- Slippage: {slippage_bps} bps
- Fees: ${fees}

### Outcome
- Exit: ${exit_price}
- P&L: ${pnl} ({pnl_pct}%)
- Resolution: {WIN/LOSS/SCRATCH}
- Brier Contribution: {brier_contribution}

### Post-Mortem (if LOSS)
- Type: {A/B/C/D}
- Diagnosis: {reason}
- Lesson: {lesson}
```

---

## Implementation: outcome-analyzer.mjs

**Location:** `Scripts/trading-bot/outcome-analyzer.mjs`

### Interface

```typescript
async function analyzeTradeOutcome(
  executionEvent: ExecutionEvent,
  predictionResult: PredictionResult,
  riskDecision: RiskDecision,
  marketSnapshotOpen: MarketSnapshot,
  marketSnapshotClose: MarketSnapshot
): Promise<TradeOutcome>

function classifyResolution(
  netPnl: number,
  feeCost: number
): 'WIN' | 'LOSS' | 'SCRATCH'

function classifyFailure(
  outcome: TradeOutcome,
  executionEvent: ExecutionEvent,
  predictionResult: PredictionResult,
  marketSnapshotOpen: MarketSnapshot,
  marketSnapshotClose: MarketSnapshot
): FailureClassification

function computeBrierContribution(
  pModel: number,
  outcomeBinary: number
): number

function updateCumulativeMetrics(
  outcomes: TradeOutcome[]
): CumulativeMetrics

function generateCalibrationReport(
  outcomes: TradeOutcome[],
  predictions: PredictionResult[]
): CalibrationReport

async function generatePaperTradingReport(
  outcomes: TradeOutcome[],
  predictions: PredictionResult[],
  riskDecisions: RiskDecision[],
  executionEvents: ExecutionEvent[]
): Promise<PaperTradingReport>

function checkLaunchGates(
  report: PaperTradingReport
): LaunchGateStatus[]
```

### Error Handling
- Missing prediction for trade → use default p_model = 0.50, flag as UNKNOWN_PREDICTION
- Missing close price → use last available price, flag as STALE_CLOSE
- Unclassified loss → escalate to manual review, flag as UNCLASSIFIED
- Partial fill → treat filled portion as the trade, flag PARTIAL_FILL

### Output Validation
- Resolution must be WIN/LOSS/SCRATCH
- Failure type must be A/B/C/D (only for LOSS)
- Brier contribution ≥ 0 and ≤ 1
- P&L must include fees
- All timestamps ISO 8601

---

## Success Metrics & Sign-Off

After 50+ trades with all metrics met:

```markdown
# Phase 7 Sign-Off

I have reviewed the paper trading results:

- **Trades:** {N}
- **Brier Score:** {brier} (target ≤ 0.20) ✅
- **Win Rate:** {wr}% (target ≥ 55%) ✅
- **Max Drawdown:** {dd}% (target ≤ 8%) ✅
- **Sharpe Ratio:** {sr} (target ≥ 1.2) ✅
- **Post-Mortems:** {pm}/{losses} losses classified ✅
- **Calibration:** Brier-by-dispersion buckets within tolerance ✅

**Decision:** APPROVED for Phase 8 live rollout with minimum capital ($100 equivalent)

Signed: ___________________  
Date: ___________________
```

---

## Next: Phase 8 Live Rollout

After Phase 7 sign-off: deploy live with $100 capital, manual approval per trade, kill switch armed, gradual scaling.
