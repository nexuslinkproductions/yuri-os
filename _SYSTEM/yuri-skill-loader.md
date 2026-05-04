# Yuri Skill Loader

**advisory_only**: true
**local_truth_claim**: false
**status**: PROTOTYPE — not wired into runtime execution

## Purpose

Prototype skill/doctrine discovery and normalisation for Yuri OS, based on the OpenClaw `~/.openclaw/workspace/skills/<name>/SKILL.md` convention. Uses Yuri's existing `.cline/rules/*.md` structure as the initial substrate.

## Current Discovery Paths

| Path | Source Type | Status |
|---|---|---|
| `.cline/rules/*.md` | `cline_rule` | Active |
| `skills/<name>/SKILL.md` | `openclaw_skill` | Future (OpenClaw-style) |

## Normalisation Schema

Each discovered skill is normalised into:

```
{
  name: string,           // filename without extension, or SKILL.md parent dir name
  source_path: string,    // repo-relative path
  source_type: string,    // cline_rule | openclaw_skill
  body: string,           // full file content
  hash: string,           // SHA-256 prefix (16 hex chars)
  loaded_at: string,      // ISO timestamp of discovery
  collision?: true,       // set when duplicate name exists across discovery paths
  collision_with?: string // source_path of the conflicting skill
}
```

## Collision Rules

- Discovery paths are ordered by precedence (higher-priority paths first).
- First encounter wins. If a skill with the same name exists in a lower-priority path, it is skipped.
- Both the kept and skipped skills are marked with `collision: true` and `collision_with:` pointing to the other.
- No silent overwrite — collisions are always visible in `--list` output.

## CLI

```
node Scripts/yuri-skill-loader.mjs --list
node Scripts/yuri-skill-loader.mjs --skill <name>
node Scripts/yuri-skill-loader.mjs --json
```

## Non-Claims

- This is a discovery/normalisation prototype only.
- No runtime skill execution.
- No plugin API.
- No session integration.
- No agent dispatch wiring.
- No mutation contract enforcement.
- Body is treated as opaque text; no semantic parsing.
