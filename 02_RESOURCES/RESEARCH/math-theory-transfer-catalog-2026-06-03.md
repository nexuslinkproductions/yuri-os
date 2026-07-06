# Math-Theory Transfer Catalog — Borrowing Mechanisms into the YURI Substrate

We already stole Lyapunov for the energy gate. This catalog is the rest of the heist: each card names a **mechanism** from theory X that does **concrete work** in a named YURI subsystem — not a cool-math listicle. Every transfer survived adversarial verification against the actual code; superficial name-matches were rejected, and confidence is split between the *structural insight* and the *literal mapping*. Ordered by juice. Do not treat any card as shipped — they are buildable hypotheses with a smallest experiment attached.

> Already in the substrate (NOT re-proposed): Lyapunov descent gate · Shannon/KL/cross-entropy/info-gain · Brier/log-loss/Bayes/softmax · Lp-norms incl. L∞ · exponential + FSRS decay · Dijkstra/A*/topo-sort · circuit-breaker · median/MAD robust stats · BM25/FTS5 · convex depth² penalties + per-claim identity veto.

---

## 1. Kalman / NIS chi-square gating → adaptive surprise band — juice 8 · confidence HIGH

- **SOURCE THEORY** — Kalman filter: scalar adaptive recursive estimator with Normalized Innovation Squared (NIS) chi-square gating.
- **BORROWED MECHANISM** — A 1-D estimator that PREDICTS (inflating variance via process-noise Q) then UPDATES (folding each sample weighted by measurement-noise R), with a self-propagated innovation variance S that auto-widens and re-tightens.
- **YURI TARGET** — SALIENCE / SURPRISE: the static median+K·MAD band in `energy-tick-core.mjs` (`isSurprise`/`surpriseEngaged`).
- **THE TRANSFER** — Track `log|ΔU|` (not raw |ΔU| — heavy-tailed, non-negative, breaks Gaussian-innovation symmetry) with a scalar Kalman filter. Fire surprise via a ONE-SIDED high-tail NIS gate `d²=(logΔU−pred)²/S` above a χ²(1) threshold. The headline win is **Q-driven recovery dynamics** — re-sensitize within ~2 ticks of a CRITICAL spike where MAD stays numb ~10 — NOT the chi-square constant (near-isomorphic to today's self-scaled rule). The propagated S retires the ad-hoc CRITICAL-exclusion hand-patch (lines 269-274). Q (phase-drift rate) and R (per-sample noise) become cockpit knobs.
- **MISMATCH / RISK** — Textbook 3.84 threshold WILL be wrong: gating contracts the innovation covariance (arXiv 2512.18508). Must empirically recalibrate on a real energy-trace replay.
- **CONFIDENCE** — Structural HIGH (recovery dynamics are a genuine new capability MAD lacks); literal-mapping MEDIUM (the chi-square gate is nearly redundant with the existing rule).
- **SMALLEST EXPERIMENT** — Pull a real ΔU trace from the energy-trace log. Implement `scalarKalmanSurprise(prevEstimate, prevVar, absDeltaU, Q, R)` → `{nextEstimate, nextVar, nis, surprised}`. Replay through BOTH `isSurprise` (MAD) and the NIS gate; compare which flags genuine phase-changes vs the post-CRITICAL desensitization window. Tune Q/R so NIS recovers within ~2 ticks where MAD stays numb ~10.
- **CITATIONS** — [Kalman filter (NYU/Wikipedia PDF)](https://pages.stern.nyu.edu/~dbackus/Identification/Kalman_filter_Wikipedia_May10.pdf) · [Innovation-based adaptive estimation (Springer)](https://link.springer.com/article/10.1007/s00190-013-0690-8) · [NIS covariance contraction (arXiv 2512.18508)](https://arxiv.org/html/2512.18508v1) · [The Kalman Filter (engineeringmedia)](https://engineeringmedia.com/controlblog/the-kalman-filter)

---

## 2. CUSUM change-point detection → slow-rot regime alarm — juice 8 · confidence HIGH

- **SOURCE THEORY** — CUSUM (E.S. Page, Biometrika 1954; Lorden 1971 minimax; Moustakides 1986 exact-optimality).
- **BORROWED MECHANISM** — A cumulative-sum statistic `S_t = max(0, S_{t-1} + (x_t − μ₀ − k))` that integrates small persistent drift and alarms when `S_t > h`, with a tunable false-alarm rate (ARL).
- **YURI TARGET** — SALIENCE / SURPRISE: a separate detector feed alongside `isSurprise` in `energy-tick-core`.
- **THE TRANSFER** — One-sided UPPER CUSUM on the **SIGNED** ΔU stream → declare REGIME CHANGE ("thread tipped from progressing to degrading") and escalate to deep-eval / surface to Marcel. Three corrections: (1) input MUST be SIGNED ΔU — the existing `recentAbs` window throws away sign on entry (line 273), so reuse it ONLY to source scale (`k = 0.5·running-MAD`, `h = 5·MAD` keeps the dial scale-free, matching the no-fixed-ΔU-number discipline); (2) UPPER-only — the lower arm is wasted machinery, drop it; (3) make `μ₀` phase-adaptive (recent median signed ΔU per nen-phase) to kill non-stationarity false-alarms. **MAD catches the shock; CUSUM catches the slow rot.**
- **MISMATCH / RISK** — Non-stationary baseline inflates false-alarms unless μ₀ is re-estimated per phase. It is a TRIGGER (says WHEN/THAT), not the explainer (the formula-bank picker says WHY).
- **CONFIDENCE** — Structural HIGH (slow-drift is a real blind spot of the shock-only MAD band); literal HIGH (clean, well-understood recursion).
- **SMALLEST EXPERIMENT** — Add `cusum(ΔU_stream, k, h)` → `{alarm, S_t, changeIndex}`. Build a synthetic trace drifting −0.3→+0.3 over 40 ticks where NO single step is a MAD outlier; confirm `isSurprise()` never fires but `cusum()` alarms and pins `changeIndex` near onset. Then run on a flat in-control stream across many seeds and confirm empirical ARL₀ matches target — proving the false-alarm dial is real.
- **CITATIONS** — [CUSUM (Wikipedia)](https://en.wikipedia.org/wiki/CUSUM) · [Online change-point review (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12002415/) · [CUSUM walkthrough (Lapa)](https://mattlapa.com/online-change-point-detection-and-cusum/)

---

## 3. E-value merging under arbitrary dependence → council redundancy exposure — juice 8 · confidence MEDIUM

- **SOURCE THEORY** — E-value merging under arbitrary dependence (Vovk & Wang 2021, Annals of Statistics 49(3); Wang 2025, Biometrika 112(2) asaf020).
- **BORROWED MECHANISM** — Calibrated evidence values (`E_null[E_i] ≤ 1`) merge by a dependence-correct rule: PRODUCT for provably-independent sources, WEIGHTED ARITHMETIC MEAN for arbitrarily-dependent ones (the only admissible merge under arbitrary dependence).
- **YURI TARGET** — MULTI-LANE CONSENSUS.
- **THE TRANSFER** — Each lane's verdict on "is this claim true?" becomes a calibrated e-value via YURI's existing Brier/log-loss as a MANDATORY pre-step (raw LLM confidence is NOT a valid e-value). Merge dependent lanes by weighted mean with weights FIXED ex-ante. The headline: because the equal-weight mean of N identical e-values equals ONE lane's value, the merged scalar **automatically exposes when the council is redundant theater** — replacing "three-of-four agreed" with dependence-discounted real evidence, and telling Marcel when extra lanes buy nothing.
- **MISMATCH / RISK** — Prerequisite, not optional: the council emits categories today, not calibrated probabilities. If weights ever become data-dependent across a question sequence, switch to the martingale/betting construction for anytime-validity.
- **CONFIDENCE** — Structural HIGH (redundancy-exposure is exactly YURI's correlated-lane pain); literal MEDIUM (needs a calibrated per-lane numeric verdict built first).
- **SMALLEST EXPERIMENT** — Prototype `mergeLaneEvidence(eValues, weights, dependence)` with both merges. Negative test 1: 4 copies of one lane → product blows up ~4× (false confidence, REJECT), weighted mean stays ~1×. Negative test 2: a lane reporting e-value 10 but right only 50% on false claims has `E_null[E] > 1` (invalid); routing it through Brier/log-loss first pulls it back under 1.
- **CITATIONS** — [E-values admissible merging (Biometrika 2025)](https://academic.oup.com/biomet/article/112/2/asaf020/8086785) · [Merging under dependence (arXiv 2409.19888)](https://arxiv.org/html/2409.19888) · [Vovk-Wang-Wang AoS 2021](https://sas.uwaterloo.ca/~wang/papers/2021Vovk-Wang-Wang-AOS.pdf)

---

## 4. Spectral graph theory (Laplacian / Fiedler) → architecture second-opinion clustering — juice 8 · confidence HIGH

- **SOURCE THEORY** — Spectral graph theory: graph Laplacian, Fiedler vector, spectral clustering (Fiedler 1973; Shi-Malik normalized cuts 2000; von Luxburg tutorial 2007). *Cheeger conductance / λ₂ algebraic-connectivity folded in here — same Fiedler vector.*
- **BORROWED MECHANISM** — Eigenstructure of the normalized Laplacian: λ₀ multiplicity = connected-component count; the bottom-k eigenvectors embed nodes so k-means recovers communities; λ₂ (algebraic connectivity) is a single global cohesion scalar; the Fiedler sweep names the bottleneck cut.
- **YURI TARGET** — ARCHITECTURE GRAPH (`yuri-graph-state.json`), read-only second-opinion layer for visual-introspection.
- **THE TRANSFER** — STEP 1 (free win): report λ₀ multiplicity after excluding meta-edges → surfaced 11 topologically-isolated nodes (hook + ledger chain) with no typed flow/data edge to the body = concrete orphan findings. STEP 2: on the 113-node GIANT COMPONENT ONLY build `Lsym = I − D^−1/2 A D^−1/2` with type-weighted edges. STEP 3: k-way k-means on bottom-k eigenvectors → emit a diff table `node | declared_sector | spectral_cluster | AGREE/DISAGREE`. Treat DISAGREE rows as an INDEPENDENT evidence channel cross-checking Phase-2's circular purpose-strings, NOT ground truth. Track λ₂ as one architecture-health scalar, alerting only on a DROP across commits (trend, not absolute).
- **MISMATCH / RISK** — Symmetric cut is a directed-graph approximation (60% of edges one-way); never run Fiedler across disconnected components (near-zero entries there are orphans, not boundary nodes); conductance pattern-matches our intentional hub-and-spoke, so whitelist designed chokes. UPGRADE PATH: Chung random-walk DIRECTED Laplacian to honor the 111 return-edges.
- **CONFIDENCE** — Structural HIGH; literal HIGH (124×124 is trivial, zero mutation risk).
- **SMALLEST EXPERIMENT** — Node script: load graph-state, assign type-weights `{flow:1.0, branch:0.9, data:0.8, gates:0.7, memory:0.6, feedback:0.4, return:0.3, logs:0.2}`, build symmetrized normalized Laplacian, compute bottom-k eigenvectors (Jacobi or power-iteration deflation), k-means the rows, emit the AGREE/DISAGREE diff table. Validate by eye: do the ENKI control-plane nodes land in one cluster? Sweep the Fiedler prefix-cuts for the bottleneck; negative control: delete one random cross-sector edge and confirm λ₂ drops and the reported cut moves.
- **CITATIONS** — [Spectral clustering (Wikipedia)](https://en.wikipedia.org/wiki/Spectral_clustering) · [Spectral methods survey (arXiv 2003.09969)](https://arxiv.org/pdf/2003.09969) · [Graph communities walkthrough](https://chih-ling-hsu.github.io/2020/05/25/Graph-Communities) · [Cheeger constant (Wikipedia)](https://en.wikipedia.org/wiki/Cheeger_constant_(graph_theory)) · [Cheeger's inequality (Waterloo)](https://cs.uwaterloo.ca/~lapchi/papers/Cheeger.pdf)

---

## 5. Thompson Sampling (+ Gittins index) → closed-loop lane routing — juice 8 · confidence HIGH

- **SOURCE THEORY** — Thompson Sampling (Bayesian posterior-sampling bandit; Thompson 1933; Bubeck-Liu prior-free regret bound 14·√(nK)). *Gittins/Whittle index policy folded in as the stronger-but-rarely-worth-it variant.*
- **BORROWED MECHANISM** — Per-arm Beta(α,β) posterior; one posterior sample per arm, dispatch argmax. The randomized draw IS principled exploit-vs-explore with no hand-tuned ε (wide posterior → under-sampled arms self-explore). The Gittins index extends this to rank by continuation value including the information a pull reveals.
- **YURI TARGET** — DISPATCH / ROUTING (`offload-contract.mjs` lane selection).
- **THE TRANSFER** — Not "add a bandit to learn lane quality" (YURI already measures per-lane verified success in `lane-calibration.mjs`) — frame it as **CLOSING THE OPEN LOOP**: replace the frozen `selectSteeringLane` keyword waterfall with a per-(lane × task_class) Beta bandit seeded from `lane-calibration.json` (`α=verified_ok+prior`, `β=verified_fail`). CRITICAL: update on `downstream_verified_ok` ONLY, never `self_reported_success` — `overconfidence_gap` already proves lanes lie, so rewarding the self-report optimizes the lie. The Gittins refinement kills the magic n≥50 floor (a genuinely-bad new lane shouldn't get 49 free passes), but on a ~6-lane roster Thompson captures most of the win — promote the full index only if offline replay beats Thompson+constant on premature-kill vs true-recovery counts.
- **MISMATCH / RISK** — Lanes are RESTLESS (server-side model drift) → reuse the existing sliding-window for non-stationarity; the Gittins variant is the Whittle heuristic with no optimality proof. Extend `lane-calibration` to bucket byLane×task_class (today only byLane) or the contextual bandit has no data.
- **CONFIDENCE** — Structural HIGH; literal HIGH for Thompson, LOW for the full Gittins index.
- **SMALLEST EXPERIMENT** — `_SYSTEM/SELF/lane-posteriors.json` keyed by (lane, task_class). Seed from `preferredUsage` (preferred→Beta(3,1), neutral→Beta(1,1)). `routeThompson(taskClass, eligibleLanes)` draws one Beta sample per lane, returns argmax. On resolve: accepted-with-evidence → α+=1, failed/retried/owner-corrected → β+=1. Backtest against logged `capture` history vs the static table; ship flag-gated + advisory until non-negative lift.
- **CITATIONS** — [Thompson Sampling analysis (arXiv 1301.2609)](https://arxiv.org/pdf/1301.2609) · [Prior-free regret bound (arXiv 1304.5758)](https://arxiv.org/pdf/1304.5758) · [TS tutorial (ACM)](https://dl.acm.org/doi/10.1145/3088510) · [Gittins index (Wikipedia)](https://en.wikipedia.org/wiki/Gittins_index) · [Sampling Gittins approx (arXiv 2307.11713)](https://arxiv.org/pdf/2307.11713)

---

## 6. Multiplicative-Weights / Hedge → self-tuning council trust vector — juice 8 · confidence MEDIUM

- **SOURCE THEORY** — Multiplicative-Weights / Hedge (no-regret online learning vs an adversarial expert sequence; O(√(T log N)) regret vs best expert in hindsight) — with the delayed-feedback Hedge variant.
- **BORROWED MECHANISM** — Each expert carries a weight; `w *= exp(−η·loss)` after each round; the blended decision is never much worse than the best single expert in hindsight, with no distributional assumption.
- **YURI TARGET** — MULTI-LANE CONSENSUS — the REAL orchestrator `shintai-dispatch.mjs` (NOT the named classifier `yuri-council-claim-evidence.mjs`, which does no aggregation).
- **THE TRANSFER** — Replace the STATIC trust hierarchy ("Codex verifies Opus") with a learned per-lane weight vector in `_SYSTEM/SELF/council-weights.json`. Each lane = expert; `loss=1` if its advisory claim was later contradicted by deterministic local verification, 0 if confirmed; update ONLY on actually-verified rounds (delayed full-info → delayed-feedback Hedge, NOT EXP3); consensus = weight-weighted vote. This mechanizes the standing "advisory until local evidence verifies it" rule into an auto-tuning trust vector that exponentially silences reliably-falsified lanes.
- **MISMATCH / RISK** — Claim the RELATIVE guarantee only (blended ≈ best lane in hindsight), explicitly NOT an absolute truth floor — correlated same-family hallucination makes best-in-hindsight itself unreliable. Log verified-fraction to keep the selection-bias visible. Advisory only.
- **CONFIDENCE** — Structural HIGH (turns a frozen hierarchy into a learned one); literal MEDIUM (the relative guarantee is weaker than it sounds under correlated lanes).
- **SMALLEST EXPERIMENT** — `council-weights.json` init uniform. After a verified round set `loss` per lane, update `w *= exp(−η·loss)`, `η=√(ln K / T_est)`. Feed a synthetic 5-lane stream where lane-4 is reliably wrong; assert its weight decays below 0.05 within ~20 rounds and the weighted consensus matches the reliable majority.
- **CITATIONS** — [EXP3 / adversarial bandits (Kun)](https://www.jeremykun.com/2013/11/08/adversarial-bandits-and-the-exp3-algorithm/) · [Hedge regret notes (Berkeley)](https://people.eecs.berkeley.edu/~jiantao/2902021spring/scribe/EE290_Lecture_10.pdf) · [Online learning lecture (USC)](https://haipeng-luo.net/courses/CSCI699/lecture12.pdf)

---

## 7. Queuing theory (Little's Law + Erlang-B) → queue-health analyzer — juice 8 · confidence MEDIUM

- **SOURCE THEORY** — Little's Law (`L=λW`, distribution-free) + Erlang-B loss for M/M/c/c (`B(c,A)=A·B(c−1,A)/(c+A·B(c−1,A))`).
- **BORROWED MECHANISM** — A distribution-free occupancy identity (`L=λW`) plus a recursive blocking-probability formula for a c-server loss system under offered load `A=λ·h`.
- **YURI TARGET** — DISPATCH / ROUTING — read-only over the offload `token_ledger`.
- **THE TRANSFER** — `λ = count(offload_queue_acquire)/window`, `h = mean(release − acquire on trace_id)` with TTL-reaped leases FLAGGED and excluded (they right-censor h downward). STEP 1 (the real product, trust it): emit `L=λW` occupancy + a stationarity canary — does λ·W match observed mean busy-slot count? Mismatch = the system isn't stationary and the queue model is suspect, which is itself the finding. STEP 2 (advisory lower-bound): `B(c=MAX_LANES, A)` as an "optimistic floor on blocking risk." Sharpening: YURI's arrivals are a FINITE operator-driven BURST source, not infinite-Poisson — correct Erlang-B's burst-optimism with a peakedness adjustment (inflate offered load by `z = variance/mean of busy-slot count`, z>1 under bursts, from the SAME ledger). The z-corrected blocking is honest; raw Erlang-B is the floor.
- **MISMATCH / RISK** — NO control wiring (lane-shedding, c right-sizing, backpressure) until predicted-vs-actual blocking is validated against a real burst. The model assumes stationarity it may not have.
- **CONFIDENCE** — Structural HIGH for Little's Law (distribution-free, always valid); literal MEDIUM for Erlang-B (Poisson assumption violated by bursts).
- **SMALLEST EXPERIMENT** — Read-only analyzer: compute λ, h, A, L=λW (cross-check L against observed mean busy-slot count as a stationarity test), and B(c,A) recursively. Validate Little's Law empirically first; if it fails, that mismatch is the finding. Surface B in offload-queue status. No control wiring until validated.
- **CITATIONS** — [Little's Law (Wikipedia)](https://en.wikipedia.org/wiki/Little's_law) · [Erlang unit (Wikipedia)](https://en.wikipedia.org/wiki/Erlang_(unit)) · [Little's Law notes (Columbia)](http://www.columbia.edu/~ks20/stochastic-I/stochastic-I-LL.pdf)

---

## 8. Pearl's do-operator / counterfactual ablation → load-bearing evidence test — juice 8 · confidence HIGH

- **SOURCE THEORY** — Pearl's Structural Causal Models — the do-operator and counterfactual ablation (leave-one-out as the necessity test).
- **BORROWED MECHANISM** — `do(remove r)` intervention: delete one input, re-run the deterministic structural-equation evaluator, measure the effect on the outcome = that input's causal necessity.
- **YURI TARGET** — CLAIM CORTEX (`claim-cortex.mjs`).
- **THE TRANSFER** — `evidenceNecessity(claim, opts)`: for each evidence record, deep-clone the claim minus that record and call the EXISTING `assessClaim`. Score per-record necessity = the verdict-ladder rung-drop it causes (ASSERT→HEDGE→VERIFY_FIRST→RETRACT), not just the `evidenceRank` delta. Emit a `singlePointOfFailure` flag when any single-record ablation forces a healthy ASSERT down to VERIFY_FIRST or RETRACT. This surfaces **LOAD-BEARING vs DECORATIVE evidence** — a readout the cortex is blind to today (`maxLadderInversion` only sees existing over-claims, not the fragility of currently-healthy ASSERTs). Pure, deterministic against injected `nowMs`, drops into the existing test harness.
- **MISMATCH / RISK** — Records are modeled INDEPENDENT today; full SCM (record-dependency DAG, backdoor adjustment, abduction) is a separately-justified build. SCOPE STRICTLY to counterfactual ablation.
- **CONFIDENCE** — Structural HIGH; literal HIGH (it's a clean loop over the existing evaluator, zero new math).
- **SMALLEST EXPERIMENT** — Fixture: a claim claimed `runtime_tested` with [one fresh test, one fresh advisory]. Assert removing the advisory → verdict unchanged (decorative, necessity 0); removing the test → ASSERT collapses toward RETRACT (necessity = rung drop). Surface a single-point-of-failure flag when any one ablation forces a RETRACT.
- **CITATIONS** — [Causal inference in statistics primer (Pearl R-485)](https://ftp.cs.ucla.edu/pub/stat_ser/r485.pdf) · [Causal inference walkthrough (Dablander)](https://fabiandablander.com/r/Causal-Inference.html) · [Causality overview (Pearl 2009)](http://www.cs.columbia.edu/~blei/fogm/2025F/readings/Pearl2009a.pdf)

---

## 9. Imprecise probability / credal sets → sample-licensed overconfidence penalty — juice 8 · confidence MEDIUM

- **SOURCE THEORY** — Imprecise probability / credal sets (Walley lower & upper previsions; Imprecise Dirichlet Model for the scalar lower-probability bound).
- **BORROWED MECHANISM** — A lower-probability bound that depends on SAMPLE COUNT, not just the point estimate: IDM lower `= k/(n+s)` with width `∝ 1/n`, OR Wilson lower (`∝ 1/√n`). Few trials → the bound sits well below the point estimate, no matter how lucky.
- **YURI TARGET** — SELF-CALIBRATION (feeding the energy substrate).
- **THE TRANSFER** — For each confidence bucket with (successes k, trials n) compute a lower bound `L(k,n,s)` and fire a NEW penalty `μ·max(0, assertedConfidence − L)` in `computeU` that punishes a sharp claim sitting ABOVE the lower bound its evidence-count licenses. Catches the 4/4-lucky case where Brier/log-loss/repeated-failure all read clean (verified: 4/4 → IDM lower 0.667, so a fresh 0.95 is unearned; 40/40 → 0.952, the same 0.95 passes). Generalizes the ad-hoc `n≥50` guard at `offload-contract.mjs:1336` into a continuous, weight-tunable term and patches the sibling `overconfidence_gap` check at L1333 which has NO sample guard.
- **MISMATCH / RISK** — Use ONE estimator and NAME it honestly (don't mislabel IDM as Wilson). Borrow only the scalar lower bound, never the credal-set algebra. Expose s (or z) as a conservative neuro-knob.
- **CONFIDENCE** — Structural HIGH (small-n overconfidence is a real, demonstrated hole); literal MEDIUM (choice of estimator and s is a modeling decision).
- **SMALLEST EXPERIMENT** — `credalBand(successes, trials, s=2)` → `[lower, upper]` via IDM. Feed a 4/4 high-confidence history: point estimate 1.0 but lower bound stays ~0.67, and Brier=0 reports "perfectly calibrated" while the credal lower bound flags it as unlicensed. A 40/40 history tightens so 0.95 passes. Compare side-by-side against the Brier/log-loss path to prove it catches a case they miss.
- **CITATIONS** — [Credal sets (EmergentMind)](https://www.emergentmind.com/topics/credal-sets) · [Imprecise probability (Springer)](https://link.springer.com/article/10.1007/s11098-019-01262-8) · [IDM review (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S0888613X24000355)

---

## 10. Kalman / Bayesian sensor fusion → precision-weighted claim consensus — juice 7 · confidence MEDIUM

- **SOURCE THEORY** — Bayesian sensor fusion — inverse-variance (precision) weighting of N noisy estimates, with conservative covariance-intersection correction for correlated sources.
- **BORROWED MECHANISM** — Fuse estimates weighted by `1/σ²`; covariance intersection (conservative convex combination) prevents correlated sources from manufacturing false certainty; the cross-source INNOVATION (spread relative to summed variances) flags disagreement.
- **YURI TARGET** — MULTI-LANE CONSENSUS (`yuri-council-claim-evidence.mjs`), combining N lanes asserting the SAME claim.
- **THE TRANSFER** — Derive each lane's variance from `overconfidence_gap`-CORRECTED calibration (`lane-calibration.json`, NOT raw self-report). Fuse by inverse-variance using COVARIANCE INTERSECTION. Two outputs: (1) a fused confidence the cortex/self-calibration layers consume as σ²; (2) the higher-leverage cross-lane INNOVATION = spread relative to summed variances — large spread = lanes disagree relative to their own reliability = auto-route to VERIFY-FIRST. Ship the innovation/disagreement flag FIRST; treat the fused point estimate as advisory.
- **MISMATCH / RISK** — Distinct from card 1 (Kalman): that one is innovation-GATING a 1-D surprise stream; this is inverse-variance FUSING N parallel estimates. Lanes are correlated → covariance intersection is mandatory, not a fixed discount.
- **CONFIDENCE** — Structural HIGH (the disagreement-innovation directly serves the tainted-until-verified mandate); literal MEDIUM (per-lane σ² requires calibrated variances that don't fully exist yet).
- **SMALLEST EXPERIMENT** — Take 3 archived shintai-advisory JSONs asserting overlapping claims. Assign each lane a σ² from a stub table. `fuseClaimConfidence(perLaneEstimates)` does inverse-variance fusion AND reports cross-lane innovation. Verify: (a) two agreeing calibrated lanes → fused > max(inputs); (b) a lone overconfident lane down-weighted; (c) wide disagreement raises the innovation flag → VERIFY-FIRST. Then add a fixed correlation discount and show it tames double-counting.
- **CITATIONS** — [Sensor fusion survey (arXiv 2504.08302)](https://arxiv.org/pdf/2504.08302) · [Inverse-variance weighting (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8434080/) · [EKF sensor fusion walkthrough](https://medium.com/@mithi/object-tracking-and-fusing-sensor-measurements-using-the-extended-kalman-filter-algorithm-part-1-f2158ef1e4f0)

---

## 11. Online Convex Optimization / no-regret → learned energy weights with a regret receipt — juice 7 · confidence HIGH

- **SOURCE THEORY** — Online Convex Optimization (Zinkevich Online Gradient Descent, online mirror descent) — sublinear regret over a stream of convex losses, converging to the best fixed comparator in hindsight, no held-out set.
- **BORROWED MECHANISM** — Update the decision vector by a gradient step on each loss; cumulative regret vs the best static weights quantifies exactly how much calibration the hand-tuned weights leave on the table.
- **YURI TARGET** — SELF-CALIBRATION + the ENERGY GATE weights it feeds (`DEFAULT_WEIGHTS` in `yuri-energy.mjs`).
- **THE TRANSFER** — Make the FIRST deliverable a ground-truth LABELER, not the OGD step. PHASE 0 (the real work): extend the energy-trace schema with a deferred-outcome record (second JSONL keyed by `runId`, resolved later: did the gated claim get promoted-and-survive, did the protected-path edit get reverted) — this join does NOT exist today. PHASE 1: offline replay over the joined (decision, label) stream — `ℓ_t = logLoss(gateAcceptProb(w_t), outcome)` over the LEARNABLE weights ONLY `{α,β,γ,δ,ε,ζ,ι}`; FREEZE the guard weights `{η=100, θ=10, λ=50 fail-closed, κ=5}`. One OGD/OMD pass, plot cumulative regret vs static baseline. PHASE 2: labels are sparse/late/adversary-influenced → use a dynamic-regret / sliding-window-restart variant, NOT vanilla static-regret OGD. SHIP GATE: emit new weights only if regret is sublinear AND learned beats hand-tuned on a held-out TAIL slice AND no guard weight moved.
- **MISMATCH / RISK** — The regret receipt Marcel wanted is real, but it's DOWNSTREAM of a labeler that has to be built first. Pure-replay, zero changes to the live gate.
- **CONFIDENCE** — Structural HIGH (first path to stop hand-tuning weights, with a quantified receipt); literal HIGH on the math, but gated behind the labeler build.
- **SMALLEST EXPERIMENT** — Read the last N `yuri-energy-trace.jsonl` entries, attach a binary outcome label per decision, define `ℓ_t = logLoss(gate_accept_prob(w), outcome)` over learnable weights only, run OGD one pass, plot regret vs `DEFAULT_WEIGHTS`. Ship only if regret sublinear AND learned beats hand-tuned on a held-out tail. ~150 lines, zero live-gate change.
- **CITATIONS** — [Online mirror descent II (parameterfree)](https://parameterfree.com/2019/10/01/online-mirror-descent-ii-regret-and-mirror-version/) · [OCO / mirror descent (Wisconsin)](https://pages.cs.wisc.edu/~yudongchen/cs726_sp24/Lecture_25_online_convex_optimization_mirror_descent.pdf) · [Mirror descent notes (Berkeley)](https://www.stat.berkeley.edu/~bartlett/courses/2014fall-cs294stat260/lectures/mirror-descent-notes.pdf)

---

## 12. Split Conformal Prediction → calibrated ASSERT bar — juice 7 · confidence HIGH

- **SOURCE THEORY** — Split Conformal Prediction (Vovk/Shafer; Angelopoulos-Bates) — distribution-free, finite-sample marginal coverage via a held-out calibration quantile.
- **BORROWED MECHANISM** — A nonconformity score plus a held-out quantile `q̂` gives a calibrated decision bar with a finite-sample miscoverage guarantee (`≤ α`), no distributional assumption.
- **YURI TARGET** — CLAIM CORTEX.
- **THE TRANSFER** — PHASE 0 (prerequisite): add a durable resolved-outcome log to the claim-evidence ledger — for each claim that reached ASSERT, later record was-it-an-overclaim-in-hindsight (resolved true / retracted). This is the calibration set; without it the whole thing is vapor. PHASE 1: `conformalVerdict()` — score `s = max(0, claimedRank − decayed-evidenceRank)`; over the resolved log compute `q̂` at the `⌈(n+1)(1−α)⌉/n` quantile; stamp ASSERT only if `s ≤ q̂`, giving "ASSERTs wrong at most ~α, finite-sample, distribution-free." Use Mondrian per-evidence-kind `q̂` (reuse the existing `EVIDENCE_CEILING` partition: test / fixture / advisory each separately calibrated).
- **MISMATCH / RISK** — The claim stream DRIFTS (non-exchangeable) → use weighted/adaptive conformal (recency-weighted calibration or online ACI). The guarantee is MARGINAL not conditional: a specific hard claim-kind can stay under-covered even when the average holds — which is why per-kind Mondrian is mandatory.
- **CONFIDENCE** — Structural HIGH (gives the cortex a real coverage guarantee); literal HIGH (well-specified), gated behind the resolved-outcome log.
- **SMALLEST EXPERIMENT** — 50-line `conformalVerdict()` beside `decideVerdict`. Seed a synthetic calibration log of ~200 `(score, was-overclaim)` pairs from existing test fixtures. Compute `q̂` at α=0.1. Run over a fresh held-out batch and MEASURE empirical miscoverage; assert it lands in `[α, α+1/(n+1)]` on exchangeable data, then inject drift and watch coverage break — that single negative test is the proof of the mismatch.
- **CITATIONS** — [Conformal prediction gentle intro (arXiv 2107.07511)](https://arxiv.org/html/2107.07511v6) · [Conformal prediction (Wikipedia)](https://en.wikipedia.org/wiki/Conformal_prediction) · [Conformal lecture (Tibshirani/Berkeley)](https://www.stat.berkeley.edu/~ryantibs/statlearn-s23/lectures/conformal.pdf)

---

## 13. Test martingales / SAVI → anytime-valid descent certifier — juice 7 · confidence MEDIUM

- **SOURCE THEORY** — Test martingales & e-values / Safe Anytime-Valid Inference (Ramdas, Grünwald, Vovk, Shafer 2022-23; betting-on-the-mean, Waudby-Smith & Ramdas JRSS-B 2024).
- **BORROWED MECHANISM** — Wealth `K_t = ∏(1 + λ_t(m₀ − x_t))` accumulated by betting against a null; by Ville's inequality, `K_t` crossing `1/α` is anytime-valid proof — checkable every step with NO multiple-comparisons inflation.
- **YURI TARGET** — SELF-CALIBRATION — a thread-level descent CERTIFIER on top of the per-tick gate.
- **THE TRANSFER** — Run a betting-on-the-mean martingale over the live WORK-tier ΔU stream from `tickAndTrace`. Null `H₀: E[ΔU] ≥ 0` (no genuine descent) — a COMPOSITE MEAN null, NOT a distributional one (drop the symmetric/MAD-scaled assumption). `m₀=0`, `λ_t` PREDICTABLE (from ticks ≤ t−1 via ONS/aGRAPA or fixed small λ), ΔU range-clipped so `K_t ≥ 0`. `K_t` crossing `1/α (=20 @ α=0.05)` upgrades the ad-hoc `threshold=0` from "this step looked like descent" to "the accumulated betting evidence that this thread is really descending crossed a calibrated bar." Gate behind the existing `depthThreshold=6` (short threads can't accumulate wealth).
- **MISMATCH / RISK** — Related to card 3 (e-values) but distinct: card 3 MERGES lane verdicts, this CERTIFIES a single ΔU stream over time. Two canaries before ship: (1) null-stream false-alarm ≤ α across seeds; (2) wealth never negative on an adversarial trace.
- **CONFIDENCE** — Structural HIGH (anytime-validity matches YURI's per-tick architecture perfectly); literal MEDIUM (λ-tuning and range-clipping need care).
- **SMALLEST EXPERIMENT** — Bet a fraction λ that true mean ΔU < 0; `Wealth_t = ∏(1 + λ(−ΔU_t))` clipped nonnegative. Replay a healthy session's trace → confirm wealth climbs past 20; a thrashing session → confirm it does NOT cross; a pure-noise null stream → confirm false-alarm ≤ α across seeds. That null-stream test is the load-bearing check.
- **CITATIONS** — [SAVI (Ramdas et al. Stat Science 2023)](https://safestatistics.com/wp-content/uploads/2023/10/RamdasSAVIStatScience23.pdf) · [Game-theoretic statistics talk (CMU)](https://stat.cmu.edu/~aramdas/talks/JHU24.pdf) · [E-values review (Waterloo)](https://sas.uwaterloo.ca/~wang/files/e-review.pdf)

---

## 14. Minimum Description Length → redundancy-aware memory demotion — juice 7 · confidence HIGH

- **SOURCE THEORY** — Minimum Description Length (Rissanen two-part / crude code): keep item m iff `L(m) < L(m | rest-of-store)`.
- **BORROWED MECHANISM** — An item's worth = its IRREDUCIBLE description length given everything else; a redundant restatement compresses to nearly nothing against the rest, a unique insight does not.
- **YURI TARGET** — MEMORY GOVERNANCE (`memory-relocator.mjs` `planRelocations`/`evaluateRetention`).
- **THE TRANSFER** — Add a SECOND, orthogonal demotion axis: `marginalBits(item, restOfActiveStore) ≈ len(gzip(rest+m)) − len(gzip(rest))` normalized by `len(gzip(m))` — a real, computable, embedding-free `L(m|rest)` proxy (NOT BM25, which is relevance not reconstruction). Demote iff `(R<rFloor AND marginalBits<redundancyFloor)` — keep if EITHER retrievable OR irreducible-given-the-rest. This protects the stale-but-UNIQUE insight (a real failure mode today) and demotes the fresh-but-REDUNDANT restatement (real bloat today), wiring the unwired LLM "DUPLICATE" intuition into a deterministic gate.
- **MISMATCH / RISK** — GUARDS: (1) keep `force_keep`/feedback/user types fully exempt; (2) marginal-bits may only PROTECT-from-demote or FLAG-redundant, never sole-delete; (3) ADD a quality/length floor so a junk/garbled low-content memory can't false-protect itself as "novel."
- **CONFIDENCE** — Structural HIGH (the unique-but-stale failure is concrete); literal HIGH (gzip-distance is trivially computable, no embeddings).
- **SMALLEST EXPERIMENT** — `marginalBits(item, restOfStore)`. Extend `planRelocations` with the AND condition. Unit-test three synthetic stores: (1) stale+unique → KEPT (regression vs today's demote), (2) fresh+duplicate → FLAGGED redundant, (3) low-quality-but-lexically-novel → must NOT be protected. Dry-run vs the live root, diff demote-set against FSRS-only baseline.
- **CITATIONS** — [MDL (Wikipedia)](https://en.wikipedia.org/wiki/Minimum_description_length) · [MDL (Scholarpedia)](http://www.scholarpedia.org/article/Minimum_description_length) · [MDL tutorial (Grünwald, Wiley)](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1751-5823.2001.tb00455.x) · [MDL lecture (CMU)](https://www.cs.cmu.edu/~aarti/Class/10704/lec13-MDL.pdf)

---

## 15. Information Bottleneck → relevance-preserving compaction — juice 7 · confidence MEDIUM

- **SOURCE THEORY** — Information Bottleneck (Tishby, Pereira, Bialek 1999) — `min I(T;X) − β·I(T;Y)`.
- **BORROWED MECHANISM** — Trade compression (`I(T;X)`, the token cost) against task-relevance (`I(T;Y)`); β is the single dial between aggressive and relevance-preserving compression.
- **YURI TARGET** — SALIENCE / CONTEXT COMPRESSION — the `/compact` hint and what survives a compaction; secondarily |ΔU| salience.
- **THE TRANSFER** — Score each survival candidate by `ibScore(chunk) = relevanceToObjective(chunk) − β·tokenCost(chunk)`. CRITICAL FIX: for Marcel's parallel-branch style the relevance aggregator must be MAX-POOL over live objectives — `relevance = max_i overlap(chunk, goal_i + open_claims_i)` — NOT a union/sum, which dilutes and starves narrow-but-critical facts. β is the one honest tunable, exposed in the cockpit. Same `ibScore` re-gates salience: a |ΔU| spike with max-pool relevance ≈ 0 is noise, demoted below the median+K·MAD band.
- **MISMATCH / RISK** — Name it honestly as "rate-distortion with a task-relevance distortion," NOT literal mutual-information IB (we are not computing MI). Ship advisory, with an empty-objective graceful-degenerate guardrail = today's self-information baseline. Never auto-drop operator-pinned context.
- **CONFIDENCE** — Structural HIGH (the relevance/cost tradeoff is exactly the compaction problem); literal MEDIUM (it's the rate-distortion analogue, not true IB).
- **SMALLEST EXPERIMENT** — `ibScore(chunk) = relevanceToObjective(chunk, goalSpine+openClaims) − β·tokenCost(chunk)`, relevance via FTS5/BM25. A/B two compaction hints on a real long transcript (self-information-only vs IB); sweep β and eyeball the relevance/size curve. Guardrail test: empty objective → IB output equals the self-information baseline.
- **CITATIONS** — [Information bottleneck (Wikipedia)](https://en.wikipedia.org/wiki/Information_bottleneck_method) · [Original IB (arXiv physics/0004057)](https://arxiv.org/abs/physics/0004057) · [Deep learning & IB (arXiv 1503.02406)](https://arxiv.org/pdf/1503.02406) · [Rate-distortion (Wikipedia)](https://en.wikipedia.org/wiki/Rate%E2%80%93distortion_theory)

---

## 16. Percolation / articulation-point analysis → structural-fragility veto — juice 7 · confidence MEDIUM

- **SOURCE THEORY** — Percolation / giant-component theory (Erdős–Rényi), applied as deterministic connected-component + articulation-point/bridge analysis.
- **BORROWED MECHANISM** — Tarjan articulation points and bridges: the exact nodes/edges whose removal disconnects the graph; a robustness curve that removes high-betweenness edges until the giant component fractures.
- **YURI TARGET** — ARCHITECTURE GRAPH (`yuri-graph-state.json`), via visual-introspection.
- **THE TRANSFER** — After deduplicating multi-edges to a simple undirected graph, compute (a) #components + giant-component fraction, (b) Tarjan articulation points and bridges, (c) a robustness curve. Wire it as a STRUCTURAL VETO: any proposed merge or dead-end-elimination that creates a NEW articulation point or drops giant-fraction below a configured floor (e.g. 0.95) is vetoed, not just flagged. On the live graph today this surfaces 19 cut vertices and 50 bridges the current skill is blind to.
- **MISMATCH / RISK** — Distinct from card 4 (spectral): that one finds COMMUNITIES via eigenvectors, this finds CUT POINTS via Tarjan (no eigensolver). Drop the ER `c=1` "4.4× margin" headline — intuition-only and mis-computed on raw edges (true mean degree 3.37 after deduping 64 multi-edges); keep c=1 only as a one-line sanity baseline. Scope the claim to reachability/fragility, not "graph health."
- **CONFIDENCE** — Structural HIGH; literal MEDIUM (the symmetric-undirected reduction discards directionality; whitelist designed chokes before vetoing).
- **SMALLEST EXPERIMENT** — Load graph-state; compute mean degree + ratio to c=1, giant-component fraction (≈1.0 today), and a robustness curve removing highest-betweenness edges until the giant component drops below 0.9·N. Cross-check against the 8 `upgrades_pending` and any proposed merge: assert no proposed edge removal drops giant-fraction below the floor. Flag any merge that creates an articulation point as a structural-floor veto candidate.
- **CITATIONS** — [Percolation theory (Wikipedia)](https://en.wikipedia.org/wiki/Percolation_theory) · [Erdős–Rényi giant component (Wikipedia)](https://en.wikipedia.org/wiki/Erd%C5%91s%E2%80%93R%C3%A9nyi_model) · [Biconnected components / Tarjan (Wikipedia)](https://en.wikipedia.org/wiki/Biconnected_component)

---

## 17. Discrete Ricci curvature → brittle-bridge edge ranking — juice 7 · confidence MEDIUM

- **SOURCE THEORY** — Discrete Ricci curvature on graphs (Forman-Ricci / balanced-Forman; over-squashing theory).
- **BORROWED MECHANISM** — Triangle-aware edge curvature: `Ric(uv) = 2/deg(u) + 2/deg(v) − 2 + (triangle/4-cycle redundancy)`; strongly-negative curvature at LOW-degree endpoints marks a no-alternate-path bridge that a plain degree-sort cannot see.
- **YURI TARGET** — ARCHITECTURE GRAPH.
- **THE TRANSFER** — Ship `computeBalancedFormanCurvature()` over the graph — NOT the simple `2−deg(u)−deg(v)` form (proven to degenerate to degree-sort: 10/10 top edges MEMORY-touching). Use the triangle-aware balanced form where `tri=0` marks a true bridge. Rank all 273 edges ascending; the most-negative LOW-degree-endpoint edges (e.g. `HOOK_PIPELINE→PULSE_BUS`, tri=0) are the brittle architectural bridges. Feed flagged edges as an upstream HIGH/CRITICAL signal into GitNexus impact analysis and as "where the architecture wants a new return/feedback edge" rewiring targets (Topping arXiv:2111.14522).
- **MISMATCH / RISK** — Distinct from cards 4/16: curvature ranks EDGE brittleness, not communities or cut-points. Synthesize edge weights from the existing `type` field (only 1/273 carries `strength`). Drop the "cross-validate against Cheeger card-2" coupling — fold the validation into the spectral card instead.
- **CONFIDENCE** — Structural HIGH (over-squashing/bottleneck theory maps cleanly to architecture brittleness); literal MEDIUM (edge-weight synthesis is a modeling choice).
- **SMALLEST EXPERIMENT** — Smallest real build, no linear algebra. Node script: per edge compute weighted Forman-Ricci (incorporate edge weight, two vertex weights, incident-edge sets excluding e), vertex weight = inverse-degree so the hub doesn't swamp. Sort ascending, report the 10 most-negative edges as brittle bridges with endpoints and types. Cross-check that the spectral Cheeger bottleneck edges appear among the most-negative Forman edges — mutual validation.
- **CITATIONS** — [Over-squashing & Ricci curvature (Topping, arXiv 2111.14522)](https://arxiv.org/pdf/2111.14522) · [Forman-Ricci on networks (arXiv 1605.04662)](https://arxiv.org/pdf/1605.04662) · [Over-squashing & graph curvature (X engineering)](https://blog.x.com/engineering/en_us/topics/insights/2022/over-squashing--bottlenecks--and-graph-ricci-curvature)

---

## 18. Cox Proportional Hazards → per-class evidence aging — juice 7 · confidence HIGH

- **SOURCE THEORY** — Cox Proportional Hazards (survival analysis) — `h(t|x) = h₀(t)·exp(β·x)`.
- **BORROWED MECHANISM** — A baseline hazard scaled by `exp(β·covariates)`, where β is LEARNABLE from observed failure events via partial likelihood — letting different covariate classes age at data-driven rates.
- **YURI TARGET** — ENERGY GATE (`evalStaleness` in `yuri-energy.mjs`).
- **THE TRANSFER** — Replace the flat `confidenceDecay = base·0.5^(age/halfLife)` (ONE halfLife for ALL evidence) with proportional-hazards staleness: `effective decay rate = baseRate·exp(β·covariates)`. A live-runtime-verified MATCH ages slowly; a council-text "verified_fact" or happy-path-test claim ages FAST (per PROSE-NOT-OUTRUN-WIRING). The `ζ·staleness` term in `computeU` then rises faster for the evidence classes YURI already distrusts. Crucially β is LEARNABLE: each "verified" claim later proved wrong is a failure event — fit `exp(β)` by partial likelihood over the energy-trace. **This is the first weight in the whole energy fn that could stop being hand-tuned.**
- **MISMATCH / RISK** — Needs enough observed (verified→falsified) event pairs in the trace to identify β; until then, hardcode 3 multipliers as a sane prior.
- **CONFIDENCE** — Structural HIGH (per-class aging is a clean, motivated upgrade); literal HIGH (Cox is well-understood, partial likelihood is standard).
- **SMALLEST EXPERIMENT** — `hazardMultiplier(covariates)` keyed on `evidence.sourceClass`. Hardcode runtime=0.3, test=1.0, council_text=3.0. Run the existing worked-example with mixed-class evidence; assert the council-text-heavy state crosses the reject threshold at a YOUNGER age than the runtime-heavy state. Separately scrape the trace for (verified t0, falsified t1) pairs and fit a single β by partial likelihood as a proof-of-identifiability spike — even n=20 shows whether data moves β off the hand-set value.
- **CITATIONS** — [Proportional hazards model (Wikipedia)](https://en.wikipedia.org/wiki/Proportional_hazards_model) · [Cox PH model (ScienceDirect)](https://www.sciencedirect.com/topics/mathematics/cox-proportional-hazards-model) · [Cox regression (MathWorks)](https://www.mathworks.com/help/stats/cox-proportional-hazard-regression.html)

---

## 19. Weibull / bathtub burn-in → claim probation ceiling — juice 7 · confidence HIGH

- **SOURCE THEORY** — Weibull hazard / bathtub curve (reliability engineering) — as a probation/burn-in policy prior, NOT a fitted Weibull.
- **BORROWED MECHANISM** — The infant-mortality (left) tail: new items carry elevated failure risk until they survive a burn-in window or accumulate independent corroboration — so trust is CAPPED early regardless of an optimistic point estimate.
- **YURI TARGET** — CLAIM CORTEX.
- **THE TRANSFER** — Add a left-tail PROBATION CEILING. Add `createdAtMs` to the claim record and require `independentConfirmations` to carry a SOURCE/lane id. In `evidenceStatusRank`, cap the reachable rung BELOW `trusted` while in burn-in — it clears probation only on (age > `burnInWindow` with zero contradicting read/RETRACT) OR (≥ N corroborations from DISTINCT sources, not distinct run-ids). Keep it a CEILING so the claim stays usable at `operator_validated` during probation (defuses DELIVER-DONT-DEFER).
- **MISMATCH / RISK** — Do NOT re-implement the wear-out demote — evidence decay (card 18) already does the right tail. This is strictly the LEFT tail. `burnInWindow` + N live in `energy-weights.json`.
- **CONFIDENCE** — Structural HIGH (infant-mortality of fresh single-source claims is real); literal HIGH (it's a policy ceiling, not a fitted distribution).
- **SMALLEST EXPERIMENT** — Add `createdAtMs` + `independentConfirmations`. `trustCeiling(claim)` = top-rank capped unless (confirmations ≥ 2) OR (age > burnInWindow). Unit test: a claim asserted `verified_fact` by one lane at t=0 with 0 confirmations CANNOT reach trusted (capped by infant-mortality); the same claim after 2 independent-SOURCE corroborations OR a clean burn-in window promotes. Confirm it composes with card 18's wear-out aging.
- **CITATIONS** — [Hazard functions / bathtub (Minitab)](https://support.minitab.com/en-us/minitab/help-and-how-to/statistical-modeling/reliability/supporting-topics/distribution-models/hazard-functions/) · [Weibull & bathtub (TIBCO)](https://docs.tibco.com/pub/stat/14.0.0/doc/html/UsersGuide/GUID-E94B660B-73EC-47E7-A4B2-A084AFBC09D5.html) · [Bathtub hazard models (Hindawi)](https://www.hindawi.com/journals/as/2014/304724/)

---

## 20. Byzantine Fault Tolerance / quorum intersection → agreement-gated promotion — juice 7 · confidence MEDIUM

- **SOURCE THEORY** — Byzantine Fault Tolerance — quorum intersection (PBFT n=3f+1, quorum 2f+1; weighted/Byzantine-power<1/3 variant).
- **BORROWED MECHANISM** — Require an agreement margin large enough that any two passing verdicts must share an honest witness; with weighted voting, give a runtime-grounded verifier disproportionate power and require Byzantine-power < 1/3.
- **YURI TARGET** — MULTI-LANE CONSENSUS (`yuri-council-claim-evidence`).
- **THE TRANSFER** — Ingest M advisories at once, semantically cluster claims across sources (conservative/high-similarity only, each cluster tagged with clustering-confidence), stamp every cluster with `agreement_count` and `quorum_met=(count ≥ 2f+1 of 3f+1)`. A claim is eligible for sanitized-promotion ONLY if `quorum_met`. Use the WEIGHTED form as primary (LLM lanes correlated): the one local-evidence verifier anchors each quorum.
- **MISMATCH / RISK** — Be brutally honest: with 3 lanes f=0 (no Byzantine tolerance — degrades to "more than one lane agreed," still strictly better than today's zero reconciliation); real f=1 needs 4 lanes / 3-agree. Carry a mandatory `correlation_caveat` (lanes are NOT independent witnesses; effective f < node count). Distinct from cards 3/6/10/24: this is a hard COUNT-threshold gate, not a weighted merge or a learned trust vector. Necessary-not-sufficient: even a unanimous quorum stays advisory; local deterministic evidence overrides.
- **CONFIDENCE** — Structural MEDIUM (the lone-hallucinator kill is real, but correlation undercuts the witness-intersection guarantee); literal MEDIUM (f=0 on the current roster).
- **SMALLEST EXPERIMENT** — Ingest M advisory files, semantically cluster, tag `agreement_count`/`quorum_met`. Test with 4 synthetic advisories where 1 is adversarial: assert the false claim FAILS quorum (1/4) and stays out of promotion, while a genuine 3/4 claim passes the gate but carries `advisory_only=true`. Add a correlation-caveat field so the report never claims independence it lacks.
- **CITATIONS** — [3f+1 rule (Chainscore)](https://chainscorelabs.com/glossary/blockchain-consensus-mechanisms/byzantine-fault-tolerance/3f1-rule) · [PBFT explainer (Cube)](https://www.cube.exchange/what-is/pbft-practical-byzantine-fault-tolerance) · [Weighted BFT (arXiv 2504.14668)](https://arxiv.org/pdf/2504.14668)

---

## 21. Dempster-Shafer evidence theory → ignorance vs conflict separation — juice 7 · confidence HIGH

- **SOURCE THEORY** — Dempster-Shafer evidence theory (belief mass over the power set; Bel/Pl bounds; ignorance as mass on Θ; conflict factor K; Yager's conflict-to-Θ rule).
- **BORROWED MECHANISM** — Two orthogonal axes the cortex lacks: `ignoranceGap = Pl − Bel` (pure not-knowing) and `conflictK` (source disagreement), combined by Yager's rule (dump K onto Θ, NEVER renormalize by 1/(1−K) — the Zadeh failure).
- **YURI TARGET** — CLAIM CORTEX.
- **THE TRANSFER** — Add an evidence-POLARITY field (`supports | refutes`) to the schema FIRST — without it conflict K is identically 0 and the transfer is inert. Then `massBeliefVector(records)` over CONTIGUOUS rung-intervals returns `{bel, pl, ignoranceGap, conflictK}`: supporting records mass on `[ceiling-interval]`, refuting records on the DISJOINT complement, leftover mass on Θ. This gives the gate `ignoranceGap` (pure not-knowing → HEDGE/EXPLORE) and `conflictK` (disagreement → a new first-class CONTESTED verdict). The REAL collapse this fixes: fixtures with two-agreeing-fresh-runtime vs one-supporting+one-refuting are today byte-identical (ASSERT, U=−0.301738193, identical posterior); D-S separates them (low-K ASSERT vs high-K CONTESTED).
- **MISMATCH / RISK** — Ships as an additive observability axis alongside `maxLadderInversion`; NO wiring into the enforcing gate until the owner-gated max-severity core change lands.
- **CONFIDENCE** — Structural HIGH (the ignorance≠conflict distinction is a genuine cortex blind spot, verified in code); literal HIGH (Yager's rule is well-specified once polarity exists).
- **SMALLEST EXPERIMENT** — Scratch `massBeliefVector(records)`. Three fixtures sharing the SAME `beliefWidth`: (A) zero evidence, (B) two agreeing fresh tests, (C) one fresh passing test + one fresh failing runtime_trace. Assert today's `beliefVector` gives A and C indistinguishable posteriors, then assert D-S separates them: A → high ignoranceGap/low K, B → low gap/low K, C → low gap/HIGH K. Show CONTESTED fires only on C.
- **CITATIONS** — [Dempster-Shafer theory (Wikipedia)](https://en.wikipedia.org/wiki/Dempster%E2%80%93Shafer_theory) · [D-S overview (Berkeley)](https://www.stat.berkeley.edu/~aldous/Real_World/dempster_shafer.pdf) · [D-S combination review (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7274694/)

---

## 22. Model Predictive Control → receding-horizon plan feasibility — juice 6 · confidence MEDIUM

- **SOURCE THEORY** — Model Predictive Control (Mayne et al. 2000) — receding-horizon + terminal-invariant-set recursive feasibility.
- **BORROWED MECHANISM** — Look H steps ahead through a model, reject the whole plan if any predicted step violates a constraint or the terminal state has no feasible continuation, commit only the first step, then re-plan on the real result.
- **YURI TARGET** — ARCHITECTURE GRAPH — the graph-plan executor (NOT the offload router).
- **THE TRANSFER** — Before committing a multi-node graph-plan, fold a PURPOSE-BUILT plan-state model H=2-3 steps along the dependency DAG — predicting per node: protected-path touches, ladder inversions, and whether a VERIFIED descending continuation remains reachable in `yuri-graph-state`. Reject the plan if any predicted node violates a floor OR the terminal node is a dead-end (the terminal-invariant-set analog = "plan must end where a verified continuation exists"). Commit only the first node, re-plan on its real verified result.
- **MISMATCH / RISK** — Frame as discrete receding-horizon tree-search over the DAG, NOT convex MPC. Do NOT route through `applyTransition` (wrong state model) or `offload-contract` (not energy-gated). HARD PREREQUISITE: a real graph-plan-state transition function must be built first — it does not exist today.
- **CONFIDENCE** — Structural HIGH (myopic-gate compounding error is real); literal MEDIUM (the plan-state model is a non-trivial new build).
- **SMALLEST EXPERIMENT** — `planHorizon(currentState, candidatePlan, H)` folds the transition H steps, returns the ΔU trajectory + feasibility flag. Construct a 3-step plan where step 1 has ΔU<0 but step 3 forces a violation; confirm the myopic gate accepts step 1 while the horizon planner rejects the whole plan. Cap H=3, add a terminal check, show re-planning after a wrong step-1 outcome recovers.
- **CITATIONS** — [Receding-horizon control (ScienceDirect)](https://www.sciencedirect.com/topics/engineering/receding-horizon-control) · [Constrained MPC stability (arXiv 1207.0788)](https://arxiv.org/pdf/1207.0788) · [What is MPC (MathWorks)](https://www.mathworks.com/help/mpc/gs/what-is-mpc.html)

---

## 23. Observability / detectability rank test → evidence-channel reachability — juice 6 · confidence LOW

- **SOURCE THEORY** — Observability / detectability (linear control: PBH rank test; unobservable subspace; detectability = unobservable modes are stable).
- **BORROWED MECHANISM** — Before trusting a measurement, test whether the available output CHANNELS can even reach the claimed state — if not, the state is unobservable regardless of the reading.
- **YURI TARGET** — CLAIM CORTEX.
- **THE TRANSFER** — Alongside `evidenceStatusRank(records-present)`, compute `reachableCeiling(availableEvidenceKinds)` by saturating the context's channel set through the SAME composition logic. When `claimedRank > reachableCeiling`, emit a distinct UNOBSERVABLE verdict carrying the missing-channel witness (which kind is absent) — routing to escalate-to-human/different-lane instead of the RETRACT/VERIFY-FIRST a records-thin-but-reachable claim gets. Gate the escalation on a detectability analogue: skip it when the unobservable claim is low-stakes and FSRS-ages-out harmlessly (a stable unobservable mode).
- **MISMATCH / RISK** — It's the rank-test INSIGHT, not Gramian math; name it "evidence-channel reachability," not "observability." Overlaps card 8's necessity test conceptually — keep distinct: this is about MISSING channels, card 8 about present-record load-bearing-ness.
- **CONFIDENCE** — Structural MEDIUM (the can't-ever-verify-here vs just-not-yet-verified distinction is useful); literal LOW (the control-theory mapping is loose).
- **SMALLEST EXPERIMENT** — `isReachable(claimedRank, availableEvidenceKinds)` using the existing `EVIDENCE_CEILING`: compute the max rung the available kinds COULD justify; if `claimedRank` exceeds it, emit UNOBSERVABLE. Test with a `trusted` claim where operator_note is unavailable (unreachable) vs a `runtime_tested` claim with a test kind available but not run (reachable, just VERIFY-FIRST). Confirm the two route differently — escalate vs go-verify.
- **CITATIONS** — [Controllability & observability (Wikibooks)](https://en.wikibooks.org/wiki/Control_Systems/Controllability_and_Observability) · [Observability Gramian (Grokipedia)](https://grokipedia.com/page/observability_gramian) · [Observability analysis (arXiv 2201.04186)](https://arxiv.org/pdf/2201.04186)

---

## 24. Bregman divergence / mirror descent → swappable, trust-weighted drift metric — juice 6 · confidence HIGH

- **SOURCE THEORY** — Bregman divergence / mirror descent (generalized convex-potential divergence; KL = Bregman of negative entropy).
- **BORROWED MECHANISM** — A divergence family parameterized by a convex potential ψ — choosing ψ lets you weight the drift metric by where in state-space the error lives, while staying finite at zero support.
- **YURI TARGET** — ENERGY GATE (the `klDivergence` drift term in `computeU`, `yuri-energy.mjs` ~342-366).
- **THE TRANSFER** — Generalize the drift term from hardcoded KL to a swappable Bregman potential ψ: add `bregmanDivergence(p,q,ψ)` to `math-kernel.mjs` with `ψ ∈ {negEntropy (MUST reproduce klDivergence to the digit — the regression canary), mahalanobis(W)}`. The one real NEW capability: `ψ = ½(x−y)ᵀW(x−y)` with W scaled by ladder-rung trust, so over-claim drift on trusted/runtime_tested rungs is penalized harder than on research rungs — a finite-at-zero metric that sidesteps the `clampDistribution` hole while staying tunable.
- **MISMATCH / RISK** — DROP `halfSqEuclid` as a production option (symmetric = wrong for over-claim). Before building, sanity-check whether plain per-rung scaling of `w.beta` gets 80% of this at 10% the code — if it does, Bregman is nice-to-have, not load-bearing.
- **CONFIDENCE** — Structural MEDIUM (the trust-weighted-drift idea is good, but partly reachable by simpler per-rung scaling); literal HIGH (Bregman is clean, the negEntropy canary is exact).
- **SMALLEST EXPERIMENT** — Add `bregmanDivergence(p, q, ψ)` with the three ψ options. Property-test: `bregman(negEntropy) === klDivergence` on 50 random simplex pairs. Run `computeU` on the veto-mismatch + infogain-buyback fixtures with mahalanobis ψ weighting trusted-rung drift 5×; confirm it raises U strictly MORE than KL on known over-claim fixtures while staying finite on zero-support adversarial cases. ~120 lines.
- **CITATIONS** — [Online mirror descent I — Bregman (parameterfree)](https://parameterfree.com/2019/09/26/online-mirror-descent-i-bregman-version/) · [Bregman projections & mirror descent (Trevisan)](https://lucatrevisan.wordpress.com/2019/05/20/online-optimization-post-5-bregman-projections-and-mirror-descent/)

---

## 25. Fisher information / Beta credible interval → width-aware over-claim test — juice 6 · confidence MEDIUM

- **SOURCE THEORY** — Fisher / observed information (curvature of the log-likelihood = how tightly data pins a parameter), with a Beta-posterior credible interval as the small-sample-honest stand-in.
- **BORROWED MECHANISM** — Confidence as an INTERVAL that narrows as ~1/√(evidence count), and an over-claim test that reads the interval's LOWER BOUND, not the point estimate.
- **YURI TARGET** — SELF-CALIBRATION — confidence as an interval feeding the gate's α/ε terms.
- **THE TRANSFER** — Don't sell it as "add a spread" (we have `beliefWidth`) or as Fisher info (no smooth likelihood; bad at n=1-2). Sell it as: ROUTE THE EXISTING BELIEF WIDTH INTO THE OVER-CLAIM DECISION via a Beta credible interval. `claimCredibleInterval(claim)`: fresh corroborating evidence (weighted by ladder-ceiling) → Beta a-counts, contradicting/stale → b-counts, return `{mean, lowerBound = ppf(0.05)}`. Redefine the inversion the floor reads as `claimedRank > rankImpliedBy(lowerBound)` instead of `> evidenceRank(point)`. Effect: a thin-evidence claim at mean-rank R trips the inversion (lowerBound below R), an identically-mean'd 5-record claim does not — the fragile-0.8-vs-robust-0.8 distinction the gate is blind to.
- **MISMATCH / RISK** — Wire as a NEW emitted-not-consumed cortex signal OR'd onto the identity veto; keep it OUT of `computeU`'s θ term until the owner reviews the pseudo-count model. MANDATORY: inherit the `claimedRank ≤ RANK_RESEARCH` hypothesis exemption (line 382) so width-aware vetoing never punishes legitimate EXPLORE divergence.
- **CONFIDENCE** — Structural HIGH (the fragile-vs-robust-same-mean blindness is real); literal MEDIUM (the pseudo-count mapping is a modeling choice).
- **SMALLEST EXPERIMENT** — `claimCredibleInterval(claim)`: map records to Beta(a,b), return mean ± 95% CI. Assert same point-mean 0.8 yields a NARROW interval under 5 corroborating records and a WIDE one under 1 advisory. Redefine over-claim as `claimedRank > rankImpliedBy(mean − halfCI)`; unit-test that a thin-evidence 0.8 trips the inversion where a well-corroborated 0.8 does not.
- **CITATIONS** — [Fisher information (Wikipedia)](https://en.wikipedia.org/wiki/Fisher_information) · [Fisher info notes (Minnesota)](https://www.stat.umn.edu/geyer/s06/5102/notes/fish.pdf) · [Fisher info via particle filter (King)](https://kingaa.github.io/sbied/pfilter/fisherSE.html) · [Fisher info tutorial (arXiv 1705.01064)](https://arxiv.org/pdf/1705.01064)

---

## 26. Peer prediction / robust BTS → sycophancy-and-outlier detector — juice 6 · confidence MEDIUM

- **SOURCE THEORY** — Peer Prediction / Robust Bayesian Truth Serum (Prelec 2004; Witkowski-Parkes 2012; Correlated Agreement, arXiv:1603.03151).
- **BORROWED MECHANISM** — Score each reporter by information (agreement-beyond-chance with peers) + prediction (calibration of its forecast of others) over a BATCH of questions — rewarding informative deviation, penalizing both mirroring and lonely miscalibration.
- **YURI TARGET** — MULTI-LANE CONSENSUS.
- **THE TRANSFER** — A SYCOPHANCY-AND-OUTLIER detector (NOT a truth oracle). Require each advisory to carry, per claim, the lane's own probability AND its prediction of how many OTHER lanes assert it (the BTS prediction report). Emit a per-lane advisory weight that flags mirror-lanes (high agreement, no informative deviation) and lonely-hallucinators (outlier, miscalibrated).
- **MISMATCH / RISK** — HARD-GATE: (1) advisory_only stays true; the score may never promote past `research` rung — the local verifier is sole promotion authority. (2) MANDATORY lane-diversity guard — same-prior lanes reward correlated hallucination as agreement (the documented uninformative-equilibrium failure); detect shared-base-model lanes and down-weight with a diagnostic. Distinct from card 6 (Hedge learns trust from verified outcomes); this scores from PEER STRUCTURE without ground truth.
- **CONFIDENCE** — Structural MEDIUM (sycophancy detection is valuable, but the shared-prior failure is a sharp limit); literal MEDIUM (BTS needs a prediction report the lanes don't emit today).
- **SMALLEST EXPERIMENT** — Require each advisory to carry per-claim probability + prediction of others. Compute a robust-BTS info+prediction score per lane over a batch. Test with a 3-lane fixture where A is honestly-informative, B mirrors consensus, C is a contrarian hallucinator; assert A>B>C, AND assert the score collapses to ~uniform when all three reports are identical (shared-prior failure made visible).
- **CITATIONS** — [Robust BTS (AAAI)](https://cdn.aaai.org/ojs/8261/8261-13-11789-1-2-20201228.pdf) · [Correlated Agreement (arXiv 1603.03151)](https://arxiv.org/pdf/1603.03151) · [Peer prediction (AAMAS)](https://www.ifaamas.org/Proceedings/aamas2014/aamas/p245.pdf)

---

## 27. Logarithmic Market Scoring Rule → bounded per-lane calibration ledger — juice 6 · confidence MEDIUM

- **SOURCE THEORY** — Logarithmic Market Scoring Rule (Hanson 2003) — strictly-proper log scoring, marginal increment `b·ln(r_new/r_old)`, worst-case subsidy bounded by `b·ln(N)`.
- **BORROWED MECHANISM** — A strictly-proper scoring rule where each belief-revision earns the marginal log-mass it added to the rung that resolved true; moving a belief confidently the WRONG way costs more than it gains (log asymmetry), total subsidy bounded.
- **YURI TARGET** — SELF-CALIBRATION.
- **THE TRANSFER** — `lmsrIncrement(beliefBefore, beliefAfter, resolvedRung, b) = b·(ln beliefAfter[resolvedRung] − ln beliefBefore[resolvedRung])` in `math-kernel.mjs`, operating on the cortex's existing 7-rung `beliefVector`. Log each confidence revision keyed by lane as a single NET move per lane per claim (merge repeat same-lane edits — hard precondition for the bound); on a claim settling at runtime_tested+, credit each lane the marginal log-mass it added to the rung that resolved true. Result: a bounded (`Σ ≤ b·ln(7)`), strictly-proper, per-lane calibration ledger where overconfidence self-corrects per-contributor.
- **MISMATCH / RISK** — Apply ONLY to claims that RESOLVE; route unresolved/deprecated claims to FSRS decay. The bound requires merging same-lane edits into one net move.
- **CONFIDENCE** — Structural HIGH (proper scoring + bounded subsidy is exactly right for per-contributor calibration); literal MEDIUM (depends on a resolution signal and net-move bookkeeping).
- **SMALLEST EXPERIMENT** — `lmsrIncrement(pBefore, pAfter, b)` next to brierScore/logLoss, with the proper-scoring invariant test (truthful posterior maximizes expected increment) + the `b·ln(N)` bound test. In claim-cortex, log marginal LMSR credit per revision keyed by lane; on resolution settle the chain. Assert a lane that pushed toward the resolved truth nets positive; one that pushed confidently wrong nets a LARGER-magnitude penalty (log asymmetry); total subsidy ≤ b·ln(7).
- **CITATIONS** — [Market scoring rules (Hanson)](https://mason.gmu.edu/~rhanson/mktscore.pdf) · [MSR as opinion pools (NeurIPS)](http://papers.neurips.cc/paper/5840-market-scoring-rules-act-as-opinion-pools-for-risk-averse-agents.pdf) · [LMSR explainer (Cultivate Labs)](https://www.cultivatelabs.com/crowdsourced-forecasting-guide/how-does-logarithmic-market-scoring-rule-lmsr-work)

---

## 28. Maximum Entropy Principle → auditable, magic-constant-free belief prior — juice 6 · confidence HIGH

- **SOURCE THEORY** — Maximum Entropy Principle (Jaynes 1957) — least-biased distribution = max-entropy distribution satisfying known moment constraints; `p_i ∝ exp(Σ λ_k f_k(i))`.
- **BORROWED MECHANISM** — Given only a mean constraint, the least-assuming distribution is the exponential-family MaxEnt one; its spread FALLS OUT of λ + the support rather than being hand-set.
- **YURI TARGET** — CLAIM CORTEX.
- **THE TRANSFER** — `maxEntBelief(meanRank, supportSize)` in `math-kernel.mjs`: solve `p_i ∝ exp(λ·i)` by a 1-D Newton step on λ to hit `Σ i·p_i = meanRank`, keep the 1e-9 clamp. Swap it behind `beliefVector` (prior = MaxEnt at claimedRank, posterior = MaxEnt at evidenceRank), retiring the unjustified `beliefWidth = LADDER_N/(2(n+1))` constant — width now derives from λ. Net: the relative ε/info-gain credit across claims becomes MaxEnt-principled rather than an artifact of a hand-tuned law. **MaxEnt makes the assumptions AUDITABLE, not absent.**
- **MISMATCH / RISK** — Honest framing: this hardens the ALREADY-bounded info-gain term's relative ordering and removes a magic constant — it does NOT fix a broken energy (the `infoGainCeiling` log(n) normalization already caps shape-leak). If an independent width knob is later wanted, add a variance-over-rungs constraint (one explicit named choice).
- **CONFIDENCE** — Structural HIGH (replacing a magic constant with a principled prior is a clean win); literal HIGH (1-D Newton on a 6-rung support is trivial and stable).
- **SMALLEST EXPERIMENT** — `maxEntBelief(meanRank, support)` returning `p_i ∝ exp(λ·i)` with λ Newton-solved. Swap behind `beliefVector` in a test fork. Verify: (1) `entropy(maxEntBelief) ≥ entropy(currentGaussianBelief)` at matched mean (MaxEnt is entropy-maximal for its constraint — if not, the impl is wrong); (2) re-run the worked-example and confirm a sharp evidence-confirmed claim yields MORE [0,1]-normalized info-gain because its prior is now genuinely diffuse.
- **CITATIONS** — [Maximum entropy (Wikipedia)](https://en.wikipedia.org/wiki/Principle_of_maximum_entropy) · [Jaynes MaxEnt (Bretthorst archive)](https://bayes.wustl.edu/etj/articles/theory.1.pdf) · [MaxEnt notes (Stanford)](https://web.stanford.edu/~montanar/RESEARCH/BOOK/partA.pdf)

---

## 29. Renewal theory (renewal-reward + inspection paradox) → rate-based memory durability — juice 6 · confidence MEDIUM

- **SOURCE THEORY** — Renewal theory — renewal-reward theorem (`rate = E[reward]/E[cycle]`) + inspection paradox / length-biased sampling.
- **BORROWED MECHANISM** — Frequency-per-time (a rate) is the real consolidation signal, not raw count; and the AGE observed at a fixed look-time is stochastically LARGER than a typical gap (length bias), so naive age-based demotion is biased.
- **YURI TARGET** — MEMORY GOVERNANCE.
- **THE TRANSFER** — SHIP Half 1, FENCE Half 2. (1) Replace `effectiveStability`'s `freq·log1p(useCount)` with a renewal-RATE term: `r = useCount / max(elapsedDays, minWindow)`, boost S by `freq·log1p(r·SCALE)` so frequency-per-time drives durability — from the existing usage index, no new logging, with an mtime-prior fallback for items with <4 recalls. (2) Inspection-paradox debias of current AGE `A(t)=daysSinceUse`, applied ONLY behind a STATIONARITY GUARD — apply the expected-residual credit ONLY when the recall pattern looks stationary; for absorbing/shipped-project memories (gaps blowing up, hot-then-cold) SKIP the correction so it can't rescue dead memories.
- **MISMATCH / RISK** — Without the stationarity guard, the debias rescues dead memories — drop Half 2 and ship Half 1 alone (the rate-based stability fix is the high-leverage, low-risk win).
- **CONFIDENCE** — Structural HIGH for Half 1 (rate beats count for consolidation); literal MEDIUM (Half 2's debias is risky without the guard).
- **SMALLEST EXPERIMENT** — From the recall ledger compute per-slug inter-recall gaps; for items with ≥4 recalls estimate rate r. A/B `planRelocations` with `log1p(useCount)` vs renewal-rate stability; diff demote sets — flag any item demoted under the old path but kept under renewal-rate (the length-bias false-positives). Require ≥4 cycles before trusting the estimate; below that assert fallback to the mtime prior. Read-only diff first.
- **CITATIONS** — [Renewal theory (Wikipedia)](https://en.wikipedia.org/wiki/Renewal_theory) · [Renewal-reward notes (Columbia)](https://www.columbia.edu/~ks20/4106-18-Fall/Notes-RRT.pdf) · [Residual/inspection paradox (Grokipedia)](https://grokipedia.com/page/residual_time)

---

## 30. Hopfield capacity bound (AGS) → hot-tier saturation probe — juice 5 · confidence LOW

- **SOURCE THEORY** — Hopfield associative memory — Amit-Gutfreund-Sompolinsky storage-capacity bound (`P_max ≈ 0.138·N` before crosstalk produces spurious attractors).
- **BORROWED MECHANISM** — Past an interference threshold, mutual crosstalk between stored patterns degrades recall super-linearly — saturation is governed by interference, not just per-item decay.
- **YURI TARGET** — MEMORY GOVERNANCE.
- **THE TRANSFER** — Add a deterministic HOT-TIER SATURATION PROBE governed by mutual-interference. Honest build: (1) a tiny token→shared-vocab tf vectorizer over MEMORY.md hot entries (embedding-free, ~30 lines) OR Jaccard over token-sets (no shared coordinate space needed); (2) pairwise overlap across hot entries; `load = (count of pairs above an overlap threshold)/N`; (3) flag "over-capacity → consolidate/dedup before recall degrades" when load crosses an EMPIRICALLY-CALIBRATED threshold; (4) surface the most-overlapping pairs as deterministic merge candidates, DOWNGRADING the LLM-eyeball pass in `kagami-memory-consolidator.mjs:80-86` from primary detector to tie-breaker.
- **MISMATCH / RISK** — Do NOT hard-code 0.138 (cite AGS only as the structural justification for super-linear degradation, then tune the knob against observed recall quality). PARK the Hopfield pattern-completion mechanism — blocked by the embedding-free constraint until revisited.
- **CONFIDENCE** — Structural MEDIUM (interference-saturation is a real governance lens); literal LOW (the 0.138 constant does not transfer; the recall mechanism isn't a Hopfield net).
- **SMALLEST EXPERIMENT** — Hot-tier saturation probe: pairwise overlap (Jaccard or tf-cosine) across hot MEMORY.md entries, estimate `load = high-overlap-pairs/N`. If load exceeds a tuned threshold, flag "over-capacity → consolidate" and surface the most-overlapping pairs as merge candidates. Do NOT build the Hopfield net (violates embedding-free constraint); log pattern-completion as a parked branch.
- **CITATIONS** — [Hopfield network (Wikipedia)](https://en.wikipedia.org/wiki/Hopfield_network) · [AGS capacity (Amit-Gutfreund-Sompolinsky, APS)](https://journals.aps.org/pra/abstract/10.1103/PhysRevA.32.1007) · [Storage capacity review (Scholarpedia)](http://www.scholarpedia.org/article/Hopfield_network)

---

## 31. Persistent homology (β₀) → persistence-stable consolidation clustering — juice 5 · confidence MEDIUM

- **SOURCE THEORY** — Persistent homology / TDA — β₀ over a filtration (equivalent to a single-linkage dendrogram barcode).
- **BORROWED MECHANISM** — Sweep a threshold over edge weights via union-find and emit a β₀ persistence diagram: long bars = stable clusters, short isolated bars = coincidence/junk.
- **YURI TARGET** — MEMORY GOVERNANCE (`kagami-memory-consolidator` + `memory-relocator`).
- **THE TRANSFER** — DROP the architecture/β₁ half entirely — category error (β₁=86, not the 12 declared loops) and no edge weight to filter (272/273 edges weightless). KEEP only the memory β₀ half: sweep a threshold over the memory graph's FSRS-recall-strength / co-activation edge weights via union-find; emit the β₀ persistence diagram; persistence-STABLE multi-memory components (long bars) → consolidation candidates with a topological justification; components that split off ALONE early (short, low-persistence) → cold-store candidates with a principled criterion instead of a bare FSRS cutoff.
- **MISMATCH / RISK** — This is single-linkage clustering — you do NOT need ripser/gudhi, just sorted-edge union-find. Don't oversell β₁/β₂ (no governance meaning on a memory graph). NEGATIVE CONTROL: a known-isolated junk memory must surface as a short-lived isolated β₀ bar. Ship as "persistence-stable consolidation clustering," not "TDA of the architecture."
- **CONFIDENCE** — Structural MEDIUM (the persistence-of-clusters lens adds a principled consolidation criterion); literal MEDIUM (it reduces to single-linkage, so the TDA framing is mostly justification).
- **SMALLEST EXPERIMENT** — On the MEMORY subgraph, build a filtration over FSRS recall-strength via union-find, emit the β₀ barcode; feed long-lived multi-memory components to `kagami-memory-consolidator` as consolidation candidates and early-dying components to `memory-relocator` as cold-store candidates. Negative control: inject a known-isolated junk memory and confirm it appears as a short-lived isolated β₀ bar.
- **CITATIONS** — [Betti numbers & persistent homology](https://www.numberanalytics.com/blog/betti-numbers-persistent-homology-deep-dive) · [Persistent homology survey (arXiv 2505.06583)](https://arxiv.org/html/2505.06583v1) · [TDA applications (arXiv 2505.04346)](https://arxiv.org/html/2505.04346v1)

---

## 32. Lagrangian duality / KKT slackness → energy-gate legibility + dead-term prune — juice 5 · confidence MEDIUM

- **SOURCE THEORY** — Lagrangian duality & KKT (shadow prices / complementary slackness).
- **BORROWED MECHANISM** — At a constrained optimum, active constraints carry `λ>0` (shadow price = marginal cost), slack constraints carry `λ=0` — so the empirical activation cost of each term tells you which constraints bind and which are dead weight.
- **YURI TARGET** — ENERGY GATE (the veto weights + claim-cortex per-kind ceilings) + CLAIM CORTEX legibility.
- **THE TRANSFER** — Reinterpret each SOFT structural term in `computeU` as a priced constraint and its already-recorded weighted contribution as an EMPIRICAL activation cost (the trace already serializes `componentContributions` + weights). (a) DUAL READOUT: render every reject as the ranked list of binding constraints and their costs ("protected-path active, cost 100; ladder-inversion active, cost 10") instead of an opaque U number. (b) SLACKNESS PRUNE: any soft term with ~0 cumulative contribution across N decisions is a documented prune/merge candidate.
- **MISMATCH / RISK** — KEEP the hard vetoes (η protected-path, θ ladder-floor) explicitly as BARRIER terms (λ→∞, non-offsettable) — do NOT let "pricing" make them tradeable; the slackness lens applies only to offsettable soft terms. DROP the claim that duality SETS the weights — it does not; weight values remain a separate tuning problem.
- **CONFIDENCE** — Structural HIGH on the legibility + prune lens and the barrier/soft split (verified in code); ZERO on shadow-price weight derivation (no program to solve — abandoned).
- **SMALLEST EXPERIMENT** — Offline: instrument `computeU` over the existing trace to log, per decision, which structural terms were non-zero and their weighted contribution. Rank constraints by activation-frequency × contribution. Predicted: protectedPath + ladderInversion dominate, staleness/entropy rarely bind. Any ~0-contribution term across N decisions is a prune candidate. Read-only over `yuri-energy-trace`, ~80 lines.
- **CITATIONS** — [Lagrangian & dual problem](https://anie.me/Lagrangian-And-Dual-Problem/) · [Duality & KKT (modelling-energy-systems)](https://www.modelling-energy-systems.org/stable/basics/duality-kkts.html) · [KKT conditions (arXiv 1905.13622)](https://arxiv.org/pdf/1905.13622)

---

## 33. Variational Free Energy / Active Inference → unified surprise-bound diagnostic — juice 5 · confidence MEDIUM

- **SOURCE THEORY** — Variational Free Energy / Active Inference (Friston) — `F = complexity − accuracy = surprise + D_KL[q‖posterior] ≥ surprise`.
- **BORROWED MECHANISM** — A single quantity that couples complexity (KL from prior) and accuracy (expected log-likelihood) and is a provable upper bound on surprise — with a precision scalar that unifies the explore/exploit dial.
- **YURI TARGET** — ENERGY GATE.
- **THE TRANSFER** — Refactor `computeU`'s entropy/KL_drift/−infoGain trio into ONE free-energy term `F = KL[claimed‖prior] − E[ln p(evidence|rank)]` using existing math-kernel primitives, reported alongside U as a unified surprise-bound diagnostic (the two halves coupled by construction instead of three independently-tuned weights). KEEP the divisive-normalization ceiling — load-bearing under F too. The one genuinely-new low-cost increment: wire a single precision scalar `π = 1/threshold` annealed by the depth already tracked in energy-tick-core, unifying the `gateProposal` threshold and softmax temperature into one explore/exploit dial.
- **MISMATCH / RISK** — Treat F as a CONSERVATIVE over-estimate of surprise (fail-closed-safe, never read as exact — our belief vector is not the true posterior). The unification is LOSSLESS, not stronger: the proposed "F rejects the buyback WITHOUT the patch" test WILL fail — assert instead that F WITH the ceiling reproduces the patched gate's decisions on every fixture.
- **CONFIDENCE** — Structural MEDIUM (elegant unification, but it consolidates rather than adds capability); literal MEDIUM (must prove equivalence, not improvement).
- **SMALLEST EXPERIMENT** — Scratch copy of `yuri-energy.mjs`: add `computeFreeEnergy(state)` + a precision scalar π. Run on the info-gain-buyback fixtures; assert F WITH the ceiling normalization reproduces the patched gate's accept/reject decisions on every worked-example and buyback fixture (equivalence). Compare ΔU-accept decisions to confirm no descent-guarantee regression.
- **CITATIONS** — [Free energy principle (Wikipedia)](https://en.wikipedia.org/wiki/Free_energy_principle) · [Active inference tutorial (Smith et al., ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S0022249621000973) · [Friston free-energy (Nature Reviews Neuroscience)](https://www.nature.com/articles/nrn2787)

---

## 34. UCB1 / optimism under uncertainty → global-verification-effort HEDGE gate — juice 4 · confidence MEDIUM

- **SOURCE THEORY** — UCB1 (Auer, Cesa-Bianchi, Fischer 2002): pick arm maximizing `Q_i + √(2 ln t / n_i)`; the bonus is large for rarely-pulled arms, decays as `1/√n_i`.
- **BORROWED MECHANISM** — An exploration bonus that couples a per-item confidence to the GLOBAL amount of checking done — a single green pass while the whole system has barely been checked stays uncertain.
- **YURI TARGET** — CLAIM CORTEX (the HEDGE↔ASSERT decision); secondary lift to DISPATCH.
- **THE TRANSFER** — `ucbBonus = c·√(ln(max(e, totalSystemChecks)) / max(1, nDistinct_i))` where `nDistinct_i` reuses the EXISTING de-duped distinct-kind count and `totalSystemChecks` is a session counter of distinct evidence records assessed. Inject it ONLY as a continuous tiebreaker INSIDE `decideVerdict`: when `deltaRank≤0 AND freshCount>0 AND strongest≥0.5` (today's plain ASSERT), additionally require `(1 − ucbBonus)` past a threshold to emit ASSERT, else HEDGE — operationalizing "one green pass while the whole system has barely been checked stays a HEDGE." Also FIX the latent bug: feed `beliefWidth` the de-duped distinct count, not raw `fresh.length`.
- **MISMATCH / RISK** — Tune c empirically (√2 is a worst-case bound, too conservative); drop all O(log t)-regret framing — kinds are not i.i.d. pulls, only the `1/√n·√(ln T)` bonus SHAPE survives, not the bound.
- **CONFIDENCE** — Structural MEDIUM (global-effort coupling is the one thing we don't already have); literal MEDIUM (the regret guarantee does not transfer, only the bonus shape).
- **SMALLEST EXPERIMENT** — Count DISTINCT-KIND fresh evidence as `n_i`. `ucbBonus = c·√(ln(totalSystemChecks)/max(1, n_i))`, c=1.0. Gate: ASSERT only if `(evidencedRank − ucbBonus) ≥ claimedRank`. Unit-test monotonicity: one fixture → HEDGE, three distinct-kind fresh → ASSERT; ten reruns of the SAME kind must NOT promote (independence guard). Holding one fixed claim, ASSERT must become HEDGE as `totalSystemChecks` shrinks toward 1 and recover as it grows.
- **CITATIONS** — [UCB1 finite-time analysis (Auer et al., JMLR)](https://www.jmlr.org/papers/volume3/auer02a/auer02a.pdf) · [Upper Confidence Bound (Wikipedia)](https://en.wikipedia.org/wiki/Upper_Confidence_Bound) · [UCB algorithm (banditalgs)](https://banditalgs.com/2016/09/18/the-upper-confidence-bound-algorithm/)

---

## 35. Vickrey-Clarke-Groves / externality pricing → fan-out-weighted over-claim penalty — juice 4 · confidence LOW

- **SOURCE THEORY** — Vickrey-Clarke-Groves — Clarke pivot / externality-pricing for incentive-compatible truthful reporting.
- **BORROWED MECHANISM** — Price an action by the harm it EXPORTS to others (the externality), so a high-fan-out over-claim costs more than an isolated one.
- **YURI TARGET** — ENERGY GATE.
- **THE TRANSFER** — Externality-indexed inversion penalty INSPIRED BY VCG (not a VCG auction): keep flat θ as a fail-closed floor, and ABOVE it scale the over-claim penalty by exported harm. `externalityWeight = (claimedRank − evidenceCeilingRank)·(dependentClaimCount + 1)`; `θ_eff = max(flatTheta, θ·externalityWeight)`.
- **MISMATCH / RISK** — PREREQUISITE (the honest blocker): first add a claim-dependency edge to the cortex ledger — the fan-out term has NO input data until this DAG exists. Until then the only honest move is the depth-scaled reduced form, mostly ALREADY covered by the existing convex `inversionPenalty(depth²)` — so don't ship the reduced form as "VCG." Claim only "externality-pricing makes high-fan-out over-claims cost more once a dependency graph exists" — an incentive-ALIGNMENT heuristic, NOT an incentive-compatibility theorem (non-transferable scalar potential breaks the dominance proof).
- **CONFIDENCE** — Structural MEDIUM (fan-out-weighted harm is a sensible idea); literal LOW (the IC theorem does not transfer, and the prerequisite DAG doesn't exist).
- **SMALLEST EXPERIMENT** — `externalityWeight(claim, ledger)` = `(claimed_rung − evidence_ceiling_rung)·(count of dependent claims + 1)`. Replace flat θ with `max(flatTheta, θ·externalityWeight)` — fail-closed. Test: two over-claims of identical structural inversion but different fan-out get DIFFERENT penalties (high-fan-out costs more); verify no over-claim is ever priced below the flat θ floor. Keep behind the observability surface until validated against real session traces.
- **CITATIONS** — [VCG mechanism (TTIC)](https://home.ttic.edu/~avrim/Algo19/lectures/VCG.pdf) · [VCG overview (Umbrex)](https://umbrex.com/resources/economics-concepts/microeconomic-theory/vickrey-clarke-groves-vcg-mechanism/) · [Mechanism design lecture (TTIC)](https://home.ttic.edu/~avrim/AGT26/Lecture%209%20-%20Mechanism%20Design1.pdf)

---

## 36. Jeffrey conditioning → reliability-proportional info-gain credit — juice 5 · confidence MEDIUM

- **SOURCE THEORY** — Jeffrey conditioning / probability kinematics (soft-evidence update under the rigidity condition; Richard Jeffrey).
- **BORROWED MECHANISM** — Update on UNCERTAIN evidence: `P'(rank) = Σ_i P(rank|E_i)·reliability_i` with leftover mass left on the prior — a soft, reliability-weighted recenter, not a hard jump.
- **YURI TARGET** — CLAIM CORTEX.
- **THE TRANSFER** — Replace the hard recenter `posterior = beliefVector(evidenceRank, beliefWidth(fresh.length))` with a single-tick BATCH Jeffrey update where `reliability_i = decayed_strength_i × kind-ceiling-trust_i`. This closes a verified WITHIN-TIER hole: today a decayed≈0.275 advisory and a decayed≈1.0 advisory of the SAME kind yield IDENTICAL posteriors and IDENTICAL info-gain credit (the 0.36 ΔU gap between them is ζ/staleness, NOT ε). Jeffrey moves a reliable record nearly fully and a weak one fractionally, yielding strictly less ε credit for the weak-only case.
- **MISMATCH / RISK** — Constrain to one batch update over the current record set per tick (commutativity preserved within a tick) — never an incremental online stream. Honor rigidity: if a record retroactively re-weights how kinds map to rungs (e.g. a gamed test discovered), REBUILD the partition rather than Jeffrey-update through it.
- **CONFIDENCE** — Structural HIGH (the within-kind reliability blindness is verified in code); literal MEDIUM (rigidity must be enforced by partition-rebuild on re-weighting).
- **SMALLEST EXPERIMENT** — `jeffreyPosterior(claimedRank, records)` computing `P'(rank)=Σ P(rank|E_i)·reliability_i` with leftover mass on the prior. Fixture (SAME KIND, two strengths): (A) fresh advisory decayed≈1.0 vs (B) barely-fresh advisory decayed≈0.28, same claimed rung. Assert current code gives byte-identical posterior + info-gain credit, then assert Jeffrey moves A nearly fully / B fractionally → strictly less ε credit for B. Deterministic single-tick batch.
- **CITATIONS** — [Radical probabilism / Jeffrey (LSE)](https://personal.lse.ac.uk/bradleyr/pdf/rad.prob4.pdf) · [Jeffrey conditioning (PhilSci)](https://philsci-archive.pitt.edu/16513/) · [Probability kinematics (UAI)](https://www.auai.org/uai2014/proceedings/individuals/59.pdf)

---

## Build-Next 3 (the highest leverage-per-line, lowest-risk wins)

The ranking above is by juice. But "what to build first" weights **leverage × low-risk × no-prerequisite** — a transfer that ships read-only or as one pure function with an existing test harness beats a juicier one blocked behind a labeler/DAG/schema build.

1. **Spectral architecture clustering (card 4)** — pure read-only Node script over `yuri-graph-state.json`, zero mutation risk, 124×124 trivial, and it ALREADY surfaced 11 orphan nodes + an independent cross-check channel against the circular Phase-2 purpose-strings. Ships today, no prerequisite. Highest evidence-per-token of the whole set.

2. **Counterfactual evidence-necessity ablation (card 8)** — a pure deterministic loop over the EXISTING `assessClaim`, drops straight into the current test harness, no new schema. Surfaces load-bearing vs decorative evidence and a single-point-of-failure flag the cortex is blind to today. One function, immediate.

3. **Cox proportional-hazards evidence aging (card 18)** — the first weight in the entire energy fn that can STOP being hand-tuned, with a clean two-step ship (hardcoded multipliers now, β learned from the trace later). Directly hardens the PROSE-NOT-OUTRUN-WIRING distrust of council-text and happy-path tests. High structural confidence, motivated by a standing rule.

> Honorable mention held back ONLY for prerequisites: card 14 (MDL redundancy demotion) and card 21 (Dempster-Shafer ignorance/conflict) are both HIGH-confidence and high-value, but card 14 wants a gzip/Jaccard primitive wired and card 21 needs the evidence-polarity field added first. Card 11 (OCO regret receipt) is the one Marcel explicitly asked for in spirit — but it is correctly fenced behind the deferred-outcome labeler that has to be built before any of it is real.
