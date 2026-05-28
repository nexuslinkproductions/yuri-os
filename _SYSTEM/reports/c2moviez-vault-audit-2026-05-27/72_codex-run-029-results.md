# Codex Run 029 Results - Tracker Calendar View

Date: 2026-05-27
Lane: `R029_TRACKER_CALENDAR_VIEW_GPT55_XHIGH / TRACKER-CALENDAR-VIEW-029`
Worker: Codex CLI, `gpt-5.5`, `model_reasoning_effort=xhigh`, read-only sandbox
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Status: accepted

## Clone Proof

```text
CLONE_PROOF commit=8103286e1abc63fa9490cb1375ecde4f340aa2bb status_count=0 tracked_files=1505
```

## File Coverage

```text
FILE_COVERAGE path="Dashboard-v2/src/lib/components/tracker/CalendarView.svelte" method=full_read status=covered lines=673 words=2879 notes="calendar planning, schedule-list, tracker-block, scheduled_blocks/time_entries reads"
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R029 files_covered=1 findings=3 suppressions=3 deferred=2 invalidated=0
```

## Accepted Findings

### R029-F01 - `schedule-list` Returns All Team Calendars To Any Authenticated Caller

Severity: high
Class: privacy

Evidence:

- `CalendarView.svelte:139-143` computes a `memberKey` and passes it as `member=...` to `/api/functions/schedule-list`.
- `schedule-list.js:117-118` only checks generic auth through `checkAuth(event)`.
- `schedule-list.js:139-152` ignores the requested member and returns event arrays for `CTI`, `FK`, `SW`, and `MS`.
- `schedule-list.js:96-108` includes event `subject`, `start`, `end`, `isAllDay`, `categories`, and `bodyPreview` slice.

Impact:

Any authenticated user who can reach this endpoint may receive other team members' calendar metadata and message previews, even when the UI later selects only one member key.

Recommendation:

Authorize the requested member server-side. Return only the caller's permitted mailbox data, and remove `bodyPreview` unless a privileged view explicitly needs it.

### R029-F02 - CalendarView Uses `/api/functions/*` Against A Tracked `.netlify/functions/*` Deployment Dialect

Severity: medium
Class: wiring / availability

Evidence:

- `CalendarView.svelte:143`, `CalendarView.svelte:242`, `CalendarView.svelte:276`, and `CalendarView.svelte:300` call `/api/functions/schedule-list` and `/api/functions/tracker-block`.
- `server/Caddyfile.template:14-16` proxies only `/.netlify/functions/*`.
- `server/index.js:77-78` mounts `/.netlify/functions/calendar-schedule-event` and `/.netlify/functions/schedule-list`, not `/api/functions/*`.
- `git ls-files` finds no `Dashboard-v2/src/routes/api/**` route tree.

Impact:

Calendar event fetch and planned-block add/update/delete can 404 under the tracked deployment evidence.

Recommendation:

Add a tracked `/api/functions/*` proxy/rewrite or change frontend callers to the deployed function path consistently.

### R029-F03 - Scheduled Block Identity Contract Is Split Between `user_id` And `assignee_code`

Severity: high
Class: data-integrity

Evidence:

- `CalendarView.svelte:78-80` drops realtime block rows where `row.user_id !== memberId`.
- `CalendarView.svelte:120-124` queries `scheduled_blocks.eq("user_id", memberId)`.
- `CalendarView.svelte:250-251` sends `assignee_user_id: memberId` when adding a block.
- `tracker-block.js:77-87` forwards only `p_assignee_code: body.assignee_code || null`.
- `001_scheduled_blocks.sql:4-18` defines `assignee_code` but no `user_id`.
- Later tracked migration search does not add a `scheduled_blocks.user_id` column.

Impact:

Planned blocks can fail to load, realtime updates can be dropped, and CEO/member planning can be assigned to the wrong user or no user depending on the unseen RPC implementation.

Recommendation:

Choose one identity contract. Either add/verify `user_id` through tracked schema/RPCs or switch CalendarView/backend to `assignee_code` consistently.

## Strengths And Suppressions

```text
SUPPRESSION path="CalendarView.svelte" hypothesis="calendar planning state is browser-local" counterevidence="CalendarView does not use localStorage; block changes go through tracker-block"
SUPPRESSION path="CalendarView.svelte" hypothesis="CalendarView calls focus-data/calendar-events/focus-mark-done" counterevidence="those strings occur in PlanWeekView/focus, while CalendarView uses schedule-list and tracker-block"
SUPPRESSION path="tracker/+page.svelte:238-261" hypothesis="CalendarView mounts before user.init" counterevidence="tracker page awaits user.init and sets mounted before rendering the view branch"
```

## Deferred Follow-Ups

```text
DEFERRED path="Dashboard-v2/functions/tracker-block.js" reason="tracker_block_add/tracker_block_resize/tracker_block_delete RPC definitions are not tracked" next="obtain tracked/live database RPC DDL read-only"
DEFERRED path="time_entries schema/RLS" reason="CalendarView reads time_entries but tracked SQL source for time_entries was not available" next="obtain tracked/live table DDL and RLS policy evidence"
```

## Coverage Update

Before Run 029:

- accepted assigned target coverage: `338 / 1505`
- strict semantic coverage: `336 covered + 2 partial`

After Run 029:

- accepted assigned target coverage: `339 / 1505`
- strict semantic coverage: `337 covered + 2 partial`
