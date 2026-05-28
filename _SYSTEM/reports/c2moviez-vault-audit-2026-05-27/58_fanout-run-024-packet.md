# Fanout Run 024 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: single persistent Claude/tmux lane, active cap `1`
Required model lane: Opus worker in the existing persistent session after `/clear`

## Mission

Execute one bounded read-only target-repo shard:

`R024_TRACKER_START_STOP_TASK_PICKER_OPUS / TRACKER-START-STOP-TASK-PICKER-024`

This shard continues the tracker user-journey audit after Run 023:

- `StopwatchHero.svelte` decides whether the user enters start or stop flow;
- `ClientTaskPicker.svelte` supplies the start payload that eventually reaches `tracker.start`;
- `StopModal.svelte` supplies the stop payload and optional follow-up metadata after `tracker.stop`;
- supporting reads should trace the host page and tracker store enough to answer whether the component wiring is coherent, but do not recount previously covered files as new coverage.

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

- `Dashboard-v2/src/routes/tracker/+page.svelte` was covered in Run 021.
- `Dashboard-v2/functions/tracker-start.js`, `tracker-stop.js`, `tracker-tick.js`, `tracker-log.js`, and `tracker-block.js` were covered in Run 019.
- `Dashboard-v2/src/lib/components/tracker/ClientTicketPicker.svelte`, `TicketCreateDialog.svelte`, and `TeamTimeView.svelte` were covered in Run 023.
- `Dashboard-v2/src/lib/components/tracker/TimeEditRequestModal.svelte` was covered in Run 021.

You must still inspect bounded supporting ranges/searches in those files when needed to prove wiring, but do not claim new file coverage for them.

## Assigned Current-Tree Files

Inspect these files directly and completely:

1. `Dashboard-v2/src/lib/components/tracker/StopwatchHero.svelte`
2. `Dashboard-v2/src/lib/components/tracker/StopModal.svelte`
3. `Dashboard-v2/src/lib/components/tracker/ClientTaskPicker.svelte`

C-137 preflight line/word counts:

| Path | Lines | Words |
| --- | ---: | ---: |
| `Dashboard-v2/src/lib/components/tracker/StopwatchHero.svelte` | 185 | 589 |
| `Dashboard-v2/src/lib/components/tracker/StopModal.svelte` | 374 | 1073 |
| `Dashboard-v2/src/lib/components/tracker/ClientTaskPicker.svelte` | 589 | 2003 |

Read every line of every assigned file. Do not mark a file covered from search hits, summaries, or partial reads.

## Required Supporting Evidence

Perform bounded supporting reads/searches for:

- `Dashboard-v2/src/routes/tracker/+page.svelte` imports, `openPicker`, `handleTaskPick`, `handleStopRequest`, and component mount ranges around the three assigned components.
- `Dashboard-v2/src/lib/stores/tracker.svelte.ts:73-128` for `tracker.start` and `tracker.stop` endpoint calls and permission gates.
- `Dashboard-v2/functions/tracker-start.js`, `tracker-stop.js`, and `tracker-log.js` only if needed as backend caller anchors; do not recount them as new coverage.
- `git grep` for `client_task_id`, `is_billable`, `tracker.start`, `tracker.stop`, `tracker-log`, `tracker-start`, `tracker-stop`, and `m365_event_owner_email` in the tracker component/store/function cluster.

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
UI_ACTION_MAP source="<assigned file:line>" action="<short>" target_component_or_endpoint="<path|endpoint|callback>" auth_or_permission="<frontend gate|store gate|backend gate|unknown>" validation="<observed>" status="<covered|reportable|suppressed|deferred|positive>"
```

For store/backend reachability:

```text
STORE_API_MAP source="<assigned-or-supporting file:line>" store_method="<tracker.start|tracker.stop|unknown>" endpoint="<literal endpoint>" payload_fields="<fields>" permission_gate="<user.can|backend|unknown>" backend_file="<path|missing>" server_index_mapped="<yes|no|deployment-dependent>" status="<covered|reportable|deferred|positive>"
```

For navigation/LLM ergonomics:

```text
NAVIGATIONABILITY_MAP surface="<file/component>" issue="<good anchor|hidden dependency|missing route|validation drift|dead state|monolithic|unknown>" evidence="<repo evidence>" llm_impact="<how this affects repo navigation/auditability>" status="<covered|reportable|positive|deferred>"
```

For findings:

```text
FINDING id=R024-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|privacy|data-integrity|availability|wiring|navigation|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
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
BATCH_CLOSE lane=opus batch=R024 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Seeded Checks

Do not miss:

- Does `StopwatchHero.svelte` contain only presentation/callback logic, or does it hide state-changing work?
- Does the host route connect `StopwatchHero` to `ClientTaskPicker` and `StopModal` coherently?
- Does `ClientTaskPicker.svelte` send `client_task_id`, `client_code`, `project_code`, `is_billable`, and description fields consistently with `tracker.start` and backend function expectations?
- Does `StopModal.svelte` actually forward notes or optional ticket/task metadata to `tracker.stop`, or are there dead fields similar to Run 023's `assigneeCode` issue?
- Are start/stop UI controls gated only in frontend, or does `tracker.svelte.ts` also check `user.can("tracker.start")` and `user.can("tracker.stop")`?
- Do the assigned files introduce hidden dependencies that make this repo hard for an LLM to navigate, such as comments claiming a backend behavior the code does not prove?

## False-Positive Guards

- Do not report a finding just because a UI component delegates behavior to the host route or tracker store; delegation is normal if the target is explicit and coherent.
- Do not treat frontend permission checks as the final security boundary when backend/store gates exist; map the closest real control.
- Do not re-report the app-wide `/api/functions/*` route mismatch as a new unique finding unless the assigned files introduce a new endpoint or variant.
- Preserve positives such as presentation-only components, explicit callback props, store-level `user.can(...)` checks, and clear payload construction.

## C-137 Current Coverage State

Before Run 024:

- accepted assigned target coverage: `316 / 1505`
- strict semantic coverage: `314 covered + 2 partial`
- partial files: `Scripts/telegram-mcp/package-lock.json`, `Scripts/team-bots/package-lock.json`

