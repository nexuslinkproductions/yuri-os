# CHECKPOINT — irys raid → recursive exoskeleton nanoswarm (pre-compact, 2026-06-14)

> Resume anchor across compaction. Branch: `main` (HEAD `b3bc89c4` at write; **3-session contention — Rust consolidation lane actively pushing** `714a05b5` Phase-2, canonical-store lane PAUSED by owner). All my work committed+pushed, sync 0/0, zero file-overlap collisions.

## THE ARC (one line)
Mined `dl1683/irys-stateful-swarms` → verdict "take the convergence GATE not their LLM-controller" → built Move 1 (the gate) → owner wants it extended into a **recursive exoskeleton nanoswarm** (lanes spawn YURI-equipped sub-lanes) → quantum-sim'd the design → **NEXT: intricate architecture planning for Move 1b** (owner: "this requires seriously intricate planning and proper architecture").

## SHIPPED THIS SESSION (all committed+pushed to main)
- `c30d89a2` **Nemotron lane fix** — per-model `model_output_caps` clamp + in-process memo in `llm-lane.mjs` killed the cap-retry storm (was 13 retries/turn → 0; proven 16-turn agentic run). Root cause: `capCeil` was function-local + lane defaulted to xhigh 131072 > nemotron's 65536 output cap.
- `bb1d3deb` irys 4-lane synthesis (docs 00-02 + memory).
- `d4cf3272` **Move 1: `_SYSTEM/Scripts/swarm-convergence.mjs`** (+`.test.mjs`, 12/12) — the 3-layer convergence gate + damping, DISARMED behind `YURI_SWARM_CONVERGENCE=1`, ZERO callers (workcell wiring = unbuilt owner-gated arm step).
- `3960e852` kimi-k2.7-code:cloud + gemma4:31b-cloud added to ollama-cloud roster (both live-smoke-verified).
- `cef150a1` project memory update.
- `b3bc89c4` quantum skill refreshed to current (`15cfc088` learn-loop closed via prediction-outcome-resolver) + **05-QUANTUM-SIM-FINDINGS.md**.

## THE EXISTING SUBSTRATE (capability-first — most of the nanoswarm is already built)
- `nano-external.mjs:externalNanoWork({lane,task})` — equips ANY lane (mimo/deepseek/nemotron/kimi/gemma/local) with the FULL YURI exoskeleton (675-line spine + safety core + gated read/exec tool loop + energy trace + 24-iter loop), routed through llm-lane (enforced). Returns a `work(ctx)` for nano-tick.
- `nano-tick.mjs` (tick/runTicks/recoverCursor) — per-nano loop body. `nano-lease.mjs` — election + dead-owner reclaim. `kagami-swarm-supervisor.mjs` — cron janitor (reap/rotate/liveness; NOT a work loop).
- `memory-canonical-store.mjs` — per-lane shard→drainer→canonical.jsonl convergence store, ARMED LIVE. `canonical-recall.mjs:contestedClaims()` (shipped `883ea856`) — surfaces cross-lane contradictions = the **critical-signal source for Move-1 Layer 2**.
- `swarm-convergence.mjs` (Move 1, mine) — `buildObligationLedger / checkObligationFloor / checkCriticalSignalBlock / runAdversarialPass / checkDamping / dedupeWork / converge`. DISARMED-default, arm-state injectable (opts.armed).
- Lane toolset (llm-lane.mjs TOOLS): read_file/grep/search/xref_query/bash/write_file/edit_file — a lane can ALREADY shell-spawn another lane via bash (ungoverned recursion exists today).

## QUANTUM SIM VERDICT (05-QUANTUM-SIM-FINDINGS.md — the design gate the owner requested)
Non-commuting pair **A=child writes EOT→canonical** vs **B=parent runs convergence**. Results (controlled: Bayes-blind baseline + commuting honesty-control both confirm):
1. **Real order effect, 0.5 magnitude** — parent-converges-LAST over an in-flight child → 0.5 false-completion; child-integration-last → 0 (becomes flagged-contested H2). Classical Bayes is BLIND (Δ=0) — a normal design review would miss it.
2. **Fix = the barrier** (commuting variant → 0, order-independent).
3. **Schmidt: depth ↔ soundness ENTANGLED** [0.884, 0.468] → depth caps are a TRUTH governor, not just cost.
Caveat: ℝ^3 abstract, 0.5 is geometry-dependent — the STRUCTURE (effect exists + barrier fixes it + depth couples) is the finding, advisory until a live logged-sequence test.

## MOVE 1b DESIGN (current, to be deepened post-compact)
`spawn_nano` tool in the lane toolset wrapping `externalNanoWork`, governed by the Move-1 gate. Locked rules:
- **RULE 1 — convergence barrier:** a parent must not emit terminal `converged` while a spawned child's EOT→canonical is in flight; on child-completion the parent RE-RUNS Move-1 Layer-2 (`contestedClaims()` re-read) = the commuting fix. Late contradiction → flagged signal, never silent false-completion.
- **RULE 2 — tiered depth cap (OWNER RULE 2026-06-14): heavy = model >200B trained params → depth cap 5; light = <200B → depth cap 10.** Caps bound race-windows (soundness) + cost. Each level inherits the barrier + a fan-out cap.
- **RULE 3 — EOT-as-canonical-writer** on every spawned agent (recursively) is sound IFF Rule 1 holds.

### Lane heavy/light classification (by the >200B rule — VERIFY exact params post-compact)
- HEAVY (cap 5): nemotron-3-ultra (550B✓), glm-5.1 (744B✓), kimi-k2.7-code (~1T, kimi-k2 family✓), deepseek-v4-pro (V4, ~671B-class — verify), Claude Opus/Sonnet (frontier→heavy), codex gpt-5.5 (frontier→heavy). minimax-m3 + mimo-v2.5-pro = VERIFY param count (likely ≥200B).
- LIGHT (cap 10): gemma4:31b (31B✓), nemotron-3-nano:30b (30B✓), qwen-local (9B✓), gemma-local (12B✓), ds-flash + mimo-flash (flash tier → verify but light).

## NEXT (post-compact) — the intricate architecture (owner's emphasis)
Map out the FULL recursive nanoswarm architecture before building: (1) spawn-tree topology + how depth/fan-out/budget caps compose across levels; (2) the barrier mechanism concretely (how does a parent KNOW its children are still in flight? lease-based child registry? canonical-store watermark?); (3) EOT closeout contract for spawned agents (what claims, dedup, shard identity per nano); (4) how `converge()` is invoked per-level + the cross-level contested propagation; (5) failure/orphan handling (child dies mid-flight — kagami-supervisor reaps, but does the parent unblock?); (6) the spawn_nano tool schema + governance (depth/fanout enforcement point); (7) cost ceiling across the whole tree (cost-reservation-pool integration). THEN spec → TDD build, DISARMED-first.

## OPEN QUESTIONS FOR THE ARCHITECTURE
- Barrier impl: how does a parent enumerate its in-flight children? (proposed: a per-run child-lease registry via nano-lease, or a canonical-store "open-EOT" watermark per spawn subtree).
- Does every nano get its own canonical shard, or share the parent's? (shard-per-nano = clean provenance + the per-lane-shards anti-clobber property).
- Cross-level convergence: does a parent's converge() recurse into children's converge(), or is it flat per-level with the barrier as the coupling?
