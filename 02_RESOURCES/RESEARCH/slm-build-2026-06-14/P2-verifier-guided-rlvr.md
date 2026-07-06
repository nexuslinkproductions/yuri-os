# P2 — Verifier-Guided Training / RLVR / Reward-from-Verifier
## Annotated Bibliography for YURI-7B Build
> Research collected 2026-06-14. All arXiv IDs verified via abs page fetch.

---

### TOP PICK

**[2402.03300] DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models**
Shao et al. (2024) · https://arxiv.org/abs/2402.03300
Introduces **GRPO** — group-normalized rewards replace the value function, eliminating the critic network.
This is the exact optimizer the YURI-7B playbook targets (`computeU` as `reward_fn`).
Informs: `computeU as GRPO reward_fn`, cloud H100 training pipeline.

---

### CORE RLVR PAPERS

**[2501.12948] DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning**
DeepSeek-AI (2025) · https://arxiv.org/abs/2501.12948
Pure RL from a deterministic verifier — no SFT cold-start required — elicits self-reflection and verification
at scale. Distilled 7B/8B variants prove the pattern transfers to YURI-7B scale.
Informs: `gateProposal / computeU verifier-in-the-loop`, distillation path.

**[2506.14245] Reinforcement Learning with Verifiable Rewards Implicitly Incentivizes Correct Reasoning in Base LLMs**
Wen et al. (2025) · https://arxiv.org/abs/2506.14245
Theoretical proof that outcome-only verifier reward (no step labels) implicitly improves intermediate
reasoning quality. Justifies using YURI's single computeU verdict as the sole training signal.
Informs: `computeU as training objective`, reward design simplification.

**[2502.19655] Med-RLVR: Emerging Medical Reasoning from a 3B base model via reinforcement Learning**
Zhang et al. (2025) · https://arxiv.org/abs/2502.19655
RLVR at 3B scale generalizes beyond math to knowledge-intensive domains (+8pt OOD vs SFT).
Closest empirical evidence that RLVR transfers to YURI's dispatch/routing/claim task distribution.
Informs: Domain generalization of RLVR for non-math verifiable YURI tasks.

---

### PROCESS REWARD MODELS (PRM)

**[2305.20050] Let's Verify Step by Step**
Lightman et al. / OpenAI (2023) · https://arxiv.org/abs/2305.20050
Foundational PRM paper: step-level reward outperforms outcome-only reward on complex reasoning.
Theoretical grounding for evolving computeU into a per-step training signal (PRM mode).
Informs: `computeU / energy-gate as programmatic PRM`, reward signal design.

**[2410.08146] Rewarding Progress: Scaling Automated Process Verifiers for LLM Reasoning**
Setlur et al. (2024) · https://arxiv.org/abs/2410.08146
Process Advantage Verifiers (PAVs) trained from auto-labeled data: +8% accuracy, 1.5–5x compute
efficiency vs outcome-only. Blueprint for building computeU-as-PRM without human annotation.
Informs: `computeU process verifier`, automated labeling strategy.

---

### SMALL-MODEL SELF-EVOLUTION

**[2501.04519] rStar-Math: Small LLMs Can Master Math Reasoning with Self-Evolved Deep Thinking**
Guan et al. (2025) · https://arxiv.org/abs/2501.04519
Iterative co-evolution of 7B policy SLM + process preference model; MATH benchmark 58.8%→90%.
The self-evolution loop pattern is directly applicable to YURI-7B + computeU as reward model.
Informs: Self-evolution loop design, policy + reward model co-training pattern.

---

### GRPO / POLICY OPTIMIZATION IMPROVEMENTS

**[2503.14476] DAPO: An Open-Source LLM Reinforcement Learning System at Scale**
Yu et al. (2025) · https://arxiv.org/abs/2503.14476
Decoupled clip bounds, dynamic sampling (filter all-pass/all-fail prompts), token-level policy gradient,
and overlong reward shaping — directly address instability when the verifier produces sparse/binary reward.
Informs: MLX/cloud GRPO training hardening against entropy collapse with sparse computeU signal.

---

### ZEROTH-ORDER / ON-DEVICE (NO BACKPROP)

**[2305.17333] Fine-Tuning Language Models with Just Forward Passes**
Malladi et al. / NeurIPS 2023 · https://arxiv.org/abs/2305.17333
MeZO: ZO-SGD with only forward passes, 12x memory reduction, inference-level footprint.
Enables computeU-as-objective training on the 16GB M2 Pro without backprop for smoke-tests.
Informs: On-device backprop-free training, `computeU` as ZO objective function.

---

### ADVERSARIAL / EVALUATION

**[2509.21882] Position: The Hidden Costs and Measurement Gaps of Reinforcement Learning with Verifiable Rewards**
Wu et al. (2025) · https://arxiv.org/abs/2509.21882
Identifies three confounds that inflate RLVR results: budget mismatch, attempt inflation, data contamination.
YURI-7B evaluation checklist — use budget-matched baselines and contamination screening.
Informs: Honest evaluation design for RLVR training claims.

---

## Key Mechanism Map

| YURI Mechanism | Primary Paper(s) |
|---|---|
| `computeU` as GRPO reward_fn | 2402.03300, 2501.12948 |
| Outcome-only verifier sufficiency | 2506.14245 |
| PRM / per-step reward design | 2305.20050, 2410.08146 |
| Self-evolution loop (policy + reward co-train) | 2501.04519 |
| GRPO stability (sparse/binary reward) | 2503.14476 |
| On-device ZO training (MeZO) | 2305.17333 |
| Non-math domain generalization | 2502.19655 |
| Evaluation integrity | 2509.21882 |
