# REVERSE_ENGINEERING // DEEPSEEK_MLA (MULTI-HEAD_LATENT_ATTENTION)

## 1. THE_BREAKTHROUGH
DeepSeek-V2/V3 introduced **MLA** as a radical alternative to standard Multi-Head Attention (MHA) and Grouped-Query Attention (GQA). 

### CORE_INNOVATION: LOW-RANK_COMPRESSION
Standard GQA reduces KV cache but MLA takes it further by compressing the KV states into a low-rank latent vector.

- **Standard Attention**: Each head stores full K and V vectors.
- **MLA**: Keys and Values are jointly compressed into a single latent vector $\mathbf{c}_t$. This vector is then projected back into head-specific K/V components during the forward pass.

## 2. ARCHITECTURAL_ADVANTAGES
- **KV_CACHE_REDUCTION**: MLA reduces the KV cache size by **4-6x** compared to GQA, enabling massive context windows (128k+) on much smaller VRAM footprints.
- **ABSORBED_PROJECTIONS**: MLA allows the model to 'absorb' the KV projections into the attention matrix during inference, further optimizing throughput.

## 3. IMPLEMENTATION_NOTES (FOR_THE_FORGE)
To mimic MLA in the YURI core:
1. Implement a bottleneck linear layer for K and V.
2. Use RoPE (Rotary Positional Embeddings) only on a small 'decoupled' part of the key to maintain positional awareness while keeping the latent core compressed.

## 4. STRATEGIC_IMPORTANCE
MLA is the primary reason DeepSeek achieves GPT-4 class performance while being significantly more efficient during inference. This is a top-tier candidate for our local MoE experiments.
