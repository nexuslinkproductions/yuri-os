# Codex Run 030 Results - Focus Page Architecture

Date: 2026-05-27
Lane: `R030_FOCUS_PAGE_ARCHITECTURE_GPT55_XHIGH / FOCUS-PAGE-ARCHITECTURE-030`
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
FILE_COVERAGE path="Dashboard-v2/src/routes/focus/+page.svelte" method=full_read status=covered lines=3063 words=10404 notes="full chunked read; focus data, localStorage, calendar sync, route links, and planning state covered"
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R030 files_covered=1 findings=5 suppressions=2 deferred=1 invalidated=0
```

## Accepted Findings

### R030-F01 - `/focus` Depends On Missing Or Unmapped Backend Functions

Severity: high
Class: wiring / availability

Evidence:

- `focus/+page.svelte:45` calls `/api/functions/focus-schedule-sync`.
- `focus/+page.svelte:367` calls `/api/functions/calendar-events?user=all...`.
- `focus/+page.svelte:470` calls `/api/functions/focus-data`.
- `focus/+page.svelte:1186` calls `/api/functions/focus-mark-done`.
- `focus/+page.svelte:1313` calls `/api/functions/focus-calendar-sync`.
- `git ls-files Dashboard-v2/functions/*focus*` and handler searches found no tracked handlers for those names.
- `server/Caddyfile.template:14-16` and `server/index.js:40-82` expose `/.netlify/functions/*`, not `/api/functions/*`.
- `git ls-files Dashboard-v2/src/routes/api/**` returned no tracked SvelteKit API routes.

Impact:

The focus page cannot reliably load focus data, sync schedules, mark work done, or calendar-sync from tracked deployment evidence. This is a major architecture/wiring failure for a page that appears operational.

Recommendation:

Add tracked handlers and a tracked `/api/functions/*` proxy, or update callers to mapped function paths with smoke tests.

### R030-F02 - Focus Truth Is Stored In Browser-Local `focus:*` State

Severity: medium
Class: data-integrity

Evidence:

- `focus/+page.svelte:374-463` reads and writes `focus:est:*`, `focus:schedule:*`, `focus:status:*`, `focus:resched:*`, `focus:reason:*`, and `focus:history`.
- `PlanWeekView.svelte:21` explicitly shares the same namespace, and `PlanWeekView.svelte:165-225` reads/writes the same keys.

Impact:

Planning status, done state, reasons, history, and schedule state can diverge per browser and per device. Dashboard truth can drift from Plane, calendar, tracker, and team views.

Recommendation:

Move focus status/schedule/history to an authenticated backend table and treat localStorage as cache only.

### R030-F03 - Team-Wide Calendar/Data Scope Is Requested Without Visible Client-Side Permission Gate

Severity: medium
Class: privacy

Evidence:

- `focus/+page.svelte:367` requests calendar events with `user=all`.
- `focus/+page.svelte:470` pulls `focus-data` for tickets, clients, meetings, invoices, and related state.
- `focus/+page.svelte:814-833` applies CTI/FK/TEAM/BOTH filtering client-side.
- No `user.can(...)` or `isAdmin` guard controls this fetch in the assigned file.

C-137 correction:

Because the focus handlers are missing from tracked source, this is a design/implementation hazard rather than a confirmed live data leak. It becomes high risk if matching backend handlers are deployed permissively out of tree.

Recommendation:

Enforce scope server-side and avoid `user=all` except for authorized admin/team views.

### R030-F04 - Focus Page Comments Claim Durable Orchestrator/Plane Sync That Repo Evidence Does Not Provide

Severity: low
Class: false assurance / navigationability

Evidence:

- `focus/+page.svelte:27-28` references `focus-schedule-sync normaliseItem`.
- `focus/+page.svelte:1185-1186` comments "Push to Plane.so in background" before calling missing `/api/functions/focus-mark-done`.

Impact:

Operators and LLMs may assume durable backend behavior exists when the tracked repository does not provide it.

Recommendation:

Update comments after wiring exists, or mark behavior as local-only/unavailable.

### R030-F05 - `/focus` Is A 3063-Line Monolith

Severity: info
Class: navigationability / maintainability

Evidence:

- `focus/+page.svelte` is 3063 lines and 10404 words.
- It combines data fetching, local persistence, schedule algorithms, filters, timers, drawer state, calendar sync, UI markup, and styling.

Impact:

Large future edits are likely to miss hidden dependencies, especially around shared localStorage and backend function assumptions.

Recommendation:

Split data adapters, local-state persistence, schedule derivation, and UI components into smaller modules with tests around route/endpoint contracts.

## Strengths And Suppressions

```text
SUPPRESSION path="focus/+page.svelte" hypothesis="direct Supabase/time_entries/scheduled_blocks mutation from /focus" counterevidence="assigned file does not import supabase or mutate those tables directly"
SUPPRESSION path="focus/+page.svelte" hypothesis="/focus starts tracker timers directly" counterevidence="no tracker import or tracker.start call in the assigned file"
```

## Deferred Follow-Up

```text
DEFERRED path="runtime deployment" reason="no live service calls allowed and tracked Caddy/server evidence may differ from actual deployed reverse-proxy config" next="read-only deployment config export or approved live metadata check"
```

## Coverage Update

Before Run 030:

- accepted assigned target coverage: `339 / 1505`
- strict semantic coverage: `337 covered + 2 partial`

After Run 030:

- accepted assigned target coverage: `340 / 1505`
- strict semantic coverage: `338 covered + 2 partial`
