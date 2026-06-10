---
name: codex-lanes-fully-equipped
description: "Codex lanes should run FULLY EQUIPPED like Claude — NOT read-only sandboxed: workspace-write + the full YURI loadout (brain/persona/context/coding-references), so a Codex lane operates BY the framework, not as a bare reviewer (Marcel 2026-06-04)."
metadata: 
  node_type: memory
  type: feedback
  tier: working
  scope: main
  trig: 
    - codex
    - codex lane
    - dispatch
    - red team
    - offload
    - fully equipped
  refs: 
    - "[[feedback_rick_persona_every_dispatch]]"
    - "[[feedback-codex-dispatch-discipline]]"
    - "[[redteam-conscience-findings-2026-06-04]]"
  originSessionId: 9687da2f-45ae-49c4-b0b5-1bc9fbdb6b73
---

RULE: when dispatching Codex lanes, equip them like a Claude lane — do NOT default to `--sandbox read-only`. Give workspace-write (so they can actually fix/build, not just observe) and load the FULL YURI loadout into the packet/context: the brain (CLAUDE.md), persona (`_SYSTEM/persona.md`), SOUL.md, yuri-origin.md, the task context + relevant build docs, the Code Bible (`02_RESOURCES/CODE-BIBLE/`), and coding references / anything else of use. The codex-yuri.sh wrapper already enriches with a session packet + persona — lean into that enriched path, not a bare `codex exec`.

WHEN: any Codex dispatch (red-team, build, review, fix).

DO: build a rich `## CODEX TASK SPEC` packet (Rick preamble + scope + the YURI loadout pointers + coding refs) → dispatch via the enriched lane (workspace-write unless the task is genuinely read-only, e.g. a pure red-team where mutation is owner-gated anyway). The goal: a Codex lane "loads up just as you do."

DONT: dispatch a stripped/sandboxed Codex lane with no framework context — that wastes the lane's capability and produces context-blind output.

WHY: Marcel 2026-06-04 — wants Codex lanes used more again, fully capable, operating BY the framework. Codex = platform (gpt-5.5) not a model; optional independent lane, still advisory until local evidence verifies ([[feedback-codex-dispatch-discipline]]).

SEE: [[feedback_rick_persona_every_dispatch]] · [[controlled-not-cheap-bounded-fanout]]
