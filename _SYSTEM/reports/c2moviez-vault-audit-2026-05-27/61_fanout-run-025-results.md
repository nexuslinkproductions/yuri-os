# Fanout Run 025 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no SQL execution, no target execution, no live service calls, no credential use
Worker mode: single persistent Claude/tmux lane, active cap `1`

## Acceptance Summary

Run 025 is accepted with C-137 corrections.

- `R025_TRACKER_TASKS_VIEW_CLIENT_TASKS_CRUD_OPUS / TRACKER-TASKS-VIEW-CLIENT-TASKS-CRUD-025`: worker closed with `files_covered=1 findings=7 suppressions=3 deferred=2 invalidated=0`.
- C-137 accepted the assigned target file as covered after verifying line/word count, `client_tasks` read/write calls, UI admin gates, route mount, missing `tasks-crud` endpoint evidence, `postAuthed` behavior, and absent tracked `client_tasks` SQL/RLS evidence against the local clone.

Accepted assigned target surfaces added by Run 025: `1`.

Accepted assigned target coverage total after Run 025: `320 / 1505` tracked files.

Strict semantic caveat carried forward: two lockfiles are currently `partial`: `Scripts/telegram-mcp/package-lock.json` from Run 008 and `Scripts/team-bots/package-lock.json` from Run 010. Full semantic coverage is `318 covered + 2 partial`.

Contamination check: passed. C-137 checked the Run 025 pipe log for protected Claude runtime reads, `Searched memories`, and invalidation markers. The only protected-path matches were the packet's own "do not browse" rules. No protected YURI runtime read was accepted.

Clone proof: C-137 verified the target clone at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, clean status count `0`, and `1505` tracked files.

Source pipe log:

- `/tmp/yuri-c2v-fanout-run-025/pipe/r025-single.pipe.log`

## C-137 Corrections

Lane output remains advisory until verified. C-137 corrected these points before acceptance:

- Kept `R025-F01` as high wiring/availability, not a proven security bypass: repo truth shows the UI calls a missing endpoint, so writes are likely dead unless the handler exists outside the tracked GitHub-obtainable source.
- Narrowed `R025-F02` to server-auth deferred: `postAuthed` sends cookies and optional bearer tokens but does not itself prove admin authorization. Because `/api/functions/tasks-crud` is absent, server-side enforcement cannot be verified or disproven.
- Preserved `R025-F04` as an actual data-minimization issue: the component selects `hourly_rate` for all users and hides it only in the template for non-admins. This is not final privacy impact without policy/user-scope evidence, but the browser-state exposure is real.
- Verified no tracked SQL/migration evidence for `client_tasks` table or policies with targeted `git grep` in SQL and migration paths.

## File Covered

| Path | Lines | Words | Notes |
| --- | ---: | ---: | --- |
| `Dashboard-v2/src/lib/components/tracker/TasksView.svelte` | 717 | 2521 | Task catalog view and admin CRUD UI for `client_tasks` |

Supporting evidence read, not counted as new coverage:

- `Dashboard-v2/src/routes/tracker/+page.svelte:46`, `:589-592`
- `Dashboard-v2/src/lib/db.ts:718-738`
- bounded `git grep` for `tasks-crud`, `tasks_crud`, `tasksCrud`, `client_tasks`, and `client_tasks` SQL/policy evidence

## Client Tasks Action Map

| Source | Action | Fields | Observed control | RLS dependency | Status |
| --- | --- | --- | --- | --- | --- |
| `TasksView.svelte:77-84` | select | `id, client_code, title, description, category, is_billable, hourly_rate, color, sort_order, archived_at, created_at` | `hasClient()` configuration check only | yes/unknown | covered, data-minimization issue |
| `TasksView.svelte:128-143` | create | `client_code, title, category, hourly_rate, is_billable` | UI path gated by `isAdmin`; write goes to missing `tasks-crud` endpoint through `postAuthed` | server/RLS unknown | reportable |
| `TasksView.svelte:169-180` | update | `client_code, title, category, hourly_rate, is_billable` | UI path gated by `isAdmin`; write goes to missing `tasks-crud` endpoint through `postAuthed` | server/RLS unknown | reportable |
| `TasksView.svelte:195-199` | archive | `id` | UI path gated by `isAdmin`; write goes to missing `tasks-crud` endpoint through `postAuthed` | server/RLS unknown | reportable |
| `TasksView.svelte:210-213` | restore | `id` | UI path gated by `isAdmin`; write goes to missing `tasks-crud` endpoint through `postAuthed` | server/RLS unknown | reportable |

## Accepted Findings

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `R025-F01` | high | `Dashboard-v2/src/lib/components/tracker/TasksView.svelte:136`, `:180`, `:199`, `:213` | wiring/availability | All four task write actions call `/api/functions/tasks-crud`, but C-137 found no tracked function, route, or handler for `tasks-crud`. Repo truth says create/update/archive/restore are unwired unless implemented outside the tracked source. |
| `R025-F02` | medium/deferred | `Dashboard-v2/src/lib/components/tracker/TasksView.svelte:118-126`, `:156-166`, `:195-196`, `:210-211`; `Dashboard-v2/src/lib/db.ts:721-737` | authz | The component consistently gates mutation UI with `isAdmin`, but the actual authorization must be enforced by the missing `tasks-crud` server handler. `postAuthed` forwards credentials; it is not an admin proof by itself. |
| `R025-F03` | medium/deferred | `Dashboard-v2/src/lib/components/tracker/TasksView.svelte:128-143`, `:169-180` | data-integrity | Create/update validation is mostly UI-level and partial: required client/title checks exist for create, but category allowlist, rate range, title/client length, `created_by`, and server-side validation cannot be verified because the endpoint and DB policy source are absent. |
| `R025-F04` | low/medium | `Dashboard-v2/src/lib/components/tracker/TasksView.svelte:77-84`, `:311-320` | privacy/data-minimization | The query selects `hourly_rate` for all users, while the template hides rates from non-admins. Non-admin browser state can still contain rates if they can access the tasks view. |
| `R025-F05` | info/positive | `Dashboard-v2/src/lib/components/tracker/TasksView.svelte:2-15` | positive/navigation | The header comment gives useful architecture intent: admin CRUD, non-admin read-only grid, read/write routing, and layout. It improves navigation, except for the missing endpoint reference. |
| `R025-F06` | info/positive | `Dashboard-v2/src/lib/components/tracker/TasksView.svelte:66`, `:118-119`, `:156-157`, `:195-196`, `:210-211`, `:243-245`, `:311-337` | positive | UI-level admin separation is consistent: create/edit/archive/restore paths and admin UI controls all check `isAdmin`. Preserve this as defense-in-depth. |
| `R025-F07` | info/positive | `Dashboard-v2/src/lib/components/tracker/TasksView.svelte:21-44`, `:46-66` | positive | The component has a typed `TaskRow`, explicit local state, and a bounded `CATEGORIES` list, which helps maintainability and LLM navigation. |

## Suppressions / Narrowing

- Direct browser Supabase `SELECT` on `client_tasks` is not treated as an RLS bypass by itself. The component comment says reads are intentionally public/RLS-backed, and final data isolation depends on missing policy evidence.
- `saveEdit` is not reported as arbitrary field mutation from the UI. The patch is built from known edit fields, and the edit path is UI-gated to admins. Server-side checks remain deferred because the handler is missing.
- Lack of hard delete is not a defect. The component intentionally uses archive/restore with `archived_at`, preserving linked time entries.

## Deferred

- `client_tasks` table source is missing from tracked SQL/migrations. The audit cannot prove RLS, grants, column-level rate protection, `created_by` constraints, or tenant isolation.
- `/api/functions/tasks-crud` handler is missing from tracked source. The audit cannot verify server-side admin enforcement, validation, rate limiting, logging, or whether the endpoint exists only in untracked/deployed code.

## Immediate Implications

1. The task CRUD UI is one of the clearest examples of "looks wired but repo cannot prove backend exists."
2. Claudio may believe task CRUD works because the UI is polished and well-commented, but current GitHub-obtainable repo truth cannot find the handler.
3. The UI gating is good as a UX pattern, but it needs backend admin checks and DB policies before it can be treated as a security control.
4. The hourly-rate hiding is UI-only; if non-admin rate secrecy matters, do not select `hourly_rate` into non-admin browser state.

## Next Queue

Continue single-lane micro-batches. Good next shards:

- `PlanWeekView.svelte` to close the weekly planning UI and its already-known unwired Telegram approval path.
- `AnalyticsView.svelte` to inspect aggregate reporting and `client_tasks`/`time_entries` read paths.
- Remaining small tracker helpers: `IdleModal.svelte`, `TimeSliderControls.svelte`, `TrackerChip.svelte`, `TrackerHomeWidget.svelte`, and `TrackerViewSwitch.svelte`.

