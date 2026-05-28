# Codex Run 030 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: Codex CLI, `gpt-5.5`, `model_reasoning_effort=xhigh`, read-only sandbox

## Mission

Execute one bounded read-only target-repo shard:

`R030_FOCUS_PAGE_ARCHITECTURE_GPT55_XHIGH / FOCUS-PAGE-ARCHITECTURE-030`

This shard closes the main `/focus` page that Run 026 implicated through shared `focus:*` localStorage and missing focus endpoints.

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
| `Dashboard-v2/src/routes/focus/+page.svelte` | 3063 |

Do not count supporting files as new coverage. Because this file is large, prove full inspection with chunked read evidence and explicit coverage closure.

## Required Supporting Evidence

Use bounded supporting reads/searches for:

- Endpoint strings, localStorage keys, Supabase calls, timers, stores, route links, and external-service references in `Dashboard-v2/src/routes/focus/+page.svelte`.
- `git grep` for `focus-data`, `focus-mark-done`, `calendar-events`, `focus:`, `localStorage`, `tracker.start`, `postAuthed`, `time_entries`, `planned_blocks`, `scheduled_blocks`, `fetch(`, and any endpoint names found in the file.
- `Dashboard-v2/src/lib/stores/user.svelte.ts` or tracker store only if role/timer behavior is referenced.
- `Dashboard-v2/server/index.js`, `Dashboard-v2/Caddyfile`, and function directories only for endpoint route mapping, not new coverage.

## Output Requirements

Emit rows:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" chunks="<line ranges read>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
FOCUS_ACTION_MAP source="<file:line>" action="<select|insert|update|delete|fetch|localStorage|timer|navigate|other>" target="<endpoint|table|store|localStorage|route|external|none>" control="<user.can|isAdmin|hasClient|backend|none|unknown>" status="<covered|reportable|suppressed|deferred|positive>"
FOCUS_WIRING_MAP source="<file:line>" endpoint_or_dependency="<endpoint|store|localStorage|route|table>" backend_or_handler="<path:line|missing|not_applicable>" route_mapping="<mapped|missing|deployment-dependent|not_applicable>" status="<covered|reportable|deferred|positive>"
NAVIGATIONABILITY_MAP surface="<file/component>" issue="<good anchor|hidden dependency|comment drift|permission drift|monolithic|unknown>" evidence="<repo evidence>" llm_impact="<impact>" status="<covered|reportable|positive|deferred>"
FINDING id=R030-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|privacy|data-integrity|availability|wiring|navigation|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
SUPPRESSION path="<path>" hypothesis="<risk considered>" counterevidence="<exact counterevidence>"
DEFERRED path="<path-or-surface>" reason="<exact blocker>" next="<next read-only evidence source>"
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R030 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Seeded Checks

- Does `/focus` call the same missing `focus-data`, `calendar-events`, or `focus-mark-done` endpoints as `PlanWeekView.svelte`?
- Does it share mutable `focus:*` localStorage state with tracker planning in a way that can corrupt truth?
- Does it represent durable backend state or only local browser state?
- Does it leak/team-scope tasks, clients, calendar items, or time entries?
- Is the page too monolithic for reliable LLM navigation, and are there misleading comments about backend sync?
- Does it use route aliases that are not mapped by tracked Caddy/server evidence?

## Current Coverage State

Before Run 030:

- accepted assigned target coverage: `322 / 1505`
- strict semantic coverage: `320 covered + 2 partial`
