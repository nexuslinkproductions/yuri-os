---
name: project-native-only-migration
description: Native-only migration: Phase 0+1a done (CLAUDE.md 330->213); Phase 2-4 next in fresh session; plan in _SYSTEM/reports
metadata:
  type: project
  tier: working
  scope: all
  trig: ["native only", "offload", "migration", "control plane", "resume", "where were we", "retire offload", "full claude", "operation", "phase 2"]
  refs: ["[[feedback-model-self-select]]", "[[feedback-fanout-self-size]]", "[[feedback-direct-tools-for-known-reads]]"]
---

GOAL  Collapse YURI to a native-Claude-only control plane and lean the harness to elite-practice shape: subtract dead weight/duplication, enforce verification deterministically, RETIRE the entire external-lane apparatus (Codex + ollama/local + NVIDIA/DeepSeek/Kimi). Full Claude only — native tools only: main lane + Workflow (fan-out) + Agent (subagents) + worktree/tmux lanes.

WHO   Marcel (owner, gates all commits) + Claude main lane (proposes + verifies).

WHEN  Greenlit 2026-06-02. Multi-session build in progress.

WHERE Source of truth = `_SYSTEM/reports/native-only-control-plane-plan.md` (order of operations + verified guard boundary + owner-terminal runbook + session log). Reference: `_SYSTEM/reports/elite-claude-practice-reference.md`.

STATE Phase 0 DONE (plan, captures, memory reverts: model-self-select + fanout-self-size + direct-tools-for-known-reads; Track A proposal mem-proposal-487c13a18b0a2a9f pending owner approval). Phase 1a DONE: CLAUDE.md leaned 330->213 lines (Codex bridge deleted, dupes collapsed to pointers, energy-doc aligned) — UNCOMMITTED. VERIFIED GUARD BOUNDARY: bash-deletes of `.claude/` are a BLANKET safety floor (role-independent, even dev) -> `.claude/skills` deletions + the `claude-protocol-guard.js` shim removal need the OWNER'S TERMINAL (his shell isn't gated by the agent hook). `.claude` EDITS via Edit tool are NOT blocked; `_SYSTEM` bash fully open (incl. deleting offload-contract.mjs/offload-runner.mjs); the 8 guard/hook files + `claude-protocol-guard.mjs` are Edit-protected -> owner terminal.

NEXT  (fresh clean-context session) Execute Phase 2 (skill DMI + permissions prune + .claude/rules + energy-doc) -> Phase 3 (verification spine) -> Phase 4 (native-only retirement: untangle task-queue/memory-kernel/lane-kernel/control-plane, scrap ollama, delete offload-contract+runner, tmux->worktree). Owner runs the Phase-1b .claude deletion runbook + the claude-protocol-guard.mjs rework in his terminal. Test-gated, uncommitted, reversible; owner gates every commit. Don't retry bash-deletes on .claude (blanket block); use Edit for .claude edits.

SEE   `_SYSTEM/reports/native-only-control-plane-plan.md` - [[feedback-model-self-select]] - [[feedback-fanout-self-size]] - [[feedback-direct-tools-for-known-reads]]
