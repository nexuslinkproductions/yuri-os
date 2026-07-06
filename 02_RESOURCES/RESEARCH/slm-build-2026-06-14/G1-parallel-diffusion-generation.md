# G1 — Parallel / Diffusion Text Generation: Google + Broader Landscape
**Sweep:** 2026-06-14 | **Angle:** Non-AR / parallel text generation; YURI-7B fit

## Mechanism: AR vs Diffusion LM
**AR:** one token at a time, left-to-right, O(n) forward passes.
**Diffusion LM:** all tokens masked/noised, iteratively denoise the full block in parallel over T steps
(T << n for long sequences). Like an editor revising a full draft at once. Enables true bidirectional
attention → better infilling/editing; trades per-step cost for fewer sequential bottlenecks.

**Decisive question:** diffusion LMs need bidirectional attention + masking objective — structurally
incompatible with causal AR. YURI-7B (Qwen3-8B) **cannot bolt on diffusion decoding** at inference.
Conversion fine-tune IS proven at 7B scale (Dream 7B, FAST-dLLM v2).

## Google: Gemini Diffusion + DiffusionGemma
| Model | Open? | Speed | YURI fit |
|-------|-------|-------|----------|
| Gemini Diffusion (I/O May 2025) | No (waitlist) | ~1,479 tok/s | no — closed |
| DiffusionGemma 26B-A4B (Jun 10, 2026, Apache 2.0) | Yes | 1,100+ tok/s H100 FP8 (~4x AR) | no — 26B MoE, Gemma 4 base |

DiffusionGemma quality trade-off: MMLU Pro 77.6% vs AR 82.6%; AIME 2026 69.1% vs 88.3%.
No arXiv paper for either model as of June 2026.

## FAST-dLLM v2 — Cheapest AR→Diffusion Conversion (KEY)
- [arXiv 2509.26328](https://arxiv.org/abs/2509.26328) · Oct 2025
- Adapts pretrained AR → block diffusion: **~1B token fine-tune** (500x cheaper than Dream full path).
- **2.5x speedup** over AR decoding, lossless quality. Hierarchical KV caching preserved.
- **YURI fit: yes-needs-finetune** — $10-50 on rented H100. Phase-2 candidate post RLVR build.

## Dream 7B — AR-Initialized Diffusion LM
- [arXiv 2508.15487](https://arxiv.org/abs/2508.15487) · Aug 2025 · Open weights
- Initializes from Qwen 2.5-7B / LLaMA3-8B AR weights → discrete diffusion via noise rescheduling.
- Matches Qwen 2.5-7B benchmarks. Full-attention path: ~580B tokens (expensive; use FAST-dLLM v2).
- **YURI fit: yes-needs-finetune** — existence proof a Qwen-family 7B AR → diffusion LM is feasible.

## LLaDA Family (trained from scratch)
- **LLaDA 8B** [arXiv 2502.09992](https://arxiv.org/abs/2502.09992) · Feb 2025 — from scratch, competitive with LLaMA3-8B.
- **LLaDA2.0** [arXiv 2512.15745](https://arxiv.org/abs/2512.15745) · Dec 2025 — AR conversion (Ling base); 2.1x speedup (535 vs 256 TPS).
- **LLaDA-MoE** [arXiv 2509.24389](https://arxiv.org/abs/2509.24389) · Sep 2025 — 7B/1.4B active, 20T scratch train.
- **YURI fit: no-different-model-class** — scratch training or proprietary base; not applicable.

## SEDD — Foundational Discrete Diffusion Loss
- [arXiv 2310.16834](https://arxiv.org/abs/2310.16834) · ICML 2024 Oral · Lou, Meng, Ermon
- Score-entropy loss for discrete data. 25-75% perplexity gain vs prior diffusion LMs; 32x compute
  reduction at same quality. **YURI fit: no** — training loss only; inapplicable to AR inference.

## Mercury / Mercury 2 (Inception Labs, closed)
- Mercury 2 (Feb 2026): 1,009 tok/s on Blackwell; 5x faster than speed-optimized AR competitors.
- Closed API, trained from scratch. **YURI fit: no** — reference ceiling for diffusion class gains.

## Block Diffusion (ICLR 2025 Oral)
- [arXiv 2503.09573](https://arxiv.org/abs/2503.09573) · Arriola, Kuleshov group
- Interpolates between AR (block=1) and full diffusion (block=seqlen); SOTA among diffusion LMs.
- Foundation architecture FAST-dLLM v2 builds on. **YURI fit: yes-needs-finetune** (framework).

## Verdict Table
| Path | Cost | Speedup | YURI-7B |
|------|------|---------|---------|
| Scratch (LLaDA, SEDD) | ~20T tokens | 2-4x | NO |
| Dream full-attention | ~580B tokens | 2-3x | NOT NOW |
| **FAST-dLLM v2** | **~1B tokens** | **2.5x** | **YES (Phase-2)** |
| LLaDA2.0 WSD | Unknown | 2.1x | UNCERTAIN |
| DiffusionGemma weights | 26B MoE, wrong class | 4x | NO |
| Inference bolt-on | None | 0x | DOES NOT EXIST |

**Cite:** DiffusionGemma HF · arXiv 2509.26328 · arXiv 2508.15487 · arXiv 2502.09992 ·
arXiv 2512.15745 · arXiv 2310.16834 · arXiv 2503.09573 · arXiv 2509.24389