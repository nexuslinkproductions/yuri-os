# DBarr3 / Unlimited-Context-LLM (aether-context) — YURI Adoption Analysis

**Date:** 2026-06-17 · **Source:** https://github.com/DBarr3/Unlimited-Context-LLM (Apache-2.0, Python, pub 2026-06)
**Method:** Sonnet research agent, raw.githubusercontent + api.github (read-only), code-grounded.
**Why:** Owner flagged it as "a great idea… might be useful for us." Assess what YURI can adopt.

## What it is
`aether-context` = **virtual-memory-for-LLM-attention**: "encode-on-spill, recover-on-demand" instead of lossy summarization. Runs locally vs Ollama/llama.cpp/HF. Two-file persistence (no service/SQLite).

## Core mechanism (code-grounded)
1. **Static encoder** (`encoder.py`) — deterministic 256-dim, numpy-only, NO model download: `hashlib`-seeded token rows → mean-pool → L2-norm. Shared tokens → shared rows → real lexical cosine. Drop-in slot for a trained Model2Vec table later.
2. **Pool** (`context_pool.py`) — mmap'd `[capacity,256]` float32 + sidecar JSON; ~233M tokens/GB; HNSW fast path, brute-force `matrix@query` flat fallback.
3. **Retention/eviction** (`witness.py`) — geometric-mean **`retention = (surprise·impact·uniqueness)^(1/3)`** (one weak axis can't be masked) + `exp(-rate·elapsed)` decay + `PIN_BONUS=0.25` anti-thrash. Budget governor evicts lowest-score after each add.
4. **Pager** (`slice_loader.py`) — warm LRU (16 keys) + idle-aware ε re-probe `1-(1-EPS)·0.5^(idle/20)` (no region stays dark); caller owns the background thread.
5. **MPO chain** (`mpo.py`) — additive cosine-assisted connected-thread expansion (never blocks a hit; synthetic-only validated).
6. **Provenance** (`session.py`) — `MEMORY_SOURCE_USER/MODEL/TOOL`; agent-self-authored spill tagged `model` + documented as NOT authoritative (primary safety guard).
**Benchmark** (honest caveats — toy 2k window, N=20, single run): recall 0.15→1.00, tasks 3/20→20/20, cost −24%.

## YURI gap (verified)
- `memory-kernel.mjs:737` `scoreText` = pure token-presence count (lexical BM25-lite, **no vectors**); `embedding`/`msa` modes are enum stubs → **lexical fallback** with warning.
- `embed-backfill.mjs` (nomic-embed via Ollama → SQLite) exists but is **backend-only, not in the recall hot path**.
- `memory-evict.mjs` = SUPERSEDED; live eviction (`memory-relocator.mjs`) = **atime-LRU, not salience-scored**.
- `spreading-activation-memory.mjs` = PageRank+Hebbian over `[[wiki-link]]` graph — richer than MPO for *structured* memory, but no vector backbone.
- A 2026-05-21 YURI research doc already names the exact gap ("offline encode/index; online route; assemble sparse context") as an unimplemented goal.

## Adoption proposals (ranked, capability-first)
1. **HIGH/low-risk — port the static encoder into `memory-kernel.mjs` recall.** ~60 lines Node (`crypto.createHash` token rows + Float32Array), deterministic, NO Ollama dep → activates the stubbed `embedding` scorer. New `_SYSTEM/Scripts/static-encoder.mjs` + plug into `resolveMemoryScorer`.
2. **HIGH/med — replace atime-LRU eviction with geometric-mean retention** in `memory-relocator.mjs`. Keeps load-bearing-but-old facts that LRU drops. `uniqueness=1/(1+neighbors)` needs the vector index → sequence after #1.
3. **MED/low — provenance tag `user|model|tool` at write time** in `writeMemoryEntry`. YURI has authority scopes but a Claude-authored session entry looks identical to a Marcel-authored one; this is DBarr3's documented primary guard against agent-spill-as-policy. ~10 lines.
4. **MED/low — anti-thrash pin bonus** in the relocation scorer (track `last_recalled_at`).
5. **LOW-MED — idle-aware ε floor** in `spreading-activation-memory.mjs recall()` so cold regions resurface.

## Honest assessment
YURI is **better** at: memory governance (proposals/authority/audit), graph memory (spreading-activation), multi-writer canonical store (generation-rotated, sha256-dedup, nano-lease). DBarr3 is narrower (single-session, single-writer, toy benchmark). It is NOT a toy lib — clean single-purpose engineering. **Take 3 things:** (1) static encoder → finally light up the stubbed embedding recall; (2) geometric-mean retention → kill atime-LRU; (3) 3-way provenance tag. The pager machinery (#4–5) is only relevant after vector recall is live.
