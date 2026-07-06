# Crypto Day-Trading Reality — Fees, Execution & Practitioner Norms (2026-06-18)

**Why:** the live observatory engine bled 128 trades to ~$1,489 in fees (gross ≈ flat) by market-ordering (taker) a coin-flip signal in/out every ~10s on Coinbase. Owner intent clarified: FAST micro-trades closing within minutes (never >1 day), many per day, compounding small wins, training on Coinbase/Binance first. This doc grounds the engine pivot (taker→maker, fast horizons) in current primary-source fees + how real day traders actually operate.

**Method:** local-first (our own `afl-crypto-trading-playbook-2026-06-14.md` §1/§4/§6) + 2 Sonnet research agents (separate pool) with online verification against primary sources. Load-bearing numbers flagged where single-pathway.

---

## 1. Current venue fee schedules (primary-source, base tier)

| Venue (instrument) | Maker | Taker | Notes |
|---|---|---|---|
| Coinbase Advanced (spot) | ~0% | ~0.30% | base $0–$10M 30d vol; taker → 0.20% / 0.10% at higher tiers. **PARTIALLY VERIFIED (help page 403'd; 1 search-extract pathway) — pin before hardcoding.** |
| Binance (spot) | 0.10% | 0.10% | −25% w/ BNB → 0.075%. VERIFIED (binance.com/en/fee). |
| Binance USDⓈ-M perp | 0.02% | 0.05% | top tier 0%/0.017%. VERIFIED. |
| Bybit perp (USDT) | 0.02% | 0.055% | spot 0.10%/0.10%. VERIFIED (≥2 pathways). |
| Hyperliquid perp | 0.015% | 0.045% | maker REBATE −0.001%→−0.003% for high maker-share; tiers to 0%/0.026%. VERIFIED (docs fetched). |
| OKX perp | 0.02% | 0.05% | maker rebates at higher tiers (exact unconfirmed). VERIFIED base. |

**Round-trip cost (BTC/ETH, cheapest viable venue):**
- maker-in/maker-out: **0.03–0.04%** (Hyperliquid/Binance perp) — ~40× cheaper than our 1.2% taker assumption.
- maker-in/taker-out: 0.06–0.075% — ~16–20× cheaper.
- taker-in/taker-out: 0.09–0.11% — ~11–13× cheaper.

**Verdict:** our engine's 1.2% round-trip (0.6%/side taker) is a stale/worst-case Coinbase-spot retail rate. The maker/taker gap is the dominant lever — **maker-default collapses fee drag to near-zero, even before switching venues.** On Coinbase specifically, maker ≈ free → micro-trades become break-even-viable.

UNVERIFIED / pin later: exact Coinbase Advanced base maker/taker (our code hardcodes 0.4%/0.6% — likely stale); OKX maker rebate rates; funding magnitudes are distributions not constants (model, don't hardcode).

---

## 2. How real day traders actually operate (practitioner reality)

1. **Order types — maker-biased.** Survivors enter on **limit (maker)** orders ~most of the time (price control + near-zero/rebate fee + no spread cross); **market (taker)** reserved for stops/panic exits. Post-only is the high-frequency floor (cancel if it would cross to taker). [Bybit/Optimus/XT docs; Review of Finance 2024 retail-limit-order study]
2. **Risk:reward — the 1% rule.** Risk ≤1% equity/trade: `size = (account×0.01)/(entry−stop)`. R:R floor 1.5:1, most demand ≥2:1 → can be wrong 60% and still profit. Hard mechanical stops at setup-invalidation, not arbitrary $ . [TradeThatSwing, Bulls On Wall Street, TakeProfitTrader]
3. **Frequency — few, not many.** Disciplined day traders take **2–10 quality setups/day**; >~15/day flags overtrading. (Our engine: 128/hr.) Quality > quantity; trade only the pre-defined template. [PFH Markets, TopForex, Babypips]
4. **Setups — a small recurring set:** opening-range breakout (London 08:00 GMT / NY 09:30 ET), S/R retest (trade the retest not the break), liquidity sweeps / stop-hunts (fade the rejection), funding/OI extremes (crowded = mean-revert), CVD absorption divergence, session-open + macro catalyst. Specialize in 2–3. [Kraken, Bitget, Coinalyze]
5. **Win-rate reality — brutal & consistent:** Taiwan (Barber/Lee/Liu/Odean 2014): <1% reliably profitable net of fees over 15y. Brazil futures (Chague et al. 2020): 97% of 300+day persisters lost; 1.1% beat min wage. ESMA (mandatory broker disclosure): 74–89% of retail CFD accounts lose. SEBI India (2024): 93% of F&O retail lost. Win-rate paradox (25k traders): 65% won more trades than lost yet 82% lost money — avg winner +1.2%, avg loser −2.8% (cutting winners / running losers is the kill). Survivors: multi-year skill, journaling, 2–3 setups, 1% risk, treat losses as tuition.
6. **Timing — session-selective:** London open (03:00–05:00 ET), NY open (08:00–12:00 ET), London-NY overlap (generates ~50–60% of intraday vol). Stand aside in thin windows (wider spreads, manufactured stop runs).

**What a real day trader does that a naive bot doesn't:** (a) **waits** — idle 80–90% of session for one specific setup vs trading every 10s; (b) **pays maker not taker** — prices entries, doesn't chase, doesn't donate the spread each round-trip; (c) **kills the trade before it kills them** — hard stops at invalidation, 1% risk, ≥2:1 R:R so losers deplete slowly and winners compound.

*Filtered as grift: signal groups, funded-trader marketing, X alpha-leakers, course-seller win-rate screenshots. Drawn from peer-reviewed (Barber/Odean, Chague), regulatory disclosure (ESMA, SEBI), established educators, exchange docs.*

---

## 3. Engine implications (the pivot)

The owner's "fast micro-trades, 10¢×1000/day compounding, fees-don't-care, train-on-Coinbase" model is **viable only as a maker**:
- Taker: netting +10¢ on a $10k position needs a +0.6% move first → impossible at minute scale → guaranteed bleed (the current tape).
- Maker (Coinbase maker ≈0%): netting +10¢ needs a +$0.10 move → any favorable tick → the compounding model holds. This is passive **spread-capture / scalping** — `maker-fill-sim.mjs` is the organ for it.

**Pivot:** (1) flip live execution to maker/post-only (model limit fills in afl-paper); (2) fix paper fee model to real Coinbase (maker≈free, not 0.4/0.6); (3) keep horizons FAST (at ≈0 fee short horizons clear — the "only 1w beats fee" gate dissolves); (4) fix the plan-blind slow-cycle exit; (5) run + train the learn loop.

**Honest bound:** maker removes the fee wall; it does NOT create edge. Zero-fee + coin-flip nets ≈0. The 10¢ must be a real small edge net of **adverse selection** (limit fills when price turns against you) — which is exactly what training + the learn loop must now measure (it couldn't, under the 1.2% taker tax).
