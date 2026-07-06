Invoke the `plan-review` skill — optional human-in-the-loop (HITL) plan/diff review sublane.

Capture a plan, annotate it, ship structured feedback, and diff plan revisions. Mutually exclusive with the autonomous `plan_dispatch_gate` (toggle, never both on the same ExitPlanMode event). ADVISORY pacing this phase — does NOT hard-block.

CLI:
- `node _SYSTEM/Scripts/plan-review.mjs on|off|status` (fail-loud toggle)
- `node _SYSTEM/Scripts/plan-review.mjs capture "<id>" "<plan text>"`
- `node _SYSTEM/Scripts/plan-review.mjs diff "<id>" <revA> <revB>`

Reach for it when a human needs to review/annotate an agent plan before dispatch, or to pace the autonomous loop with a human checkpoint. Full detail: `.claude/skills/plan-review/SKILL.md`.
