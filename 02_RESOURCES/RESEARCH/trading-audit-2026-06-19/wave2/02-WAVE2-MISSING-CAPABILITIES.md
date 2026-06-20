# Wave-2 — What We Are Missing to Be Functional (primary-grounded)

**Date:** 2026-06-19 · **Owner:** Marcel · **Lane:** Claude/main (Rick), cross-checked by GLM-5.2 peers — **P1 pro-benchmark ✓ verified, P2 orthogonality ✓ verified, P5 calc-sheet ✓ verified** (all re-run @ `high` after `xhigh` crashed batch-1 on z.ai transport); P3 topology ✓ verified (3rd scoped re-attempt @ `high`; **critiqued §7, didn't rubber-stamp** — see §11); P4 quantum **replaced by own sim** §3. See §11 for the peer cross-check.
**Mission:** refine+extend the trading platform toward functional — FIRST gather what we're *missing*; run sims + calcs; compare to how professionals trade; design the 24/7 agent fleet.
**Status:** context/sim/pro-comparison wave. Build (#7 Coinbase scrap + ranked redirect path) is owner-gated and comes *after* this informs it.

## Evidence-tier legend
- **[V]** verified against our own code/runtime (strongest tier — local execution is ground truth for our system).
- **[V-online]** verified against ≥2 primary external sources this wave (fees, funding avg, LVR paper).
- **[R]** advisory — from the prior playbook swarm or a single source, **not** re-verified this wave; treat as hypothesis.
- **[A]** asserted, unverified.

---

## §0 — HEADLINE: what we are missing (one screen)

The platform is **rigorous scaffolding around zero live edge**, wired to the wrong fee tier and sized at a gross exposure **~26–42× what the edge justifies** (portfolio basis, quarter-Kelly, ρ0.8 — P5-verified; the earlier "~60×" mixed per-bet with the portfolio cap). Concretely, to be *functional* we are missing exactly five things — four are **wiring of already-built code**, one is measurement:

| # | Missing capability | Evidence | Fix size |
|---|---|---|---|
| **M1** | **Independent information sources wired to sizing.** 32 TA strategies are algebraic shadows of one price series (eff-N ≈ 1.0–1.7). 5 orthogonal sources (funding/OFI/cross-asset/sentiment/vol-regime) are **built but push telemetry only, never reach the sizer.** | [V] orchestrator.mjs:640-700 (code comment admits it); [V] P2 effective-N from 6,328-row ledger | **S–M** (wire + unit-normalize) |
| **M2** | **Disciplined sizing actually attached to the crypto path.** `computeSize` (fractional-Kelly-on-lower-CI, vol-targeted, CVaR-capped, fail-closed) is sound but **only wired to the Polymarket sleeve**; the crypto ensemble uses a flat `equity × maxPct × strength × regimeTrim` heuristic up to **6.0× gross (600%)**. | [V] orchestrator.mjs:904 (crypto) vs :999 (poly computeSize); :437 `maxGrossExposurePct:6.0` | **S** (route crypto through computeSize) |
| **M3** | **Correct fee model + an open-loop measurement instrument.** Maker-edge math still runs against a **stale Coinbase 60bps** tier; Binance USDⓈM VIP0 is **2bps maker / 5bps taker** (primary-verified). And there is no closed feedback loop that ties a *forecast* to its *realized outcome* end-to-end (the audit's keystone). | [V-online] Binance fee page; [V] maker-fill-sim.mjs:30-34 stale Coinbase tiers | **S** (fee table) + **M** (keystone measurer) |
| **M4** | **The 24/7 agent fleet doesn't exist as a fleet** — one monolithic daemon does everything sequentially per cycle, so latency-critical work (risk-exit, requote) shares a loop with latency-tolerant work (learn-loop, news). | [V] orchestrator.mjs single-cycle structure; [V] P3 topology verified (critiqued §7, §11) | **M–L** (partition + bus) |
| **M5** | **A *real, net-of-cost edge* to compound.** The €300→€10k growth path is **mathematically near-certain IF a p≈0.55 edge holds out-of-sample** (MC §2: 100% reach at full/half/quarter Kelly, weeks not years). The open variable is **not the compounding math — it's whether we have the edge.** Verified data shows **no factor yet clears \|t\|>2.3** (eff-N 1.2, 14/32 negative after fees) → the live edge is closer to **p≈0.50 (none)** than p=0.55 right now. Aggressive sizing on an unverified edge = over-Kelly = the textbook retail death. | [V] MC §2; [V] P2 ledger; [V-online] 2026 retail Sharpe | **gating** |

**Net:** the gap to functional is **not invention, it is wiring + measurement + a fee fix.** Everything load-bearing already exists as code or as a known number.

---

## §1 — Primary-verified external facts (this wave, not the playbook)

| Fact | Value | Source tier |
|---|---|---|
| Binance USDⓈ-M **VIP0 maker** | **0.0200% (2 bps/side)** | [V-online] official `binance.com/en/fee/futureFee` + Binance Support FAQ 360033544231 + Finder (Jun'26) + 2 Binance Square posts — all agree; BNB pays 10% off |
| Binance USDⓈ-M **VIP0 taker** | **0.0500% (5 bps/side)** | [V-online] same sources |
| BTC perp **avg funding (cycle)** | ≈ **0.01%/8h → ~10.95% APR gross** | [V-online] Binance funding-history + CoinGlass + Binance Square analysis 30298233678962 |
| BTC perp **funding *right now*** | ≈ **+0.0028%/8h → ~3% APR** | [V-online] Coinalyze live dashboard — **we are in a low-funding regime; current carry is ~3× thinner than the cycle average** |
| **LVR** (Loss-Versus-Rebalancing) | adverse-selection cost = ~σ²/8 per unit time; toxic/informed flow drives it, retail flow does not | [V-online] Milionis-Moallemi-Roughgarden-Zhang 2022 (arXiv 2208.06046, primary PDF) — **but this is an AMM (Uniswap) result; the CLOB-maker analog is queue-adverse-selection (κ), modeled in maker-fill-sim.mjs. Do not apply σ²/8 to a resting Binance order.** |

**Corrections to the prior playbook (`afl-crypto-trading-playbook-2026-06-14.md`), now stripped to [R]:** the attributed quotes (Cumberland/DRW "Bobby Cho", Wintermute "$1.2M/employee", Robot Wealth "Kris Longore", "Oct 2025 ADL force-close", "IV>RV ~70% 2019-2022") are **single-source/unverified** → demoted to [R]. The *consensus* they point at (discipline > signal) survives; the specific stats do not. Owner flagged the playbook's accuracy; this wave re-grounds the load-bearing numbers from primary.

---

## §2 — Own calcs (Claude/main, execution-verified — `/tmp/yuri-edge-calc.mjs`)

**Kelly sizing** at the audit's honest edge ceiling (p=0.55, b=1):
- Full Kelly `f* = (b·p−q)/b = 0.10` (10%).
- **Quarter-Kelly = 2.50%** uncorrelated.
- Correlation-adjusted (n=3 markets, ρ̄≈0.8, from P2's ETH obs-pair ρ=+0.766): `f_adj = f*/(1+(n−1)ρ) = 0.10/2.6 = 3.85%` → **quarter = 0.96% per bet**.
- **Portfolio-basis sane gross (P5-verified):** per-asset quarter-Kelly (corr-adj) = 0.96% margin → 3-asset portfolio 2.88% margin → at 5× lev **14.4% portfolio gross** (at 8× = 23%). vs configured **600%** → the live config is **~26–42× too large** (not "aggressive" — **ruin-class**: eff-N=1.15 at ρ0.8, one correlated 17% down-move liquidates the book). The earlier per-bet "7.7% / ~78×" mixed bases; portfolio-vs-portfolio is the honest comparison.

**Funding-carry** (refute audit "+5–15%/mo"):
- Gross: 0.01%/8h × 3 × 365 = **10.95%/yr**; current-regime ~3%/yr.
- Net of perp fees (2bps×2=4bps) + spot leg (10bps×2=20bps, the dominant cost) = **~10.7%/yr ≈ 0.89%/mo**.
- Audit's 5–15%/mo is **~11–60× overstated**. It is a *short-vol / limits-to-arbitrage premium that decays and breaks on deleveraging cascades* — not free yield.

**Maker edge** (Binance 2bps vs stale Coinbase 60bps), half-spread captured 2.5bps/side:
- **Binance VIP0:** net/side = +0.50bps → **+1.0bps round-trip pre-κ** (POSITIVE — flips the audit's negative verdict).
- **Coinbase t0 (stale):** −57.5bps/side → −115bps rt (the number the audit used).
- **Reality gate:** retail κ (queue adverse-selection, co-lo front-run) is ≫1bps → maker is **marginal-to-negative even at Binance 2bps *without a toxicity gate* (VPIN).** The fee fix narrows but does not alone flip maker viability; the κ gate is the real lever.

**Honest monthly expectancy on €300 — TWO postures, not one (owner correction 2026-06-19):**

The earlier "€0–8/mo, research book not income" was the **risk-parity (quarter-Kelly) number** — *one* point on the frontier, wrongly headlined as a ceiling. The **aggressive compounding** path (small leveraged trades, €1–30 each, high frequency — exactly Marcel's scenario) is mathematically viable. Monte Carlo, 20k paths, even-money proxy at a **real p=0.55 edge** (`/tmp/yuri-growth-ruin.mjs`):

| Kelly frac | P(reach €10k = 33×) | median bets | timeline @30 bets/day | P(>50% drawdown en route) | P(ruin −95%) |
|---|---|---|---|---|---|
| Full (10%/bet) | **100%** | 432 | **~14 days** | 95% | 0% |
| Half (5%) | 100% | 682 | ~23 days | 65% | 0% |
| Quarter (2.5%) | 100% | 1277 | ~43 days | 0% | 0% |

**The 0% ruin is a mathematical property of *having a real edge + fractional sizing*** — positive drift can't bankrupt a fractional bettor; you always bet a slice, never the whole stake. So the growth path is real and Marcel is right.

**But the entire table is CONDITIONAL on p=0.55 being a real, out-of-sample, net-of-cost edge.** That is the single load-bearing unverified assumption, and it is where retail actually dies — not in the drawdowns (survivable), in **overestimating p**:

1. **No edge yet, verified.** P2: every live TA factor \|t\|<2.3, 14/32 negative after fees, eff-N≈1.2. The live edge is closer to **p≈0.50 (none)** than p=0.55. At p=0.50, *any* Kelly fraction → zero drift → bleed by fees → slow ruin. At p=0.49, aggressive sizing → fast ruin.
2. **The cost cliff (2026, primary).** Gross backtest Sharpe 2–3 collapses to **net 0.5–1.0** once Binance fees + slippage + funding + API latency hit (EliteTrader 2026 deep-dive; SSRN perp-futures paper). That compression is exactly what flips a backtest p=0.55 into a live p=0.51.
3. **Over-Kelly = guaranteed ruin.** Size for p=0.55 when true p=0.51 → you are past the growth-optimal fraction → growth rate goes *negative* (MacLean-Ziemba; Berkeley "Good and Bad Properties of the Kelly Criterion"). The #1 retail death is betting full-Kelly on an overstated edge.
4. **Leverage adds a DISCONTINUOUS ruin mode the MC can't show.** The even-money sim has no single-bar −100%; a leveraged perp position gets **liquidated on one wick** (3σ stop-run + cascade = −100% of position in one bar). That is the real "high risk" — not the 50% drawdown (survivable), the full-position liquidation at high leverage (not).

**Honest synthesis:** the €300→€10k path is real and the owner's risk appetite is respected — the job is to **earn the right to run it** by proving a real net-of-cost edge first (M3 measurement), wiring sane fractional-Kelly sizing (M2) so we never accidentally over-Kelly, and capping per-position leverage so a single wick can't liquidate the book. Then the aggressive posture is a *deliberate choice on the frontier*, not a gamble on an unverified p.

---

## §3 — Quantum factor-circuit: A10's mechanism is wrong, its conclusion survives

Audit A10 claimed `circuitQuality.ratio = 1` *by construction* because obs-momentum + obs-vol-regime are "near-parallel price-derivatives." **My independent sim (`/tmp/yuri-quantum-sim.mjs`) refutes the mechanism:**

| Case | cosine(mom,vol) | commutatorNorm | allCommute | **ratio** |
|---|---|---|---|---|
| A1 live 200-bar (mom long/vol short) | **−0.026** | 3.7e-2 | false | **1.077** |
| A2 (mom long/vol long) | +0.026 | 3.7e-2 | false | 1.077 |
| A3 short 50-bar | +0.276 | 3.7e-1 | false | **1.995** |
| A4 diff seed | +0.008 | 1.1e-2 | false | 1.189 |
| sweep cosine→1.0 exact | →1.0 | →0 | →true | →1.0 |

- The two vectors are **near-orthogonal (cosine ≈ 0.003–0.28), NOT near-parallel.** A10/P2 both reasoned from the false premise that signed-log-returns and high−low-range are collinear. `ratio ≠ 1`; it is 1.08–2.0 on live-like inputs.
- **But the deeper finding:** the sensitivity sweep shows ratio is **non-monotone & noise-dominated in cosine** (1.06 at ρ=0.85, 1.74 at ρ=0.95, 1.14 at ρ=0.99) — it does not cleanly track orthogonality. So A10's *conclusion* (don't trust the ratio as an edge signal) **survives, for a different reason than stated.**
- **Ruling for the build (#6 cut-theater):** **CONDITIONALLY-WIRED, not cut.** Keep `computeCircuit` as DISARMED telemetry (it's already an A/B shadow, orchestrator.mjs:705-719); do not let it touch sizing until (a) ≥3 genuinely-orthogonal factors survive DSR *and* (b) the ratio is shown to be a stable, monotone function of input orthogonality on real tape. P4 (GLM lane) OOM'd and produced nothing — my sim is the cross-check, and it's sufficient.

---

## §4 — Effective-N crisis is real, empirically confirmed, and the fix is wiring

P2 (verified): 32 TA strategies = **24/75% pure close-to-close price** + 8 volume/vol derivatives. EMA-cross and MACD-trend are the same function at different parameterizations; trend/meanrev families are **anti-correlated by construction**. True independent-information count ≈ **1.0–1.5**.

Empirical effective-N from the 6,328-row live ledger (per-market, ≥10 overlapping obs):
- ETH: obs-momentum vs obs-vol-regime ρ=**+0.766** → eff-N **1.26**
- SOL: ρ=+0.389 → 1.74
- SUI: ρ=**−0.983** → **1.02** (smoking gun — near-perfect anti-correlation)
- **99.2% of timestamps have exactly 1 factor firing.** 14/32 factors have *negative* mean return after fees; none reach |t|>2.3.

**The 5 orthogonal sources already exist as code but are telemetry-only** [V orchestrator.mjs:640-700, comment: *"advisory telemetry; NOT sized/paper-filled: their edge units differ from the price-return edge the sizer expects"*]:
1. **Funding carry** — `funding-carry.mjs`, `perp-signals.mjs`, `carry-vol-signal.mjs` (built, DISARMED)
2. **OFI / order-flow imbalance** — `ofi.mjs` (Cont-Kukanov-Stoikov; feeds λ-calc only, not sizing) — **the one structural edge that could lift eff-N; needs predictive R² validation on real tape first**
3. **Cross-asset lead/lag** — `cross-asset-signal.mjs` (BTC→alt)
4. **Sentiment/news** — social adapter + Agent-Reach
5. **Vol-regime** — `market-regime.mjs` (as a *modulator*, not a directional bet)

**Target: eff-N ≥ 5** (Sharpe ∝ √N_eff for orthogonal bets → portfolio Sharpe ~1.0 needs ≥5 independent bets). Below 3 it's "one bet wearing a costume." **None of the 5 need to be invented — the work is wiring + a unit-normalization seam** (funding-APR / OFI / sentiment must be converted to a comparable price-return-edge scalar before the sizer can sum them). P2's "50 lines" undersells this seam; call it **S–M, reversible.**

---

## §5 — The crypto path bypasses the disciplined sizer

[V] `computeSize` is imported (orchestrator.mjs:43) and IS sound: fractional-Kelly on the **lower-CI** edge, vol-targeted (Carver divisor 16), CVaR-robust cap, fail-closed at `edgeLowerCI ≤ 0`. **But it is only called on the Polymarket sleeve (orchestrator.mjs:999-1011).** The crypto/ensemble path (orchestrator.mjs:904) sizes as:

```
notional = equity × maxPct × min(1, ensemble.strength × 2) × regimeTrim
```

— a flat conviction heuristic with no Kelly, no lower-CI gate, capped only by `maxGrossExposurePct: 6.0` (600%) [V :437]. So the engine trades crypto at up to 6× book with a sizing rule that has **no relationship to the verified edge**. **This is the single highest-leverage wiring fix:** route the crypto ensemble through `computeSize`. S, reversible, fail-closed-by-construction.

---

## §6 — Pro benchmark: what actually separates winners (consensus, [R]-tagged)

**2026 realistic-net-Sharpe benchmarks (primary this wave):**

| Strategy class | Net Sharpe (2026, after costs) | Source tier |
|---|---|---|
| Buy-and-hold BTC | ~0.5–1.0 | [V-online] r/quant practitioner consensus; IBKR 2026 allocation analysis |
| **Retail systematic crypto on perps** | **1.0–1.5 realistic; 2.0+ elite/rare** | [V-online] EliteTrader 2026 deep-dive; Altrady; XBTO |
| Trend-following (multi-coin, OOS) | 2.41 (AdaptiveTrend arXiv 2602.11708), realistically 1.2–1.8 forward as alpha decays | [V-online] |
| **Delta-neutral funding harvest** | **~3.35 (retail costs); 11.65 low-cost-venue (unrealistic post-fees)** — but CROWDED/compressing | [V-online] SSRN perp-futures fundamentals 4301150 |
| HFT / market-making desks | high-single-digit to low-double-digit — **requires colo + maker rebates + ms latency, NOT retail-accessible** | [V-online] EliteTrader |

**The cost cliff (load-bearing):** gross backtest Sharpe 2–3 → **net 0.5–1.0** once taker fees + funding + slippage + API latency are included. This is the central retail tension and the mechanism by which a backtested p=0.55 becomes a live p=0.51. **Honest target for YURI at retail: net Sharpe 1.0–1.5.** Funding-harvest (~3.35) is the most accessible *structural* edge but is crowded; HFT double-digits is off the table without infrastructure we don't have.

The convergent truth across the practitioner literature (the *consensus* is [R]-grounded; specific attributed quotes stripped): **risk management and execution discipline ARE the edge; signal cleverness is not.** Alpha is "relatively easy; *preservation* is the hard part." Six concrete gaps to a top-2% disciplined desk (mapped to YURI):

| Pro practice | YURI state | Gap |
|---|---|---|
| **Economic-rationale gate** per factor ("who's on the other side, why do they pay me?") | absent | add — a factor can pass FDR with zero real edge |
| **Promote sizing/risk from sim → live** | `computeSize` exists, **disconnected from crypto** (M2) | **wire it** |
| **Regime-router** (style selection off the detector) | regime detector exists, not a router | add switch (trend default; meanrev in range; flat in chaos) |
| **Execution as cheap alpha** (maker-default, toxicity-gated) | maker logic exists, **no VPIN gate, wrong fee tier** (M3) | fix fee + add VPIN gate |
| **Honest trial-counter feeding DSR** | DSR exists; trial-count discipline unverified | audit the counter |
| **Per-factor alpha-decay clock** | absent | funding carry already decayed (36–108%→<10% [R]); underwrite decay as certainty |

**Edge durability ranking for a disciplined small/mid operator** ([R] — not primary-verified this wave, but directionally stable across sources):
- ★★★ delta-neutral funding/basis carry — workhorse, **but decaying (~3–11%/yr now, was 36–108%) and breaks on deleveraging**
- ★★ time-series momentum, regime-gated — the most robust *directional* edge (**time-series, not cross-sectional** — cross-sectional is weak in crypto)
- ★★ cross-sectional portfolio of uncorrelated mediocre edges (requires honest eff-N — we're at 1.2)
- ★★ MM / defensive LP — **only with toxicity gates (VPIN)**, else "pennies in front of a steamroller"
- ☆ arb / MEV / copy-trade — latency arms races a software operator loses; posture is **defense**, not extraction

---

## §7 — Agent topology (Claude/main design, CORRECTED by P3 GLM-5.2 — the critique that changed this section is in §11)

Marcel's explicit ask: *"how many effective trading agents to run 24/7, each owning a set of roles."* Current state: **one monolithic daemon** (orchestrator.mjs) does ingest → 24 TA + overlays → ensemble → regime → size → paper-execute → recordForecasts → risk-exits → (throttled) decode/score, **all in one per-cycle loop**. The problem: latency-critical and latency-tolerant work share a thread.

**Minimal viable fleet (4 agents) — partition by latency budget:**

| Agent | Owns | Latency budget | Inputs | Outputs | Shape |
|---|---|---|---|---|---|
| **A1 Market-Maker / A-S quoter** | reservation price, requote, fill-detect | per-tick (≤1s) | L2 depth, OFI, κ | quotes, fills | launchd daemon (hot) |
| **A2 Risk sentinel — pre-gate + post-killer** | exposure veto (**pre-trade**) + drawdown breaker + kill-switch (**post-trade**) | pre: ≤1 cycle synchronous; post: <1 cycle | positions, mark, VPIN, A3 sized intent | risk-cleared/cancelled signal; FLAT/KILL | launchd daemon (hot, **isolated process**) |
| **A3 Alpha / ensemble + sizer** | factor signals, ensemble, **computeSize**, regime-router | per-cycle (≤10s) | bars, overlays wired-in | sized signals | launchd daemon |
| **A4 Learn-loop / graduation** | decode forecasts→outcomes, DSR/Brier, promote/graduate factors | slow (minutes) | prediction ledger | factor weights, decay clocks | launchd beat |

**Extended fleet (+3): A5 Execution/fill-sim**, **A6 News-intel/sentiment**, **A7 Funding-carry harvester** (disarmed measurer). → **7 agents total** at full build.

**Inter-agent contract (CORRECTED by P3, LMAX/Aeron-grounded):** the hot path A1↔A2↔A3 runs on a **lock-free `SharedArrayBuffer` ring** (A1+A3 in one Node process, `Atomics.wait`/`notify`, ns–µs) + a **Unix-domain-socket** for A2 isolation (A2 in its *own* process so an A1/A3 crash leaves it alive to flatten). **SQLite is the cold/audit + drop-copy ledger only — never the hot bus** (disk B-tree + global write lock ≈ 0.1–1ms/write under WAL contention; wrong for a sub-ms quote budget). My original "SQLite bus + pub/sub ring" was wrong; P3 caught it.
- **Invariant (fail-closed):** A2's KILL travels a dedicated priority ring slot; A1 drains it before every quote (`Atomics.load`, ns). If A2's heartbeat is missing for N ms → A1 **auto-flattens and stops quoting** (risk-down = trading-down). A2 is the only agent with a hard veto.
- **A2-pre (the load-bearing addition P3 caught):** A3's sized signal must pass A2's veto at the **egress seam before** A1 quotes. Without it, A1 can quote on a signal that breaches gross the instant it lands — which is *exactly* the crypto-bypasses-`computeSize` + 600%-gross gap made concrete. A2-post is the reactive breaker; A2-pre is the gate that closes the bypass.
- **Supervision (MISSING today):** launchd `KeepAlive` per agent + a tiny **A0-watchdog** enforcing the fail-closed cross-agent invariant launchd can't express (it only knows alive/dead, not "A2 down → A1 must flatten"). OMS + drop-copy are also missing (folded into A1; tolerable paper, required live).
- **Fleet size: 4 (+bus+supervisor) minimal = "real"; 7 target** (A5–A7 measurer/advisory, no hot-path contention on M2-Pro — network RTT is binding, not CPU). Primary sources: LMAX Disruptor, Martin Thompson *Mechanical Sympathy*, Aeron (Real Logic) — citations in §11.

**Capacity (M2-Pro):** Binance fstream ≈ 15 msg/s/symbol (@depth@100ms + @aggTrade + @markPrice). JSON-parse + diff-book-apply is cheap; **3–6 markets (our scope) is nowhere near the binding constraint** — edge is. Capacity becomes relevant only past ~50–100 symbols. (Numeric capacity calc is P5's lane — ✓ verified; topology is mine, ✓ P3-verified.)

---

## §8 — Refined ranked path (informed by this wave)

Re-ordered vs wave-1's #0–#8, because the fee fix (M3) and sizing wire (M2) now rank above funding-carry (which is ~3–11%/yr, not the moonshot):

| # | Step | Why it moved | Size | Gate |
|---|---|---|---|---|
| **0** | **Scrap Coinbase** (task #7) — finish Binance-only migration, fix the stale 60bps fee table, kill PERP_MODE conditional | fee assumption is load-bearing + wrong; unblocks honest maker math | S | owner-gated BUILD |
| **1** | **Wire `computeSize` to the crypto path** (M2) — kill the 600% gross, route through fractional-Kelly-on-lower-CI | single highest-leverage wiring fix; fail-closed by construction | S | self-gov (reversible, DISARMED-adjacent) |
| **2** | **Build the open-loop measurement instrument** (keystone, M3) — tie every forecast to its realized outcome, author-verified trace | without this, every "edge" number is unfalsifiable | M | owner-gated (changes what's measured) |
| **3** | **Wire the 5 orthogonal sources** to the sizer (M1) — funding/OFI/cross-asset/sentiment/vol-regime + unit-normalization seam | lifts eff-N 1.2 → 5; the real diversification | S–M | self-gov per-source |
| **4** | **Validate OFI predictive R² on real tape** before directional commitment | the one structural edge; unverified on our feed | M | self-gov (measurement) |
| **5** | **Add the economic-rationale gate + regime-router + VPIN toxicity gate** | discipline layer the pros run; maker viability | S–M | self-gov |
| **6** | **Quantum path: CONDITIONALLY-WIRED** (not cut) — keep as DISARMED A/B shadow until ≥3 orthogonal factors + stable ratio | A10 mechanism refuted, conclusion survives | S | owner-gated arm |
| **7** | **Partition the fleet** (M4) — extract A1 (MM) to its own event loop; A2 isolated process + **pre-trade risk gate**; lock-free `SharedArrayBuffer` hot bus + SQLite cold ledger; A0-watchdog + launchd supervision | separates hot from slow paths; kills the risk-bypass seam P3 flagged | M–L | owner-gated (architecture) |
| **8** | News-intel + funding-carry harvester (disarmed measurer) | extended fleet; carry is ~3–11%/yr | M | owner-gated |

---

## §9 — Residual risk / unverified
- **[A]** Funding-carry *current* regime (~3%/yr) vs cycle-average (~11%/yr): which prevails over a holding window is regime-dependent; the harvester must gate on the live funding rate, not a static assumption.
- **[A]** OFI predictive R² on Binance perp L2 is unverified (Cont-Kukanov's 0.25–0.35 @1s is equities; crypto may differ). Must measure before sizing on it.
- **[A]** The `ensemble` factor's ledger t=+20.11 is suspiciously high (83% win) — likely the circular-confidence artifact (audit A02); needs isotonic calibration before trusting.
- **[V]** Agent topology fleet (4 minimal +bus+supervisor / 7 target) — **P3 GLM-5.2 verified**; corrected the bus (lock-free `SharedArrayBuffer` ring, not SQLite) + added the A2 pre-trade risk gate + the A0-watchdog supervision layer. P3 is the highest-quality lane output (critiqued, didn't rubber-stamp). See §11.
- **[R]** Pro edge-durability rankings (§6) are consensus-but-not-primary-verified this wave; the *direction* is stable, the *magnitudes* are not pinned.
- **[V→]** The audit's wave-1 "VIP0 = −2.16bps negative maker edge" is **refuted by the fee correction** — recompute maker-fill-sim against Binance 2bps before trusting any prior maker verdict.

---

## §10 — Provenance
- **Own sims (execution-verified):** `/tmp/yuri-quantum-sim.mjs` (A10 verdict), `/tmp/yuri-edge-calc.mjs` (Kelly/carry/maker), `/tmp/yuri-growth-ruin.mjs` (€300→€10k MC, 20k paths, P(reach)/P(ruin)/drawdown by Kelly fraction).
- **Code-verified [V]:** orchestrator.mjs:638-720, 904, 999-1011, 437; maker-fill-sim.mjs:30-34; funding-carry.mjs:36-38; adverse-attribution.mjs:43; afl-sizing.mjs:56-213.
- **Primary-online [V-online]:** Binance fee page + Support FAQ 360033544231 + Finder + Binance Square (VIP0 2/5bps); Binance funding-history + CoinGlass + Coinalyze + Binance Square 30298233678962 (funding ~0.01%/8h avg, ~0.0028%/8h live); Milionis et al arXiv 2208.06046 (LVR); EliteTrader 2026 Sharpe deep-dive + SSRN 4301150 (perp fundamentals) + arXiv 2602.11708 (AdaptiveTrend) + Altrady/XBTO (2026 net Sharpe benchmarks); MacLean-Ziemba / Berkeley "Good and Bad Properties of Kelly" (over-Kelly ruin); Downey (fractional-Kelly + ruin constraint).
- **GLM peers (final):** re-launched @ `high` after `xhigh` crashed batch-1 on z.ai transport (ECONNRESET/OOM). **P1 pro-benchmark ✓** (212 lines, 3 crux claims verified locally: funding-carry unwired @ orchestrator:130, computeFundingPriceReaction test-only-callers, k[9] taker-buy dropped @ perp-adapter mapKline:396). **P2 orthogonality ✓** committed. **P5 calc-sheet ✓** (122 lines, every number verified: Kelly 10%/2.5%, corr-adj divisor 2.6 / eff-N 1.15, funding 0.003%/8h→3.28%/yr, break-even 37.8d, maker κ-tier table). **P3 topology ✓** (3rd scoped re-attempt @ `high` solo, 18.9KB, 4 primary citations: LMAX Disruptor + Martin Thompson *Mechanical Sympathy* + Aeron + arXiv multi-agent; critiqued §7, didn't rubber-stamp — highest-quality lane). **P4 quantum** OOM'd → own sim §3 replaces it. Lane outputs: `wave2/out/P1.md`, `P2.md`, `P3.md`, `P5.md`.
- **Demoted [R]:** `afl-crypto-trading-playbook-2026-06-14.md` attributed quotes/stats (owner flagged accuracy; load-bearing numbers re-grounded primary this wave).
- **Owner correction (2026-06-19):** the initial "€0–8/mo research book" framing understated the aggressive-compounding upside; corrected to the full risk-posture frontier (§2). The path to €10k is real **conditional on a proven net edge** — the open variable is the edge, not the math.

---

## §11 — Peer cross-check (P1 pro-benchmark + P5 calc-sheet, both verified clean @ `high`)

Re-launched the crashed/stalled peers at `--reasoning high` (owner fix for the z.ai transport crashes that killed batch-1 at `xhigh`); P1 + P5 landed clean and their load-bearing claims were verified locally. They **confirm the doc's spine** and add four pieces worth folding in.

**P5 — calc-sheet (every number verified; confirms the cost arithmetic, fixes one framing error):**

- **Sizing correction (the one real fix to §2):** the "~78× too large" mixed per-bet (7.7% @8×) with the portfolio cap (600%). Apples-to-apples **portfolio basis: ~26–42× too large** (14.4% sane @5× / 23% @8×, 3 assets, ρ0.8, quarter-Kelly). Eff-N = **1.15** — "3 markets" is ~1.15 independent bets.
- **Maker edge by κ (the sharpener):** the blocker for maker income is **κ (queue adverse-selection), NOT the fee tier.** Per-side net bps = `halfSpread(2.5) − makerFee − κ/2`:

  | tier | maker bps | κ=0 | κ=5 | κ=10 (retail) |
  |---|---|---|---|---|
  | VIP0 | 2.0 | +0.50 | −2.00 | −4.50 |
  | VIP9 | 0.0 | +2.50 | 0.00 | −2.50 |

  Retail on a 100ms-stale public L2 queues **last** (κ≈8–12bps) → maker is **negative at EVERY VIP tier incl. VIP9**. "Reach VIP3" is not the answer; co-lo (impossible on M2-Pro) is. **Reframes §5/§8 maker items: the lever is the VPIN toxicity gate + low-κ regime selection, not fee-tier escalation.**
- **Live funding (measured this session, Binance `/fapi/v1/fundingRate`):** BTCUSDT **0.003%/8h = 3.28%/yr** (current low regime; cycle-avg ~10.95%/yr in §1). Break-even hold = **37.8 days** at live rate (vs 11.3d at cycle-avg) after the 34bps entry+exit stack. Net on €300 ≈ **€0.73/mo live / €0.89/mo cycle-avg** → confirms "+5–15%/mo" is **20–61× overstated** (it is per-*year*). The module's own `CARRY_CAVEAT` agrees (Sharpe 6.45 / 8% APY = 2020-25 full-sample; 2025 went negative).
- **Honest expectancy:** ~€1.98/mo (€1.25 directional @ Sharpe 0.5 + €0.73 carry) on €300 — **this is the quarter-Kelly risk-parity number, NOT a ceiling** (the aggressive MC in §2 reaches €10k at p=0.55). Open variable stays "is the edge real", not "is the math viable."

**P1 — pro-benchmark (primary-cited, 3 crux claims verified locally; upgrades §6 [R]→cited):**

- **Factor survival, primary citations:** Harvey-Liu-Zhu (*RFS* 2014, NBER w20592): **313 catalogued factors, only 9 survive t>3.0** → justifies a BH-FDR fleet gate (absent — 60 factors × 5% FPR ≈ 3 false promotions). Cont-Kukanov-Stoikov (*JFE* 2014): **OFI explains 65–87% of short-term mid variance** (multi-level 80–87%). Dobrynskaya (HSE 2023, ~2000 cryptos): **momentum is 1–2 weeks, not 1-min** — YURI's 12 trend strategies are the wrong horizon. Bieganowski-Ślepaczuk (arXiv 2602.00776, Jan 2026, Binance perps): engineered-book features stable across market-cap orders of magnitude. Wang (arXiv 2506.05764, Jun 2025): XGBoost matches deep nets — **feature engineering > model depth**.
- **Genuinely missing (adds to §0/§8, with sizing):** **VPIN toxicity gate** (M — aggTrade volume-clock + BVC; spiked 0.65 pre-2010 Flash Crash); **BH-FDR fleet gate** (M); **PBO/CSCV** (M — probability-of-backtest-overfit, gold-standard, absent); **cross-asset momentum 5–10d** (M — correct-horizon directional edge; current 1-min trend is wrong horizon); **walk-forward purged k-fold** (M — `heldOutSplit` is random shuffle, no purging/embargo); **taker-buy k[9]** (S — [V] dropped in `perp-adapter` mapKline:396; free OFI proxy); **maker GTX post-only path** (L — engine does taker fills, 2.5× maker cost); **open-interest feed** (M — `/fapi/v1/openInterest`; crowding/liquidation-proximity, absent).
- **P1's verdict:** "the gap is **70% wiring** (S–M, reversible) + **30% genuinely missing** (VPIN, PBO, BH-FDR, OI feed, GTX maker path, correct-horizon momentum)." Confirms this doc's §0 net.

**P3 (topology) — ✓ verified clean on the 3rd scoped re-attempt** (pre-fed the ground truth, asked it to critique §7 not re-derive it; solo @ `high`, 18.9KB, 4 primary citations). **Highest-quality lane of the five — it REFUTED three points of my §7 design rather than rubber-stamping them:**

- **D1 — A2 must be a pre-trade cross-check, not just a reactive killer.** My §7 had A2 watching positions and flattening on breach (the drawdown-breaker role — necessary but *insufficient*). Real desks enforce risk at the **egress seam**: A3 sized signal → A2 veto → A1 quotes. Without the pre-trade gate, A1 can quote on a signal that breaches gross the instant it lands — which is *exactly* the crypto-bypasses-`computeSize` + 600%-gross gap made concrete. **A2 = two sub-roles**: A2-pre (≤1 cycle synchronous veto) + A2-post (sub-tick breaker).
- **D2 — Hot-path bus = lock-free ring, NOT SQLite.** My "SQLite bus + pub/sub ring" was wrong: SQLite is a disk B-tree with a global write lock (~0.1–1ms/write under WAL contention), unsuitable for a sub-ms quote budget. P3: `SharedArrayBuffer` ring (A1↔A3 in-process, `Atomics.wait`/`notify`, ns–µs) + Unix-domain-socket for A2 process isolation; SQLite = cold/drop-copy ledger only. (Single-writer-per-state-shard principle — LMAX Disruptor, Mechanical Sympathy.) Risk *logic* duplicated into every agent is the anti-pattern; A2 owns risk state authoritatively.
- **D3 — Supervision + OMS/drop-copy missing.** No process supervisor (launchd `KeepAlive` + an A0-watchdog for the fail-closed cross-agent invariant launchd can't express — "risk-down = trading-down"), no OMS as a distinct role (folded into A1), no drop-copy/audit trail (tolerable paper, required live).

**The three 🔴 criticals to call the fleet "real":** (1) extract A1 from the monolith (the 9s sequential for-loop starves its requote budget), (2) the A2 pre-trade gate, (3) the lock-free bus + A2 process isolation + fail-closed heartbeat. **Fleet size: 4 (+bus+supervisor) minimal; 7 target** (A5–A7 measurer/advisory, no hot-path contention on M2-Pro — network RTT 50–100ms to Binance AWS is the binding constraint, not the 6P+4E cores). All folded into §7 (contract paragraph + A2 row) and §8 #7.
