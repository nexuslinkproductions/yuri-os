# Angle A — SLM Build Path: Apple Silicon + Hybrid Economics
> Cited research synthesis · 2026-06-14 · YURI subagent lane

## Hardware Wall (M2 Pro / 16 GB)

| Operation | Verdict | Peak RAM |
|---|---|---|
| Train 7–12B from scratch | NO (cluster FLOPs) | N/A |
| Full fine-tune 7B | NO | ~28 GB |
| LoRA 7B (FP32) | MARGINAL | ~14 GB |
| QLoRA 7B/8B | YES | ~7 GB |
| QLoRA 12B | NO | OOM |
| Inference 7B 4-bit | YES | ~4.5 GB |
| Inference 13B 4-bit | TIGHT | ~8 GB weights |

Context ceiling on 16 GB: **4096–8192 tokens** max. [[starmorph](https://blog.starmorph.com/blog/apple-silicon-llm-inference-optimization-guide)]

## Tooling Matrix

| Tool | Apple Silicon | Cloud GPU | Notes |
|---|---|---|---|
| mlx-lm | Native | — | QLoRA auto-mode; fastest on M-series |
| PyTorch+MPS | Yes (limited) | — | bf16/fp32 only; NaN on fp16 |
| Unsloth | NO | H100/A100 | 2× faster than Axolotl on A100 |
| Axolotl | NO | H100/A100 | YAML-config, FSDP2, production |
| llama.cpp | YES (Metal) | — | Inference/GGUF serve only |

[[spheron](https://www.spheron.network/blog/axolotl-vs-unsloth-vs-torchtune/)] · [[markaicode](https://markaicode.com/run-fine-tune-llms-mac-mlx-lm/)]

## Cloud GPU Pricing (2026-06-14)

| Provider | H100 80GB | A100 40GB |
|---|---|---|
| Vast.ai | $1.49–1.87/hr | <$1.00/hr |
| RunPod | $1.50–1.99/hr | ~$0.79/hr |
| Lambda Labs | $2.99/hr | ~$1.10/hr |

**7B QLoRA full run (Unsloth, H100, 5K examples): ~3 hrs = $5–9.**
[[intuitionlabs](https://intuitionlabs.ai/articles/h100-rental-prices-cloud-comparison)]

## The Hybrid Pipeline

```
1. LOCAL SMOKE TEST (mlx-lm, M2 Pro, free)
   mlx_lm.convert --hf-path <model> -q --q-bits 4
   mlx_lm.lora --model mlx_model --train --data ./data --iters 50

2. CLOUD TRAIN (Vast.ai H100, Unsloth, $5–15/run)
   pip install unsloth[colab]
   → QLoRA SFT on YURI task data → save adapter

3. MERGE + GGUF EXPORT (cloud, before teardown)
   model.merge_and_unload() → save merged HF model
   python convert_hf_to_gguf.py model/ --outtype q4_K_M

4. LOCAL SERVE (llama.cpp Metal, M2 Pro)
   llama-server -m model.Q4_K_M.gguf --port 8080 -ngl 99
   → YURI hooks → http://localhost:8080/v1
```

[[decodesfuture](https://www.decodesfuture.com/articles/llama-cpp-gguf-quantization-guide-2026)]

## Myth vs Buildable-Now

| Claim | Reality |
|---|---|
| Unsloth on Mac | False — CUDA only |
| 12B QLoRA fits 16 GB | False — training OOMs |
| Train from scratch on M2 Pro | Not a time problem — compute class |
| GGUF is low quality | False — within 1–2% of FP16 at Q4_K_M |
| QLoRA needs only 6 GB for any size | 6 GB = inference; training = 2× |

## YURI Application

- `run-lora-finetune.sh` already wires mlx-lm + Ollama. Cloud step is the gap.
- SFT target: YURI dispatch/routing/classification decisions as JSONL.
- llama.cpp localhost:8080/v1 slots into existing OpenAI-compat lane routing.
- 8192 ctx sufficient for YURI triage tasks; long-context stays on Claude lane.

## Sources
- [markaicode MLX-LM 2026](https://markaicode.com/run-fine-tune-llms-mac-mlx-lm/)
- [insiderllm Fine-Tuning Mac](https://insiderllm.com/guides/fine-tuning-mac-lora-mlx/)
- [intuitionlabs H100 Prices](https://intuitionlabs.ai/articles/h100-rental-prices-cloud-comparison)
- [spheron Axolotl vs Unsloth](https://www.spheron.network/blog/axolotl-vs-unsloth-vs-torchtune/)
- [decodesfuture GGUF Guide](https://www.decodesfuture.com/articles/llama-cpp-gguf-quantization-guide-2026)
- [starmorph Apple Silicon Inference](https://blog.starmorph.com/blog/apple-silicon-llm-inference-optimization-guide)
- Local: `run-lora-finetune.sh`, `local_training_macos.md`, `peft/SKILL.md`