---
name: feedback-commit-pathspec-not-bare-multi-session
description: "In a multi-session repo, bare `git commit` after explicit `git add` STILL sweeps a parallel session's staged files — commit WITH a pathspec (`git commit -- <paths>`), not just add-then-bare-commit."
metadata: 
  node_type: memory
  type: feedback
  tier: 1
  scope: project
  trig: 
    - git commit
    - parallel session
    - shared index
    - git add explicit
    - commit scope
    - multi-lane git
    - accidentally committed
  refs: 
    - "[[proj-parallel-session-hardening-2026-06-13]]"
    - "[[feedback-approved-means-commit-and-push]]"
    - "[[proj-canonical-memory-store-2026-06-14]]"
  originSessionId: b3e309f5-b1ab-4b9b-b13d-ad91a4dbf2e4
---

RULE: When parallel Claude/lane sessions share this working tree, the explicit-pathspec discipline applies to the COMMIT, not just the `git add`. Scope the commit itself: `git commit -m ... -- <path1> <path2> …`. A bare `git commit` (even right after a precise `git add`) commits the ENTIRE staged index — including files another session has `git add`ed.

WHEN: Any commit while a parallel session may be live (the owner runs 2+ sessions on main concurrently — `[[proj-parallel-session-hardening-2026-06-13]]`). The git index is shared mutable state across every session in the same working tree.

DO: (1) `git add <my explicit files>`; (2) `git commit -m "…" -- <the SAME explicit files>` — the trailing pathspec makes git commit only those paths regardless of what else is staged, race-proof against a concurrent `git add`. (3) Before pushing, `git show --stat HEAD` and confirm ONLY your files are in the commit. (4) Prefer a fast-forward push (`git rev-parse HEAD~1 == origin/main`) — it never touches the working tree, so a parallel session's staged/unstaged work is untouched; only rebase --autostash if origin actually moved.

DONT: Don't assume `git add <paths>` bounds the commit — it bounds what YOU stage, not what's staged. Don't run bare `git commit` on a shared tree. Don't `git add .` (already a floor). Don't `git reset --hard` or autostash another session's work away to "clean up"; soft-reset + pathspec-commit preserves their staged files exactly.

WHY: 2026-06-14 — committing the canonical-store Inc 3/4/5 batch, I did a precise `git add` of 9 files then a bare `git commit`. It swept in 4 of the owner's parallel-session staged files (`_SYSTEM/Scripts/math/yuri-energy-*`) → 13 files, not 9. Caught it pre-push via `git show --stat`; the owner then confirmed "i have a parallel session working right now". Fixed with `git reset --soft HEAD~1` + `git commit -- <9 paths>` (their files stayed staged + intact) + FF push. The recovery worked because nothing was pushed yet. <!-- @anchor: v1 | failure: canonical-store Inc3/4/5 commit swept parallel-session energy-math files (2026-06-14) | regression: this memory + the `git commit -- <paths>` habit -->

SEE: [[proj-parallel-session-hardening-2026-06-13]] (multi-lane contention class) · [[feedback-approved-means-commit-and-push]] (the approval/push grant) · [[proj-canonical-memory-store-2026-06-14]] (where it happened).
