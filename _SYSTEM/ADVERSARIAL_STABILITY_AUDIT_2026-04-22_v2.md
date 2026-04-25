# ⬡ ADVERSARIAL STABILITY & SECURITY AUDIT — v2
**NUDIMMUD** — Focused re-audit
**Date:** 2026-04-22T01:30:00Z

---

## Executive summary
This is a concise second-pass security & stability audit focused on high-risk code paths and runtime dependencies. I scanned backend code for credential leaks, shell/exec usage, unguarded command execution, and fragile external dependencies.

Top critical issues remain the same as the initial audit: default API key fallback, shell execution against external mount points, and storage/DB fragility. Below are the findings (evidence and minimal remediation for each).

---

## Critical Findings (Action Immediately)

- Hardcoded/default API key allows trivial unauthorized access
  - Evidence: `authMiddleware` uses a fallback key at [backend/src/middleware/auth.ts](backend/src/middleware/auth.ts#L8).
  - Risk: Remote attacker can call protected endpoints (including `/api/execute` and `/api/swarm/execute`).
  - Fix: Require `API_KEY` in env at startup; refuse to boot without it.

- Unsafe shell usage and T7 dependency
  - Evidence: `execSync("df -h /Volumes/T7 | tail -1 | awk '{print $5}'")` in [backend/src/services/metrics.ts](backend/src/services/metrics.ts#L47) and `TRACKER_FILE` on `/Volumes/T7` at [backend/src/services/metrics.ts](backend/src/services/metrics.ts#L8).
  - Risk: Shell injection (if command strings become dynamic), silent failure when T7 unmounts, data loss when T7 unavailable.
  - Fix: Use native Node APIs or exec with arg arrays; implement local fallback storage (DB) and sync-on-reconnect.

- Executor runs shell commands; logs command text
  - Evidence: `executeCommand()` uses `exec`/`execAsync` and logs the command at [backend/src/services/executor.ts](backend/src/services/executor.ts#L1-L20).
  - Risk: If ALLOWED_COMMANDS ever include user-supplied content, injection risk; logs may expose operational commands.
  - Fix: Keep ALLOWED_COMMANDS static, avoid composing shell strings with unsanitized input, and redact sensitive output in logs.

- Token/session data in `/tmp` and T7 (ephemeral and external)
  - Evidence: Session parsing from `/tmp/claude-session-*.json` and use of `/Volumes/T7/_SYSTEM/token-tracker.md` in [backend/src/services/metrics.ts](backend/src/services/metrics.ts#L13-L24).
  - Risk: Race conditions and data loss; sensitive session artifacts stored in world-readable locations.
  - Fix: Persist token/session telemetry in the local database and implement safe sync to T7 when available.

- Potential credential exposure in boot logs
  - Evidence: `dotenv.config()` and logging patterns observed (Anthropic provider init visible in runtime logs). See [backend/src/services/exeoflow.ts](backend/src/services/exeoflow.ts#L6) and boot logging behavior in server startup.
  - Risk: Secrets in logs and console output.
  - Fix: Implement structured logging with redaction; never log raw secret values.

---

## High / Medium Findings

- Vault ingestion reports (console.log) but lacks strict failure thresholds; see [backend/src/services/vaultIngestion.ts](backend/src/services/vaultIngestion.ts#L204).
  - Fix: Track success/failure counts and fail ingestion if failure rate > threshold.

- No standardized health/readiness endpoints (the `/health` route returned 404 earlier).
  - Fix: Add `/api/health` and `/api/ready` with service-level checks.

- Process lifecycle: `ts-node-dev --respawn` and ad-hoc pkill patterns lead to orphaned processes.
  - Fix: Add PID files, graceful shutdown handlers, and avoid `--respawn` in production.

- Obsidian / local connector dependency is a single-point-of-failure.
  - Fix: Add reconnection/backoff logic and alerting on persistent disconnects.

---

## Evidence (selected file pointers)
- Auth: [backend/src/middleware/auth.ts](backend/src/middleware/auth.ts#L8)
- Executor: [backend/src/services/executor.ts](backend/src/services/executor.ts#L1-L20)
- Metrics (T7 + execSync): [backend/src/services/metrics.ts](backend/src/services/metrics.ts#L8-L47)
- Vault ingestion logging: [backend/src/services/vaultIngestion.ts](backend/src/services/vaultIngestion.ts#L204-L220)
- dotenv usage: [backend/src/services/exeoflow.ts](backend/src/services/exeoflow.ts#L6)
- Scripts referencing T7/model provisioning: [backend/scripts/provision_forge.sh](backend/scripts/provision_forge.sh#L1-L20)

---

## Immediate Remediation (first 24 hours)
1. Fail-fast on missing API_KEY: require `process.env.API_KEY` and exit if unset. (Patch `authMiddleware` at the link above.)
2. Replace shell parsing of `df` with `fs` or safe `exec` arg arrays; add local DB fallback for token tracker. (Patch `getSystemMetrics` in metrics service.)
3. Move token/session telemetry from `/tmp` and T7 -> persist to DB (`token_usage` table). (Add migrations and `initDatabase`.)
4. Redact secrets in boot logs and implement structured logger (winston). (Patch server boot logging.)
5. Implement `/api/health` and `/api/ready` endpoints and wire them to service checks.

---

## Next steps I can take for you
- Apply the highest-priority fixes automatically (remove default API key, add DB schema, fix execSync usage) and run tests. Estimated: 3–6 hours.
- Or produce minimal patches for you to review one-by-one.

---

Report generated by automated audit tooling + targeted code review.

