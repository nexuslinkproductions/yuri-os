# Trading Bot — Phase 0: Scope Lock

**Status:** Locked  
**Date:** 2026-05-05  
**Strategy:** Coinbase Advanced Trade API (sandbox/paper)

---

## Market Selection

- **Family:** Cryptocurrency spot markets
- **Venue:** Coinbase (Advanced Trade API, sandbox first)
- **Asset Class:** BTC, ETH, SOL (high liquidity pairs initially)
- **Holding Period:** 1–7 days intraday/swing
- **Market Hours:** 24/7 crypto markets

---

## Capital & Risk Policy

- **Initial Allocation:** $100 USD equivalent (sandbox)
- **Max Capital-at-Risk (First 30 Trades):** $100
- **Position Sizing:** Quarter-Kelly formula
  - `position_size = (edge * odds - 1) / (4 * odds)`
  - `edge = p_model - p_market - fees - slippage`
- **Max Single Position:** 5% of bankroll
- **Max Concurrent Positions:** 3
- **Drawdown Halt:** 8% (triggers cooling-off period)
- **Daily Loss Halt:** 15% (hard stop for day)

---

## Calibration Thresholds

| Metric | Target / Threshold | Rationale |
|--------|------------------|-----------|
| Brier Score | ≤ 0.20 | Probabilistic accuracy benchmark |
| Min Net Edge | ≥ 4% | After fees + estimated slippage |
| Confidence Minimum | ≥ 0.60 | Model agreement strong enough |
| Model Dispersion Cap | ≤ 0.08 | Disagreement spread limit |
| Data Freshness | ≤ 60s | Market snapshot age limit |

---

## Failure Taxonomy

Post-trade classification (mandatory for every loss):

| Type | Definition | Example |
|------|------------|---------|
| **A: Prediction Error** | Model p_market diverged from resolution | Consensus 60%, resolved 15% |
| **B: Timing Error** | Correct prediction, wrong entry/exit | Entered too late, slippage killed EV |
| **C: Execution Error** | Order management failure | Fill way worse than expected, partial fill race |
| **D: External Shock** | Market structure change mid-trade | Exchange rate spike, venue outage, regulation |

---

## Launch Gates (Non-Negotiable)

- ✅ Phase 1: Accounts created, credentials secured in env vars
- ✅ Phase 2: Market scanner built, normalized data flowing
- ✅ Phase 3: Research pipeline working (evidence packets generated)
- ✅ Phase 4: Calibration report shows Brier Score target met
- ✅ Phase 5: Risk engine unit-tested, all gates logged
- ✅ Phase 6: Execution engine idempotent + audit trail working
- ✅ Phase 7: Paper trading (50+ trades, reviewed, signed off)
- ⏳ Phase 8: Live rollout (smallest capital, manual approval, kill switch armed)

---

## Success Metrics (Paper Trading)

| Metric | Target |
|--------|--------|
| Win Rate | ≥ 55% (positive expectancy) |
| Brier Score | ≤ 0.20 |
| Drawdown Peak | ≤ 8% of bankroll |
| Sharpe Ratio | ≥ 1.2 (if annualized over 50 trades) |

---

## Deliverables Checkpoint

- [ ] This SCOPE_LOCK.md (locked)
- [ ] Data schemas (market_snapshot, features, evidence, prediction, risk, execution, outcome)
- [ ] Coinbase sandbox credentials configured
- [ ] Market scanner producing stable candidate lists
- [ ] Normalized data contracts validated
- [ ] Risk engine gates unit-tested
- [ ] Paper trading journal (50+ trades with post-mortems)
- [ ] Calibration report (Brier Score, confidence buckets)
- [ ] Live launch checklist signed off

---

## Next Phase

→ **Phase 1: Accounts & Credentials Setup**

Create Coinbase Advanced Trade API credentials (sandbox first), configure environment variables, implement secret management.
