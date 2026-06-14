# L1 — Latest 7-9B Base Models (mid-2026)

> Research sweep: verified via HF model cards and official sources. Confidence tags: ✓ verified / ~ likely / ? uncertain.

## Cohort Summary

| Model | Params | License | Released | Best Benchmark | HW Fit (16GB) |
|---|---|---|---|---|---|
| Qwen3-8B | 8.2B | Apache 2.0 | Apr 2025 | MATH500=97.0 | Yes (4-bit) |
| OLMo 3 7B Think | 7B | Apache 2.0 | Dec 2025 | MATH=95.1 | Yes |
| Ministral-3-8B | 9B (8.4B LM) | Apache 2.0 | Dec 2025 | MMLU=76.1 | Yes (4-bit) |
| Gemma 4 E4B | 4.5B eff / 8B total | Apache 2.0 | Apr 2026 | GPQA-D=58.6 | Yes |
| Qwen3.5-9B | 9B (VLM+MoE) | Apache 2.0 | Mar 2026 | GPQA-D=81.7 | Tight |

---

## 1. Qwen3-8B ✓

**URL:** https://huggingface.co/Qwen/Qwen3-8B  
**Params:** 8.2B (6.95B non-embedding) · **License:** Apache 2.0  
**Released:** April 2025 · **Tech report:** arXiv 2505.09388

- Dual thinking/non-thinking mode: toggle via `enable_thinking` flag or `/think` `/no_think` soft prompts
- Native 32k context, YaRN to 131k; GQA (32Q/8KV heads)
- Benchmarks (on-policy distillation): MATH500=97.0, LiveCodeBench v5=60.3, AIME'24=74.4, GPQA-Diamond=63.3, MMLU-Redux=88.3
- Ecosystem: 1,470 adapter models, 1,699 finetunes, 302 quants; vLLM, llama.cpp, Ollama, Transformers

**YURI fit:** Primary base candidate. Thinking mode = verifier inference lane; non-thinking = fast dispatch. Largest ecosystem in this cohort; RLVR/GRPO recipes abundant.

---

## 2. OLMo 3 7B Think ✓

**URL:** https://huggingface.co/allenai/Olmo-3-7B-Think  
**Params:** 7B · **License:** Apache 2.0  
**Released:** December 2025 · **arXiv:** 2512.13961

- Fully open: weights + Dolma 3 corpus + training code + intermediate checkpoints
- Post-training: SFT → DPO → **RLVR on Dolci-Think-RL-7B** (verifiable rewards)
- Companion: OLMo 3-RL Zero 7B = bare RL-from-scratch pathway on same base
- Benchmarks: MATH=95.1, HumanEval+=89.9, BBH=86.6, IFEval=88.2, MMLU=77.8

**YURI fit:** Closest existing model to what YURI-7B is building. Study Dolci-Think-RL-7B reward construction before designing the energy-gate verifier objective. Use as research reference; optionally use as base if Qwen3-8B ecosystem fit proves insufficient for the RLVR training loop.

---

## 3. Ministral-3-8B ✓

**URL:** https://huggingface.co/mistralai/Ministral-3-8B-Base-2512  
**Params:** 9B total (8.4B LM + 0.4B vision encoder, modular) · **License:** Apache 2.0  
**Released:** December 2025

- 256k context (interleaved sliding-window) — largest native context in cohort
- Vision encoder is modular; text-only fine-tuning drops it cleanly
- Benchmarks: MMLU=76.1, MATH CoT=62.6, TriviaQA=68.1
- Ships with base, instruct, and reasoning variants; ~12GB at edge quant

**YURI fit:** Best context window. Suitable if YURI-7B verifier needs long-trace input. Weaker benchmark ceiling vs Qwen3/OLMo3. Solid fallback.

---

## 4. Gemma 4 E4B ✓

**URL:** https://huggingface.co/google/gemma-4-E4B  
**Params:** 4.5B effective / ~8B total (Per-Layer Embeddings) · **License:** Apache 2.0  
**Released:** April 2026

- Dense hybrid: local sliding-window (512 tok) + global attention
- Multimodal (text/image/audio), 128k context, native thinking mode
- Benchmarks (instruct): MMLU-Pro=69.4, LiveCodeBench v6=52.0, GPQA-Diamond=58.6, MATH-Vision=59.5

**YURI fit:** The effective text compute is only 4.5B — below the 7B target. Reasoning ceiling trails the top two. Monitor for a future VLM branch; not recommended for v1 text-only RLVR base.

---

## 5. Qwen3.5-9B ✓

**URL:** https://huggingface.co/Qwen/Qwen3.5-9B  
**Params:** 9B · **License:** Apache 2.0  
**Released:** March 2026

- Hybrid: Gated DeltaNet + sparse MoE + Gated Attention (non-standard)
- Full multimodal VLM; 262k native context, YaRN to 1M
- Benchmarks: MMLU-Pro=82.5, GPQA-Diamond=81.7, MathVision=78.9
- 374 finetunes, 372 adapters

**YURI fit:** Highest reasoning ceiling in cohort but non-standard hybrid MoE + VLM joint training complicates deterministic verifier wiring for text-only RLVR. Ecosystem recipes lag the architecture. Revisit for YURI-7B v2 in 2027.

---

## 6. OLMo 2 7B (baseline reference) ✓

**URL:** https://huggingface.co/allenai/OLMo-2-1124-7B  
**Params:** 7B · **License:** Apache 2.0 · **Released:** Nov 2024  
Benchmarks: MMLU=63.7, ARC-C=79.8. Superseded by OLMo 3 7B Think. Retain as ablation baseline only.

---

## Out-of-Scope Confirmed

- **Llama 4 Scout** — 109B/17B-active MoE, Llama 4 Community License, 48GB GPU minimum. No small dense Llama in 7-9B exists as of mid-2026.
- **Llama 3.3** — 70B only, no 7B variant.
- **Gemma 3 9B** — does not exist; Gemma 3 ships 1B/4B/12B/27B. The "9B" in roundups conflates with Gemma 2 9B (2024).
- **Phi-4-mini** — 3.8B, below scope. MIT license. Best in class at 3.8B but not a 7-9B base.
- **SmolLM3-3B** — 3B, out of scope.

---

## Sources

- Qwen3 HF card: https://huggingface.co/Qwen/Qwen3-8B
- Qwen3 tech report: https://arxiv.org/abs/2505.09388
- Qwen3.5-9B HF card: https://huggingface.co/Qwen/Qwen3.5-9B
- OLMo 3 7B Think HF: https://huggingface.co/allenai/Olmo-3-7B-Think
- OLMo 3 blog: https://allenai.org/blog/olmo3
- Ministral-3-8B HF: https://huggingface.co/mistralai/Ministral-3-8B-Base-2512
- Gemma 4 HF: https://huggingface.co/google/gemma-4-E4B
- Gemma 4 HF blog: https://huggingface.co/blog/gemma4
- Gemma DeepMind: https://deepmind.google/models/gemma/gemma-3/
- Llama 4 overview: https://serenitiesai.com/articles/llama-4-behemoth-maverick-scout-review-2026
