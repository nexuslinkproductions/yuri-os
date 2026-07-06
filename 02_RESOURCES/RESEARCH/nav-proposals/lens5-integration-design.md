# Lens 5 — Integration, Ownership & Evolution: Master Navigation Architecture

## Decision: EXTENDS the Cross-Reference Engine (XREF) as NEW organ `NAVIGATION`

**Rationale:** The XREF engine (xref-query, xref-provenance, xref-drift-scan) is the designated spine per three-seams and master build plan. The master navigation layer is not a competing surface — it is the **completeness-guarantee wrapper** around XREF + the other surfaces. It adds: (1) a mandatory breadth-first traversal protocol, (2) a unified index with completeness certificates, (3) a co-evolution loop with circuitry graph-state.

---

## Where It Hangs Off the Circuitry Graph (124-node self-model)

### New Organ: `NAVIGATION` (section-tier)
- **Sector:** `retrieval` (NEW sector — see below)
- **Parent:** `MEMORY` (memory reads navigation index; navigation reads memory for hot/warm/cold context)
- **Children:**
  - `NAV_INDEX` — unified index with completeness metadata
  - `NAV_TRAVERSAL` — breadth-first traversal engine
  - `NAV_CERTIFICATE` — completeness guarantee + certificate emission
  - `NAV_DRIFT` — drift detector (extends xref-drift-scan)
  - `NAV_REINDEX` — incremental reindex orchestrator

### Edges (data/control flow)
| Source | Target | Type | Purpose |
|--------|--------|------|---------|
| `NAVIGATION` | `ENKI_INBOX` | return | Navigation results aggregate before ENKI synthesis |
| `XREF_QUERY` | `NAV_TRAVERSAL` | data | XREF is a surface NAV consumes |
| `GITNEXUS` | `NAV_TRAVERSAL` | data | Structural call-graph surface |
| `MEMORY` | `NAV_TRAVERSAL` | memory | Hot/warm/cold recall context |
| `SVC_RAG` | `NAV_INDEX` | memory | Wiki-RAG service feeds cold index |
| `SELF_IMPROVE` | `NAV_DRIFT` | feedback | EOT/soak loop triggers drift scan |
| `NAV_CERTIFICATE` | `PULSE_BUS` | data | Completeness certificates as advisor-grade findings |

### New Sector: `retrieval` (added to circuitry graph)
```json
{
  "name": "retrieval",
  "color": "#FFD700",
  "nodes": ["NAVIGATION"]
}
```

### Consumes/Replaces
| Existing Node | Relationship |
|---------------|--------------|
| `xref-query.mjs` | CONSUMED as surface — NAV_TRAVERSAL calls it |
| `xref-provenance.mjs` | CONSUMED — scoring model reused identically |
| `xref-drift-scan.mjs` | EXTENDED — NAV_DRIFT wraps it + adds certificate emission |
| `memory-relocator.mjs` | CONSUMED — provides cold-store access for deep traversal |
| `lifecycle-gap-scan.mjs` | PARALLEL — gap-scan focuses on math-cards; NAV focuses on retrieval completeness |

---

## Completeness Guarantee Mechanism

### The Breadth-First Traversal Protocol (BFTP)

**Problem:** Single query can miss valuable artifacts because the query wasn't "deep enough."

**Solution:** Mandatory breadth-first expansion before depth. Every navigation request:
1. **Seed** from query (or node `--node` pivot)
2. **Expand 1-hop** across ALL surfaces (FTS5, Graph, GitNexus, Spectrum, Memory) — NO surface skipped
3. **Grade** each candidate via shared provenance model (xref-provenance.scoreHit)
4. **Certify** — emit `CompletenessCertificate` stating: "At radius R, all surfaces were queried; N candidates surfaced; M suppressed (with reasons); 0 surfaces unavailable without tagging."

### Data Structures

```typescript
// NEW: Unified index entry
interface NavIndexEntry {
  path: string;                    // normalized repo-relative path
  surfaces: NavSurfaceHit[];       // hits from each surface
  bestConfidence: number;          // max across surfaces
  completenessRadius: number;      // BFTP radius at which this was discovered
  certificateId: string;           // links to CompletenessCertificate
  lastVerified: number;            // ms epoch
  driftFlags: string[];            // from NAV_DRIFT
}

// NEW: Surface hit (extends xref hit with traversal metadata)
interface NavSurfaceHit {
  surface: 'fts5' | 'graph' | 'gitnexus' | 'spectrum' | 'memory';
  confidence: number;              // from xref-provenance.scoreHit
  snippet: string;
  provenance: XRefProvenance;      // reuses xref-provenance schema
  traversalDepth: number;          // 0=seed, 1=1-hop, 2=2-hop...
  discoveredBy: 'query' | 'expansion' | 'pivot';
}

// NEW: Completeness Certificate — the guarantee artifact
interface CompletenessCertificate {
  id: string;                      // uuid
  query: string;
  pivotNode?: string;
  radius: number;                  // BFTP radius completed
  surfacesQueried: string[];       // all 5 surfaces
  surfacesAvailable: string[];     // subset that responded
  surfacesDown: string[];          // subset that failed — tagged on hits
  candidateCount: number;
  surfacedCount: number;
  suppressedCount: number;
  suppressedReasons: Record<string, number>;
  issuedAt: number;
  issuedBy: 'NAV_TRAVERSAL';
  signature: string;               // HMAC of above (tamper-evident)
}
```

---

## Co-Evolution with Circuitry (Continuity Law)

**Law:** `graph → index → reverify → reindex`

### Propagation Loop (triggered by any circuitry change)
1. **Graph Change Detected** — `yuri-graph-state.json` modified (new node, edge, file ref)
2. **Index Invalidation** — NAV_REINDEX marks affected index entries `stale: true`
3. **Reverify** — NAV_DRIFT runs targeted scan on invalidated entries (file existence, line staleness, claim drift)
4. **Reindex** — NAV_REINDEX rebuilds only affected shards (incremental)
5. **Certificate Rotation** — new certificates issued with updated `lastVerified`

### Incremental Refresh Architecture
```typescript
// NEW: Incremental reindex plan
interface ReindexPlan {
  trigger: 'graph-change' | 'git-head-move' | 'memory-promote' | 'scheduled' | 'manual';
  affectedPaths: string[];         // repo-relative paths
  affectedNodes: string[];         // circuitry node ids
  surfacesToRefresh: string[];     // subset of 5 surfaces
  priority: 'immediate' | 'background' | 'next-eot';
}
```

---

## Migration Path: 5 Surfaces → 1 Master Layer (No Big Bang)

| Phase | Action | Backwards Compatibility |
|-------|--------|-------------------------|
| **0 (now)** | NAVIGATION organ added to graph; NAV_TRAVERSAL wraps XREF | All existing `ai xref` calls work unchanged |
| **1** | `NAV_INDEX` built from existing surfaces (read-only merge) | XREF still primary; NAV_INDEX shadow |
| **2** | BFTP enforced for all Codex/ENKI retrieval calls | Opt-in via `--nav` flag |
| **3** | `ai search` → `ai nav` alias; XREF becomes internal surface | `ai xref` still works, now powered by NAV |
| **4** | Completeness certificates required for CRITICAL-tier work | Gate in CODEX_GATE: no cert = no apply |
| **5** | Legacy surfaces deprecated; NAV is sole front-door | Migration complete |

---

## Failure Modes & Graceful Degradation

| Surface Down | Behavior | Certificate Impact |
|--------------|----------|-------------------|
| **FTS5 (search-index.db)** | Tag all would-be-FTS5 hits as `surfaceDown: 'fts5'`; continue with 4 surfaces | `surfacesDown` includes 'fts5'; certificate still issued |
| **GitNexus (CLI/index)** | Fail-closed per XREF-05: structural leg unavailable → would-be-structural hits downgraded to lexical + tagged `structuralUnavailable: true` | `surfacesDown` includes 'gitnexus'; staleness penalty applied |
| **Circuitry Graph** | Graph-pass returns empty; token-overlap + neighbor expansion skipped | `surfacesDown` includes 'graph'; certificate notes reduced structural coverage |
| **Memory (SQLite/ledger)** | Memory-pass returns empty; hot/warm/cold context unavailable | `surfacesDown` includes 'memory'; traversal continues with 4 surfaces |
| **Spectrum Doc** | Spectrum-pass returns empty; prose grep skipped | `surfacesDown` includes 'spectrum'; minor impact |

**Degradation Principle:** The traversal **always completes** (returns what it can) and the certificate **honestly reports** what was unavailable. No silent degradation.

---

## LLM-Facing Interface

### Primary: `ai nav "<query>" [--node <id>] [--radius <R>] [--json]`
- Returns surfaced hits + `CompletenessCertificate`
- `--radius 0` = seed only (like current `ai xref`)
- `--radius 1` = mandatory 1-hop breadth (DEFAULT for COMPLEX/CRITICAL)
- `--radius 2` = 2-hop (deep research)

### Programmatic: `navigation.traverse(query, opts)`
```typescript
interface TraverseOptions {
  pivotNode?: string;        // circuitry node id to pivot from
  radius?: number;           // BFTP radius (default: 1 for complex+, 0 for trivial)
  requireCertificate?: boolean; // throw if certificate not issued
  surfaces?: string[];       // override surface set (default: all 5)
  top?: number;              // output cap (default: 10, max: 50)
}

interface TraverseResult {
  certificate: CompletenessCertificate;
  hits: NavIndexEntry[];
  sublog: NavSurfaceHit[];   // suppressed hits with reasons
}
```

### Certificate Verification: `navigation.verifyCertificate(certId)`
- Validates HMAC signature
- Checks `lastVerified` against drift-scan
- Returns `{ valid: boolean, driftSinceIssue: number }`

---

## Highest-Leverage Build-FIRST File

**`02_RESOURCES/RESEARCH/nav-proposals/lens5-integration-nav-core.mjs`** — The core traversal engine with BFTP, certificate emission, and XREF surface integration. This is the runnable heart that makes the completeness guarantee executable.