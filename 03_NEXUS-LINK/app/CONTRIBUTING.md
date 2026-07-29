# Contributing to the Nexus workbench

One rule above all: **everything ships via pull request.** The PR is the
final verification. No direct pushes to `nexus-workbench` or `main`.

## Flow (human or agent, same rules)

1. Branch off `nexus-workbench`: `feat/<slug>` (or `fix/<slug>`).
2. Build + verify locally. Verification means ran it, saw it work, and can
   paste the evidence (test output, curl output, screenshots).
3. Commit with scoped pathspecs only. No `git add .`, ever.
4. Push the branch, open the PR: `gh pr create --base nexus-workbench`.
   Body: what + why + verification evidence + deviations.
5. Review (Marcel, with adversarial read from a lane if requested) → merge.
6. Loops measure what landed (see LOOPS.md).

## PR body template

```
## What
## Why
## Verification (ran / saw / output)
## Deviations from spec
## Risk (what breaks if this is wrong)
```

## Hard rules

- Marcel merges. Agents open PRs; they do not merge their own.
- Drafts inbox (`00_COMMAND-CENTER/Inbox/`) stays out of git (local state).
- No secrets, tokens, cookies, or credentials in any commit. The pre-commit
  scan must pass; if it trips, the answer is removal, not bypass.
