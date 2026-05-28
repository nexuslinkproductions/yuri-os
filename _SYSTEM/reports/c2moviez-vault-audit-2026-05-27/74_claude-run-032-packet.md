# Claude Run 032 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: persistent Claude/tmux lane, Opus, read-only

## Mission

Execute one bounded read-only target-repo shard:

`R032_NEXOGRAM_ROUTE_ARCHITECTURE_OPUS / NEXOGRAM-ROUTE-ARCHITECTURE-032`

This shard closes the main Nexogram route as a messaging/file/context surface. Treat it as a security, privacy, wiring, and LLM-navigationability audit, not a UI browse.

## Non-Negotiable Rules

- Read-only only.
- No writes to Claudio's target repository.
- No writes to YURI report files from the worker lane.
- No target execution, dependency installs, service starts, SQL execution, or live service calls.
- No credential use, validation, replay, provider login, API probing, callback replay, or synthetic request.
- Use only repository evidence from `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`.
- Do not read YURI protected runtime paths.
- Do not browse `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `.env`, `node_modules`, `.amp`, or `backend/data`.
- C-137 writes durable report files after validation.

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

| Path | Lines | Words |
| --- | ---: | ---: |
| `Dashboard-v2/src/routes/nexogram/+page.svelte` | 4249 | 14511 |

Do not count supporting files as new coverage.

## Required Supporting Evidence

Use bounded supporting reads/searches for:

- endpoint strings, `postAuthed`, `getAuthed`, `fetch`, Supabase, Pusher/realtime, file upload/download, channel/message IDs, context calls, localStorage/sessionStorage, clipboard, attachment, and typing indicators;
- matching `Dashboard-v2/functions/*` handlers for discovered endpoints;
- `Dashboard-v2/server/index.js`, `Dashboard-v2/server/Caddyfile.template`, and `Dashboard-v2/src/routes/api/**` only for route mapping;
- `$lib/db.ts` auth helpers only when the file calls them;
- relevant schema/migration evidence only when the route reads or writes a table directly.

## Output Requirements

Emit rows:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" chunks="<line ranges read>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
NEXOGRAM_ACTION_MAP source="<file:line>" action="<select|insert|update|delete|fetch|upload|download|realtime|localStorage|clipboard|navigate|other>" target="<endpoint|table|store|route|browser API|external|none>" control="<user.can|isAdmin|hasClient|backend|none|unknown>" status="<covered|reportable|suppressed|deferred|positive>"
NEXOGRAM_WIRING_MAP source="<file:line>" endpoint_or_dependency="<endpoint|store|table|route|function|browser API>" backend_or_handler="<path:line|missing|not_applicable>" route_mapping="<mapped|missing|deployment-dependent|not_applicable>" status="<covered|reportable|deferred|positive>"
NAVIGATIONABILITY_MAP surface="<file/component>" issue="<good anchor|hidden dependency|comment drift|permission drift|monolithic|unknown>" evidence="<repo evidence>" llm_impact="<impact>" status="<covered|reportable|positive|deferred>"
FINDING id=R032-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|privacy|data-integrity|availability|wiring|navigation|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
SUPPRESSION path="<path>" hypothesis="<risk considered>" counterevidence="<exact counterevidence>"
DEFERRED path="<path-or-surface>" reason="<exact blocker>" next="<next read-only evidence source>"
BATCH_CLOSE lane=opus batch=R032 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Seeded Checks

- Does Nexogram expose messages/files/channel data without clear role or member authorization?
- Do file download/upload calls have backend handlers and route mapping?
- Are message send/edit/delete/typing operations wired to real handlers?
- Does context/Nexita retrieval cross trust boundaries or leak private context?
- Does the route rely on browser-local state as truth?
- Is the 4249-line route navigable enough for LLM maintenance, or does it need splitting?

## Current Coverage State

Before Run 032:

- accepted assigned target coverage: `340 / 1505`
- strict semantic coverage: `338 covered + 2 partial`
