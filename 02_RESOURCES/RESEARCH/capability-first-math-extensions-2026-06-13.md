# Capability-First wiring — 5 mathematical extensions (concrete attack, 2026-06-13)

Current recall scoring (`capability-recall.mjs` / xref `capabilityHits`) is naive lexical token
overlap: `score(q,c) = Σ_phrase∈serves[ 3·contains(q,phrase) + |tok(q)∩tok(phrase)|/|tok(phrase)| ] +
0.5·|tok(q)∩tok(id⊕does)|`, surfaced when `score > 1.0`. Every token weighs the same ("score"="lyapunov"),
no synonymy, uncalibrated threshold, static, no global coverage view. Five upgrades, each a different
branch of math, most dogfooding an already-registered capability.

## 1 — IDF·PPMI latent recall (information retrieval + linear algebra) · DOGFOODS `fuzzy-cross-surface-match`
Vectorise instead of counting. Over vocabulary V of all `serves⊕does⊕id`, IDF(t)=log(N/df(t)),
N=#capabilities. Capability c → TF-IDF vector v_c; need q → v_q (same IDF). Base score = cosine =
(v_q·v_c)/(‖v_q‖‖v_c‖) ∈ [0,1]. For synonymy ("settle"≈"converge", "dedupe"≈"near-duplicate") build the
PPMI matrix PPMI(t,c)=max(0, log[p(t,c)/(p(t)p(c))]), truncated-SVD M≈U_kΣ_kV_kᵀ, embed q̃=v_q·V_k,
score=cos(q̃,c̃). This is **literally `yuri-match-global-space.buildIdf`+buildGlobalFeatureFn** — recall
CALLS the fuzzy-match capability. Win: discriminative terms dominate, synonyms match, bounded→calibratable.
Risk: 8-doc corpus → unstable IDF/over-ranked SVD; train IDF over serves-phrases + corpus, Laplace-smooth
df, cap k≤rank. Plug-in: replace `score()`; ~1 file.

## 2 — Calibrated build-vs-reuse as an expected-value decision (probability + decision theory) · DOGFOODS energy-gate discipline
The `>1.0` threshold is a magic constant. (a) Calibrate similarity s→probability via Platt:
P(c serves q)=σ(a·s+b), fit (a,b) on labelled (need,cap,served?) pairs (seed few, grow via #5).
(b) Decide by EV: B=reuse benefit, C_mis=cost of adopting an ill-fitting cap, C_build=cost of building.
Reuse the top cap iff EV(reuse)>EV(build) ⇒ P·B−(1−P)·C_mis > B−C_build ⇒ **P > τ\* = 1 − C_build/(B+C_mis)**.
The surface/suppress threshold becomes a derived EV boundary that ADAPTS (cheap-to-build need ⇒ higher
reuse bar). Mirrors `computeU` penalty/credit EV + probabilistic-decision-core. Monitor calibration via
Brier (computeU already computes it). Risk: cold-start labels → weakly-informative prior + isotonic later.

## 3 — Coverage & redundancy as information-theoretic set-cover (information theory + combinatorial opt) · EXTENDS feature → auto-roadmap
Turn recall into a roadmap generator. Log real needs {q_i} (xref queries). m_i=max_c sim(q_i,c).
COVERAGE=E[m_i]; uncovered mass = mean(1−m_i) ≈ residual entropy H(need|capabilities).
- BUILD candidates = cluster low-m_i needs (DBSCAN/k-means over #1 embeddings); each dense low-coverage
  cluster centroid = a concrete "build this", with support count.
- MERGE candidates = caps with high serves-Jaccard J(s_a,s_b) AND high cos(c̃_a,c̃_b), or where removing c_b
  drops COVERAGE < ε (redundant).
Greedy submodular add-the-cap-that-most-reduces-residual-entropy is (1−1/e)-optimal. Win: the registry
mathematically tells you what to build/merge from real usage — capability-first becomes self-curating.
Risk: needs a query log (start logging xref — cheap); gate gaps on cluster support ≥ n.

## 4 — Structural-centrality prior (graph theory / spectral) · DOGFOODS `structural-centrality`
Capabilities aren't independent: computeU / yuri-match are load-bearing (imported by many). Build the
call-graph G (edge a→b if mechanism a imports b — parse imports). π(c)=PageRank(G) (or eigenvector
centrality = principal eigenvector of adjacency A). Final score = sim(q,c)·π(c)^β (log-linear:
log s + β log π). Foundational, battle-tested capabilities win ties + get a prior boost. This is
**`yuri-navigate.aggregateProcessCentrality`** — dogfood. Win: "reuse the load-bearing thing" is encoded.
Risk: entrenches incumbents (a better peripheral cap gets buried) — cap β, let #5 counter it; dynamic
imports missed → fall back π=uniform.

## 5 — Usage-driven learning-to-rank / Thompson bandit (online learning + Bayesian) · closes the loop
Static scoring never learns which recalls were USED. Log (q, surfaced c, used?∈{0,1}).
- (a) Online logistic LTR: φ=[cos, idf-cos, π, serves-Jaccard, latent-cos]; P_used=σ(wᵀφ), SGD on the
  used-label — the feature mix is learned (maybe centrality matters less than cosine; let data decide).
- (b) Per-cap Thompson: each cap holds Beta(α_c,β_c) over "relevant-when-surfaced"; sample θ_c, rank by
  sim·θ_c, update on use — explores uncertain caps, exploits proven ones.
Effective serves-weights become LEARNED from reuse → recall compounds with use (the system forgets LESS
the more it's used). Mirrors the energy-gate calibration loop (logLoss/Brier). Reward proxy: "did the next
action import that mechanism" (detectable). Risk: feedback-loop bias (only-surfaced caps get labels) →
Thompson exploration or inverse-propensity weighting; cold-start → fall back to #1.

## Synthesis (the unified score + the recursion)
score(q,c) = [IDF·PPMI latent cos (1)] · π(c)^β (4) · θ_learned(c) (5), → calibrated P (2) → EV gate τ\* (2);
offline, coverage/redundancy (3) emits the build/merge roadmap. **Each layer dogfoods a registered
capability** (yuri-match #1, yuri-navigate #4, energy discipline #2/#5) — the wiring improves itself using
itself. Optional 6th: a capability-redundancy term in `computeU` that RAISES U on a "build new" action when
best-match is high (makes capability-first an enforceable gate, not just advisory).

## Build order (Izanagi: EV × reversibility × blast-radius)
1 (biggest quality jump, dogfoods yuri-match, ~1 file, reversible) → 2 (principled thresholds) →
3 (roadmap; needs query log) → 4 (centrality; needs import-graph) → 5 (learning; needs usage log).

## EMPIRICAL VERDICT — supersedes the theory order (simulation `/tmp/cap-sim.mjs`: 8 caps, 25 needs, ~2000 evals)
Ran all methods vs the production baseline; the sims **reorder the priors**:
- **#5 learning-to-rank — WINNER.** Test P@1 climbs 0.728→0.933 as labels accumulate (200 MC splits/size),
  beating the 0.850 static baseline once ≥6 labels. The only decisive ranking win. **Build first.**
- **#3 gap detection — works.** Flags ALL 5 build-candidate gaps (recall 1.0); over-flags (prec 0.45 → needs a
  calibrated threshold). The roadmap-generation extension is real. Build second (tune precision).
- **#2 EV decision — mechanism sound, calibration is the gap.** AUC 0.900→0.915 (slight separability gain) and
  τ\* correctly adapts to cost; but decision-acc is poor under crude min-max scaling → the sim PROVES #2 needs
  real Platt/isotonic calibration, not the proxy. Build with proper calibration.
- **#1 IDF-cosine — NO measured win.** Ties baseline exactly (ALL 0.850 / EASY-literal 0.929 / HARD-paraphrase
  0.667). The 8-cap corpus is too small for IDF to discriminate; needs PPMI-SVD latent + more capabilities to
  beat literal overlap. **Defer** until the registry is larger.
- **#4 centrality — INERT.** The 8 mechanisms share only 1 import-edge → PageRank ≈ uniform. Needs a connected
  capability graph to carry signal. **Defer** until the registry is denser.

**Evidence-based build order: #5 (learning) → #3 (gap/roadmap) → #2 (calibrated EV) → revisit #1/#4 as the
registry grows.** Do NOT build #1/#4 now — no measured gain at current scale (premature = clutter).

## LARGE-SCALE STUDY — supersedes the above (16M evals, `/tmp/cap-sim-large.mjs`, ~14s)
15.97M ranking/training evals + 37.9M cap-score computations; synthetic corpora 16→1024 caps, Zipfian vocab,
Barabási–Albert dependency graph, bootstrap 95% CIs. The rigor OVERTURNS the tier-1 order:
- **#2 CALIBRATION — cleanest, most robust win.** Logistic calibration drives ECE 0.201→~0.000. CAVEAT: that
  ECE is IN-SAMPLE (logistic fit + scored on the same data) → optimistic; needs a held-out split to confirm
  magnitude, but the mechanism (raw scores are badly calibrated; logistic fixes them) is solid. Build #2 with
  logistic/isotonic calibration, validated held-out.
- **#1 IDF-cosine — does NOT cleanly turn on at scale.** Δ(M1−M0)= −3.8/+3.1/−2.2/+2.8 pt at N=16/64/256/1024
  (non-monotonic, tight CIs). Raw IDF-cosine ≈ raw overlap; the real win needs LATENT semantics (synonym
  bridging) which IDF-cosine doesn't model. Only build with PPMI-SVD / query-expansion latent, else skip.
- **#4 centrality — HARMFUL as a multiplicative prior**, not merely inert: M1C−M1 = −4.0pt when reuse∝centrality,
  −39.7pt under uniform reuse. The hub-bias swamps per-query match. REJECT the multiplicative form; at most a
  tiny additive log-prior, and only if reuse-frequency provably tracks centrality.
- **#5 learning-to-rank — modest at scale** (test P@1 0.826→0.858 vs ~0.84 static), and **supervised >> bandit**:
  the per-arm Thompson form gives near-LINEAR regret (4.8/22/81.6/256.3 over 50/200/800/3000 rounds) because it
  ignores context — use supervised LTR or a CONTEXTUAL bandit (LinUCB), not per-arm Thompson.

REVISED VERDICT (16M-eval evidence): **#2 calibrated gating (held-out) + #5 supervised LTR are the safe builds;
#1 only with latent semantics; #4 rejected in its proposed form.** Meta-lesson: under scale + CIs, naive ranking
gains shrink or reverse — calibration is the durable winner, the flashy ranking tricks aren't, and a plausible
prior (centrality) can actively hurt. Always validate held-out; the in-sample ECE=0 is itself a caution.
