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
    - "[[lane-frontload-verified]]"
  originSessionId: abb3b542-bc65-4d11-a095-be1c5ca218f0
---

RULE: when dispatching any lane (deepseek/nemotron/kimi/codex) or agent, FRONT-LOAD the must-read files into the dispatch packet — do not just assert "you have the full YURI treatment" and trust it to find the right files. Telling it it's equipped ≠ it reading the right things.

WHEN: every non-trivial lane/agent dispatch (reviews, audits, builds, the fan-out).

DO: pass `--context <files|@manifest>` (now built into BOTH `llm-lane.mjs` and `codex-offload-runner.mjs`) — it reads the named files and injects a "PRELOADED CONTEXT — do NOT re-fetch" block before the task. The DISPATCHER picks the files per task, PROPORTIONAL to its blast radius (a security review gets the guard files; a memory review gets the memory organs) — never dump the repo. Budget-capped (`LLM_LANE_CONTEXT_BUDGET=240k`), protected-surface-safe. `--dry-run` reports `contextChars`. Verified: a `--no-tools` lane answered purely from the preloaded file.

DONT: leave the lane to discover its context via search/read_file when you already know the must-reads — it wastes turns and isn't guaranteed. Don't over-load either (dilutes + wastes tokens) — match the pack to the task. Never `--context` a `/tmp` file to a DeepSeek lane (see VERIFIED below).

WHY: it's the single highest-leverage dispatch-quality lever — converts "hope the lane finds the context" into "the lane has the context," faster + more reliable. Owner flagged it reviewing a Codex brief that merely SAID "fully equipped."

VERIFIED LIVE (2026-06-06, marker-echo proof, folded in from the now-superseded [[lane-frontload-verified]]): both Codex (`codex-offload-runner.mjs --context f1,f2`) and DeepSeek (`llm-lane.mjs deepseek --context f1,f2`) frontloading actually FIRES for IN-REPO files, not just prompts the lane to pretend.
- **Codex**: `buildContextPack` reads each file's FULL body (budget 240k chars, `LLM_LANE_CONTEXT_BUDGET`), wraps it in a `===== PRELOADED CONTEXT — already provided, do NOT re-fetch =====` block, and PREPENDS it before `===== TASK =====`. Proven via `--dry-run`: a unique marker from the --context file appeared verbatim in the assembled prompt. The framework spine loads separately via project AGENTS.md (`INHERIT: yuri-origin.md + SOUL.md`) because the full-tier `gpt-5.5` sets `ignoreRules:false`; `--ignore-user-config` only drops the user's ~/.codex, not the project spine.
- **DeepSeek**: injects the full YURI spine as SYSTEM context (`loadout:full-yuri-stack`, ~57k chars / `loadoutChars`) PLUS the `--context` pack (`contextChars`). Proven via a LIVE `--no-tools` marker test: with no tool to open the file, the lane still returned `[PRELOAD-OK] <in-repo-marker>` and obeyed an instruction that existed ONLY inside the preloaded file.
- **CAVEAT (real footgun):** DeepSeek's `llm-lane` `buildContextPack` REFUSES out-of-repo paths — a `/tmp/x.txt` --context file comes back `[blocked: protected surface]` (empty payload), while Codex's pack loads /tmp fine. Every real dispatch uses IN-REPO files (`_SYSTEM/...`, `02_RESOURCES/...`) so this never bit us in practice, but never `--context` a `/tmp` file to a DeepSeek lane — write it in-repo (or pipe via stdin / reference it for the lane's own read tool). Codex task-spec files in /tmp are fine because they're referenced for the lane's tool to read, not frontloaded.
- HOW TO RE-VERIFY: `--dry-run` on either runner (codex shows the assembled prompt; deepseek `--dry-run` prints `{loadoutChars, contextChars}`); or a live `--no-tools` marker-echo with an in-repo file.

STYLE: this is the operating form of [[build-agent-context-loadout]] (proportional loadout) for lanes. SEE: `_SYSTEM/LANE-MANUAL.md` §7a · [[feedback-agent-dispatch-contract]] · [[lane-frontload-verified]] (superseded stub, merged here) · [[feedback-codex-lanes-fully-equipped]] (now [[codex-lanes-fully-equipped]], itself merged into [[self-improvement-loop-is-native-lanes-are-build-muscle]]).
