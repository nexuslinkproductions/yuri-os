---
handle: no-commit-without-approval-RETIRED
tier: observe
description: "RETIRED 2026-06-14 — superseded by commit-safety-rails. Owner promotion: commit+push the session's own work directly (no approval gate). This file is an inert tombstone; the conditions below never match a real command."
conditions:
  - "bash:*__RETIRED_DIRECTIVE_NEVER_MATCHES__*"
constraints:
  - kind: command_matches
    pattern: "__RETIRED_DIRECTIVE_NEVER_MATCHES__"
    message: "retired — see commit-safety-rails"
---
RETIRED. The `no-commit-without-approval` rule contradicted the owner commit-promotion (2026-06-14:
commit AND push the session's own work directly, git being reversible + tracked). Replaced by
`commit-safety-rails.md`, which guards only the still-forbidden forms (broad `git add .`/`-A`, force-push).
Kept as an inert tombstone because `.claude/` deletes are guard-blocked. Authority for the promotion:
`_SYSTEM/yuri-origin.md` → Mutation Contract · `CLAUDE.md` → Execution Rules · persona behavioral floor.
