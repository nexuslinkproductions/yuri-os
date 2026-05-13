# CODEX_PROTOCOL

INHERIT: ./_SYSTEM/yuri-origin.md
INHERIT: ./SOUL.md

Canonical Codex policy lives in `_SYSTEM/yuri-origin.md`. This file adds the Claude → Codex task handoff contract for the Claude-first stack.

---

## Role Boundary

**Claude Code** = control plane. Orchestration, hooks, MCP, approval gates, architecture, review, final merge.
**Codex** = implementation lane. Scoped execution of well-defined tickets. No policy decisions.

Never send execution work into Claude Code when it can be specced to Codex. Claude Code context budget is the scarcest resource.

---

## Codex Task Spec Format

Every task dispatched to Codex must use this format. Claude generates the spec; Codex executes it; Claude reviews the diff.

```
## CODEX TASK SPEC

**Goal:** <one-sentence outcome>

**Target files:**
- <path/to/file.ts> — <what changes>
- <path/to/file.ts> — <what changes>

**Constraints:**
- <list exact boundaries: what to NOT touch>
- <dependencies to preserve, interfaces to keep stable>

**Acceptance criteria:**
- [ ] <deterministic check 1 — test name, command, diff expectation>
- [ ] <deterministic check 2>

**Test command:** `<npm run test / specific test path>`

**Rollback boundary:** `git diff <base-sha>` must show only the listed files changed.

**Prohibited:**
- No auto-commit
- No git push
- No changes outside target files
- No new dependencies without explicit approval
```

---

## Verification (Claude-side)

After Codex returns:
1. `git diff` — verify only target files changed
2. Run the test command from the spec
3. GitNexus impact check on changed symbols
4. Only after all pass: request explicit approval for merge
