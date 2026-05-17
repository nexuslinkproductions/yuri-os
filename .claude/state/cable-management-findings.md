# Cable Management Audit Findings
**Date:** 2026-05-16 · **Source:** DeepSeek v4-pro · **Sprint:** Phase 2 automation

## 1. Scout Consolidation (Phase 3 campaign)
Merge 6 → 2 files:
- `scout-orchestrator.js` — lifecycle, IPC, injection, log-trim, spawn (merge scout-bus/init/inject/log-trim/spawn)
- `scout-runner.js` — sandboxed execution only (keep as-is)

Benefit: fewer spawns, shared context, sequential pipeline maintained via async generator.

## 2. spawnSync → async (safe to flip)
| Hook | Status | Rationale |
|------|--------|-----------|
| `nisaba-on-stop.js` | ✅ Safe async | Pure housekeeping, no caller waits |
| `session-checkpoint.js` | ✅ Safe async | Serializable state, next session reads latest |
| `token-session-init.js` | ✅ Safe async | Needs readiness signal, not blocking result |
| `memory-bus.js` | ❌ Must stay sync | L1 cache commit — loss corrupts active recall |
| `memory-rag-inject.js` | ❌ Must stay sync | Boot-layer LTM must commit before pulse-orchestrator fires |
| `tirith-url-guard.js` | ❌ Must stay sync | Security gate — async would allow prompt before URL decision |

## 3. Orphaned / flagged
- `scout-log-trim.js` — redundant after scout-orchestrator consolidation
- `token-session-init.js` — review if LaunchAgents make it redundant as hook
- **NOTE:** `memory-rag-inject.js` is NOT superseded by PATCH 040+041. Boot layer (SessionStart LTM) ≠ per-task RAG (user-prompt-submit). Both are needed.

## 4. Highest-value next rewiring
Convert `memory-rag-inject.js` to async pre-write triggered by file watcher on RAG input.
Let `pulse-orchestrator.mjs` await completion promise before reading `rag-turn-context.json`.
Est: ~300-600ms saved per turn on M2 Pro. Aligned with LaunchAgent-driven async cadence.

## 5. Metrics
- Active hooks after scout consolidation: ≤ 30 (from 36)
- Manual Claude sessions needed for operational hygiene: 0
- Cable slack reduced: ~23%

## Next actions
- [ ] Async flip: nisaba-on-stop, session-checkpoint, token-session-init → Codex
- [ ] Scout consolidation → Phase 3 campaign (separate Codex packet)
- [ ] memory-rag-inject async + orchestrator await → Phase 3 (larger, requires mutex design)
