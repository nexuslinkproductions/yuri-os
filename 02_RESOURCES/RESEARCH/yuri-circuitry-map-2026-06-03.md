# YURI Circuitry Map — Full Internal Wiring (2026-06-03)

**What this is.** Not a mechanism *count* (that lives in `02_RESOURCES/RESEARCH/yuri-mechanism-spectrum-267-2026-06-03.md` — 267 mechanisms / 9 layers). This is the *circuitry*: every real organ, its exact files, the STATE it reads/writes, what TRIGGERS it, and the EDGES — what it calls and what calls it. The edges are the whole point.

**Method.** Every wiring fact below was verified against live code (grep/read) on 2026-06-03, not trusted from the old Architecture Codex (which carried phantoms). `verified=true` means the file was opened or the claim was grep-confirmed in this pass. The companion machine graph is `02_RESOURCES/research/yuri-circuitry-graph.json` (83 nodes, 153 edges) — the feed for the live visual.

**Reading the wiring.** Each organ lists: purpose · files · trigger · reads/writes (state) · calls → · ← called by. A *call* edge is one module importing/invoking another. A *state* edge is a read or write to a store (a `.json`, `.jsonl`, `.db`, `.log`, or `.md` file). The biggest single insight: the two heaviest live circuits — the **per-tool-call gate chain** and the **session-boot brain load** — are wired through `.claude/settings.json` hook arrays, and *array order IS execution order*.

---

## Layer 1 — Energy & Math

The work-dynamics math: a scalar Lyapunov potential `U` over control-plane state, its gradient `ΔU`, and a gate that accepts/rejects with a hard veto + structural floor. **Live status:** the gate is no longer "research-ready" — it is the live runtime instrument (PostToolUse measures, PreToolUse can enforce). 4 of 11 energy terms are *starved-not-broken* — see the Phantoms section.

### Energy Function (`computeU` / `computeDeltaU` / `gateProposal`)
- **Files:** `_SYSTEM/Scripts/math/yuri-energy.mjs`
- **Purpose:** the scalar Lyapunov potential, its gradient, and the accept/reject gate with hard-veto (protected-path eta=100) + structural floor (ladder-inversion). The heart of the math.
- **Trigger:** import — live gate core, breaker, cortex, trace, control-server, sims; also a `--worked-example` CLI.
- **Reads:** weights arg (defaults frozen 11-term `DEFAULT_WEIGHTS`: alpha..lambda). **Writes:** none.
- **Calls →** `math-kernel` (entropy, KL, logLoss, brierScore, informationGain, confidenceDecay).
- **← Called by** `energy-tick-core`, `energy-breaker`, `claim-cortex`, `energy-trace`, `energy-config`, `energy-control-server`, `action-mode-study`, `energy-simulate`, `energy-experiment`, `energy-dashboard-data`, `energy-weights-drift-test`.
- **Phantom corrected:** header docstring says "research → fixture_ready. Not yet runtime_tested in dispatch." — **STALE**: it IS the live runtime gate (energy-tick PostToolUse feeds real transitions, gated on `YURI_ENERGY_OBSERVABILITY=1`, set in settings.json).

### Math Kernel (22 certified primitives)
- **Files:** `_SYSTEM/Scripts/math/math-kernel.mjs`
- **Purpose:** the proven primitive library (entropy, KL, cross-entropy, infoGain, confidenceDecay, brier, logLoss, bayes, softmax, dijkstra, astar, topo-sort, vector ops) with byte-stable rounding + sha256 result hashing.
- **Trigger:** import. **State:** none.
- **← Called by** `energy-fn`, `math-proof-gate` (FORMULA_IMPLEMENTATIONS bind each primitive), `math-adapters`.

### Energy Tick Core
- **Files:** `_SYSTEM/Scripts/energy-tick-core.mjs`
- **Purpose:** turns LIVE session tool-events into real before/after control-plane state pairs and ΔU; salience tiering (SKIP/WORK/CRITICAL), per-transition state application, Layer-C depth-gated surprise trigger.
- **Trigger:** import from the energy-tick PostToolUse hook.
- **Reads:** `_SYSTEM/SELF/energy-weights.json` via `loadEnergyConfig`. **Writes:** returns nextState/depth/recentAbs for the hook to persist; appends a trace via `traceGateEvaluation`.
- **Calls →** `energy-fn` (gateProposal, DEFAULT_WEIGHTS), `energy-trace`, `energy-config`, `yuri-user`.
- **← Called by** `energy-tick-hook`, `energy-breaker` (toGateState), `energy-obs-health`, `energy-weights-drift-test`.

### energy-tick hook (PostToolUse PDP — the everyday ΔU source)
- **Files:** `.claude/hooks/energy-tick.mjs`
- **Purpose:** reads the session snapshot, runs `tickAndTrace` on each genuine tool transition, advances the circuit-breaker, persists the snapshot.
- **Trigger:** PostToolUse hook (settings.json **L259**, async, matcher `""`); gated on `YURI_ENERGY_OBSERVABILITY=1`.
- **Reads/Writes:** `_SYSTEM/state/energy-session/<sessionId>.json` (state, depth, recentAbs, surpriseEngaged, breaker).
- **Calls →** `energy-tick-core` (tickAndTrace/freshState), `energy-breaker` (verdictFromStates/transitionOnVerdict).

### Energy Breaker (circuit breaker over trailing verdict)
- **Files:** `_SYSTEM/Scripts/energy-breaker.mjs`
- **Purpose:** Resilience4j-style CLOSED/OPEN/HALF_OPEN breaker ported to the gate — catastrophic non-offsettable verdicts (protected-path / structural-floor veto) trip it; it auto-decays so it can never permanently block. **Splits the OUTCOME-driven transition (PostToolUse) from the TIME-driven enforcement read (PreToolUse).**
- **Trigger:** import — `transitionOnVerdict` (PostToolUse), `evaluateGate` (PreToolUse).
- **Reads:** breaker blob in the energy-session snapshot; env `YURI_ENERGY_BREAKER_WAIT_MS`, `..._HALFOPEN_MS`.
- **Calls →** `energy-fn`, `energy-tick-core`.
- **← Called by** `energy-tick-hook`, `energy-enforce-hook`, `energy-simulate`.

### energy-enforce hook (PreToolUse PEP — the teeth)
- **Files:** `.claude/hooks/energy-enforce.mjs`
- **Purpose:** the Policy-Enforcement-Point that finally makes the gate ACT — reads the trailing breaker state and DENIES the next tool call on a catastrophic OPEN verdict. Registered LAST in PreToolUse. Fails OPEN on any data gap.
- **Trigger:** PreToolUse hook (settings.json **L206**); gated on `YURI_ENERGY_OBSERVABILITY=1` AND (`YURI_ENERGY_ENFORCE=1` OR the flag file `_SYSTEM/state/energy-enforce.enabled`).
- **Reads:** energy-session snapshot, `_SYSTEM/state/energy-enforce.enabled`. **Writes:** advanced breaker back to the snapshot; `~/.yuri-audit.log` (deny / would_deny).
- **Calls →** `energy-breaker` (evaluateGate, loadBreakerCfg, freshBreaker).
- **VERIFIED LIVE (2026-06-03):** the flag file `_SYSTEM/state/energy-enforce.enabled` EXISTS (0 bytes, created 16:51, matching commit `3371c378` "flip the work-dynamics gate to enforcing"). It is gitignored → the *shipped* default stays OFF (metrics-only burn-in); enabling is a deliberate local act. Soft ΔU-ascent never blocks; only catastrophic protected-path / structural-floor vetoes deny.

### Energy Config Loader · Energy Weights Config Surface
- **Files:** `_SYSTEM/Scripts/math/yuri-energy-config.mjs` · `_SYSTEM/SELF/energy-weights.json`
- **Purpose:** the loader fail-closed-validates the optional override (bad/non-finite values DROPPED, not coerced), returning `{weights, threshold, salience, evict, fsrs, recall}` merged over in-code defaults. The config file is the single externalized knob surface — every value equals the in-code default; editing steers the live system. The drift test enforces that invariant.
- **Trigger (loader):** import — called by `tickAndTrace` on every gated transition; CLI dump. **Reads** the weights file. **(Surface)** read by loader/evict/relocator/fsrs/recall/brain-inject; written by control-server `POST /apply`.
- **Calls →** `energy-fn` (DEFAULT_WEIGHTS allow-list).
- **← Called by** `energy-tick-core`, `energy-control-server`, `energy-weights-drift-test`.

### Energy Trace (telemetry + Layer-7 Privacy Gate)
- **Files:** `_SYSTEM/Scripts/math/yuri-energy-trace.mjs`
- **Purpose:** JSONL telemetry for every gate evaluation, with the mechanically-enforced Privacy Gate (structural full-path string allow-list, plain-object-only, toJSON/function/symbol/BigInt rejection, serialize-then-re-validate canary) and the CLOSED-SET canonical promotion-label key guard.
- **Trigger:** import — `traceGateEvaluation` on the live tick + every experiment surface. **Writes:** `_SYSTEM/state/energy-trace/<YYYY-MM-DD>.jsonl`.
- **Calls →** `energy-fn`. **← Called by** `energy-tick-core`, `energy-dispatch-bridge`, `energy-experiment`.

### Claim-Evidence Cortex (epistemic sensor — BUILT BUT UNWIRED)
- **Files:** `_SYSTEM/Scripts/claim-cortex.mjs`
- **Purpose:** the intended live epistemic sensor — in-session claim ledger, claimed-vs-evidenced ladder rank, FSRS-style evidence aging, prior→posterior belief shift, emits a `computeU`-shaped snapshot that *lights the 4 starved terms* (alpha/beta/epsilon/zeta) + the theta structural floor. Adds a swap-immune per-claim identity veto.
- **Trigger:** import / CLI `--worked-example` ONLY — **NOT wired to any live hook.**
- **Calls →** `claim-integrity-gate` (PROMOTION_STATES), `energy-fn`. **← Called by** *(none live — its own test only).*
- **PHANTOM CORRECTED — the central one for this layer:** the task premise was "the 4 dark terms light up when the claim cortex feeds them — which now exists: claim-cortex.mjs." **Verified false in the live circuit.** The cortex exists (36KB, dated today) but grep for `claim-cortex` across `.claude/` and `_SYSTEM/Scripts` returns ONLY `claim-cortex.test.mjs` — zero hook/settings reference. Its own header self-declares "an additive OBSERVABILITY sensor with no live consumer of its veto." So the four dark terms CAN light up via the cortex, but no wire feeds the cortex into the gate — the live tick path still exercises only 5 of 11 terms. Wiring claim-cortex into PostToolUse is the missing edge (and per its header needs an L∞ max-severity veto added INSIDE `gateProposal` first).

### Claim-Integrity Gate (canonical ladder source)
- **Files:** `_SYSTEM/Scripts/claim-integrity-gate.mjs`
- **Purpose:** lints claim PROSE for over-claim vocabulary and owns the canonical `PROMOTION_STATES` ladder (draft→research→fixture_ready→runtime_tested→operator_validated→trusted→deprecated) that cortex + trace single-source.
- **Trigger:** import (ladder) + on-demand CLI lint. **Calls →** `artifact-registry`. **← Called by** `claim-cortex`.

### Math Proof Gate + Formula Banks
- **Files:** `_SYSTEM/Scripts/math/math-proof-gate.mjs` + `_SYSTEM/data/math/formula-banks/{probability-calibration,scoring-normalization,information-theory,vector-geometry,graph-search}.v0.json` + `_SYSTEM/config/schemas/yuri.math.formula-bank.v0.schema.json`
- **Purpose:** binds each formula-bank card to a real `math-kernel` primitive and runs worked examples + counterexamples (strict error-pattern match) before a bank can be promoted to non-advisory.
- **Trigger:** on-demand CLI + tests; not a runtime hook. **Reads:** the formula-bank JSON. **Calls →** `math-kernel`. **← Called by** `math-adapters`.

### FSRS-4.5 Retention Scorer
- **Files:** `_SYSTEM/Scripts/math/yuri-fsrs.mjs`
- **Purpose:** FSRS power-law retrievability `R(t)=(1+factor·t/S)^decay` with `R(S)=0.9`; effective-stability boost from salience/frequency/|ΔU|, demote/force-keep, recall-bump. The math primitive shared by the energy layer and the subconscious memory loop.
- **Trigger:** import — reads `fsrs:{}` from energy-weights via caller. **State:** none (caller-injected). **Calls →** none.
- **← Called by** `memory-relocator` (evaluateRetention), `energy-control-server`, `brain-inject`, `energy-weights-drift-test`.
- **Phantom corrected:** it does NOT import `yuri-energy` — the grep hit was a docstring mention ("mirrors the house style of yuri-energy.mjs"), not a code import. Its real downstream is the Memory layer's relocator.

### Energy Dispatch Bridge (LEGACY ΔU surface)
- **Files:** `_SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.mjs`
- **Purpose:** wired the legacy dispatch surfaces (offload-runner, shintai-dispatch) into a synthetic `ΔU=0` (or action-mode real-ΔU) trace. Default-off, error-isolated.
- **Trigger:** import — `traceDispatchEvent` fires IF offload-runner / shintai-dispatch run; gated on `YURI_ENERGY_OBSERVABILITY=1`.
- **Calls →** `energy-trace`, `yuri-user`. **← Called by** `offload-runner` (L177), `shintai-dispatch` (L1165), `energy-dashboard-data`.
- **Phantom note:** this is the LEGACY path. `energy-tick-core`'s own docstring says it "replaces the retired legacy dispatch surfaces (offload/shintai/codex-final-pass)." The bridge still fires if those surfaces run, but the live everyday ΔU now flows through the energy-tick PostToolUse hook, not here.

### Energy Sanitizer · Simulate · Experiment · Dashboard Data · Control Server · Obs-Health · Action-Mode Study · Drift Test
- **Sanitizer** (`yuri-energy-sanitize.mjs`): the only sanctioned raw-`_SYSTEM/state`→experiment bridge — allow-list projection re-validated through the Privacy Gate; in-memory only. Calls → `energy-trace` (validateRecord).
- **Simulate** (`yuri-energy-simulate.mjs`): grades the gate against labelled adversarial+healthy scenarios (falseAccept / falseReject). CLI + supercharge-gate. Calls → `energy-fn`, `energy-breaker`.
- **Experiment** (`yuri-energy-experiment.mjs` + `experiments/descent-demo.mjs`): runs scenario modules through computeU/ΔU/gateProposal, records Privacy-Gate-validated traces. Writes experiment JSON + energy-trace JSONL. Calls → `energy-fn`, `energy-trace`.
- **Dashboard Data** (`yuri-energy-dashboard-data.mjs`): assembles the read-only research-paper dashboard's real-data object with real/simulated/planned provenance tags. Reads energy-trace JSONL. Calls → `energy-fn`, `energy-dispatch-bridge`.
- **Control Server** (`yuri-control-server.mjs`): on-demand HTTP backend for the live tuning cockpit; previews 3 scenarios through the real gate, validates dials fail-closed, DEV-GATED writes tuned dials to `energy-weights.json` + a changelog `energy-config-changes.jsonl`. NOT a daemon. Calls → `energy-fn`, `energy-config`, `fsrs`.
- **Obs-Health** (`energy-observability-health.mjs`): liveness probe for yuri-health — confirms the PostToolUse hook is registered and trace records accrue (absence reported, not failed). Reads `.claude/settings.json` + `energy-trace/`. Calls → `energy-tick-core`. ← `yuri-health`.
- **Action-Mode Study** (`yuri-action-mode-study.mjs`): runs the REAL gate in enforce semantics over labelled transitions (confusion matrix = the gate's "teeth" proof) + replays recorded traces for the real-traffic false-positive rate that gates graduation to enforcement. Never blocks. Calls → `energy-fn`. (Its header "nothing blocks a real tool today" is now stale vs the enforce flag, but accurate of this harness.)
- **Drift Test** (`energy-weights-drift.test.mjs`): converts the `_doc.values_are_defaults` prose promise into an ENFORCED invariant — asserts every config value equals the in-code default. Calls → `energy-fn`, `energy-config`, `energy-tick-core`, `fsrs`.

---

## Layer 2 — Memory & Subconscious

Two memory tracks (A = canonical/shared, B = Claude behavioral) plus a science-curved forgetting loop. **Key live truth:** the forgetting loop is fully built but runs DRY-RUN — the cold store holds **0 rows** (verified `count` → `{"cold":0}`) and `relocation-index.json` is `{"relocated":{}}`. This is intentional (the T4 `--execute` flip hasn't been pulled), not a bug.

### claude-memory-write (Track-B native writer + reindex mediator)
- **Files:** `_SYSTEM/Scripts/claude-memory-write.mjs`
- **Purpose:** the optional mediated write/CRUD path into Claude auto-memory; validates v3 frontmatter, enforces `memory/`-root containment + forbidden-segment refusal, keeps MEMORY.md consistent. Native Write into `memory/` is also allowed (block scoped to volatile subdirs 2026-06-02) — this wrapper is the optional validation/reindex helper.
- **Trigger:** CLI `add|remove|read|list|reindex`; **SessionStart hook runs `reindex`** (the MEMORY.md self-heal).
- **Reads/Writes:** `.claude/projects/-Users-marcelspatz-YURI-OS-MUSUBI/memory/<slug>.md` + `MEMORY.md`.
- **← Called by** operator/agent CLI, settings.json SessionStart hook, `memory-relocator` (imports `memoryRoot`).

### MEMORY.md Self-Heal (SessionStart reindex)
- **Files:** `.claude/settings.json` (SessionStart hook **L98–104**) + `_SYSTEM/Scripts/claude-memory-write.mjs`
- **Purpose:** rebuilds the Track-B MEMORY.md index from the live `memory/*.md` files every session boot — direct-Write memories (no wrapper) still self-heal into the dense `[HANDLE](file)` index. **This is the ONLY auto-fired (SessionStart) indexing organ** — the search-corpus indexer is manual-only.
- **Calls →** `claude-memory-write` reindex → `updateIndex()`. **← Called by** Claude Code SessionStart lifecycle.

### yuri-recall (subconscious cue-recall, prior-turn-lag)
- **Files:** `_SYSTEM/Scripts/yuri-recall.mjs`
- **Purpose:** cue-dependent associative retrieval from the cold store — BM25 cue-match + 1-hop spreading-activation over crosslinks + recency/salience blend → bounded top-K; surfacing BUMPS the usage ledger (testing-effect reactivation). NEVER auto-writes memory; advisory candidates only.
- **Trigger:** UserPromptSubmit hook fires it DETACHED every turn (`spawnRecall`, `--out subconscious-recall.json`); the NEXT turn consumes the envelope (one-turn lag, <50ms exit).
- **Reads:** `_SYSTEM/OS_KERNEL/memory-cold.db`, `_SYSTEM/state/memory-usage.jsonl`, `energy-weights.json` (recall block). **Writes:** `memory-usage.jsonl` (recall event), `.claude/state/subconscious-recall.json` (atomic tmp+rename).
- **Calls →** `memory-cold-store` (queryCold), `memory-usage` (recordUse/buildUsageIndex), `energy-config` (recall blend knobs).
- **← Called by** `user-prompt-submit`.
- **WIRED-BUT-UNFED:** live-triggered every turn, but the cold store has 0 rows → recall surfaces nothing until the demote `--execute` flip. Code healthy; store empty by design.

### memory-cold-store (the subconscious / cold FTS5 DB)
- **Files:** `_SYSTEM/Scripts/memory-cold-store.mjs`
- **Purpose:** the indexed long-term store demoted memories relocate INTO (never deleted). A SEPARATE DB from the search corpus (`memory-cold.db` vs `search-index.db`) so the Memory/Search wall holds — cold memory has its own BM25 index. Two tables: `cold_docs` (FTS5 porter+unicode61) + `cold_meta` (salience/base-stability/crosslinks/demotedAt). Embedding-free; has its own inlined `buildMatch` deliberately decoupled from yuri-search. `cold_meta` intentionally does NOT duplicate useCount — `memory-usage.jsonl` is the single source of use-signal.
- **Trigger:** library import — recall(query), relocator(upsert/get/remove), consolidator(get); CLI `count|query`.
- **Reads/Writes:** `_SYSTEM/OS_KERNEL/memory-cold.db`. **Calls →** `better-sqlite3`.
- **← Called by** `yuri-recall`, `memory-relocator`, `kagami-consolidator`.
- **Verified:** holds 0 rows — schema live and valid, empty because no demotion has executed.

### memory-usage (recall-event ledger — the real USE signal)
- **Files:** `_SYSTEM/Scripts/memory-usage.mjs`
- **Purpose:** append-only replayable recall/reinforce ledger that REPLACES the broken atime-LRU signal (atime never advanced because nothing stat-reads the files). Replays into a usage index (useCount/lastUsed/lastReinforced). The relocator scores retrievability off THIS, not mtime/atime. Best-effort writes (never throws into the hot recall path).
- **Trigger:** library import — `recordUse` on every surfaced recall; `buildUsageIndex` read by recall/relocator/consolidator; CLI `record|index`.
- **Reads/Writes:** `_SYSTEM/state/memory-usage.jsonl`. (File lazy-created on first recall — does not exist yet. Lives in writable `_SYSTEM/state/`, not protected `.claude/state/`.)
- **← Called by** `yuri-recall`, `memory-relocator`, `kagami-consolidator`.

### memory-relocator (the canonical forgetting mechanism — RELOCATE not delete)
- **Files:** `_SYSTEM/Scripts/memory-relocator.mjs`
- **Purpose:** FSRS-scored demotion. A memory below the retrievability floor is DEMOTED into the cold store (body verbatim) AND its source moved into reversible `relocated/` (double safety, nothing deleted); the active index keeps a tombstone in `relocation-index.json`. `promoteHot()` restores byte-identical. Tier sets base stability (semantic 60d / episodic 14d / working 3d); `force_keep` / `archive:false` / pinned (MEMORY.md, memory-core.md, identity.md) and PROTECTED_TYPES (feedback, user) are exempt. Operates on Track-B per owner directive 2026-06-02.
- **Trigger:** import via the consolidator's `runSubconsciousPass`; CLI DRY-RUN unless `--execute`. No direct launchagent.
- **Reads:** `.claude/projects/*/memory/*.md`, `memory-usage.jsonl`, `relocation-index.json`, `energy-weights.json` (fsrs). **Writes:** `memory-cold.db` (upsert), `relocated/<file>`, `relocation-index.json` (tombstone).
- **Calls →** `fsrs` (evaluateRetention), `memory-usage`, `memory-cold-store`, `claude-memory-write` (memoryRoot).
- **← Called by** `kagami-consolidator`, operator CLI.
- **Verified:** `relocation-index.json` = `{"relocated":{}}` (empty); the loop has never executed; DRY-RUN by default. **Supersedes** `memory-evict.mjs` + `memory-archive.mjs` (now dormant relics).

### kagami-memory-consolidator (subconscious orchestrator + daily MLX review)
- **Files:** `_SYSTEM/Scripts/kagami-memory-consolidator.mjs` + `~/Library/LaunchAgents/com.yuri.kagami-memory-consolidator.plist` + `...kagami-stale-memory-scan.plist`
- **Purpose:** two jobs in one daily organ — (1) L6 subconscious consolidation (`runSubconsciousPass`: FSRS demote-plan + executeRelocation + cold re-promotion proposals via `findRepromotionCandidates` — cold slugs with recall pressure useCount≥3 → operator-gated memory-kernel proposal); (2) Qwen3.5-4B MLX review of all Track-B files for stale/dup/contradiction → `memory-health.json`. DRY-RUN by default; never auto-deletes. The subconscious half runs even when MLX is down (pure scoring).
- **Trigger:** launchd (daily 06:00 + stale-scan). **DRY-RUN unless `--execute` or `YURI_SUBCONSCIOUS_EXECUTE=1` — neither plist sets that flag**, so the scheduled run only REPORTS candidates (intentional — the T4 `--execute` flip not pulled).
- **Reads:** Track-B memory, `memory-cold.db`, `memory-usage.jsonl`, `memory-proposals.jsonl`. **Writes:** `_SYSTEM/training/state/memory-health.json`, log; (when `--execute`) cold.db + relocated/ + relocation-index + proposals.
- **Calls →** `memory-relocator`, `memory-cold-store`, `memory-usage`, `memory-kernel` (re-promotion proposals), `energy-config`; Rapid-MLX HTTP (qwen3.5-4b @ :8000).
- **← Called by** launchd.

### memory-kernel (Track-A canonical mediator: propose → decide → ledger)
- **Files:** `_SYSTEM/Scripts/memory-kernel.mjs`
- **Purpose:** the governed Track-A pipeline for operating truth shared across all lanes — RBAC by lane, `proposeMemoryWrite`, `recordMemoryProposalDecision`, `promoteMemoryProposal → appendLedger` (dual-ledger: proposals + decisions + ledger), `recallEntries`. Emits Kagami events on promote. Enforces protected surfaces via `safeRuntimePath`.
- **Trigger:** library import (CLI/agent + autopilot + consolidator + canonical-import). Not auto-scheduled.
- **Reads/Writes:** `memory-ledger.jsonl`, `memory-proposals.jsonl`, `memory-proposal-decisions.jsonl`, `memory-kernel-audit.jsonl`; reads `_SYSTEM/memory/MEMORY.md`.
- **Calls →** `kagami-event-bus`, `lane-kernel`, `evidence-contract-resolver`.
- **← Called by** `memory-proposal-autopilot`, `kagami-consolidator`, `yuri-canonical-memory-import`, operator CLI.

### memory-proposal-autopilot · secret-leak-scan
- **Autopilot** (`memory-proposal-autopilot.mjs`): polls the Track-A queue, DETERMINISTIC review first (reject protected-surface mutation intent via verb-aware unnegated-intent matching, reject empty/no-id, defer oversized, rewrite peer-lane blame), escalates ambiguous to Codex/main, records keep/rewrite/reject/defer through the kernel. Optional scoped auto-commit: stages ONLY the source/docs allowlist, runs secret-leak-scan BEFORE committing, refuses if allowlist paths were dirty pre-run. **Trigger:** invoked by `yuri-autonomy-runner` + operator CLI (no launchagent). **Calls →** `memory-kernel`, `lane-kernel`, `secret-leak-scan`, `codex-offload-runner`, git.
- **secret-leak-scan** (`secret-leak-scan.mjs`): the secret gate the autopilot runs BEFORE any scoped commit; non-zero exit aborts. Verified EXISTS + executable. **Trigger:** `spawnSync` from `commitScopedChanges`. **← Called by** autopilot.

### memory_governor.py (Track-A memory.db lifecycle governor — parallel system)
- **Files:** `_SYSTEM/OS_KERNEL/memory_governor.py`
- **Purpose:** lifecycle layer over the large legacy `memory.db` (~230MB) — STM/MTM/LTM split, importance scoring, daily/weekly/monthly consolidation cycles, quarantine, research-watch. A SEPARATE consolidation system from the FSRS cold-store subconscious — this governs the SQLite `memory.db`, the relocator governs the `.md` cold store. Both live.
- **Trigger:** `spawnSync` from `memory-session-write` (SessionEnd); health-polled by `yuri-health` + `launch-readiness-check`; CLI.
- **Reads/Writes:** `_SYSTEM/OS_KERNEL/memory.db`.
- **← Called by** `memory-session-write`, `yuri-health`, `launch-readiness-check`, `yuri-canonical-memory-import`.
- **Phantom corrected:** its OLD session-boot RAG recall-injector role is SUPERSEDED (user-prompt-submit.js confirms the governor RAG spawn — which read memory.db directly, a Memory/Search wall violation — was replaced by the L5b yuri-recall path). Its lifecycle/health/SessionEnd-write role remains LIVE.

### memory-session-write (SessionEnd episodic capture)
- **Files:** `_SYSTEM/Scripts/memory-session-write.mjs`
- **Purpose:** reads the last sentinel learning-session observation and writes it as episodic Track-A memory via `memory_governor.py`; opportunistically triggers weekly consolidation if last run >7d old.
- **Trigger:** settings.json Stop/SessionEnd hook (**L292**). **Reads:** `.claude/yuri-sentinel/learning/sessions/<date>.jsonl`. **Writes:** `memory.db` via governor. **Calls →** `memory-governor`.

### memory-evict / memory-archive (SUPERSEDED legacy relics)
- **Files:** `_SYSTEM/Scripts/memory-evict.mjs` · `_SYSTEM/Scripts/memory-archive.mjs`
- **Purpose:** the original two crude forgetting paths — evict = atime-LRU over `memory/patterns/*.md`; archive = mtime+flag move with NO recall path. Both replaced by `memory-relocator`.
- **PHANTOM/DORMANT:** **No live trigger** — no launchagent, no hook, no spawn. Grep confirms zero live callers; the only references are a COMMENT in control-server (L136) and a knob-name `evict.ttlDays` in energy-config — neither spawns the script. The atime-LRU signal was the exact bug `memory-usage.mjs` was built to fix. Do not treat these as the live forgetting path.

---

## Layer 3 — Retrieval & Knowledge

On-demand corpus search + the two-track recall surfaces + the evidence-contract grammar. **Key live truth:** the search corpus holds **38,742 docs** (verified `SELECT COUNT(*)`) — the "~26k docs" header comments in `yuri-search.mjs` and the `ai` facade are STALE. Indexing is operator-driven (manual `ai reindex`), NOT automatic; only the Track-B memory index self-heals on boot.

### Corpus Search Engine (yuri-search)
- **Files:** `_SYSTEM/Scripts/yuri-search.mjs`
- **Purpose:** on-demand FTS5/BM25 query over the ~38.7k-doc corpus; returns path+snippet ranked by bm25, never auto-injected.
- **Trigger:** CLI only — `ai search "<q>"`. Never auto-fired by any hook/cron.
- **Reads:** `_SYSTEM/OS_KERNEL/search-index.db`. **← Called by** `ai` (search|find).
- **Node:** exports `buildMatch()` — the "Injection-Hardened buildMatch" — quotes every term (OR-of-quoted-terms) so raw user input can never inject FTS5 operators.
- **Phantom corrected:** header "~26k docs" is STALE; live count is **38742**.

### Corpus Indexer (yuri-search-index)
- **Files:** `_SYSTEM/Scripts/yuri-search-index.mjs`
- **Purpose:** builds/refreshes `search-index.db` — walks 8 corpus roots, incremental by mtime, Porter+unicode61 FTS5, WAL, prunes deleted files.
- **Trigger:** CLI only — `ai reindex` / `ai search-index [--full]`. **MANUAL.** Verified: no SessionStart hook, no LaunchAgent, no cron.
- **Reads:** filesystem (00_COMMAND-CENTER, _SYSTEM, skills, 01_PROJECTS, 02_RESOURCES, 03_NEXUS-LINK, 04_ARCHIVE, .claude/rules) + prior mtimes. **Writes:** `search-index.db`.
- **Calls →** `lane-kernel` (isProtectedPath — defense-in-depth index exclusion).
- **Nodes:** "Incremental mtime Indexing + WAL" + "Protected-Path Index Exclusion." The `EXCLUDE_SUBSTR` list + `isProtectedPath` mean the search corpus literally cannot index `.env`/`.claude/state`/`memory.db` — enforcing the **Memory/Search Wall** (`search-index.db`, `memory.db`, `semantic-memory.db` all in EXCLUDE_SUBSTR).

### Subconscious Cold-Store Recall (yuri-recall) — *same organ as Layer 2's yuri-recall*
- This is the cold-tier retrieval surface; see Layer 2 `yuri-recall` for full wiring. Nodes here: "Spreading-Activation Recall" (inbound-crosslink bonus), "Recency+Salience+Crosslink Blending," "Cue-Match Over-Fetch" (queryCold over-fetches topK×4 for re-rank headroom). Currently NASCENT — cold.db ~empty, usage ledger not yet created.

### Cold Store (memory-cold-store) — *same organ as Layer 2's cold store*
- Retrieval-layer node: "Cold-Store BM25+metadata." Own inlined `buildMatch` (word-token regex variant) deliberately decoupled from yuri-search to stay a foundational module with no CLI coupling.

### Context Router (symbolic trigger-scoring)
- **Files:** `_SYSTEM/Scripts/context-router.mjs`
- **Purpose:** scores each registry packet by counting literal trigger substrings in the task text; returns the top context packet + read-order + protected paths. The pre-broad-work selector CLAUDE.md mandates. Pure substring-count (no embeddings) → fully auditable.
- **Trigger:** CLI — run before broad exploration; **NOT a boot hook** (the model/operator runs it on demand).
- **Reads:** `_SYSTEM/context/context-registry.json`.
- **Fragility (not a phantom):** uses `process.cwd()` as REPO root, so it must run from repo root or registry resolution fails.

### Track-A Warm Memory Recall (memory-kernel recallMemory)
- **Files:** `_SYSTEM/Scripts/memory-kernel.mjs`
- **Purpose:** recall over the WARM canonical store (`_SYSTEM/memory/*.md|json|txt`) — tokenize query, score each file with a resolvable scorer (lexical default), return top-K with sha256 provenance. Distinct from the cold-store FTS5 recall. Nodes: "Three-Tier Classification," "Scope Gates + Origin-Lane Authority," "Lexical Fallback Scorer."
- **Trigger:** CLI `recall <query>`; recall-before-dispatch policy. **Calls →** `lane-kernel`. **Reads:** `_SYSTEM/memory/`.
- **Two-tier note:** warm recall (lexical over files) here vs cold recall (`yuri-recall` over `memory-cold.db`). Two retrieval organs, two tiers — do not conflate.

### Evidence Contract Validator (yuri-evidence-contract) vs Required-Evidence Resolver (evidence-contract) — NAME COLLISION
- **Validator** (`yuri-evidence-contract.mjs`): validates a swarm artifact dir contains the required deterministic grammar (TERM_COUNT / FILE_COUNT / MATCH regex) before PASS. Exit 1 on missing/invented/empty verdict. The 3 `REQUIRED_EVIDENCE_PATTERNS` regexes are the literal grammar from yuri-origin.md. **Trigger:** CLI on `<artifact_dir>`.
- **Resolver** (`evidence-contract.mjs`): maps a task string → required evidence-source IDs (Shintai base + memory/RAG set on regex match + cyber set on security regex). Pure function, no I/O. **Trigger:** import — `requiredEvidenceIdsForTask(task)`. **← Called by** `memory-kernel`.
- **Hazard:** these are TWO different organs with near-identical names. Do not merge.

### Research Capture + Provenance · ai CLI Facade
- **Research Capture** (`yuri-research-capture.mjs` + `.py`): captures online research into the local compounding corpus — inits an archive dir, writes a manifest + source registry with provenance, fetches sources. **Writes** `02_RESOURCES/research/<topic>-<date>.md`. The captured .md becomes searchable ONLY after a manual `ai reindex` — capture→corpus is NOT automatic.
- **ai CLI Facade** (`_SYSTEM/Scripts/ai`): the single bash dispatcher — `ai search|find → yuri-search`, `ai reindex|search-index → yuri-search-index`, `ai triage|research → run_triage`. The layer's true ingress. Exec-style (replaces process), pure routing. **Calls →** `yuri-search`, `yuri-search-index`. (Same stale "~26k docs" comment.)

### Cross-Domain Transfer Engine — PHANTOM (claimed in CLAUDE.md, not built)
- **Files:** none.
- **Claimed:** CLAUDE.md says "Problem-solving → the cross-domain transfer engine (mechanism-tagged cross-reference over the FTS5 corpus)." **PHANTOM.** grep for `mechanism-tag` / `cross-domain transfer` / `transfer engine` / `crossReference` across `_SYSTEM/Scripts` + skills returns ZERO implementing module (only prose mentions in offload-contract/weekly-comp). In YURI memory it is `PROJ:CROSS-DOMAIN-TRANSFER-ENGINE` — an explicit *future build*, not shipped code. The nearest real surface is the `failure-evolution-loop` skill (markdown + failure-taxonomy.yaml — the "Cross-Reference Failure Taxonomy" node), a skill spec, not a running engine. The corpus search (`yuri-search`) exists; the mechanism-tagged transfer layer on top of it does not. The phantom is the CLAUDE.md adapter claim.

---

## Layer 4 — Governance & Safety

The fail-closed deterministic spine. **Live truth:** the real first line of defense is the *deterministic* PreToolUse guards (bash-security-guard etc.), NOT `pre-tool-gate` — that one is registered async so despite being listed first it does not gate the chain. `agent-spawn-guard` is OBSERVABILITY-ONLY since 2026-05-30 (old hard-deny removed).

### bash-security-guard (primary Bash deny gate)
- **Files:** `.claude/hooks/bash-security-guard.js`
- **Purpose:** the primary deterministic floor — DENIES `.env` read/write/mutate/remove, sensitive `.claude` file reads, broad `.claude` destruction/git-rm/git-add, download-execute (HI-12) curl|bash chains, mkfs, shell-wrapper inline-exec, coworker push/remote/role-path mutation. Intra-repo `.env` mirror exemption.
- **Trigger:** PreToolUse hook (all-tools matcher, filters to Bash internally), **2nd in chain**.
- **Reads:** `_SYSTEM/SELF/dev-credential.json` (existence → fail-closed role), `/tmp/yuri-session-packet-<sid>.json` (tier). **Writes:** `~/.yuri-audit.log` on deny. **Calls →** `yuri-operator` (resolveRole).

### operator-write-guard (tool-agnostic trust-surface guard)
- **Files:** `.claude/hooks/operator-write-guard.js`
- **Purpose:** defense-in-depth — denies coworker-role Write/Edit/MultiEdit/NotebookEdit onto the guard/role/credential trust surface (dev-credential.json, yuri-operator.cjs, AND every enforcement hook incl. itself). Closes the gap that bash-security-guard only inspects Bash. Case-insensitive (APFS) + symlink-realpath ancestor-climb canonicalization, fail-closed.
- **Trigger:** PreToolUse hook (filters to mutating tools), **3rd in chain**.
- **Reads:** dev-credential.json, on-disk realpath of write target. **Writes:** `~/.yuri-audit.log`. **Calls →** `yuri-operator`.

### yuri-operator (two-role resolver + scrypt credential)
- **Files:** `_SYSTEM/Scripts/yuri-operator.cjs`
- **Purpose:** the dev/coworker role trust root. Owner passphrase in `YURI_DEV_KEY` scrypt-verified (N=16384,r=8,p=1, timingSafeEqual). Broken-module-plus-existing-creds treated as a TAMPERING signal (not an error) → fail-closed to coworker.
- **Trigger:** `require` — `resolveRole` by both write/bash guards. **Reads:** `_SYSTEM/SELF/dev-credential.json`. **← Called by** `bash-security-guard`, `operator-write-guard`.

### tirith-url-guard · claude-protocol-guard · yuri-risk-lite · lane-kernel
- **tirith-url-guard** (`.claude/hooks/tirith-url-guard.js`): extracts URLs from a Bash command, scores each via `~/.hermes/bin/tirith`; MEDIUM/HIGH/CRITICAL → `permissionDecision='ask'`. Missing binary → silent allow unless `TIRITH_FAIL_LOUD=1`. PreToolUse hook (Bash). **Calls →** tirith.
- **claude-protocol-guard** (`.claude/hooks/claude-protocol-guard.mjs`): the routing/control-plane gate — reads `session-state.json` for `plan_dispatch_gate`; control-file list single-sourced from `lane-kernel`. Emits WARN for missing-control-packet / missing-codex-task-spec / missing-route-plan-evidence / post-plan-dispatch-required. WRITES state (sets `plan_dispatch_gate.satisfied` / increments warn_count). On critical-tier packet upgrades WARN→DENY. `YURI_SPRINT_MODE=1` suppresses. PreToolUse **5th in chain**. **Calls →** `session-state`, `lane-kernel`.
- **yuri-risk-lite** (`.claude/hooks/yuri-risk-lite.js`): regex catastrophe scanner — DENIES the `deny:true` set (mkfs, raw /dev/sd* write, DROP DATABASE); everything else (rm -rf, force-push, DROP TABLE, curl|bash) is a visible advisory. PreToolUse **8th** (Bash); also exported as a module to scout-orchestrator.
- **lane-kernel** (`_SYSTEM/Scripts/lane-kernel.mjs`): the protected-surface + control-file source — `isProtectedPath` / `safeRuntimePath` / `CONTROL_FILE_PREFIXES`. Imported by the protocol guard, memory-kernel, and the indexer. **← Called by** `claude-protocol-guard`, `memory-kernel`, `memory-proposal-autopilot`, `yuri-search-index`, `memory-kernel-recall`.

---

## Layer 5 — Cognition & Persona

The brain that loads at boot + the per-turn volatile state. **Critical wiring truth: the brain is loaded TWICE by DIFFERENT mechanisms, intentionally.** (1) the STABLE identity (yuri-origin + SOUL + persona) comes from the harness's NATIVE `@-include` of CLAUDE.md and fires with NO hook; (2) `brain-inject.js` re-extracts the same 9 SOUL.md persona headings PLUS all volatile state. If every SessionStart hook failed, the identity still loads — only live state would be missing.

### brain-inject (unified boot brain composer)
- **Files:** `.claude/hooks/brain-inject.js`
- **Purpose:** THE brain composer — reads ~14 sources and emits one `<yuri-brain>` block: Zone-A stable core (identity/hardware/learned-rules/memory) + Zone-C volatile footer (session/lane-health/gate/cortex/fingerprint/geass).
- **Trigger:** SessionStart hook (settings.json **L112**, SYNC).
- **Reads (~14):** SOUL.md (9 persona-rule headings), `identity-hash.md`, `neuro-core.md`, `energy-weights.json` (recall.consciousSetCap → working-mem cap, fail-closed 12), `MEMORY.md` (FSRS-retrievability ordered on overflow), `.claude/yuri-sentinel/learning/global.md`, `cortex-state.json`, `lane-health-status.json`, `launch-gate.json`, `roadmap-state.json`, `neuron-loop.log`, `fingerprint.json`, `geass/active-lock.json`. **Writes:** none.
- **Calls →** `fsrs` (FSRS-retrievability ordering on the 12-row memory overflow).

### soul-persona-inject (SubagentStart persona)
- **Files:** `.claude/hooks/soul-persona-inject.js`
- **Purpose:** injects the SOUL persona contract into subagent context.
- **Trigger:** **SubagentStart** hook (settings.json **L154**) — verified, **NOT** SessionStart. The SessionStart persona load moved into `brain-inject`'s `[identity]` section (same 9 SOUL.md headings).
- **Reads:** SOUL.md (9 headings).
- **Phantom corrected:** the old map placed this on SessionStart; it is on SubagentStart now.

### cortex-state · fingerprint · persona.md/SOUL.md (native identity)
- **cortex-state** (`.claude/state/cortex-state.json`): accumulated cross-turn risk + PDC priors — read by brain-inject, written by pulse/risk surfaces.
- **fingerprint** (`.claude/yuri-sentinel/self-model/fingerprint.json`): L2/L3 behavioral fingerprint + drives — read by brain-inject, written by the sentinel self-model.
- **persona.md / SOUL.md / yuri-origin.md**: the native `@-include` identity — loaded by the harness reading CLAUDE.md, NO hook fires. This is the stable identity the whole persona layer rests on.

---

## Layer 6 — Learning & Continuity

Self-improvement + reflection + the event bus. **Phantom corrected:** `neuron-loop` is HEALTHY (not 0-invocations) — driven by a real launchd agent verified on disk.

### Neuron-Loop (9-phase self-synthesis)
- **Files:** `_SYSTEM/Scripts/neuron-loop.mjs` (16.9KB) + `~/Library/LaunchAgents/com.yuri-os-musubi.neuron-loop.plist`
- **Purpose:** the self-improvement loop — writes its last run to `neuron-loop.log`, which `brain-inject` reads into the NEURON_LOOP boot section.
- **Trigger:** launchd agent. **VERIFIED:** plist EXISTS on disk (1705 bytes, May 29). **Writes:** `.claude/state/neuron-loop.log`. Edge confirmed both directions (launchd → neuron-loop.mjs → log → brain-inject reads it).
- **Phantom corrected:** "0-invocations" was the old lie; the agent is real and the log is the boot input.

### kagami-event-bus · yuri-dream · session-reflect · yuri-health
- **kagami-event-bus** (`kagami-event-bus.mjs`): `appendKagamiEvent` on memory promote etc. **← Called by** `memory-kernel`.
- **yuri-dream** (`.claude/hooks/yuri-dream.js`): the Dream-Processor — mines corrections → learned rules in `global.md`. Stop hook (settings.json **L301**).
- **session-reflect** (`.claude/hooks/session-reflect.js`): reflection — Stop hook (**L305**) + spawned mid-session by `pre-tool-use` at compaction tier 4.
- **yuri-health** (`yuri-health.mjs`): lane/launch health monitor. **Calls →** `memory-governor`, `energy-obs-health`.

---

## Layer 7 — Skills & Orchestration

Skill discovery + lane routing. **Phantom corrected (naming lie):** the hook literally named `startup-offload.js` has ZERO offload/dispatch code — it is purely a skills-frontmatter indexer. The "offload-runner is ACTIVE" correction is about a DIFFERENT organ. Don't conflate them by name.

### startup-offload (MISNOMER — skills indexer)
- **Files:** `.claude/hooks/startup-offload.js`
- **Purpose:** scans `.claude/skills/*/SKILL.md` frontmatter (name+description) and emits a `<startup-index>` "Skills (N)" list so the session knows the roster without re-reading SKILL.md files.
- **Trigger:** SessionStart hook (settings.json **L121**, async).
- **Reads:** skill frontmatter only. **Writes:** none.
- **VERIFIED:** grep for `spawn|exec|runner|route|dispatch|offload` returns NOTHING; it only emits `<startup-index>` (line 15). **It does NOT run the offload-runner.**

### offload-contract · scout-orchestrator · shintai-dispatch · offload-runner
- **offload-contract** (`offload-contract.mjs`): the single lane/scenario/lifecycle routing contract per yuri-origin.md. Import.
- **scout-orchestrator** (`.claude/hooks/scout-orchestrator.js`): event-driven scout dispatch — on SessionStart inits the scout bus + trims errors; ALSO wired on PreToolUse (inject findings) + PostToolUse (spawn background scouts), dispatched by payload shape. Gated off by `YURI_DISABLE_SCOUTS=1`. **Calls →** `yuri-risk-lite`. **Writes:** `scout-bus.json`.
- **shintai-dispatch** (`shintai-dispatch.mjs`): SEAL-team (Shintai 神隊) task-sized roster dispatch. Fires `energy-dispatch-bridge` (L1165) when run. **Calls →** `energy-dispatch-bridge`.
- **offload-runner** (`offload-runner.mjs`): the legacy dispatch path — ACTIVE (not dormant): fires `energy-dispatch-bridge` (L177) when run. **Calls →** `energy-dispatch-bridge`. (This is the real "offload-runner is ACTIVE" organ — NOT the misnamed boot hook above.)

---

## Layer 8 — Token-Efficiency & Session

The token/compaction + session-lifecycle machinery. The canonical lifecycle file `.claude/state/session-state.json` is mediated by `session-state.js` and written by the hooks via `node fs` directly — even though the settings deny-list blocks the Read/Write/Edit *tools* on that path (the deny-list governs Claude's tools, not the hook subprocesses).

### token-session-init (boot token tracking + tokenmaxxing)
- **Files:** `.claude/hooks/token-session-init.js`
- **Purpose:** reads git branch; writes the session token files; (guarded — skips if an active root session <4h old) writes `session-state.json`. Greps `tokenmaxxing/SKILL.md "## Rules"` and INJECTS "⚡ TOKENMAXXING ACTIVE" + those rules.
- **Trigger:** SessionStart hook (settings.json **L108**, SYNC).
- **Writes:** `/tmp/claude-session-<id>.json`, `token-session.json`, `token-weekly.json`, `session-state.json`.

### pre-tool-use · post-tool-use · token-tool-logger · token-ledger · token-budget-check · session-state · memory-bus · session-checkpoint
- **pre-tool-use** (`.claude/hooks/pre-tool-use.js`): token/compaction + cross-terminal — reads `session-state.json` (context.pct) + the memory bus + MEMORY.md; emits `/compact` hints by 5-tier ladder; tier 4 SPAWNS `session-reflect --mid-session` (detached); on another session's bus write injects a cross-terminal update. WRITES `compact_history`, `context.tier`, bus cursor. PreToolUse **6th**. **Calls →** `session-state`, `memory-bus`, `session-reflect`.
- **post-tool-use** (`.claude/hooks/post-tool-use.js`): the main bookkeeper — WRITES `session-state.json` (tools_used, errors, files_written, skills_read/written); on a memory-file write pushes to the memory bus; on a design-file write appends design-memory; **on ExitPlanMode ARMS `plan_dispatch_gate`** (the gate claude-protocol-guard reads next turn). PostToolUse **1st (A)**. **Calls →** `session-state`, `memory-bus`.
- **token-tool-logger** (`.claude/hooks/token-tool-logger.js`): reads `/tmp/claude-current-session`, pushes `{tool,estimate,time}` + increments `estimatedTokens` (Agent 8000, Read 800…), then SPAWNS `token-ledger.mjs write` detached. PostToolUse **(C)**. **Calls →** `token-ledger`.
- **token-ledger** (`token-ledger.mjs`): the crypto-chained privacy-hashed token ledger. **← Called by** token-tool-logger.
- **token-budget-check** (`.claude/hooks/token-budget-check.js`): ≥80k WARN / ≥150k CRITICAL advisory. PreToolUse **9th**. Reads `/tmp/claude-current-session`.
- **session-state** (`.claude/hooks/session-state.js`): the canonical lifecycle-file mediator. **← Called by** pre-tool-use, post-tool-use, claude-protocol-guard, musubi-protocol-enforce, session-checkpoint, token-session-init.
- **memory-bus** (`.claude/hooks/memory-bus.js`): cross-terminal session cursor (`.claude/memory-bus.json`).
- **session-checkpoint** (`.claude/hooks/session-checkpoint.js`): periodic snapshot. PostToolUse **(D)**. **Calls →** `session-state`.

---

## Layer 9 — Hidden / Meta / Self-referential

The glue hooks + the cross-cutting boot/per-turn organs.

- **pre-tool-gate** (`.claude/hooks/pre-tool-gate.js`): local-first advisory — on a large Read or broad Bash emits an additionalContext route-to-deepseek-flash advisory. **PreToolUse 1st but ASYNC — does NOT gate the chain** (the deterministic guards are the real first line). Always `continue:true`. Writes nothing.
- **musubi-protocol-enforce** (`.claude/hooks/musubi-protocol-enforce.js`): AEONIC soft compliance, 60s-throttled — warns on >3 direct writes with 0 Agent dispatches, or Agent-with-no-skill. WRITES `aeonic.lastEnforceAt`. PreToolUse **7th**. **Calls →** `session-state`.
- **musubi-protocol-ingest** (`.claude/hooks/musubi-protocol-ingest.js`): SessionStart (**L116**) — reads `_SYSTEM/MUSUBI_PROTOCOL.md` (legacy shim, 872 bytes, the 3 sections CORE_DIRECTIVES/GLOBAL_OFFLOAD_DIRECTIVE/ROLE_MATRIX), writes `state.aeonic.sections`, emits `<musubi-protocol>`. **Calls →** `session-state`.
- **user-prompt-submit** (`.claude/hooks/user-prompt-submit.js`): per-turn volatile re-inject (UserPromptSubmit, <50ms exit) — consumes the prior council `brain-stale.sentinel` → `<brain-update>`; consumes the one-turn-lagged subconscious recall envelope + spawns THIS turn's detached recall; skill-auto-trigger + design-master context on matched verbs; HANDOFF_TRIGGERS → EOT. RETIRED in code: `PULSE_ORCHESTRATOR_RETIRED=true`, PATCH-040 memory.db RAG (Memory/Search wall violation), and the old governor RAG spawn that targeted a non-existent `<repo>/Scripts/pulse-orchestrator.mjs`. Never blocks. **Calls →** `yuri-recall`.
- **eot-background-start** (`.claude/hooks/eot-background-start.js`): SessionStart (**L131**) — writes `/tmp/claude-eot-<sid>.marker`, emits "🔄 EOT monitoring active." Arms the continuous-reflection EOT engine; actual handoff-intent detection happens later in user-prompt-submit.
- **agent-spawn-guard** (`.claude/hooks/agent-spawn-guard.js`): PreToolUse matcher=Agent — **OBSERVABILITY-ONLY since 2026-05-30** (old hard deny removed): logs subagent_type/model to stderr, always allows.
- **gitnexus-hook** (`~/.claude/hooks/gitnexus/gitnexus-hook.cjs`): PreToolUse matcher=Grep|Glob|Bash — global hook, enriches with graph context (10ms timeout).
- **artifact-registry** (`artifact-registry.mjs`): `isProtectedPath` / `normalizeRepoPath` / `loadArtifactRegistry`. **← Called by** `claim-integrity-gate`.
- **yuri-user** (`yuri-user.mjs`): `currentUserHandle` for trace attribution. **← Called by** `energy-tick-core`, `energy-dispatch-bridge`.

---

## Cross-Layer Circuits (the end-to-end flows)

### Circuit A — END-TO-END TOOL-CALL (live, verified 2026-06-03)
A single tool call fires **PreToolUse → tool → PostToolUse**. The energy gate is a **trailing PDP/PEP split**: the DECISION is computed PostToolUse by `energy-tick` (PDP) and persisted as breaker state in the per-session snapshot; the ENFORCEMENT read happens on the NEXT call's PreToolUse by `energy-enforce` (PEP). **The energy gate never blocks the call it measures — only the call AFTER a catastrophic one.**

**PreToolUse runs 9 hooks IN SETTINGS-ARRAY ORDER** (verified against settings.json L163–206). Array order IS execution order:
1. `pre-tool-gate` (async, non-blocking — local-first advisory).
2. `bash-security-guard` (Bash — primary deterministic deny floor). **The real first line of defense.**
3. `operator-write-guard` (mutating tools — trust-surface deny).
4. `tirith-url-guard` (Bash — URL threat → ask).
5. `claude-protocol-guard` (routing/control-plane gate; arms/reads `plan_dispatch_gate`; WARN→DENY on critical tier).
6. `pre-tool-use` (token/compaction + cross-terminal; spawns mid-session reflect at tier 4).
7. `musubi-protocol-enforce` (AEONIC soft compliance, throttled).
8. `yuri-risk-lite` (catastrophe regex — DENY mkfs/raw-dev/DROP DATABASE; advise the rest).
9. `token-budget-check` (budget WARN/CRITICAL).
10. **`energy-enforce` (LAST — energy PEP/circuit-breaker).** Then matcher block 2 `gitnexus-hook` (Grep|Glob|Bash), matcher block 3 `agent-spawn-guard` (Agent, observability-only).

Any one of hooks 2–10 can DENY via `permissionDecision='deny'`. If none deny → **TOOL EXECUTES**.

**PostToolUse runs 5 hooks (all async)** (settings.json L233–259):
- A `post-tool-use` (main bookkeeper — writes session-state; ARMS plan_dispatch_gate on ExitPlanMode).
- B `scout-orchestrator` (background scout dispatch).
- C `token-tool-logger` (per-tool estimate; spawns `token-ledger` detached).
- D `session-checkpoint` (periodic snapshot).
- E **`energy-tick` (LAST — energy PDP).** classifyTransition → salience tier (SKIP reads = no math; WORK = successful edit/bash; CRITICAL = protected-path hit or failed mutation) → applyTransition builds before/after state → `gateProposal` computes ΔU → `traceGateEvaluation` appends one JSONL record to `energy-trace/<date>.jsonl` → `verdictFromStates` → `transitionOnVerdict` advances the breaker (catastrophic veto → OPEN) → PERSISTS `{state,depth,recentAbs,breaker}` to the snapshot, which `energy-enforce` reads on the NEXT call. **END OF CIRCUIT.**

**Shared state organs touched across the circuit:** (1) `.claude/state/session-state.json` via `session-state.js`; (2) `.claude/memory-bus.json` (cross-terminal); (3) `/tmp/claude-current-session` (token file); (4) `_SYSTEM/state/energy-session/<sid>.json` (the PDP→PEP handoff snapshot); (5) `_SYSTEM/state/energy-trace/<date>.jsonl` (append-only ΔU log); (6) `~/.yuri-audit.log` (deny log); (7) `/tmp/yuri-session-packet-<sid>.json` (tier source).

**Crosses layers:** safety-gates · routing/control-plane · energy/work-dynamics · memory (bus, MEMORY.md, reflect-spawn) · token-ops · claim-cortex (built but UNWIRED) · gitnexus · operator-role.

### Circuit B — SESSION BOOT (verified, live)
Boot is a **two-layer load**: (1) the harness's NATIVE `@-include` of CLAUDE.md inlines the stable identity (`yuri-origin.md` + `SOUL.md` + `persona.md`) — **no hook fires**; (2) a **7-script SessionStart hook chain** (settings.json L98–131) injects VOLATILE state as `additionalContext`. Each hook prints `{hookSpecificOutput:{hookEventName:'SessionStart',additionalContext}}`; the harness concatenates all after the native CLAUDE.md load.

SessionStart chain in array order:
1. `claude-memory-write.mjs reindex` (Track-B MEMORY.md self-heal).
2. `token-session-init.js` (token tracking + tokenmaxxing rules).
3. `brain-inject.js` (THE brain composer — ~14 state files → `<yuri-brain>`).
4. `musubi-protocol-ingest.js` (AEONIC role-matrix/offload-directive → `<musubi-protocol>`).
5. `startup-offload.js` (MISNOMER — skills-frontmatter indexer → `<startup-index>`).
6. `scout-orchestrator.js` (inits scout bus).
7. `eot-background-start.js` (arms EOT monitor).

**Per-task (NOT a boot hook):** `context-router.mjs` — CLAUDE.md instructs running it before broad work; scores `context-registry.json` packets by trigger overlap. No hook auto-fires it.

**Per-turn:** `user-prompt-submit.js` (UserPromptSubmit) re-injects volatile deltas (brain:stale council update, one-turn-lagged subconscious recall, skill-auto-trigger hints, EOT handoff detection).

**Crosses layers:** Search/Memory (MEMORY.md, reindex, context packets) · Cognition & Persona (SOUL rules, cortex risk, fingerprint, neuron-loop baseline, learned rules, geass-lock, roadmap) · Skills/Routing (skills indexer, context-router, role-matrix) · Token/Context (token-session-init, Zone-A/Zone-C split, session-state lifecycle) · Orchestration/Hooks (the 7-script chain, scout bus, brain-inject, soul-persona-inject→SubagentStart, eot, per-turn re-inject).

### Circuit C — SESSION END / forgetting (the two consolidation systems)
On **Stop/SessionEnd** (settings.json L276–305): `yuri-sentinel-stop`, `token-session-end`, `token-status`, `yuri-dream` (mistakes→rules), `session-reflect`, and `memory-session-write` (**L292** — episodic capture → `memory_governor.py` → `memory.db`, + weekly consolidation if >7d).

Separately, the **subconscious forgetting loop** runs on a launchd schedule (NOT at session end): `kagami-memory-consolidator` (daily 06:00) → `runSubconsciousPass` → FSRS demote-plan via `memory-relocator` → (would) upsert into `memory-cold.db` + move source to `relocated/` + tombstone in `relocation-index.json`. **Runs DRY-RUN — neither plist sets `--execute`** → only reports candidates. Two parallel consolidation systems: `memory_governor.py` governs the SQLite `memory.db`; the relocator governs the `.md` cold store.

---

## Phantoms Corrected (trust only live code)

1. **claim-cortex feeds the 4 dark energy terms — FALSE in the live circuit.** `claim-cortex.mjs` exists (36KB) and is fully built/tested, but grep across `.claude/` + `_SYSTEM/Scripts` returns ONLY `claim-cortex.test.mjs` — **zero hook/settings wiring**. Its own header: "an additive OBSERVABILITY sensor with no live consumer of its veto." So in the live tick path the 4 terms (alpha/beta/epsilon/zeta) + theta floor are STILL STARVED. The energy gate exercises only ~5 of 11 terms from real work today. Wiring claim-cortex into PostToolUse is the missing edge.
2. **energy gate is "research/fixture-ready, not runtime-tested" — STALE.** It IS the live runtime gate. The enforce FLAG FILE `_SYSTEM/state/energy-enforce.enabled` EXISTS (0 bytes, 16:51, matching commit `3371c378`). Enforcement is ARMED locally via the flag path even though the env var is empty. The shipped default stays OFF (gitignored flag) — enabling is a deliberate local act.
3. **neuron-loop "0-invocations" — FALSE.** The launchd agent `~/Library/LaunchAgents/com.yuri-os-musubi.neuron-loop.plist` EXISTS (1705 bytes). It writes `neuron-loop.log` which `brain-inject` reads. HEALTHY, edge confirmed both directions.
4. **offload-runner "dormant" — FALSE (and a naming trap).** `offload-runner.mjs` is ACTIVE (fires `energy-dispatch-bridge` L177 when run). But the hook literally named `startup-offload.js` is a DIFFERENT organ — it has ZERO offload code (grep returns nothing), it is a skills-frontmatter indexer. Do not conflate them.
5. **anime-DNA / agent-spawn-guard.** `agent-spawn-guard` is OBSERVABILITY-ONLY since 2026-05-30 (old hard-deny removed) — agents ARE allowed. The anime-DNA auto-fire retirement is intentional, not a bug.
6. **soul-persona-inject is on SubagentStart, NOT SessionStart** (settings.json L154). The SessionStart persona load moved into `brain-inject`'s `[identity]` section.
7. **search corpus "~26k docs" — STALE.** Live count = **38,742** (`SELECT COUNT(*) FROM docs`). The header comments in `yuri-search.mjs` + the `ai` facade are wrong; the spectrum doc's ~38k is right.
8. **memory_governor RAG boot-injector role — SUPERSEDED.** The governor RAG spawn (which read `memory.db` directly, a Memory/Search wall violation) was replaced by the L5b `yuri-recall` path. The governor's lifecycle/health/SessionEnd-write role remains live.
9. **memory-evict / memory-archive — DORMANT relics.** No live trigger; superseded by `memory-relocator`. Surviving references are a comment + a config knob-name, not execution.
10. **Cross-Domain Transfer Engine — PHANTOM.** Claimed live in CLAUDE.md; no implementing module exists. It is a future build (`PROJ:CROSS-DOMAIN-TRANSFER-ENGINE`). The CLAUDE.md adapter claim overstates current reality.
11. **fsrs does NOT import yuri-energy.** The grep hit was a docstring style-mention, not a code import. Its real downstream is `memory-relocator`.
12. **`pre-tool-gate` does not gate the chain.** It is registered async, so despite being listed first it is non-blocking — the deterministic guards (bash-security-guard etc.) are the real first line.
13. **"protected" `.claude/state/` is hook-writable by design.** The settings deny-list blocks Claude's Read/Write/Edit *tools* on that path, but the hook subprocesses write it via `node fs` directly — the deny-list governs the model's tools, not the hooks.

---

## Top overview insights (the wiring facts a human needs)

- **Two heaviest live circuits, both wired through `.claude/settings.json` hook arrays where array order = execution order:** the per-tool-call gate chain (9 PreToolUse + 5 PostToolUse hooks) and the session-boot load (native @-include + 7 SessionStart hooks).
- **The energy gate is a trailing PDP/PEP split:** PostToolUse `energy-tick` decides + persists breaker state; PreToolUse `energy-enforce` on the NEXT call enforces. It can only fail-fast the call AFTER a catastrophic one — never the call it measures.
- **The single biggest dark edge:** `claim-cortex.mjs` is the organ that WOULD light the 4 starved energy terms, but it has zero live consumer. Wiring it into PostToolUse is the one missing wire that would take the gate from 5/11 to 11/11 live terms.
- **The subconscious is wired end-to-end but empty by design:** cold store = 0 rows, relocation-index = empty, usage ledger not yet created. Everything is live code waiting on the operator's `--execute` flip (the T4 MOAT activation).
- **The brain loads twice on purpose** — native @-include (identity, hook-independent) + brain-inject (identity re-extract + all volatile state). Identity survives total hook failure.
- **Two parallel memory consolidation systems coexist:** `memory_governor.py` over the SQLite `memory.db`, and the FSRS relocator over the `.md` cold store. Both live, governing different stores.
- **Generated:** 83 nodes / 153 edges (77 calls, 31 reads, 45 writes) across all 9 layers. Graph feed: `02_RESOURCES/research/yuri-circuitry-graph.json`.
