# C-137 Auth, Session, Realtime, And Client-Trust Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection. No target source files mutated. No target scripts executed. No live services called. No credential values used or validated. Secret evidence is redacted.

## Scope

This shard inspects the browser-facing trust chain:

```text
SvelteKit shell / Supabase OAuth session / custom exeo_token cookie / auth-check helper
  -> direct browser Supabase reads and writes
  -> client-side role defaults and admin gates
  -> Soketi/Pusher realtime bridge
  -> realtime channel privacy and credential hygiene
  -> LLM navigationability for "who can see or mutate what?"
```

The conclusion is severe: the repo places a lot of authority at browser and realtime boundaries while the tracked source does not prove that the final Supabase RLS, RPC, and Soketi channel controls are sufficient. Worse, the realtime bridge contains a tracked hardcoded Soketi secret. The app can still be viable, but only if the live database and realtime server are far more locked down than the GitHub truth currently proves.

## Findings

### R113-F01 - A Soketi Signing Secret Is Hardcoded In Tracked Source

Severity: Critical credential exposure  
Status: `C137_VERIFIED_REDACTED`

Evidence:

- `Scripts/soketi-bridge.js:35-40` hardcodes the Soketi host, app id, key, and signing secret. The secret value was observed but is intentionally not copied into this report.
- `Scripts/soketi-bridge.js:70-87` uses that secret to generate the Pusher-compatible HTTP API signature for event publishing.
- `Scripts/soketi-bridge.js:89-107` posts signed events to the local Soketi HTTP API.
- `Dashboard-v2/src/lib/pusher-realtime.ts:35` hardcodes the matching public Soketi key in frontend source.

Impact:

If this repository has ever been shared outside the trusted operator boundary, the Soketi signing secret must be considered compromised. If the Soketi HTTP API is reachable beyond loopback or if production config mirrors this value, an attacker with source access can forge realtime events. Even if the HTTP API is currently loopback-only, the secret-in-Git pattern is a high-risk operational smell because future hosting, backups, screenshots, or AI context packets can leak it again.

Required remediation direction:

- Rotate the Soketi secret immediately.
- Move the secret to a server-only secret store or environment variable.
- Purge or invalidate the old secret from any deployment that may still use it.
- Add a secret scanner gate for all tracked source and all generated audit/context packets.

### R113-F02 - Sensitive Operational Realtime Streams Use Public Channel Names With No Tracked Private-Channel Auth

Severity: Critical confidentiality and integrity risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/soketi-bridge.js:43-55` maps database notifications to channels including `nex.audit-log`, `nex.reasoning-edges`, `nex.reasoning-thoughts`, `nex.scheduled-blocks`, `nex.customer-master`, `nex.time-entries`, `nex.team-capacity`, `nex.absences`, `nex.user-profiles`, and `nex.nexogram.{channel_id}`.
- `Scripts/soketi-bridge.js:134-149` republishes every mapped Postgres notification payload to the mapped Soketi channel.
- `Dashboard-v2/src/lib/pusher-realtime.ts:107-124` creates a Pusher client without a tracked channel auth endpoint.
- `Dashboard-v2/src/lib/pusher-realtime.ts:151-357` subscribes to those channels using public names such as `nex.audit-log`, `nex.customer-master`, `nex.time-entries`, `nex.team-capacity`, `nex.absences`, `nex.user-profiles`, and `nex.nexogram.{channelId}`.
- A source search found no relevant `private-`, `presence-`, `authEndpoint`, `channelAuthorization`, or equivalent Pusher private-channel auth wiring in this realtime wrapper.

Impact:

The channel names reveal the data model and the subscribed streams include staff profile metadata, absences, capacity, customer state, schedule blocks, audit rows, reasoning traces, time entries, and NEXOGRAM messages. If Soketi accepts public subscriptions for these channels, any browser with the app key and channel names can subscribe to sensitive operational events. This bypasses any table-level RLS that protects initial Supabase reads because the bridge republishes notification payloads through a separate realtime path.

Required remediation direction:

- Move sensitive streams to `private-` or `presence-` channels.
- Add a server-side channel authorization endpoint that verifies the user's role and channel-specific permission.
- Minimize realtime payloads; publish ids and event types where possible, then fetch details through RLS-guarded paths.
- Treat realtime channel auth as a separate control from Supabase RLS.

### R113-F03 - Supabase SSO And Custom Cookie Auth Are Wired As If Bearer Verify Mints A Cookie, But The Backend Does Not Do That

Severity: High authentication stability and false-assurance risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/routes/auth/callback/+page.svelte:82-98` sets the UI auth hint and calls `/api/functions/auth` with `action: "verify"` plus a Supabase GoTrue Bearer token, with comments saying this should mint `exeo_token` so SSO users stay authenticated after the one-hour Bearer TTL.
- `Dashboard-v2/src/routes/+layout.svelte:91-103` repeats the same "mint/refresh cookie" call after discovering a Supabase session.
- `Dashboard-v2/src/routes/+layout.svelte:116-141` scans `localStorage` for a Supabase auth token and forwards it as `Authorization: Bearer ...` to `/api/functions/auth`.
- `Dashboard-v2/functions/auth.js:264-272` handles `action: "verify"` by reading only the existing `exeo_token` cookie through `readCookie(event.headers)`. It does not inspect the Authorization header and does not mint a new cookie.
- `Dashboard-v2/functions/auth-check.js:121-135` accepts cookie or Bearer tokens, but verifies them as custom `AUTH_SECRET` tokens, not Supabase GoTrue JWTs.

Impact:

The comments describe a fix for SSO sessions expiring after one hour, but the source does not implement that fix. SSO users can appear authenticated through Supabase local session and UI hints while custom-cookie protected functions still fail or start failing after TTL drift. This is both a user-facing stability bug and an LLM navigationability trap: a future agent reading the frontend comments would believe the cookie bridge works when the backend evidence says it does not.

Required remediation direction:

- Choose one auth model: Supabase JWT all the way through, or custom `exeo_token` with an explicit secure exchange endpoint.
- If keeping the custom cookie, add a dedicated `exchange_supabase_session` action that validates the Supabase JWT server-side before setting `exeo_token`.
- Remove or rewrite comments that claim Bearer `verify` mints the cookie until the backend implements it.

### R113-F04 - App-Wide Route Protection Is Client-Side, So Real Security Depends Entirely On RLS, Function Guards, And Realtime Auth

Severity: High authorization architecture risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/routes/+layout.ts:1-4` disables SSR for the app.
- `Dashboard-v2/src/routes/+layout.svelte:35-45` runs the route auth check in `onMount`, after browser execution begins.
- `Dashboard-v2/src/routes/+layout.svelte:160-162` uses `sessionStorage` or `localStorage` `exeo-authed` as a cached UI hint while verification runs in the background.
- `Dashboard-v2/edge-functions/marketing-studio-guard.mjs:5-12` protects `marketing-studio.html` by checking only whether the Cookie header contains `exeo_token=` or a specific Supabase auth-token cookie name; it does not validate token structure, expiry, or claims.

Impact:

Client-side redirects are useful UX but they are not an authorization boundary. The static shell, route modules, channel names, public config, and browser Supabase calls are exposed before or independent of server-side auth. The marketing edge guard is especially brittle if deployed as-is because a forged cookie name could satisfy the source-level check. The system must assume that any route gate in Svelte is advisory unless the data/function/realtime layer independently enforces the same policy.

Required remediation direction:

- Document route gates as UX only.
- Move sensitive authorization to backend functions, RLS policies, private realtime channel authorization, and server-validated edge functions.
- Replace cookie-name checks with token verification.

### R113-F05 - Sensitive Admin And Team Data Is Read Directly From The Browser

Severity: High deployment-dependent confidentiality risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/routes/admin/members/+page.svelte:109-115` performs an admin client-side redirect before loading data.
- `Dashboard-v2/src/routes/admin/members/+page.svelte:149-160` then reads `user_profiles`, `team_capacity`, `working_hours`, `billing_rates`, and `absences` directly from the browser.
- `Dashboard-v2/src/routes/admin/permissions/+page.svelte:34-40` performs a client-side permission check, then `Dashboard-v2/src/routes/admin/permissions/+page.svelte:47-53` reads `user_profiles` and `user_module_permissions` directly from the browser.
- `Dashboard-v2/src/routes/admin/tracker/+page.svelte:87-93` performs a client-side tracker admin check, then `Dashboard-v2/src/routes/admin/tracker/+page.svelte:121-130` reads profiles, capacities, working hours, absences, billing rates, and holidays directly from the browser.
- `Dashboard-v2/src/lib/components/tracker/TeamTimeView.svelte:60-82` loads active user profiles, team capacity, and weekly time entries directly from the browser after relying on the host page to mount it only for `tracker.view_team`.

Impact:

This architecture can be safe only if RLS and RPC policies are complete, source-tracked, and regression-tested. The GitHub clone does not yet prove that. Because the app is browser-first, any RLS drift can expose HR, billing, time-tracking, Telegram profile metadata, and permission matrix data. This is not just a security concern; it also harms LLM navigationability because the repository lacks a clear, testable map from UI permission checks to final database enforcement.

Required remediation direction:

- Generate a table/RPC access manifest from browser `supabase().from(...)` and `supabase().rpc(...)` calls.
- Pair every browser call with a tracked migration/policy test.
- Move especially sensitive admin reads behind auth-checked server functions if RLS cannot be made simple and auditable.

### R113-F06 - Runtime Permissions Are Mostly Client-Resolved From Permissive Defaults

Severity: Medium-high authorization drift risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/lib/stores/user.svelte.ts:26-32` describes role defaults as permissive and later restrictable by CEO.
- `Dashboard-v2/src/lib/stores/user.svelte.ts:33-50` grants `marketing_manager` broad CRM, client, marketing studio, meeting, health, intel, and tracker defaults, including team view and time editing flows.
- `Dashboard-v2/src/lib/stores/user.svelte.ts:221-240` resolves `user.can(...)` fully in the browser using role defaults plus loaded overrides.
- `Dashboard-v2/src/routes/admin/permissions/+page.svelte:81-127` changes permission state through browser RPC calls, so RPC policy correctness is decisive.

Impact:

The UI has a coherent local permission model, which is good for consistency, but it is not itself a security boundary. The permissive defaults mean a stale or missing override can grant capabilities in the UI. If the matching RLS/RPC guards are absent or drift, the browser model becomes de facto authorization.

Required remediation direction:

- Keep `ROLE_DEFAULTS` as UI display logic only.
- Add server/RLS tests proving each sensitive action denies unauthorized roles even when the browser calls the endpoint directly.
- Export permission policy from one source of truth instead of relying on comments and duplicated migration assumptions.

### R113-F07 - Auth Revocation And Rate-Limit Controls Have Fail-Open Or Memory-Fallback Modes

Severity: Medium security-control reliability risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/functions/auth.js:115-128` accepts a structurally valid token when the Supabase client or revocation table is unavailable.
- `Dashboard-v2/functions/auth.js:151-163` falls back to in-memory rate limiting when the Supabase RPC path cannot be used.
- `Dashboard-v2/functions/auth-check.js:57-67` treats revocation lookup errors as not revoked.
- `Dashboard-v2/functions/auth-check.js:113-119` still accepts the legacy bare `X-Internal-Key` path when `INTERNAL_SERVICE_KEY` is configured.

Impact:

These fallbacks may have been pragmatic during migration, but they reduce confidence in the controls under partial outage or schema drift. In serverless and multi-process deployments, memory rate limits can reset or shard by instance, and fail-open revocation means a missing table silently weakens session invalidation.

Required remediation direction:

- Decide which failures should fail closed for production.
- Remove the legacy bare-key path after HMAC migration.
- Add startup/preflight checks for revocation and rate-limit schema.

### R113-F08 - Credential Hygiene Is Weakened By Startup Token Prefix Logging

Severity: Low-medium secret hygiene risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/team-bots/fanny-bot.js:1322` logs the first eight characters of the Telegram bot token at startup.

Impact:

This is not equivalent to leaking the full token, but token prefixes are still useful correlation material in logs, screenshots, and support transcripts. In a system where logs and AI context packets are heavily used, avoid printing any credential substring.

Required remediation direction:

- Replace token-prefix logs with provider/account labels or a hash fingerprint generated specifically for non-secret correlation.

## Positive Controls Observed

- `Dashboard-v2/functions/auth.js:223-227` fails closed when `AUTH_SECRET` is missing.
- `Dashboard-v2/functions/auth.js:260-261` does not return the custom cookie token in the JSON body.
- `Dashboard-v2/functions/auth.js:181-190` sets the custom cookie as `HttpOnly`, `Secure`, and `SameSite=Strict`.
- `Dashboard-v2/functions/auth-check.js:110-112` includes a stronger HMAC internal request path.
- `Dashboard-v2/src/lib/pusher-realtime.ts:43-105` includes reconnect throttling, which reduces realtime reconnect storms.

## Coverage Boundary

This pass proves source-level issues and source-level missing controls. It does not prove the live Supabase policies, live Soketi config, Netlify/edge deployment config, or runtime cookie behavior. Those remain `BLOCKED_LIVE_STATE` unless Claudio exports the effective deployed configuration or authorizes a separate live validation plan.
