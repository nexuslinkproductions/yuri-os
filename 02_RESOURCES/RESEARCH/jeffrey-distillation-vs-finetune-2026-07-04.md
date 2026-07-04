# Jeffrey (René Spatz assistant) — Distill vs Fine-Tune vs Prompt+RAG Verdict

> Deep-research capture 2026-07-04 (Sonnet research lane, online-verified ≥2 sources per load-bearing claim).
> Goal: locally-run ~10-16B German-speaking work assistant for René Spatz (custom-gear.ch, Kydex holsters, non-technical).

## LOCAL PRIOR ART

YURI already ran the same decision tree for its own SLM build (June 2026, `02_RESOURCES/RESEARCH/slm-build-2026-06-14/`):

- **Verdict already reached locally: true from-scratch train/distill = NO on consumer hardware; hybrid = YES.** `10-SYNTHESIS-AND-7B-PLAYBOOK.md` L12-19: Adam optimizer state ~8B/param → 7B needs ~48GB optimizer state alone; bitsandbytes 4-bit QLoRA is CUDA-only (no MPS); mlx-lm quant-LoRA runs on Metal but swap-heavy on 16GB.
- **Proven local serving number**: Qwen3.5-9B Q5_K_M = 6.3GB, 100% GPU, 22.6 tok/s (M2 Pro). 12B Q4 ≈ 7.7GB tight-but-workable on 16GB; comfortable on 24GB+.
- **Reusable YURI tooling**: `_SYSTEM/training/scripts/run-lora-finetune.sh` (mlx-lm LoRA pipeline) + `promote-model.sh` → Ollama. `B-training-methodology.md` names Qwen3-8B-Base as base pick, GGUF Q4_K_M for serving.
- **Myth-bust documented** (`B-training-methodology.md` L57-65): "Train 7B from scratch locally" = MYTH. "QLoRA 7B on 16GB M2 Pro" = MYTH (CUDA-only 4-bit). "SFT on rented H100 (~$5-20/run)" = BUILDABLE NOW.

## MODEL LANDSCAPE 2026 (verified online)

| Model | Size | License | Notes |
|---|---|---|---|
| **Qwen3/3.5-8B/9B** | 8-9B | Apache 2.0 | YURI-proven locally (22.6 tok/s M2 Pro); Qwen3.5 multilingual to 201 languages |
| **Phi-4** | 14B | MIT | Best STEM density but explicitly **weak on tool-calling/agentic use** — wrong pick for an assistant that acts |
| **Gemma 4 12B** | 12B | Gemma license | "Best balance of performance, efficiency, multimodal, ease of use" — top generalist pick in 2026 roundups |
| **Mistral Nemo 12B** | 12B | Apache 2.0 | 128k context, tuned for multilingual efficiency incl. European languages |
| **Ministral-3-14B** | 14B | — | Named in 2026 academic eval specifically for **native German support** (arxiv 2606.04592) |

No dedicated German leaderboard for this size class surfaced — [UNVERIFIED] as ranked benchmark; verified: Qwen3.x, Gemma 4, Mistral Nemo/Ministral-3 all ship native/strong German per vendor docs + the cited academic eval.

## DISTILL vs FINE-TUNE vs PROMPT+RAG (cost table)

| Approach | Compute | Data | $ | Time | Expertise | Verdict |
|---|---|---|---|---|---|---|
| **True distillation** (teacher→student KD) | Teacher inference + training run | 10k-800k teacher traces (DeepSeek-R1 recipe ~800K CoT) | **$5K-15K+** | Days-weeks | ML engineer | **Overkill.** "Distill" in the ask is loose usage for "make it smaller/local" — consume an already-distilled model instead. |
| **LoRA/QLoRA fine-tune** on 10-16B base | 1 rented H100 or owned Mac 32GB+ | 200-2,000 curated pairs (200 hand-curated beats 2,000 noisy) | **$2-20/run** cloud; $0 on Mac | 1-3h cloud; ~2h Mac | Moderate (Unsloth/Axolotl/MLX-LM) | Right-sized IF persistent behavioral shift needed that a system prompt can't hold. |
| **Prompt + RAG only** | Inference only | 0 training; a knowledge folder indexed | **$0** | Minutes-hours | Low (Modelfile SYSTEM + RAG store) | **Recommended starting point.** Prompt controls persona/rules; RAG supplies facts (Kydex specs, pricing, suppliers). |

Key correction: hobbyists in 2025-2026 never do literal teacher-student distillation for personal assistants — every recipe source (codersera, insiderllm, buildmvpfast) describes LoRA/QLoRA on an already-strong small base. Real distillation is what Alibaba/Google do upstream to produce Qwen3-8B/Gemma-4-12B.

## RECOMMENDED JEFFREY PIPELINE

**Phase 0 (ship same day, $0):** Gemma 4 12B or Qwen3.5-9B via Ollama + German Modelfile SYSTEM block (René's business persona: Kydex tolerances, house tone, "ask before quoting custom orders") + lightweight RAG folder (product specs, pricing, supplier contacts). Test empirically with René 1-2 weeks. Resolves ~80% of "make Jeffrey sound/act right" without touching weights. Give the model real tool-calling (per FB:SLM-NOT-LESSER), let usage reveal gaps.

**Phase 1 (only if Phase 0 insufficient):** LoRA/QLoRA on the Phase-0 base.
- Curate 200-500 (input, ideal-output) pairs from René's real work — customer message → ideal reply, German, his voice.
- Train via **MLX-LM on Marcel's Mac** (free, ~1-2h for 9-14B QLoRA, reuse `run-lora-finetune.sh`) OR rent H100 $2-20 via Unsloth/Axolotl (Axolotl CUDA-only → cloud path). Unsloth MLX support beta [UNVERIFIED for production].
- Merge adapter → GGUF Q4_K_M/Q5_K_M → Ollama via existing `promote-model.sh` flow.

**Best single base at 10-16B for German + tool-calling: Gemma 4 12B**, with Qwen3.5-9B as strong second (already proven live on this hardware class, Apache-2.0). Avoid Phi-4 (weak tool-calling).

**Honest cost verdict:** Phase 0 = one afternoon, $0 — do unconditionally. Phase 1 = 1-3 evenings curation + $0-20 compute + one evening training/serving. True distillation ($5K-15K+) ruled out.

## SOURCES

- https://huggingface.co/blog/daya-shankar/open-source-llms
- https://gemma4-ai.com/blog/best-local-ai-models-2026
- https://acecloud.ai/blog/best-open-source-llms/
- https://computingforgeeks.com/open-source-llm-comparison/
- https://arxiv.org/pdf/2606.04592 (Ministral-3-14B/Qwen3/Gemma-4 German eval)
- https://www.stratagem-systems.com/blog/lora-fine-tuning-cost-analysis-2026
- https://dl.acm.org/doi/full/10.1145/3778534.3778570
- https://codersera.com/blog/fine-tuning-llms-complete-guide-2026/
- https://www.spheron.network/blog/axolotl-vs-unsloth-vs-torchtune/
- https://www.buildmvpfast.com/blog/mlx-apple-silicon-ai-development-mac-fine-tune-llm-2026
- https://insiderllm.com/guides/fine-tuning-mac-lora-mlx/
- https://docs.ollama.com/modelfile
- Local: `02_RESOURCES/RESEARCH/slm-build-2026-06-14/10-SYNTHESIS-AND-7B-PLAYBOOK.md`, `B-training-methodology.md`
