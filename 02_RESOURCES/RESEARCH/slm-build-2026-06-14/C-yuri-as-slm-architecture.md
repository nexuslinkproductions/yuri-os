# C — YURI as SLM Extension Architecture (2026-06-14)

> Angle C of the SLM-build research mission. Local-first + cited online. See 00-SLM-RESEARCH-BRIEF.md.

## 1. The Core Reframe

"YURI as an SLM" does NOT mean replacing YURI's deterministic substrate with a neural model.
It means the **SLM supplies the language faculty; YURI's deterministic spine is the control/verification layer**.
The SLM generates; YURI gates, routes, retrieves, and enforces.
Evidence: Belcak & Heinrich 2026 — SLMs win agentic benchmarks by delegating reasoning to external verifiers
and tools, not by scaling parameters. [1]

---

## 2. Architecture Layers (buildable-now → future)

### Layer 0 — SLM Inference (existing: Ollama adapter, NOW)
`_SYSTEM/Scripts/ollama-adapter.mjs` already wraps an Ollama server with timeout, streaming, and
token-ledger hooks. A YURI-fine-tuned 7–8B model slots in as a new `llm-lane` provider with no
structural change. Target models for tool-calling: Qwen3-7B, Llama-3.1-8B-Instruct, Phi-3.5-mini.
Benchmark: fine-tuned 350M OPT hit 77.55% ToolBench pass vs 26% ChatGPT-CoT — schema-adapted
SLMs routinely beat larger generalist models at structured tool-calling. [2][3]

### Layer 1 — Constrained Generation as Hard Rail (buildable NOW, <1 day integration)
llguidance (Rust CFG engine, ~50μs/token, zero startup cost) or XGrammar (vLLM/SGLang default March
2026, <40μs/token, ~100x over naive grammar methods) applied at SLM inference time.
YURI hook: `gateProposal` + `claim-cortex` define what a VALID YURI output looks like structurally
(ladder rungs, claim types, tool-call schemas). Encode as CFG or JSON schema → feed to
llguidance/XGrammar → SLM can only emit tokens matching the schema. [4][5]

### Layer 2 — Energy Gate as Post-Generation Verifier (buildable NOW, wire existing)
RLVR pattern — sample N completions from the SLM, run each through `gateProposal(stateBefore, stateAfter)`,
accept only where `deltaU <= threshold` and protected-path violations do not increase (the non-offsettable
hard veto). `prose-claim-extractor.mjs` extracts structured claims from SLM output → feeds `claim-cortex`
→ feeds `gateProposal`. All exist; wiring only. For RLVR training: reward = −computeU(output_state). [6][7]

### Layer 3 — Retrieval over YURI Memory (buildable NOW, <1 week)
`xref-query.mjs` over `search-index.db` (FTS5/BM25, 38k+ docs) → top-k chunks prepended to SLM context.
GitNexus call graph → GraphRAG (entity-relation graph, structurally-grounded retrieval). [8]

### Layer 4 — Rust Kernels as Inference-Side Ops (existing, extend)
`nexus-rs` (minhash, jaccard, ppmi, corpus_match, stats) via napi/wasm: dedup N candidates, score against
corpus, compute phi for claim-pair associations at native speed. Language-consolidation verdict: JS stays
source-of-truth for the live energy gate; Rust handles stable hot math kernels only. [9]

### Layer 5 — Speculative Decoding (MLX, future)
EAGLE-3/DFlash/MTPLX on Apple Silicon: 2–2.3x speedup on 7B+ models, no separate draft model needed.
Wire after core YURI-wrapping is stable. [10][11]

---

## 3. MVP Protocol (concrete)

```
[Prompt] → xref-query + GitNexus retrieval → RAG context
→ SLM generates N=4 candidates + CFG mask (Layer 1)
→ prose-claim-extractor → cortexSnapshot per candidate
→ gateProposal(stateBefore, stateAfter) per candidate
→ accept first candidate where deltaU<=0 AND no protected-path violation
→ else escalate to Claude/Opus lane
→ Rust kernel ops (dedup, corpus-match) on accepted output
```

---

## 4. Myth vs Buildable-Now

| Claim | Verdict |
|---|---|
| YURI-as-SLM means neural energy models | MYTH — SLM = language faculty; YURI spine stays deterministic |
| Energy gate as RLVR requires new infrastructure | MYTH — computeU scalar is the reward; gateProposal is the verifier |
| Constrained decoding requires server rewrite | MYTH — llguidance = Rust lib + Python bindings, <1 day |
| Fine-tuned SLMs cannot beat large models | MYTH — 350M OPT 77.55% vs ChatGPT-CoT 26% on ToolBench [2] |
| Local training 7B on M2/16GB feasible | FALSE — rent H100 (~$2/hr, 4–8hr); serve locally after quant |
| Speculative decoding required for MVP | FALSE — nice-to-have optimization; not a blocker |

---

## Sources

[1] https://arxiv.org/pdf/2506.02153 — Belcak & Heinrich 2026, SLMs future of agentic AI
[2] https://arxiv.org/abs/2512.15943 — SLMs for Efficient Agentic Tool Calling
[3] https://www.kdnuggets.com/5-small-language-models-for-agentic-tool-calling
[4] https://github.com/guidance-ai/llguidance — CFG-constrained decoding, ~50μs/token
[5] https://www.bentoml.com/blog/structured-decoding-in-vllm-a-gentle-introduction — XGrammar
[6] https://www.appen.com/blog/rlvr — RLVR verifiable rewards
[7] https://arxiv.org/html/2604.03128v2 — Self-Distilled RLVR (RLSD)
[8] https://arxiv.org/abs/2506.00054 — RAG survey 2025-2026
[9] 02_RESOURCES/RESEARCH/language-consolidation-rust-mojo-zig-2026-06-14.md (local)
[10] https://github.com/ml-explore/mlx-lm/discussions/890 — EAGLE-3 on MLX
[11] https://vinoth12940.github.io/blog/articles/genai-20260519-local-mtp-speculative-decoding/