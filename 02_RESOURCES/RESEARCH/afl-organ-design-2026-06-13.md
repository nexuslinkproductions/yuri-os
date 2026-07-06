# AFL Organ Design — Organ Design Document
**Date:** 2026-06-13
**Source:** Nano-swarm synthesis (7 agents: 5 research + 1 Opus synthesis + 1 Opus validation)
**Workflow:** wf_1442e4de-598

---

Now I have all the verified exports and file paths. Here is the complete organ design document.

---

# Alpha Factor Library -- Organ Design Document

**Date:** 2026-06-13
**Status:** DESIGN (pre-build)
**Author:** Marcel + Claude (Rick lane)
**Authority:** _SYSTEM/yuri-origin.md > SOUL.md > this document

---

## 1. ORGAN IDENTITY

**Name:** Alpha Factor Library (AFL)

**Purpose:** Persistent registry, evaluation engine, and quantum-sequenced combination optimizer for quantitative alpha factors -- YURI's organ for systematic signal discovery, backtest tracking, and portfolio construction across crypto and prediction markets.

**One-line:** YURI's quant research brain -- stores factors, scores them, sequences them non-commutatively, and gates their lifecycle through the energy gate.

**Authority placement:** This organ is a Track A consumer and producer. Factor lifecycle events (discovery, backtest, promotion, demotion, retirement) are canonical memory entries governed by `memory-kernel.mjs`. Factor claims climb the promotion ladder through `claim-cortex.mjs`. Factor proposals pass through the energy gate (`yuri-energy.mjs` / `energy-tick-core.mjs`). The organ does not own execution authority -- it produces advisory signals that the owner gates.

**Existing organs touched (tight coupling -- direct import):**

| Organ | File | Function(s) consumed | Relationship |
|---|---|---|---|
| Energy Gate | `_SYSTEM/Scripts/math/yuri-energy.mjs` | `computeU`, `gateProposal` | Factor lifecycle transitions (promote/demote/retire) are energy-gated proposals |
| Energy Tick | `_SYSTEM/Scripts/energy-tick-core.mjs` | `tickAndTrace`, `evaluateTransition`, `freshState` | Factor circuit quality recorded as ΔU trace entries |
| Claim Cortex | `_SYSTEM/Scripts/claim-cortex.mjs` | `assessClaim`, `cortexSnapshot`, `gateClaimTransition`, `evidenceStatusRank` | Every factor IS a claim climbing the hypothesis→fact ladder |
| Prediction Ledger | `_SYSTEM/Scripts/prediction-ledger.mjs` | `recordPrediction`, `recordOutcome`, `scorePrediction`, `calibrationReport` | Factor signals are predictions; calibration tracks honesty |
| Truth Maintenance | `_SYSTEM/Scripts/truth-maintenance.mjs` | `createTms`, `assertPremise`, `addJustification`, `retract`, `affectedBy` | Factor dependency graph; retraction cascades on retirement |
| Decision Sim | `_SYSTEM/Scripts/decision-sim.mjs` | `robustScore`, `crossEntropyOptimize`, `pgdWitness`, `infoGapHorizon` | Factor portfolio optimization under uncertainty |
| Quantum Tracker | `_SYSTEM/Scripts/quantum-hypothesis-tracker.mjs` | `stateVector`, `projector`, `measureSequential`, `qqEquality`, `schmidtDecomposition` | Non-commutative factor sequencing engine |
| Izanagi Bridge | `_SYSTEM/Scripts/izanagi-bridge.mjs` | `cornerAwareReadout`, `flipThresholds`, `izanagiRuling` | Corner-law guard on factor combination robustness |
| Eval Processing | `_SYSTEM/Scripts/eval-processing.mjs` | `mkAggregator`, `pairedDelta`, `sequentialDecide`, `heldOutSplit`, `conformalQuantile` | Backtest statistics, overfit detection, early stopping |
| Formula Foundry | `_SYSTEM/Scripts/math/formula-foundry.mjs` | `classifyDimension`, `composeCheck`, `catalogFormulas` | Factor formula type-checking and composition validation |
| Math Kernel | `_SYSTEM/Scripts/math/math-kernel.mjs` | `entropy`, `klDivergence`, `brierScore`, `confidenceDecay`, `normalizeDistribution` | Shared deterministic math primitives for scoring |
| Phi Sequencer | `_SYSTEM/Scripts/math/yuri-phi.mjs` | `phiSequence`, `goldenSectionSearch` | Anti-resonant sampling of factor ordering permutations |
| Memory Kernel | `_SYSTEM/Scripts/memory-kernel.mjs` | propose→decide→ledger pipeline | Factor lifecycle events as Track A canonical memory |
| Spreading Activation | `_SYSTEM/Scripts/spreading-activation-memory.mjs` | PageRank + Hebbian co-recall | Associative factor recall (factors recalled together wire together) |
| FSRS | `_SYSTEM/Scripts/math/yuri-fsrs.mjs` | power-law retrievability | Factor evidence decay follows FSRS curve |
| OpenProcess Pool | `_SYSTEM/Scripts/openprocess-pool.mjs` | composite scoring | Factor research items rise in attention via staleness |
| Nerve | `_SYSTEM/Scripts/yuri-nerve.mjs` | event capture, organ-state digest | Factor lifecycle events captured once, threaded across organs |
| Navigate | `_SYSTEM/Scripts/yuri-navigate.mjs` | centrality scoring | Factor importance by structural centrality |
| Propagation Scan | `_SYSTEM/Scripts/propagation-scan.mjs` | change blast radius | Pre-edit blast radius for factor implementations |

**Existing organs touched (loose coupling -- adapter or advisory):**

| Organ | File | Relationship |
|---|---|---|
| LLM Compat | `_SYSTEM/Scripts/llm-compat-contract.mjs` | Lane routing for factor research tasks |
| Autonomy Runner | `_SYSTEM/Scripts/yuri-autonomy-runner.mjs` | Autonomous factor discovery at L2/L3 |
| Workcell | `_SYSTEM/Scripts/yuri-workcell.mjs` | Parallel factor research across Sonnet workers |
| Cost Pool | `_SYSTEM/Scripts/cost-reservation-pool.mjs` | Admission gate for heavy backtest tasks |
| xref Query | `_SYSTEM/Scripts/xref-query.mjs` | Factor search surface (add `passAlphaFactors`) |

---

## 2. ARCHITECTURE

### 2.1 Component Diagram

```
                         ┌─────────────────────────────────────────────┐
                         │           MARKET DATA LAYER                 │
                         │  Coinbase REST/WS  ·  Polymarket CLOB/WS   │
                         │  OHLCV · Orderbook · Sentiment · On-chain   │
                         └──────────────────┬──────────────────────────┘
                                            │ raw data feeds
                                            v
┌───────────────────────────────────────────────────────────────────────────────┐
│                         FACTOR COMPUTATION ENGINE                            │
│                                                                               │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐   ┌───────────────┐  │
│  │  Momentum    │   │  Trend /     │   │  Volatility  │   │  Volume /     │  │
│  │  Factors (12)│   │  Overlap (10)│   │  Factors (8) │   │  Liquidity (8)│  │
│  └──────┬──────┘   └──────┬───────┘   └──────┬───────┘   └──────┬────────┘  │
│         │                 │                   │                   │           │
│  ┌──────┴──────┐   ┌──────┴───────┐   ┌──────┴───────┐   ┌──────┴────────┐  │
│  │  Sentiment   │   │  Cross-Sect  │   │  Crypto-     │   │  Value /      │  │
│  │  Factors (5) │   │  Factors (4) │   │  Native (2)  │   │  Quality (11) │  │
│  └──────┬──────┘   └──────┬───────┘   └──────┬───────┘   └──────┬────────┘  │
│         └─────────────────┴───────────────────┴───────────────────┘           │
│                                    │                                          │
│                                    v                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    QUANTUM SEQUENCING ENGINE                            │  │
│  │  quantum-hypothesis-tracker.mjs + yuri-phi.mjs + decision-sim.mjs      │  │
│  │  Commutativity matrix → Phi-sequence sampling → Circuit DAG → Robust   │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │ factor signals + circuit scores
                                        v
┌───────────────────────────────────────────────────────────────────────────────┐
│                         RISK & EVIDENCE LAYER                                │
│                                                                               │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │ Claim Cortex  │  │ Prediction    │  │ Truth        │  │ Eval          │   │
│  │ (promotion    │  │ Ledger        │  │ Maintenance  │  │ Processing    │   │
│  │  ladder)      │  │ (calibration) │  │ (dependency  │  │ (backtest     │   │
│  │              │  │              │  │  graph)       │  │  stats)       │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘   │
│         └─────────────────┴──────────────────┴──────────────────┘            │
│                                    │                                          │
│                                    v                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                         ENERGY GATE                                     │  │
│  │  yuri-energy.mjs (computeU / gateProposal)                             │  │
│  │  energy-tick-core.mjs (tickAndTrace / evaluateTransition)              │  │
│  │  Factor lifecycle: hypothesis → backtested → paper-traded → live       │  │
│  │  Circuit quality: quantumScore / classicalScore → ΔU progress/regress  │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │ gated signals (advisory)
                                        v
┌───────────────────────────────────────────────────────────────────────────────┐
│                         VENUE ADAPTERS (advisory mode)                        │
│                                                                               │
│  ┌──────────────────────────┐     ┌──────────────────────────┐               │
│  │  Coinbase Advanced Trade  │     │  Polymarket CLOB         │               │
│  │  - product discovery      │     │  - market discovery      │               │
│  │  - candles + L2 book      │     │  - orderbook + trades    │               │
│  │  - order advisory         │     │  - order advisory        │               │
│  │  - portfolio state        │     │  - position state        │               │
│  └──────────────────────────┘     └──────────────────────────┘               │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    UNIFIED PORTFOLIO ABSTRACTION                        │  │
│  │  Position · Order · Fill · Balance — venue-agnostic representation     │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │
                                        v
┌───────────────────────────────────────────────────────────────────────────────┐
│                         PERSISTENT STORAGE                                    │
│                                                                               │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────────┐  │
│  │ alpha-factors.db    │  │ prediction-ledger    │  │ memory.db            │  │
│  │ (FTS5, lineage,     │  │ .jsonl               │  │ (Track A lifecycle   │  │
│  │  perf log, embed)   │  │ (factor predictions) │  │  memory entries)     │  │
│  └─────────────────────┘  └─────────────────────┘  └──────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow (end-to-end)

```
Market Data Ingestion
  │
  ├── Coinbase REST: GET /api/v3/brokerage/products, /candles, /ticker
  ├── Coinbase WS: ticker, level2, market_trades, candles channels
  ├── Polymarket REST: Gamma /markets, /events + CLOB /orderbook, /price
  └── Polymarket WS: orderbook + trades channels
  │
  v
Factor Computation (per-bar or per-event)
  │
  ├── Raw indicators: TA-Lib functions (RSI, MACD, ATR, BB, etc.)
  ├── Derived factors: WQ#001..WQ#101 formulaic alphas
  ├── Sentiment: NLP pipeline output → sentiment score
  └── Crypto-native: funding rate, on-chain metrics
  │
  v
Signal Generation
  │
  ├── Per-factor signal: raw_value → z-score → percentile_rank → signal [-1, +1]
  ├── Quantum sequencing: measureSequential([P_σ(1), ..., P_σ(k)], |ψ⟩)
  └── Combined signal: weighted portfolio of sequenced factor signals
  │
  v
Risk Gating
  │
  ├── Energy gate: gateProposal({before, after, weights}) → accept/reject
  ├── Position sizing: half-Kelly with 5-10% max single-position
  ├── Drawdown circuit breaker: L∞ veto on 15-20% peak drawdown
  └── LLM risk: hallucination check (compare LLM claim vs API data)
  │
  v
Execution Advisory (Phase 3+)
  │
  ├── Coinbase: limit/market order parameters, bracket orders
  ├── Polymarket: GTC limit orders on binary outcome tokens
  └── Unified: Order {venue, side, size, price, type} → owner approval
```

### 2.3 Storage Layer

**Primary DB:** `_SYSTEM/OS_KERNEL/alpha-factors.db` (separate file, WAL mode, busy_timeout 5000ms)

Schema defined in `_SYSTEM/OS_KERNEL/alpha-factors-schema.sql`. Six tables:

1. **`alpha_factors`** -- core fact table (id, name, category, formula, data_inputs, complexity, holding_period, sharpe_estimate, correlation_cluster, crypto_compatible, polymarket_compatible, backtest_results, provenance, status, tags, metadata_json, timestamps). Indexed on category, status, cluster, sharpe, crypto, polymarket.

2. **`alpha_factors_fts`** -- FTS5 virtual table (name weight 2.0, category weight 1.5, formula_desc weight 1.0). Content-synced via AFTER INSERT/UPDATE/DELETE triggers. Same `porter unicode61` tokenizer as `search-index.db`.

3. **`factor_lineage`** -- directed derivation graph (parent_id → child_id with transform description and confidence). Supports recursive CTE traversal for ancestor/descendant queries.

4. **`factor_performance_log`** -- time-series append (factor_id, recorded_at, metric, value, universe, timeframe, regime). Indexed on factor_id, metric, recorded_at.

5. **`factor_embeddings`** -- future-proof vector storage (factor_id, model, dimension, vector BLOB). No-op until embedding provider lands.

6. **Updated-at trigger** -- auto-touches `updated_at` on row mutation.

**Integration with existing search:** Add `passAlphaFactors()` to `_SYSTEM/Scripts/xref-query.mjs` alongside the existing `passFts5()`. Opens `alpha-factors.db` read-only, queries `alpha_factors_fts` with `bm25()` ranking and `snippet()` extraction. This surfaces alpha factors automatically in cross-reference searches.

### 2.4 Integration Points (specific functions, specific hooks)

**Factor lifecycle → Energy gate:**
```javascript
import { gateProposal } from '_SYSTEM/Scripts/math/yuri-energy.mjs';
import { computeU } from '_SYSTEM/Scripts/math/yuri-energy.mjs';

// Promoting a factor from hypothesis to backtested:
const verdict = gateProposal({
  before: { factorStatus: 'hypothesis', backtestSharpe: null },
  after:  { factorStatus: 'backtested', backtestSharpe: 1.2 },
  weights: alphaFactorWeights  // from energy-weights.json alpha section
});
```

**Factor claims → Claim cortex:**
```javascript
import { assessClaim, cortexSnapshot } from '_SYSTEM/Scripts/claim-cortex.mjs';

// Every factor IS a claim:
const claim = {
  id: 'momentum-12m-reversal',
  text: '12-month momentum reversal predicts negative returns with Sharpe > 1.0',
  evidence: [{ type: 'backtest', sharpe: 1.2, period: '2020-2025', universe: 'BTC-perp' }]
};
const verdict = assessClaim(claim);  // climbs promotion ladder
```

**Factor signals → Prediction ledger:**
```javascript
import { recordPrediction, recordOutcome, calibrationReport } from '_SYSTEM/Scripts/prediction-ledger.mjs';

// At signal time:
recordPrediction({
  id: `factor-signal-${factorId}-${timestamp}`,
  claim: `${factorId} signals ${direction} at confidence ${confidence}`,
  horizon: '7d',
  source: 'alpha-factor-library'
});

// At resolution:
recordOutcome({ predictionId: `factor-signal-${factorId}-${timestamp}`, outcome: realizedReturn });
```

**Factor dependencies → Truth maintenance:**
```javascript
import { createTms, assertPremise, addJustification, retract, affectedBy } from '_SYSTEM/Scripts/truth-maintenance.mjs';

const tms = createTms();
assertPremise(tms, 'behavioral-bias-exists', 'empirical-research');
addJustification(tms, {
  consequent: 'momentum-works',
  inList: ['behavioral-bias-exists'],
  informant: 'factor-theory'
});
// When a premise is retracted:
retract(tms, 'behavioral-bias-exists');
const cascade = affectedBy(tms, 'momentum-works');  // surfaces all dependents
```

**Factor combination → Quantum sequencing:**
```javascript
import { stateVector, projector, measureSequential, qqEquality, schmidtDecomposition }
  from '_SYSTEM/Scripts/quantum-hypothesis-tracker.mjs';
import { phiSequence } from '_SYSTEM/Scripts/math/yuri-phi.mjs';
import { crossEntropyOptimize, robustScore, pgdWitness }
  from '_SYSTEM/Scripts/decision-sim.mjs';

// Build projectors for each factor:
const factors = ['momentum-12m', 'rsi-14', 'bollinger-squeeze', 'funding-rate-mom'];
const projectors = factors.map(f => projector(normalize(factorAngleVector(f))));

// Test commutativity:
const commutatorNorm = (P_i, P_j) => norm(matMul(P_i, P_j) - matMul(P_j, P_i));

// Sample orderings via phi-sequence:
const sampleCount = 200;
const phiIndices = phiSequence(sampleCount);
const orderings = phiIndices.map(x => lehmerDecode(Math.floor(x * factorial(factors.length)), factors.length));

// Score each ordering:
const scores = orderings.map(sigma => {
  const ordered = sigma.map(i => projectors[i]);
  return measureSequential(ordered, psi).jointProbability;
});
```

**Factor backtests → Eval processing:**
```javascript
import { mkAggregator, heldOutSplit, inSampleVsHeldout, conformalQuantile, sequentialDecide }
  from '_SYSTEM/Scripts/eval-processing.mjs';

// Stream backtest results without storing rows:
const agg = mkAggregator({ reservoir: 1000 });
for (const result of backtestStream) agg.push(result.pnl);

// Detect overfit:
const { optimismGap } = inSampleVsHeldout(
  factorDefinitions,
  def => backtest(def),      // fit function
  def => outOfSampleSharpe(def)  // score function
);

// Early stop when confidence clears threshold:
const decision = sequentialDecide(nextBacktestResult, { threshold: 0.5, alpha: 0.05 });
```

**Factor formulas → Formula foundry:**
```javascript
import { classifyDimension, composeCheck, catalogFormulas }
  from '_SYSTEM/Scripts/math/formula-foundry.mjs';

// Type-check factor formula composition:
const momentumCard = { output: 'probability', inputs: ['close', 'returns'] };
const volCard = { output: 'bits', inputs: ['close', 'high', 'low'] };
const canCompose = composeCheck(momentumCard, volCard);  // false — dimension mismatch
```

**Factor scoring → Math kernel:**
```javascript
import { entropy, klDivergence, brierScore, confidenceDecay }
  from '_SYSTEM/Scripts/math/math-kernel.mjs';

// Factor diversification via entropy:
const factorWeights = [0.3, 0.2, 0.15, 0.1, 0.1, 0.15];
const diversification = entropy(factorWeights);  // higher = more diversified

// Factor calibration via Brier score:
const calibration = brierScore(factorPredictions, actualOutcomes);  // lower = better

// Factor evidence aging:
const decayedConfidence = confidenceDecay(initialConfidence, daysSinceConfirmation, halfLifeDays);
```

---

## 3. ALPHA FACTOR SEED CORPUS

### 3.1 Initial Registration (60 factors, 9 categories)

The seed corpus is sourced from the taxonomy at `02_RESOURCES/RESEARCH/alpha-factor-taxonomy-2026-06-13.md`. Full registration happens in Phase 0 by inserting into `alpha_factors` via the schema from Dimension 3.

**Category breakdown:**

| Category | Count | Crypto-compatible | Polymarket-compatible | Key factors |
|---|---|---|---|---|
| Momentum | 12 | 12 direct | 8 adapt | RSI, MACD, ROC, ADX, Aroon, CCI, Stochastic, Williams %R, Ultimate Osc, MFI, WQ#001, WQ#012 |
| Trend/Overlap | 10 | 10 direct | 2 adapt | SMA, EMA, BB Squeeze, BB %B, Parabolic SAR, KAMA, HT Trendline, Ichimoku, TEMA, WQ#032 |
| Volatility | 8 | 8 direct | 2 adapt | ATR, NATR, Hist Vol, Realized Vol Ratio, Garman-Klass, Parkinson, Intraday Vol Intensity, WQ#046 |
| Volume/Liquidity | 8 | 8 direct | 0 | OBV, Chaikin AD/ADOSC, VWAP Dev, Amihud Illiquidity, Volume Ratio, WQ#006, WQ#043 |
| Value | 6 | 0 (need on-chain subs) | 0 | B/M, Earnings Yield, Dividend Yield, FCF Yield, Sales/Price, EV/EBITDA |
| Quality | 5 | 0 (need on-chain subs) | 0 | Gross Profitability, ROE, Accruals, Piotroski F-Score, Altman Z-Score |
| Sentiment | 5 | 3 adapt | 4 adapt | News NLP, Social Media Buzz, Fear & Greed, IV Spread, Google Trends |
| Cross-Sectional | 4 | 4 direct | 0 | Market Beta, Size, Idiosyncratic Vol, WQ#002 |
| Crypto-Native | 2 | 2 direct | 2 direct | Funding Rate Momentum, Prediction Market Calibration |

**Value/Quality substitution plan:** The 11 value+quality factors have no direct crypto equivalent. On-chain substitutes:
- B/M → TVL/Market Cap ratio
- Earnings Yield → Fee Revenue / Market Cap
- Dividend Yield → Staking Yield
- FCF Yield → (Fee Revenue - Token Emissions) / Market Cap
- ROE → Protocol Revenue / Treasury
- Piotroski F-Score → 9-point on-chain health score (active addresses, fee growth, holder distribution, etc.)

These get registered as separate factors with `crypto_compatible = 1` and `provenance` linking to the traditional factor they substitute.

### 3.2 Metadata Schema

Each factor record in `alpha_factors` carries:

```json
{
  "id": "momentum-12m-reversal",
  "name": "12-Month Momentum Reversal",
  "category": "momentum",
  "formula": "rank(Ts_ArgMax(power(returns < 0, 2), 5)) - 0.5",
  "formula_desc": "Ranks the squared negative returns over the last 5 days. Captures mean-reversion in momentum: assets with recent large drawdowns tend to bounce.",
  "data_inputs": ["close", "returns"],
  "complexity": "medium",
  "holding_period": "daily",
  "sharpe_estimate": null,
  "correlation_cluster": "WQ-MEAN-REV",
  "crypto_compatible": 1,
  "polymarket_compatible": 0,
  "backtest_results": null,
  "provenance": "Kakushadze 2016, WQ#001",
  "status": "hypothesis",
  "tags": ["worldquant", "mean-reversion", "formulaic"],
  "metadata_json": {
    "wq_id": 1,
    "avg_holding_days": 5.3,
    "inputs_raw": ["returns"],
    "complexity_class": "O(n)"
  }
}
```

### 3.3 Factor Evaluation Pipeline

A factor moves through the promotion ladder:

```
hypothesis → backtested → paper-traded → live → retired
```

Each transition is gated:

1. **hypothesis → backtested:** Requires backtest on at least 1 year of data, held-out validation (`inSampleVsHeldout` from `eval-processing.mjs`), optimism gap < 0.3, and conformal confidence bar. The backtest results populate `backtest_results` JSON and `factor_performance_log`.

2. **backtested → paper-traded:** Requires `gateProposal` approval from `yuri-energy.mjs`. Energy terms: alpha = entropy of factor-promotion distribution (are we promoting too many?), epsilon = information gain from backtest, zeta = staleness of evidence, theta = over-claim on unverified factors. Claim must reach at least `supported` rank in `claim-cortex.mjs`.

3. **paper-traded → live:** Requires real-time paper trading P&L tracked in `factor_performance_log` for at least 30 days, calibration report from `prediction-ledger.mjs` showing Brier score < 0.25, and no energy gate veto. Owner approval required.

4. **Any → retired:** Triggered by: (a) Brier score > 0.35 over trailing 90 days, (b) energy gate L∞ veto on max-severity term, (c) truth-maintenance retraction cascade from a foundational premise, or (d) owner decision. Retirement cascades through `affectedBy()` in truth-maintenance.

**Scoring functions for factor quality:**

```javascript
// Composite factor quality score (used in ranking, not gating):
function factorQualityScore(factor) {
  const backtestSharpe = factor.backtest_results?.sharpe ?? 0;
  const calibration = factor.calibration_brier ?? 0.5;  // lower is better
  const evidenceAge = daysSince(factor.last_confirmed);
  const retrievability = fsrsRetrievability(factor.stability, evidenceAge);
  const diversification = 1 - maxPairwiseCorrelation(factor, existingPortfolio);

  return 0.35 * backtestSharpe
       + 0.25 * (1 - calibration)
       + 0.20 * retrievability
       + 0.20 * diversification;
}
```

---

## 4. QUANTUM SEQUENCING ENGINE

### 4.1 Non-Commutative Factor Combination

Alpha factor combination is order-dependent. Applying factor A then factor B to a portfolio state produces a materially different result than B-then-A. This is structurally identical to non-commuting quantum observables.

**The mapping:**
- Each alpha factor `f_i` becomes a rank-1 projector `P_i = |v_i⟩⟨v_i|` in ℝ^N
- The initial portfolio state is `|ψ⟩` (a unit vector encoding current beliefs/exposures)
- Applying factors sequentially: `|ψ_out⟩ = P_{σ(k)} ... P_{σ(2)} P_{σ(1)} |ψ⟩`
- The joint probability `‖P_{σ(k)} ... P_{σ(1)} |ψ⟩‖²` measures how well the factor combination "resonates" with the initial state

**Commutativity detection:**
```javascript
function commutatorNorm(P_i, P_j) {
  return norm(matMul(P_i, P_j) - matMul(P_j, P_i));  // Frobenius norm
}
// < ε (1e-10) → commute → order irrelevant
// >= ε → non-commutating → ordering matters
```

This partitions the factor set into equivalence classes: within each class, order doesn't matter; between classes, it does.

**The QQ-equality diagnostic:**
```javascript
const qq = qqEquality(psi, P_i, P_j);
// |qq.statistic| ≈ 0 → pair commutes
// large |qq.statistic| → strong order dependence
```

**Schmidt coupling detection:**
```javascript
const { rank } = schmidtDecomposition(psi_AB, m, n);
// rank = 1 → factors act independently (product state)
// rank > 1 → factors are entangled (non-separable, ordering critical)
```

### 4.2 Factor Circuit DAG

A factor circuit is a DAG where:
- **Nodes** = factor applications (each with its projector `P_i`)
- **Edges** = ordering constraints (edge from `f_i` to `f_j` means `f_i` before `f_j`)
- **Parallel nodes** (no path between them) = commuting factors, any order fine

The circuit's output state is the sequential measurement along any topological sort consistent with the DAG.

### 4.3 Phi-Sequence Sampling

For the non-commutating subset, the search space is the set of permutations. Rather than exhaustive enumeration (k! grows fast), use `phiSequence` from `yuri-phi.mjs` for quasi-uniform, anti-resonant sampling.

```javascript
import { phiSequence } from '_SYSTEM/Scripts/math/yuri-phi.mjs';

const sampleCount = 200;
const phiIndices = phiSequence(sampleCount);

// Map each phi-sample to a permutation via Lehmer code:
const orderings = phiIndices.map(x => {
  const idx = Math.floor(x * factorialCount);
  return lehmerDecode(idx, factorCount);
});
```

The three-distance theorem guarantees at most 3 distinct gap sizes between consecutive samples in the projected 1-D ordering space. This is the structural advantage: phi-sequencing spends comparisons optimally when the structure is ordered and resonance-prone. The orderings that naive enumeration or random sampling would never reach -- because they cluster -- are precisely where the breakthroughs hide.

### 4.4 Robust Scoring via Decision-Sim

The sampled orderings feed into `crossEntropyOptimize` from `decision-sim.mjs`:

```javascript
const problem = {
  name: 'factor-circuit-optimization',
  discrete: {
    ordering: sampledOrderings  // from phi-sequence
  },
  continuous: Object.fromEntries(
    factors.map((f, i) => [`angle_${i}`, [0, Math.PI]])
  ),
  sampleParams(rng) {
    return { theta: rng() * Math.PI };  // uncertainty in initial state
  },
  value(config, params) {
    const psi = stateVector([Math.cos(params.theta), Math.sin(params.theta)]);
    const ordered = config.ordering.map(i => factorProjectors[i]);
    return measureSequential(ordered, psi).jointProbability;
  }
};

const result = crossEntropyOptimize(problem, { draws: 200, generations: 10 });
// result.bestConfig contains the robust-optimal ordering
```

The CVaR tail scoring (`robustScore`: `0.5*mean + 0.5*CVaR(0.1)`) ensures the selected ordering performs well even under adversarial state conditions.

**Corner-law guard via izanagi-bridge:**
```javascript
import { cornerAwareReadout, flipThresholds } from '_SYSTEM/Scripts/izanagi-bridge.mjs';

// After finding the optimal ordering, verify it's robust across the uncertainty box:
const ruling = cornerAwareReadout(problem, [bestConfig], { draws: 4000 });
// ruling.robust = true means the ordering survives vertex enumeration

// Human-readable failure conditions:
const thresholds = flipThresholds(problem, bestConfig, { nominal: nominalParams });
// "This factor combo loses only when vol > X and momentum < Y"
```

### 4.5 Energy Gate as Quality Scorer

The circuit quality metric feeds into the energy gate:

```javascript
import { computeU, gateProposal } from '_SYSTEM/Scripts/math/yuri-energy.mjs';

const quantumScore = measureSequential(orderedProjectors, psi).jointProbability;
const classicalScore = factors.reduce((prod, f) => prod * measure(f.projector, psi).probability, 1);
const circuitQuality = quantumScore / classicalScore;
const deltaU = circuitQuality - 1.0;  // positive = quantum advantage

// Record as energy trace:
const verdict = gateProposal({
  before: { circuitScore: classicalScore },
  after:  { circuitScore: quantumScore },
  weights: alphaFactorWeights
});
// verdict.accepted = true means the ordering improvement is real, not noise
```

---

## 5. TRADING VENUE ADAPTERS

### 5.1 Coinbase Advanced Trade Adapter

**File:** `_SYSTEM/Scripts/alpha-factor-library/coinbase-adapter.mjs`

**Authentication:** Cloud API Keys (EC private key + key name), JWT-signed requests. Keys stored in `.env` (NEVER read directly -- use `process.env.COINBASE_API_KEY` and `process.env.COINBASE_API_SECRET` via existing env wrappers).

**Capabilities consumed:**
- Product discovery: `GET /api/v3/brokerage/products` -- enumerate available trading pairs
- Market data: `GET /api/v3/brokerage/products/{id}/candles` (1m to 1d), `/ticker`, `/market_book` (L2)
- WebSocket: `ticker`, `level2`, `market_trades`, `candles`, `user` channels
- Order advisory: construct order parameters (limit/market/bracket) without executing

**Rate limits:** 30 req/s REST. Built-in throttling in the adapter (token bucket). WebSocket unlimited reads.

**Fee model:** 0.00%-0.60% tiered. First tier: 0.60% taker / 0.40% maker. Adapter computes effective cost per trade for factor P&L attribution.

```javascript
// Adapter interface (advisory mode -- no execution without owner approval):
const coinbaseAdapter = {
  async getProducts() { /* GET /products, return unified Product[] */ },
  async getCandles(productId, granularity, start, end) { /* OHLCV[] */ },
  async getTicker(productId) { /* {bid, ask, mid, last, volume} */ },
  async getOrderBook(productId, level = 2) { /* {bids, asks} */ },
  async getAccountBalances() { /* unified Balance[] */ },

  // Advisory only -- returns order parameters, does NOT submit:
  buildOrder({ productId, side, size, price, type, timeInForce }) {
    return { venue: 'coinbase', product_id: productId, side, type,
             base_size: size.toString(), limit_price: price?.toString(),
             time_in_force: timeInForce ?? 'GTC' };
  }
};
```

### 5.2 Polymarket CLOB Adapter

**File:** `_SYSTEM/Scripts/alpha-factor-library/polymarket-adapter.mjs`

**Authentication:** Polygon private key (EOA) signs orders via EIP-712 typed data. API credentials derived from wallet signature. Chain ID: 137 (Polygon). Keys stored in `.env`.

**Capabilities consumed:**
- Market discovery: Gamma Markets API (`/markets`, `/events`) -- enumerate prediction markets
- Market data: CLOB orderbook (`get_order_book`), midpoint, price, trade history
- Price history: interval-based queries for backtesting
- Order advisory: construct GTC limit orders on binary outcome tokens

**Fee model:** 0% trading fee. Implicit cost is bid-ask spread (thin markets can have wide spreads). Adapter computes spread-adjusted edge for position sizing.

```javascript
// Adapter interface (advisory mode):
const polymarketAdapter = {
  async getMarkets({ category, active = true }) { /* Market[] */ },
  async getMarketBook(conditionId) { /* {yes_bids, yes_asks, no_bids, no_asks} */ },
  async getPriceHistory(conditionId, interval) { /* PriceHistoryPoint[] */ },
  async getPositions() { /* unified Position[] */ },

  // Advisory only:
  buildOrder({ conditionId, side, size, price, outcome }) {
    return { venue: 'polymarket', condition_id: conditionId, side,
             size: size.toString(), price: price.toString(),
             token_id: outcome === 'yes' ? yesTokenId : noTokenId,
             type: 'GTC' };
  }
};
```

### 5.3 Unified Portfolio Abstraction

**File:** `_SYSTEM/Scripts/alpha-factor-library/portfolio-abstract.mjs`

Venue-agnostic types:

```javascript
// Unified position across venues:
const Position = {
  venue: 'coinbase' | 'polymarket',
  asset: string,          // product_id or condition_id
  side: 'long' | 'short',
  size: number,           // in base asset or shares
  entry_price: number,
  current_price: number,
  unrealized_pnl: number,
  venue_specific: object   // raw venue data
};

// Unified order:
const Order = {
  venue: 'coinbase' | 'polymarket',
  asset: string,
  side: 'buy' | 'sell',
  size: number,
  price: number | null,   // null = market order
  type: 'limit' | 'market',
  time_in_force: 'GTC' | 'GTD' | 'FOK',
  status: 'advisory' | 'submitted' | 'filled' | 'cancelled'
};

// Unified fill:
const Fill = {
  venue: string, asset: string, side: string,
  size: number, price: number, fee: number, fee_currency: string,
  timestamp: string, order_id: string
};
```

**LLM risk mitigation specific to venue adapters:**
- The LLM NEVER generates price or position data. All market data comes from the API and is passed TO the LLM as context.
- Position sizing is computed by deterministic code (half-Kelly), not by the LLM.
- Order parameters are constructed by the adapter, reviewed by the owner, then submitted.
- The LLM's role is signal generation and thesis evaluation, not execution.

---

## 6. RISK FRAMEWORK

### 6.1 Position Sizing (Half-Kelly)

```javascript
function halfKelly(edge, odds, maxFraction = 0.10) {
  // edge: estimated probability advantage over market (e.g., 0.05 = 5% edge)
  // odds: decimal odds (e.g., 2.0 for even money)
  // maxFraction: hard cap at 10% of capital per position
  const fullKelly = edge / (odds - 1);
  const halfKelly = fullKelly / 2;
  return Math.min(halfKelly, maxFraction);
}
```

**Rules:**
- Fixed fractional: risk 1-2% of total capital per trade as the baseline.
- Half-Kelly when genuine edge estimate exists. Full Kelly is too aggressive for noisy LLM-generated edges.
- Maximum single-position exposure: 5-10% of total capital regardless of edge confidence.
- Maximum total exposure: 30-50% of capital deployed; rest in stable collateral (USDC).

### 6.2 Drawdown Control via Energy Gate L∞ Veto

The energy gate's max-severity term (`L∞ veto`) provides the drawdown circuit breaker:

```javascript
import { computeU } from '_SYSTEM/Scripts/math/yuri-energy.mjs';

function drawdownCircuitBreaker(portfolioState) {
  const currentDrawdown = (portfolioState.peakEquity - portfolioState.currentEquity)
                        / portfolioState.peakEquity;

  // L∞ veto triggers at 15-20% drawdown:
  if (currentDrawdown > 0.15) {
    return {
      action: 'HALT_NEW_POSITIONS',
      severity: 'CRITICAL',
      message: `Drawdown ${(currentDrawdown * 100).toFixed(1)}% exceeds 15% circuit breaker`
    };
  }

  // Warning at 10%:
  if (currentDrawdown > 0.10) {
    return {
      action: 'REDUCE_EXPOSURE',
      severity: 'HIGH',
      message: `Drawdown ${(currentDrawdown * 100).toFixed(1)}% — reduce to half-Kelly minimum`
    };
  }

  return { action: 'CONTINUE', severity: 'LOW' };
}
```

When `YURI_ENFORCE=1` and the `_SYSTEM/state/energy-enforce.enabled` flag is set, a catastrophic drawdown triggers the circuit-breaker PreToolUse hook, blocking new position entries until the owner manually resets.

### 6.3 Factor Exposure Monitoring

```javascript
function factorExposureReport(portfolio, factorSignals) {
  // For each correlation cluster, compute net exposure:
  const clusterExposure = {};
  for (const position of portfolio) {
    const factor = getFactor(position.factor_id);
    const cluster = factor.correlation_cluster;
    clusterExposure[cluster] = (clusterExposure[cluster] ?? 0) + position.directionalExposure;
  }

  // Flag clusters with >30% concentration:
  const warnings = Object.entries(clusterExposure)
    .filter(([_, exposure]) => Math.abs(exposure) > 0.30)
    .map(([cluster, exposure]) => ({
      cluster,
      exposure,
      risk: 'CONCENTRATION',
      recommendation: `Reduce ${cluster} exposure from ${(exposure * 100).toFixed(1)}% to <30%`
    }));

  return { clusterExposure, warnings };
}
```

The 12 correlation clusters from the taxonomy (MOM-RSI-STOCH, MOM-MACD-APO, MOM-TREND, VOL-ATR, VOL-HVOL, etc.) serve as the natural grouping for exposure monitoring. No two factors from the same cluster should dominate the portfolio.

### 6.4 LLM-Specific Risk Mitigations

| Risk | Severity | Mitigation | Implementation |
|---|---|---|---|
| **Hallucination of market data** | HIGH | LLM NEVER generates price/position data; all data from API, passed TO LLM | Adapter fetches, formats, injects into prompt |
| **Latency** | MEDIUM-HIGH | LLM for signal generation only; execution by deterministic code | Factor signals pre-computed, LLM reviews thesis |
| **Confirmation bias** | HIGH | Adversarial prompts; force bearish counter-arguments | Every signal prompt includes "argue against this trade" section |
| **Position sizing errors** | CRITICAL | LLM NEVER sizes positions; deterministic half-Kelly or fixed rules | `halfKelly()` function, LLM cannot override |
| **Overconfidence in probabilities** | HIGH | Ensemble averaging; track calibration over time | `calibrationReport()` from prediction-ledger |
| **Stale information** | HIGH | Always verify current prices via live API before any action | Adapter fetches real-time data, stamps it |
| **Regulatory blindness** | MEDIUM | Hard-code compliance constraints per venue | Coinbase: KYC required, US-legal. Polymarket: NOT for US persons, geo-block enforced |

---

## 7. BUILD PHASES

### Phase 0: Seed Corpus + FTS5 Storage (no trading)

**Duration:** 1-2 sessions
**Deliverables:**
- `_SYSTEM/OS_KERNEL/alpha-factors-schema.sql` -- DDL from Dimension 3
- `_SYSTEM/OS_KERNEL/alpha-factors.db` -- created by running the DDL
- `_SYSTEM/Scripts/alpha-factor-library/` -- organ directory with:
  - `alpha-factor-store.mjs` -- CRUD operations (`getFactor`, `listFactors`, `searchFactors`, `upsertFactor`, `recordPerformance`, `getLineage`, `getAncestors`)
  - `seed-corpus.mjs` -- script to insert all 60 factors from the taxonomy
- `_SYSTEM/Scripts/xref-query.mjs` -- add `passAlphaFactors()` function
- `@capability: alpha-factor-library` annotation on the store module
- `node _SYSTEM/Scripts/capability-scan.mjs` to regenerate `capabilities.json` (39 → 40)
- Graph integration: add factor mechanism nodes to `yuri-graph.json`

**Tests:**
- FTS5 search returns relevant factors for "momentum reversal crypto"
- Lineage CTE traversal works for multi-level derivation chains
- Performance log append + query round-trips
- xref-query surfaces alpha factors alongside code hits

**No trading. No venue adapters. No live signals.**

### Phase 1: Factor Evaluation + Backtesting

**Duration:** 2-3 sessions
**Deliverables:**
- `_SYSTEM/Scripts/alpha-factor-library/factor-evaluator.mjs` -- backtest engine using:
  - `mkAggregator` from `eval-processing.mjs` for streaming P&L aggregation
  - `heldOutSplit` / `inSampleVsHeldout` for overfit detection
  - `conformalQuantile` for calibrated confidence bars
  - `sequentialDecide` for early stopping
  - `pairedDelta` for A/B comparison of factor strategies
- `_SYSTEM/Scripts/alpha-factor-library/factor-scorer.mjs` -- quality scoring using:
  - `brierScore` from `math-kernel.mjs` for calibration
  - `confidenceDecay` from `math-kernel.mjs` for evidence aging
  - FSRS retrievability from `yuri-fsrs.mjs`
  - Entropy from `math-kernel.mjs` for diversification
- Factor claim integration:
  - Each factor creates a claim in `claim-cortex.mjs` via `assessClaim()`
  - Factor predictions logged via `recordPrediction()` from `prediction-ledger.mjs`
  - Outcomes resolved via `recordOutcome()`
  - Calibration tracked via `calibrationReport()`
- Factor dependency tracking via `truth-maintenance.mjs`:
  - `assertPremise` for foundational assumptions
  - `addJustification` for factor derivation chains
  - `affectedBy` for retraction cascade queries
- Promotion ladder enforcement:
  - `gateProposal` from `yuri-energy.mjs` gates hypothesis→backtested and backtested→paper-traded transitions

**Tests:**
- Backtest a momentum factor on synthetic data, verify Sharpe calculation
- Held-out split detects an overfit factor definition
- Sequential decision stops a backtest early when CI clears threshold
- Factor promotion through the claim cortex ladder
- Retraction cascade surfaces all dependents of a retired premise

**No venue adapters. No live signals. Backtest data from local CSV/API history only.**

### Phase 2: Quantum Sequencing Engine

**Duration:** 2-3 sessions
**Deliverables:**
- `_SYSTEM/Scripts/alpha-factor-library/factor-circuit.mjs` -- the orchestration layer:
  - `buildCommutativityMatrix(factors)` -- pairwise `commutatorNorm` via `matMul`/`transpose` from `quantum-hypothesis-tracker.mjs`
  - `sampleOrderings(nonCommutingFactors, sampleCount)` -- phi-sequence sampling via `phiSequence` from `yuri-phi.mjs`, Lehmer code mapping
  - `scoreOrdering(ordering, projectors, psi)` -- `measureSequential` from `quantum-hypothesis-tracker.mjs`
  - `buildCircuitDAG(commutativityMatrix, optimalOrdering)` -- minimal DAG construction
  - `robustOptimalOrdering(problem)` -- `crossEntropyOptimize` from `decision-sim.mjs`
  - `cornerGuard(problem, config)` -- `cornerAwareReadout` from `izanagi-bridge.mjs`
  - `flipConditions(problem, config)` -- `flipThresholds` from `izanagi-bridge.mjs`
- Energy gate integration:
  - Circuit quality (`quantumScore / classicalScore`) recorded as ΔU via `tickAndTrace` from `energy-tick-core.mjs`
  - Circuit quality < 1.0 (order hurts signal) flagged as regress
- Schmidt coupling diagnostics:
  - `schmidtDecomposition` from `quantum-hypothesis-tracker.mjs` detects entangled factor pairs
  - Entangled pairs get explicit ordering constraints in the DAG

**Tests:**
- 2-factor worked example: A→B ordering produces 17× quantum advantage (from Dimension 4 Section 6)
- Commutativity matrix correctly identifies commuting pairs
- Phi-sequence sampling produces uniform coverage of permutation space
- DAG construction from commutativity matrix + winning ordering
- Corner-law guard catches the hidden worst-case that interior sampling misses
- Energy gate records circuit quality as trace entry

**No venue adapters. No live signals. Factors scored on historical backtest data.**

### Phase 3: Venue Adapters (advisory mode -- signals only, no execution)

**Duration:** 2-3 sessions
**Deliverables:**
- `_SYSTEM/Scripts/alpha-factor-library/coinbase-adapter.mjs` -- REST + WebSocket client
  - Product discovery, candles, ticker, L2 orderbook
  - Rate-limited (token bucket, 30 req/s)
  - Advisory order construction (returns parameters, does NOT submit)
- `_SYSTEM/Scripts/alpha-factor-library/polymarket-adapter.mjs` -- REST + WebSocket client
  - Market discovery via Gamma API, orderbook via CLOB
  - EIP-712 order signing (for future Phase 4)
  - Advisory order construction
- `_SYSTEM/Scripts/alpha-factor-library/portfolio-abstract.mjs` -- unified types
  - Position, Order, Fill, Balance abstractions
  - Venue-agnostic portfolio state
- `_SYSTEM/Scripts/alpha-factor-library/data-ingest.mjs` -- market data pipeline
  - OHLCV ingestion from Coinbase candles endpoint
  - Orderbook snapshots from both venues
  - Factor computation on ingested data
- `_SYSTEM/Scripts/alpha-factor-library/signal-generator.mjs` -- signal pipeline
  - Factor values → z-score → percentile rank → signal [-1, +1]
  - Quantum-sequenced combination of factor signals
  - Output: advisory signal with confidence, reasoning, and recommended action

**Tests:**
- Coinbase adapter fetches products and candles (sandbox or mock)
- Polymarket adapter fetches markets and orderbook (mock)
- Unified portfolio abstraction round-trips through both adapters
- Signal generator produces consistent signals for known factor inputs
- Advisory order construction produces valid order parameters

**NO execution. Signals only. Owner reviews all signals manually.**

### Phase 4: Live Execution (owner-gated, paper trading first)

**Duration:** 3-4 sessions (with long soak periods)
**Deliverables:**
- Paper trading mode:
  - Simulated execution against live market data
  - P&L tracked in `factor_performance_log`
  - Calibration tracked in prediction-ledger
  - Soak period: minimum 30 days of paper trading before live
- Live execution mode (owner-gated):
  - `YURI_LIVE_TRADING=1` environment variable required
  - Owner approval required for every trade submission
  - Half-Kelly position sizing, 5-10% max single-position
  - Drawdown circuit breaker at 15%
  - Factor exposure monitoring (30% cluster concentration limit)
- Autonomous factor discovery (L2 autonomy):
  - Nightly factor scanning via `yuri-autonomy-runner.mjs`
  - New factor candidates registered as `hypothesis` status
  - Automated backtesting via Phase 1 pipeline
  - Morning report: new candidates, backtest results, calibration updates
- Polymarket-specific:
  - Probability estimation pipeline: LLM aggregates information sources → "true probability" estimate → compare to market price → trade when edge > threshold
  - Outcome resolution tracking via `recordOutcome`
  - Calibration tracking: is the LLM well-calibrated on probability estimates?

**Tests:**
- Paper trading mode tracks P&L correctly against live market data
- Drawdown circuit breaker halts new positions at 15%
- Half-Kelly sizing produces correct position sizes
- Owner approval gate blocks execution without explicit approval
- Calibration report shows honest Brier scores for factor predictions

---

## 8. CAPABILITY REGISTRATION

### 8.1 Primary Capability

Annotate `_SYSTEM/Scripts/alpha-factor-library/alpha-factor-store.mjs`:

```javascript
// @capability: alpha-factor-library
// @serves: alpha factor | factor library | quant factor | sharpe | backtest | factor search | factor lineage | factor scoring | factor circuit | quantum sequencing
// @does: Persistent SQLite store for alpha factors with FTS5 search, lineage graph, performance tracking, quantum-sequenced combination optimization, and venue-agnostic signal generation
// @use: Reach for this before building any factor storage, quant research persistence, factor search, factor combination, or trading signal mechanism
// @exports: getFactor, listFactors, searchFactors, upsertFactor, recordPerformance, getLineage, getAncestors, buildCircuitDAG, scoreOrdering, generateSignal
```

### 8.2 Sub-Capabilities (per Phase)

**Phase 1 -- Factor evaluator:**
```javascript
// @capability: factor-backtest-evaluation
// @serves: factor backtest | factor evaluation | overfit detection | early stopping | factor calibration
// @does: Backtest alpha factors with held-out validation, sequential early stopping, and conformal confidence bars
// @use: Reach for this before building any backtesting, factor scoring, or overfit detection mechanism
// @exports: evaluateFactor, detectOverfit, earlyStopCheck, calibrationCheck
// @mechanism: _SYSTEM/Scripts/alpha-factor-library/factor-evaluator.mjs
```

**Phase 2 -- Factor circuit:**
```javascript
// @capability: quantum-factor-sequencing
// @serves: factor combination | factor ordering | quantum sequencing | factor circuit | non-commutative factors
// @does: Discovers optimal factor combination orderings via quantum operator algebra, phi-sequence anti-resonant sampling, and robust optimization
// @use: Reach for this before building any factor combination, portfolio construction, or ordering optimization mechanism
// @exports: buildCommutativityMatrix, sampleOrderings, scoreOrdering, buildCircuitDAG, robustOptimalOrdering
// @mechanism: _SYSTEM/Scripts/alpha-factor-library/factor-circuit.mjs
```

**Phase 3 -- Venue adapters:**
```javascript
// @capability: trading-venue-adapter
// @serves: trading venue | coinbase adapter | polymarket adapter | order advisory | portfolio abstraction
// @does: Unified interface to Coinbase Advanced Trade and Polymarket CLOB APIs with advisory order construction and venue-agnostic portfolio state
// @use: Reach for this before building any trading venue integration, order management, or portfolio tracking mechanism
// @exports: coinbaseAdapter, polymarketAdapter, UnifiedPosition, UnifiedOrder, UnifiedFill
// @mechanism: _SYSTEM/Scripts/alpha-factor-library/coinbase-adapter.mjs, _SYSTEM/Scripts/alpha-factor-library/polymarket-adapter.mjs
```

### 8.3 Registration Procedure

After each phase ships:

1. Annotate the source file with `@capability` tags (as shown above)
2. Run `node _SYSTEM/Scripts/capability-scan.mjs` to regenerate `_SYSTEM/capabilities.json`
3. Run `node _SYSTEM/Scripts/capability-recall.mjs "<need>"` to verify the new capability surfaces
4. Update `xref-query.mjs` if the capability needs to appear in cross-reference searches

Current registry: 39 capabilities. After Phase 0: 40. After Phase 1: 41. After Phase 2: 42. After Phase 3: 44 (coinbase + polymarket adapters).

---

## RESIDUAL RISKS

1. **Embedding table is a no-op.** The `factor_embeddings` table exists but nothing populates it. When an embedding provider lands, a migration adds the virtual table index. Manual `correlation_cluster` tags provide grouping until then.

2. **FTS5 external-content triggers.** If someone bypasses the triggers (e.g., `INSERT OR REPLACE` with different rowid strategy), the FTS index drifts. Standard INSERT/UPDATE/DELETE stays consistent.

3. **No cross-DB foreign keys.** `alpha_factors` does not FK into `memory.db` or `search-index.db`. Cross-references are by string handle in `provenance` and `metadata_json`.

4. **Polymarket US access.** Polymarket is geo-blocked for US persons. The adapter can fetch public market data (no auth required for read-only), but order submission requires non-US access. This is a hard constraint, not a technical limitation.

5. **LLM probability calibration.** LLMs are poorly calibrated on probabilities. The prediction-ledger calibration tracking is essential -- without it, LLM-generated edge estimates are unreliable. The system must track calibration over time and adjust confidence accordingly.

6. **Quantum model validity.** The quantum operator model for factor ordering is a mathematical analogy, not a claim about physics. Its validity depends on whether the order effects in factor combination are well-captured by the projector model. The QQ-equality test and Schmidt coupling provide diagnostics -- if they show no significant order effects, the classical (order-blind) baseline is sufficient and the quantum engine adds no value for that factor set.

7. **Corner-law guard necessity.** The `cornerAwareReadout` from `izanagi-bridge.mjs` catches worst cases that interior Monte Carlo sampling misses (the affine/minorant at simplex vertices). For factor combinations over 3+ factors, this guard is not optional -- the interior can be deceptively smooth while the corners hide catastrophic regimes.

---

**RESULT_LABEL:** `AFL_ORGAN_DESIGN_DOCUMENT_X_PASS`
