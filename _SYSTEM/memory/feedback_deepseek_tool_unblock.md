# Rule: DeepSeek Tools Default ON

**Set:** 2026-05-14
**Severity:** OPERATIONAL RULE — applies to every DeepSeek dispatch

## The Change

DeepSeek lanes (`deepseek`, `deepseek-v4-flash`, `deepseek-v4-pro`) now run with **autonomous tools enabled by default**:

- `bash` — execute shell commands and capture output
- `read_file` — read any file (with optional line cap)
- `write_file` — write content to file (with `evaluateToolCall` safety gate)
- 50-iteration multi-step reasoning loop

Previously these were hardcoded `tools: false`. Discovered 2026-05-14: the tool capability already existed in `Scripts/offload-runner.mjs` (lines 1180–1226, 1318–1453) but was gated off at three call sites.

## Why It Matters

**Before:** DeepSeek = text-only advisory. Could analyze and produce specs, but Codex had to implement.
**After:** DeepSeek = parallel implementer. Can read/write/bash autonomously like Codex.

This makes symbiotic pulse genuinely parallel:
- Codex burst rate-limited → DeepSeek picks up implementation (no waste)
- Codex on slice A while DeepSeek on slice B simultaneously
- DeepSeek runs its own GitNexus impact checks via bash before writing

## When to Use Each Mode

| Need | Lane | Reasoning |
|---|---|---|
| Bounded code change, 1-3 files | `gpt-5.4-mini` | Codex sandbox, fast, cheap |
| Complex multi-file refactor | `gpt-5.5` | Codex full reasoning + workspace-write |
| Multi-file analysis + write | `deepseek-v4-pro` (default tools) | 1M ctx + autonomous tools |
| Pure architecture review | `deepseek-v4-pro --no-tools` | Text-only advisory, no risk |
| Quick triage / classification | `ollama-local` (llama3.2) | Local, free |

## Override Behavior

- Default for deepseek lanes: **`--tools` ON**
- Default for all other lanes: **`--no-tools`** (unchanged)
- User can force either with explicit `--tools` or `--no-tools` flag (`TOOLS_EXPLICIT=1`)

## Verification Commands

```bash
# Default tools-on for deepseek
bash Scripts/offload.sh --dry-run -m deepseek-v4-pro "test" 2>&1 | grep tools
# → "tools": true

# Explicit text-only still works
bash Scripts/offload.sh --dry-run --no-tools -m deepseek-v4-pro "test" 2>&1 | grep tools
# → "tools": false

# Live tool use proven
bash Scripts/offload.sh -m deepseek-v4-pro "use read_file to read <path>, summarize"
# → DeepSeek autonomously calls read_file, returns analysis
```

## Files Changed

- `Scripts/offload-runner.mjs` L726 (`deepseekLane`), L745+L761 (`resolveDeepseekDefaultLane`)
- `Scripts/offload.sh` — added `TOOLS_EXPLICIT` flag + per-lane tool default in dispatch_model + dry_run
- `Scripts/offload-contract.mjs` — `deepseek` lane: `toolsByDefault: true`, expanded `preferredUsage`

## Evidence

User insight 2026-05-14: "deepseek triage is being bottlenecked somehow and not being utilised right".
Investigation confirmed full Codex-equivalent capability hidden behind `tools: false` hardcoded gate.
Live test post-fix: DeepSeek autonomously read RESEARCH/ruflo/v3/mcp/server-entry.ts and produced
import count + purpose summary derived from actual file content.
