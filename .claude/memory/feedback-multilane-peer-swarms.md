---
name: feedback-multilane-peer-swarms
description: "Run nano-swarms MULTI-LANE — Claude(Opus) + Mimo + DeepSeek as co-equal peer workers, not Claude-only fan-outs"
metadata: 
  node_type: memory
  type: feedback
  tier: hard
  scope: dispatch-orchestration
  trig: "nano swarm, fan out, dispatch, agents, workflow, mimo, deepseek, peer lanes, parallel build"
  refs: 
    - feedback-mimo-peer-lane
    - feedback-all-dispatch-through-llm-compat
    - ref-mimo-firing
    - feedback-research-via-mimo-lane
  originSessionId: 7ce507aa-0657-4c74-8e6b-9cf4489ff64c
---

RULE: Nano-swarms run MULTI-LANE by default — Claude (Opus) + Mimo + DeepSeek as co-equal PEER workers sharing real heavy sub-tasks. Not Claude-only fan-outs with the others bolted on as advisory.

WHEN: any nano-swarm fan-out — build, research, review, adversarial verification, synthesis.

DO:
- Dispatch genuine heavy sub-tasks to all three lanes as peers. Claude agents via the native Workflow tool; Mimo + DeepSeek via background Bash lanes running ALONGSIDE the Claude workflow, then synthesize across all lanes (cross-lane adversarial review beats single-lane — diversity catches what one model misses).
- Mimo lane: `node _SYSTEM/Scripts/mimo.mjs "<prompt>"` — UNSANDBOXED (dangerouslyDisableSandbox), keychain key `yuri-mimo-api-key` (MIMO_API_KEY is NOT in env), runs ~10min silent then dumps; REDIRECT to a file (`> f 2>&1`), never pipe (pipe → bare AggregateError). Opus-parity, full ceiling, no cap.
- DeepSeek lane: `node _SYSTEM/Scripts/llm-lane.mjs deepseek "<prompt>" --out <file> [--no-tools] [--reasoning d]` — DEEPSEEK_API_KEY is set in env; model deepseek-v4-pro; ds-flash for lighter. `ds-reason` (via `ai`) adds the disciplined framework-preamble wrapper. llm-lane allowlists api.deepseek.com + token-plan-ams.xiaomimimo.com; `--out` avoids the pipe artifact; `--dry-run` to preview.
- VERIFY a lane is alive (a quick smoke) before relying on it in a swarm — environment/keys/network shift; trust live evidence, not memory.

DONT: default to Claude-only swarms; cap/sideline Mimo or DeepSeek as cheap-fallback/advisory; pipe mimo stdout; treat the recently-updated llm-lane.mjs by old "mimo broken" memory without re-testing; claim a lane is a peer before a live smoke confirms it.

WHY: Marcel standing directive 2026-06-13 — "work closely together with mimo and deepseek lanes as peers in nano swarms." Mimo is Opus-4.7/4.8-parity; DeepSeek is a disciplined reasoning lane. Peer collaboration across lanes = more coverage, real adversarial diversity, and honors the all-dispatch-through-llm-compat contract.

SEE: [[feedback-mimo-peer-lane]] · [[feedback-all-dispatch-through-llm-compat]] · [[ref-mimo-firing]] · [[feedback-research-via-mimo-lane]] · [[proj-alpha-factor-library-2026-06-13]] (AFL build is the live testbed)
