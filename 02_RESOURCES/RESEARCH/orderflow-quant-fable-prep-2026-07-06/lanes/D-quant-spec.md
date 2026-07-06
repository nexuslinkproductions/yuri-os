# D — Quant Methodology Spec (IC spine + validation gates)

Formula-level spec for Fable 5 to implement the Information-Coefficient spine + overfit/leakage
gates CORRECTLY. This is the layer where quant systems silently overfit — every gate below has an
exact formula, an exact threshold, and a citation. Local-first: item 3 (DSR) and the FDR gate under
item 4 are ALREADY IMPLEMENTED in `_SYSTEM/Scripts/alpha-factor-library/factor-evaluator.mjs` —
those sections spec how to FEED that module, not rebuild it.

---

## 1. Information Coefficient (IC)

**Definition.** IC is the cross-sectional (or per-symbol time-series) correlation between a
factor's forecast signal at time *t* and the realized forward return over horizon *h*:

```
IC_t,h = corr( signal_t , forwardReturn_{t+h} )
```

Two estimators, both valid, different robustness:

- **Pearson IC** — standard linear correlation coefficient. Sensitive to outliers and assumes a
  linear signal-return relationship. `IC_pearson = Cov(signal, fwdRet) / (σ_signal · σ_fwdRet)`.
- **Spearman Rank IC (the industry-standard choice)** — Pearson correlation computed on the
  RANKS of signal and forward return instead of raw values: `IC_rank = Pearson(rank(signal),
  rank(fwdRet))`. Robust to outliers/non-linearity, only requires monotonic (not linear)
  predictive relationship — this is what Grinold & Kahn and most practitioner literature mean by
  "IC" unless stated otherwise. **Default to rank IC** for the system; compute Pearson IC as a
  secondary diagnostic (a large Pearson/rank divergence signals a non-monotonic or outlier-driven
  relationship worth investigating, not a factor to trust blindly).

**Per-symbol, per-horizon computation.** For each (symbol, horizon) pair, compute IC over a
ROLLING window (not the whole history) so IC tracks regime drift:

```
IC_t,h(symbol) = rankCorr( signal_{t-w..t}(symbol), forwardReturn_{t-w+h..t+h}(symbol) )
```

Rolling window `w`: use enough independent (non-overlapping, see §2 breadth) observations to
resolve a meaningful correlation — practitioner convention is 60–120 observations minimum for a
stable rank correlation; below ~30 the IC estimate itself is noise. Report IC alongside its own
standard error (`SE_IC ≈ 1/√(n-3)` under the Fisher z-transform approximation) so a headline IC
number is never quoted without an implicit confidence band.

**Interpretation (per the transcript / practitioner convention).** IC magnitude bands widely cited
in the Grinold & Kahn tradition:
- IC ≈ 0.02–0.05 — typical for a single systematic equity factor; considered a WORKABLE edge
  because breadth compounds it (see §2).
- IC ≈ 0.05–0.10 — a STRONG factor by institutional standards; rare to sustain.
- IC > 0.10 — exceptional, or a red flag for a leakage/overfit artifact — cross-check with the
  DSR/BH gates below before trusting it.

The 5% (0.05) threshold cited in the task brief is squarely in the "strong, real" band, not a
minimum bar — do not set the promotion gate AT 0.05 and call weaker factors failures; a genuinely
tradeable systematic factor commonly sits at 0.02–0.03 IC and earns its edge through breadth.

**IC decay across horizons (the horizon-ladder use).** Compute IC at each rung of the existing
horizon ladder (`_SYSTEM/Scripts/alpha-factor-library/horizon-ladder.mjs`: 15m, 30m, 60m, 3h, 12h,
weekly) to build an IC-decay curve. A genuine signal shows IC decaying smoothly and monotonically
(or holding flat, e.g. for slow carry/funding signals) as horizon lengthens; a signal whose IC
SPIKES at one arbitrary horizon and is near-zero at neighbors is far more likely a multiple-testing
artifact (you tested 6 horizons, one hit by chance) than a real edge — this is exactly the
multiple-testing problem in §4 applied across horizons instead of across factors, and should route
through the SAME BH-FDR machinery (treat each horizon's IC test as one more p-value in the fleet).

**Citation:** Grinold, R. (1989), "The Fundamental Law of Active Management," *Journal of
Portfolio Management*; Grinold & Kahn, *Active Portfolio Management* (2000), the canonical IC
definition and interpretation bands.

---

## 2. Grinold's Fundamental Law of Active Management

**Formula:**

```
IR = IC × √BR
```

- **IR (Information Ratio)** — the ratio of a strategy's active (benchmark-relative) return to
  its active risk (tracking error): `IR = activeReturn / trackingError`. This is the
  risk-adjusted skill measure the law predicts.
- **IC (Information Coefficient)** — as defined in §1, the average per-bet forecasting skill.
- **BR (Breadth)** — the number of INDEPENDENT forecasts/bets made per year.

**Breadth, defined precisely for THIS system.** Breadth is not "number of trades" — it is the
number of *statistically independent* betting decisions. Two trades on the same signal within the
same autocorrelation window of that signal are ONE bet, not two. For this orderflow/GEX/footprint
system, breadth should be computed as:

```
BR ≈ Σ_signals ( tradingDaysPerYear / signal_decorrelation_horizon_in_days ) × nIndependentSymbols
```

where `signal_decorrelation_horizon` is read off the IC-decay curve from §1 (the horizon at which
IC crosses zero or plateaus is roughly the horizon over which successive bets on that signal stop
being independent), and `nIndependentSymbols` discounts for cross-symbol correlation (10 highly
correlated majors are NOT 10 independent bets — use average pairwise correlation of the signal's
returns across symbols to shrink the effective count, e.g. `nIndependentSymbols ≈ N / (1 + (N-1)ρ̄)`,
the standard effective-N-under-correlation formula). This is the single most commonly inflated
number in practice — overstating breadth is how a mediocre IC gets marketed as a strong IR.

**Transfer-coefficient caveat.** The full law with implementation frictions:

```
IR = IC × √BR × TC
```

TC (Transfer Coefficient, Clarke, de Silva & Thorley 2002/2006) is the correlation between the
IDEAL (unconstrained) portfolio the signal implies and the ACTUAL portfolio after fees, slippage,
position limits, exchange constraints, and risk overlays reduce/distort it. TC = 1 only for a
frictionless, unconstrained implementation — never true in practice; for a crypto perp system with
funding costs, maker/taker fees, and exchange-imposed leverage/position caps, expect TC materially
< 1. Any IR reported without a TC term is the UNCONSTRAINED upper bound, not what the live system
will realize — Fable should report both the theoretical IR (TC=1) and the fee/slippage-adjusted
realized IR (using the existing `feeHurdle` fields already in `horizon-ladder.mjs`'s RUNGS) side by
side, never just the former.

**Citation:** Grinold (1989) ibid.; Clarke, de Silva & Thorley (2002), "Portfolio Constraints and
the Fundamental Law of Active Management," *Financial Analysts Journal*; Clarke, de Silva & Thorley
(2006) extension to correlated-asset constraints.

---

## 3. Deflated Sharpe Ratio (Bailey & López de Prado) — ALREADY IMPLEMENTED, spec is the feed contract

**This is fully implemented in `_SYSTEM/Scripts/alpha-factor-library/factor-evaluator.mjs`
(`deflatedSharpe`, lines 199-266). Fable does NOT rebuild this — it feeds it correctly.** Verified
the live code matches the paper's formula exactly:

```
DSR = Φ( (SR̂ − SR₀) · √(T−1) / √(1 − γ₃·SR̂ + ((γ₄−1)/4)·SR̂²) )
```

where `SR₀` (the deflated null benchmark, the "expected maximum Sharpe under N trials," the False
Strategy Theorem term) is:

```
SR₀ = √Var[SR] · [ (1−γ)·Φ⁻¹(1 − 1/N) + γ·Φ⁻¹(1 − 1/(N·e)) ]
```

γ = Euler-Mascheroni constant (0.5772156649...), e = Euler's number, Φ = standard normal CDF,
Φ⁻¹ = its inverse (quantile function), γ₃ = skewness, γ₄ = kurtosis (3 for a normal distribution),
T = track length (sample size), N = number of independent trials. Confirmed verbatim against the
formula reproduced in the DSR literature (Bailey & López de Prado's own equations, cross-checked
via marti.ai's reproduction of the paper's notation — the primary PDF's equations did not OCR
cleanly, but the secondary reproduction matches the code's implementation term-for-term, including
the `1 − γ₃·SR̂ + (γ₄−1)/4·SR̂²` denominator and the `(1−γ)Z⁻¹[1−1/N] + γZ⁻¹[1−1/(Ne)]` expected-max
term).

**Exact inputs the factor-evaluator function requires (`deflatedSharpe(observedSharpe, opts)`):**
- `observedSharpe` — the **PER-PERIOD** Sharpe (NOT annualized; use `sharpePeriod` from
  `backtestFactor`, never the annualized `sharpe` field — this is a common integration bug: passing
  the annualized number in inflates DSR wrongly).
- `nTrials` (N) — how many independent factor/parameter variants were actually tried before this
  one was selected. **This number must be honestly counted by Fable's own experiment harness** — if
  the factor-scorer or param-sweep tooling tries 40 lookback-window variants and hand-picks the
  best, N=40, not N=1. Undercounting N is the single most common way a DSR gate gets gamed.
  `Var[SR]` inside the function defaults to `1/T` (the per-period SR estimator variance under the
  null) — this is the standard approximation, not a free parameter to tune.
- `T` — sample length (number of return observations).
- `skew`, `kurtosis` — the THIRD and FOURTH moments of the actual observed return series (compute
  from the same return series backtested, not assumed normal — the whole point of DSR over a
  vanilla t-test is correcting for the fat left tail crypto/perp returns typically have).
- `confidence` — default 0.95 in the code.

**Gate threshold: `dsr > 0.95`** (`passes` field, already wired). This is the conventional one-sided
95% confidence that the TRUE Sharpe (after deflating for selection bias) is positive. Do not lower
this threshold to pass more factors — 0.95 is the standard the paper itself frames as the
"acceptable" false-strategy rejection confidence.

**Citation:** Bailey, D.H. & López de Prado, M. (2014), "The Deflated Sharpe Ratio: Correcting for
Selection Bias, Backtest Overfitting, and Non-Normality," *Journal of Portfolio Management* 40(5);
builds on Bailey & López de Prado (2012), "The Sharpe Ratio Efficient Frontier" (the PSR).

---

## 4. Harvey-Liu-Zhu multiple-testing — the BH-FDR half is ALREADY IMPLEMENTED, the t≈3 framing is new spec

**`benjaminiHochberg` in `factor-evaluator.mjs` (lines 283-305) already implements the BH (1995)
step-up procedure exactly** — verified against the canonical worked example (N=15, q=0.05 → k=4,
threshold=0.0095) in the file's own smoke test, which matches the textbook answer. Fable feeds this
with the fleet's p-values; it does not rebuild the FDR math.

**Why t ≈ 3, not 2.** The traditional single-test significance bar is t > 1.96 (≈5% two-sided) or
t > 2 as a round-number convention. Harvey, Liu & Zhu (HLZ 2016) catalogued 313 published
risk-factor papers testing 316 distinct factors against overlapping datasets. Under the null (no
real factors), testing 316 hypotheses at the 5% level should produce ~16 "significant" results by
chance alone — most of the "factor zoo" is expected false discovery, not signal. HLZ apply multiple
testing corrections and conclude the **t-stat hurdle for a NEW factor should be ≈3.0**, not 2.0,
once you account for the number of factors effectively tested before it in the literature.

**Haircut methods HLZ apply (in order of conservatism):**
1. **Bonferroni** — most conservative: divide the significance level by N (number of tests):
   `α_adjusted = α / N`. Controls family-wise error rate (probability of ANY false positive)
   at α. Appropriate when even one false discovery is costly and N is not huge.
2. **Holm** — a step-down refinement of Bonferroni: sort p-values ascending, test
   `p_(k) ≤ α/(N−k+1)` sequentially, stop at first failure. Uniformly more powerful than plain
   Bonferroni for the same family-wise error guarantee — should be preferred over vanilla
   Bonferroni whenever using an FWER control.
3. **BHY (Benjamini-Hochberg-Yekutieli, 2001)** — the FDR control HLZ actually anchor their t≈3
   headline to (their Theorem 1.3 reference). BHY extends BH (1995) to hold under ARBITRARY
   dependence between tests (BH-1995 assumes independence or positive-regression dependence; BHY
   drops that assumption at the cost of being more conservative). Since factor tests share
   overlapping market/macro data (NOT independent), **BHY is the correct choice over plain BH for a
   fleet of factors built on correlated/overlapping price history** — this is a real refinement
   Fable should implement as an option alongside the existing `benjaminiHochberg`, not a
   contradiction of it (BH-1995 in the code is valid when the fleet's factors are reasonably
   decorrelated; BHY is the safer default when they are not, which is the common case for
   orderflow/GEX/footprint factors all derived from the same underlying tape).

**Setting the number of tested factors (N).** Same discipline as DSR's `nTrials`: N must count
EVERY variant tried, including abandoned parameter sweeps, not just the survivors presented for
promotion. For this system, N should be tracked cumulatively per "factor family" (e.g., all GEX
sign-convention variants, all footprint-threshold variants) — the existing `factor-scorer.mjs` /
`param-sweep.mjs` fleet is where this count must be captured and threaded into both `deflatedSharpe`
(§3) and the BH/BHY gate here; a spec gap if Fable doesn't wire an actual counter through both.

**The out-of-sample gate a factor must clear.** t ≈ 3 (or the BH/BHY-adjusted threshold given
actual N) is evaluated **on the HELD-OUT window only** (`heldOutEvaluate`'s `test` split from
§5) — never on in-sample data, which is exactly what "haircut" methods correct: an in-sample t of 3
after 40 variants tried is worth roughly what an in-sample t of 2 was worth before multiple-testing
correction existed. Combine with DSR: a factor promotes only when (a) DSR > 0.95 on the full
observed series AND (b) held-out t-stat / BH-FDR membership clears the multiple-testing-adjusted
bar — this is precisely what `factorPromotionGate` already wires (dsrPass && fdrPass), so Fable's
job is choosing N honestly and optionally swapping BH→BHY, not building new gate logic.

**Citation:** Harvey, C.R., Liu, Y., & Zhu, H. (2016), "…and the Cross-Section of Expected
Returns," *Review of Financial Studies* 29(1); Benjamini, Y. & Hochberg, Y. (1995), "Controlling
the False Discovery Rate," *JRSS-B* 57(1) (the BH procedure already coded); Benjamini, Y. &
Yekutieli, D. (2001), "The Control of the False Discovery Rate in Multiple Testing under
Dependency," *Annals of Statistics* 29(4) (BHY, arbitrary-dependence extension).

---

## 5. Walk-forward, purging, embargo — chronological split ALREADY IMPLEMENTED; purge/embargo is new spec

**`temporalSplit` / `heldOutEvaluate` in `factor-evaluator.mjs` (lines 152-196) already implement
the basic chronological (leak-free) train/test split** — first `frac` train, last `1-frac` test, no
shuffle. This is correctly documented in the file as fixing the specific leak eval-processing's
Fisher-Yates random split would otherwise introduce. This is a single ANCHORED walk-forward split,
not yet purged/embargoed, and not yet multi-fold.

**Anchored vs rolling walk-forward.** Two disciplines, both valid, different tradeoffs:
- **Anchored (expanding window)** — train window always starts at t=0, end of train window
  advances each fold. What `temporalSplit` currently gives (a single anchored split). Uses more
  data per fold as time progresses; assumes the earliest data is still relevant.
- **Rolling (fixed window)** — train window has fixed length and SLIDES forward each fold,
  dropping old data. More adaptive to regime change; loses long-history power. For a
  fast-regime-shifting market (crypto perp, orderflow/GEX signals whose half-life is short per
  §1's IC-decay), rolling is generally the more defensible choice UNLESS the ladder's long rungs
  (12h/weekly) specifically need the extra history anchored windows provide — Fable should support
  BOTH modes and let the horizon-ladder rung pick (short rungs: rolling; long rungs: anchored).

**PURGE (removes leakage from overlapping LABELS).** When a label (e.g. "forward return over next
h bars") is computed from a window of FUTURE data relative to the signal, any training observation
whose label-computation window overlaps the test set's time range leaks test information into
training. Purging removes those training observations: for every test-set time index, DROP any
training observation whose `[t, t+h]` label window intersects the test window. This matters
MOST for the horizon-ladder's long rungs (12h, weekly) where the label window is wide enough to
straddle a fold boundary; it is close to a non-issue for the 15m rung with instant-return labels,
but do not skip it — a systematic implementation should purge unconditionally rather than special-
case short rungs.

**EMBARGO (removes leakage from serial correlation, catches what purging alone misses).** Add a
buffer period AFTER each test fold during which no training observation is used, sized to the
autocorrelation length of the underlying signal/return series — purging handles direct label
overlap, but serial correlation in the return series itself can still let information leak forward
across a fold boundary even with zero label-window overlap. López de Prado's own rule of thumb:
`embargo_h ≈ 0.01 × T` (1% of total sample length) "often suffices to prevent all leakage" — treat
this as a floor to validate against this system's own measured autocorrelation decay (from the
IC-decay curve in §1), not a number to apply blindly if the measured decorrelation horizon is
longer than 1% of T.

**Why hermetic-green ≠ live-correct here (the core discipline this section exists to protect).** A
backtest that passes purge+embargo+DSR+BH-FDR is INTERNALLYCONSISTENT, not proof of a live edge —
it proves the historical data doesn't obviously leak into itself. It does NOT prove: (a) the
regime that generated the historical IC persists forward (regime-shift risk — explicitly punted to
Phase 3 per the file's own comments); (b) live execution matches backtest fill assumptions (slippage,
partial fills, latency — this is why `maker-fill-sim.mjs` / `fill-surface.mjs` exist as SEPARATE
concerns from the statistical gate); (c) the OOS window used for validation wasn't itself
implicitly mined (if Fable iterates on the SAME held-out window across many development cycles,
that held-out window silently becomes another in-sample trial — the `nTrials` count in §3/§4 MUST
increment every time the held-out split is looked at and acted on, not just at final promotion).
Recommend Fable log every time `heldOutEvaluate` or a purged fold's test performance is inspected
during development, feeding that count into `nTrials`, or the DSR/BH gates silently become
theater.

**Citation:** López de Prado, M. (2018), *Advances in Financial Machine Learning*, Wiley, Ch. 7
("Cross-Validation in Finance") for purging/embargo/CPCV; the embargo sizing rule (`h ≈ 0.01T`) is
stated directly in that chapter.

---

## 6. GEX (Gamma Exposure)

**Base formula (per strike, per expiration):**

```
GEX_strike = gamma × OI × 100 × spot² × 0.01 × sign
```

**Validated component-by-component (cross-checked against SpotGamma's own published formula +
an independent open-source implementation — 2 sources, consistent):**

- **`gamma`** — the option's Black-Scholes (or model-implied) gamma: ∂²V/∂S², sensitivity of
  delta to a $1 move in the underlying.
- **`OI`** — open interest (contracts outstanding) at that strike/expiration.
- **`100`** — the standard US equity option contract multiplier (100 shares/contract). **Flag for
  Fable:** if this system trades CRYPTO PERPETUAL options (not standard 100-share equity
  contracts), this multiplier must be replaced with the actual contract size for the venue (e.g.
  Deribit BTC options are typically 1 BTC per contract, not 100) — copying the 100 constant
  verbatim from equity-market GEX literature into a crypto options context is a silent unit bug.
- **`spot²` (spot price squared)** — converts a PER-1%-MOVE dollar-gamma into a dollar-notional
  term. Mechanically: gamma is ∂delta/∂S in shares-per-$1; multiplying by spot once converts to
  dollar-delta-change-per-$1-move; multiplying by spot AGAIN (hence squared) rescales that into
  the dollar P&L dealers must hedge for a *percentage* (not absolute dollar) move in the
  underlying — this is why it's spot² and not spot¹.
- **`0.01`** — converts the "per-$1-move" gamma sensitivity into a "per-1%-move" dollar-gamma
  figure (since `spot × 0.01` = the dollar size of a 1% move). Together, `spot² × 0.01` is the
  standard "dollar gamma for a 1% move" normalization used across the GEX literature (confirmed
  consistent across SpotGamma's public formula and a third-party open-source Python
  reimplementation).

**Dealer sign convention — VALIDATED, and the task brief's stated convention is BACKWARDS. Flag
this explicitly for Fable:**

The task brief describes the "common naive convention" as "dealers long gamma in puts, short in
calls → sign = +1 for calls, −1 for puts" — **this sentence contradicts itself and is wrong on the
mechanism.** The verified, standard convention (confirmed across SpotGamma's own docs, an
independent open-source GEX implementation, and a third analytical source — 3-way agreement) is:

```
sign(call)  = +1   (dealers are net SHORT calls after selling them to customers who buy calls
                     as directional bets or income overwrites → hedging a short-call position
                     requires being LONG GAMMA → calls contribute POSITIVE GEX)
sign(put)   = −1   (dealers are net SHORT puts after selling them to customers who buy puts as
                     hedges → hedging a short-put position requires being SHORT GAMMA → puts
                     contribute NEGATIVE GEX)
```

So: **calls → +1, puts → −1** is CORRECT (matches the task brief's stated sign mapping), but the
REASONING the brief attaches to it ("dealers long gamma in puts, short in calls") is the exact
inverse of the real mechanism and must not be carried into Fable's code comments or logic — dealers
are modeled as **short calls (hence long gamma from hedging them) and short puts (hence short
gamma from hedging them)**, not "long calls / long puts" or any variant that swaps which side is
long vs short. Net dealer gamma convention: **positive net GEX = dealers net long gamma
(stabilizing: buy dips, sell rallies); negative net GEX = dealers net short gamma (destabilizing:
sell dips, buy rallies)**.

**How wrong the naive sign can be, and what validates it.** The naive convention assumes ALL call
OI came from customers buying (dealers selling/short) and ALL put OI came from customers buying
(dealers selling/short). This breaks down when:
- Institutions BUY PUTS OUTRIGHT as portfolio hedges in size (still fits the naive assumption —
  customer-long-put, dealer-short-put) BUT also when institutions SELL CALLS outright (covered-call
  overwriting programs) — this is customer-SHORT-call, dealer-LONG-call, which is the OPPOSITE
  sign from the naive assumption and is common in the largest, most liquid names.
  institutions), the true sign for that OI segment flips.
- **Inter-dealer trades** (dealer buys from dealer) muddy the split entirely — OI attributed to
  "customer" flow may actually be dealer-to-dealer positioning with no customer directional intent
  at all.
- Crypto/perp options markets see this break down MORE than equities (per FlashAlpha/BackQuant
  sourcing) because retail/institutional participant mix differs from listed equity options, and
  OI data quality is generally worse.

**Validation path (SpotGamma cross-check):** SpotGamma itself does not rely on the naive convention
alone — it infers dealer-vs-customer positioning from a proprietary blend of intraday OI deltas
(volume that ADDS to OI within the day is more likely genuine new customer positioning vs.
rolled/closed dealer inventory), multi-expiration modeling (checks consistency of the inferred sign
across nearby expirations — a sign that flips wildly strike-to-strike within the same expiration is
a red flag), and its own IV surface fit. **Fable's practical validation gate:** treat naive-sign GEX
as a HYPOTHESIS-grade signal only (never above `research` rung on the claim-cortex ladder used
elsewhere in this system, e.g. `STATUS_TO_LADDER` in factor-evaluator.mjs), and require the SAME
DSR/BH-FDR promotion gate from §3/§4 before trusting a naive-sign GEX-derived factor — do not treat
GEX sign as ground truth just because the arithmetic is textbook-standard; the arithmetic being
standard does not make the DEALER-POSITIONING ASSUMPTION underneath it correct for this system's
actual venue/participants.

**Citation:** SpotGamma, "Gamma Exposure (GEX)" (spotgamma.com/gamma-exposure-gex/) — direct primary
formula + sign statement; FlashAlpha Research, "Dealer Positioning & GEX: A Quantitative Approach to
Options Flow" — independent confirmation of the same sign mechanism and explicit naive-vs-actual-
flow caveat; cross-checked against an independent open-source GEX reference implementation
(FlashAlpha-lab/gex-explained on GitHub) showing the same `call_gex = +gamma*OI*100*spot²*0.01`,
`put_gex = -gamma*OI*100*spot²*0.01` arithmetic.

---

## 7. Footprint / Order-Flow / Auction Market Theory (AMT)

Precise definitions for Fable to code, tied to Steidlmayer/Dalton AMT:

**Bid/Ask Delta (per price level, per bar).**

```
delta(price, bar) = volumeAtAsk(price, bar) − volumeAtBid(price, bar)
```

Every executed trade is either BUY-initiated (aggressor lifted the offer → counted at ask) or
SELL-initiated (aggressor hit the bid → counted at bid) — delta is the per-price-level net
aggression, positive = net buying pressure, negative = net selling pressure at that exact price
within that bar. This requires trade-side classification (bid vs ask aggressor), which for a
crypto venue means using the taker side of each fill (a taker buy = ask-side; a taker sell =
bid-side) — NOT inferring from tick direction, which is a noisier proxy when true trade-side data
is available from the exchange feed.

**CVD (Cumulative Volume Delta).**

```
CVD_t = Σ_{i=0}^{t} delta_i        (running sum of PER-BAR net delta, cumulative over the session)
```

where `delta_i` for CVD purposes is typically the BAR-level delta (sum of all price-level deltas
within that bar), not per-price-level. **Session boundary matters**: CVD resets to 0 at the start
of each session for sub-daily timeframes (standard convention), but is NOT reset (uses the chart's
own timeframe accumulation) for daily-and-above charts — Fable must pick and document a session
boundary (UTC daily reset is the simplest default for a 24/7 crypto venue with no natural
session close; consider whether this system needs a different reset cadence tied to its own
horizon-ladder rungs). **CVD divergence** (price makes a higher high while CVD makes a lower high,
or the inverse) is the tradeable signal: it indicates the move is not confirmed by net aggressive
volume and is a classic reversal/exhaustion tell — this is a natural derived feature to expose to
the factor library, distinct from CVD's raw level.

**POC (Point of Control).**

```
POC_session = argmax_price( volume(price) )   over the session's full price-volume distribution
```

The single price level with the MOST total traded volume in the period — represents where
buyers and sellers most agreed on "fair value" during that session (Steidlmayer's core AMT
concept: price alone tells you nothing, TIME-AND-VOLUME-AT-PRICE tells you where value actually
formed). Note the distinction the research surfaced: **Volume POC** (as defined above, using total
volume regardless of side) vs **Delta POC** (the price level with the most ABSOLUTE aggression,
i.e. `argmax_price(|delta(price)|)`) — these can diverge, and a divergence between them signals
value migrating (the auction is resolving somewhere other than its historical center). Fable should
compute both and treat their divergence as a derived signal, not just report one.

**Value Area (VA).**

```
VA = smallest contiguous price range around POC containing ≥ 70% of the session's total volume
```

Standard construction algorithm (from Market Profile / TPO methodology): start at POC, expand the
range one price-increment at a time by adding whichever adjacent row (above or below the current
range) has the GREATER volume, repeat until cumulative volume in the range reaches 70% of session
total. `VAH` (Value Area High) and `VAL` (Value Area Low) are the resulting range boundaries.
70% is the canonical convention (approximates "one standard deviation" of a normal-like volume
distribution around POC) — this is a fixed convention to implement exactly, not a free parameter to
tune per this system (departing from 70% breaks comparability with the entire AMT/Market-Profile
literature Fable would otherwise be able to draw on for validated heuristics like "responsive" vs
"initiative" trade classification).

**Composite VA (multi-session merge).**

```
CompositeVA = ValueArea( merged volume-at-price profile across N sessions )
```

Merge the raw price-volume distributions (NOT the individual sessions' already-computed value
areas — merge before computing VA, not after) across the desired N-session window, then apply the
same POC + 70%-expansion algorithm to the merged distribution. Composite VA is used to identify
LONGER-TERM value acceptance/rejection zones (e.g. a 5-day or 20-day composite) that persist across
the horizon-ladder's longer rungs (3h/12h/weekly), distinct from the single-session VA used for the
shortest rungs (15m/30m/60m) — this is a direct structural link Fable should wire: short-rung
factors reference single-session POC/VA, long-rung factors reference composite VA over a matching
lookback.

**Tie to Auction Market Theory (Steidlmayer/Dalton).** AMT frames the market as a continuous
two-way auction seeking the price at which the most volume transacts (fair value = POC). Two
canonical behavioral regimes Fable should be able to classify a bar/session into, both directly
computable from the footprint primitives above:
- **Responsive activity** — price rejects a level OUTSIDE value (beyond VAH/VAL) and returns
  toward POC; the expected, "auction working" behavior. Detectable as: price probes outside VA,
  delta at the extreme is WEAK/one-sided (an "unfinished auction" — one side prints volume at the
  extreme, the other doesn't, per the research), and price reverses back inside VA shortly after.
- **Initiative activity** — price breaks OUTSIDE value and CONTINUES, establishing a new value
  area elsewhere; the "auction failed to hold, trend continuation" behavior. Detectable as: price
  breaks the extreme with STRONG delta confirmation on both sides at the breakout level (a
  "finished auction" — both bid and ask volume print at the extreme, signaling the level was fully
  tested and accepted through), followed by migration of subsequent POC away from the prior value
  area.
- **Absorption** — large opposing limit-order volume repeatedly stops an aggressive push at a
  price level without the price moving through; visible directly in the footprint as high volume
  at one price with delta NOT confirming the direction the price attempted to move (e.g. heavy ask
  volume executed but price fails to advance) — a standalone factor candidate (absorption strength
  = aggressive volume that failed to move price / total volume at that level).

**Citation:** Steidlmayer, J.P. (1984-85, with the CBOT), origin of Market Profile / TPO; Dalton,
J., Jones, E., & Dalton, R., *Mind Over Markets* (1993, updated 2013) — the standard practitioner
translation of Steidlmayer's AMT into the responsive/initiative/absorption vocabulary above; Dalton,
J., *Markets in Profile* (2007) — the electronic-market update, including composite profile
methodology.

---

## Summary of local-reuse vs new-build for Fable

| Item | Status |
|---|---|
| IC (Pearson + rank), IC-decay ladder | **NEW** — no local implementation found (`horizon-ladder.mjs` scores forecasts but does not compute IC) |
| Grinold IR = IC×√BR×TC, breadth definition | **NEW** |
| Deflated/Probabilistic Sharpe | **REUSE** — `factor-evaluator.mjs::deflatedSharpe` implements the exact paper formula; feed `sharpePeriod`, honest `nTrials`, real `skew`/`kurtosis` |
| BH-FDR (independence-assuming) | **REUSE** — `factor-evaluator.mjs::benjaminiHochberg`, verified against the canonical 1995 worked example |
| BHY (dependence-robust FDR) | **NEW** — recommend adding alongside existing BH for correlated factor fleets |
| factorPromotionGate (combined DSR+FDR gate) | **REUSE** — `factor-evaluator.mjs::factorPromotionGate` |
| Chronological (anchored) walk-forward split | **REUSE** — `factor-evaluator.mjs::temporalSplit` / `heldOutEvaluate` |
| Rolling walk-forward, purge, embargo, nTrials-increments-on-OOS-peek | **NEW** |
| GEX formula + sign convention | **NEW** — validated against 3 sources; task brief's stated sign REASONING was backwards (sign mapping calls=+1/puts=-1 itself was correct) |
| Footprint delta/CVD/POC/VA/Composite VA/AMT regime classification | **NEW** |
