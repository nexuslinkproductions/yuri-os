# JARVIS ↔ YURI-OS Integration Mission Brief (ground truth)

> Mission owner: Marcel. Active lane: Claude (main). Swarm: 3× GLM-5.2 nano peers (Z.ai).
> Goal: the BEST version of the voice assistant comes from extending the brain INTO the YURI OS substrate
> (canonical memory, spreading-activation, the energy gate's ΔU, xref navigation) — not a standalone brain.
> Forged 2026-06-19. Every peer reads this FIRST.

## The reframe (read this or you'll build the wrong thing)

There are TWO "Yuri"s:
- **the assistant** = the voice brain (`_SYSTEM/Scripts/voice/yuri-z-brain.py` + `jarvis_memory.py`). This is what speaks.
- **the system of Yuri** = **YURI OS / MUSUBI** — the full substrate: canonical memory store, spreading-activation, the energy gate (`computeU` + its ΔU trace), xref/capability navigation, the circuitry graph, skills, lanes.

The best assistant is one **wired into the system**, drawing on its organs — so her memory is genuinely surprise-gated by the system's energy, her recall is associative (not just keyword), and she navigates YURI's own knowledge natively. This mission builds those integration seams.

## Quantum/coupling sim result (why the work is shaped this way)

Modeled file-overlap (Schmidt-style coupling) between the 3 integration tracks. Naive parallel fan-out **collides** — all 3 share `yuri-z-brain.py` + `jarvis_memory.py` (3 serialize hazards). Verdict: **DECOUPLE** — each track becomes its OWN new module file → zero pairwise coupling → the 3 peers build 3 disjoint modules IN PARALLEL (no collision), and the main lane does the SINGLE serial brain-import wiring step after collection. This is the no-collision, best-outcome path.

## The 3 tracks (one module each — a peer owns exactly one)

All modules land in `_SYSTEM/Scripts/voice/`. Each is self-contained Python (stdlib + sqlite3 only — **no Node subprocess in the voice hot-path**; that latency budget is sacred). Each must be import-clean, syntax-clean, and ship a focused test.

### T1 — `jarvis_energy.py` — ΔU surprise → real write_strength
The sharpest integration (the NEURO_CORE doctrine made real): `write_strength = |ΔU|·precision`. Today `jarvis_memory.remember()` uses a model-judged weight as a proxy — there's no real ΔU. Wire the system's energy into it.
- **Read** `_SYSTEM/Scripts/math/yuri-energy-gate-trace.mjs` — exports `readGateTrace()`, `gateTracePath()`. The trace is a JSONL of gate verdicts: `{stateBefore, stateAfter, decision, corrId, ...}` appended when `YURI_GATE_TRACE=1`. **Read the JSONL directly in Python** (get the path via a one-shot `node -e "import{gateTracePath}from'../math/yuri-energy-gate-trace.mjs';process.stdout.write(gateTracePath())"` at module init, cached — NOT per-call). If the trace is absent/empty → degrade to surprise=0 (write_strength = base weight; non-fatal).
- **Expose**: `surprise_score(window=20)` → float (mean |stateAfter.U − stateBefore.U| over the last N verdicts, time-decayed); `write_strength(base_weight, precision=1.0)` → `base_weight * (1 + surprise_score()) * precision`, clamped [0.1, 5].
- **Contract for the brain**: `jarvis_memory.remember(weight=...)` will later call `jarvis_energy.write_strength(weight)` when armed. T1 just provides the function; do NOT edit jarvis_memory.py (the main lane wires it serially).
- Safety: READ-ONLY on the energy system. Never arms the gate, never writes the trace.

### T2 — `jarvis_spreading.py` — associative recall (the V2 layer, made real)
`jarvis_memory.recall()` is FTS5 keyword-only. Add associative ranking: build an episode graph from the SQLite store (nodes = episodes, edges from shared cues/tags/kind + co-recall), run personalized PageRank seeded by the current utterance's cues, fuse with FTS.
- **Reference** `_SYSTEM/Scripts/spreading-activation-memory.mjs` — the canonical algorithm: `createGraph`, `addNode`, `addEdge`, `recall(graph, seeds, {damping=0.85, iterations=30})` = PPR power iteration + use-count prior. **Reimplement in PURE PYTHON** (the .mjs is ~60 lines of linear algebra; mirroring it keeps the voice hot-path Node-free). Read episodes from `jarvis_memory`'s DB (path = `jarvis_memory.DB_PATH`).
- **Expose**: `associative_recall(query, db=None, limit=5)` → list of `{id, activation}` ranked by PPR; `build_graph(db=None)` → graph from current episodes (cache per-process, rebuild when episode count changes).
- **Contract for the brain**: `jarvis_memory.recall()` will later fuse FTS results with `associative_recall()` (rank fusion). T2 provides the ranker; do NOT edit jarvis_memory.py.
- Cache the graph in-process (rebuild only when the episode row-count changes) — PPR over hundreds of nodes each turn is fine, but don't rebuild needlessly.

### T3 — `jarvis_xref.py` — canonical truth + native YURI navigation
Two things: (a) load the system's canonical truth at brain startup (beyond the static MEMORY.md), (b) expose xref-query so Yuri navigates YURI's knowledge the way lanes do.
- **Read** `_SYSTEM/Scripts/memory-canonical-store.mjs` — `loadCanonical()` / `readView()` (peer-open, no lease). Get the read-view via a one-shot node call at init: `node -e "import{readView}from'../memory-canonical-store.mjs';console.log(JSON.stringify(readView()))"`, cache the compact block. Degrade to empty if absent.
- **Read** `_SYSTEM/Scripts/xref-query.mjs` — the navigation surface. Expose `xref(query)` → shells `node _SYSTEM/Scripts/xref-query.mjs "<query>"` (bounded output, ~40 lines), returns compact text. This becomes a brain TOOL (Yuri navigates YURI natively).
- **Expose**: `canonical_block()` → compact markdown block of canonical claims for startup injection; `xref(query, max_lines=40)` → navigation result string.
- **Contract for the brain**: startup `_build_system()` will append `canonical_block()`; a new `xref` tool wraps `xref()`. T3 provides the functions; do NOT edit yuri-z-brain.py.
- Safety: xref is READ-ONLY navigation. canonical is READ-ONLY. No writes to governed surfaces.

## Hard constraints (every peer — non-negotiable)

1. **Write ONLY your own module file** (`jarvis_energy.py` / `jarvis_spreading.py` / `jarvis_xref.py`) + your test (`test_jarvis_<track>.py`). NEVER touch `yuri-z-brain.py`, `jarvis_memory.py`, or any other file — the main lane does the serial wiring. This is what makes you collision-free.
2. **Python stdlib + sqlite3 only** in the module. No `pip install`, no Node subprocess per-call (one-shot node at init for path/view resolution is OK, cached).
3. **Degrade cleanly** (DISARMED-degrades at the seam): every integration is non-fatal. Trace/canonical/xref absent → return safe empty/zero, the brain keeps working. Gate your module behind an env flag (`JARVIS_ENERGY=1` etc., default ON) so the main lane can disable independently.
4. **Protected paths off-limits**: never read/write `.env`, `backend/data/`, `.claude/state/`, `.claude/history/`, `.claude/projects/`, `node_modules/`, secrets. The energy trace + canonical store + xref are READ surfaces you MAY read.
5. **Self-verify before reporting done**: `python3 -c "import ast; ast.parse(open('<your_module>').read())"` must pass; run your test `python3 test_jarvis_<track>.py` — GREEN required. Do NOT over-claim ("done" with 0 working code is the classic nano failure — the main lane verifies every file).
6. **No live gate arming, no outward actions.** This is READ-ONLY integration into the substrate + new module files. Reversible, in-doctrine, blast ≤ MEDIUM.

## Acceptance (per peer)

- `<module>.py` exists, imports clean, exposes the contract functions above with the exact signatures.
- `test_jarvis_<track>.py` GREEN (GREEN happy-path + RED degrade/cold-start + at least one edge).
- A 5-line summary at the end: what you built, the exact function signatures, the env flag, residual risk.
- The module is ready for the main lane to `import` and wire serially — no brain edits from you.

## Integration plan (main lane, AFTER collection)

1. Verify all 3 modules exist + their tests green (artifact-gated; re-run, don't trust "done").
2. Serial wiring in ONE pass: `jarvis_energy` → enriches `remember` write_strength; `jarvis_spreading` → fuses into `recall`; `jarvis_xref` → startup `canonical_block()` + new `xref` tool.
3. Extend `test_jarvis_memory.py` / brain suite for the wired seams; RED-TEAM the integration (does degrade work end-to-end at the seam, not just in the module?).
4. Commit + push explicit pathspec.

## Result label target

`09CL_JARVIS_YURI_OS_INTEGRATION_<track>_X_PASS_COMMITTED` (per peer) → `..._WIRED_X_PASS_COMMITTED` (main lane integration).
