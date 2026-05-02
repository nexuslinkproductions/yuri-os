# NUDIMMUD Harness Core X1

- Status: X1 skeleton only.
- Behavior: no behavior change.
- Modules added: `Scripts/nudimmud/event-protocol.mjs`, `Scripts/nudimmud/harness-state.mjs`, `Scripts/nudimmud/prompt-compiler.mjs`.
- Authority boundaries:
  - Event protocol: typed event shapes only.
  - Harness state: pure initial state, reducer, and summary helpers.
  - Prompt compiler: inert contract assembly and validation.

Future phases:

- X2 prompt compiler dry-run
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
