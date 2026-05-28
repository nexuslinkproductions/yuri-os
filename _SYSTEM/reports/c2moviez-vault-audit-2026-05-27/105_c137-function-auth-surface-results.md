# C-137 Function Auth Surface Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection. No target scripts executed. No installs. No live services called.

## Scope

This shard maps authentication and authorization controls across `Dashboard-v2/functions/*.js`, with route context from `104_c137-route-navigation-wiring-results.md`.

The key question is not just "does a function check auth?" It is:

```text
ENTRYPOINT -> AUTH_CONTROL -> PRIVILEGED_CREDENTIAL -> SIDE_EFFECT
```

## Inventory Counts

Source-derived counts:

```text
Dashboard-v2/functions/*.js files: 83
handler-looking files: 72
files using shared checkAuth(): 24
files using local verifyBearer(): 17
unique /api/functions callers in UI/scripts: 69
```

Handler files lacking shared `checkAuth`, local `verifyBearer`, or obvious signature markers:

```text
auth.js
config-public.js
deep-learning.js
intel-retrieval-stats.js
metrics-snapshot.js
offer-create.js
predictive-intel.js
telegram-calendar-watch.js
telegram-digest.js
telegram-eod.js
telegram-fact-changes.js
telegram-fk-digest.js
telegram-prebrief.js
telegram-proactive.js
telegram-team-digest.js
telegram-team.js
telegram-weekly.js
tracker-m365-mirror.js
tracker-pull-plane.js
tracker-push-plane.js
whisper-transcribe.js
```

## Auth Dialects Observed

The backend uses multiple auth/control dialects:

- shared `checkAuth()` with HMAC internal signature, legacy bare `X-Internal-Key`, and custom `exeo_token` cookie;
- raw internal-key checks in several files;
- webhook HMAC/client-state checks for Plane, Outlook, offers, and Telegram;
- local Supabase `verifyBearer()` helpers in tracker endpoints;
- scheduled-function assumption through `/_internal/scheduled/*`;
- public-by-design endpoint, such as `config-public.js`.

This fragmentation is itself a navigation and security problem. A reviewer cannot rely on one gate or one policy model.

## Findings

### R105-F01 - SSO Cookie Minting Is Wired To A Verify Path That Ignores GoTrue Bearer Tokens

Severity: High stability/auth-navigation risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/functions/auth.js:53` defines the auth cookie as `exeo_token`.
- `Dashboard-v2/functions/auth.js:264-272` handles `action === 'verify'` by reading only `readCookie(event.headers)`.
- `Dashboard-v2/functions/auth.js:188-190` implements `readCookie()` for `exeo_token`; it does not read `Authorization`.
- `Dashboard-v2/src/routes/auth/callback/+page.svelte:85-98` says it mints an `exeo_token` cookie by POSTing `action: "verify"` with a Supabase GoTrue Bearer token.
- `Dashboard-v2/src/routes/+layout.svelte:93-103` repeats the same expectation during session refresh.
- `Dashboard-v2/functions/auth-check.js:121-128` accepts a Bearer token, but verifies it as the custom HS256 token signed with `AUTH_SECRET`, not as a Supabase GoTrue JWT.
- `Dashboard-v2/src/lib/db.ts:718-742` states that helpers send the cookie and optionally attach GoTrue Bearer.

Impact:

The comments and frontend expect Supabase SSO to mint or refresh the custom `exeo_token` cookie, but the backend verify action ignores the Bearer token. For SSO users, this can lead to UI-local "authed" state while backend calls fail or silently fall back. This matches the broader pattern of the repo saying a control exists while the actual wire path disagrees.

Required remediation direction:

- Either make `auth.js?action=verify` validate Supabase GoTrue Bearer and mint `exeo_token`, or remove the frontend claim and use one auth model.
- Add tests for password login, SSO callback, cookie verify, logout, and protected function access.
- Stop mixing `AUTH_SECRET` custom JWT verification with Supabase access-token semantics without explicit branching.

### R105-F02 - Side-Effect Scheduled Functions Have No In-Handler Auth Guard

Severity: Critical if exposed through dynamic `/.netlify/functions/:name`; Medium if only reachable through loopback `/_internal/scheduled/*`  
Status: `C137_VERIFIED`, `DEPLOYMENT_DEPENDENT`

Evidence:

- `Dashboard-v2/server/ecosystem.config.js:53-160` runs scheduled jobs through `/_internal/scheduled/*`.
- `Dashboard-v2/server/index.js:84-93` exposes only a subset of scheduled internal routes, but omits `decision-outcome`.
- `Dashboard-v2/production-server.js:118-123` exposes any loaded function at `/.netlify/functions/:name`.
- Side-effect scheduled handlers without in-handler auth include:
  - `Dashboard-v2/functions/deep-learning.js:280-393`
  - `Dashboard-v2/functions/metrics-snapshot.js:134-244`
  - `Dashboard-v2/functions/predictive-intel.js:355-390`
  - `Dashboard-v2/functions/telegram-calendar-watch.js:77-120`
  - `Dashboard-v2/functions/telegram-fact-changes.js:44-110`
  - `Dashboard-v2/functions/tracker-pull-plane.js:98-180`
  - `Dashboard-v2/functions/tracker-push-plane.js:86-143`
  - `Dashboard-v2/functions/tracker-m365-mirror.js:109-148`

Impact:

These functions assume scheduler privacy. If the dynamic production server model is active, or if any equivalent public route exists, external callers could trigger costly and state-changing jobs: Plane reads/writes, Supabase writes, M365 calendar event creation, Telegram sends, metrics updates, and fact review prompts.

Required remediation direction:

- Every scheduled function should enforce internal HMAC itself, even when also protected by loopback routing.
- Add `context.schedule` or explicit signed internal request verification.
- Make dynamic public loading exclude scheduled-only handlers by default.

### R105-F03 - `offer-create` Is A High-Impact Unauthenticated Business Side-Effect Endpoint

Severity: Critical if publicly routed; otherwise High route-governance risk  
Status: `C137_VERIFIED`, `DEPLOYMENT_DEPENDENT`

Evidence:

- `Dashboard-v2/functions/offer-create.js:161-168` accepts POST payloads with only shape validation.
- `Dashboard-v2/functions/offer-create.js:177-209` registers/loads Supabase offer rows.
- `Dashboard-v2/functions/offer-create.js:211-245` pushes to Bexio and may create/find contacts.
- `Dashboard-v2/functions/offer-create.js:247-266` writes an `offer.created` audit-log row.
- `Dashboard-v2/functions/offer-create.js:268-286` sends a Telegram nudge to the CEO.
- No `checkAuth`, HMAC signature, bearer verification, or internal key check was observed in the handler.

Impact:

If reachable externally, this endpoint lets arbitrary callers create business artifacts in Supabase/Bexio and notify Telegram. It is not just a form submit; it touches accounting/customer systems and the local command-bus audit path.

Required remediation direction:

- Add shared auth or a signed one-time form token.
- Rate-limit and idempotency-key the endpoint.
- Separate public prospect intake from Bexio push and Telegram notification.

### R105-F04 - `whisper-transcribe` Is An Unauthenticated OpenAI Spend Endpoint

Severity: High if publicly routed  
Status: `C137_VERIFIED`, `DEPLOYMENT_DEPENDENT`

Evidence:

- `Dashboard-v2/functions/whisper-transcribe.js:14-20` accepts POST if `OPENAI_API_KEY` exists, with no auth check.
- `Dashboard-v2/functions/whisper-transcribe.js:22-35` parses multipart audio.
- `Dashboard-v2/functions/whisper-transcribe.js:47-96` sends the audio buffer to OpenAI Whisper using the server-side API key.
- `Dashboard-v2/src/routes/meetings/studio/+page.svelte:17` uses `/api/functions/whisper-transcribe` as fallback.

Impact:

If routed publicly, arbitrary callers can spend API credits and push large audio payloads through the service. This is an availability/cost risk more than a data-exfiltration finding.

Required remediation direction:

- Require `checkAuth`.
- Enforce max body size, audio duration, content type, and per-user rate limits.
- Prefer presigned/upload-mediated flow if large files are expected.

### R105-F05 - Telegram Team Bot Webhook Can Be Spoofed By Query Bot Identifier

Severity: High if publicly routed  
Status: `C137_VERIFIED`, `DEPLOYMENT_DEPENDENT`

Evidence:

- `Dashboard-v2/functions/telegram-team.js:193-205` identifies the bot from a `token` or `bot` query parameter, and accepts either the member key or the real bot token.
- `Dashboard-v2/functions/telegram-team.js:472-535` accepts POSTs, parses arbitrary update JSON, and dispatches commands.
- `Dashboard-v2/functions/telegram-team.js:348-403` contains command handlers that mark Plane tickets done and add notes.
- No Telegram `X-Telegram-Bot-Api-Secret-Token` verification or sender allowlist check was observed in the shown handler.

Impact:

If this endpoint is reachable and the member key is guessable, a fake Telegram update can drive team-bot actions as that member. The comment says the webhook URL contains the bot token, but the implementation also accepts the member key.

Required remediation direction:

- Require Telegram secret-token header.
- Do not accept member key as authentication.
- Validate `message.from.id` and `message.chat.id` against the configured member.
- Treat callback/user data as untrusted even after webhook validation.

### R105-F06 - Main Telegram Webhook Secret Is Conditional, And `notify` Broadcast Happens Before User Checks

Severity: High if `TELEGRAM_WEBHOOK_SECRET_TOKEN` is unset  
Status: `C137_VERIFIED`, `DEPLOYMENT_DEPENDENT`

Evidence:

- `Dashboard-v2/functions/telegram.js:2498-2511` only verifies `X-Telegram-Bot-Api-Secret-Token` when `TELEGRAM_WEBHOOK_SECRET_TOKEN` is set.
- `Dashboard-v2/functions/telegram.js:2519-2527` processes `update.notify` by broadcasting to all allowed users.
- The allowed-user checks for normal messages/callbacks occur later at `Dashboard-v2/functions/telegram.js:2570-2616`.

Impact:

If the Telegram secret token is not configured, a fake POST with `notify` can broadcast arbitrary Telegram messages to configured recipients. The user/message allowlist does not protect this branch because it is not an incoming user message branch.

Required remediation direction:

- Make webhook secret mandatory in production.
- Separate dashboard internal notification endpoint from Telegram webhook endpoint.
- Require internal HMAC for `notify` payloads.

### R105-F07 - Outlook Subscription Manager Has No In-Handler Auth Guard

Severity: High if publicly routed  
Status: `C137_VERIFIED`, `DEPLOYMENT_DEPENDENT`

Evidence:

- `Dashboard-v2/functions/outlook-subscribe.js:33-54` obtains an app-only Microsoft Graph token.
- `Dashboard-v2/functions/outlook-subscribe.js:89-140` lists, renews, deletes, and creates subscriptions.
- `Dashboard-v2/functions/outlook-subscribe.js:143-152` runs this work for any invocation.
- No method gate, `checkAuth`, internal HMAC, or bearer verification was observed in the handler.

Impact:

If public, this can be used to repeatedly churn Microsoft Graph subscriptions. Even if no data is returned beyond summary, it is an operational side-effect against Outlook integration.

Required remediation direction:

- Require internal HMAC for manual/scheduled invocation.
- Limit to POST and reject public requests.
- Add idempotency and audit actor identity.

### R105-F08 - Outlook Webhook Verification Fails Open If `OUTLOOK_WEBHOOK_SECRET` Is Missing

Severity: Medium-High  
Status: `C137_VERIFIED`, `DEPLOYMENT_DEPENDENT`

Evidence:

- `Dashboard-v2/functions/outlook-webhook.js:21` sets `CLIENT_STATE = process.env.OUTLOOK_WEBHOOK_SECRET || ''`.
- `Dashboard-v2/functions/outlook-webhook.js:190-196` checks `n.clientState` only if `CLIENT_STATE` is truthy.
- `Dashboard-v2/functions/outlook-webhook.js:216-245` can fetch event data with app credentials and dispatch meeting events.

Impact:

The tracked code allows production to run without the webhook anti-spoofing secret. If the secret is missing, fake notifications may be processed far enough to trigger Graph fetches and downstream meeting dispatch.

Required remediation direction:

- Fail closed when `OUTLOOK_WEBHOOK_SECRET` is missing.
- Keep validation-token handshake public but require `clientState` for notifications.

### R105-F09 - Legacy Bare Internal Key Remains A Broad Cross-Service Auth Bypass

Severity: High  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/functions/auth-check.js:19-26` documents HMAC but keeps bare `X-Internal-Key` backward compatibility.
- `Dashboard-v2/functions/auth-check.js:113-119` accepts matching legacy key.
- Raw/internal-key call sites or checks exist in `analyze-meeting.js`, `client-update.js`, `decision-outcome.js`, `document-generate.js`, `fanny-ai.js`, `health.js`, `marketing-studio.js`, `mcp-server.js`, `nexbox-fleet.js`, `outlook-webhook.js`, `plane-webhook.js`, `push-meeting-to-obsidian.js`, `shared.js`, `telegram.js`, and `token-usage.js`.
- Prior accepted shard `102_c137-ai-mcp-direct-results.md` also found raw internal-key AI proxy paths.

Impact:

A single static internal key remains a root credential across multiple functions. HMAC is present, but migration is incomplete.

Required remediation direction:

- Remove bare `X-Internal-Key` acceptance.
- Use timestamped HMAC everywhere.
- Rotate the internal service key after migration.
- Split internal keys by service class where practical.

## Positive Controls

- `Dashboard-v2/functions/auth-check.js:103-135` blocks protected endpoints if `AUTH_SECRET` is missing and supports revocation checks.
- `Dashboard-v2/functions/auth-check.js:75-87` implements timestamped HMAC internal signatures.
- `Dashboard-v2/functions/plane-webhook.js:50-56` fails closed when `PLANE_WEBHOOK_SECRET` is missing.
- Tracker user endpoints such as `tracker-start.js:56-64` and `tracker-admin-set-rate.js:41-55` verify Supabase Bearer tokens, then delegate permissions to RPCs.
- `Dashboard-v2/functions/config-public.js:1-8` clearly documents its public intent and returns only public Supabase config.

## Required Next Validation Gates

1. Decide which production server is authoritative: `server/index.js`, `production-server.js`, or untracked remote state.
2. For every side-effect function, mark one of: public, protected-user, protected-internal, webhook, scheduled-only, retired.
3. Add in-handler auth to scheduled functions even if loopback routing exists.
4. Create a route/auth manifest and fail CI when a new handler lacks a declared auth class.
5. Re-test SSO login and cookie minting with a local mocked event test, not live services.

## Acceptance

Accepted as C-137 direct evidence for dashboard function auth surface. The largest architectural conclusion is that route ambiguity and auth fragmentation amplify each other: a handler may be "safe" only under one route model, while another tracked route model would expose it as a public side-effect function.
