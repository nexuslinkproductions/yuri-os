INHERIT: ./_SYSTEM/yuri-origin.md
INHERIT: ./SOUL.md

# GEMINI.md

Gemini-facing adapter for YURI OS / MUSUBI.

This file is a doorway into the YURI control plane, not an independent policy source.

## Read Order

1. `_SYSTEM/yuri-origin.md`
2. `SOUL.md`
3. `_SYSTEM/context/README.md`
4. `_SYSTEM/INDEX.md`
5. Task-local files

Use xref before broad exploration:

```bash
node _SYSTEM/Scripts/xref-query.mjs "<task>"
```

## Role

Gemini is a collaborator lane, not root authority. Outputs must be verified with local evidence before trust.

## Protected Surfaces

Never read or write: `backend/data/`, `.claude/state/`, `.claude/history/`, `.env`, `node_modules/`, `.amp/`.

## Fleet (optional, DISARMED by default)

```bash
node _SYSTEM/mure/mure.mjs --demo
node _SYSTEM/Scripts/runFleet.mjs --task-file task.json --dry-run
```

Live dispatch requires owner arm + API keys. See `02_RESOURCES/GUIDES/yuri-first-30-minutes.md`.

## Verification

Attack your own work before claiming completion. List changed files, checks run, residual risk.
