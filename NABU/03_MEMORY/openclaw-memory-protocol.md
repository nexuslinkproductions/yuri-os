# OPENCLAW MEMORY PROTOCOL
Scope: 09OC lane (OPENCLAW)  
Status: DRAFT (Phase 1)  

---

## 1. PURPOSE

OPENCLAW is a channel‑native execution lane. It must read and write **shared memory** in a way that is:

- Compatible with existing agents (ENLIL, NABU, ENKI, INANNA).
- Safe: no direct SQL, no shadow state.
- Traceable: every write is attributable to an agent, task, channel, and origin.

This document defines the **memory contract** between OPENCLAW and the Yuri OS kernel.

---

## 2. SINGLE SOURCE OF TRUTH

- **Canonical store:** `_SYSTEM/OS_KERNEL/memory.db` (SQLite).
- **Access path:** `kernel.py` syscall interface only:
  - `task-create`
  - `task-update`
  - `mem-log`
  - `handoff`
- **OPENCLAW internal storage** (ephemeral):
  - `~/.openclaw/openclaw.json` — configuration only.
  - `~/.openclaw/agents/...` — agent identity and session state.
  - `~/.openclaw/workspace/...` — workspace files, skills, temporary artifacts.
- **Rule:** Nothing inside `~/.openclaw/**` is considered durable knowledge. All durable knowledge must appear in `memory.db` via `mem-log`.

---

## 3. OPERATIONS

### 3.1 READ: Context Acquisition

OPENCLAW queries context through the bridge, which calls kernel.py:

```sh
python3 _SYSTEM/OS_KERNEL/syscalls/kernel.py mem-read --agent OPENCLAW --limit 20
python3 _SYSTEM/OS_KERNEL/syscalls/kernel.py mem-read --task-id "<task_id>" --limit 50
```

**Permitted views:**
- **Recent agent context**: Memories by `agent_id` and `channel`, ordered by `created_at DESC`, limited to 20.
- **Task‑centric view**: All memories for a given `task_id`.
- **System snapshot**: A single "state of the world" memory updated by NABU/ENLIL.

OPENCLAW MUST NOT run arbitrary SQL against `memory.db`.

### 3.2 WRITE: mem-log

All OPENCLAW writes use `kernel.py mem-log`:

```json
{
  "agent_id": "OPENCLAW",
  "task_id": "<uuid>",
  "source": "OPENCLAW",
  "channel": "discord:<channel_id>",
  "summary": "Short summary of what was done or observed.",
  "content": "Full contents (text or JSON string).",
  "meta": {
    "model": "deepseek/deepseek-v4-flash",
    "openclaw_session": "<session_id>",
    "gateway_profile": "<profile>",
    "kind": "reply" | "observation" | "diagnostic"
  }
}
```

---

## 4. CONTEXT STRATEGY FOR 09OC

### 4.1 Discord Session Context

For each Discord channel:
- Maintain a sliding window of N memories (e.g., `N=20`) combining ENKI and OPENCLAW outputs for that channel.
- When OpenClaw handles a new Discord message:
  1. Call `mem-read` for `agent_id in (ENKI, OPENCLAW)` AND `channel = "discord:<channel_id>"`.
  2. Condense the last N records into a compact context.
  3. Send that context with the new message into `openclaw agent --message`.

### 4.2 Task‑Scoped Context

For long‑running watchers:
- Call `mem-read --task-id <id> --limit 50` to reconstruct state.
- Write new observations preserving `task_id`.

### 4.3 System‑Level Context

Optional global "state of the world" memory written by NABU/ENLIL. OPENCLAW reads it occasionally for high‑level context.

---

## 5. GUARDRAILS & FAILURE MODES

### 5.1 Guardrails

1. **No direct SQL** — All reads/writes via `kernel.py` only.
2. **No silent memory** — Any user‑visible Discord output MUST have a corresponding `mem-log` entry.
3. **Bounded history** — Context views limited to 20–50 entries.
4. **Idempotent writes** — Avoid duplicate `mem-log` entries for the same event.

### 5.2 Failure modes

**Gateway down:**
- `openclaw-bridge.sh` fails fast if `openclaw gateway status` is unhealthy.
- Bridge logs a diagnostic memory: `meta.kind = "diagnostic"`.
- `task-update` marks task as `FAILED`.

**Discord plugin broken:**
- OPENCLAW still writes memories and tasks normally.
- Discord unreachable; kernel remains consistent.
- After repair, OPENCLAW can replay missed events from memory.

**Kernel unreachable:**
- Bridge must not proceed. Logs local diagnostic. Returns error.
- May respond in Discord with simple "internal error" only if no kernel path exists.

---

## 6. IMPLEMENTATION NOTES

- `openclaw-bridge.sh` is the **only** component that calls `openclaw agent`.
- OpenClaw config: `openclaw config set agents.defaults.workspace "/Users/marcelspatz/NUDIMMUD"`.
- OpenClaw's `openclaw.json` treats `channels.discord` config as transient transport.

---

## 7. CHECKLIST

- [ ] `kernel.py` exposes `mem-read` helpers for 09OC views.
- [ ] `openclaw-bridge.sh` uses `mem-log`, `task-create`, `task-update`, `handoff`.
- [ ] All Discord‑visible outputs backed by `memories` rows.
- [ ] OPENCLAW never writes directly to `memory.db` via SQL.
- [ ] Context views bounded and summarizing when needed.


**Attribution rules:**
- `agent_id = OPENCLAW` for all memories originating from the OPENCLAW lane.
- `source` identifies the technical origin: `"OPENCLAW"`, `"DISCORD"`, `"GATEWAY"`.
- `channel` is required for all channel‑visible interactions: `"discord:<channel_id>"`.

### 3.3 WRITE: task-create / task-update

OPENCLAW creates and updates tasks via `kernel.py` only.

**Creation:**
```json
{
  "agent_id": "OPENCLAW",
  "title": "Summarize recent updates for channel X",
  "lane_label": "09OC_RESEARCH_DISCORD_DIRECT_COMMITTED",
  "metadata": {
    "origin": "DISCORD",
    "channel": "discord:<channel_id>",
    "priority": "normal",
    "model": "deepseek/deepseek-v4-flash"
  }
}
```

**Update:**
```json
{
  "task_id": "<uuid>",
  "status": "COMPLETED",
  "metadata": {
    "result": "success",
    "error": null,
    "openclaw_session": "<session_id>"
  }
}
```

### 3.4 WRITE: handoff (context_switches)

When work moves between agents, the bridge calls:

```json
{
  "from_agent": "OPENCLAW",
  "to_agent": "ENKI",
  "task_id": "<uuid>",
  "lane_label": "09OC_ROUTING_CLINE_RETURN_DIRECT_COMMITTED",
  "reason": "deep_code_edit"
}
```
