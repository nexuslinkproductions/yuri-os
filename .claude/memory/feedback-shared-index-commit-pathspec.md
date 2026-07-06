---
name: feedback-shared-index-commit-pathspec
description: "SUPERSEDED — merged into [[feedback-commit-pathspec-not-bare-multi-session]]. Same rule (bare commit sweeps a parallel session's shared git index), same 2026-06-14 incident window, different commit SHA (e9471aa2)."
metadata: 
  node_type: memory
  type: feedback
  tier: 3
  scope: git / multi-lane commit hygiene
  trig: 
    - git commit
    - shared index
    - parallel session
    - multi-lane
    - explicit pathspec
    - swept foreign files
  refs: 
    - "[[feedback-commit-pathspec-not-bare-multi-session]]"
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

SUPERSEDED by [[feedback-commit-pathspec-not-bare-multi-session]] — see there for the full rule, the merged DO list (including the `git diff --cached --name-only` pre-check this file contributed), and both incident anchors (canonical-store Inc3/4/5 + this file's A4/e9471aa2 sweep). Kept as a stub so existing `[[feedback-shared-index-commit-pathspec]]` links still resolve.
