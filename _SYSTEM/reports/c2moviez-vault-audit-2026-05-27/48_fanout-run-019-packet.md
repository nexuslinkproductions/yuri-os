# Fanout Run 019 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: single persistent Claude/tmux lane, active cap `1`
Required model lane: Opus worker in the existing persistent session after `/clear`

## Mission

Execute one bounded read-only target-repo shard:

`R019_TRACKER_TIMEENTRY_DB_UI_OPUS / TRACKER-TIMEENTRY-DB-UI-019`

This shard inspects the remaining tracker/time-entry write cluster and its UI wiring. The main questions are whether authenticated browser actions can create/update/delete time entries safely, whether admin-only operations prove admin authorization, whether tracker functions rely on missing table/RLS/RPC definitions, and whether the UI/navigation wiring points to real function endpoints or hallucinated/missing surfaces.

## Non-Negotiable Rules

- Read-only only.
- No writes to Claudio's target repository.
- No writes to YURI report files from the worker lane.
- No target execution, no dependency installs, no service starts.
- No live service calls to Plane, Microsoft, Outlook, Supabase, Telegram, or any provider.
- No credential use, validation, replay, provider login, or API probing.
- Use only repository evidence from `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`.
- Do not read YURI protected runtime paths.
- Do not browse `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `.env`, `node_modules`, `.amp`, or `backend/data`.
- C-137 writes the durable report after validating your output.

## Required Clone Proof

Emit:

```text
CLONE_PROOF commit=<sha> status_count=<n> tracked_files=<n>
```

Expected:

- commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
- status count `0`
- tracked files `1505`

## Assigned Current-Tree Files

Inspect these files directly and completely:

1. `Dashboard-v2/functions/tracker-start.js`
2. `Dashboard-v2/functions/tracker-stop.js`
3. `Dashboard-v2/functions/tracker-tick.js`
4. `Dashboard-v2/functions/tracker-log.js`
5. `Dashboard-v2/functions/tracker-block.js`
6. `Dashboard-v2/functions/tracker-admin-update-entry.js`
7. `Dashboard-v2/functions/tracker-admin-delete-entry.js`
8. `Dashboard-v2/functions/tracker-admin-set-rate.js`
9. `Dashboard-v2/functions/tracker-admin-set-fte.js`
10. `Dashboard-v2/src/lib/stores/tracker.svelte.ts`

Read every line of every assigned file. Do not mark a file covered from search hits, summaries, or partial reads.

## Required Supporting Evidence

In addition to assigned-file coverage, perform bounded supporting reads/searches for:

- `Dashboard-v2/server/index.js` route mappings for assigned tracker functions.
- `Dashboard-v2/functions/auth-check.js` auth semantics, only if needed to assess `checkAuth`.
- tracked SQL/RPC evidence under `Dashboard-v2/db-migrations/` and `Scripts/migrations/` for:
  - `time_entries`
  - `working_hours`
  - `tracker_set_working_hours`
  - role/admin fields used by tracker admin functions
- frontend callers under `Dashboard-v2/src/routes/admin/tracker/`, `Dashboard-v2/src/routes/admin/members/`, `Dashboard-v2/src/routes/tracker/`, and `Dashboard-v2/src/lib/components/tracker/` only where needed to prove intended navigation and role flow.

Supporting evidence can be cited, but do not count it as assigned target coverage unless it is one of the 10 assigned files.

## Required Output Rows

For every assigned existing file:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
```

For any assigned or searched missing path/symbol:

```text
MISSING_PROOF target="<path-or-symbol>" command="<bounded command>" status=missing evidence="<bounded result>"
```

For tracker HTTP entrypoints:

```text
TRACKER_ENDPOINT_MAP path="<path>" entrypoint="<handler/action>" method_control="<POST|GET|OPTIONS|any>" auth_control="<checkAuth|bearer_verify|internal_hmac|none|unknown>" user_binding="<from token|from body|from DB|unknown>" write_scope="<time_entries|working_hours|user_profiles|scheduled_blocks|plane|m365|mixed|none>" status="<covered|reportable|suppressed|deferred>"
```

For admin/role boundaries:

```text
ADMIN_AUTHZ_MAP path="<path>" action="<update|delete|set_rate|set_fte|set_hours|unknown>" app_auth="<checkAuth|bearer_verify|none|unknown>" role_check="<function|RPC|frontend_only|none|unknown>" target_binding="<caller|body.target_user|body.id|unknown>" status="<covered|reportable|suppressed|deferred>"
```

For DB/RPC proof:

```text
DB_DEPENDENCY_MAP surface="<table-or-rpc>" repo_definition="<path:line|missing>" rls_or_grants="<summary|missing|unknown>" callers="<path list>" status="<covered|reportable|deferred|suppressed>"
```

For UI/navigation wiring:

```text
UI_WIRING_MAP source="<frontend path>" action="<start|stop|tick|log|admin_update|admin_delete|set_rate|set_fte|block|unknown>" endpoint="<path>" backend_exists="<yes|no|unknown>" auth_method="<postAuthed|supabase_client|unknown>" status="<covered|reportable|suppressed|deferred>"
```

For findings:

```text
FINDING id=R019-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|privacy|data-integrity|availability|wiring|navigation|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
```

For suppressions:

```text
SUPPRESSION path="<path>" hypothesis="<risk considered>" counterevidence="<exact counterevidence>"
```

For deferred items:

```text
DEFERRED path="<path-or-surface>" reason="<exact blocker>" next="<next read-only evidence source>"
```

Close with:

```text
BATCH_CLOSE lane=opus batch=R019 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Audit Questions

Answer from repo evidence only:

- Do tracker start/stop/tick/log/block endpoints use `checkAuth`, method gates, and safe caller binding?
- Can a caller start/stop/tick/log time for someone else by supplying body fields, or is user identity bound to the authenticated token/session?
- Do admin update/delete/rate/FTE endpoints enforce admin authorization in backend code, in SQL/RPC, or only in frontend navigation?
- Are `time_entries`, `working_hours`, and related tracker tables defined in tracked migrations with RLS and grants?
- Is `tracker_set_working_hours` defined in tracked SQL, and if yes does it enforce role/admin checks?
- Are frontend tracker calls wired to real backend endpoints that exist in the tracked server route map?
- Are any tracker endpoints called by the UI but absent from `server/index.js` or only available under generic Netlify routing?
- Do tracker writes have field allowlists, numeric/date clamps, ownership checks, idempotency, and audit logs?
- Which tracker controls are good and should be preserved?

## False-Positive Guards

- Do not report a frontend-only route guard as backend authorization. Treat it as UX/navigation only unless backend code enforces it.
- Do not report use of service-role credentials as bad by itself; report missing caller reachability controls, missing role checks, or over-broad writes.
- Do not report direct Supabase browser reads as a vulnerability without identifying table RLS/grant posture or missing schema proof.
- Do not count missing `tracker-status.js` as a finding unless the UI or route map references that exact endpoint.
- Preserve positives such as `checkAuth`, method gates, per-user token binding, field allowlists, clamping, idempotency, and explicit audit rows.

## C-137 Current Coverage State

Before Run 019:

- accepted assigned target coverage: `278 / 1505`
- strict semantic coverage: `276 covered + 2 partial`
- partial files: `Scripts/telegram-mcp/package-lock.json`, `Scripts/team-bots/package-lock.json`
