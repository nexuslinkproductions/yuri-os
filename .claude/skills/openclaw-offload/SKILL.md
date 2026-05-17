---
name: nisaba-sentinel
description: "Always-on autonomous check daemon absorbed from OpenClaw into Musubi natively. Runs every 33min via LaunchAgent — proactive system health, memory pulse, external signal checks, vault alerts. The 09OC research lane is retired into @deepseek-flash."
triggers:
  - "/nisaba-sentinel"
  - "/sentinel"
  - "nisaba check"
  - "sentinel status"
routing_note: "This is no longer a 'call OpenClaw' skill. Nisaba Sentinel runs autonomously. Use /sentinel to check its last state or trigger a manual run."
---

# Nisaba Sentinel — Always-On Autonomous Layer

*Formerly OpenClaw 09OC. Fully absorbed into Musubi as of 2026-05-17.*

## What it is

Not a CLI tool to call on. A persistent autonomous process that runs every 33 minutes via LaunchAgent, integrated into Musubi's native loop.

- **Script**: `Scripts/nisaba-sentinel.mjs`
- **LaunchAgent**: `_SYSTEM/launch-agents/com.nudimmud.nisaba-sentinel.plist`
- **State**: `.claude/state/nisaba-sentinel-state.json`
- **Alerts**: appended to `.claude/state/pulse-vault-log/YYYY-MM-DD.md`

## What it checks every 33 minutes

1. **Liveness** — OpenClaw gateway at port 18789 (non-fatal, advisory only)
2. **System health** — pulse-plan.json, pulse-bus.json, hypotheses.json, CRITICAL bus entries
3. **Memory pulse** — runs memory-consolidate.mjs (flags near-duplicates and contradictions)
4. **External signals** — knowledge scout freshness, overdue neuron-loop detection

## Manual trigger

```bash
node Scripts/nisaba-sentinel.mjs
```

## Install LaunchAgent (one-time)

```bash
cp _SYSTEM/launch-agents/com.nudimmud.nisaba-sentinel.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.nudimmud.nisaba-sentinel.plist
```

## What happened to OpenClaw / 09OC?

The 09OC research lane → now just `@deepseek-flash` which does the same thing cheaper and faster.
The daemon heartbeat behavior → now `nisaba-sentinel.mjs` + LaunchAgent.
The multi-model routing → already in offload-contract.mjs.
The identity/SOUL → already in SOUL.md.
The memory system → already in semantic-memory.db.
The plugin system → already in .claude/skills/.
The tool approval system → already in non-destructive-infinity-guard.

Nothing was lost. Everything was absorbed.

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

### 2026-05-17
- Converted from openclaw-offload (09OC bridge skill) to native Musubi autonomous layer
- Scripts/nisaba-sentinel.mjs created (461 lines, 5 phases)
- LaunchAgent plist created (every 33min, offset from neuron-loop)
- 09OC research lane retired → @deepseek-flash
- OpenClaw gateway kept running on port 18789 (Sentinel queries it, doesn't replace it)
