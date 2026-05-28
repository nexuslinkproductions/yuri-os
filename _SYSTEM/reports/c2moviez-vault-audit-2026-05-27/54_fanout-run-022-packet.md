# Fanout Run 022 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: single persistent Claude/tmux lane, active cap `1`
Required model lane: Opus worker in the existing persistent session after `/clear`

## Mission

Execute one bounded read-only target-repo shard:

`R022_TRACKER_ABSENCE_TIMEEDIT_WHISPER_OPUS / TRACKER-ABSENCE-TIMEEDIT-WHISPER-022`

This shard closes uncovered backend function siblings surfaced by Run 021 without double-counting files already covered by Runs 006, 009, 014, 018, or 019.

Primary questions:

- Do absence, time-edit, ticket-create, and transcription functions enforce their own method/auth/resource controls?
- Which functions bind actor identity to the authenticated caller, and which delegate authorization to missing SQL/RPCs?
- Which functions use service-role credentials, app/provider API keys, Telegram, Plane, OpenAI, or filesystem-like downstream sinks?
- Are these functions mapped by the tracked API server, or only deployment-dependent through untracked/generic Netlify layout?
- Which missing SQL/RPC/table definitions block final security confidence?

## Non-Negotiable Rules

- Read-only only.
- No writes to Claudio's target repository.
- No writes to YURI report files from the worker lane.
- No target execution, no dependency installs, no service starts.
- No live service calls to Plane, Microsoft, Outlook, Supabase, Telegram, Whisper, OpenAI, Claude, MCP servers, Caddy, Infomaniak, or any provider.
- No credential use, validation, replay, provider login, API probing, or synthetic request.
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

Do not count these as new coverage; they already have accepted semantic coverage:

- `Dashboard-v2/functions/tracker-log.js` and `Dashboard-v2/functions/tracker-block.js` in Runs 006/019.
- `Dashboard-v2/functions/tracker-plan-submit.js` in Run 006.
- `Dashboard-v2/functions/tracker-admin-update-entry.js`, `tracker-admin-delete-entry.js`, `tracker-admin-set-rate.js`, and `tracker-admin-set-fte.js` in Run 019.
- `Dashboard-v2/functions/tracker-admin-set-working-hours.js` and `tracker-m365-mirror.js` in Run 018.
- `Dashboard-v2/functions/analyze-meeting.js` and `push-meeting-to-obsidian.js` in Run 009.
- `Dashboard-v2/functions/mcp-server.js` in Runs 011/014.

You may cite these only as supporting prior-context concepts if needed, but do not read them as assigned files and do not claim new coverage for them.

## Assigned Current-Tree Files

Inspect these files directly and completely:

1. `Dashboard-v2/functions/tracker-absence-decide.js`
2. `Dashboard-v2/functions/tracker-absence-request.js`
3. `Dashboard-v2/functions/tracker-time-edit-request.js`
4. `Dashboard-v2/functions/tracker-time-edit-decide.js`
5. `Dashboard-v2/functions/tracker-ticket-create.js`
6. `Dashboard-v2/functions/transcribe.js`
7. `Dashboard-v2/functions/whisper-transcribe.js`

C-137 preflight line/word counts:

| Path | Lines | Words |
| --- | ---: | ---: |
| `Dashboard-v2/functions/tracker-absence-decide.js` | 87 | 461 |
| `Dashboard-v2/functions/tracker-absence-request.js` | 120 | 626 |
| `Dashboard-v2/functions/tracker-time-edit-request.js` | 164 | 776 |
| `Dashboard-v2/functions/tracker-time-edit-decide.js` | 92 | 513 |
| `Dashboard-v2/functions/tracker-ticket-create.js` | 251 | 1238 |
| `Dashboard-v2/functions/transcribe.js` | 93 | 353 |
| `Dashboard-v2/functions/whisper-transcribe.js` | 119 | 504 |

Read every line of every assigned file. Do not mark a file covered from search hits, summaries, or partial reads.

## Required Supporting Evidence

Perform bounded supporting reads/searches for:

- `Dashboard-v2/server/index.js` route mappings for the assigned functions.
- `Dashboard-v2/server/Caddyfile.template` only for route prefix proof.
- `Dashboard-v2/production-server.js` only for generic loader evidence.
- `Dashboard-v2/functions/shared.js` only for shared response/CORS/Anthropic helper context if imported.
- `git grep` or `git ls-files` checks for SQL/RPC/table definitions referenced by assigned files:
  - absence tables/RPCs;
  - time edit request/decision tables/RPCs;
  - tracker ticket/create RPC or Plane sink dependencies;
  - transcription function references and UI callers.

Supporting evidence can be cited, but do not count it as assigned target coverage unless it is one of the assigned files.

## Required Output Rows

For every assigned existing file:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
```

For every assigned handler:

```text
HANDLER_SECURITY_MAP path="<file>" method_gate="<yes|no>" auth_gate="<checkAuth|verifyBearer|custom|none>" actor_binding="<caller_id|body_user|none|unknown>" service_role_use="<yes|no>" downstream="<rpc/table/provider/telegram/plane/openai>" status="<covered|reportable|suppressed|deferred>"
```

For route/deployment truth:

```text
ROUTE_MAPPING_MAP endpoint="<function-name>" tracked_function_file="<path>" server_index_mapped="<yes|no>" generic_loader_possible="<yes|no|deployment-dependent>" frontend_or_cron_caller="<path:line|unknown>" status="<covered|reportable|deferred>"
```

For database/RPC dependency truth:

```text
DB_RPC_DEPENDENCY_MAP path="<file>" symbol="<table-or-rpc>" searched_with="<git grep/git ls-files>" tracked_definition="<path:line|missing>" role="<authz|write|read|audit|idempotency>" status="<covered|missing|deferred|suppressed>"
```

For provider/cost/resource controls:

```text
PROVIDER_RESOURCE_MAP path="<file>" provider="<OpenAI|Plane|Telegram|Supabase|other>" sink="<short>" auth_source="<env|request|none>" size_limit="<observed|missing>" timeout="<observed|missing>" rate_limit="<observed|missing>" status="<covered|reportable|deferred|positive>"
```

For findings:

```text
FINDING id=R022-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|privacy|data-integrity|availability|wiring|navigation|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
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
BATCH_CLOSE lane=opus batch=R022 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Seeded Checks

Do not miss:

- Whether each assigned function is mapped by `Dashboard-v2/server/index.js`.
- Whether each assigned function relies on `Dashboard-v2/netlify/functions` runtime layout.
- Whether the function has method gates and OPTIONS handling.
- Whether auth is cookie/bearer based, custom, internal-only, or absent.
- Whether any function accepts `target_user`, `actor`, `entry_id`, `request_id`, `client_code`, `ticket_id`, `audio`, or file/blob values from request body without validation.
- Whether OpenAI/transcription paths have file size limits, mime checks, timeout, and rate/cost controls in repo code.
- Whether Plane or Telegram side effects are reachable from authenticated user endpoints without backend role checks.
- Whether missing SQL/RPC definitions prevent final confidence.

## False-Positive Guards

- Do not report a vulnerability only because a service-role key is used. Prove entrypoint, closest control, body-controlled data, downstream sink, and impact.
- Do not treat missing `server/index.js` mapping as confirmed production 404. Use tracked-repo wording: "not mapped by tracked API server" and "deployment-dependent" where generic/live layout may differ.
- Do not treat frontend permission checks as backend authorization.
- Do not claim RLS/RPC safety unless the exact tracked SQL/RPC definition is found.
- Do not use or reveal any secret value. Environment variable names are fine; secret values are not.
- Preserve positive controls such as method gates, bearer verification, actor binding to authenticated caller, allowlists, input validation, timeouts, and size caps.

## C-137 Current Coverage State

Before Run 022:

- accepted assigned target coverage: `306 / 1505`
- strict semantic coverage: `304 covered + 2 partial`
- partial files: `Scripts/telegram-mcp/package-lock.json`, `Scripts/team-bots/package-lock.json`
