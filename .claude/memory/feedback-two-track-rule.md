---
name: feedback-two-track-rule
description: Two-track memory routing — YURI canonical for shared truth, Claude auto-memory for behavioral only
metadata:
  type: feedback
  tier: working
  scope: claude
  trig: ["memory", "routing", "track-a", "track-b", "proposal", "decide"]
  refs: ["[[fb-route-to-quantum]]"]
---

RULE  Memory routing: YURI canonical (memory-kernel.mjs) for shared truth; Claude auto-memory (claude-memory-write.mjs) for behavioral self-development only.

WHEN  About to write a memory entry — decide which surface.

DO    Different lane (Codex / DeepSeek / future operator / future Claude session) would benefit → YURI canonical (propose via memory-kernel). Only "Claude-with-Marcel" benefits → auto-memory (this wrapper).

DONT  Duplicate facts across both surfaces. Auto-memory entries must not restate YURI project facts; link by handle ("See YURI: jake-outreach-target").

WHY   2026-05-28 architectural decision documented in _SYSTEM/yuri-origin.md "Memory Architecture (Two Tracks)". Ambiguous cases default to YURI canonical (broader audience, governed pipeline).

SEE   FB:ROUTE-TO-QUANTUM · _SYSTEM/yuri-origin.md
