# P4 — Distillation & Small-Model-Punches-Above-Weight
## Annotated Bibliography for YURI-7B Build

> Research area: knowledge distillation, on-policy distillation, data-quality training, MoE→dense
> transfer, weak-to-strong generalization, verifier-guided small reasoning models, test-time compute.
> All papers verified by fetching arxiv.org/abs pages. Status: 2026-06-14.

---

### 1. MiniLLM — On-Policy Distillation via Reverse-KL
**arXiv:** [2306.08543](https://arxiv.org/abs/2306.08543) | Gu et al. | ICLR 2024

Replaces forward-KL SFT with reverse-KL distillation on student-generated sequences, eliminating
exposure bias. Students (120M–13B) show improved quality, calibration, and reduced hallucination.
**YURI mechanism:** maps directly to the GRPO-with-computeU loop and DPO/SimPO alignment stage in
the 7B cloud-train pipeline; the on-policy sampling design is the correct base for YURI's reward-
guided training.

---

### 2. DistiLLM — Streamlined Distillation with Skew-KL
**arXiv:** [2402.03898](https://arxiv.org/abs/2402.03898) | Ko et al. | ICML 2024

Introduces a skewed-KL loss and adaptive off-policy sampler achieving up to 4.3× training speedup
over prior KD methods at matched or better quality.
**YURI mechanism:** efficiency upgrade for the TRL/Unsloth QLoRA SFT stage on rented H100; skew-KL
replaces plain cross-entropy loss in the base SFT recipe without architectural change.

---

### 3. Textbooks Are All You Need (phi-1)
**arXiv:** [2306.11644](https://arxiv.org/abs/2306.11644) | Gunasekar et al. (Microsoft) | 2023

phi-1 (1.3B) reaches 50.6% HumanEval pass@1 — matching models 10× larger — using only 7B tokens of
synthetic textbook-quality data. Clearest proof that data quality dominates parameter count on bounded
tasks.
**YURI mechanism:** training data / SFT pairs — YURI's own gate verdicts and claim-cortex outputs ARE
the 'textbook-quality' corpus; the Phi result validates harvesting structured internal decisions as
training signal rather than scraping generic web data.

---

### 4. Phi-4 Technical Report
**arXiv:** [2412.08905](https://arxiv.org/abs/2412.08905) | Abdin et al. (Microsoft) | 2024

Phi-4 (14B) surpasses its GPT-4 teacher on STEM QA through multi-agent synthetic data generation and
curriculum design — demonstrating that a well-distilled small model can exceed its teacher on a
bounded domain.
**YURI mechanism:** training data / SFT pairs — validates using YURI's organ pipeline (computeU,
claim-cortex, xref) as the multi-agent self-revision loop that generates high-quality training signal;
also confirms the bounded-task thesis in Section 3 of the 7B playbook.

---

### 5. DeepSeek-R1 — Reasoning via RL + Distillation to 7B
**arXiv:** [2501.12948](https://arxiv.org/abs/2501.12948) | DeepSeek-AI | 2025

RL-trained reasoning from a large model distills into 7B/8B students (DeepSeek-R1-Distill-Qwen-7B)
via 800K curated samples, with dramatic benchmark gains. Primary existence proof that reasoning-
capable 7B models are achievable via verifier-guided distillation.
**YURI mechanism:** computeU verifier as GRPO reward_fn — DeepSeek-R1's RL-from-verifiable-rewards
is the direct ancestor of YURI's deterministic gate as training objective; the QLoRA pipeline on
curated samples is the template for the $6–15 cloud-train run.

---

### 6. rStar-Math — Small LLMs Master Math via Self-Evolved Deep Thinking ★ TOP PICK
**arXiv:** [2501.04519](https://arxiv.org/abs/2501.04519) | Guan et al. (Microsoft) | 2025

Qwen2.5-Math-7B: 58.8% → 90.0% on MATH; surpasses o1-preview by +4.5%, using MCTS guided by a
process reward model at inference time — no distillation from a stronger model required.
**YURI mechanism:** gateProposal as verifier-in-the-loop (RLVR) — rStar's PRM-guided MCTS is the
exact academic analog of YURI's architecture: generate N candidates → computeU scores each → best
passes. Proves this architecture wins at 7B scale against frontier models on bounded tasks.

---

### 7. Weak-to-Strong Generalization (OpenAI)
**arXiv:** [2312.09390](https://arxiv.org/abs/2312.09390) | Burns et al. (OpenAI) | 2023

Strong pretrained models fine-tuned on weak-supervisor labels consistently exceed the supervisor,
recovering close to GPT-3.5 performance from GPT-2-level supervision with auxiliary confidence loss.
**YURI mechanism:** computeU as training signal — W2SG theory explains why training YURI-7B on
deterministic gate outputs produces a student that generalizes beyond memorizing individual verdicts;
validates the 'weak but deterministic supervisor' design.

---

### 8. Every Expert Matters — MoE→Dense Distillation
**arXiv:** [2502.12947](https://arxiv.org/abs/2502.12947) | Kim et al. | 2025

Non-activated MoE experts contain transferable knowledge; Knowledge Augmentation + Student-Aware
Router recover it, outperforming conventional dense-to-dense KD when distilling MoE teachers.
**YURI mechanism:** MLX/cloud training pipeline — if YURI-7B uses DeepSeek-V3 (MoE) or Mixtral as
teacher, KA+SAR replace naive logit-matching and recover knowledge plain SeqKD misses from dormant
expert weights.

---

## Cross-Paper Synthesis for YURI-7B

The corpus converges on one system design: **data quality + on-policy/verifier-guided training +
verifier-in-the-loop at inference** is the triple moat that makes a 7B beat raw 12–40B models on
bounded tasks. No single component alone is sufficient.

- Phi-1/Phi-4 own the data-quality leg: synthetic structured signal beats web scale.
- MiniLLM + DistiLLM own the training-objective leg: on-policy + skew-KL beats naive SFT.
- DeepSeek-R1 + rStar-Math own the verifier leg: deterministic reward at train + inference time.
- W2SG explains WHY a deterministic-but-weak supervisor still produces a generalizing student.
- MoE→dense paper covers the teacher-selection risk if YURI uses a sparse frontier model.

YURI's `computeU` deterministic gate is the thread that runs through all five legs simultaneously —
one organ serving as data-quality filter, training reward, and inference verifier.
