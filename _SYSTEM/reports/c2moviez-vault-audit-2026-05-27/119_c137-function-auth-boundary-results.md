# C-137 Function Auth Boundary Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection and static auth-pattern extraction. No target source files mutated. No target scripts executed. No live services called.

## Scope

This shard checks the tracked function auth model after the route-contract pass:

```text
function entrypoints
  -> shared auth helper / bearer helper / internal key / webhook signature / route isolation
  -> service-role use
  -> authorization proof and failure mode
```

The repo has several good controls, but they are fragmented. Some handlers use `auth-check.js`, tracker handlers reimplement Supabase bearer verification and delegate authorization to untracked RPCs, internal callers still use legacy bare `X-Internal-Key`, and scheduled/Telegram handlers rely heavily on being reachable only through the right route model. Because route truth is already inconsistent, auth boundaries cannot be trusted from source alone.

## Findings

### R119-F01 - Shared `checkAuth` Still Accepts Legacy Bare Internal Keys

Severity: Critical when combined with credential exposure  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/functions/auth-check.js:19-27` documents HMAC internal signatures but keeps a backward-compatible bare key path.
- `Dashboard-v2/functions/auth-check.js:75-87` implements the stronger timestamped HMAC signature.
- `Dashboard-v2/functions/auth-check.js:113-119` accepts `x-internal-key` when it equals `INTERNAL_SERVICE_KEY`.
- `Dashboard-v2/functions/event-dispatch.js:177-179` uses `checkAuth`, so the legacy key path reaches event dispatch.
- `Dashboard-v2/functions/plane-webhook.js:59-74` forwards to event-dispatch using `X-Internal-Key`, not the HMAC signature.
- Earlier credential-hygiene shard `115_c137-secret-exposure-credential-hygiene-results.md` verified hardcoded internal key exposure in tracked source, redacted in the report.

Impact:

The stronger HMAC design exists, but the live-compatible bare-key bypass remains active. If an internal key is exposed, replay and direct invocation become much easier because the caller does not need to sign the exact request body or timestamp.

Required remediation direction:

- Remove the legacy `X-Internal-Key` acceptance path from `auth-check.js`.
- Migrate all internal callers to timestamped HMAC signatures.
- Rotate `INTERNAL_SERVICE_KEY` because it has appeared in source.
- Add a static check that rejects new `X-Internal-Key` callers outside a migration test.

### R119-F02 - `checkAuth` Authenticates A Session But Does Not Enforce Route-Level Authorization

Severity: High authorization-model drift risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/functions/auth-check.js:103-135` returns success after internal signature, legacy key, or a valid custom `exeo_token`/Bearer token.
- The helper does not accept required roles, modules, permissions, or endpoint scopes.
- Representative handlers such as `Dashboard-v2/functions/chat.js:58-60`, `Dashboard-v2/functions/event-dispatch.js:177-179`, `Dashboard-v2/functions/schedule-list.js:117-118`, and `Dashboard-v2/functions/health.js:182-184` stop at `checkAuth(event)`.
- Earlier schema shard `116_c137-schema-data-contract-results.md` found the per-user permission tables/RPCs referenced by UI were not source-tracked.

Impact:

For any handler that does not perform its own downstream permission check, "authenticated" can become "authorized." In a dashboard with CRM, meeting, scheduling, messaging, and AI tools, endpoint-level scope matters. The repo cannot prove which functions are CEO-only, admin-only, team-member-only, internal-only, or safe for all authenticated users.

Required remediation direction:

- Extend the auth gate to support `requireRole`, `requirePermission`, and `requireInternal`.
- Add endpoint metadata for required scope.
- Add tests that a normal authenticated user cannot call admin, dispatch, health, finance, or control-plane endpoints.

### R119-F03 - Tracker Handlers Use Service Role After Only Bearer Identity Verification

Severity: High authorization and data-integrity risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/functions/tracker-start.js:56-64` verifies a Supabase Bearer token by calling `/auth/v1/user`.
- `Dashboard-v2/functions/tracker-start.js:66-70` then calls RPCs with `SUPABASE_SERVICE_ROLE_KEY`/service key.
- `Dashboard-v2/functions/tracker-start.js:82-103` passes `caller.id` to `tracker_start`; the comment at `10-13` says permission enforcement happens inside the RPC.
- `Dashboard-v2/functions/tracker-admin-set-fte.js:41-49` performs the same bearer identity check.
- `Dashboard-v2/functions/tracker-admin-set-fte.js:51-55` calls RPCs with service-role authority.
- `Dashboard-v2/functions/tracker-admin-set-fte.js:75-81` calls `tracker_set_capacity`; the comment at `5-8` says the RPC is gated on `tracker.manage_settings` or CEO.
- Schema shard `116_c137-schema-data-contract-results.md` did not find tracked definitions for multiple tracker RPCs and permission RPCs used by these flows.

Impact:

The handlers themselves prove identity, not authorization. They rely on live database RPC definitions to enforce permissions while invoking those RPCs with service-role credentials. If an RPC is missing, permissive, altered live-only, or called with a wrong actor parameter, the JavaScript layer does not provide a second guard.

Required remediation direction:

- Track every tracker RPC definition and permission check in migrations.
- Add handler-level `requirePermission` checks before service-role RPC calls.
- Add tests for normal user, target user, manager, CTO, CEO, and unauthenticated cases.

### R119-F04 - Scheduled Functions Are Safe Only If Route Isolation Is Correct

Severity: High contingent exposure risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/server/Caddyfile.template:18-23` blocks non-loopback access to `/_internal/*`.
- `Dashboard-v2/server/index.js:85-93` maps selected scheduled jobs only under `/_internal/scheduled/*`.
- Several scheduled handlers do not implement their own auth gate:
  - `Dashboard-v2/functions/telegram-eod.js:29-38` sends idempotent Telegram summaries without checking an inbound signature.
  - `Dashboard-v2/functions/telegram-proactive.js:44-54` sends proactive Telegram check-ins without checking an inbound signature.
  - `Dashboard-v2/functions/metrics-snapshot.js:63-80` writes Supabase daily metrics without checking an inbound signature.
  - `Dashboard-v2/functions/deep-learning.js:71-84` reads/writes Supabase daily metrics and later sends intelligence output without checking an inbound signature.
- `Dashboard-v2/production-server.js:118-164` dynamically exposes `/.netlify/functions/:name` for every loaded function when that older server model is active.

Impact:

The scheduled handlers assume the router is the auth boundary. That can be acceptable only if one active production server model is source-tracked and tested. Because this repo has split routing and an older dynamic server model, scheduled side-effectful functions could become public if the wrong server is deployed.

Required remediation direction:

- Add `requireInternal` or HMAC checks inside every scheduled side-effectful function.
- Keep Caddy loopback controls as defense in depth, not the only boundary.
- Retire the dynamic all-functions public router or add explicit deny-by-default metadata.

### R119-F05 - Token Usage GET Is Public By Code While Comment Relies On Dashboard Auth

Severity: Medium-high operational data exposure risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/functions/token-usage.js:4-7` documents `GET` as public behind dashboard auth and `POST` as internal-only.
- `Dashboard-v2/functions/token-usage.js:106-123` enforces `X-Internal-Key` only for `POST`; `GET` returns stats without calling `checkAuth`.
- `Dashboard-v2/functions/token-usage.js:56-103` aggregates recent token usage, costs, models, sources, and calls.
- Route shard `118_c137-function-route-contract-results.md` found the UI references `token-usage` but the split server does not expose it; under the older dynamic server it would be exposed at the public function path.

Impact:

Operational cost and usage telemetry should not depend on "dashboard auth" unless the route layer proves it. In the tracked function itself, GET is unauthenticated.

Required remediation direction:

- Require `checkAuth` for GET.
- Add a stricter role/permission if cost telemetry is finance/ops-only.
- Treat route-level auth assumptions as invalid unless they are generated and tested.

### R119-F06 - Telegram Webhook Spoof Controls Are Conditional Or Query-Param Based

Severity: High webhook authenticity risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/functions/telegram.js:2498-2511` validates Telegram's `X-Telegram-Bot-Api-Secret-Token` only if `TELEGRAM_WEBHOOK_SECRET_TOKEN` is set; otherwise the handler continues.
- `Dashboard-v2/functions/telegram.js:2519-2558` processes dashboard notify and meeting-proposal payloads before the later allowed-user message checks.
- `Dashboard-v2/functions/telegram-team.js:193-205` identifies a team bot from `?token=<key>` and accepts either the member key or the bot token value.
- `Dashboard-v2/functions/shared-team-config.js:7-37` shows member keys such as `fanny`, `silas`, and `marcel`; these are identifiers, not secrets.
- `Dashboard-v2/functions/telegram-team.js:473-486` accepts POSTs and proceeds when a member is identified; no Telegram secret-token header validation was found in the inspected path.

Impact:

If the Telegram webhook secret is unset or the team webhook is reachable with a simple member key, spoofed POSTs can trigger Telegram notifications or team-bot workflows. For the main bot, allowed-user checks are not a substitute for webhook authenticity because POST bodies can be forged.

Required remediation direction:

- Require Telegram secret-token validation for every Telegram webhook; fail closed when missing.
- Never accept human-readable member keys as webhook authentication.
- Use per-bot webhook secret tokens or signed internal ingress.

### R119-F07 - Public/Internal Auth Patterns Are Not Captured In A Machine-Readable Manifest

Severity: Medium-high LLM navigation and auditability risk  
Status: `C137_VERIFIED_STATIC_EXTRACTION`

Evidence:

- Static extraction across 83 function files found multiple auth patterns: shared `checkAuth`, ad hoc Supabase bearer verification, bare internal key checks, HMAC checks, route-only scheduled jobs, provider webhook signatures, and intentionally public config.
- There is no tracked function manifest declaring each endpoint's intended class: public, authenticated, admin, internal, scheduled-only, provider-webhook, or deprecated.
- Route shard `118_c137-function-route-contract-results.md` found endpoint and route drift, so auth class cannot safely be inferred from path alone.

Impact:

An LLM cannot reliably decide whether a handler is safe to expose, test, call, or modify. Humans also cannot quickly distinguish "public by design" from "accidentally public" without manual line-by-line review.

Required remediation direction:

- Add a generated `functions.manifest.json` or equivalent with route, handler file, auth class, required permission, secret type, side effects, and owner.
- Fail CI when handler code and manifest disagree.
- Make docs, Caddy, Express, and UI endpoint references derive from the same manifest.

## Positive Controls Observed

- `auth-check.js` has a real HMAC internal signature path with timestamp skew checks.
- `auth-check.js` fails closed when `AUTH_SECRET` is missing.
- `plane-webhook.js:50-56` rejects missing Plane webhook secrets and verifies HMAC signatures.
- `outlook-webhook.js:190-196` checks `clientState` when configured.
- Many tracker handlers verify Supabase users before using service-role RPCs.
- Caddy and the split server attempt to keep scheduled routes on loopback-only `/_internal/*`.

## Coverage Boundary

This shard does not test live headers, live route exposure, provider webhook configuration, or live Supabase RPC authorization. It proves the tracked auth model is fragmented and not machine-verifiable. Because the route contract is also inconsistent, route placement cannot be treated as a sufficient security boundary.
