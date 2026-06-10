---
name: feedback-verify-tracked-before-push
description: Before push, confirm imported files are TRACKED (no untracked source remains), not just test-green-on-disk — committed code can import untracked files; root-arch lint is repo-wide; separate source from noise+broken mods
metadata:
  type: feedback
  tier: semantic
  scope: all
  trig: ["commit", "push", "git add", "untracked", "dangling import", "pre-commit", "fresh clone", "what to commit", "staging"]
  refs: ["[[feedback-clean-structure-no-clutter]]", "[[feedback-explain-dont-just-label]]"]
---

RULE: Before commit/push, verify every depended/imported file is TRACKED (no untracked source remains: `git status --short | grep '\.mjs$'`), not merely that tests pass on disk. Committed code can import UNTRACKED files → dangling imports that break a fresh clone while passing locally. Test-green-on-disk ≠ repo-complete.
WHEN: any commit, especially staging-by-hand or when modules were built in a prior uncommitted session.
DO: after staging, confirm `git status` leaves only generated/runtime noise; for new importers, grep their imports and confirm each target is staged/tracked; treat "no source files left uncommitted" as the completion gate.
DONT: trust a passing test suite as proof the commit is complete (tests read disk, not the index); blanket-exclude files by hand without checking what depends on them.
EXTRA LESSONS (this session): (1) the root-architecture pre-commit lint is REPO-WIDE — a violation in ANY tracked file (e.g. memory-evict REPO_ROOT mislabel, AGENTS/CLAUDE gitnexus .claude/skills links) blocks the commit; check repo health before a big commit. (2) When committing "all our work," separate authored SOURCE from generated/runtime noise (logs, telemetry, .claude/tasks, build target/, .bak) AND from BROKEN modifications (claude-plugin-parity-check had failing tests — flag, don't silently ship). (3) The gitnexus hook can re-clobber canonical skill links in AGENTS.md/CLAUDE.md (regression) — repoint to skills/gitnexus-*/SKILL.md.
SEE: [[feedback-clean-structure-no-clutter]], [[feedback-explain-dont-just-label]], [[verification-before-completion]]
