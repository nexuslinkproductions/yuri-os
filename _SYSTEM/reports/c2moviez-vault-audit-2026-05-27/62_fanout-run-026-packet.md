# Fanout Run 026 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: single persistent Claude/tmux lane, active cap `1`
Required model lane: Opus worker in the existing persistent session after `/clear`

## Mission

Execute one bounded read-only target-repo shard:

`R026_TRACKER_PLAN_WEEK_VIEW_APPROVAL_WIRING_OPUS / TRACKER-PLAN-WEEK-VIEW-APPROVAL-WIRING-026`

This shard closes the weekly-planning UI side of already observed tracker plan risks:

- Run 006/007/023 found `tplan_approve` / `tplan_reject` callbacks are emitted but not handled by tracked `telegram.js`.
- Run 021 found `/tracker` references `tracker-plan-submit` through the app-wide `/api/functions/*` route mismatch.
- This shard inspects `PlanWeekView.svelte` line-by-line to determine how planned blocks are created, edited, submitted, and started, and whether UI comments, route wiring, and backend expectations match.

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

- `tracker/+page.svelte` was covered in Run 021 and used as supporting evidence in Runs 023-025.
- `tracker-plan-submit.js` was covered in Run 006; use only as supporting evidence.
- `telegram.js` callback dispatch was covered in Runs 007/015/023; use only as supporting evidence.
- `tracker-start.js` and tracker store were covered in Runs 019/024; use only as supporting evidence.
- `CalendarView.svelte`, `TasksView.svelte`, and `ClientTaskPicker.svelte` were covered elsewhere; do not recount them.

Only `PlanWeekView.svelte` counts as new target coverage in Run 026.

## Assigned Current-Tree File

Inspect this file directly and completely:

1. `Dashboard-v2/src/lib/components/tracker/PlanWeekView.svelte`

C-137 preflight line/word counts:

| Path | Lines | Words |
| --- | ---: | ---: |
| `Dashboard-v2/src/lib/components/tracker/PlanWeekView.svelte` | 1188 | 4571 |

Read every line of the assigned file. Do not mark it covered from search hits, summaries, or partial reads.

## Required Supporting Evidence

Perform bounded supporting reads/searches for:

- `Dashboard-v2/src/routes/tracker/+page.svelte` import/mount ranges for `PlanWeekView`.
- `Dashboard-v2/functions/tracker-plan-submit.js:95-112` for Telegram callback emit.
- `Dashboard-v2/functions/tracker-plan-decide.js` only if needed to verify endpoint request shape; do not count it as new coverage unless C-137 later reopens it.
- `Dashboard-v2/functions/telegram.js:2606-2802` callback dispatch fallback only as already-covered supporting evidence.
- `Dashboard-v2/src/lib/stores/tracker.svelte.ts:73-100` only if `PlanWeekView` starts timers directly.
- `git grep` for `planned_blocks`, `tracker-plan-submit`, `tracker-plan-decide`, `tplan_approve`, `tplan_reject`, `tracker.start`, `postAuthed`, `supabase().from("planned_blocks")`, and `from("planned_blocks")`.
- Tracked SQL/migration evidence for `planned_blocks` table, grants, RLS, or RPCs.

Supporting evidence can be cited, but do not count it as assigned target coverage unless it is `PlanWeekView.svelte`.

## Required Output Rows

For the assigned file:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
```

For weekly planning actions:

```text
PLAN_ACTION_MAP source="<assigned file:line>" action="<select|insert|update|delete|submit|start|approve|reject|other>" target="<supabase table|backend endpoint|store method|callback>" fields="<fields>" auth_or_permission="<user.can|user.isAdmin|hasClient|backend|unknown>" status="<covered|reportable|suppressed|deferred|positive>"
```

For callback/endpoint wiring:

```text
PLAN_WIRING_MAP source="<file:line>" endpoint_or_callback="<endpoint|callback>" backend_or_handler="<path:line|missing>" route_mapping="<mapped|missing|deployment-dependent>" status="<covered|reportable|deferred|positive>"
```

For navigation/LLM ergonomics:

```text
NAVIGATIONABILITY_MAP surface="<file/component>" issue="<good anchor|hidden dependency|comment drift|permission drift|monolithic|unknown>" evidence="<repo evidence>" llm_impact="<how this affects repo navigation/auditability>" status="<covered|reportable|positive|deferred>"
```

For findings:

```text
FINDING id=R026-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|privacy|data-integrity|availability|wiring|navigation|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
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
BATCH_CLOSE lane=opus batch=R026 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Seeded Checks

Do not miss:

- Does `PlanWeekView.svelte` write directly to `planned_blocks`, or only through backend endpoints/RPCs?
- Does it call `tracker-plan-submit`, and does that endpoint have known route-mapping/callback issues?
- Does it let users create/edit/delete/submit plans for other users, or is actor/user identity bound to the current user?
- Does it start timers through `tracker.start`, and does the payload preserve client/task/billable semantics?
- Does it use `week_start`, dates, hours, priority, client/task ids, or user ids in ways that can drift from backend expectations?
- Does tracked repo evidence include `planned_blocks` schema/RLS/RPC source?
- Does the file's structure help or harm LLM navigation?

## False-Positive Guards

- Do not report direct Supabase reads as a vulnerability unless sensitive fields or broken policy evidence is concrete.
- Do not re-report the known missing `tplan_*` Telegram handler as a new unique finding unless `PlanWeekView` adds UI evidence or flow impact.
- If `PlanWeekView` delegates correctly to `tracker.start`, preserve it as a strength.
- If schema/RLS evidence is absent, use `deferred`, not a definitive database bypass claim.
- Distinguish UI/UX gating from backend authorization.

## C-137 Current Coverage State

Before Run 026:

- accepted assigned target coverage: `320 / 1505`
- strict semantic coverage: `318 covered + 2 partial`
- partial files: `Scripts/telegram-mcp/package-lock.json`, `Scripts/team-bots/package-lock.json`

