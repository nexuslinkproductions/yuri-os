# Quant Trading — Research Synthesis & YURI Wiring Analysis
**Date:** 2026-06-13
**Type:** Landscape research + capability transfer map
**Sources:** ML4T (stefan-jansen), NautilusTrader (nautechsystems), FinRL (AI4Finance), WorldQuant 101 Alphas, general quant finance literature

---

## 1. WHAT IS "QUANT"?

Quantitative trading = using **mathematical models, statistical analysis, and computational algorithms** to identify and execute trading opportunities. It replaces human intuition/gut-feel with systematic, data-driven decision-making at speeds and scales humans can't match.

The field splits into three core roles:
- **Quant Researcher** — discovers signals (alphas), builds predictive models, designs strategies
- **Quant Trader** — executes strategies, manages risk in real-time, optimizes execution
- **Quant Developer** — builds the infrastructure (low-latency systems, data pipelines, backtesting engines)

## 2. THE QUANT PIPELINE (canonical)

Every quant system follows this loop:

```
DATA INGEST → FEATURE ENGINEERING → ALPHA GENERATION → RISK MANAGEMENT → EXECUTION → P&L FEEDBACK
     ↑                                                                                    |
     └────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Data Ingest
- **Market data**: prices (OHLCV), order books, tick data (nanosecond resolution)
- **Fundamental data**: earnings, balance sheets, macro indicators
- **Alternative data**: satellite imagery, social sentiment, SEC filings, web scraping, news NLP
- **Derived data**: volatility surfaces, correlation matrices, factor exposures

### 2.2 Feature Engineering (Alpha Factor Research)
The core intellectual work. Convert raw data into **predictive signals** (alpha factors).

Major factor categories (from the "factor zoo"):
| Category | What it captures | Examples |
|----------|-----------------|----------|
| **Value** | Underpriced relative to fundamentals | P/E, P/B, EV/EBITDA, FCF yield |
| **Momentum** | Price trends persist | 12-1 month returns, RSI, MACD |
| **Quality** | Fundamental strength | ROE, profit margins, earnings stability |
| **Volatility** | Risk/uncertainty | Realized vol, VIX, options-implied vol |
| **Liquidity** | Trading ease | Bid-ask spread, volume, market cap |
| **Sentiment** | Market mood | News NLP, social media, put/call ratio |
| **Growth** | Future earnings potential | Revenue growth, earnings revisions |

**WorldQuant's 101 Formulaic Alphas** (Kakushadze 2016) — a landmark paper defining 101 computational expressions for trading signals, 80% used in production. Average holding period 0.6–6.4 days. These are pure math expressions over price/volume data.

### 2.3 Strategy Types

| Strategy | What it does | Holding period | Complexity |
|----------|-------------|----------------|------------|
| **Statistical Arbitrage** | Exploit price relationships between correlated assets | Minutes–days | Medium |
| **Pairs Trading** | Long one asset, short a correlated one when spread diverges | Days–weeks | Low–Medium |
| **Momentum / Trend Following** | Bet that recent winners keep winning | Days–months | Low |
| **Mean Reversion** | Bet that extreme prices revert to average | Minutes–days | Medium |
| **Market Making** | Provide liquidity, profit from bid-ask spread | Seconds–minutes | High |
| **Factor Investing** | Systematically tilt toward rewarded factors | Months–years | Medium |
| **ML-Driven** | Supervised/unsupervised models predict returns | Varies | High |
| **Deep RL** | Agent learns trading policy by interacting with market environment | Varies | Very High |
| **NLP/Sentiment** | Extract signals from text (news, filings, transcripts) | Hours–days | High |
| **Options/Volatility** | Trade volatility surfaces, Greeks, exotic structures | Varies | Very High |

### 2.4 Risk Management
- **Position sizing**: Kelly criterion, risk parity, volatility targeting
- **Drawdown control**: max drawdown limits, stop-losses
- **Factor exposure management**: neutralize unwanted factor bets
- **Tail risk**: VaR, CVaR, stress testing
- **Correlation monitoring**: regime detection, correlation breakdown alerts

### 2.5 Execution
- **Slippage modeling**: how much does your trade move the market?
- **Transaction cost analysis**: commissions, market impact, timing
- **Order types**: TWAP, VWAP, iceberg, pegged orders
- **Smart order routing**: venue selection, dark pool access

## 3. THE TOOL ECOSYSTEM

### Open-Source Quant Platforms

| Platform | Language | Focus | Stars |
|----------|----------|-------|-------|
| **NautilusTrader** | Rust + Python | Production-grade multi-venue execution engine | ~5K |
| **QuantConnect/Lean** | C# + Python | Cloud-based algo trading platform | ~10K |
| **Zipline** (ml4trading) | Python | Backtesting engine (formerly Quantopian) | ~18K |
| **Backtrader** | Python | Lightweight backtesting | ~15K |
| **VectorBT** | Python | Vectorized backtesting (fast) | ~5K |
| **FinRL/FinRL-X** | Python | Deep RL for trading | ~10K |
| **QLib** (Microsoft) | Python | AI-oriented quant research platform | ~17K |

### Key Libraries
- **TA-Lib**: 150+ technical indicators (momentum, volatility, overlap, cycle, statistics)
- **Alphalens** (Quantopian): factor analysis and evaluation
- **PyFolio**: portfolio performance and risk analytics
- **Empyrical**: risk/return metrics (Sharpe, Sortino, max drawdown)
- **Pandas/NumPy**: data manipulation backbone
- **Scikit-learn / XGBoost / LightGBM**: supervised ML
- **PyTorch / TensorFlow**: deep learning models
- **Stable-Baselines3**: reinforcement learning algorithms (A2C, PPO, SAC, TD3, DDPG)

## 4. WHAT YURI ALREADY HAS (transferable)

| YURI Mechanism | Quant Equivalent | Transfer Potential |
|----------------|-----------------|-------------------|
| **Golden section search** (`yuri-phi.mjs`) | Derivative-free scalar optimization → parameter tuning | HIGH — tune strategy hyperparameters without gradients |
| **Fibonacci search** (`yuri-phi.mjs`) | Unimodal search → threshold calibration | HIGH — calibrate signal thresholds |
| **Phi-sequence / anti-resonance** (`yuri-phi.mjs`) | Quasi-random sampling, anti-correlated cadence | MEDIUM — sampling cadence for backtesting, avoiding overfitting to regular grids |
| **Decision simulation** (`decision-sim.mjs`) | Robust decision under uncertainty → scenario analysis | HIGH — risk scenario evaluation, portfolio stress testing |
| **Quantum hypothesis simulation** | Order-aware effect tracking → regime detection | MEDIUM — detect when signal ordering matters (non-commuting effects = regime shifts) |
| **Energy gate / computeU** | Risk-adjusted scoring, Lyapunov stability | HIGH — portfolio risk monitoring, drawdown control |
| **Claim-evidence ledger** | P&L attribution, signal provenance | HIGH — track which alpha factors contributed to returns |
| **Cross-domain transfer engine** | Factor discovery across domains | HIGH — the core mechanism for alpha research |
| **Swarm orchestration** | Multi-strategy ensemble, parallel research | HIGH — parallel strategy backtesting, ensemble signals |
| **FTS5 search + xref** | Research corpus, signal database | HIGH — alpha factor library, research knowledge base |
| **Backtesting** (energy trace) | Strategy backtesting | MEDIUM — the energy trace IS a backtest trace; needs financial framing |
| **Bayesian reasoning** | Bayesian portfolio optimization | MEDIUM — dynamic Sharpe ratios, posterior return estimates |

## 5. WHERE YURI BENEFITS — THE WIRING MAP

### Tier 1: Direct Transfer (use what we have)

**A. Alpha Factor Research Engine**
- The cross-domain transfer engine IS alpha research — discover mechanisms in one domain, apply to another
- FTS5 search indexes the research corpus → searchable alpha factor library
- Claim-evidence ledger tracks factor provenance and performance
- **Wiring:** Tag every discovered alpha with `@capability: alpha-factor` metadata

**B. Risk Monitoring via Energy Gate**
- `computeU` already tracks progress-vs-regress dynamics
- Reframe as portfolio risk: positive ΔU = profitable regime, negative = drawdown
- The L∞ floor veto → max drawdown circuit breaker
- **Wiring:** Financial-framed energy gate adapter

**C. Parameter Tuning via Math Primitives**
- Golden section search → tune strategy parameters (moving average lengths, thresholds, lookback windows)
- Fibonacci search → calibrate discrete parameters
- Phi-sequence → anti-correlated backtesting sampling (avoids overfitting)
- **Wiring:** Already built in `yuri-phi.mjs`, needs financial framing

### Tier 2: Moderate Build (leverage existing patterns)

**D. Backtest Framework**
- The energy trace + swarm orchestration → parallel backtest engine
- Decision simulation → scenario analysis under market uncertainty
- Quantum hypothesis simulation → regime detection (non-commuting market effects)
- **Build:** Financial data adapter + P&L calculator + risk metrics wrapper

**E. NLP / Sentiment Pipeline**
- YURI already has text processing (NLP for research corpus)
- Extend to: SEC filings analysis, earnings call transcripts, news sentiment
- ML4T Chapter 14–16 covers this exact pipeline
- **Build:** Financial text ingestion + sentiment scoring

**F. Signal Ensemble / Swarm Alpha**
- Swarm orchestration → run multiple alpha strategies in parallel
- Each "agent" is a strategy with its own signal generation
- Ensemble weighting via the existing scoring/ranking mechanisms
- **Build:** Strategy-as-agent adapter

### Tier 3: Significant Build (new territory)

**G. Live Execution Engine**
- Would need: market data feed, order management, broker connectivity
- NautilusTrader (Rust + Python) is the gold standard open-source option
- Could integrate as an external execution engine YURI dispatches to
- **Build:** Significant — adapter to NautilusTrader or similar

**H. Deep RL Trading Agent**
- FinRL/FinRL-X provides the framework
- YURI's energy gate could serve as the reward function
- **Build:** Significant — requires GPU compute, training infrastructure

## 6. RECOMMENDED FIRST MOVES

1. **Alpha Factor Library** (Tier 1A) — Start indexing quant research into YURI's FTS5 corpus. Tag alpha factors with `@capability` metadata. This costs almost nothing and compounds immediately.

2. **Financial Risk Adapter** (Tier 1B) — Reframe the energy gate for financial risk monitoring. The math is the same (Lyapunov stability = drawdown control). Small adapter, big leverage.

3. **Parameter Tuning CLI** (Tier 1C) — Expose `yuri-phi.mjs` golden section search as a strategy parameter tuner. Already built, needs financial CLI wrapper.

4. **Backtest Skeleton** (Tier 2D) — Build a minimal backtest framework on top of the energy trace + swarm orchestration. Start with historical price data → signal → position → P&L → risk metrics.

5. **Research the execution layer** (Tier 3G) — Before building, study NautilusTrader's architecture. It's Rust-native with Python bindings — could be the execution layer YURI dispatches to.

## 7. KEY REFERENCES

- **ML4T Book** (Stefan Jansen) — 23 chapters, 150+ notebooks, covers the full pipeline from data to deep RL trading
- **WorldQuant 101 Formulaic Alphas** (Kakushadze 2016) — production alpha signals as computational expressions
- **NautilusTrader** — production-grade Rust+Python trading engine
- **FinRL-X** — next-gen AI-native quant trading framework
- **QLib** (Microsoft) — AI-oriented quant research platform
- **TA-Lib** — 150+ technical indicators library

---

## SESSION NOTES
- Date: 2026-06-13
- Sources: ML4T GitHub (full README + alpha factor library), NautilusTrader GitHub, FinRL GitHub, Wikipedia (blocked by download-chain rule), Investopedia (blocked)
- Local search: xref-query + capability-recall — no existing quant mechanisms found
- Web search API: down (mimo-v2-flash model error)
- Synthesized from: fetched raw GitHub READMEs + domain knowledge
- Next: capability registration for any promoted mechanisms
