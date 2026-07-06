# Retired pulse-cortex components (2026-05-31)

Non-destructive archival of dormant early-development pulse-cortex pieces, surfaced during the
subconscious-memory L8 quarantine. Each was confirmed to have **zero live invokers** (no
`settings.json` hook, no LaunchAgent, no live script spawn/import — only historical `.claude/plans/`
docs, past session logs, and a separate git worktree referenced them). They are kept here, not
deleted, so they remain fully restorable.

## Why these are dormant

The per-turn pulse-cortex was wired to `pulse-orchestrator.mjs`, whose sole production invoker —
`spawnOrchestrator()` in `.claude/hooks/user-prompt-submit.js` — targets `<repo>/Scripts/pulse-orchestrator.mjs`,
a path that does not exist (the real file is `_SYSTEM/Scripts/`). So the orchestrator has always
failed to spawn, and everything reachable only through it has been inert. The current framework
(`offload-contract.mjs route-plan`, the `ai` dispatcher, brain-inject, the subconscious memory loop)
supersedes this layer. `pulse-orchestrator.mjs` itself is kept in place with a RETIRED banner (it is
referenced by `test-pulse-cortex.sh` and the lane-kernel `CONTROL_FILE_PREFIXES` guard list).

## Files

| File | Was invoked by | Status |
|------|----------------|--------|
| `pulse-beacon.mjs` | only `pulse-orchestrator.mjs` (dead) — osascript/Obsidian emit, throttled. Last activity 2026-05-14 (pulse-errors.log). | dormant |
| `pulse-codex-runner.mjs` | nothing — a planned two-phase Codex propose→approve→apply wrapper (PATCH 036) that was never wired into a live path. | dormant |
| `yuri-symbiotic-pulse.mjs` | nothing — an explicit-only CLI routing tool; a plan doc states it is "NOT an automatic interceptor." Superseded by `offload-contract.mjs route-plan`. | dormant |
| `yuri-symbiotic-pulse.test.mjs.retired` | the test for the above (renamed `.retired` so `node --test` globs do not auto-run it against the archived module). | archived with module |

NOT archived (still live, left in `_SYSTEM/Scripts/`): `pulse-bus.js` (bus library — exports
`appendFinding`/`withLock`, used by sentinel/beacon-state/calibration), `pulse-cortex-status.mjs`,
`pulse-lane-dispatch.mjs`, `pulse-classify-stdin.mjs`, `pulse-trace-ledger.mjs`, `pulse-packager.mjs`,
`pulse-trivial-audit.mjs`, `rotate-pulse-bus.mjs`, `eot-pulse-archive.mjs`. The `pulse-bus.json`
ecosystem (written by `yuri-sentinel` + `kagami-heartbeat` LaunchAgents) is untouched.

## Restore

```bash
mv _SYSTEM/archive/retired-pulse-cortex/pulse-beacon.mjs        _SYSTEM/Scripts/
mv _SYSTEM/archive/retired-pulse-cortex/pulse-codex-runner.mjs  _SYSTEM/Scripts/
mv _SYSTEM/archive/retired-pulse-cortex/yuri-symbiotic-pulse.mjs _SYSTEM/Scripts/
mv _SYSTEM/archive/retired-pulse-cortex/yuri-symbiotic-pulse.test.mjs.retired _SYSTEM/Scripts/yuri-symbiotic-pulse.test.mjs
```

To also re-enable the orchestrator path: set `PULSE_ORCHESTRATOR_RETIRED = false` in
`.claude/hooks/user-prompt-submit.js` and fix the `ORCHESTRATOR` path there (`Scripts/` → `_SYSTEM/Scripts/`).
