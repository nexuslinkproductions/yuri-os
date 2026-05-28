# Fanout Run 023 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: single persistent Claude/tmux lane, active cap `1`
Required model lane: Opus worker in the existing persistent session after `/clear`

## Mission

Execute one bounded read-only target-repo shard:

`R023_TRACKER_TELEGRAM_CALLBACK_UI_NAV_OPUS / TRACKER-TELEGRAM-CALLBACK-UI-NAV-023`

This shard closes the user-facing and Telegram-routing side of the Run 022 findings:

- absence/time-edit approval buttons emit Telegram callback strings but no handler was found;
- tracker ticket creation has a comparatively strong backend permission gate, but its frontend project/customer flow needs direct UI inspection;
- time-edit UI should be traced from visible team view to modal to backend function;
- the shard must keep de-duplication strict: `telegram.js`, `shared-telegram.js`, `TimeEditRequestModal.svelte`, `admin/tracker/+page.svelte`, and `tracker/+page.svelte` already have accepted semantic coverage and are supporting evidence only unless C-137 later reopens them.

## Non-Negotiable Rules

- Read-only only.
- No writes to Claudio's target repository.
- No writes to YURI report files from the worker lane.
- No target execution, no dependency installs, no service starts.
- No live service calls to Telegram, Plane, Supabase, OpenAI, Microsoft, Caddy, Infomaniak, or any provider.
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

- `Dashboard-v2/functions/telegram.js` was covered in Runs 007 and 015.
- `Dashboard-v2/functions/shared-telegram.js` was covered in Runs 007 and 016.
- `Dashboard-v2/src/lib/components/tracker/TimeEditRequestModal.svelte` was covered in Run 021.
- `Dashboard-v2/src/routes/admin/tracker/+page.svelte` was covered in Run 021.
- `Dashboard-v2/src/routes/tracker/+page.svelte` was covered in Run 021.
- `Dashboard-v2/functions/tracker-ticket-create.js`, `tracker-absence-request.js`, `tracker-time-edit-request.js`, and `tracker-time-edit-decide.js` were covered in Run 022.

You must still inspect bounded supporting ranges/searches in those files when needed to prove callback and UI wiring, but do not claim new file coverage for them.

## Assigned Current-Tree Files

Inspect these files directly and completely:

1. `Dashboard-v2/src/lib/components/tracker/TicketCreateDialog.svelte`
2. `Dashboard-v2/src/lib/components/tracker/ClientTicketPicker.svelte`
3. `Dashboard-v2/src/lib/components/tracker/TeamTimeView.svelte`

C-137 preflight line/word counts:

| Path | Lines | Words |
| --- | ---: | ---: |
| `Dashboard-v2/src/lib/components/tracker/TicketCreateDialog.svelte` | 417 | 1306 |
| `Dashboard-v2/src/lib/components/tracker/ClientTicketPicker.svelte` | 635 | 2623 |
| `Dashboard-v2/src/lib/components/tracker/TeamTimeView.svelte` | 379 | 1499 |

Read every line of every assigned file. Do not mark a file covered from search hits, summaries, or partial reads.

## Required Supporting Evidence

Perform bounded supporting reads/searches for:

- `Dashboard-v2/functions/telegram.js` callback dispatch range around `callback_query`, `cbData`, and final fallback to `handleCommand`.
- `git grep` for callback strings:
  - `tabs_approve`
  - `tabs_reject`
  - `tte_approve`
  - `tte_reject`
  - `tplan_approve`
  - `tplan_reject`
- `Dashboard-v2/functions/shared-telegram.js:86-98` only if needed to prove `sendWithButtons` behavior.
- `Dashboard-v2/functions/tracker-absence-request.js:98-110` and `tracker-time-edit-request.js:138-150` only as emit-site anchors.
- `Dashboard-v2/functions/tracker-ticket-create.js:125-172` only as backend permission/project-scope anchor.
- `Dashboard-v2/src/routes/tracker/+page.svelte:930-960` and `Dashboard-v2/src/lib/components/tracker/TimeEditRequestModal.svelte:88-145` only as caller anchors if needed.

Supporting evidence can be cited, but do not count it as assigned target coverage unless it is one of the three assigned files.

## Required Output Rows

For every assigned existing file:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
```

For UI route/action wiring:

```text
UI_ACTION_MAP source="<assigned file:line>" action="<short>" target_component_or_endpoint="<path|endpoint>" auth_or_permission="<frontend gate|backend gate|unknown>" validation="<observed>" status="<covered|reportable|suppressed|deferred|positive>"
```

For Telegram callback routing:

```text
CALLBACK_ROUTING_MAP callback_prefix="<prefix>" emit_site="<path:line|missing>" handler_site="<path:line|missing>" fallback="<handleCommand|none|unknown>" effect="<short>" status="<covered|reportable|suppressed|deferred>"
```

For endpoint/function reachability:

```text
API_CALL_MAP source="<assigned file:line>" endpoint="<literal endpoint>" method="<POST|GET|unknown>" auth_method="<postAuthed|getAuthed|raw_fetch|supabase|unknown>" backend_file="<path|missing>" server_index_mapped="<yes|no>" status="<covered|reportable|deferred|positive>"
```

For navigation/LLM ergonomics:

```text
NAVIGATIONABILITY_MAP surface="<file/component>" issue="<good anchor|hidden dependency|missing route|dead callback|monolithic|validation drift|unknown>" evidence="<repo evidence>" llm_impact="<how this affects repo navigation/auditability>" status="<covered|reportable|positive|deferred>"
```

For findings:

```text
FINDING id=R023-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|privacy|data-integrity|availability|wiring|navigation|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
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
BATCH_CLOSE lane=opus batch=R023 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Seeded Checks

Do not miss:

- Does `telegram.js` handle `tabs_approve`, `tabs_reject`, `tte_approve`, or `tte_reject`?
- Does unknown callback data fall into `handleCommand(chatId, cbData)`?
- Is that fallback the same failure class previously found for `tplan_approve`/`tplan_reject`?
- Does `TicketCreateDialog.svelte` constrain `project_code`, `project_id`, dates, estimated hours, priority, assignee, customer, modules, or description before calling `tracker-ticket-create`?
- Does `TicketCreateDialog.svelte` use `postAuthed` and preserve backend permission intent?
- Does `ClientTicketPicker.svelte` provide a sane client/project/ticket selection model, or does it hide backend assumptions from the LLM/human reader?
- Does `TeamTimeView.svelte` correctly gate time edit opening, or does it expose edit actions based only on frontend state?

## False-Positive Guards

- Do not report a finding just because a file is large. Tie navigation findings to concrete hidden dependencies, repeated state, or route-to-function ambiguity.
- Do not treat a missing Telegram callback handler as a security exploit. Classify it as wiring/availability unless it routes into a high-authority command path.
- Do not report `TicketCreateDialog` project choice as a backend bypass unless the UI sends a body field that broadens the backend's intended project scope.
- Preserve positives such as `postAuthed`, frontend validation, clear component boundaries, and backend permission alignment.

## C-137 Current Coverage State

Before Run 023:

- accepted assigned target coverage: `313 / 1505`
- strict semantic coverage: `311 covered + 2 partial`
- partial files: `Scripts/telegram-mcp/package-lock.json`, `Scripts/team-bots/package-lock.json`
