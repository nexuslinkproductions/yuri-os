# Alpha Factor Taxonomy — YURI Alpha Factor Library Seed Corpus

**Date:** 2026-06-13
**Sources:**
- Kakushadze, Z. (2016). "101 Formulaic Alphas." arXiv:1601.00991
- Jansen, S. "Machine for Trading" — Alpha Factor Library (ML4T)
- TA-Lib (150+ indicators across 10 function groups)

**Scope:** 60 factors across 9 categories, each tagged with data inputs, complexity, holding period, Sharpe contribution, correlation cluster, crypto relevance, and prediction-market applicability.

---

## Legend

| Field | Values |
|---|---|
| **Complexity** | O(1) = stateless per-bar, O(n) = rolling window, O(n^2) = pairwise rolling or nested |
| **Holding** | intraday / days / weeks / months |
| **Sharpe** | low / medium / high (expected standalone contribution) |
| **Crypto** | direct / adapt / N/A |
| **Polymarket** | yes (direct) / adapt (needs rework) / no |

---

## 1. MOMENTUM (12 factors)

| # | Factor | Formula / Source | Inputs | Complexity | Holding | Sharpe | Cluster | Crypto | Polymarket |
|---|--------|-----------------|--------|------------|---------|--------|---------|--------|------------|
| 1 | **RSI (14)** | `100 - 100/(1 + avg_gain/avg_loss)` over 14 periods | price | O(n) | days | medium | MOM-RSI-STOCH | direct | adapt |
| 2 | **MACD Histogram** | `EMA(12) - EMA(26)` signal: `EMA(9)` of MACD | price | O(n) | days-weeks | medium | MOM-MACD-APO | direct | adapt |
| 3 | **Rate of Change (ROC)** | `(P_t / P_{t-n} - 1) * 100` | price | O(n) | days | low | MOM-ROC-MOM | direct | adapt |
| 4 | **ADX (14)** | `100 * SMA(|+DI - -DI| / (+DI + -DI))` | HLC | O(n) | days-weeks | medium | MOM-TREND | direct | no |
| 5 | **Aroon Oscillator** | `AroonUp - AroonDown` over 25 periods | HL | O(n) | days-weeks | medium | MOM-TREND | direct | no |
| 6 | **CCI (14)** | `(TP - SMA(TP)) / (0.015 * MeanDev)` | HLC | O(n) | days | medium | MOM-CCI | direct | adapt |
| 7 | **Stochastic %K/%D** | `%K = (C - Low_N)/(High_N - Low_N) * 100` | HLC | O(n) | days | medium | MOM-RSI-STOCH | direct | adapt |
| 8 | **Williams %R** | `(High_N - C)/(High_N - Low_N) * -100` | HLC | O(n) | days | low | MOM-RSI-STOCH | direct | adapt |
| 9 | **Ultimate Oscillator** | Weighted avg of BP/TR over 7,14,28 periods | HLC | O(n) | days | medium | MOM-RSI-STOCH | direct | no |
| 10 | **MFI (14)** | Volume-weighted RSI using typical price | HLCV | O(n) | days | medium | MOM-VOL | direct | no |
| 11 | **WQ#001** | `rank(Ts_ArgMax(power(returns < 0, 2), 5)) - 0.5` (mean reversion) | returns | O(n) | days | medium | WQ-MEAN-REV | direct | no |
| 12 | **WQ#012** | `sign(delta(volume, 1)) * (-1 * delta(close, 1))` (vol-price divergence) | CV | O(n) | days | medium | WQ-VOL-DIV | direct | no |

---

## 2. TREND / OVERLAP STUDIES (10 factors)

| # | Factor | Formula / Source | Inputs | Complexity | Holding | Sharpe | Cluster | Crypto | Polymarket |
|---|--------|-----------------|--------|------------|---------|--------|---------|--------|------------|
| 13 | **SMA (50/200)** | `mean(P, N)` — golden/death cross signal | price | O(n) | weeks-months | low | TREND-MA | direct | no |
| 14 | **EMA (12/26)** | `alpha * P_t + (1-alpha) * EMA_{t-1}` | price | O(n) | days-weeks | low | TREND-MA | direct | no |
| 15 | **Bollinger Band Squeeze** | `(Upper - Lower) / Close` — volatility contraction | price | O(n) | days-weeks | medium | TREND-BB | direct | no |
| 16 | **BB %B** | `(Close - Lower) / (Upper - Lower)` — position within bands | price | O(n) | days | medium | TREND-BB | direct | adapt |
| 17 | **Parabolic SAR** | `SAR_{t-1} + alpha * (EP - SAR_{t-1})` trend reversal | HL | O(n) | days-weeks | low | TREND-SAR | direct | no |
| 18 | **KAMA** | Kaufman Adaptive MA — adapts smoothing to volatility | price | O(n) | days-weeks | medium | TREND-ADAPT | direct | no |
| 19 | **HT Trendline** | Hilbert Transform dominant cycle removal | price | O(n) | weeks | medium | TREND-CYCLE | direct | no |
| 20 | **Ichimoku Cloud** | Tenkan/Kijun/Senkou A,B — multi-timeframe trend | HLC | O(n) | weeks | medium | TREND-ICHIMOKU | direct | no |
| 21 | **TEMA** | `3*(EMA - EMA2) + EMA3` — fast trend | price | O(n) | days | medium | TREND-MA | direct | no |
| 22 | **WQ#032** | `rank(-1 * sum(rank(rank(log(sum(ts_min(rank(rank(-1 * rank(delta(close-1, 5))))), 2)), 1))))` (complex trend) | price | O(n) | days | high | WQ-TREND | direct | no |

---

## 3. VOLATILITY (8 factors)

| # | Factor | Formula / Source | Inputs | Complexity | Holding | Sharpe | Cluster | Crypto | Polymarket |
|---|--------|-----------------|--------|------------|---------|--------|---------|--------|------------|
| 23 | **ATR (14)** | `SMA(TrueRange, 14)` | HLC | O(n) | days | medium | VOL-ATR | direct | no |
| 24 | **NATR** | `ATR / Close * 100` — normalized cross-asset | HLC | O(n) | days | medium | VOL-ATR | direct | no |
| 25 | **Historical Volatility** | `std(log_returns, N) * sqrt(252)` | price | O(n) | days-weeks | medium | VOL-HVOL | direct | adapt |
| 26 | **Realized Volatility Ratio** | `vol_5d / vol_21d` — short vs long term vol | price | O(n) | days | medium | VOL-RATIO | direct | adapt |
| 27 | **Garman-Klass Vol** | `0.5*log(H/L)^2 - (2ln2-1)*log(C/O)^2` | OHLC | O(n) | days | medium | VOL-GK | direct | no |
| 28 | **Parkinson Vol** | `log(H/L)^2 / (4*ln2)` — range-based | HL | O(n) | days | low | VOL-PARK | direct | no |
| 29 | **Intraday Vol Intensity** | `std(return, N) / ATR(N)` — vol quality | HLC | O(n) | days | medium | VOL-QUALITY | direct | no |
| 30 | **WQ#046** | Complex mean-reversion via vol-adjusted price | CV | O(n) | days | high | WQ-VOL-MR | direct | no |

---

## 4. VOLUME / LIQUIDITY (8 factors)

| # | Factor | Formula / Source | Inputs | Complexity | Holding | Sharpe | Cluster | Crypto | Polymarket |
|---|--------|-----------------|--------|------------|---------|--------|---------|--------|------------|
| 31 | **On Balance Volume (OBV)** | Cumulative: `+V if C>C_prev, -V otherwise` | CV | O(n) | days-weeks | medium | VOL-OBV | direct | no |
| 32 | **Chaikin A/D Line** | `sum(MFV)` where `MFV = ((C-L)/(H-L)) * V` | HLCV | O(n) | days-weeks | medium | VOL-AD | direct | no |
| 33 | **Chaikin A/D Oscillator** | `EMA(AD, 3) - EMA(AD, 10)` | HLCV | O(n) | days | medium | VOL-AD | direct | no |
| 34 | **VWAP Deviation** | `(Close - VWAP) / VWAP` | CV | O(n) | intraday | medium | LIQ-VWAP | direct | no |
| 35 | **Amihud Illiquidity** | `mean(|return| / dollar_volume, N)` | CV | O(n) | weeks-months | low | LIQ-ILLIQ | adapt | no |
| 36 | **Volume Ratio** | `vol_up / vol_down` over N periods | CV | O(n) | days | medium | LIQ-VOLR | direct | no |
| 37 | **WQ#006** | `-1 * ts_corr(open, volume, 10)` (open-vol decoupling) | OV | O(n) | days | medium | WQ-VOL | direct | no |
| 38 | **WQ#043** | `ts_rank(volume, 20)` — volume acceleration | volume | O(n) | days | medium | WQ-VOL | direct | no |

---

## 5. VALUE (6 factors)

| # | Factor | Formula / Source | Inputs | Complexity | Holding | Sharpe | Cluster | Crypto | Polymarket |
|---|--------|-----------------|--------|------------|---------|--------|---------|--------|------------|
| 39 | **Book-to-Market (B/M)** | `book_value / market_cap` | fundamentals | O(1) | months | high | VALUE-BM | N/A | no |
| 40 | **Earnings Yield** | `E/P` or `EBIT/EV` | fundamentals | O(1) | months | high | VALUE-EY | N/A | no |
| 41 | **Dividend Yield** | `DPS / Price` | fundamentals | O(1) | months | medium | VALUE-DIV | N/A | no |
| 42 | **Free Cash Flow Yield** | `FCF / MarketCap` | fundamentals | O(1) | months | high | VALUE-FCF | N/A | no |
| 43 | **Sales-to-Price** | `Revenue / MarketCap` | fundamentals | O(1) | months | medium | VALUE-SP | N/A | no |
| 44 | **EV/EBITDA** | `EnterpriseValue / EBITDA` — inverse value | fundamentals | O(1) | months | high | VALUE-EV | N/A | no |

---

## 6. QUALITY (5 factors)

| # | Factor | Formula / Source | Inputs | Complexity | Holding | Sharpe | Cluster | Crypto | Polymarket |
|---|--------|-----------------|--------|------------|---------|--------|---------|--------|------------|
| 45 | **Gross Profitability** | `GrossProfit / TotalAssets` (Novy-Marx) | fundamentals | O(1) | months | high | QUAL-GP | N/A | no |
| 46 | **ROE** | `NetIncome / ShareholderEquity` | fundamentals | O(1) | months | medium | QUAL-ROE | N/A | no |
| 47 | **Accruals** | `(dCA - dCash) - (dCL - dSTD - dTP) - Dep` | fundamentals | O(1) | months | medium | QUAL-ACCR | N/A | no |
| 48 | **Piotroski F-Score** | 9-bin score: profitability, leverage, efficiency | fundamentals | O(1) | months | high | QUAL-F | N/A | no |
| 49 | **Altman Z-Score** | `1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + X5` | fundamentals | O(1) | months | medium | QUAL-Z | N/A | no |

---

## 7. SENTIMENT / ALTERNATIVE (5 factors)

| # | Factor | Formula / Source | Inputs | Complexity | Holding | Sharpe | Cluster | Crypto | Polymarket |
|---|--------|-----------------|--------|------------|---------|--------|---------|--------|------------|
| 50 | **News Sentiment Score** | NLP polarity on financial news corpus | text | O(n) | days | medium | SENT-NLP | adapt | direct |
| 51 | **Social Media Buzz** | Volume-weighted sentiment from Twitter/Reddit | text | O(n) | intraday-days | medium | SENT-SOCIAL | direct | direct |
| 52 | **Fear & Greed Index** | Composite: VIX, put/call, breadth, safe havens | options/macro | O(n) | days-weeks | medium | SENT-FG | adapt | adapt |
| 53 | **Implied Volatility Spread** | `IV_call - IV_put` (skew signal) | options | O(n) | days | medium | SENT-OPT | adapt | adapt |
| 54 | **Google Trends Momentum** | `delta(search_volume, N)` — attention proxy | text | O(n) | days-weeks | low | SENT-GTRENDS | direct | direct |

---

## 8. CROSS-SECTIONAL / STATISTICAL (4 factors)

| # | Factor | Formula / Source | Inputs | Complexity | Holding | Sharpe | Cluster | Crypto | Polymarket |
|---|--------|-----------------|--------|------------|---------|--------|---------|--------|------------|
| 55 | **Fama-French Market Beta** | Rolling OLS beta on market factor | returns | O(n^2) | weeks-months | medium | XS-BETA | direct | no |
| 56 | **Size (log market cap)** | `ln(MarketCap)` — SMB proxy | cap | O(1) | months | medium | XS-SIZE | direct | no |
| 57 | **Idiosyncratic Vol** | `std(residuals, N)` from factor model | returns | O(n^2) | weeks | medium | XS-IDIOVOL | direct | no |
| 58 | **WQ#002** | `-1 * ts_corr(rank(delta(log(volume), 2)), rank((close-open)/open), 6)` (vol-price rank corr) | OCV | O(n^2) | days | high | WQ-XS | direct | no |

---

## 9. CRYPTO-NATIVE / PREDICTION MARKET (2 factors)

| # | Factor | Formula / Source | Inputs | Complexity | Holding | Sharpe | Cluster | Crypto | Polymarket |
|---|--------|-----------------|--------|------------|---------|--------|---------|--------|------------|
| 59 | **Funding Rate Momentum** | `delta(perp_funding_rate, N)` — crowded long/short | derivatives | O(n) | intraday-days | high | CRYPTO-FUND | direct | no |
| 60 | **Prediction Market Calibration** | `actual_outcome_rate - implied_probability` for bins | binary outcomes | O(n) | days-weeks | high | PM-CALIB | direct | direct |

---

## CORRELATION CLUSTERS

| Cluster | Members | Typical Correlation |
|---------|---------|-------------------|
| MOM-RSI-STOCH | RSI, Stochastic, Williams %R, Ultimate Osc | 0.6-0.8 |
| MOM-MACD-APO | MACD Hist, APO, PPO | 0.7-0.9 |
| MOM-TREND | ADX, Aroon Osc | 0.5-0.7 |
| TREND-MA | SMA, EMA, TEMA, WMA | 0.7-0.9 |
| TREND-BB | BB Squeeze, BB %B | 0.6-0.8 |
| VOL-ATR | ATR, NATR | 0.8-0.95 |
| VOL-OBV | OBV, AD, ADOSC | 0.5-0.7 |
| LIQ-VWAP | VWAP Deviation, WQ alphas using vwap | 0.6-0.8 |
| VALUE-BM | B/M, Earnings Yield, FCF Yield | 0.4-0.6 |
| QUAL-GP | Gross Profitability, ROE, F-Score | 0.3-0.5 |
| SENT-NLP | News Sentiment, Social Buzz | 0.4-0.6 |
| WQ-VOL-DIV | WQ#006, WQ#012, WQ#043 | 0.3-0.5 |

---

## POLYMARKET / PREDICTION MARKET FACTORS (DEEP DIVE)

Prediction markets (binary outcomes, probability calibration) require fundamentally different factor design:

| Factor | Mechanism | Inputs | Notes |
|--------|-----------|--------|-------|
| **Calibration Error** | `P(outcome) - implied_market_price` by probability bin | binary outcomes | Core PM alpha; decompose by topic |
| **Volume Surge** | `vol_N / vol_baseline` — informed trader arrival | order flow | Early signal before price moves |
| **Spread Compression** | `ask - bid` tightening → consensus forming | orderbook | Timing signal |
| **Sentiment Divergence** | `social_sentiment - market_implied_prob` | text + price | Mispricing between narrative and market |
| **Resolution Proximity** | Time-to-resolution adjusted probability drift | time + price | Short-dated contracts: entropy collapse |
| **Cross-Market Arbitrage** | Same event priced differently across platforms | multi-platform | Polymarket vs Metaculus vs Kalshi |
| **Liquidity-Weighted Probability** | Weight implied prob by orderbook depth | orderbook | Thin books → noisy prices; depth adjusts |
| **Event Cluster Correlation** | Correlated outcomes (elections, policy) | event metadata | Portfolio construction across PM contracts |

---

## WORLDQUANT 101 FORMULAIC ALPHAS — REPRESENTATIVE SELECTION

From Kakushadze (2016), average holding period 0.6-6.4 days. 80% were in production.

| WQ# | Core Logic | Category | Data |
|-----|-----------|----------|------|
| 001 | Mean reversion: rank of argmax of squared negative returns | Momentum/Reversion | Returns |
| 002 | Rank correlation of delta(log(vol),2) with (C-O)/O | Volume-Price | OCV |
| 006 | Negative correlation of open and volume over 10d | Volume | OV |
| 012 | Sign(delta(vol,1)) * (-delta(close,1)) | Volume-Price Divergence | CV |
| 018 | Delayed open vs close: -(close - delay(close,5)) * (close - delay(open,1)) | Gap/Mean Reversion | OC |
| 026 | Negative ts_max of correlation with volume, 5d | Volume | HV |
| 033 | rank(-1 + open/close) | Gap | OC |
| 038 | Negative ts_rank of close/open ratio, 10d | Intraday Trend | OC |
| 041 | Power of high * low vs vwap squared | VWAP Fair Value | HLVWAP |
| 044 | Negative ts_corr of high with rank(volume), 5d | Volume-Price | HV |
| 053 | 5-day count of close > open then close < open pattern | Candlestick Pattern | HLC |
| 054 | -(close - delay(close,5)) weighted by volume vs open | Delayed Reaction | OHLCV |
| 060 | Power of rank(volume-weighted avg vs close) | VWAP Mean Reversion | HLCV |
| 085 | Rank correlation of volume with (high-low)/close, 5d | Volatility-Volume | HLCV |
| 101 | (close - open) / (high - low + 0.001) — BOP variant | Balance of Power | OHLC |

---

## TA-LIB INDICATOR CATEGORIES (FULL INVENTORY)

| Group | Count | Key Members |
|-------|-------|-------------|
| Overlap Studies | 17 | BBANDS, SMA, EMA, WMA, DEMA, TEMA, TRIMA, KAMA, MAMA, SAR, SAREXT, HT_TRENDLINE, MAVP, MIDPOINT, MIDPRICE, T3 |
| Momentum Indicators | 30 | RSI, MACD, STOCH, STOCHF, STOCHRSI, ADX, ADXR, PLUS_DI, MINUS_DI, PLUS_DM, MINUS_DM, DX, APO, PPO, AROON, AROONOSC, BOP, CCI, CMO, MFI, MOM, TRIX, ULTOSC, WILLR, ROC, ROCP, ROCR, ROCR100 |
| Volume Indicators | 3 | AD (Chaikin A/D), ADOSC, OBV |
| Volatility Indicators | 3 | TRANGE, ATR, NATR |
| Price Transform | 4 | AVGPRICE, MEDPRICE, TYPPPRICE, WCLPRICE |
| Cycle Indicators | 5 | HT_DCPERIOD, HT_DCPHASE, HT_PHASOR, HT_SINE, HT_TRENDMODE |
| Pattern Recognition | 61 | CDL2CROWS, CDL3BLACKCROWS, CDL3INSIDE, CDL3LINESTRIKE, CDLABANDONEDBABY, CDLDOJI, CDLDRAGONFLYDOJI, CDLENGULFING, CDLEVENINGSTAR, CDLHAMMER, CDLHANGINGMAN, CDLHARAMI, CDLINVERTEDHAMMER, CDLMARUBOZU, CDLMORNINGSTAR, CDLSHOOTINGSTAR, CDLSPINNINGTOP, ... |
| Statistic Functions | 9 | LINEARREG, LINEARREG_ANGLE, LINEARREG_INTERCEPT, LINEARREG_SLOPE, STDDEV, TSF, VAR, BETA, CORREL |
| Math Operators | 11 | ADD, SUB, MULT, DIV, MIN, MAX, MININDEX, MAXINDEX, MINMAX, MINMAXINDEX, SUM |
| Math Transform | 15 | ACOS, ASIN, ATAN, CEIL, COS, COSH, EXP, FLOOR, LN, LOG10, SIN, SINH, SQRT, TAN, TANH |

---

## COMPLEXITY DISTRIBUTION

```
O(1)   [stateless]:  11 factors (value, quality, size)
O(n)   [rolling]:    43 factors (momentum, trend, vol, volume, sentiment)
O(n^2) [pairwise]:    6 factors (correlations, factor betas, idio vol)
```

---

## CRYPTO MARKET APPLICABILITY SUMMARY

| Category | Direct | Needs Adaptation | Not Applicable |
|----------|--------|-----------------|----------------|
| Momentum | 12 | 0 | 0 |
| Trend/Overlap | 10 | 0 | 0 |
| Volatility | 6 | 2 | 0 |
| Volume/Liquidity | 7 | 1 | 0 |
| Value | 0 | 0 | 6 |
| Quality | 0 | 0 | 5 |
| Sentiment | 2 | 2 | 1 |
| Cross-Sectional | 3 | 0 | 1 |
| Crypto-Native | 2 | 0 | 0 |

**Key insight:** 42 of 60 factors (70%) are directly applicable to crypto markets. The 11 value+quality factors require fundamental data that does not exist for most crypto assets (no balance sheets, earnings, etc.). These should be replaced with on-chain fundamentals (TVL, revenue/fees, holder distribution, staking ratio).

---

## ADAPTATION NOTES FOR CRYPTO

1. **Replace fundamentals with on-chain:** B/M -> TVL/MCap, Earnings Yield -> FeeYield, ROE -> Revenue/GMV
2. **24/7 markets:** All time-based windows need recalculation (no market-close assumption). Use UTC rolling.
3. **Extreme kurtosis:** Crypto returns are fat-tailed. Rank-normalize all cross-sectional factors before combining.
4. **Funding rate is a first-class factor:** Perpetual funding rate and its momentum are crypto-native alpha not captured by any traditional factor.
5. **On-chain whale flow:** Large-holder accumulation/distribution is a crypto-native volume signal.
6. **Prediction markets:** Polymarket-style binary contracts require probability-calibration factors, not price-based momentum. The calibration error factor (#60) is the core PM alpha.

---

## SOURCES

- Kakushadze, Z. (2016). "101 Formulaic Alphas." arXiv:1601.00991. [PDF](https://arxiv.org/pdf/1601.00991.pdf)
- Jansen, S. "Machine Learning for Trading" — Alpha Factor Library. [GitHub](https://github.com/stefan-jansen/machine-learning-for-trading/tree/main/24_alpha_factor_library)
- TA-Lib Python. [GitHub](https://github.com/ta-lib/ta-lib-python)
- Green, Hand, Zhang (2017). "The Characteristics of Factor Investing." Review of Financial Studies.
- Novy-Marx (2013). "The Other Side of Value: The Gross Profitability Premium."
- Piotroski (2000). "Value Investing: The Use of Historical Financial Statement Information."
- Amihud (2002). "Illiquidity and Stock Returns: Cross-section and Time-series Effects."
