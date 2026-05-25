# YURI Skill Library

Status: active
Owner: YURI control plane

`skills/` is the canonical root-visible skill library.

This is the source of truth for reusable YURI capabilities. Provider-specific skill folders, plugin caches, and MCP surfaces are import or compatibility sources only.

## Read Order

1. Read `skills/README.md`.
2. Read `skills/domain-index.json` for domain ordering.
3. Read `skills/skill-index.json` for exact skill IDs and paths.
4. Load only the relevant `skills/<skill-id>/SKILL.md` files.

## Rules

- One canonical skill lives at `skills/<skill-id>/SKILL.md`.
- Agent recipes live in `.agents/agent-index.json` and reference skill IDs.
- Provider imports keep provenance in `skill-index.json`.
- Retired compatibility aliases are not promoted as canonical skills.
- Do not recreate `.agents/skills` as a source of truth.

## Indexes

| Path | Role |
|---|---|
| `skills/domain-index.json` | Ordered domain map for filesystem-first navigation. |
| `skills/skill-index.json` | Machine-readable canonical skill list. |

