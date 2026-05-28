# Codex Run 034 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: Codex CLI, `gpt-5.5`, `model_reasoning_effort=xhigh`, read-only sandbox

## Mission

Execute one bounded read-only target-repo shard:

`R034_EXPENSES_ROUTE_GPT55_XHIGH / EXPENSES-ROUTE-034`

This shard closes the expenses route as a financial data, document-linking, mutation, and endpoint-wiring surface.

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

## Assigned Current-Tree File

Inspect this file directly and completely:

| Path | Lines | Words |
| --- | ---: | ---: |
| `Dashboard-v2/src/routes/expenses/+page.svelte` | 1568 | 4928 |

Do not count supporting files as new coverage.

## Required Supporting Evidence

Use bounded supporting reads/searches for expenses endpoints, nexdoc invoice linkage, financial fields, auth helpers, route mapping, direct Supabase/table access, file/document references, and matching function handlers.

## Output Requirements

Emit:

```text
CLONE_PROOF commit=<sha> status_count=<n> tracked_files=<n>
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" chunks="<line ranges read>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
EXPENSES_ACTION_MAP source="<file:line>" action="<list|create|update|delete|fetch|download|display|localStorage|navigate|other>" target="<endpoint|table|document|route|browser API|none>" control="<user.can|isAdmin|hasClient|backend|none|unknown>" status="<covered|reportable|suppressed|deferred|positive>"
EXPENSES_WIRING_MAP source="<file:line>" endpoint_or_dependency="<endpoint|store|table|route|function|browser API>" backend_or_handler="<path:line|missing|not_applicable>" route_mapping="<mapped|missing|deployment-dependent|not_applicable>" status="<covered|reportable|deferred|positive>"
NAVIGATIONABILITY_MAP surface="<file/component>" issue="<good anchor|hidden dependency|comment drift|permission drift|monolithic|unknown>" evidence="<repo evidence>" llm_impact="<impact>" status="<covered|reportable|positive|deferred>"
FINDING id=R034-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|privacy|data-integrity|availability|wiring|navigation|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
SUPPRESSION path="<path>" hypothesis="<risk considered>" counterevidence="<exact counterevidence>"
DEFERRED path="<path-or-surface>" reason="<exact blocker>" next="<next read-only evidence source>"
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R034 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Seeded Checks

- Do expense create/update operations enforce role/scope before financial mutation?
- Are financial fields fetched for users who should not see them?
- Are invoice/document references wired to real handlers?
- Does the same `/api/functions/*` route dialect issue appear?
- Are amounts/currencies/statuses computed in a durable, auditable way?

## Current Coverage State

Before Run 034:

- accepted assigned target coverage: `340 / 1505`
- strict semantic coverage: `338 covered + 2 partial`
