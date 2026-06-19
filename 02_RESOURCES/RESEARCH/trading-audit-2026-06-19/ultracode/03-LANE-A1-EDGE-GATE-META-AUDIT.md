# Lane A1 — Is the "prove-the-edge-first" gate real discipline or self-imposed paralysis?

**Date:** 2026-06-19 · **Lane:** A1 (ultracode read-only meta-audit) · **Owner:** Marcel
**Question:** The wave-2 synthesis gated aggressive sizing behind a proven p≈0.55 net edge. Marcel
suspects this "prove first" gate is a self-imposed paralysis trap. Adversarial meta-audit of BOTH sides, then resolve.

**Evidence tiers:** [V]=verified vs our code/runtime · [V-online]=≥2 primary external sources cited · [R]=advisory · [A]=asserted

---

## §1 — Steelman A: the gate IS legitimate risk control

**The over-Kelly ruin mechanism is real and primary-sourced.** [V-online] When a bettor sizes for an
*overstated* edge (betting full-Kelly on an assumed p=0.55 when true p≤0.51), they cross the true
growth-optimal fraction and the **expected log-growth rate turns negative** — they lose money over time
despite holding a (small) genuine edge, and ruin probability rises sharply. MacLean-Thorp-Ziemba-Blazenko,
"Good and Bad Properties of the Kelly Criterion" (Berkeley,
https://www.stat.berkeley.edu/~aldous/157/Papers/Good_Bad_Kelly.pdf); Wikipedia "Kelly criterion"
(overestimation → divergence from optimal → ruin,
https://en.wikipedia.org/wiki/Kelly_criterion); Downey sim (half-Kelly bounds the negative-growth
tail, https://matthewdowney.github.io/uncertainty-kelly-criterion-optimal-bet-size.html). **Three
independent primary sources converge. This is not theater — it is the textbook retail death.**

**The cost cliff is the mechanism that converts an honest backtest into an overstated live edge.**
[V-online, mechanism; magnitude advisory] Gross backtest Sharpe 2–3 compresses to net ~0.5–1.0 once taker
fees + slippage + funding + API latency land (practitioner consensus; arXiv 2602.11708 AdaptiveTrend shows
OOS degradation across 150 crypto pairs; SSRN perp-fundamentals 4301150). This compression is precisely
what flips a backtested p=0.55 into a live p≈0.51 — i.e. the exact regime where over-Kelly sizing guarantees
slow ruin. So "size aggressively on the backtested p=0.55 before proving it net-of-cost" is betting the
stated edge, not the real edge.

**The live edge is genuinely unverified right now.** [V] P2 ledger: every TA factor \|t\|<2.3, 14/32
negative after fees, eff-N≈1.2. The honest live edge is closer to p≈0.50 (none) than p=0.55. At p=0.50,
*any* Kelly fraction → zero drift → bleed by fees → slow ruin. Sizing aggressively *today* is sizing on an
edge we have not earned. **The gate is protecting against a real, present danger, not a hypothetical one.**

**Therefore:** requiring edge-proof before sizing up is a *legitimate* control in its narrow core — it
prevents over-Kelly on an overstated edge, which is empirically the #1 way retail dies.

---

## §2 — Steelman B: the gate, AS FRAMED, is self-imposed paralysis (the bootstrapping paradox)

**The paradox, stated explicitly:** statistical edge can only be proven *out-of-sample*, and the only
honest out-of-sample test for a live-trading system is *live trading*. So "prove the edge, THEN trade"
collapses into "never trade — keep paper-trading forever," because paper cannot reproduce the cost cliff
(slippage, queue position, latency, funding regime shifts) that *is the thing being tested*. The gate
demands the output of live trading as a prerequisite to live trading. **That is a logical circularity, not
a discipline.**

**Evidence the framing already over-rotated once and was caught.** [V — our own prior doc]
`crypto-perp-edge-strategy-2026-06-18.md` Correction #2 (Marcel, 2026-06-18) verbatim:
*"MY ERROR: imported a RESEARCHER's 'prove edge before acting' into a TRADER's 'read setup → predict →
act → manage.' Trading is a continuous PREDICT→ACT→LEARN loop, NOT validate-then-deploy."* The wave-2
synthesis (2026-06-19, one day later) **re-imposed the exact framing Marcel had just scrapped.** That is
the smoking gun: the "prove first" gate is not a timeless risk axiom, it is a *researcher's mental model*
that keeps leaking back in.

**The conflation (§2 of the question) — two bars smashed together:**

| Bar | What it means | N required | Paralysis? |
|---|---|---|---|
| **(a) Prove edge to high confidence** | DSR>1.5, BH-FDR, \|t\|>2.3, CSCV walk-forward, years of data | **hundreds–thousands of trades** | **YES — this is the gate as framed** |
| **(b) Is there any signal at all worth risking small capital on** | net hit-rate not obviously ≤0.50, no catastrophic cost mismatch, one structural mechanism with an economic rationale | **tens of trades** | **NO — unblocks in days/weeks** |

The wave-2 gate demands (a). Progress needs (b). We are demanding statistical certainty when we need a
go/no-go triage. **This is the precise over-rotation.**

**SPRT proves (b) is decidable in days, not years.** [V — `/tmp/yuri-bootstrap-sim.mjs`, Wald sequential
test] A sequential probability ratio test (H0:p=0.50 vs H1:p=0.55, α=0.05, 80% power) decides in a median of
~200–600 forward trades. At 30 trades/day that is **1–3 weeks**, not years. Under true no-edge (p=0.50) it
correctly rejects in ~100–200 trades (3–7 days). The "years of paper" bar is imported from *factor
selection / R0→R1 promotion* (a research activity) and mis-applied to *forward live triage* (a trading
activity).

---

## §3 — The resolution: the minimal non-paralyzing forward-test

**The decision is NOT "prove p=0.55." It is "distinguish real-edge from no-edge at small stakes."** That
is a much cheaper question and it is answerable forward. Concrete rule:

**FORWARD-TEST PROTOCOL (unblocks without years of paper):**

1. **Pre-conditions (must hold before any live euro):**
   - M2 wired: crypto routes through `computeSize` (quarter-Kelly on lower-CI, fail-closed at edge≤0)
     [V orchestrator.mjs:904 vs :999] — so we *cannot* accidentally over-Kelly even if the edge is fake.
   - M0 done: Binance fee model live, not stale Coinbase 60bps [V maker-fill-sim.mjs:31] — so the cost
     cliff is measured at the real venue, not a 30×-pessimistic phantom.
   - M3 keystone: every forecast tied to its realized outcome end-to-end [V — audit §1] — so the test
     *produces the data* rather than measuring nothing.
   - Per-position leverage capped so a single wick cannot liquidate the book (the discontinuous ruin mode
     the even-money MC cannot show [V — wave2 §2.4]).

2. **The forward test itself (small-live, NOT paper):**
   - Run **N=200–600 forward trades at €1–3 each** (total capital at risk: €200–1800 of the €300 bankroll
     cycled, *not* €200 lost — fractional sizing means typical drawdown is small).
   - Sizing: **quarter-Kelly on the *assumed* p=0.55, lower-CI-gated** = ~0.96–2.5% per bet. This is
     deliberately *sub*-optimal: if the edge is real we leave growth on the table; if it is fake we bleed
     slowly, we do not blow up.
   - Decision via **SPRT on the realized net hit-rate** (net of the real Binance fees + funding + slippage):
     - Λ ≥ 2.77 (≈ net hit-rate sustained ~0.54+ over ~300 trades) → **EDGE-CONFIRMED → proceed to
       half-Kelly, widen the book** [V-online — Wald SPRT, my sim].
     - Λ ≤ −1.56 (≈ net hit-rate ≤0.48, clearly no edge) → **NO-EDGE → stop, the signal is fake,
       re-architect (wire OFI/funding-carry, the structural edges) before more live capital.**
     - Neither by N=600 → **INCONCLUSIVE → the edge is too small to compound on; same as no-edge for
       sizing purposes.**

3. **Timeline:** 200–600 trades at 10–30/day = **1–4 weeks.** Not years. Not infinite paper.

**Why this is not gambling:** the pre-conditions cap the downside at *slow bleed*, never blowup; the SPRT
has a defined stop; "no-edge" is an accepted outcome that redirects work rather than stalls it. It is a
*falsifiable experiment at minimum stakes*, which is the opposite of both "paper forever" and "yolo the
bankroll on an unverified p."

---

## §4 — Where the framing over-rotated from discipline into paralysis (the honest verdict)

Four specific over-rotations, each load-bearing:

1. **Demanded statistical proof (bar a) when a triage decision (bar b) was sufficient.** The question
   "is there any signal" is answerable in weeks; the question "prove p=0.55 to DSR/FDR confidence" takes
   hundreds of trades. Wave-2 §8 gate #2 ("open-loop measurement instrument") is correct and needed, but
   the *implicit* gate behind it — "and don't size aggressively until that instrument proves the edge" —
   silently promoted (a) over (b). [A — framing analysis]

2. **Made paper the test of the cost cliff.** The cost cliff *only exists in live trading* (slippage,
   queue, latency, regime). Paper by definition cannot measure it. So "paper until proven" is measuring the
   wrong thing forever. The honest test of net-of-cost edge is small-live. [V-online — the cliff is a
   live-execution phenomenon by construction]

3. **Ignored that the disciplined sizer ALREADY protects against the over-Kelly ruin the gate fears.**
   `computeSize` (quarter-Kelly on the *lower-CI*, fail-closed at edge≤0) [V orchestrator.mjs:999-1011,
   afl-sizing.mjs:56-213] is the actual defense against over-Kelly — not the prove-first gate. With M2
   wired, the gate is *redundant* for the ruin mechanism it claims to prevent. The gate adds paralysis
   without adding safety the sizer doesn't already provide. [V]

4. **Re-imposed a frame the owner had explicitly scrapped the day before.** [V — crypto-perp-edge doc
   Correction #2] The PREDICT→ACT→LEARN trading loop was the owner's correction; wave-2 reverted to
   VALIDATE→DEPLOY. The gate is not just self-imposed, it is *self-imposed twice*.

**The real discipline is:** wire the sizer (M2, prevents over-Kelly mechanically), cap per-position
leverage (prevents the wick-liquidation the MC hides), fix the fee model (M0, makes the cost cliff
measurable), run the keystone measurer (M3, closes the loop), THEN forward-test small-live with an SPRT
stop. **That chain is honest. "Prove the edge to statistical confidence on paper first" is not in that
chain — it is the part that paralyzes.**

---

## §5 — Residual risk / what I did NOT verify

- **[A]** The SPRT assumes roughly even-money payoffs; real perp payoffs are asymmetric (R:R≠1). For
  asymmetric payoffs the test should run on *mean net return per trade*, not hit-rate — same logic,
  different statistic. The ~200–600 trade order of magnitude survives; the exact boundary shifts.
- **[A]** The €1–3/trade sizing assumes the venue allows notional that small with sane leverage; confirm
  Binance min-notional at build (likely €5–20 min on perps → adjust count or use spot for the test).
- **[R]** "Hundreds of trades to prove p=0.55" assumes the edge is *stationary*. Crypto edges decay
  (funding carry already compressed 36–108%→<10%). The forward-test must therefore run *continuously*,
  not once-and-done — the SPRT re-arms.
- **[V-online]** Over-Kelly ruin: 3 primary sources agree on the mechanism; the *specific* growth-rate
  sign-flip boundary depends on the true p, which is the unknown being tested — the defense is fractional
  sizing + lower-CI gate, not asserting a true p.

---

## VERDICT (3 lines)

**KEEP (real-gate parts):** the over-Kelly ruin mechanism is real and primary-sourced — size on a
lower-CI edge, never full-Kelly on an assumed one; cap per-position leverage so a wick can't liquidate;
measure net-of-real-cost, never gross-backtest. These are non-negotiable and the disciplined sizer
already enforces the first.

**CUT (self-imposed parts):** the "prove edge to DSR/FDR statistical confidence on paper before any live
sizing" bar — it is bar (a) smuggled in where bar (b) belongs, it paper-tests a live-only phenomenon (the
cost cliff), it duplicates the protection `computeSize` already provides, and it re-imposes a frame the
owner explicitly scrapped on 2026-06-18. Cut it.

**MINIMAL UNBLOCKING FORWARD-TEST:** wire M2+M0+M3 (sizer/fee/measurer), cap leverage, then run
**200–600 forward trades at €1–3 each, quarter-Kelly on lower-CI, decided by an SPRT on net hit-rate
(1–4 weeks)** → EDGE-CONFIRMED proceeds to half-Kelly; NO-EDGE stops and re-architects toward the
structural edges (OFI, funding-carry). Not paper-forever, not a yolo — a falsifiable small-stakes
experiment with a defined stop.

---

## Provenance
- **Own sims (execution-verified):** `/tmp/yuri-growth-ruin.mjs` (MC, 20k paths — reproduces wave-2 §2
  numbers exactly: full/half/quarter Kelly 100% reach €10k, 0% ruin), `/tmp/yuri-bootstrap-sim.mjs`
  (Wald SPRT: edge-real decides ~200–600 trades; no-edge rejects ~100–200).
- **Code-verified [V]:** orchestrator.mjs:904/999-1011/437 (crypto vs poly sizing, 600% gross),
  maker-fill-sim.mjs:31 (stale Coinbase fee), afl-sizing.mjs:56-213 (computeSize = quarter-Kelly on
  lower-CI, fail-closed), crypto-perp-edge-strategy-2026-06-18.md Correction #2 (owner's scrapped frame).
- **Primary-online [V-online]:** MacLean-Thorp-Ziemba-Blazenko "Good and Bad Properties of the Kelly
  Criterion" (Berkeley, https://www.stat.berkeley.edu/~aldous/157/Papers/Good_Bad_Kelly.pdf); Wikipedia
  Kelly criterion (https://en.wikipedia.org/wiki/Kelly_criterion); Downey fractional-Kelly sim
  (https://matthewdowney.github.io/uncertainty-kelly-criterion-optimal-bet-size.html); arXiv 2602.11708
  AdaptiveTrend (OOS degradation, https://arxiv.org/html/2602.11708v1); SSRN 4301150 (perp fundamentals).
- **Advisory [R]:** exact cost-cliff magnitude (2.0→0.5 is practitioner consensus, not pinned);
  edge-stationarity assumption; min-notional venue check.
