---
name: deepseek-offload
description: "Offload task to DeepSeek or other neural lanes (no Agent spawning). Primary DeepSeek entry point — use for flash extraction, pro reasoning, research, and NVIDIA lanes."
triggers:
  - /offload
  - /ds-flash
  - /ds-pro
  - /research
  - /deepseek
  - /nvidia
  - /nvidia-deepseek
routing_note: "Primary lane router. For structured forge/plan/execute orchestration use /deepseek-workhorse. NVIDIA lanes: /nvidia-deepseek (llama-70b), /nvidia-nemotron (requires elevated NIM access)."
---

# DeepSeek Offload Skill

Direct routing to DeepSeek V4 (Flash/Pro) or other neural lanes via `Scripts/offload.sh`. No Anthropic Agent spawning — cost-conscious execution.

## Usage

### Main command: `/offload <lane> <prompt>`

```bash
/offload deepseek-v4-flash "Extract key findings from this report"
/offload deepseek-v4-pro "Reason through this problem step-by-step"
/offload deepseek-cloud "Complex code review with thinking enabled"
```

### Convenience aliases

```bash
/ds-flash "Quick extraction/summarization task"
/ds-pro "Deep reasoning, code review, complex analysis"
/research "Research task routed to best available lane"
```

## Available Lanes

| Lane | Model | Thinking | Tokens | Timeout | Best For |
|------|-------|----------|--------|---------|----------|
| `deepseek-v4-flash` | Flash | No | 4K | 60s | Fast extraction, summaries, simple tasks |
| `deepseek-v4-pro` | Pro | Yes | 8K | 120s | Code review, reasoning, complex analysis |
| `deepseek-cloud` | Pro | Yes | 8K | 120s | Same as Pro (alias) |
| `deepseek-v4-pro-lite-budget` | Pro | No | 1K | 45s | Budget-constrained work |

## Implementation

Routes via `Scripts/offload.sh` → `offload-runner.mjs`. Environment:
- `DEEPSEEK_API_KEY` must be set in `~/.zshrc` (done)
- Falls back to empty key → lane skips with SKIPPED_MISSING_KEY

## Cost Notes

- **Flash**: ~$0.14 / 1M input, $0.28 / 1M output tokens
- **Pro**: ~$0.55 / 1M input, $2.19 / 1M output tokens (thinking adds cost)
- **Pro-lite-budget**: Pro pricing, 1K token cap (cost-effective for triage)

Use Flash for extraction; Pro only for reasoning that needs it.

## Session Notes

### 2026-05-17
- session: 160m | peak ctx: 0% | compacts: 0
- tools: Bash×119, Read×52, Edit×34, Write×5, ToolSearch×2, mcp×1, ExitPlanMode×1, Skill×1
- corrections: none
- errors: none

### 2026-05-17
- session: 157m | peak ctx: 0% | compacts: 0
- tools: Bash×116, Read×52, Edit×34, Write×5, ToolSearch×2, mcp×1, ExitPlanMode×1, Skill×1
- corrections: none
- errors: none

### 2026-05-05
- Skill created, all lanes verified wired
- DeepSeek API key in ~/.zshrc confirmed present
- Live test: `deepseek-v4-flash "What is 2+2?"` → "The answer is 4." ✓
- No Agent() calls used; direct offload.sh routing only
