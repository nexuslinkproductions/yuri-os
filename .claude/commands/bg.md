---
name: bg
description: "Background task router. Spawns Agent with run_in_background: true. Invoked by /bg <task> or ctrl+b which inserts [bg] prefix."
trigger: /bg
skill: bg
---

# /bg

Invoke the `bg` skill to spawn a background task immediately.

## Usage

```
/bg <task description>
```

The task spawns as an Agent with `run_in_background: true`. Main thread returns control immediately. One-line confirmation only.

## Behavior Authority

Detailed behavior rules (how tasks are queued, resource limits, when to spawn parallel tasks) are documented in `.claude/skills/bg/SKILL.md`.
