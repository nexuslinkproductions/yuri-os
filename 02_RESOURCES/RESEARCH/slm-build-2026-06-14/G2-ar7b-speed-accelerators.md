# G2 — AR 7B Speed Accelerators
**Sweep:** 2026-06-14 | **Target:** YURI-7B (Qwen3-8B AR base, llama.cpp/MLX, 16GB M2 Pro)
**File:** `02_RESOURCES/RESEARCH/slm-build-2026-06-14/G2-ar7b-speed-accelerators.md`
**Cross-ref:** `dflash-viability-2026-06-03.md` (DFlash = consume-only, PARK)

---

## Apple Silicon Reality Check (applies to all draft-model methods)

M2 Pro (200 GB/s bandwidth). At 7B Q4 on Metal, each draft token costs ~0.5–1ms — essentially the same as verification. Measured: EAGLE-3 = **1.05×** on M3 Ultra mlx-lm prototype. Break-even threshold: draft must run **≥2.5× faster** than target. A paired 0.5B draft at 140 t/s vs 9B at 42 t/s = 3.3× ratio → +25.7% throughput (AtomGradient). A self-speculative same-model approach achieves only 1.35× ratio → **net loss**.

---

## Methods — Priority Order for YURI-7B

### 1. n-gram Speculative Decoding [SHIP NOW]
- **Lossless | Zero training | llama.cpp built-in**
- `--spec-type ngram-mod --draft-max 64` — no draft model
- Gain: **1.3–1.5× M2 Pro** (estimated); 1.5–2× code/repetitive
- Context-dependent: strong on structured/code, weak on creative
- **Action:** Enable in Ollama/llama-server config today.

### 2. EAGLE-3 [CUDA CLOUD; NOT M2 PRO]
- arXiv:2503.01840 · NeurIPS 2025 · llama.cpp PR #18039 merged Jun 2026
- **Lossless | Frozen backbone | Head finetune only**
- Gain: **~2× CUDA** (Qwen3-8B: 187→365 t/s on H200); **~1.05× M2 Pro** (not profitable)
- Draft: `Tengyunw/qwen3_8b_eagle3` on HF (SGLang); training: 2–4h 4×H100
- vLLM: PR #16937. mlx-lm: prototype only.
- **Action:** Wire during cloud serve phase. Skip for local M2 Pro inference.

### 3. Medusa-1 [ALTERNATIVE HEAD FINETUNE]
- arXiv:2401.10774 · ICML 2024 · vLLM native
- **Lossless (Medusa-1) | Frozen backbone | MLP heads (lighter than EAGLE)**
- Gain: **2.2× lossless** (GPU). Apple Silicon unknown.
- NOT in llama.cpp mainline. Prefer EAGLE-3 if llama.cpp is primary.

### 4. MTP Self-Distillation [TRAINING-PHASE UPGRADE]
- arXiv:2602.06019 · Feb 2026 (Kirchenbauer et al.)
- **NOT lossless (~5% GSM8K drop) | Light online distillation finetune**
- Converts existing AR checkpoint to MTP behavior → unlocks `draft-mtp` in llama.cpp
- Gain: **>3× decoding speedup**; quality cost covered by computeU verifier on YURI tasks
- **Action:** Wire MTP loss in the YURI-7B training pass (QLoRA on rented H100).

### 5. FastMTP [DRAFT-HEAD QUALITY BOOSTER]
- arXiv:2509.18362 · Sep 2025 (Tencent)
- **Lossless | Single MTP head finetune + vocab compression**
- Gain: **2.03× average; 82% over vanilla MTP**
- SGLang-focused; no llama.cpp support confirmed.
- **Action:** Stack on EAGLE-3 head training when operational.

### 6. Lookahead Decoding [OVERLAP WITH N-GRAM]
- arXiv:2402.02057 · Feb 2024 · vLLM/TRT-LLM native
- **Lossless | Zero training**; 1.8× MT-bench
- Not in llama.cpp mainline — n-gram covers this slot. Use if migrating to vLLM.

### 7. MTP Native draft-mtp [HARD NO FOR Qwen3-8B]
- Qwen3-8B has NO pretrained MTP heads (nextn_predict_layers absent in GGUF)
- Only Qwen3.5/3.6, Gemma 4, DeepSeek-V3/R1 have native heads
- Attempting draft-mtp on Qwen3-8B: 0× gain (no tensors to load)

### 8. LayerSkip / Self-Speculative [NEEDS RETRAINING]
- arXiv:2404.16710 · Meta 2024. Requires layer-dropout pretraining.
- Inference-only CLaSp variant: 1.3–1.7× with minor quality drop; no llama.cpp support.
- Not applicable to standard Qwen3-8B checkpoint without retraining.

---

## arXiv IDs — Verified via export.arxiv.org/api
2503.01840 ✓ · 2401.10774 ✓ · 2402.02057 ✓ · 2401.15077 ✓ · 2406.16858 ✓ · 2602.01469 ✓ · 2509.18362 ✓ · 2602.06019 ✓ · 2404.16710 (confirmed via HF/Semantic Scholar)