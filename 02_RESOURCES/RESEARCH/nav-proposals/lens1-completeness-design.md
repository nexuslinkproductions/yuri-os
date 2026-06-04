# LENS 1 — COMPLETENESS-GUARANTEE MECHANISM (design doc)

## Status: `[NEW]` — a new organ `COMPLETENESS_GUARD` in the circuitry graph, extending the cross-reference engine (XREF-01) and plugging into the `pulse_cortex` sector alongside `CLASSIFIER`/`NEXUSPULSE`.

---

## 1. What "Complete" Means Over a Heterogeneous Corpus

The YURI corpus has **five retrieval modalities**, each with distinct recall characteristics:

| Modality | Surface | Corpus | Recall Profile | Confidence Band |
|----------|---------|--------|----------------|-----------------|
| **Lexical** | FTS5 `ai search` | ~38k docs/code (search-index.db) | High recall for vocabulary matches; misses structural twins | `LOW` (<0.55) |
| **Structural** | GitNexus call-graph | 91k symbols, 131k relationships, 300 flows | **Precision**: finds true mechanism-siblings (same callers/callees); **Recall gap**: only covers code, not docs/memory | `HIGH` (0.8–1.0) |
| **Graph-topological** | Circuitry graph (`yuri-graph-state.json`) | 124 nodes, 273 edges | Finds sector siblings, upstream/downstream organs; misses cross-sector mechanism twins | `MED` (0.55–0.75) |
| **Mechanism-spectrum** | `yuri-mechanism-spectrum-267-*.md` | 267 tagged mechanisms | Finds cards sharing a `mechanismPattern`; prose-only, no structural proof | `LOW` |
| **Memory/episodic** | `memory-usage.jsonl` + cold store | Recall ledger + archived memories | Finds *what was actually used*; misses never-recalled but relevant | `MED` (usage-weighted) |

**Completeness** = for a given query intent, **every modality that could plausibly contribute** has been run, and its **recall bound is quantified**. A "shallow search" is one that stops after 1–2 modalities without justifying why the others would add nothing.

---

## 2. Provable Coverage vs. Calibrated-Recall Bounds

| Modality | Provable? | Bound Method |
|----------|-----------|--------------|
| Structural (GitNexus) | **Yes** — call-graph is a closed finite graph; 1-hop neighborhood is enumerable | `coverage = |neighbors_found| / |total_neighbors|` (exact) |
| Graph-topological | **Yes** — circuitry graph is finite and fully loaded | `coverage = |sectors_visited| / |sectors_relevant|` (exact) |
| Lexical (FTS5) | **No** — open vocabulary; BM25 ranking is heuristic | **Calibrated**: `recall@k` from held-out relevance judgments (SEAM-3 style) |
| Mechanism-spectrum | **No** — prose grep | **Calibrated**: token-overlap recall proxy |
| Memory | **No** — usage is a sample, not population | **Calibrated**: `usage_coverage = |used_items| / |total_items|` (lower bound) |

**The Guarantee**: For modalities with **provable coverage** (structural, graph), we **enforce 100% enumeration** — the search *cannot return* until the full neighborhood is collected. For calibrated modalities, we **attach a recall-bound certificate** (`recall@k ≥ 0.85` etc.) so the caller knows the uncertainty.

---

## 3. Architecture: The `COMPLETENESS_GUARD` Organ

```
+---------------------------+
|  COMPLETENESS_GUARD       |  ← NEW organ, sector: pulse_cortex
|  (coverage enforcer)      |
+---------------------------+
          |
          | reads from (data flow edges)
          v
+---------------------------+
|  XREF_ENGINE (xref-query) |  ← existing: 4-pass unified retrieval
+---------------------------+
          |
          | orchestrates / wraps
          v
+---------------------------+  +---------------------------+  +---------------------------+
|  GITNEXUS (structural)    |  |  CIRCUITRY GRAPH        |  |  FTS5 (lexical)         |
|  91k symbols, call-graph  |  |  124 nodes, 273 edges   |  |  38k docs, BM25         |
+---------------------------+  +---------------------------+  +---------------------------+
          |                            |                            |
          v                            v                            v
+-----------------------------------------------------------------------------------+
|                    COVERAGE LEDGER (per-query, append-only)                       |
|  { query_id, modality, enumeration_complete:bool, recall_bound, items_found,     |
|    items_possible, sectors_visited, mechanisms_tagged, timestamp }               |
+-----------------------------------------------------------------------------------+
          |
          v
+---------------------------+
|  SHALLOWNESS DETECTOR     |  ← flags: "only 1/5 modalities run", "structural leg down",
|  (completeness critic)    |       "sector X not visited", "mechanismPattern Y not surfaced"
+---------------------------+
          |
          v
+---------------------------+
|  RECEIPT GENERATOR        |  ← emits CoverageReceipt { guaranteed, calibrated, gaps[], receipt_id }
+---------------------------+
```

**Graph placement** (extends `yuri-graph-state.json`):
```json
{
  "id": "COMPLETENESS_GUARD",
  "tier": "section",
  "label": "COMPLETENESS GUARD",
  "role": "coverage enforcer + receipt emitter",
  "detail": "wraps XREF_ENGINE; guarantees multi-modality enumeration",
  "sector": "pulse_cortex",
  "metadata": {
    "purpose": "Ensures no retrieval modality is skipped without justification; emits coverage receipts",
    "files": ["_SYSTEM/Scripts/nav/completeness-guard.mjs"],
    "capabilities": ["modality enumeration", "shallowness detection", "receipt emission", "calibrated recall bounds"]
  },
  "parent": "NEXUSPULSE",
  "children": ["COVERAGE_LEDGER", "SHALLOWNESS_DETECTOR", "RECEIPT_GENERATOR"]
}
```

**Edges** (data/control flow):
- `NEXUSPULSE` → `COMPLETENESS_GUARD` (flow)
- `COMPLETENESS_GUARD` → `XREF_QUERY` (reads)
- `COMPLETENESS_GUARD` → `GITNEXUS` (reads structural enumeration)
- `COMPLETENESS_GUARD` → `CIRCUITRY_GRAPH` (reads topological enumeration)
- `COMPLETENESS_GUARD` → `FTS5_INDEX` (reads lexical calibration)
- `COMPLETENESS_GUARD` → `MECHANISM_SPECTRUM` (reads mechanism tags)
- `COMPLETENESS_GUARD` → `MEMORY_USAGE` (reads usage coverage)
- `COMPLETENESS_GUARD` → `COVERAGE_LEDGER` (writes)
- `COMPLETENESS_GUARD` → `ENKI_INBOX` (returns receipt)

---

## 4. Query-Depth/Shallowness Detector

A search is **shallow** iff any of these conditions hold:

```typescript
interface ShallownessSignal {
  // Modality coverage
  modalitiesRun: Set<Modality>;           // which of 5 were actually invoked
  modalitiesRequired: Set<Modality>;      // which *should* have been invoked per query class
  modalitiesSkipped: Modality[];          // required \ run

  // Structural enumeration completeness (provable)
  structural: {
    enumComplete: boolean;                // did we enumerate ALL 1-hop call-graph neighbors?
    neighborsFound: number;
    neighborsPossible: number;            // from GitNexus index metadata
    staleIndex: boolean;                  // gitnexus index behind HEAD → bound invalid
  };

  // Topological coverage (provable)
  topological: {
    sectorsVisited: Set<string>;
    sectorsRelevant: Set<string>;         // derived from query intent classification
    sectorsMissed: string[];
  };

  // Mechanism spectrum coverage
  mechanism: {
    patternsTagged: Set<string>;
    patternsPossible: Set<string>;        // from spectrum index
    patternsMissed: string[];
  };

  // Calibrated recall bounds (for non-provable modalities)
  calibrated: {
    lexical: { recallAtK: number; k: number; confidence: 'high'|'medium'|'low' };
    memory: { usageCoverage: number; confidence: 'high'|'medium'|'low' };
  };

  // Verdict
  isShallow: boolean;
  severity: 'info' | 'warn' | 'critical';
  reason: string;
}
```

**Detection rules** (deterministic, no ML):
- `critical`: structural leg DOWN + query classified as code-change (needs blast radius)
- `warn`: ≥2 required modalities skipped, OR structural enumeration < 100%, OR sector coverage < 80%
- `info`: single calibrated modality below its recall bound

---

## 5. "What Am I Missing?" Completeness Critic

The critic answers: **given what was found, what *kinds* of artifacts are provably absent from the result set?**

```typescript
interface MissingCritique {
  // By modality
  missingByModality: {
    structural: string[];      // "caller of X not in index (stale)", "callee Y not indexed"
    topological: string[];     // "sector 'self_improvement' not visited", "upstream organ Z not traversed"
    mechanism: string[];       // "mechanismPattern 'fsrs' not surfaced", "sibling card 'mdl' not found"
    lexical: string[];         // "no FTS5 hits for term 'energy-gate' — term may be absent from corpus"
    memory: string[];          // "no recall events for organ 'pulse_cortex' in last 30 days"
  };

  // By semantic class (cross-modality)
  missingByClass: {
    siblings: string[];        // "structural siblings of node X: 3 found, 0 missing (complete)"
    upstream: string[];        // "upstream callers: 2 found, index claims 5 total (stale?)"
    downstream: string[];      // "downstream callees: complete"
    sectorPeers: string[];     // "peers in sector 'classification': TRIVIAL, STANDARD, COMPLEX all visited"
    mechanismTwins: string[];  // "cards sharing mechanismPattern 'probability-normalization': 2 found, 1 in cold store"
  };

  // Actionable widening suggestions
  widen: {
    runModality: Modality[];
    refreshIndex: string[];    // "gitnexus reindex needed"
    expandSector: string[];    // "visit sector 'services' for operational context"
    thawMemory: string[];      // "promote cold-store items tagged 'classification'"
  };
}
```

---

## 6. The Coverage Receipt

Every query through `COMPLETENESS_GUARD` returns a **receipt** — a verifiable artifact proving what was covered.

```typescript
interface CoverageReceipt {
  receiptId: string;                    // UUID v4
  queryId: string;                      // correlates with xref-query invocation
  timestamp: string;                    // ISO8601
  guaranteed: {
    structural: boolean;                // true iff 100% enumeration + index fresh
    topological: boolean;               // true iff all relevant sectors visited
  };
  calibrated: {
    lexical: { recallAtK: number; bound: 'proven'|'calibrated'|'unknown'; k: number };
    mechanism: { recallAtK: number; bound: 'proven'|'calibrated'|'unknown'; k: number };
    memory: { usageCoverage: number; bound: 'proven'|'calibrated'|'unknown' };
  };
  gaps: ShallownessSignal;              // the shallowness detector output
  missing: MissingCritique;             // the critic output
  signature: string;                    // HMAC-SHA256 over the above (verifiable)
}
```

**Verification**: Any caller (or auditor) can re-run the enumeration checks against the live indices and verify the receipt matches reality. The receipt is **append-only logged** to `COVERAGE_LEDGER` for audit.

---

## 7. Integration with Existing XREF-01 Engine

`xref-query.mjs` already:
- Runs 4 passes (FTS5, graph, GitNexus, spectrum)
- Grades hits via `xref-provenance.mjs` (shared confidence model)
- Gates via `gateHit` (mechanism-fit theater suppression)
- Emits `structuralLegAvailable` flag

**The gap**: It runs all 4 passes *always* but **does not verify enumeration completeness** (e.g., GitNexus may return 8 hits but the true neighborhood is 20). It also **does not track sector/mechanism coverage**.

**The extension**: `COMPLETENESS_GUARD` wraps `xrefQuery()` and **adds**:
1. **Post-pass enumeration audit** — query GitNexus for `total_neighbors` metadata, verify `hits.length === total_neighbors`
2. **Sector coverage map** — from `yuri-graph-state.json` sectors, compute which were touched by any hit
3. **Mechanism pattern audit** — from spectrum index, verify all patterns matching query tokens were surfaced
4. **Memory usage coverage** — from `memory-usage.jsonl`, compute fraction of relevant organs with recall events
5. **Receipt emission** — bundle into `CoverageReceipt`

---

## 8. Incremental Refresh & Build

| Artifact | Refresh Trigger | Method |
|----------|-----------------|--------|
| GitNexus total-neighbor counts | `gitnexus index` rebuild | `gitnexus query --meta` (new CLI flag) |
| Sector relevance map | `yuri-graph-state.json` change | Recompute from graph edges |
| Mechanism pattern index | Spectrum doc change | Re-parse `yuri-mechanism-spectrum-*.md` |
| Memory usage coverage | `memory-usage.jsonl` append | Incremental counter update |
| Calibration curves (lexical/mechanism/memory) | Nightly / EOT | Held-out eval on `pulse-archive/` relevance judgments |

**No full rebuild needed** — all coverage metadata is derived from live indices at query time (bounded by existing caps).

---

## 9. LLM-Facing Interface

```typescript
// Entry point for any LLM lane
async function completeQuery(rawQuery: string, opts?: {
  node?: string;              // circuitry node to anchor topological search
  requireGuaranteed?: boolean; // if true, throws on shallow (critical)
  minRecall?: {               // override calibrated bounds
    lexical?: number;
    mechanism?: number;
    memory?: number;
  };
}): Promise<{
  hits: XRefHit[];            // from xref-query (graded, gated)
  receipt: CoverageReceipt;   // the guarantee artifact
  widenIfShallow: () => Promise<XRefHit[]>; // auto-widen using critic suggestions
}>;
```

**Usage in a lane**:
```js
const { hits, receipt, widenIfShallow } = await completeQuery("energy gate protected path veto");
if (receipt.gaps.severity === 'critical') {
  // Either widen automatically or escalate to operator
  const more = await widenIfShallow();
  hits.push(...more);
}
// Attach receipt to output for audit trail
return { answer: synthesize(hits), coverageReceipt: receipt };
```

---

## 10. Confidence Tags for This Design

| Element | Confidence | Basis | Falsifier |
|---------|------------|-------|-----------|
| Provable coverage for structural/topological | **HIGH** | GitNexus call-graph is finite enumerable; circuitry graph is loaded in memory | GitNexus adds pagination without total-count metadata |
| Calibrated recall bounds for lexical/mechanism/memory | **MEDIUM** | Requires held-out eval corpus (SEAM-3); not yet built | No relevance judgments exist → bounds are speculative |
| Shallowness detector rules | **HIGH** | Deterministic rules over observed modality gaps | Rules may be too strict/loose for some query classes |
| CoverageReceipt verifiability | **HIGH** | All inputs are live-queryable; HMAC prevents tampering | Receipt key management not designed |
| Integration with XREF-01 | **HIGH** | Wraps existing `xrefQuery()` export; no breaking changes | `xrefQuery` doesn't expose total-neighbor metadata yet |
| Graph placement (pulse_cortex sector) | **HIGH** | Fits alongside CLASSIFIER/NEXUSPULSE; reads memory early (v15) | Sector assignment could be debated |

---

## 11. Highest-Leverage Build-FIRST File

**`02_RESOURCES/RESEARCH/nav-proposals/lens1-completeness-guard.mjs`** — the core module implementing:
- `CompletenessGuard` class wrapping `xrefQuery`
- Enumeration audit for GitNexus (structural) and circuitry graph (topological)
- Sector/mechanism coverage maps
- `ShallownessDetector` + `MissingCritic`
- `CoverageReceipt` generation + HMAC signing
- `CoverageLedger` append-only logging
- Public `completeQuery()` API for LLM lanes

This single file makes the guarantee **executable today** using only existing exports.