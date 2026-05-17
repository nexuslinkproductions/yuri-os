# Codex Offload Contract Proof

Date: 2026-05-09
Task: 40
Plan: `/Users/marcelspatz/.claude/plans/you-are-an-ai-abundant-cray.md`

## Runtime

- `codex --version`: `codex-cli 0.128.0`
- `codex features list`:
  - `codex_hooks`: stable, true
  - `multi_agent`: stable, true
  - `enable_fanout`: under development, false
  - `tool_search`: stable, true
  - `unified_exec`: stable, true
- `codex mcp list`:
  - `obsidianMcpTools`: enabled
  - `obsidianVault`: enabled
  - `openaiDeveloperDocs`: disabled

## Model Evidence

`codex debug models` locally exposes:

| Model | API supported | Reasoning levels |
|---|---:|---|
| `gpt-5.5` | true | `low`, `medium`, `high`, `xhigh` |
| `gpt-5.4` | true | `low`, `medium`, `high`, `xhigh` |
| `gpt-5.4-mini` | true | `low`, `medium`, `high`, `xhigh` |
| `gpt-5.3-codex` | true | `low`, `medium`, `high`, `xhigh` |

Conclusion: `codex` may default to `gpt-5.5` in this local installation. `codex-mini` may default to `gpt-5.4-mini`.

## Config Schema Evidence

Source: `https://developers.openai.com/codex/config-schema.json`

Top-level supported keys include:

- `[agents]`
- `[hooks]`
- `[mcp_servers]`
- `[features]`
- `model_providers`

Unsupported original v1 keys:

- `[subagents]`
- `provider = "external"`
- `disable_native_fanout`
- `[hooks].pre_action`

Verified supported hook family:

```toml
[[hooks.PreToolUse]]
matcher = "*"
hooks = [{ type = "command", command = "node /path/to/hook.mjs" }]
```

Verified supported agent controls:

- `agents.max_threads`
- `agents.max_depth`
- `features.enable_fanout`
- `features.multi_agent`

## Local Config Probes

- `codex debug prompt-input --disable multi_agent "probe"` completed and removed native agent tool markers from prompt input.
- `codex debug prompt-input -c 'agents.max_threads=1' -c 'agents.max_depth=1' "probe"` completed.
- `codex debug prompt-input -c 'features.enable_fanout=false' "probe"` completed.

Conclusion: use MCP bridge plus `agents.max_threads=1`, `agents.max_depth=1`, `features.enable_fanout=false`, and optionally `--disable multi_agent` for native fan-out control. Do not implement unsupported subagent interception.

## GitNexus Status

Initial `npx gitnexus status` failed with an npm package error. A local GitNexus checkout exists under `NEURAL-NETWORK/GitNexus/gitnexus`.

Recovery actions:

- Installed local GitNexus package dependencies in `NEURAL-NETWORK/GitNexus/gitnexus`.
- Built `gitnexus-shared` and `gitnexus`.
- Rebuilt `@ladybugdb/core`.
- Refreshed stale index with `node NEURAL-NETWORK/GitNexus/gitnexus/dist/cli/index.js analyze --skip-agents-md --no-stats`.

Final status:

- Indexed commit: `7cb2e05`
- Current commit: `7cb2e05`
- Status: up-to-date
- Index: `76,614` nodes, `104,692` edges, `995` clusters, `300` flows

## Pre-Edit Impact

LOW:

- `resolveLane`
- `Function:_SYSTEM/Scripts/offload-runner.mjs:parseArgs`
- `buildInventory`
- `runOpenAICompatibleChat`

UNKNOWN / not indexed:

- `classify_lane`
- `dispatch_model`
- `list_models`
- `run_offload_runner`

Reason: shell functions are not represented as GitNexus symbols in this index. They were attempted before edits and returned `Target not found`.

## Phase 0 Decision

PASS: Phase 0 contract proof supports continuing with v2 implementation.

Hard blockers from v1 remain blocked:

- No `[subagents]` implementation.
- No `disable_native_fanout` implementation.
- No `.codex/hooks/pre-action.mjs`.

Allowed path:

- Add OpenAI Responses lanes to the existing runner.
- Register a Codex-visible MCP bridge.
- Enforce native fan-out limits through supported `[agents]` and `[features]`.
- Use `PreToolUse` hook format from schema.
