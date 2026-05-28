# Fanout Run 023 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no SQL execution, no target execution, no live service calls, no credential use, no callback replay
Worker mode: single persistent Claude/tmux lane, active cap `1`

## Acceptance Summary

Run 023 is accepted with C-137 corrections.

- `R023_TRACKER_TELEGRAM_CALLBACK_UI_NAV_OPUS / TRACKER-TELEGRAM-CALLBACK-UI-NAV-023`: worker closed with `files_covered=3 findings=7 suppressions=3 deferred=2 invalidated=0`.
- C-137 accepted the three assigned target UI components after verifying line/word counts, UI action wiring, callback emit/handler searches, `telegram.js` callback dispatch behavior, and backend ticket-create anchors against the local clone.
- C-137 corrected one worker route-map claim: `tracker-ticket-create.js` is not explicitly mapped by tracked `Dashboard-v2/server/index.js`; it remains deployment-dependent/unmapped in repo truth, consistent with Runs 020-022.

Accepted assigned target surfaces added by Run 023: `3`.

Accepted assigned target coverage total after Run 023: `316 / 1505` tracked files.

Strict semantic caveat carried forward: two lockfiles are currently `partial`: `Scripts/telegram-mcp/package-lock.json` from Run 008 and `Scripts/team-bots/package-lock.json` from Run 010. Full semantic coverage is `314 covered + 2 partial`.

Contamination check: passed. C-137 checked the Run 023 pipe log for protected Claude runtime reads, `Searched memories`, and invalidation markers. The only protected-path matches were the packet's own "do not browse" rules. No protected YURI runtime read was accepted.

Clone proof: C-137 verified the target clone at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, clean status count `0`, and `1505` tracked files.

Source pipe log:

- `/tmp/yuri-c2v-fanout-run-023/pipe/r023-single.pipe.log`

## C-137 Corrections

Lane output remains advisory until verified. C-137 corrected these points before acceptance:

- Corrected `API_CALL_MAP` for `TicketCreateDialog.svelte -> /api/functions/tracker-ticket-create`: the backend file exists, but tracked `server/index.js` does not explicitly map it. This is `server_index_mapped=no`, not `yes`.
- Preserved the Run 020-022 route caveat: frontend components use `/api/functions/*`, while tracked production wrapper evidence centers on `/.netlify/functions/*` and an absent tracked `Dashboard-v2/netlify/functions` directory.
- Narrowed `TeamTimeView` frontend-admin-gate suppression: the frontend gate is useful UX, but backend authorization for time-edit decisions still depends on the missing tracked `tracker_time_edit_decide` RPC source already deferred in Run 022.
- Kept `project_id` override on `tracker-ticket-create.js` as carried-forward provider-scope risk from Run 022, not a new independent Run 023 finding.

## Files Covered

| Path | Lines | Words | Notes |
| --- | ---: | ---: | --- |
| `Dashboard-v2/src/lib/components/tracker/TicketCreateDialog.svelte` | 417 | 1306 | Tracker ticket creation modal and `/api/functions/tracker-ticket-create` caller |
| `Dashboard-v2/src/lib/components/tracker/ClientTicketPicker.svelte` | 635 | 2623 | Client/ticket picker used for tracker time-entry context |
| `Dashboard-v2/src/lib/components/tracker/TeamTimeView.svelte` | 379 | 1499 | Admin team time overview and time-edit modal launcher |

Supporting evidence read, not counted as new coverage:

- `Dashboard-v2/functions/telegram.js:2606-2802`
- `Dashboard-v2/functions/tracker-absence-request.js:107-110`
- `Dashboard-v2/functions/tracker-time-edit-request.js:147-150`
- `Dashboard-v2/functions/tracker-plan-submit.js:107-110`
- `Dashboard-v2/functions/tracker-time-edit-decide.js:1-9`, `:64-84`
- `Dashboard-v2/functions/tracker-ticket-create.js:138-172`, `:209-225`
- `git grep` for `tabs_approve`, `tabs_reject`, `tte_approve`, `tte_reject`, `tplan_approve`, `tplan_reject`, and related RPC names

## Callback Routing Map

| Callback prefix | Emit site | Handler site | Fallback | Status |
| --- | --- | --- | --- | --- |
| `tabs_approve` | `tracker-absence-request.js:108` | missing | `telegram.js:2800-2802` -> `handleCommand(chatId, cbData)` | reportable |
| `tabs_reject` | `tracker-absence-request.js:109` | missing | `telegram.js:2800-2802` -> `handleCommand(chatId, cbData)` | reportable |
| `tte_approve` | `tracker-time-edit-request.js:148` | missing | `telegram.js:2800-2802` -> `handleCommand(chatId, cbData)` | reportable |
| `tte_reject` | `tracker-time-edit-request.js:149` | missing | `telegram.js:2800-2802` -> `handleCommand(chatId, cbData)` | reportable |
| `tplan_approve` | `tracker-plan-submit.js:108` | missing | `telegram.js:2800-2802` -> `handleCommand(chatId, cbData)` | reportable, carried forward |
| `tplan_reject` | `tracker-plan-submit.js:109` | missing | `telegram.js:2800-2802` -> `handleCommand(chatId, cbData)` | reportable, carried forward |
| `mtgcreate` | meeting proposal callbacks | `telegram.js:2619-2665` | n/a | covered positive |
| `fact_confirm` / `fact_rollback` | fact-ledger callbacks | `telegram.js:2671-2758` | n/a | covered positive |
| `inv_confirm` / `inv_reject` | invoice-review callbacks | `telegram.js:2765-2799` | n/a | covered positive |

Key wiring proof: `telegram.js:2606-2616` gates callbacks to allowed Telegram users, then handles only the explicit callback families shown above. Unknown callback data falls through to `handleCommand(chatId, cbData)` at `telegram.js:2800-2802`; no tracked handler was found for the tracker approval callback families.

## UI And Endpoint Map

| Source | Action / endpoint | Observed control | Status |
| --- | --- | --- | --- |
| `TicketCreateDialog.svelte:135-146` | `postAuthed("/api/functions/tracker-ticket-create", body)` | frontend validation plus authenticated post; backend has `has_permission('tracker','create_ticket')` from Run 022 | positive with route-mapping caveat |
| `TicketCreateDialog.svelte:53`, `:233-235` | `assigneeCode` text input | state is bound in UI but omitted from submit body | reportable wiring drift |
| `ClientTicketPicker.svelte:129-132` | `listCustomerMaster` + `listOpenTickets` | Supabase helper/RLS-dependent reads; client/ticket selection is explicit and bounded | covered positive |
| `ClientTicketPicker.svelte:249-263` | `onPick(...)` selected ticket/customer payload | billable/admin behavior explicit; no direct backend mutation in component | covered positive |
| `TeamTimeView.svelte:70-82` | `supabase().from(...).select(...)` for profiles, capacity, time entries | read-only UI data path; RLS/schema deferred outside this shard | covered |
| `TeamTimeView.svelte:231-254` | admin-only expand and edit/delete launcher | frontend admin gate opens `TimeEditRequestModal`; actual mutation remains backend/RPC-deferred | positive with backend-deferred caveat |

## Accepted Findings

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `R023-F01` | high/wiring | `Dashboard-v2/functions/telegram.js:2606-2802` | wiring/availability | Telegram callback dispatch does not handle `tabs_*`, `tte_*`, or `tplan_*` tracker approval callback families. The emitted approval/rejection buttons fall into `handleCommand(chatId, cbData)`, so repo truth says those CEO Telegram approval paths are unwired. |
| `R023-F02` | medium | `Dashboard-v2/src/lib/components/tracker/TicketCreateDialog.svelte:53` | wiring/data-integrity | `assigneeCode` is visible and editable in the modal (`:233-235`) but is never included in the POST body (`:135-146`). Backend ticket creation assigns `p.assignee_id || CTI_ID` at `tracker-ticket-create.js:164`, so this UI field currently has no effect. |
| `R023-F03` | low | `Dashboard-v2/functions/tracker-time-edit-decide.js:6` | navigation/false-assurance | The docstring claims "The Telegram path calls the RPC directly inside telegram.js", but grep found no `tte_approve`, `tte_reject`, or `tracker_time_edit_decide` references in `telegram.js`. This misleads maintainers about the real control path. |
| `R023-F04` | low/medium | `Dashboard-v2/functions/tracker-ticket-create.js:138-139` | provider-scope | Carried forward from Run 022: backend accepts `p.project_id || PROJECTS[projCode]`. The reviewed UI sends only `project_code`, so this is not a UI-created bypass, but crafted authenticated requests can broaden Plane project targeting if the function is reachable. |
| `R023-F05` | info/positive | `Dashboard-v2/src/lib/components/tracker/TicketCreateDialog.svelte:118-168` | positive | The ticket-create modal has meaningful frontend validation, uses `postAuthed`, escapes description HTML basics, and aligns with a backend permission gate before Plane side effects. |
| `R023-F06` | info/positive | `Dashboard-v2/src/lib/components/tracker/ClientTicketPicker.svelte:88-119`, `:395-400` | positive | Billable override is restricted to `user.isAdmin`; non-admin internal `C2I` selection auto-sets non-billable and the CEO override is visible and labeled. |
| `R023-F07` | info/positive | `Dashboard-v2/src/lib/components/tracker/TeamTimeView.svelte:231-254` | positive | Team entry expansion and edit/delete launcher are frontend-gated to admins and open the request modal rather than directly mutating entries. Backend RPC authorization remains a separate Run 022 deferred item. |

## Suppressions / Narrowing

- `TicketCreateDialog.svelte` free-text `clientCode` is not a direct security bypass by itself. Backend customer linking resolves it against Plane customers at `tracker-ticket-create.js:209-225`; failure creates a soft-link failure, not a direct unauthorized provider write.
- `ClientTicketPicker.svelte` synthetic internal client tile is not accepted as an independent data leak in this shard. The component is mounted inside already-covered tracker routes and ticket data comes from Supabase helper reads; RLS/database proof remains a separate Supabase shard.
- `TeamTimeView.svelte` frontend-only admin check is not reported as the primary authorization boundary. It is UX gating over read/launcher behavior; real decision safety depends on the backend time-edit decide/RPC chain already deferred in Run 022.

## Deferred

- `Dashboard-v2/functions/tracker-absence-decide.js`: not assigned in this shard. Run 022 covered the file and deferred final safety to missing tracked `tracker_absence_decide` SQL/RPC source.
- `Dashboard-v2/functions/tracker-plan-decide.js`: full callback/data-format compatibility remains deferred because the emitted `tplan_approve:${caller.id}:${body.week_start}` callback has no tracked `telegram.js` handler and the decide endpoint/RPC source needs final cross-check when the plan-decision shard is reopened.

## Immediate Implications

1. The tracker Telegram approval UX is currently repo-unproven and appears broken for absence, time-edit, and week-plan approvals.
2. `TicketCreateDialog.svelte` is mostly well-shaped, but the visible assignee field is dead UI and will cause operator confusion or incorrect ticket assignment.
3. The repo has a recurring false-assurance pattern: comments and UI imply paths work, but callback handlers, route mappings, and backend directories do not consistently prove reachability.
4. The tracker UI components themselves are relatively navigable and componentized compared with the larger route monoliths found in Runs 020-021.

## Next Queue

Continue single-lane micro-batches. Next useful targets:

- uncovered tracker UI components that complete time-entry/ticket user journeys: `StopwatchHero.svelte`, `StopModal.svelte`, `ClientTaskPicker.svelte`, `TasksView.svelte`, and `PlanWeekView.svelte`;
- or a risk-first backend shard for remaining public/external-facing `Dashboard-v2/functions/*.js` grouped by provider, auth model, write capability, and service-role use.

