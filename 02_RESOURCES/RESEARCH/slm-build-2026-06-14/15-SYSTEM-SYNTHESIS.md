# 15 — VERY DEEP SYNTHESIS: the research → YURI THE SYSTEM

> Owner: "the entire deep research was for the SYSTEM too, not just YURI-7B. Out of all the research, what
> can we build in, simulate, calculate — very very deep synthesis." Inputs woven: the verified corpus
> (10–14 + P1–P5/L1–L5/G1–G3), a 6-subsystem synthesis swarm (S1–S6), the EML×YURI sim (3/3 pass), two
> quantum sims (coupling + order-effect), and deepseek's EML-system analysis. Per-subsystem detail: S1–S6 docs.

## 0. The thesis (the organizing principle)
The entire 2026 frontier we surveyed — RLVR, process reward models, generative verifiers, zeroth-order
optimization, constrained decoding, self-evolution (rStar-Math) — **converged on one shape: a verifier at the
center.** Everyone is *building* a verifier. **YURI already has one** — `computeU`/`gateProposal`, deterministic,
12-term, shipped, 55,754 firings. That is the unfair advantage the literature keeps trying to manufacture.

But the synthesis exposed the brutal truth: **YURI's verifier is firing BLIND and OPEN-LOOP.** 55,754 gate
firings, **ZERO outcome labels** (S1). The arsenal measures→commits but never **learns** (S6: the LEARN rung is
open). So the research's single biggest gift to the *system* is not an exotic method — it's **closing the
verifier's feedback loop.** Do that, and the whole verifier-centric stack (calibration, reward-model eval,
self-evolution, ZO tuning, eventually an SLM PRM) unlocks behind it.

## 1. THE KEYSTONE — close the loop (S1 + S6 + S4 converge here)
**Outcome-label harvester.** Wire `resolveOutcome(runId, outcome∈{0,1})` (the infra already exists in
`yuri-energy-trace-outcomes.mjs`; the join-target dir is just absent) to deterministic post-hoc signals YURI
already emits: claim promoted-and-survived, protected-path edit reverted in-session, rejected Bash later fixed,
dispatch accepted by destination lane. Backfill the ~94 in-era v3 rejects first (the FP surface). Then schedule
a **LEARN-rung cron** (sibling of the homeostat) that scores recorded gate/izanagi/prediction-ledger forecasts
against outcomes → converts the whole system from open-loop into the **rStar-Math self-evolution loop**
(measure→commit→**learn**→recalibrate) with `computeU` as the deterministic verifier. *This is the one move that
makes every other move possible. Source: PRM (2305.20050), Rewarding Progress (2410.08146), rStar-Math (2501.04519).*

## 2. The verified evidence base (ran/checked this session, not asserted)
- **EML × YURI sim (3/3 pass):** eml(x,y)=exp(x)−ln(y) reconstructs the elementary basis at ~1e-15; YURI's
  real `confidenceDecay` is EML-expressible (4.6e-13); gradient descent recovered its `halfLife` exactly
  (12.0000, err 1.9e-15). → EML symbolic regression genuinely works on YURI formulas at shallow depth.
- **Quantum Schmidt coupling test:** the EML weight-hardening ↔ energy corner-law resonance is **genuine
  coupling, not cosmetic** — shared-mechanism model → Schmidt rank 2 (singulars 0.756/0.655), product model →
  rank 1. Both = "extremize an affine objective at a simplex vertex." Independently confirmed by deepseek
  ("two edges of one mechanism") and made concrete by S2 (eml-tree delegates hardening to `izanagi-bridge#vertices()`).
- **Quantum order-effect (qqEquality):** gate integrations **do NOT commute** — ZO-then-calibration (0.677) ≠
  calibration-then-ZO (0.651), |Δ|=2.6e-2; qqStatistic≈0. → **the roadmap below is ORDERED on purpose; the
  gains don't simply add.**

## 3. The ordered roadmap (order matters — QSIM B)

### Wave 0 — the unlock (do first, everything gates on it)
- **Outcome-label harvester + LEARN-rung cron** (§1). S/M effort, HIGH value. Caveat: auto-label rules are
  themselves hypotheses — each needs a spot-check or it just launders the gate's own bias as "truth."

### Wave 1 — build-in NOW (zero-GPU, system; post-labels where noted)
- **S1 · Gate-as-reward-model eval** (`yuri-energy-rewardbench.mjs`): score the gate with reward-model metrics
  (pairwise accuracy, best-of-N) — *finally answer "is the gate actually right?"* Source: VerifyBench/RewardBench-2/ToolRM.
- **S4 · Conformal C-layer** (`yuri-energy-conformal.mjs`, shadow-only): Platt/isotonic `pReject` + Mondrian
  conformal coverage → fills the GVF's explicitly-missing Energy C-layer; reuses the existing `conformalQuantile`.
- **S3 · generate-then-verify driver** (`gate-rerank.mjs`): N candidates → `extractClaims→cortexSnapshot→
  gateProposal` → accept argmin-ΔU clearing all 3 hard vetoes. The canonical RLVR pattern, applied to YURI's
  OWN actions + peer-lane outputs. + **grammar-constrain locally-served lane output to the claim-cortex schema**
  (XGrammar/Pre³).
- **S5 · ccr-compress into `buildContextPack`** (`llm-lane.mjs:944`): replace blind `body.slice(0,remaining)`
  head-truncation with reversible structural→semantic compression (LLMLingua-2-style). **One function, zero
  deps, upgrades EVERY peer dispatch** (mimo/deepseek/glm). + schema-validate-and-gate peer outputs.
- **S6 · `verifierBestOfN(candidates)`**: computeU over N proposals → pick the survivor. The cheapest path to
  "test-time compute" — spend cycles on verification, not model size.
- **S2 · `eml-tree.mjs` as a 2nd generator in formula-foundry**: depth≤4 EML SR, weight-hardening delegated to
  `izanagi-bridge#vertices()` (the coupling, operationalized) → proof-gate validates. New differentiable
  formula-discovery organ.

### Wave 2 — simulate before committing
- **Identity-leak red-team (DO NOT SKIP):** fit a calibrator on (U→the gate's own verdict); show it hits ~100%
  and is worthless. Guards against calibrating the gate to itself — the most likely silent mistake. (S1/S4)
- **ZO beta-tuner vs grid:** SPSA forward-eval over the 10 soft betas (η,θ excluded) vs the current grid
  proposer — *only* worth building if the search space exceeds what a grid covers. Source: MeZO/AGZO/Steering-the-Noise. (S1)
- **EML calibration/term-discovery sims** (deepseek's Sim 2/3): EML vertex pre-filter vs brute-force enumeration;
  EML regression from claim-features→ΔU to surface candidate *new* energy terms (e.g. an entropy×staleness
  interaction). (S2/S4)
- **GRPO-reward-shape stress** (DAPO/GSPO over the trace U-distribution): does the 33:1 imbalance collapse
  policy entropy? Zero-GPU de-risk of a future SLM spend. (S1, lowest system value)

### Wave 3 — calculate / derive
- **Corpus power analysis:** exact in-era v3 reject count (~94 of 3,220) vs each calibrator's minimum
  (Platt ~50, conformal 500+) → decides whether conformal is possible today or must wait for corpus growth /
  v2 migration. **Gates the Wave-1 conformal layer.** (S1/S4)
- **Coupling confirmation on real traces:** once labels exist, run the Schmidt test on *behavioral* traces of
  EML-hardening vs corner-enumeration to confirm the rank-2 coupling empirically (this session's was structural).

## 4. Per-subsystem topMoves (detail in S1–S6)
- **S1 energy gate:** outcome-label harvester (the keystone).
- **S2 formula-foundry:** `eml-tree.mjs` 2nd generator, hardening via `izanagi-bridge#vertices()`.
- **S3 claim cortex:** generate-then-verify rerank driver around `gateProposal`.
- **S4 calibration:** `yuri-energy-conformal.mjs` shadow C-layer (Platt + Mondrian).
- **S5 memory/peers:** `ccr-compress` into `buildContextPack` — upgrades every peer dispatch.
- **S6 sim arsenal:** close the LEARN rung (cron) → self-evolution; `verifierBestOfN`; computeU as the sim `value()` oracle.

## 5. Honest caveats (the whole thing, sober)
- **Labels can lie:** auto-label rules encode assumptions; spot-check each, run the identity-leak control.
- **Corpus is small:** ~94 in-era v3 rejects; conformal wants 500+ → some Wave-1 items are corpus-size-gated.
- **EML has a depth-5 cliff (<1% recovery):** it discovers *shallow* terms + recovers known primitives; it can
  NOT recover the full 12-term composite (entropy/W₁ need inner-loop sums EML lacks). Adds terms, doesn't redesign.
- **ZO may not beat the grid** over only 10 betas — prove the grid is the bottleneck before building ZO.
- **Order matters (QSIM B):** adopt in wave order; don't assume gains add.
- **Not the SLM:** every item above is a *system* upgrade. The future 7B SLM is a downstream *consumer* of this
  hardened verifier (it distills the process-energy into a PRM, constrained-decodes to the claim-cortex schema) —
  not a prerequisite. The system gets better first; the SLM inherits it.

## 6. The one sentence
Close the verifier's feedback loop, and YURI stops being a system that *checks* and becomes a system that
*learns from checking* — which is exactly what the entire 2026 frontier is scrambling to build, except YURI
already owns the verifier.
