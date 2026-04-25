---
name: session-state.json Subagent Wipe Bug
description: token-session-init.js was resetting session-state.json on every subagent spawn; fixed with 4h active guard
type: project
originSessionId: 50a8f57a-159a-4cbc-b7d1-42b0054fbcb1
---
## Bug

`token-session-init.js` (nisaba-subagent-start hook) was unconditionally writing a fresh `session-state.json` on every subagent invocation, wiping accumulated session data (skills_read, files_written, compact_history, errors, aversions).

## Root Cause

Init script lacked a guard to check if an active session was already running before overwriting state.

## Fix

Added 4-hour active session guard:
- On init, read existing `session-state.json`
- If `status === "active"` AND `start_time` is within last 4 hours → **skip reinit**, preserve existing state
- Only write fresh state if no active session found or session is stale (>4h)

## Impact

Preserves `skills_read`, `files_written`, `compact_history`, `errors`, and `aversions` across subagent spawns within the same parent session.

## File
- `.claude/hooks/token-session-init.js` (called via `nisaba-subagent-start` hook)
