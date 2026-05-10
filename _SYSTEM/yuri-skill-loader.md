# Yuri Skill Loader

**advisory_only**: true
**local_truth_claim**: false
**status**: ACTIVE CONTEXT INJECTION — no runtime skill execution

## Purpose

Skill/doctrine discovery and normalisation for Yuri OS, based on the OpenClaw `~/.openclaw/workspace/skills/<name>/SKILL.md` convention. Uses Yuri's existing `.cline/rules/*.md` and `.claude/skills/` structures as the active substrate.

## Current Discovery Paths

| Path | Source Type | Status |
|---|---|---|
| `.cline/rules/*.md` | `cline_rule` | Active |
| `.claude/skills/*.md` | `claude_skill` | Active |
| `.claude/skills/<name>/SKILL.md` | `claude_skill` | Active |

## Normalisation Schema

Each discovered skill is normalised into:

```
{
  name: string,           // filename without extension, or SKILL.md parent dir name
  source_path: string,    // repo-relative path
  source_type: string,    // cline_rule | claude_skill | openclaw_skill
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

- This is discovery/normalisation and read-only context injection only.
- No runtime skill execution.
- No plugin API.
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
- Currently: `.cline/rules/*.md`, `.claude/skills/*.md`, and `.claude/skills/<name>/SKILL.md`
- Skills appear as compact text entries in the EVIDENCE_BUNDLE

### What Is Intentionally Excluded

- Future external `skills/<name>/SKILL.md` path outside `.claude/skills/` — not yet activated
- Full skill body text in summary metadata — only name/type/path/hash are included there to keep summaries compact
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

### Native Probability Trigger

`Scripts/ai @swarm` treats probability, uncertainty, forecast, expected-value, calibration, risk, and decision language as a skills-context trigger. In those cases, `probabilistic-decision-core` is sorted first in the skills bundle so operational uncertainty doctrine reaches downstream lanes before the bundle line cap.

### Important

This is **doctrine/context injection, not skill execution**. Skills are exposed as read-only text/context material. No runtime execution path was introduced.


## Validation Mode

The skill loader supports hash-based integrity checking:

```bash
node Scripts/yuri-skill-loader.mjs --validate
node Scripts/yuri-skill-loader.mjs --validate --json
node Scripts/yuri-skill-loader.mjs --write-manifest
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
node Scripts/yuri-skill-loader.mjs --write-manifest
```
Generates the initial manifest from the current state of all discovered skills. Run after adding or editing any discovered skill file under `.cline/rules/` or `.claude/skills/`. Commit the manifest alongside skill changes.


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
bash Scripts/ai @swarm 'using rules and vault'
jq '.skill_count, .skills_present, .skills[].name' <artifact_dir>/summary.json
```
