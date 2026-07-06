# L3 — Novel / SOTA Methods for YURI-7B Build
**Sweep date:** 2026-06-14 | **Angle:** Beyond MeZO/QLoRA/GRPO — 2025-2026 bleeding edge

---

## 1. Zeroth-Order / Backprop-Free Advances

### AGZO — Activation-Guided Zeroth-Order Optimization
- **Ref:** [arXiv 2601.17261](https://arxiv.org/abs/2601.17261) · Jan 24 2026
- Perturbations constrained to activation subspaces (replaces isotropic MeZO noise).
- Directly narrows ZO vs first-order gap; same memory profile as MeZO.
- **YURI fit:** Primary ZO upgrade for M2 Pro 16GB. Low-variance gradient estimates from structured subspace = better signal from sparse verifier rewards.

### Steering the Noise — Prior-Informed ZO with Adaptive Direction Alignment
- **Ref:** [arXiv 2601.04710](https://arxiv.org/abs/2601.04710) · Jan 8 2026
- Selects / combines candidate perturbations to reduce ZO variance.
- Composable with AGZO as a wrapper; competitive with first-order methods.
- **YURI fit:** Variance-reduction layer on top of AGZO for noisy verifier signals.

### DistZO2 — Distributed Parallel ZO Fine-tuning
- **Ref:** [arXiv 2507.03211](https://arxiv.org/abs/2507.03211) · Jul 2025
- CPU offload + distributed parallel computation; significant throughput gain over single-device ZO.
- **YURI fit:** Future path when NVIDIA GPU is available. Enables larger-batch ZO beyond VRAM limits.

---

## 2. RLVR Successors (Beyond GRPO)

### GSPO — Group Sequence Policy Optimization (Qwen team, Alibaba)
- **Ref:** [arXiv 2507.18071](https://arxiv.org/abs/2507.18071) · Jul 24 2025 · [blog](https://qwenlm.github.io/blog/gspo/)
- Sequence-level importance ratio + clipping replaces GRPO's token-level approach.
- 2× higher clip rate, better stability and efficiency. Used in Qwen3 Instruct/Thinking post-training.
- **YURI fit:** Default RLVR algorithm upgrade. Binary per-sequence verifier signal maps cleanly to sequence-level clipping.

### LUSPO — Length-Unbiased Sequence Policy Optimization
- **Ref:** [arXiv 2602.05261](https://arxiv.org/abs/2602.05261) · Feb 5 2026 · [code](https://github.com/murphy4122/LUSPO)
- Fixes GSPO's length bias: per-sequence loss scaling + matched sampling + length-dependent clipping.
- SOTA on math and multimodal reasoning vs GRPO and GSPO.
- **YURI fit:** Use over GSPO if the verifier correlates reward with response length. Keeps chain-of-thought length honest.

### VAPO — Value-based Augmented PPO
- **Ref:** [arXiv 2504.05118](https://arxiv.org/abs/2504.05118) · Apr 2025
- PPO + value pretraining + decoupled GAE + length-adaptive GAE. AIME 2024: 60.4.
- Higher infra cost than GRPO family (requires separate value model).
- **YURI fit:** Candidate if GSPO/LUSPO plateau. Benchmark after the base RLVR loop is stable.

### DAPO — Decoupled Clip and Dynamic Sampling Policy Optimization
- **Ref:** Yu et al. 2025 (publicly discussed, part of RLVR landscape survey)
- Clip-Higher prevents entropy collapse; dynamic sampling removes zero-variance batches; token-level loss. Used as a component in VAPO.
- **YURI fit:** The Clip-Higher trick is worth borrowing regardless of which policy algorithm is chosen — prevents the verifier gate from collapsing the policy entropy too early.

### RLVR Implicitly Incentivizes Correct Reasoning (CoT-Pass@K insight)
- **Ref:** [arXiv 2506.14245](https://arxiv.org/abs/2506.14245) · Jun 2025 (Microsoft Research, EMNLP-adjacent)
- Proves answer-only verifiable rewards extend the reasoning boundary; introduces CoT-Pass@K.
- Resolves the "RLVR hurts diversity" paradox.
- **YURI fit:** Theoretical foundation for the build. CoT-Pass@K is the correct eval metric — adopt it as the primary YURI-7B reasoning benchmark.

---

## 3. Verifier Engineering

### VerIF — Verification Engineering for RL in Instruction Following
- **Ref:** [arXiv 2506.09942](https://arxiv.org/abs/2506.09942) · Jun 2025 (EMNLP 2025) · [code](https://github.com/THU-KEG/VerIF)
- Rule-based + LLM-based verifiers as GRPO reward. 7B IF-Verifier distilled from QwQ-32B on 130K examples replaces 32B verifier. SOTA on IFEval/Multi-IF/CFBench.
- **YURI fit:** Blueprint: YURI's deterministic gate = rule-based channel; a distilled 7B verifier = LLM-based channel. Shows small verifier is sufficient in the RL loop.

---

## 4. On-Policy / Speculative Distillation

### Speculative Knowledge Distillation (SKD)
- **Ref:** [arXiv 2410.11325](https://arxiv.org/abs/2410.11325) · Oct 2024 (ICLR 2025)
- Student proposes tokens; teacher resamples wrong ones (interleaved sampling). Outperforms offline KD and pure on-policy KD across math/translation/summarization.
- **YURI fit:** Best distillation path when a 32B–72B teacher is available for online calls. Fewer teacher forward passes than full on-policy rollout — critical under M2 Pro memory pressure.

### On-Policy Distillation Recipe (Phenomenology, Mechanism)
- **Ref:** [arXiv 2604.13016](https://arxiv.org/abs/2604.13016) · Apr 14 2026
- Identifies failure modes and recovery strategies; success requires shared thinking patterns and progressive alignment on high-probability tokens.
- **YURI fit:** Pre-commitment read — tells which teacher models are compatible with 7B targets before wasting compute.

---

## 5. Test-Time Compute Scaling

### T1 — Tool-Integrated Verification for Test-Time Scaling (SLMs)
- **Ref:** [arXiv 2504.04718](https://arxiv.org/abs/2504.04718) · Apr 2025 (ICLR 2026)
- 1B Llama + code interpreter verifier > 8B Llama on MATH. Offloads memorization-heavy verification to tools; SLM handles higher-level reasoning.
- **YURI fit:** Direct architectural reference. YURI's deterministic gate is the code-interpreter equivalent. Confirms the SLM + external verifier pattern works at 1B, safe to assume at 7B.

### Test-Time Scaling Makes Overtraining Compute-Optimal (T2 Scaling Laws)
- **Ref:** [arXiv 2604.01411](https://arxiv.org/abs/2604.01411) · Apr 2026
- Train-to-Test laws: smaller model trained longer + test-time multi-sample beats larger model at same total budget.
- **YURI fit:** Justifies overtaining YURI-7B beyond Chinchilla and allocating budget to test-time sampling with the verifier. Use T2 curves to plan the compute split.

---

## Confidence Notes
- All arXiv IDs verified via export.arxiv.org/api. GSPO blog verified at qwenlm.github.io. LUSPO code repo confirmed at github.com/murphy4122/LUSPO. VerIF ACL Anthology entry confirmed.
- DAPO: confirmed as part of the RLVR landscape (referenced in multiple verified papers) but primary arXiv paper not independently fetched here — treat as `likely`.
- T2 scaling law paper is a preprint (Apr 2026); not yet conference-accepted as of sweep date.
