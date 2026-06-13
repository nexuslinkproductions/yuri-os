# NANO SWARM Supervisor Cron — durable spec (Phase 3)

Owner decision (Marcel, 2026-06-13): the NANO SWARM supervisor runs on a **native cron** cadence. Unlike the dream-drain (which spawns a Sonnet agent), the supervisor is a **deterministic node script** — the cron just runs it; no model call is needed per fire.

**Status: SPEC ONLY — NOT ARMED.** Owner arms. The supervisor is safe to run (it self-gates via a singleton lease and only reaps/rotates), but arming a recurring scheduler is an owner action.

## What it does each fire
`node _SYSTEM/Scripts/kagami-swarm-supervisor.mjs once` →
1. Acquires the singleton `task:supervisor` lease (a second overlapping fire is a clean no-op — never double-reaps/double-rotates).
2. Reaps dead/stale leases; records each as a `LEASE_EXPIRED` audit event attributed to its owning nano.
3. Rotates `events.jsonl` if it is over threshold (only the singleton supervisor rotates — keeps the segment index tidy).
4. Computes per-nano liveness from the bus tail; flags nanos silent > 10 min (advisory).
5. Emits a `SWARM_SUPERVISION_CYCLE` summary for the board.

## Cadence
- Lease TTL defaults to 5 min, so reaping every **~10 min** keeps stale leases short-lived without busy-waking. Start at `*/10 * * * *`; tighten only if contention demands it.
- Rotation self-gates on size/line thresholds, so an idle swarm's cycle is nearly free.

## Arming — two paths (owner's choice)

### A. launchd timer (RECOMMENDED — always-on, session-independent)
The supervisor is a plain node script, so a launchd `StartInterval` (600s) invoking it directly is the durable, model-free path — it survives with no Claude session alive. Owner installs a LaunchAgent plist running `node <repo>/_SYSTEM/Scripts/kagami-swarm-supervisor.mjs once` every 600s. This is the architecturally-correct home (a janitor daemon, not an AI turn).

### B. native Claude CronCreate (session-bound fallback)
For environments where launchd isn't set up, arm a native cron that runs the script via Bash. Self-renewing like the dream-drain. Prompt (verbatim) when arming:

> NANO SWARM supervisor tick + SELF-RENEWAL (Phase 3; durable spec at _SYSTEM/AGENTS/swarm-supervisor-cron.md). Step 0 — KEEP THE LOOP ALIVE: run CronList; if this job's remaining lifetime is under 2 days, CronCreate a fresh identical copy (cron "*/10 * * * *", this exact prompt) and CronDelete the expiring instance. Then run Bash: `node _SYSTEM/Scripts/kagami-swarm-supervisor.mjs once` and report the JSON summary (expiredCount, rotated, silentLanes). Do NOT spawn a sub-agent — it is a deterministic script. Do not commit, do not touch protected paths.

Limitation: native Claude cron is session-bound (breaks across an expiry boundary with no live session). Path A has no such limitation — prefer it for a real running swarm.

## Verify before arming
`node _SYSTEM/Scripts/kagami-swarm-supervisor.mjs once` by hand first; confirm it returns `{ ok: true, ... }` and emits a `SWARM_SUPERVISION_CYCLE` on the bus. Re-run; confirm the second is also clean (idempotent — nothing to reap on a quiet swarm).

## History
- 2026-06-13: spec written alongside the supervisor build (Phase 3). NOT armed — pending red-team verification of the reaper/rotation concurrency + owner arming.
