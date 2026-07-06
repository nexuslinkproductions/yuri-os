# AFL Grounding: Backtest Rigor / Overfit + Multiple-Testing Controls
**Date:** 2026-06-13
**Session:** Subagent research — pinned Sonnet, local-first then online
**Scope:** Factor backtesting statistical rigor for AFL Phase 1 `factor-evaluator.mjs` (FM-4 gap)

---

## 1. LOCAL CORPUS BASELINE

**What eval-processing.mjs already covers (verified live reads):**
- `inSampleVsHeldout` — in-sample optimism gap (per-factor, one-at-a-time)
- `heldOutSplit` / `kFold` — seeded train/test split + k-fold
- `conformalQuantile` — split-conformal calibrated bar (finite-sample ≤α miscoverage; Vovk/Angelopoulos-Bates)
- `sequentialDecide` / `confidenceSequence` — empirical-Bernstein time-uniform CI (Howard/Ramdas 2021); peek-safe, no alpha inflation
- `pairedDelta` — CRN variance-reduced A/B comparison

**What is NOT present in eval-processing.mjs or any AFL script (confirmed gap):**
- No family-wise error rate (FWER) control across the N-factor fleet
- No Benjamini-Hochberg (BH) FDR correction across factor promotions
- No Deflated Sharpe Ratio / minimum backtest length calculation
- No CSCV / CPCV — only standard held-out split and k-fold
- No permutation test on the full factor set
- FM-4 identified in afl-validation.mjs line 599: "With 60 factors tested independently, even a 5% per-factor FPR yields ~3 expected false promotions"

---

## 2. DEFLATED SHARPE RATIO (DSR) + MINIMUM TRACK RECORD LENGTH

**Source:** Bailey & López de Prado (2014). "The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting and Non-Normality." *Journal of Portfolio Management*, 40(5).
URL: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551

**PSR (Probabilistic Sharpe Ratio):** Probability that observed SR̂* exceeds a benchmark under non-normal returns (skewness γ₃, excess kurtosis γ₄, T observations):

```
PSR(SR₀) = Φ( (SR̂* - SR₀) · √(T-1) / √(1 - γ₃·SR₀ + (γ₄-1)/4 · SR₀²) )
```

**DSR extends PSR** by replacing the fixed SR₀ with one derived from the False Strategy Theorem — the expected maximum SR from N IID strategies drawn from a null distribution:

```
SR₀ = √Var[SR̂] · ( (1-γ)·Φ⁻¹[1 - 1/N] + γ·Φ⁻¹[1 - 1/(N·e)] )
```
where γ ≈ 0.5772 (Euler-Mascheroni constant), N = number of independent trials.

**DSR formula:**
```
DSR = Φ( (SR̂* - SR₀)·√(T-1) / √(1 - γ₃·SR₀ + (γ₄-1)/4·SR₀²) )
```

**MinTRL (Minimum Track Record Length):** Minimum observations to reject null with confidence DSR*:
```
MinTRL = 1 + (1 - γ₃·SR₀ + (γ₄-1)/4·SR₀²) · (Φ(DSR*) / (SR* - SR₀))²
```

**Implication for AFL Phase 1:** A factor-evaluator.mjs that gates on raw backtest Sharpe without DSR is accepting false promotions. With N=60 factors, SR₀ is substantially higher than for N=1 — the single-factor hurdle is insufficient.

**Minimum Sharpe thresholds scale with N trials (from Bailey et al.):**
- N=1: SR threshold ≈ 1.96σ (the standard 95% bar)
- N=20: SR threshold ≈ 3.14σ (64% false positive probability without adjustment)
- N=100: SR threshold ≈ 3.29σ
- N=1000: SR threshold ≈ 3.97σ

---

## 3. PROBABILITY OF BACKTEST OVERFITTING (PBO / CSCV)

**Source:** Bailey, Borwein, López de Prado & Zhu (2014). "The Probability of Backtest Overfitting." *Journal of Computational Finance*.
URL: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253

**CSCV algorithm:**
1. Partition T-bar time-series observations into S sub-series (typically S=16 non-overlapping blocks).
2. Generate all C(S, S/2) = C(16,8) = 12,870 combinations of training/test sets (symmetric, model-free).
3. For each combination: optimize strategy on in-sample half, record out-of-sample rank relative to all strategies.
4. PBO = fraction of combinations where the in-sample best strategy has out-of-sample rank below median (rank < 0.5).
5. PBO → 1 signals heavy overfitting; PBO → 0 signals genuine alpha.

**Key property:** CSCV is non-parametric, symmetric (no look-ahead direction), and model-free. It produces a PBO distribution, not a point estimate — more informative than a single walk-forward test.

**vs. heldOutSplit in eval-processing.mjs:** `heldOutSplit` measures per-factor optimism gap on one (train, test) split. CSCV measures PBO across thousands of splits simultaneously — a fundamentally different (harder) test. Current AFL design does not have CSCV.

---

## 4. MULTIPLE TESTING: BH FDR + HARVEY-LIU-ZHU "FACTOR ZOO"

**Source:** Harvey, Liu & Zhu (2016). "...and the Cross-Section of Expected Returns." *Review of Financial Studies*, 29(1), 5-68.
URL: https://academic.oup.com/rfs/article/29/1/5/1843824
NBER WP: https://www.nber.org/papers/w20592

**Key findings:**
- Catalogued 313 published factors; with t-ratio > 3.0 hurdle, only **9 of 313 survive**.
- Standard 2.0 t-ratio cutoff is inadequate under multiple testing: most "significant" published factors are likely false.
- Recommended t-ratio hurdle: **≥ 3.0** for new factors (up from the conventional 1.96).
- Under their FDR framework: at N=313 and a 5% FDR target, a single-hypothesis significance threshold around 3.0 is implied.

**BH procedure (Benjamini & Hochberg, 1995):**
1. Compute p-values p₁ ≤ p₂ ≤ ... ≤ pₙ for all N factor tests (ranked ascending).
2. Find the largest k such that p_k ≤ (k/N) · q, where q is target FDR (e.g. 0.10).
3. Reject all null hypotheses for p₁, ..., p_k.
4. Expected false discovery rate ≤ q under independent tests (Benjamini-Hochberg 1995); under positive dependence, BH is still valid (BY2001 variant).

**Warning from Harvey et al.:** Factor t-stats are correlated (business cycle, shared US panel data). Standard BH assumes independence. The correct procedure for correlated p-values is the Benjamini-Yekutieli (BY2001) correction or permutation-based FDR.

**Implication for AFL Phase 1:** 60 factors at 5% per-factor FPR → ~3 expected false promotions. The AFL must apply BH-FDR across the full factor batch, not per-factor conformal bars alone.

---

## 5. PURGED K-FOLD / CPCV — TIME-SERIES LEAKAGE CONTROL

**Source:** López de Prado (2018). *Advances in Financial Machine Learning*. Wiley.
Wikipedia entry: https://en.wikipedia.org/wiki/Purged_cross-validation
CPCV explainer: https://towardsai.net/p/l/the-combinatorial-purged-cross-validation-method

**Why standard k-fold leaks in finance:**
Label formation windows overlap train/test boundaries. A 12-month momentum signal formed up to time t uses data that bleeds into the next train fold. Standard k-fold shuffles randomly; time ordering is lost.

**Purging:** Remove any training observation whose label-formation window overlaps the test window. For AFL factors with lookback period L, purge the L observations immediately before each test fold.

**Embargo:** Remove the h observations immediately AFTER each test fold (captures market microstructure autocorrelation; h proportional to label horizon, typically 5-10% of fold size).

**CPCV (Combinatorial Purged CV):**
- Splits T observations into N groups.
- Tests on all C(N, k) combinations of k test groups.
- Generates φ[N,k] = C(N,k) unique backtest paths — a distribution of OOS paths, not a single sequence.
- Every observation appears in exactly one test set per path (no leakage).
- Produces PBO and Deflated SR distributions directly from the path set.

**Walk-forward vs CPCV:**
| Criterion | Walk-Forward | CPCV |
|---|---|---|
| Number of test paths | 1 | C(N,k) up to 12,870 |
| Sensitivity to single historical sequence | High | Low |
| PBO measurable | No | Yes (directly) |
| Embargo support | Manual | Built-in |
| Computational cost | Low | High (offline) |

**Recommendation for AFL:** Walk-forward is acceptable for nightly offline Phase 1 builds. CPCV is the correct audit tool before a factor crosses hypothesis→paper-traded. Do not use CPCV in real-time signal paths.

---

## 6. MAPPING TO AFL FACTOR-EVALUATOR.MJS (PHASE 1)

`factor-evaluator.mjs` is specified (line 820, afl-organ-design-2026-06-13.md) but **not yet built**. It wraps `eval-processing.mjs` functions. The following gaps must be filled:

| Gap | Current AFL state | Required control | Priority |
|---|---|---|---|
| Per-factor optimism bias | `inSampleVsHeldout` measures gap | Add `DSR` calculation using T, N, skewness, kurtosis | HIGH |
| Family-wise false promotions | None | BH-FDR at q=0.10 across all factor p-values in one batch | HIGH |
| Time-series label leakage | `heldOutSplit` is random shuffle (no purging) | Purged k-fold with lookback-period embargo | HIGH |
| Multiple path coverage | Single train/test split | Offline CPCV (N=16, k=8) before paper-trade promotion | MEDIUM |
| Minimum backtest length | Not enforced | MinTRL check: reject if T < MinTRL(SR₀, DSR*, γ₃, γ₄) | HIGH |
| Permutation baseline | Not present | N=1000 permutation test as alternative to BH where factor t-stats are correlated | MEDIUM |

**What eval-processing.mjs already provides and should keep:**
- `sequentialDecide` — valid for early stopping within a single factor test (empirical-Bernstein, peek-safe).
- `conformalQuantile` — valid for calibrated per-factor confidence bars.
- `pairedDelta` — valid for A/B comparisons between factor variants (CRN).
These do NOT substitute for cross-factor FDR control. They are per-factor instruments. The missing layer is the fleet-level gate.

---

## 7. RESIDUAL RISK + OPEN QUESTIONS

- **Correlated factor p-values:** 60 AFL factors share OHLCV data and likely have positively correlated test statistics. BH (independence assumption) understates FDR. Should use BY2001 or permutation-based FDR.
- **Non-stationarity:** DSR assumes i.i.d. draws for the false strategy theorem. Real factor Sharpes are non-stationary. DSR is a floor, not a guarantee.
- **Conformal quantile validity window:** `conformalQuantile` gives finite-sample coverage guarantees IF calibration data is exchangeable with test data. For time-series, exchangeability fails unless data is purged. The conformal bar is valid only if applied after purged splitting.
- **Embargo sizing:** AFL organ design does not specify a lookback window per factor. Embargo period must equal the label formation window (e.g., 12 bars for 12-month momentum). This must be encoded in the factor definition schema, not hardcoded.

---

## CITATIONS (all claims above are sourced to these)

1. Bailey, D.H. & López de Prado, M. (2014). The Deflated Sharpe Ratio. *Journal of Portfolio Management* 40(5). https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551
2. Bailey, D.H., Borwein, J., López de Prado, M. & Zhu, Q.J. (2014). The Probability of Backtest Overfitting. *Journal of Computational Finance*. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253
3. Harvey, C.R., Liu, Y. & Zhu, H. (2016). ...and the Cross-Section of Expected Returns. *Review of Financial Studies*, 29(1), 5-68. https://academic.oup.com/rfs/article/29/1/5/1843824
4. Benjamini, Y. & Hochberg, Y. (1995). Controlling the False Discovery Rate. *JRSS-B*, 57(1), 289-300.
5. López de Prado, M. (2018). *Advances in Financial Machine Learning*. Wiley. (Purged CV, embargo, CPCV)
6. Howard, S.R. & Ramdas, A. (2021). Time-uniform confidence sequences. (Empirical-Bernstein CS — already in eval-processing.mjs)
7. Angelopoulos, A. & Bates, S. (2023). Conformal Prediction: A Gentle Introduction. (Split conformal — already in eval-processing.mjs)

**RESULT_LABEL:** `AFL_OVERFIT_CONTROLS_RESEARCH_X_PASS_COMMITTED`
