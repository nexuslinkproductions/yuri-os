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

Every generated `.agents/skills/<skill-id>/` adapter also has a deterministic Codex-native `agents/openai.yaml` policy sidecar. `activate-yuri-skills` alone permits implicit invocation; every other governed adapter sets `policy.allow_implicit_invocation: false`. Explicit-only skills remain available through `$skill-id` and through deterministic `skill-recall`, while their metadata is excluded from the default model prompt. This preserves the complete governed catalog without moving, deleting, or duplicating any skill body or adapter.

Run `_SYSTEM/Scripts/yuri-codex-skill-projector.mjs --check` to verify native discovery parity, including every policy sidecar and its manifest hash. Use `--sync` only to regenerate the registered metadata-and-pointer-only projection; sync repairs managed drift in place and never removes stale adapters. Start a fresh Codex session after policy regeneration because a running session retains its launch-time skill catalog.

## Indexes

| Path | Role |
|---|---|
| `skills/domain-index.json` | Ordered domain map for filesystem-first navigation. |
| `skills/skill-index.json` | Machine-readable canonical skill list. |
