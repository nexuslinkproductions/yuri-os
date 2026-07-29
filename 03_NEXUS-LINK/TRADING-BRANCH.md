# TRADING-BRANCH.md — the finance/trading fork (far stretch, parked)

Status: DESIGN NOTE ONLY. Not started. Recorded 2026-07-29 so the shape is
fixed before any code moves.

## What Marcel asked for

A separate, dedicated, shared trading branch: a very clean copy of YURI's
framework and structure, specialized for finance and automated trading.
Targets: MT5 (MetaTrader 5) + TradingView as the execution/charting layer,
Kimi K3 finance plugins where they fit. Inputs Marcel still owes this doc:
his research website + the repos to pull.

## Why a branch and not a folder

YURI core stays clean. The trading fork inherits the framework (organs,
gates, evidence, memory, lane telemetry) but carries domain organs the main
repo should never host: market data ingest, broker adapters, strategy
runtime, risk engine, backtest harness.

## What already exists and moves over (verified runnable, see recon 2026-07-29)

- `_SYSTEM/Scripts/alpha-factor-library/` — factor-circuit (non-commuting
  signal sequencing, 1,134,061x ordering effect), trade-edge-audit (11/0
  tests; built to say NO: 205 factors, 0 survivors), trade-decision-sim
  (12/0), deflated Sharpe + BH-FDR + maker-fee falsification battery.
- `_SYSTEM/Scripts/decision-sim.mjs` + `eval-processing.mjs` — CVaR robust
  sizing, minimax regret, flip-witness.
- `skills/trade-decision-sim`, `skills/trade-edge-audit` — the operator
  lenses.
- The gate layer: yuri-energy veto + evidence contract, exactly the risk
  discipline a live-money system needs before any order fires.

## Hard rules for when this starts

1. Paper trading first, always. The edge-audit must pass on live paper data
   before any real-money path is even compiled.
2. Every order path behind the same approval gates as the content pipeline:
   the system proposes, a gate disposes.
3. No YURI internals leak into broker-facing code (API keys isolated,
   protected-surfaces rules apply to brokerage credentials).
4. Backtest claims follow the honesty-gate pattern: deflated Sharpe +
   no-control-win or the strategy does not ship.

## Open inputs (from Marcel)

- [ ] the research website URL
- [ ] repo list to pull
- [ ] MT5 account type (demo vs live) + broker
- [ ] TradingView plan (webhook alerts need Pro+)
- [ ] which instruments first (FX? indices? crypto?)
