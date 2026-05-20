# YURI OS NeMo Guardrails Source Repo Progress

Date: 2026-05-20

## Source

- Official repo: `https://github.com/NVIDIA-NeMo/Guardrails`
- Local checkout: `_SYSTEM/tools/nemo-guardrails`
- Parent repo policy: ignored external checkout, not vendored, not a submodule
- Branch: `develop`
- Commit: `c98f7dfec98af0707983060d73b5fc465ffe4ff5`
- Latest local commit summary: `c98f7df 2026-05-19 19:45:55 -0500 docs: Update Benchmark README with updated configs (#1905)`
- Repo package version in `pyproject.toml`: `0.22.0-rc2`
- README released-version pointer: `0.21.0`

## Evidence Now Available

The earlier browser-harness docs crawl remains useful for rendered documentation coverage. The source repo adds code-level and config-level evidence:

- `README.md` for public project contract and top-level rail concepts.
- `docs/about/rail-types.md` for rail taxonomy.
- `docs/configure-rails/configuration-reference.md` and `docs/configure-rails/yaml-schema/` for configuration shape.
- `docs/configure-rails/guardrail-catalog/` for catalogued guardrail patterns.
- `docs/evaluation/llm-vulnerability-scanning.md` for vulnerability-scan concepts.
- `docs/observability/` for logging, metrics, and tracing.
- `nemoguardrails/rails/llm/` for core runtime rail mechanics.
- `nemoguardrails/actions/`, `nemoguardrails/server/`, and `nemoguardrails/tracing/` for action, API server, and observability implementation details.
- `tests/guardrails/`, `tests/rails/`, `tests/eval/`, and `tests/server/` for executable behavior references.

## YURI Integration Status

- `.gitignore` now excludes `_SYSTEM/tools/nemo-guardrails/`.
- Gate 0 optionally loads upstream source evidence when the checkout exists:
  - `nemo-guardrails-readme`
  - `nemo-guardrails-pyproject`
  - `nemo-guardrails-rail-types`
  - `nemo-guardrails-config-reference`
  - `nemo-guardrails-llmrails`
- The external checkout should be refreshed with `git -C _SYSTEM/tools/nemo-guardrails pull --ff-only` before major guardrail design or audit runs.

## Next Audit Use

Use the source repo for the next supercharge pass in this order:

1. Compare YURI `rails.mjs` against NeMo rail taxonomy and runtime flow.
2. Map NeMo config schema into YURI rail preset schemas without adding `nemoguardrails` as a runtime dependency.
3. Pull concrete test patterns from upstream guardrails/server/eval tests into YURI regression design.
4. Update the YURI NeMo matrix with code-level references, not only rendered docs crawl references.
