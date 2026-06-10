---
name: no-bare-cd-drifts-session-cwd
description: Never bare-cd in Bash; drifts session cwd + breaks relative-path hooks
metadata:
  type: feedback
  tier: semantic
  scope: all
  trig: ["cd", "cwd", "hook error", "module not found", "working directory"]
  refs: ["[[lessons-default-to-memory-write]]"]
---

RULE: Never issue a bare `cd <subdir>` in Bash within YURI — it drifts the persisted session cwd, which Stop/PreToolUse hooks inherit; relative-path hook commands then fail with MODULE_NOT_FOUND and spam the screen.
WHEN: any multi-directory Bash work — cargo builds, greps across crates, git ops in a subtree.
DO: use tool dir-flags (`cargo --manifest-path`, `git -C <dir>`), absolute paths, or an isolated subshell `( cd <dir> && … )` that does not mutate the parent cwd.
DONT: `cd 03_NEXUS-LINK/... && grep ...` as a persisted working-directory change.
WHY: the Bash tool persists cwd across calls; drifting it twice broke the YURI hook stack in one session. The hooks are now hardened to `$CLAUDE_PROJECT_DIR` (cwd-independent), but cwd-stability stays correct hygiene for any relative-path tooling.
SEE: [[lessons-default-to-memory-write]]
