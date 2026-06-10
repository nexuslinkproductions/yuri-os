---
name: feedback-route-to-quantum
description: Non-trivial impl → packet to Quantum Rick via tmux; do not burn main thread
metadata:
  type: feedback
  tier: working
  scope: claude
  trig: ["implement", "build", "write", "packet", "quantum", "tmux", "non-trivial"]
  refs: ["[[fb-no-p-claude]]"]
---

RULE  Non-trivial implementation work → write a Claude Control Packet → dispatch to Quantum Rick via tmux lane → review and adjust in main thread. Do not implement directly in main.

WHEN  About to build / implement / write multi-file changes, new scripts, new test suites, or anything with significant logic (>1 file or >100 lines).

DO    (1) Plan in main thread. (2) Write packet — goal, target files, constraints, acceptance criteria, test command, rollback boundary, route-plan classification. (3) Dispatch via active tmux lane (_SYSTEM/Scripts/rick-tmux-lanes.mjs feed). (4) Review and adjust the lane's output. (5) Optional Codex final-pass for security / protocol / protected-path changes.

DONT  Burn main-thread tokens on bulk implementation. Don't launch claude -p (see FB:NO-P-CLAUDE).

TRIVIAL  Single-file edits <50 lines, doc updates, registry adds, single test runs → main thread is fine.

WHY   2026-05-28: built yuri-energy.mjs (370 lines + 21 tests) directly in main. Output landed but token cost was unnecessary. Quantum Rick + tmux infrastructure exists for exactly this work.

SEE   FB:NO-P-CLAUDE · _SYSTEM/docs/YURI_SONNET_WORKCELL_PROTOCOL_2026-05-26.md · skill:dispatching-parallel-agents
