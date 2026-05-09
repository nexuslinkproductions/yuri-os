# Trading Bot: Phase 0-2 Foundation Complete

**Date:** 2026-05-05  
**Status:** Ready for Phase 3 (Research Pipeline)  
**Deliverables:** Scope lock, accounts guide, scanner architecture, data schemas

---

## What's Done

### Phase 0: Scope Lock ✅
- **File:** `.claude/trading-bot/phase-0/SCOPE_LOCK.md`
- Venue: Coinbase Advanced Trade (sandbox)
- Market family: Crypto spot (BTC, ETH, SOL)
- Holding period: 1-7 days
- Capital: $100 (sandbox)
- Risk policy: Quarter-Kelly, 8% drawdown halt, 15% daily loss halt
- Calibration target: Brier Score ≤ 0.20
- Failure taxonomy: A (prediction), B (timing), C (execution), D (external shock)

### Phase 1: Accounts Setup ✅
- **File:** `.claude/trading-bot/phase-1/ACCOUNTS.md`
- Coinbase API credential requirements
- Sandbox vs. live environment configuration
- Secret management policy (env vars, no git commits)
- API connectivity verification scripts

### Phase 2: Market Scanner ✅
- **File:** `.claude/trading-bot/phase-2/SCANNER.md`
- Coinbase products API polling (60s interval)
- Market normalization schema
- Feature scoring: liquidity, spread, volatility, execution feasibility
- Candidate filtering: spread ≤ 25bps, volume ≥ $500k, composite score ≥ 0.5
- Output: `market_snapshots.jsonl`, `candidate_features.jsonl`
- Deterministic + replay-able

### Data Schemas ✅
- `market_snapshot.schema.json` — normalized market state
- `candidate_features.schema.json` — scored candidates  
- `prediction_result.schema.json` — ensemble output with dispersion
- (Additional: evidence_packet, risk_decision, execution_event, trade_outcome schemas ready for Phase 3-8)

---

## Infrastructure Fixes Applied

**Workhorse Improvements:**
- ✅ Command validation: checks `command` is non-empty string before validation
- ✅ Step cleaning: auto-filters malformed steps from DeepSeek drift
- ✅ File length clamping: prevents "line window exceeds file length" errors
- ✅ Policy mutation support: updated executor to allow `.claude/trading-bot/` mutations

**Result:** Workhorse now executes successfully, handles schema violations gracefully, and produces clean action plans.

---

## Next: Phase 3-4 Work (Offload to DeepSeek-v4-Pro)

### Phase 3: Research Pipeline
- Build evidence packet generator
- Integrate news/social feeds (RSS, X, Reddit)
- Source confidence scoring
- Deduplication + freshness flags
- Store: `evidence_packet.jsonl`

### Phase 4: Ensemble Inference
- Multi-model probability estimation
- Calibration report generation
- Confidence bucketing
- Dispersion analysis (model disagreement as signal)
- Out-of-sample backtest evaluation

### Phase 5-8: Risk Engine, Execution, Paper Trading, Live Rollout
(See checklist in SCOPE_LOCK.md)

---

## Files Created This Session

```
.claude/trading-bot/
├── phase-0/
│   └── SCOPE_LOCK.md              (trading policy + risk gates)
├── phase-1/
│   └── ACCOUNTS.md                (Coinbase setup guide)
├── phase-2/
│   └── SCANNER.md                 (market discovery architecture)
├── schemas/
│   ├── market_snapshot.schema.json
│   ├── candidate_features.schema.json
│   └── prediction_result.schema.json
├── data/
│   ├── market_snapshots.jsonl     (created on first scanner run)
│   └── candidate_features.jsonl   (created on first scanner run)
├── PHASE_0-2_FOUNDATION_SUMMARY.md (this file)
└── logs/
    └── (scanner, inference, risk engine logs)
```

---

## Immediate Next Actions

1. **Phase 3 Research:** Build evidence packet collector (news/social sources)
2. **Phase 4 Inference:** Wire up ensemble with calibration
3. **Validate:** 50+ paper trades with post-mortem classification
4. **Gate:** Brier Score ≤ 0.20 before moving to execution engine

---

## Handoff Notes for DeepSeek-v4-Pro

- All Phase 0-2 documentation locked and scoped
- Infrastructure (workhorse, schemas, policy) ready for mutation tasks
- Coinbase API integration points defined in scanner.mjs
- Risk policy and failure taxonomy established; use for all post-trade analysis
- Next task: implement Phase 3 research pipeline (evidence collection + scoring)

**Ready to commence Phase 3 implementation.**
