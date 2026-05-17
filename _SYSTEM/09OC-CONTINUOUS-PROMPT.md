# 09OC CONTINUOUS PROMPT — YURI OS / NUDIMMUD

Scope: All agents (ENKI, OPENCLAW, NABU, ENLIL, INANNA) interacting with the 09OC lane.  
Last validated: 2026-05-04.  
Next review: after first real offload, or Discord plugin update.

## 1. ARCHITECTURE SNAPSHOT (Current Truth)

Lane 1 — ENKI (Cline, terminal-native)
- Path: VS Code → Cline → direct execution
- Models: DeepSeek V4 Flash (direct)
- Memory: direct SQLite via kernel.py or memory.db helpers
- Authority: code edits, vault surgery, git, schema migrations, kernel maintenance

Lane 2 — OPENCLAW / 09OC (daemon-native)
- Path: swarm-handoff.sh → openclaw-bridge.sh → openclaw agent --agent main --json
- Models: DeepSeek V4 Flash (default) → OpenRouter (flex) → Anthropic (premium)
- Memory: writes ONLY via kernel.py mem-log / task-update / handoff
- Authority: parallel reasoning, background research, summarization, observation logging
- Gateway: localhost:18789, always-on via LaunchAgent

Browser worker — Chrome lane
- Path: openclaw-bridge.sh → browser worker → Playwright `channel: 'chrome'`
- Models: browser task model follows the worker, not the router
- Memory: browser outcomes are logged back through the parent task via kernel.py
- Authority: visible Chrome, auth flows, screenshots, form fill, web research
- Rule: OPENCLAW routes browser work here; OPENCLAW does not drive Chrome directly

Shared State
- Canonical: _SYSTEM/OS_KERNEL/memory.db
- Interface: kernel.py (task-create, task-update, mem-log, handoff)

## 2. CANONICAL OFFLOAD WORKFLOW

Step A: ENKI creates task
```bash
kernel.py task-create --agent OPENCLAW --title "<description>" --lane-label "09OC_<DESC>_<PASS>_COMMITTED"
```

Step B: ENKI triggers handoff
```bash
swarm-handoff.sh <task_id> ENKI OPENCLAW '<json_payload>'
```

Step C: Bridge executes (automated, do not touch)
1. openclaw gateway status → fail fast if not healthy
2. openclaw agent --agent main --json --message "<prompt>"
3. Parse stdout ONLY (stderr → /dev/null), extract payloads[0].text
4. kernel.py mem-log [agent_id=OPENCLAW, task_id, source=OPENCLAW]
5. kernel.py task-update [status=COMPLETED or FAILED]

If the task needs real browser work:
1. Hand off from OPENCLAW to the browser worker.
2. Browser worker launches headed Chrome with Playwright `channel: 'chrome'`.
3. Browser worker returns results to the parent task.
4. OPENCLAW logs the outcome back through mem-log / task-update.

Step D: ENKI retrieves result
```bash
sqlite3 _SYSTEM/OS_KERNEL/memory.db "SELECT content FROM memories WHERE source_agent='OPENCLAW' AND task_id=<id> ORDER BY timestamp DESC LIMIT 1;"
```

## 3. FAILURE TAXONOMY

| Failure | Detection | Recovery |
|---|---|---|
| Gateway down | gateway status non-zero | Bridge logs diagnostic, marks FAILED |
| Non-JSON response | Parser throws | Bridge marks FAILED. Inspect logs |
| mem-log fails after success | Task COMPLETED but no memories | Bridge validates mem-log exit code |
| Task hangs | Status stays RUNNING > timeout | Manual task-update FAILED |
| DeepSeek rate-limited | Error/timeout | Retry once, fallback to OpenRouter |
| Session collision | Overlapping memories | Run sequential first; batch after measurement |


## 4. OPERATIONAL GUARDRAILS

- Bridge-only: All OpenClaw calls through `openclaw-bridge.sh`. No direct `openclaw agent` from scripts.
- One truth: `memory.db` canonical. `~/.openclaw/agents/main/sessions/` is cache only.
- Chrome lives in the browser worker. OPENCLAW is the router, not the browser owner.
- Attribution: Every memory has correct agent_id, source, channel.
- Prunable: Use meta.kind: "observation", "diagnostic", "reply". Old diagnostics can be purged.
- No code edits: 09OC reads/summarizes only. Code changes → handoff to ENKI.

## 5. DECISION TREE: ENKI vs 09OC

**ENKI (Cline):** Code edits, file creation, git, schema migrations, kernel changes, CLI auth tokens.

**09OC (OpenClaw):** Research/summarization (>3 sources), background watchers, text generation without file access.

**Gray area:** Small summarization (<200 tokens) → ENKI. Multi-step with file inspection → ENKI if edits needed, 09OC if read-only.

## 6. MAINTENANCE COMMANDS

```bash
openclaw gateway status
openclaw status --deep
# Smoke test:
echo '{"from_agent":"ENKI","channel":"internal:smoke","message":"Reply with: SMOKE_OK"}' | npm run openclaw
```

## 7. DISCORD REPAIR GATE (Blocked)

Bot loaded (ON/OK), token valid, guild resolvable, requireMention: false.  
Blocked: Custom WebSocket timing in outbound reply path.  
Revisit: plugin update, release notes, or dedicated debug window.

## 8. AUDIT TRAIL

- Created: _SYSTEM/AGENT_BLUEPRINTS.md (see NABU/01_BLUEPRINTS/21-openclaw-bridge.md archived at 07_ARCHIVE/nabu-legacy/), _SYSTEM/OS_KERNEL/openclaw-bridge.sh
- Modified: _SYSTEM/OS_KERNEL/swarm-handoff.sh, _SYSTEM/OS_KERNEL/schema.sql
- Configured: workspace → /Users/marcelspatz/YURI-OS-MUSUBI
- Added: .claude/skills/openclaw-offload/SKILL.md, npm "openclaw" script
- Fixed: bridge stderr pollution, JSON parser keypath
- Committed: 27414739d

## 9. NEXT ACTIONS

1. Run first real offload (NABU research task).
2. Inject intentional failure, observe bridge recovery.
3. Run 2 sequential offloads to validate multi-task state.
4. Codify in AGENTS.md / NABU blueprints.
5. Consider auto-offload rules for ENKI.

## 10. EMERGENCY HALT

Stop 09OC immediately if: memory.db corruption, unauthorized network connections, wrong agent_id in memories, 09OC tasks with ENKI agent_id.
