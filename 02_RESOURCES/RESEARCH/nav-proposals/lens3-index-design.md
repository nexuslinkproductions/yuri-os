# Lens 3 — Master Navigation Index: Data Structure + Build/Refresh Architecture

**Status:** [NEW] — genuine architectural proposal for the exhaustive+fast navigation index layer
**Confidence:** high · **Basis:** from-read (all index scripts, circuitry graph, cross-ref engine, memory system) · **Falsifier:** if any retrieval surface cannot be mapped to the proposed index schema without loss

---

## 1. The Problem Restated (Grounded in Read Code)

Today YURI has **four separate shallow-able retrieval surfaces** (verified by reading each):

| Surface | Module | Coverage | Gap |
|---------|--------|----------|-----|
| FTS5 corpus | `_SYSTEM/Scripts/yuri-search.mjs` + `search-index.db` | ~38k docs/code (BM25) | Lexical only; no structural/circuitry awareness |
| GitNexus call-graph | `_SYSTEM/Scripts/xref-query.mjs` pass 3 | 91k symbols, 131k relations, 300 flows | Structural only; fails-closed when stale; no semantic layer |
| Circuitry graph | `_SYSTEM/yuri-graph-state.json` + `yuri-circuitry-graph.json` | 124 nodes, 273 edges, sectors, telemetry | Graph topology only; no full-text content; manual query |
| Mechanism spectrum | `_SYSTEM/Scripts/xref-query.mjs` pass 4 | 267 mechanisms across 9 layers | Prose grep only; no structural backing |

**Cross-ref engine (`xref-query.mjs`)** unifies these at *query time* but:
- Each pass is independently bounded (candidate caps)
- No *build-time* completeness guarantee
- Staleness detected by `xref-drift-scan.mjs` but index itself has no staleness signal
- Incremental refresh = re-run all passes (no delta)

**Memory system** (`memory-relocator.mjs`, `memory-cold-store.mjs`) has its own FTS5 (`cold_docs`) but is **walled off** from the search corpus (`MEMORY_VS_SEARCH` wall in `memory-cold-store.mjs:12`).

---

## 2. Design Goal: Exhaustive + Fast Index

**Exhaustive** = a single query cannot miss a valuable artifact because the index *knows* the complete coverage map and can prove nothing was overlooked.

**Fast** = sub-100ms p95 for typical queries; sub-500ms for exhaustive traversals.

**Mechanism:** A **unified hybrid index** built at *generate-time* (like the circuitry instrument) with:
1. **Inverted FTS5** (BM25) — extends existing `search-index.db` schema
2. **Call-graph adjacency** — GitNexus structural edges as first-class index links
3. **Circuitry node-graph** — 124-node topology with sector/edge-kind metadata
4. **Hierarchical summaries** — per-sector LLM-generated summaries (optional, cacheable)
5. **Vector embeddings** (optional, opt-in) — for semantic fallback when structural+lexical fail

**Completeness guarantee:** The index **stores its own coverage manifest** — every source file, every graph node, every GitNexus symbol, every memory entry has a *manifest entry* with `indexed_at`, `content_hash`, `coverage_scope`. A query can ask "what did I NOT search?" and get a deterministic answer.

**Staleness signal:** Borrow `xref-drift-scan.mjs`'s `gitnexusStaleness()` + file `mtime` + circuitry graph `generated_at` → unified `index_health` table. The index **knows when it is stale** without external scan.

---

## 3. Index Schema (SQLite + FTS5 — extends `search-index.db`)

### 3.1 Core Tables (added to existing `search-index.db`)

```sql
-- 1. Unified manifest: every indexable unit has a row
CREATE TABLE index_manifest (
  unit_id       TEXT PRIMARY KEY,          -- stable id: "file:path", "circuitry:nodeId", "gitnexus:symbolId", "memory:slug"
  unit_kind     TEXT NOT NULL,             -- 'file' | 'circuitry_node' | 'gitnexus_symbol' | 'memory_entry' | 'mechanism'
  source_path   TEXT,                      -- repo-relative or absolute for memory
  content_hash  TEXT NOT NULL,             -- SHA256 of indexed content (for staleness)
  indexed_at    INTEGER NOT NULL,          -- epoch ms
  sector        TEXT,                      -- circuitry sector (if applicable)
  layer         TEXT,                      -- circuitry layer (if applicable)
  node_id       TEXT,                      -- circuitry node id (if applicable)
  symbol_id     TEXT,                      -- gitnexus symbol id (if applicable)
  memory_slug   TEXT,                      -- memory slug (if applicable)
  mechanism_pattern TEXT,                  -- mechanismPattern verb (if applicable)
  coverage_scope TEXT NOT NULL,            -- 'full' | 'summary' | 'signature_only'
  metadata_json TEXT                       -- flexible extra: {salience, stability, edge_kinds, etc.}
);

-- 2. Health/staleness per source root
CREATE TABLE index_health (
  source_root   TEXT PRIMARY KEY,          -- 'repo' | 'gitnexus' | 'circuitry' | 'memory'
  last_indexed  INTEGER NOT NULL,
  head_commit   TEXT,                      -- git rev-parse HEAD for repo/gitnexus
  indexed_commit TEXT,                     -- what the index was built from
  stale         INTEGER NOT NULL DEFAULT 0,-- 1=stale, 0=fresh
  check_at      INTEGER NOT NULL,
  details_json  TEXT                       -- {behind: N, reason: '...'}
);

-- 3. Cross-links: manifest unit -> manifest unit (structural edges)
CREATE TABLE index_xlinks (
  from_unit     TEXT NOT NULL REFERENCES index_manifest(unit_id),
  to_unit       TEXT NOT NULL REFERENCES index_manifest(unit_id),
  link_kind     TEXT NOT NULL,             -- 'calls' | 'reads' | 'writes' | 'contains' | 'references' | 'same_sector'
  weight        REAL DEFAULT 1.0,
  PRIMARY KEY (from_unit, to_unit, link_kind)
);

-- 4. Hierarchical summaries (optional, cacheable)
CREATE TABLE index_summaries (
  unit_id       TEXT PRIMARY KEY REFERENCES index_manifest(unit_id),
  summary_text  TEXT NOT NULL,
  summary_level TEXT NOT NULL,             -- 'node' | 'sector' | 'layer' | 'global'
  token_count   INTEGER NOT NULL,
  generated_at  INTEGER NOT NULL,
  model         TEXT NOT NULL
);
```

### 3.2 FTS5 Virtual Tables (extend existing `docs`)

```sql
-- Keep existing `docs` for corpus search
-- ADD: circuitry nodes as searchable units
CREATE VIRTUAL TABLE circuitry_nodes USING fts5(
  unit_id UNINDEXED, node_id UNINDEXED, sector UNINDEXED, layer UNINDEXED,
  title, description, triggered_by, files, tokenize='porter unicode61'
);

-- ADD: gitnexus symbols as searchable units
CREATE VIRTUAL TABLE gitnexus_symbols USING fts5(
  unit_id UNINDEXED, symbol_id UNINDEXED, file_path UNINDEXED, module UNINDEXED,
  name, signature, docstring, tokenize='porter unicode61'
);

-- ADD: memory entries as searchable units (bridge the MEMORY_VS_SEARCH wall)
CREATE VIRTUAL TABLE memory_entries USING fts5(
  unit_id UNINDEXED, slug UNINDEXED, tier UNINDEXED, type UNINDEXED,
  title, body, trig, crosslinks, tokenize='porter unicode61'
);

-- ADD: mechanism spectrum entries
CREATE VIRTUAL TABLE mechanism_spectrum USING fts5(
  unit_id UNINDEXED, mechanism_pattern UNINDEXED, layer UNINDEXED,
  title, definition, ripple_class, guard_requirement, cascade_family, tokenize='porter unicode61'
);
```

---

## 4. Build Pipeline (Generate-Time, Deterministic)

```mermaid
flowchart TD
    A[Source Collection] --> B[Content Hashing]
    B --> C[Manifest Construction]
    C --> D[Cross-Link Extraction]
    D --> E[FTS5 Population]
    E --> F[Summary Generation (optional)]
    F --> G[Health Snapshot]
    G --> H[Atomic Swap / Version Bump]
```

**Determinism:** Same inputs → byte-identical `search-index.db` (like circuitry instrument). Content hashes are the anchor; manifest order is lexicographic by `unit_id`.

**Entry points (read from live code):**
- Files: `yuri-search-index.mjs` walk (respects `.gitignore`, bounded)
- Circuitry: `_SYSTEM/yuri-graph-state.json` nodes + `yuri-circuitry-graph.json` edges
- GitNexus: `gitnexus query --json` output (pinned to LIVE_REPO_ROOT per `xref-query.mjs:F1`)
- Memory: `memory-relocator.mjs` `loadItems()` + `memory-cold-store.mjs` `queryCold('')` (all)
- Mechanisms: `mechanism-pattern-registry.json` + spectrum markdown

---

## 5. Incremental Refresh (Continuity-Propagation Law)

**Law (from `BUILD-MANUAL.md` §11 + `yuri-origin.md`):** Any change → graph + viz/engine + manual + reverify + `ai reindex` in one motion.

**Incremental strategy:**
1. **File watcher / git hook** → collect changed paths since last `indexed_at`
2. **Delta manifest:** Re-hash only changed units; `content_hash` mismatch → re-index unit
3. **Cascade via xlinks:** If a circuitry node's `files[]` changed → re-index that node + its 1-hop xlink neighbors
4. **GitNexus:** If `gitnexusStaleness().behind > 0` → full GitNexus re-index (structural index is all-or-nothing)
5. **Memory:** `memory-relocator.mjs` already tracks `lastUsedMs` → on demote/promote, update `memory_entries` FTS5
6. **Manifest version:** `index_health.check_at = Date.now()`; `stale` flag auto-set by comparing `head_commit` vs `indexed_commit`

**Key insight from `xref-drift-scan.mjs`:** The staleness signal **already exists** — `gitnexusStaleness()` compares `.gitnexus/meta.json` vs `HEAD`. We promote this to a **first-class index health signal** in `index_health` table.

---

## 6. LLM-Facing Interface (The Navigation API)

```typescript
// Single entry point for any LLM lane
interface NavQuery {
  query: string;                    // natural language or structured
  mode?: 'exhaustive' | 'fast' | 'structural' | 'semantic';
  scope?: string[];                 // sectors, layers, unit_kinds to include/exclude
  max_results?: number;
  require_completeness_proof?: boolean;  // if true, returns coverage manifest diff
}

interface NavResult {
  hits: NavHit[];
  coverage_proof?: CoverageProof;   // only if require_completeness_proof
  index_health: IndexHealthSnapshot;
  query_plan: QueryPlan;            // which surfaces were searched, in what order
}

interface NavHit {
  unit_id: string;
  unit_kind: string;
  title: string;
  snippet: string;
  score: number;                    // 0-1 unified confidence (provenance-graded)
  provenance: {                     // from xref-provenance.mjs model
    evidence_kind: 'structural' | 'graph_neighbor' | 'lexical' | 'hybrid';
    confidence: number;
    stale?: boolean;
    structural_unavailable?: boolean;
    mismatch?: string;
  };
  xlinks: XLink[];                  // 1-hop structural neighbors for traversal
}

interface CoverageProof {
  searched_units: number;
  total_units_in_scope: number;
  unsearched_units: string[];       // unit_ids NOT searched with reason
  guarantee: 'exhaustive' | 'bounded' | 'sampled';
}
```

**Completeness guarantee mechanism:** When `require_completeness_proof=true`, the index:
1. Computes the *scope* (all units matching sector/layer/kind filters)
2. Runs the query against *all* units in scope (no candidate caps)
3. Returns `unsearched_units` = units in scope that returned zero hits, with reason (e.g., "no token overlap", "structural leg down")
4. Caller can **prove** nothing was missed — or explicitly see what was missed and why

---

## 7. Integration Points (Where It Hangs Off Circuitry Graph)

**New organ in circuitry graph:** `MASTER_NAV_INDEX` (sector: `retrieval_knowledge`)

**Edges from existing nodes (from `yuri-graph-state.json` edges):**
- `MEMORY` → `MASTER_NAV_INDEX` (type: `memory`, is_return: false) — memory feeds index
- `GITNEXUS` → `MASTER_NAV_INDEX` (type: `data`, is_return: false) — call-graph feeds index
- `SELF_IMPROVE` → `MASTER_NAV_INDEX` (type: `flow`, is_return: false) — drift-scan triggers refresh
- `MASTER_NAV_INDEX` → `ENKI_INBOX` (type: `return`, is_return: true, routed_via: `ENKI_INBOX`) — index health reports to control plane
- `MASTER_NAV_INDEX` → `ROUTING` (type: `memory`, is_return: false) — lanes query index
- `MASTER_NAV_INDEX` → `CLASSIFIER` (type: `memory`, is_return: false) — classifier uses index for scenario detection

**Extends cross-ref engine?** YES — `xref-query.mjs` becomes a *thin adapter* over the master index. The unified query logic moves into the index build; `xref-query` just formats the NavResult for CLI compatibility.

---

## 8. Files to Implement (This Lens)

| File | Purpose | Status |
|------|---------|--------|
| `lens3-index-design.md` | This design doc | [NEW] |
| `lens3-index-schema.sql` | SQLite DDL for extended `search-index.db` | [NEW] |
| `lens3-index-build.mjs` | Generate-time build pipeline (deterministic) | [NEW] |
| `lens3-index-refresh.mjs` | Incremental refresh (delta + cascade) | [NEW] |
| `lens3-index-query.mjs` | LLM-facing NavQuery/NavResult API | [NEW] |
| `lens3-index-health.mjs` | Staleness detection + health snapshot | [NEW] |
| `lens3-index-types.ts` | TypeScript types for NavQuery/NavResult | [NEW] |

**Highest-leverage build-FIRST file:** `lens3-index-build.mjs` — the generate-time pipeline that creates the unified index from all sources. Everything else depends on its output.

---

## 9. Epistemic Tags Per Element

| Element | Tag | Confidence | Basis | Falsifier |
|---------|-----|------------|-------|-----------|
| Unified manifest schema | [NEW] | high | from-read (all 4 surfaces + xref-query merge logic) | If a surface has fields that don't map to manifest columns |
| FTS5 per-surface tables | [NEW] | high | from-read (yuri-search, memory-cold-store, xref-query passes) | If FTS5 tokenize='porter unicode61' fails for any surface |
| Cross-links from GitNexus edges | [NEW] | high | from-read (xref-query pass 3 + circuitry graph edges) | If GitNexus CLI output lacks `kind` field for edges |
| Incremental refresh via content_hash | [NEW] | high | from-read (yuri-search-index.mjs uses mtime; content_hash is stronger) | If content hashing is too slow for 38k files |
| Coverage proof via manifest diff | [NEW] | medium | cross-inference (xref-query candidate caps + drift-scan) | If scope computation is ambiguous for hybrid units |
| LLM-facing NavQuery API | [NEW] | high | from-read (offload-contract.mjs lane routing + CODEX_PROTOCOL) | If lane routers need different query shapes |
| MASTER_NAV_INDEX organ in circuitry | [NEW] | high | from-read (yuri-graph-state.json sectors + BUILD-MANUAL continuity law) | If sector `retrieval_knowledge` doesn't exist in graph |
| Extends (not replaces) xref-query | [RESTATED] | high | from-read (xref-query is the designated spine) | If xref-query has unique logic not portable to index |

---

## 10. Open Questions

1. **Vector embeddings** — optional table `index_embeddings(unit_id, vector BLOB, model, dim)`? Requires `ollama` or external model; defer to Wave 3 per roadmap.
2. **Summary generation** — uses which model? `ollama_run` with `needle`? Cost/latency budget?
3. **Cross-process locking** — concurrent lanes building index? Use SQLite WAL + `index_health` version stamp.
4. **Memory wall breach** — `memory_entries` FTS5 bridges Track B (Claude auto-memory) into search corpus. Is this allowed? `yuri-origin.md` says "Track B may reference Track A; Track A entries do not depend on Track B." Index is Track A → **needs owner decision**.
5. **Backward compatibility** — `yuri-search.mjs` must keep working. Build pipeline writes to same `search-index.db`; existing `docs` table untouched.

---

## 11. Next Steps (This Lens)

1. Write `lens3-index-schema.sql` — exact DDL
2. Write `lens3-index-build.mjs` — deterministic generate-time pipeline
3. Write `lens3-index-query.mjs` — NavQuery API with completeness proof
4. Write `lens3-index-refresh.mjs` — delta refresh tied to `gitnexusStaleness()` + file mtimes
5. Write `lens3-index-health.mjs` — unified staleness signal
6. Add `MASTER_NAV_INDEX` node to `yuri-circuitry-graph.json` (triggering continuity propagation)