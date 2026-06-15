---
name: feedback-research-via-mimo-lane
description: "HARD CAP on Anthropic agent fan-outs — max 15 agents, ALL model:sonnet; heavy bulk synthesis goes via the Mimo llm-lane; never let agents inherit the main-loop model in a fleet"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 90a2ad8e-72f4-4f2f-bf66-7066b2bc861b
---

RULE: Anthropic agent fan-outs are allowed but HARD-CAPPED: **maximum 15 agents per fan-out, every agent pinned `model: "sonnet"`** (Sonnet barely touches the weekly limit — 3% while the main pool hit 50%). Heavy bulk research/synthesis that doesn't need Anthropic at all goes via the Mimo lane.
WHEN: Any Workflow/Agent fan-out (deep-research, review fleets, sweeps); any large single-prompt synthesis.
DO: In Workflow scripts pass `{model: 'sonnet'}` on EVERY agent() call and bound items ≤15; for Agent tool set `model: "sonnet"`. Mimo dispatch: `MIMO_API_KEY="$(security find-generic-password -a "$USER" -s yuri-mimo-api-key -w)" node _SYSTEM/Scripts/llm-lane.mjs mimo "<prompt>" --no-tools --out <file>`.
DONT: Never let fleet agents inherit the main-loop model (the deep-research default did exactly that on 2026-06-11: one research sprint wiped ~67% of the 5h session / pushed weekly to 50% — Marcel: "seriously insanely overkill"). Never exceed 15 agents without explicit owner approval.
WHY: The main-pool weekly limit is the scarce resource; Sonnet and Mimo are the workhorses. Model inheritance in fan-outs is a silent cost multiplier.
SEE: [[ref-mimo-integration]], [[feedback-fanout-self-size]], [[controlled-not-cheap-bounded-fanout]]
