---
name: feedback-native-spawn-model-routing
description: "Owner directive 2026-06-16: model-pin native Anthropic spawns — Sonnet for substantive agent work, Haiku (heavy) for context/read work; never inherit Opus. Opus = main session only."
metadata:
  node_type: memory
  type: feedback
  tier: 1
  scope: native Agent/Workflow fan-out model selection
  trig: "spawning native Agent/Workflow subagents; choosing a model override for an agent; fan-out planning"
  refs:
    - feedback-research-via-mimo-lane
    - feedback-max-reasoning-fleet-override
    - feedback-peers-means-nano-swarm
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

RULE: When spawning MY OWN native Anthropic agents (Agent tool / Workflow subagents), MODEL-PIN them — never let them inherit the main-loop (Opus) model. **Sonnet** for substantive work (verification/red-team, analysis, design, build-review, anything reasoning-bearing). **Haiku — go heavy** for context/read work (file census, exploration, gathering, grep-and-summarize). **Opus = main session only** (the critical seams, sims, synthesis, owner-facing rulings).

WHEN: any native Agent/Workflow fan-out. Distinct from ollama-cloud nano-swarm peers, which stay cost-routed to their own roster ([[feedback-peers-means-nano-swarm]]: minimax/kimi/nemotron/glm/deepseek-flash).

DO:
- Pass `model: 'sonnet'` for substantive agents; `model: 'haiku'` for read-heavy/context agents.
- In a Workflow, set `agent(prompt, { model: 'sonnet' | 'haiku' })` per task tier; don't leave it to inherit.
- Reserve Opus for the work only the main session should do.

DONT:
- Let native agents inherit Opus by default — it's wasteful on fan-out.
- Sonnet-pin pure context-gathering that Haiku handles fine (go heavy on Haiku there).
- Confuse this with [[feedback-max-reasoning-fleet-override]]: when Marcel says "max reasoning," the WHOLE fleet pins Opus (cost accepted). Absent that, this routing holds.

WHY: Marcel 2026-06-16 — "when you spawn in your own native peers, use sonnet more please, you can go heavy on haiku peers for context work or similar." Refines [[feedback-research-via-mimo-lane]] (which said pin sonnet, never inherit) into a two-tier Sonnet/Haiku split by agent task.

SEE: [[feedback-research-via-mimo-lane]]; [[feedback-max-reasoning-fleet-override]]; [[feedback-peers-means-nano-swarm]].
