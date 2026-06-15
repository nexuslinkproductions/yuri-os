---
name: feedback-all-dispatch-through-llm-compat
description: "ALL dispatch — external lanes AND my own native Workflow/Agent fan-out — routes through the llm-compat lane, always; never bare codex exec / raw Agent fan-out"
metadata: 
  node_type: memory
  type: feedback
  tier: binding
  scope: dispatch-routing
  trig: 
    - dispatch codex
    - send through codex
    - fan out
    - workflow agents
    - swarm
    - llm compat
    - route external
    - second opinion
  refs: 
    - feedback-codex-dispatch-discipline
    - ref-mimo-firing
    - feedback-fanout-self-size
  originSessionId: d0121710-5fe7-4681-801a-e863c3393975
---

RULE: EVERY dispatch routes through the LLM-compat lane (`ai llm …` / `llm-compat.sh` / the `llm-compat-contract.mjs` contract). Two cases Marcel made absolute (2026-06-13): (1) ANY external dispatch (Codex/gpt-5.5, DeepSeek, Mimo) — always compat, never the bare `codex exec` / `codex-yuri.sh` interactive wrapper. (2) Even my OWN native Workflow/Agent fan-out should route through compat, because the compat surface carries the swarm/lane guidance (routingPriority, preferredUsage, ROLE_MATRIX, lane-result grammar) that gets maximum value out of the agents.

WHEN: any time I'm about to dispatch work off the main thread — a Codex second opinion, a reasoning lane, a research/synthesis lane, or a multi-agent fan-out.

DO:
- Codex review/impl → `ai llm --model gpt-5.5 --reasoning xhigh "<prompt-with-## CODEX TASK SPEC>"` (the spec block is REQUIRED — claude-protocol-guard checks for it; spec template in `_SYSTEM/CODEX_PROTOCOL.md` §2). Prompt rides `LLM_COMPAT_PROMPT_TEXT` env via the offload-runner (no codex-arg stall).
- DeepSeek/Mimo → the same `ai llm <lane>` surface (note: Mimo agentic is broken → see [[ref-mimo-firing]] for the mimo.mjs exception).
- Force a lane with `--model <id>` (review-intent auto-routes to deepseek; force `gpt-5.5` when Marcel says codex). Confirm with `--route-only --dry-run` first.
- `--reasoning xhigh` overrides the gpt-5.5 default (max) — Marcel wants xhigh, not max (see [[feedback-codex-dispatch-discipline]]).
- For a read-only review, instruct DRAFT mode in the spec + verify-and-clean any writes after (gpt-5.5 lane is owner-policy fully-equipped/danger-full-access; llm-compat.sh does NOT forward `--sandbox`, so the read-only wall isn't guaranteed by the flag).

DONT: bare `codex exec` / `codex-yuri.sh`; raw `Agent`/`Workflow` fan-out that skips the compat lane guidance; `claude -p`/`--print`/SDK headless (forbidden separately).

WHY: compat is the single lane/scenario/lifecycle contract (yuri-origin authority §6). Routing everything through it keeps lane selection, reasoning policy, token-ledger tracing, artifact capture, and the swarm guides consistent — and it's where the "get the maximum out of the agents" knowledge lives.

SEE: [[feedback-codex-dispatch-discipline]] · [[feedback-fanout-self-size]] · `_SYSTEM/Scripts/llm-compat-contract.mjs` · `_SYSTEM/CODEX_PROTOCOL.md`
