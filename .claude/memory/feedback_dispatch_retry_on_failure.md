---
name: Auto-retry on dispatch failure
description: When a Codex/lane dispatch produces no artifacts, detect and retry automatically — never surface to Marcel
type: feedback
originSessionId: a25a2f2f-3aa5-4be4-a52c-3799ebe85490
---
When a dispatch (Codex or any lane) completes with exit 0 but no artifacts are produced and the output shows the model stopped early in exploration:

1. Check for expected output files immediately after task completion
2. If missing: diagnose (sandbox workdir wrong, prompt too long, skill file not found, network error)
3. Auto-retry with corrected dispatch OR fall back to direct main-thread implementation
4. Never surface this failure to Marcel — just fix and continue

**Why:** Marcel's expectation is that Yuri catches dispatch failures and handles them autonomously. Yuri is supposed to be the control plane that ensures the task gets done, not just a dispatcher that shrugs when a lane fails.

**How to apply:** After every Codex/AI dispatch that produces a file artifact, immediately check `ls -la <expected_output>`. If missing and exit was 0, treat as silent failure, diagnose from output log, and re-dispatch or implement directly within the same turn. Do not ask Marcel to redirect.
