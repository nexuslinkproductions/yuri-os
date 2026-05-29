# Memory vs Search — the two layers, and why they must never merge (2026-05-29)

Build spec + the conceptual line you're drawing.

## The one idea
You have **two completely different cognitive needs** that the word "RAG" smears together. Keeping them
separate is the entire point. One is **what YURI KNOWS**; the other is **what YURI can FIND**.

```
┌─────────────────────────────┐        promote (gated, rare)        ┌──────────────────────────────┐
│  SEARCH INDEX  (build now)  │  ──── surfaces a candidate ────▶    │   MEMORY  (already exists)    │
│  "where is it?"             │        you/Claude decide            │   "what do I know?"           │
│                             │  ◀──── never flows back ─────       │                               │
│  ~30k files, AUTO-indexed   │                                     │  156 curated truths, GOVERNED │
│  FTS5/BM25, no curation     │                                     │  propose→decide→promote→audit │
│  query on demand            │                                     │  loaded into context each turn│
│  doesn't shape behavior     │                                     │  shapes behavior              │
└─────────────────────────────┘                                     └──────────────────────────────┘
```

## MEMORY — the curated truth store (keep as-is)
- **What:** durable facts/decisions/preferences/lessons — "swarm is retired", "Marcel wants simple", "protected-path is #1". Identity + wisdom.
- **Scale:** tiny on purpose (156 rows, 15-line index). Every entry is high-signal because a human approved it.
- **Governance:** `propose → decide → promote → audit`. Curation IS the value. You don't search it — it's *already in your head* (loaded into context each session).
- **Failure mode if polluted:** dump 30k auto-docs in here and every entry becomes noise; YURI stops "knowing" and starts "guessing." **Never auto-feed memory.**

## SEARCH INDEX — the retrieval system (build now)
- **What:** a fast keyword index over the *big pile* — reports, archives, skills, vault notes, audits, docs (~30k .md). The stuff too large to hold in context.
- **Scale:** huge, **auto-indexed** (no human approval — index everything, re-index on change).
- **Governance:** none needed. Low signal-per-doc, but *findable in milliseconds*. BM25 ranking surfaces the relevant ones.
- **Access:** queried **on demand** ("where did I write about the c2moviez audit / the energy substrate / Jake's ICM"). Results are file+snippet, NOT auto-injected into context.
- **Tech:** **SQLite FTS5 / BM25. No Ollama, no embeddings, no vector DB, no daemon.** Built into sqlite (confirmed working). Dependency-free.
- **Failure mode if confused with memory:** trying to hand-curate it (defeats the point) or auto-inject results (floods context). It's a *tool you call*, not a thing you carry.

## The only bridge between them (one-way, gated)
SEARCH can **surface a candidate** → you or Claude judge it → if it's a durable truth, it goes through the
**memory promotion pipeline** and becomes a curated memory. That's it. Search → (human gate) → memory.
Memory never flows back into search. They share no storage, no index, no table.

## Why this is NOT "the same thing, different names"
- Over 156 curated items: RAG *would* be a rename (you'd just be re-looking-up what you already hold).
- Over 30k uncurated files: a search index is a **genuinely new capability** — it answers "find it in the pile," which memory cannot and should not do. Different corpus, different scale, different governance, different access pattern, different purpose.

## Build plan (FTS5 search system, ~2-3h)
1. **Rip-out first** (clean slate): remove the dead RAG layer (palace + embedding + FTS-memory injection) from `brain-inject.js`; archive `palace-rebuild.py`, `memory-query.mjs`, `semantic-memory.db`. Leave curated memory untouched.
2. **`search-index.db`** (FTS5) at `_SYSTEM/OS_KERNEL/search-index.db` — separate DB from `memory.db` (enforces the wall).
3. **Indexer** (`yuri-search-index.mjs`): walk configured roots (reports, archive, skills, vault docs, `_SYSTEM` docs), chunk by file/heading, insert into FTS5. **Respect protected paths** (skip backend/data, .env, .claude/state, node_modules, .git). Incremental via file mtime.
4. **Query tool** (`yuri-search.mjs "query"`): BM25-ranked → `path · score · snippet`. Bounded output.
5. **Tests** + a CLI surface (`ai search "x"` / a skill) + optional later: index-on-change watcher.
6. **Explicitly NOT:** embeddings, Ollama, auto-injection into the session block, any coupling to `memory.db`.
