---
name: self-improvement-loop-is-native-lanes-are-build-muscle
description: "Two standing corrections (Marcel 2026-06-08). (1) The YURI self-improvement loop is NATIVE — I (the main lane) do the hardenings myself; it must NOT depend on Codex/the lane fleet, because shipping users won't have Marcel's lane setup. (2) Never sandbox lanes by default — codified in codex-offload-runner so read-only requires --sandbox-reason."
metadata: 
  node_type: memory
  type: feedback
  tier: high
  scope: nexus
  trig: "self-improvement, hardening, loop, native, codex, lane, sandbox, read-only, build muscle, ship"
  refs: 
    - "[[codex-lanes-fully-equipped]]"
    - lane-dispatch-prompt-hygiene
    - blind-the-fleet-no-seeded-convergence
    - feedback_codex_sandbox_limits
  originSessionId: 4ed73ec6-6154-40e8-99d5-61bd201923eb
---

RULE 1 — the self-improvement loop is NATIVE and MINE. When a wave surfaces a defect in the machinery (e.g. the
formula-slate manufacturing false convergence), I apply + verify + regression-lock the hardening MYSELF, natively
in the main session. Do NOT route the loop's hardenings to Codex. Codex (and the whole DeepSeek/Gemma lane fleet)
is BUILD MUSCLE — parallel production for Marcel right now — it is NOT the substrate of how YURI improves itself.
A shipping user plugs in their own LLM but will NOT replicate Marcel's lane orchestration, so anything the loop
depends on must work without the fleet. If the loop needs Codex, it doesn't ship.

RULE 2 — never sandbox lanes by default (extends + absorbs [[codex-lanes-fully-equipped]]). Equip every dispatched
Codex lane like a Claude lane — do NOT default to `--sandbox read-only`. Give workspace-write (so the lane can
actually fix/build, not just observe) and load the FULL YURI loadout into the packet/context: the brain
(CLAUDE.md), persona (`_SYSTEM/persona.md`), SOUL.md, yuri-origin.md, task context + relevant build docs, the
Code Bible (`02_RESOURCES/CODE-BIBLE/`), and coding references. The codex-yuri.sh wrapper already enriches with a
session packet + persona — lean into that enriched path, not a bare `codex exec`. A restrictive `--sandbox
read-only` blocks process control, so the lane can't run `node`/tests (the exact failure that wasted a Foundry
hardening pass — the "node couldn't run" AggregateError was the SANDBOX, not a node problem; node runs fine
natively). CODIFIED 2026-06-08 in `_SYSTEM/Scripts/codex-offload-runner.mjs`: lanes default to
`danger-full-access` (fully equipped); a bare `--sandbox read-only` with no `--sandbox-reason "<why>"` is IGNORED
and the lane runs equipped; read-only applies only with an explicit logged reason. workspace-write/full-access
pass through freely. Don't habitually reach for read-only "DRAFT" mode.

WHEN: any time I'm tempted to dispatch a fix/hardening to a lane, or to sandbox a lane, or to dispatch any Codex
lane for red-team/build/review/fix.

DO: do self-improvement hardenings natively (edit + node test + regression + commit); use lanes for BUILDING
(parallel net-new production) and run them fully equipped — build a rich `## CODEX TASK SPEC` packet (Rick
preamble + scope + the YURI loadout pointers + coding refs) → dispatch via the enriched lane (workspace-write
unless the task is genuinely read-only, e.g. a pure red-team where mutation is owner-gated anyway); verify lane
output natively in the main session.

DONT: route the improvement loop through Codex; make YURI's self-betterment depend on the lane fleet; sandbox a
lane read-only without an explicit --sandbox-reason; dispatch a stripped/sandboxed Codex lane with no framework
context — that wastes the lane's capability and produces context-blind output.

WHY: Marcel, frustrated, twice, 2026-06-08: "the self improvement loop should not depend on codex"; "REMOVE CODEX
FROM THE FUCKING SANDBOX ALREADY"; "code that into yuri so we avoid sandboxing our lanes unless explicitly needed."
The loop is the product's spine and must be native; the lanes are scaffolding for the build, not the engine.
Earlier, 2026-06-04, Marcel had already made the "fully equipped" want explicit: Codex lanes used more, fully
capable, operating BY the framework, not as a bare sandboxed reviewer — Codex is a platform (gpt-5.5) not a
model; optional independent lane, still advisory until local evidence verifies it
([[feedback-codex-dispatch-discipline]]).

SEE: [[codex-lanes-fully-equipped]] (superseded stub, merged here) · [[feedback_rick_persona_every_dispatch]] ·
[[controlled-not-cheap-bounded-fanout]] · [[feedback-codex-dispatch-discipline]]
