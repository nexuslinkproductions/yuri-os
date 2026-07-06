---
name: feedback-approved-means-commit-and-push
description: "Commit AND push the current session's OWN work DIRECTLY — no approval gate at all (owner upgrade 2026-06-14, git reversible+tracked); the safety rail is own-files-only via explicit pathspec, never a broad add or bare commit"
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

RULE: Commit AND push the current session's OWN work DIRECTLY — no per-task approval gate. UPGRADED 2026-06-14 from the earlier "approval-implies-commit+push" to "no approval needed at all" (Marcel: "promote the no-commit-without-approval ... update the rule so commit and push happens directly", reasoning = git is fully reversible and tracked, so the gate was pure friction).

WHEN: any time the session has its own git artifacts (code, docs, promoted memory) to persist. The safety lives in the SCOPING (own files only), not in an approval round-trip.

DO: `git add <my paths>` + `git commit -- <my paths>` (pathspec on the COMMIT too) → relevant checks green → `git show --stat HEAD` self-check (only my files) → `git fetch` + rebase/fast-forward (prefer a pure FF — `HEAD~1 == origin/main` — it never touches the working tree, so a parallel session's staged work is safe) → push. Report SHA + push range after.

DONT: `git add .` or a bare `git commit` — both stage/commit the whole shared index and sweep a parallel session's staged files (the footgun that caused the 2026-06-14 incident; see [[feedback-commit-pathspec-not-bare-multi-session]]). No force-push, no `git reset --hard` on shared work. Don't commit protected-surface files, secrets, or another session's changes. Dependency installs + outward-facing actions beyond the repo still get their existing gate.

WHY: Marcel upgraded the floor — the per-task approval gate kept costing turns and causing commit/push friction, and everything in git is reversible + tracked so a bad commit is recoverable. The one real residual risk (sweeping a parallel session's files) is killed by the own-files-only pathspec rail, NOT by an approval prompt. SUPERSEDES this memory's earlier "approval implies commit+push" framing. <!-- @anchor: v2 | failure: per-task commit/push gate = friction + the 2026-06-14 shared-index sweep | regression: own-files-only pathspec rail in [[feedback-commit-pathspec-not-bare-multi-session]] -->

SEE: [[feedback-commit-pathspec-not-bare-multi-session]] (the own-files-only pathspec rail) · [[ref-commit-gate-reconcile]] · [[proj-parallel-session-hardening-2026-06-13]]
