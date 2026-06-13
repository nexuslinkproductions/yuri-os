---
name: plan-review
description: Optional human-in-the-loop (HITL) plan/diff review sublane — capture a plan, annotate it, ship structured feedback, and diff plan revisions. Mutually exclusive with the autonomous plan_dispatch_gate. ADVISORY pacing this phase, not a hard block. Use when a human needs to review or annotate an agent plan before dispatch.
triggers:
  - /plan-review
  - human review plan
  - plan annotation
  - HITL plan gate
  - review my plan before dispatch
  - diff plan revisions
---

# plan-review — Human-in-the-loop plan/diff review sublane

OPTIONAL HITL surface. Capture an agent plan, let a human annotate it, ship structured feedback back, and compute a Plan-Diff across resubmissions. Clean-room re-imagining of the plan-annotation idea (github-adoption 2026-06-13, `human-review-sublane`) — no external code copied.

## Posture (read this first)

- **ADVISORY this phase.** When plan-review mode is ON, the PreToolUse guard emits a PACING WARNING on the first post-`ExitPlanMode` mutation. It does NOT hard-block. Whether the changes-requested verdict becomes a real R4 hard gate is an OWNER decision (`02_RESOURCES/RESEARCH/github-adoption-2026-06-13/03-SIM-REDTEAM.md` owner-decisions) and is deliberately not implemented.
- **Mutual exclusion (load-bearing safety invariant).** Plan-review mode and the autonomous `plan_dispatch_gate` NEVER both fire on the same `ExitPlanMode` event. The mode toggle is the single source of truth; the PostToolUse arm site + the two PreToolUse gate-eval sites all exclude off `isPlanReviewMode()`.
- **Fail-loud toggle.** `on`/`off` MUST fail loud on null/corrupt/missing session-state (exit nonzero + stderr + read-back verify) — never a silent no-op.

## CLI

```bash
# Toggle HITL plan-review mode (fail-loud; exits nonzero on bad state)
node _SYSTEM/Scripts/plan-review.mjs on
node _SYSTEM/Scripts/plan-review.mjs off
node _SYSTEM/Scripts/plan-review.mjs status

# Capture a plan revision (auto-increments revision number)
node _SYSTEM/Scripts/plan-review.mjs capture "<plan-id>" "plan text here"
echo "plan text" | node _SYSTEM/Scripts/plan-review.mjs capture "<plan-id>"

# Plan-Diff across two stored revisions (LCS, scale-capped)
node _SYSTEM/Scripts/plan-review.mjs diff "<plan-id>" 0 1
```

Programmatic: `import { isPlanReviewMode, setPlanReviewMode, capturePlan, annotatePlan, computePlanDiff, buildResultLabel } from '_SYSTEM/Scripts/plan-review.mjs'`.

## When to reach for it

- A human wants to review/annotate an agent plan before any mutation is dispatched.
- You want a recorded Plan-Diff showing what actually changed between plan resubmissions.
- You want to PACE the autonomous dispatch loop with a human checkpoint (advisory) instead of the route-plan auto-dispatch.

Do NOT reach for it for routine autonomous work — leave the mode OFF and the existing `plan_dispatch_gate` flow runs unchanged.

## RESULT_LABEL

Emits a BARE Lane Result Grammar label: `09PR_PLAN_REVIEW_<verb>_<X|P|F>_<PASS_COMMITTED|BLOCKED>`. X/P use `PASS_COMMITTED`; F uses `BLOCKED`.

## Session Notes

- 2026-06-13 — created. Tools: Write, Edit, Bash (node --test). Built `_SYSTEM/Scripts/plan-review.mjs` (toggle fail-loud + capture/annotate/diff + LCS scale cap + atomic revision write). Wired mutual exclusion at 3 sites: PostToolUse arm (`post-tool-use.js`), PreToolUse `checkPlanDispatchGate` (site A), opportunistic self-satisfy block (site B), new `checkPlanReviewGate` (site C). Posture ADVISORY (emitWarnings, not emitBlock). No new hook registered — extended the chained hooks in place. capabilities.json regenerated via capability-scan.mjs. No corrections yet. Errors: none at ship. Note: HITL-as-hard-gate is owner-gated and NOT built.
