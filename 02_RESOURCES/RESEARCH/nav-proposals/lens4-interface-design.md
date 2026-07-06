# LENS 4 — LLM-NATIVE QUERY + INTERFACE (design doc)

## Status: `[NEW]` — the mandatory first navigation move for any LLM lane; wraps the master navigation index (Lens 3) + completeness guard (Lens 1) into a trustable, streaming LLM-facing API.

---

## 1. The Problem: LLM Lanes Don't Trust Retrieval

Today an LLM lane (Rick, Codex, DeepSeek, local) faces:
- **`ai search`** — mandated first stop (`.claude/rules/research_pipeline.md`), but returns a flat BM25 hit list with no completeness signal
- **`xref-query`** — unifies 4 surfaces with provenance, but no guarantee the structural leg enumerated fully, no sector coverage map, no "what am I missing" critic
- **Circuitry graph** — readable but raw; no query planner, no iterative deepening
- **Energy/claim gates** — `yuri-energy.mjs` computes ΔU, `claim-cortex.mjs` gates verdicts, but they're downstream of retrieval; if retrieval missed a critical artifact, the gate operates on incomplete evidence

**Result**: Retrieval quality depends on the query being "deep enough" — fragile, unauditable, no receipt.

---

## 2. The Contract: What the LLM Gets

Every navigation query returns a **NavigationMap** — not a hit list — with three layers:

```
NavigationMap
├── 1. EXHAUSTIVE OVERVIEW (bounded, guaranteed)
│   ├── SectorMap: all 17 sectors, which have artifacts, which are empty, why
│   ├── MechanismMap: all 5 mechanismPattern verbs, which fired, cross-sector twins
│   ├── StructuralMap: GitNexus call-graph neighborhood (100% enumerated or marked stale)
│   └── MemoryMap: hot/warm/cold recall coverage per sector
│
├── 2. FOCUSED ARTIFACTS (the "answer")
│   ├── Primary hits: top-K provenance-graded entries (from xref-query)
│   ├── Context neighbors: upstream/downstream/siblings per circuitry graph
│   └── Mechanism siblings: cards sharing the same mechanismPattern verb
│
└── 3. COMPLETENESS RECEIPT (verifiable, from Lens 1)
    ├── Guaranteed: structural enumeration complete?, topological sectors all visited?
    ├── Calibrated: lexical recall@k, mechanism recall@k, memory usage coverage
    ├── Gaps: explicit list of what was NOT searched and why
    ├── MissingCritic: "what kinds of artifacts are provably absent"
    ├── WidenSuggestions: actionable "run modality X", "refresh index Y", "expand sector Z"
    └── Signature: HMAC-SHA256 over the above (tamper-evident)
```

**The trust primitive**: The LLM doesn't need to trust the system — it verifies the receipt against live indices. The receipt *is* the evidence.

---

## 3. Query Model: Natural Language → Multi-Surface Plan

### 3.1 Intent Classification (deterministic, no ML)

```typescript
// [NEW] In lens4-interface-query.mjs
interface QueryIntent {
  // Primary intent (one)
  primary: 'find-mechanism' | 'trace-impact' | 'understand-sector' | 'verify-claim' | 'explore-neighborhood' | 'audit-completeness';
  // Secondary intents (zero or more)
  secondary: QueryIntent['primary'][];
  // Anchors extracted from query
  anchors: {
    nodeIds: string[];           // circuitry node IDs mentioned or inferred
    sectorNames: string[];       // sector names mentioned
    mechanismVerbs: string[];    // mechanismPattern verbs matched
    symbols: string[];           // GitNexus symbol names
    filePaths: string[];         // file paths mentioned
    claimTokens: string[];       // quoted terms that look like claims
  };
  // Implied scope
  scope: {
    sectorsRequired: string[];      // sectors that MUST be visited for this intent
    modalitiesRequired: Modality[]; // which of 5 retrieval modalities are required
    depthHint: 'shallow' | 'standard' | 'deep' | 'exhaustive';
  };
  // Confidence in classification
  confidence: number; // 0..1
}
```

**Classification rules** (pure function, grounded in circuitry graph + mechanism registry):
- `find-mechanism`: query contains mechanism verb or "how does X work" → requires structural + mechanism + graph
- `trace-impact`: query contains "impact", "blast radius", "what breaks", "callers of" → requires GitNexus structural (100% enumeration) + graph upstream
- `understand-sector`: query names a sector or "overview of X" → requires topological (all nodes in sector) + memory
- `verify-claim`: query contains "prove", "verify", "evidence for", quoted claim tokens → requires all 5 modalities + claim re-derivation
- `explore-neighborhood`: query names a node + "neighbors", "related", "siblings" → requires graph 1-hop + mechanism siblings
- `audit-completeness`: query contains "complete", "missed", "what am I missing" → requires all modalities + critic

### 3.2 Multi-Surface Execution Plan

```typescript
// [NEW] Generated from intent
interface ExecutionPlan {
  queryId: string;
  intent: QueryIntent;
  steps: PlanStep[];
  estimatedCost: { fts5: number; graph: number; gitnexus: number; spectrum: number; memory: number };
  requiredCompleteness: 'guaranteed' | 'calibrated' | 'best-effort';
}

interface PlanStep {
  modality: Modality;
  operation: string;           // e.g. "enumerate 1-hop callers of symbol X"
  dependsOn: string[];         // step ids this depends on
  optional: boolean;           // if true, failure degrades gracefully
  timeoutMs: number;
}
```

**Example**: Query `"energy gate protected path veto"` → intent `verify-claim` with anchors `{nodeIds:['energy-gate'], claimTokens:['protected path veto']}` → plan runs all 5 modalities, requires `guaranteed` completeness, estimates 800ms.

---

## 4. The NavigationMap: Bounded-but-Exhaustive Output

### 4.1 SectorMap — The "Table of Contents" for the Query

```typescript
interface SectorMapEntry {
  sector: string;                    // e.g. 'pulse_cortex', 'memory', 'code_intelligence'
  nodesTotal: number;                // from circuitry graph
  nodesWithArtifacts: number;        // have mapped docs/symbols/memory
  nodesEmpty: number;                // no artifacts found
  artifacts: {
    docs: number;
    symbols: number;
    memoryEntries: number;
    mechanismCards: number;
  };
  coverage: 'complete' | 'partial' | 'empty' | 'stale';
  // Why incomplete?
  gaps: string[];                    // e.g. "3 nodes have no mapped docs", "gitnexus 12 commits behind"
  // For the LLM: is this sector relevant to the query?
  relevance: 'primary' | 'secondary' | 'peripheral' | 'irrelevant';
  relevanceReason: string;
}
```

**Every sector appears** — even empty ones. The LLM sees the *entire system topology* at a glance, not just hits.

### 4.2 MechanismMap — Cross-Sector Mechanism Twins

```typescript
interface MechanismMapEntry {
  verb: string;                      // one of 5: 'replace-hand-tuned-constant' | 'read-lower-bound-not-point' | 'gate-on-identity-not-aggregate' | 'shared-prerequisite-unlock' | 'compose-readonly-analyzer'
  nodes: string[];                   // circuitry node IDs instantiating this verb
  sectors: string[];                 // sectors those nodes live in
  cards: string[];                   // formula-card IDs (if math-bearing)
  confidence: 'high' | 'medium' | 'low'; // based on witness count + structural corroboration
  crossSectorTwins: {                // pairs in different sectors sharing this verb
    nodeA: string; nodeB: string;
    sectorA: string; sectorB: string;
  }[];
}
```

This is the **mechanism-fit theater killer**: the LLM sees *all* instantiations of a mechanism verb across sectors, with structural proof (GitNexus call-graph overlap) or honest "low confidence" if only lexical.

### 4.3 StructuralMap — GitNexus Neighborhood (Provable)

```typescript
interface StructuralMap {
  anchorSymbols: string[];           // symbols the query anchored on
  enumeration: {
    upstream: { found: number; total: number; complete: boolean; stale: boolean };
    downstream: { found: number; total: number; complete: boolean; stale: boolean };
    siblings: { found: number; total: number; complete: boolean; stale: boolean };
  };
  neighbors: StructuralNeighbor[];
  gaps: string[];                    // e.g. "index 23 commits behind — 5 upstream callers may be missing"
}

interface StructuralNeighbor {
  symbolId: string;
  symbolName: string;
  filePath: string;
  line: number;
  edgeKind: 'calls' | 'reads' | 'writes';
  direction: 'upstream' | 'downstream' | 'sibling';
  circuitryNodeId: string;           // mapped node
  confidence: number;                // 0.8-1.0 from xref-provenance
}
```

**Key**: `complete: boolean` is **provable** — if GitNexus index is fresh, `found === total` is enforced. If stale, `stale: true` and the gap is explicit.

### 4.4 MemoryMap — Recall Coverage

```typescript
interface MemoryMap {
  tiers: {
    hot: { entries: number; sectors: string[]; lastRecall: string };
    warm: { entries: number; sectors: string[]; lastRecall: string };
    cold: { entries: number; sectors: string[]; lastRecall: string };
  };
  usageCoverage: {                   // from memory-usage.jsonl
    sectorsWithRecall: string[];
    sectorsWithoutRecall: string[];
    coverageRatio: number;           // sectors with recall / total sectors
  };
  relevantToQuery: string[];         // memory entry IDs matching query tokens
}
```

---

## 5. Completeness Receipt (from Lens 1)

```typescript
interface CoverageReceipt {
  receiptId: string;                 // UUID v4
  queryId: string;
  timestamp: string;
  // Guaranteed = provable 100% enumeration
  guaranteed: {
    structural: boolean;             // GitNexus 1-hop fully enumerated + index fresh
    topological: boolean;            // all required sectors visited
  };
  // Calibrated = statistical bounds from held-out eval
  calibrated: {
    lexical: { recallAtK: number; k: number; bound: 'proven'|'calibrated'|'unknown'; confidence: 'high'|'medium'|'low' };
    mechanism: { recallAtK: number; k: number; bound: 'proven'|'calibrated'|'unknown'; confidence: 'high'|'medium'|'low' };
    memory: { usageCoverage: number; bound: 'proven'|'calibrated'|'unknown'; confidence: 'high'|'medium'|'low' };
  };
  // Honest gaps
  gaps: ShallownessSignal;           // from Lens 1 ShallownessDetector
  // What the critic says is missing
  missing: MissingCritique;          // from Lens 1 MissingCritic
  // Actionable widening
  widen: WidenSuggestions;
  // Tamper-evident
  signature: string;                 // HMAC-SHA256(receiptJson, RECEIPT_KEY)
}
```

**Verification**: Any LLM lane can re-run the enumeration checks:
```js
// Verify structural guarantee
const gxMeta = await gitnexusQuery({query: '', metaOnly: true});
const structuralGuaranteed = receipt.guaranteed.structural;
const actualFresh = gxMeta.indexedCommit === gxMeta.head;
assert(structuralGuaranteed === actualFresh, 'Receipt structural guarantee mismatch');
```

---

## 6. Iterative Deepening: "Go Deeper on Sector X"

The NavigationMap is **not the end** — it's a map with doors. The LLM can ask for deeper traversal:

```typescript
// [NEW] Deepening API
interface DeepenRequest {
  queryId: string;                   // original query
  target: {
    type: 'sector' | 'node' | 'mechanism' | 'symbol' | 'memory-tier';
    id: string;                      // sector name, node ID, verb, symbol ID, or tier name
  };
  depth: 'one-hop' | 'two-hop' | 'full-subgraph' | 'all-artifacts';
  modalities: Modality[];            // which surfaces to re-run (default: all)
}

interface DeepenResponse {
  queryId: string;
  parentQueryId: string;
  added: {
    artifacts: NavEntry[];
    sectors: SectorMapEntry[];
    mechanisms: MechanismMapEntry[];
    structural: StructuralNeighbor[];
    memory: MemoryEntry[];
  };
  updatedReceipt: CoverageReceipt;   // receipt updated with new enumeration
}
```

**Example flow**:
1. LLM queries `"energy gate"` → gets NavigationMap with `pulse_cortex` as primary sector
2. LLM sees `classification` sector is secondary but has 3 nodes with artifacts → asks `deepen({type:'sector', id:'classification', depth:'all-artifacts'})`
3. Returns all artifacts in classification sector + updated receipt showing topological guarantee now covers that sector

**This is the "breadth ENFORCED" primitive**: the LLM *sees* the missing sectors in the SectorMap, *chooses* to deepen, and gets a new receipt proving the expanded coverage.

---

## 7. Composition with Existing Mandates

### 7.1 `ai search` First-Stop Mandate (`.claude/rules/research_pipeline.md`)

**Current rule**: "The mandated first research stop is `ai search` (FTS5/BM25)."

**New composition**: `navQuery()` **wraps** `ai search` — it runs the FTS5 pass as part of its multi-surface plan, but *also* runs the other 4 surfaces and emits the completeness receipt. The mandate is satisfied *and strengthened*:
- `ai search` alone → flat hits, no guarantee
- `navQuery()` → includes `ai search` results + structural/topological/mechanism/memory + receipt

**Migration**: Update `.claude/rules/research_pipeline.md` to mandate `navQuery()` as the new first stop; `ai search` becomes a modality within it.

### 7.2 Energy/Claim Gates (`yuri-energy.mjs`, `claim-cortex.mjs`)

**Current flow**: Retrieval → reasoning → energy gate (ΔU) → claim cortex (verdict) → action.

**New flow**: Retrieval (`navQuery`) → **receipt attached to context** → reasoning → energy gate sees `receipt.guaranteed.structural` → claim cortex sees `receipt.calibrated.lexical.recallAtK`.

**Gate integration**: The energy gate can now **require** a minimum completeness before allowing high-stakes mutations:
```js
// In yuri-energy.mjs gateProposal (conceptual)
if (proposal.risk === 'CRITICAL' && !context.navReceipt?.guaranteed.structural) {
  return { veto: true, reason: 'Critical mutation requires structural completeness guarantee' };
}
```

### 7.3 Circuitry-First Navigation (CODEX_PROTOCOL.md)

**Current rule**: "Before a Codex lane edits anything, it READS the system self-model (`yuri-graph-state.json`) so it understands where its target sits."

**New composition**: `navQuery()` **includes** the circuitry graph traversal as its topological modality. The NavigationMap's SectorMap *is* the circuitry self-model filtered to query relevance. The Codex lane gets:
- The full graph topology (SectorMap)
- Its target's neighborhood (StructuralMap)
- Mechanism twins across sectors (MechanismMap)
- A receipt proving nothing was missed

**This satisfies the circuitry-first principle *by construction*** — the query *returns* the circuitry context.

---

## 8. What Makes an LLM TRUST It Covered Everything

| Trust Primitive | Mechanism | Verifiable By LLM |
|-----------------|-----------|-------------------|
| **Provable enumeration** | GitNexus 1-hop = finite graph; `found === total` enforced | Re-query GitNexus `meta` endpoint; compare `receipt.guaranteed.structural` |
| **Sector completeness** | Circuitry graph = 124 nodes fixed; all sectors enumerated | Load `yuri-graph-state.json`; count sectors in SectorMap vs graph |
| **Mechanism coverage** | 5 verbs closed enum; all nodes tagged or explicitly untagged | Check `mechanism-pattern-registry.mjs` verbs vs MechanismMap |
| **Honest gaps** | Gaps array lists *every* known blind spot with cause | Cross-reference gaps against live indices (gitnexus staleness, file existence) |
| **Tamper-evident receipt** | HMAC-SHA256 over receipt; key in env | Recompute signature; verify match |
| **Iterative deepening** | Every deepen returns updated receipt | Compare `parentQueryId` receipt → new receipt; coverage only increases |
| **No silent truncation** | `matched=N, surfaced=K, (N-K) more above floor` always visible | Count hits vs `surfaced`; verify `matched >= surfaced` |

**The trust is not "believe the system"** — it's "the system gives you the evidence to verify it yourself in 3 tool calls."

---

## 9. LLM-Facing API (The Single Entry Point)

```typescript
// [NEW] lens4-interface-query.mjs — the ONLY function an LLM lane calls
interface NavQueryOptions {
  query: string;                     // natural language
  // Intent override (optional; normally inferred)
  intent?: Partial<QueryIntent>;
  // Completeness requirement
  requireGuaranteed?: boolean;       // if true, throws on critical gaps
  minRecall?: {                      // override calibrated bounds
    lexical?: number;
    mechanism?: number;
    memory?: number;
  };
  // Streaming (for long queries)
  stream?: boolean;                  // if true, yields partial NavigationMap chunks
  // Context from previous turns
  previousQueryId?: string;          // for iterative deepening context
  maxTimeMs?: number;                // hard timeout (default 5000)
}

interface NavigationMap {
  queryId: string;
  query: string;
  intent: QueryIntent;
  // The three-layer map
  sectorMap: SectorMapEntry[];
  mechanismMap: MechanismMapEntry[];
  structuralMap: StructuralMap;
  memoryMap: MemoryMap;
  // Focused artifacts (the "answer")
  primaryHits: NavEntry[];           // top-K from xref-query, provenance-graded
  contextNeighbors: NavEntry[];      // graph upstream/downstream/siblings
  mechanismSiblings: NavEntry[];     // same mechanismPattern verb
  // The guarantee
  receipt: CoverageReceipt;
  // Deepening handles
  deepen: (req: DeepenRequest) => Promise<DeepenResponse>;
  // Convenience: "what should I look at next?"
  suggestedDeepens: DeepenRequest[];
}

async function navQuery(query: string, opts?: NavQueryOptions): Promise<NavigationMap>;
```

**Usage in a lane** (Claude, Codex, DeepSeek, local):
```js
// Mandatory first move
const map = await navQuery("energy gate protected path veto");

// Check receipt before reasoning
if (map.receipt.gaps.severity === 'critical') {
  // Either deepen automatically or escalate
  const more = await map.deepen(map.suggestedDeepens[0]);
  map.primaryHits.push(...more.added.artifacts);
  map.receipt = more.updatedReceipt;
}

// Attach receipt to all downstream claims
const reasoning = await reasonWithContext(map.primaryHits, { receipt: map.receipt });
return { answer: reasoning, coverageReceipt: map.receipt };
```

---

## 10. Streaming Mode (for 1M-token contexts)

For very large queries or when the LLM wants to start reasoning before full enumeration:

```typescript
async function* navQueryStream(query: string, opts: NavQueryOptions): AsyncGenerator<NavigationMapChunk> {
  // Yields in order:
  // 1. { type: 'intent', intent: QueryIntent }
  // 2. { type: 'sectorMap', sectorMap: SectorMapEntry[] }        // fast, from graph
  // 3. { type: 'mechanismMap', mechanismMap: MechanismMapEntry[] } // fast, from registry
  // 4. { type: 'structuralMap', structuralMap: StructuralMap }    // GitNexus (may be slow)
  // 5. { type: 'memoryMap', memoryMap: MemoryMap }                // fast, from ledger
  // 6. { type: 'primaryHits', hits: NavEntry[] }                  // from xref-query merge
  // 7. { type: 'receipt', receipt: CoverageReceipt }              // final
  // 8. { type: 'complete', map: NavigationMap }                   // full object
}
```

The LLM can start synthesizing from chunk 2-3 while 4-6 complete.

---

## 11. Integration with Existing Modules (Real Exports)

| Module | Real Export | Use in Lens 4 |
|--------|-------------|---------------|
| `xref-query.mjs` | `xrefQuery(rawQuery, opts)` | Primary hits + provenance grading |
| `xref-provenance.mjs` | `scoreHit`, `gateHit`, `serializeRevalidate`, `XREF_PROVENANCE_KNOBS` | Confidence model for all hits |
| `xref-drift-scan.mjs` | `scanDrift()`, `gitnexusStaleness()` | Staleness signals for receipt |
| `yuri-graph-state.json` | (file read) | Circuitry graph for SectorMap, context neighbors |
| `mechanism-pattern-registry.mjs` | `MECHANISM_PATTERN_VERBS`, `validateMechanismPatternRegistry()` | MechanismMap verbs + validation |
| `memory-usage.mjs` | `buildUsageIndex()`, `usageFor()` | MemoryMap usage coverage |
| `memory-relocator.mjs` | `loadItems()` | MemoryMap tier entries |
| `lifecycle-gap-scan.mjs` | `scanLifecycle()` | Gap awareness for suggestedDeepens |
| `CLAUDE.md` / `context-router.mjs` | (pattern) | Mandate integration point |

---

## 12. Files to Create (All [NEW])

```
02_RESOURCES/RESEARCH/nav-proposals/
├── lens4-interface-design.md              ← this file
├── lens4-interface-query.mjs              ← Core LLM-facing API (HIGHEST LEVERAGE)
├── lens4-interface-types.ts               ← TypeScript types
├── lens4-interface-intent.mjs             ← Intent classification (pure)
├── lens4-interface-plan.mjs               ← Execution plan builder
├── lens4-interface-map.mjs                ← NavigationMap builders
├── lens4-interface-deepen.mjs             ← Iterative deepening
├── lens4-interface-receipt.mjs            ← CoverageReceipt + HMAC
├── lens4-interface-config.json            ← Thresholds, timeouts, HMAC key ref
└── lens4-interface-test.mjs               ← Contract tests
```

---

## 13. Highest-Leverage Build-FIRST File

**`lens4-interface-query.mjs`** — the single entry point `navQuery(query, opts)`.

**Why**:
1. It's the **mandatory first navigation move** — every LLM lane calls this
2. It composes all other modules (xref-query, graph, drift-scan, memory, mechanism registry)
3. It emits the **NavigationMap + CoverageReceipt** — the trust primitive
4. It implements **iterative deepening** — the breadth-enforcement primitive
5. It satisfies the **`ai search` mandate + circuitry-first principle + energy gate integration** in one call
6. Without it, the master navigation layer (Lens 3) and completeness guard (Lens 1) have no LLM-facing front door

**Success criteria**:
- `navQuery("test query")` returns NavigationMap in < 2s (streaming first chunk < 200ms)
- Receipt verifies against live indices (gitnexus, graph, memory)
- `deepen()` returns updated receipt with monotonically increasing coverage
- All 17 sectors appear in SectorMap (even empty)
- All 5 mechanism verbs appear in MechanismMap
- StructuralMap `complete: true` iff GitNexus index fresh + enumeration exhaustive

---

## 14. Epistemic Tags

| Element | Confidence | Basis | Falsifier |
|---------|------------|-------|-----------|
| Intent classification via deterministic rules | **HIGH** | Circuitry graph sectors + mechanism verbs + GitNexus symbols are finite known sets | New sector/verb added without updating classifier |
| SectorMap enumerates all 17 sectors | **HIGH** | `yuri-graph-state.json` has fixed sectors; code reads it directly | Graph schema changes sector list |
| StructuralMap provable completeness | **HIGH** | GitNexus call-graph is finite; xref-drift-scan already emits staleness | GitNexus adds pagination without total-count |
| MechanismMap covers all 5 verbs | **HIGH** | `mechanism-pattern-registry.mjs` exports frozen 5-verb enum | Registry expands without version bump |
| CoverageReceipt HMAC verification | **HIGH** | Standard crypto; key in env not code | Key rotation not handled |
| Iterative deepening monotonic coverage | **MEDIUM** | Designed to only add; not yet proven against adversarial deepen sequences | Deepen on overlapping targets could double-count |
| Composition with energy gates | **MEDIUM** | Energy gate code read; integration point identified | Energy gate doesn't currently read context.navReceipt |
| Streaming chunk order optimal | **LOW** | Heuristic; depends on actual latency profiles | GitNexus faster than graph traversal on some machines |

---

## 15. Open Questions

1. **HMAC key management**: Where does `RECEIPT_KEY` live? `.env`? `_SYSTEM/OS_KERNEL/receipt-key`? Needs owner decision.

2. **Streaming cancellation**: If LLM cancels mid-stream, what state remains? Need idempotent query IDs.

3. **Cross-lane receipt sharing**: Can a Codex lane verify a receipt generated by a Claude lane? Yes if key shared — but key distribution needs design.

4. **Intent classification ambiguity**: What if query maps to multiple primary intents? Current design picks highest-confidence; may need multi-intent plans.

5. **Memory tier search**: Should `navQuery` search cold store by default? Current design: hot/warm only unless `intent.primary === 'audit-completeness'`.

---

*End of design. Next: implement `lens4-interface-query.mjs` as the highest-leverage first file.*