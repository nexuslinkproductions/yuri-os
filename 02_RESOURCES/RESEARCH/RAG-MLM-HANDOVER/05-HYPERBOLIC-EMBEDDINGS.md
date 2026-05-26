# RAG/MLM — Hyperbolic Embeddings (Poincaré Ball)

> Euclidean embeddings represent everything in flat space. Hyperbolic embeddings
> represent data in a curved space that naturally captures **hierarchical structure**.
> Use this when your data has parent-child, taxonomy, or tree-like relationships.

---

## 1. Why Hyperbolic?

Euclidean space grows polynomially — volume scales as r^d.  
Hyperbolic space grows **exponentially** — volume scales as e^r.

This means:

| Property | Euclidean | Hyperbolic (Poincaré Ball) |
|----------|-----------|---------------------------|
| Space growth | Polynomial (r^d) | Exponential (e^r) |
| Tree capacity | Limited by dimension | Can embed arbitrarily deep trees |
| Hierarchy representation | Needs many dimensions | Natural — depth = distance from center |
| Parent-child distance | Linear | Exponential — captures hierarchy |
| Best for | General similarity | Taxonomies, ontologies, file systems |

**Concrete example:** A tree with branching factor 2 and depth 10 has 2047 nodes. In Euclidean space, you'd need ~50 dimensions for reasonable embedding. In hyperbolic space, 2-3 dimensions suffice because the space grows exponentially.

---

## 2. The Poincaré Ball Model

**File:** `@claude-flow/embeddings/src/hyperbolic.ts`

The Poincaré ball is the unit ball in n-dimensional space with a hyperbolic metric:

```
{ x ∈ ℝ^n : ||x|| < 1 }
```

Points near the origin represent general/high-level concepts.  
Points near the boundary represent specific/low-level concepts.  
Distance between points grows exponentially as you approach the boundary.

### Core Operations

#### Euclidean → Poincaré Ball (Exponential Map)

```typescript
import { euclideanToPoincare, isInPoincareBall } from './index.js';

const euclidean = new Float32Array([1.0, 0.5, 0.3]);
const poincare = euclideanToPoincare(euclidean, {
  curvature: -1,       // Curvature of hyperbolic space (default: -1)
  maxNorm: 1 - 1e-5,   // Clamp to prevent numerical issues
});

console.log(isInPoincareBall(poincare));  // true (norm < 1)
```

Algorithm: `exp_0(v) = tanh(√c × ||v|| / 2) × v / (√c × ||v||)`

#### Poincaré Ball → Euclidean (Logarithmic Map)

```typescript
import { poincareToEuclidean } from './index.js';

const euclidean = poincareToEuclidean(poincare);
// Round-trip conversion
```

Algorithm: `log_0(y) = 2 × arctanh(√c × ||y||) × y / (√c × ||y||)`

#### Hyperbolic Distance (Geodesic)

```typescript
import { hyperbolicDistance } from './index.js';

const a = euclideanToPoincare(new Float32Array([0.1, 0.2]));
const b = euclideanToPoincare(new Float32Array([0.3, 0.4]));

const distance = hyperbolicDistance(a, b, {
  curvature: -1,
  epsilon: 1e-15,
});
```

The Poincaré distance formula:

```
d(a,b) = (1/√c) × arcosh(1 + 2c × ||a-b||² / ((1-c||a||²)(1-c||b||²)))
```

This grows very fast near the boundary — tiny Euclidean distances near norm=0.99 correspond to enormous hyperbolic distances.

#### Möbius Addition (Hyperbolic "Plus")

Standard vector addition doesn't work in hyperbolic space (it would push you outside the ball). Use Möbius addition instead:

```typescript
import { mobiusAdd, mobiusScalarMul } from './index.js';

// Hyperbolic addition a ⊕ b
const sum = mobiusAdd(a, b);

// Scalar multiplication r ⊗ v
const doubled = mobiusScalarMul(2, a);
```

Algorithm: `r ⊗ v = tanh(r × arctanh(√c × ||v||)) × v / (√c × ||v||)`

#### Hyperbolic Centroid (Fréchet Mean)

```typescript
import { hyperbolicCentroid } from './index.js';

const points = [a, b, c];
const centroid = hyperbolicCentroid(points, {
  curvature: -1,
}, 100);  // Max iterations
```

This uses iterative Karcher mean optimization:
1. Initialize at Euclidean mean projected to ball
2. For each iteration, compute tangent-space gradients via log map
3. Update centroid via exponential map toward gradient
4. Converge when gradient norm < epsilon

---

## 3. Batch Operations

```typescript
import {
  batchEuclideanToPoincare,
  pairwiseHyperbolicDistances,
} from './index.js';

// Batch convert
const hyperbolicEmbeddings = batchEuclideanToPoincare(embeddings);

// Pairwise distance matrix (flattened upper triangle)
const distances = pairwiseHyperbolicDistances(hyperbolicEmbeddings);
// Length = n × (n-1) / 2
```

---

## 4. When to Use Hyperbolic Embeddings

| Use Case | Euclidean | Hyperbolic |
|----------|-----------|------------|
| General document similarity | ✅ Best | ❌ Overkill |
| Taxonomy/ontology | ❌ Weak | ✅ Natural |
| File system paths | ❌ Weak | ✅ Natural |
| Code module hierarchy | ❌ Weak | ✅ Natural |
| Organization chart | ❌ Weak | ✅ Natural |
| Wordnet/hypernyms | ❌ Weak | ✅ Best |
| Image similarity | ✅ Best | ❌ Overkill |
| Text retrieval (flat) | ✅ Best | ❌ Overkill |

**Rule of thumb:** If your data has a tree structure or you care about "is-a" relationships, use hyperbolic. If you just want "is this similar to that", use Euclidean.

---

## 5. Integration in a RAG Pipeline

```typescript
import { euclideanToPoincare, batchEuclideanToPoincare, hyperbolicDistance } from './index.js';
import { createEmbeddingServiceAsync } from './index.js';
import { HNSWIndex } from './memory/index.js';

async function ingestHierarchicalData(documents: Array<{ path: string; text: string }>) {
  const embedder = await createEmbeddingServiceAsync({ provider: 'auto' });

  // 1. Embed normally
  const batch = await embedder.embedBatch(documents.map(d => d.text));

  // 2. Convert to hyperbolic space
  const hyperbolic = batchEuclideanToPoincare(
    batch.embeddings.map(e => e as Float32Array)
  );

  // 3. Store Euclidean vectors in HNSW for search
  //    (HNSW uses Euclidean/cosine, not hyperbolic distance)
  const index = new HNSWIndex({ dimensions: 384, metric: 'cosine' });

  documents.forEach((doc, i) => {
    index.addPoint(doc.path, batch.embeddings[i] as Float32Array);
  });

  return { index, hyperbolic, embedder };
}

// To measure hierarchical distance between two query results:
// hyperbolicDistance(resultA_hyperbolic, resultB_hyperbolic)
```

---

## Quick Reference

| Function | Purpose | Formula |
|----------|---------|---------|
| `euclideanToPoincare(v)` | Euclidean → Poincaré ball | `exp_0(v)` |
| `poincareToEuclidean(v)` | Poincaré → Euclidean | `log_0(y)` |
| `hyperbolicDistance(a, b)` | Geodesic distance | Poincaré metric |
| `mobiusAdd(a, b)` | Hyperbolic addition | `a ⊕ b` |
| `mobiusScalarMul(r, v)` | Hyperbolic scaling | `r ⊗ v` |
| `hyperbolicCentroid(points)` | Fréchet mean | Karcher iteration |
| `isInPoincareBall(v)` | Check validity | `||v|| < 1/√c` |
| `batchEuclideanToPoincare(e)` | Batch convert | One by one |
| `pairwiseHyperbolicDistances(e)` | Distance matrix | Upper triangle |
