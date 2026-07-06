---
name: lane-simplification-and-full-equip
description: "Offload dispatch collapsed to one ~370-line llm-lane.mjs core (3 openai-compatible lanes); the lanes must be FULLY YURI-EQUIPPED (full-stack loadout + read/fetch/search tools), NOT thin/blind. Marcel corrected my under-equipping TWICE."
metadata:
  node_type: memory
  type: feedback
  tier: 1
  scope: project
  trig:
    - offload
    - llm-lane
    - lane
    - deepseek
    - nemotron
    - kimi
    - simplify
    - equip
    - tools
  refs:
    - offload-consolidation-and-rename
    - reasoning-lanes-three-1m-context
    - feedback-codex-lanes-fully-equipped
    - controlled-not-cheap-bounded-fanout
  originSessionId: 04d866fa-5d20-46ea-aa4d-36d0b53459ce
---

RULE: Two orthogonal axes — keep them separate. (1) Dispatch MACHINERY = minimal: the 3 reasoning lanes are all openai-compatible, so dispatch is ONE ~370-line core (`_SYSTEM/Scripts/llm-lane.mjs`), not the old 7,339-line stack (offload-runner 2562 + offload-contract 1400 + ai 1608 + offload.sh 628 + reasoning-lane-dispatch 406 + lane-kernel 287 + adapters + queue). (2) Lane CAPABILITY + CONTEXT = MAXIMAL: each lane is a fully-YURI-equipped mini-me operator — full brain/persona/origin/INDEX loadout injected as system context (~57KB, trivial vs the 1M window) PLUS read_file/grep/list_dir/search(FTS5 corpus)/context_router/fetch_url AND bash (run commands/scripts/TESTS) over the whole repo. Simple to INVOKE, rich in CAPABILITY. Marcel corrected my under-equipping THREE times (blind→full-stack→executes).

WHEN: building/simplifying the offload (→ "LLM compatibility lane") dispatch surface, or equipping any dispatched lane/agent.

DO: collapse dead machinery (dead providers, 64 @-aliases, 3-layer indirection, sessions, streaming, queue); give the lane the full stack + full read/fetch traversal; enforce protected paths + SSRF on the tools; keep write/commit on YURI's side (advisory-until-verified).

DONT: conflate "simple dispatcher" with "thin equipping" — I did this TWICE and Marcel corrected both: (1) "lanes have to read and fetch anything they can so they can work, not a blind chicken unaware of yuri"; (2) "they're supposed to get the FULL yuri stack, not just a little bit here and there". Do NOT strip the tool loop or ship a one-paragraph preamble. Do NOT over-restrict.

STYLE: lane endpoint guard = ALLOWLIST (api.deepseek.com / integrate.api.nvidia.com only) — kills the SSRF bypass class; fetch_url tool guard = private/loopback/metadata DENY (canonicalized: IPv6 brackets, ::1, IPv4-mapped, decimal-fold, .internal/.local). All 3 lanes live-verified full-stack (read real config → correct roster + authority).

WHY: a reasoning lane that can't traverse YURI is useless; the bloat is what bred the bugs (e.g. the old SSRF deny-list let IPv6/metadata through). Minimal dispatch + maximal equipping is the resolution.

CORE-INGEST UNLOCK (Marcel 2026-06-05, "cleanest unlock... plugin different frontier models"): every lane call fires the FULL YURI core from INSIDE the dispatch via `_SYSTEM/Scripts/lane-core-hooks.mjs` — `coreOnDispatch` (energy ΔU traceDispatchEvent + memory recall injected as a block) + `coreOnResult` (evidence lane_output→memory-ledger + docked-LLM symbiotic pulse→lane-pulse-trace, advisory_only/verdict=verify). Error-isolated. Model: a lane call is an input into YURI triggering the same core machinery a native operator turn does — the orchestrating lane (me) supplies the input instead of Marcel. lane-core-hooks is the single seam ANY future frontier model plugs into to inherit the full core. Pulse module (yuri-symbiotic-pulse) is RETIRED — verdict recorded directly. All 4 surfaces live-verified firing. Circuitry: lane-core-hooks node + edges (llm-lane→lane-core-hooks→{energy-dispatch-bridge, yuri-recall}); all 3 viz (chip-die/instrument/dated) regenerated.

STATE (2026-06-05): DONE + verified, NOT yet committed (owner gate), branch feat/offload-consolidation. Deleted ~4040 lines: offload-runner.mjs (2562), reasoning-lane-dispatch, offload-lane-config, the 3 *-dispatch adapters, reasoning-finalize + their tests. Added llm-lane.mjs (~420) + llm-lane.test (7/7). Repointed ai/offload.sh/yuri-workhorse/deepseek-guarded-handoff/yuri-guarded-executor → llm-lane; updated yuri-safety-core .env-hydration allowance to recognize llm-lane. KEPT (load-bearing, NOT deleted): lane-kernel.mjs (~30 importers), offload-contract.mjs (routing/route-plan axis), offload-queue.mjs. All 3 lanes live-PONG + tool/exec verified. offload-contract-regression red ONLY due to dirty-tree git-status selftest (resolves on commit). NEXT: circuitry refresh (graph→viz→manual→reindex) for the offload→llm-lane change; then the queued offload→"LLM compatibility lane" rename.

VIABILITY (first live run, 2026-06-05, committed dd10eb38 + 76d622de, PUSHED): the 3 unlocked lanes (deepseek/nemotron/kimi via llm-lane+core-hooks) + Codex each independently read the new code, ran the test, and produced DISTINCT file:line-grounded findings on my own fresh commit. Codex caught a REAL security leak (grep tool descended into .env/secrets/backend-data/claude-state — only node_modules/.git excluded); nemotron=silent spine degradation, deepseek=silent recall degradation, kimi=unstable runId, converged=no hook tests. ALL fixed+verified (suite 10/10, grep leak 0 even on greedy pattern). VERDICT: viable + immediately valuable — frontier models plugged into the core run the build→multi-lane-review→fix loop and catch real bugs. This validates [[feedback-substrate-cert-loop]] powered by the unlocked lanes.

SEE: [[offload-consolidation-and-rename]] · [[feedback-codex-lanes-fully-equipped]] · [[reasoning-lanes-three-1m-context]] · [[circuitry-change-propagation-continuity]] · [[feedback-substrate-cert-loop]]
