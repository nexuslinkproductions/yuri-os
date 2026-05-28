# Fanout Run 022 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no SQL execution, no target execution, no live service calls, no credential use
Worker mode: single persistent Claude/tmux lane, active cap `1`

## Acceptance Summary

Run 022 is accepted with C-137 corrections.

- `R022_TRACKER_ABSENCE_TIMEEDIT_WHISPER_OPUS / TRACKER-ABSENCE-TIMEEDIT-WHISPER-022`: worker closed with `files_covered=7 findings=17 suppressions=5 deferred=7 invalidated=0`.
- C-137 accepted the 7 assigned target files as covered after verifying line/word counts, route mappings, handler auth patterns, SQL/RPC definition searches, OpenAI/Plane sinks, Telegram callback strings, and source snippets against the local clone.
- C-137 narrowed several worker severities where tracked repo evidence shows a deployment-dependent route or an RPC-deferred risk rather than a confirmed live bypass.

Accepted assigned target surfaces added by Run 022: `7`.

Accepted assigned target coverage total after Run 022: `313 / 1505` tracked files.

Strict semantic caveat carried forward: two lockfiles are currently `partial`: `Scripts/telegram-mcp/package-lock.json` from Run 008 and `Scripts/team-bots/package-lock.json` from Run 010. Full semantic coverage is `311 covered + 2 partial`.

Contamination check: passed. C-137 checked the Run 022 pipe log for protected Claude runtime reads, `Searched memories`, and invalidation markers. The only protected-path matches were the packet's own "do not browse" rules. No protected YURI runtime read was accepted.

Clone proof: C-137 verified the target clone at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, clean status count `0`, and `1505` tracked files.

Source pipe log:

- `/tmp/yuri-c2v-fanout-run-022/pipe/r022-single-v2.pipe.log`

## C-137 Corrections

Lane output remains advisory until verified. C-137 corrected these points before acceptance:

- Narrowed `whisper-transcribe.js` from "critical" to `high/deployment-dependent`. The function has no auth gate and forwards audio to OpenAI, but the tracked PM2 API server does not map it and the tracked `/api/functions` bridge is missing. If exposed through a generic Netlify/runtime loader, it becomes a high-cost-abuse issue.
- Narrowed OpenAI payload-size findings to medium for `transcribe.js` because that endpoint uses `checkAuth(event)` before forwarding to OpenAI. The missing upper bound is still valid.
- Kept absence/time-edit decision authorization as `high/deferred`, not confirmed bypass. The JS handlers authenticate the caller but do not do role checks; final safety depends on missing tracked RPC definitions.
- Downgraded PostgREST interpolation findings to low/medium hardening unless paired with body-controlled ids and missing RPC ownership proof. The more important issue is lack of UUID/field validation before service-role REST/RPC calls.
- Promoted a C-137 verified wiring finding not emphasized by the worker: `tabs_approve`/`tabs_reject` and `tte_approve`/`tte_reject` callback strings are emitted, but no tracked handler was found outside the emit sites.
- Reclassified worker "positive" findings as `info/positive`; positives should not use medium severity.

## Files Covered

| Path | Lines | Words | Notes |
| --- | ---: | ---: | --- |
| `Dashboard-v2/functions/tracker-absence-decide.js` | 87 | 461 | Absence approve/reject/cancel endpoint |
| `Dashboard-v2/functions/tracker-absence-request.js` | 120 | 626 | Absence request endpoint plus CEO Telegram prompt |
| `Dashboard-v2/functions/tracker-time-edit-request.js` | 164 | 776 | Time edit request endpoint plus CEO Telegram prompt |
| `Dashboard-v2/functions/tracker-time-edit-decide.js` | 92 | 513 | Time edit approve/reject endpoint |
| `Dashboard-v2/functions/tracker-ticket-create.js` | 251 | 1238 | Tracker-to-Plane issue creation endpoint |
| `Dashboard-v2/functions/transcribe.js` | 93 | 353 | Authenticated OpenAI Whisper endpoint |
| `Dashboard-v2/functions/whisper-transcribe.js` | 119 | 504 | Unauthenticated meeting-studio fallback transcription endpoint |

Supporting evidence read, not counted as new coverage:

- `Dashboard-v2/server/index.js`
- `Dashboard-v2/server/Caddyfile.template`
- `Dashboard-v2/production-server.js`
- `Dashboard-v2/functions/shared.js`
- `Dashboard-v2/functions/shared-telegram.js`
- `Dashboard-v2/db-migrations/010_user_identity.sql`
- `git grep` checks for tracker RPC/table definitions and Telegram callback handlers

## Route And Handler Map

None of the seven assigned functions are explicitly mapped by tracked `Dashboard-v2/server/index.js`.

| Function | Auth/method controls | Service/provider sinks | `server/index.js` mapping | Notes |
| --- | --- | --- | --- | --- |
| `tracker-absence-decide` | POST-only, bearer-verified caller | service-role RPC `tracker_absence_decide` | missing | Role enforcement deferred to missing RPC |
| `tracker-absence-request` | POST-only, bearer-verified caller | service-role RPC `tracker_absence_request`; Telegram CEO prompt | missing | No JS allowlist for `kind` or dates |
| `tracker-time-edit-request` | POST-only, bearer-verified caller | service-role RPC `tracker_time_edit_request`; service-role reads; Telegram CEO prompt | missing | Body `proposed` object is passed through to RPC |
| `tracker-time-edit-decide` | POST-only, bearer-verified caller; JS status allowlist | service-role RPC `tracker_time_edit_decide` | missing | Role enforcement deferred to missing RPC |
| `tracker-ticket-create` | POST-only, bearer-verified caller; `has_permission('tracker','create_ticket')` | Plane issue/module/cycle/customer calls; service-role audit write | missing | Strongest assigned backend permission gate |
| `transcribe` | POST-only; `checkAuth(event)` | OpenAI Whisper | missing | Authenticated but no explicit upper size cap/timeout |
| `whisper-transcribe` | POST-only; no auth gate | OpenAI Whisper | missing | High if exposed through `/api` or generic function loader |

Generic-loader caveat: `production-server.js:35-56` loads functions dynamically from `netlify/functions`, and `production-server.js:118-132` exposes `/.netlify/functions/:name`. That is not repo-proven availability for this tracked clone because `Dashboard-v2/netlify/functions/` is absent and tracked PM2 uses `server/index.js`.

## Accepted Findings

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `R022-F01` | high/deployment-dependent | `Dashboard-v2/functions/whisper-transcribe.js:14-35` | security/availability | `whisper-transcribe.js` has no `checkAuth`, bearer verification, cookie check, or HMAC check before forwarding uploaded audio to OpenAI Whisper. If this function is exposed through production routing, unauthenticated callers can burn OpenAI spend and process arbitrary audio. |
| `R022-F02` | medium | `Dashboard-v2/functions/whisper-transcribe.js:23-35`, `Dashboard-v2/functions/whisper-transcribe.js:47-79` | availability/cost | The fallback transcription path has no explicit payload size cap, MIME allowlist, request timeout, or rate limit before building a multipart request to OpenAI. |
| `R022-F03` | medium | `Dashboard-v2/functions/transcribe.js:28-52`, `Dashboard-v2/functions/transcribe.js:54-92` | availability/cost | `transcribe.js` is authenticated with `checkAuth`, but only checks that `audio_b64.length >= 100`; it has no explicit upper size cap, timeout, or rate limit before forwarding to OpenAI. |
| `R022-F04` | high/deferred | `Dashboard-v2/functions/tracker-absence-decide.js:62-78` | authz/data-integrity | Absence approval authenticates the caller but performs no JS role/permission check before passing `p_actor`, `p_absence_id`, and `p_status` to the service-role RPC. Safety depends on missing `tracker_absence_decide` SQL/RPC source. |
| `R022-F05` | high/deferred | `Dashboard-v2/functions/tracker-time-edit-decide.js:64-84` | authz/data-integrity | Time-edit approval authenticates the caller and validates status, but performs no JS role/permission check before service-role RPC execution. Safety depends on missing `tracker_time_edit_decide` SQL/RPC source. |
| `R022-F06` | medium/deferred | `Dashboard-v2/functions/tracker-absence-request.js:80-92` | authz/data-integrity | Absence request comment says the caller needs `tracker.request_absence`, but the handler only verifies bearer auth. Permission/kind/date enforcement is delegated to missing `tracker_absence_request` RPC source. |
| `R022-F07` | medium/deferred | `Dashboard-v2/functions/tracker-time-edit-request.js:105-115` | authz/data-integrity | Time edit request accepts `entry_id` and arbitrary `proposed` object from the body and delegates ownership, field allowlist, drift, and auto-apply logic to missing `tracker_time_edit_request` RPC source. |
| `R022-F08` | high/wiring | `Dashboard-v2/functions/tracker-absence-request.js:107-110`, `Dashboard-v2/functions/tracker-time-edit-request.js:147-150` | wiring/availability | The functions emit Telegram callbacks `tabs_approve:*`, `tabs_reject:*`, `tte_approve:*`, and `tte_reject:*`, but `git grep` found those strings only at the emit sites. No tracked Telegram handler was found, so CEO approval buttons appear unwired in repo truth. |
| `R022-F09` | medium | `Dashboard-v2/functions/tracker-absence-decide.js:69-78` | data-integrity | The comment limits absence status to `approved`, `rejected`, or `cancelled`, but the handler only checks presence and passes any `body.status` to the RPC. Add a JS allowlist before the RPC call. |
| `R022-F10` | low/medium | `Dashboard-v2/functions/tracker-time-edit-request.js:77-84` | hardening | `entry_id` from the body is interpolated into a service-role PostgREST URL in `fetchEntry()` without UUID validation or URL encoding. Its use is post-RPC notification context, so impact depends on missing RPC behavior, but this should still be hardened. |
| `R022-F11` | low | `Dashboard-v2/functions/tracker-absence-request.js:60-65`, `Dashboard-v2/functions/tracker-time-edit-request.js:69-74` | hardening | Auth-derived `caller.id` values are interpolated into service-role PostgREST URLs. Since they come from Supabase auth, exploitability is low, but UUID validation and `encodeURIComponent` would reduce drift and parser risk. |
| `R022-F12` | medium | `Dashboard-v2/functions/tracker-ticket-create.js:138-172` | data-integrity/provider | `project_id` from the request body overrides the tracked `PROJECTS` map. A caller with `tracker.create_ticket` can target any Plane project UUID accepted by the API key, not only the configured project codes. This may be intended, but it is broader than the UI-level project-code model. |
| `R022-F13` | medium | `Dashboard-v2/functions/tracker-ticket-create.js:76-84`, `Dashboard-v2/functions/tracker-ticket-create.js:171-226` | availability/provider | Tracker ticket creation can perform several Plane GET/POST calls and has no local timeout, retry budget, per-user rate limit, or idempotency key. A permitted user can create duplicate issues or hang function time on provider latency. |
| `R022-F14` | low | `Dashboard-v2/functions/tracker-absence-request.js:103-110`, `Dashboard-v2/functions/tracker-time-edit-request.js:138-150`, `Dashboard-v2/functions/shared-telegram.js:86-98` | content-injection | User-provided `reason` values are embedded into Telegram HTML messages without escaping. `shared-telegram.js` uses `parse_mode: 'HTML'`. This is already a known Telegram-family weakness and is lower impact here, but it can break formatting or alter link/text rendering. |
| `R022-F15` | info/positive | `Dashboard-v2/functions/tracker-ticket-create.js:125-127` | positive | `tracker-ticket-create.js` has the strongest assigned backend gate: it calls `has_permission(caller.id, 'tracker', 'create_ticket')` before any Plane side effect. |
| `R022-F16` | info/positive | `Dashboard-v2/functions/transcribe.js:7-15` | positive | `transcribe.js` uses shared `checkAuth(event)`, preserving cookie/Bearer/HMAC session verification and revocation support from `auth-check.js`. |
| `R022-F17` | info/positive | `Dashboard-v2/functions/tracker-time-edit-decide.js:71-76` | positive | `tracker-time-edit-decide.js` includes a JS allowlist for `approved` and `rejected`; `tracker-absence-decide.js` should mirror this style. |

## Suppressions / Narrowing

- Service-role use is not reported by itself. Findings only survive when body-controlled data, missing role checks, missing RPC definitions, provider side effects, or missing rate/size controls create a plausible failure mode.
- `tracker-ticket-create.js` is not considered unauthenticated or obviously overbroad because it verifies the bearer token and checks `has_permission('tracker','create_ticket')` before Plane calls.
- `transcribe.js` OpenAI cost risk is narrowed because `checkAuth(event)` gates access. The remaining issue is bounded-resource control, not public reachability.
- Telegram notification content to the CEO is operationally intended. The accepted risk is unescaped HTML/rendering drift and unwired callback handling, not the mere fact that a CEO notification is sent.

## Deferred

- `tracker_absence_request`, `tracker_absence_decide`, `tracker_time_edit_request`, and `tracker_time_edit_decide` RPC definitions are not present in the tracked SQL, so final authorization, ownership, drift, status, and field allowlist behavior is blocked by missing Supabase source.
- `has_permission` is called by `tracker-ticket-create.js`, but the exact `has_permission` SQL/RPC source is not present in the tracked SQL. Prior runs found related RBAC material, but the function source remains needed for final confidence.
- `time_entries` schema/RLS is still missing from tracked migrations. Run022 found service-role reads and RPC dependency around it, but not the database truth.
- Live production routing remains deferred. Tracked `server/index.js` does not map these functions; `production-server.js` generic loading is deployment-dependent and points at an absent tracked `netlify/functions` directory.

## C-137 Spot Checks

C-137 directly checked these anchors before accepting:

- `tracker-absence-decide.js:57-87`: method gate, bearer verification, body parsing, no status allowlist, service-role RPC call.
- `tracker-absence-request.js:68-120`: method gate, bearer verification, absence request body, service-role RPC, Telegram callback emit.
- `tracker-time-edit-request.js:69-84` and `:93-164`: service-role profile/entry reads, request body validation, RPC call, Telegram prompt.
- `tracker-time-edit-decide.js:59-92`: method gate, bearer verification, status allowlist, service-role RPC call.
- `tracker-ticket-create.js:98-127` and `:138-236`: `has_permission`, project override, Plane calls, audit write.
- `transcribe.js:10-30` and `:54-92`: `checkAuth`, no upper size cap, OpenAI request.
- `whisper-transcribe.js:14-35` and `:47-79`: no auth gate, multipart parse, OpenAI request.
- `server/index.js`: no explicit routes for the seven assigned functions.
- `production-server.js:35-56` and `:118-132`: generic loader from `netlify/functions` and `/.netlify/functions/:name` route.
- `git grep` for `tabs_approve`, `tabs_reject`, `tte_approve`, and `tte_reject`: only emit sites were found in the tracked clone.
- `git grep` for tracker RPC names in SQL/migrations: no tracked definitions for the key tracker absence/time-edit RPCs.

## Immediate Implications

1. `whisper-transcribe.js` should be treated as urgent if deployed anywhere reachable, because it lacks auth before paid OpenAI work.
2. The tracker absence/time-edit approval flow still cannot be trusted from repo evidence because the JS handlers lack role checks and the controlling RPC source is missing.
3. Telegram callback wiring for absence/time-edit approvals appears broken in the tracked repo, matching the same class of Telegram-control failure already found for tracker plan decisions.
4. `tracker-ticket-create.js` is a useful positive pattern for backend permission checks, but needs provider resource controls and project scoping review.

## Next Queue

Run 023 should stay single-lane and inspect the next narrow control surface created by Run 022:

- `Dashboard-v2/functions/telegram.js` callback routing ranges around callback dispatch;
- `Dashboard-v2/functions/shared-telegram.js` only if not treated as already semantically closed by Run 016;
- `Dashboard-v2/src/lib/components/tracker/TicketCreateDialog.svelte`;
- any frontend/admin surfaces that call `tracker-absence-request`, `tracker-time-edit-decide`, or `tracker-ticket-create` and have not yet been semantically covered.

Goal: close whether absence/time-edit/ticket UI and Telegram paths are actually navigable end-to-end, not just whether the backend functions exist.
