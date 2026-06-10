---
name: offload-consolidation-and-rename
description: "The offload-stack consolidation op (3-lane single-path rework) + the owner decision to RENAME the track \"offload\" → \"LLM compatibility lane\" as a deferred atomic pass after the rework lands."
metadata: 
  node_type: memory
  type: project
  tier: 1
  scope: project
  trig: 
    - offload
    - llm compatibility lane
    - consolidation
    - rename
    - deepseek
    - nemotron
    - kimi
    - offload-runner
  refs: 
    - reasoning-lanes-three-1m-context
    - circuitry-change-propagation-continuity
    - nemotron-3-ultra-lane-live
  originSessionId: 489e4b10-fbd1-4f6d-bc4c-b39a1cc2ad6f
---

▶ **CURRENT (2026-06-05 session end): rename DONE + MERGED to main, lanes HARDENED + fully EQUIPPED, fan-out READY.** This memory's original consolidation+rename goal is complete and superseded by the lane-hardening arc — see the live jump-in doc `_SYSTEM/HANDOFF-2026-06-05-lane-hardening-fanout-ready.md` ([[lane-timeout-ghost-lesson]], [[lane-context-front-load]]). Merged: `028e430f` rename · `d800012c` lane improvements+LANE-MANUAL · `21ddcaca` Codex full-equip (un-sandboxed, guard-verified) · `29e5b16c` kagami noise fix. NEXT SESSION = launch the breadth fan-out (Wave 1). Original goal/history below for provenance.

GOAL: Consolidate the tangled offload stack to ONE clean dispatch path over EXACTLY 3 lanes (deepseek-v4-pro, nemotron-3-ultra-550b-a55b, kimi-k2.6), then RENAME the whole track from "offload" to the "LLM compatibility lane" (owner reframe 2026-06-05: it's compatibility with external LLMs, not offloading YURI's work onto something lesser).

WHO: Marcel (decisions + commit gate). Built dual-platform: Claude lane (audit/design/cert/finalize) + Codex gpt-5.5 (independent design, then workspace-write DRAFT implementation). Codex is advisory until Claude certs against live tests.

WHEN: 2026-06-05. Branch feat/offload-consolidation (off main).

WHERE: _SYSTEM/Scripts/offload-runner.mjs (1700-line hub), offload.sh, offload-contract.mjs, offload-queue.mjs, reasoning-lane-dispatch.mjs, {deepseek,nemotron}-dispatch.mjs + NEW kimi-dispatch.mjs, reasoning-finalize.mjs, lane-kernel.mjs, kagami-overseer.mjs; consumers worker-bridge.mjs/task-queue.mjs/pulse-lane-dispatch.mjs/offload-queue.mjs; .claude/config/models.json (new `offload_lanes` block = single source).

OWNER DECISIONS (2026-06-05, binding): DeepSeek un-retired, canonical=DIRECT api.deepseek.com/v1. Kimi via NIM (integrate.api.nvidia.com/v1, moonshotai/kimi-k2.6) — revive the dead nvidia-kimi route, ignore KIMI_BASE_URL/moonshot. Legacy ~47 lanes HARD-REMOVE lockstep. Blocked lane → worker task FAILED. All 3 lanes 1M context; output cap is the separate knob (deepseek xhigh=131072; nemotron/kimi OPEN, probe at build).

STATE (2026-06-05 EOT): CONSOLIDATION COMPLETE + COMMITTED + PUSHED on feat/offload-consolidation — `f2ac55dc` (consolidation: offload_lanes config, resolver, loud-fail 0/1/2/3, kimi NIM adapter revived, ~47 legacy lanes hard-removed lockstep, cross-lane fallback/substitution killed) + `529d8fd2` (hardening: truncation-visibility warn + endpoint SSRF guard). Built dual-platform (Codex gpt-5.5 DRAFT 2 rounds + Claude cert: classification fix unknown-lane→exit3, contract drift-token fix, 2 red-team fixes). 9/9 offload suites green, drift-check clean, all 3 lanes live-verified PONG, kimi NIM revival proven on a 23KB red-team. Ceiling probe: 32768 has headroom (none truncated); nemotron/kimi exact max stays OPEN/conservative. PR not opened (gh perm-blocked, see [[gh-pr-create-blocked-yuri-os]]); merge via compare URL: https://github.com/nexuslinkproductions/yuri-os/compare/main...feat/offload-consolidation

UPDATE (2026-06-05, SECOND pass on the same branch — DONE + PUSHED): the dispatch stack was then COLLAPSED further — offload-runner.mjs (2562) + the 3 *-dispatch adapters + reasoning-lane-dispatch were DELETED (~4040 lines) and replaced by the minimal `llm-lane.mjs` (~405) + the `lane-core-hooks.mjs` core-ingest unlock (energy+recall+evidence+pulse fire from inside every lane call — the seam any frontier model plugs into). Commits `dd10eb38` (unlock) + `76d622de` (hardening from a 4-lane live-review that caught a real grep SSRF/protected-surface leak). Live-run viability CONFIRMED. Full detail: `_SYSTEM/HANDOFF-2026-06-05-llm-lane-unlock.md`. See [[lane-simplification-and-full-equip]].

NEXT — ~~READY NOW~~ ✅ **RENAME DONE (2026-06-05, this session, owner-directed "be thorough with the atomic renaming")**. Hard rename, no alias, lockstep. Landed: 6 files git-mv'd (offload-contract→llm-compat-contract.mjs · offload.sh→llm-compat.sh · offload-queue→llm-compat-queue.mjs · -dispatch-check · -regression.test · offload-envelope→llm-compat-envelope.schema.json); command `ai offload` REMOVED + folded into the `ai llm` family (no transitional alias); ALL grammar renamed lockstep (OFFLOAD_PROMPT_TEXT/QUEUE/RUNNER/CONTRACT/SH/FAIL/WARN → LLM_COMPAT_*, GLOBAL_OFFLOAD_DIRECTIVE→GLOBAL_LLM_COMPAT_DIRECTIVE, offload_lanes→llm_compat_lanes, run_offload_lane→run_llm_lane, CMD_OFFLOAD→CMD_LLM); ~83 files swept incl. the **two git-hooks that the allowlist initially missed** (_SYSTEM/git-hooks/pre-commit dispatch-check path + pre-push `test:offload-contract` npm key — both were real push/commit breakages, caught by the adversarial residual sweep). Graph (yuri-graph-state.json) + arch-graph-metrics.json + 3 circuitry viz + tracked yuri-os-dashboard.html updated/regenerated self-consistently. GitNexus reindexed (43,354 nodes, covers consolidation+rename). DELIBERATE KEEPS (separate platform / unrelated meaning, NOT renamed): Codex platform `codex-offload-runner.mjs`+`.codex/*`+`exec-offload.sh` (own filenames kept; their refs to the shared wire/dispatcher WERE updated for lockstep), `startup-offload.js` (misnamed hook), design `offload_package/` (unrelated), all history. VERIFY: drift-check green, lane-kernel/llm-lane/codex-runner/supercharge-gate/propagation-scan/protected-surfaces tests green; `llm-compat-contract-regression` red ONLY on dirty tree (guarded-executor git-status selftest — passes once committed); `validate-session-state` fails ONLY on the stale pre-rename session-state.json (self-heals next boot — source lockstep confirmed); `claude-protocol-guard.test` .js/.mjs breakage is PRE-EXISTING (HEAD never had the .js). NOT committed/merged (owner gate). ORIGINAL spec below for context:

NEXT (superseded) — **READY NOW (fresh session, owner-directed 2026-06-05)**; rebuild is functionally real so the rename is valid. Spec + scope + gotchas in `_SYSTEM/HANDOFF-2026-06-05-llm-lane-unlock.md`. The RENAME pass — atomic, lockstep. Naming (owner-confirmed 2026-06-05): command `ai llm`, files llm-compat-*.mjs, graph nodes/sector "LLM Compatibility". SWEEP ALL CALLERS — NO `ai offload` transitional alias (hard rename, same discipline as the dead-lane removal). Rename AFTER rebuild (continuity law: no renaming a slot before its new identity is functionally real = graph lie). **NEXT-SESSION FIRST ACTION** (owner: rename = fresh session). The rename pass carries the deferred continuity propagation: graph (yuri-graph-state.json offload nodes → LLM-compat) + viz/manual + GitNexus reindex (index is STALE at 4f71bb7 — deliberately deferred so ONE reindex covers consolidation+rename). Owner also to decide: merge feat/offload-consolidation → main before or as part of the rename. Spec for the rename context: this file + the consolidation commits f2ac55dc/529d8fd2.

SEE: [[reasoning-lanes-three-1m-context]] · [[circuitry-change-propagation-continuity]] · plan+evidence in /tmp/codex-offload-task.md + /tmp/codex-offload-impl.md (this session).
