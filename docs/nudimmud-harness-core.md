# NUDIMMUD Harness Core X2

## X3
- status: event recorder and status provider skeleton
- no HUD integration
- no runtime behavior change
- modules added: `Scripts/nudimmud/run-recorder.mjs`, `Scripts/nudimmud/status-line.mjs`
- pure functions only
- no file writes yet
- next phase: X4 HUD reads state instead of owning state, or X3-R if recorder/status provider needs repair

- Status: X2 prompt compiler dry-run support.
- Scope: no HUD integration.
- Behavior: no behavior change.
- Modules added: `Scripts/nudimmud/event-protocol.mjs`, `Scripts/nudimmud/harness-state.mjs`, `Scripts/nudimmud/prompt-compiler.mjs`.
- Authority boundaries:
  - Event protocol: typed event shapes only.
  - Harness state: pure initial state, reducer, and summary helpers.
  - Prompt compiler: inert contract assembly and validation.

X2:

- `compileDryRun` returns contract, validation, metrics, warnings, and blocked state.
- Validation markers: `DRY_RUN_SMALL_PASS`, `DRY_RUN_LARGE_PASS`, `DRY_RUN_BLOCK_GUARD_PASS`.
- No runtime behavior change.
- Next phase: X3 event recorder/status provider.

Future phases:

- X3 event recorder/status provider
- X4 HUD reads state instead of owning state
- X5 stream-json adapter
- X6 budget enforcement
- X7 run history commands
- V verification

Non-claims:

- not integrated
- no runtime behavior change
- no production readiness
- no sandboxing
- no prompt-injection safety guarantee
- no local repo truth beyond this commit's files
