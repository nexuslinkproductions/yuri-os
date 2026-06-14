# S1 — Energy Gate as Deterministic Verifier/Reward (SYSTEM integration)

Subsystem: `computeU` / `gateProposal` / `yuri-energy-calibrate` — the 12-term weighted-simplex composite scoring every claim/dispatch transition. Lens: the gate IS an RLVR scorer / reward model. SLM is a secondary consumer; all items are zero-GPU SYSTEM upgrades. Papers arXiv-ID-verified (`11-ARXIV-BIBLIOGRAPHY.md`).

## Ground truth I verified (load-bearing)
- Trace = **55,754 records** (NOT 46k): **54,127 accept / 1,627 reject** → ~33:1 imbalance, must stratify.
- Era split: **52,343 pre-version, 191 v2 (KL), 3,220 v3 (Wasserstein)**. Live formula = v3; cross-era pooling fail-closed (`energy-calibration-contract` §1b). **Same-era usable corpus ≈ 3,220**, not 46k.
- **ZERO outcome labels.** `_SYSTEM/state/energy-trace-outcomes/` is absent. Infra is built (`yuri-energy-trace-outcomes.mjs` `resolveOutcome`, outcome∈{0,1}, runId join; `yuri-energy-gate-trace.mjs` `resolveGateVerdict`) — the join target is empty. **The trace has predictions, no ground truth.** This reframes the subsystem.
- Soft weights α β γ δ ε ζ ι κ λ μ; **barriers η,θ inviolable** (`SAFETY_FLOOR.barriersNeverCalibrated`).
- gateProposal returns `accept`+`reason`+`deltaU`+`dominantTerm`; vetoes (protected-path / structural-floor / L∞) non-offsettable, fire before ΔU.

## The reframe (separate leverage from cargo-cult)
The swarm says "computeU is your RLVR reward, plug into GRPO." True but downstream + GPU-gated. The SYSTEM leverage is the inverse: **the gate is a reward model we ship and never evaluated** — 55k fires, never asked "is it right?" RewardBench 2 / VerifyBench / FC-RewardBench exist to score reward models; we have one and skipped the eval. Everything calibration-shaped (Platt/isotonic→`pReject`, Mondrian conformal) is **blocked on labels that don't exist**. Cargo-cult risk: fitting Platt on `decision` calibrates the gate to itself, learns the identity, proves nothing. Real order: (1) manufacture labels, (2) eval gate as reward model, (3) calibrate, (4) ZO-tune betas.

## buildIn (zero-GPU, now)
- **B1 Outcome-label harvester** (THE prerequisite) → `yuri-energy-trace-outcomes.mjs`: wire `resolveOutcome` to signals YURI already emits; backfill v3 rejects first. Src 2305.20050 + 2410.08146.
- **B2 Gate-as-reward-model eval** → new `yuri-energy-rewardbench.mjs`: pairwise/best-of-N/per-stratum accuracy. Src 2509.11963, 2507.09884, 2506.01937.
- **B3 ECE + reliability diagram (v3)** → `yuri-energy-analyze.mjs --ece`: zero-blast read-only honest first pass.
- **B4 Process-energy** → `yuri-energy-gate-trace.mjs`: tag work-step → verdict sequence (PRM substrate). Src 2305.20050, 2410.08146.
- **B5 Calibrated `pReject`** → new `yuri-energy-conformal.mjs` SHADOW-only: Platt/isotonic + Mondrian conformal, fills GVF §4 C-layer. Src 2504.09310. Gated on B1+B2.

## simulate (before committing)
- **S1 Identity-leak red-team**: fit Platt on (U→decision), show ~100% worthless accuracy — the cargo-cult killer / B1 negative control. Src 2509.21882.
- **S2 ZO beta-tuner vs grid proposer**: SPSA forward-eval over 10 soft betas (η,θ excluded); MeZO's exact non-diff case. NOTE proposer is grid-search, NOT the "Thompson bandit" the research named. Src 2305.17333, 2601.17261, 2601.04710.
- **S3 GRPO-successor reward-shape stress**: DAPO/GSPO entropy-collapse check on the 33:1 reward dist (SLM-downstream; sim is zero-GPU). Src 2503.14476, 2507.18071.

## calculate (compute/derive)
- **C1 Usable corpus + power analysis**: exact in-era v3 reject count (~94) vs each calibrator's min labels (Platt ~50 / conformal 500+) → which option is honest today.
- **C2 Corner-law audit**: enumerate soft-weight simplex vertices under the two-sided objective; confirm grid isn't missing a vertex-optimum (the −0.0264 bug class). Src corner-law feedback + EML 2603.21852.
- **C3 β/μ coupling re-derivation under labels**: recompute whether μ=0.25·β cost-ratio holds on v3; magnitude-only, no flip risk. Src Doc D #1b.

## topMove
**Build B1 + backfill the v3 reject corpus.** Calibration, RewardBench eval, ZO tuner, SLM PRM distillation are ALL fenced behind a runId→outcome join that doesn't exist. The research's entire RLVR/reward framing is unusable until the gate has ground truth. Labels are the unlock.

## Honest non-moves
Don't fit any calibrator on `decision` (self-calibration). Don't call the grid proposer "Thompson". Don't tune η,θ by any method. Don't train a reward model on the M2 Pro (cloud-gated). Don't pool across eras (W₁ rescaled the drift term; the guard is correct).

_Result: 19EG_ENERGY_GATE_AS_RLVR_VERIFIER_SYSTEM_INTEGRATION_X_PASS_COMMITTED_