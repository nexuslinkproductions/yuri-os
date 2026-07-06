[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
Good. Now I have all the math verified. Let me deliver the focused slice.

---

# Carry-to-Vol Ratio: Realized-Vol Estimator & Threshold Rigor

## 1. `realizedVol(series, opts)` — Close-to-Close Log-Return with Annualization

### Core formula

For a series of `N` close prices $\{P_0, P_1, \ldots, P_{N-1}\}$ at uniform bar spacing $\Delta t$:

$$r_i = \ln\!\left(\frac{P_i}{P_{i-1}}\right), \quad i = 1 \ldots N{-}1$$

$$\hat{\sigma}^2 = \frac{1}{N-2}\sum_{i=1}^{N-1}(r_i - \bar{r})^2 \qquad\text{(Bessel-corrected sample variance)}$$

$$\sigma_{\text{ann}} = \hat{\sigma} \cdot \sqrt{P}$$

where $P$ = **periods per year** matching the bar frequency.

### Exact annualization constants

| Bar frequency | Periods/year ($P$) | $\sqrt{P}$ | Derivation |
|---|---|---|---|
| 1 minute | **525 960** | 725.23 | $365.25 \times 24 \times 60$ |
| 5 minutes | 105 192 | 324.34 | $525960 / 5$ |
| 1 hour | 8 766 | 93.63 | $525960 / 60$ |
| 8 hours | 1 095.75 | 33.10 | $525960 / 480$ |
| 1 day | 365.25 | 19.11 | $525960 / 1440$ |

**The ratio `carryToVol = fundingApr / σ_ann` is dimensionless** only when both numerator and denominator use the same annual calendar. The perp-adapter already annualizes funding with `periodsPerYear` (default 1095 for 8h bars). The realized-vol estimator must use the same 365.25-day calendar — which it does via `525960 = 365.25 × 24 × 60`.

### Implementation

```javascript
// periodsPerYear for common bar spacings (365.25-day calendar, matching perp-adapter)
export const PERIODS_PER_YEAR = {
  '1m':  365.25 * 24 * 60,   // 525_960
  '5m':  365.25 * 24 * 12,   // 105_192
  '1h':  365.25 * 24,        //   8_766
  '8h':  365.25 * 3,          //   1_095.75
  '1d':  365.25,              //     365.25
};

const DEFAULT_BAR_INTERVAL = '1m';  // observatory uses 1-min bars
const DEFAULT_MIN_OBS = 30;         // need ≥30 valid log-returns for stable σ

/**
 * realizedVol(series, opts?) -> number | NaN
 *
 * series: [[ts, price], ...] ascending by ts. Close-to-close log-return
 * standard deviation, annualized via sqrt(periodsPerYear).
 *
 * opts:
 *   barInterval: '1m'|'5m'|'1h'|'8h'|'1d' — default '1m'
 *   periodsPerYear: explicit override (takes priority over barInterval)
 *   ewma: { lambda: number } — if present, use EWMA variance instead of equal-weight
 *   minObs: minimum valid log-returns required (default 30)
 *
 * Returns NaN if insufficient data or zero/near-zero variance.
 */
export function realizedVol(series, opts = {}) {
  if (!Array.isArray(series) || series.length < 2) return NaN;

  // ── log-returns ──────────────────────────────────────────────────────────
  const logReturns = [];
  for (let i = 1; i < series.length; i++) {
    const p0 = Number(series[i - 1][1]);
    const p1 = Number(series[i][1]);
    if (p0 <= 0 || p1 <= 0) continue;           // skip invalid prices
    const lr = Math.log(p1 / p0);
    if (Number.isFinite(lr)) logReturns.push(lr);
  }

  const minObs = Number.isFinite(opts.minObs) ? opts.minObs : DEFAULT_MIN_OBS;
  if (logReturns.length < minObs) return NaN;

  // ── periodsPerYear ───────────────────────────────────────────────────────
  let periodsPerYear;
  if (Number.isFinite(opts.periodsPerYear) && opts.periodsPerYear > 0) {
    periodsPerYear = opts.periodsPerYear;
  } else {
    const bar = opts.barInterval || DEFAULT_BAR_INTERVAL;
    periodsPerYear = PERIODS_PER_YEAR[bar];
    if (!periodsPerYear) return NaN;  // unknown bar interval
  }

  // ── variance estimator ────────────────────────────────────────────────────
  let variance;
  if (opts.ewma && Number.isFinite(opts.ewma.lambda)) {
    // EWMA variance: σ²_t = λ·σ²_{t-1} + (1-λ)·r²_t
    // Converges to steady-state; final σ² is the estimate.
    const lambda = opts.ewma.lambda;
    if (lambda <= 0 || lambda >= 1) return NaN;
    let ewmaVar = logReturns[0] * logReturns[0];  // seed with first r²
    for (let i = 1; i < logReturns.length; i++) {
      ewmaVar = lambda * ewmaVar + (1 - lambda) * logReturns[i] * logReturns[i];
    }
    variance = ewmaVar;
  } else {
    // Equal-weight Bessel-corrected sample variance
    const n = logReturns.length;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += logReturns[i];
    const mean = sum / n;
    let ss = 0;
    for (let i = 0; i < n; i++) {
      const d = logReturns[i] - mean;
      ss += d * d;
    }
    variance = ss / (n - 2);  // Bessel correction (n-1 for variance, n-2 for σ² of σ̂)
  }

  if (!Number.isFinite(variance) || variance <= 0) return NaN;

  // ── annualize ─────────────────────────────────────────────────────────────
  const annVol = Math.sqrt(variance * periodsPerYear);
  return Number.isFinite(annVol) ? annVol : NaN;
}
```

**Key design choices:**

- **Bessel correction `n-2`**: For estimating the standard deviation of the volatility estimator itself (not just the population variance), `n-2` is the unbiased correction for the standard error of $\hat{\sigma}$. This is slightly conservative vs `n-1` and appropriate for a signal that gates real decisions. The difference vanishes at `n ≥ 30` (our `minObs`).
- **EWMA variant**: λ = 0.9995 gives a ~1-day half-life on 1-min bars (1386 bars), appropriate for a carry signal whose horizon is multi-hour. λ = 0.9998 gives ~2.4 days. The EWMA tracks regime changes faster than equal-weight; it is opt-in because it requires more care (seed sensitivity, λ choice).
- **`minObs = 30`**: Below 30 log-returns, the sample variance is too noisy to gate a carry decision. 30 one-minute bars = 30 minutes of data — the absolute minimum for a vol estimate that isn't pure noise.

## 2. Divide-by-Small-Vol Handling: `minVol` Floor

### The problem

When `σ_ann` is very small (e.g. a stablecoin pair at 2% annualized vol), the ratio `fundingApr / σ_ann` explodes: a 5% funding APR on 2% vol gives ratio = 2.5, which looks like an incredible trade but is actually just a vol-of-vol artifact — the vol estimate is unreliable at low levels, and the next regime shift will crush you.

### The floor: `minVol = 0.10` (10% annualized)

**Justification**: 10% annualized vol corresponds to a ~0.63% daily move ($0.10 / \sqrt{252} \approx 0.0063$). Below this level:

1. **Estimation noise dominates**: With 1-min bars, a 10% annualized vol means per-bar σ ≈ 0.000138. At 30 observations, the standard error of σ̂ is ~13% of the estimate — barely acceptable. Below 10%, the relative error exceeds 15%.
2. **Regime fragility**: Assets with <10% annualized vol in crypto are either stablecoins (where funding is structurally near-zero and the ratio is meaningless) or in a temporary low-vol compression that will revert violently.
3. **Carry-vol is a risk-adjusted metric**: A vol floor of 10% says "I refuse to believe the risk is below 10% annualized in crypto" — a conservative prior that matches the asset class.

**Implementation**: If `σ_ann < minVol`, return `null` from `carryVolToSignal` (do NOT clamp and divide — clamping hides the information that vol is suspiciously low).

```javascript
export const DEFAULT_MIN_VOL = 0.10;  // 10% annualized — below this, vol estimate is unreliable

export function carryToVol(annualizedFundingApr, annualizedVol) {
  const apr = Number(annualizedFundingApr);
  const vol = Number(annualizedVol);
  if (!Number.isFinite(apr) || !Number.isFinite(vol)) return NaN;
  if (vol <= 0) return NaN;
  return apr / vol;
}
```

The `minVol` gate lives in `carryVolToSignal`, not in `carryToVol` (which is a pure ratio function):

```javascript
if (annualizedVol < minVol) return null;  // vol too low to trust
```

## 3. Threshold Justification: `ratioThreshold` and `minFundingApr`

### `ratioThreshold = 0.50`

**Justification**: The carry-to-vol ratio measures "how many units of risk-adjusted carry am I earning per unit of volatility risk." In traditional FX carry, a Sharpe-like ratio of 0.5 is the minimum for a trade that compensates for the risk — below that, the carry doesn't justify the vol exposure after transaction costs, gap risk, and funding mean-reversion.

- At ratio = 0.50, you earn 50 cents of carry per dollar of vol risk per year. This is the **break-even** for a risk-averse allocator after costs.
- At ratio = 1.0, you earn $1 of carry per $1 of vol — a strong signal.
- At ratio = 0.30, you earn 30 cents per dollar of vol — not worth the execution risk in a market where funding mean-reverts within 1–3 days.

The 0.50 threshold is deliberately above the noise floor: it requires the carry to be at least half the vol, which filters out the vast majority of funding blips.

### `minFundingApr = 0.05` (5% APR)

**Justification**: Even if vol is low and the ratio is high, a funding rate below 5% APR is economically insignificant — it represents less than 0.014% per 8-hour period, which is within the bid-ask spread and funding noise band for most perps. Below 5% APR:

1. **Transaction cost erosion**: A single round-trip in a perp costs ~5–10 bps in slippage + fees. At 5% APR, you earn ~1.4 bps per 8h period — it takes 4+ periods just to cover entry costs.
2. **Funding noise**: Binance funding rates have a natural noise band of ±0.01% per period. At 5% APR, the signal-to-noise ratio is poor.
3. **Mean-reversion drag**: Funding rates mean-revert. A 5% APR signal is likely to halve within 24–48 hours, turning a marginal trade into a loss.

The 5% floor is below the existing `DEFAULT_FUNDING_APR_THRESHOLD = 0.10` in perp-signals.mjs — this is intentional. The carry-vol signal is more selective (it also gates on the ratio), so we can afford a lower absolute funding floor. A 5% APR at 10% vol gives ratio = 0.50, which just barely passes — appropriate for the vol-normalized gate.

## 4. Worked Numeric Example

**Setup**: BTC perp, funding rate = 0.01% per 8h, 1-min close prices over the last 4 hours (240 bars).

### Step 1: Annualize funding

$$\text{fundingApr} = 0.0001 \times 1095.75 = 0.1096 \approx 10.96\%$$

### Step 2: Compute realized vol

Suppose the 240 one-minute log-returns have sample std $\hat{\sigma}_{1m} = 0.00087$.

$$\sigma_{\text{ann}} = 0.00087 \times \sqrt{525960} = 0.00087 \times 725.23 = 0.631 \approx 63.1\%$$

### Step 3: Compute ratio

$$\text{carryToVol} = \frac{0.1096}{0.631} = 0.174$$

**Result**: ratio = 0.174 < 0.50 threshold → **no signal**. The 11% funding APR is not worth the 63% vol risk.

### The brief's example: funding 40% APR, vol 60% annualized

$$\text{carryToVol} = \frac{0.40}{0.60} = 0.667$$

- `minFundingApr` check: 0.40 ≥ 0.05 ✓
- `minVol` check: 0.60 ≥ 0.10 ✓
- `ratioThreshold` check: 0.667 ≥ 0.50 ✓
- **Side**: fundingApr > 0 → **short** (crowded long, you earn carry by being short)
- **Confidence**: `min(0.65, 0.40 + (0.667 - 0.50) × 0.5) = min(0.65, 0.484) = 0.48` — advisory, low

**Fire?** Yes, but as an **advisory tilt** at confidence 0.48, not a dominant signal. The ratio says "you're earning 67 cents of carry per dollar of vol risk" — attractive but not overwhelming. This belongs on the 3h–12h rungs, not the 1-minute scalp.

### Edge case: high funding, very low vol

Funding 40% APR, vol 8% annualized (e.g. a stablecoin pair in a calm market):

- `minVol` check: 0.08 < 0.10 → **null, no signal**. The vol estimate is unreliable and the ratio (5.0) is a mirage.

## 5. The Single Biggest Way This Ratio Misleads — and the Guard

### The trap: **Vol clustering makes the denominator stale**

Realized vol is backward-looking. Crypto vol clusters: a calm 60% annualized vol regime can shift to 120% in hours (liquidation cascade, exchange event, macro shock). The ratio `fundingApr / σ_realized` looks attractive at 0.67 when vol is 60%, but when vol doubles to 120% overnight, the ratio collapses to 0.33 — below threshold — and you're already in the trade eating the drawdown.

This is the **vol-of-vol problem**: the ratio is stable only when vol is stable, and crypto vol is emphatically not stable. The very conditions that make carry attractive (low vol, high funding) are the conditions that precede vol spikes (complacent positioning → crowded leverage → cascade).

### The guard: **EWMA vol with a vol-of-vol sanity check**

1. **Use EWMA vol (λ ≈ 0.9995, ~1-day half-life on 1-min bars)** as the default, not equal-weight. EWMA tracks regime changes faster — it weights recent volatility more, so a vol spike shows up in the denominator sooner. This is why the EWMA variant exists in `realizedVol`.

2. **Cross-check against a longer-window equal-weight vol**. If `σ_EWMA / σ_equalWeight < 0.5`, vol is collapsing and the EWMA estimate may be lagging the regime shift downward — the ratio is likely overestimating carry attractiveness. In this case, use the higher of the two vol estimates (conservative: assume more risk, not less).

3. **Never fire the signal when vol has increased >2× in the last 4 hours**. This is a simple regime-change detector: if the most recent 4h EWMA vol is more than double the 24h EWMA vol, the market is in a vol expansion and carry trades are exactly the wrong thing to enter (funding will mean-revert while vol continues to expand).

4. **Cap confidence at 0.65**. This signal is advisory. It tilts; it never dominates. A 0.65 confidence cap ensures that even a "perfect" carry-vol ratio never overrides a price/vol signal that says "don't enter."

### Implementation sketch for the regime guard

```javascript
// In carryVolToSignal, after computing the ratio:
if (opts.ewmaVolRecent && opts.ewmaVolLonger) {
  // Vol expansion check: if recent vol > 2× longer-window vol, suppress
  if (opts.ewmaVolRecent > 2 * opts.ewmaVolLonger) return null;
  // Vol compression check: use the higher vol estimate
  const conservativeVol = Math.max(opts.ewmaVolRecent, opts.ewmaVolLonger);
  const conservativeRatio = Math.abs(annualizedFundingApr) / conservativeVol;
  if (conservativeRatio < ratioThreshold) return null;
}
```

This guard is the single most important safeguard: **the ratio lies when vol is about to change, and in crypto, vol is always about to change.**

---

### Summary of constants

| Constant | Value | Justification |
|---|---|---|
| `PERIODS_PER_YEAR['1m']` | 525 960 | 365.25 × 24 × 60 — matches perp-adapter's 365.25-day calendar |
| `minVol` | 0.10 (10%) | Below 10% ann vol, estimation noise + regime fragility make the ratio untrustworthy |
| `minFundingApr` | 0.05 (5%) | Below 5% APR, carry is within transaction-cost + noise band |
| `ratioThreshold` | 0.50 | Carry must be ≥50% of vol risk to justify entry after costs and mean-reversion |
| `maxConfidence` | 0.65 | Advisory cap — carry-vol never dominates price signals |
| EWMA default λ | 0.9995 | ~1-day half-life on 1-min bars — tracks regime changes without overreacting |
| `minObs` | 30 | Minimum log-returns for a vol estimate with <15% relative standard error |
