# Trading Bot — Phase 8: Live Rollout Readiness

**Status:** Specification & Gates  
**Date:** 2026-05-05  
**Purpose:** Production deployment protocol, kill-switch architecture, smallest-capital scaling, manual approval gates, launch checklist

---

## ⛔ KILL-SWITCH ARCHITECTURE

### Philosophy

No trade executes without explicit human armament. The kill-switch is the **single point of safety** between paper-trading simulation and real capital. It must be:

- **Hardcoded default: DISARMED** — Boots up safe, never auto-arms
- **Manual arm required** — Human types `arm` command explicitly
- **Auto-reject if not armed** — Risk engine gate #9 blocks execution
- **One-command disarm** — Emergency stop with zero latency
- **Session-scoped** — Disarms on restart, process exit, or timeout

### Implementation

```typescript
// kill-switch.mjs — Single source of truth
const KILL_SWITCH_DEFAULT = 'DISARMED'; // Hardcoded, never changes

let killSwitchState: 'DISARMED' | 'ARMED' = 
  (process.env.TRADING_BOT_KILL_SWITCH === 'ARMED') 
    ? 'ARMED' 
    : KILL_SWITCH_DEFAULT;

// Environment variable override:
// TRADING_BOT_KILL_SWITCH=ARMED   → starts armed (only for supervised sessions)
// TRADING_BOT_KILL_SWITCH=DISARMED → starts disarmed (default)
// unset                          → DISARMED (hardcoded default)
```

### Operational Rules

| Rule | Behavior |
|------|----------|
| **Default state** | `DISARMED` — No trades can execute |
| **Arm procedure** | Operator types `trading-bot kill-switch arm` at CLI |
| **Disarm procedure** | Operator types `trading-bot kill-switch disarm` at CLI |
| **Auto-disarm triggers** | Process restart, crash, 24h timeout, Ctrl+C |
| **Arm persistence** | Session-only; lost on restart |
| **Audit log** | Every arm/disarm/auto-disarm logged with timestamp + operator |
| **Emergency stop** | `kill-switch disarm` honored within one event-loop tick |

### Kill-Switch Audit Log

**File:** `logs/kill_switch_audit.jsonl`

```json
{"event":"DISARMED","reason":"default_startup","timestamp":"2026-05-05T12:00:00.000Z","operator":"system"}
{"event":"ARMED","reason":"manual_arm","timestamp":"2026-05-05T12:05:00.000Z","operator":"trader@domain"}
{"event":"DISARMED","reason":"emergency_stop","timestamp":"2026-05-05T12:30:00.000Z","operator":"trader@domain"}
{"event":"ARMED","reason":"manual_arm","timestamp":"2026-05-05T12:35:00.000Z","operator":"trader@domain"}
```

### Risk Engine Integration (Gate #9)

```
function checkKillSwitch(): boolean {
  if (killSwitchState !== 'ARMED') {
    logGateFailure('KILL_SWITCH', 'GATE_FAILED_KILL_SWITCH_DISARMED');
    return false; // Blocks all execution
  }
  return true;
}
```

See Phase 5 RISK_ENGINE.md for full gate pipeline.

---

## 💰 SMALLEST CAPITAL PROTOCOL

### Rationale

Live trading starts with the minimum possible capital — **$1.00 USD** — not the $100 sandbox simulation. This ensures:

- Real-money feedback loop without financial risk
- Execution validation at microscopic scale
- Fee structure verification (Coinbase minimums)
- Psychological acclimation to real P&L

### Scaling Ladder

| Stage | Capital | Requirement | Manual Gate |
|-------|---------|-------------|-------------|
| **Stage 0** | $1.00 | Initial live launch | Approval Gate 1–5 |
| **Stage 1** | $10.00 | 10 consecutive profitable trades at $1 | Manual review + sign-off |
| **Stage 2** | $100.00 | 50 total profitable trades (cumulative) | Manual review + sign-off |
| **Stage 3** | $500.00 | 100 profitable trades + Brier ≤ 0.18 | Full audit + sign-off |
| **Stage 4** | Full bankroll | 200 profitable trades + all metrics green | Board sign-off |

### Profitability Definition (for scaling)

A trade is "profitable" if:
```
net_pnl_usd > 0  (after fees + slippage)
```

### Stage 0: $1 Capital Parameters

```
Bankroll:           $1.00
Max Position:       5% of bankroll = $0.05
Quarter-Kelly:      Applied at micro-scale
Min Order Size:     Checked against exchange minimums
Expected Position:  $0.005–$0.05 per trade
```

**Important:** Some positions may be below Coinbase minimum order size. In that case:
- Trade is **submitted anyway** to test the full pipeline
- Expected rejection (`ORDER_TOO_SMALL`) is logged and counted as pipeline validation
- Does NOT count as a failed trade for scaling purposes
- Once scaled to $10+, minimum order sizes are naturally met

### Stage Gates — Non-Negotiable

```
Stage 0 → Stage 1:
  ✅ 10 profitable trades at $1 capital
  ✅ All 10 trades had complete audit trails
  ✅ Zero unclassified losses (all failures categorized A/B/C/D)
  ✅ Brier Score ≤ 0.20 over those 10 trades
  ✅ Manual sign-off

Stage 1 → Stage 2:
  ✅ 50 cumulative profitable trades
  ✅ Brier Score ≤ 0.20 over trailing 50 trades
  ✅ Max drawdown ≤ 8%
  ✅ Post-mortems for ALL losses
  ✅ Manual sign-off
```

---

## 🔒 MANUAL APPROVAL GATES

Every live trade in Stage 0–1 requires explicit human review before execution. This is NOT a rubber-stamp; the reviewer can reject any trade.

### Approval Workflow

```
Risk Engine: APPROVE
  ↓
PAUSE — Await Manual Approval
  ↓
Operator reviews:
  1. Prediction details (p_model, confidence, dispersion)
  2. Risk assessment (edge, position size, gates passed)
  3. Market conditions (spread, volume, recent volatility)
  4. Portfolio state (open positions, drawdown, daily P&L)
  ↓
Operator decision: APPROVE / REJECT / DEFER
  ↓
If APPROVE → Execution engine submits order
If REJECT  → Log rejection reason, continue scanning
If DEFER   → Hold 5 minutes, re-evaluate with fresh snapshot
```

### Approval Gate Checklist (per trade)

| # | Check | Pass Condition |
|---|-------|----------------|
| 1 | Risk engine passes all 9 gates | `decision == "APPROVE"` |
| 2 | Brier Score ≤ 0.20 (from paper trading) | Verified in calibration report |
| 3 | Kill-switch armed | `killSwitchState == "ARMED"` |
| 4 | Capital set correctly for current stage | Stage 0: $1, Stage 1: $10, etc. |
| 5 | Trade reviewed (can be rejected) | Human operator signed off |
| 6 | No concentration violations | ≤ 3 positions, ≤ 15% exposure |
| 7 | No drawdown halt active | Current drawdown ≤ 8% |
| 8 | No daily loss halt active | Daily loss ≤ 15% |
| 9 | Market data fresh | Snapshot ≤ 60 seconds old |
| 10 | No exchange outages | Coinbase status page green |

### Rejection Log

**File:** `logs/manual_approval_log.jsonl`

```json
{
  "trade_id": "550e8400-e29b-41d4-a716-446655440000",
  "market_id": "BTC-USD",
  "risk_decision": "APPROVE",
  "operator_decision": "REJECT",
  "rejection_reason": "Spread widened to 28bps during review window",
  "operator": "trader@domain",
  "timestamp": "2026-05-05T12:34:56.789Z"
}
```

---

## 🚀 LAUNCH CHECKLIST

### Pre-Flight (Mandatory — All Must Be ✅)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Phase 0: Scope Lock complete & signed | ☐ | `phase-0/SCOPE_LOCK.md` |
| 2 | Phase 1: Accounts & credentials configured | ☐ | `phase-1/ACCOUNTS.md` |
| 3 | Phase 2: Scanner running ≥ 3 days, zero errors | ☐ | `logs/scanner.log` |
| 4 | Phase 3: Research pipeline producing evidence packets | ☐ | `data/evidence_packet.jsonl` |
| 5 | Phase 4: Ensemble inference calibrated | ☐ | `calibration_report.md` |
| 6 | Phase 5: Risk engine all 9 gates unit-tested | ☐ | `logs/risk_engine_test.log` |
| 7 | Phase 6: Execution engine idempotency verified | ☐ | `logs/execution_idempotency_test.log` |
| 8 | Phase 7: Paper trading — 50+ trades completed | ☐ | `PAPER_TRADING_JOURNAL.md` |
| 9 | Phase 7: Brier Score ≤ 0.20 | ☐ | `calibration_report.md` |
| 10 | Phase 7: Win Rate ≥ 55% | ☐ | `PAPER_TRADING_JOURNAL.md` |
| 11 | Phase 7: Max Drawdown ≤ 8% | ☐ | `PAPER_TRADING_JOURNAL.md` |
| 12 | Phase 7: All losses have post-mortems | ☐ | `trade_outcome.jsonl` |
| 13 | Phase 7: Failure taxonomy applied to 100% of losses | ☐ | `trade_outcome.jsonl` |
| 14 | All 6 JSON schemas validated | ☐ | `schemas/*.schema.json` |
| 15 | Environment variables set (no hardcoded secrets) | ☐ | `.env` (gitignored) |
| 16 | Kill-switch verified: starts DISARMED | ☐ | Manual test |
| 17 | Kill-switch verified: REJECTS trades when disarmed | ☐ | Manual test |
| 18 | Kill-switch verified: arm/disarm audit logged | ☐ | `logs/kill_switch_audit.jsonl` |
| 19 | Capital set to $1 (Stage 0) | ☐ | Config verified |
| 20 | Manual approval workflow tested end-to-end | ☐ | Dry-run with REJECT |

### Go/No-Go Decision

```
Launch Director: ___________________
Date: ___________________
Decision: GO / NO-GO
Signature: ___________________
```

### First 5 Trades — Heightened Supervision

| Trade # | Market | Decision | P&L | Reviewed By | Post-Mortem? |
|---------|--------|----------|-----|-------------|--------------|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

**Rule:** All first 5 trades must be manually approved AND reviewed post-close. Any unclassified loss → halt and investigate.

---

## 📊 LIVE MONITORING

### Real-Time Dashboard Metrics

```
┌─────────────────────────────────────────────────┐
│             TRADING BOT — LIVE v1.0              │
│  Kill-Switch: ARMED 🔴    Capital: $1.00        │
│  Stage: 0/4              Mode: LIVE              │
├─────────────────────────────────────────────────┤
│  Trades Today:     3                             │
│  P&L Today:        +$0.03                        │
│  Open Positions:   1                             │
│  Drawdown:         0.0%                          │
│  Brier Score:      0.185 (trailing 50)           │
├─────────────────────────────────────────────────┤
│  Last Trade:       BTC-USD  BUY  $0.05           │
│  Status:           FILLED                        │
│  Risk Gates:       9/9 ✅                        │
│  Manual Approval:  APPROVED (trader@domain)       │
└─────────────────────────────────────────────────┘
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

### Log Files (Live)

| Log | Path | Retention |
|-----|------|-----------|
| Kill-Switch Audit | `logs/kill_switch_audit.jsonl` | Permanent |
| Manual Approvals | `logs/manual_approval_log.jsonl` | Permanent |
| Execution Events | `data/execution_event.jsonl` | Permanent |
| Risk Decisions | `data/risk_decision.jsonl` | Rolling 90 days |
| Trade Outcomes | `data/trade_outcome.jsonl` | Permanent |
| Scanner Log | `logs/scanner.log` | Rolling 30 days |
| Error Log | `logs/error.log` | Rolling 30 days |

---

## 🛑 EMERGENCY PROCEDURES

### Immediate Halt

```bash
# One command — instant disarm
npm run trading-bot kill-switch disarm

# Verify state
npm run trading-bot kill-switch status
# Expected: KILL_SWITCH_STATUS=DISARMED
```

### After Emergency Stop

1. **Do NOT re-arm** until root cause identified
2. Review all open positions on Coinbase directly
3. Cancel any lingering orders manually via Coinbase UI
4. Pull logs: `logs/kill_switch_audit.jsonl`, `logs/error.log`
5. Classify incident: exchange outage / model failure / execution bug / external
6. Document in `logs/incident_report_{date}.md`
7. Get second reviewer sign-off before re-arming

### Rollback to Sandbox

```bash
# Switch back to paper trading mode
export TRADING_BOT_MODE=sandbox
export TRADING_BOT_KILL_SWITCH=DISARMED
npm run trading-bot:phase-7
```

---

## 🔄 SCALING PROCEDURE

### Stage 0 → Stage 1 ($1 → $10)

1. Verify 10 profitable Stage 0 trades in `data/trade_outcome.jsonl`
2. Generate Stage 0 report: `npm run trading-bot report --stage=0`
3. Review all 10 trades with second reviewer
4. Confirm Brier Score ≤ 0.20
5. Update capital config: `export TRADING_BOT_CAPITAL=10.00`
6. Sign off: `phase-8/stage-1-approval.md`
7. Arm kill-switch, begin Stage 1

### Stage 1 → Stage 2 ($10 → $100)

1. Verify 50 cumulative profitable trades
2. Generate full paper + live report
3. Full audit: all losses classified, all post-mortems complete
4. Confirm Brier Score ≤ 0.20, Sharpe ≥ 1.2
5. Update capital config: `export TRADING_BOT_CAPITAL=100.00`
6. Sign off: `phase-8/stage-2-approval.md`

---

## 📋 CONFIGURATION REFERENCE

### Required Environment Variables

```bash
# Coinbase API (sandbox or live)
COINBASE_API_KEY=your_api_key
COINBASE_API_SECRET=your_api_secret
COINBASE_API_PASSPHRASE=your_passphrase

# Mode
TRADING_BOT_MODE=sandbox|live

# Kill-Switch (optional — defaults to DISARMED)
TRADING_BOT_KILL_SWITCH=DISARMED|ARMED

# Capital (Stage 0 default: 1.00)
TRADING_BOT_CAPITAL=1.00

# Risk Parameters (override defaults if needed)
TRADING_BOT_MAX_POSITION_PCT=5
TRADING_BOT_MAX_POSITIONS=3
TRADING_BOT_DRAWDOWN_HALT_PCT=8
TRADING_BOT_DAILY_LOSS_HALT_PCT=15

# Model API Keys
GROK_API_KEY=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...
```

### CLI Commands

```bash
# Kill-Switch Operations
npm run trading-bot kill-switch status     # Show current state
npm run trading-bot kill-switch arm        # Arm (enable trading)
npm run trading-bot kill-switch disarm     # Disarm (emergency stop)

# Mode Selection
npm run trading-bot mode sandbox           # Switch to paper trading
npm run trading-bot mode live              # Switch to live trading

# Manual Approval (Stage 0–1)
npm run trading-bot approve <trade_id>     # Approve pending trade
npm run trading-bot reject <trade_id>      # Reject pending trade
npm run trading-bot defer <trade_id>       # Defer 5 minutes
npm run trading-bot pending                # List pending approvals

# Reporting
npm run trading-bot report --stage=0       # Stage-specific report
npm run trading-bot dashboard              # Real-time dashboard
npm run trading-bot audit                  # Full audit trail dump

# Phase Execution
npm run trading-bot:phase-2                # Scanner only
npm run trading-bot:phase-3                # Research pipeline
npm run trading-bot:phase-4                # Ensemble inference
npm run trading-bot:phase-5                # Risk engine
npm run trading-bot:phase-6                # Execution engine
npm run trading-bot:phase-7                # Paper trading (full pipeline)
npm run trading-bot:phase-8                # Live trading (full pipeline)
```

---

## ✅ SIGN-OFF

```
I confirm the following:

- [ ] All 20 pre-flight checks passed
- [ ] Kill-switch starts DISARMED by default
- [ ] Kill-switch blocks all trades when disarmed
- [ ] Capital set to $1.00 (Stage 0)
- [ ] Manual approval workflow tested
- [ ] Emergency procedures documented
- [ ] All logs and audit trails configured
- [ ] Phase 0–7 deliverables complete and reviewed
- [ ] Brier Score ≤ 0.20 from paper trading
- [ ] I understand: I am personally responsible for every trade

Launch Director: ___________________
Date: ___________________
Time (UTC): ___________________
```

---

**Phase 8 complete.** Proceed to live trading with kill-switch disarmed, arm only after all checks confirmed.
