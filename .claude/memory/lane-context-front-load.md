---
name: lane-context-front-load
description: "Dispatch-quality lever (Marcel 2026-06-05): 'equipped' (identity loadout + tools) is NOT the same as 'has the right context.' When dispatching a lane/agent, FRONT-LOAD the must-read files INTO the packet (--context) so it starts with guaranteed context from turn 1, instead of hoping it discovers them via tools. Built into llm-lane.mjs + codex-offload-runner.mjs."
metadata:
  node_type: memory
  type: feedback
  tier: 1
  scope: project
  trig:
    - front load context
    - dispatch lane
    - dispatch agent
    - context pack
    - must read files
    - guarantee context
    - --context
    - equipped not enough
  refs:
    - build-agent-context-loadout
    - feedback-agent-dispatch-contract
    - "[[lane-timeout-ghost-lesson]]"
  originSessionId: abb3b542-bc65-4d11-a095-be1c5ca218f0
---

RULE: when dispatching any lane (deepseek/nemotron/kimi/codex) or agent, FRONT-LOAD the must-read files into the dispatch packet — do not just assert "you have the full YURI treatment" and trust it to find the right files. Telling it it's equipped ≠ it reading the right things.

WHEN: every non-trivial lane/agent dispatch (reviews, audits, builds, the fan-out).

DO: pass `--context <files|@manifest>` (now built into BOTH `llm-lane.mjs` and `codex-offload-runner.mjs`) — it reads the named files and injects a "PRELOADED CONTEXT — do NOT re-fetch" block before the task. The DISPATCHER picks the files per task, PROPORTIONAL to its blast radius (a security review gets the guard files; a memory review gets the memory organs) — never dump the repo. Budget-capped (`LLM_LANE_CONTEXT_BUDGET=240k`), protected-surface-safe. `--dry-run` reports `contextChars`. Verified: a `--no-tools` lane answered purely from the preloaded file.

DONT: leave the lane to discover its context via search/read_file when you already know the must-reads — it wastes turns and isn't guaranteed. Don't over-load either (dilutes + wastes tokens) — match the pack to the task.

WHY: it's the single highest-leverage dispatch-quality lever — converts "hope the lane finds the context" into "the lane has the context," faster + more reliable. Owner flagged it reviewing a Codex brief that merely SAID "fully equipped."

STYLE: this is the operating form of [[build-agent-context-loadout]] (proportional loadout) for lanes. SEE: `_SYSTEM/LANE-MANUAL.md` §7a · [[feedback-agent-dispatch-contract]].
