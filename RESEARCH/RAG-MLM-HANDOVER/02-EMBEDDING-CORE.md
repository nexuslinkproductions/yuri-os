# RAG/MLM — Embedding Core

> **The foundation of the entire system.** Embeddings are how text becomes math, and math becomes searchable.  
> This file covers the RVF hash-based provider (the zero-dependency foundation), then every other provider.

---

## 1. The RVF Provider — Zero-Dependency Foundation

**File:** `@claude-flow/embeddings/src/rvf-embedding-service.ts`

The RVF provider is the most important piece to understand because:
- It works **everywhere** — no model, no API, no native deps
- It **never fails** — if your system has JS, RVF works
- It's **deterministic** — same text → same vector across machines, sessions, and time
- It's **fast** — <0.1ms per embedding
- It serves as the **fallback** when no neural provider is available

### How RVF Embeddings Work

```typescript
// FNV-1a hash → multi-round mixing → sine distribution → L2 normalize

function generateHashEmbedding(text: string): Float32Array {
  const embedding = new Float32Array(384); // or configurable dimensions
  
  // Step 1: Compute FNV-1a base hash of the full text
  let baseHash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < text.length; i++) {
    baseHash ^= text.charCodeAt(i);
    baseHash = Math.imul(baseHash, 0x01000193) >>> 0;
  }
  
  // Step 2: Mix with golden ratio for each dimension
  for (let i = 0; i < 384; i++) {
    const seed = (baseHash + Math.imul(i, 0x9E3779B9)) >>> 0; // golden ratio mixing
    const x = Math.sin(seed) * 43758.5453;
    embedding[i] = x - Math.floor(x) - 0.5; // zero-centered [-0.5, 0.5)
  }
  
  // Step 3: L2 normalize to unit vector
  let norm = 0;
  for (let i = 0; i < 384; i++) norm += embedding[i] * embedding[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < 384; i++) embedding[i] /= norm;
  
  return embedding;
}
```

**Key insight:** This is NOT a semantic embedding. It's a **content-based fingerprint**. Two similar texts produce *different* vectors unless they're identical. This is perfect for:
- Deduplication and exact-match retrieval
- Development/testing when you don't want API calls
- Bootstrapping before neural models are available
- Systems where relative distance matters more than semantic meaning

### Configuration

```typescript
const rvf = new RvfEmbeddingService({
  provider: 'rvf',
  dimensions: 384,        // Default. Positive integer.
  cacheSize: 1000,        // In-memory LRU cache entries
  normalization: 'none',  // Keep as-is. 'l2' | 'l1' | 'minmax' | 'zscore' | 'none'
  cachePath: './cache/embeddings.rvec',  // Optional: persistent binary cache
});
```

---

## 2. The Provider System — Unified Interface

**File:** `@claude-flow/embeddings/src/embedding-service.ts`

### The IEmbeddingService Interface

Every provider implements this contract:

```typescript
interface IEmbeddingService {
  readonly provider: 'openai' | 'transformers' | 'mock' | 'agentic-flow' | 'rvf';
  
  embed(text: string): Promise<EmbeddingResult>;
  embedBatch(texts: string[]): Promise<BatchEmbeddingResult>;
  clearCache(): void;
  getCacheStats(): { size: number; maxSize: number; hitRate: number };
  shutdown(): Promise<void>;
  
  // Event system
  addEventListener(listener): void;
  removeEventListener(listener): void;
}
```

### EmbeddingResult

```typescript
interface EmbeddingResult {
  embedding: Float32Array | number[];  // The vector
  latencyMs: number;                    // Generation time
  usage?: { promptTokens: number; totalTokens: number };  // OpenAI only
  cached?: boolean;                     // Was it from in-memory cache?
  persistentCached?: boolean;           // Was it from disk cache?
  normalized?: boolean;                 // Was normalization applied?
}
```

### BatchEmbeddingResult

```typescript
interface BatchEmbeddingResult {
  embeddings: Array<Float32Array | number[]>;
  totalLatencyMs: number;
  avgLatencyMs: number;
  usage?: { promptTokens: number; totalTokens: number };
  cacheStats?: { hits: number; misses: number };
}
```

---

## 3. All Providers — Details

### Provider Comparison Matrix

| Feature | RVF | Agentic-Flow | Transformers.js | OpenAI | Mock |
|---------|-----|--------------|-----------------|--------|------|
| Latency | <0.1ms | ~3ms | ~230ms* | ~50-100ms | <0.1ms |
| Quality | Relative (content fingerprint) | Good (MiniLM) | Good (varies by model) | Excellent | Deterministic (not semantic) |
| Dimensions | Configurable | 384 default | Varies (384-768) | 1536/3072 | Configurable |
| Offline | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes |
| Dependencies | None | agentic-flow | @xenova/transformers | Network + API key | None |
| Deterministic | ✅ Same input → same vector | ✅ Yes | ✅ Yes | ❌ API may vary | ✅ Yes |
| File Size | 52KB (packaged) | ~50MB (model) | ~23-110MB (model) | N/A | 52KB |

\* First call downloads the model (~23MB for MiniLM). Subsequent calls are ~230ms.

### Provider: Agentic-Flow (Recommended for Production)

Agentic-flow uses **ONNX-optimized neural models** with SIMD acceleration. It's the fastest neural option.

```typescript
const af = new AgenticFlowEmbeddingService({
  provider: 'agentic-flow',
  modelId: 'all-MiniLM-L6-v2',   // Default. 384 dimensions.
  cacheSize: 256,                 // Smaller cache — embedder has its own
  autoDownload: true,             // Download model if not present
  modelDir: './models',           // Where to store models
});
```

The embedder is loaded dynamically from the `agentic-flow/embeddings` package. The service tries several import paths with file:// protocol fallback for node_modules resolution.

### Provider: Transformers.js

Uses HuggingFace ONNX models via @xenova/transformers.

```typescript
const tf = new TransformersEmbeddingService({
  provider: 'transformers',
  model: 'Xenova/all-MiniLM-L6-v2',    // 23MB, 384 dims. Fastest TF model.
  // model: 'Xenova/all-mpnet-base-v2', // 110MB, 768 dims. Higher quality.
  cacheSize: 1000,
});
```

### Provider: OpenAI

Calls the OpenAI Embeddings API with retry logic and exponential backoff.

```typescript
const oai = new OpenAIEmbeddingService({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'text-embedding-3-small',   // 1536 dims. Or 'text-embedding-3-large' (3072)
  dimensions: 1536,                   // Can reduce for cost/speed (v3 models only)
  timeout: 30000,
  maxRetries: 3,
  baseURL: 'https://api.openai.com/v1/embeddings',
});
```

### Provider: Mock

Deterministic hash-based, useful for tests and development.

```typescript
const mock = new MockEmbeddingService({
  provider: 'mock',
  dimensions: 384,
  simulatedLatency: 0,   // Add artificial delay for testing timeouts
  cacheSize: 100,
});
```

---

## 4. Factory Functions — The Smart Entry Points

### `createEmbeddingService` (synchronous)

For when you know exactly which provider you want:

```typescript
import { createEmbeddingService } from './index.js';

const service = createEmbeddingService({
  provider: 'openai',
  apiKey: 'sk-...',
  dimensions: 1536,
});
```

### `createEmbeddingServiceAsync` (automatic fallback chain)

**This is the function you should use.** It tries providers in priority order and validates each one before falling back:

```typescript
import { createEmbeddingServiceAsync } from './index.js';

const service = await createEmbeddingServiceAsync({
  provider: 'auto',   // Tries: RVF → AgenticFlow → Transformers → Mock
  autoInstall: true,  // Auto-installs agentic-flow if missing
  fallback: 'transformers',  // Custom fallback if your primary fails
  dimensions: 384,
  cacheSize: 1000,
});
```

**Fallback logic (when provider='auto'):**

1. **RVF** — Always succeeds. No deps. Returns immediately if chosen.
2. **Agentic-Flow** — Try to import. If missing, auto-install via npm. If still fails, fall through.
3. **Transformers.js** — Try to import. If missing, fall through.
4. **Mock** — Always succeeds. Last resort.

### `getEmbedding` (one-shot convenience)

```typescript
const embedding = await getEmbedding("Hello world", {
  provider: 'mock',
  dimensions: 384,
});
```

---

## 5. Similarity Functions

All in `embedding-service.ts`. Available for comparing any two vectors:

```typescript
import { cosineSimilarity, euclideanDistance, dotProduct, computeSimilarity } from './index.js';

// Cosine similarity — most common for embeddings (higher = more similar, 0-1)
const sim = cosineSimilarity(embeddingA, embeddingB);

// Euclidean distance (lower = more similar)
const dist = euclideanDistance(embeddingA, embeddingB);

// Dot product (higher = more similar for normalized vectors)
const dot = dotProduct(embeddingA, embeddingB);

// Generic with metric selection
const result = computeSimilarity(embeddingA, embeddingB, 'cosine');
// → { score: 0.95, metric: 'cosine' }
```

---

## 6. Event System — Monitoring

Every provider extends EventEmitter and supports a typed event system:

```typescript
service.addEventListener((event) => {
  switch (event.type) {
    case 'embed_start':    // { type, text }
    case 'embed_complete': // { type, text, latencyMs }
    case 'embed_error':    // { type, text, error }
    case 'batch_start':    // { type, count }
    case 'batch_complete': // { type, count, latencyMs }
    case 'cache_hit':      // { type, text }
    case 'cache_eviction': // { type, size }
  }
});
```

---

## 7. Caching Architecture

Two layers:

1. **In-memory LRU cache** — Default 1000 entries. Instant hit rate. Evicts oldest on overflow.
2. **Persistent disk cache** — Optional. Two backends:
   - **RVEC binary** (`rvf-embedding-cache.ts`) — Pure TS, no deps, custom binary format
   - **SQLite** (`persistent-cache.ts`) — sql.js WASM, full SQL queries, TTL cleanup

Both support TTL (default: 7 days) and LRU eviction.

**How cache is checked (in order):**
```
embed(text)
  → Check in-memory LRU (instant)
  → Check persistent binary/SQLite cache
  → Generate embedding
  → Store in in-memory LRU
  → Store in persistent cache (async)
  → Return result with metadata (cached: true/false)
```

---

## Quick Reference — When to Use Each Provider

| Situation | Use |
|-----------|-----|
| "It must work. No deps. No config." | **RVF** |
| "Fast neural embeddings, offline." | **Agentic-Flow** |
| "I want HuggingFace model X." | **Transformers.js** |
| "Highest quality embeddings." | **OpenAI** (or AgenticFlow + reranker) |
| "Writing unit tests." | **Mock** |
| "I don't know — pick the best available." | **Auto** (with `createEmbeddingServiceAsync`) |
