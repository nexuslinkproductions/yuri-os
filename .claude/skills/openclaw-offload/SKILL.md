# OpenClaw Offload — 09OC Lane

Trigger: "offload to OpenClaw", "send to 09OC", "background research", "daemon lane", "openclaw this"

## Purpose

OpenClaw/09OC is the daemon-native parallel execution lane. Use it for fire-and-forget reasoning, research, or background work that doesn't require code edits or vault surgery.

## When to Use

**Offload to 09OC:**
- Research / summarization (NABU blueprints, NISABA logs, market analysis)
- Long-running watchers (feed monitoring, periodic health checks)
- Branching exploration (try multiple approaches in parallel)
- Any prompt that benefits from DeepSeek V4 Flash but doesn't need the terminal

**Keep in ENKI/Cline:**
- Code edits, multi-file refactors, security patches
- Vault surgery (file moves, taxonomy changes)
- Git operations (commits, merges)
- Kernel modifications (schema.sql, kernel.py)
- Tasks under 500 tokens — keep it local, it's cheaper

## How to Offload

### 1. Create the task

```bash
python3 _SYSTEM/OS_KERNEL/syscalls/kernel.py task-create "<description>" --agent OPENCLAW
```

### 2. Hand off to 09OC

```bash
bash _SYSTEM/OS_KERNEL/swarm-handoff.sh <task_id> ENKI OPENCLAW "<prompt>"
```

Or use the npm shortcut:

```bash
echo '{"from_agent":"ENKI","channel":"internal:09oc","message":"<prompt>"}' | npm run openclaw
```

### 3. Retrieve the result

```bash
python3 _SYSTEM/OS_KERNEL/syscalls/kernel.py task-update <task_id> COMPLETED?  # check status
```

Then query memory.db for the result:

```sql
SELECT content FROM memories WHERE source_agent='OPENCLAW' AND task_id=<task_id> ORDER BY timestamp DESC LIMIT 1;
```

### 4. Present to user

Format the result cleanly:

```
⬡ 09OC RESULT :: task <id> :: model deepseek-v4-flash
<content>
```

## Batch Offload Pattern

For multiple independent tasks:

```bash
# Create N tasks
for prompt in "<prompt1>" "<prompt2>"; do
  TID=$(python3 _SYSTEM/OS_KERNEL/syscalls/kernel.py task-create "$prompt" --agent OPENCLAW | sed 's/.*Task \([0-9]*\).*/\1/')
  bash _SYSTEM/OS_KERNEL/swarm-handoff.sh "$TID" ENKI OPENCLAW "$prompt" &
done
```

All results appear in memory.db. Cline can poll and summarize.

## Model Selection

Default: `deepseek/deepseek-v4-flash` (fast, cheap, 977k context).  
Override with `--model openrouter/auto` for flexibility or `--model nvidia/llama-3.1-nemotron-70b-instruct` for premium.

## Session Notes

### 2026-05-16
- session: 77m | peak ctx: 0% | compacts: 0
- tools: Bash×88, Read×36, mcp×15, Edit×13, Write×10, ToolSearch×4, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-05-16
- session: 72m | peak ctx: 0% | compacts: 0
- tools: Bash×87, Read×36, mcp×15, Edit×13, Write×10, ToolSearch×4, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-05-16
- session: 57m | peak ctx: 0% | compacts: 0
- tools: Bash×78, Read×23, mcp×14, Write×8, Edit×7, ToolSearch×4, ExitPlanMode×1
- corrections: none
- errors: none
