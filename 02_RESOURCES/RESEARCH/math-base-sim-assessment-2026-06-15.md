# Math-Base Sim/Calc Assessment — 2026-06-15

Thorough quantum-sim + sim + calculation assessment of the YURI math base (56 modules in
`_SYSTEM/Scripts/math/`), run via the sim arsenal (`quantum-hypothesis-tracker`, `decision-sim`,
`quantum-vs-bayes-benchmark`) + the math base's OWN sim/calc harnesses. Owner-requested
(2026-06-15): "run quantum sims + sims + calculations on the entire math base to assess it, very thorough."

All findings below are DETERMINISTIC harness output (evidence), not model opinion.

## Method
- GREEN baseline: full `node --test _SYSTEM/Scripts/math/*.test.mjs`.
- Falsification gate: `quantum-vs-bayes-benchmark` (G1–G4).
- Quantum order/coupling: `yuri-energy-quantum-analyze` (Schmidt decomposition over the live trace).
- Invariant + metamorphic + mutation layers: `yuri-energy-invariants`, `-metamorphic`, `-mutation-sweep`.
- Two-sided FP/TP proxy: `yuri-energy-twosided`.
- Non-energy cluster: `transfer-distance.proof`, `math-proof-gate`.

## VERDICTS

### GREEN — solid (evidence)
- **Correctness floor: 844/844 math tests pass** (after fixing 1 arm-exposed non-hermetic test, d43382d3).
- **Energy invariants: 5/5 planted mutants CAUGHT** — sign-flip-barrier, reconstruction-break (U == Σcontributions), unbounded-credit (U-floor ≥ −1.3932), nonfinite, drop-unconditional-term. The computeU invariant layer is sound.
- **Metamorphic relations: violations caught** (e.g. MR-term-completeness — the 3 unconditional terms always emitted).
- **Quantum falsification gate: PASS** — G1 machinery=true, G2 real-data-win=true, G3 honesty-control=true, G4 qq-residual=true. The quantum layer earns its keep and does NOT launder flexibility (G3).
- **Quantum coupling: weights HIGHLY SEPARABLE** — dominant Schmidt component ≥ 92.0% of the joint; `order_effect_detected=0` over n=1693 firings; couplings real-but-weak (max ratio 0.426, top cluster beta~mu). ⇒ single-component-delta (D6) calibration is a sound default for all soft weights.
- **transfer-distance: 6/6 proof assertions pass** — gate works (med FAR_HOLDS 0.239 > FAR_BROKEN 0.074), theater killed, [0,1] contract, viability gate correct.

### GREY / ACTIONABLE (evidence)
- **Mutation score 42.1% — killed 32/76, 44 SURVIVORS** (`yuri-energy-mutation-sweep`, "B5 grey-zone survivor sweep"). The invariant/test layer does NOT catch term-level mutations of: `protectedPathViolations` (SCALE), `promotionLadderInversions` (ZERO/SCALE), `informationGain` (NEGATE/ZERO/DROP_KEY/SCALE), `verifiedEvidenceCredit` (ZERO/SCALE), and more. **This is the headline gap** — the strongest hardening opportunity. Each survivor is a candidate hand-planted mutant (failure-anchored loop).
- **Two-sided FP/TP assessment is PROXY-ONLY** — `degenerate=true`, "no ground-truth FP/TP labels exist in the sanitized trace" (recoverable-subset proxy, coverage=1 but not a from-scratch verdict). **This is exactly the gap the keystone LEARN loop (armed this session) fills**: as gate firings carry corrId/claimIds and claims resolve, real reverted/survived labels accumulate in the shadow ledger → a future from-scratch two-sided verdict becomes possible.
- **Quantum G2/G4 carry an OWNER-VERIFY data flag** — the Clinton/Gore JOINT cells are literature-recalled (Wang & Busemeyer 2013); the marginals carry G2 on their own. Don't present the joints as primary evidence; owner-verify or downgrade to marginals-only.

### COVERAGE NOTE (honest scope)
- The **energy cluster** (~25 modules: computeU/gateProposal + calibration + conformal + the trace/deriver loop) is DEEPLY sim/calc-assessed (the harnesses above target it).
- The **non-energy clusters** (nexus-stats/numerology/distrib, similarity/hashing: jaccard/minhash/phi/mdl/fsrs, formula-foundry, eml-tree, math-kernel, math-adapters) are CORRECTNESS-covered by the 844-test suite + transfer-distance is proof-covered, but NOT deep-sim-assessed (no order-effect/robustness sims run on them). Follow-up: a nano-swarm pass running quantum-sim/decision-sim/calc reasoning per non-energy cluster.

## RECOMMENDATIONS (prioritized)
1. **Harden computeU mutation coverage** — convert the 44 survivors into permanent hand-planted mutants + invariant/test assertions (raise the 42.1% kill rate). Highest leverage; the invariant layer is the gate's correctness oracle.
2. **Let the armed keystone loop fill the two-sided label gap** — it directly addresses the only-proxy two-sided assessment (real FP/TP labels accumulate over time).
3. **Resolve the quantum G2/G4 OWNER-VERIFY flag** — verify or down-scope the literature-recalled joints.
4. **(optional) nano-swarm deep-sim the non-energy clusters** — extend the sim coverage to the full 56.

## Non-Energy Cluster Findings (nano-swarm pass, 2026-06-15)
Dispatched 2 peer lanes: NS1 (minimax) + NS2 (deepseek-flash).
- **NS1 — nexus-stats/distrib, math-kernel (stats half), yuri-phi, yuri-mdl — DELIVERED** (findings salvaged from the lane log; it skipped persisting its file):
  - nexus-stats / nexus-distrib: shims, solid, no defects. yuri-phi: clean. yuri-mdl: well-defended, documented limits.
  - **math-kernel REAL DEFECT (verified + FIXED):** `pearson`/`spearman` did NOT clamp to [-1,1] (unlike `cosineSimilarity`) → float accumulation on wide-magnitude inputs could push |r| past 1. Fixed with `clampNumber(.,-1,1)` on pearson's return (spearman delegates). 844/844 green; pearson +1/-1 exact.
  - math-kernel noted edge-cases (follow-up; mostly caller-contract/documented): empty median/percentile guard, weightedStdDev NaN guard, goldenAngle overflow at n≈4.2e307.
- **NS2 — similarity/hashing (jaccard/minhash/fsrs/eml-tree) — FAILED** (lane `empty_output_stop`); this cluster is still UNASSESSED → remaining follow-up (re-dispatch).

## POST-ASSESSMENT ACTIONS (2026-06-15)
- Headline 44 mutation survivors → **CLOSED to 0 (mutation score 42.1% → 100%)** via per-term value/sign invariants in yuri-energy-invariants (commit be74a989). computeU's term-mutation grey-zone is exhaustive.
- math-kernel pearson/spearman [-1,1] clamp added.
- REMAINING: re-dispatch NS2 (similarity/hashing); the two-sided ground-truth-label gap (the armed keystone loop fills it over time); quantum G2/G4 OWNER-VERIFY.

## RESULT_LABEL
`09AS_MATH_BASE_SIM_ASSESSMENT_X_PASS` — energy + transfer clusters deep-sim-assessed; the headline grey-zone (44 mutation survivors) CLOSED to 100% kill; NS1 non-energy cluster assessed + its one real defect (pearson/spearman clamp) fixed; NS2 similarity cluster pending re-dispatch. Base is invariant-/proof-/falsification-gate GREEN with computeU's mutation layer now exhaustive.
