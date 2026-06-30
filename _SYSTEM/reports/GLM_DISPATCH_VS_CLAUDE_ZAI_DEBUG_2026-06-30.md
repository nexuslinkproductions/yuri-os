# GLM Dispatch vs Claude-ZAI Debug Report

**Date:** 2026-06-30  
**Owner:** Marcel  
**Authority:** Cursor plans; GLM/Ollama execute later  
**Task file:** `02_RESOURCES/TASKS/glm-dispatch-rework-ws-l.json`  
**Bakeoff:** `_SYSTEM/reports/GLM_SUBSTRATE_OPTIONS_BAKEOFF_2026-06-30.md`

---

## A. Executive summary

Marcel's **`ai claude-zai`** path works reliably: a native Claude Code session pointed at Z.ai's Anthropic-compatible endpoint with full tool loop, session persistence, and visible tmux control.

The **fleet headless path** (`glm-fleet` → `lane-dispatch` → `llm-lane`) intermittently fails at orchestration scale — not because the Z.ai API is down, but because headless HTTP dispatch amplifies transport fragility, timeout pressure, and stdout-capture artifacts that a live CC session does not hit.

**Smoke tests (2026-06-30, this session):** both paths pass for trivial `--no-tools` pings.

| Command | Exit | Output |
|---------|------|--------|
| `node _SYSTEM/Scripts/llm-lane.mjs glm-5.2 "Reply OK" --no-tools --out /tmp/glm-smoke.json` | 0 | `OK` |
| `node _SYSTEM/Scripts/lane-dispatch.mjs glm "Reply OK" --no-tools --out /tmp/glm-dispatch-smoke.json` | 0 | `OK` |

**Verdict:** headless GLM dispatch is **healthy for single-shot no-tools** calls. Fleet failures are **orchestration-layer** (concurrency, tool loops, piping, outer timeouts) — not a missing API key or unknown lane.

---

## B. Two execution stacks compared

### B.1 Marcel's working stack: `ai claude-zai` + tmux

```
Marcel / Yuri voice
  → bash _SYSTEM/Scripts/voice/yuri-spawn-worker.sh <name> "<task>"
    → tmux session + osascript Terminal window
    → export ZAI_MODEL=glm-5.2 && _SYSTEM/Scripts/ai claude-zai
      → run_claude_zai() in ai
        → ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
        → ANTHROPIC_AUTH_TOKEN from keychain (yuri-zai-api-key)
        → exec claude --model glm-5.2 --effort max
```

**Why it works:**

| Factor | Effect |
|--------|--------|
| Native Claude Code | Full tool loop (Read/Write/Bash/Agent), not llm-lane's reduced harness |
| Session persistence | Warm context; no per-call cold HTTP handshake |
| tmux liveness oracle | `pane_current_command` self-heals dead shells (2026-06-19 fix) |
| Key hydration | `run_claude_zai` pulls keychain inside the shell — no env drift |
| Marcel visibility | Real Terminal window; failures are observable immediately |

**Entry points:**

- `_SYSTEM/Scripts/ai claude-zai`
- `_SYSTEM/Scripts/voice/yuri-spawn-worker.sh`
- Manual: `ZAI_MODEL=glm-5.2 ai claude-zai`

### B.2 Fleet headless stack: `glm-fleet` → `lane-dispatch` → `llm-lane`

```
runSwarm / runFleet / glm-fleet.mjs
  → lane-dispatch.mjs (fresh process × up to 4 attempts, exponential backoff)
    → llm-lane.mjs glm-5.2 "<prompt>" --out <file>
      → Anthropic Messages API → api.z.ai/api/anthropic
      → read/grep/search/xref/bash tools (guarded, not full CC)
```

**Why it fails at fleet scale (even when smoke passes):**

| Failure mode | Root cause | Mitigation in tree |
|--------------|------------|-------------------|
| `AggregateError` / empty output | undici keep-alive socket reuse; IPv6 happy-eyeballs | `lane-dispatch` fresh-process retry; `dns.setDefaultResultOrder('ipv4first')` in llm-lane |
| `transport:EPIPE` | Piping/tee on lane stdout (second stream reader) | glm-fleet docs: NEVER pipe; use `--out` file only |
| SIGKILL before `--out` | Outer `LANE_DISPATCH_TIMEOUT_MS` too short for glm-max tool loops | Tier-aware timeouts in glm-fleet (glm-max 30min, glm 15min) |
| `empty_output_stop` | Headless lane stops after N empty turns while files were written | llm-lane anchor v1 regression (2026-06-24) |
| Concurrency 429 | Parallel glm-fleet fan-out hits Z.ai rate limits | `LANE_DISPATCH_RL_FACTOR`; semaphore cap |
| No session | Each dispatch = cold start; no cross-turn CC memory | Architectural — headless by design |

**Entry points:**

- `node _SYSTEM/Scripts/glm-fleet.mjs --tasks '<json>'` (armed: `YURI_GLM_FLEET=1`)
- `node _SYSTEM/Scripts/lane-dispatch.mjs glm "<prompt>" [--out file]`
- `node _SYSTEM/Scripts/llm-lane.mjs glm-5.2 "<prompt>"`
- `_SYSTEM/Scripts/ai llm glm-5.2 "<prompt>"`

---

## C. Lane configuration (single source of truth)

From `.claude/config/models.json` → `llm_compat_lanes`:

| Alias | Resolves to | Tier | Timeout |
|-------|-------------|------|---------|
| `glm`, `zai`, `z-ai` | glm-4.7 | Sonnet workhorse | 300s |
| `glm-max`, `glm-5`, `glm-5.2` | glm-5.2 | Opus flagship | 600s |
| `glm-turbo`, `glm-flash` | glm-5-turbo | Fast reactive | 300s |
| `glm-free`, `glm-4.7-flash` | glm-4.7-flash | Haiku census | 120s |

Protocol: Anthropic Messages API, Bearer auth (`auth_header: bearer`), endpoint `https://api.z.ai/api/anthropic`.

---

## D. Debug checklist (for GLM orchestrator subagents)

### D.1 Pre-flight

```bash
# Key present?
security find-generic-password -a "$USER" -s yuri-zai-api-key -w >/dev/null && echo KEY_OK

# Lane list
node _SYSTEM/Scripts/llm-lane.mjs --list | rg glm

# Smoke (no tools)
node _SYSTEM/Scripts/llm-lane.mjs glm-5.2 "Reply OK" --no-tools --out /tmp/glm-smoke.json
node _SYSTEM/Scripts/lane-dispatch.mjs glm "Reply OK" --no-tools --out /tmp/glm-dispatch-smoke.json
```

### D.2 Fleet armed smoke

```bash
YURI_GLM_FLEET=1 node _SYSTEM/Scripts/glm-fleet.mjs --smoke
```

### D.3 Trace a failing dispatch

```bash
LLM_LANE_TRACE=/tmp/glm-trace.jsonl \
  node _SYSTEM/Scripts/lane-dispatch.mjs glm-max "Your prompt" --out /tmp/glm-out.txt
# Inspect stages: MAIN_START → ANTHROPIC_REQ_START → POST_POSTCHAT
```

### D.4 Common misconfigurations

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Exit 3 unknown_lane | Bad alias | Use `glm-5.2` or `glm`, not `ollama` for GLM |
| Empty + AggregateError | Pipe on stdout | Redirect via `--out` only |
| SIGKILL mid-run | Timeout too low | Set `LANE_DISPATCH_TIMEOUT_MS=1800000` for glm-max |
| DISARMED dry-run | Fleet not armed | `YURI_GLM_FLEET=1` or touch `_SYSTEM/state/glm-fleet.enabled` |
| Key missing in child | Shell never hydrated ZAI_API_KEY | llm-lane hydrates from keychain_service — verify keychain entry |

---

## E. Recommended rework (WS-L)

Do **not** patch llm-lane for fleet-scale GLM until bakeoff L3 measures latencies. Instead:

1. **Primary execution adapter:** `zai-tmux-fleet.mjs` (proposed) — wraps `yuri-spawn-worker.sh`, drives tmux `send-keys`, reads result packets from `.claude/jobs/<runId>/results/`. Mirrors Marcel's working path.
2. **Secondary headless:** keep `glm-fleet` → `lane-dispatch` for DISARMED dry-runs, census, and `--no-tools` advisory pings.
3. **Pre-dispatch gate:** advisory substrate selector via `math-bridge.scoreOptions` + `decision-sim.robustScore` (see bakeoff doc §F).

---

## F. Residual risk

| Risk | Severity | Notes |
|------|----------|-------|
| Headless tool-loop timeouts on glm-max | HIGH | Observed in WS-G audit; tier timeouts help but not proven at fleet concurrency |
| zai-tmux-fleet not yet implemented | MEDIUM | Planned WS-L L1 |
| MLP router cold-start | LOW | Falls back to math-bridge; advisory only |
| glm-4.7-flashx empty_output | LOW | Documented UNVERIFIED in models.json |

---

## G. Changed files (this deliverable)

- `_SYSTEM/reports/GLM_DISPATCH_VS_CLAUDE_ZAI_DEBUG_2026-06-30.md` (this file)
- `02_RESOURCES/TASKS/glm-dispatch-rework-ws-l.json`

**Checks run:** smoke tests above (both exit 0).  
**Codex second opinion:** skipped (local evidence sufficient for debug doc).
