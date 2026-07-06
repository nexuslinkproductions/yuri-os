# MASTER BRIEF — Memory Architecture Evolution

> Ground-truth doc for a multi-lane mission. Every spawn (Mimo, DeepSeek, native Workflow agent) reads THIS FIRST before producing output. bankai-discipline fan-out.
> Date: 2026-06-14 · Owner: Marcel · Lane: Claude/Opus (router+verifier+finalizer) · Branch: main

---

## 1. MISSION

Design the next-generation YURI memory architecture that delivers three owner-stated outcomes:
1. **More decisive memory** — recall returns the *right* thing with a confidence/ranking, not a flat dump.
2. **Greater depth** — memory holds structure (projects, lifecycle, relationships, justifications), not just flat one-liners.
3. **Stronger local-truth grounding** — every retained claim can be traced to evidence and revised when evidence changes.

Owner's seed idea (verbatim intent): an **index of all projects** (current + past) in canonical memory, and **multiple memory tracks** spread across YURI dedicated to specific sections/work — explicitly NOT scoped to organs/layers only. He is reaching for partitioning; the mission is to find the *correct* shape that satisfies the three outcomes.

## 2. DECODED REAL-NEED (the trap in the literal version)

The literal "more tracks, one per organ/layer" is HALF A TRAP. Evidence (§4) shows the pain is not too-few-tracks; it is a **flat global index with dead layers, no project spine, and no truth-wiring**. Spinning up N parallel markdown stores per organ multiplies the flat-index problem N times and adds routing ambiguity.

Reframe (cross-domain: this is database **normalization + belief-revision**, not partitioning):
- **A. Project/work spine** — a real ledger of all projects past+present with lifecycle state. (Owner is RIGHT this is missing.)
- **B. Faceted memory** — partition by *dimension* (scope · domain · organ · lifecycle · tier) as **tags/edges over one graph**, not as physically separate stores. Decisiveness without N silos.
- **C. Truth-grounding** — wire memory claims to the JTMS truth-maintenance organ + claim-evidence-cortex: justifications + retraction propagation. This IS "local truth grounding."
- **D. Recall depth** — point spreading-activation + fuzzy-cross-surface-match at the spine; recall returns ranked, related, confidence-graded traces.

The mission must EITHER validate this reframe with independent evidence OR refute it and defend the literal multi-track partition. No rubber-stamping.

## 3. HARD CONSTRAINTS (inviolable)

- **No mutation of live memory stores** in this mission — design + simulate + prototype-in-sandbox ONLY. Owner gates any wiring/migration.
- **Protected paths off-limits**: `.claude/state/`, `.claude/history/`, `.claude/file-history/`, `_SYSTEM/OS_KERNEL/*.db` writes, `.env`, `node_modules/`, `backend/data/`. READ of `memory.db` via wrappers only.
- **Capability-first**: reuse the 4 existing organs (§5) before proposing any new primitive. New primitive requires proof recall+xref returned nothing.
- **No duplication across tracks**: Track A (canonical, shared) vs Track B (Claude behavioral) routing rule stands. Any new structure must say which track it extends and must NOT mirror facts across them.
- **Peer lanes, symmetric verification floor.** Mimo and DeepSeek are FULL PEER co-workers — their engineering is weighted equally with the Claude lane's, never as advisory sidecars. The verify-before-assert-as-fact bar is SYMMETRIC: it binds Claude's own reasoning identically. No lane's claim — Mimo's, DeepSeek's, or Claude's — climbs to "local truth" until local evidence promotes it. Verification is how peer output earns fact-status, not a demotion of any one lane.
- **Bounded output**: research ≤80 lines, final synthesis ≤120 lines per artifact. No raw dumps.

## 4. VERIFIED LANE & SYSTEM REALITY (do not contradict without new evidence)

Source: `_SYSTEM/MEMORY_ARCHITECTURE.md` (verified 2026-06-02) + capability-recall (2026-06-14).

- **Track B** (Claude behavioral) = `~/.claude/projects/<id>/memory/*.md`, flat `MEMORY.md` index loaded every session start. ~109+ files, healthy, but the index is 231 lines / 61.7KB and OVERFLOWING context (only partially loaded). Flat handle format `FB:/REF:/PROJ:/USR:`.
- **Track A** (YURI canonical) = `_SYSTEM/OS_KERNEL/memory.db` via `memory-kernel.mjs` (propose→decide→ledger, operator-gated). `memory_items`=4324 LIVE; `memories`=156 STALE; `token_ledger`≈150k rows = TELEMETRY not memory (≈95% of the 181MB).
- **DEAD layers** (0 rows, abandoned RAG/identity experiment): `semantic_memory` (FTS5), `knowledge_nodes` (graph), `core_memory` (key/val portable-identity). Decide: drop or wire.
- **Subconscious** = `_SYSTEM/OS_KERNEL/memory-cold.db` (FTS5/BM25 `cold_docs`+`cold_meta`). ARMED + wired to Track B, dry-run/proposal-only, currently 0 rows (nothing stale enough).
- **Doc corpus** = `_SYSTEM/OS_KERNEL/search-index.db` (~400MB, ~41,722 docs, `ai search`). NOT memory — walled off on purpose.
- **Top gap**: NO off-disk backup — Track B + memory.db both gitignored. Single-disk continuity risk.

### Lane invocation reality (verified 2026-06-14)
- **Mimo** (PEER lane, mimo-v2.5-pro, 1M ctx, NO cap): `node _SYSTEM/Scripts/mimo.mjs "<prompt>" > outfile 2>&1` — UNSANDBOXED, ~10min silent then dumps. `ai llm mimo` / llm-lane mimo is BROKEN. Bare AggregateError when stdout PIPED → always redirect to file.
- **DeepSeek** (PEER lane, deepseek-v4-pro): `node _SYSTEM/Scripts/llm-lane.mjs deepseek "<prompt>" --out <file>` (use `--out`, dodges pipe artifact; `--reasoning d` for depth). Endpoint allowlist: api.deepseek.com only.
- Both are FULL peer co-workers (not advisory sidecars). Codex `ai`/llm-compat is curl-blocked in this env.

## 5. EXISTING CAPABILITY INVENTORY (reuse before building — capability-first)

| Mechanism | Path | What it does | Role in this mission |
|---|---|---|---|
| `spreading-activation-memory` | `_SYSTEM/Scripts/spreading-activation-memory.mjs` | Personalized-PageRank power iteration + Hebbian co-recall + temporal decay over a memory GRAPH. No embeddings. | **Recall-depth engine.** `[createGraph,addNode,addEdge,hebbianCoRecall,decayWeights,recall]` |
| `fuzzy-cross-surface-match` | `_SYSTEM/Scripts/yuri-match-global-space.mjs` | Union PPMI + global-IDF feature space; cross-surface recall (memory↔code) via containment + RRF. | **Cross-surface ranking.** `[buildGlobalFeatureFn,buildIdf]` |
| `truth-maintenance` | `_SYSTEM/Scripts/truth-maintenance.mjs` | Doyle JTMS: assertPremise, addJustification, retract, label(in/out), affectedBy. Deterministic, zero ML. | **Truth-grounding spine.** Wire memory claims as justified beliefs. |
| `claim-evidence-cortex` | (xref to locate) | Reads agent work as claims; fires epistemic energy factors on live work. | **Claim→evidence binding** for grounding. |

## 6. SPAWN PROTOCOL

Each lane gets a bounded, independent brief. To make convergence GENUINE (not framing-artifact), lanes are blinded to each other's angle:
- **Mimo angle** = "architecture & data-model": best storage shape (graph vs faceted-tags vs multi-store), schema, migration path, backup.
- **DeepSeek angle** = "recall & truth-grounding": how to make recall decisive + how to wire JTMS/claim-cortex for local-truth grounding; failure modes of belief revision over memory.
- **Native Workflow** = "options generation + adversarial simulation + hardening": generate 3+ divergent buildable architectures, simulate selection (EV×reversibility×blast-radius), red-team each, output hardened cross-wired design.

Convergence across independent angles = real signal. Divergence = surface the conflict, don't smooth it.

## 7. TARGETS (what "done" produces)

1. **3+ buildable architecture options**, each with: data model, which existing organs it reuses, migration path, blast radius, reversibility.
2. **A simulated selection** with an explicit record (why the chosen path beats the others).
3. **Hardening pass** per option: failure modes named, the smallest meaningful checks identified.
4. **Cross-wiring map**: how project-spine + faceted-tags + truth-grounding + recall-depth interlock.
5. **Phased build plan**, owner-gated, reversible-first.

## 8. MISSION v2 — CONVERGENCE + CONCURRENCY HARDENING (owner reframe 2026-06-14)

Owner sharpened the mission. This SUPERSEDES the framing in §1-§2 where they conflict. The problem class changed from "where does memory live" to **multi-writer distributed concurrency**.

**v2.1 — Two stores, clearly separated:**
- `.claude/memory/` (241 files) = **Claude's OWN behavioral memory**. Lane-local. It MIRRORS/PROJECTS INTO the canonical truth but is NOT it. Do NOT make it canonical. (Corrects prior §6 recommendation #1.)
- **THE CANONICAL TRUTH PATH** = ONE convergence path where everything true about YURI lands, readable by ANY LLM/agent. This is what we are designing. Claude's store contributes to it; so does every other lane.

**v2.2 — Peer-open access (contract change, owner-directed):**
- **READ** of canonical truth = WIDE OPEN to every LLM/agent at peer level. No wrapper gate. "No agent, no LLM gets treated as less" (owner, 2026-06-14). The wrapper-only-READ rule in `yuri-origin.md` Protected Surfaces is to be REPLACED.
- Safe-by-construction precondition: SEPARATE canonical truth from telemetry (token_ledger ~95% of memory.db) and any secrets, so open read exposes only truth.
- **WRITE** stays mediated — NOT for authority, for CONCURRENCY SAFETY (single-drainer serialization). Every peer PROPOSES writes equally; mediation prevents log corruption under N concurrent writers. This distinction (read=open, write=serialized-not-privileged) must be explicit in the new contract language.

**v2.3 — Scalable + reliable is a HARD MUST (non-negotiable):**
- Live reality: 3+ Claude sessions running in parallel RIGHT NOW, each spawning its own agents; concurrent writes to memory ALREADY observed (cross-terminal write notifications). Reliability problem is live, not hypothetical.
- Naive concurrent in-place SQLite writers across processes = reliability cliff (SQLITE_BUSY, lock timeout, lost write, torn read). REJECT in-place mutable shared DB as the write path.
- Leading primitive: **append-only event-sourcing** — peers append immutable claim/fact events (atomic bounded POSIX appends), a SINGLE DRAINER folds them into materialized read-views all peers read freely. Conflicts become ORDERING not CORRUPTION. `memory-kernel.mjs` is ALREADY a `.jsonl` propose→decide→ledger append-log — EVOLVE it, don't replace it. (See [[feedback-posix-fs-concurrency-floor]]: O_EXCL-before-rename, dead-only-under-custody reclaim, ENOENT-swallow — the cooperative FS concurrency floor applies.)

**v2.4 — Design targets for this hardening round:**
1. The canonical convergence-store data model + write protocol (event-sourced) safe for N concurrent session+agent writers.
2. The single-drainer / consolidator design (who folds, when, idempotency, crash-recovery, ordering, dedup of the same fact proposed by two lanes).
3. Reliability failure-mode catalog under concurrency+scale, each with smallest guard + a test.
4. Scale envelope: concrete limits (writers, events/sec, store size) before it degrades; backpressure strategy.
5. The exact `yuri-origin.md` contract diff (read-open / write-serialized) — DRAFTED for owner approval, NOT applied.
6. How `.claude/memory` (Claude-own) and other lanes project into canonical truth without duplication.

**v2.5 — Mode:** DESIGN + HARDEN ONLY. No building. No mutation of authority files or stores. Work PARALLEL to two other active build sessions — do not collide with their writes; this lane owns the design/hardening track.

## 9. STATUS LOG

- 2026-06-14 — Recon done; brief written; peer swarm (mimo+deepseek) + 9-agent sim run; contested facts CLAUDE-VERIFIED (3-dir drift, flat-readdir partition footgun, scope!=facet, JTMS greenfield); 01-SYNTHESIS.md written (graph+spine+facets+grounding stack, reversible-first phased).
- 2026-06-14 — OWNER REFRAME → Mission v2 (above): convergence path + peer-open read + concurrency/reliability hard-must. Hardening swarm v2 dispatched.
- 2026-06-14 — v2 hardening complete: Mimo-v2 (convergence store) + DeepSeek-v2 (reliability/scale) + race-attack workflow (3 architectures). Verdict: PER-LANE-SHARDS (one writer/file → PIPE_BUF-irrelevant; ✓ PIPE_BUF=512 on Darwin verified, real event=3866B). Deciding bugs caught cross-family: clock-ordering, rename-rotation silent-data-loss, macOS PIPE_BUF. 02-CONVERGENCE-DESIGN.md + drafted yuri-origin contract diff written.
- 2026-06-14 — OWNER GREENLIT BUILD (3 recs accepted, contract applies at P6). Final synthesis verified the 4 primitive APIs (corrected: drop birth-time sentinel [nano-lease handles PID-reuse], shard≠nano-doc-assembler [fixed-section], sha256≠FNV, reuse atomicWriteFile). 03-BUILD-SPEC.md written.
- 2026-06-14 — P0+P1 BUILT (UNCOMMITTED): `_SYSTEM/Scripts/memory-canonical-store.mjs` (@capability registered) + `.test.mjs` 9/9 GREEN in temp dirs (zero live-store mutation). Proven: byte-cap, cross-lane dedup, multi-shard fold integrity, crash-recovery idempotency, drainer election, supersede, retract, sha256. NOT YET (gates arming): true multi-PROCESS concurrent append, generation-based ROTATION (not implemented — shards/canonical grow unbounded), disk-full, dead-owner-reclaim e2e in own suite, VC clock-skew ordering (vc field exists, no consumer yet). Drainer is single-shot `drainOnce`, not yet a daemon loop. NEXT: fault-injection integration layer (design §6) + P2 rotation, before any arming.
