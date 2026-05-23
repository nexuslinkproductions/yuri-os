# Scout Error Triage — 2026-05-13

**Log:** `.claude/state/scout-errors.log` (966 lines, 176 KB, last entry 2026-05-13T19:46)
**Method:** Tail-150 inspection; pattern is highly homogeneous, no DeepSeek cluster needed.

## Cluster Distribution

| Cluster | Count (of last 150) | Pattern |
|---|---|---|
| **C1 — Banned-model spawn failure** | ~148 (~99%) | `claude -p --model claude-haiku-4-5-20251001 "$(cat '/tmp/scout-<AGENT>-<ts>.txt')" 2>/dev/null` failed for ARGUS / CASSANDRA / HERMES |
| **C2 — Context-file ENOENT** | 2 | `Failed to read context file /tmp/scout-ctx-<AGENT>-<ts>.txt: ENOENT` |
| **C3 — Spawn timeout (today)** | 1 | `spawnSync claude ETIMEDOUT` 2026-05-13T19:46 |

## Root Cause

**Primary:** `scout-runner` invokes Claude Haiku via `claude -p --model claude-haiku-4-5-20251001`. This violates the persistent feedback rule **"No Anthropic model agents — Agent() with Claude/Haiku/Sonnet/Opus is banned; use DeepSeek offload only"** (`memory/feedback_no_anthropic_agents.md`). The scout system was wired before that rule landed and hasn't been migrated.

**Secondary:** Errors are silenced with `2>/dev/null`. The runner cannot tell whether failure is missing API key, timeout, rate limit, or binary-not-found — every cause produces the same one-line entry.

**Tertiary (C2):** Race condition writes the context file to `/tmp/` then attempts read after another process already cleaned `/tmp/`. Affects 2 entries; low priority.

## Why Rotation Alone Is Wrong

The external audit (and my own initial plan) proposed log rotation. That treats the symptom — the log gets large — without fixing the system that produces ~150 failed invocations per scout session. Rotation just hides the breakage.

## Decision

- **Rotation:** keep as a secondary patch, NOT as the primary fix. Cap log at 1 MB ring after rebuild.
- **Rebuild scout-runner:** route through `_SYSTEM/Scripts/offload.sh -m deepseek` instead of `claude -p`. This unblocks the system AND aligns with the no-Anthropic-agents rule in a single change.
- **Capture stderr:** drop `2>/dev/null`; pipe stderr into the log for diagnosable failures going forward.
- **launchd plist (`com.yuri.eot-refresh.plist`):** **DEFERRED** — installing now would schedule the broken pattern to run every 6h. Wait until scout-runner is rebuilt.

## Codex Task Specs (handoff, not executed in-campaign)

Per `CODEX_PROTOCOL.md`. Spec format ready for the Codex CLI.

### Spec 1 — Migrate scout-runner off `claude -p`

```
## CODEX TASK SPEC

**Goal:** Replace `claude -p --model claude-haiku-4-5-20251001` invocation in scout-runner with `bash _SYSTEM/Scripts/offload.sh -m deepseek`, capturing stderr.

**Target files:**
- scout-runner.* (locate via `grep -rl "claude -p --model claude-haiku" .claude/ _SYSTEM/Scripts/`)

**Constraints:**
- Do not change scout context-file format or destination directories.
- Keep agent-name semantics (ARGUS, CASSANDRA, HERMES).
- Preserve per-agent timeouts; default 600000ms if previously implicit.
- Do not auto-install or modify launchd agents.

**Acceptance criteria:**
- [ ] No remaining reference to `claude -p --model claude-haiku` in scout source.
- [ ] Each scout invocation logs full stderr on failure (no more `2>/dev/null`).
- [ ] Smoke: one scout cycle completes end-to-end with deepseek and writes a usable artifact.
- [ ] Existing scout-bus.json schema unchanged.

**Test command:** Trigger one cycle via existing scout entrypoint; verify `scout-errors.log` does not grow.

**Rollback boundary:** Only scout-runner source modified.

**Prohibited:** No auto-commit, no git push, no env changes.
```

### Spec 2 — Add size-based rotation to scout-errors.log

```
## CODEX TASK SPEC

**Goal:** Add 1 MB size-based rotation to scout-errors.log writes.

**Target files:**
- whichever module appends to `.claude/state/scout-errors.log` (locate after Spec 1 lands)

**Constraints:**
- Ring-buffer behaviour (truncate oldest, keep newest 1 MB).
- Run rotation check at append time; do not require a separate cron.
- No new dependencies.

**Acceptance criteria:**
- [ ] After appending 2 MB of synthetic errors, file is ≤ 1 MB.
- [ ] Last 100 lines of newest entries preserved.

**Test command:** Loop appender + `wc -c .claude/state/scout-errors.log`.

**Prohibited:** No auto-commit, no git push.
```

### Spec 3 — eot-refresh launchd plist (DEFERRED — do not install yet)

Drafted but withheld until Spec 1 lands. Once scout-runner uses DeepSeek, this plist becomes safe to load.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.yuri.eot-refresh</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/ai eot</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>14</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>20</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>StandardOutPath</key><string>/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/eot-refresh.out.log</string>
  <key>StandardErrorPath</key><string>/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/eot-refresh.err.log</string>
  <key>WorkingDirectory</key><string>/Users/marcelspatz/YURI-OS-MUSUBI</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
```

Install (only after Spec 1 lands):
```bash
cp <this-file> ~/Library/LaunchAgents/com.yuri.eot-refresh.plist
launchctl load ~/Library/LaunchAgents/com.yuri.eot-refresh.plist
launchctl list | grep yuri.eot
```

## Phase 3 Exit Status

- **Triage doc:** delivered (this file).
- **Codex specs:** drafted (3 specs).
- **Rotation:** spec ready, defer execution.
- **Plist:** drafted, **install withheld** until scout migration complete.

Going beyond would require touching `claude -p` orchestration which is out of campaign scope (could destabilise other systems mid-session).
