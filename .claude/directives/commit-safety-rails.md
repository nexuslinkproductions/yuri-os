---
handle: commit-safety-rails
tier: observe
description: "Commit/push of the session's OWN work is APPROVED (owner promotion 2026-06-14, git reversible+tracked). These rails still hold: explicit pathspec only — NO broad `git add .`/`-A`/`--all`, and NO force-push."
conditions:
  - "bash:*git add*"
  - "bash:*git push*"
constraints:
  - kind: command_matches
    pattern: "git\s+add\s+(\.|-A|--all)(\s|$)|git\s+push\b[^|;&]*(--force|--force-with-lease|\s-f(\s|$))"
    message: "Broad `git add`/force-push is forbidden even though commit+push is approved: stage with an explicit pathspec (`git add <paths>`), commit scoped (`git commit -- <paths>`), and push fast-forward only (`git fetch` + FF, never --force). A broad add sweeps a parallel session's files; a force-push rewrites shared history."
---
Reconciled 2026-06-14 from the retired `no-commit-without-approval` directive. The owner promotion (commit AND push the session's own work directly, no per-task approval gate) lives in `_SYSTEM/yuri-origin.md` → Mutation Contract, `CLAUDE.md` → Execution Rules, and the persona behavioral floor. This guard no longer blocks plain commit/push; it surfaces (observe-only) the two forms that are still hard-forbidden because they damage a multi-session shared index / shared history. The deterministic `.env` hard-block in bash-security-guard + the settings deny-list remain the hard boundary (the role-based operator-write-guard was removed 2026-06-20); this is a layer-2 advisory conscience. See [[feedback-approved-means-commit-and-push]] · [[feedback-commit-pathspec-not-bare-multi-session]].
