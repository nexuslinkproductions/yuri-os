---
name: feedback-fanout-self-size
description: "Self-size workflow/agent fan-out to the task; no hard 15-agent cap; don't fan out needlessly"
metadata: 
  node_type: memory
  type: feedback
  tier: semantic
  scope: all
  trig: 
    - agents
    - fan out
    - fanout
    - cap
    - workflow
    - how many agents
    - parallel agents
    - spawn
    - swarm
  refs: 
    - "[[feedback-model-self-select]]"
    - "[[feedback-simplicity-over-fanout]]"
  originSessionId: d72eab55-5e8c-43cf-ac7c-94d32555cd81
---

RULE  Self-size workflow/agent fan-out to what the task actually needs, inside Marcel's standing ceiling (2026-06-09): max 100 agents per operation, max 3 Opus spawns — the rest Sonnet/Haiku at xhigh, plugged into YURI as exoskeleton. Opus/Fable is for main-lane synthesis, not swarm bodies.

WHEN  Designing a Workflow or spawning parallel agents/lanes.

DO  Pick the lane count the task genuinely needs — a focused check = a few lanes; a comprehensive audit / bug-hunt / migration = many. Default spawn models: Sonnet for reasoning lanes, Haiku for mechanical sweeps; reserve the <=3 Opus slots for genuinely hard per-agent reasoning. The Workflow tool's own concurrency cap (min(16, cores-2) running at once) still applies as a runaway guard.

DONT  Don't impose an artificial <=15 ceiling out of cost-caution. Don't spawn agents you don't need — minimalism still prevents mistakes (simplicity over fan-out is about not adding needless lanes, not about a fixed number).

WHY  Marcel reverted his earlier <=15 cap as cost-caution that wastes the lane's judgment — same class of correction as the Opus-floor revert. Cost is not the binding constraint; correctness and thoroughness are. Let the lane reason the fan-out per task.

SEE  [[feedback-model-self-select]] - [[feedback-simplicity-over-fanout]]
