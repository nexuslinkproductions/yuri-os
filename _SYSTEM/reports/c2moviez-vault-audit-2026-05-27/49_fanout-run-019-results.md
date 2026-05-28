# Fanout Run 019 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no SQL execution, no target execution, no live service calls, no credential use
Worker mode: single persistent Claude/tmux lane, active cap `1`

## Acceptance Summary

Run 019 is accepted with C-137 corrections.

- `R019_TRACKER_TIMEENTRY_DB_UI_OPUS / TRACKER-TIMEENTRY-DB-UI-019`: worker closed with `files_covered=10 findings=9 suppressions=4 deferred=7 invalidated=0`.
- C-137 accepted the 10 assigned target files as covered after verifying the strongest claims against local code, route, Caddy, and SQL-search evidence.

Accepted assigned target surfaces added by Run 019: `10`.

Accepted assigned target coverage total after Run 019: `288 / 1505` tracked files.

Strict semantic caveat carried forward: two lockfiles are currently `partial`: `Scripts/telegram-mcp/package-lock.json` from Run 008 and `Scripts/team-bots/package-lock.json` from Run 010. Full semantic coverage is `286 covered + 2 partial`.

Contamination check: passed. C-137 checked the Run 019 pipe log for protected Claude runtime reads, `Searched memories`, and invalidation markers. No protected-runtime read was accepted.

Clone proof: C-137 verified the target clone at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, clean status count `0`, and `1505` tracked files.

Source pipe log:

- `/tmp/yuri-c2v-fanout-run-019/pipe/r019-single.pipe.log`

## C-137 Corrections

Lane output remains advisory until verified. C-137 corrected these points before acceptance:

- The `/api/functions/*` routing gap is broader than tracker. Tracked frontend files widely call `/api/functions/*`, while tracked `Dashboard-v2/server/Caddyfile.template:14-16` only proxies `/.netlify/functions/*` to the API server and sends everything else to SvelteKit on port 3002. Tracked `Dashboard-v2/server/index.js:39-93` registers `/.netlify/functions/*` and `/_internal/scheduled/*`, not `/api/functions/*`. No tracked `Dashboard-v2/src/routes/api/` or `hooks.server` proxy exists.
- The function-directory mismatch remains part of the same wiring family. The tracked function files live under `Dashboard-v2/functions/`, but `server/index.js` imports `../netlify/functions/*` and `production-server.js:35-44` loads `netlify/functions`. This had already surfaced in earlier runs and is reinforced here.
- Backend tracker admin files do not perform role checks in JS, but the comments claim admin checks live in missing SQL RPCs. Therefore these are **high/deferred authorization findings**, not confirmed live privilege escalations from repo evidence alone.
- The worker said all 10 functions have method gates; the assigned set contains nine backend functions plus one frontend store. C-137 narrowed the positive to the nine assigned backend tracker functions.
- `tracker-admin-set-working-hours.js` was already covered in Run 018. It remains relevant because its `tracker_set_working_hours` RPC definition is missing, but it is not an uncovered target file.

## Executive Findings

Run 019 is the first strong architecture/navigationability hit.

The tracker UI calls `/api/functions/tracker-*`, but the tracked production routing only exposes `/.netlify/functions/*` to the API server. Caddy sends `/api/functions/*` to the frontend, and the repo contains no SvelteKit API route or hook proxy that forwards those calls. That means either production depends on untracked routing, or these UI actions 404. This is exactly the kind of repo-truth failure an LLM will trip over: the codebase contains backend functions, UI callers, and route wrappers, but their path dialects do not agree.

The DB/RPC truth is also incomplete. Tracker code relies on `time_entries`, `working_hours`, `team_capacity`, `billing_rates`, and many `tracker_*` RPCs, but the tracked SQL migrations do not define those tables/RPCs. Because the backend functions depend on service-role calls to missing `SECURITY DEFINER` RPCs for ownership, admin gating, idempotency, audit logs, and field clamping, the repo cannot prove the tracker security model.

## Tracker / Time Entry / UI Lane

Lane: `R019_TRACKER_TIMEENTRY_DB_UI_OPUS`
Batch: `TRACKER-TIMEENTRY-DB-UI-019`

Files covered:

- `Dashboard-v2/functions/tracker-start.js`
- `Dashboard-v2/functions/tracker-stop.js`
- `Dashboard-v2/functions/tracker-tick.js`
- `Dashboard-v2/functions/tracker-log.js`
- `Dashboard-v2/functions/tracker-block.js`
- `Dashboard-v2/functions/tracker-admin-update-entry.js`
- `Dashboard-v2/functions/tracker-admin-delete-entry.js`
- `Dashboard-v2/functions/tracker-admin-set-rate.js`
- `Dashboard-v2/functions/tracker-admin-set-fte.js`
- `Dashboard-v2/src/lib/stores/tracker.svelte.ts`

Supporting dependency evidence read, not counted as covered:

- `Dashboard-v2/server/index.js`
- `Dashboard-v2/production-server.js`
- `Dashboard-v2/server/Caddyfile.template`
- `Dashboard-v2/server/deploy.sh`
- `Dashboard-v2/server/ecosystem.config.js`
- `Dashboard-v2/server/express-adapter.js`
- bounded SQL/RPC searches under `Dashboard-v2/db-migrations/` and `Scripts/migrations/`
- bounded frontend caller searches under tracker/admin routes and components

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `R019-F01` | high | `Dashboard-v2/src/lib/stores/tracker.svelte.ts:91`, `Dashboard-v2/src/lib/stores/tracker.svelte.ts:111`, `Dashboard-v2/src/lib/stores/tracker.svelte.ts:233`, `Dashboard-v2/server/Caddyfile.template:14-33`, `Dashboard-v2/server/index.js:39-96` | wiring/navigation | Tracker UI calls `/api/functions/tracker-start`, `/api/functions/tracker-stop`, and `/api/functions/tracker-tick`, but tracked Caddy and Express route only `/.netlify/functions/*` to the API server. No tracked SvelteKit `/api/functions` route/proxy exists. |
| `R019-F02` | high | `Dashboard-v2/src/routes/tracker/+page.svelte:525`, `Dashboard-v2/src/lib/components/tracker/CalendarView.svelte:242`, `Dashboard-v2/src/lib/components/tracker/CalendarView.svelte:276`, `Dashboard-v2/src/lib/components/tracker/CalendarView.svelte:300`, `Dashboard-v2/src/lib/components/tracker/TimeEditRequestModal.svelte:96`, `Dashboard-v2/src/lib/components/tracker/TimeEditRequestModal.svelte:139` | wiring/navigation | Additional tracker UI mutation endpoints use `/api/functions/*` paths that are not routed in tracked production config: manual log, block add/delete/resize, admin update, and admin delete. |
| `R019-F03` | high | `Dashboard-v2/db-migrations/`, `Scripts/migrations/` | data-integrity/auditability | No tracked SQL migration defines `time_entries`, `working_hours`, `team_capacity`, `billing_rates`, or the core tracker RPCs (`tracker_start`, `tracker_stop`, `tracker_heartbeat`, `tracker_manual_log`, admin RPCs, block RPCs, and `tracker_set_working_hours`). Live Supabase may contain them, but repo truth cannot prove schema, RLS, grants, role checks, audit logs, or idempotency. |
| `R019-F04` | high/deferred | `Dashboard-v2/functions/tracker-admin-update-entry.js:66-105`, `Dashboard-v2/functions/tracker-admin-delete-entry.js:57-85`, `Dashboard-v2/functions/tracker-admin-set-rate.js:58-93`, `Dashboard-v2/functions/tracker-admin-set-fte.js:58-89` | authz | Admin endpoints verify only a bearer token in JS, then call service-role RPCs with `p_actor`. Admin enforcement is claimed to exist in missing RPC SQL, so backend authorization cannot be verified from the repo. |
| `R019-F05` | medium/deferred | `Dashboard-v2/functions/tracker-block.js:73-105` | authz/data-integrity | `tracker-block.js` binds `p_actor` to caller id but lets the request provide `p_assignee_code`, `p_day`, `p_start_hour`, and `p_duration_hours`. Whether users can schedule blocks for arbitrary assignees or invalid ranges depends on missing `tracker_block_*` RPC definitions. |
| `R019-F06` | medium | `Dashboard-v2/functions/tracker-stop.js:91-100`, `Dashboard-v2/functions/tracker-log.js:93-103` | data-integrity | After the RPC returns an entry id, stop/log functions directly PATCH `time_entries` with service-role credentials to stamp `m365_event_owner_email`. This is reasonably constrained to `r.body.id` and `m365_event_owner_email=is.null`, but it is still a direct table write whose schema/RLS/audit posture is missing from tracked SQL. |
| `R019-F07` | info/positive | `Dashboard-v2/functions/tracker-start.js:82-103`, `Dashboard-v2/functions/tracker-stop.js:65-82`, `Dashboard-v2/functions/tracker-tick.js:65-79`, `Dashboard-v2/functions/tracker-log.js:63-86`, `Dashboard-v2/functions/tracker-block.js:64-87` | positive | User-facing tracker functions bind `p_actor` to the Supabase bearer-verified caller id and do not accept a body-supplied actor/user id. This is the right anti-IDOR pattern if the RPCs enforce ownership. |
| `R019-F08` | info/positive | `Dashboard-v2/functions/tracker-admin-update-entry.js:60-88` | positive | Admin update uses a field allowlist before sending `p_fields` to the RPC. Preserve this. |
| `R019-F09` | info/positive | assigned tracker backend functions | positive | The nine assigned backend functions consistently implement `OPTIONS`, POST-only method gates, environment guards, explicit CORS origin, and JSON parse errors. |
| `R019-F10` | info/positive | `Dashboard-v2/src/lib/stores/tracker.svelte.ts:83-105` | positive/navigation | Frontend tracker store checks `user.can("tracker.start")` and `user.can("tracker.stop")` before making start/stop calls. This is a useful UX guard, but it is not a substitute for backend/RPC authorization. |

Suppressed or narrowed:

- Body fields in `tracker-start.js` are not SQL injection by themselves because they are passed as PostgREST RPC JSON parameters. Length/format/business validation still belongs in the missing RPC layer.
- Direct browser reads in `db.ts` are scoped by caller user id in the query pattern, but final safety still depends on missing `time_entries` RLS.
- Service-role PATCH in `tracker-stop.js` and `tracker-log.js` is narrowed by RPC-returned entry id and `m365_event_owner_email=is.null`; keep it as medium/data-integrity, not a direct privilege-escalation finding.
- Frontend admin guards are treated as navigation/UX only. Real authorization must exist in backend/RPC; repo cannot prove it.

Deferred:

- `time_entries` table definition, RLS, grants, and indexes.
- `working_hours` table definition, RLS, and grants.
- `team_capacity` table definition, RLS, and grants.
- `billing_rates` table definition, RLS, and grants.
- All tracker RPC definitions and grants: `tracker_start`, `tracker_stop`, `tracker_heartbeat`, `tracker_manual_log`, `tracker_admin_update_entry`, `tracker_admin_delete_entry`, `tracker_set_billing_rate`, `tracker_set_capacity`, `tracker_block_add`, `tracker_block_delete`, `tracker_block_resize`, `tracker_set_working_hours`, and related permission helpers.
- Deployment truth for whether an untracked `/api/functions/*` proxy exists in production.
- Full `Dashboard-v2/db-migrations/001_scheduled_blocks.sql` closure for `scheduled_blocks` RLS/grants, because Run 019 only used it as supporting context.

## C-137 Spot Checks

C-137 directly checked these anchors in the canonical clone before accepting:

- `tracker-start.js:73-103`, `tracker-stop.js:60-106`, `tracker-tick.js:60-83`, `tracker-log.js:58-109`, `tracker-block.js:59-109`: method gates, bearer verification, actor binding, RPC calls, and direct patch behavior.
- `tracker-admin-update-entry.js:60-98`, `tracker-admin-delete-entry.js:57-81`, `tracker-admin-set-rate.js:58-89`, `tracker-admin-set-fte.js:58-85`: admin comments, lack of JS role checks, RPC delegation, and field validation.
- `tracker.svelte.ts:83-91`, `103-111`, `226-241`: frontend permission checks and `/api/functions/tracker-*` calls.
- `server/index.js:39-96`: no tracker route mappings and no `/api/functions/*` route family.
- `production-server.js:35-44`, `118-164`: generic loader expects `netlify/functions` and exposes only `/.netlify/functions/:name`.
- `Caddyfile.template:12-33`: Caddy proxies only `/.netlify/functions/*`, `/_internal/*`, and `/health` to port 3001; other paths go to frontend port 3002.
- `deploy.sh:11-18`: deployment expects `$REMOTE/netlify/functions`, which is not present as a tracked directory in this clone.
- `git ls-files` for `Dashboard-v2/src/routes/api/`, `Dashboard-v2/src/hooks.server*`, `Dashboard-v2/netlify/**`, `Dashboard-v2/netlify.toml`, `_redirects`, and `_headers`: no tracked route/proxy evidence found.
- `rg` across tracked SQL for tracker tables/RPCs: no definitions for the core tracker tables/RPCs found.

## Immediate Implications

1. Choose one API path dialect and make the repo consistent. Either frontend calls `/.netlify/functions/*`, or Caddy/Express/SvelteKit must explicitly proxy `/api/functions/*` to the function server.
2. Decide whether functions belong in `Dashboard-v2/functions` or `Dashboard-v2/netlify/functions`, then update server imports, production loader, deploy script, and documentation to match.
3. Export and track authoritative Supabase DDL/RLS/grants for tracker tables and RPCs.
4. Move admin role enforcement into a repo-visible layer, or at minimum make SQL RPC definitions visible and reviewable.
5. Treat the route mismatch as a top-level architecture/navigation finding, not only a tracker bug: many non-tracker screens use `/api/functions/*` too.

## Next Queue

Run 020 should stay single-lane and expand the route-alias/navigationability shard across the broader app:

1. `Dashboard-v2/src/lib/db.ts`
2. `Dashboard-v2/src/routes/+layout.svelte`
3. `Dashboard-v2/src/routes/login/+page.svelte`
4. `Dashboard-v2/src/routes/schedule/+page.svelte`
5. `Dashboard-v2/src/routes/pipeline/+page.svelte`
6. `Dashboard-v2/src/routes/meetings/+page.svelte`
7. `Dashboard-v2/src/routes/admin/system/+page.svelte`
8. `Dashboard-v2/src/routes/tokens/+page.svelte`
9. `Dashboard-v2/server/Caddyfile.template`
10. `Dashboard-v2/server/index.js`

The goal is to determine how much of the app is miswired to `/api/functions/*` versus `/.netlify/functions/*`.
