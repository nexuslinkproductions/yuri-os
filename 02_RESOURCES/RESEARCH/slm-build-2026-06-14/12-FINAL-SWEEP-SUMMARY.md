# 12 — FINAL SWEEP SUMMARY (pre-planning ammunition)

> Owner: "one last run … expand to peer-reviewed + releases + docs, most-recent + novelty." 5-agent online
> sweep (WebSearch/WebFetch) + 3 cross-family peers. **All 27 arXiv IDs verified live against
> export.arxiv.org/api — titles matched, 0 fabrications.** Releases verified via HF model cards; framework
> versions via official docs. Per-angle docs: `L1`(releases) `L2`(frameworks) `L3`(novel) `L4`(NVIDIA branch)
> `L5`(eval). This is the last gather before PLANNING. Build stays owner-gated.

## What changes the plan (the decisive findings)

### 1. Base model — two-horse, decided
- **Qwen3-8B** (`2505.09388`, Apache-2.0, [card](https://huggingface.co/Qwen/Qwen3-8B)) — primary. Biggest
  fine-tune ecosystem in the 8B class (1470+ adapters), **dual thinking/non-thinking mode** that maps onto
  YURI's verifier-dispatch pattern (think = verifier inference, no-think = fast dispatch), fits 16GB in 4-bit.
- **OLMo 3 7B Think** (`2512.13961`, Apache-2.0, [card](https://huggingface.co/allenai/Olmo-3-7B-Think)) —
  the **research reference**: a *fully-open* 7B trained via **RLVR on verifiable rewards** with public training
  code + data (Dolci-Think-RL-7B) + checkpoints. We can study/reproduce its exact RLVR loop and **swap in
  `computeU` as the deterministic verifier.** Closest existing thing to YURI-7B.
- Confirmed: **no small dense Llama** in 2025–2026 (Llama 4 = 17B-active MoE; Llama 3.1-8B is the fallback).
  Qwen3.5-9B is stronger on paper but architecture-complex (hybrid DeltaNet+MoE) → defer to a later iteration.

### 2. The zeroth-order frontier solves our bottleneck
My time-calc flagged MeZO's slow convergence as the on-device constraint. The 2026 ZO literature attacks
exactly that:
- **Steering the Noise** (`2601.04710`) — turns random perturbations into *effective descent* → faster
  memory-efficient FT. Directly mitigates MeZO's variance/step-count problem.
- **AGZO: Activation-Guided Zeroth-Order** (`2601.17261`) — guides perturbations by activations (smarter than
  random) → fewer steps.
- **DistZO2** (`2507.03211`) — high-throughput memory-efficient ZO (scales if the NVIDIA branch lands).
- Net: verifier-guided ZO on-device is **more viable than last turn's estimate** — these cut the step-count.

### 3. Use the GRPO successors, not vanilla GRPO
- **GSPO — Group Sequence Policy Optimization** (`2507.18071`), **LUSPO** (`2602.05261`, length-unbiased),
  **VAPO** (`2504.05118`). RLVR is *theoretically proven* to extend reasoning from a base model
  (`2506.14245`). For the verifier objective: **ToolRM** (`2509.11963`), **VerIF** (`2506.09942`),
  **T1: tool-integrated verification for test-time scaling in small models** (`2504.04718`).

### 4. The 2026 build pipeline is settled (no exotic tooling needed)
`Unsloth + TRL 1.6 (GRPOTrainer with a custom reward_fn = computeU)` → `PEFT/RSLoRA rank-16` →
`convert_hf_to_gguf.py → Q4_K_M` → `llama-server -ngl 99` (Metal) / Ollama → wire to `llm-compat-contract.mjs`
like the existing lanes. On Apple Silicon: **mlx-lm** for local LoRA/serve; **bitsandbytes is CONFIRMED
CUDA-only** (the wall I conflated earlier) — so HF-QLoRA is an NVIDIA-branch tool, MLX is the on-device tool.

### 5. NVIDIA branch — scoped per card (MAYBE, awaiting the friend) — see `L4`
- **RTX 4090 (24GB):** QLoRA 7B SFT in **20–40 min**; full-FT 7B no; GRPO-with-computeU feasible but slow
  (~12h+/run → overnight). Unlocks CUDA stack (bitsandbytes, Unsloth, flash-attn, vLLM rollouts).
- **RTX 5090 (~32GB):** comfortable QLoRA 7B + headroom toward 13–14B QLoRA.
- **A100/H100 (40/80GB):** full-FT 7B, QLoRA 13–14B, fast GRPO rollouts.
- Pipeline either way: **train on NVIDIA → quantize → serve on M2 Pro.** Primary plan stays on-device/cloud;
  NVIDIA is a ready accelerator branch.

### 6. Eval stack — decided (see `L5`)
**BFCL V4** (tool-routing correctness, abstention + multi-turn) · **τ-bench** (`2406.12045`, agent reliability,
pass^k) · **LLMRouterBench** (`2601.07206`, routing) · **VerifyBench** (`2507.09884`) / **RewardBench 2**
(`2506.01937`) for the verifier itself · **TinyLLM** (`2511.22138`) + **AgentFloor** (`2605.00334`) for
small-model edge/agentic ceilings · **JSONSchemaBench** (`2501.10868`) + **SOB** (`2604.25359`) + **IFEval**
(`2311.07911`) for structured/instruction. Measure the **system** (7B + YURI verifier), not the raw model.

### 7. Distillation (if we want a custom small student) — `L3`
**On-Policy Distillation recipe** (`2604.13016`), **Speculative KD** (`2410.11325`), **Test-Time Scaling /
overtraining** (`2604.01411`).

## Readiness call
This is enough. The direction is published, the base models are chosen, the bottleneck (ZO convergence) has
fresh fixes, the pipeline is standard, the NVIDIA branch is scoped, the eval stack is set. **Next phase =
PLANNING the YURI-7B build** (the playbook → a concrete staged plan + the training-method simulator). Building
remains owner-gated ("when I say go"). NVIDIA card = parked MAYBE.
