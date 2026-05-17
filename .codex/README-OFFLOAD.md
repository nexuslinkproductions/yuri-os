# Codex Offload Cutover

## Verify Config

```bash
codex features list
codex mcp list
codex debug prompt-input "NUDIMMUD config probe" >/tmp/nudimmud-codex-probe.json
```

Expected:
- `nudimmudOffload` is enabled.
- `agents.max_threads = 1`, `agents.max_depth = 1`, `features.enable_fanout = false`, and `features.multi_agent = false` parse without warnings.
- `[[hooks.PreToolUse]]` uses `.codex/hooks/pre-tool-use.mjs`.
- `mcp_servers.nudimmudOffload.tool_timeout_sec` stays high enough for long-running offload work; cancellation should be owned by lane-level budgets, not the Codex MCP parent process.

## Lane Cheat Sheet

```bash
Scripts/offload.sh --list
node Scripts/offload-runner.mjs --inventory
```

Core lanes:
- `codex`: OpenAI Responses API, default `gpt-5.5`.
- `codex-mini`: OpenAI Responses API, default `gpt-5.4-mini`.
- `deepseek-v4-pro`: cloud review/architecture fallback.
- `code-local`: local code lane.
- `summarize-local`: local repo research/summarization.
- `triage-local`: local extraction/triage.

## Dry-Run Smokes

```bash
node Scripts/offload-runner.mjs codex --dry-run "ping"
Scripts/offload.sh --intent architecture_review --dry-run "review this module"
Scripts/offload.sh --model codex --dry-run "ping"
```

Live Codex smoke requires `OPENAI_API_KEY`:

```bash
OFFLOAD_PROMPT_TEXT="Return YURI_CODEX_OK only." node Scripts/offload-runner.mjs codex
```

## MCP Smoke

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nudimmud.offload_task","arguments":{"prompt":"ping","intent":"custom","lane_hint":"codex","dry_run":true,"mutation_allowed":false}}}' \
| node .codex/adapters/nudimmud-offload-mcp.mjs
```

Expected: OS_KERNEL task row created, memory log written, and Codex dry-run JSON returned.

## Safety Smokes

```bash
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"echo x > .env","cwd":"/Users/marcelspatz/YURI-OS-MUSUBI"}}' \
| node .codex/hooks/pre-tool-use.mjs --check

printf '%s' '{"tool_name":"Bash","tool_input":{"command":"echo x > /Volumes/T7/probe","cwd":"/Users/marcelspatz/YURI-OS-MUSUBI"}}' \
| node .codex/hooks/pre-tool-use.mjs --check
```

Expected: both return `decision: "deny"` and exit `2`.

## Router Down

If `http://127.0.0.1:3004/api/swarm/route` is down, auto-route fails closed. Use a manual lane:

```bash
Scripts/offload.sh --model summarize-local "summarize this context"
Scripts/offload.sh --model deepseek-v4-pro "review this plan"
Scripts/offload.sh --model codex --dry-run "ping"
```

## Rollback

Edit `.codex/config.toml` and disable the MCP server:

```toml
[mcp_servers.nudimmudOffload]
enabled = false
```

Then remove or comment the `[[hooks.PreToolUse]]` block. This restores native Codex behavior, but OS_KERNEL task/memory logs and offload budgets are no longer authoritative for offload-eligible work.
