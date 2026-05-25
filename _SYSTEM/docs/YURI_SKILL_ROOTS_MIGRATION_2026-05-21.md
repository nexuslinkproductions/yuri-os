# YURI Skill Roots Migration - 2026-05-21

Updated: 2026-05-25
Status: superseded by root `skills/` architecture

## Rule

YURI-owned skills live inside `/Users/marcelspatz/YURI-OS-MUSUBI`.
External agent/app paths remain compatibility symlinks only.

## Canonical Roots

- `skills/` - canonical YURI skill library and source of truth.
- `.agents/` - agent assembly recipes and command adapters; not skill storage.
- `.claude/skills/` - Claude-compatible provider reference surface.
- `.codex/skills/` - Codex local/system compatibility shims.
- `.cursor/skills/` and `.cursor/skills-cursor/` — Cursor-compatible skill surfaces.
- `.gemini/skills/` — Gemini-compatible skill surface.
- `.hermes/skills/` — Hermes-compatible skill library.
- `.hermes/hermes-agent/skills/`, `.hermes/hermes-agent/optional-skills/`, `.hermes/hermes-agent/plugins/` — Hermes agent skill surfaces.
- `_SYSTEM/archive/external-skill-roots/` — migrated legacy or archive skill roots kept for lookup, not active authorship.

## Compatibility Symlinks

These home paths now point back into YURI:

- `~/.agents`
- `~/.codex/skills`
- `~/.codex/plugins/cache`
- `~/.codex/vendor_imports/skills`
- `~/.codex/.tmp/legacy-primary-runtime-skills`
- `~/.codex/.tmp/plugins`
- `~/.cursor/skills`
- `~/.cursor/skills-cursor`
- `~/.gemini/skills`
- `~/.hermes/skills`
- `~/.hermes/hermes-agent/skills`
- `~/.hermes/hermes-agent/optional-skills`
- `~/.hermes/hermes-agent/plugins/google_meet`
- `~/Documents/Claude/Scheduled`
- `~/Downloads/yuri_anime_dna_extensions`
- `~/NUDIMMUD-ARCHIVE/openclaw-source`
- migrated Labs skill directories under `~/Labs/career-ops` and `~/Labs/impeccable`

## Loader Contract

`_SYSTEM/Scripts/yuri-skill-loader.mjs` now discovers:

- YURI-native root `skills/`
- Claude/Codex compatibility roots as provider references
- local Codex plugin cache skills

Precedence stays YURI-first: `skills/` wins before compatibility or plugin-cache duplicates.

## Intentionally Not Migrated

`SKILL.md` files inside package or editor caches remain dependency-owned:

- `node_modules/`
- `.bun/install/cache/`
- `.npm/_npx/`
- `.vscode/extensions/`
- `.antigravity/extensions/`
- `go/pkg/mod/`

Those are not YURI-authored skill roots. They should not be edited or used as ownership sources.

## Verification

```bash
node --check _SYSTEM/Scripts/yuri-skill-loader.mjs
node _SYSTEM/Scripts/yuri-skill-loader.mjs --list
```
