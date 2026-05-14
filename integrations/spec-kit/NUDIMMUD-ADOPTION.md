# Spec Kit Adoption Notes for NUDIMMUD

This subtree is a vendored copy of [github/spec-kit](https://github.com/github/spec-kit) under the upstream MIT license.
It stays here as a local workflow reference, not as a replacement for NUDIMMUD's control plane.

## What is preserved

- Upstream Spec Kit docs, templates, presets, workflow definitions, CLI source, and tests.
- Upstream licensing and attribution.

## How it maps into NUDIMMUD

- `specify` becomes the spec-intake step for a brain dump or feature brief.
- `plan` becomes the technical translation step, bounded by local architecture rules.
- `tasks` becomes the execution breakdown step for concrete implementation work.
- `implement` becomes the work dispatch step that still respects local gates and protected surfaces.

## Local authority boundary

Spec Kit is advisory here. The following remain authoritative:

- `AGENTS.md`
- `SOUL.md`
- `_SYSTEM/yuri-origin.md`
- `_SYSTEM/offload-workflow.md`
- `_SYSTEM/offload-contract.mjs`

Local symbiotic pulse and anime-DNA gates still apply before any mutation:

- `/yuri-domain`
- `/yuri-guard`
- `/yuri-zenkai`
- `/yuri-pattern-mirror`
- `/yuri-clone`

## Practical use

- Read the upstream `README.md` for the canonical Spec Kit workflow.
- Use this adoption note when applying that workflow inside NUDIMMUD.
- Prefer local scripts, lanes, and protected-surface rules whenever a task touches workspace code.
