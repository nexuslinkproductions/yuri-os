# RAG/MLM — Document Chunking & Normalization

> Embeddings work best on small, focused chunks. This file covers how to split documents and how to normalize vectors for consistent similarity.

---

## 1. Document Chunking

**File:** `@claude-flow/embeddings/src/chunking.ts`

### Configuration

```typescript
interface ChunkingConfig {
  maxChunkSize: number;     // Max chars per chunk (default: 512)
  overlap: number;          // Char overlap between chunks (default: 50)
  strategy: 'character' | 'sentence' | 'paragraph' | 'token';  // (default: 'sentence')
  minChunkSize: number;     // Min chars to emit a chunk (default: 100)
  includeMetadata: boolean; // Attach position info (default: true)
}
```

### Output Structure

```typescript
interface ChunkedDocument {
  chunks: Chunk[];
  originalLength: number;
  totalChunks: number;
  config: Required<ChunkingConfig>;
}

interface Chunk {
  text: string;        // The chunk text
  index: number;       // Position in document (0-based)
  startPos: number;    // Char offset in original text
  endPos: number;      // End char offset
  length: number;      // Char count
  tokenCount: number;  // Approximate (chars / 4)
}
```

### Usage

```typescript
import { chunkText, estimateTokens, reconstructFromChunks } from './index.js';

const result = chunkText(longDocument, {
  maxChunkSize: 512,
  overlap: 50,
  strategy: 'sentence',  // Also: 'character', 'paragraph', 'token'
  minChunkSize: 100,
});

console.log(`${result.totalChunks} chunks from ${result.originalLength} chars`);

// Each chunk has start/end positions for reconstruction
result.chunks.forEach((chunk, i) => {
  console.log(
    `Chunk ${i}: "${chunk.text.substring(0, 50)}..." ` +
    `(${chunk.length} chars, ~${chunk.tokenCount} tokens, ` +
    `pos ${chunk.startPos}-${chunk.endPos})`
  );
});
```

### Strategy Comparison

| Strategy | How It Works | Best For | Example Split |
|----------|-------------|----------|---------------|
| **character** | Split at exact char boundaries | Fixed-size chunks, code | `text.slice(pos, pos + maxSize)` |
| **sentence** | Split at sentence boundaries (`.!? `) | Natural language docs | Keeps sentences intact |
| **paragraph** | Split at `\n\n` boundaries | Structured documents | Falls back to sentence for long paragraphs |
| **token** | Multiplies maxChunkSize by 4, then sentence-chunks | Token-aligned chunks | `maxChunkSize * 4` chars as limit |

### Chunking Algorithm (Sentence Strategy)

```
1. Normalize whitespace (collapse multi-spaces)
2. Split text on sentence boundaries: /(?<=[.!?])\s+(?=[A-Z])/g
3. Accumulate sentences into chunks:
   - If current chunk + next sentence > maxChunkSize AND current ≥ minChunkSize:
     → Emit current chunk
     → Start new chunk with overlap (last `overlap` chars of previous)
   - Else: append sentence to current chunk
4. Emit final chunk
```

### Token Estimation

```typescript
const tokens = estimateTokens("Hello, world!");  // ≈ 4 tokens (chars / 4)
```

### Reconstruction (Approximate)

```typescript
// Merges chunks by finding overlapping suffix/prefix
const original = reconstructFromChunks(chunks);
```

The reconstruction finds the longest common overlap between consecutive chunks and merges them. It's *approximate* — good for verification, not pixel-perfect recovery.

---

## 2. Embedding Normalization

**File:** `@claude-flow/embeddings/src/normalization.ts`

Normalization ensures similarity comparisons are consistent. If vectors aren't normalized, cosine similarity behaves differently depending on vector magnitude.

### Four Methods

#### L2 Normalization (Most Common)

For cosine similarity. Scales vector to unit length (Euclidean norm = 1).

```typescript
import { l2Normalize, l2NormalizeInPlace, l2Norm, isNormalized } from './index.js';

const v = new Float32Array([3, 4, 0]);
const normalized = l2Normalize(v);  // [0.6, 0.8, 0]
console.log(l2Norm(normalized));    // 1.0
console.log(isNormalized(normalized)); // true

// In-place (avoids allocation)
l2NormalizeInPlace(v);
```

#### L1 Normalization

Sum of absolute values = 1.

```typescript
import { l1Normalize } from './index.js';

const v = new Float32Array([3, 4, 0]);
const normalized = l1Normalize(v);  // [0.4286, 0.5714, 0]
```

#### Min-Max Normalization

Scales to [0, 1] range. Useful when you need bounded values.

```typescript
import { minMaxNormalize } from './index.js';

const v = new Float32Array([-5, 0, 10, 3]);
const normalized = minMaxNormalize(v);  // [0, 0.333, 1, 0.533]
```

#### Z-Score Standardization

Mean = 0, Standard Deviation = 1. Useful for statistical methods.

```typescript
import { zScoreNormalize } from './index.js';

const v = new Float32Array([1, 2, 3, 4, 5]);
const normalized = zScoreNormalize(v);
// mean ≈ 0, std ≈ 1
```

### Generic Normalize Function

```typescript
import { normalize } from './index.js';

const result = normalize(embedding, {
  type: 'l2',       // 'l2' | 'l1' | 'minmax' | 'zscore' | 'none'
  epsilon: 1e-12,   // Prevent div-by-zero
  inPlace: false,   // Modify original array (memory optimization)
});
```

### Batch Normalization

```typescript
import { normalizeBatch } from './index.js';

const normalized = normalizeBatch(embeddings, { type: 'l2' });
```

### Centering (for Improved Similarity)

Subtracts batch mean from each vector. Useful before computing similarity matrices:

```typescript
import { centerEmbeddings } from './index.js';

const centered = centerEmbeddings(embeddings);
// Each vector now has the batch mean subtracted
```

### When to Normalize?

| Use Case | Normalization | Why |
|----------|--------------|-----|
| Cosine similarity search | L2 | Ensures dot product = cosine similarity |
| API embeddings (OpenAI, TF) | None (default) | These are already L2-normalized by the provider |
| RVF hash embeddings | L2 (built-in) | Applied automatically during generation |
| Statistical analysis | Z-score | Assumes normal distribution |
| Display/presentation | Min-max | Bounded [0, 1] range |
| Sparse vectors | L1 | Preserves sparsity pattern |

---

## 3. Putting It Together: RAG Ingestion Pipeline

```typescript
import { chunkText, estimateTokens } from './index.js';
import { createEmbeddingServiceAsync } from './index.js';
import { HNSWIndex } from './memory/index.js';

async function ingestDocument(
  text: string,
  metadata: { source: string; id: string }
) {
  // 1. Chunk
  const chunked = chunkText(text, {
    maxChunkSize: 512,
    overlap: 50,
    strategy: 'sentence',
  });

  console.log(`Split into ${chunked.totalChunks} chunks`);

  // 2. Embed
  const embedder = await createEmbeddingServiceAsync({ provider: 'auto' });
  const chunkTexts = chunked.chunks.map(c => c.text);
  const batch = await embedder.embedBatch(chunkTexts);

  // 3. Store in HNSW
  const index = new HNSWIndex({
    dimensions: 384,
    metric: 'cosine',
  });

  chunked.chunks.forEach((chunk, i) => {
    const id = `${metadata.id}:chunk-${chunk.index}`;
    index.addPoint(id, batch.embeddings[i] as Float32Array);
  });

  console.log(`Indexed ${chunked.totalChunks} vectors`);

  return { chunked, index, embedder };
}
```

---

## Quick Reference

| Task | Function | File |
|------|----------|------|
| Chunk by sentence | `chunkText(text, { strategy: 'sentence' })` | `chunking.ts` |
| Chunk by paragraph | `chunkText(text, { strategy: 'paragraph' })` | `chunking.ts` |
| Estimate tokens | `estimateTokens(text)` | `chunking.ts` |
| Reconstruct text | `reconstructFromChunks(chunks)` | `chunking.ts` |
| L2 normalize | `l2Normalize(embedding)` | `normalization.ts` |
| Z-score normalize | `zScoreNormalize(embedding)` | `normalization.ts` |
| Center batch | `centerEmbeddings(embeddings)` | `normalization.ts` |
| Check if normalized | `isNormalized(embedding)` | `normalization.ts` |
