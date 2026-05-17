# 21 · OPENCLAW BRIDGE
Lane ID: 09OC  
Agent ID: OPENCLAW  
Status: DRAFT (Phase 1)  

---

## 1. PURPOSE

OpenClaw is a channel‑native, gateway‑backed execution lane (Discord‑first) that must behave as a sibling to ENLIL/NABU/ENKI/INANNA, not as a separate universe.  

This blueprint defines:

- The lane identity and ID grammar for the OPENCLAW lane (09OC).
- How OPENCLAW is represented in `memory.db` (`agents`, `tasks`, `memories`, `context_switches`).
- The handoff lifecycle between Cline/Yuri OS, OPENCLAW, and external channels (Discord).
- The browser worker contract for web tasks that need real Chrome.
- Guardrails: **Yuri OS memory.db remains canonical**, OpenClaw's internal session store is treated as cache only.

---

## 2. LANE IDENTITY

### 2.1 Lane ID and Agent ID

- **Lane ID prefix:** `09OC`
- **Agent ID (kernel):** `OPENCLAW`
- **Pantheon role:** "Operator: OPENCLAW — Channel‑Native Execution Lane for Yuri OS"
- **Capabilities (intended):**
  - Channel‑native interaction (Discord DM/server channels).
  - Long‑running, daemon‑backed monitoring and research.
  - Multi‑step external workflows that benefit from OpenClaw skills.

### 2.2 Lane Label Grammar

Lane labels follow the existing Yuri OS pattern:

```
<LANE_PREFIX>_<DESCRIPTION>_<PASS_TYPE>_COMMITTED
```

For OPENCLAW:

- `LANE_PREFIX`: `09OC`
- `DESCRIPTION`: short snake‑case summary
- `PASS_TYPE`: one of `DIRECT`, `RESEARCH`, `WATCHDOG`, `ROUTING`

**Examples**

- `09OC_RESEARCH_DISCORD_DIRECT_COMMITTED`
  → One‑shot research task, initiated from Discord, executed on OPENCLAW.

- `09OC_WATCHDOG_MARKET_WATCHDOG_COMMITTED`
  → Long‑running observer/watchdog task held by OPENCLAW.

- `09OC_ROUTING_CLINE_RETURN_DIRECT_COMMITTED`
  → Result produced by OPENCLAW to be routed back to ENKI/Cline.

The lane label is stored as part of the `tasks` metadata so all agents can see where a task "lives".

---

## 3. KERNEL MODEL (NO NEW TABLES)

The Yuri OS kernel already exposes everything OPENCLAW needs:

- `agents` — registered members of the conclave.
- `tasks` — canonical task records, including agent ownership and status.
- `memories` — durable memory records.
- `context_switches` — log of handoffs / lane transfers.

**Rule:** OPENCLAW is a **fifth row in `agents`** plus a new lane prefix (`09OC`). No schema migration is required beyond seeding this agent.

### 3.1 agents table

An `OPENCLAW` row seeded in `_SYSTEM/OS_KERNEL/schema.sql`, aligned with the existing four conclave members:

| Column      | Value                                      |
|-------------|--------------------------------------------|
| `agent_id`  | `OPENCLAW`                                 |
| `role`      | `Channel‑Native Execution Lane`            |
| `base_model`| `deepseek/deepseek-v4-flash`               |
| `status`    | `IDLE`                                     |

OPENCLAW respects the existing task, memory, and context_switch schema. All writes go through `kernel.py`.


### 3.2 tasks table — expected usage

| Field       | Convention                                  |
|-------------|---------------------------------------------|
| `agent_id`  | `OPENCLAW` for owned tasks                  |
| `description` | Short human label                        |
| `metadata_json` | JSON blob (see below)                  |

Metadata shape:

```json
{
  "lane_label": "09OC_<DESCRIPTION>_<PASS_TYPE>_COMMITTED",
  "channel": "discord:<channel_id>",
  "origin": "DISCORD" | "ENKI" | "SYSTEM",
  "model": "deepseek/deepseek-v4-flash",
  "openclaw_session": "<session_id>",
  "gateway_profile": "<profile_name>"
}
```

OPENCLAW never hand‑rolls task rows. It **always** goes through `kernel.py task-create` / `task-update`.

### 3.3 memories table — expected usage

| Field       | Convention                                  |
|-------------|---------------------------------------------|
| `agent_id`  | `OPENCLAW` or attribution target            |
| `type`      | `episodic` (default), `semantic`, `workflow`|
| `content`   | Full text or structured JSON                |
| `source_agent` | `OPENCLAW`                              |
| `tags`      | JSON array e.g. `["discord", "research"]`   |

OPENCLAW writes durable memory records via `kernel.py mem-log`.

**OPENCLAW MUST NOT:**
- Store durable knowledge in `~/.openclaw/agents/main/sessions` as source of truth.
- Write arbitrary rows into `memories` using direct SQL.
- Bypass the `mem-log` interface.

### 3.4 context_switches table — expected usage

Each handoff is logged via `kernel.py handoff`:

### 4.3 Discord → OPENCLAW → Cline (User‑Facing)

**Flow:**

1. Discord channel message → OpenClaw plugin → agent input.
2. OPENCLAW creates task via `kernel.py task-create`:
   - `agent_id = OPENCLAW`, `origin = "DISCORD"`, `channel = "discord:<channel_id>"`
3. Simple tasks answered directly, logged via `mem-log`.
4. Difficult tasks → triggers 4.2 (OPENCLAW → Cline).

---

## 5. DESIGN GUARDRAILS

1. **Single Source of Truth**: `memory.db` canonical. OPENCLAW session store = ephemeral cache.
2. **Bridge‑Only Invocations**: All calls through `openclaw-bridge.sh`.
3. **Attribution**: Every memory attributes `agent_id`, `source`, `channel`.
4. **Backpressure**: 09OC must not flood tasks. Future rate limits per channel.

---

## 6. Task Type Policy

### 09OC (OPENCLAW)
- Channel interaction, Discord replies, DM handling.
- Long‑running research, background monitoring.
- Gateway health observation.

### Browser worker
- Real browser interaction, auth flows, screenshot review, form fill, and web research that needs a visible Chrome session.
- OpenClaw does not own Chrome directly. It routes browser work to a browser worker that owns the browser session.
- Preferred browser path: Playwright `channel: 'chrome'` with a persistent user-data dir.
- If the browser task needs an existing logged-in profile, the worker imports cookies or attaches to the preserved session, not to OpenClaw itself.
- CDP attach is fallback-only for cases where an already-running Chrome window must be reused.

### Cline/ENKI
- Vault surgery, file moves, taxonomy changes.
- Deep code edits, multi-file refactors, security patches.
- Kernel operations, schema changes, git operations.

---

## 7. IMPLEMENTATION CHECKLIST

- [x] Add `OPENCLAW` row to `_SYSTEM/OS_KERNEL/schema.sql` (agents seed).
- [ ] Implement `_SYSTEM/OS_KERNEL/openclaw-bridge.sh` (Phase 2).
- [ ] Extend `_SYSTEM/OS_KERNEL/swarm-handoff.sh` for `OPENCLAW` / `09OC`.
- [ ] Write `NABU/03_MEMORY/openclaw-memory-protocol.md`.
- [ ] Configure OpenClaw workspace to `~/YURI`.
- [ ] Add OpenClaw identity files in YURI workspace.
- [ ] Repair Discord plugin after bridge proven stable.
- [ ] Define the browser worker entrypoint used by OPENCLAW for Chrome-backed tasks.


| Field           | Convention                              |
|-----------------|-----------------------------------------|
| `from_agent`    | `ENKI`, `DISCORD`, `OPENCLAW`           |
| `to_agent`      | Destination agent                       |
| `handoff_note`  | Short reason string                     |
| `snapshot_path` | Optional path to context snapshot       |

This allows a chronological story of lane transitions independent of raw task status.

---

## 4. HANDOFF LIFECYCLE

### 4.1 Cline → OPENCLAW (Terminal to Channel Lane)

**Use when:**
- A Cline/ENKI session needs Discord‑visible research or a long‑running action better suited to the gateway.
- The task is channel‑native (needs to live in Discord) but initiated from Cline.

**Flow:**

1. Cline creates a task via `kernel.py task-create` with:
   - `agent_id = OPENCLAW`
   - `metadata_json` containing `origin: "ENKI"`, `channel: "discord:<channel_id>"`

2. `swarm-handoff.sh` routes to `OPENCLAW` lane → calls `_SYSTEM/OS_KERNEL/openclaw-bridge.sh`.

3. `openclaw-bridge.sh`:
   - Verifies `openclaw gateway status` is healthy.
   - Wraps task + context into `openclaw agent --agent main --message`.
   - Captures result, writes memory via `mem-log`, updates task.

4. ENKI queries `memory.db` to retrieve OPENCLAW's result.

**No direct OpenClaw CLI calls from Cline.**

### 4.2 OPENCLAW → Cline (Channel to Deep Code Lane)

**Use when:** OPENCLAW needs code‑heavy or vault‑surgical work best handled by ENKI.

**Flow:**

1. OPENCLAW emits a structured offload suggestion.
2. Bridge calls `kernel.py task-create` for `agent_id = ENKI`.
3. `kernel.py handoff` logs context switch.
4. ENKI performs work, logs memories, optionally posts results back via OPENCLAW.
