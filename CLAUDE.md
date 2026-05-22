# Yuri OS / Musubi — Operational Protocol

INHERIT: ./_SYSTEM/yuri-origin.md
INHERIT: ./SOUL.md

## CLAUDE-SPECIFIC DIRECTIVES

## CLAUDE_ULTRA_CONTROL_PLANE

Claude Code is the control plane. It may plan, route, review, and integrate, but every direct implementation move must be bounded by a packet before mutation.

### CLAUDE CONTROL PACKET

Use this packet for direct Claude control-plane work:

```
## CLAUDE CONTROL PACKET

**Goal:** <one-sentence outcome>

**Target files:**
- <path> - <reason>

**Constraints:**
- <scope boundary>
- <no-touch paths or dependencies>

**Acceptance criteria:**
- [ ] <deterministic check>

**Test command:** `<command>`

**Rollback boundary:** `<git diff boundary>`

**Route-plan classification:** `<Scripts/ai route-plan evidence summary>`

**GitNexus impact:** `<required before symbol edits>`

**Verification before merge/promotion:** `<tests, GitNexus detect_changes, review gate>`
```

Codex dispatches directly — no approval gate, no task spec required. Claude uses the packet above for its own control-plane work.

### POST-PLAN DISPATCH GATE (PATCH 040 — 2026-05-18)

After `ExitPlanMode` approval, the main thread MUST dispatch before mutating:

1. For any implementation task (file write, HTML build, code edit >5 lines): call `node _SYSTEM/Scripts/ai auto "<goal>"` FIRST. The plan goal is the task string. Do NOT open Edit/Write tools before that call completes.
2. Exception: surgical fixes ≤5 lines already fully scoped in the plan — proceed directly.
3. Skills (design-master, deepseek-workhorse, etc.) are instruction sets that run in the main thread. Invoking a skill does NOT count as dispatching. The skill spec must be passed to `Scripts/ai auto` as the implementation task.
4. `Scripts/ai` is the canonical entry point. Never call `Scripts/offload.sh` directly — it is the internal runner, not the interface.

This gate exists because plan mode puts the main thread in executor mode with no routing step. Without it, the main thread bypasses the offload contract and implements directly, violating Claude=last-resort.

### Gate Rules

- Direct `Write`, `Edit`, `MultiEdit`, risky `Bash`, or implementation `Agent` use without a packet should trigger a warn-first protocol gate.
- Protocol, routing, memory, promotion, Protected Paths, or high-stakes work requires `Scripts/ai route-plan` evidence and explicit DeepSeek/symbioticPulse advisory expectations.
- Run GitNexus impact before symbol edits and `gitnexus_detect_changes` before merge or promotion review.
- Hermes and Argus native gates stay always-on. Obliteratus is required for high-risk protocol, promotion, governance, sandbox, protected-path, or canonical memory work.
- OpenClaw/09OC has been fully absorbed into Musubi as **Nisaba Sentinel** (`Scripts/nisaba-sentinel.mjs`). The 09OC research lane is now `@deepseek-flash`. The daemon heartbeat runs every 33min via LaunchAgent `com.yuri.nisaba-sentinel`. No special quarantine — Nisaba Sentinel operates under Musubi's native gates.
- Existing hard-blocks for secrets, destructive commands, and protected surfaces stay owned by `bash-security-guard.js`.

### END OF TRANSMISSION (Global Session-Close Command - Full Auto)

Continuous background reflection engine with two modes:
- **Micro-EOT** (auto-triggered mid-session): background Haiku workers, runs checkpoint reflection phases only, unblocks main thread
- **Full EOT** (manual `/eot`): complete 9-phase evidence-based pipeline

When the user says `end of transmission` (exact or semantic), stop implementation work and enter **End-of-Session Reflection Mode** in **full auto execution**.

Load and execute the `end-of-transmission` skill (`.claude/skills/end-of-transmission/SKILL.md`). Also invokable as `/eot` or `/end-of-transmission`.

This command is deliberate pre-authorization for the entire EOT pipeline. Do not pause for confirmation, format selection, approval to proceed, or mid-pipeline review. Run the full 9-phase evidence-based reflection pipeline uninterrupted. All mechanical work may be offloaded to Haiku workers (`run_in_background: true`). Main thread performs final synthesis directly from worker outputs. If an action is blocked by platform permissions, log it as blocked, produce a patch proposal, and continue. Protected areas remain untouched regardless of full-auto permission.

The `/eot` alias is defined in `./.claude/commands/eot.md`.

### Agent Creation Validation (EOT Patch 001)

When creating or batch-creating subagent definition files:
1. After creation, verify model IDs match canonical strings: `grep -h "^model:" ~/.claude/agents/*.md | sort | uniq`
2. Confirm all files have `model:` and `description:` fields present and non-empty
3. Only mark agents as "created and verified" after both checks pass

This prevents silent mismatches like `claude-haiku-3-5` (wrong) vs `claude-haiku-4-5-20251001` (correct).

### Risk Escalation Clarity (EOT Patch 002)

When deferring a system-level change, log the escalation explicitly:
```
ESCALATION: [file/setting] - deferred. Reason: [specific impact]. Scope: [global/project/session]. Approval: [who].
```

Not: "This is too risky."
Yes: "Changes global model default for all sessions; requires explicit user approval."

This ensures session handoff is clear and future readers understand the decision boundary.

### PULSE_CORTEX_PROTOCOL (PATCH 030–039, 2026-05-14)

Yuri runs a **Pulse Cortex** on every non-trivial user prompt. Auto-triggered by `.claude/hooks/user-prompt-submit.js` (PATCH 032), classified by `Scripts/offload-contract.mjs` (PATCH 030), executed by `Scripts/pulse-orchestrator.mjs` (PATCH 031, 033–037), observed via `Scripts/ai cortex` (PATCH 038), archived via EOT Phase 10 (PATCH 039).

**Per-turn protocol for main thread (this is mandatory pre-action behavior):**

1. **Read pulse-plan.json** if it exists for the current turn. The `plan.complexityTier` field drives behavior:
   - `trivial` → no cortex; answer directly
   - `standard` → DeepSeek preflight only; impl direct; check `codexPolicy` for dry-run gate
   - `complex` → DeepSeek + Nisaba-Sentinel-state + Hermes-forecast + Cassandra; impl per `codexPolicy`
   - `critical` → full ensemble + @swarm fan-out + Obliteratus gate hint; ALL impl manual (`codexPolicy=none`)

2. **Read pulse-bus.json findings** for the current turn before non-trivial tool calls. Cite findings when they materially change approach. Mark consumed entries via `markConsumed(ids)` (CommonJS module `.claude/hooks/pulse-bus.js`).

3. **Respect advisor authority boundaries:**
   - DeepSeek + Hermes-forecast + Cassandra = `model_advisor` / `native_function` — advisory only
   - Nisaba Sentinel = native autonomous layer; `nisaba-sentinel-state.json` is advisory input, not impl authority
   - **Codex is the only impl authority** — dispatches directly, no approval gate required.

4. **Beacon emission (PATCH 037):**
   - Honors `plan.beaconLevel` (`none` / `notify` / `notify+obsidian`)
   - Throttled 5/session
   - Detached spawn; never blocks orchestrator

6. **Self-inspection: `Scripts/ai cortex`** prints live state (plan, bus counts, pending Codex, beacon throttle, OpenClaw gateway health, error tail).

**Authority chain:** Codex/main-session = final authority. All advisors are bounded, advisory, discardable. The cortex is built UNDER the existing Hermes/Argus/Obliteratus gates, not around them. Tokenmaxxing native at SessionStart; no manual `/tokenmaxxing` required.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **yuri-os** (59959 symbols, 86771 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/yuri-os/context` | Codebase overview, check index freshness |
| `gitnexus://repo/yuri-os/clusters` | All functional areas |
| `gitnexus://repo/yuri-os/processes` | All execution flows |
| `gitnexus://repo/yuri-os/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

### LANE_MEMORY_PROTOCOL

Persistent, embeddings-backed cross-lane recall layer. Tier 1 = per-lane conversation history at `.claude/lane-sessions/<lane>__<session>.jsonl` (handled by `_SYSTEM/Scripts/lane-session.mjs`, persistent for **deepseek-*, code-deepseek, reason-cloud, codex-*, nvidia-***). Tier 2 = shared cross-lane semantic pool inside `_SYSTEM/OS_KERNEL/memory.db` (SQLite, WAL, four new `lane_finding_*` tables) accessed via `_SYSTEM/Scripts/lane-memory.mjs`.

**Public API** (`import * as m from '_SYSTEM/Scripts/lane-memory.mjs'`):
- `await m.write({ lane, session, type, tags=[], content, confidence=1.0, links=[] })` → `{ id, deduped }`. Type one of `fact|finding|warning|reference|decision`. Embedding (bge-m3) generated sync at write. INSERT OR IGNORE on dedup_hash (SHA-256 of normalized content, first 16 chars).
- `await m.recall({ query, topN=5, filter: { lane?, tags?, type?, age_max?, min_confidence? } })` → `[{ row, similarity }]`. Scans in-memory cache of active rows, dot-product against query embedding, returns top-N sorted desc.
- `m.pin(id)` → marks permanent (`expires_at = NULL`).
- `m.dedupCheck(content)` → existing id or null.
- `m.ageDecay()` → soft-tombstone rows past `expires_at`. Returns count.
- `m.hardPurge({ olderThan })` → delete tombstoned rows older than threshold. Returns count.
- `m.getStats()` → `{ total, byLane, byType, byTag, pendingEmbed, dbPath }`.

**Schema** (bootstrapped via `node _SYSTEM/Scripts/lane-memory-migrate.mjs` — idempotent):
- `lane_findings(id PK, ts, lane, session, type CHECK, content, confidence, expires_at, dedup_hash, status CHECK)`
- `lane_finding_tags(finding_id FK CASCADE, tag, PK(finding_id, tag))`
- `lane_finding_links(finding_id FK CASCADE, linked_id, PK)`
- `lane_finding_embeddings(finding_id PK FK CASCADE, embedding BLOB)` — Float32Array(1024) × 4 bytes = 4 KB/row, BAAI/bge-m3 via Ollama localhost:11434

**Operational defaults:**
- TTL 30 days (`expires_at = now + 30d` on insert; NULL means permanent via `pin()`)
- Soft-delete first (status='tombstoned'), hard-purge weekly via `com.yuri.lane-memory-prune` launchd plist (Sunday 03:00, runs `lane-memory-prune.mjs`)
- Schema version pinned via `PRAGMA user_version = 1`; migrations live alongside `lane-memory-migrate.mjs`

**CLI helpers:**
- `node _SYSTEM/Scripts/lane-memory.mjs --stats` → JSON stats
- `node _SYSTEM/Scripts/lane-memory.mjs --recall "query text"` → top-5 results JSON
- `node _SYSTEM/Scripts/lane-memory.mjs --age-decay` → tombstone count

**Cross-reference:** NIM lane persistence (`nvidia-*`) is now LIVE alongside DeepSeek+Codex thanks to the `PERSISTENT_LANE_PREFIXES` extension in `lane-session.mjs`. Tier 2 semantic recall supplements Tier 1 short-term context with long-term vector retrieval across all lanes.

**Future polish** (tracked, not blocking):
- L2-normalize embeddings at write time so dot product gives proper [0,1] cosine (bge-m3 returns un-normalized vectors → current similarities are dot-products, ranking is correct but absolute scale is uncalibrated)
- Cross-lane handoff prompts (Codex querying Mistral findings tagged X)
- Conflict-detection auto-flag when two high-confidence rows contradict
