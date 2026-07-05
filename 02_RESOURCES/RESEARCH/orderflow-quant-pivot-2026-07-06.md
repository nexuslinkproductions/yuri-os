# Orderflow + Quant Trading Pivot — Research Capture
**Date:** 2026-07-06 · **Author:** Yuri (Claude lane) · **Status:** Phase-1 research complete; all 4 starred repos assessed
**Audience:** Marcel (decision), Fable 5 (build reference)

Marcel is restarting the trading track: pivoting from crypto/HFT to **orderflow + quant-signal trading**, instrument-agnostic but biased to US equities + CME index futures + options (for GEX). Goal: build a system a day trader can fine-tune AND agents can eventually execute autonomously. This doc captures the verified findings that drive the platform + stack decision.

Two methodology tracks from Marcel's transcripts, both verified sound (Part D):
- **Orderflow (human):** real tick/footprint/DOM platform + Bookmap + GEX, stacked on Auction Market Theory (value areas, composite VA, prior value).
- **Quant (agent):** signal = a number that predicts next-period return; measured by IC (5% = strong), Grinold's law (IR = IC × √breadth), Harvey-Liu-Zhu multiple-testing (t-bar ~3 not 2).

---

## 1. The platform decision — verified, not the sloppy matrix

The "which platform" question is the wrong frame. It splits into **four layers sharing one data spine**:

| Layer | Decision | Evidence |
|---|---|---|
| **Engine** (agent-executable, backtest+live) | **nautilus_trader v2** (Rust+PyO3, LGPL v3) | repo `nautechsystems/nautilus_trader`; default branch `develop`; v1.231 final legacy → **v2.0.0rc1** Rust core at release-candidate; orderbook model at `crates/model/src/orderbook/` (book/aggregation/analysis); roadmap explicitly targets "expanded microstructure simulations" |
| **Data spine** | **Databento** — MBP-10 (L2) + MBO (L3) + OPRA options + all CME futures + equities | nautilus `docs/integrations/databento.md`: schema table MBO→`OrderBookDelta`, **MBP_10→`OrderBookDepth10`**, MBP_1→L1; `$125 free credit`; Databento = data-only (pair with execution) |
| **Execution** | **Interactive Brokers** (stocks+options+futures+futures) via dockerized IB Gateway | nautilus `docs/integrations/ib.md`: v2 Rust adapter + PyO3; dockerized gateway for automated deployments; UTC-config requirement |
| **Human visual** (LATER phase) | macOS-native orderflow chart (MotiveWave/Quantower) or Bookmap/ATAS-in-VM | see §3; deferred to day-trader phase |

**nautilus adapters enumerated** (`crates/adapters/`): `interactive_brokers`, `databento`, `tardis`, `architect_ax`, `betfair`, + crypto (binance, bybit, coinbase, kraken, etc.). **No Alpaca/Tradovate/Rithmic-as-broker** — IB is the one tradfi execution path, and it's universal.

**LGPL v3** = commercial-use OK with dynamic-linking obligation (don't statically modify nautilus core; link to it). Confirmed from `LICENSE` (GNU LGPL v3) fetched via `gh-raw.mjs`.

**3 biggest risks of building on nautilus:**
1. **v2 is RC, not final** — release-candidate, 1.x→2.0 cutover in flight; some adapter surfaces deferred. Track breaking changes until 2.0.
2. **Tradfi execution = IB only** — IB Gateway has operational complexity (gateway uptime, session handling, UTC config).
3. **GEX/options-positioning is a build** — nautilus gives you the chain, not gamma levels.

---

## 2. YURI substrate — REUSE, do not rebuild

Existing trading infra (`_SYSTEM/Scripts/alpha-factor-library/`) is **crypto-only but instrument-agnostic in principle**. The pivot extends it to equities/futures/options via Databento, not greenfields.

**Shipped & LIVE (reuse):**
- `afl-paper.mjs` — paper engine, Almgren-Chriss impact, fees, P&L, drawdown, circuit breaker, risk exits
- `observatory/` — live ingest, signal compute, ensemble; `tape-recorder.mjs` (L2 tape), `trades-stream.mjs`, `tape-replay.mjs`
- `ofi.mjs` (Cont-Kukanov-Stoikov order-flow imbalance), `orderbook-imbalance.mjs` (OBI/microprice)
- `trade-edge-audit.mjs` — multi-horizon scoring, **deflated Sharpe, FDR** (the multiple-testing guardrail the quant transcript demands)
- `trade-decision-sim.mjs` — factor-circuit optimization, **CVaR sizing**, correlation-aware
- `horizon-ladder.mjs`, `cross-asset-signal.mjs`, `ensemble.mjs`

**MISSING (the build):** footprint/AMT value-area composites, **IC computation** (the quant spine — currently absent!), GEX from options chains, equities/futures/options instrument layer, a non-Binance data venue, a non-crypto broker.

**Skill triad** (`trade-edge-audit`, `trade-decision-sim`, `peer-signal-build`) — currently crypto-wired; extend to multi-asset.

---

## 3. macOS visual-platform landscape (for the LATER human phase)

Marcel is Apple-Silicon only. Verified 2026 status:

| Platform | macOS | Automation | Orderflow | Notes |
|---|---|---|---|---|
| **MotiveWave** | ✅ native (Java) | broker-neutral API | Volume Imprint, Market Profile | $23–49/mo; dxFeed/Rithmic/CQG native, **not Databento** |
| **Quantower** | ✅ native | Python/Rithmic | Order Flow Surface, DOM | $70/mo; **Polygon native**, not Databento |
| **Bookmap** | ✅ | Rithmic API | heatmap, iceberg/stop detection | $40–150/mo; Rithmic/CQG/dxFeed native |
| **ATAS** | ⚠️ "macOS beta" (historically Windows/.NET — treat as VM-required) | limited | footprint, cumulative delta | free–$70; Rithmic/CQG |
| Sierra Chart / NinjaTrader / Jigsaw | ❌ Windows-only | ACSIL C++ / NinjaScript C# | excellent | Parallels tax |

**Critical:** NO visual platform natively ingests Databento. Visual layer needs Rithmic ($50/mo, futures) or Polygon ($199/asset, no real L2) or a custom DBN→visual bridge. → two-feed architecture, deferred to day-trader phase.

---

## 4. Data-feed + GEX economics (primary-cited)

**Databento = sole full-coverage feed.** Equities ($199 plan) + all CME futures (licensed distributor) + OPRA equity options ($199/mo, 12yr hist) + options-on-futures. MBP-10 workhorse. First-class Python+Rust SDK, arm64-native. **~$380–700/mo serious-retail** (CME Standard $179 + OPRA $199 + historical usage $30–300). $125 credit on signup.

**Disqualified as sole feed:**
- Polygon — no real L2/MBP depth on futures (L1 only); great options chains. $199/asset.
- Rithmic — futures + options-on-futures ONLY; cheapest live CME depth (~$50–230/mo) but no equities/options, weak macOS+Python. Use as visual-layer DOM feed.
- dxFeed — multi-asset but B2B pricing (opaque), macOS MBO parity unconfirmed.
- CME DataMine — historical only. FirstRate Data — one-shot bundles, no streaming/L2.

**GEX build-vs-buy:** **COMPUTE IT.** Inputs per strike/expiry: gamma (from your IV model), OI, multiplier (100), spot, dealer sign (+call/−put). `GEX = Σ gamma × OI × 100 × spot² × 0.01 × sign`. ~50 lines Python. Difficulty: EASY. SpotGamma's moat = proprietary dealer-positioning inference + editorial levels (3,500 equities, 0DTE commentary) — NOT the raw number. Buy SpotGamma Essential (~$99/mo) only for editorial; institutional API $1k+/mo (UNCONFIRMED, sales-only) not worth it now. Unusual Whales ~$44–60/mo dashboard + separately-priced API.

**Recommended stack + cost:**
```
ENGINE:  nautilus_trader ← Databento (MBP-10 + OPRA + CME)   ~$380–700/mo
GEX:     self-computed from Databento OPRA chain              ~$0 incremental
VISUAL:  (LATER) Bookmap/ATAS-VM ← Rithmic                    ~$50–100/mo
EDIT:    (LATER, optional) SpotGamma Essential                ~$99/mo
TOTAL:   Phase-1 floor ~$380–700/mo · full seat ~$530–900/mo
```

---

## 5. Repo leverage (4 starred) — all assessed

- **nautechsystems/nautilus_trader** — ✅ BUILD ON (the engine). See §1.
- **TauricResearch/TradingAgents** (Apache 2.0, Python/LangGraph) — **REFERENCE, fork-and-gut.** Multi-agent debate framework (analyst→researcher→trader→risk). OHLCV+sentiment only — **no orderflow/microstructure at all.** Paid-LLM dependency breaks the $0 constraint. Memory already flagged its in-sample Sharpe 8.21 as overfit. **Carry only the LangGraph debate-orchestration pattern** — strip the LLM analysts, drop in quant-native nautilus-fed nodes (OBI, CVD, depth skew, realized-vol regime). Do not deploy as-is.
- **koala73/worldmonitor** (AGPL platform / MIT SDK, TypeScript) — **IGNORE.** Macro/news/event dashboard, no microstructure; paid Pro API for data calls or heavy self-host (Vercel+Railway+Upstash). For the regime/event-overlay concept, hit FRED/GDELT directly from Python.
- **ZhuLinsen/daily_stock_analysis** (MIT, Python) — **IGNORE.** Daily-OHLCV LLM-prose analysis, China A-share focus, no orderflow. Wrong market, wrong method; free A-share sources don't cover US instruments.

**Load-bearing finding:** *none* of the three provide orderflow/microstructure — that layer comes only from nautilus `OrderBook` + Databento L2 + YURI's own signal code. **No repo dependencies for the free start.** TradingAgents' debate pattern is a design reference for an optional later (P2+) LLM decision overlay.

---

## 6. Recommended phasing (build plan skeleton — full doc after repo agent lands)

- **P0 (now):** nautilus dev env on macOS (v2 rc wheels) + Databento account + $125 credit + MBP-10 backtest of one liquid contract (ES). Port YURI OFI/OBI to nautilus OrderBookDelta. Stand up IC computation (the missing quant spine) + deflated-Sharpe gate (reuse `trade-edge-audit`). DISARMED paper only.
- **P1:** footprint/AMT value-area composites on MBP-10; GEX from OPRA chain; wire IB paper-trading via dockerized gateway.
- **P2:** ensemble the orderflow + GEX + IC signals; CVaR sizing (reuse `trade-decision-sim`); walk-forward + HLZ multiple-testing gate.
- **P3 (day-trader phase):** visual layer (Rithmic + Bookmap/MotiveWave); SpotGamma editorial; fine-tune.
- **P4 (gated, owner):** live agent execution via IB.

**Residual risk:** v2 RC maturity; IB Gateway ops burden; GEX dealer-sign is an approximation (naive ±call/put, not signed trade-flow) — validate against SpotGamma before trusting.

---

## UNCONFIRMED flags (honest)
- Polygon 2026 true L2 depth: no primary source confirms it (treat as L1-only).
- dxFeed macOS MBO parity: comparison-source flag, unconfirmed.
- CME DataMine 2026 per-query rate card: only older guide found.
- SpotGamma institutional API price: sales-only, community-estimated $1k+/mo.
- Tier1Alpha public API existence: unconfirmed.

All other prices/claims are vendor-primary or repo-primary sourced.
