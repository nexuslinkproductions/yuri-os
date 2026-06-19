# YURI Trading Engine — Ultra-Deep Audit Plan (2026-06-19)

> 15-agent GLM-5.2 swarm (xhigh) + author verification. Every load-bearing claim below is tagged
> **[V]** (I verified against current code) or **[A]** (agent-claimed, plausible, confirm-at-build).
> Engine root `_SYSTEM/Scripts/alpha-factor-library/` (+ `observatory/`). All findings re-anchored to
> current line numbers (prior redteams had drifted). Agent source blocks: `agents/A01..A15*.md`.

---

## 0. EXECUTIVE VERDICT — REDIRECT, not refactor

**The engine is structurally FUNCTIONAL, not buggy-to-the-bone.** Plumbing works: feeds valid, cycles
run, funding/liquidation/fee math is sound, WS feeds reconnect correctly, auth is tight, paper-only
INV-1 enforced. The prior "no stop-loss / ruin-class" redteam (2026-06-18) is **STALE** — stop/tp/maxHold
are armed in live config (0.0015/0.0025/300) and the funding model bug was fixed correctly.

**The problem is ARCHITECTURAL MISALIGNMENT, in 4 surgical cuts:**
1. **Real-edge signals are built but UNWIRED** to sizing — `overlaySignals` (funding, carry-vol, cross-asset,
   OFI, news/sentiment) push to telemetry only; `combineSignals(signals)` sizes from price-derivatives.
2. **Sizing bypasses Kelly** on the live crypto path — `equity*maxPct*min(1,strength*2)*regimeTrim`
   instead of the principled `computeSize` (wired only on polymarket).
3. **The learn loop is an open-loop measurer** — captures/decodes/scores but never PROMOTES (`apply:true`
   exists nowhere live) and graduation feeds only a board endpoint, never weights. **Cannot adapt.**
4. **Theater math on the hot path** — quantum circuit + energy-ΔU computed every cycle, never read by
   sizing; graduation R1→R2 metrics hardcoded null.

**Ground-up refactor would discard working plumbing. The answer is a strategic REDIRECT: cut Coinbase,
close the loop, rewire the 1 real structural edge (funding-carry), route sizing through Kelly, cut
theater, redefine "HFT" to what's achievable on this hardware.** (A15 owns this verdict; A12/A03/A04/A06 unanimous.)

### Honest edge ceiling (the part nobody wants to hear)
After the full redirect — fee-fix done (Binance), structural edge wired, calibration via closed loop,
quarter-Kelly sizing: **~55–57% directional / Sharpe ~0.4–0.6 post-fee at 3–8× leverage.** Funding-carry
path realistically **+5–15%/mo on €300.** **NOT a rocket.** μs-HFT is structurally impossible on
M2 Pro + retail internet + public WS (co-located act sees the book ~90ms before us; queue position
invisible on public L2; VIP0 = zero rebate → A-S maker is −2.16bps/fill = negative edge until fee tier).
Reframe the vision from "HFT + quantum + news prediction" to **"medium-frequency structural + sentiment
edge, maker-income-subsidized"** — that is what is actually buildable here.

---

## 1. THE KEYSTONE — open-loop measurer, not closed-loop learner  [V — author-verified]

This is the single finding that decides everything downstream. I traced the full loop myself:

| Step | Code | Status |
|---|---|---|
| Capture forecasts | `recordForecasts(market, [...signals, ...overlaySignals], ...)` orchestrator.mjs:801 | ✓ live, every cycle |
| Decode closed trades → ledger | `decodeAll({stateDir})` orchestrator.mjs:1510 (`enableLearnLoop:true` L1440) | ✓ live, throttled |
| Score (DSR/Brier) | `reevaluateFactors({apply:false, minN:2})` orchestrator.mjs:1251 | ✓ computes — **but dry-run** |
| Promote (lifecycle → DB) | `apply:true` | ✗ **exists NOWHERE in live code** (only in factor-reeval.mjs *comments* L16/42/329) |
| Feedback → weights | `getGraduation` | ✗ wired only as HTTP read endpoint (observatory-server.mjs:264 → board); never feeds strategy-weights |

**Verdict:** 4/5 closed. It can MEASURE but cannot ADAPT. Same pathology as the energy-gate learn loop
(421k firings, 0 derived verdicts).

**Critical sharpening of A15's over-rotation:** `apply:false` does NOT suppress the statistics —
DSR≈0/Brier≈0.25 is the **real score on real decoded outcomes**, not an artifact. So "0 edge" is
genuinely true **for the 1-min TA family**. What the dead-promote breaks is **control**: even if a
structural signal (funding) scored well, nothing promotes it into live weighting. The engine measures
honest no-edge; it also *cannot escape* no-edge by promoting a better signal. Both true. The graduation
ladder was **partially fixed 2026-06-18** (R0→R1 `dataQuality` wired) but R1→R2 (real-money) metrics stay
null — comment owns it: *"the honest no-edge wall, now at the right place."*

**This is the #1 highest-EV first move** (see §6): ~50 lines, fully reversible, converts "every factor is
edgeless" from an *open question* into a *testable claim that produces the compass for every other redirect.*

---

## 2. TIER-0 ITEM 0 — SCRAP COINBASE ENTIRELY (owner directive 2026-06-19)

Owner: *"switched entirely to binance, no more coinbase, has to be scrapped completely."* A prior session
**already started this** (real-account path gutted orchestrator.mjs:1169-1173: `account = {connected:false,
advisory:'coinbase-removed (binance-only)'}`). But the migration is **incomplete — 6 live remnants**:

| # | Remnant | Severity | Action |
|---|---|---|---|
| 0a | `adapters/coinbase-adapter.mjs` (33KB) — still imported `:55`, wired `setHttpGet :489/497` | delete | DELETE file + remove import/wiring |
| 0b | `orchestrator.mjs:426` `feeModel: PERP_MODE ? binanceFeeModel('taker') : undefined → Coinbase cryptoFeeModel` | **LIVE bug** | kill the conditional — Binance fee model is the only path |
| 0c | `tick-stream.mjs:16` `wss://ws-feed.exchange.coinbase.com` into Binance daemon | **CRITICAL-live-if-armed** [A07/A14] | repoint to Binance `@aggTrade`/`@markPrice` (fstream) OR delete (depth-book+trades-stream already cover Binance) |
| 0d | `maker-fill-sim.mjs:31` `'real-tier0': 60/120bps` Coinbase tier drives the sim verdict [V] | misalignment | drop Coinbase tiers → Binance VIP0–VIP9 |
| 0e | `perp-adapter.mjs` `/1000` "to match coinbase candle shape" [A08] | coupling | decouple the unit convention |
| 0f | ~27 stale comments orchestrator (`COINBASE_GRANULARITY`, L570/579/600/872/1203…) | cosmetic | clean during the same pass |

**Leave alone (not trading code):** `.claude/yuri-sentinel/learning/*` (sentinel telemetry), `afl-field-research-factors-2026-06-14.json` (historical research card). **Execution is a BUILD step** (multi-file refactor of the live daemon) — reversible via git, paper-engine, not outward-facing. Goes in the plan, not started yet.

---

## 3. A/B/C SUBSYSTEM ADJUDICATION (all 15 agents distilled)

`(A)=BROKEN·repair  (B)=HONEST-BUT-MISALIGNED·rewire  (C)=WORKING·keep`  ·  Sev `C/H/M/L`

### A — Orchestrator / hot loop  (verdict: REFACTOR the wiring)
| | sev | file:line | finding + FIX |
|---|---|---|---|
| A | C | orchestrator.mjs:1048/1480 | **Markets run SEQUENTIALLY** (`for-await` over 6 markets). FIX `Promise.allSettled` — zero signal change, ~6s→~1s. [V] |
| B | H | orchestrator.mjs:700/738 | **Overlays excluded from sizing** — `combineSignals(signals)` price-only; overlays → `snap.signals` telemetry. FIX: pass vetted overlays in at their native horizon. [V] |
| A | H | orchestrator.mjs:904 | **Crypto sizing bypasses `computeSize`** — ad-hoc `equity*maxPct*min(1,strength*2)*regimeTrim`. computeSize wired only at polymarket path :999. FIX: route crypto through it. [V] |
| B | H | orchestrator.mjs:861 | Confluence gate = hard directional VETO (never a TRIM). FIX: scale size ×0.25 on conflict, mirroring regimeTrim. |
| A | M | orchestrator.mjs:299 | ATR uses H-L range, not True Range (omits gap term). FIX full TR. [A — confirm line] |
| B | M | orchestrator.mjs:674 | Cross-asset overlay depends on `_recentCloses` from earlier markets in the *same sequential pass* → breaks if parallelized. FIX: pre-pass populate. |
| B | L | orchestrator.mjs:344-365 | `computeEnergyDelta` ΔU = f(completedTrades), not f(edge). Pure telemetry theater. FIX: delete or wire to realized edge. |

### A02 — Ensemble + TA strategies  (verdict: REDIRECT — wrong signal architecture)
| | sev | file:line | finding + FIX |
|---|---|---|---|
| B | C | ensemble.mjs:70-76 | **Confidence is CIRCULAR** — `0.5+|net|/2` where net is computed from input confidences. Sizing on vote-margin, not calibrated P(up). FIX: isotonic-calibrate on closed-loop outcomes. **[V — keystone]** |
| B | C | strategy-registry.mjs:19-23 | **Effective-N≈2** — all 12 trend strategies sign the same dP/dt; meanrev signs opposite. "32 jurors" = 2 echo-chambers. FIX: pairwise-correlation weighting. |
| A | H | indicators.mjs:220-231 | **VWAP never session-resets** — cumulative from bar[0], converges to stale anchor. FIX: reset cumPV/cumV at UTC midnight. **[V]** |
| B | H | strategies-trend.mjs:48-120 | EMA/MACD/WMA fire on STATE not CROSS-EVENT → autocorrelated identical signals. FIX: fire on sign-change for trend-follow. |
| B | H | strategies-trend.mjs:217-244 | "supertrend" is MISLABELED — stateless Keltner band, not Supertrend. FIX: rename or implement real (HL2, ATR(1), state carry). |
| A | H | strategies-trend.mjs:187 | TRIX `*100` overscale → saturates confidence to 0.95. FIX: drop `*100`. [A — confirm confPercent scale] |
| B | M | strategy-weights.mjs:104-113 | `deriveWeights` uses raw mean return, not t-stat. minN:20 too low for autocorrelated 1-min. FIX: gate by one-sample t-test / DSR. |

### A03 — Structural / real-edge signals  (verdict: REDIRECT — quarantined, mostly CORRECT)
| | sev | file:line | finding + FIX |
|---|---|---|---|
| B | C | orchestrator.mjs:700/738 | ALL 8 structural modules telemetry-only or dead — none reach combineSignals→sizing. **[V]** |
| A | H | orderbook-imbalance.mjs:248 | `computeOrderBookImbalance`/`obiToSignals` — ZERO callers = dead code. Only OBI/microprice helpers used. FIX: wire or delete. |
| A | H | high-mover-scanner.mjs | ZERO importers — entire module dead. Dynamic symbol selection never runs. FIX: wire into cycle-start or delete. |
| A | H | crypto-structural-signals.mjs:130 | `computeFundingPriceReaction` — ZERO callers. FIX: wire or delete. |
| A | H | funding-carry.mjs (37KB) | ZERO importers — standalone CLI, never reached by daemon. The carry harvester is built + tested + never executed. FIX: arm via CLI probe or separate delta-neutral book. |
| B | M | ofi.mjs:26 | OFI feeds A-S maker λ-calibration only, NOT directional sizing. **The one structurally-real short-horizon edge** (Cont-Kukanov). FIX: test sign(OFI)→Δmid R²>0.15 at 100–500ms on real L2 before directional use. |

> **The irony (A03's load-bearing note):** the modules with the strongest *theoretical* edge basis
> (OFI, real funding APR) are the ones excluded; the edgeless 1-min TA drives every position.

### A04 — Multi-TF + regime + horizon gate  (verdict: REDIRECT — sound but DISARMED/dead)
| | sev | file:line | finding + FIX |
|---|---|---|---|
| B | C | orchestrator.mjs:759/861 | Confluence read gated behind env, entry-gate behind SEPARATE env — neither armed → dead code at runtime. |
| A | H | multi-tf-confluence.mjs:241 | Confluence is **weighted-average, NOT hierarchical veto** — a strong 1m can outvote a correct weekly. (Brief's "hierarchical" doesn't exist.) FIX: gate by weekly/4h sign before blend. |
| B | H | multi-tf-confluence.mjs:43 | `DEFAULT_WEIGHTS` (1w=0.30 dominant) are STATIC, not regime-conditional. FIX: regime-conditional weight table. |
| B | H | multi-horizon-gate.mjs | Multi-horizon gate armed only via env; runs legacy single-horizon √5 path. The 3–5-horizon gate Marcel asked for is unbuilt-in-practice. FIX: set `multiHorizon:true` in overseer-config. |
| B | M | horizon-ladder.mjs | `scoreLadder`/`writeLadderWeights` NEVER called by orchestrator (only comments + trade-edge-audit.mjs). Pure dead code. FIX: periodic beat → per-rung weights. |
| C | L | orchestrator.mjs:844 | Regime TRIM (not freeze) is correctly implemented — but regimeGate default false so never fires. |

### A05 — Paper engine + economics + sizing  (verdict: REFACTOR — route the sizer)
| | sev | file:line | finding + FIX |
|---|---|---|---|
| A | C | orchestrator.mjs:904 | computeSize (fractional-Kelly+vol-target) called ONLY polymarket; crypto bypasses. **[V — see §3 A-row]** |
| A | H | orchestrator.mjs:437 | **Portfolio gross cap = 6.0 (600%)** × 6 corr markets. No correlation-aware cap, no portfolio-VaR/CVaR. The "3 corr × 10% × 20x ≈ 600%" is literally configured. FIX: corr-adjusted gross cap or CVaR ceiling in computeSize. |
| B | H | ensemble.mjs:76 | Circular confidence feeds BOTH sizing paths (crypto :904 + polymarket winProb :999). afl-organ-adapter has calibrationReport machinery but nothing feeds it back. FIX: calibrate via AFL_LEDGER. **[V]** |
| C | M | afl-paper.mjs:571-594 | **Funding model CORRECT** (fixed). Signed by side, mark-price, negative rates credit, hourly pro-rata. KEEP. |
| C | M | afl-paper.mjs:179 | **Liquidation math CORRECT** — verified vs Binance 20×@60k→−4.62%, 50×→−1.61%. KEEP. |
| B | L | afl-validation.mjs | Pure synthetic quantum-commutativity benchmark on RANDOM vectors. Disconnected from sizing. FIX: repurpose as factor-diversification diagnostic or delete. |

### A06 — A-S maker quoting stack  (verdict: KEEP core + 2 targeted fixes)
| | sev | file:line | finding + FIX |
|---|---|---|---|
| C | — | avellaneda-stoikov.mjs:113-118 | **σ-axis bug FIXED** — `sigmaPrice(σ_ret, mid)` converts return→price vol correctly, wired as-baseline.mjs:372. Self-test asserts σ_price=σ_ret×S. **[V]** |
| A | H | adverse-attribution.mjs:107 | Default `levelOffsets=[0,1,2,3,5]` = max 5 ticks (shallow) — **cannot measure adverse-selection at deep offsets** (50–400 ticks) where κ lives. Bleed detector blind. FIX: default spans shallow+deep. **[V]** |
| A | H | maker-fill-sim.mjs:31 | `real-tier0` Coinbase 60/120bps drives verdict while engine is Binance perp (2bps). Sim pessimistic ~30×. FIX: → Binance VIP tiers. **[V — folded into Coinbase scrapping §2]** |
| B | H | kappa-fit.mjs:52 | `minN=30` contradicts ≥100 obs/cell data bar; κ = mechanics-only (banner honestly fails on current tapes <230h). FIX: raise minN to 100 or gate on data-bar. |
| A | M | param-sweep.mjs:35 | `skipFunding:true` — leverage×risk grid never charges funding (real same-direction drag). FIX: include funding in final validation. |
| C | — | kappa-fit.mjs:97 | **Fee-tier lever math RIGHT** — VIP3 (~1.6bps RT) compresses breakevenHalf 2.08→0.88, the 3–5× lever. BUT VIP3 needs $1M+ 30d volume on €300 → **unreachable without 1000× scale-up** (strategic blocker, not code bug). |

### A07 — Microstructure feeds + daemon + server  (verdict: REFACTOR — 2 live defects)
| | sev | file:line | finding + FIX |
|---|---|---|---|
| A | C | tick-stream.mjs:16 | **Cross-venue** — Coinbase WS into Binance daemon, symbol BTC-USD vs BTCUSDT, risk-exits on wrong venue. **[folded into Coinbase scrapping §2]** |
| A | H | depth-book.mjs:176/82 | 94.7% crossed-book fix applied ONLY in tape-replay.mjs (offline); **live emit() still ships crossed levels** → as-quote-live quote/OFI/microprice math corrupt. FIX: port `insideMarket` into extractTopN/emit. |
| C | L | depth-book.mjs:243 + 3 siblings | WS fail-open + exp-backoff reconnect CORRECT across all 4 feeds. KEEP. |
| C | L | observatory-auth.mjs:117 | Auth CORRECT — env token (INV-2), constant-time compare, loopback open, XFF ignored, 401 on fail. KEEP. |
| C | L | as-quote-live.mjs:126 | stateDir module-relative (NOT cwd-relative) — resolves to `_SYSTEM/state`. Brief concern = non-issue. |
| C | L | as-quote-live.mjs:47-56 | INV-1 paper-only VERIFIED — view-only imports + pure math, simulated fills, no order path. KEEP. |

### A08 — Adapters / data ingestion  (verdict: KEEP — 2 targeted fixes)
| | sev | file:line | finding + FIX |
|---|---|---|---|
| A | M | perp-adapter.mjs:396-407 | `mapKline` drops k[9] takerBuyBase, k[10] takerBuyQuote — **forfeits the cheapest directional-flow signal** (taker-buy ratio / true OFI material). FIX: extend return object. |
| A | M | polymarket-adapter.mjs:609-692 | `reconstructBars` pushes the LAST open bar → partial/mutating bar → look-ahead leak if fed pre-close. FIX: `opts.dropOpen=true`. |
| C | — | depth-book.mjs:32-48 | diff-depth WS sync machine CORRECT per Binance spec (pu-chain, first-event straddle, buffer-until-snapshot). Minor: 'wait' events dropped during drain (self-heals). KEEP. |
| C | — | coinbase-adapter.mjs:153-175 | ES256 RAW R‖S (IEEE-P1363) mechanically correct — **moot, file slated for deletion §2.** |
| A | L | coinbase-adapter.mjs:285 | Comment lies "ms-epoch" but emits unix-SECONDS; DQ-gate is unit-agnostic so not live — **moot, file deleted §2.** |

### A09 — Stat machinery  (verdict: KEEP math + FIX inputs)
| | sev | file:line | finding + FIX |
|---|---|---|---|
| A | H | factor-reeval.mjs:282 | DSR called with NO skew/kurtosis → defaults normal (0/3). PSR non-normality correction is DEAD CODE. FIX: compute + pass empirical moments. |
| A | H | factor-reeval.mjs:265 | factorId `obs-momentum-${market}` → correlated clones inflate nTrials; sr0 assumes independent trials. FIX: effective-N (Ledoit-Wolf). |
| A | M | factor-reeval.mjs:376 | BH fed DSR-deflated p-values → **double multiple-testing correction** (conservative → false-negatives). FIX: raw t-test p-values for BH. |
| B | H | factor-evaluator.mjs:140 | Sharpe `×√365` on PER-TRADE returns understates ~17× (avg hold 300s). DSR uses sharpePeriod so gate unaffected, but diagnostic is garbage. FIX: annualize by trades/year. |
| B | H | factor-evaluator.mjs | NO HAC/Newey-West on overlapping returns → serial corr inflates t-stats (both false-pos AND neg). FIX: Newey-West bandwidth = hold-overlap. |
| A | M | orchestrator.mjs:1251 | `reevaluateFactors({apply:false})` only — promotion never invoked live. **[V — keystone §1]** |
| C | — | factor-evaluator.mjs:257/283 | DSR denomInner + BH step-up are textbook-correct. KEEP. |
| B | M | (slice) | NO walk-forward / CSCV / PBO (Bailey-LdP 2017). Single chronological split. FIX: CSCV ≥8 folds. |

> **A09 bottom line:** "0 survive" is NOT an artifact of buggy stats — implementations are sound — but
> the gate is biased CONSERVATIVE (dead non-normality, double-correction, inflated nTrials, missing HAC).
> A marginal real edge could be falsely killed. Fixing these makes the verdict TRUSTWORTHIER, not reversed.

### A10 — Quantum + energy "theater"  (verdict: REDIRECT — cut or wire honestly)
| | sev | file:line | finding + FIX |
|---|---|---|---|
| A | C | orchestrator.mjs:703/904 | `snap.circuit` computed every cycle, read ONLY by shadowCompare + dashboard. Crypto sizer reads ensemble.* only — no circuit field. **Pure CPU waste per cycle.** FIX: delete from hot loop or wire after scoreShadow proves lift. |
| A | C | factor-return-vectors.mjs:118-135 | The 2 "live" circuit inputs (obs-momentum, obs-vol-regime) are **near-parallel price derivatives** → commutatorNorm≈0 → allCommute=true → ratio=1 **by construction**. "Non-commutative ordering advantage" = noise on collinear inputs. FIX: feed orthogonal families (funding/OI/OFI) first. |
| A | H | orchestrator.mjs:1296 | getGraduation hardcodes `fdrPass/mddBps/energyDeltaU/signAgreement/cusumBreak=null` → R1→R2 fail-closed forever. **Data EXISTS** (factor-evaluator BH, regime-detector, snap.energyDeltaU) just not passed. **[V — keystone §1]** |
| A | H | yuri-energy-conformal.mjs | Platt/isotonic SHADOW-ONLY (only a test imports it) + trained on WRONG label space (energy-gate mutation outcomes, not trade win/loss). FIX: delete or retrain on trade-outcome labels joined by trade id. |
| B | H | orchestrator.mjs:628-633 | `detectRegimeShift` fed RAW close-to-close price diffs (not volatilitySignal) → CUSUM fires every cycle if armed. FIX: feed volatilitySignal (diff-of-rolling-std) per module doc. |
| A | M | prediction-ledger.mjs | **Structural mismatch** — this is the YURI homeostat store (code proposals), NOT the trade ledger. recordPrediction operates on effect-strings, not trade directions/returns. AFL has its own QUANTUM_SHADOW/AFL_LEDGER. FIX: trade loop needs its own outcome store keyed by (factorId, ts, realizedReturn). |

### Cross-cutting (A12/A13/A14/A15) → §4 gap matrix + §6 path

---

## 4. VISION ↔ REALITY GAP MATRIX  (A12, refined)

Marcel's vision = automated quant trading + quantum prediction + news intel + market prediction + YURI math base + HFT.

| Vision component | Status | Reality |
|---|---|---|
| **"HFT"** | ❌ FANTASY | Actual latency class = **1s REST-poll / 15–30s cycle** (tick-stream 100ms WS DISARMED). M2+retail+public-WS = ~100ms–30s machine. Co-lo act ~90ms ahead. Reframe → "retail algorithmic quant 1s–30s." |
| **Quantum prediction** | ❌ THEATER | circuit computed, never read by sizing; inputs collinear → ratio=1 by construction. No quantum advantage on classical sim. Cut or prove lift. |
| **Energy gate / YURI math base** | ❌ THEATER | ΔU = f(trade count); conformal DISARMED + wrong label space. Wire honestly or stop calling it a gate. |
| **News intel** | ⚠️ HALF-BUILT | Intake exists (Agent-Reach Exa + RSS) but sentiment = **20-word lexicon** on 6 cached titles = keyword theater. Edge window for retail = **4h–7d** (not 1-min). NLP/event extraction MISSING. |
| **Market prediction** | ⚠️ EDGELESS | combineSignals fuses ~24 correlated price-TA → Brier 0.255 (coin-flip). Structural edge excluded. |
| **Closed learn loop** | ❌ MISSING-PRINCIPLE | Open-loop measurer. Cannot adapt. **#1 prerequisite.** |

**Honest reorder (achievable → fantasy):** (1) maker quoting @ VIP3+ fee tier · (2) funding-carry 4h–8h IF wired + loop closed · (3) news-sentiment 1h–4h (needs NLP) · (4) calibrated directional (needs closed loop FIRST) · (5) μs-HFT = fantasy · (6) quantum lifting returns = fantasy.

---

## 5. VERIFIED CHEAP-WIN BUGS (A-class, do these early — high signal, low risk)

These are concrete code fixes, not design changes. Reversible, DISARMED-adjacent, self-governable as a batch:
1. **VWAP session reset** (indicators.mjs:220) — reset cumPV/cumV at UTC midnight. **[V]**
2. **ATR → True Range** (orchestrator.mjs:299) — full TR = max(H-L, |H-Cp|, |L-Cp|). [A — confirm line]
3. **TRIX drop `*100`** (strategies-trend.mjs:187). [A — confirm confPercent scale]
4. **adverse-attribution default offsets span deep** (adverse-attribution.mjs:107). **[V]**
5. **mapKline carry taker-buy fields k[9]/k[10]** (perp-adapter.mjs:396). [A]
6. **polymarket `reconstructBars` dropOpen** (polymarket-adapter.mjs:609). [A]
7. **Live depth-book uncrossing** — port `insideMarket` into emit (depth-book.mjs:176). [A07]
8. **regime CUSUM feed volatilitySignal not raw diffs** (orchestrator.mjs:628). [A10]

---

## 6. RANKED MINIMUM-VIABLE PATH TO "WORKING AS INTENDED"

Ordered by EV × (each unblocks the next). Every item is DISARMED-first, reversible, scoped.

| # | Workstream | Why this order | Self-gov? |
|---|---|---|---|
| **0** | **Scrap Coinbase entirely** (§2) | Owner directive; removes cross-venue live bug + wrong-fee sim verdict. Foundation. | BUILD, reversible |
| **1** | **CLOSE THE LEARN LOOP** (§1) — arm `reevaluateFactors({apply:true})` nightly + wire graduation metrics (fdrPass/cusumBreak/energyDeltaU already computable) + feedback → strategy-weights | **#1 highest-EV.** Converts "no edge" from open question to testable claim. Produces the compass for every later decision. ~50 lines. | BUILD, DISARMED-gradual |
| **2** | **PROMOTE funding-carry → sizing** at its 8h rung (arm `funding-carry.mjs --probe` first to prove it clears fees in current regime) | The ONE structural edge with a mechanical basis (longs pay shorts since 2016). Proves the loop + edge together. | BUILD, owner-gated capital |
| **3** | **ROUTE crypto sizing → computeSize** (quarter-Kelly, vol-target, correlation-aware gross cap) | Removes unbounded-gross ruin (600%). Enables confidence-scaled holding without blowup. | BUILD, reversible |
| **4** | **Promise.allSettled** markets + overlays (parallel) | Zero signal change, ~6× faster cycle. Prerequisite for #2/#3 at scale. | BUILD, reversible |
| **5** | **CALIBRATE confidence** (isotonic on closed-loop outcomes) → replaces circular `0.5+|net|/2` | Enables sane sizing; only valid AFTER #1 produces outcomes. | BUILD, after #1 |
| **6** | **CUT theater off hot path** — delete computeCircuit per-cycle (or arm after orthogonal factors); delete/retrain energy-conformal; fix regime CUSUM | Stops wasting CPU + stops the "looks impressive, isn't" trap. | BUILD, reversible |
| **7** | **NEWS layer** (A13) — BUILD GDELT adapter (free, spec'd) + LLM-lane event extractor (YURI gemma/deepseek can feed it at 5–15min cadence) at 15min–1h horizon; catalyst calendar (FOMC/CPI/unlocks) | The only retail-achievable news edge. Build-vs-buy: GDELT+LLM first (zero cost), buy on-chain only after DSR proves free signal. | BUILD, research-lane |
| **8** | **Stat-machinery fixes** (A09) — real moments, effective-N, HAC, raw-p BH, CSCV/PBO | Makes the gate TRUSTWORTHY. Not urgent until #1/#2 produce candidate edges to test. | BUILD, reversible |

---

## 7. THE SINGLE HIGHEST-EV FIRST MOVE

**Close the learn loop (#1).** Until `reevaluateFactors` runs `apply:true` and graduation feeds back into
weights, "every factor is edgeless" is measuring a broken feedback channel, not honest market truth.
It is ~50 lines, fully reversible, and it is the ONE change that converts the entire "no edge" narrative
from an open question into a testable claim that generates the data deciding which edge is real.
Do this first; the data it produces is the compass for steps 2–8. (A15 owns this; I verified the premise.)

---

## 8. RESIDUAL RISK / UNVERIFIED

- **TRIX `*100` scale + ATR True-Range line** — agent-claimed, plausible from comments; confirm the
  confPercent body + TR source line at build (§5 items 2/3).
- **OFI sign→Δmid R² at 100–500ms** — the one structurally-real microstructure edge, but **unproven on
  retail Binance L2** (A03/A06). Must be measured on real tape before any directional commitment.
- **VIP3 fee-tier unreachability** — the A-S maker's real edge is negative at VIP0 (−2.16bps/fill); the
  3–5× lever math is correct but VIP3 needs $1M+ 30d volume on a €300 book. **Strategic blocker** — the
  A-S income path may not unlock without 1000× scale-up OR a maker-rebate venue.
- **κ walk-forward stability** — kappa-fit checks it in a banner (hardcoded false) but has no
  implementation; the optimal-spread machinery rests on a parameter that could be single-session noise.
- **News-edge horizon** — retail-real only at 4h–7d; the 1-min ensemble currently sized is the WORST
  horizon for news. Any news layer must NOT merge into the 1-min sizer (A03 horizon-matching warning).
- **Honest edge ceiling is modest** (~55–57% / Sharpe 0.4–0.6 post-fee). If Marcel's target is higher,
  the gap is hardware/colocation/rebate-tier — not code. Name this before building.

---

## 9. SWARM PROVENANCE

- **15 agents dispatched** (`ai llm glm-5.2 --reasoning high`, READ-ONLY), 5 EPIPE'd dead on first wave
  (z.ai concurrency contention on one MAX account — `feedback-glm-zai-build-lane`), re-dispatched in
  low-concurrency waves of 2. All 14 file-slice outputs landed; **A11 (learn-loop keystone) verified by
  the author directly** (not re-dispatched) because it is the load-bearing claim and warranted
  authoritative local confirmation. Source blocks: `agents/A01..A15*.md`. Brief: `00-SWARM-BRIEF.md`.
- **Lanes over-claim guard honored:** every load-bearing claim in this plan tagged **[V]** (verified by
  me against current code) or **[A]** (agent-claimed, plausible, confirm-at-build). One over-rotation
  corrected (A15 "0-edge is artifact" → sharpened to "open-loop control, real measurement" in §1).
