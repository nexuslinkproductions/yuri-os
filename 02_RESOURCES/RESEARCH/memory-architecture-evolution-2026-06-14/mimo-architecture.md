# YURI Memory Architecture: Three-Model Comparison

## Shared Preconditions

| Constraint | Value |
|---|---|
| Track A live rows | 4,324 memory_items, ~150k ledger rows (telemetry) |
| Track B live files | ~109+ .md files, 231-line index, FB/REF/PROJ/USR prefixes |
| Dead layers to resolve | semantic_memory, knowledge_nodes, core_memory (0 rows each) |
| Subconscious | memory-cold.db FTS5, 0 rows, proposal-only |
| Backup status | **NONE** — both paths gitignored, single-disk |
| Organs available | spreading-activation, yuri-match-global-space, truth-maintenance (JTMS), claim-evidence-cortex |

---

## Model A: Graph-over-SQLite

### Schema

```
nodes(id TEXT PK, type TEXT, -- memory|project|claim|evidence|actor
      body TEXT, created_at INT, revised_at INT,
      lifecycle TEXT DEFAULT 'active', -- draft|active|archived|retracted
      tier TEXT, scope TEXT, domain TEXT, organ TEXT,
      confidence REAL, source_track TEXT); -- 'A'|'B'|'merged'

edges(src TEXT, dst TEXT, rel TEXT, -- relates|justifies|contradicts|part-of|supersedes|co-recalled
      weight REAL DEFAULT 1.0, created_at INT, stale INT DEFAULT 0,
      PRIMARY KEY(src,dst,rel),
      FOREIGN KEY(src) REFERENCES nodes(id),
      FOREIGN KEY(dst) REFERENCES nodes(id));

evidence_links(claim_id TEXT, evidence_id TEXT, support TEXT, -- supports|undermines
               FOREIGN KEY(claim_id) REFERENCES nodes(id),
               FOREIGN KEY(evidence_id) REFERENCES nodes(id));

FTS5 virtual table nodes_fts ON nodes(id, body);
```

- `spreading-activation-memory.mjs` operates on `edges` directly — it IS the graph.
- `truth-maintenance.mjs` maps: assertPremise→insert node(type=claim), addJustification→insert edge(rel=justifies), retract→set lifecycle=retracted + propagate label-in/out via affectedBy traversal on edges.
- Recall = spreading-activation seeds from query-matched nodes, walks edges, ranks by activation × confidence × temporal decay. No silos, no duplication.

### Track A/B Mapping

| Track | Migration |
|---|---|
| A (memory.db) | `memory_items` rows → `nodes(type=memory)`. Link parent/child via `edges(rel=part-of)`. Facet columns (scope/domain/organ/tier) become node attributes. Ledger rows → **not migrated** (telemetry stays in memory.db, read-only archive). |
| B (~/.claude/projects/…/md) | Each .md file → `nodes(type=memory, source_track='B')`. Parse FB/REF/PROJ/USR prefix → set scope + domain. Link to Track A items by ID match or body-similarity via `yuri-match-global-space.mjs` RRF → `edges(rel=relates, weight=rrf_score)`. |

Dead layers: `semantic_memory`, `knowledge_nodes`, `core_memory` → **drop** (0 rows). `memory-cold.db` → keep FTS5, wire as subconscious search target for `nodes_fts` overflow.

### Migration Path

1. `ATTACH` memory.db, `INSERT INTO nodes SELECT … FROM memory_items`.
2. Script parses Track B .md files, inserts as nodes.
3. Run `yuri-match-global-space.mjs` pairwise A↔B to create `edges(rel=relates)`.
4. Wire `truth-maintenance.mjs` to read/write `nodes`+`edges`.
5. Deprecate flat MEMORY.md index — replaced by activation-ranked recall.

### Backup Strategy

Single file `graph-memory.db` (target <10MB without ledger). Backup: git-crypt encrypted commit of .db to private repo + nightly `sqlite3 .backup` to cloud-synced directory (Dropbox/iCloud). Ledger archived separately as read-only `memory-ledger-archive.db`.

### Blast Radius

**Medium-high.** Single schema is single point of corruption. Mitigated by: small file, nightly backup, WAL mode, `PRAGMA integrity_check` on startup.

### Reversibility

**High.** All original data preserved by `source_track` tag. Can re-export to Track A format (memory_items) or .md files (Track B) at any time. Original stores kept read-only for 90 days.

---

## Model B: Faceted Tags + Materialized Views

### Schema

```
-- Lives IN memory.db, additive to existing memory_items
ALTER TABLE memory_items ADD COLUMN tags TEXT; -- JSON: {"project":"yuri", "lifecycle":"active", "tier":"strategic"}

CREATE TABLE tag_index(item_id TEXT, facet TEXT, value TEXT,
                       PRIMARY KEY(item_id, facet, value));

CREATE TABLE recall_views(
  view_name TEXT, item_id TEXT, rank REAL, confidence REAL,
  PRIMARY KEY(view_name, item_id));

-- Track B items get a shadow row in memory_items with source='B'
-- project/lifecycle/domain views are materialized into recall_views
```

- Spreading-activation operates on a **virtual graph** built by: `co-recall` edges from session logs, `relates` edges from `yuri-match-global-space.mjs` RRF scores computed on-the-fly or cached in `recall_views`.
- JTMS: `truth-maintenance.mjs` wraps claim items — justification stored as tag `{"justified_by":[…]}` or a separate `justifications` table.
- Recall: query hits `tag_index` for facet filtering → `recall_views` for ranked results → `spreading-activation` on virtual graph for serendipity.

### Track A/B Mapping

| Track | Migration |
|---|---|
| A | Add tag columns/index to existing `memory_items`. Backfill facets from existing scope/domain/organ/tier columns. **Zero data movement.** |
| B | Import .md files as new `memory_items` rows with `source='B'`. Parse prefixes → tags. **One new table** (`tag_index`). |

### Migration Path

1. `ALTER TABLE` + create `tag_index` — backward compatible, memory_items untouched.
2. Backfill `tag_index` from existing columns.
3. Import Track B as new rows.
4. Build `recall_views` by running `yuri-match-global-space.mjs` + project-hierarchy materializer.
5. Wire recall pipeline to use tag filtering → view ranking → spreading activation.

### Backup Strategy

Same as current (memory.db). Tag index adds <500KB. Total file <200MB (ledger dominates). **Must archive ledger separately first** to get file to manageable backup size. Then git-crypt + nightly.

### Blast Radius

**Low.** Additive schema changes. Existing `memory-kernel.mjs` propose→decide→ledger flow untouched. If tags break, system falls back to current behavior.

### Reversibility

**Very high.** Drop `tag_index`, `recall_views`, revert `ALTER TABLE`. Original data never moved.

---

## Model C: Multi-Store Partition (Owner Seed — Steelman)

### Premise (Steelman)

Different memory types have fundamentally different access patterns, decay rates, and integrity requirements. **Partition by semantic domain, not by implementation layer:**

| Store | Contents | Rationale |
|---|---|---|
| `project-memory.db` | Project spine, lifecycle, deliverables, relationships | High write-rate during active work, needs graph traversal |
| `truth-memory.db` | Claims, evidence, justifications, JTMS state | Requires transactional integrity, rollback, contradiction tracking |
| `personal-memory.db` | User preferences, behavioral patterns, interaction history | Privacy-sensitive, low write-rate, session-scoped reads |
| `doc-cortex.db` | Existing search-index.db, claim-evidence-cortex output | Read-heavy, already separate, append-only |

Each store has its own schema tuned to its access pattern. A **memory-router.mjs** dispatches queries to the right store(s), merges results via `yuri-match-global-space.mjs` RRF.

### Schema (per store)

**project-memory.db:**
```
projects(id PK, name, status, parent_id, created_at, updated_at);
artifacts(id PK, project_id FK, type, body, lifecycle, tier);
project_edges(src, dst, rel, weight);
```

**truth-memory.db:**
```
claims(id PK, body, label TEXT DEFAULT 'in', -- JTMS in/out/unknown
       confidence, created_at, revised_at);
justifications(id PK, conclusion_id FK, method TEXT,
               premises JSON, -- list of claim IDs
               valid INT DEFAULT 1);
evidence(id PK, body, source, strength, created_at);
```

### Track A/B Mapping

| Track | Destination |
|---|---|
| A memory_items | Split by `type`/`domain`: project-related → `project-memory.db`, truth-claims → `truth-memory.db`, personal/behavioral → `personal-memory.db`. |
| A ledger | Stays in memory.db (read-only archive), or moves to `telemetry.db`. |
| B .md files | PROJ: → project-memory.db, FB:/USR: → personal-memory.db, REF: → truth-memory.db. |

### Migration Path

1. Classify all 4,324 Track A items by domain (heuristic on scope/domain/organ columns).
2. Write migration script that `ATTACH`es all stores, copies rows to correct destination.
3. Import Track B files to correct store based on prefix.
4. Build `memory-router.mjs` with fallback: if store missing, return empty.
5. **This is a big-bang migration** — high coordination cost.

### Backup Strategy

**Advantage:** Each store backed up independently at its own cadence. Project memory backs up hourly during active sprints. Truth memory backs up on every justification change. Personal memory backs up daily. **This is the strongest backup model** — blast radius per store is smaller.

### Blast Radius

**Per-store: Low. Cross-store: High.** A query spanning project + truth requires router correctness. If router drops a store, cross-domain recall silently degrades. Backup advantage is real but only if backup discipline is maintained per store (more operational surface area).

### Reversibility

**Low.** Splitting data across files is a one-way operation without a merge script. Must build re-merge tooling BEFORE migrating. High upfront cost.

---

## Comparison Matrix

| Criterion | A: Graph-over-SQLite | B: Faceted Tags | C: Multi-Store Partition |
|---|---|---|---|
| Decisive recall (ranked/confidence) | ★★★ Spreading-activation IS the graph | ★★ Tag filter + view rank + activation | ★★ Router merges RRF across stores |
| Depth (project/lifecycle/relationships) | ★★★ Typed edges, first-class projects | ★★ Project as facet tag | ★★★ Dedicated project store |
| Local-truth grounding (JTMS) | ★★★ JTMS edges in same graph | ★★ JTMS as tag/table overlay | ★★★ Dedicated truth store |
| Migration cost | Medium (one-time merge) | **Low** (additive) | **High** (big-bang split) |
| Blast radius | Medium-high (single file) | **Low** (additive) | Low per / high cross |
| Reversibility | High | **Very high** | Low without tooling |
| Backup simplicity | Good (one file + ledger archive) | Good (existing infra) | **Best** (independent cadences) |
| Spreading-activation fit | **Native** | Requires virtual graph | Requires cross-store walker |
| JTMS fit | **Native edges** | Overlay (fragile) | Native per-store |
| Operational complexity | Low | **Lowest** | High (4 stores + router) |

---

## Recommendation

### **Model A: Graph-over-SQLite**

One graph database. One truth. Spreading-activation and JTMS are native, not bolted on. The 4,324 items + ~109 Track B files produce a graph of <5,000 nodes and <20,000 edges — fits comfortably in a single SQLite file under 5MB (without ledger). Every existing organ maps without adaptation. Faceted queries are just `WHERE` clauses on node attributes; project hierarchies are `edges(rel=part-of)` traversals. The graph IS the memory, not a projection of it.

### The Single Thing Most Likely to Break It

**Edge proliferation from automated co-recall logging.** If every session auto-creates `edges(rel=co-recalled)` between activated nodes, the edge table will grow unbounded (~O(n²) worst case), degrading spreading-activation performance and bloating the file. **Mitigation:** cap co-recall edges at top-k per node (k=12), decay/prune edges with weight <0.05 on a weekly cron, and treat co-recall edges as ephemeral (not backed up). This is the single design decision that determines whether the graph stays fast or collapses under its own weight.
