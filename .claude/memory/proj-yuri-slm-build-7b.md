---
name: proj-yuri-slm-build-7b
description: "HIGH-PRIORITY (owner 2026-06-14): build YURI's own 7B SLM, hybrid-trained (rent-GPU fine-tune → serve local on M2 Pro/16GB), wrapping YURI's deterministic substrate as the control/verifier layer. RESEARCH/PREP now; BUILD is owner-gated — execute only on explicit 'go'."
metadata:
  node_type: memory
  type: project
  tier: high
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

GOAL: Build **YURI's own 7B SLM** (target LOCKED at 7B, owner 2026-06-14) and **transform the existing YURI
deterministic substrate into the control / reasoning / verification layer that wraps it** — "YURI as a
functional extension expressed as an SLM." SLM = language faculty; YURI spine (energy gate, claim cortex,
memory graph, nexus-rs Rust kernels, sim arsenal) = deterministic reasoning/memory/verification. Ties to the
investor-deck "non-stochastic SLM" vision + ASIAN_MOE_STRATEGIES (distill large MoE → Small MoE).

WHO: Marcel (owner, holds the "go"). Claude researches + preps + (on go) builds + verifies; peers (mimo/
deepseek/glm) advisory.

WHEN: **Research/prep NOW. BUILD is OWNER-GATED — start ONLY on Marcel's explicit "go." "Right now it's not
the time yet."** Gather + capture enough to execute on command; do not begin building. Likely a few months out
(Marcel originally tied it to a hardware upgrade).

WHERE: research/playbook → `02_RESOURCES/RESEARCH/slm-build-2026-06-14/` (00-SLM-RESEARCH-BRIEF.md = ground
truth; per-angle cited docs A–E from the research swarm; reindexed into the corpus).

STATE: HARDWARE = MacBook Pro M2 Pro / **16GB unified** / 19 GPU cores (local evidence). Honest feasibility:
train-from-scratch=NO; QLoRA fine-tune 7B on 16GB = *barely*, 12B=OOM (16GB is the wall); **7B 4-bit inference
= comfortable**. → BUILDABLE-NOW PATH = **HYBRID**: fine-tune/distill 7B on RENTED cloud GPU → quantize →
serve locally via MLX + wrap with YURI. Hardware upgrade (64–128GB M3/M4 Max) later pulls training in-house;
NOT required to start. Deep research IN FLIGHT (5-angle swarm A–E + 3 peers) → outputs land in the research dir.

RESEARCH COMPLETE (2026-06-14): 3 research waves captured + reindexed + committed — 10-SYNTHESIS+7B-PLAYBOOK,
11-ARXIV-BIBLIOGRAPHY (46 papers, API-verified), 12-FINAL-SWEEP-SUMMARY + L1–L5 (releases/frameworks/novel/
NVIDIA/eval, 27 IDs API-verified). DECISIONS: base = **Qwen3-8B** (primary, dual-mode, biggest ecosystem) +
**OLMo 3 7B Think** (`2512.13961`, fully-open RLVR 7B = the recipe to clone + swap computeU as verifier).
Bottleneck fix found: 2026 ZO frontier (Steering-the-Noise `2601.04710`, AGZO `2601.17261`) turns random
perturbation into effective descent → verifier-guided ZO on-device more viable. Use GRPO successors GSPO
`2507.18071`/LUSPO/VAPO, not vanilla GRPO. Pipeline settled: Unsloth+TRL GRPOTrainer(reward_fn=computeU)→
RSLoRA→GGUF Q4_K_M→llama-server Metal. bitsandbytes CONFIRMED CUDA-only (MLX = on-device tool). NVIDIA branch
scoped per-card (4090: QLoRA 7B 20-40min). Eval: BFCL V4 / τ-bench / LLMRouterBench / VerifyBench / TinyLLM.

NEXT: **PLANNING phase** (owner: "before we get on with planning this slm build") — turn the playbook into a
concrete staged plan + build the **training-method simulator** (memory×throughput×convergence; find/invent the
verifier-guided ZO method for 16GB or the NVIDIA branch). Then HOLD for "go" to execute. Do NOT install ML deps
/ start training before the go. NVIDIA card = PARKED MAYBE (awaiting friend's response).

SEE: [[proj-language-consolidation-priorities]] (Rust/Mojo/ML feed this) · 00-SLM-RESEARCH-BRIEF.md · ASIAN_MOE_STRATEGIES.md · investor-deck slm_development
