---
name: feedback-opus-fleet-mure-default-even-for-small-edits
description: Marcel corrected solo-editing small mechanical fixes instead of routing through opus-fleet Agents / MURE — the standing default applies even when a fix looks small
metadata: 
  node_type: memory
  type: feedback
  tier: active
  scope: session-default
  trig: 
    - opus-fleet
    - mure
    - solo edit
    - small fix
    - operating model
  originSessionId: c1feef7b-3504-4448-9c6e-2cc43e2c807c
---

RULE: The opus-fleet standing default (`.claude/skills/opus-fleet/SKILL.md`,
`feedback-standing-fleet-default-orchestration.md`) applies even to fixes that
feel small/mechanical enough to just do solo in the main session. Don't
rationalize "this is only a 2-line edit, dispatching an agent is overhead" —
that judgment call is exactly what the standing default overrides.

WHY: 2026-07-06 session — after a large Workflow-dispatched audit (Phase 3/4/5
+ dream-drain), I made several follow-on fixes (health-aggregator.mjs roster,
two SOUL.md cross-ref corrections) by editing directly in the main session
instead of routing through Agent/opus-fleet. Marcel called this out directly:
"you are supposed to operate by opus-fleet and mure" — a correction on
*standing operating behavior*, not a one-off preference for that task.

MURE CAVEAT (same session, same hour): tried to genuinely "operate by MURE"
for a "what's next" prioritization question by running
`node _SYSTEM/mure/company.mjs --task-file ... --dry-run` with 4 candidate
subtasks. Result: all 4 defaulted to role 'engineer' with a `castRole WARN
matched no role` — MURE's role-casting needs a populated `need` capability
array per subtask to mean anything; without it, the dry-run just proves the
plumbing works, it produces zero real prioritization signal. MURE fits
already-scoped build/execution work cast to capability-matched roles, not
open-ended "which of these should I do first" triage — don't force it there
and call the shrug an answer.

HOW TO APPLY: For any non-trivial task (build, research, audit, multi-file
edit, refactor — the existing skip list is "trivial reads + pure
conversation" only), default to Agent dispatch first and ask "does this
specific action need to happen in the main session" (finalization:
scoped-pathspec commit/push, irreversible/outward calls, CronCreate/CronDelete,
single already-fully-diagnosed one-line patches with zero remaining
uncertainty) rather than "is this small enough to just do myself." Reach for
MURE when the task is genuinely execution/decomposition-shaped (a task that
splits into role-castable subtasks with real capability tags) — recurring/
cron-shaped work and strategic triage/prioritization are NOT that shape (see
[[proj-orderflow-quant-p0-2026-07-06]] dream-drain research for the recurring-
job non-fit, and this file for the triage non-fit).

SEE: [[feedback-standing-fleet-default-orchestration]],
[[feedback-opus-fleet-standing-default]], [[feedback-fanout-self-size]]
(self-sizing still governs HOW WIDE to fan out — it does not license skipping
dispatch entirely for small work).
