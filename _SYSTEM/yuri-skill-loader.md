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


## Integration into Fused Swarm Context

Skills enter the context assembly path through `Scripts/ai` in the `_fused_swarm_extract_evidence_bundle()` function. After surface evidence and vault term matching are appended, the function calls `node Scripts/yuri-skill-loader.mjs --json` and appends active skills as:

```
surface=skills
  SKILL: name=closeout type=cline_rule path=.cline/rules/closeout.md hash=961321b256afb173
  SKILL: name=system-memory type=cline_rule path=.cline/rules/system-memory.md hash=fbee045eefcd6729
```

### What Is Included

- All skills discovered by `yuri-skill-loader.mjs` from current active discovery paths
- Currently: `.cline/rules/*.md` (2 skills: closeout, system-memory)
- Skills appear as compact text entries in the EVIDENCE_BUNDLE

### What Is Intentionally Excluded

- `skills/<name>/SKILL.md` path — not yet activated (future OpenClaw-style)
- Full skill body text — only name/type/path/hash are included to keep context compact
- No execution, dispatch, or tool calling of any kind

### Verification

```bash
# Skills present (default)
bash Scripts/ai @swarm 'query with rules and vault'
grep 'SKILL:' /private/tmp/yuri-artifacts/<run_id>/evidence-bundle.txt

# Skills disabled via env gate
YURI_SKILL_LOADER_DISABLE=1 bash Scripts/ai @swarm 'query with rules and vault'
grep 'SKILL:' /private/tmp/yuri-artifacts/<run_id>/evidence-bundle.txt  # returns empty
```

### Disable Gate

Set `YURI_SKILL_LOADER_DISABLE=1` in the environment to skip skill injection. Useful for debugging or when minimal context is desired.

### Important

This is **doctrine/context injection, not skill execution**. Skills are exposed as read-only text/context material. No runtime execution path was introduced.
