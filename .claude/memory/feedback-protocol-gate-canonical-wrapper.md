---
name: feedback-protocol-gate-canonical-wrapper
description: On protected-path block find canonical wrapper before retrying direct op
metadata:
  type: feedback
  tier: working
  scope: claude
  trig: ["protected-path", "route-plan", "memory-promotion", "system-reminder", "wrapper"]
  refs: ["[[fb-two-track-rule]]"]
---

RULE  On any protected-path block or protocol-gate firing, find the canonical wrapper / mediator for that surface BEFORE retrying the direct operation.

WHEN  System reminder mentions "missing-route-plan-evidence", "protected-path", "memory-promotion-requires-approval", or filesystem denies a write to a documented surface.

DO    (1) Ask: is there a wrapper script for this surface? (2) Check _SYSTEM/Scripts/ for naming patterns: <surface>-write.mjs, <surface>-kernel.mjs, <surface>-propose.mjs. (3) Check _SYSTEM/yuri-origin.md for the routing rule. (4) If no wrapper exists, propose building one — do not punch a hole in protection.

DONT  Retry the direct write. Don't disable the gate. Don't creatively reframe to bypass.

WHY   2026-05-28: burned several tool calls trying to write directly to .claude/projects/*/memory/ because the auto-memory docs said "Write directly with the Write tool." The memory-kernel.mjs propose pipeline existed the whole time.

SEE   FB:TWO-TRACK-RULE
