---
name: ref-commit-gate-reconcile
description: How to land a clean commit on YURI-OS-MUSUBI — the pre-commit gate is repo-wide + the working tree is chronically dirty (440+ files)
metadata: 
  node_type: memory
  type: reference
  tier: 2
  scope: project
  trig: 
    - commit
    - push
    - pre-commit
    - gate
    - skill-hash
    - drift
    - root-architecture
    - write-manifest
  refs: 
    - filing-autonomy-layer-2026-06-13
    - verify-tracked-before-push
  originSessionId: cfc909dc-9a78-4c8c-a35e-eb8daa59803c
---

FACTS (verified 2026-06-13, committing the filing system):
- The working tree carries 440+ chronically-dirty files across many sessions. NEVER `git add .` — stage the explicit closure for your task only.
- Pre-commit hook = `.git/hooks/pre-commit` -> `_SYSTEM/git-hooks/pre-commit`. Steps: cached-diff-whitespace, secret-leak-scan, llm-compat-drift, gitnexus-block-normalize, root-architecture, persona-contract, skill-registry, gitnexus-staged-scope.
- `root-architecture.test.mjs` scans the working tree REPO-WIDE by directory (catches UNTRACKED files too), not just staged. A stray untracked file with `const REPO_ROOT = path.resolve(__dirname,'..')` (one `..` short → resolves to _SYSTEM) or the literal absolute repo-root string `/Users/marcelspatz/YURI-OS-MUSUBI` will block ANY commit. Fix: real root = `path.resolve(__dirname,'..','..')` then join `_SYSTEM` explicitly; tests derive abs paths, never hardcode the literal (root-architecture.test.mjs itself is the only allowlisted holder of the literal).
- skill-registry step = `node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate` (stdout→/dev/null in the hook, so run it directly to see WHY). drift>0 blocks. Reconcile with `--write-manifest` (regenerates `_SYSTEM/skill-hash-registry.json`, 236 entries) → validate becomes ok=N drift=0. NOTE: --write-manifest REORDERS the whole registry (cosmetic, ~330-line diff) even for a few real hash changes; the committed registry is often stale-ordered. Commit the regenerated registry + the drifting SKILL.md files TOGETHER (else checkout re-drifts). Session-Notes auto-appends to organ-* skills are the common drift source.
IMPLICATION: to land a clean task commit when the gate is red on PRE-EXISTING foreign drift — (1) stage only your task's explicit file closure, (2) fix repo-wide root-arch violations even in files you don't own (they block everyone), (3) reconcile skill drift via --write-manifest as a SEPARATE chore commit, (4) `--no-verify` is owner-decision only (not for protected/secret; never silent). Marcel's call 2026-06-13: reconcile over --no-verify.
SEE: [[filing-autonomy-layer-2026-06-13]], [[verify-tracked-before-push]]
