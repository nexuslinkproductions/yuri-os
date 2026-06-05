# HANDOFF — llm-lane consolidation + full core-ingest unlock (2026-06-05)

Branch `feat/offload-consolidation`. Both commits PUSHED (origin up to date, 0 ahead):
- `dd10eb38` feat(lanes): minimal llm-lane dispatch core + full core-ingest unlock (retire offload-runner)
- `76d622de` harden(lanes): close 4-lane live-review findings on the llm-lane core

## What landed (DONE + verified + pushed)

**Dispatch collapsed.** The ~4040-line offload dispatch stack is replaced by:
- `_SYSTEM/Scripts/llm-lane.mjs` (~405 lines) — the single openai-compatible dispatch path for the 3
  reasoning lanes (deepseek-v4-pro / nemotron-3-ultra-550b-a55b / kimi-k2.6). Each lane is a
  native-equivalent operator: full YURI-stack system loadout (yuri-origin/SOUL/persona/CLAUDE.md/INDEX)
  + tools read_file/grep/list_dir/search/context_router/fetch_url/bash. Fail-closed: endpoint host
  ALLOWLIST (api.deepseek.com / integrate.api.nvidia.com — kills the IPv6/metadata SSRF bypass class),
  fetch_url private/loopback/metadata DENY, grep protected-surface exclude+post-filter, bash blocks
  destructive/git-mutation/protected-surface, loud-fail exit 0/1/3, truncation-visibility warn.
- `_SYSTEM/Scripts/lane-core-hooks.mjs` — THE core-ingest seam. Every dispatch fires the full YURI core
  from inside (the unlock): `coreOnDispatch` = energy ΔU (traceDispatchEvent) + memory recall (cold
  store, injected as a block) ; `coreOnResult` = evidence (lane_output → _SYSTEM/state/memory-ledger.jsonl)
  + docked-LLM symbiotic pulse (advisory_only/verdict=verify → _SYSTEM/state/lane-pulse-trace.jsonl).
  One stable runId correlates all three. Error-isolated. Any future frontier model plugs in here.

**Deleted (18 files):** offload-runner.mjs (2562), reasoning-lane-dispatch.mjs, offload-lane-config.mjs,
{deepseek,kimi,nemotron}-dispatch.mjs, reasoning-finalize.mjs + their tests + offload-runner-rails.test.
**Repointed to llm-lane:** ai (run_offload_lane + `ai llm`/deepseek/kimi/nemotron/ds-reason + OFFLOAD_RUNNER var),
offload.sh (run_offload_runner), yuri-workhorse.mjs, deepseek-guarded-handoff.mjs, yuri-guarded-executor.mjs
(selftest manifest), yuri-supercharge-gate.mjs (test list), policy/yuri-safety-core.mjs (.env-hydration
allowance now recognizes llm-lane).
**KEPT — load-bearing, do NOT delete:** lane-kernel.mjs (~30 importers), offload-contract.mjs (routing /
route-plan axis, feeds the session protocol packet), offload-queue.mjs (concurrency lease).

**Invocation:** `ai llm <deepseek|kimi|nemotron> "<prompt>"` (also `ai deepseek|kimi|nemotron`, `@deepseek|@kimi`).
Flags: --reasoning low|medium|high|xhigh|max · --no-exec (drop bash) · --light (trim loadout) · --dry-run.

**Tests:** llm-lane.test 10/10 · lane-kernel 11/11 · codex-offload-runner 1/1.
**Circuitry:** graph 87 nodes/157 edges (llm-lane + lane-core-hooks nodes/edges); all 3 viz regenerated
(yuri-chip-die.html / yuri-circuitry-instrument.html / yuri-circuitry-2026-06-03.html — UNTRACKED gen artifacts);
corpus reindexed (38,830 docs).

**Viability (first live run):** deepseek/nemotron/kimi (via the unlock) + Codex each independently read the
code, ran the test, and produced 4 DISTINCT file:line-grounded findings on the fresh commit — Codex caught a
REAL grep protected-surface leak; all fixed + verified in 76d622de. The build→multi-lane-review→fix loop with
frontier models plugged into the core is CONFIRMED viable.

## RENAME — offload → "LLM compatibility lane" — ✅ DONE (2026-06-05, owner-directed "be thorough with the atomic renaming")

**LANDED (hard rename, no alias, lockstep):** 6 files git-mv'd to `llm-compat-*`; `ai offload` removed → folded into `ai llm` family (verified: `ai llm --dry-run deepseek` resolves to deepseek-v4-pro; no `offload)` case remains); ALL grammar pattern-renamed `OFFLOAD_*`→`LLM_COMPAT_*` (incl. the second-pass tokens a fixed-list sweep missed — `OFFLOAD_TASK_ID/STREAM/FILE/INTENT/ASSESSMENT/LEASE_*/_CONCURRENT_LANES/LANE_CEILING_REACHED`, caught by a 5-agent adversarial verify), `GLOBAL_OFFLOAD_DIRECTIVE`→`GLOBAL_LLM_COMPAT_DIRECTIVE`, `offload_lanes`→`llm_compat_lanes`, `run_offload_lane`→`run_llm_lane`, `CMD_OFFLOAD`→`CMD_LLM`; graph + arch-metrics + 3 circuitry viz + tracked dashboard regenerated self-consistent; canonical docs (yuri-origin "## LLM Compatibility Routing", RUNBOOK, models.json, MUSUBI_PROTOCOL, CLAUDE.md) + guard messages + git-hooks (pre-commit/pre-push — were real commit/push breakages) + safety-core regex (regex-escaped `offload\.sh`, real safety-gate gap) all updated. GitNexus reindexed. RUNTIME SURFACE FULLY CONVERGED (zero stale tokens). Tests green: drift-check, lane-kernel, llm-lane, codex-runner, supercharge-gate, propagation-scan, protected-surfaces, token-ledger, ollama-adapter, scout-dispatch. **NOT committed/merged — owner gate.**

**PRE-EXISTING DEBT (from the PRIOR consolidation that deleted offload-runner.mjs in dd10eb38 — NOT this rename; surfaced by the verify, left for owner decision):** dangling `offload-runner.mjs` refs in `yuri-local-model-policy.test.mjs` (GATING, execs the deleted runner → MODULE_NOT_FOUND, was already red at HEAD) + `llm-compat-contract-regression.test.mjs` (internal `offloadRunnerPath`); `rick-harness-runtime.test.mjs` red (tests removed lane `deepseek-v4-flash` + streaming via deleted runner). Also pre-existing: `claude-protocol-guard.test.js` requires a `.js` hook that never existed (file is `.mjs`); `validate-session-state` fails on the stale pre-rename `session-state.json` (self-heals next boot — source lockstep confirmed). These predate the rename; fixing them = finishing the consolidation's test cleanup, a separate pass.

### Original spec (for reference)

Owner reframe: it's COMPATIBILITY with external LLMs, not offloading YURI's work onto something lesser.
Owner-confirmed naming (binding): command `ai llm` (already exists); files `llm-compat-*.mjs`; graph
nodes/sector "LLM Compatibility". HARD rename — NO `ai offload` transitional alias (same discipline as the
dead-lane removal). Rename is now VALID (the rebuild — llm-lane — is functionally real; renaming before that
would have been a graph lie).

**Files to rename (the track):** offload-contract.mjs → llm-compat-contract.mjs · offload.sh →
llm-compat.sh · offload-queue.mjs → llm-compat-queue.mjs · offload-contract-dispatch-check.mjs ·
offload-contract-regression.test.mjs · offload-envelope.schema.json. **SWEEP ALL CALLERS.**
**Command:** `ai offload <auto|swarm|route|--model|...>` subsurface → `ai llm` family (hard, no alias).
**Decide (owner) before sweeping:** whether to also rename the env-var grammar `OFFLOAD_PROMPT_TEXT` /
`OFFLOAD_QUEUE_*` and the result markers `OFFLOAD_FAIL`/`OFFLOAD_WARN` (worker-bridge/task-queue/queue grep
these — coordinated change) and the protocol token `GLOBAL_OFFLOAD_DIRECTIVE` (in MUSUBI_PROTOCOL.md /
yuri-origin.md — session-boot surface). Recommend: rename files+command+graph first (clean, bounded);
treat the env/marker/protocol grammar as a second explicit decision to avoid breaking the loud-fail contract.
**Propagation (continuity law):** after the rename — circuitry graph (offload sector/nodes → "LLM
Compatibility") → regen all 3 viz → manual (node prose) → GitNexus reindex (`npx gitnexus analyze
--skip-agents-md` — index is STALE at 4f71bb7, deliberately deferred so ONE reindex covers consolidation+rename).
**Spec source:** this file + commits dd10eb38/76d622de + memory [[offload-consolidation-and-rename]] +
[[lane-simplification-and-full-equip]].

## Residuals / gotchas
- `offload-contract-regression` test goes red ONLY on a dirty working tree (its guarded-executor selftest
  checks scoped git-status); green once committed. Not a code defect.
- Owner to decide: merge feat/offload-consolidation → main before or as part of the rename. Merge compare:
  https://github.com/nexuslinkproductions/yuri-os/compare/main...feat/offload-consolidation
- GitNexus index stale (4f71bb7) — reindex with the rename.
- Codex lane does NOT yet go through lane-core-hooks (separate platform via codex-offload-runner.mjs); wiring
  it through the core is an open option if desired.
