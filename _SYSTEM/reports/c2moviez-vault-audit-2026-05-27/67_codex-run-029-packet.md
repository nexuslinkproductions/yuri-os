# Codex Run 029 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: Codex CLI, `gpt-5.5`, `model_reasoning_effort=xhigh`, read-only sandbox

## Mission

Execute one bounded read-only target-repo shard:

`R029_TRACKER_CALENDAR_VIEW_GPT55_XHIGH / TRACKER-CALENDAR-VIEW-029`

This shard closes the tracker calendar UI side of focus/calendar/time-entry navigation.

## Non-Negotiable Rules

- Read-only only.
- No writes to Claudio's target repository.
- No writes to YURI report files from the worker lane.
- No target execution, dependency installs, service starts, SQL execution, or live service calls.
- No credential use, validation, replay, provider login, API probing, callback replay, or synthetic request.
- Use only repository evidence from `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`.
- Do not read YURI protected runtime paths.
- Do not browse `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `.env`, `node_modules`, `.amp`, or `backend/data`.
- Final answer only; C-137 writes durable report files after validation.

## Required Clone Proof

Emit:

```text
CLONE_PROOF commit=<sha> status_count=<n> tracked_files=<n>
```

Expected:

- commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
- status count `0`
- tracked files `1505`

## Assigned Current-Tree File

Inspect this file directly and completely:

| Path | Lines |
| --- | ---: |
| `Dashboard-v2/src/lib/components/tracker/CalendarView.svelte` | 673 |

Do not count supporting files as new coverage.

## Required Supporting Evidence

Use bounded supporting reads/searches for:

- `Dashboard-v2/src/routes/tracker/+page.svelte` import/mount evidence for `CalendarView`.
- Any endpoint strings, store calls, localStorage keys, Supabase calls, event handlers, or route links referenced from `CalendarView.svelte`.
- `git grep` for `CalendarView`, `calendar-events`, `focus-data`, `focus-mark-done`, `tracker.start`, `time_entries`, `planned_blocks`, `scheduled_blocks`, and localStorage keys found in the file.
- Tracked SQL/migration evidence only if the file touches a table directly.

## Output Requirements

Emit rows:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
CALENDAR_ACTION_MAP source="<file:line>" action="<select|insert|update|delete|navigate|start|display|other>" target="<table|endpoint|store|localStorage|route|none>" control="<user.can|isAdmin|hasClient|backend|none|unknown>" status="<covered|reportable|suppressed|deferred|positive>"
CALENDAR_WIRING_MAP source="<file:line>" endpoint_or_dependency="<endpoint|store|localStorage|route|table>" backend_or_handler="<path:line|missing|not_applicable>" route_mapping="<mapped|missing|deployment-dependent|not_applicable>" status="<covered|reportable|deferred|positive>"
NAVIGATIONABILITY_MAP surface="<file/component>" issue="<good anchor|hidden dependency|comment drift|permission drift|monolithic|unknown>" evidence="<repo evidence>" llm_impact="<impact>" status="<covered|reportable|positive|deferred>"
FINDING id=R029-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|privacy|data-integrity|availability|wiring|navigation|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
SUPPRESSION path="<path>" hypothesis="<risk considered>" counterevidence="<exact counterevidence>"
DEFERRED path="<path-or-surface>" reason="<exact blocker>" next="<next read-only evidence source>"
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R029 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Seeded Checks

- Does `CalendarView.svelte` call missing/unmapped focus/calendar endpoints found in Run 026?
- Does it write planning state locally, directly to Supabase, or through backend endpoints?
- Does it allow cross-user/team calendar visibility or mutation?
- Does it duplicate route dialect issues (`/api/functions/*` vs `/.netlify/functions/*`)?
- Is the component navigable enough for an LLM to understand date/state flow?

## Current Coverage State

Before Run 029:

- accepted assigned target coverage: `322 / 1505`
- strict semantic coverage: `320 covered + 2 partial`
