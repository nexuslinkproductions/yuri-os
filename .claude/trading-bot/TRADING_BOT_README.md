# Trading Bot — 8-Phase Architecture

**Status:** Specification Complete — Ready for Implementation  
**Date:** 2026-05-05  
**Venue:** Coinbase Advanced Trade API (sandbox → live)  
**Capital:** $100 sandbox → $1 live (Stage 0 scaling)

---

## Overview

The trading bot is an 8-phase automated trading system that spans market discovery, research, ensemble inference, risk evaluation, execution, paper-trading validation, and live rollout. Every phase is deterministic, auditable, and designed for reproducibility.

```
Phase 0: Scope Lock           → Policy, risk gates, failure taxonomy
Phase 1: Accounts             → Coinbase credentials, secret management
Phase 2: Market Scanner       → Product discovery, feature scoring, candidate filtering
Phase 3: Research Pipeline    → News/social ingestion, deduplication, consensus/dissent
Phase 4: Ensemble Inference   → Multi-model probability aggregation, calibration, dispersion
Phase 5: Risk Engine          → 9 deterministic gates, Kelly sizing, drawdown halts
Phase 6: Execution Engine     → Idempotent order submission, audit trail, latency tracking
Phase 7: Paper Trading        → 50+ simulated trades, post-mortems, Brier Score ≤ 0.20
Phase 8: Live Rollout         → Kill-switch, $1 staged scaling, manual approval gates
```

---

## Quick Start

```bash
# Individual phase execution (sandbox/paper trading)
npm run trading-bot:phase-2    # Scanner: poll markets, compute features, output candidates
npm run trading-bot:phase-3    # Research: collect evidence from news/social, deduplicate
npm run trading-bot:phase-4    # Ensemble: run 5-model inference, aggregate probabilities
npm run trading-bot:phase-5    # Risk: evaluate 9 gates, calculate Kelly position sizes
npm run trading-bot:phase-6    # Execution: submit orders to Coinbase sandbox, poll fills
npm run trading-bot:phase-7    # Paper trading: full pipeline simulation (50+ trades)
npm run trading-bot:phase-8    # Live rollout: real capital, kill-switch armed

# Kill-switch operations
npm run trading-bot kill-switch status     # Show current state (ARMED/DISARMED)
npm run trading-bot kill-switch arm        # Enable trade execution
npm run trading-bot kill-switch disarm     # Emergency stop — blocks all trades

# Mode selection
npm run trading-bot mode sandbox           # Switch to paper trading
npm run trading-bot mode live              # Switch to live trading

# Manual approval (Stage 0–1 only)
npm run trading-bot approve <trade_id>     # Approve pending trade
npm run trading-bot reject <trade_id>      # Reject pending trade
npm run trading-bot defer <trade_id>       # Defer 5 minutes for re-evaluation
npm run trading-bot pending                # List trades awaiting manual approval

# Reporting
npm run trading-bot report --stage=0       # Stage-specific performance report
npm run trading-bot dashboard              # Real-time monitoring dashboard
npm run trading-bot audit                  # Full audit trail dump
```

---

## Directory Structure

```
.claude/trading-bot/
├── TRADING_BOT_README.md                     # ← This file
├── PHASE_0-2_FOUNDATION_SUMMARY.md           # Phases 0–2 completion summary
│
├── phase-0/
│   └── SCOPE_LOCK.md                         # Trading policy, risk parameters, failure taxonomy
│
├── phase-1/
│   └── ACCOUNTS.md                           # Coinbase API credential setup, secret management
│
├── phase-2/
│   └── SCANNER.md                            # Market discovery architecture, feature scoring filters
│
├── phase-3/
│   ├── RESEARCH.md                           # Research pipeline overview
│   ├── RESEARCH_PIPELINE.md                  # Detailed specification: sources, consensus, freshness
│   ├── source-config.ts                      # News & social source configuration
│   ├── dedup-engine.ts                       # Deduplication logic (cosine similarity, same-URL)
│   ├── rss-ingester.ts                       # RSS feed parser and normalizer
│   ├── social-collector.ts                   # X/Twitter & Reddit signal collector
│   └── types.ts                              # TypeScript types for research pipeline
│
├── phase-4/
│   └── ENSEMBLE_INFERENCE.md                 # Multi-model aggregation, calibration, dispersion analysis
│
├── phase-5/
│   └── RISK_ENGINE.md                        # 9 deterministic gates, Kelly sizing, drawdown halts
│
├── phase-6/
│   └── EXECUTION_ENGINE.md                   # Idempotent order submission, polling, audit trail
│
├── phase-7/
│   └── PAPER_TRADING.md                      # 50+ trade validation, post-mortems, Brier Score gates
│
├── phase-8/
│   └── LIVE_ROLLOUT.md                       # Kill-switch, staged scaling, manual approval, emergency procedures
│
├── schemas/
│   ├── market_snapshot.schema.json            # Normalized market state (Coinbase product data)
│   ├── candidate_features.schema.json         # Scored & filtered market candidates
│   ├── prediction_result.schema.json          # Ensemble probability output with dispersion
│   ├── risk_decision.schema.json              # Gate evaluation results, Kelly sizing
│   ├── execution_event.schema.json            # Order lifecycle, fill events, latency
│   └── trade_outcome.schema.json              # P&L, failure classification, post-mortem, Brier contribution
│
├── Scripts/
│   └── trading-bot/                           # Implementation scripts (scanner, evidence-collector,
│                                              #   ensemble-inference, risk-engine, execution-engine,
│                                              #   outcome-analyzer, kill-switch)
│
├── data/
│   ├── market_snapshots.jsonl                 # Append-only market snapshots (Phase 2 output)
│   ├── candidate_features.jsonl               # Scored candidates (Phase 2 output)
│   ├── evidence_packet.jsonl                  # Research evidence (Phase 3 output)
│   ├── prediction_result.jsonl                # Ensemble predictions (Phase 4 output)
│   ├── risk_decision.jsonl                    # Risk gate evaluations (Phase 5 output)
│   ├── execution_event.jsonl                  # Order lifecycle events (Phase 6 output)
│   └── trade_outcome.jsonl                    # Post-trade analysis (Phase 7 output)
│
└── logs/
    ├── kill_switch_audit.jsonl                # Every arm/disarm event with operator & timestamp
    ├── manual_approval_log.jsonl              # Human approval/rejection decisions
    ├── scanner.log                            # Scanner operational logs
    └── error.log                              # System error logs
```

---

## Environment Variables (.env Requirements)

All credentials and configuration are set via environment variables. **Never commit secrets to git.**

### Required

```bash
# Coinbase Advanced Trade API
COINBASE_API_KEY=your_api_key             # API Key ID
COINBASE_API_SECRET=your_api_secret       # API Secret
COINBASE_API_PASSPHRASE=your_passphrase   # API Passphrase

# Trading Mode
TRADING_BOT_MODE=sandbox                  # "sandbox" or "live"
```

### Optional (Defaults Apply)

```bash
# Kill-Switch (default: DISARMED — no trades can execute)
TRADING_BOT_KILL_SWITCH=DISARMED          # "DISARMED" or "ARMED"

# Capital (Stage 0 default: $1.00)
TRADING_BOT_CAPITAL=1.00

# Risk Parameter Overrides (defaults in parentheses)
TRADING_BOT_MAX_POSITION_PCT=5            # (5%) Max single position as % of bankroll
TRADING_BOT_MAX_POSITIONS=3               # (3) Max concurrent open positions
TRADING_BOT_DRAWDOWN_HALT_PCT=8           # (8%) Halt all trading if drawdown exceeds
TRADING_BOT_DAILY_LOSS_HALT_PCT=15        # (15%) Halt all trading if daily loss exceeds

# Model API Keys (for ensemble inference)
GROK_API_KEY=...                          # xAI Grok
ANTHROPIC_API_KEY=...                     # Anthropic Claude
OPENAI_API_KEY=...                        # OpenAI GPT-4o
GEMINI_API_KEY=...                        # Google Gemini
DEEPSEEK_API_KEY=...                      # DeepSeek
```

### Verification

```bash
# Test Coinbase API connectivity
node Scripts/trading-bot/verify-coinbase-auth.mjs

# Check that all required env vars are set
node Scripts/trading-bot/check-api-health.mjs
```

---

## File Descriptions

### Phase 0: Scope Lock (`phase-0/SCOPE_LOCK.md`)

**Purpose:** Locks in all trading policy before any code is written.

- Market family: Crypto spot (BTC, ETH, SOL) on Coinbase Advanced Trade
- Holding period: 1–7 days
- Capital: $100 sandbox — $1 live (Stage 0)
- Risk policy: Quarter-Kelly sizing, 8% drawdown halt, 15% daily loss halt
- Calibration target: Brier Score ≤ 0.20
- Failure taxonomy: A (Prediction), B (Timing), C (Execution), D (External Shock)
- 8 launch gates (non-negotiable for live rollout)

### Phase 1: Accounts & Credentials (`phase-1/ACCOUNTS.md`)

**Purpose:** Coinbase API credential provisioning and secret management policy.

- API key generation (permissions: `trade`, `view`)
- Sandbox vs. live credential separation
- Environment variable storage (no git commits)
- Connectivity verification scripts
- Quarterly credential rotation policy

### Phase 2: Market Scanner (`phase-2/SCANNER.md`)

**Purpose:** Discover tradable markets, compute feature scores, filter candidates.

- Polls Coinbase `GET /products` every 60 seconds
- Normalizes data into `market_snapshot.schema.json` format
- Computes: liquidity, spread, volatility, and execution feasibility scores
- Composite score: `0.4 * liquidity + 0.2 * spread + 0.2 * volatility + 0.2 * execution`
- Hard gates: spread ≤ 25 bps, volume ≥ $500k, composite ≥ 0.5, status = `active`
- Output: `data/market_snapshots.jsonl`, `data/candidate_features.jsonl`
- Deterministic and replay-able

### Phase 3: Research Pipeline (`phase-3/`)

**Purpose:** Collect, deduplicate, and score market-relevant evidence from multiple sources.

- **Source tiers:** Tier-1 (Reuters, CoinDesk — confidence 0.90–0.95), Tier-2 (X/Twitter verified, Reddit upvoted — confidence 0.60–0.70), Tier-3 (auto-detected volume spikes — confidence 0.80)
- **Confidence decay:** `confidence_t = confidence_0 * 0.5^(hours_old / half_life)`
- **Deduplication:** Cosine similarity > 0.85, same URL, same event within 30 minutes
- **Consensus extraction:** Weighted sentiment aggregation across sources (≥70% agreement = consensus)
- **Freshness flags:** `stable`, `old_evidence`, `low_diversity`, `contradictory`, `rumor`
- **Files:** `RESEARCH.md` (overview), `RESEARCH_PIPELINE.md` (full spec), `source-config.ts`, `dedup-engine.ts`, `rss-ingester.ts`, `social-collector.ts`, `types.ts`
- **Output:** `data/evidence_packet.jsonl`

### Phase 4: Ensemble Inference (`phase-4/ENSEMBLE_INFERENCE.md`)

**Purpose:** Aggregate probability estimates from 5 models, compute disagreement, calibrate confidence.

- **Models:** Grok (weight 0.20), Claude (0.25), GPT-4o (0.20), Gemini (0.15), DeepSeek (0.20)
- **Aggregation:** Weighted average → `p_model`; standard deviation → `dispersion`
- **Dispersion thresholds:** <0.05 strong consensus, 0.05–0.15 moderate, >0.15 high disagreement
- **Confidence bucketing:** Calibrated per dispersion range from backtested outcomes
- **Calibration report:** Generated every 10 trades (Brier per model, per bucket)
- **Error handling:** Model timeout → use last known probability; API error → retry 3x with backoff
- **Output:** `data/prediction_result.jsonl`

### Phase 5: Risk Engine (`phase-5/RISK_ENGINE.md`)

**Purpose:** Enforce 9 deterministic gates before any trade can execute.

- **Gate 1 — Data Freshness:** Market snapshot ≤ 60s old
- **Gate 2 — Liquidity:** Volume ≥ $500k, spread ≤ 25 bps
- **Gate 3 — Net Edge:** `(p_model - p_market) - (fees + slippage) ≥ 4%`
- **Gate 4 — Confidence:** Ensemble confidence ≥ 0.60, dispersion ≤ 0.08
- **Gate 5 — Kelly Sizing:** Quarter-Kelly, capped at 5% of bankroll
- **Gate 6 — Concentration:** Max 3 positions, total exposure ≤ 15%
- **Gate 7 — Drawdown Halt:** Reject if underwater > 8%
- **Gate 8 — Daily Loss Halt:** Reject if today's loss > 15%
- **Gate 9 — Kill-Switch:** Reject if not ARMED
- **Output:** `data/risk_decision.jsonl` (APPROVE or REJECT with gate details)
- **Risk report:** Generated every 10 trades

### Phase 6: Execution Engine (`phase-6/EXECUTION_ENGINE.md`)

**Purpose:** Idempotent order submission to Coinbase with full audit trail.

- **Idempotency:** Deterministic `client_order_id` from `sha256(trade_id + market_id + side + size + price + 5s_bucket)`
- **Order lifecycle:** PENDING → OPEN → PARTIALLY_FILLED → FILLED | CANCELLED | FAILED | TIMEOUT
- **Polling strategy:** 2s intervals for 30s, then 10s for 5min, then 60s for 24h
- **Latency tracking:** `total_latency_ms`, `exchange_latency_ms`, `bot_latency_ms`
- **Error handling:** 429 → exponential backoff; 401/403 → HALT; 500+ → retry 5x
- **Output:** `data/execution_event.jsonl`

### Phase 7: Paper Trading (`phase-7/PAPER_TRADING.md`)

**Purpose:** Validate the full pipeline across 50+ simulated trades before live capital.

- **Venue:** Coinbase sandbox (no real funds) or simulated fills at live market prices
- **Full pipeline:** Scanner → Research → Ensemble → Risk → Execution → Outcome Analysis
- **Post-mortem:** Every loss classified via failure taxonomy (A/B/C/D) with root cause analysis
- **Brier Score:** Target ≤ 0.20 across 50+ trades
- **Win Rate:** Target ≥ 55%
- **Calibration:** Brier-by-dispersion buckets validated against expected ranges
- **Cumulative dashboard:** P&L, Sharpe ratio, drawdown, failure breakdown, gate performance
- **Launch gates:** 9 non-negotiable gates must all be green before Phase 8
- **Output:** `data/trade_outcome.jsonl`, `PAPER_TRADING_JOURNAL.md`

### Phase 8: Live Rollout (`phase-8/LIVE_ROLLOUT.md`)

**Purpose:** Production deployment with kill-switch, staged capital scaling, manual approval.

- **Kill-switch:** Hardcoded default DISARMED; manual arm required; auto-disarms on restart/crash/timeout
- **Staged scaling:** Stage 0 ($1) → Stage 1 ($10) → Stage 2 ($100) → Stage 3 ($500) → Stage 4 (full)
- **Manual approval gates:** Every trade in Stage 0–1 requires human review (10-point checklist)
- **Launch checklist:** 20 pre-flight checks, all Phase 0–7 deliverables verified
- **Alert conditions:** Brier > 0.22, drawdown > 5%, 3 consecutive Type-A losses, exchange errors
- **Emergency procedures:** One-command disarm, rollback to sandbox, incident report protocol
- **Log files:** `logs/kill_switch_audit.jsonl`, `logs/manual_approval_log.jsonl`

### Schemas (`schemas/`)

Six JSON Schema (draft-07) files define the data contracts for every pipeline stage:

| Schema | Phase | Description |
|--------|-------|-------------|
| `market_snapshot.schema.json` | 2 | Normalized market state from Coinbase |
| `candidate_features.schema.json` | 2 | Scored & filtered candidates |
| `prediction_result.schema.json` | 4 | Ensemble output with per-model probabilities |
| `risk_decision.schema.json` | 5 | Gate evaluation, Kelly sizing, portfolio state |
| `execution_event.schema.json` | 6 | Order lifecycle, fills, latency breakdown |
| `trade_outcome.schema.json` | 7 | P&L, failure classification, post-mortem, Brier |

All schemas validated against the pipeline data contract. Data files are append-only JSONL.

---

## Kill-Switch Operation

The kill-switch is the **single point of safety** between the bot and real capital.

### Default State: DISARMED

- On startup, the kill-switch is **always DISARMED** — no trades can execute
- The `checkKillSwitch()` function in the risk engine (Gate #9) blocks all execution when DISARMED
- Auto-disarms on: process restart, crash, 24-hour timeout, Ctrl+C

### Arm Procedure

```bash
# Arm the kill-switch (required before any trade can execute)
npm run trading-bot kill-switch arm

# Verify state
npm run trading-bot kill-switch status
# → KILL_SWITCH_STATUS=ARMED
```

### Emergency Disarm

```bash
# One command — instant stop
npm run trading-bot kill-switch disarm

# All pending and in-flight orders are blocked
# Risk engine Gate #9 fails immediately for all subsequent evaluations
```

### Audit Trail

Every arm/disarm event is logged to `logs/kill_switch_audit.jsonl`:

```json
{"event":"DISARMED","reason":"default_startup","timestamp":"...","operator":"system"}
{"event":"ARMED","reason":"manual_arm","timestamp":"...","operator":"trader@domain"}
{"event":"DISARMED","reason":"emergency_stop","timestamp":"...","operator":"trader@domain"}
```

### After Emergency Stop

1. Do NOT re-arm until root cause is identified
2. Review open positions on Coinbase directly
3. Cancel lingering orders via Coinbase UI
4. Pull logs: `logs/kill_switch_audit.jsonl`, `logs/error.log`
5. Classify incident and document in `logs/incident_report_{date}.md`
6. Get second reviewer sign-off before re-arming

---

## Running Paper Trades

Paper trading (Phase 7) is the mandatory validation gate before live capital.

### Prerequisites

- Phases 0–6 deliverables complete and verified
- Coinbase sandbox credentials configured
- All 6 JSON schemas validated
- Kill-switch operational (disarmed for paper trading)

### Execution

```bash
# Start full paper trading pipeline
npm run trading-bot:phase-7

# This runs the complete loop:
#   Scanner (60s polling)
#     → Research Pipeline (evidence collection)
#       → Ensemble Inference (5-model prediction)
#         → Risk Engine (9-gate evaluation)
#           → Execution Engine (sandbox order submission)
#             → Outcome Analyzer (post-close analysis)
```

### Simulation Mode (Fallback)

If Coinbase sandbox is unavailable, the pipeline simulates fills:

- **Limit orders:** Fill at limit price if market touches within 5 minutes; otherwise cancel
- **Market orders:** Fill at best bid/ask + estimated slippage (10 bps)
- **Slippage model:** `slippage_bps = 5 + (order_size_usd / 100) * 2` (capped at 25 bps)
- **Fee model:** Coinbase taker fee 0.5%

### Success Metrics (50+ Trades Required)

| Metric | Target | Status |
|--------|--------|--------|
| Trades Completed | ≥ 50 | Must be met |
| Brier Score | ≤ 0.20 | Must be met |
| Win Rate | ≥ 55% | Must be met |
| Max Drawdown | ≤ 8% | Must be met |
| Sharpe Ratio | ≥ 1.2 | Must be met |
| Post-Mortems | 100% of losses | Must be met |
| Failure Classification | 100% | Must be met |

### Post-Mortem Classification

Every loss is classified using the failure taxonomy:

- **Type A (Prediction Error):** Model was confidently wrong (`abs(p_model - outcome) > 0.30` and `dispersion < 0.08`)
- **Type B (Timing Error):** Direction correct but entry/exit timing killed EV
- **Type C (Execution Error):** Order management failure (rejection, timeout, excessive slippage > 50 bps)
- **Type D (External Shock):** Market structure change mid-trade (price move > 5% in < 60s, exchange outage)

---

## Monitoring Logs

### Log File Locations

| Log | Path | Retention | Content |
|-----|------|-----------|---------|
| Kill-Switch Audit | `logs/kill_switch_audit.jsonl` | Permanent | Every arm/disarm event |
| Manual Approvals | `logs/manual_approval_log.jsonl` | Permanent | Human approval/rejection decisions |
| Scanner Log | `logs/scanner.log` | Rolling 30 days | Scanner operational events, errors |
| Error Log | `logs/error.log` | Rolling 30 days | System errors, API failures, timeouts |
| Market Snapshots | `data/market_snapshots.jsonl` | Rolling 90 days | Phase 2 output |
| Candidate Features | `data/candidate_features.jsonl` | Rolling 90 days | Phase 2 output |
| Evidence Packets | `data/evidence_packet.jsonl` | Rolling 90 days | Phase 3 output |
| Prediction Results | `data/prediction_result.jsonl` | Rolling 90 days | Phase 4 output |
| Risk Decisions | `data/risk_decision.jsonl` | Permanent | Phase 5 output |
| Execution Events | `data/execution_event.jsonl` | Permanent | Phase 6 output |
| Trade Outcomes | `data/trade_outcome.jsonl` | Permanent | Phase 7 output |

### Real-Time Monitoring

```bash
# Live dashboard
npm run trading-bot dashboard

# Displays:
#   Kill-Switch status, Capital, Stage
#   Trades today, P&L, Open positions, Drawdown
#   Brier Score (trailing 50), Last trade details
```

### Alert Conditions

| Alert | Trigger | Action |
|-------|---------|--------|
| 🟡 WARNING | Brier > 0.22 (trailing 10) | Review calibration |
| 🟠 CAUTION | Drawdown > 5% | Reduce position sizes |
| 🔴 CRITICAL | Drawdown > 8% | HALT — auto-disarm kill-switch |
| 🔴 CRITICAL | Daily loss > 15% | HALT — auto-disarm kill-switch |
| 🔴 CRITICAL | 3 consecutive Type-A losses | HALT — model drift suspected |
| 🔴 CRITICAL | Exchange error 5xx > 3 in 5min | HALT — venue risk |
| 🔴 CRITICAL | Kill-switch disarmed unexpectedly | HALT — investigate |

### Log Inspection

```bash
# Tail scanner log
tail -f logs/scanner.log

# View recent risk decisions
tail -20 data/risk_decision.jsonl | jq .

# Check kill-switch audit
cat logs/kill_switch_audit.jsonl | jq .

# Count today's trades
grep "$(date +%Y-%m-%d)" data/execution_event.jsonl | wc -l

# Calculate running Brier Score
node Scripts/trading-bot/brier-calculator.mjs
```

---

## Pipeline Data Flow

```
Market Data (Coinbase API)
  │
  ├─→ Phase 2: Scanner ──→ market_snapshots.jsonl
  │                       ──→ candidate_features.jsonl
  │
  ├─→ Phase 3: Research ──→ evidence_packet.jsonl
  │     (News + Social)
  │
  ├─→ Phase 4: Ensemble ──→ prediction_result.jsonl
  │     (5 Models)
  │
  ├─→ Phase 5: Risk ──→ risk_decision.jsonl
  │     (9 Gates)
  │
  ├─→ Phase 6: Execution ──→ execution_event.jsonl
  │     (Coinbase Orders)
  │
  └─→ Phase 7: Outcome ──→ trade_outcome.jsonl
        (Post-Mortems)
```

---

## Status & Next Steps

- [x] Phase 0: Scope Lock — Complete
- [x] Phase 1: Accounts & Credentials — Complete
- [x] Phase 2: Market Scanner — Complete
- [x] Phase 3: Research Pipeline — Specification complete
- [x] Phase 4: Ensemble Inference — Specification complete
- [x] Phase 5: Risk Engine — Specification complete
- [x] Phase 6: Execution Engine — Specification complete
- [x] Phase 7: Paper Trading — Specification complete
- [x] Phase 8: Live Rollout — Specification complete
- [x] All 6 JSON Schemas — Defined and validated
- [ ] Phase 3–8 implementation scripts (pending)
- [ ] Coinbase sandbox credentials (pending)
- [ ] 50+ paper trades completed (pending)
- [ ] Brier Score ≤ 0.20 validated (pending)
- [ ] Live launch checklist signed off (pending)

---

## Related Documents

- `PHASE_0-2_FOUNDATION_SUMMARY.md` — Foundation phases completion summary
- `phase-0/SCOPE_LOCK.md` — Full trading policy and risk parameters
- `phase-5/RISK_ENGINE.md` — Complete 9-gate risk evaluation specification
- `phase-7/PAPER_TRADING.md` — Paper trading validation and post-mortem framework
- `phase-8/LIVE_ROLLOUT.md` — Kill-switch architecture and live deployment protocol
