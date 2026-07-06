# YURI Memory Architecture — Source of Truth

> The one page to read when you're confused about where memory lives.
> Every claim here is verified against live code + the actual databases (2026-06-02). Status tags: ✅ LIVE · 🟡 ARMED (built+wired, no real data yet) · 🪦 STALE/LEGACY · ❌ ABANDONED (built, never wired).

---

## 30-second map

You have **two memory tracks** and **three databases**. They do not touch each other.

1. **Track B — your Claude behavioral memory** (the one that grows with you). 109 markdown files. ✅ Healthy. This is "you and me."
2. **Track A — YURI canonical memory** (operational facts other lanes need). Lives in `memory.db`. ✅ Live but cluttered.
3. **The subconscious** — a separate FTS5 cold store for dormant memories. 🟡 Built and wired, currently empty, and plumbed to the *wrong* source (see Gaps).

Telemetry (token accounting) is **not memory**. It just happens to share a file with Track A.

---

## Track B — Native Claude behavioral memory ✅ LIVE

**What it is:** how Claude (this lane) works *with you* — comms prefs, output habits, tool-routing heuristics, voice, low-stakes self-correction. This is the store that "develops and improves over time with me."

**Where it lives:** `~/.claude/projects/-Users-marcelspatz-YURI-OS-MUSUBI/memory/*.md`
(`~/.claude` is a symlink → `YURI-OS-MUSUBI/.claude`, so the real path is inside the repo.)

**How a memory gets written** (the ONLY allowed path):
```
node _SYSTEM/Scripts/claude-memory-write.mjs add \
  --name <kebab-slug> --type <feedback|reference|project|user> \
  --description "<one-line hook ≤80 chars>" --body "<body>" \
  [--tier working|episodic|semantic] [--scope main|all|claude] \
  [--trig "phrase1,phrase2"] [--refs "[[other-slug]]"]
```
The wrapper writes `<slug>.md` and atomically rebuilds `MEMORY.md`. Direct `Write` into this dir is blocked by design; the wrapper is the only door. It refuses path traversal and forbidden segments (history/state/file-history/worktrees/transcripts).

**How it comes back (recall):** `MEMORY.md` (the full index — one line per memory) is loaded into context at **every session start**. Full memory files are read on trigger/relevance during the session.

**Index format:** `- [HANDLE](file.md) — hook` where HANDLE = `FB:`/`REF:`/`PROJ:`/`USR:` + uppercase slug.

**Health:** 109 files / 109 index entries (perfect sync), zero corruption, written continuously every session.

---

## Track A — YURI canonical memory (`memory.db`) ✅ LIVE (cluttered)

**What it is:** operating truth shared across all lanes (Claude, Codex, future operators) — projects, collaborators, durable architecture decisions, IP constraints.

**Where it lives:** `_SYSTEM/OS_KERNEL/memory.db` (181 MB). Mediator: `_SYSTEM/Scripts/memory-kernel.mjs` (propose → decide → ledger, operator-gated).

**What's actually inside it:**
| Layer | Rows | Status | Notes |
|---|---|---|---|
| `memory_items` | 4324 | ✅ LIVE | written today; fed by `yuri-canonical-memory-import.mjs` (an importer, not a live mirror) |
| `memories` (episodic) | 156 | 🪦 STALE | newest row May 14; superseded by `memory_items` |
| `token_ledger` (+ reconciliation/rollup) | ~150k | — | **telemetry, NOT memory.** ~95% of the file size |
| `semantic_memory` (FTS5) | 0 | ❌ ABANDONED | a RAG/hybrid-search layer, schema-built + test-validated in `validate-hybrid-search.cjs`, never populated |
| `knowledge_nodes` | 0 | ❌ ABANDONED | the graph half of the same dead RAG experiment |
| `core_memory` (key/val) | 0 | ❌ ABANDONED | clearly intended as the *portable identity* store; empty |

> The dead `semantic_memory` FTS5 here is a DIFFERENT thing from the live subconscious FTS5 below. Two FTS5 systems is the main source of the "wait, which one?" confusion.

---

## The subconscious / cold store 🟡 ARMED (empty + mis-wired)

**Your recollection was correct:** dormant memories are meant to demote into an FTS5/BM25 store and be recalled on cue.

**Where it lives:** `_SYSTEM/OS_KERNEL/memory-cold.db` (32 KB) — a **separate** database from both `memory.db` and the doc-search corpus. FTS5 table `cold_docs` (slug/title/body/trig, porter tokenizer) + `cold_meta` (salience, stability, crosslinks, demoted_at, reason). Embedding-free, pure BM25.

**The intended loop** (all code exists):
1. **Demote** — `kagami-memory-consolidator.mjs` (L6) flags memories >30 days old without validation (`MEMORY_STALE_DAYS=30`, FSRS decay pass), `memory-relocator.mjs` relocates the body verbatim into `cold_docs`.
2. **Recall** — `yuri-recall.mjs` BM25-matches the current task's cue against the cold store, surfaces the top-K dormant traces as a `<subconscious-recall>` block, bumps a usage ledger. Wired into `.claude/hooks/user-prompt-submit.js` (L5b, prior-turn-lag re-injection).
3. **Re-promote** — if a cold trace keeps getting queried, it becomes an operator-gated candidate to restore to active memory.

**Current real status (rewired 2026-06-02):**
- ✅ **Pointed at Track B.** `DEFAULT_MEMORY_ROOT` now resolves to your Claude memory dir (was the legacy `_SYSTEM/memory`). `feedback`/`user` floor rules are hard-exempt — never demoted; only stale `project`/`reference`/episodic decay. The scheduled consolidator runs **dry-run / proposal-only** (no `--execute` in the LaunchAgent), so nothing leaves active memory without an explicit manual yes. Tests green; live dry-run scans 111 files, demotes 0.
- Cold store row count = **0** (nothing stale enough yet; over time the consolidator will *propose* demotions, never auto-move them).

---

## The third database (so it's not mistaken for memory)

`_SYSTEM/OS_KERNEL/search-index.db` (400 MB) — the **doc-search corpus** (`ai search`, ~26k indexed docs+code). This is the "local research center," not memory. Kept walled off from the cold store on purpose.

---

## 🪦 Legacy: `_SYSTEM/memory/*.md`

The pre-DB operational memory index (~8 files, newest entry May 28). Content is May-era: offload lane priorities, the Rick alias overlay, workcell protocol — much of it describing the offload system the native-only migration is now dismantling. Superseded by `memory.db` (Track A) and the migration. Notable because the **subconscious is currently pointed here** (see above).

---

## Known gaps / risks (ranked)

1. **No off-disk backup.** Track B (`.claude/projects/`) and `memory.db` (`*.db`) are both gitignored (`.gitignore:203` and `:302`). Everything lives on one disk with no version history. This is the only thing that actually threatens continuity. *(Both likely ignored so GitNexus — which respects `.gitignore` — wouldn't index the 181 MB DB and memory notes into the code graph.)*
2. **"Mike gets my memories" is unbuilt, not broken.** The importer + `core_memory` table exist, but nothing wires Track B → a committed/exportable store, and both stores are gitignored, so a clone carries no memory. It was an idea that was scaffolded and stopped.
3. ~~Subconscious mis-wired~~ → ✅ **FIXED 2026-06-02.** Repointed at Track B; floor types protected; dry-run/proposal-gated.
4. **Dead RAG layers not cleared.** `semantic_memory` / `knowledge_nodes` / `core_memory` (all 0 rows) are abandoned. Drop or wire.
5. ~~DB bloat~~ → **queued for Phase 4.** Token ledger (~95% of `memory.db`) is scheduled for removal (native-only plan, item 1b).

**Resolved 2026-06-02 (this session):** memory READ unblocked (over-broad deny scoped); memory WRITE is now native (block scoped to volatile subdirs; wrapper optional; SessionStart self-heal reindex); subconscious rewired to Track B; indexer roots expanded to `00_COMMAND-CENTER`/`02_RESOURCES`/`03_NEXUS-LINK` (corpus 38,183→39,087, bug-bounty work now searchable); web/deep-research capture made mandatory with a landing zone (`02_RESOURCES/research/`).

---

## Cheat sheet — where does X go?

| Thing | Track | Path |
|---|---|---|
| How Claude works with you (style, prefs, corrections) | **B** | `claude-memory-write.mjs add` → `~/.claude/projects/.../memory/*.md` |
| YURI project facts, collaborators, decisions other lanes need | **A** | `memory-kernel.mjs` → `memory.db` |
| Token usage accounting | telemetry | `memory.db` `token_ledger` (not memory) |
| Dormant >30d memory (intended) | subconscious | `memory-cold.db` (currently empty, drains legacy root) |
| Searchable doc/code corpus | research | `search-index.db` (`ai search`) |

Related memories: `[[subconscious-memory-build]]` · `[[reference-memory-format-research]]` · `[[two-track-rule]]`
