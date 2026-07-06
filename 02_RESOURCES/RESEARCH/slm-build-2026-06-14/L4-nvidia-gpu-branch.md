# L4 — NVIDIA GPU Branch (MAYBE — friend's card)
> Research angle: what a single strong NVIDIA card unlocks vs 16 GB M2 Pro, per card.
> Status: MAYBE — awaiting friend confirmation. Written to 02_RESOURCES/RESEARCH/slm-build-2026-06-14/L4-nvidia-gpu-branch.md

## Per-card ceiling (summary)

| GPU | VRAM | QLoRA 7B | Full-FT 7B | QLoRA 13-14B | GRPO 7B | From-scratch |
|-----|------|----------|-----------|--------------|---------|--------------|
| RTX 4090 | 24 GB | ✅ 20-40 min | ❌ | ⚠️ tight | ⚠️ feasible, 12h+ | ❌ |
| RTX 5090 | 32 GB | ✅ headroom | ❌ | ✅ comfortable | ✅ 14-18 GB | ❌ |
| A100 40GB | 40 GB | ✅ | ❌ | ✅ | ✅ proven | ❌ |
| A100 80GB | 80 GB | ✅ | ✅ | ✅ | ✅ | ⚠️ weeks |
| H100 80GB | 80 GB | ✅ | ✅ | ✅ | ✅ best | ✅ costly |

## CUDA-only tools (the real unlock)

- **Unsloth Triton kernels**: 2-5x speed, 70% VRAM savings — CUDA only, no Metal
- **bitsandbytes NF4**: QLoRA training backbone — MPS partial (M3 tested, M2 uncertain)
- **flash-attention-2**: native CUDA; MPS alternative exists but slower
- **vLLM rollout server**: GRPO generation — MPS via vllm-metal v0.2.0 (Apr 2026) but not parity
- **FP8 training**: H100/A100 native; RTX 40/50 series supported; not on M2

## GRPO/RLVR on consumer GPU

Unsloth VLLM_STANDBY mode + FP8 drops 7B GRPO to 14-18 GB peak → RTX 4090 tight but real.  
Minimum 300 steps for reward signal; expect 12h+ for meaningful convergence on 4090.  
computeU as reward_fn = deterministic verifier objective → no learned reward model needed, cheaper.

## Train → quantize → serve pipeline (verified)

```
NVIDIA (friend's card / cloud)
  Unsloth QLoRA SFT → GRPO → merge → save_pretrained_gguf("q4_k_m")
  [runs convert_hf_to_gguf.py on any CPU]
M2 Pro
  ollama create yuri-slm / llama-server -ngl 99
  Metal auto-accelerated, ~22-30 tok/s inference
  wire into llm-compat-contract.mjs OpenAI-compat endpoint
```

MLX export also available from Unsloth (15-40% faster on M2 vs GGUF; GGUF preferred for ecosystem).

## Decision tree

- **Friend has 4090**: SFT fast, GRPO overnight. Best card for iteration budget.
- **Friend has 5090**: GRPO comfortable, 13B QLoRA clean. Consumer ceiling for RLVR.
- **Friend has A100/H100**: All scenarios unlocked including multi-rollout GRPO at scale.
- **No friend card**: Fall back to $6-15 H100 cloud rental per the synthesis playbook.

## Key sources

- [Unsloth RL memory guide](https://unsloth.ai/docs/get-started/reinforcement-learning-rl-guide/memory-efficient-rl)
- [RTX 4090 7B QLoRA wall-clock](https://craftrigs.com/guides/fine-tuning-7b-llm-consumer-gpu-unsloth-lora/)
- [RTX 5090 vs 4090 AI benchmarks](https://www.kunalganglani.com/blog/rtx-5090-vs-rtx-4090-for-ai)
- [RTX 5090 specs (RunPod)](https://www.runpod.io/articles/guides/nvidia-rtx-5090)
- [GRPO+LoRA with verl (A100)](https://huggingface.co/blog/Weyaxi/engineering-handbook-grpo-lora-with-verl)
- [RLVR+GRPO OCaml (RTX 6000 48GB)](https://blog.nilenso.com/blog/2026/05/18/training-a-small-model-to-write-better-ocaml-with-rlvr-and-grpo/)
- [vLLM Metal v0.2.0](https://github.com/vllm-project/vllm-metal)
- [GGUF vs MLX on Apple Silicon 2026](https://contracollective.com/blog/gguf-vs-mlx-quantization-formats-apple-silicon-2026)
- [Pretraining GPU-hour costs](https://galileo.ai/blog/llm-model-training-cost)
- [Spheron fine-tune guide 2026](https://www.spheron.network/blog/how-to-fine-tune-llm-2026/)

*Research agent: Claude Sonnet 4.6 | 2026-06-14 | Wall-clock estimates are order-of-magnitude, not SLAs.*