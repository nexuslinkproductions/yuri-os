# RAG/MLM — Neural Substrate Integration

> The "MLM" part of the system. Beyond retrieval, this subsystem treats embeddings
> as a **synthetic nervous system** — detecting semantic drift, managing memory
> physics, coordinating multi-agent swarms, and monitoring coherence.

---

## 1. What Is the Neural Substrate?

**File:** `@claude-flow/embeddings/src/neural-integration.ts`

The neural substrate wraps `agentic-flow/embeddings` advanced features with a **graceful fallback** — if agentic-flow isn't available, every method returns `null` instead of crashing.

**Four subsystems:**

| Subsystem | What It Does | Analogy |
|-----------|-------------|---------|
| **Drift Detection** | Track how input changes over time from a baseline | "Smell test" — is this conversation drifting off-topic? |
| **Memory Physics** | Hippocampal-style memory with interference detection | "This new fact conflicts with what I knew before" |
| **Swarm Coordination** | Position agents in embedding space, find collaborators | "These two agents are working on related tasks" |
| **Coherence Monitoring** | Check output quality against calibrated examples | "Does this output look like a good one?" |

---

## 2. Setup

```typescript
import { NeuralEmbeddingService, createNeuralService } from './index.js';

const neural = createNeuralService({
  dimension: 384,
  driftThreshold: 0.15,        // When to flag drift (default)
  decayRate: 0.01,             // Memory decay per consolidation
});

const available = await neural.init();
// If agentic-flow is installed → true
// If not → false (all methods return null gracefully)
```

---

## 3. Semantic Drift Detection

Tracks how far new inputs are from a baseline. Returns velocity and acceleration of drift.

### Setting a Baseline

```typescript
await neural.setDriftBaseline(
  "The fundamental architecture of the system uses HNSW indexing " +
  "for approximate nearest neighbor search in high-dimensional spaces."
);
```

### Detecting Drift

```typescript
// Stable — same topic
const drift1 = await neural.detectDrift(
  "HNSW is an algorithm for efficient vector similarity search."
);
// → { trend: 'stable', distance: 0.02, shouldEscalate: false }

// Slight drift — related but different
const drift2 = await neural.detectDrift(
  "The kitchen renovation will cost approximately $45,000."
);
// → { trend: 'drifting', distance: 0.42, shouldTriggerReasoning: true }

// Accelerating — topic has changed completely
const drift3 = await neural.detectDrift(
  "I need a recipe for vegan gluten-free chocolate cake."
);
// → { trend: 'accelerating', distance: 0.87, shouldEscalate: true }
```

### DriftResult Structure

```typescript
interface DriftResult {
  distance: number;              // How far from baseline (0-∞)
  velocity: number;              // Rate of change per observation
  acceleration: number;          // Acceleration of drift
  trend: 'stable' | 'drifting' | 'accelerating' | 'recovering';
  shouldEscalate: boolean;       // Flag for human intervention
  shouldTriggerReasoning: boolean; // Flag for agent re-orientation
}
```

### Use Cases

- **Conversation monitoring** — Detect when a chat goes off-topic
- **Agent focus tracking** — Alert when an agent drifts from its assigned task
- **Context window management** — Clear irrelevant context when drift accelerates
- **Quality assurance** — Flag outputs that differ from expected topics

---

## 4. Memory Physics

Hippocampal-inspired memory with interference detection, recall, and consolidation.

### Store Memory

```typescript
const result = await neural.storeMemory('mem-001', 
  'The project uses ONNX-optimized neural models for embedding generation.'
);

// Returns: { stored: true, interference: ['mem-003', 'mem-015'] }
// interference lists IDs of existing memories that semantically overlap
```

### Recall Memories

```typescript
const memories = await neural.recallMemories(
  'What embedding model does the project use?',
  5  // top-k
);

// Returns array of MemoryEntry with relevance scores:
// [
//   { id, content, strength, associations, relevance, ... },
//   { id, content, strength, associations, relevance, ... },
// ]
```

### MemoryEntry Structure

```typescript
interface MemoryEntry {
  id: string;
  embedding: Float32Array;
  content: string;
  strength: number;             // How well-remembered (decays over time)
  timestamp: number;
  accessCount: number;
  associations: string[];       // Linked memory IDs
  // When returned from recall:
  relevance?: number;           // Similarity to query
}
```

### Consolidation

```typescript
// Merge similar memories, forget weak ones
const result = neural.consolidateMemories();
// → { merged: 3, forgotten: 2, remaining: 15 }

// Full system consolidation (memory + agent states)
const full = neural.consolidate();
// → { memory: { merged: 3, forgotten: 2, remaining: 15 } }
```

Consolidation does two things:
1. **Merges** similar memories (reduces redundancy)
2. **Forgets** weak memories (strength below threshold after decay)

---

## 5. Swarm Coordination

Positions agents in embedding space and finds optimal collaborators for tasks.

### Register Agents

```typescript
await neural.addSwarmAgent('agent-researcher', 'researcher');
await neural.addSwarmAgent('agent-coder', 'coder');
await neural.addSwarmAgent('agent-reviewer', 'reviewer');
```

### Coordinate by Task

```typescript
const coordination = await neural.coordinateSwarm(
  'Implement HNSW index for vector similarity search'
);

// Returns array of agent alignments:
// [
//   { agentId: 'agent-coder',     taskAlignment: 0.92, bestCollaborator: 'agent-reviewer', collaborationScore: 0.87 },
//   { agentId: 'agent-researcher', taskAlignment: 0.45, bestCollaborator: 'agent-coder',   collaborationScore: 0.68 },
//   { agentId: 'agent-reviewer',  taskAlignment: 0.78, bestCollaborator: 'agent-coder',     collaborationScore: 0.87 },
// ]
```

Each agent gets its **position in embedding space** updated via `updateAgentState`, which processes observations and moves the agent's embedding toward relevant regions.

### Agent State

```typescript
interface AgentState {
  id: string;
  position: Float32Array;    // Position in embedding space
  velocity: Float32Array;    // Movement vector (recent direction)
  attention: Float32Array;   // Current focus direction
  energy: number;            // Available capacity (0-1)
  lastUpdate: number;        // Timestamp
}

// Get current state
const state = neural.getAgentState('agent-coder');
```

### Updating Agent State

```typescript
const update = await neural.updateAgentState('agent-coder',
  'Reviewing a pull request that adds HNSW indices to the memory module.'
);
// Returns: { newState: AgentState, nearestRegion: 'vector-indexing', regionProximity: 0.87 }
```

---

## 6. Coherence Monitoring

Calibrates against known-good outputs, then scores new outputs for quality.

### Calibration

```typescript
await neural.calibrateCoherence([
  'The system implements HNSW indexing with O(log n) search complexity.',
  'Embeddings are generated using ONNX-optimized models with SIMD acceleration.',
  'The cache layer provides LRU eviction with binary file persistence.',
]);
```

### Checking Coherence

```typescript
const result = await neural.checkCoherence(
  'The banana indexing protocol requires twelve limousines.'
);
// → { isCoherent: false, anomalyScore: 0.89, stabilityScore: 0.12, warnings: [...], ... }
```

### CoherenceResult

```typescript
interface CoherenceResult {
  isCoherent: boolean;
  anomalyScore: number;          // 0-1, higher = more anomalous
  stabilityScore: number;        // 0-1, higher = more consistent
  driftDirection: Float32Array | null;  // Where the drift is heading
  warnings: string[];            // Human-readable issues
}
```

---

## 7. Full Processing Pipeline

Run input through the entire neural substrate in one call:

```typescript
const result = await neural.process(
  'New input to analyze',
  {
    agentId: 'agent-researcher',  // Update this agent's state
    memoryId: 'mem-001',          // Store as memory with this ID
    checkCoherence: true,         // Also run coherence check
  }
);

// Returns (or null if agentic-flow unavailable):
// {
//   drift: DriftResult,
//   state?: { nearestRegion: string, regionProximity: number },
//   coherence?: CoherenceResult,
//   stored?: boolean,
// }
```

---

## 8. Health Monitoring

```typescript
const health = neural.health();
// {
//   memoryCount: 47,
//   activeAgents: 3,
//   avgDrift: 0.12,
//   avgCoherence: 0.89,
//   lastConsolidation: 1714839200000,
//   uptime: 3600000,  // 1 hour in ms
// }
```

---

## 9. When to Use Each Feature

| Feature | Use When | Don't Use When |
|---------|----------|----------------|
| **Drift Detection** | Monitoring agent behavior over time | Single-shot queries |
| **Memory Physics** | Building a persistent knowledge base | One-off lookups |
| **Swarm Coordination** | Multiple agents working in parallel | Single-agent systems |
| **Coherence** | Quality-critical outputs | Creative/exploratory work |

---

## 10. Dependencies & Fallbacks

The neural substrate requires `agentic-flow/embeddings` for the full feature set:

```typescript
// Check if available
import { isNeuralAvailable } from './index.js';
const available = await isNeuralAvailable();

// List/download ONNX models
import { listEmbeddingModels, downloadEmbeddingModel } from './index.js';

const models = await listEmbeddingModels();
// → [{ id: 'all-MiniLM-L6-v2', dimension: 384, size: '23MB', ... }]

const modelPath = await downloadEmbeddingModel('all-MiniLM-L6-v2', '.models', 
  (progress) => console.log(`Download: ${progress.percent}%`)
);
```

**Fallback behavior:** Every method returns `null` if agentic-flow is not available. No crashes, no throws. Design your system to handle `null` gracefully.
