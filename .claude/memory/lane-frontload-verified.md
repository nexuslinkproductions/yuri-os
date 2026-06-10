---
name: lane-frontload-verified
description: "VERIFIED LIVE (2026-06-06, marker-echo proof) — both Codex (codex-offload-runner) and DeepSeek (llm-lane) --context frontloading actually FIRES + injects the full YURI spine, for IN-REPO files. Caveat: DeepSeek's llm-lane BLOCKS out-of-repo (/tmp) --context files as 'protected surface'; codex loads them. Never --context a /tmp file to a deepseek lane."
metadata: 
  node_type: memory
  type: reference
  tier: high
  scope: workflow
  trig: 
    - frontload
    - "--context"
    - lane dispatch
    - codex
    - deepseek
    - equipping
    - preloaded context
  refs: 
    - codex-sandbox-limits
    - feedback-codex-lanes-fully-equipped
    - feedback_codex_dispatch_prompt_size
  originSessionId: 4ed73ec6-6154-40e8-99d5-61bd201923eb
---

FACTS (empirically proven, not assumed — Marcel asked to verify the frontloading fires, not just that we prompt the lanes):
- **Codex** (`codex-offload-runner.mjs --context f1,f2`): `buildContextPack` reads each file's FULL body (budget 240k chars, `LLM_LANE_CONTEXT_BUDGET`), wraps it in a `===== PRELOADED CONTEXT — already provided, do NOT re-fetch =====` block, and PREPENDS it to the prompt before `===== TASK =====`. Proven via `--dry-run`: the unique marker from the --context file appeared verbatim in the assembled prompt. The framework spine loads separately via project **AGENTS.md** (`INHERIT: yuri-origin.md + SOUL.md`) because the full tier `gpt-5.5` sets `ignoreRules:false` ("maximum features"); `--ignore-user-config` only drops the *user's* ~/.codex, not the project spine.
- **DeepSeek** (`llm-lane.mjs deepseek --context f1,f2`): injects the full YURI spine as SYSTEM context (`loadout:full-yuri-stack`, ~57k chars / `loadoutChars`) PLUS the `--context` pack (`contextChars`). Proven via a LIVE `--no-tools` marker test: with no tool to open the file, the lane still returned `[PRELOAD-OK] <in-repo-marker>` and obeyed an instruction that existed ONLY inside the preloaded file → the content reached the model and it acted on it.

CAVEAT (real footgun): DeepSeek's `llm-lane` `buildContextPack` REFUSES out-of-repo paths — a `/tmp/x.txt` --context file comes back `[blocked: protected surface]` (empty payload), while codex's pack loads /tmp fine. Every real dispatch uses IN-REPO files (`_SYSTEM/...`, `02_RESOURCES/...`) so this never bit us, but: never `--context` a `/tmp` file to a deepseek lane — write it in-repo (or pipe via stdin / reference it for the lane's own read tool). Codex task-spec files in /tmp are fine because they're referenced for the lane's tool to read, not frontloaded.

HOW TO RE-VERIFY: `--dry-run` on either runner (codex shows the assembled prompt; deepseek `--dry-run` prints `{loadoutChars, contextChars}`); or a live `--no-tools` marker-echo with an in-repo file.

SEE: [[codex-sandbox-limits]] (the .agents/ workspace-write block is a sibling limit), [[feedback-codex-lanes-fully-equipped]].
