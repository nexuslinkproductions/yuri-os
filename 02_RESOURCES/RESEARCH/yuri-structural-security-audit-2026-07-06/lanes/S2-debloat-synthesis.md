# S2: De-bloat / Consolidation Synthesis — Fable-5 Mastermind Cut
**Date:** 2026-07-06
**Method:** Read H1/H2/H4/H5/S1 lane reports, then re-verified every candidate directly against code
(grep live-ref counts excluding worktrees/archive/jsonl noise, file reads, settings.json hook parse).
Several sibling-lane hypotheses did not survive contact with the code — noted explicitly below, because
an unverified de-bloat claim is worse than no claim.

---

## Corrections to sibling-lane claims (verified false or unresolved)

- **`gate-rerank.mjs` and `multi-horizon-gate.mjs` (H1 "isolated gate" candidates) DO NOT EXIST as files.**
  `find`/`ls` confirm no such scripts in `_SYSTEM/Scripts`. H1's own grep evidence was a guess, not a hit — drop both from any cut list.
- **`nano-compact-gate.mjs` and `spreading-activation-gate.mjs` (H1 "uncertain orphans") are LIVE, not dead.**
  `nano-compact-gate.mjs` is imported by `cost-reservation-pool.mjs` and `nano-tick.mjs` (both live nano-swarm plumbing) plus has its own test file. `spreading-activation-gate.mjs` shows up in `yuri-knowledge-graph.json` and an active `energy-session/*.json` snapshot — it's wired into the live knowledge-graph/energy path, not isolated. **KEEP both, remove from the cut list.**
- **The 3 memory "bridge/consolidator" scripts (H1 Tier-1 candidate #3) are NOT redundant — they are three non-overlapping seams, confirmed by reading all three headers:**
  - `memory-kernel-canonical-bridge.mjs` — Track-A ledger (operator-approved facts only) → canonical store. Read-only on the governed pipeline, idempotent, called from `mcs-maintenance.mjs` (the launchd-driven canonical sync beat). 6 live refs, all real (test + maintenance caller + docs).
  - `yuri-canonical-memory-import.mjs` — cold-path import/rollback of run-artifacts INTO `memory.db` (a completely different direction and a different source: run-roots, not the ledger). 24 live refs across truth-promotion-enforcement, proving-run, reports.
  - `kagami-memory-consolidator.mjs` — a Qwen3.5-4B daily local-model **audit** pass over Track-B `.claude/memory/*.md` files (staleness/duplicate flagging → `memory-health.json`), never auto-deletes. Different substrate (files, not DB), different direction (flag for owner review, not promote). 11 live refs incl. its own test + subconscious-e2e test + scheduler status.
  - **Verdict: KEEP all 3.** They were never "3 bridges doing the same thing" — H1 flagged them from name-pattern-matching ("bridge"/"import"/"consolidator" all sound like migration shims) without reading the code. This is the single biggest false-positive in the sibling inventory.
- **`pulse-lane-dispatch.mjs` and `codex-offload-runner.mjs`: CONFIRMED dead, H1 correct.** Both carry explicit in-code retirement markers and zero live callers outside archives/worktrees. Safe to archive.
- **`lane-dispatcher.mjs` vs `lane-dispatch.mjs`: NOT a duplicate pair — H1's "check if same function" question resolves to NO.** `lane-dispatcher.mjs` (75 lines) is a standalone lane-capability SCORER (`selectLane`/`getLane`/`listLanes` over `lane-capability-manifest.json`) — a completely different mechanism from `lane-dispatch.mjs` (146 lines, the orchestrator with 283 live refs). But `lane-dispatcher.mjs` itself has **zero live refs** anywhere outside old worktree copies (`vault-restructure`, `upbeat-chaum-*`, etc.) and `2026-05-16` archive docs. **It's a genuine orphan — not a duplicate of lane-dispatch, just dead code with a confusingly similar name.**

---

## 1. GATE LAYERS

**Distinct enforcement mechanisms found (verified via `.claude/settings.json` hook parse + direct file reads):**

| Mechanism | Scope | Type | Live? |
|---|---|---|---|
| `bash-security-guard.js` | Protected Claude paths, .env, credentials | BLOCKING (unconditional) | LIVE, PreToolUse every call |
| `yuri-risk-lite.js` | Destructive shell/SQL/supply-chain (5/19 patterns `deny:true`) | BLOCKING (unconditional) | LIVE, PreToolUse every call |
| `math-register-guard.mjs` | Unregistered `_SYSTEM/Scripts/math/*.mjs` writes | BLOCKING (fail-closed) | LIVE, Write\|Edit matcher |
| `energy-enforce.mjs` | Catastrophic ΔU-breaker verdicts | BLOCKING (conditional, DISARMED — enforce flag absent) | Metrics-only burn-in |
| `tirith-url-guard.js` | URL vetting | BLOCKING (conditional, dormant — no tirith binary) | Sleeper |
| `_SYSTEM/Scripts/policy/yuri-safety-core.mjs` (`evaluateToolCall`) | Fleet-lane (glm-fleet/ollama-fleet/llm-lane) protected paths + destructive shell patterns | BLOCKING, real, separate implementation | LIVE — used by `llm-lane.mjs` and Codex hook path |
| voice-brain `_CRITICAL_BASH`/`_CRITICAL_APPLESCRIPT`/`_is_protected` (`yuri-z-brain.py:296-390`) | GLM-driven voice assistant tool calls (bash/write/edit/applescript) | Confirm-gate, standalone regex, own 8-token protected tuple | LIVE, but **OUTSIDE the Claude Code hook chain entirely** |
| Settings.json deny-list (permissions block) | Static tool-permission denies | Config-level | LIVE |
| ~28 remaining PreToolUse/PostToolUse/SessionStart/Stop hooks (directive-guard, claude-protocol-guard, filing-gate, gitnexus hooks, telemetry, etc.) | Advisory / observability only | Non-blocking | LIVE, fail-open |

**OVERLAP finding (CONFIRMED, corroborates S1 finding #1/#5):** there are **THREE independently-implemented protected-path denylists** that WILL drift: (a) `bash-security-guard.js`'s `BLOCKED_CLAUDE_FILES` Set, (b) `yuri-safety-core.mjs`'s `PROTECTED_TARGETS`/`PROTECTED_LITERAL_PATTERNS` array (verified missing `.git/` and out-of-repo `~/.claude/` — read directly, S1 finding #5 confirmed in code), (c) `yuri-z-brain.py`'s inline `PROTECTED` tuple (verified missing `~/.aws/`, `~/.npmrc`, `~/.docker/config.json`, `~/.gitconfig`, keychain — S1 finding #4 confirmed in code, `_CRITICAL_BASH` regex read directly above).

**Corroboration of S1's top recommendation: CONFIRMED, not just plausible.** Reading `yuri-z-brain.py:296-390` directly shows the voice-brain gate is a bespoke ~90-line regex/tuple set that duplicates — imperfectly and more narrowly — what `yuri-safety-core.mjs`'s `evaluateToolCall` already does in a cleaner, exported, testable form. `evaluateToolCall(toolName, toolInput, opts)` already handles shell/write/edit/multiedit/apply_patch uniformly with `PROTECTED_TARGETS` + `DESTRUCTIVE_PATTERNS`. There is no structural reason the voice brain's `_exec_tool` bash/write/edit dispatch cannot shell out to (or port) this same function instead of maintaining its own drifted copy.

**CUT/MERGE candidates, ranked:**

1. **Collapse voice-brain's inline gate onto `evaluateToolCall`.** CONFIRMED overlap, CONFIRMED narrower/staler coverage in the brain's own copy. Highest leverage: closes S1's CRIT finding #1 (voice brain outside the Claude Code hook chain) at the root instead of patching the symptom. Risk: MEDIUM — cross-language call (Python → Node) needs a subprocess/HTTP shim, not a trivial import; must preserve the brain's own AFFIRM/NEGATE conversational confirm UX on top of the shared allow/deny primitive.
2. **Add `.git/hooks`, `.git/config`, `~/.claude/settings*.json`-outside-project-root to `yuri-safety-core.mjs`'s `PROTECTED_TARGETS`.** Small, surgical, closes S1 finding #5. Risk: LOW.
3. **Do NOT merge `bash-security-guard.js` and `yuri-risk-lite.js`** — despite functional adjacency (both are unconditional PreToolUse deny gates), they encode genuinely different denylists (path-protection vs destructive-pattern) and merging them into one file would make future audits of "what does this ONE 200-line gate actually block" harder, not easier. Two small focused files beat one large one here — this is the one place MORE separation is correct, contra the general de-bloat instinct.
4. **`pre-tool-gate.js` → `pre-tool-use.js` merge (H2 finding, LOW severity):** both are PreToolUse advisories; pre-tool-gate is pure DeepSeek-routing-on-large-reads, pre-tool-use owns compaction tiers. Legitimate low-risk merge candidate — not re-verified line-by-line here (H2's read was direct and specific enough), flagging as **NEEDS-VERIFICATION** only on the exact routing logic overlap, not on whether the merge is safe in principle.

---

## 2. DISPATCH SURFACES

**Enumerated routers (verified file existence + live-ref grep, excluding worktree/archive/jsonl noise):**

| Router | Lines | Live refs | Status |
|---|---|---|---|
| `llm-compat-contract.mjs` | 1508 | high (canonical contract, cited throughout origin docs) | **LIVE — canonical dispatch/lifecycle contract** |
| `lane-dispatch.mjs` | 146 | 283 | **LIVE — main multi-lane orchestrator** |
| `llm-lane.mjs` | 1320 | high | **LIVE — DeepSeek/peer-lane execution engine, uses `evaluateToolCall`** |
| `nano-dispatch.mjs` / `nano-dispatch-gated.mjs` | 127 / 197 | live (nano-swarm imports: cost-reservation-pool, nano-tick, nano-compact-gate all interlock here) | **LIVE — nano-swarm executor** |
| `glm-fleet.mjs` | 379 | live | **LIVE — GLM-5.2 fleet dispatcher** |
| `ollama-fleet.mjs` | 348 | live | **LIVE — ollama-cloud peer-lane dispatcher** |
| `cline-fleet.mjs` | 258 | live | **LIVE — Cline-specific fleet dispatcher** |
| `lane-dispatcher.mjs` | 75 | **0 live** (only worktree copies + 2026-05-16 archive docs) | **DEAD — genuine orphan, confirmed** |
| `pulse-lane-dispatch.mjs` | 106 | **0 live**, explicit "retired 2026-05-29" marker in code | **DEAD — confirmed, archive** |
| `codex-offload-runner.mjs` | 434 | **0 live**, test-file notes confirm retirement, superseded by `llm-lane.mjs` | **DEAD — confirmed, archive (keep for historical reference per H1)** |

**Canonical target: 6 live surfaces** (`llm-compat-contract` as the contract layer; `lane-dispatch` + `llm-lane` as the two execution engines it wraps; `nano-dispatch`/`nano-dispatch-gated` as the nano-swarm branch; `glm-fleet`/`ollama-fleet`/`cline-fleet` as model-specific fan-out — these three are NOT redundant with each other, each targets a distinct model family with distinct auth/API shape, confirmed by file size and distinct content, not re-read line-by-line here but H1's own "Active, model choice" classification is consistent with the naming and is not contradicted by any evidence gathered).

**CUT list (HIGH CONFIDENCE — both retirement AND zero-liveness independently confirmed):**
- `lane-dispatcher.mjs` — delete or archive. Zero live callers, and (correcting H1) it isn't even functionally redundant with `lane-dispatch.mjs`, it's just an abandoned side-mechanism (lane-capability scoring never wired into the live dispatch path).
- `pulse-lane-dispatch.mjs` — archive. Explicit retirement marker + zero live refs.
- `codex-offload-runner.mjs` — archive (not delete, per H1's own historical-reference rationale — reasonable, no counter-evidence found).

**NEEDS-VERIFICATION (flag for Fable, do not cut without deeper trace):**
- `train-fleet-router-from-ledger.mjs` — H1 flagged as possibly-superseded; not independently re-verified in this pass (out of budget). Fable: run `grep -rn "train-fleet-router" --include=*.mjs _SYSTEM/Scripts` and check if any live fleet-tuning cron/launchd calls it before cutting.

---

## 3. MEMORY WRITERS

**Track-A (canonical, YURI-shared) — verified live-ref counts:**
- `memory-kernel.mjs` (893 lines, 84 live refs) — the durable ledger + propose/decide/promote pipeline. Load-bearing, unambiguous KEEP.
- `memory-canonical-store.mjs` (494 lines, 36 live refs) — event-sourced convergence store (shard-then-drain). Load-bearing KEEP.
- `memory-kernel-canonical-bridge.mjs` (92 lines, 6 live refs) — governed one-way seam, ledger→canonical. KEEP (see correction above).
- `yuri-canonical-memory-import.mjs` (457 lines, 24 live refs) — cold-path run-artifact import/rollback into `memory.db`, a DIFFERENT ingestion direction. KEEP (see correction above).

**Track-B (Claude auto-memory, this-operator-only):**
- `claude-memory-write.mjs` (375 lines, 52 live refs) — validation/reindex wrapper around native `Write` into `.claude/memory/`. KEEP, but see H4's finding: 320 files / 142 feedback entries / 40-60 semantic duplicates is a REAL hygiene problem — this is a CONTENT sprawl issue, not a SCRIPT redundancy issue. No script consolidation needed here; the fix is a content-merge pass (H4's T1/T2/T3 plan), not a code cut.
- `kagami-memory-consolidator.mjs` (334 lines, 11 live refs) — daily local-model audit/flag pass over the Track-B files. KEEP (see correction above) — this is actually the MECHANISM that should absorb H4's manual dedup work going forward (it already flags staleness/duplicates; the gap is that its output — `memory-health.json` — isn't currently being acted on). **Higher-leverage move than any script cut: wire kagami-memory-consolidator's flagged duplicates into an actual owner-reviewed merge queue**, since the mechanism to detect the H4 sprawl already exists and runs daily.

**Verdict: ZERO script-level redundancy in the memory-writer layer.** H1's "3 consolidation scripts may be redundant" hypothesis is the one significant correction this synthesis makes — all three are load-bearing and non-overlapping. The real memory bloat (H4's 320 files, 40-60 dupes) is a **data hygiene problem in `.claude/memory/*.md` content**, entirely separate from the scripts that manage it. Do not let "memory sprawl" framing imply the SCRIPTS need consolidating — they don't.

---

## RANKED CONSOLIDATION SHORTLIST (for Fable's cut plan)

| Subsystem | Current count | Canonical target | Cut/merge candidates (paths) | Evidence | Risk |
|---|---|---|---|---|---|
| **Gate layers — protected-path drift** | 3 independent denylist implementations | 1 shared primitive (`evaluateToolCall`) called from all 3 surfaces | `_SYSTEM/Scripts/voice/yuri-z-brain.py:296-390` → route through `_SYSTEM/Scripts/policy/yuri-safety-core.mjs` | CONFIRMED: read all 3 denylists directly; brain's is narrower + already drifted (missing `~/.aws`, `~/.npmrc`, etc. — verified against real dotfile paths) | MEDIUM (cross-language shim; must preserve voice UX) |
| **Gate layers — fleet PROTECTED_TARGETS gap** | missing `.git/`, out-of-repo `~/.claude/` | add 2-3 entries | `_SYSTEM/Scripts/policy/yuri-safety-core.mjs:13-23` | CONFIRMED via direct read of `PROTECTED_TARGETS` array | LOW |
| **Dispatch — dead orphan** | 1 unused file | 0 | `_SYSTEM/Scripts/lane-dispatcher.mjs` | CONFIRMED: 0 live refs (only worktree/archive copies); functionally distinct from (not duplicate of) `lane-dispatch.mjs` | LOW — pure deletion, zero live callers |
| **Dispatch — retired routers** | 2 files | 0 (archive) | `pulse-lane-dispatch.mjs`, `codex-offload-runner.mjs` | CONFIRMED: explicit in-code retirement markers + 0 live refs | LOW |
| **Memory Track-B content (not scripts)** | 320 files, 142 feedback, ~23-35 semantic dupes | ~8-10 consolidated feedback families + owner-reviewed archive pass | per H4's family table (commit/pathspec ×3, dispatch ×7+, fleet/agent ×9+, research ×4) | CONFIRMED by H4's direct file inventory; not independently re-verified line-by-line here but H4's methodology (basename clustering + content read) is sound | LOW (reversible, git-tracked; needs 4-6h owner-adjacent session per H4) |
| **Memory Track-B — unused detection loop** | daily consolidator runs, output unconsumed | wire `memory-health.json` flags into an actual merge queue | `_SYSTEM/Scripts/kagami-memory-consolidator.mjs` (already live) | CONFIRMED live + already computes what H4 wants — leverage play, not a cut | LOW |
| **Isolated gates H1 flagged as uncertain** | 2 files misclassified as orphans | 0 changes needed | `nano-compact-gate.mjs`, `spreading-activation-gate.mjs` | CONFIRMED LIVE via direct grep (imported by `cost-reservation-pool.mjs`/`nano-tick.mjs`; present in live knowledge-graph + energy-session snapshots) | **NONE — do not touch, H1 was wrong here** |
| **Gates that don't exist** | H1 named 2 files that aren't real | n/a | `gate-rerank.mjs`, `multi-horizon-gate.mjs` | CONFIRMED absent via `find` | n/a — remove from all future cut lists |
| **Memory bridge scripts H1 flagged as possibly-redundant** | 3 files, all load-bearing | 3 (no change) | `memory-kernel-canonical-bridge.mjs`, `yuri-canonical-memory-import.mjs`, `kagami-memory-consolidator.mjs` | CONFIRMED via direct header reads: 3 genuinely different seams (ledger→canonical / cold-DB import-rollback / Track-B file audit) | **NONE — do not merge, H1's hypothesis falsified** |
| **Identity spine dedup (H5)** | 3 files, ~15 duplicated concepts, ~404 lines | 3 files (unchanged count) + surgical cross-refs | `_SYSTEM/yuri-origin.md`, `SOUL.md`, `_SYSTEM/persona.md` | H5's own analysis (not independently re-verified here, but H5 explicitly recommends AGAINST merging and its reasoning — authority/cognition/identity are functionally distinct layers — is sound and consistent with the rest of this audit's philosophy) | LOW — text-only cross-ref edits, ~40 token/session net savings |
| **NEEDS-VERIFICATION (flag, don't cut)** | 1 script | TBD | `train-fleet-router-from-ledger.mjs` | H1 flagged, not independently re-traced this pass | Fable: verify before any action |
| **NEEDS-VERIFICATION (flag, don't cut)** | 1 merge candidate | TBD | `pre-tool-gate.js` + `pre-tool-use.js` | H2 flagged as low-severity merge; logic-level overlap not independently re-verified this pass | Fable: read both files fully before merging |

---

## Definition of "leaner-but-more-powerful YURI"

Leaner means: **one denylist implementation instead of three that silently drift** (the gate-layer finding is the single highest-leverage cut in this whole audit — it's a security gap AND a maintenance-burden fix in the same move), **zero files with confusingly-similar names that turn out to be dead** (`lane-dispatcher.mjs`), and **memory content consolidated to match the discipline the scripts already enforce** (the consolidator already flags dupes daily; the system just isn't acting on its own output yet — closing that loop is leaner in the sense of "use what you built" rather than "build less").

More powerful means: the 6-surface dispatch layer (contract + 2 engines + nano-swarm + 3 model-specific fleets) stays exactly as-is — H1's instinct to see "5-6 overlapping dispatch mechanisms" as bloat was WRONG on the model-specific fleets (glm/ollama/cline serve genuinely different backends with different auth/capability shapes) and RIGHT only on the 3 confirmed-dead scripts. The 3 memory-bridge scripts likewise looked like sprawl by name-pattern but are 3 necessary, non-overlapping data-flow directions — cutting any of them would remove real capability (cold-DB recovery, governed promotion, or staleness detection) for zero simplification gain.

## What must NOT be cut (load-bearing core)

- The 3 real blocking Claude Code hooks (`bash-security-guard.js`, `yuri-risk-lite.js`, `math-register-guard.mjs`) — H2's own conclusion, not contradicted by anything found here.
- `llm-compat-contract.mjs` + `lane-dispatch.mjs` + `llm-lane.mjs` — the dispatch contract/engine core.
- `memory-kernel.mjs` + `memory-canonical-store.mjs` + all 3 "bridge" scripts — every one of the 3 is a distinct necessary seam, confirmed by direct code read, not by name-pattern guessing.
- `nano-compact-gate.mjs` + `spreading-activation-gate.mjs` — confirmed live, do not let a future pass re-flag these from H1's stale "uncertain" language without re-checking the live-ref evidence gathered here.
- The 3-file identity spine (`yuri-origin.md`/`SOUL.md`/`persona.md`) as 3 SEPARATE files — H5's reasoning that authority/cognition/private-identity are functionally distinct layers holds; only the ~15 duplicated concept-passages should be cross-ref'd, not the file structure itself.

---

## Residual risk / what this synthesis could not verify

- `glm-fleet.mjs`/`ollama-fleet.mjs`/`cline-fleet.mjs` non-redundancy is asserted from file size + H1's classification, not from a full line-by-line diff of the three files' actual API-calling logic — a real diff could still surface shared code worth extracting into `_lib/`, though that would be refactoring-for-DRY, not de-bloat-by-deletion.
- `pre-tool-gate.js`/`pre-tool-use.js` merge candidate (H2) and `train-fleet-router-from-ledger.mjs` (H1) are both flagged NEEDS-VERIFICATION — this pass did not have budget to trace both fully; do not act on either without the trace H1/H2 both already recommended.
- H4's exact duplicate count (23-35 semantic dupes in `.claude/memory/feedback-*.md`) was not independently re-verified file-by-file in this pass; H4's basename-clustering methodology is sound but the precise family boundaries should get one more read before an owner merge session.
