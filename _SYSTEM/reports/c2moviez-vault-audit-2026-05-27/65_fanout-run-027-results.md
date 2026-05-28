# Fanout Run 027 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker lane: `R027_TRACKER_ANALYTICS_FINANCIAL_SCOPE_OPUS / TRACKER-ANALYTICS-FINANCIAL-SCOPE-027`

## Acceptance Summary

Run 027 is accepted with C-137 corrections.

- Worker closed with `files_covered=1 findings=7 suppressions=3 deferred=3 invalidated=0`.
- C-137 accepted the assigned target file as covered after verifying clone state, line/word count, `AnalyticsView.svelte` query fields, admin/team scope gating, route mount, `user.isAdmin` semantics, and absence of tracked SQL/RLS evidence for `time_entries` and `client_tasks`.
- The planned pipe log did not materialize for this run, so C-137 saved and used the full tmux pane capture at `/tmp/yuri-c2v-fanout-run-027/pipe/r027-capture-full.txt`. The capture contains the required Run 027 proof rows and close row.

Accepted assigned target surfaces added by Run 027: `1`.

Accepted assigned target coverage total after Run 027: `322 / 1505` tracked files.

Strict semantic caveat carried forward: two lockfiles are currently `partial`: `Scripts/telegram-mcp/package-lock.json` from Run 008 and `Scripts/team-bots/package-lock.json` from Run 010. Full semantic coverage is `320 covered + 2 partial`.

Contamination check: passed. C-137 checked the Run 027 pane capture for protected Claude runtime reads, `Searched memories`, and invalidation markers. Protected-path strings appear only in packet boundary rules and prior scrollback; no protected-runtime read was accepted.

## C-137 Corrections

Lane output remains advisory until verified. C-137 corrected these points before acceptance:

- `R027-F01` is accepted as a medium privacy/data-minimization issue, not proof of cross-user exposure. Repo evidence proves the browser selects `rate_chf_per_hour` and `amount_chf` before UI hiding; live RLS/column grants determine wider exposure.
- `R027-F02` is accepted as medium/deferred. The current UI renders the team toggle only for `user.isAdmin`, and `user.isAdmin` is `ceo || cto`. The unresolved risk is missing database-side proof for the team-scope query when `scope === "team"` removes the `user_id` filter.
- `R027-F03` and `R027-F04` are financial accuracy/data-integrity risks, not direct security vulnerabilities.
- `R027-F07` is low/deferred because only `id` and `category` are selected from `client_tasks`, and the query is bounded to task IDs returned by `time_entries`; final privacy impact depends on `client_tasks` RLS.

## File Covered

| Path | Lines | Words | Status |
| --- | ---: | ---: | --- |
| `Dashboard-v2/src/lib/components/tracker/AnalyticsView.svelte` | 834 | 2970 | covered |

Supporting evidence used but not counted as new coverage:

- `Dashboard-v2/src/routes/tracker/+page.svelte:47`, `:594-598`: imports and mounts `AnalyticsView`.
- `Dashboard-v2/src/lib/stores/user.svelte.ts:236-240`: `isAdmin` is `role === "ceo" || role === "cto"`.
- Tracked SQL search found no `time_entries` or `client_tasks` schema/RLS/policy/grant definitions in tracked SQL files.

## Analytics Data Map

| Source | Data | Scope/Control | Status |
| --- | --- | --- | --- |
| `AnalyticsView.svelte:115-126` | `time_entries` select includes `user_id`, duration, billable, `rate_chf_per_hour`, `amount_chf`, client/task ids, and `entry_type` | `scope === "me"` adds `.eq("user_id", user.id)`; `scope === "team"` removes user filter | covered, reportable for financial fields |
| `AnalyticsView.svelte:131-141` | `client_tasks` select of `id, category` | bounded to task ids found in loaded entries | covered, RLS-deferred |
| `AnalyticsView.svelte:151-158` | `rateOf()` / `chfOf()` computes CHF client-side | uses fetched amount/rate or `DEFAULT_RATE` | covered, reportable |
| `AnalyticsView.svelte:172-204` | KPIs for total hours, billable hours, sick/travel/vacation, CHF | derived from loaded entries | covered |
| `AnalyticsView.svelte:271-294` | six-month turnover series | derived from the six-month query window | covered |

## Accepted Findings

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `R027-F01` | medium | `Dashboard-v2/src/lib/components/tracker/AnalyticsView.svelte:117` | privacy/data-minimization | The query selects `rate_chf_per_hour` and `amount_chf` for every viewer before the UI hides CHF blocks behind `isCti`. Non-admin users do not see the CHF DOM blocks, but the fields are still fetched into browser memory for their query result. |
| `R027-F02` | medium/deferred | `Dashboard-v2/src/lib/components/tracker/AnalyticsView.svelte:122-124`, `:399-404`; `Dashboard-v2/src/lib/stores/user.svelte.ts:240` | authz/privacy | Team scope removes the `user_id` filter. The UI toggle is gated by `user.isAdmin`, which maps to CEO/CTO, but there is no tracked `time_entries` RLS/policy evidence proving the database also enforces user/team scope. |
| `R027-F03` | low | `Dashboard-v2/src/lib/components/tracker/AnalyticsView.svelte:126` | data-integrity | The six-month analytics query uses `.limit(5000)` without warning when the cap is hit. Large teams or granular tracking can silently undercount hours and turnover. |
| `R027-F04` | low | `Dashboard-v2/src/lib/components/tracker/AnalyticsView.svelte:36`, `:151-158` | data-integrity | `DEFAULT_RATE = 120` silently estimates revenue whenever `rate_chf_per_hour` and `amount_chf` are absent. This can make turnover charts look authoritative while using a local fallback. |
| `R027-F05` | info | `Dashboard-v2/src/lib/components/tracker/AnalyticsView.svelte:2-16`; `Dashboard-v2/src/lib/stores/user.svelte.ts:240` | navigation | Header comments describe "CTI" financial access, but code gates on `user.isAdmin` (`ceo || cto`). The role terminology is ambiguous for future audits/refactors. |
| `R027-F06` | info | `Dashboard-v2/src/lib/components/tracker/AnalyticsView.svelte:186-188` | data-integrity | Sick/travel/vacation KPIs count entries, not distinct dates, while normal working days use a date `Set`. Multiple special entries on one day can overcount days. |
| `R027-F07` | low/deferred | `Dashboard-v2/src/lib/components/tracker/AnalyticsView.svelte:131-139` | privacy | Category lookup reads `client_tasks.id, category` for task IDs returned by the entry query. This is bounded, but task category visibility still depends on unverified `client_tasks` RLS. |

## Strengths / Suppressions

- `AnalyticsView.svelte` has no `.insert()`, `.update()`, `.upsert()`, or `.delete()` calls. It is read-only analytics UI.
- Non-admin users do not receive the rendered team toggle because the buttons are inside `{#if isCti}` at `AnalyticsView.svelte:399-404`.
- CHF KPI and turnover chart display blocks are gated by `{#if isCti}` at `AnalyticsView.svelte:435-441` and `:531-561`.
- The file is unusually navigable for a single Svelte component: top header documents intent, and script sections are grouped for state, KPIs, bar chart, donuts, line chart, and SVG helpers.

## Deferred

- `time_entries` table/RLS/column grants: no tracked SQL source proves `user_id` scoping, team/admin access, or financial column filtering.
- `client_tasks` table/RLS: no tracked SQL source proves category visibility boundaries.
- Live Supabase inspection is needed to close `pg_tables`, `pg_policies`, and column privilege questions for `time_entries` and `client_tasks`. This must remain read-only and must not use discovered credentials.

## Immediate Implications

1. The analytics UI is functionally coherent and read-only, but it fetches financial fields too early. If FK/non-admin must truly see "no CHF, no rate", the select should be role-specific or served through a role-aware view/RPC.
2. The tracker data model remains under-documented in tracked SQL. Multiple tracker findings now defer to missing `time_entries` / `client_tasks` RLS evidence.
3. Financial charts should distinguish actual stamped rates from fallback estimates before Claudio relies on them for business truth.

## Next Queue

- Continue with the remaining tracker/focus navigation surfaces: likely `/focus/+page.svelte`, `TrackerViewSwitch.svelte`, or the smallest uncovered tracker helper components.
- Keep one persistent worker lane, use `/clear` between packets, and maintain active cap `1`.
