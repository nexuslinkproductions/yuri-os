INHERIT: ./_SYSTEM/yuri-origin.md
INHERIT: ./SOUL.md

# AGENTS.md

Codex-facing adapter for YURI OS / MUSUBI.

This file is a doorway into the YURI control plane, not an independent policy source.

## Read Order

1. `_SYSTEM/yuri-origin.md`
2. `SOUL.md`
3. `_SYSTEM/context/README.md`
4. `_SYSTEM/context/context-registry.json`
5. `_SYSTEM/INDEX.md`
6. task-selected context packet
7. task-local files

Use:

```bash
node _SYSTEM/Scripts/context-router.mjs "<task>"
```

before broad exploration.

## Role

Codex/main is the primary implementation, verification, arbitration, and commit lane when the owner explicitly authorizes commits.

Claude and other model lanes are collaborators, not root authorities. Their outputs must be independently verified before trust.

## Persistent Lane Rule

Claude must be used only through an actual continuous CLI/tmux/PTY session when YURI controls it.

Forbidden for Claude routes:

- SDK calls
- `claude -p`
- `claude --print`
- no-session-persistence prompt calls
- spawning a fresh paid prompt process for each advisory packet

DeepSeek should also prefer a persistent session/lane when available so cache and continuity improve.

## Protected Paths

Never read or write:

- `backend/data/`
- `.claude/state/`
- `.claude/history/`
- `.env`
- `node_modules/`
- `.amp/`

Use wrappers, health services, summaries, or explicit owner-approved migration steps instead.

## Commit Rule

No auto-commit by default. Commit only when the owner asks for it or the active task explicitly includes commit authorization.

Never push unless explicitly requested.

## Cleanup Rule

Do not browse or preserve retired tool identities as active architecture. Promote useful patterns into YURI-owned docs, skills, scripts, or registries, then remove the old surface from default navigation.

Before durable new files or folders become normal operating material, classify them in the registry/context layer.

## Verification

Before claiming completion:

- run the smallest meaningful syntax/test checks
- run secret/protected-surface checks when cleanup or routing changed
- show changed files and commit hash if committed
