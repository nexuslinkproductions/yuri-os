# Yuri OS / Musubi Session Start Guard

INHERIT: ../CLAUDE.md
INHERIT: ../SOUL.md

This file is a secondary extension layer for local Claude tooling behavior. If any instruction here conflicts with `../CLAUDE.md`, the higher file prevails.

Canonical repository root:

- this workspace root

Canonical branch:

- `main`

Before any Yuri OS / Musubi sprint, audit, validation, cleanup, patch, report, config work, or local CLI task, first verify:

- `pwd` resolves to this workspace root
- `git branch --show-current` equals `main`

If either check fails:

- stop immediately
- do not continue the task
- do not switch directories automatically
- do not switch branches automatically
- do not mutate files
- do not stage or commit
- report the mismatch to the owner and ask them to manually reconcile the VS Code workspace / terminal context

Do not treat `/Users/marcelspatz` as the Yuri OS / Musubi repository root.
Do not run Yuri OS / Musubi sprint work from `master`.

## graphify
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.
