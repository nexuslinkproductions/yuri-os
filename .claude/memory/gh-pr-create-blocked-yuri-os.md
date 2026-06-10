---
name: gh-pr-create-blocked-yuri-os
description: "On the yuri-os repo, gh push works but `gh pr create` is permission-blocked even with repo scope — open PRs via the compare URL instead."
metadata: 
  node_type: memory
  type: reference
  tier: 2
  scope: project
  trig: 
    - pr
    - gh pr create
    - push
    - land branch
    - merge
  refs: 
    - feedback-verify-tracked-before-push
  originSessionId: 489e4b10-fbd1-4f6d-bc4c-b39a1cc2ad6f
---

FACTS:
- gh IS installed (v2.92.0 as of 2026-06-05) — the `research_pipeline.md` note "gh is not installed" is STALE; trust local `command -v gh`.
- `gh push` to origin succeeds normally (feature branches push fine).
- `gh pr create` FAILS on `nexuslinkproductions/yuri-os` with `GraphQL: nexuslinkproductions does not have the correct permissions to execute CreatePullRequest`.
- The token has `repo` scope (covers PR), so the block is account/repo-level (likely SSO authorization or fine-grained PAT restriction), NOT a missing scope — retrying gh fails identically.

IMPLICATION: Don't burn an attempt on `gh pr create` for this repo. Commit + push via git/gh as normal, then hand the owner the one-click compare URL: `https://github.com/nexuslinkproductions/yuri-os/compare/main...<branch>?expand=1`, with the PR title + a drafted body file. Owner opens the PR from the GitHub UI.

SEE: [[feedback-verify-tracked-before-push]] — same land-a-branch flow (verify tracked + no untracked-source imports before the push).
