---
name: swarm-coordination
description: "Global swarm orchestration for NUDIMMUD. Use when distributing work across agents, model lanes, or handoff steps with shared state."
triggers:
  - "@swarm"
  - "swarm orchestration"
  - "distribute work"
---

# Swarm Coordination

Use this skill when a task should be split across multiple agents or model lanes.

## Core Pattern

- On root session start, load `.Codex/nisaba/learning/global.md` before any routing or decomposition.
- On subagent start, rely on the hook injection and do not duplicate the seed manually.
- Decompose the task.
- Assign one isolated responsibility per lane.
- Track the shared state in the OS kernel or the repo ledger.
- Validate before merge.
- In this repo, let Ruflo handle swarm routing and task fan-out when available.
- Treat `.Codex/nisaba/learning/global.md` as the startup seed for every delegated session.

## Handoff Protocol

- Record handoffs in the shared task/memory store when the workflow uses the kernel.
- Keep context snapshots minimal.
- State success criteria before transfer.
- Define the fallback if the lane fails.

## Roles

- `ENLIL` for decomposition and final integration.
- `NABU` for routing, docs, and memory.
- `ENKI` for implementation.
- `INANNA` for validation and adversarial checks.

## Delegate Triggers

- `/tokenmaxxing` = master activation (preferred). Activates full swarm-default with no trigger word.
- `btw offload this` = legacy delegation signal. Still works, subset of tokenmaxxing.
- Use `@swarm` when the same prompt should be compared across lanes.
- Use parallel lanes when output can be merged without conflict.
- Prefer Ruflo swarm coordination before ad hoc lane fan-out.

## Stop Condition

- If a lane returns ambiguous output, re-scope it before continuing.
- If a lane exposes a conflict, preserve the narrower working set and retry.

## Browser Lanes

Browser lanes are now Active. Use alongside local model lanes in swarm tasks.

### Lane Routing

- `@comet` — UI interaction, screenshot capture, Obsidian Web Clipper
- `@perplexity` — web research, real-time data, citation-backed answers

### Swarm Integration

Add browser lanes as research workers in parallel swarms:

```
ENLIL decomposes task
├── @deepseek   ← local reasoning lane
├── @qwen       ← summarization / extraction lane
└── @perplexity ← web research lane (browser-lane.js)
```

Swarm pattern for research tasks:
1. Decompose task into: reasoning sub-tasks (local lanes) + web lookups (browser lane)
2. Fan-out in parallel (one Agent per lane)
3. Merge results in main session (ENLIL role)

### Code Reference

```javascript
const { routeToBrowser } = require('.Codex/hooks/browser-lane.js');
// Example: route research subtask to perplexity
const result = await routeToBrowser('research topic X', 'perplexity');
```

### Stop Condition

If browser lane unavailable (MCP not connected): fall back to `@deepseek` + web search via Bash curl. Do not block swarm on browser lane failure.

## Session Notes

### 2026-04-27
- session: 6m | peak ctx: 53% | compacts: 0
- tools: Read×27, Bash×8, Write×2, mcp×1
- corrections: none
- errors: none

### 2026-04-27
- session: 8m | peak ctx: 50% | compacts: 0
- tools: Read×41, Bash×15, Write×5, Agent×1
- corrections: none
- errors: none

### 2026-04-26
- session: 2m | peak ctx: 9% | compacts: 0
- tools: Read×31, Bash×15
- corrections: none
- errors: none

### 2026-04-25
- session: 0m | peak ctx: 14% | compacts: 0
- tools: Read×9, Bash×4, Write×2, Edit×2
- corrections: none
- errors: none

### 2026-04-25
- session: 3m | peak ctx: 20% | compacts: 0
- tools: Edit×6, Bash×4, Read×3, Skill×1
- corrections: none
- errors: none

### 2026-04-25
- session: 2m | peak ctx: 8% | compacts: 0
- tools: Read×56, Bash×23, TaskCreate×11, Write×1, ExitPlanMode×1, ToolSearch×1
- corrections: none
- errors: none
