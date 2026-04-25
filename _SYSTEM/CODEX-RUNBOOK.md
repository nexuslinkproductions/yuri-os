# CODEX RUNBOOK

## Operator Loop

Default loop:
`build -> polish -> audit -> critique`

- `build`: ship the working path first.
- `polish`: improve hierarchy, copy, spacing, typography, motion, and discoverability.
- `audit`: inspect regressions, permissions, security, routing, and operational risk.
- `critique`: force direct feedback. Challenge weak assumptions and surface the remaining fragility.

## Skill Trust Gate

Use this before trusting a new skill or plugin:

1. Check source and maintainer reputation.
2. Read the local `SKILL.md`.
3. Verify what files, commands, APIs, or credentials it can touch.
4. Prefer explicit install and explicit activation.
5. If provenance is weak, keep it in documentation only.

## Shell Shortcuts

- `/setup`
  Opens the operator setup view. Use this to review workflow, trust gate, and execution posture before a major task.
- `/polish`
  Opens the design and UX refinement brief. Use after functionality works.
- `/audit`
  Opens the regression and risk review brief. Use before shipping or after major edits.
- `/critique`
  Opens the direct-feedback mode. Use to stress-test assumptions, copy, and architecture.
- `/status`
  Opens the live system health view. Use to inspect heartbeat, risk, and oracle posture.
- `/result`
  Opens the last oracle result with its current telemetry summary.
- `/cancel`
  Clears transient overlays and closes active operator panels.
- `/ls`
  Opens `PHYSIS` exactly as before.
- `/exec <ALLOWLIST_KEY>`
  Executes an allowlisted backend command exactly as before.

## Feedback Standard

- Prefer honest correction over agreeable drift.
- If something is weak, say it plainly and explain why.
- If confidence is low, mark the answer as provisional.
- If the system is degraded, surface the degraded state instead of smoothing it over.

## Design Standard

- Avoid default-safe UI.
- Use intentional typography and clear signal hierarchy.
- Favor a few meaningful motions over constant animation noise.
- Every operator surface should help decision-making, not just look active.
