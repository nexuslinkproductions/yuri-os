# Fanout Run 025 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: single persistent Claude/tmux lane, active cap `1`
Required model lane: Opus worker in the existing persistent session after `/clear`

## Mission

Execute one bounded read-only target-repo shard:

`R025_TRACKER_TASKS_VIEW_CLIENT_TASKS_CRUD_OPUS / TRACKER-TASKS-VIEW-CLIENT-TASKS-CRUD-025`

This shard follows Run 024's RLS-deferred `client_tasks` concern:

- `ClientTaskPicker.svelte` can insert `client_tasks` directly from the browser;
- `TasksView.svelte` appears to be the fuller UI for `client_tasks` CRUD;
- this shard must determine whether the task management UI is truly admin-only, permission-gated, RLS-dependent, or inconsistent with its own comments.

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

- `ClientTaskPicker.svelte` was covered in Run 024.
- `tracker/+page.svelte` was covered in Run 021 and used as supporting evidence in Runs 023-024.
- `tracker.svelte.ts`, tracker start/stop backend functions, and route-mapping findings were already covered in Runs 019 and 024.
- `AnalyticsView.svelte` is not assigned in this shard; read only if a narrow supporting search is necessary.

You may cite supporting evidence, but only `TasksView.svelte` counts as new target coverage in Run 025.

## Assigned Current-Tree File

Inspect this file directly and completely:

1. `Dashboard-v2/src/lib/components/tracker/TasksView.svelte`

C-137 preflight line/word counts:

| Path | Lines | Words |
| --- | ---: | ---: |
| `Dashboard-v2/src/lib/components/tracker/TasksView.svelte` | 717 | 2521 |

Read every line of the assigned file. Do not mark it covered from search hits, summaries, or partial reads.

## Required Supporting Evidence

Perform bounded supporting reads/searches for:

- `Dashboard-v2/src/routes/tracker/+page.svelte` import/mount ranges for `TasksView`.
- `git grep` for `client_tasks`, `user.isAdmin`, `user.can`, `hasClient`, `.insert(`, `.update(`, `.delete(`, `.from("client_tasks")`, and `.from('client_tasks')` across `TasksView.svelte`, `ClientTaskPicker.svelte`, `AnalyticsView.svelte`, `Dashboard-v2/db-migrations`, and `Scripts/migrations`.
- Any tracked SQL/migration evidence that defines `client_tasks` table, grants, RLS policies, or `created_by` constraints.

Supporting evidence can be cited, but do not count it as assigned target coverage unless it is `TasksView.svelte`.

## Required Output Rows

For the assigned file:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
```

For every `client_tasks` action:

```text
CLIENT_TASKS_ACTION_MAP source="<assigned file:line>" action="<select|insert|update|delete|archive|restore|other>" fields="<fields>" auth_or_permission="<user.isAdmin|user.can|hasClient|none|unknown>" rls_dependency="<yes|no|unknown>" status="<covered|reportable|suppressed|deferred|positive>"
```

For route/nav wiring:

```text
NAVIGATIONABILITY_MAP surface="<file/component>" issue="<good anchor|hidden dependency|comment drift|permission drift|monolithic|unknown>" evidence="<repo evidence>" llm_impact="<how this affects repo navigation/auditability>" status="<covered|reportable|positive|deferred>"
```

For findings:

```text
FINDING id=R025-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|privacy|data-integrity|availability|wiring|navigation|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
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
BATCH_CLOSE lane=opus batch=R025 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Seeded Checks

Do not miss:

- Does `TasksView.svelte` enforce its comment claim that admin/CTI get full CRUD while FK/others only see shared tasks?
- Are create, update, archive, restore, or delete actions gated by `user.isAdmin`, `user.can(...)`, or only by UI state/config?
- Does `TasksView.svelte` use direct browser Supabase writes to `client_tasks`?
- Is `created_by` supplied from `user.id`, spoofable, omitted, or enforced elsewhere?
- Does the component have explicit input validation for task title, client code, billable status, category, rate, colors, and sort order?
- Does tracked repo evidence include `client_tasks` RLS policies, table definitions, grants, or migration source? If absent, mark RLS as deferred rather than inventing safety.
- Does the file improve or harm LLM navigation relative to the prior tracker components?

## False-Positive Guards

- Do not report direct browser Supabase usage as a confirmed vulnerability unless exact missing controls plus plausible impact are proven.
- If `user.isAdmin` gates admin controls, preserve that as a UI strength, but do not treat it as the final database boundary.
- If RLS evidence is absent, use `deferred`, not a definitive bypass claim.
- Do not re-report Run 024 `ClientTaskPicker` findings except where `TasksView.svelte` independently confirms the same pattern.
- Preserve positives: clear CRUD separation, validation, admin-only UI gating, typed local state, explicit archive behavior.

## C-137 Current Coverage State

Before Run 025:

- accepted assigned target coverage: `319 / 1505`
- strict semantic coverage: `317 covered + 2 partial`
- partial files: `Scripts/telegram-mcp/package-lock.json`, `Scripts/team-bots/package-lock.json`

