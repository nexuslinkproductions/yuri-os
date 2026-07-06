116 orphaned scripts out of 323. That's 36% dead code. I have the full picture now.

---

# BLIND REVIEW: The Single Highest-Leverage Compounding Simplification

## Ground evidence (what I verified, not inferred)

| Fact | Evidence |
|---|---|
| 323 non-test scripts, 245 test files | `ls _SYSTEM/Scripts/*.mjs \| grep -v test` = 323; `.test.mjs` = 245 |
| 116 scripts imported by NOTHING (no non-test caller, no CLI invoker, no hook) | Orphan scan: 116/323 = **36% dead code** |
| Memory subsystem: ~64 scripts across 6+ overlapping layers | `grep -iE 'memory\|recall\|kagami\|canonical\|claim-ledger\|spreading'` |
| At least 9 distinct recall/read paths | `canonical-recall`, `yuri-total-recall`, `yuri-recall`, `memory-kernel`, `capability-recall`, `skill-recall`, `spreading-activation-memory`, `memory-match`, `yuri-memory-map` |
| 5+ real DBs acting as "memory" stores | `memory.db`, `kagami.db`, `search-index.db`, `memory-cold.db`, `semantic-memory.db`, `work-ledger.db` |
| 3 distinct lane-dispatch files that overlap | `lane-dispatch.mjs` (retry wrapper), `lane-dispatcher.mjs` (capability router — **zero callers**), `nano-dispatch.mjs` (swarm) |
| Multiple autonomy orchestration paths | `yuri-autonomy-runner`, `filing-autonomy`, `yuri-workcell`, `yuri-workcell-capture`, `yuri-control-plane`, `yuri-originator`, `yuri-session-launchd` |
| The system's own north star already names the goal | INDEX.md: *"one canonical operating spine"* |
| The improvement doctrine explicitly scores this as regression | A6 Compounding: *"the same thing re-derived"*; A1 Capability: *"code is rewritten where an existing capability should have been reused"* |

---

## THE ONE: Consolidate the Memory Read Path to a Single `recall()` Surface

### What it is

Today there are **at least 9 different "recall" functions** scattered across 64 memory scripts, backed by **5+ competing databases** (`memory.db`, `kagami.db`, `search-index.db`, `memory-cold.db`, `semantic-memory.db`), with **2 parallel memory architectures** (Track A canonical store + Track B Claude auto-memory) and a convergence layer bolted on top.

The fix: **one `recall(query, {axis, limit})` function that every lane calls**, which internally fans out to FTS5, canonical store, cold store, capability index, and skill index — then deduplicates and ranks. `xref-query.mjs` already does most of this (it fuses FTS5 + canonical + skills in PASS 1c). The job is to make it the **sole entry point**, deprecate the 8 others, and collapse the write side to match.

### Why it compounds (this is the real argument)

Every new feature, every new lane, every overnight run starts with **"what does the system already know?"**. Today that question has 9 answers, none complete, most mutually blind. This means:

1. **Every new script reinvents recall.** Evidence: `yuri-total-recall`, `yuri-recall`, `canonical-recall`, `spreading-activation-memory` all solve overlapping slices of the same problem, each imported by different callers, each with its own DB read logic. A new lane doesn't know which to use, so it either picks wrong (incomplete context) or reads all of them (wasted tokens + contradictory signals).

2. **Memory writes are uncoordinated.** 16 scripts write to `memory.db` directly; 11 import `memory-canonical-store`; the Kagami pipeline, the filing bridge, the Claude auto-memory, and the proposal autopilot all write to different stores. A fact learned in one subsystem is invisible to others. This is the **anti-compounding failure**: the system learns but doesn't *retain across boundaries*.

3. **The owner's cognitive load.** Marcel doesn't track 9 recall paths. He thinks "the system should know X." When it doesn't — because X was written to `kagami.db` but the lane read `memory.db` — that's a **trust fracture**. Every trust fracture costs a manual intervention (violating doctrine axis A3: "more work completes autonomously WITHOUT the owner having to clean up afterward").

Consolidating to one read surface means: **the next script anyone writes calls `recall()` and gets the full picture.** The next DB added plugs into one place. The next lane boots and knows everything the system has ever learned. That's the compounding payoff — it's the root of "I think and speak and it gets done."

### Smallest version that ships

1. **`recall()` = a thin wrapper around `xref-query.mjs`'s existing PASS 1c fusion** (FTS5 + canonical + skills), extended to also query `memory-cold.db` and `kagami.db`. It already does 70% of the work.
2. **Deprecate (not delete):** mark `yuri-recall`, `yuri-total-recall`, `spreading-activation-memory`, `memory-match`, `yuri-memory-map` as thin redirects to `recall()`. They already return subsets of what xref fuses.
3. **One write contract:** `propose() → decide() → commit()` through `memory-kernel.mjs`, which already has the governance pipeline. Redirect the other write paths (claude-memory-write, kagami-memory-pipeline, filing-canonical-bridge) to route through it.

**Estimated effort:** 2-3 sessions. The fusion logic exists; the job is deprecation routing + write-side consolidation.

### What it unblocks

- **Overnight autonomy that actually remembers** — an autonomous run can trust it has full context, so it stops re-deriving known facts.
- **The 116 dead scripts become deletable** — once recall is unified, ~15-20 of the orphaned memory scripts have zero remaining reason to exist. The audit surface shrinks.
- **New lanes boot in one call** — `recall("current session context")` instead of reading 6 files + querying 3 DBs.
- **Trust compounding** — Marcel stops finding "the system didn't know X" failures, which is the single biggest source of manual intervention.

---

## RUNNER-UP 1: Delete the 116 Orphaned Scripts

### What it is
36% of all non-test scripts are imported by nothing and invoked by nothing. They are archaeological sediment from experiments, abandoned architectures, and superseded approaches. `lane-dispatcher.mjs` (capability router with zero callers), `yuri-repl.mjs` (superseded by `rick-repl.mjs`), `yuri-total-recall.mjs` (superseded by xref fusion), `kagami-memory-consolidator.mjs` (superseded by mcs-maintenance), `truth-maintenance.mjs`, `wave3-gate-sim.mjs`, and ~110 others.

### Why it compounds
Every script in `_SYSTEM/Scripts/` is cognitive overhead for any lane trying to understand the system. When a lane searches for "how does YURI handle X," it gets 9 hits, 6 of which are dead — and it can't tell which are live without tracing call graphs. **The dead code makes the live code harder to find.** Deleting it makes every future search, every xref-query, every capability-recall return a higher signal-to-noise ratio. It also makes the test suite faster (245 tests, many guarding dead code).

### Smallest version
Move all 116 to `_SYSTEM/archive/orphan-quarantine-2026-06/` (reversible). Run the full test suite. Anything that breaks reveals a real dependency the static scan missed. Delete the quarantine after 2 weeks of clean runs.

### What it unblocks
- **Faster search** — FTS5 over 323 files vs 207; every query returns less noise.
- **Lower maintenance** — 245 tests guard 323 scripts; cutting to ~207 cuts ~90 tests.
- **Clearer architecture** — a new lane reading `_SYSTEM/Scripts/` sees the real system, not its fossil record.

---

## RUNNER-UP 2: Collapse the Lane-Dispatch Layering to One Path

### What it is
The dispatch subsystem has **67 scripts** implementing overlapping concerns: `lane-dispatch.mjs` (retry wrapper, 3 callers), `lane-dispatcher.mjs` (capability router, **zero callers**), `nano-dispatch.mjs` (swarm, self-referencing), `pulse-lane-dispatch.mjs`, `nano-dispatch-gated.mjs`, `nano-dispatch-async.mjs`, `llm-compat-queue.mjs`, `codex-offload-runner.mjs`. The actual user-facing entry (`rick-repl.mjs`) imports `worker-bridge.mjs` + `lane-core-hooks.mjs`, which is a *different* dispatch path than the autonomy runner uses.

### Why it compounds
"I think and speak and it gets done" requires that the path from **intent → dispatched work** be short and obvious. Today there are at least 3 dispatch chains (REPL → worker-bridge, autonomy-runner → lane-dispatch → llm-lane, nano-swarm → nano-dispatch → nano-tick). They don't share retry logic, telemetry hooks, or failure handling. Every new dispatch mode means reinventing the retry/telemetry/gate stack.

### Smallest version
Kill `lane-dispatcher.mjs` (zero callers — pure dead code). Merge `nano-dispatch-gated` and `nano-dispatch-async` into `nano-dispatch.mjs` (they're gated/async variants of the same seam). Consolidate the retry logic from `lane-dispatch.mjs` into `llm-lane.mjs` itself (it shouldn't be a separate wrapper — retry is a transport concern). Net: ~4 fewer files, one dispatch path per topology (single-lane, swarm, REPL).

### What it unblocks
- **Simpler overnight runs** — one dispatch path means one failure mode, one telemetry stream, one retry contract.
- **New lane types are trivial** — add a lane to `llm-compat-contract.mjs` and it inherits the full retry/gate/telemetry stack automatically.

---

## What I explicitly REJECT (not "nice" enough)

- **Reorganizing the folder structure** — cosmetic. The owner navigates via xref-query, not `ls`. Zero compounding.
- **More gates / more safety machinery** — 61 gate/guard/scan scripts is already past the point of diminishing returns. Adding gates increases the owner's cognitive load, not reduces it.
- **A new dashboard / observability layer** — the doctrine's A10 axis pushes this, but the system has **too many** observability surfaces already (`lane-telemetry-cockpit`, `pulse-cortex-status`, `energy-observability-health`, `yuri-doctor`). Another one doesn't compound.
- **Unifying the graph** — already done (`yuri-graph.json` is the single source, projections are lossless). This is solved.

---

## The ruthless summary

The system's core disease is **not missing capability — it's lost consolidation**. YURI has 9 recall paths, 5 memory DBs, 3 dispatch chains, and 116 dead scripts because every session built the "new, clean version" instead of extending the existing one. The compounding simplification is to **make the existing fusion point (`xref-query.mjs` / `recall()`) the sole entry point and delete everything that duplicates it.** That single move makes every future task simpler (one recall call), makes the system more powerful (full cross-boundary memory), and cuts the owner's cognitive load the most (the system finally knows what it knows).

RESULT_LABEL: `08GL_MEMORY_RECALL_UNIFICATION_REVIEW_X_PASS_COMMITTED`