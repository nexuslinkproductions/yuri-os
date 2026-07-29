---
name: test-result-evidence-linkage
description: "Use before claiming a test/validator/gate result is commit-linked, on origin/main, on a specific sha, green-on-HEAD, or pre-existing — to avoid attributing worktree-derived results to a commit without verifying all inputs. Requires disposable-fresh worktree for clean-checkout reruns (never checkout over an existing path)."
---

# Test/Validator Evidence Linkage

## When to use
Any time you are about to claim a test/validator/gate result is "on <commit>", "commit-linked", "on origin/main", "green on HEAD", or "pre-existing" — i.e. attributing a worktree-derived result to a specific commit or to pre-batch state.

## The rule
A test/validator run executes in the WORKTREE. Its result is WORKTREE-evidence, not commit-evidence. To claim commit-linkage you must do ONE of:
1. Rerun from a FRESHLY CREATED DISPOSABLE worktree at the sha — e.g. `git worktree add --detach <fresh-disposable-path> <sha>`, run the check there, then `git worktree remove --force <fresh-disposable-path>`. NEVER `git checkout <sha>` (or `git -C <existing-path> checkout <sha>`) over an existing worktree/path — that overwrites/destroys uncommitted local state. The fresh path must not pre-exist.
2. Verify EVERY input the check reads is clean vs the commit (`git status --short -- <each input>` = empty).
3. Explicitly qualify: "verified in current worktree" / "worktree-evidence, not commit-linked."

## Common hidden inputs
Validators/tests often read more than the obvious target file. Before claiming the obvious-file-clean check is sufficient, read the validator's source for every `readFileSync`/`readdirSync`/git/spawn/import call:
- Sibling registries (folder-registry.json, context-registry.json, truth-promotion registries).
- The git index (`git ls-files`, staged state).
- Live scanned directories (e.g. `_SYSTEM/Scripts/math/`).
- Nested runtime validator calls and THEIR dependencies.
- The test file itself, the module under test, and shared fixtures.

## Adjacent overclaims to avoid
- "HEAD = origin/main proves clean" — only proves commit alignment, not working-tree-clean or full-gate-green.
- "Text-only diff proves pre-existing" — proves the diff does not change X, not that X predated the batch (needs a pre-batch baseline run).
- "mtime correlation proves ownership/causation" — correlation is not proof.
- "All dirty files are <category>" — verify the full set, not head -N.
- "Owner approval waives checks-green" — CLAUDE.md checks-green-before-push is a binding floor with no owner-waiver; flag rule conflicts, do not silently treat approval as waiver.
- "Definitely pre-existing" / "red on HEAD independently" — without a baseline run these are attribution, not proof.

## Commit vs push
Commit-safe (no regressions introduced for verified scope) is NOT push-ready. Push requires relevant checks GREEN (binding floor). Separate them in handoffs; never let "safe to commit" slide into "ready to push."

## Discipline
Scope every claim to exactly what was verified. Treat inferred-from-diff as attribution, not proof. Keep failing/red checks explicitly visible. When an advisory corrects an overclaim, narrow the phrasing to the verified result rather than restating the broader claim. When persisting a procedure, audit it for destructive operations (checkout-over-existing, reset --hard, rm -rf) and require disposable-fresh equivalents.
