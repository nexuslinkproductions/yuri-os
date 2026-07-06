---
name: feedback-circuitry-equipped-lane-dispatch
description: "Equip every dispatched lane with the circuitry self-model + run Codex on enforcing-core as DRAFT(read-only)→I-land; the review caught real draft bugs (Marcel 2026-06-04, called it a big upgrade)"
metadata: 
  node_type: memory
  type: feedback
  tier: working
  scope: main
  trig: 
    - codex dispatch
    - equip lane
    - circuitry
    - draft mode
    - i land
    - enforcing core
    - codex spec
    - read only codex
  refs: 
    - "[[feedback-substrate-cert-loop]]"
    - "[[feedback-build-agent-context-loadout]]"
    - "[[feedback_rick_persona_every_dispatch]]"
    - "[[feedback-observe-codex-process]]"
    - "[[moat-activation-4track-2026-06-03]]"
    - "[[feedback-agent-dispatch-contract]]"
    - "[[feedback-all-dispatch-through-llm-compat]]"
  originSessionId: 17414554-b41b-4c38-b0ff-b4247706def7
---

RULE: Equip every dispatched lane (Codex / agent) with the YURI **circuitry self-model** so it understands *where its target sits + what it ripples into* before touching code — not just the local diff. For HIGH-blast / enforcing-core work, run Codex as **DRAFT (read-only) → I review + land**, never let Codex workspace-write the live gate unsupervised.

WHEN: Dispatching any Codex lane or build agent, especially on the energy gate / breaker / cortex / memory governance (the moat).

DO:
- Hand the read-list FIRST: `_SYSTEM/yuri-graph-state.json` (node + callers + dependents = blast radius) + `02_RESOURCES/RESEARCH/circuitry/BUILD-MANUAL.md` (invariants to preserve), THEN the target file(s)+tests+finding. The canonical packet format + watch-list lives in `_SYSTEM/CODEX_PROTOCOL.md` (rebuilt 2026-06-04; the `claude-protocol-guard` requires a `## CODEX TASK SPEC` block).
- DRAFT mode = `node _SYSTEM/Scripts/codex-offload-runner.mjs --model gpt-5.5 --sandbox read-only --cd "$PWD" ...` (the `--sandbox` override was added 2026-06-04). Large packets → `/tmp/<f>.md` + a short pointer prompt that still contains the literal `## CODEX TASK SPEC`.
- Treat the draft as a hypothesis: VERIFY every helper symbol it calls exists + every anchor matches live code BEFORE applying (attack it like your own work).

DONT: Don't trust a Codex draft's diff blind — it WILL have bugs that look complete. This session: 2 of 3 drafts had real defects the review caught (energy draft referenced `maxLadderInversion` in `claimGateFields` without destructuring it from `cortexSnapshot`; cortex draft left an existing test that codified the very vulnerability it fixed). Don't let Codex apply to the enforcing core directly when "drafts→I land" is the chosen posture.

WHY: The circuitry is YURI's self-model — a lane that reads it stops guessing blast radius and stops siloing. DRAFT→I-land keeps a human-verified gate on the live gate. Empirically the review pays for itself every round (see [[feedback-substrate-cert-loop]]).

SEE: `_SYSTEM/CODEX_PROTOCOL.md` · [[feedback-build-agent-context-loadout]] · [[feedback-substrate-cert-loop]] · [[moat-activation-4track-2026-06-03]] · sibling dispatch rules covering a DIFFERENT dimension (not merged — distinct concerns): [[feedback-agent-dispatch-contract]] (persona-loading), [[feedback-all-dispatch-through-llm-compat]] (routing surface)
