# Yuri Skill Loader

**advisory_only**: true
**local_truth_claim**: false
**status**: ACTIVE CONTEXT INJECTION — no runtime skill execution

## Purpose

Skill/doctrine discovery and normalisation for Yuri OS. Uses Yuri's root `skills/<name>/SKILL.md` library as the canonical substrate, with provider skill folders as compatibility/reference surfaces.

## Current Discovery Paths

| Path | Source Type | Status |
|---|---|---|
| `skills/<name>/SKILL.md` | `yuri_skill` | Canonical |
| `.claude/skills/*.md` | `claude_skill` | Provider reference |
| `.claude/skills/<name>/SKILL.md` | `claude_skill` | Provider reference |
| `.codex/skills/<name>/SKILL.md` | `codex_skill` | Provider compatibility |
| `.codex/plugins/cache/**/SKILL.md` | `codex_plugin_cache_skill` | Provider/plugin reference |

## Normalisation Schema

Each discovered skill is normalised into:

```
{
  name: string,           // filename without extension, or SKILL.md parent dir name
  source_path: string,    // repo-relative path
  source_type: string,    // yuri_skill | claude_skill | codex_skill | codex_plugin_cache_skill
  body: string,           // full file content
  hash: string,           // SHA-256 prefix (16 hex chars)
  loaded_at: string,      // ISO timestamp of discovery
  collision?: true,       // set when duplicate name exists across discovery paths
  collision_with?: string // source_path of the conflicting skill
}
```

## Collision Rules

- Discovery paths are ordered by precedence (higher-priority paths first).
- First encounter wins. If a canonical skill with the same name appears twice, the duplicate is marked for collision review.
- Provider/reference shadows whose names normalize to an existing root skill ID are omitted so `skills/` remains source truth.
- Provider/reference shadows whose names normalize to an existing root skill ID are omitted so `skills/` remains source truth.

## CLI

```
node _SYSTEM/Scripts/yuri-skill-loader.mjs --list
node _SYSTEM/Scripts/yuri-skill-loader.mjs --skill <name>
node _SYSTEM/Scripts/yuri-skill-loader.mjs --json
```

## Non-Claims

- This is discovery/normalisation and read-only context injection only.
- No runtime skill execution.
- No plugin API.
- No agent dispatch wiring.
- No mutation contract enforcement.
- Body is treated as opaque text; no semantic parsing.


## Integration into Fused Swarm Context

Skills enter the context assembly path through `_SYSTEM/Scripts/ai` in the `_fused_swarm_extract_evidence_bundle()` function. After surface evidence and vault term matching are appended, the function calls `node _SYSTEM/Scripts/yuri-skill-loader.mjs --json` and appends active skills as:

```
surface=skills
  SKILL: name=closeout type=cline_rule path=.cline/rules/closeout.md hash=961321b256afb173
  SKILL: name=system-memory type=cline_rule path=.cline/rules/system-memory.md hash=fbee045eefcd6729
```

### What Is Included

- All skills discovered by `yuri-skill-loader.mjs` from current active discovery paths
- Currently: `skills/<name>/SKILL.md` first, then provider compatibility/reference roots
- Skills appear as compact text entries in the EVIDENCE_BUNDLE

### What Is Intentionally Excluded

- `.agents/skills/` - no longer a canonical source and should not be recreated
- Full skill body text in summary metadata — only name/type/path/hash are included there to keep summaries compact
- No execution, dispatch, or tool calling of any kind

### Verification

```bash
# Skills present (default)
bash _SYSTEM/Scripts/ai @swarm 'query with rules and vault'
grep 'SKILL:' /private/tmp/yuri-artifacts/<run_id>/evidence-bundle.txt

# Skills disabled via env gate
YURI_SKILL_LOADER_DISABLE=1 bash _SYSTEM/Scripts/ai @swarm 'query with rules and vault'
grep 'SKILL:' /private/tmp/yuri-artifacts/<run_id>/evidence-bundle.txt  # returns empty
```

### Disable Gate

Set `YURI_SKILL_LOADER_DISABLE=1` in the environment to skip skill injection. Useful for debugging or when minimal context is desired.

### Native Probability Trigger

`_SYSTEM/Scripts/ai @swarm` treats probability, uncertainty, forecast, expected-value, calibration, risk, and decision language as a skills-context trigger. In those cases, `probabilistic-decision-core` is sorted first in the skills bundle so operational uncertainty doctrine reaches downstream lanes before the bundle line cap.

### Important

This is **doctrine/context injection, not skill execution**. Skills are exposed as read-only text/context material. No runtime execution path was introduced.


## Validation Mode

The skill loader supports hash-based integrity checking:

```bash
node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate
node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate --json
node _SYSTEM/Scripts/yuri-skill-loader.mjs --write-manifest
```

### Manifest Location

`_SYSTEM/skill-hash-registry.json` — repo-local manifest of known skill hashes.

Schema:

```json
{
  "closeout": {
    "source_path": ".cline/rules/closeout.md",
    "hash": "961321b256afb173"
  }
}
```

### Status Meanings

| Status | Meaning | Exit Code |
|---|---|---|
| OK | Hash matches manifest | 0 |
| UNREGISTERED | Discovered but not in manifest | 0 (non-fatal) |
| DRIFT | Hash differs from manifest | 1 |
| MISSING | In manifest but not found on disk | 1 |
| COLLISION | Duplicate name across discovery paths | 1 |

### Integrity

Validation is integrity checking, not authority proof. A matching hash means the file has not changed since the manifest was written — it does not mean the content is correct or safe. Use as a drift detector, not a trust framework.

### Bootstrapping

```bash
node _SYSTEM/Scripts/yuri-skill-loader.mjs --write-manifest
```
Generates the initial manifest from the current state of all discovered skills. Run after adding, moving, importing, or editing any skill under root `skills/`. Commit the manifest alongside skill changes.


## Fused Swarm Observability

Skill registry metadata is emitted into fused swarm artifacts:

### summary.json Fields

| Field | Type | Description |
|---|---|---|
| `skill_count` | int | Number of skills included in the evidence bundle |
| `skills_present` | bool | True when skill_count > 0 |
| `skills` | array | List of skill objects with name, source_type, source_path, hash |

### Behavior

- Default: skills are loaded and `skill_count` > 0, `skills_present` = true, `skills[]` populated.
- `YURI_SKILL_LOADER_DISABLE=1`: `skill_count` = 0, `skills_present` = false, `skills` = [].
- If no skills are discovered, same as disabled output (not an error).
- Skill bodies are NOT included in summary.json — only metadata.
- FUSED_SWARM_SKILL_COUNT is set in the same function that builds the evidence bundle, so it always reflects what was actually appended.

### Verification

```bash
bash _SYSTEM/Scripts/ai @swarm 'using rules and vault'
jq '.skill_count, .skills_present, .skills[].name' <artifact_dir>/summary.json
```
