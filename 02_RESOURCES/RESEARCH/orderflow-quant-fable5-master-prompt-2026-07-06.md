# Fable 5 Master Prompt — Orderflow + Quant Trading Build (Free-First, P0→P2)

> Copy-paste handoff artifact. Pair with the plan + research doc. Generated 2026-07-06.
> Plan: https://plan.agent-native.com/plans/plan-dfe4a71e29794c1f
> Research: `02_RESOURCES/RESEARCH/orderflow-quant-pivot-2026-07-06.md`

---

# FABLE 5 — BUILD: Orderflow + Quant Trading System (Free-First, P0→P2)

## Mission
Build the free-first, paper-only orderflow+quant trading system per the approved Agent-Native Plan. Reuse YURI's existing alpha-factor-library; add the missing orderflow/quant spine. DISARMED paper throughout — no live execution, no recurring paid data until an edge is established out-of-sample.

## Read first (context)
- Plan (spec + decisions + phasing + verification): https://plan.agent-native.com/plans/plan-dfe4a71e29794c1f
- Research capture (cited): `02_RESOURCES/RESEARCH/orderflow-quant-pivot-2026-07-06.md`
- YURI contract: `_SYSTEM/yuri-origin.md`, `CLAUDE.md`
- Repo-scrape rule (binding — a prior agent looped on this): `.claude/rules/zread-repo-scrape.md`

## Locked decisions (Marcel, 2026-07-06)
- **P0 instruments:** ES futures + SPX/SPY options.
- **Budget ceiling:** real-time basic ($1–12/mo). Serious orderflow ($380–700 Databento) DEFERRED until an edge is established out-of-sample.
- **nautilus install APPROVED for P0** (Marcel handed this plan to you to execute).
- **Visual layer:** defer to P3.
- **Asian-market scope:** default US-only for P0–P2; revisit at P3.

## Stack (primary-source checked — all $0 at P0)
- **Engine:** nautilus_trader v2 — pip wheel, macOS arm64, LGPL. No Rust toolchain needed.
- **Data (free):** Alpaca + yfinance + Polygon free (OHLCV for IC spine) + Databento **$125 FREE sign-up credit** (real MBP-10 on ES — orderflow proof wedge) + crypto testnet (Binance/Bybit, already wired in YURI).
- **Execution:** IBKR paper + dockerized IB Gateway + nautilus IB adapter. Paper-only.

## Reuse — do NOT rebuild (`_SYSTEM/Scripts/alpha-factor-library/`)
`afl-paper.mjs` · `ofi.mjs` (OFI) · `orderbook-imbalance.mjs` (OBI) · `trade-edge-audit.mjs` (deflated Sharpe / FDR) · `trade-decision-sim.mjs` (CVaR) · `observatory/` (tape-recorder, trades-stream, tape-replay) · `horizon-ladder.mjs` · `ensemble.mjs`. Crypto-only today → extend to equities/futures/options.

## Build (the 5 gaps)
1. **IC computation spine** — per-symbol, per-horizon IC + IR + deflated-Sharpe gate (the missing quant core).
2. **Footprint/AMT value-area composites** on MBP-10 — delta, CVD, POC, value area, composite VA (atop ported OFI/OBI).
3. **GEX self-computed from options chain** — `gamma × OI × 100 × spot² × 0.01 × sign` per strike/expiry (~50 LoC).
4. **Multi-asset instrument layer** — equities / CME futures (ES,NQ,RTY,YM,CL,NG) / options (nautilus instrument model + IBKR definitions).
5. **IBKR paper wiring** — dockerized IB Gateway + nautilus IB adapter, UTC config.

## Phasing (P0→P2 this build; P3–P4 deferred/gated)
- **P0:** nautilus dev env + port OFI/OBI to `OrderBookDelta` + IC spine (DISARMED paper).
- **P1:** footprint/AMT + GEX from OPRA chain + IBKR paper wired.
- **P2:** ensemble + CVaR sizing + walk-forward + Harvey-Liu-Zhu t≈3 multiple-testing gate.
- **P3 (deferred):** visual layer (Rithmic + Bookmap/MotiveWave) + SpotGamma + day-trader fine-tune.
- **P4 (owner-gated):** live IB execution.

## Hard rules (YURI binding floor)
- **Mutation contract:** explicit pathspec only, never `git add .`/bare commit; checks green + `git show --stat` before push; fetch+ff never force.
- **DISARMED-first:** every new mechanism ships DISARMED; arming is owner-gated.
- **Capability-first:** `node _SYSTEM/Scripts/capability-recall.mjs "<need>"` before any new primitive; `@capability`-tag + `capability-scan` to register.
- **Repo scrape:** structure-first via `get_repo_structure`; never guess paths; `code 1015` = permanent; fall back to `node _SYSTEM/Scripts/gh-raw.mjs`.
- **Free-first:** NO paid data subs in P0–P2; use the $125 credit wedge + free OHLCV + crypto testnet.
- **Verify:** attack first-run output; negative/mismatch tests; out-of-sample deflated-Sharpe must clear HLZ t≈3 before any scale.
- **Protected paths** off-limits (`.env`, `node_modules`, `.claude/state`, etc. — see `yuri-origin.md`).

## Done =
P0–P2 DISARMED paper system: IC spine live; OFI/OBI/footprint/GEX ported+built; IBKR paper executing nautilus orders; walk-forward + HLZ gate green out-of-sample. Commit each phase (explicit pathspec); push own work; report changed files + checks + residual risk per phase.

**Start at P0. Report dev-env bring-up + first IC-spine result before P1.**
