# Risk Report — 2026-05-05

## Overview
- **Total Trades Evaluated:** 5
- **Approved:** 1 (20%)
- **Rejected:** 4 (80%)

## Gate Performance
| Gate | Passed | Failed | Total | Pass Rate |
|------|--------|--------|-------|-----------|
| DATA_FRESHNESS | 5 | 0 | 5 | ✅ 100.0% |
| LIQUIDITY | 5 | 0 | 5 | ✅ 100.0% |
| NET_EDGE | 4 | 1 | 5 | ⚠️ 80.0% |
| CONFIDENCE | 4 | 2 | 6 | 🔴 66.7% |
| KELLY_SIZING | 4 | 1 | 5 | ⚠️ 80.0% |
| CONCENTRATION | 4 | 1 | 5 | ⚠️ 80.0% |
| DRAWDOWN | 4 | 1 | 5 | ⚠️ 80.0% |
| DAILY_LOSS | 4 | 1 | 5 | ⚠️ 80.0% |
| KILL_SWITCH | 4 | 1 | 5 | ⚠️ 80.0% |

## Position Sizing
- **Average Kelly allocation:** 2.1923% of bankroll
- **Average edge:** 6.35%
- **Median position:** 2.1923%
- **Max position:** 2.1923%
- **Min position:** 2.1923%
- **Total exposure across all approved trades:** 2.19%

## Risk Incidents
- 1 trade(s) stopped by drawdown halt
- 1 trade(s) stopped by daily loss halt
- 1 trade(s) rejected by kill switch
- 1 day(s) with trades stopped by confidence gate

## Calibration Status
- **Expected approval rate:** 85%
- **Observed approval rate:** 20.0%
- **Average edge:** 6.35%
- **Issues:**
  - Approval rate 20.0% deviates from expected 85% by 65.0%
  - Average Kelly allocation 2.19% deviates from expected 0.5%
