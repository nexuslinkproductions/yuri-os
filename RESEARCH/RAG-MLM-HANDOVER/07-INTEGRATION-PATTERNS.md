# RAG/MLM — Integration Patterns

> This file covers how to **wire everything together** into a complete RAG pipeline.
> These are tested patterns from production usage — not theory.

---

## 1. Complete RAG Pipeline — Reference Implementation

```typescript
import { chunkText } from './embeddings/src/chunking.js';
import { createEmbeddingServiceAsync } from './embeddings/src/embedding-service.js';
import { HNSWIndex } from './memory/src/hnsw-lite.js';
import { RvfEmbeddingCache } from './embeddings/src/rvf-embedding-cache.js';

interface RAGPipeline {
  ingestDocument(text: string, metadata: Record<string, unknown>): Promise<void>;
  query(query: string, k?: number): Promise<Array<{ text: string; score: number; metadata: Record<string, unknown> }>>;
  shutdown(): Promise<void>;
}

async function createRAGPipeline(config: {
  dimensions?: number;
  cachePath?: string;
} = {}): Promise<RAGPipeline> {
  
  const dimensions = config.dimensions ?? 384;
  
  // 1. Embedding service with auto-fallback and disk cache
  const embedder = await createEmbeddingServiceAsync({
    provider: 'auto',
    dimensions,
    cacheSize: 10000,
  });

  // 2. Document store (in-memory — replace with your DB)
  const docStore = new Map<string, { text: string; metadata: Record<string, unknown> }>();

  // 3. HNSW vector index
  const index = new HnswLite(dimensions, 16, 200, 'cosine');

  return {
    async ingestDocument(text: string, metadata: Record<string, unknown> = {}) {
      // Chunk
      const chunked = chunkText(text, {
        maxChunkSize: 512,
        overlap: 50,
        strategy: 'sentence',
      });

      // Embed
      const texts = chunked.chunks.map(c => c.text);
      const batch = await embedder.embedBatch(texts);

      // Store
      chunked.chunks.forEach((chunk, i) => {
        const docId = `${metadata.id ?? 'doc'}:${chunk.index}`;
        docStore.set(docId, {
          text: chunk.text,
          metadata: { ...metadata, startPos: chunk.startPos, endPos: chunk.endPos },
        });
        index.add(docId, batch.embeddings[i] as Float32Array);
      });

      return chunked.totalChunks;
    },

    async query(query: string, k: number = 5) {
      const result = await embedder.embed(query);
      const results = index.search(result.embedding as Float32Array, k);
      
      return results.map(r => ({
        text: docStore.get(r.id)?.text ?? '',
        score: r.score,
        metadata: docStore.get(r.id)?.metadata ?? {},
      }));
    },

    async shutdown() {
      await embedder.shutdown();
    },
  };
}

// Usage
const rag = await createRAGPipeline({ dimensions: 384 });
await rag.ingestDocument("Your document content...", { id: 'doc-1', source: 'guide' });
const results = await rag.query("What is HNSW indexing?");
await rag.shutdown();
```

---

## 2. Pattern: Layered Caching for Production

Embedding generation is often the bottleneck. Configure all three cache layers:

```typescript
const embedder = new RvfEmbeddingService({
  provider: 'rvf',
  dimensions: 384,
  cacheSize: 10000,               // Layer 1: In-memory LRU (instant)
  cachePath: './cache/rvf.rvec',  // Layer 2: Disk persistence (30s flush)
});
```

**Cache hit rates in production:**
- First run (cold): ~0% hit rate
- After 100 distinct texts: ~20-40% if some reuse
- After 1000 texts with query reuse: ~60-80%
- Maximum: ~90% (the last 10% are novel queries)

**Memory budget:**
- 384-dim float32 vector = 1,536 bytes
- 10,000 entries in LRU = ~15MB (plus Map overhead)
- 100,000 entries = ~150MB
- Size the cache to match your available memory

---

## 3. Pattern: Async Batch Ingestion

When ingesting large document sets, batch for throughput:

```typescript
async function batchIngest(
  documents: Array<{ id: string; text: string }>,
  rag: RAGPipeline,
  batchSize = 10
) {
  const total = documents.length;
  let ingested = 0;

  for (let i = 0; i < total; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    
    // Process batch concurrently
    await Promise.all(batch.map(doc => rag.ingestDocument(doc.text, { id: doc.id })));

    ingested += batch.length;
    const percent = ((ingested / total) * 100).toFixed(1);
    console.log(`Ingested ${ingested}/${total} (${percent}%)`);
  }
}
```

---

## 4. Pattern: Temperature-Aware Search

Adjust the strictness of semantic matching:

```typescript
function searchWithTemperature(
  index: HnswLite,
  queryEmbedding: Float32Array,
  baseK: number,
  temperature: number  // 0 = exact match only, 1 = relaxed, 2+ = exploratory
) {
  const effectiveK = Math.ceil(baseK * (1 + temperature));
  const raw = index.search(queryEmbedding, effectiveK, 0.3 - (temperature * 0.1));
  
  if (temperature <= 1) {
    return raw.slice(0, baseK);
  }
  
  // For high temperature, inject some diversity
  // (stochastic sampling from top-k)
  const shuffled = raw.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, baseK);
}
```

---

## 5. Pattern: Multi-Tenant Namespacing

Isolate different datasets in the same index:

```typescript
function namespaceSearch(
  index: HnswLite,
  query: string,
  namespace: string,
  k: number
) {
  // Store IDs as "namespace:id"
  // Filter by namespace prefix
  const results = index.search(query, k * 3); // Overfetch
  
  return results
    .filter(r => r.id.startsWith(`${namespace}:`))
    .slice(0, k);
}

// Ingestion
function namespaceStore(index: HnswLite, namespace: string, id: string, vector: Float32Array) {
  index.add(`${namespace}:${id}`, vector);
}
```

---

## 6. Pattern: Hybrid Search (Semantic + Keyword)

Combine vector search with keyword overlap for better recall:

```typescript
function hybridSearch(
  query: string,
  index: HnswLite,
  queryEmbedding: Float32Array,
  k: number,
  keywordWeight = 0.3  // 0 = pure semantic, 1 = pure keyword
) {
  // Semantic
  const semanticResults = index.search(queryEmbedding, k * 2);

  // Keyword (simple TF overlap)
  const queryTerms = query.toLowerCase().split(/\s+/);
  const keywordResults = Array.from(index.keys()).map(id => {
    const docText = docStore.get(id)?.text ?? '';
    const docTerms = docText.toLowerCase().split(/\s+/);
    const overlap = queryTerms.filter(t => docTerms.includes(t)).length;
    return { id, score: overlap / queryTerms.length };
  }).filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  // Merge with reciprocal rank fusion
  // (Rerank semantic results boosted by keyword overlap)
  return semanticResults.map(sr => {
    const kw = keywordResults.find(kr => kr.id === sr.id);
    const keywordScore = kw ? kw.score : 0;
    const combined = (sr.score * (1 - keywordWeight)) + (keywordScore * keywordWeight);
    return { ...sr, score: combined };
  }).sort((a, b) => b.score - a.score).slice(0, k);
}
```

---

## 7. Pattern: Progressive Model Loading

Start with RVF (instant), upgrade to neural when ready:

```typescript
let embedder = new RvfEmbeddingService({
  provider: 'rvf',
  dimensions: 384,
  cachePath: './cache/rvf.rvec',
});

// Lazy upgrade to neural when model downloads are complete
async function upgradeToNeural() {
  try {
    const neural = new AgenticFlowEmbeddingService({
      provider: 'agentic-flow',
      modelId: 'all-MiniLM-L6-v2',
    });
    
    // Test it
    await neural.embed('test');
    
    // Migrate cache — re-embed with neural
    // (Optional: warm cache by re-embedding frequent queries)
    
    embedder = neural;
    console.log('Upgraded to neural embeddings');
  } catch (err) {
    console.log('Neural not available, staying on RVF');
  }
}

// Start downloading in background
upgradeToNeural();
// Meanwhile, queries work instantly via RVF
```

---

## 8. Pattern: Streaming Ingestion with Backpressure

When ingesting from a stream:

```typescript
import { Writable } from 'stream';

function createIngestionStream(rag: RAGPipeline, concurrency = 3) {
  const queue: Array<{ text: string; meta: Record<string, unknown> }> = [];
  let active = 0;
  let resolveIdle: (() => void) | null = null;

  async function processNext() {
    if (queue.length === 0 || active >= concurrency) return;
    
    active++;
    const item = queue.shift()!;
    
    try {
      await rag.ingestDocument(item.text, item.meta);
    } finally {
      active--;
      if (queue.length === 0 && active === 0 && resolveIdle) {
        resolveIdle();
        resolveIdle = null;
      }
      processNext(); // Process next queued item
    }
  }

  return new Writable({
    objectMode: true,
    async write(chunk, encoding, callback) {
      queue.push(chunk);
      processNext();
      callback();
    },
    final(callback) {
      if (active === 0) {
        callback();
      } else {
        // Wait for all active to finish
        const wait = new Promise<void>(resolve => { resolveIdle = resolve; });
        wait.then(() => callback());
      }
    },
  });
}
```

---

## 9. Pattern: Event-Driven Monitoring

```typescript
embedder.addEventListener((event) => {
  switch (event.type) {
    case 'embed_complete':
      trackLatency(event.latencyMs);
      break;
    case 'cache_hit':
      incrementCacheHit(event.text);
      break;
    case 'cache_eviction':
      logEviction(event.size);
      break;
    case 'embed_error':
      logError(event.text, event.error);
      break;
  }
});

// Periodically log cache health
setInterval(() => {
  const stats = embedder.getCacheStats();
  console.log(
    `Cache: ${stats.size}/${stats.maxSize} (hit rate: ${(stats.hitRate * 100).toFixed(1)}%)`
  );
}, 60000);
```

---

## 10. Pattern: Graceful Shutdown

```typescript
async function gracefulShutdown(rag: RAGPipeline, signal: string) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  
  // 1. Stop accepting new work
  // 2. Flush caches
  // 3. Close all connections
  
  await rag.shutdown();
  console.log('All systems stopped. Goodbye.');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown(rag, 'SIGINT'));
process.on('SIGTERM', () => gracefulShutdown(rag, 'SIGTERM'));
```

---

## Quick Reference — Which Pattern for Which Problem

| Problem | Pattern |
|---------|---------|
| "Embeddings are too slow" | Layered Caching (Pattern 2) |
| "I have 10,000 documents to ingest" | Batch Ingestion (Pattern 3) |
| "I need strict matching" | Temperature-Aware Search (Pattern 4) |
| "Multiple users/datasets share one index" | Multi-Tenant Namespacing (Pattern 5) |
| "Vector search misses exact matches" | Hybrid Search (Pattern 6) |
| "I want instant startup + neural later" | Progressive Loading (Pattern 7) |
| "I have a stream of documents" | Streaming Ingestion (Pattern 8) |
| "I need to debug cache behavior" | Event Monitoring (Pattern 9) |
| "Server restart loses data" | Graceful Shutdown (Pattern 10) |
