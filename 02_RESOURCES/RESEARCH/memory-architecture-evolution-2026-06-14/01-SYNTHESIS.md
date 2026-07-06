# SYNTHESIS — Memory Architecture Evolution

> Router/finalizer synthesis over 3 independent streams (Mimo architecture · DeepSeek recall+grounding · 9-agent native sim/red-team) + Claude local verification. All counts below are CLAUDE-VERIFIED against live filesystem/code unless tagged `[agent-claimed]`.
> Date: 2026-06-14 · Branch: main · Status: DESIGN — no mutation performed, owner gates every build phase.

## 1. VERDICT ON THE SEED IDEA

- **"Index of all projects past+present"** → CORRECT gap, highest day-1 value. Build it. (63 PROJ: handles live in `.claude/memory/MEMORY.md`, no lifecycle ledger today.)
- **"N memory tracks per organ/layer/section"** → REJECTED on code evidence. `spreading-activation-memory.ingestMemoryDir` and `claude-memory-write.updateIndex` both use FLAT `readdirSync` — files in subdirs go INVISIBLE to recall + index. Physical partitioning scored dead-last (0.146) in simulation. The system ALREADY suffers location drift (§2); more tracks = more drift.
- **Real need = normalization + belief-revision, not partitioning.** Faceting is a TAG/EDGE dimension over ONE store, not separate stores. This delivers the decisiveness/depth you're reaching for without N silos.

## 2. CLAUDE-VERIFIED GROUND TRUTH (corrects the brief AND the agents)

| Fact | Stale/wrong belief | VERIFIED (2026-06-14) |
|---|---|---|
| Track B store | "~109 files" | `.claude/memory/` = **241 .md**, MEMORY.md = **231 lines / 64KB** |
| Injection drift | "one Track B" | **THREE** memory dirs: `.claude/memory/` (241) · `~/.claude/projects/<id>/memory/` (94) · `_SYSTEM/memory/` (12) |
| Who injects what | "MEMORY.md loads at start" | `pre-tool-use.js:10` reads the **94-file** home dir; `brain-inject.js` reads the **12-file** `_SYSTEM/memory/` table; the 231-line index is the **241-file** repo dir. Three readers, three sources. |
| Facet column | "scope, 11 values" | `scope` has **3** values {environment,state,trajectory} — NOT discriminative. Use **`memory_type`** (9 values) for faceting. `[agent-claimed via sqlite3; verify via wrapper before build]` |
| Edge store | "build new table" | `memory_relations` exists, live schema, 0 rows, UNIQUE(src,dst,rel) — reuse it. `[agent-claimed; NOT confirmed in memory-kernel.mjs grep — verify]` |
| Organ API | "reuse organs" | `openGraph/upsertNode/recallSeeds/toActivationGraph/projectSpine/queryProjects` DO NOT EXIST — ~200 LOC NEW adapter wrapping verified exports (`createGraph/addNode/addEdge/recall/ingestMemoryDir/toJSON/fromJSON`). |
| Edge direction | "directed graph" | spreading-activation edges are **UNDIRECTED** (`ek()` lexicographic sort). JTMS direction must live as queryable `edge_type` + `jtms_label=OUT` SQL filter, NOT in PPR traversal. |
| memory-kernel | "wire JTMS into promote()" | `memory-kernel.mjs` is a pure **.jsonl/filesystem writer, ZERO SQLite imports** → JTMS must be a SIDECAR tailing the ledger, not an inline call. |
| JTMS persistence | n/a | `truth-maintenance.mjs` is in-memory only; `toJSON/fromJSON` exist but NOTHING calls them; imported only by its test + AFL adapter — **never by memory**. Grounding is greenfield. |
| Backup | "top gap" | CONFIRMED. memory.db gitignored + single-disk. `.claude/` is git-trackable. Backup must be Phase-0 prerequisite, not last. |

## 3. RECOMMENDED ARCHITECTURE — one normalized graph, four interlocking layers

Not "pick a candidate." The four concepts are LAYERS of one stack (sim convergence + both peer lanes agree):

```
 session-start ──▶ [PROJECT-SPINE]   slim MEMORY-ACTIVE.md, top-N by lifecycle+recency  (the face)
                         │ feeds from
 graph substrate ──▶ [UNIFIED GRAPH]  memory-graph.db: nodes{memory,project,claim,evidence} + typed edges
                         │ pre-filtered by
 relevance ────────▶ [FACETED TAGS]   memory_type/domain/tier → narrow candidate set BEFORE PPR
                         │ retrieved by
 retrieval ────────▶ [RECALL-DEPTH]   spreading-activation(PPR+Hebbian+decay) ⊕ RRF(BM25)  → ranked+confidence
                         │ filtered by
 credibility ──────▶ [TRUTH-GROUND]   JTMS sidecar: jtms_label=OUT excluded at SELECT; retraction propagates
```

Dependency chain: nodes exist → recursive ingest → facets pre-filter → spine tags type=project+lifecycle → edges populate (co-domain + refs[] + Hebbian) → JTMS grounds. Each layer reversible & valuable alone.

## 4. PHASED BUILD PLAN (reversible-first, every phase owner-gated)

- **Phase 0 — Canonicalize + backup (PREREQUISITE, no graph yet).** Pin the ONE canonical Track B path; reconcile the 3-dir drift (§2) — owner decision required. Add `_SYSTEM/backups/` (committed .gitkeep) + nightly `sqlite3 .dump` for memory.db. Patch `ingestMemoryDir`/`updateIndex` to recursive readdir (kills the partition footgun for good). Gate: drift documented, backup armed.
- **Phase 1 — Project spine (day-1 visible win).** `project-spine-scan.mjs`: discriminate by `type:project` frontmatter OR PROJ: handle (NOT filename prefix — only 17/63 match). Emit `MEMORY-ACTIVE.md` (top-N active by recency, summary-line mode, bounded). Wire into the VERIFIED injection path (`pre-tool-use.js`). Lifecycle inference writes an `unknown` bucket — unknowns EXCLUDED from filtered recall, never guessed. Gate: owner reviews spine, 63 entries present + FILE_COUNT evidence.
- **Phase 2 — Read-only graph index (additive).** `memory-graph.db` (NEW file). Ingest 241 Track B + 12 Track A (separate parser — Track A is prose tables, no frontmatter). Measure edge density on the REAL corpus before trusting PPR (sparse-graph risk: PPR on a near-disconnected graph degenerates to recency ranking). Benchmark recall@5 vs flat BM25 on 20 queries, **≥8 of them zero-link feedback/reference files**. Gate: ≥14/20 incl. the hard set.
- **Phase 3 — Facets + edges.** `memory_facets` from `memory_type`+tags+tier (verify columns first). Populate `memory_relations` (co-domain/co-tag edges) as the day-1 edge source before Hebbian accrues. Gate: spot-check 10 type assignments.
- **Phase 4 — JTMS persistence sidecar (DISARMED, `YURI_JTMS_PERSIST=1`).** Tails the memory-kernel `.jsonl` ledger (NOT inline). promote→assertPremise, evict→retract+surface `affectedBy()` blast. Serialize TMS after each session (the missing persistence). Cap cascade at N nodes; contradicts edges stage `PENDING_REVIEW`, never auto-retract a trusted belief. Gate: crash-reload test green.
- **Phase 5 — Recall promotion (owner-gated).** Replace `recallMemory()` scorer: facet-filter → spreading-activation → RRF⊕BM25 → ranked + jtms_label + project membership. Disarm flat recall as default ONLY after re-benchmark. `jtms_label=OUT` excluded at SELECT.

## 5. FAILURE MODES + GUARDS (from adversarial red-team, deduped)

- **Co-recall edge proliferation O(n²)** (Mimo) → cap top-K=12/node, weekly prune weight<0.05, co-recall edges ephemeral/not-backed-up.
- **Sparse-graph PPR degeneration** → measure edge density pre-Phase-2; if near-disconnected, facets carry recall until edges accrue.
- **Belief-revision cascade / false-positive contradiction** → cap `affectedBy` depth, stage contradicts as PENDING_REVIEW, owner-gate mass retraction.
- **JTMS in-memory wipe on restart** → serialize on mutation (Phase 4 core requirement).
- **Heuristic lifecycle misclassification gaining YAML authority** → `unknown` bucket, excluded not guessed.
- **Unbounded spine output reproducing the overflow** → top-N + summary-line mode.
- **Dead-layer DROP losing future rows** → migration asserts `COUNT(*)=0` or aborts.

## 6. OPEN DECISIONS FOR OWNER

1. **Canonical Track B path** — which of the 3 dirs is truth? (Blocks Phase 0.) Recommend: the 241-file `.claude/memory/` (richest, git-trackable), reconcile the 94-file home dir into it, retire `_SYSTEM/memory/` 12-file table or keep as Track A legacy.
2. **memory.db direct-read policy** — agents read it via sqlite3; brief says wrapper-only. Confirm read policy before Phase 2/3 column verification.
3. **Build now or park as spec?** Phase 0+1 are low-blast, high-value, reversible. Rest is staged.

## 7. RESIDUAL RISK

- `memory_type` 9-values + `memory_relations` existence are `[agent-claimed via sqlite3]` — MUST re-verify via approved wrapper before Phase 3 (didn't confirm in this pass; memory-kernel grep was empty).
- The 3-dir drift is deeper than scoped; Phase 0 reconciliation may surface more readers (EOT, consolidator, yuri-recall all touch memory paths).
- No code written, no store mutated. All claims advisory until the gated phases verify on live data.
