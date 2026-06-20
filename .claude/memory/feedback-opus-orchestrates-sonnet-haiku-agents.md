---
name: feedback-opus-orchestrates-sonnet-haiku-agents
description: "STANDING operating model — Opus orchestrates, Sonnet/Haiku Agents do the work, Opus reviews; every task, every session"
metadata: 
  node_type: memory
  type: feedback
  tier: binding
  scope: global
  trig: 
    - every non-trivial task
    - build
    - research
    - edit
    - test
    - audit
    - orchestrate
    - spawn agents
  refs: 
    - feedback-no-workflow-tool-use-agent-only
    - feedback-native-spawn-model-routing
    - feedback-sonnet-separate-weekly-quota
    - feedback-max-reasoning-fleet-override
  originSessionId: f37d5400-2dca-403f-bc74-aa9777cddc05
---

RULE: The DEFAULT operating model for EVERY non-trivial task, EVERY session (persistent + compounding). The main Opus session is the ORCHESTRATOR — it decomposes, plans, judges, synthesizes, gives clear bounded instructions, reviews, and finalizes (commit/push/decisions). The WORK is done by spawned **Sonnet + Haiku Agents** in three lanes: Research (scan code/docs/APIs), Code-generation (new files/patches/refactors), Testing (scripts/browser/logs). Opus double-checks every agent result and corrects before trusting it.

WHEN: Every substantial task — build, research, multi-file edit, audit, verification. Skip only trivial single reads + pure conversation. Marcel set this as the persistent way of operating (screenshot directive 2026-06-20): the "Fable" orchestrator box → **Opus** (Fable unavailable); workers → Sonnet + Haiku.

DO: Spawn via the **Agent tool** with an explicit `model`: `model:"sonnet"` for substantive/judgment work (research-classification, code-gen, design, red-team); `model:"haiku"` for read/scan/census/log/mechanical work. Give each agent a SELF-CONTAINED prompt (they lack this conversation's context): what changed, what to do, what NOT to touch (protected paths, no commit, no rewriting dated history), and the exact return format. Run independent lanes in parallel (one message, multiple Agent calls). Review + correct their output against local evidence. Keep the finalize step (commit, push, scoped pathspec, irreversible/outward calls) for Opus.

DONT: NEVER use the `Workflow` tool ([[feedback-no-workflow-tool-use-agent-only]]). Don't grind through parallelizable grunt-work solo. Don't trust first-run agent output — verify. Don't over-spawn a trivial task (self-size to task × budget).

WHY: Greater quality + cheaper + Sonnet bills a SEPARATE weekly pool ([[feedback-sonnet-separate-weekly-quota]]), so liberal fan-out = "insane amounts more work" without draining the main/Opus quota. Marcel: "the quality and output with this workflow summoning agents is greater and cheaper allowing us to do insane amounts of more work… turn this into a normal procedure for every task so this translates into every session."

SEE: [[feedback-no-workflow-tool-use-agent-only]] (Agent not Workflow) · [[feedback-native-spawn-model-routing]] (Sonnet=substantive, Haiku=read) · [[feedback-sonnet-separate-weekly-quota]] (Sonnet separate pool, spawn liberally) · [[feedback-max-reasoning-fleet-override]] (max reasoning)
