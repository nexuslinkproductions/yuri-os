# YURI simulation arsenal — what's wired, what plugs in, how to improve (2026-06-13)

Survey via xref across domains (sampling, calibration, sensitivity, decay, propagation, math). The sim stack is
bigger than it's been used as: **4 instrument tiers + a learning loop that's currently dormant**, surrounded by
~9 registered mechanisms that *should* feed the sims but aren't wired in. Map below: mechanism → which rung →
concrete improvement, ranked by EV (cheap+high first).

## The arsenal that already exists (4 tiers + loop)
- **commit** — `izanagi-simulator` (`/izanagi`): qualitative 3-branch counterfactual, EV×reversibility×blast-radius.
- **robustify** — `decision-sim.mjs`: `robustScore` (0.5·mean+0.5·CVaR), `crossEntropyOptimize`, `minimaxRegret`,
  `pgdWitness` (flip-rule), `infoGapHorizon`, `multiverse` (spec-robustness), + `halton`/`sobolish` QMC samplers.
- **order-aware evidence** — `quantum-hypothesis-tracker.mjs` (+ `quantum-vs-bayes-benchmark.mjs`): real-valued
  Hilbert superposition, `measureSequential`, `qqEquality`, `schmidtDecomposition` (coupling test), G1–G4
  falsification gate (PASSED 2026-06-11, 15M-eval scale). This is the "quantum sim."
- **bridge (NEW this session)** — `izanagi-bridge.mjs`: measured/MC values → robust methods → izanagi ruling,
  with an automatic **corner-law guard** (always enumerates paramSpace vertices) + per-axis flip thresholds.
- **learn (DORMANT)** — `izanagi-postmortem.mjs` → `self-hypothesis.mjs` (`izanagiSummary`) → `neuron-loop.mjs`
  (`izanagiPromoter`): scores EV predictions vs outcomes, flags "estimates need recalibration." No live feed yet.
- also live: `math-operational-simulation.mjs` (`buildMemoryRanking` — an operational sim harness already here).

## What plugs in (xref evidence) — ranked improvements

### 1 — QMC sampler into the MC harness · CHEAP, FREE CI TIGHTENING
`decision-sim.mjs` ships `halton`/`sobolish` (O(1/N) vs Monte-Carlo's O(1/√N)) but the cap-sim harness uses plain
`makeRng`. Swap the uniform draws for QMC → same eval budget, materially tighter bootstrap CIs. Pure win, ~1 edit.
Pair `math-kernel.weightedVariance` (`math/math-kernel.mjs:153`) for a proper variance/CI estimator vs ad-hoc.

### 2 — prediction-ledger → CLOSE the learn loop · HIGH VALUE
`_SYSTEM/Scripts/prediction-ledger.mjs` is exactly the missing store the dormant learn-rung needs. Wire
`izanagi-bridge` rulings → prediction-ledger → `izanagi-postmortem` scores them later → `self-hypothesis`
recalibrates the EV constants. Turns the stack from open-loop (measure→commit) to self-calibrating
(measure→commit→**learn**). This is the single biggest structural upgrade — the 4th rung exists but is unfed.

### 3 — computeU / Brier as the canonical value() oracle · HIGH VALUE
`math/yuri-energy.mjs` (`computeU`, Brier, `distributionPoisoned:192`, `evalRepeatedFailure:244`) is a calibrated
EV/Brier scorer. Today each sim hand-encodes its `value()` (the bridge demo's constants are MY encoding — the
flagged weak point). Wire `computeU` as the default scoring oracle so sims score options on the SAME composite the
live system uses → kills the "0.4-in-sim ≠ 0.4-in-prod" surface gap. Brier becomes the postmortem's calibration metric.

### 4 — multiverse spec-robustness into the bridge · CHEAP
`decision-sim.multiverse(problem, variants, pickWinner)` answers "does the winner survive reasonable spec changes."
The bridge doesn't call it yet. Add it → every ruling reports a robustness-fraction across spec variants, not a
point verdict. ~1 function in `izanagi-bridge.mjs`.

### 5 — formula-foundry auto-generates value() forms · ELEGANT, HIGHER EFFORT
`math/formula-foundry.mjs` (+ `formula-foundry-bakeoff.mjs`) generates and bakes off candidate formula forms.
Instead of hand-coding the value model, let it PROPOSE value/scoring forms, sim bakes them off, `math-proof-gate.mjs`
promotes the winner. Directly addresses the bridge's advisory-encoding limitation — the constants stop being a guess.

### 6 — quantum tracker for order-sensitive sim evidence + Schmidt decoupling · WHEN APPLICABLE
When sim evidence is sequential/order-dependent (staged rollouts, A-then-B tests), use `hypothesisPosteriors`
instead of order-blind aggregation. `schmidtDecomposition` tests whether two sim signals are genuinely coupled vs
separable — i.e. *when a joint sim can be safely decomposed into independent cheaper ones*. Skip on exchangeable evidence.
- **LIVE EVIDENCE (parallel energy-calibration lane, 2026-06-13):** `computeU = Σ wᵢcᵢ` is a linear additive sum →
  it COMMUTES → the gate is order-blind *by construction* → `qqEquality` correctly finds NO order-effect (the
  G3-honest null, used as the falsification control, not a win). So for the energy weights the order-effect machinery
  is the *control*, and the genuinely actionable quantum lever is the **Schmidt coupling test**: are the 9 soft weights
  separable (single-component calibration valid, D6) or coupled (joint calibration needed)? Use order-effect tests only
  where the scoring is non-commuting; use Schmidt coupling for separability decisions.

### 7 — staleness as a first-class uncertainty axis · MODERATE
`openprocess-pool.mjs` (`openMass`, `staleness`, hazard-decay) + `filing-assessor.stalenessScore`. Sims treat params
as static; real estimates rot. Make "how stale is this estimate" a sampled paramSpace axis → robustness accounts for
decay, not just spread.

### 8 — transfer-distance for cross-domain branch mismatch · WHEN BRANCHES CROSS DOMAINS
`math/transfer-distance.mjs` scores cross-domain mechanism mismatch. When an izanagi branch is "transfer mechanism
A→B," feed transfer-distance as the failure-probability term — grounds the persona's source/target/mismatch/confidence
discipline numerically instead of by gut.

### 9 — math-proof-gate before any live-wire · GOVERNANCE
`math/math-proof-gate.mjs` gates a sim finding from advisory→fact (domain-blind bar: bind a real symbol + green worked
example). Route every sim verdict through it before it touches a live organ. Matches the quantum gate's G1–G4 discipline.

### domain note ("all domains")
`nexus-numerology.mjs` and the wave/frequency/magnetism first-class domains map onto the quantum tracker's sign-flip
phases (ℝ^N, phases 0/π) — order/phase-sensitive domains are its native home. Cross-domain transfer sims run on
`transfer-distance`. Same gates apply (domain-blind proof bar — memory: all-domains-first-class-domain-blind-gate).

## Recommended sequence
**(1) QMC + (4) multiverse** now (cheap, both ~1 edit) → **(2) prediction-ledger learn-loop** + **(3) computeU oracle**
(the two structural wins) → **(5) formula-foundry** to retire hand-encoded value models → 6–9 as the decisions demand.
Nothing here is built yet beyond `izanagi-bridge.mjs` — this is the grounded roadmap, owner-gated.

## Eval-processing architecture (millions of evals → one decision)
The reframe: **eval count is a sampling budget, not a result.** "Processing" is the funnel that collapses N evals into
one decision + a flip rule + a residual CI. The only numbers that matter at the end are the **width of the decision CI**
and the **location of the flip**; the eval count is just what you paid to make them narrow. The funnel, each layer →
the YURI mechanism that does it (HAVE) or the gap (MISSING = a capability-first pickup):

1. **Reduce streaming, never store.** Each eval folds into running aggregates in one pass — Welford (mean/var),
   t-digest/reservoir (quantiles), per-stratum counters. O(1) memory, O(N) time. HAVE implicitly (cap-sim accumulates
   per-condition). MISSING: a reusable streaming-aggregator primitive (Welford/t-digest). · cheap
2. **The breakdown IS the design — stratify before aggregating.** A flat mean over millions hides everything; the
   evals are a factorial grid (`corpus × method × query-type × seed`) decided BEFORE the run; every eval lands in a
   cell; aggregate within cells. A million over a 1000-cell grid = 1000/cell = a CI per cell. This is *how you break
   millions down*: the breakdown is the pre-registered experimental design.
3. **Every cell carries a CI or it's noise.** Bootstrap/analytic CI per cell; for A-vs-B, a CI on the DELTA. Where
   "we ran a million evals" claims die — they report the mean, not the CI. (IDF Δ −3.8/+3.1/−2.2/+2.8 with tight CIs →
   non-monotonic → no win: the CI is what made 16M evals honest.) HAVE: bootstrap (cap-sim) + `math-kernel.weightedVariance`.
4. **Variance reduction = a million worth ten million.** QMC Halton/Sobol O(1/N) vs MC O(1/√N) — `decision-sim.halton`/
   `sobolish` exist; cap-sim still uses plain RNG (wire it = roadmap #1). **Common random numbers** (score A,B on the
   SAME seeds → seed-variance cancels in the delta → comparison CI collapses) — MISSING helper, biggest free win for
   "which is better." Plus antithetic/control variates, importance sampling for the tail. · cheap–moderate
5. **Spend evals where the answer is undecided.** Sequential testing / confidence sequences (always-valid p) — stop a
   cell when its CI clears the threshold, reallocate to ambiguous cells. Successive-halving/Hyperband/OCBA for "which
   config wins" (kill losers early). The energy ablation is a cousin. MISSING: a sequential-stopping/OCBA allocator. · moderate
6. **Attack the corners.** Affine/multilinear objective → worst case at a VERTEX a uniform sampler hits w/ prob 0.
   A million interior evals + 8 deliberate corner evals beats 16M random that never hit it. HAVE: `pgdWitness` +
   izanagi-bridge vertex enumeration. (memory: feedback-affine-objective-enumerate-corners.)
7. **Honesty gates (vanity vs useful).** Held-out not in-sample (the ECE=0 caveat — MISSING: held-out split harness,
   the calibration mathematically needs it). Two-sided controls (a win EVERYWHERE = overfit; quantum gate G3 must NOT
   beat the no-effect control). Effect size not just significance (a million evals make any trivial Δ "p<0.05" — the
   large-N significance trap). Pre-register cells/metrics + seed everything (`makeRng`) → re-runnable, no forking-paths.
8. **Collapse to the decision.** Endpoint = robust winner + flip rule + residual CI (the izanagi-bridge/decision-sim
   output). A million evals → one sentence + a threshold, or you accumulated instead of processed.

**The symptom reframe:** needing millions is usually a sign you DIDN'T allocate well — stratify + CRN + QMC + a stopping
rule resolves most decisions at *thousands*. Millions are genuinely needed only for rare-event tails, fine robustness
grids, high-dim corners. The funnel's real job is telling you "the decision CI is tight enough — stop" (and flagging
when you over-sampled). Live contrast: the energy lane's **1,132-reject burn-in corpus** is the opposite regime (too
few → every eval precious → paired CRN + bootstrap, don't pretend it's millions). Same funnel, both ends.

**Pickups this exposes (build the processing layer ONCE, register it):** streaming-aggregator · CRN paired-delta helper ·
sequential-stopping/OCBA allocator · held-out split harness. These are the eval-processing siblings of the wiring items
above — capability-first, so every future million-eval run reuses them instead of re-hand-rolling aggregation.

**STATUS — BUILT 2026-06-13** → `_SYSTEM/Scripts/eval-processing.mjs` (+ `.test.mjs`, 9/9 green). All four shipped as
capabilities (registry 14): `streaming-aggregator` (Welford moments + Vitter reservoir, O(1) mem), `crn-paired-delta`
(common random numbers + the unpaired CI as proof, variance-reduction factor reported), `sequential-stopping`
(empirical-Bernstein confidence sequence — **α-control under peeking validated empirically, not cited**: false-stop ≤ α
across 300 null streams; power test stops at ~650 evals, never wrong-direction), `heldout-split` (seeded split + k-fold +
split-conformal quantile + the in-sample-vs-held-out optimism gap that kills the ECE=0 trap). Reuses `decision-sim.makeRng`.
RESIDUALS: EB-CS assumes a bounded value range (unbounded → needs a sub-Gaussian variant); reservoir quantiles are
approximate in deep tails (bump reservoir / add t-digest for exact p99); `pairedDelta` computes the unpaired baseline by
default (3× value() calls) — add `computeUnpaired:false` for production hot loops; new file not yet in GitNexus index.
