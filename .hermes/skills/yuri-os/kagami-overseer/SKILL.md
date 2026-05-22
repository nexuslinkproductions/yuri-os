---
name: kagami-overseer
description: Query YURI system health, trigger LaunchAgent repair, read Kagami discipline log
version: 1.0.0
metadata:
  hermes:
    tags: [system-health, kagami, yuri-os, monitoring, repair]
    category: yuri-os
    requires_toolsets: [terminal]
---

# Kagami Overseer

## When to Use

- User asks: "is the system healthy?", "why is X agent down?", "restart Y", "what agents are crashed?"
- Any question about YURI LaunchAgent status, crash history, or repair actions

## Procedure

1. Fetch current health state:
   ```bash
   curl -s http://localhost:4242/health.json | python3 -m json.tool
   ```

2. Filter for agents needing attention (not exited_ok / running / gate_failed):
   ```bash
   curl -s http://localhost:4242/health.json | python3 -c "
   import sys, json
   data = json.load(sys.stdin)
   for a in data.get('launchagents', []):
       if a.get('status') not in ['exited_ok', 'running', 'gate_failed']:
           print(a.get('name'), '→', a.get('status'), '|', a.get('last_run_iso', 'never'))
   "
   ```

3. Read recent discipline log:
   ```bash
   tail -30 /Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/monitoring/kagami-discipline.log
   ```

4. If manual repair needed:
   ```bash
   launchctl kickstart -k gui/501/<label>
   ```

5. Report: agent name, status, last_run_iso, action taken, result.

## Key Paths

| Path | Purpose |
|------|---------|
| `http://localhost:4242/health.json` | Real-time LaunchAgent health JSON |
| `_SYSTEM/monitoring/kagami-discipline.log` | Overseer repair/quarantine log |
| `_SYSTEM/monitoring/kagami-ledger.json` | Crash ledger + quarantine state |
| `_SYSTEM/monitoring/kagami-weekly-report.md` | Auto-generated weekly pattern summary |
| `com.yuri.kagami-overseer` | LaunchAgent label for the overseer daemon |

## Verification

- `launchctl list com.yuri.kagami-overseer` — daemon registered + PID present
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:4242/health.json` — returns 200
- `test -f _SYSTEM/monitoring/kagami-discipline.log && echo OK` — log present
