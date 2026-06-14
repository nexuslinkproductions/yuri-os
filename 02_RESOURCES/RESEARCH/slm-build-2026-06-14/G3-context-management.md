# G3 — Context Management Methods for YURI-7B
**Sweep:** 2026-06-14 | **Constraint:** AR Qwen3-8B, GGUF, llama.cpp/MLX, 16 GB M2 Pro, 8k ctx

## Bracketing — Term Audit
**NOT a technical method.** Two sweeps found no arXiv paper or replicable mechanism. Informal usage
= XML-delimiter prompting discipline. No measured gains. Flag on sight; ask for provenance.

## KV Cache Quantization
**KIVI** ([arXiv:2402.02750](https://arxiv.org/abs/2402.02750), ICML 2024): per-channel keys,
per-token values, no finetune. 2.6× peak mem, 3.47× throughput, 4× batch size on 7B.
→ **P0 bolt-on**: `--cache-type-k q8_0 --cache-type-v q4_0` in llama.cpp today.

**KVQuant** ([arXiv:2401.18079](https://arxiv.org/abs/2401.18079), UCB): pre-RoPE + outlier
sparse + non-uniform per-layer. <0.1 PPL at 3-bit. CUDA only — no Metal/ggml port.
→ Monitor; use as design reference for per-head adaptive quant (#21385).

## Attention Sinks / Streaming
**StreamingLLM** ([arXiv:2309.17453](https://arxiv.org/abs/2309.17453), ICLR 2024): pin first 4
sink tokens + sliding window. 22.2× speedup vs recompute. No finetune.
→ `--keep 4` in llama.cpp approximates sink pinning. Low urgency at 8k on Qwen3 (32k+ native).

## KV Cache Eviction
**H2O** ([arXiv:2306.14048](https://dl.acm.org/doi/abs/10.5555/3666122.3667628), NeurIPS 2023):
cumulative attention heavy-hitters + recency. 29× throughput at 20% budget. HF Transformers only.
→ No llama.cpp port. Monitor.

**SnapKV** ([arXiv:2404.14469](https://arxiv.org/abs/2404.14469), NeurIPS 2024): observation-window
prefill eviction, head-specific pooled scores. 3.6× gen speed, 8.2× mem at 16k. Not upstream.
→ Port candidate — stable prefix = system prompt + tools, exactly what SnapKV preserves.

**Crystal-KV** ([arXiv:2601.16986](https://arxiv.org/abs/2601.16986), Jan 2026): SlipKV (reasoning
scaffold, evictable) vs CrystalKV (answer-contributing, keep). ALRFU eviction + adaptive budget.
CoT models, SOTA on MATH-500/CodeForces. Research only.
→ **Highest YURI-7B alignment** — verifier loop IS a CoT workflow. SlipKV/CrystalKV maps directly
to inter-candidate reasoning vs accepted candidate tokens. Port priority.

## Prompt Compression
**LLMLingua-2** ([arXiv:2403.12968](https://arxiv.org/abs/2403.12968), ACL 2024, Microsoft): token
binary classification, BERT encoder, GPT-4-distilled supervision. 2–5× compression, maintained
accuracy. External preprocessing step, ~110M params, runs on CPU.
→ **P1 bolt-on**: wrap FTS5 retrieval output before 8k context window. Zero llama.cpp changes.

## Prefix Caching
**llama.cpp host-RAM caching** (PR #16391, Q4 2025, default 8 GB): shared-prefix slots restored
from RAM in ~200ms vs ~60s re-prefill. System prompt + tool schema = stable prefix across all N
verifier candidates.
→ **P0 bolt-on**: `--cache-ram` flag at llama-server startup. N candidates = N×decode, not N×prefill.

**PagedAttention** ([arXiv:2309.06180](https://arxiv.org/abs/2309.06180)): vLLM only. Not in
llama.cpp. Conceptually equivalent to the above for YURI's single-server use case.

## Position Extension
**YaRN** ([arXiv:2309.00071](https://arxiv.org/abs/2309.00071), ICLR 2024): RoPE frequency
interpolation + temp correction. 10× data efficiency over naive PI. Native llama.cpp support.
→ Low priority. Qwen3-8B trained to 32k+ natively. Moot at 8k operational constraint.

## Decision Table
| Technique | Bolt-on on AR 7B GGUF? | Gain | Priority |
|-----------|------------------------|------|----------|
| llama.cpp KV quant (q8_0/q4_0) | Yes | ~2.6× KV mem, more candidate slots | P0 |
| Prefix caching (--cache-ram) | Yes | ~300× prefill speedup on shared prefix | P0 |
| LLMLingua-2 | Yes (preprocess) | 3–5× context compression | P1 |
| StreamingLLM sinks (--keep 4) | Yes | Stable long sessions | P1 |
| Crystal-KV | No (port needed) | CoT-optimal, maps to verifier loop | Port priority |
| SnapKV | No (port needed) | 3.6× gen speed at 16k | Monitor |
| H2O | No (port needed) | 29× at 20% budget (long ctx) | Monitor |
| YaRN | Yes | 4–8× ctx extension | Low at 8k |
| KVQuant | No (CUDA only) | Sub-4-bit, <0.1 PPL | Monitor Metal port |