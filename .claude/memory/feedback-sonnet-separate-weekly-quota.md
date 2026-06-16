---
name: feedback-sonnet-separate-weekly-quota
description: Sonnet native-agent usage bills to a SEPARATE weekly pool from the main/Opus quota — spawn Sonnet agents far more liberally
metadata: 
  node_type: memory
  tier: standing
  scope: claude-lane
  trig: 
    - spawn
    - agent
    - fan-out
    - sonnet
    - model-routing
    - workflow
    - nano-swarm
    - budget
  refs: 
    - feedback-native-spawn-model-routing
    - feedback-max-reasoning-fleet-override
    - feedback-all-dispatch-through-llm-compat
  type: feedback
  originSessionId: 7ce507aa-0657-4c74-8e6b-9cf4489ff64c
---

RULE: Native **Sonnet** agent usage draws from a SEPARATE weekly quota than the overall/main (Opus) weekly usage — so Sonnet lanes are effectively "extra" capacity. Lean on Sonnet agents MUCH more when fanning out.
WHEN: any time I'm deciding whether to spawn native Anthropic agents (Agent tool / Workflow subagents) for substantive work — verification, analysis, design, red-team, breadth, implementation discussion.
DO: default to spawning Sonnet agents generously for substantive sub-work (they don't eat the main pool); size the fan-out to the task without rationing Sonnet the way I'd ration main-session Opus tokens. Still honest self-sizing (task count, not max-deploy).
DONT: don't avoid spawning Sonnet to "save budget" — that's the wrong pool. Don't downgrade substantive work to Haiku purely for cost when Sonnet fits better. Don't burn the SEPARATE pool on trivial known-file reads (those stay inline).
WHY: Marcel confirmed 2026-06-16 he checked — Sonnet is a distinct weekly allowance; under-using it wastes free capacity and bottlenecks on the main pool unnecessarily.
SEE: refines [[feedback-native-spawn-model-routing]] (Sonnet=substantive, Haiku=read/context) — that routing still holds, but the Sonnet side is now "use it a lot more"; [[feedback-max-reasoning-fleet-override]] (Opus-pin only on "max reasoning"); ollama-cloud peers are a separate cost axis [[feedback-all-dispatch-through-llm-compat]].
