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
    - feedback-codex-lanes-fully-equipped
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

RULE 2 — never sandbox lanes by default (extends [[feedback-codex-lanes-fully-equipped]]). A restrictive
`--sandbox read-only` blocks process control, so the lane can't run `node`/tests (the exact failure that wasted a
Foundry hardening pass — the "node couldn't run" AggregateError was the SANDBOX, not a node problem; node runs
fine natively). CODIFIED 2026-06-08 in `_SYSTEM/Scripts/codex-offload-runner.mjs`: lanes default to
`danger-full-access` (fully equipped); a bare `--sandbox read-only` with no `--sandbox-reason "<why>"` is IGNORED
and the lane runs equipped; read-only applies only with an explicit logged reason. workspace-write/full-access
pass through freely. Don't habitually reach for read-only "DRAFT" mode.

WHEN: any time I'm tempted to dispatch a fix/hardening to a lane, or to sandbox a lane.

DO: do self-improvement hardenings natively (edit + node test + regression + commit); use lanes for BUILDING
(parallel net-new production) and run them fully equipped; verify lane output natively in the main session.

DONT: route the improvement loop through Codex; make YURI's self-betterment depend on the lane fleet; sandbox a
lane read-only without an explicit --sandbox-reason.

WHY: Marcel, frustrated, twice, 2026-06-08: "the self improvement loop should not depend on codex"; "REMOVE CODEX
FROM THE FUCKING SANDBOX ALREADY"; "code that into yuri so we avoid sandboxing our lanes unless explicitly needed."
The loop is the product's spine and must be native; the lanes are scaffolding for the build, not the engine.
