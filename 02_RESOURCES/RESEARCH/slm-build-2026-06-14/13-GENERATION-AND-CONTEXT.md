# 13 — Token Generation Speed + Context Management (for YURI-7B)

> Owner: "generating tokens via stacking not sequentially (Google released a model) … how to change token
> generation for speed … context management methods like bracketing." 3-angle online swarm + 3 peers.
> **27/28 arXiv IDs verified live vs export.arxiv.org/api; 1 (`6122.36676`) returned nothing → FABRICATED,
> dropped** (the verify step caught it). Per-angle docs: `G1`(diffusion/parallel) `G2`(AR-7B accelerators)
> `G3`(context mgmt). Decisive lens throughout: *does it work on an existing AR Qwen3-8B, or need a new model class?*

## The one-line answer
**"Stacking not sequential" = diffusion / parallel decoding — a DIFFERENT model class you can't bolt onto an
AR 7B. BUT you can CONVERT an AR 7B to block-diffusion cheaply (FAST-dLLM v2: ~1B tokens, $10–50, 2.5× faster,
lossless). For speed without changing the model: on the M2 Pro the wins are small (speculative ≈ 1.05× at 7B Q4)
— the real, free context+speed wins are two llama.cpp flags. The big speed jump needs the NVIDIA branch or the
FAST-dLLM conversion.**

## (A) Parallel / diffusion generation — "stacking not sequential"
- **Google's model = Gemini Diffusion** (deepmind.google/models/gemini-diffusion, May 2025): non-AR, denoises
  token blocks in parallel, ~1,479 tok/s (~8–10×), but **closed** (waitlist, no weights/paper). Existence proof.
- **DiffusionGemma 26B-A4B** (Google, **open** Apache-2.0, Jun 2026): 4× faster than AR but quality drop
  (MMLU-Pro 77.6 vs 82.6). Reference architecture, wrong size/class for YURI.
- **Diffusion is a different model class** — bidirectional attention + denoising objective, not next-token.
  An AR Qwen3-8B cannot *do* diffusion at inference. Foundations: SEDD (`2310.16834`), Block Diffusion
  (`2503.09573`, interpolates AR↔diffusion), LLaDA (`2502.09992`, from-scratch 8B = AR-parity).
- **THE VIABLE PATH — FAST-dLLM v2** (`2509.26328`): converts a *pretrained AR model* to block-diffusion with
  **~1B tokens of fine-tune (500× cheaper than the full path), 2.5× decode speedup, no quality loss.** ~$10–50
  on a rented H100. **Dream 7B** (`2508.15487`) already proved a Qwen-2.5-7B AR base converts to diffusion.
  → **YURI-7B Phase-2 candidate:** after the RLVR/verifier base loop ships, convert Qwen3-8B → 2.5× throughput.
  (Diffusion *from scratch* = LLaDA/Mercury territory = ~20T tokens = no.)

## (B) Speed on an EXISTING autoregressive 7B (the bolt-ons)
Honest M2-Pro reality (G2 bottom-line): at 7B Q4 on Apple Silicon, **EAGLE-3 / Medusa net only ~1.05×** — the
draft/verify overhead cancels the gain at this size. These are *datacenter* wins (shine on the NVIDIA branch).
- **Ship-today, modest, lossless on llama.cpp:** n-gram / prompt-lookahead speculative, Lookahead Decoding
  (`2402.02057`). Free, small (~1.1–1.4×) on repetitive/structured output (good for YURI's schema'd outputs).
- **Multi-token prediction:** FastMTP (`2509.18362`), MTP-via-Self-Distillation (`2602.06019`) — needs a light
  finetune; better payoff than speculative at small scale.
- **Speculative family (NVIDIA-branch value):** EAGLE (`2401.15077`) / EAGLE-2 (`2406.16858`) / EAGLE-3
  (`2503.01840`), Medusa (`2401.10774`), P-EAGLE (`2602.01469`), self-speculative LayerSkip (`2404.16710`) /
  ConfLayers (`2604.14612`) / KnapSpec (`2602.20217`). We already assessed DFlash (a draft model) —
  `dflash-viability-2026-06-03.md`. **Verdict: park speculative until the NVIDIA card lands; it underperforms on M2.**

## (C) Context management (the actually-real methods)
- **"Bracketing" = NOT a technical method.** Two sweeps found no paper/mechanism; it's informal XML-delimiter
  prompting, no measured gains. Flag on sight.
- **P0 — two zero-cost llama.cpp flags (do these first, free, today):**
  1. `--cache-type-k q8_0 --cache-type-v q4_0` → **halves KV-cache memory** → more context / more concurrent
     verifier candidates in 16GB.
  2. prefix/`--cache-ram` reuse → **amortize the system-prompt prefill across N candidates** — directly speeds
     YURI's verifier-in-the-loop multi-candidate generation (generate N, score each with computeU).
- **KV-cache compression/quant:** KVQuant (`2401.18079`, 10M-ctx), KIVI (`2402.02750`, 2-bit), SnapKV
  (`2404.14469`), H2O (`2306.14048`), Crystal-KV (`2601.16986`, CoT answer-first). For long verifier traces.
- **Attention sinks / streaming:** StreamingLLM (`2309.17453`) — stable long-stream generation.
- **Prompt compression:** LLMLingua-2 (`2403.12968`) — compress the context fed to the 7B (big for bounded 8k).
- **Context extension:** YaRN (`2309.00071`) — extend beyond native ctx if needed.
- **Serving:** PagedAttention (`2309.06180`) — vLLM-side (NVIDIA branch), not llama.cpp/M2.

## YURI-7B takeaways (priority-ordered)
1. **Now, free:** the two llama.cpp KV flags + prefix reuse — biggest immediate win for verifier multi-candidate loops on 16GB.
2. **Now, cheap:** prompt compression (LLMLingua-2) + n-gram speculative for schema'd outputs.
3. **Phase-2, cheap conversion:** FAST-dLLM v2 → 2.5× via AR→block-diffusion on Qwen3-8B (lossless, ~$10–50).
4. **NVIDIA-branch:** EAGLE-3/Medusa + PagedAttention become worthwhile.
5. **Don't:** diffusion from scratch; chase "bracketing"; expect speculative magic on the M2.

## Verification note
27/28 arXiv IDs returned matching titles from export.arxiv.org/api. `6122.36676` (claimed in one item) returned
nothing → fabricated, excluded. Models verified via official pages (Gemini Diffusion, DiffusionGemma HF card).
