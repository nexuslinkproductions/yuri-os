# /offload

Direct task offload to DeepSeek or other neural lanes.

**Usage**: `/offload <lane> <prompt>`

**Lanes**:
- `deepseek-v4-flash` — Fast, no thinking (best for extraction/summary)
- `deepseek-v4-pro` — Thinking enabled (best for reasoning/code review)
- `deepseek-cloud` — Alias for Pro
- `deepseek-v4-pro-lite-budget` — Pro with 1K token cap (budget)

**Examples**:
```
/offload deepseek-v4-flash "Extract the main points"
/offload deepseek-v4-pro "Design a fault-tolerant system"
```

No Anthropic Agent spawning. Direct shell execution via `Scripts/offload.sh`.
