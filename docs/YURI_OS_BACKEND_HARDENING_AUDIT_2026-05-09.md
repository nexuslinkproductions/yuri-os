# Yuri OS Backend Hardening Audit

Date: 2026-05-09
Scope: backend/control plane only. external workflow frontends are out of implementation scope.

## Executive Summary

Verdict: **not production-grade**. Current risk: **critical**.

Yuri OS has real backend structure, but the release gate fails on data integrity, security boundary discipline, observability truth, and recovery proof. The strongest local evidence is not subtle: `backend/data/nudimmud.db` fails `PRAGMA integrity_check` with b-tree and index corruption. A system with a corrupted operational database cannot be called stable or release-ready.

Top blockers:

- Corrupted live backend SQLite DB: `backend/data/nudimmud.db`.
- Unauthenticated read/control routes expose repo/vault contents and control behavior on loopback HTTP.
- CORS rejection returns 500 HTML with stack traces.
- Telemetry mixes real measurements with `Math.random()` and hardcoded integration status.
- Health checks miss critical truth: wiki RAG health passes while the same DB fails SQLite integrity.
- Conclave/swarm/learning loops are partially wired, with simulated or simplified execution paths.
- Release pipeline has no committed test suite for backend behavior; build passed only after a small type fix in `backend/src/trading-server.ts`.

Safe implementation completed:

- Fixed strict TypeScript backend build blocker in `backend/src/trading-server.ts:93`.
- GitNexus impact before edit: `Const:backend/src/trading-server.ts:top3`, upstream risk `LOW`, 0 direct dependents, 0 affected processes.
- Verification: `npm --prefix backend run build` now passes.

No commit was made. Worktree already had broad unrelated/user-owned modifications.

## Benchmark Anchors

Primary sources used:

- Google SRE Workbook: SLO alerting should page on user-impacting SLO/error-budget events, with precision, recall, detection time, and reset time considered: https://sre.google/workbook/alerting-on-slos/
- Google SRE Workbook: release engineering requires reproducible builds, automated builds/tests/deployments, and small changes: https://sre.google/workbook/canarying-releases/
- Google SRE Workbook: postmortems drive reliability when written, acted on, and shared: https://sre.google/workbook/postmortem-culture/
- Microsoft SDL: security/privacy requirements must be formal across requirements, design, implementation, verification, and release: https://learn.microsoft.com/en-us/compliance/assurance/assurance-microsoft-security-development-lifecycle
- OpenTelemetry logs spec: logs/traces/metrics need uniform source attribution and correlation context: https://opentelemetry.io/docs/specs/otel/logs/
- Apple App Review completeness: test for crashes/bugs, complete metadata, enable backend services, and keep services live for review: https://developer.apple.com/app-store/review/guidelines/

Repo translation:

- Yuri OS needs deterministic health/readiness, DB integrity gates, SLO-backed alerts, authenticated control routes, real metrics, structured logs with correlation IDs, reproducible build/test/release, data backup/restore proof, and postmortem/review queues tied to actual incidents and regressions.

## System Cartography

| Subsystem | Classification | Evidence |
|---|---|---|
| HTTP backend boot | Live and wired | `backend/src/server.ts:83-87`, `backend/src/server.ts:639-681`; isolated boot on `127.0.0.1:3314` passed. |
| API key auth | Partially wired | Boot fails if `API_KEY` missing/short in `backend/src/middleware/auth.ts:8-12`; protected middleware in `auth.ts:60-69`; many routes bypass it. |
| Health/liveness/readiness | Partially wired | `server.ts:206-277`, `api.ts:85-112`; liveness passed; readiness 503 in isolated test because ingestion never ran; health 503 with guard disabled. |
| SQLite backend DB | Risky / unstable | `backend/data/nudimmud.db` integrity check reports b-tree/index corruption; schema/migrations in `backend/src/models/database.ts:36-314`, `343-420`. |
| OS kernel memory DB | Live and wired | `_SYSTEM/OS_KERNEL/memory.db` integrity check returned `ok`; schema in `_SYSTEM/OS_KERNEL/schema.sql:1-56`. |
| GitNexus | Partially wired / tooling degraded | `npx gitnexus status` up to date; `query` returns no results due read-only FTS write failure; direct `context`/`impact` worked. |
| Vault ingestion | Partially wired | `backend/src/services/vaultIngestion.ts:279-378`; async embeddings mean ingestion can report before retrieval quality is proven. |
| Vault watcher | Live but narrow | `backend/src/services/vaultWatcher.ts:32-124`; watches selected dirs, debounced ingestion. |
| Wiki RAG launchd | Live but incomplete gate | `node Scripts/wiki-rag-health.mjs` returned `ok`; health script opens DB but does not run `PRAGMA integrity_check` (`Scripts/wiki-rag-health.mjs:55-190`). |
| Stability guard | Stubbed / partial | Runs every 10s (`stabilityGuard.ts:20-24`), reconnects Obsidian, but escalation is comment-only (`stabilityGuard.ts:64-66`). |
| Telemetry/status | Risky / theatrical | Random status fields in `server.ts:282-299`; `GITNEXUS_MCP` hardcoded connected in `server.ts:370-374`; OpenTelemetry absent. |
| Oracle/Conclave | Partially wired / simulated | `oracleService.ts:35-425`; Conclave nodes use demo/simple parsing and canned fallbacks (`ArchitectNode.ts:27`, `CraftsmanNode.ts:33-36`). |
| Swarm orchestration | Partially wired | `swarmOrchestrator.ts:29-47`; depends on model output JSON and writes agent status/messages. |
| Learning/session improvement | Partially wired | Schema in `database.ts:219-241`; service in `sessionImprovementService.ts`; Oracle writes records, but no trend/promotion/regression control loop. |
| Yuri Flow backend seam | Premature / partially wired | historical route audit found time-entry endpoints mixed into the main router. |
| Release/test pipeline | Missing / weak | No backend `test` script; build now passes after fix; smoke probes were manual. |

## Findings Ordered By Severity

### CRITICAL: Live backend database is corrupt

Evidence:

- Command: `sqlite3 backend/data/nudimmud.db "PRAGMA integrity_check; ..."`
- Result includes b-tree errors, repeated page references, wrong index entry counts, and missing ticket index rows.
- `backend/src/models/database.ts:25-29` enables WAL and foreign keys, but there is no startup integrity gate.

Failure mode:

- Reads can return wrong records; writes can amplify corruption; indexes can lie; release gates can pass while data is invalid.

Blast radius:

- All backend API reads/writes, notebooks, telemetry, tickets, projects, events, session logs, RAG health.

Standard violated:

- Google SRE release/readiness: backend cannot be considered live/ready without data correctness.
- Apple release completeness: backend services must be live and functional, not silently corrupt.

Required action:

1. Stop writes.
2. Copy DB and WAL/SHM files to a dated recovery directory.
3. Run `.backup`, `.dump`/restore, `REINDEX`, and `PRAGMA integrity_check` on a clone only.
4. Promote restored DB only after integrity, foreign key check, and app smoke pass.
5. Add startup/readiness gate for `integrity_check` cadence and last known-good backup.

### CRITICAL: Unauthenticated repo/vault read surfaces

Evidence:

- `GET /api/knowledge/detail?path=package.json` returned full repo `package.json` without auth.
- `GET /api/files/ls?path=backend/src` returned backend source tree without auth.
- Routes: `backend/src/routes/api.ts:466-473`, `api.ts:493-500`.
- File readers: `backend/src/services/fileSystem.ts:19-40`, `backend/src/services/knowledgeService.ts:19-55`.

Failure mode:

- Any local process/browser that can hit loopback can enumerate and read repo/vault files inside `SystemConfig.ROOT`.

Blast radius:

- Source code, docs, operational metadata, potentially non-dot secret-adjacent files. `.env` is blocked by hook/tool policy, not by the HTTP route itself.

Standard violated:

- Microsoft SDL: security requirements and threat modeling are not applied consistently.

Required action:

- Put all file/read/detail routes behind `authMiddleware` or `localOnlyMiddleware + explicit allowlist`.
- Restrict readable roots to knowledge-vault markdown directories, not entire repo.
- Add tests proving `package.json`, `backend/src`, `backend/data`, and dotfiles cannot be read anonymously.

### HIGH: Control routes bypass auth

Evidence:

- `POST /api/swarm/route` unauthenticated and returned routing policy (`api.ts:406-411`).
- `POST /api/obsidian/reconnect`, `/restart-sync`, `/sync` unauthenticated (`api.ts:645-678`).
- Historical time-entry read routes were exposed without auth before the Yuri Flow assimilation pass.
- Direct duplicate Obsidian app routes before router are unauthenticated (`server.ts:399-437`).

Failure mode:

- Loopback adversary or browser-mediated request can trigger reconnection/control surfaces and read business-operational state.

Blast radius:

- Obsidian bridge, swarm routing, Yuri Flow time state, operational disclosure.

Required action:

- Default-deny `/api` control routes; explicitly mark public routes.
- Remove duplicate direct Obsidian routes or protect them.
- Add route inventory test that fails on unauthenticated non-public handlers.

### HIGH: CORS rejection leaks stack and returns 500

Evidence:

- Request with `Origin: https://evil.example` returned `500 Internal Server Error` HTML stack trace.
- Source: `backend/src/server.ts:185-193` passes `Error('CORS_BLOCKED')` to Express default error handler.

Failure mode:

- Cross-origin denial is treated as server crash and leaks file paths/stack.

Blast radius:

- Information disclosure and noisy false incidents.

Required action:

- Return deterministic 403 JSON for blocked CORS and disable Express stack leakage in production.
- Add `app.disable('x-powered-by')` and central error handler.

### HIGH: Observability is not truth-preserving

Evidence:

- Random telemetry values: `server.ts:290-294`.
- Hardcoded `GITNEXUS_MCP` status: `server.ts:370-374`.
- OpenTelemetry absent; logs are console/file strings without trace/span correlation.
- `Scripts/wiki-rag-health.mjs` passes despite corrupted backend DB.

Failure mode:

- Operators get attractive numbers that cannot drive incident decisions.

Blast radius:

- Health, dashboards, agent status, route decisions, release gates.

Standard violated:

- Google SRE SLO alerting and OpenTelemetry log/metric/trace correlation guidance.

Required action:

- Replace random metrics with measured values or remove them.
- Add `GET /metrics` or OTLP exporter with request count, latency histogram, error count, DB integrity status, ingestion lag, queue depth, and model provider health.
- Health scripts must include DB integrity and migration checks.

### HIGH: Recovery behavior is partial and not proven

Evidence:

- `StabilityGuard` only reconnects Obsidian; escalation is a comment (`stabilityGuard.ts:51-66`).
- `gracefulShutdown` exists (`server.ts:586-628`) and passed SIGTERM smoke, but no crash/restart/restore test exists.
- Checkpointer can drop `cognitive_states` if legacy type detected (`backend/src/conclave/Checkpointer.ts:21-23`).

Failure mode:

- Recovery can lose checkpoint state or silently degrade without paging/release block.

Required action:

- Define recovery runbooks and tests: DB restore, Obsidian offline, model provider outage, ingestion failure, SIGTERM, port collision.
- Replace destructive checkpointer migration with backup-and-migrate.

### MEDIUM: Session improvement loop records sessions but is not a control loop

Evidence:

- Schema: `database.ts:219-241`.
- Start/finalize/review: `sessionImprovementService.ts:174-264`.
- Summary/review queue: `sessionImprovementService.ts:266-313`.
- Oracle writes records (`oracleService.ts:80-107`, `160-174`, `326-344`).

Failure mode:

- It can accumulate logs and scores but cannot prove repeated wins, promote lessons, or flag regression trends.

Required action:

- Add trend table/view, promotion threshold, regression threshold, review queue aging, and lesson promotion state.

### MEDIUM: Conclave/swarm claims exceed implementation

Evidence:

- Architect parsing says demonstration (`ArchitectNode.ts:27`).
- Craftsman says real patch artifact is not implemented (`CraftsmanNode.ts:33-36`).
- `fusion-swarm` returns canned synthesis (`neuralForgeService.ts:738-746`).
- Local LLM chat path is disabled while local-first routing still advertises local models (`neuralForgeService.ts:337-343`, `smartRouter.ts:251-259`).

Failure mode:

- Docs and UI may imply autonomous implementation/reasoning where runtime is degraded/canned/partial.

Required action:

- Label these endpoints `experimental` or remove production claims until execution artifacts are real and tested.

### MEDIUM: Wiki RAG watcher has source-list drift

Evidence:

- Watcher hashes `_SYSTEM/yuri-wiki/reports/staleness/09c-rag-deferred.md` (`Scripts/wiki-rag-watch.mjs:19`).
- Actual file is `09c-rag-gate-deferred.md`; ingest script uses the actual path (`backend/src/scripts/ingestWikiControlPlane.ts:29`).

Failure mode:

- Change detection can miss the real deferred-gate source or hash a missing sentinel forever.

Required action:

- Normalize source list into one shared manifest and test all paths exist.

## Gap Analysis

Must-have gaps:

- DB integrity gate, backup/restore procedure, foreign key check, migration ledger.
- Route authentication matrix and public-route allowlist.
- Structured error handler and no stack leaks in production.
- Real telemetry and SLO-backed alerts.
- Deterministic smoke/regression tests in package scripts.
- Release gate with build, typecheck, smoke, DB integrity, route auth, CORS, and health checks.
- Incident/postmortem workflow tied to event log and review queue.

Optional later:

- Full OTLP collector deployment.
- Canarying and rollback automation.
- Multi-node database/messaging architecture.
- Formal policy-as-code for route security.

## Rubric

| Dimension | Status | Confidence | Missing control | Next fix |
|---|---|---:|---|---|
| Reliability | Critical fail | High | DB integrity and deterministic readiness | Recover DB, add integrity gate |
| Security | High risk | High | Route auth matrix, CORS/error hardening | Default-deny routes |
| Observability | Weak/theatrical | High | Real metrics, traces, correlated logs | Replace random telemetry |
| Recoverability | Partial | Medium | Tested restore/restart/runbooks | Backup/restore drill |
| Release readiness | Fail | High | Tests and clean build gate | Add backend smoke suite |
| Architectural cohesion | Mixed | Medium | Clear control-plane boundaries | Split public/internal/control APIs |
| Operational simplicity | Weak | High | One command health gate | `npm run backend:release-gate` |
| Learning-loop quality | Partial | Medium | Promotion/regression logic | Add trend/promotion schema |
| Data integrity | Critical fail | High | Integrity checks, migrations | DB recovery first |
| Coupling risk | High | Medium | Yuri Flow seam contract | Freeze backend-only contracts |
| Test coverage | Weak | High | Backend route/DB tests | Add integration tests |
| Evidence alignment | Poor | High | Docs/runtime verification | Mark docs-only claims |
| Integration readiness | Not ready | High | Stable API/SLO/security contracts | Delay external workflow fusion |

## Hardening Roadmap

Phase 0: stop false confidence

1. Freeze writes to `backend/data/nudimmud.db` until recovery clone passes integrity.
2. Create DB recovery runbook and restored DB candidate.
3. Add health gate fields: `dbIntegrity`, `schemaVersion`, `lastBackupAt`, `lastIntegrityCheckAt`.
4. Remove/random-label simulated telemetry.
5. Protect unauthenticated read/control routes.
6. Add central JSON error handler and CORS 403.

Phase 1: release gate

1. Add `backend:smoke` script: boot with `:memory:`, test liveness/readiness/auth/CORS/public-route matrix.
2. Add `backend:db:check`: `integrity_check`, `foreign_key_check`, migration version.
3. Add `backend:route-audit`: fail unauthed control/read routes.
4. Add `backend:release-gate`: build + smoke + DB checks + GitNexus status.
5. Fix GitNexus query FTS read-only issue or document CLI fallback.

Phase 2: operational platform

1. Add structured logger with request/correlation ID.
2. Emit metrics: request count, error count, latency, DB health, ingestion lag, watcher state, provider health.
3. Define SLO alerts and error budget burn policy.
4. Add postmortem templates tied to `event_log` and `session_improvement_log`.

Phase 3: learning control loop

1. Add `session_lesson_candidates`, `session_regression_trends`, and `promoted_lessons`.
2. Promote only repeated wins: 3 matching improved/stable sessions over 7 days, average improvement score >= 75, no regression in same tag.
3. Regression threshold: 2 regressed sessions in same tag within 7 days or average score drop >= 15.
4. Human review cadence: twice weekly or whenever pending queue > 10.

## Operating Model

SLIs:

- HTTP availability: successful `/api/health/live` and `/api/health/ready`.
- Request success rate by route class.
- p95 latency by route class.
- DB integrity status and backup age.
- Ingestion freshness and failure rate.
- Model provider availability and timeout rate.
- Session improvement score trend by topic tag.

Initial SLOs:

- Core API availability: 99.5% monthly for loopback service.
- Readiness after boot: 95% of starts ready within 60s when watchers enabled.
- DB integrity: 100% of release gates must pass `integrity_check`.
- Ingestion: failure rate < 2% per run; no stale source > 24h for wiki control-plane.

Error budget:

- Monthly API error budget: 0.5%.
- Freeze non-critical changes if 25% of budget burns in 24h or DB integrity fails once.

Alert policy:

- Page/operator interrupt: DB integrity failure, readiness > 5m, auth bypass test failure, backend crash loop, ingestion failure rate > 10%.
- Ticket only: provider degraded, Obsidian fallback mode, pending review queue > 10, wiki RAG stale > 24h.

Incident policy:

- Write postmortem for DB corruption, data loss, auth bypass, failed release gate, repeated crash loop, or false green health.
- Postmortem must include trigger, timeline, impact, detection gap, corrective actions, owner, and due date.

Unacceptable states:

- Corrupted DB used as source of truth.
- Health green while DB integrity fails.
- Unauthenticated file/control routes except explicit public allowlist.
- Simulated metrics displayed as operational truth.
- external workflow fusion before backend route/auth/data contracts exist.

## Session Improvement Loop

Record structure:

- `session_id`, `goal`, `command`, `command_type`, `voice_mode`, `topic_tags`, `what_happened`, `corrections`, `rework`, `outcome`, `auto_score`, `human_score`, `improvement_score`, `what_got_better`, `what_got_worse`, `notes`, `metadata`, `reviewed_at`, timestamps.

Scoring model:

- Keep current auto score as first pass, but add deterministic inputs: build pass/fail, tests pass/fail, route probes, DB checks, incident count, rework count, user correction count.

Promotion threshold:

- Same lesson appears in 3 reviewed sessions, score >= 75, no contradictory regression in 7 days.

Regression threshold:

- Same topic has 2 regressions in 7 days, or rolling average drops by 15 points.

Review cadence:

- Human review twice weekly, immediate review for any critical/high incident.

Visibility:

- `/api/oracle/improvement` should show rolling 7/30 day trends, promoted lessons, regression candidates, and stale review age.

## Yuri Flow Seam Contract

Do not implement an external workflow frontend now.

Yuri OS must guarantee before external workflow clients connect:

- Authenticated API with scoped tokens.
- Stable OpenAPI or typed contract for projects, tickets, time entries, health, and telemetry.
- Read-only safe endpoints separated from mutation endpoints.
- No direct DB coupling from workflow clients.
- No backend-only internals exposed: raw prompts, API keys, provider status details beyond safe health classes, filesystem paths, raw session logs.
- Compatibility constraints: versioned API paths, backward-compatible response changes, explicit deprecation policy.

Current Yuri Flow routes must remain backend-owned and auth-protected:

- `POST /api/yuri-flow/time` is auth-protected.
- `GET /api/yuri-flow/entries` and `/pending` are auth-protected.

## Verification Plan

Smoke tests:

- Boot isolated: `PORT=3314 NUDIMMUD_TEST_MODE=1 NUDIMMUD_DB_PATH=:memory: API_KEY=<32 chars> npm --prefix backend run dev`.
- Probe `/api/health/live`, `/api/health/ready`, `/api/health`, `/api/health/auth`.
- Probe bad CORS origin and assert 403 JSON, no stack.
- Probe file/read routes without auth and assert 401/403.

Regression tests:

- Route auth matrix test.
- DB migration/idempotence test with `:memory:`.
- DB integrity check test against restored DB clone.
- Session improvement scoring/trend tests.
- Vault ingestion duplicate/source-list tests.

Observability validation:

- Every request has request ID.
- Logs include route, status, duration, request ID.
- Metrics expose real counts/histograms and DB health gauge.
- No random or canned operational metrics.

Failure-mode tests:

- DB unavailable/corrupt.
- Obsidian offline.
- Ollama/provider unavailable.
- Ingestion error > threshold.
- Port collision.
- SIGTERM graceful shutdown.
- GitNexus unavailable/read-only query.

Continuous improvement proof:

- Weekly report compares session score averages, regressions, promoted lessons, incident count, and repeated failure classes.
- No lesson promotion without repeated evidence.

## Decision Log

Assumptions:

- Loopback-only binding reduces exposure but does not eliminate local/browser-mediated risk.
- Dirty worktree changes are user-owned unless explicitly modified in this audit.
- external workflow clients remain future seams only.

Unresolved choices:

- DB recovery method: `.backup` vs `.dump` restore vs promote previous backup.
- Auth model: single API key vs scoped local tokens.
- Observability backend: Prometheus/OpenMetrics endpoint vs OTLP collector first.
- Whether launchd watcher is production service or local convenience daemon.

What would change this verdict:

- Restored backend DB passes integrity and foreign-key checks.
- Release gate added and passing.
- All non-public routes auth-protected.
- Telemetry becomes measured, correlated, and alertable.
- Recovery runbooks pass drills.

## Verification Log

Commands run:

- `npx gitnexus status`: index up to date.
- `npx gitnexus query --repo nudimmud-vault ...`: failed to return useful results due read-only FTS maintenance error.
- `npx gitnexus context/impact`: direct symbol lookup/impact worked.
- `npm --prefix backend run build`: failed initially at `backend/src/trading-server.ts:93`; passed after one-line type annotation.
- Isolated server boot: passed on `127.0.0.1:3314`.
- `curl /api/health/live`: 200.
- `curl /api/health/ready`: 503 in test mode because ingestion was suppressed.
- `curl /api/health`: 503 in test mode because stability guard was off.
- `curl /api/health/auth` without key: 401; with key: 200.
- `curl /api/knowledge/detail?path=package.json`: 200 without auth, returned file content.
- `curl /api/files/ls?path=backend/src`: 200 without auth, returned source tree.
- Bad CORS origin: 500 HTML stack trace.
- `sqlite3 backend/data/nudimmud.db "PRAGMA integrity_check"`: failed.
- `sqlite3 _SYSTEM/OS_KERNEL/memory.db "PRAGMA integrity_check"`: ok.
- `node Scripts/wiki-rag-health.mjs`: ok despite backend DB integrity failure.
- `npx gitnexus detect-changes --repo nudimmud-vault --scope unstaged`: high risk due broad pre-existing dirty worktree, 32 files / 152 symbols / 7 affected processes.
