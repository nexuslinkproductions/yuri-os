---
name: math-primitive-candidates-parking
description: PARKED growing list of math/science primitives worth transferring into YURI mechanisms — feeds the improvement-candidate lineup. Capture-and-track, do NOT build until pulled. Compounds like the math logbook + science-source ledger.
metadata: { node_type: candidate-parking, started: 2026-06-06, status: parked }
tags: math_primitives, transfer_candidates, parked, improvement_lineup
---

# Math/Science Primitive Candidates — PARKED (feed the improvement lineup)

Owner directive (Marcel 2026-06-06): note powerful math/science primitives as they surface; do NOT dive in or overload — park them, look into them when pulled. This list compounds; the [[transfer-distance-engine-v2-build-plan]] + the upcoming node-improvement lineup consume it.

## Entry 1 — π · golden ratio (φ) · Fibonacci (Marcel 2026-06-06)
> "very powerful, has been the root for massive breakthroughs over and over again when applied in right sequencing." Emphasis on **sequencing**. There's more to come — don't overload yet.

Concrete, embedding-free CS/math hooks (so the future look-in starts grounded, NOT a build order):
- **Golden-section search (φ-ratio interval reduction)** — derivative-free 1-D optimization that shrinks a bracket by φ each step, reusing one evaluation per iteration. → candidate for tuning YURI scalar knobs (energy weights, thresholds, β/η/θ) without gradients or a labeler. Directly serves the "stop hand-tuning weights" thread.
- **Fibonacci search** — comparison-optimal search on a sorted/unimodal array using Fibonacci splits. → candidate for the salience/threshold band locating.
- **φ "most irrational" / continued-fraction anti-resonance (KAM lineage)** — φ is the hardest number to approximate by rationals → maximally de-correlated/quasiperiodic SEQUENCING. → candidate for sampling cadence, polling/backoff intervals, jitter that avoids resonant lock-step ("right sequencing" maps here). Also φ-based low-discrepancy sequences (R2/plastic-constant, Roberts 2018) for even coverage without RNG.
- **Knuth multiplicative (Fibonacci) hashing** — multiply by ⌊2^w/φ⌋ for uniform bucket spread. → candidate for dedup/bucketing in memory governance (Hopfield-saturation probe, hot-tier).
- **Fibonacci heap** — O(1) amortized decrease-key. → candidate IF a priority-queue hot path appears (Dijkstra/A* already in math-kernel could use it).
- **π / Fourier** — FFT/spectral already implicit in the graph spectral card (4); π shows up wherever periodicity/phase does. → candidate for any cyclic/seasonal signal in the energy trace.

**Why this fits the moat:** these are exactly the "apply known math in the right sequence to improve a mechanism" pattern the whole math logbook embodies. Park here; promote individual hooks into logbook cards (with the smallest-experiment + adversarial verification discipline) only when a target organ pulls them.

## Entry 2 — PROJECT DIRECTIVES (Marcel 2026-06-06, PARKED — do NOT execute yet)

### 2a. Rename the math engine → **NEXUS CORE**
Owner: the math engine is the single most crucial + advanced core in YURI — it holds everything mathematical/scientific. Plan: **separate concerns** — the normal research DB holds research/notes; **everything math/calculus/science/physics lives in NEXUS CORE** (the math engine itself). Name ties to the future company **Nexus Link**. Scope when executed: rename `_SYSTEM/Scripts/math/` surface + the MATH-SCIENCE-MANUAL to "NEXUS CORE", carve a clean boundary between NEXUS CORE (the engine) and the research corpus, update the circuitry + registries (continuity law). Owner-gated; staged like the offload→cross-ref rename.

### 2b. Steganographic OWNERSHIP WATERMARK across the OSS (mathematically encoded)
Owner: YURI is going OSS + will draw big-firm attention. Embed "**Creation by Marcel Spatz — Nexus Link**" provenance **invisibly + undetectably + unremovably** across the codebase, so even a "stolen" copy carries his authorship without the taker knowing. Mathematically encoded (Marcel: **Fibonacci sequence** is a fitting generator) — undecodable/unremovable without knowing how it was created. Needs DEEP RESEARCH.
- **Legitimacy:** this is IP-protection of his OWN creation in his OWN OSS release — software watermarking / authorship-provenance, a real CS field. Not deceptive-against-users.
- **Grounding for the research (start warm):** software watermarking (static = embed in constants/structure; dynamic = runtime/behavioral) · spread-spectrum watermarking (survives refactor) · **Fibonacci/φ-encoded constants** — seed magic numbers, default weights, tolerances, test fixtures, hash seeds with values derived from a private Fibonacci/φ generator (e.g. specific F(n) mod K reused as the seed across modules); recoverable by whoever knows the generator, invisible noise to everyone else · a privately-held **watermark key** (the generator + index map) that lets Marcel later PROVE authorship by revealing it · combine with LICENSE + public timestamp (git history / OSS release date) as the legal layer · robustness: marks must survive variable-renaming, reformatting, and partial copying.
- **Open question for research:** how many independent mark sites + what redundancy to survive aggressive refactoring while staying statistically invisible (no detectable pattern) — and how to make the proof one-sided (Marcel can demonstrate it; an attacker can't forge or scrub it).
