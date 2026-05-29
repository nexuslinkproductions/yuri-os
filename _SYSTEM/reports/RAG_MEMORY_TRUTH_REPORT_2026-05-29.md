# RAG + Memory — What It Actually Is, and Whether It Earns Its Keep (2026-05-29)

Read-only investigation. No changes made. Your call after reading.

## TL;DR
Your **memory works.** Your **"RAG" is three half-built, overlapping indexes that are all dead, dormant, or failing** — they inject `(unavailable)` placeholders into every session and retrieve nothing. It's exactly the "extra steps + confusion, not indexed right" you suspected. **Recommend: rip the RAG layer out, keep the lexical memory.** Simpler, and you lose nothing you're actually using.

---

## What it all is (the moving parts)

| Component | What it is | Status |
|---|---|---|
| **Track A memory** (`memory-kernel.mjs` + `memory.db` `memories` table) | The real memory: 156 curated memories, 4174 items, 40k events, propose→decide→promote→audit governance. Lexical recall. | ✅ **OPERATIONAL** — this is the one that works |
| **Track B** (Claude auto-memory, `claude-memory-write.mjs`) | My behavioral self-dev notes (preferences, habits). Wrapper-gated. | ✅ Fine |
| **Registries** (folder / artifact / context / skill-index) | Config registries. | ✅ All valid, validate-gates PASS |
| **brain-inject.js** (SessionStart hook) | Injects the big `<yuri-brain>` block: rules, gate, soul, lane-health, + the 2 RAG sections below | ⚠️ Useful parts work; **RAG sections dead** |
| **RAG #1 — Palace** (`palace-rebuild.py` → `claude-palace-out/palace-index.md`) | A vault wikilink-graph "spatial" index of hub concepts | ❌ **NEVER BUILT** — output missing → injects `(palace unavailable)` |
| **RAG #2 — Embeddings** (`semantic-memory.db`, 938 vectors + `memory-query.mjs`) | Vector search over 938 embeddings via Ollama | ❌ **FAILS at query time** → `(memory unavailable)`; also **STALE** (2026-05-20) |
| **RAG #3 — FTS** (`memory.db` `semantic_memory`) | A third semantic table (full-text search) | ❌ **EMPTY** (0 rows), unused |
| **Backend RAG** (`wiki:rag`/`research:rag` ingest → `yuri.db`) | Ingestion into the dying backend | ❌ Dies with the backend; **does NOT affect session memory** |

## The core finding — why it's "not indexed right"

There are **three competing semantic mechanisms**, none wired to the data that actually exists:
- The real memories live in the **`memories` table (156 rows, lexical)**.
- But the SessionStart RAG queries **`semantic-memory.db` embeddings (938, stale, query fails)** and **`semantic_memory` FTS (0 rows, empty)** — *neither is fed from the 156 real memories.*
- And the **palace** spatial index was never generated at all.

So every session, `brain-inject` runs the RAG, finds nothing, and injects two dead sections: `(palace unavailable)` + `(memory unavailable)`. **That's the boot-block noise you saw.** Pure overhead, zero retrieval.

Meanwhile the memory that *does* work (lexical Track A via `memory-kernel`) is a **separate path** the RAG injection doesn't even use.

## Does it add efficiency or confusion?
**Confusion + extra steps, currently.** The RAG layer:
- Retrieves **nothing** (all 3 indexes dead/empty/failing).
- Injects `(unavailable)` placeholders into every session = noise in the context.
- Is **3 overlapping half-built systems** to maintain (palace py + embeddings db + FTS table + Ollama embed dep + vec0 sqlite extension).
- Contributes **zero** to how you actually work now (Opus 4.8 + ICM + the curated `MEMORY.md` + lexical recall carry the load).

## Your decision

**Option A — Rip out the RAG layer (RECOMMENDED, matches your simplicity drive).**
Remove palace + embedding + FTS injection from `brain-inject` (keep rules/gate/soul/lane-health). Archive `palace-rebuild.py`, `memory-query.mjs`, `semantic-memory.db`. Keep lexical Track A memory untouched. Result: no more `(unavailable)` noise, 3 fewer half-built systems, nothing lost that you use. ~30 min, reversible.

**Option B — Wire ONE of them up properly.**
Pick the embedding path (938 vectors already exist): fix the query failure (Ollama embed + vec0 load), re-embed fresh from the 156 `memories`, drop palace + FTS. Gives real semantic recall — but adds a live Ollama dependency + re-embed maintenance. Against your "fewer moving parts" goal.

**My read:** A. You spent 700 hours building three semantic indexes chasing one idea; none survived contact with how you actually work now. The lexical memory + MEMORY.md + Opus's own context is the simple thing that works. Kill the rest.

(Backend removal — separate, already assessed — confirms this: session memory is 100% local and survives the backend going away.)
