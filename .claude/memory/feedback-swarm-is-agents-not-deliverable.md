---
name: feedback-swarm-is-agents-not-deliverable
description: "YURI vocab: a 'swarm' (nano-swarm = a set of spawned agents) is the transient EXECUTION VEHICLE, not the code it produces — never say 'built the swarm' for modules; you spawn a swarm, it dissolves, the artifact is the deliverable"
metadata: 
  node_type: memory
  type: feedback
  tier: warm
  scope: claude-behavioral
  trig: 
    - swarm
    - nano swarm
    - swarm sheet
    - built the swarm
    - agent fleet
    - spawn agents
  refs: 
    - feedback-agent-dispatch-contract
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

RULE: in YURI vocabulary a "swarm" is the SPAWNED AGENT FLEET — a "nano-swarm" is one set of agents working together; multiple agent groups = nano-swarms. The swarm is the transient execution VEHICLE, not the artifact. You SPAWN a swarm; it does work; it DISSOLVES. The deliverable is the code/output it produced, named separately.

WHEN: describing multi-agent work (workflows, parallel Mimo/Opus lanes, fan-outs) and what resulted.

DO: say "I spawned a swarm of agents that built <the toolchain/modules/report>"; name the artifact by what it is (e.g. "the energy-weight calibration toolchain — 5 modules"). A "swarm sheet" is the multi-LANE CONTRACT that coordinates the agents (the score), not a thing that gets built.

DONT: say "the swarm is built" / "I built the swarm" when you mean code modules — that conflates the means (agents) with the output (artifact). The swarm is not a deliverable.

WHY: Marcel corrected this 2026-06-13 — "everything spawned as an agent is a 'nano swarm'… what do you mean you built the swarm?" The agents are the orchestra; the swarm sheet is the score; the built toolchain is the music. Keep the three distinct.

SEE: [[feedback-agent-dispatch-contract]]
