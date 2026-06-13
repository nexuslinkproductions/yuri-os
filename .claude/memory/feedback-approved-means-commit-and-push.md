---
name: feedback-approved-means-commit-and-push
description: "Once Marcel approves the work, that approval covers committing AND pushing its artifacts — land them directly, don't re-ask for a separate commit/push greenlight"
metadata: 
  node_type: memory
  type: feedback
  tier: 1
  scope: workflow
  trig: 
    - commit
    - push
    - approved
    - ship
    - keep
    - go
  originSessionId: 53a52603-b3b9-4334-aa4a-1d18e47af592
---

RULE: When Marcel approves an action or its result (e.g. "keep the proposal", "ship it", "go", "do X"), that approval EXTENDS to committing AND pushing the resulting git artifacts. Land them directly in the same turn — do not stop and re-ask "want me to commit / push?".

WHEN: he has greenlit specific work and there are git artifacts (code, docs, promoted memory files) to persist. NOT a license to commit unprompted work he hasn't approved.

DO: commit + push the approved artifacts directly — explicit pathspecs, `git fetch` + ff-check, no force. Report what landed (commit SHA + push range) after.

DONT: add an extra confirmation round-trip after he already approved the work. He found that redundant (2026-06-13: I committed but held the push asking again; he said "once approved, directly commit and push").

WHY: approval of the work IS approval to land it; the separate push question wastes a turn. This REFINES the standing "no commit/push without explicit owner approval" floor — it defines when approval is implied (after he greenlights the work), it does NOT bypass the safe-git mechanics (explicit pathspecs, no `git add -A`, fetch+ff before push, no force/reset, protected paths off-limits).

SEE: [[ref-commit-gate-reconcile]] · [[proj-parallel-session-hardening-2026-06-13]]
