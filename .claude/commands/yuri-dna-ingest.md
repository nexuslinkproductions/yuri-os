---
name: yuri-dna-ingest
description: Composite command for installing and verifying anime DNA extensions
trigger: /yuri dna-ingest
aliases: [/dna-ingest, /anime-dna]
skill: non-destructive-infinity-guard
model: claude-sonnet-4-6
---

# /yuri dna-ingest

Composite command for installing, validating, and integrating anime DNA extensions.

## Usage

```
/yuri dna-ingest [--validate] [--install] [--verify] [--all]
```

## Options

- `--validate` — Check pack structure and schema compliance
- `--install` — Register skills, agents, and commands in `.claude/`
- `--verify` — Confirm startup index and trigger routing
- `--all` — Run all steps (validate → install → verify)

## Workflow

1. **Validate** — Run `validate_extension_pack.py`, check schema compliance
2. **Install** — Copy files to `.claude/skills/`, `.claude/agents/`, `.claude/commands/`
3. **Verify** — Check trigger routing, startup index, command aliases

## Examples

```
/yuri dna-ingest --validate
/yuri dna-ingest --install
/yuri dna-ingest --all
```

## Output

- Pack validation report
- Installation manifest with file checksums
- Startup index verification
- Integration readiness assessment
