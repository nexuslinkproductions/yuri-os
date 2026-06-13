---
name: ref-simulation-arsenal
description: "YURI's 4-tier sim arsenal (izanagi qualitative · decision-sim robust · quantum-hypothesis order-aware · izanagi-bridge measured→ruling) + DORMANT learn-loop; wiring roadmap doc; built 2026-06-13"
metadata:
  node_type: memory
  type: reference
  tier: 1
  scope: yuri-simulation
  trig:
    - simulation
    - sim
    - decision-sim
    - izanagi
    - quantum sim
    - robust decision
    - monte carlo
    - what sims
    - improve sims
    - decide under uncertainty
  refs:
    - ref-capability-first-wiring
  originSessionId: 25204091-facb-496b-bb55-e478a843aca2
---

FACTS (triples):
- sim ARSENAL = 4 tiers + a learn loop. (1) `izanagi-simulator` (`/izanagi`) = qualitative 3-branch commit (EV×reversibility×blast-radius). (2) `decision-sim.mjs` = robust optimization: robustScore (0.5·mean+0.5·CVaR), minimaxRegret, pgdWitness (flip-rule), crossEntropyOptimize, infoGapHorizon, multiverse + halton/sobolish QMC. (3) `quantum-hypothesis-tracker.mjs` (+ quantum-vs-bayes-benchmark) = order-aware Hilbert evidence, measureSequential, qqEquality, schmidtDecomposition (coupling test), G1–G4 gate PASSED 2026-06-11. (4) `izanagi-bridge.mjs` (NEW) = measured/MC values → robust methods → izanagi ruling, AUTO corner-law vertex guard + per-axis flip thresholds.
- the "quantum sim" (Marcel's phrase, 15M-eval) IS quantum-hypothesis-tracker.mjs — NOT the cap-sim MC study. decision-sim is "the quantitative tier above izanagi's qualitative 3-branch" (its own skill header).
- learn LOOP = izanagi-postmortem.mjs → self-hypothesis.mjs (izanagiSummary) → neuron-loop.mjs (izanagiPromoter); scores EV predictions vs outcomes. HALF-CLOSED 2026-06-13: izanagi-bridge.mjs `izanagiRuling(...,{record:true})` now writes the prediction to `prediction-ledger.mjs` (opt-in, off by default so demo/tests stay pure); prediction-ledger CLI `report` fixed (was a no-op the homeostat reflex invoked). STILL OPEN: nothing scores predictions→outcomes on a schedule (recordOutcome/scorePrediction/calibrationReport exist; no cron/reflex populates outcomes) — that's the remaining learn-loop edge.
- izanagi-bridge DEMO verdict (which math extension to build, grounded in 16M-eval cap-sim): ltr=BUILD (only option w/ positive floor at every vertex) · calibration=GATE(holdout≥0.25) · idf=GATE(corpus≥0.5) · centrality=REJECT(−42 floor, multi-axis knife-edge). robustScore→ltr vs minimax-regret→calibration = a robust-vs-upside split (resolve the gating axis, don't coin-flip).

IMPLICATION: a "which option / decide under uncertainty / should I build X" call → run `izanagi-bridge` (capability-recall surfaces it; registry now 10). Top UNBUILT wiring wins (roadmap): QMC sampler into the MC harness (cheap, tighter CIs) · prediction-ledger → close the learn loop (biggest structural win) · computeU/Brier as the canonical value() oracle (kills sim≠prod score gap) · formula-foundry to retire hand-encoded value models. The bridge demo's value-model constants are MY encoding = advisory, not measured truth.

EVAL-PROCESSING (how to make million-eval runs useful — funnel in the roadmap doc): eval count = sampling BUDGET, not a result; "processing" collapses N evals → one decision + flip rule + residual CI; only the decision-CI width + flip location matter. Funnel: stream-reduce (Welford/t-digest, never store) → stratify into a pre-registered factorial GRID (the breakdown IS the design) → per-cell CI (delta-CI for A-vs-B; the CI is what made 16M evals honest) → variance reduction (QMC O(1/N) + COMMON-RANDOM-NUMBERS paired delta = biggest free win) → spend evals on undecided cells (sequential/confidence-sequence/OCBA) → attack CORNERS (vertex, not just interior) → honesty gates (held-out not in-sample · two-sided controls · effect-size not just p · seed+pre-register) → collapse to decision. SYMPTOM REFRAME: needing millions usually = you didn't allocate well; good design resolves most decisions at THOUSANDS; millions only for rare tails/fine grids/hi-dim corners.

EVAL-PROCESSING LAYER — BUILT 2026-06-13 → `_SYSTEM/Scripts/eval-processing.mjs` (+ .test.mjs 9/9 green; registry 10→14). 4 caps, all surface by need: `streaming-aggregator` (Welford+Vitter reservoir, O(1) mem, never store rows) · `crn-paired-delta` (common random numbers → variance-reduced A/B delta CI + unpaired CI as proof) · `sequential-stopping` (empirical-Bernstein confidence sequence; α-control under peeking EMPIRICALLY validated not cited — false-stop ≤ α over 300 null streams; power stops ~650 evals never wrong-direction; distinct from quantum measureSequential) · `heldout-split` (seeded split + k-fold + split-conformal quantile + in-sample-vs-heldout optimism gap → kills ECE=0 trap). Reuses decision-sim.makeRng. RESIDUALS: EB-CS assumes bounded range (unbounded→sub-Gaussian variant); reservoir quantiles approx in deep tails; pairedDelta computes unpaired baseline by default (3× value calls, add computeUnpaired:false for hot loops); not yet in GitNexus index.

SEE: 02_RESOURCES/research/simulation-arsenal-wiring-2026-06-13.md (full roadmap) · [[ref-capability-first-wiring]] (the registry it's part of) · [[feedback-affine-objective-enumerate-corners]] (the corner law the bridge automates).
