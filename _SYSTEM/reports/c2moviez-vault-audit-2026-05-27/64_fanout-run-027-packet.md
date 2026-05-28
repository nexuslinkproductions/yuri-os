# Fanout Run 027 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: single persistent Claude/tmux lane, active cap `1`
Required model lane: Opus worker in the existing persistent session after `/clear`

## Mission

Execute one bounded read-only target-repo shard:

`R027_TRACKER_ANALYTICS_FINANCIAL_SCOPE_OPUS / TRACKER-ANALYTICS-FINANCIAL-SCOPE-027`

This shard closes the tracker analytics UI side of the time-entry/client-task financial reporting flow.

Prior accepted context:

- Run 019 covered tracker time-entry DB/UI supporting surfaces.
- Run 024 found direct browser Supabase mutations in `StopModal.svelte` and `ClientTaskPicker.svelte`, deferred to missing RLS proof.
- Run 025 covered `TasksView.svelte`, found missing `/api/functions/tasks-crud`, and flagged `hourly_rate` selection for all users as data minimization.
- Run 026 covered `PlanWeekView.svelte`, found missing focus endpoints and localStorage-only planning state.

Run 027 must inspect `AnalyticsView.svelte` line-by-line and determine how financial analytics, team scope, time-entry reads, client-task category joins, route mounting, and LLM navigationability behave from repo truth.

## Non-Negotiable Rules

- Read-only only.
- No writes to Claudio's target repository.
- No writes to YURI report files from the worker lane.
- No target execution, no dependency installs, no service starts.
- No live service calls to Telegram, Plane, Supabase, OpenAI, Microsoft, Caddy, Infomaniak, Netlify, or any provider.
- No credential use, validation, replay, provider login, API probing, callback replay, or synthetic request.
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

## De-Duplication Boundary

Do not count these as new coverage:

- `Dashboard-v2/src/routes/tracker/+page.svelte` was covered in Run 021 and used as supporting evidence in Runs 023-026.
- `Dashboard-v2/src/lib/db.ts` was covered in earlier tracker/data runs; use only as supporting evidence.
- `TasksView.svelte`, `ClientTaskPicker.svelte`, `StopModal.svelte`, and `PlanWeekView.svelte` were covered elsewhere; do not recount them.
- Tracker backend start/stop/log/admin functions and prior SQL migration shards are supporting evidence only unless C-137 later reopens them.

Only `Dashboard-v2/src/lib/components/tracker/AnalyticsView.svelte` counts as new target coverage in Run 027.

## Assigned Current-Tree File

Inspect this file directly and completely:

1. `Dashboard-v2/src/lib/components/tracker/AnalyticsView.svelte`

C-137 preflight line/word counts:

| Path | Lines | Words |
| --- | ---: | ---: |
| `Dashboard-v2/src/lib/components/tracker/AnalyticsView.svelte` | 834 | 2970 |

Read every line of the assigned file. Do not mark it covered from search hits, summaries, or partial reads.

## Required Supporting Evidence

Perform bounded supporting reads/searches for:

- `Dashboard-v2/src/routes/tracker/+page.svelte:47` and `:594-598` import/mount evidence for `AnalyticsView`.
- `Dashboard-v2/src/lib/db.ts` only for Supabase helper behavior and known `time_entries` helper patterns.
- `git grep` for `rate_chf_per_hour`, `amount_chf`, `hourly_rate`, `client_tasks`, `time_entries`, `entry_type`, `is_billable`, `user_id`, `AnalyticsView`, and `user.isAdmin`.
- Tracked SQL/migration evidence for `time_entries`, `client_tasks`, grants, RLS, policies, views, or RPCs.
- Prior run findings may be cited only as context; repo evidence must still anchor each Run 027 claim.

Supporting evidence can be cited, but do not count it as assigned target coverage unless it is `AnalyticsView.svelte`.

## Required Output Rows

For the assigned file:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
```

For data reads:

```text
ANALYTICS_DATA_MAP source="<assigned file:line>" table_or_source="<time_entries|client_tasks|other>" operation="<select|join|derive|display>" fields="<fields>" scope_filter="<user_id|scope|date|none>" auth_or_permission="<user.isAdmin|hasClient|RLS|unknown>" status="<covered|reportable|suppressed|deferred|positive>"
```

For financial/privacy behavior:

```text
FINANCIAL_SCOPE_MAP source="<assigned file:line>" data="<rate|amount|turnover|billable hours|category|team scope>" viewer="<CTI/admin|FK/non-admin|all users|unknown>" control="<UI hide|query filter|RLS|none|unknown>" status="<covered|reportable|suppressed|deferred|positive>"
```

For route/navigation/LLM ergonomics:

```text
NAVIGATIONABILITY_MAP surface="<file/component>" issue="<good anchor|hidden dependency|comment drift|permission drift|monolithic|unknown>" evidence="<repo evidence>" llm_impact="<how this affects repo navigation/auditability>" status="<covered|reportable|positive|deferred>"
```

For findings:

```text
FINDING id=R027-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|privacy|data-integrity|availability|wiring|navigation|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
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
BATCH_CLOSE lane=opus batch=R027 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Seeded Checks

Do not miss:

- Does `AnalyticsView.svelte` select `rate_chf_per_hour` and `amount_chf` for all users before hiding CHF UI from non-admins?
- Does `scope === "team"` remove the `user_id` filter, and is that control gated only by `user.isAdmin`?
- Is `user.isAdmin` the same concept as CTI in this repo, or is the comment "CTI sees CHF" drifting from actual permission/RBAC evidence?
- Does the query limit of `5000` create truncation, false financial reporting, or quiet undercount risk?
- Does `client_tasks` category lookup expose task/category metadata beyond the viewer's expected scope?
- Does the component rely entirely on browser Supabase RLS for team analytics privacy?
- Does the file's structure make the analytics flow easy for an LLM/operator to navigate, or does it hide key financial semantics in derived functions?

## False-Positive Guards

- Direct browser Supabase SELECT is not a vulnerability by itself. Final security depends on RLS and table grants; use `deferred` when the repo lacks policy proof.
- UI hiding of CHF is still data-minimization-relevant if the browser fetches rate/amount fields for non-admins, but distinguish "fetched into browser" from "displayed in DOM".
- Do not report team analytics as confirmed cross-user exposure unless repo evidence proves non-admins can set `scope="team"` or RLS permits it. Otherwise mark RLS/policy proof as deferred.
- Do not re-report `TasksView.svelte` hourly-rate selection except as prior context; Run 027 is about `AnalyticsView.svelte`.
- Preserve strengths: clear header permission notes, explicit `scope === "me"` filter, CTI-only team toggle, and no direct mutations if verified.

## C-137 Current Coverage State

Before Run 027:

- accepted assigned target coverage: `321 / 1505`
- strict semantic coverage: `319 covered + 2 partial`
- partial files: `Scripts/telegram-mcp/package-lock.json`, `Scripts/team-bots/package-lock.json`
