# Roadmap — What Remains to Ship

**Date:** 2026-05-28
**Ship target:** 2026-07-23 (8 weeks; ~7.5 remaining)
**Owner:** Marcel (operator/author), Claude (synthesis/orchestration), Quantum+Codex lanes (build/verify)

## The honest framing

The paper's bottleneck is not writing — the unified draft exists and is honest. The bottleneck is **evidence**. A methodology paper with empirical claims needs data; right now the only real ΔU data is the descent-demo (synthetic scenario, real gate math). Everything concrete flows from closing that gap.

The key insight that changes the timeline: **most of the evidence does NOT require the 10–14 day real-traffic window.** Three of the four experiments run on synthetic scenarios and can execute now. Real-traffic data is one evidence stream among several — valuable, but not the gate on the whole paper.

---

## DONE (this session)

- Energy core `yuri-energy.mjs` — computeU/computeDeltaU/gateProposal, 28 tests, Codex PASS
- A.1 telemetry + Privacy Gate v3 — 39 tests, Codex PASS
- A.2 dispatch wiring (observability mode) — 26 tests, Codex PASS, wired into 3 surfaces
- A.3 experiment runner — 35 tests, workflow-built + verified
- B.2 descent-demo — **real monotonic descent data** (15 steps, U→−2.925)
- Layer-7 privacy sanitizer — 32 tests, workflow-built + verified
- B.1 observability — ACTIVE (window 2026-05-28 → review 06-07..11)
- Unified paper — 2,093 words, honesty-corrected, draft-complete
- Dashboard — real-data wiring in progress (workflow `wf_3fc21782-72c`)
- All artifacts registered

---

## WHAT REMAINS — four tracks

### Track 1 — Evidence generation (the real work)

This is where "work hard for the data" lives. Ordered by what unblocks fastest.

| Exp | Needs real traffic? | Can run now? | Produces |
|---|---|---|---|
| **B.2 descent demo** | No | DONE | Fig: U descent curve (have it) |
| **B.3 component ablation** | No | **YES — now** | Fig: which of the 6 components carry signal; 6 ablation runs (disable each weight, re-run descent + adversarial scenarios, measure rejection-rate delta) |
| **B.4 adversarial probe** | No | **YES — now** | Fig: gate evasion rate; 5 attack classes (weight-ratio exploitation, component blind-spot, stale-evidence accumulation, distribution-edge, threshold-edge) — hand-crafted adversarial state pairs |
| **Insight-1 retroactive eval** | No (uses sanitizer on existing `_SYSTEM/state/` history) | **YES — now** | Real-ish ΔU distribution from historical state events, sanitized through Layer 7 |
| **B.1 real-traffic** | YES | Passive, 10–14 day window | Fig: real dispatch ΔU distribution, by-lane — but needs A.2.b action mode for non-zero ΔU |
| **B.5 comparison baseline** | Uses B.1 data | After B.1 | Fig: gate-rejected vs structural-only-rejected (Venn) |

**The move:** run B.3 + B.4 + Insight-1 NOW (synthetic + retroactive — no waiting). That produces 3–4 real figures for the paper inside days, not weeks. B.1/B.5 remain the longer real-traffic stream that arrives at the review gate.

### Track 2 — Statistical + visual layer (Layer 6)

- `yuri-energy-analyze.mjs` — bootstrap CIs, distribution summaries, differential comparison across weight configs. Every paper number carries a CI, not a point estimate.
- Figures: produced via the Q2 pipeline (Codex base visuals w/ plugins → Claude refine), brand-styled, embedded in the dashboard + paper. NOT dev-ugly matplotlib.
- Metamorphic invariants (Layer 4) + property-based generators (Layer 3) at 1M-case scale — strengthens the "tested" claim from 28 unit tests to "verified across 1M+ generated cases."
- **Energy-weight calibration bakeoff** (`yuri-energy-calibrate.mjs`) — graduate each non-barrier weight from "hand-tuned" to evidence-earned by climbing the foundry promotion ladder (`hypothesis → … → owner-approved`, `formula-foundry-bakeoff.mjs:40`) scored against B.3 ablation + B.4 adversarial + the burn-in trace. Converts the paper's "hand-tuned, not learned" limitation (`yuri-energy.mjs:18`) into a calibrated, CI-backed claim. **STATUS: BUILT 2026-06-13 (observe-only / dry-run instrument), 80/80 tests, 4 Opus adversarial verifies.** The 5-module toolchain: `energy-calibration-contract.mjs` (WP0 seam) · `experiments/component-ablation.mjs`+`yuri-energy-ablation.mjs` (B.3) · `experiments/adversarial-probe.mjs`+`yuri-energy-adversarial.mjs` (B.4) · `yuri-energy-analyze.mjs`+`yuri-energy-quantum-analyze.mjs` (ANALYZE classical + quantum order-effect/Schmidt-coupling) · `yuri-energy-calibrate.mjs` (CALIBRATE driver). Quantum sim finding: gate is order-blind (linear U → classical bootstrap correct) + soft weights ≥98.6% separable (single-component-delta D6 validated). Barrier weights (η/θ) excluded; enforce stays DISARMED; owner-approved rung is the only `energy-weights.json` write. Spec: `energy-weight-calibration-spec.md`. Build contract: `energy-calibration-SWARM-SHEET.md` (runId `wf_17b40478-32e`). Dispatch: `energy-calibration-EXECUTION.md`. Sim findings: `02_RESOURCES/research/energy-calibration-quantum-sim-findings-2026-06-13.md`. **MECHANISM UPGRADE 2026-06-13:** the one-sided real-data gate is now the TWO-SIDED objective (`yuri-energy-twosided.mjs`, leniency + strictness channels, each per-item severity-floored) so leniency-direction tunes are certifiable, plus the differential-driven proposer (`yuri-energy-propose.mjs`, full-pipeline-admissibility checked). 5-Opus refute-by-default verify round (`wf_8ef89065-b8c`) found+fixed 10 real defects (4 HIGH); 559 tests green; beta=2.2 re-certifies under the hardened gate. **Remaining: owner-armed tunes only** (run `calibrate(<candidate>, {confirmOwnerApproval:true, dryRun:false})`). **Surfaced gate-core issue — RESOLVED 2026-06-14 (energyFormulaVersion 3).** baseU≈41 = β·ln(1e9) was `claim-cortex.mjs`'s hard 1e-9 belief floor saturating KL on claimed-but-unverified rungs (71% of the reject corpus, distance-blind). Fixed in two steps: v2 floor-soften (`mixtureSmooth ε=0.02`, β·KL 41→11, still flat) then **v3 replaced the drift term with Wasserstein-1** (`β·W₁` on the ordinal ladder — distance-aware, bounded, no floor; new `wasserstein` contribution key) + a calibration **version reader** (fail-closed on cross-era pooling of the incommensurable v1/v2/v3 drift scales; calibration/propose/twosided pin `formulaVersion:'current'`). 652 tests green, 5-lane cross-family verified, observe-mode/reversible. Documented residual: W₁ drops the confidence dimension (1-rung drift + entropy collapse), NOT reachable on the live ≤6-class feeder; confidence-coupling credit is an owner-gated fork. Full record: `energy-weight-calibration-spec.md` GATE-CORE block. Origin: 2026-06-13 investor-deck claim audit.

### Track 3 — Paper hardening to ship-grade

- **Codex/Rick-Prime skeptic read** of the unified paper simulating Jan/Jake — the final "can I send this" gate. (Recommended next dispatch.)
- **Section 4.5 "Experimental Results"** — insert once B.3/B.4/Insight-1 figures exist. This is the section that converts proposal → methodology-with-evidence.
- **Reproducibility appendix** — clone/run/verify instructions + sanitized public artifact (Q5: public GitHub mirror at ship).
- **Citation verification pass** — the arXiv refs are currently advisory; verify before ship (network pass).
- **Companion video script** — Marcel's craft. 10–12 min explainer. The descent curve animates beautifully.

### Track 4 — Optional depth (if time)

- SMT formal verification of invariants (Q9 — only if Codex confirms feasible)
- Mutation testing of the gate source (validates the test suite catches real bugs)
- A.2.b action mode (after B.1 review) — live enforcement → real rejections

---

## Critical path to a Jan-shippable paper

1. **Now → +3 days:** B.3 ablation + B.4 adversarial + Insight-1 retroactive (synthetic/retroactive — real figures without waiting). Statistical layer (Layer 6) for CIs.
2. **+3 → +7 days:** Section 4.5 from those results. Codex skeptic read. Figures via Q2 pipeline.
3. **Parallel, passive:** B.1 real-traffic accumulates → review gate 06-07..11 → decide A.2.b.
4. **+1.5 → 3 weeks:** reproducibility appendix, public mirror, citation verification, video script.
5. **By 2026-07-23:** ship to Substack + YouTube + Skool; DM Jake within 5 days.

The paper does NOT wait for the 14-day window. B.3/B.4/Insight-1 give it real teeth in days. B.1 is the bonus real-traffic stream that lands mid-sprint.

---

## Immediate next actions (this session or next)

1. Finish the dashboard wiring (workflow in flight).
2. Codex skeptic read of the unified paper (the "can I send this" gate).
3. Build B.3 (ablation) + B.4 (adversarial probe) scenarios + runner extensions — these are the next evidence builds, runnable now, highest leverage.
4. Build `yuri-energy-analyze.mjs` (Layer 6) so every figure carries a CI.

The honest version: we are ~1 week of focused evidence work from a paper that survives the "where's the proof?" question — not because we faked proof, but because B.3/B.4/Insight-1 produce real proof on synthetic+retroactive data that needs no waiting.
