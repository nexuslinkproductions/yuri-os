# C-137 CHRONEX Tracker Wiring, Data Authority, And Navigationability Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection. No target scripts executed. No installs. No dev server. No live Supabase, Plane, Microsoft Graph, Telegram, or provider calls.

## Scope

This shard inspects CHRONEX/tracker as an end-to-end operating surface:

```text
/tracker navigation
  -> Svelte view switcher and task/calendar/team/admin views
  -> /api/functions/tracker-* and schedule-* calls
  -> tracked function files and tracked PM2 routes
  -> Supabase tables/RPCs/RLS
  -> Plane and Microsoft Graph sync side effects
```

The tracker module is one of the better-built parts of the repo at the function level, but the GitHub clone does not contain enough schema/RPC truth to prove that the system is reconstructable or safe. The biggest issue is not "there is no code"; it is that much of the real authority is hidden in live Supabase state.

## Findings

### R109-F01 - CHRONEX Depends On Live Supabase Tables And RPCs That Are Not Present In Tracked Migrations

Severity: Critical repo-truth, rebuildability, and authorization-audit risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/functions/tracker-start.js:77-82`, `tracker-stop.js:77-82`, `tracker-tick.js:75-79`, and `tracker-log.js:75-86` delegate core timer mutations to Supabase RPCs.
- `Dashboard-v2/functions/tracker-block.js:77-107` delegates schedule block add/delete/resize to `tracker_block_*` RPCs.
- `Dashboard-v2/functions/tracker-admin-update-entry.js`, `tracker-admin-delete-entry.js`, `tracker-admin-set-fte.js`, `tracker-admin-set-working-hours.js`, and `tracker-admin-set-rate.js` delegate admin authority to more tracker RPCs.
- `Dashboard-v2/functions/tracker-ticket-create.js:98-106` calls a `has_permission` RPC before creating Plane issues.
- Browser code reads tables directly from Supabase, including `time_entries`, `team_capacity`, `working_hours`, `absences`, `billing_rates`, `holidays`, and `client_tasks`.
- A tracked migration search found no `CREATE TABLE` or `CREATE OR REPLACE FUNCTION` definitions for the tracker tables/RPCs listed above under `Dashboard-v2/db-migrations` or `Scripts/migrations`.

Impact:

The repo cannot rebuild or independently audit the live CHRONEX authority model. The code repeatedly says the RPCs perform permission checks, rounding, audit logging, plan approval, and admin enforcement, but the actual SQL bodies are not in the GitHub clone. This is exactly the kind of gap that causes an LLM to over-trust comments and function names.

Required remediation direction:

- Export canonical Supabase migrations for all CHRONEX tables, RLS policies, grants, triggers, and RPCs.
- Treat schema/RPC absence as a release blocker for any module that claims production authority.
- Add a CI check that rejects code using `supabase().from("<table>")` or `/rpc/<function>` when no tracked migration defines that table/function.
- Keep live-only database state in a `BLOCKED_LIVE_STATE` inventory until Claudio exports it.

### R109-F02 - The Tracked PM2 Server Does Not Route The Tracker Function Family

Severity: High deployment and navigationability risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/server/index.js:53-82` manually routes selected `/.netlify/functions/*` handlers.
- That route table includes `calendar-schedule-event`, `schedule-list`, and `schedule-plan-ticket` at `Dashboard-v2/server/index.js:77-79`.
- The same route table does not include `tracker-start`, `tracker-stop`, `tracker-tick`, `tracker-log`, `tracker-block`, `tracker-plan-submit`, `tracker-plan-decide`, `tracker-absence-request`, `tracker-absence-decide`, any `tracker-admin-*` handler, `tracker-m365-mirror`, `tracker-pull-plane`, or `tracker-push-plane`.
- The frontend store calls `/api/functions/tracker-start`, `/api/functions/tracker-stop`, and `/api/functions/tracker-tick` from `Dashboard-v2/src/lib/stores/tracker.svelte.ts:91`, `111-115`, and `233-236`.
- The tracker page calls `/api/functions/tracker-plan-submit` at `Dashboard-v2/src/routes/tracker/+page.svelte:319-321` and `/api/functions/tracker-log` at `Dashboard-v2/src/routes/tracker/+page.svelte:525-534`.

Impact:

If the PM2 server is the live local production path, the visible tracker UI can call endpoints that are not exposed by the tracked server. If Netlify or another deployed router is the live path, that routing truth is not represented in this server file. Either way, GitHub does not currently provide one authoritative route map for CHRONEX.

Required remediation direction:

- Generate a route manifest instead of maintaining manual route tables.
- Include columns for frontend caller, physical function file, PM2 route, Netlify route, auth class, schedule class, and live deployment status.
- Fail CI when a frontend `/api/functions/*` dependency has no tracked route for the declared deployment mode.

### R109-F03 - The Client Tasks View Has A Missing Write Backend And Missing Schema Truth

Severity: High workflow breakage and data-integrity risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/lib/components/tracker/TasksView.svelte:14` states that reads use Supabase and writes use `/api/functions/tasks-crud`.
- `TasksView.svelte:77-84` reads `client_tasks` directly from browser Supabase.
- `TasksView.svelte:136-143`, `180`, `199`, and `213` call `/api/functions/tasks-crud` for create, update, archive, and restore.
- The target clone does not contain `Dashboard-v2/functions/tasks-crud.js`.
- The tracked migrations searched for this shard did not define `client_tasks`.

Impact:

The UI presents client task CRUD as part of CHRONEX, but the tracked backend handler does not exist and the table definition is not source-controlled. This is a concrete example of "looks wired" from the frontend but is not repo-truth wired end to end.

Required remediation direction:

- Add the missing `tasks-crud` handler or remove/hide write affordances.
- Export the `client_tasks` table, RLS policy, grants, indexes, and audit triggers.
- Add an endpoint existence test for every `postAuthed("/api/functions/...")` call.

### R109-F04 - Schedule Blocks Have Two Competing Authority Models

Severity: High authorization drift risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/functions/schedule-plan-ticket.js:14-18` uses the shared `checkAuth` helper and the Supabase anon key.
- `schedule-plan-ticket.js:22-47` performs direct REST operations using the anon key as both `apikey` and `Authorization`.
- `schedule-plan-ticket.js:120-133` deletes/resolves scheduled blocks directly.
- `schedule-plan-ticket.js:160-176` inserts scheduled blocks directly and can create a Microsoft 365 event for CTI via `schedule-plan-ticket.js:152-158`.
- In contrast, `Dashboard-v2/functions/tracker-block.js:42-65` verifies a Supabase Bearer token with the service key and `tracker-block.js:77-107` delegates mutations to `tracker_block_*` RPCs with `p_actor`.
- Earlier shard `106` established that the tracked scheduled-block migrations include broad anon-era policies and later hardening comments, but the final live policy cannot be proven from GitHub alone.

Impact:

The old schedule endpoint and the newer tracker-block endpoint can both mutate schedule-related state, but they rely on different auth, key, and permission models. This creates a high chance that one path bypasses checks assumed by the other. It also makes it hard for an LLM or operator to know which endpoint is canonical.

Required remediation direction:

- Pick one schedule-block authority path.
- Move `schedule-plan-ticket` behind the same bearer-plus-RPC model or retire it.
- Add a migration that explicitly revokes anon mutation rights from scheduled blocks unless they are intentionally public.
- Add a compatibility test showing that old and new UI paths cannot diverge.

### R109-F05 - Scheduled Tracker Sync Jobs Are Side-Effectful Handlers Without An In-Handler Schedule/Auth Guard

Severity: High if routed publicly; Medium if only reachable by Netlify scheduled runtime  
Status: `C137_VERIFIED`, `DEPLOYMENT_DEPENDENT`

Evidence:

- `Dashboard-v2/functions/tracker-m365-mirror.js:109-148` selects ended time entries, creates Microsoft Graph calendar events, and patches `time_entries`.
- `tracker-m365-mirror.js:150-152` declares `schedule: '*/1 * * * *'`, but the handler itself does not verify an internal schedule token.
- `Dashboard-v2/functions/tracker-pull-plane.js:98-194` reads recent tickets/worklogs from Plane and inserts `time_entries`.
- `tracker-pull-plane.js:196-199` declares a 15-minute schedule, but the handler itself has no schedule-token verification.
- `Dashboard-v2/functions/tracker-push-plane.js:86-143` pushes pending local time entries to Plane and marks conflicts.
- `tracker-push-plane.js:145-148` declares a 2-minute schedule, but the handler itself has no schedule-token verification.

Impact:

These are not harmless read endpoints. They create calendar events, insert time entries, push worklogs to Plane, and mutate sync states. If any of them becomes externally routed, a caller could trigger expensive or duplicate side effects without needing Claudio's UI permissions. This repeats the broader scheduled-function issue from shard `105`, but CHRONEX has especially sensitive business side effects.

Required remediation direction:

- Require an internal schedule secret or platform-provided scheduled-function identity inside the handler.
- Make these jobs idempotent across repeated manual invocation, not just across one successful sync path.
- Include run locks, trace ids, and replay protection for every scheduled sync function.

### R109-F06 - Plane Pull Falls Back Unmapped Worklogs To The CEO User

Severity: Medium-High business-integrity risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/functions/tracker-pull-plane.js:9-14` documents that unmapped Plane worklog emails are inserted under the CEO with an audit note.
- `tracker-pull-plane.js:91-96` finds the active CEO user id as the fallback.
- `tracker-pull-plane.js:147-149` assigns `userId` from the mapped email or the fallback CEO user.
- `tracker-pull-plane.js:165-180` inserts the new `time_entries` row with `source: 'plane_pull'`, billable default true, and a note containing the Plane logged-by email when available.

Impact:

This keeps sync moving, but it can silently attribute external or unmapped work to the CEO. In billing, capacity, utilization, and audit views, that is a data-integrity problem. If Claudio is already seeing confusing reports, this fallback can contribute to misleading numbers.

Required remediation direction:

- Insert unmapped worklogs into a quarantine table or `sync_conflicts` queue instead of assigning them to a real user.
- Require explicit admin mapping before billing/utilization aggregation.
- Add alerting for repeated unmapped Plane identities.

### R109-F07 - Browser Tracker State Can Leak Idle-Check Intervals Across Subscriptions

Severity: Medium stability and CPU-noise risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/lib/stores/tracker.svelte.ts:52-58` declares `_rafId`, `_heartbeatTimer`, `_idleTimer`, realtime unsubscribe handles, and `_subscribed`.
- `tracker.svelte.ts:60-70` says `subscribe()` is idempotent and returns `_dispose()`.
- `tracker.svelte.ts:244-257` attaches window listeners and starts a `setInterval` for idle checks, but does not store the interval handle.
- `tracker.svelte.ts:260-270` clears `_rafId`, `_heartbeatTimer`, and `_idleTimer`, but cannot clear the anonymous idle interval or remove the four window event listeners from `244-251`.

Impact:

Repeated mount/unmount, login/logout, hot reload, or layout reuse can accumulate idle-check intervals and input listeners. This is not enough by itself to explain 30 GB RAM, but it is a real local stability bug in the direction Claudio reported: hidden background loops that are hard to see from the UI.

Required remediation direction:

- Store the idle interval handle and clear it in `_dispose()`.
- Keep stable listener references and remove them in `_dispose()`.
- Add a small lifecycle test or browser instrumentation that subscribes/disposes repeatedly and asserts one heartbeat, one idle interval, and one realtime subscription remain.

### R109-F08 - Microsoft 365 Calendar Mirroring Trusts Time Entry State And App-Level Graph Authority

Severity: Medium-High deployment-dependent privacy and integrity risk  
Status: `C137_VERIFIED`, `DEPLOYMENT_DEPENDENT`

Evidence:

- `Dashboard-v2/functions/tracker-stop.js:87-100` stamps `m365_event_owner_email` on stopped entries using the caller email.
- `Dashboard-v2/functions/tracker-log.js:91-103` does the same for manual logged entries.
- `Dashboard-v2/functions/tracker-m365-mirror.js:88-94` selects every ended entry with no `m365_event_id` and a non-null `m365_event_owner_email`.
- `tracker-m365-mirror.js:48-53` obtains an app-only Microsoft Graph token.
- `tracker-m365-mirror.js:63-85` creates events under `/v1.0/users/<email>/events`.
- `tracker-m365-mirror.js:126-143` iterates the pending entries and patches the entry after event creation.

Impact:

The code is reasonable if the live RPCs guarantee users can only stop/log their own entries and if the app-only Graph permission is intentionally broad. The repo cannot prove that because the SQL/RLS is missing. A bad or corrupted time-entry row with an owner email can cause the scheduled mirror to write into that mailbox's calendar.

Required remediation direction:

- Add tracked SQL constraints/RPC checks proving `m365_event_owner_email` always equals the authenticated actor's allowed mailbox.
- Consider using delegated Graph permissions or a narrow mailbox allowlist if app-only permissions are wider than necessary.
- Add a mirror-side sanity check against `user_profiles` before creating events.

### R109-F09 - Admin Tracker Pages Read Sensitive Team Data Directly From Browser Supabase

Severity: High if RLS is imperfect; Medium as a repo-truth gap  
Status: `C137_VERIFIED`, `DEPLOYMENT_DEPENDENT`

Evidence:

- `Dashboard-v2/src/routes/admin/tracker/+page.svelte:87-93` performs a client-side permission check before loading settings.
- `admin/tracker/+page.svelte:121-130` reads `user_profiles`, `team_capacity`, `working_hours`, `absences`, `billing_rates`, and `holidays` directly from browser Supabase.
- `Dashboard-v2/src/routes/admin/members/+page.svelte:109-115` performs a client-side admin check before loading data.
- `admin/members/+page.svelte:149-159` reads `user_profiles`, `team_capacity`, `working_hours`, `billing_rates`, and `absences` directly from browser Supabase.
- The tracked migrations do not define the final RLS policies for the CHRONEX tables.

Impact:

Client-side route guards help UX, but they are not the security boundary. If RLS is not exact, sensitive team availability, rates, absences, contact metadata, and Telegram IDs can leak to authenticated users who should not have them. Since the schema/RLS is absent from GitHub, this cannot be accepted as safe from repo truth alone.

Required remediation direction:

- Export RLS policies and grants for all admin-read tables.
- Prefer admin read RPCs or server functions that return only the exact fields a role is allowed to see.
- Add a test matrix for CEO, CTO, normal team member, external user, and unauthenticated browser against every CHRONEX table.

## Positive Controls

- Most `tracker-*` mutation handlers verify a Supabase Bearer token before using service-role RPC calls.
- The newer tracker functions carry `p_actor` into SQL RPCs instead of trusting only client-provided user ids.
- `Dashboard-v2/functions/tracker-admin-update-entry.js` limits editable fields before passing admin updates to SQL.
- `tracker-m365-mirror.js`, `tracker-pull-plane.js`, and `tracker-push-plane.js` cap batch sizes, which helps avoid single-run provider overload.
- `schedule-plan-ticket.js:116-150` validates UUID, date, and numeric fields before direct scheduled-block mutation.

## Coverage Notes

Inspected directly:

```text
Dashboard-v2/src/routes/tracker/+page.svelte
Dashboard-v2/src/lib/stores/tracker.svelte.ts
Dashboard-v2/src/lib/components/tracker/TasksView.svelte
Dashboard-v2/src/routes/admin/tracker/+page.svelte
Dashboard-v2/src/routes/admin/members/+page.svelte
Dashboard-v2/functions/tracker-*.js
Dashboard-v2/functions/schedule-list.js
Dashboard-v2/functions/schedule-plan-ticket.js
Dashboard-v2/functions/calendar-schedule-event.js
Dashboard-v2/server/index.js
Dashboard-v2/db-migrations/*.sql
Scripts/migrations/*.sql
```

Not inspected because it is outside GitHub clone scope:

```text
live Supabase schema/RPC bodies/RLS grants
live Netlify route configuration
live Plane workspace data
live Microsoft Graph app permissions
runtime scheduler state
```
