---
name: project-kagami-overseer-live
description: "Kagami autonomous overseer is live as a LaunchDaemon — repairs crashed agents, quarantines chronic failures, polls every 60s"
metadata: 
  node_type: memory
  type: project
  originSessionId: b08bc260-e2e8-46c4-9433-c4d07a9d70ae
---

Kagami overseer deployed 2026-05-20. PID-bearing daemon (KeepAlive) at `com.yuri.kagami-overseer`.

**Why:** No automated repair existed. Crashed agents sat dead until manual intervention. health-aggregator was read-only.

**What was built:**
- `_SYSTEM/Scripts/kagami/kagami-overseer.mjs` — 60s poll loop, `launchctl kickstart -k`, 3x/1hr quarantine, SIGTERM clean shutdown
- `_SYSTEM/Scripts/kagami-patterns.mjs` — learning layer: lane-memory writes per repair + Sunday weekly report
- `_SYSTEM/Scripts/start-workers.sh` — tmux yuri-workers bootstrap (3 panes: codex/claude/deepseek)
- `_SYSTEM/Scripts/browser-harness-runner.sh` — universal browser harness stub (browser-use/browser-harness, NOT YET CLONED)
- `_SYSTEM/Scripts/launch-readiness-wrapper.sh` — fixes StandardOutPath mtime conflict

**Fixes applied:**
- `health-aggregator.mjs` statusFor() now decodes launchd exit 256 → actualCode 1 → 'gate_failed' for GATE_AGENTS
- `launch-readiness-nightly.plist` now calls wrapper script (no more bash-c stdout redirect conflict)
- Audit issues documented in `_SYSTEM/docs/kagami-overseer-audit.md` (6 issues: race condition, permission handling, log rotation, quarantine window, JSONL atomicity, weeklyReport dedup)

**Still needed:**
- `rm -rf ~/NUDIMMUD` (user must run manually — permission blocked)
- `git clone browser-use/browser-harness ~/browser-harness` (user must run manually)
- Hermes gap tracker quick wins (QW1 `/goal` persistence, QW2 post-write lint, QW3 task heartbeat) — documented in `_SYSTEM/docs/hermes-gap-tracker.md`

**How to apply:** When discussing system health or autonomous behavior, kagami-overseer IS the watchdog. health-aggregator watches, overseer acts.
