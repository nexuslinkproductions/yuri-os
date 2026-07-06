# B — SLM Training Methodology 2026 (Cited Findings)

> Angle B of the SLM Research Mission (brief: 00-SLM-RESEARCH-BRIEF.md). Local-first + online synthesis.
> Status: RESEARCH/PREP ONLY — BUILD is owner-gated.

## 1. BASE MODEL SELECTION — Verdict for a 7B YURI Build

**Best pick: Qwen3-8B-Base** (released 2025-04-29).
- Outperforms Qwen2.5-14B on >50% of benchmarks at 8B; STEM/coding especially.
  Source: [Qwen3 Technical Report](https://arxiv.org/html/2505.09388v1)
- 36L / 32Q+8KV heads, GQA + SwiGLU + RoPE + QK-Norm; 128K context native.
- Strong-to-weak distillation from Qwen3-72B used for sub-8B models — proven recipe.
- Apache 2.0 (commercially usable). Active HuggingFace ecosystem, TRL/Unsloth-ready.

**Close second: Llama 3.1 8B** — mature ecosystem, strong LoRA tooling, widest community.
  Source: [LoRA Land Technical Report](https://arxiv.org/pdf/2405.00732)

## 2. TRAINING PIPELINE (ordered by build phase)

### Phase 0 — Synthetic Data Curation
Generate YURI behavioral traces from Claude/DeepSeek-R1 teacher.
- DeepSeek-R1 recipe: ~800K verified CoT trajectories, pure SFT on student — no RL needed.
  Source: [DeepSeek-R1-Distilled](https://www.emergentmind.com/topics/deepseek-r1-distilled)
- REDI variant: include negative CoT traces for data efficiency.
  Source: [Distribution-Aligned Seq Distillation](https://arxiv.org/pdf/2601.09088)

### Phase 1 — SFT (QLoRA on rented H100, ~$2-10/run)
TRL SFTTrainer + Qwen3-8B, bf16, r=64 LoRA, max_seq_length=4096.
Local smoke-test: LoRA on 0.5B via MPS (float32 only — fp16 causes NaN on MPS).
Source: local — `skills/llm-trainer/references/local_training_macos.md`

### Phase 2 — Alignment
γ-SimPO: best average rank across 7-9B models in 2025 comparison. No reference model needed.
Source: [Robust Preference Optimization](https://arxiv.org/pdf/2506.03690)

### Phase 3 — GRPO (for verifiable YURI tasks)
GRPO with verifiable rewards: computeU energy gate IS the reward function.
ToRL extends GRPO to tool-use rewards.
Source: [AWS GRPO Blog](https://aws.amazon.com/blogs/machine-learning/overcoming-reward-signal-challenges-verifiable-rewards-based-reinforcement-learning-with-grpo-on-sagemaker-ai/)

### Phase 4 — Quantize + Serve
GGUF q4_k_m for llama.cpp/Ollama, OR mlx_lm.convert for MLX on M2 Pro.

## 3. NON-STOCHASTIC ANGLE (YURI's architectural moat)

Three layers:
- **XGrammar**: 100× speedup, pushdown automata, vLLM-native. Best performance.
- **Outlines**: FSM O(1)/token, regex+CFG, widest adoption.
- **LM-Format-Enforcer**: character-level probability filtering, 8.9% hallucination zero-shot.
  Source: [HuggingFace Guided Decoding](https://huggingface.co/blog/nmmursit/guided-decoding)
- **YURI spine as hard verifier**: generate → parse → energy-gate validate → resample if invalid.
- **Risk**: structure snowballing — constrained decoding on reflection tasks causes cascading errors. Scope to structured-output slots only.
  Source: [Structure Snowballing](https://arxiv.org/pdf/2604.06066)

## 4. MYTH vs BUILDABLE-NOW

| Claim | Reality |
|-------|---------|
| Train 7B from scratch locally | MYTH |
| QLoRA 7B on 16GB M2 Pro | MYTH (CUDA-only 4-bit) |
| Constrained decoding = deterministic | PARTIAL (grammar-valid, not value-det.) |
| GRPO replaces SFT | MYTH (SFT required first) |
| GRPO with computeU reward | BUILDABLE NOW |
| Outlines/XGrammar on MLX-served 7B | BUILDABLE NOW |
| SFT + SimPO on H100 (~$5-20/run) | BUILDABLE NOW |
