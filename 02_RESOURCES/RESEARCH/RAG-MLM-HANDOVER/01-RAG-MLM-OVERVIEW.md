# RAG/MLM System — Overview

> **Purpose:** Handover documentation for the RVF (RuVector Flow) RAG/MLM system.  
> **Audience:** Developer adapting this into their own agent framework.  
> **Status:** Production-tested in RuFlo v3.5 / Claude-Flow ecosystem.  
> **Last updated:** 2026-05-06

---

## What This Is

A **fully self-contained vector embedding, storage, retrieval, and neural substrate system** built entirely in TypeScript. Zero native dependencies. Zero mandatory external APIs. Works offline, in-memory, or backed by disk.

It provides everything needed for a Retrieval-Augmented Generation (RAG) pipeline:

```
[Raw Text] → [Chunking] → [Embedding Generation] → [Vector Storage (HNSW)] → [Semantic Search] → [Context Retrieval]
                                                                                    ↑
                                                                              [Query Embedding]
```

Plus advanced MLM (Masked/Model Learning) features: semantic drift detection, memory consolidation, swarm coordination, and hyperbolic embeddings for hierarchical data.

---

## Core Architecture — One Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                       EMBEDDING LAYER                             │
│                                                                   │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐         │
│  │  RVF     │  │ Agentic  │  │Transformers│  │  OpenAI   │         │
│  │ (hash,no │  │ Flow     │  │ .js        │  │  API      │         │
│  │  model)  │  │ (ONNX)   │  │ (local NN) │  │           │         │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘  └─────┬─────┘         │
│       │             │              │              │               │
│       └─────────────┴──────────────┴──────────────┘               │
│                            │                                       │
│                    [IEmbeddingService Interface]                   │
│                            │                                       │
│              ┌─────────────┴─────────────┐                        │
│              │      LRU + Disk Cache      │                        │
│              └───────────────────────────┘                        │
├──────────────────────────────────────────────────────────────────┤
│                       STORAGE LAYER                                │
│                                                                   │
│  ┌─────────────────────┐    ┌──────────────────────────────┐      │
│  │   HNSW Index        │    │  Persistent Cache            │      │
│  │   (in-memory graph) │    │  (sql.js SQLite OR binary    │      │
│  │   O(log n) search   │    │   RVEC binary file format)   │      │
│  └─────────────────────┘    └──────────────────────────────┘      │
├──────────────────────────────────────────────────────────────────┤
│                    NEURAL SUBSTRATE LAYER                          │
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐        │
│  │ Drift       │  │ Memory       │  │ Swarm             │        │
│  │ Detection   │  │ Physics      │  │ Coordination      │        │
│  └─────────────┘  └──────────────┘  └───────────────────┘        │
├──────────────────────────────────────────────────────────────────┤
│                    UTILITY LAYER                                   │
│                                                                   │
│  ┌──────────┐  ┌───────────────┐  ┌────────────────────────┐     │
│  │ Chunking │  │ Normalization │  │ Hyperbolic (Poincaré)  │     │
│  │ (4 strats)│  │ (L2/L1/mm/z)  │  │ Ball Embeddings        │     │
│  └──────────┘  └───────────────┘  └────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

---

## What You Get (Files You Need)

The system lives in `@claude-flow/embeddings` and `@claude-flow/memory` packages:

| Package | Key Modules | Purpose |
|---------|-------------|---------|
| `@claude-flow/embeddings` | `rvf-embedding-service.ts` | Deterministic hash embeddings (no model) |
| | `rvf-embedding-cache.ts` | Binary RVEC file cache |
| | `embedding-service.ts` | Multi-provider factory + OpenAI/TF/Mock |
| | `chunking.ts` | 4-strategy document chunking |
| | `normalization.ts` | 4 normalization methods |
| | `hyperbolic.ts` | Poincaré ball transformations |
| | `neural-integration.ts` | Drift, memory, swarm, coherence |
| | `persistent-cache.ts` | sql.js SQLite persistent cache |
| `@claude-flow/memory` | `hnsw-index.ts` / `hnsw-lite.ts` | HNSW vector search |
| | `rvf-learning-store.ts` | Persistent learning artifact store |

---

## Five Providers in One Unified Interface

All implement `IEmbeddingService`:

| Provider | How It Works | Latency | Quality | Dependencies |
|----------|-------------|---------|---------|-------------|
| **RVF** | FNV-1a hash → multi-round mixing → L2 normalize | <0.1ms | Relative | None |
| **Agentic-Flow** | ONNX neural model (all-MiniLM-L6-v2) | ~3ms | Good | agentic-flow package |
| **Transformers.js** | HuggingFace ONNX via @xenova/transformers | ~230ms | Good | @xenova/transformers |
| **OpenAI** | text-embedding-3-small/large API | ~50-100ms | Excellent | API key + network |
| **Mock** | Sinusoidal hash embedding | <1ms | Deterministic (not semantic) | None |

---

## Minimal Integration Example

```typescript
import { createEmbeddingService } from './embeddings/src/index.js';

// One-liner — auto-selects best available provider
const embedder = await createEmbeddingServiceAsync({
  provider: 'auto' // RVF → AgenticFlow → Transformers → Mock
});

// Embed
const result = await embedder.embed("Your document text here");
// result.embedding → Float32Array(384)
// result.latencyMs  → <1 for RVF, ~3 for ONNX

// Batch embed for RAG
const batch = await embedder.embedBatch([
  "Document chunk 1",
  "Document chunk 2", 
  "Document chunk 3"
]);
// batch.embeddings → Float32Array[]
// batch.cacheStats.hits/misses
```

---

## Key Design Principles

1. **Zero-dependency fallback chain** — It always works. RVF mode needs no model, no API, no npm install beyond the package itself.
2. **Deterministic by default** — Same input → same embedding. Critical for reproducible builds and cache hit rates.
3. **Layered caching** — In-memory LRU (instant) → persistent binary file (~30s flush) → optional SQLite.
4. **Provider abstraction** — Switch between hash, ONNX, API, or mock by changing config. The rest of your code never changes.
5. **Event system** — Every embedding operation fires typed events so you can hook monitoring, logging, or live dashboards.

---

## What's NOT Included (You Build This)

- **LLM integration** — The system embeds and retrieves. You connect it to your LLM's context window.
- **Document store** — Chunks are in memory/on disk. You need a document DB or filesystem for source texts.
- **Ingestion pipeline** — There's a chunking utility but no automated crawler/loader.
- **Query rewriting** — No query expansion or decomposition. Raw embedding → search.
- **Reranking** — HNSW returns top-k. Cross-encoder reranking is your addition.

---

## File Map (Where Everything Lives)

```
@claude-flow/embeddings/src/
├── index.ts                    # Public API exports
├── types.ts                    # All type definitions
├── embedding-service.ts        # Factory + all providers (OpenAI, TF, Mock, AgenticFlow)
├── rvf-embedding-service.ts    # Hash-based RVF provider (the foundation)
├── rvf-embedding-cache.ts      # Pure-TS binary file cache (RVEC format)
├── chunking.ts                 # 4-strategy document chunking
├── normalization.ts            # 4 normalization methods
├── hyperbolic.ts               # Poincaré ball transformations
├── persistent-cache.ts         # sql.js SQLite cache (alternative to RVEC)
└── neural-integration.ts       # Agentic-flow neural substrate wrapper

@claude-flow/memory/src/
├── hnsw-lite.ts                # Lightweight HNSW implementation
├── rvf-learning-store.ts       # Binary JSON-lines learning store
├── hybrid-backend.ts           # Unified memory backend  
├── sqljs-backend.ts            # SQLite memory backend
└── database-provider.ts        # Backend factory

@claude-flow/memory/dist/
├── hnsw-index.d.ts             # Full HNSW index type def (production)
```

---

## Next Documents

| File | What It Covers |
|------|----------------|
| `02-EMBEDDING-CORE.md` | Deep dive into RVF hash embeddings + provider system |
| `03-VECTOR-STORAGE-AND-INDEXING.md` | HNSW, persistent caches, binary format |
| `04-DOCUMENT-CHUNKING-AND-NORMALIZATION.md` | Chunking strategies, normalization methods |
| `05-HYPERBOLIC-EMBEDDINGS.md` | Poincaré ball — when and why to use it |
| `06-NEURAL-SUBSTRATE.md` | Drift detection, memory physics, swarm coordination |
| `07-INTEGRATION-PATTERNS.md` | Wiring everything together, recipe patterns |
| `08-PERFORMANCE-TUNING.md` | Quantization, benchmarks, production tuning |
