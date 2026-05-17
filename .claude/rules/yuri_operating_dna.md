# YURI-OS-MUSUBI Operating DNA — Claude Bridge

INHERIT: _SYSTEM/yuri-origin.md
INHERIT: ../../SOUL.md

This file is a Claude-specific workflow bridge. Shared policy lives in the canonical origin and persona files; do not restate it here.

## On-demand references

- `.claude/rules/research_pipeline.md` - research workflow
- `.claude/rules/skill-creation.md` - skill creation workflow
- `_SYSTEM/Scripts/offload-contract.mjs` - routing and lifecycle contract

## Local exception handling

- Any exception must be explicit, scoped, and logged.
- Local evidence outranks model text.
- If a referenced file is missing, report it rather than inventing a pointer.

## Prompt compression

- Inherit the canonical contract by reference.
- Keep prompts short, evidence-backed, and file-bounded.
