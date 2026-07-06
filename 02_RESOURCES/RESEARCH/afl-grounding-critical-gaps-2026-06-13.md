# AFL Critical Gaps — Data Quality + Regime Shift Research
**Date:** 2026-06-13
**Status:** LOCAL-FIRST (Tier 0 + Tier 5 web) — cited
**Scope:** Two CRITICAL gaps blocking AFL Phase 3: FM-3 (data quality poisoning) and FM-5 (regime shift commutativity invalidation)
**Authority:** advisory research — no mutation, no commit

---

## LOCAL CORPUS FINDINGS (Tier 0)

### YURI Primitives Already Covering the Gap

| Primitive | File | What it does | AFL applicability |
|-----------|------|-------------|-------------------|
| `cusum()` | `math-kernel.mjs:475` | One-sided upper CUSUM change-point on a signed stream; alarms when S_t > h; exposes slow drift no single step flags as outlier | DIRECT regime detector — run on rolling ΔU(correlation) stream or factor pair commutativity fraction |
| `scalarKalman()` | `math-kernel.mjs:515` | Scalar Kalman filter with one-sided NIS gating; flags innovation surprises via chi-squared(1) threshold | Outlier/spike recovery — smooth OHLCV price stream, flag bars with NIS > 3.84 as anomalous ticks |
| `spearman()` | `math-kernel.mjs:230` | Pearson over average-tied ranks; degenerate (zero variance) → 0 | Rolling factor-pair rank-correlation drift → detect when factor orderings lose their historical rank structure |
| `pearson()` | `math-kernel.mjs:211` | Pearson correlation, constant input → 0 | Rolling cross-factor correlation matrix; >30% pair correlation shifts = regime signal (per FM-5 spec) |

**Verdict: YURI already has all four mathematical primitives. The regime detector is an assembly problem, not a build problem.**

### Math Transfer Catalog Entry (2026-06-03)
CUSUM entry: "UPPER CUSUM on SIGNED ΔU stream → declare REGIME CHANGE. μ₀ must be phase-adaptive (recent median signed ΔU per nen-phase) to kill non-stationarity false-alarms. MAD catches the shock; CUSUM catches the slow rot."
Source: `02_RESOURCES/RESEARCH/math-theory-transfer-catalog-2026-06-03.md` §2
Citations therein: Page 1954 (Biometrika), Lorden 1971, Moustakides 1986.

### AFL Validation Report Findings (2026-06-13)
FM-3 (CRITICAL): "design has NO data quality validation layer. A single corrupted OHLCV bar poisons all downstream factors."
FM-5 (CRITICAL): "Pre-regime: 6 commuting / 4 non-commuting pairs. Post-regime: 2/8. The commutativity structure CHANGES. System keeps using stale factor circuit data."
Source: `02_RESOURCES/RESEARCH/afl-quantum-validation-2026-06-13.md` §TEST4/FM-3/FM-5

---

## GAP 1 — DATA QUALITY GATE (FM-3)

### What must be caught before a bar enters the factor engine

**Structural OHLCV invariants (deterministic rejects):**
- `H < L` — high below low: corrupt bar, hard reject
- `O` or `C` outside `[L, H]` — open/close outside range: corrupt bar, hard reject
- `V < 0` — negative volume: hard reject
- `timestamp` non-monotone or gap > configurable threshold (e.g. 5 bars): mark gap, do not interpolate

**Statistical outlier detection (soft flag + human review queue):**
- Price spike: `|log(C_t / C_{t-1})| > z_thresh` where z_thresh ~ 3–5 × rolling MAD(log returns, window=20); use MAD not std because std amplifies the spike it tries to detect.
- Volume spike: `V_t > k × rolling_median(V, window=20)`, k ~ 10; high volume may be real (earnings, news) so flag, do not auto-reject.
- `scalarKalman()` NIS gate: run on log-return stream; bars with NIS > 3.841 (chi-squared(1) 0.95) and positive innovation are suspicious ticks — queue for manual review.

**Look-ahead bias prevention:**
- Definition 1 discipline (per arxiv 2512.12924): information set at time t contains ONLY data up to and including t.
- Split-adjusted prices must be applied using split factors known at computation time, not retroactively.
- Walk-forward protocol: complete separation between training and test windows; no test-period leakage into training.

**Survivorship bias:**
- Explicitly acknowledged in production literature (arxiv 2512.12924): excluding delisted/acquired assets "biases results upward."
- Mitigation: maintain a delisted-asset register; include delisted assets in backtests up to their delist date.
- For crypto on Coinbase: assets removed from the exchange must remain in historical factor computation through their last available bar.

**Sources:**
- Walk-forward/look-ahead discipline: arxiv [2512.12924](https://arxiv.org/html/2512.12924v1)
- OHLCV activity filters (min ticks/bar, NaN exclusion, `max(H) ≠ min(L)`): arxiv [2509.16137](https://arxiv.org/html/2509.16137v1)
- Spike filter patent literature: [USPTO 7685041](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7685041)
- IQR vs z-score for financial data: [Towards Data Science](https://towardsdatascience.com/3-simple-statistical-methods-for-outlier-detection-db762e86cd9d/)
- NautilusTrader bar integrity: [nautilustrader.io/docs](https://nautilustrader.io/docs/latest/api_reference/model/data/)

### YURI wiring plan
```
raw_bar → structuralCheck() [hard reject H<L, O∉[L,H], V<0, gap]
        → kalmanNisFlag()   [scalarKalman on log-returns, flag NIS>3.84]
        → madSpikeFlag()    [|logReturn| > 5×MAD(20), volume > 10×median(20)]
        → emit: CLEAN | FLAG_REVIEW | REJECT
```
All four primitives (`scalarKalman`, `cusum` on volume anomaly stream) are live exports from `math-kernel.mjs`. No new math needed — adapter only.

---

## GAP 2 — REGIME SHIFT DETECTOR (FM-5)

### The specific problem
AFL validation TEST 4 showed: a regime shift from 6→2 commuting pairs (out of 10) does NOT trigger the drawdown circuit breaker if portfolio drawdown stays < 7%. The commutativity matrix used for quantum sequencing becomes stale without detection.

### Method landscape

| Method | Strengths | Weaknesses | AFL fit |
|--------|-----------|------------|---------|
| **CUSUM** (Page 1954) | Simple, online, exact optimality (Moustakides 1986), controllable ARL₀ | Assumes stationarity; one-sided; needs μ₀ calibration | HIGH — already live in math-kernel; run on commutativity fraction stream |
| **Bai-Perron** (1998/2003) | Multiple breaks simultaneously; tests number of breaks | Offline/batch; assumes linear regression model; cannot run online | MEDIUM — useful for offline structural break audit of historical factor data; not for live detection |
| **PELT** (Killick 2012) | Exact linear-time multiple change-point; user-defined cost function | Batch; no online mode | MEDIUM — useful for offline backtest window selection |
| **HMM** (multi-state) | Probabilistic soft state assignment; handles overlapping regimes | Requires EM training; sensitive to state count choice; latency | MEDIUM — 3-state HMM (bull/neutral/bear) using RSI+MACD+vol per AIMS 2025 paper |
| **Rolling correlation drift** | No distributional assumption; directly measures factor co-movement breakdown | Threshold arbitrary; lags onset | HIGH for AFL FM-5 — directly measures when >30% of factor pairs change commutativity class |
| **Entropy-HMM** (PMC 2025) | Combines spatial residual entropy + 2-state HMM; early warning 40 days ahead | Complex; needs network spillover data | LOW for AFL (requires multi-asset network, not single-series) |
| **Bayesian BOCPD** (arxiv 2307.02375) | Online, posterior over run lengths, handles non-stationarity | Computationally heavier; requires prior on change-point frequency | MEDIUM — stronger theoretical grounding than CUSUM under non-stationarity |

### Recommended composite detector for AFL

**Two-layer approach using existing YURI primitives:**

Layer 1 — Fast CUSUM alarm (online, low latency):
```
commutativity_fraction_t = (# commuting pairs at t) / (total pairs)
cusum(signed_deltas = commutativity_fraction_t - mu0,
      k = 0.5 × MAD(commutativity_fraction, window=50),
      h = 5 × MAD(...))
→ alarm = REGIME_SHIFT_SUSPECTED
```
`mu0` = rolling median commutativity fraction over last nen-phase window.

Layer 2 — Rolling Pearson/Spearman correlation drift (slower confirmation):
```
for each factor pair (i,j):
    rolling_corr_t = pearson(factor_i[-30:], factor_j[-30:])
    delta_corr = |rolling_corr_t - baseline_corr_ij|
regime_drift_score = fraction of pairs where delta_corr > 0.3
if regime_drift_score > 0.30:
    → REGIME_CONFIRMED (invalidate commutativity matrix, trigger rebuild)
```

**Sources:**
- CUSUM method (E.S. Page 1954): cited in `math-theory-transfer-catalog-2026-06-03.md`
- Bai-Perron structural breaks: [researchgate](https://www.researchgate.net/publication/265737713) + [Aptech](https://www.aptech.com/structural-breaks/)
- PELT algorithm: ACM 2025 [doi:10.1145/3773365.3773532](https://dl.acm.org/doi/10.1145/3773365.3773532)
- HMM 3-state regime (bull/neutral/bear) framework: AIMS 2025 [aimspress.com](https://www.aimspress.com/article/id/69045d2fba35de34708adb5d)
- Entropy-HMM early warning: PMC 2025 [PMC11976486](https://pmc.ncbi.nlm.nih.gov/articles/PMC11976486/)
- Bayesian BOCPD online: arxiv [2307.02375](https://arxiv.org/abs/2307.02375)
- Change-point TDA (topological): MDPI 2025 [2079-8954/13/10/875](https://www.mdpi.com/2079-8954/13/10/875)

---

## YURI PRIMITIVE COVERAGE SUMMARY

| Need | YURI primitive | Coverage |
|------|---------------|----------|
| Slow regime drift alarm | `cusum()` math-kernel.mjs:475 | FULL — online, one-sided, scale-free with MAD |
| Bad tick / spike recovery | `scalarKalman()` math-kernel.mjs:515 | FULL — NIS gate flags anomalous innovations |
| Factor pair correlation drift | `pearson()` + `spearman()` math-kernel.mjs:211/230 | FULL — rolling window, handles ties |
| Offline structural break audit | Bai-Perron / PELT | GAP — not in YURI; external library (ruptures, strucchange) needed for offline audit only |
| Probabilistic regime assignment | HMM | GAP — no HMM in math-kernel; needed only if binary CUSUM alarm is insufficient |

---

## BUILD PRIORITY

1. **Data quality gate** — assemble from live primitives (`scalarKalman` + MAD spike check + structural invariants). No new math. ~50 lines adapter code. Must land before Phase 3.
2. **CUSUM regime alarm** — ~20 lines wiring: feed commutativity fraction stream into existing `cusum()`. Alarm triggers commutativity matrix rebuild. Must land before Phase 3.
3. **Rolling correlation confirmation** — ~30 lines: rolling `pearson()` per factor pair, compute drift score. Layer 2 on top of CUSUM alarm.
4. **Offline Bai-Perron / PELT** — deferred; useful for post-hoc analysis of when regimes occurred in historical data; requires external dependency.

**RESULT_LABEL:** `AFL_GAPS_RESEARCH_DATA_QUALITY_REGIME_DETECTION_X_PASS`
