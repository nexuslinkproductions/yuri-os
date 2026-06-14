# P1 — Memory-Efficient and Zeroth-Order On-Device Training
> Area agent: literature for YURI-7B build · gathered 2026-06-14 · 9 verified papers

## Context
YURI-7B trains a 7B SLM on-device (M2 Pro 16GB) or on rented cloud GPU via a **verifier-guided
zeroth-order** loop: `computeU` acts as a non-differentiable reward/objective; no backprop required
for the local iteration leg. The hybrid pipeline is: local ZO smoke-test → cloud QLoRA SFT →
DPO/SimPO alignment → optional GRPO with `computeU` as `reward_fn` → GGUF Q4_K_M → Ollama/llama.cpp.

---

## Papers

### 1. Fine-Tuning Language Models with Just Forward Passes (MeZO)
- **arXiv:** [2305.17333](https://arxiv.org/abs/2305.17333) · 2023 · NeurIPS 2023
- **Authors:** Malladi, Gao, Nichani, Damian, Lee, Chen, Arora (Princeton)
- **Mechanism:** YURI `computeU` verifier — core ZO training loop
- Forward-only SPSA gradient estimation; 12x memory reduction vs backprop; explicitly supports
  non-differentiable objectives. The architectural foundation for YURI's local training leg.
- **Top pick** — see §Top Pick below.

### 2. Sparse MeZO: Less Parameters for Better Performance in Zeroth-Order LLM Fine-Tuning
- **arXiv:** [2402.15751](https://arxiv.org/abs/2402.15751) · 2024 · NeurIPS 2025
- **Authors:** Liu, Zhu, Gong, Cheng, Hsieh, You
- **Mechanism:** `computeU` verifier / sparse parameter selection
- Applies ZO updates only to a sparsity-masked subset of weights (ZO error concentrates on large
  weights). 9% accuracy gain + 3.5x speedup over vanilla MeZO. YURI's verifier naturally provides
  the signal to rank parameter importance for the mask.

### 3. QLoRA: Efficient Finetuning of Quantized LLMs
- **arXiv:** [2305.14314](https://arxiv.org/abs/2305.14314) · 2023
- **Authors:** Dettmers, Pagnoni, Holtzman, Zettlemoyer
- **Mechanism:** MLX/cloud training pipeline (QLoRA SFT stage)
- 4-bit NF4 quantization + double quantization + paged optimizers; 65B model on single 48GB GPU.
  This is the reference implementation for the cloud SFT leg (TRL/Unsloth, ~$6–15/run).

### 4. GaLore: Memory-Efficient LLM Training by Gradient Low-Rank Projection
- **arXiv:** [2403.03507](https://arxiv.org/abs/2403.03507) · 2024 · ICML 2024 Oral
- **Authors:** Zhao, Zhang, Chen, Wang, Anandkumar, Tian
- **Mechanism:** MLX training pipeline / full-param alternative to LoRA
- Projects gradients into low-rank subspace during optimizer step; 65–82% optimizer memory reduction;
  proved 7B pre-training on a 24GB GPU. Drop-in complement to the QLoRA SFT leg when full-parameter
  gradient flow is needed for GRPO rounds.

### 5. Full Parameter Fine-tuning for Large Language Models with Limited Resources (LOMO)
- **arXiv:** [2306.09782](https://arxiv.org/abs/2306.09782) · 2023
- **Authors:** Lv, Yang, Liu, Gao, Guo, Qiu (OpenLMLab)
- **Mechanism:** computeU verifier / training memory baseline
- Fuses gradient computation and parameter update into a single step; eliminates gradient tensor
  storage entirely; 65B on 8×RTX3090. Sets the memory floor for full-param SGD that YURI's ZO
  approach must beat or match.

### 6. AdaLomo: Low-memory Optimization with Adaptive Learning Rate
- **arXiv:** [2310.10195](https://arxiv.org/abs/2310.10195) · 2023 · ACL Findings 2024
- **Authors:** Lv, Yan, Guo, Lv, Qiu
- **Mechanism:** MLX training pipeline / adaptive optimizer selection
- Adds NMF-based per-parameter adaptive LR to LOMO; closes AdamW convergence gap without storing
  second-moment tensors. The adaptive optimizer upgrade for the cloud leg when LOMO-level memory is
  required.

### 7. ReLoRA: High-Rank Training Through Low-Rank Updates
- **arXiv:** [2307.05695](https://arxiv.org/abs/2307.05695) · 2023
- **Authors:** Lialin, Shivagunde, Muckatira, Rumshisky
- **Mechanism:** MLX/cloud training pipeline / adapter rank management
- Accumulates sequential low-rank updates into a high-rank result via merge-reinit cycles; 5.5GB
  RAM savings/GPU. Relevant during GRPO rounds to grow effective adapter rank without memory blowout.

### 8. Symbolic Discovery of Optimization Algorithms (Lion)
- **arXiv:** [2302.06675](https://arxiv.org/abs/2302.06675) · 2023
- **Authors:** Chen, Liang, Huang, Real, Wang, Liu, Pham, Dong, Luong, Hsieh, Lu, Le (Google Brain)
- **Mechanism:** MLX training pipeline / optimizer selection
- Evolved sign-momentum optimizer; stores only momentum (no second-moment state); uniform step
  magnitudes complement 4-bit quantized weights. Primary Adam alternative on the cloud QLoRA SFT leg.

### 9. On-Device Fine-Tuning via Backprop-Free Zeroth-Order Optimization
- **arXiv:** [2511.11362](https://arxiv.org/abs/2511.11362) · 2025
- **Authors:** Katti, Sifaou, Park, Rajendran, Simeone
- **Mechanism:** computeU verifier / on-device ZO memory-budget planning
- Theoretical analysis of MeZO in edge-device settings; quantifies model-size headroom under ZO vs
  backprop at a fixed device memory budget. Directly informs YURI's 16GB M2 Pro local ZO loop sizing.

---

## Top Pick
**MeZO (2305.17333)** — it is the direct substrate for YURI's local training philosophy. `computeU`
IS a non-differentiable verifier-objective, and MeZO was explicitly designed for exactly that case.
Every other memory technique in this list is a modifier on top of — or a complement to — MeZO's
forward-only gradient estimation loop.

---

## Decision Matrix for YURI-7B Training Leg

| Stage | Recommended method | Memory target |
|---|---|---|
| Local ZO smoke-test (M2 16GB) | MeZO + Sparse MeZO mask | ≤inference footprint |
| Cloud SFT (H100 40/80GB) | QLoRA (NF4 + paged) + Lion/AdaLomo | 16–40GB |
| GRPO with computeU reward | GaLore or ReLoRA for full-param gradient flow | 40–80GB |
| Merge + quantize | GGUF Q4_K_M | serve at 4.5GB on M2 |
