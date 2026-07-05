# DeepSeek releases (May–Jul 2026) — local applicability verdict

> Deep-research capture 2026-07-04 (Sonnet lane, online-verified). Question: does DeepSeek's recent "massive throughput" work help René's local box (Windows, RTX 5060 Ti 16GB, 32GB DDR5)?

## Timeline

- **2026-04-24 — DeepSeek-V4 Preview**: V4-Pro (1.6T total/49B active) + V4-Flash (284B/13B active), MIT open weights, **1M native context** (api-docs.deepseek.com/news/news260424).
- **~2026-06 — V4 tech report**, arXiv:2606.19348 "Towards Highly Efficient Million-Token Context Intelligence" ← **this is the "massive throughput" paper**. Hybrid sparse attention: CSA (top-k over compressed KV blocks) + HCA (dense over heavily-compressed KV). At 1M ctx vs V3.2: V4-Pro ~27% FLOPs / ~10% KV footprint; V4-Flash ~10% / ~7%.
- 2026-05-07 FlashMLA kernel maintenance; Apr/Jun TileKernels + 3FS infra updates. Nothing model-new in July (only legacy API-name deprecation eff. 2026-07-24). Precursor: V3.2 DSA (arXiv:2512.02556).

## Local honesty check (16GB)

- V4-Flash ("small" tier) ≈ **158GB** mixed FP4/FP8 — H200/multi-GPU class. Not a 16GB story, ever.
- ollama `deepseek-v4-pro/-flash` = **:cloud tags only** (hosted, not local).
- llama.cpp: NO mainline V4 support (only experimental forks: antirez, cchuter CUDA). FlashMLA targets Hopper/Blackwell; consumer path (ik_llama.cpp) helps big MoE KV, irrelevant to 9-14B.
- Only locally-fitting DeepSeek family remains the older R1-Distill line (14B Q4 ≈ 8.5GB) — none of the V4 tech.

## The ACTIONABLE answer to the "8k is too low" worry

The fix isn't DeepSeek — it's KV economics + MoE offload, empirically proven mid-2026 on this hardware tier:

| Option | Max practical ctx on 16GB | Notes |
|---|---|---|
| Dense 12-14B Q4 (current plan) | ~16-32k | KV q4_0 (vs f16) cuts KV 2-4× — free context multiplier |
| **Qwen3.6 30B-A3B MoE + `n-cpu-moe` expert offload** | **~245-262k verified (15.3GB peak)** | needs the 32GB DDR5 (René has it); some tok/s cost from PCIe expert traffic |
| Gemma 4 27B-class MoE + offload | ~262k similarly | negligible tok/s drop (compute-bound) |
| DeepSeek V4 local | n/a | doesn't fit; cloud only |

(knightli.com VRAM tables · medium @tort_mario hands-on · chat-deep.ai GGUF guide)

## Verdict for Jeffrey

1. **Nothing V4-shaped changes the local plan** — sparse-attention gains live in datacenter stacks.
2. **Upgrade the worker tier to a MoE-with-offload option** (Qwen3.6-30B-A3B class) when long context matters: 200k+ ctx ≥ any assistant need; dense 12B stays the latency-optimal default.
3. **KV q4_0** on the dense worker: 8k → 16-32k for free. 8k was a conservative default, never a ceiling.
4. **Cloud burst**: René gets a Marcel-provisioned ollama API key → Jeffrey can route hard/long tasks to `deepseek-v4-flash:cloud` (1M ctx) while staying local for daily ops — hybrid, not dogma.
5. Recheck llama.cpp V4 mainline in 4-8 weeks [WATCH].

Sources: api-docs.deepseek.com/news/news260424 · arxiv.org/pdf/2606.19348 · arxiv.org/abs/2512.02556 · ollama.com/library/deepseek-v4-flash · github.com/ggml-org/llama.cpp/discussions/22376 · github.com/antirez/llama.cpp-deepseek-v4-flash · knightli.com/en/2026/05/01/deepseek-v4-local-vram-quantization-table/ · knightli.com/en/2026/05/01/qwen3-6-local-vram-quantization-table/ · github.com/deepseek-ai/FlashMLA · github.com/ikawrakow/ik_llama.cpp · dasroot.net/posts/2026/04/deepseek-v4-hybrid-attention-massive-contexts/
