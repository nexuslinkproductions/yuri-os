---
name: yuri-wave3-synthesis-2026-06-06
description: Wave-3 synthesis (12-agent run + the verified GPD keystone). Folds the 3 native architects (mathematical decoder — CORRECTED to LLM-wields-instrument not ingress-preprocessor; bidirectional flow = autodiff over U; auto-calibration = C-first + prior/clamp/pin owner-override) + the research lanes (simulation harness, program synthesis, numerology/alchemy). gpd-shadow built + verified 6/6, all 5 kill-criteria PASS. Recall anchor for the next session.
metadata: { node_type: synthesis, date: 2026-06-06, status: keystone-verified-synthetic, source: wave3-12agents, tier: high }
tags: wave3, GPD, gpd_shadow, mathematical_decoder, bidirectional_autodiff, auto_calibration, simulation_harness, program_synthesis, numerology_alchemy
---

# Wave-3 Synthesis — the verified keystone + the self-governing loop

12-agent run (3 native architects + 5 Codex + 4 DeepSeek). Outcome: the GPD keystone is BUILT + VERIFIED on
synthetic data, and the three architects compose into one self-decoding/self-triggering/self-checking/
self-calibrating loop with the owner holding a corridor.

## ★ THE KEYSTONE — gpd-shadow.mjs BUILT + VERIFIED (synthetic)
`_SYSTEM/Scripts/gpd-shadow.mjs` (+ test) — read-only Governed Potential Descent observer (logs what it WOULD
fire on recall+rewire; fires nothing). Re-verified locally (not the lane's say-so): **6/6 tests, all 5 kill-criteria PASS:**
1. U monotone-decreased along the would-fire trajectory.  2. conserved budget held under an adversarial all-high-value seed (spent 3 ≤ B 5).  3. **veto integrity: protected-path crossing blocked despite recallG=185** (non-offsettable).  4. low-calibration organ suppressed firing (g=7.6e-7 < τ).  5. **GPD reached the low-U attractor in spent=1 vs 20 for fixed-priority + random** (≈20× cheaper).
GPD survives synthetic simulation. **STILL OPEN:** the real-data confirm-or-kill (predict-vs-realize ΔU over the 1,000 matcher cues from the 9,487-report corpus) — NOT yet implemented; that's the next gate before any promotion past observe.

## ★ CORRECTION (owner, load-bearing) — the mathematical decoder is an LLM-WIELDED INSTRUMENT, not an ingress pre-processor
Earlier framing (decoder runs BEFORE the LLM, hands it a warm object) is WRONG per owner. Correct model:
**the LLM directly CALLS the decoder mid-reasoning** — `decode("<any text>") → D` (feature vector + COMPLETE
recall + energy/GVF state x + router tag + novelty/salience), and the LLM computes with the returned
numbers/equations itself. The engine is N1's `decodeIngress` logic; the CONTROL inverts — it's a callable
tool/skill (like `ai search`, like the matcher CLI), NOT a UserPromptSubmit hook. This is what "the LLM
operates mechanically with mathematics" means: the LLM wields the math instrument, not receives a pre-chewed
result. Composable — decode the user input, a sub-problem, or a retrieved doc, on demand, repeatedly.
Build: `yuri-decode.mjs` CLI/skill (reuse makeFeatureFn + matcher + computeU), the LLM invokes it. Honest
ceiling unchanged: cheap stages (vectorize/recall/route/score) compute; AI-complete stages (intent/felt-core/
pivot-resolution) stay the LLM's job — the decoder feeds them, emits ambiguity FLAGS, never false verdicts.

## The three architects compose into one loop
1. **N1 — Mathematical decoder (instrument):** input → math object D (the LLM's working representation). It is GPD's afferent input — `x = computeU(stateFromInput)` makes every decoded text a GVF state GPD can act on.
2. **N2 — Bidirectional flow = autodiff over U:** GPD-forward = forward-mode (action→effect on U = action selection); GPD-reverse = reverse-mode = backprop (defect→credit-assignment over prior transitions). **The adjoint tape ALREADY EXISTS** — `computeDeltaU` returns `componentDeltas` logged per tick in energy-trace/*.jsonl. The whole-system check = a **replay-sum equality test** (`Σ logged-cause Δτ == realized U_τ`); a mismatch = the de-mystified Čech H¹ inconsistency (ship the assertion, drop the cohomology library). TRAP: two graphs — reverse over the energy-term DAG = real credit-assignment; reverse over the circuitry graph = reachability ≠ causation (a ranked suspect set, label it so).
3. **N3 — Auto-calibration (C-first) + owner-override:** the seam HALF-EXISTS (energy-weights.json + token-gated /apply + veto weights floored). Replacement for hand-tuning: learn C (Platt+conformal, Brier/log-loss) where labels exist; λ-DISCOVER searches soft-weight θ by replay (fitness = −free-energy); veto fields frozen forever. **Owner-override = PRIOR (nudge) + CLAMP (hard corridor the tuner can't exceed) + PIN (freeze).** Authority: owner-bounds.json > learned-shadow > defaults. CAN-calibrate-now: matcher/conformance/dispatch (have labels); CANNOT: energy/epistemic (sparse → owner-pinned — the refusal IS the safety property). CUSUM drift-guard ships in v1.

## Research lanes
- **Simulation methodology (DS1):** the real taxonomy (Monte-Carlo / mutation-adversarial / predict-vs-realize / param-sweep-λ-DISCOVER / replay-counterfactual) + the validity bar (ground-truth labels; must be able to FALSIFY; the generator ≠ the scorer; report variance; adversarial seeds). Designed a reusable `sim(scenarioGen, mechanism, scorer, killCriteria, seeds)` harness any mechanism plugs into. THIS is how sims speed work: replace days×few real trials with ms×millions synthetic, find the optimum + kill bad designs before building.
- **Program synthesis (CX2/DS3):** real but hyped. The safe form = **synthesis-WITH-verification** (every candidate must pass YURI's existing tests/proof-gate — the suite is the oracle; a synthesized artifact is exactly as trustworthy as the suite). MDL/Solomonoff as the scoring principle (shortest program fitting spec+tests); λ-DISCOVER as the search. Realistic YURI slice NOW: math-module scaffolds from a spec, property/mutation-test generation, merge-kernel boilerplate adapters. Over-reach to avoid: arbitrary complex logic.
- **Numerology/Alchemy → NEXUS (DS4):** mechanisms not mysticism. PROVABLE/high-confidence mappings: coincidentia-oppositorum = the pairing law (S+V, proven via 3²+4²=5²) · as-above-so-below = GVF scale-invariance · transmutation = GPD descent · solve-et-coagula = decompose→merge→recompose. Real encoding cores: gematria = a deterministic hash, digital-root = mod-9 ring homomorphism, harmonic ratios = resonance, φ/continued-fractions = anti-phase-lock. Verdict: alchemy = a NAMING/UX vocabulary Marcel resonates with + a few real encoding channels for the decoder feature space — NOT a source of new math. Keep mechanisms, leave mysticism out of the assertion layer.

## Build order (shadow-first, owner-gated throughout)
1. ✅ gpd-shadow (DONE, verified synthetic) → **next: the real-data confirm-or-kill** (1,000 matcher cues, predict-vs-realize).
2. `yuri-decode.mjs` — the LLM-wielded decoder instrument (CORRECTED framing).
3. `calibration-shadow.mjs` — C-first on matcher (+ dispatch if lane-feedback volume confirmed) + owner-bounds.json (prior/clamp/pin) + CUSUM drift-guard.
4. `gpd-reverse-shadow.mjs` — credit-assignment + replay-sum consistency (reuse the existing tape; validate free against logged dominantTerm).
5. the `sim()` harness; then program-synthesis scaffolding; numerology encoding channels as decoder features.

## Standing method (this session, for recall)
5–12 agent waves (Codex+DeepSeek separate quota + native Claude agents), each finding calculable+provable+
simulable, refute-by-default, SHADOW-MODE-FIRST (observe→advisory→enforce), owner-gated. Verify lane output vs
live (caught: CJS-can't-require-ESM, wrong hook deny-format, .agents sandbox-block, tail-truncation of lane
output). Document everything to 02_RESOURCES/RESEARCH + a high-tier memory anchor.

SEE: [[yuri-breakthrough-GPD-2026-06-06]], [[yuri-governance-architecture-GVF-2026-06-06]], [[governance-gvf-gpd-breakthrough]], [[yuri-improvement-backlog-2026-06-06]].
