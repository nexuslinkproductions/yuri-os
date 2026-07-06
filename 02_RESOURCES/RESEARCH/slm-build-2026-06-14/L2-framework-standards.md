# L2 — Framework Standards + Docs (2026-06-14)

> Angle: current versions + notable 2025-2026 changes for the YURI-7B fine-tune/quantize/serve stack.
> All versions verified via PyPI or GitHub releases page. Confidence markers: [V]=verified, [L]=likely.

## Stack Snapshot (mid-2026)

| Framework | Latest Ver | Date | Confidence |
|-----------|-----------|------|------------|
| TRL | 1.6.0 | Jun 11, 2026 | [V] |
| Unsloth | v0.1.464-beta | Jun 12, 2026 | [V] |
| llama.cpp | b9637 | Jun 14, 2026 | [V] |
| vLLM | 0.23.0 | Jun 12, 2026 | [V] |
| mlx-lm | 0.31.3 | Apr 22, 2026 | [V] |
| PEFT | 0.19.1 | Apr 16, 2026 | [V] |
| XGrammar | 0.2.2 | Jun 11, 2026 | [V] |
| Outlines | 1.3.0 | May 13, 2026 | [V] |
| Axolotl | 0.17.0 | Jun 3, 2026 | [L] |

---

## TRL 1.6.0 [V]
- **v1.0 (Apr 2026):** production milestone — unified YAML config, CLI, named Trainers (GRPOTrainer, DPOTrainer, SFTTrainer, RewardTrainer). Research repo → stable framework.
- **v1.4:** chunked cross-entropy SFT, up to 50% VRAM reduction.
- **v1.6:** AsyncGRPO rollout worker (separate process), A2PO trainer, KTO VLM support, cross-tokenizer alignment in GOLD.
- GRPO/DAPO/RLVR have replaced RLHF as dominant post-training paradigm.
- Native vLLM integration for online rollout generation bottleneck.
- Source: <https://github.com/huggingface/trl/releases>

## Unsloth v0.1.464-beta [V]
- GRPO, DAPO, DPO, KTO, PPO, RM all supported.
- FP8 RL+GRPO (Nov 2025); ultra-long-context RL 380K window (Jan 2026).
- QAT (quantization-aware training) — train quantized from start, avoids post-hoc quality loss.
- MTP speculative decoding: 1.4-2x faster inference.
- GGUF tensor parallelism: +30% throughput (v0.1.464).
- GRPO gradient checkpointing available.
- Source: <https://github.com/unslothai/unsloth/releases>

## mlx-lm 0.31.3 / MLX v0.31.2 [V]
- M5 Neural Accelerator support (macOS 26.2+); nvfp4/mxfp8 ops; QQMM.
- CUDA backend now available (quantized matmuls).
- Ollama 0.19 (Mar 2026): MLX backend, decode 58→112 tok/s on M5 Max.
- 16GB M2 Pro: 7B inference ~40 tok/s; LoRA fine-tune practical only for <=3B.
- Third-party mlx-tune: SFT/DPO/GRPO/Vision on-device, Unsloth-compatible API.
- Source: <https://github.com/ml-explore/mlx/releases>

## llama.cpp b9637 [V]
- Rolling daily builds (b9000+). Repo: ggml-org/llama.cpp.
- Q4_K_M = 2026 production standard (98% quality, 30% file size).
- CUDA 13.3, ROCm 7.2, OpenVINO 2026.0 supported.
- XGrammar is default structured-output backend in llama.cpp server.
- GBNF grammar endpoint: lightweight server-side constrained decoding.
- Emerging: TurboQuant (ICLR 2026) KV cache compression → TQ4_K_M format expected Q3 2026.
- Source: <https://github.com/ggml-org/llama.cpp/releases>

## vLLM 0.23.0 [V]
- Model Runner V2 default for Llama, Mistral, Qwen3 dense.
- Experimental Rust frontend; multi-tier KV cache offloading.
- Batch-invariant inference: 28.9% latency reduction.
- Disaggregated prefill/decode for production.
- XGrammar default structured-output backend.
- Primary use for YURI-7B: GRPO online rollout via TRL+vLLM pairing.
- Source: <https://github.com/vllm-project/vllm/releases>

## PEFT 0.19.1 [V]
- DoRA (Conv1d/Conv2d), RSLoRA (use_rslora=True), LoftQ, orthogonal init.
- New C3A (Circular Convolution Adaptation) — higher effective rank than LoRA.
- INC quantization to LoRA; QAT with GPTQ.
- target_modules='all-linear' for full model coverage.
- Source: <https://pypi.org/project/peft/>

## XGrammar v0.2.2 [V]
- Default structured-gen backend: vLLM, SGLang, TensorRT-LLM, MLC-LLM, llama.cpp server.
- Near-zero overhead JSON via adaptive token caching.
- 97.1% schema accuracy on complex nested structures vs Outlines 76.4%.
- Cross-platform: Python/C++/JS/Swift, CPU/GPU/TPU.
- Pre3 paper (arXiv 2506.03887): deterministic pushdown automata extension.
- Source: <https://github.com/mlc-ai/xgrammar>

## Outlines 1.3.0 [V]
- FSM-based constrained decoding; regex, JSON schema, grammar.
- Backends: HuggingFace Transformers, vLLM, llama.cpp, MLX.
- Can load GGUF models directly.
- 2026 production pattern: Outlines for dev/proto, XGrammar for deploy.
- Source: <https://pypi.org/project/outlines/>

## Axolotl 0.17.0 [L]
- Config-driven, reproducibility-first fine-tuning.
- GRPO + PRM (process reward modeling) support.
- QAT, sequence parallelism, multimodal (LLaMA-Vision, Qwen2-VL, Pixtral).
- Source: <https://pypi.org/project/axolotl/>

---

## 2026 Standard Pipeline (verified consensus)

```
SFT (QLoRA rank-16, RSLoRA, 1-3 epochs, lr=1e-4)     ← Unsloth+TRL on H100
  → optional DPO/SimPO alignment pass
  → optional GRPO with deterministic reward_fn          ← computeU maps here
  → merge_and_unload()
  → convert_hf_to_gguf.py → Q4_K_M                    ← llama.cpp tool
  → llama-server -ngl 99 (Metal)                        ← M2 Pro local serve
  → XGrammar grammar constraints at inference            ← structured output guarantee
```

Key 2026 shift: QAT (quantize during training) emerging as superior to post-hoc quantization.
TRL AsyncGRPO (v1.6) reduces GPU idle during rollout — use this, not synchronous GRPO.
