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
- `.agents/skills/` may contain generated metadata-and-pointer-only discovery adapters. It must never become a source of truth or duplicate canonical skill instructions.

## Codex reachability

Codex bounds the initial model-visible skill metadata, so a long catalog may be shortened or omitted before any skill body is read. YURI does not treat that bounded prompt as the capability inventory. The root `AGENTS.md` recall command is the deterministic reachability anchor: `_SYSTEM/Scripts/skill-recall.mjs` reads governed sources directly (including sparse-hidden tracked blobs), and the selected `SKILL.md` files are then read completely. The early `activate-yuri-skills` adapter is defense in depth only; scanner ordering is not assumed to bypass Codex's metadata budget.

Run `_SYSTEM/Scripts/yuri-codex-skill-projector.mjs --check` to verify native discovery parity. Use `--sync` only to regenerate the registered metadata-and-pointer-only projection.

## Indexes

| Path | Role |
|---|---|
| `skills/domain-index.json` | Ordered domain map for filesystem-first navigation. |
| `skills/skill-index.json` | Machine-readable canonical skill list. |
