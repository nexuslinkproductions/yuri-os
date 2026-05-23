INHERIT: ./_SYSTEM/yuri-origin.md
INHERIT: ./SOUL.md

# CLAUDE.md

Claude-facing adapter for YURI OS / MUSUBI.

This file exists so Claude Code can inherit the YURI spine when the owner chooses to use it. It does not make Claude the control-plane owner.

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

Claude may act as a co-main collaborator for architecture, coding, critique, and long-context synthesis only when launched as a real continuous CLI session.

Codex/main remains the final verifier and release gate for Claude-produced changes.

## Required Launch Shape

Allowed:

- one real interactive Claude Code session
- tmux/PTY-backed continuity
- bounded packets sent into the live session
- streamed deltas observed by Kagami/Rick

Forbidden:

- Claude SDK calls
- `claude -p`
- `claude --print`
- no-session-persistence prompt calls
- fresh paid prompt processes for advisory packets

## Protected Paths

Never read or write:

- `backend/data/`
- `.claude/state/`
- `.claude/history/`
- `.env`
- `node_modules/`
- `.amp/`

Use wrappers, health summaries, or explicit owner-approved migration steps.

## Execution Rules

- Do not commit or push.
- Do not read secrets.
- Do not touch protected surfaces.
- Do not install dependencies without explicit owner approval.
- Do not run destructive commands.
- For cybersecurity work, stay inside owned or explicitly authorized labs.

## EOT Rule

End-of-transmission work should run through YURI-owned memory/reflection routes, with DeepSeek preferred for background synthesis when available. Do not use small Claude wakeup/background models for EOT.

## Verification

After edits:

- list changed files
- list tests/checks run
- name remaining risks
- hand back to Codex/main for independent verification
