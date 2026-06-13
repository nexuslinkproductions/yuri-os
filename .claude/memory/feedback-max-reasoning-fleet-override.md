---
name: feedback-max-reasoning-fleet-override
description: "When Marcel says 'max reasoning' (esp. for NANO SWARM planning/build or other high-stakes work), pin the WHOLE agent fleet to Opus — do NOT sonnet-pin for cost; he accepts the cost for quality"
metadata:
  node_type: memory
  type: feedback
  tier: hot
  scope: claude-behavioral
  trig:
    - max reasoning
    - fleet model
    - sonnet pin
    - opus
    - nano swarm
    - workflow agents
    - agent model
  refs:
    - feedback-research-via-mimo-lane
    - feedback-controlled-not-cheap-bounded-fanout
    - feedback-model-self-select
  type: feedback
  originSessionId: edb85ed5-bc21-4594-8321-aebf593bc5a1
---

RULE: when Marcel says "max reasoning" / "max reasoning only," pin EVERY agent in the fleet (native Workflow/Agent) to Opus — do not sonnet-pin for cost. Cost is accepted; quality wins.
WHEN: high-stakes planning/architecture/build work, esp. the NANO SWARM fabric; any time he explicitly asks for max reasoning. Born 2026-06-13: I launched a NANO-SWARM planning workflow sonnet-pinned (cost reflex from [[feedback-research-via-mimo-lane]]); Marcel corrected "max reasoning only" → stopped + relaunched all-Opus.
DO: set `model: 'opus'` on every `agent()` (or omit to inherit the Opus main loop); keep honest SELF-SIZING (use the count the task decomposes to, e.g. ~44, not the full authorized ceiling of 150) — max reasoning ≠ max headcount.
DONT: sonnet-pin a fleet he flagged max-reasoning; don't silently downgrade to save tokens; don't inflate headcount to the authorized ceiling just because it's allowed.
WHY: the sonnet-pin default exists for COST (one inherited-Opus sprint burned 67% session/50% weekly — [[feedback-research-via-mimo-lane]]). "Max reasoning" is Marcel's explicit override of that cost-default for work where reasoning quality is the point. Owner intent > the cost preference; the cap-the-SCALE rule ([[feedback-controlled-not-cheap-bounded-fanout]]) still holds — bound headcount, max the model.
SEE: [[feedback-research-via-mimo-lane]] · [[feedback-controlled-not-cheap-bounded-fanout]] · [[feedback-model-self-select]]
