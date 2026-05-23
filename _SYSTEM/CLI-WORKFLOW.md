# CLI Workflow

Small launcher for the terminal tools installed in this workspace.

## Entry Point

- `./Scripts/ai`

## Active Commands

- `./Scripts/ai code .`
  - Opens the repo in VS Code.

- `./Scripts/ai claude "question"`
  - Starts Claude if available.
  - Claude is a dormant/optional provider lane, not a required root.

- `./Scripts/ai codex "question"`
  - Starts Codex interactively if no prompt is passed.
  - Runs `codex exec` for one-shot prompts.

- `./Scripts/ai offload "question"`
  - Routes through YURI's lane contract.
  - Preferred path for DeepSeek, Qwen, NIM, local model, and swarm work.

- `./Scripts/ai @deepseek-v4-pro "question"`
  - Dedicated DeepSeek reasoning lane.

- `./Scripts/ai @deepseek-v4-flash "question"`
  - Dedicated DeepSeek fast workhorse lane.

- `./Scripts/ai @swarm "question"`
  - Fan-out through the current active swarm configuration.

- `./Scripts/ai triage "question"`
  - Runs active review lanes in parallel: Claude if available, Codex, and offload swarm.
  - Good for contradiction checks and high-leverage decisions.

## Retired Provider Commands

Gemini, Cursor, Cline, and Windsurf are retired from active YURI routing.
Do not add new docs, rules, or dispatch paths for them. If useful old material exists,
harvest the concept into a YURI-owned skill, doc, or registry entry, then retire the
provider-specific source.

## Suggested Pattern

1. Start from `_SYSTEM/INDEX.md`.
2. Use `./Scripts/ai offload --dry-run "task"` to inspect routing before expensive work.
3. Use `triage` only when the answer is ambiguous or high leverage.
4. Store new durable artifacts according to `_SYSTEM/docs/YURI_STORAGE_AND_ARTIFACT_REGISTRY_PROTOCOL_2026-05-23.md`.
