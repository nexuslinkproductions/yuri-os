---
name: codex-sandbox-limits
description: Codex sandbox blocks ~/Library/LaunchAgents/ writes and git commits — route to main thread
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2ab87dd8-f649-4816-bbd0-4565aab40a22
---

Codex lane cannot write to `~/Library/LaunchAgents/` or execute `git commit` (creates .git/index.lock which sandbox blocks).

**Why:** Codex task workers run in a sandbox that restricts writes outside the repo root and prevents git-index mutation. Any plist write to `~/Library/LaunchAgents/` silently produces no output or errors mid-task. Git commits similarly fail with lock errors. Discovered when Codex-generated plist fix produced no files.

**How to apply:** Route ALL of these to main thread explicitly:
- `cat > ~/Library/LaunchAgents/com.*.plist` — main thread only
- `git add + git commit` — main thread only
- `launchctl bootstrap / bootout` — main thread only
When routing Codex tasks that include plist or git steps, scope the Codex task to produce the file content only, and handle the write + bootstrap on main thread.

**Update (2026-06-06): `--sandbox workspace-write` also blocks the `.agents/` tree.** A Codex APPLY lane editing skills got `Operation not permitted` / patch-rejected on `.agents/skills/*/SKILL.md` while `.claude/skills/*` wrote fine — so `.agents/` is denied even though it's inside the repo root. **How to apply:** when an APPLY lane must touch `.agents/` (skill mirrors, agent defs), expect it to silently skip them — finish the `.agents/` mirror on the main thread by hand. Always `git status`-check after an APPLY lane and reconcile what it could NOT write, not just what it did.
