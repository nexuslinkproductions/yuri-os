---
name: yuri-sentinel
description: "Always-on autonomous check daemon running natively in Musubi. Runs every 33min via LaunchAgent — proactive system health, memory pulse, external signal checks, vault alerts. The 09OC research lane is retired into @deepseek-flash."
triggers:
  - "/yuri-sentinel"
  - "/sentinel"
  - "sentinel check"
  - "sentinel status"
routing_note: "Yuri Sentinel runs autonomously. Use /sentinel to check its last state or trigger a manual run."
---

# Yuri Sentinel — Always-On Autonomous Layer

*Formerly OpenClaw 09OC / Nisaba Sentinel. Fully absorbed into Musubi as of 2026-05-17.*

## What it is

Not a CLI tool to call on. A persistent autonomous process that runs every 33 minutes via LaunchAgent, integrated into Musubi's native loop.

- **Script**: `Scripts/yuri-sentinel.mjs`
- **LaunchAgent**: `com.nudimmud.yuri-sentinel.plist` (in `~/Library/LaunchAgents/`)
- **State**: `.claude/state/yuri-sentinel-state.json`
- **Alerts**: appended to `.claude/state/pulse-vault-log/YYYY-MM-DD.md`

## What it checks every 33 minutes

1. **System health** — pulse-plan.json, pulse-bus.json, hypotheses.json, CRITICAL bus entries
2. **Memory pulse** — runs memory-consolidate.mjs (flags near-duplicates and contradictions)
3. **External signals** — knowledge scout freshness, overdue neuron-loop detection
4. **Gate health** — independence score, launch readiness checks

## Manual trigger

```bash
node Scripts/yuri-sentinel.mjs
```

## What happened to OpenClaw / 09OC / Nisaba?

The 09OC research lane → now just `@deepseek-flash`.
The daemon heartbeat → now `yuri-sentinel.mjs` + LaunchAgent.
The multi-model routing → in offload-contract.mjs.
The identity/SOUL → in SOUL.md.
The memory system → in semantic-memory.db.
The plugin system → in .claude/skills/.

Nothing was lost. Everything was absorbed.

## Session Notes

### 2026-05-17
- session: 109m | peak ctx: 0% | compacts: 0
- tools: Bash×81, mcp×70, Read×40, Edit×39, WebFetch×12, Write×8, ToolSearch×6, TodoWrite×2, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-05-17
- session: 107m | peak ctx: 0% | compacts: 0
- tools: Bash×80, mcp×70, Read×40, Edit×39, WebFetch×12, Write×8, ToolSearch×6, TodoWrite×2, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-05-17
- Renamed from nisaba-sentinel → yuri-sentinel (naming overhaul sprint)
- Triggers updated: /nisaba-sentinel → /yuri-sentinel
- Script and LaunchAgent paths confirmed correct
