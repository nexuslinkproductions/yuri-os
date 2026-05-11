# Yuri OS / NUDIMMUD Session Start Guard

## INHERIT
INHERIT: ../CLAUDE.md
INHERIT: ../SOUL.md

This file is a secondary extension layer for local Claude tooling behavior. If any instruction here conflicts with `../CLAUDE.md`, the higher file prevails.

Canonical repository root:

- `/Users/marcelspatz/NUDIMMUD`

Canonical branch:

- `main`

Before any Yuri OS / NUDIMMUD sprint, audit, validation, cleanup, patch, report, config work, or local CLI task, first verify:

- `pwd` equals `/Users/marcelspatz/NUDIMMUD`
- `git branch --show-current` equals `main`

If either check fails:

- stop immediately
- do not continue the task
- do not switch directories automatically
- do not switch branches automatically
- do not mutate files
- do not stage or commit
- report the mismatch to the owner and ask them to manually reconcile the VS Code workspace / terminal context

Do not treat `/Users/marcelspatz` as the Yuri OS / NUDIMMUD repository root.
Do not run Yuri OS / NUDIMMUD sprint work from `master`.

## Session Boot

When starting with `npm run yuri`, the session automatically loads:
- `.claude/specs/YURI_PROGRESS.md` — living roadmap tracker (guide + reference, not hard rule)
- `.claude/specs/yuri_os_audit_pack/` — spec authority (use to verify coverage)
- `.claude/specs/yuri_os_roadmap/` — rollout plans and enterprise readiness docs
- Roadmap state from `.claude/state/roadmap-state.json` — tracked by the system

**Working posture:** Build incrementally, spec-driven, evidence-backed. Use roadmap as guide. Track and update progress after each session.

## graphify
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.
