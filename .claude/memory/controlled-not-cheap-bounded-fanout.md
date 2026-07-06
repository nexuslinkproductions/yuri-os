---
name: controlled-not-cheap-bounded-fanout
description: "CONTROLLED, not cheap (Marcel 2026-06-04) — do NOT skimp quality to save tokens; instead bound the SCALE of any single spawn. No 36-agent monster fleets. Deliberate bounded fan-out is fine; full quality always."
metadata: 
  node_type: memory
  type: feedback
  tier: working
  scope: main
  trig: 
    - controlled
    - cheap
    - fan out
    - fanout
    - slow down
    - workflow
    - budget
    - agents
  refs: 
    - "[[fanout-self-size]]"
    - "[[feedback-simplicity-over-fanout]]"
  originSessionId: 9687da2f-45ae-49c4-b0b5-1bc9fbdb6b73
---

RULE: when Marcel asks to "slow down" or watch usage, the move is CONTROLLED, not CHEAP — a big difference he called out explicitly (2026-06-04). Keep full quality + full loadout; cut WASTEFUL over-fan-out, not rigor. Bound the scale of any single spawn: a 36-agent Workflow capstone is the thing to NOT repeat. Deliberate, bounded fleets (a handful of agents) + surgical direct work are both fine.

WHEN: any Workflow/Agent fan-out decision, especially under a usage-watch / slowdown directive.

DO: size fleets to the task with a hard ceiling in mind (think single-digit agents, not dozens); prefer pipeline/bounded parallel over sprawling swarms; verify + persist results. Quality stays maxed.

DONT: equate "slow down" with "do cheap/skimpy work" (wrong) — Marcel wants controlled deliberate work. Don't drop adversarial verification, evidence, or loadout to save tokens. Don't spawn 30+ agents.

WHY: Marcel 2026-06-04 — "i dont want cheap, i want controlled rick, big difference." Context: ~42% weekly usage left after a very productive 2-day build (waves 0-1b + dual-platform red-team); efficiency praised, just cap the monster spawns.

SEE: [[fanout-self-size]] · [[codex-lanes-fully-equipped]]
