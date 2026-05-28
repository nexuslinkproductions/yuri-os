# Codex Run 028 Results - Tracker Small Helpers

Date: 2026-05-27
Lane: `R028_TRACKER_SMALL_HELPERS_GPT55_XHIGH / TRACKER-SMALL-HELPERS-028`
Worker: Codex CLI, `gpt-5.5`, `model_reasoning_effort=xhigh`, read-only sandbox
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Status: accepted with C-137 corrections

## Clone Proof

```text
CLONE_PROOF commit=8103286e1abc63fa9490cb1375ecde4f340aa2bb status_count=0 tracked_files=1505
```

Clean relaunch validation:

- Worker ran with `-C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo`.
- No durable target mutation.
- No accepted output depends on the invalidated earlier YURI-root run.
- The worker attempted only target-root `_SYSTEM` reads, which failed inside the target clone; no YURI protected runtime path was read.

## File Coverage

```text
FILE_COVERAGE path="Dashboard-v2/src/lib/components/tracker/IdleModal.svelte" method=full_read status=covered lines=177 words=611 notes="idle modal helper, not mounted in current tree"
FILE_COVERAGE path="Dashboard-v2/src/lib/components/tracker/TimeSliderControls.svelte" method=full_read status=covered lines=237 words=746 notes="calendar edit sliders"
FILE_COVERAGE path="Dashboard-v2/src/lib/components/tracker/TrackerChip.svelte" method=full_read status=covered lines=283 words=928 notes="global timer chip helper, not mounted in current tree"
FILE_COVERAGE path="Dashboard-v2/src/lib/components/tracker/TrackerHomeWidget.svelte" method=full_read status=covered lines=176 words=615 notes="home widget helper, not mounted in current tree"
FILE_COVERAGE path="Dashboard-v2/src/lib/components/tracker/TrackerViewSwitch.svelte" method=full_read status=covered lines=87 words=321 notes="active tracker view switch"
FILE_COVERAGE path="Dashboard-v2/src/routes/tracker/plan/+page.ts" method=full_read status=covered lines=6 words=35 notes="legacy redirect"
FILE_COVERAGE path="Dashboard-v2/src/routes/tracker/team/+page.ts" method=full_read status=covered lines=6 words=33 notes="legacy redirect"
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R028 files_covered=7 findings=6 suppressions=5 deferred=0 invalidated=0
```

## Accepted Findings

### R028-F01 - TrackerChip Global Timer Is Not Mounted

Severity: low
Class: wiring / navigationability

Evidence:

- `TrackerChip.svelte:5` says it mounts in `CommandBar / top-right of every authenticated layout`.
- `git grep` found no import or mount of `TrackerChip` in active Svelte routes/components.
- `tracker/+page.svelte:245` subscribes the tracker store only inside the tracker page, so this specific "global chip" claim is stale.

Impact:

The globally visible running timer and Cmd/Ctrl+. stop affordance promised by the component comments are not active from tracked app-shell wiring.

Recommendation:

Mount `TrackerChip` in the authenticated shell or mark/remove the component as retired.

### R028-F02 - IdleModal Is Not Mounted And Its Idle Accounting Is Approximate

Severity: low
Class: wiring / data-integrity

Evidence:

- `IdleModal.svelte:14` says it mounts once globally next to `TrackerChip`.
- `git grep` found no active caller/import for `IdleModal`.
- If mounted later, `IdleModal.svelte:25-42` deducts a constant 10 minutes on stop, while the store computes actual idle seconds from `_lastInputAt` at `tracker.svelte.ts:231-235`.

C-137 correction:

The worker's medium active data-integrity claim is downgraded because the modal is not mounted in current-tree wiring. The valid issue is stale/dead wiring plus a future hazard if reintroduced unchanged.

Recommendation:

Either wire the modal to the actual idle timestamp/max-idle value or remove the stale helper.

### R028-F03 - Time Slider Allows Blocks Beyond The Displayed Day End

Severity: medium
Class: data-integrity

Evidence:

- `TimeSliderControls.svelte:85-106` permits `startHour` from 6 to 20 and `duration` from 0.5 to 8.
- `TimeSliderControls.svelte:59` clamps only the preview `endHour` to 20.
- `CalendarView.svelte:276-281` sends raw `editStart` and `editDur` to `tracker-block`.

Impact:

The UI can save a block whose real end time exceeds the calendar grid while previewing a capped visual end. This can create misleading planning records.

Recommendation:

Clamp duration based on selected start time in both the component and backend/RPC validation.

### R028-F04 - TrackerHomeWidget Is Unmounted Stale Surface

Severity: info
Class: navigationability

Evidence:

- `TrackerHomeWidget.svelte:3` claims a compact tracker summary for the Command home page.
- `git grep TrackerHomeWidget` returned only the component itself.

Impact:

The repo advertises a home tracker widget that does not appear in current-tree navigation.

Recommendation:

Mount it intentionally or remove/retire it to reduce LLM navigation drift.

### R028-F05 - `/tracker/plan` Redirect Drops Existing Query State

Severity: low
Class: navigation

Evidence:

- `tracker/plan/+page.ts:4-5` redirects to the literal `/tracker?view=calendar`.

Impact:

Legacy deep links with query state are normalized to the calendar view but lose all other parameters.

Recommendation:

Merge existing query parameters when redirecting, or document that the alias intentionally discards state.

### R028-F06 - `/tracker/team` Redirect Drops Existing Query State

Severity: low
Class: navigation

Evidence:

- `tracker/team/+page.ts:4-5` redirects to the literal `/tracker?view=team`.

Impact:

Legacy team deep links with query state are normalized to the team view but lose all other parameters.

Recommendation:

Merge existing query parameters when redirecting, or document that the alias intentionally discards state.

## Strengths And Suppressions

```text
SUPPRESSION path="TrackerViewSwitch.svelte:31" hypothesis="team tab is visible without permission" counterevidence="visible tabs filter on user.can(t.perm) || user.isAdmin"
SUPPRESSION path="TimeSliderControls.svelte:34-36" hypothesis="helper directly mutates planned blocks" counterevidence="component only calls onChange; CalendarView performs the backend save"
SUPPRESSION path="TrackerChip.svelte:43" hypothesis="chip directly mutates time entries" counterevidence="delegates to tracker.stop(), which uses /api/functions/tracker-stop"
SUPPRESSION path="TrackerHomeWidget.svelte:88-91" hypothesis="team control is unguarded" counterevidence="team chip renders only inside user.can('tracker.view_team')"
SUPPRESSION path="tracker/+page.svelte:599-617" hypothesis="route aliases have no destination" counterevidence="calendar and team views exist inside /tracker"
```

## Coverage Update

Before Run 028:

- accepted assigned target coverage: `331 / 1505`
- strict semantic coverage: `329 covered + 2 partial`

After Run 028:

- accepted assigned target coverage: `338 / 1505`
- strict semantic coverage: `336 covered + 2 partial`
