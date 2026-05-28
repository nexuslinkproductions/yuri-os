# Fanout Run 018 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no target execution, no live service calls, no credential use
Worker mode: single persistent Claude/tmux lane, active cap `1`

## Acceptance Summary

Run 018 is accepted with C-137 corrections.

- `R018_WEBHOOK_OUTLOOK_SCHEDULING_OPUS / WEBHOOK-OUTLOOK-SCHEDULING-018`: worker closed with `files_covered=10 findings=21 suppressions=6 deferred=3 invalidated=0`.
- C-137 accepted the 10 assigned target files as covered after verifying worker claims against exact local code evidence.

Accepted assigned target surfaces added by Run 018: `10`.

Accepted assigned target coverage total after Run 018: `278 / 1505` tracked files.

Strict semantic caveat carried forward: two lockfiles are currently `partial`: `Scripts/telegram-mcp/package-lock.json` from Run 008 and `Scripts/team-bots/package-lock.json` from Run 010. Full semantic coverage is `276 covered + 2 partial`.

Contamination check: passed. C-137 checked the Run 018 pipe log for protected Claude runtime reads, `Searched memories`, and invalidation markers. No protected-runtime read was accepted.

Clone proof: C-137 verified the target clone at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, clean status count `0`, and `1505` tracked files.

Source pipe log:

- `/tmp/yuri-c2v-fanout-run-018/pipe/r018-single.pipe.log`

## C-137 Corrections

Lane output remains advisory until verified. C-137 corrected these points before acceptance:

- Outlook `clientState` protection is configuration-dependent. `outlook-webhook.js:191-196` only rejects mismatches when `CLIENT_STATE` is non-empty, while `outlook-subscribe.js:27` defaults `CLIENT_STATE` to an empty string and creates subscriptions with `clientState: CLIENT_STATE` at `outlook-subscribe.js:129-135`. If `OUTLOOK_WEBHOOK_SECRET` is missing, real Graph notifications are not origin-authenticated by clientState.
- `tracker-m365-mirror.js` and `tracker-pull-plane.js` are not mapped by tracked `Dashboard-v2/server/index.js`, so their unauthenticated HTTP reachability is deployment-dependent. They would be exposed under Netlify or the generic loader in `Dashboard-v2/production-server.js:118-164`, but not through the tracked `server/index.js` route table.
- `outlook-subscribe.js` is mapped by tracked `Dashboard-v2/server/index.js:43`, has no auth gate and no method restriction, and can create/renew/delete Microsoft Graph subscriptions. This is a stronger finding than the scheduled-only comment suggests.
- `event-dispatch.js` was already covered in Run 015. It remains relevant as the downstream side-effect sink, but it is not an uncovered Run 018 deferred file.
- Run 017 already covered part of the database-policy context for `audit_log` and `scheduled_blocks`. `time_entries` and `tracker_set_working_hours` remain deferred to a tracker/DB/RPC shard.
- `plane-webhook.js` uses HMAC, but `verifySignature()` calls `crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))` without a length check. A malformed-length signature can throw before the intended 401 branch, producing an availability/500 behavior instead of clean rejection.

## Executive Findings

Run 018 confirms a recurring wiring pattern: strong controls exist in some places, but side-effect routes are not consistently behind the same trust boundary.

The strongest issue is `outlook-subscribe.js`: it performs Microsoft Graph subscription lifecycle operations with app-only credentials and is mapped as a public function in the tracked local server. It has no auth gate and no method gate, so any request to the function can trigger subscription reconciliation, including deletes for subscriptions pointing to a different notification URL.

The second major issue is webhook-to-dispatch internal auth drift. `auth-check.js` defines the new HMAC internal request format, but both Plane and Outlook webhooks still forward to `event-dispatch` with the legacy bare `X-Internal-Key`. This currently works only because the deprecated compatibility branch remains enabled; once removed, webhook dispatch breaks. While it remains enabled, a leaked internal key is enough to authenticate internal side-effect calls without timestamp/replay binding.

The third major issue is origin-auth configuration fork for Outlook. The code comments describe `OUTLOOK_WEBHOOK_SECRET` as the shared `clientState`, but the implementation fails open when the env var is absent. That is a real "looks secure but may not be secure" trap.

## Webhook / Outlook / Scheduling Lane

Lane: `R018_WEBHOOK_OUTLOOK_SCHEDULING_OPUS`
Batch: `WEBHOOK-OUTLOOK-SCHEDULING-018`

Files covered:

- `Dashboard-v2/functions/plane-webhook.js`
- `Dashboard-v2/functions/outlook-webhook.js`
- `Dashboard-v2/functions/outlook-subscribe.js`
- `Dashboard-v2/functions/outlook-sync.js`
- `Dashboard-v2/functions/calendar-schedule-event.js`
- `Dashboard-v2/functions/schedule-list.js`
- `Dashboard-v2/functions/schedule-plan-ticket.js`
- `Dashboard-v2/functions/tracker-m365-mirror.js`
- `Dashboard-v2/functions/tracker-admin-set-working-hours.js`
- `Dashboard-v2/functions/tracker-pull-plane.js`

Supporting dependency evidence read, not counted as covered:

- `Dashboard-v2/functions/auth-check.js`
- `Dashboard-v2/server/index.js`
- `Dashboard-v2/production-server.js`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `R018-F01` | medium/high | `Dashboard-v2/functions/plane-webhook.js:59-73`, `Dashboard-v2/functions/auth-check.js:19-26`, `Dashboard-v2/functions/auth-check.js:110-119` | auth/wiring | Plane webhook dispatches to `event-dispatch` using deprecated bare `X-Internal-Key`, even though `auth-check.js` documents and supports HMAC timestamp signatures. This is a replay-resistant-auth migration gap and future break risk. |
| `R018-F02` | medium/high | `Dashboard-v2/functions/outlook-webhook.js:94-107`, `Dashboard-v2/functions/auth-check.js:19-26`, `Dashboard-v2/functions/auth-check.js:110-119` | auth/wiring | Outlook webhook dispatch uses the same deprecated bare internal key path rather than HMAC internal signatures. |
| `R018-F03` | medium | `Dashboard-v2/functions/plane-webhook.js:209-235` | idempotency | Plane webhook forwards accepted issue events to side-effect dispatch without event-delivery deduplication. Retries can duplicate downstream notifications or audit effects. |
| `R018-F04` | medium | `Dashboard-v2/functions/outlook-webhook.js:190-240` | idempotency | Outlook webhook processes each Graph notification and dispatches meeting events without subscription delivery deduplication. Graph retry or batch replay can duplicate downstream work. |
| `R018-F05` | high | `Dashboard-v2/functions/outlook-subscribe.js:89-140`, `Dashboard-v2/functions/outlook-subscribe.js:143-152`, `Dashboard-v2/server/index.js:43` | auth/provider-side-effect | Publicly mapped subscription manager has no auth gate and no method restriction. A request can trigger app-only Microsoft Graph list, create, renew, and delete subscription operations. |
| `R018-F06` | high | `Dashboard-v2/functions/outlook-webhook.js:21`, `Dashboard-v2/functions/outlook-webhook.js:191-196`, `Dashboard-v2/functions/outlook-subscribe.js:27`, `Dashboard-v2/functions/outlook-subscribe.js:129-135` | auth/configuration | Outlook notification origin auth silently becomes optional when `OUTLOOK_WEBHOOK_SECRET` is unset. Subscriptions can be created with empty `clientState`, and the webhook only checks clientState when configured. |
| `R018-F07` | medium | `Dashboard-v2/functions/plane-webhook.js:51-56`, `Dashboard-v2/functions/plane-webhook.js:142-147` | availability | `timingSafeEqual` is called without comparing buffer lengths. Malformed-length signatures can throw before the intended 401 rejection path. |
| `R018-F08` | medium/deployment-dependent | `Dashboard-v2/functions/tracker-m365-mirror.js:98-148`, `Dashboard-v2/functions/tracker-m365-mirror.js:150-152`, `Dashboard-v2/production-server.js:118-164` | auth/provider-side-effect | `tracker-m365-mirror.js` has no handler auth and uses service-role Supabase plus app-only Graph writes. Tracked `server/index.js` does not map it, but Netlify/generic function hosting would expose it unless scheduled endpoints are isolated. |
| `R018-F09` | medium/deployment-dependent | `Dashboard-v2/functions/tracker-pull-plane.js:98-194`, `Dashboard-v2/functions/tracker-pull-plane.js:196-199`, `Dashboard-v2/production-server.js:118-164` | auth/data-integrity | `tracker-pull-plane.js` has no handler auth and uses service-role Supabase plus Plane API reads and time-entry inserts. Public reachability is deployment-dependent, but the side effects are high-value if exposed. |
| `R018-F10` | medium/deferred | `Dashboard-v2/functions/tracker-admin-set-working-hours.js:41-55`, `Dashboard-v2/functions/tracker-admin-set-working-hours.js:63-79` | authz/RPC | Handler verifies only that the caller has a valid Supabase bearer token, then calls service-role RPC `tracker_set_working_hours` with `p_actor`. Admin/role enforcement must be proven inside the RPC definition. |
| `R018-F11` | medium | `Dashboard-v2/functions/outlook-sync.js:259-282` | provider-side-effect | Authenticated callers can send arbitrary HTML email content, recipients, cc list, and attachments via the app-only mailbox selected by the function's allowlist. This may be intended for team tooling, but it is a high-trust mail-sending surface and needs explicit role/intent controls. |
| `R018-F12` | low | `Dashboard-v2/functions/outlook-sync.js:230-239` | input-validation | `delete` action sanitizes single quotes in `matchSubject` but uses raw `matchDate` in the OData filter, unlike the `sync` path's date sanitization at `outlook-sync.js:135-137`. |
| `R018-F13` | low | `Dashboard-v2/functions/calendar-schedule-event.js:64-79` | data-hygiene | `safeSubject` and `safeSource` are computed, but the `audit_log` row writes raw `entity_name: subject` and raw `actor: source`. The route is authenticated, so this is hygiene/audit-log integrity rather than a boundary break. |
| `R018-F14` | info/positive | `Dashboard-v2/functions/plane-webhook.js:23`, `Dashboard-v2/functions/plane-webhook.js:51-56`, `Dashboard-v2/functions/plane-webhook.js:128-148` | positive | Plane webhook rejects missing secret/signature and requires HMAC-SHA256 before business dispatch. Add a length check, but preserve the HMAC design. |
| `R018-F15` | info/positive | `Dashboard-v2/functions/outlook-webhook.js:147-165` | positive | Microsoft Graph `validationToken` handshake returns plain text after a whitelist and length cap, with no notification side effect. |
| `R018-F16` | info/positive | `Dashboard-v2/functions/plane-webhook.js:25-47`, `Dashboard-v2/functions/outlook-webhook.js:23-46` | positive | Both webhooks have IP-based rate limiting through Supabase RPC with fail-open behavior. |
| `R018-F17` | info/positive | `Dashboard-v2/functions/schedule-list.js:113-123`, `Dashboard-v2/functions/schedule-plan-ticket.js:102-118`, `Dashboard-v2/functions/calendar-schedule-event.js:43-63` | positive | Scheduling read/write routes are method-gated, `checkAuth`-gated, and validate major structured inputs. |
| `R018-F18` | info/positive | `Dashboard-v2/functions/schedule-plan-ticket.js:116-148` | positive | Schedule block mutation uses UUID validation, date regex, numeric clamping, and finite-number checks before Supabase writes. |
| `R018-F19` | info/positive | `Dashboard-v2/functions/tracker-pull-plane.js:74-83`, `Dashboard-v2/functions/tracker-pull-plane.js:140-181` | positive | Plane worklog pull deduplicates by `plane_worklog_id` and adds IDs to the known set after insert. |
| `R018-F20` | info/positive | `Dashboard-v2/functions/tracker-m365-mirror.js:28-29`, `Dashboard-v2/functions/tracker-m365-mirror.js:88-93`, `Dashboard-v2/functions/tracker-m365-mirror.js:141-142` | positive | M365 mirror has a per-run cap, a five-minute debounce, and small Graph-call jitter. |
| `R018-F21` | info/positive | `Dashboard-v2/functions/outlook-sync.js:91-100` | positive | `outlook-sync.js` restricts target mailboxes to configured team emails before using app-only Graph credentials. |

Suppressed or narrowed:

- Public Plane webhook exposure is not inherently vulnerable because HMAC validation is present. The accepted gap is the missing length check and absence of dedup, not lack of origin proof.
- Outlook `validationToken` reflection is not an XSS issue because it is whitelisted, length-limited, and returned as `text/plain`.
- `schedule-list.js`, `calendar-schedule-event.js`, and `schedule-plan-ticket.js` are not unauthenticated browser mutation paths; they use `checkAuth`.
- `tracker-m365-mirror.js` and `tracker-pull-plane.js` are not confirmed public through `Dashboard-v2/server/index.js`; their exposure depends on Netlify/generic function hosting.
- Service-role use inside scheduled server jobs is not automatically a vulnerability. The issue is whether the scheduled functions are reachable without a protected scheduler/internal-auth boundary.
- The CEO fallback in `tracker-pull-plane.js` is a data-quality tradeoff, not a standalone security issue, because entries include audit notes identifying the Plane source email.

Deferred:

- `tracker_set_working_hours` RPC definition and role checks.
- `time_entries` tracked DDL/RLS/policy closure.
- Deployment truth for whether Netlify/generic function routing exposes scheduled tracker functions in production.

## C-137 Spot Checks

C-137 directly checked these anchors in the canonical clone before accepting:

- `plane-webhook.js:51-56`, `128-148`, `209-235`: HMAC verification, no length check, POST gate, dispatch behavior.
- `outlook-webhook.js:21`, `147-196`, `231-240`: optional clientState gate, safe validation token response, Graph notification dispatch.
- `outlook-subscribe.js:27`, `89-140`, `143-152`: app-only subscription lifecycle, empty clientState default, no auth or method gate.
- `outlook-sync.js:82-100`, `135-154`, `230-239`, `259-282`: checkAuth, mailbox allowlist, OData filters, mail-send side effect.
- `calendar-schedule-event.js:43-80`: checkAuth, ISO validation, sanitized fields, raw audit fields.
- `schedule-list.js:113-153`: GET-only, checkAuth, week-start validation, M365 calendar read.
- `schedule-plan-ticket.js:102-181`: POST-only, checkAuth, UUID/date/numeric validation, scheduled_blocks writes, optional M365 event create.
- `tracker-m365-mirror.js:98-152`: no auth gate, service-role reads/patches, Graph event create, schedule metadata.
- `tracker-pull-plane.js:98-199`: no auth gate, service-role Supabase, Plane worklog pull, dedup, schedule metadata.
- `tracker-admin-set-working-hours.js:41-79`: bearer verification, service-role RPC call, role enforcement deferred to SQL.
- `server/index.js:39-44`, `77-79`: tracked public routes include webhooks, subscribe, sync, and scheduling routes, but not tracker scheduled functions.
- `production-server.js:35-44`, `67-116`, `118-164`: generic loader would expose all loaded functions through `/.netlify/functions/:name` while internal scheduled path is loopback-only.

## Immediate Implications

1. Put `outlook-subscribe.js` behind `checkAuth` plus a scheduler/internal HMAC path, and restrict methods.
2. Fail closed when `OUTLOOK_WEBHOOK_SECRET` is absent; never create Graph subscriptions with empty `clientState`.
3. Migrate all internal event-dispatch callers from `X-Internal-Key` to `X-Internal-Timestamp` + `X-Internal-Sig`, then remove legacy acceptance.
4. Add webhook idempotency keyed by provider delivery/subscription/event ids before downstream dispatch.
5. Add a length check before `timingSafeEqual` in `plane-webhook.js`.
6. Decide whether `outlook-sync` mail send needs role gating, recipient/domain rules, attachment limits, and audit logging.
7. Keep tracker scheduled functions isolated from generic public function routing or require internal HMAC when invoked.

## Next Queue

Run 019 should stay single-lane and inspect the remaining tracker/time-entry cluster plus tracker SQL/RPC dependencies:

1. `Dashboard-v2/functions/tracker-start.js`
2. `Dashboard-v2/functions/tracker-stop.js`
3. `Dashboard-v2/functions/tracker-log.js`
4. `Dashboard-v2/functions/tracker-status.js` or closest active status/read endpoint if present
5. `Dashboard-v2/functions/tracker-admin-update-entry.js`
6. `Dashboard-v2/functions/tracker-admin-delete-entry.js`
7. `Dashboard-v2/functions/tracker-admin-set-rate.js`
8. `Dashboard-v2/functions/tracker-admin-set-fte.js`
9. `Dashboard-v2/db-migrations/*` / `Scripts/migrations/*` rows defining `time_entries`, `working_hours`, and `tracker_set_working_hours`
10. front-end tracker callers needed to prove intended roles and navigation wiring
