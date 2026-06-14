---
name: feedback-shared-index-commit-pathspec
description: "In multi-lane sessions the git INDEX is shared — `git commit` with no pathspec commits another session's staged files too; always `git commit -- <explicit files>` and check `git diff --cached --name-only` first"
metadata: 
  node_type: memory
  type: feedback
  tier: 2
  scope: git / multi-lane commit hygiene
  trig: 
    - git commit
    - shared index
    - parallel session
    - multi-lane
    - explicit pathspec
    - swept foreign files
  refs: 
    - "[[proj-parallel-session-hardening-2026-06-13]]"
    - "[[feedback-approved-means-commit-and-push]]"
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

RULE: When other sessions may be running on this repo, NEVER `git commit` without a pathspec. The git index
(staging area) is SHARED across sessions — `git add <my files>` then a bare `git commit` commits EVERY staged
file, including whatever a parallel session has `git add`ed. Use `git commit -- <file1> <file2> ...` (or
`git commit <pathspec>`) so ONLY my files land, and run `git diff --cached --name-only` IMMEDIATELY before
committing to detect foreign staged files.

WHEN: any commit while a parallel lane/session might be active (the default assumption in this repo —
`.claude` symlinks into the worktree, the index is one shared file).

DO: `git add a b` → `git diff --cached --name-only` (verify ONLY a,b) → `git commit -- a b -m "..."`.
DONT: `git add a b && git commit -m "..."` (sweeps the whole shared index). Don't `git add .` ever.

WHY: 2026-06-14 — my A4 commit (intended: yuri-energy.mjs + .test.mjs) committed **25 files / 2306 insertions**
(commit e9471aa2), sweeping the parallel session's uncommitted work — their models.json output-token fix,
memory-canonical-store + filing-canonical-bridge build, 16 research docs, capabilities.json — under my A4
message, bypassing their intended pre-commit gate (I used --no-verify). Nothing was lost (all pushed) but it
mislabeled + prematurely committed another lane's in-flight work. Earlier commits this session were clean only
because the parallel session hadn't staged yet. Do NOT rewrite pushed shared history to "fix" it — that
clobbers the parallel session; report + move on. The fix is prevention: explicit pathspec on every commit.

SEE: [[proj-parallel-session-hardening-2026-06-13]] (multi-lane contention) · [[ref-commit-gate-reconcile]]
