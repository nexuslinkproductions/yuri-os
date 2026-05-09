# RAG/MLM — Vector Storage & Indexing

> Once you have embeddings, you need to store them and search them fast.  
> This file covers HNSW indexing, both persistent cache backends, and the RVEC binary format.

---

## 1. Architecture Overview

```
[Embeddings] → [HNSW Index (in-memory)] → [O(log n) Approximate Nearest Neighbor Search]
     ↓
[Persistent Cache] → [RVEC binary file or SQLite DB]
     ↓
[Durable across restarts]
```

Two separate paths for persistence:

| Component | Purpose | Data Model |
|-----------|---------|------------|
| **HNSW Index** | Fast vector search | Graph of connected vectors |
| **Embedding Cache** | Persist embedding results to avoid recomputation | Key-value (text hash → embedding) |

You need **both** for a complete RAG pipeline:
1. **HNSW** to search nearest neighbors
2. **Cache** to avoid re-embedding the same text

---

## 2. HNSW Index (Hierarchical Navigable Small World)

**Files:**
- Production: `@claude-flow/memory/dist/hnsw-index.d.ts` (full implementation)
- Lightweight: `@claude-flow/memory/src/hnsw-lite.ts` (portable, educational)

### What HNSW Is

HNSW is a graph-based approximate nearest neighbor (ANN) algorithm. It builds a multi-layer graph where:
- Top layers are sparse (few connections, wide coverage)
- Bottom layers are dense (many connections, precise neighbors)
- Search starts at the top and descends layer by layer

**Performance:**
- Search: O(log n) — 150x–12,500x faster than brute force
- Insert: O(log n) amortized
- Memory: O(n × M × L) where M = max connections per node, L = layers

### Configuration

```typescript
interface HNSWConfig {
  dimensions: number;         // Vector dimensions (e.g., 384 for MiniLM)
  M: number;                  // Max connections per layer (default: 16)
  efConstruction: number;     // Candidate list size during build (default: 200)
  maxElements: number;        // Max vectors the index can hold
  metric: DistanceMetric;     // 'cosine' | 'euclidean' | 'dot' | 'manhattan'
  quantization?: QuantizationConfig; // Optional memory reduction
}
```

### Usage

```typescript
const index = new HNSWIndex({
  dimensions: 384,
  M: 16,
  efConstruction: 200,
  maxElements: 100000,
  metric: 'cosine',
});

// Add vectors
await index.addPoint('doc-1', embedding1);
await index.addPoint('doc-2', embedding2);
await index.addPoint('doc-3', embedding3);

// Search
const results = await index.search(queryEmbedding, 5, 100); // k=5, ef=100
// Returns: [{ id: 'doc-2', distance: 0.12 }, { id: 'doc-1', distance: 0.34 }, ...]

// Search with filter
const filtered = await index.searchWithFilters(
  queryEmbedding,
  5,
  (id) => id.startsWith('doc-'),  // Filter function
  100
);

// Remove
await index.removePoint('doc-1');

// Rebuild (useful after bulk operations)
await index.rebuild([
  { id: 'a', vector: embeddingA },
  { id: 'b', vector: embeddingB },
]);

// Stats
const stats = index.getStats();
// { vectorCount, memoryUsage, avgSearchTime, buildTime, compressionRatio }

// Check
console.log(index.has('doc-1'));  // boolean
console.log(index.size);          // number
```

### Optimization: Pre-normalized Cosine Distance

The HNSW implementation pre-normalizes vectors so cosine similarity becomes a **simple dot product** — no sqrt needed:

```typescript
private cosineDistanceNormalized(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return 1 - dot; // Convert similarity to distance
}
```

This is ~2x faster than standard cosine distance.

### Optimization: Heap-Based Priority Queues

The optimized `searchLayerOptimized` uses BinaryMinHeap/BinaryMaxHeap instead of `Array.sort()`:

```
Array.sort() approach:   O(n log n) per search layer
Heap-based approach:     O(log n) per operation
Expected speedup:        3-5x for large result sets
```

### HNSW Lite (Portable Version)

**File:** `@claude-flow/memory/src/hnsw-lite.ts`

A simpler, dependency-free HNSW implementation. Good for:
- Understanding the algorithm
- Environments where the full dist/ build isn't available
- Smaller datasets (<50k vectors)

```typescript
const lite = new HnswLite(
  384,          // dimensions
  16,           // maxNeighbors (M)
  200,          // efConstruction
  'cosine'      // metric
);

lite.add('doc-1', embeddingA);
lite.search(queryEmbedding, 5);  // → [{ id, score }]
lite.remove('doc-1');
```

---

## 3. Persistent Cache — Two Backends

### Backend A: RVEC Binary Cache (Recommended)

**File:** `@claude-flow/embeddings/src/rvf-embedding-cache.ts`

Zero dependencies. Pure TypeScript. No native modules. Custom binary format.

```typescript
const cache = new RvfEmbeddingCache({
  cachePath: './cache/embeddings.rvec',
  maxSize: 10000,       // Max entries before LRU eviction
  ttlMs: 7 * 24 * 60 * 60 * 1000,  // 7 days
  dimensions: 384,      // Optional: validates dimension on set()
});

await cache.set('text key', embedding);
const result = await cache.get('text key');  // Float32Array | null
const exists = await cache.has('text key');  // boolean
const deleted = await cache.delete('text key'); // boolean
await cache.clear();
const size = await cache.size();
await cache.close();
```

**Key design decisions:**
- **Lazy initialization** — The cache file is only loaded on first access
- **Auto-flush** — Writes to disk every 30 seconds when dirty
- **Write-ahead log** — Writes to `.tmp` file first, then atomically renames
- **LRU eviction** — Evicts oldest-accessed entries when maxSize exceeded
- **Format versioning** — Format includes version number for forward compatibility

#### RVEC Binary Format

```
Magic:    [0x52, 0x56, 0x45, 0x43]  ("RVEC")
Version:  uint32 (LE) = 2

Per entry:
  hash:         uint32 (FNV-1a hash of text key)
  dims:         uint32 (number of dimensions)
  embedding:    float32[dimensions]
  createdAt:    float64 (timestamp)
  accessedAt:   float64 (timestamp)
  accessCount:  float64
```

### Backend B: SQLite Cache

**File:** `@claude-flow/embeddings/src/persistent-cache.ts`

Uses **sql.js** — a pure WASM port of SQLite. Needs `sql.js` npm package, but no native compilation.

```typescript
const sqlCache = new PersistentEmbeddingCache({
  dbPath: './cache/embeddings.db',
  maxSize: 10000,
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  autoSaveInterval: 30000,  // ms
  compress: false,
});

await sqlCache.set('text key', embedding);
const result = await sqlCache.get('text key');
const stats = await sqlCache.getStats();
// { size, maxSize, hitRate, hits, misses, dbSizeBytes }
await sqlCache.clear();
await sqlCache.close();
```

**SQLite schema:**
```sql
CREATE TABLE embeddings (
  key         TEXT PRIMARY KEY,
  embedding   BLOB NOT NULL,
  dimensions  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  accessed_at INTEGER NOT NULL,
  access_count INTEGER DEFAULT 1
);
```

### Which Cache Backend to Use?

| Aspect | RVEC Binary | SQLite |
|--------|-------------|--------|
| Dependencies | None | sql.js (pure WASM) |
| File size | Smaller (raw floats) | Larger (SQLite overhead) |
| Queryable | No (binary only) | Yes (SQL queries) |
| Cross-platform | Yes | Yes (WASM) |
| Concurrent access | Single process | Single process |
| Setup complexity | None | Install sql.js npm package |

**Recommendation:** Use RVEC binary for the embedding cache. Only use SQLite if you need to query the cache directly (e.g., custom analytics).

---

## 4. Integration with Embedding Service

The RvfEmbeddingService already includes persistent cache integration:

```typescript
const service = new RvfEmbeddingService({
  provider: 'rvf',
  dimensions: 384,
  cachePath: './cache/embeddings.rvec', // ← Persistent cache active
});
```

Check flow:
```
service.embed('text')
  → in-memory LRU check (instant)
  → persistent RVEC cache check (if cachePath configured)
  → generate embedding (hash or neural)
  → store in both caches
  → return result with metadata
```

---

## 5. Memory Type System (Full Memory Backend)

**File:** `@claude-flow/memory/dist/types.d.ts`

The memory system provides a full `IMemoryBackend` interface that combines HNSW search with structured data storage:

```typescript
interface IMemoryBackend {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  store(entry: MemoryEntry): Promise<void>;
  get(id: string): Promise<MemoryEntry | null>;
  getByKey(namespace: string, key: string): Promise<MemoryEntry | null>;
  update(id: string, update: MemoryEntryUpdate): Promise<MemoryEntry | null>;
  delete(id: string): Promise<boolean>;
  query(query: MemoryQuery): Promise<MemoryEntry[]>;
  search(embedding: Float32Array, options: SearchOptions): Promise<SearchResult[]>;
  bulkInsert(entries: MemoryEntry[]): Promise<void>;
  bulkDelete(ids: string[]): Promise<number>;
}
```

Memory entries carry rich metadata:
```typescript
interface MemoryEntry {
  id: string;
  key: string;
  content: string;
  embedding?: Float32Array;
  type: 'episodic' | 'semantic' | 'procedural' | 'working' | 'cache';
  namespace: string;
  tags: string[];
  metadata: Record<string, unknown>;
  ownerId?: string;
  accessLevel: 'private' | 'team' | 'swarm' | 'public' | 'system';
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  version: number;
  references: string[];
  accessCount: number;
  lastAccessedAt: number;
}
```

### Search Options

```typescript
interface SearchOptions {
  k: number;                    // Number of results
  ef?: number;                  // Search expansion (higher = more accurate)
  threshold?: number;           // Minimum similarity (0-1)
  metric?: DistanceMetric;      // 'cosine' | 'euclidean' | 'dot' | 'manhattan'
  filters?: MemoryQuery;        // Post-search filters
}
```

---

## 6. RvfLearningStore — Persistent Learning Artifacts

**File:** `@claude-flow/memory/src/rvf-learning-store.ts`

A secondary persistence layer for learning system artifacts (patterns, LoRA adapters, EWC state, trajectories).

**Binary format:** Magic header `RVLS` + newline-separated JSON records.

```typescript
Store types:
- pattern:   Learned patterns with embeddings, success rate, usage count
- lora:      LoRA adapter configurations and weights
- ewc:       Elastic Weight Consolidation state (task weights)
- trajectory: Full execution trajectories for reinforcement learning
```

This is a write-once-append-and-rebuild store. On init, it reads every line and rebuilds in-memory state. On persist, it writes the entire state to a new file (atomic rename).

---

## Quick Reference

| Operation | Code |
|-----------|------|
| Add to HNSW | `await index.addPoint(id, vector)` |
| Search top-k | `await index.search(query, k)` |
| Filtered search | `await index.searchWithFilters(query, k, filterFn)` |
| RVEC cache write | `await cache.set(text, embedding)` |
| RVEC cache read | `await cache.get(text)` |
| SQLite cache write | `await sqlCache.set(text, embedding)` |
| SQLite cache stats | `await sqlCache.getStats()` |
| Check if indexed | `index.has(id)` |
| Index size | `index.size` |
| Rebuild index | `await index.rebuild(entries)` |
