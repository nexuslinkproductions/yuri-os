# Fanout Run 016 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no target execution, no live service calls, no credential use
Worker mode: single persistent Claude/tmux lane, active cap `1`

## Acceptance Summary

Run 016 is accepted with C-137 corrections.

- `R016_SHARED_PLANE_PRODUCTION_HUB_OPUS / SHARED-PLANE-PRODUCTION-HUB-016`: worker closed with `files_covered=10 findings=13 suppressions=9 deferred=2 invalidated=0`.
- C-137 accepted the 10 assigned files as covered and corrected public-reachability wording for scheduled-style functions.

Accepted assigned target surfaces added by Run 016: `10`.

Accepted assigned target coverage total after Run 016: `258 / 1505` tracked files.

Strict semantic caveat carried forward: two lockfiles are currently `partial`: `Scripts/telegram-mcp/package-lock.json` from Run 008 and `Scripts/team-bots/package-lock.json` from Run 010. Full semantic coverage is `256 covered + 2 partial`.

Contamination check: passed. C-137 checked the Run 016 pipe log for protected Claude runtime reads, `Searched memories`, and invalidation markers. The only protected-path strings were from the packet boundary/prompt text; no protected-runtime read was accepted.

Clone proof: C-137 verified the target clone at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, clean status count `0`, and `1505` tracked files.

Source pipe log:

- `/tmp/yuri-c2v-fanout-run-016/pipe/r016-single.pipe.log`

## C-137 Corrections

Lane output remains advisory until verified. C-137 corrected these points before acceptance:

- The worker's "any HTTP caller" phrasing for `deep-learning.js` and `metrics-snapshot.js` is too broad for the tracked PM2 `server/index.js` path. `server/index.js` maps them under `/_internal/scheduled/*`, and Caddy restricts `/_internal/*` to loopback. However, `production-server.js` exposes all loaded functions through `/.netlify/functions/:name`, and Netlify-style deployments would expose function routes directly. Therefore these are accepted as high deployment-dependent function-boundary findings, not confirmed live public internet exposure.
- `metrics-snapshot.js`'s pagination bug is accepted as high availability even without public exposure, because PM2 cron can invoke it daily and the bug can burn Plane API quota/function runtime if a project returns exactly 100 issues on page 1.
- `token-usage.js` GET exposure is deployment-dependent because tracked `server/index.js` does not register a public `token-usage` route. It is still reportable for any generic Netlify/`production-server.js` deployment surface.
- `shared-facts.js` remains deferred for final severity until the Supabase `assert_fact` RPC and RLS migration evidence is inspected.
- `syncTeamIds` was already file-covered in Run 015 through `shared-config.js`, but Run 016 did not re-validate that exact helper path. It is queued only if needed for deep-learning data-quality closure.

## Executive Findings

Run 016 strengthens two major audit themes.

First, the Plane integration is split across multiple incompatible helper implementations. `shared-plane.js` knows Plane uses cursor pagination and includes a 50-page cap/dedup guard. `shared-plane-client.js` has a token-bucket rate limiter and retry/backoff behavior. `metrics-snapshot.js` ignores both and carries a local page-number pagination loop that the repo itself says is wrong for Plane. This is a real wiring/architecture quality defect, and it is one of the first concrete explanations for suspicious runtime/resource behavior.

Second, scheduled and observability functions are relying on deployment perimeter instead of consistent function-level auth. `health.js` and `production-hub.js` are properly `checkAuth`-gated, but `metrics-snapshot.js` and `deep-learning.js` do not authenticate at the function body. That can be tolerable only if the route is always loopback-only. Given the repo's deployment split-brain, that assumption is not stable enough.

## Shared Plane / Production Hub Lane

Lane: `R016_SHARED_PLANE_PRODUCTION_HUB_OPUS`
Batch: `SHARED-PLANE-PRODUCTION-HUB-016`

Files covered:

- `Dashboard-v2/functions/shared-plane.js`
- `Dashboard-v2/functions/shared-plane-client.js`
- `Dashboard-v2/functions/shared-telegram.js`
- `Dashboard-v2/functions/shared-facts.js`
- `Dashboard-v2/functions/shared-idempotency.js`
- `Dashboard-v2/functions/production-hub.js`
- `Dashboard-v2/functions/token-usage.js`
- `Dashboard-v2/functions/health.js`
- `Dashboard-v2/functions/metrics-snapshot.js`
- `Dashboard-v2/functions/deep-learning.js`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `R016-F01` | high candidate | `Dashboard-v2/functions/deep-learning.js:281`, `Dashboard-v2/production-server.js:118-164`, `Dashboard-v2/server/index.js:92-93` | security/cost | `deep-learning.js` has no function-level auth and performs Plane reads, Supabase writes, storage reads, and Telegram broadcasts. In tracked `server/index.js` it is loopback-scheduled, but generic Netlify/`production-server.js` routing would expose it as a public function. |
| `R016-F02` | high | `Dashboard-v2/functions/metrics-snapshot.js:49-60`, `Dashboard-v2/functions/shared-plane.js:41-47` | availability | `metrics-snapshot.js` uses `page=N` pagination even though `shared-plane.js` documents that Plane ignores page numbers and requires cursors. If the first page has 100 issues, the loop can repeat page 1 until function timeout, inflating counts and burning Plane API quota. |
| `R016-F03` | high candidate | `Dashboard-v2/functions/metrics-snapshot.js:135`, `Dashboard-v2/server/ecosystem.config.js:130-149`, `Dashboard-v2/production-server.js:118-164` | security/availability | `metrics-snapshot.js` has no function-level auth and writes `daily_metrics`. Under tracked PM2 it is intended as a loopback cron route; under generic function routing it becomes externally triggerable. |
| `R016-F04` | medium/high candidate | `Dashboard-v2/functions/token-usage.js:13-14`, `Dashboard-v2/functions/token-usage.js:106-125` | security/privacy | `token-usage.js` protects POST with `X-Internal-Key`, but GET returns model/source/cost/token stats with no auth and prefers service-role credentials. Tracked `server/index.js` does not register it, so public reachability is deployment-dependent. |
| `R016-F05` | medium | `Dashboard-v2/functions/metrics-snapshot.js:30-46`, `Dashboard-v2/functions/shared-plane.js:13-70`, `Dashboard-v2/functions/shared-plane-client.js:77-103` | wiring | There are three Plane HTTP helper behaviors: local no-timeout/no-retry page-number logic, shared cursor/dedup logic, and token-bucket retry/backoff logic. This is a maintenance and runtime-consistency defect. |
| `R016-F06` | medium | `Dashboard-v2/functions/deep-learning.js:38-49`, `Dashboard-v2/functions/shared-telegram.js:86-93` | wiring | `deep-learning.js` reimplements Telegram send instead of using `shared-telegram.js`, so CEO language-drift detection/audit and caller metadata stripping are bypassed for nightly intelligence messages. |
| `R016-F07` | medium | `Dashboard-v2/functions/production-hub.js:74-82`, `Dashboard-v2/functions/production-hub.js:93-94` | security | `production-hub.js` uses `checkAuth`, but GET accepts arbitrary `entity` strings while the entity allowlist is enforced only for POST. Authenticated callers can read arbitrary key families in the `production-hub` bucket. |
| `R016-F08` | medium | `Dashboard-v2/functions/shared-plane.js:13-70`, `Dashboard-v2/functions/shared-plane-client.js:16-103` | wiring/availability | `shared-plane.js` has no rate limit and fail-soft errors; `shared-plane-client.js` has a 30 rpm token bucket, Retry-After handling, and throws after retries. Same provider, same key, incompatible behavior. |
| `R016-F09` | low | `Dashboard-v2/functions/shared-idempotency.js:10-16` | availability | Daily idempotency is storage-backed but not atomic: callers perform read-then-write in two operations, leaving a concurrency race. |
| `R016-F10` | low/deferred | `Dashboard-v2/functions/shared-facts.js:21-23`, `Dashboard-v2/functions/shared-facts.js:86-128` | security/data-integrity | `assertFact` uses the anon Supabase key to call `rpc/assert_fact` with caller-controlled predicate/value/confidence/source fields. Final severity depends on database-side RPC grants and RLS policies. |
| `R016-F11` | low | `Dashboard-v2/functions/shared-telegram.js:86-93` | availability/security | Shared Telegram send uses `parse_mode: 'HTML'` without escaping text. Caller-provided `<`, `>`, or `&` can cause Telegram parse failures or formatting/link ambiguity; errors resolve silently. |
| `R016-F12` | info | `Dashboard-v2/functions/health.js:204-207` | observability | Health timestamps are hardcoded to UTC+2, so winter CET incident timestamps will be wrong. |
| `R016-F13` | info | `Dashboard-v2/functions/health.js:89-124` | observability/cost | Every health check performs a fresh Microsoft OAuth client-credentials token grant instead of caching; this creates avoidable audit noise at high polling frequency. |

Suppressions:

- `shared-plane.js` cursor pagination is not itself unbounded: `planeGetAll` has a 50-page cap, id dedup, and a `newRows === 0` bail-out.
- `shared-plane-client.js` is not missing rate limiting: it has a token bucket, exponential backoff, Retry-After handling, and retry caps.
- `shared-telegram.js` broadcast recipients are sourced from `TELEGRAM_ALLOWED_USERS`, not caller-controlled input.
- `shared-telegram.js` does have CEO language-drift controls and audit rows for shared send callers.
- `production-hub.js` CRUD is not unauthenticated: it calls `checkAuth` before storage access.
- `production-hub.js` POST writes are entity-allowlisted.
- `health.js` is not public without auth in function body: it calls `checkAuth`.
- `shared-plane.js` does not serve stale data when `PLANE_API_KEY` is missing; reads resolve empty and POST rejects.
- `shared-idempotency.js` is persistent storage-backed, not in-memory-only.

Deferred:

- `Supabase:assert_fact RPC`: database-side RPC grants/RLS are required to determine whether anon-key fact writes are safe.
- `syncTeamIds` behavior in `shared-config.js`: already file-covered in Run 015, but may need a targeted closure pass if deep-learning data integrity remains open.

## C-137 Spot Checks

C-137 directly checked these anchors in the canonical clone before accepting:

- `server/index.js:84-93`, `production-server.js:67-116`, `production-server.js:118-164`, `Caddyfile.template:18-23`: public vs loopback route posture for scheduled functions.
- `server/ecosystem.config.js:130-149`: PM2 scheduled trigger evidence for metrics/deep-learning.
- `deep-learning.js:22-26`, `38-49`, `94-109`, `281-330`: credential sources, duplicated Telegram send, Plane scan, no handler auth.
- `metrics-snapshot.js:30-60`, `135-152`: local Plane helper, page-number loop, no auth gate.
- `shared-plane.js:41-70`: documented cursor-pagination fix, dedup, and cap.
- `shared-plane-client.js:16-103`: rate limiter and retry/backoff.
- `production-hub.js:63-94`: `checkAuth`, GET entity handling, POST allowlist.
- `token-usage.js:13-14`, `106-125`: service-role preference, POST auth, unauthenticated GET.
- `shared-telegram.js:19-31`, `34-58`, `86-104`: drift detection, audit, HTML send, allowlist broadcast.
- `shared-facts.js:21-23`, `86-128`: anon-key RPC write path.
- `shared-idempotency.js:10-16`: non-atomic daily lock.
- `health.js:89-124`, `181-207`: checkAuth, M365 token grant, hardcoded UTC+2 timestamp.

## Immediate Implications

1. Replace `metrics-snapshot.js`'s local Plane loop with the cursor/dedup implementation in `shared-plane.js`; this is a strong candidate for runtime/resource symptoms.
2. Add function-level `checkAuth`/HMAC validation to scheduled functions even if they are intended to be loopback-only.
3. Collapse the Plane clients into one helper with cursor pagination, rate limiting, retry/backoff, timeout, and consistent error behavior.
4. Gate `token-usage.js` GET before exposing it in any generic function deployment.
5. Apply the `production-hub` entity allowlist to GET as well as POST.
6. Use `shared-telegram.js` everywhere and add a shared HTML escaping layer.

## Next Queue

Run 017 should stay single-lane and close Supabase/RLS/RPC evidence for the fact ledger and decision/metrics tables:

1. `Dashboard-v2/db-migrations/003_security_hardening.sql`
2. `Dashboard-v2/db-migrations/004_n1_auth_hardening.sql`
3. `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql`
4. `Dashboard-v2/db-migrations/006_nex_language_drift.sql`
5. `Dashboard-v2/db-migrations/007_nex_rag_foundation.sql`
6. `Dashboard-v2/db-migrations/009_nex_search_outcome_boost.sql`
7. `Dashboard-v2/db-migrations/020_nex_decisions_yesterday_rollup.sql`
8. `Dashboard-v2/db-migrations/023_nex_agent_health_summary.sql`
9. `Dashboard-v2/db-migrations/024_nex_canonical_freshness.sql`
10. `Dashboard-v2/db-migrations/026_nex_module_status.sql`
