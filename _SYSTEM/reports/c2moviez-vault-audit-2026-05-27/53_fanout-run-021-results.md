# Fanout Run 021 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no SQL execution, no target execution, no live service calls, no credential use
Worker mode: single persistent Claude/tmux lane, active cap `1`

## Acceptance Summary

Run 021 is accepted with C-137 corrections.

- `R021_TRACKER_ADMIN_CUSTOMER_MEETING_NAV_OPUS / TRACKER-ADMIN-CUSTOMER-MEETING-NAV-021`: worker closed with `files_covered=8 findings=12 suppressions=4 deferred=4 invalidated=0`.
- C-137 accepted the 8 assigned target files as covered after verifying line/word counts, endpoint calls, function existence, server route mappings, and deployment-route evidence against the local clone.
- C-137 narrowed or rejected several worker suppressions where the worker relied on comments or assumed RLS policy rather than repo-verified backend evidence.

Accepted assigned target surfaces added by Run 021: `8`.

Accepted assigned target coverage total after Run 021: `306 / 1505` tracked files.

Strict semantic caveat carried forward: two lockfiles are currently `partial`: `Scripts/telegram-mcp/package-lock.json` from Run 008 and `Scripts/team-bots/package-lock.json` from Run 010. Full semantic coverage is `304 covered + 2 partial`.

Contamination check: passed. C-137 checked the Run 021 pipe log for protected Claude runtime reads, `Searched memories`, and invalidation markers. The protected-path matches were the packet's own "do not browse" rules plus a target-repo deploy script line that excludes `node_modules` from rsync. No protected YURI runtime read was accepted.

Clone proof: C-137 verified the target clone at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, clean status count `0`, and `1505` tracked files.

Source pipe log:

- `/tmp/yuri-c2v-fanout-run-021/pipe/r021-single.pipe.log`

## C-137 Corrections

Lane output remains advisory until verified. C-137 corrected these points before acceptance:

- Corrected function count wording: `Dashboard-v2/functions/` contains `87` tracked files total and `83` tracked `.js` function files. The worker's `87 tracked function files` phrasing was imprecise.
- Corrected generic-loader wording: `production-server.js` can generically load `netlify/functions`, but tracked PM2 uses `Dashboard-v2/server/index.js`; and `Dashboard-v2/netlify/functions/` is absent in the tracked clone. Generic loading is therefore `deployment-dependent`, not repo-proven.
- Rejected backend authorization proof based only on comments. Header comments in `admin/tracker/+page.svelte` and member/tracker UI comments are useful intent anchors, but they do not prove backend enforcement unless the function or SQL policy is inspected.
- Downgraded worker suppressions for `tracker/+page.svelte:162` and `pipeline/customers/+page.svelte:557` to deferred. Direct Supabase updates may be safe under RLS, but this shard did not inspect the exact table policies.
- Downgraded the meetings/studio raw-fetch suppression. `analyze-meeting` and `push-meeting-to-obsidian` can consume model/API resources or write notes; they require function-level auth review before suppression.
- Preserved the small-team pagination suppression for `admin/tracker/+page.svelte:123-131` as a performance/navigability note only, not a security suppression.

## Files Covered

| Path | Lines | Words | Notes |
| --- | ---: | ---: | --- |
| `Dashboard-v2/src/routes/admin/tracker/+page.svelte` | 747 | 3000 | Tracker admin settings, FTE, working hours, absences, rates |
| `Dashboard-v2/src/routes/admin/members/+page.svelte` | 850 | 3188 | Member identity/capacity/working-hours admin UI |
| `Dashboard-v2/src/routes/tracker/+page.svelte` | 1464 | 5158 | Main tracker UI, plan submit, manual log, team view |
| `Dashboard-v2/src/lib/components/tracker/CalendarView.svelte` | 673 | 2879 | Planned blocks, M365 overlay, tracker block CRUD |
| `Dashboard-v2/src/lib/components/tracker/TimeEditRequestModal.svelte` | 358 | 1357 | Time edit request/admin override/delete modal |
| `Dashboard-v2/src/routes/pipeline/customers/+page.svelte` | 2999 | 12016 | CRM/customer kanban, inline edits, M365, Claude draft, promotion workflow |
| `Dashboard-v2/src/routes/meetings/studio/+page.svelte` | 1447 | 5335 | Meeting capture, Whisper fallback, analysis, Obsidian push, MCP ticket creation |
| `Dashboard-v2/src/routes/admin/pitch/+page.svelte` | 554 | 1555 | Pitch SSO admin UI |

Supporting evidence read, not counted as new coverage:

- `Dashboard-v2/server/Caddyfile.template`
- `Dashboard-v2/server/index.js`
- `Dashboard-v2/production-server.js`
- `Dashboard-v2/server/deploy.sh`
- `Dashboard-v2/server/ecosystem.config.js`
- `Dashboard-v2/src/lib/db.ts`
- `git ls-files` checks for `/api` bridge, Netlify config, hooks, and endpoint functions

## Endpoint Truth Map

All assigned frontend calls use `/api/functions/*`. None of the assigned files call `/.netlify/functions/*` directly.

| Frontend source | Endpoint | Tracked function file | `server/index.js` mapping | Tracked `/api` bridge |
| --- | --- | --- | --- | --- |
| `admin/tracker/+page.svelte:174`, `admin/members/+page.svelte:272` | `/api/functions/tracker-admin-set-fte` | `Dashboard-v2/functions/tracker-admin-set-fte.js` | missing | missing |
| `admin/tracker/+page.svelte:214`, `admin/members/+page.svelte:304` | `/api/functions/tracker-admin-set-working-hours` | `Dashboard-v2/functions/tracker-admin-set-working-hours.js` | missing | missing |
| `admin/tracker/+page.svelte:231` | `/api/functions/tracker-absence-decide` | `Dashboard-v2/functions/tracker-absence-decide.js` | missing | missing |
| `admin/tracker/+page.svelte:252` | `/api/functions/tracker-admin-set-rate` | `Dashboard-v2/functions/tracker-admin-set-rate.js` | missing | missing |
| `admin/members/+page.svelte:253` | `/api/functions/member-admin-update` | missing | missing | missing |
| `tracker/+page.svelte:319` | `/api/functions/tracker-plan-submit` | `Dashboard-v2/functions/tracker-plan-submit.js` | missing | missing |
| `tracker/+page.svelte:525` | `/api/functions/tracker-log` | `Dashboard-v2/functions/tracker-log.js` | missing | missing |
| `CalendarView.svelte:143` | `/api/functions/schedule-list` | `Dashboard-v2/functions/schedule-list.js` | yes, but only `/.netlify/functions/schedule-list` | missing |
| `CalendarView.svelte:242`, `:276`, `:300` | `/api/functions/tracker-block` | `Dashboard-v2/functions/tracker-block.js` | missing | missing |
| `TimeEditRequestModal.svelte:96` | `/api/functions/tracker-admin-update-entry` | `Dashboard-v2/functions/tracker-admin-update-entry.js` | missing | missing |
| `TimeEditRequestModal.svelte:106` | `/api/functions/tracker-time-edit-request` | `Dashboard-v2/functions/tracker-time-edit-request.js` | missing | missing |
| `TimeEditRequestModal.svelte:139` | `/api/functions/tracker-admin-delete-entry` | `Dashboard-v2/functions/tracker-admin-delete-entry.js` | missing | missing |
| `pipeline/customers/+page.svelte:188`, `:239`, `:279`, `:330`, `:1042` | `/api/functions/crm-inline-edit` | missing | missing | missing |
| `pipeline/customers/+page.svelte:638` | `/api/functions/crm-promote-to-client` | missing | missing | missing |
| `pipeline/customers/+page.svelte:913` | `/api/functions/crm-generate-draft` | missing | missing | missing |
| `pipeline/customers/+page.svelte:949` | `/api/functions/crm-send-email` | missing | missing | missing |
| `meetings/studio/+page.svelte:135`, `:365` | `/api/functions/whisper-transcribe` | `Dashboard-v2/functions/whisper-transcribe.js` | missing | missing |
| `meetings/studio/+page.svelte:301`, `:430` | `/api/functions/analyze-meeting` | `Dashboard-v2/functions/analyze-meeting.js` | yes, but only `/.netlify/functions/analyze-meeting` | missing |
| `meetings/studio/+page.svelte:395` | `/api/functions/push-meeting-to-obsidian` | `Dashboard-v2/functions/push-meeting-to-obsidian.js` | yes, but only `/.netlify/functions/push-meeting-to-obsidian` | missing |
| `meetings/studio/+page.svelte:491` | `/api/functions/mcp-server` | `Dashboard-v2/functions/mcp-server.js` | yes, but only `/.netlify/functions/mcp-server` | missing |
| `admin/pitch/+page.svelte:61`, `:77`, `:114` | `/api/functions/pitch-sso` | missing | missing | missing |

## Accepted Findings

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `R021-F01` | high | all assigned frontend files, `Dashboard-v2/server/Caddyfile.template:14-33`, `Dashboard-v2/server/index.js:39-96` | wiring/navigation | Run 021 reconfirms the app-wide route dialect fault: assigned frontend files call `/api/functions/*`, while tracked Caddy and Express expose `/.netlify/functions/*`; no tracked SvelteKit, Vite, Netlify, hook, `_redirects`, or `_headers` bridge exists. |
| `R021-F02` | high | `Dashboard-v2/functions/`, `Dashboard-v2/server/index.js:40-82`, `Dashboard-v2/server/deploy.sh:11-18` | wiring/navigation | Function source/runtime layout is split: tracked function source lives under `Dashboard-v2/functions`, but server/deploy files reference `Dashboard-v2/netlify/functions`, which is absent from the tracked clone. |
| `R021-F03` | high | tracker endpoints listed above, `Dashboard-v2/server/index.js:39-96` | wiring/availability | Multiple tracker functions exist as tracked `.js` files but are not mapped by `server/index.js`: `tracker-admin-set-fte`, `tracker-admin-set-working-hours`, `tracker-absence-decide`, `tracker-admin-set-rate`, `tracker-admin-update-entry`, `tracker-admin-delete-entry`, `tracker-time-edit-request`, `tracker-log`, `tracker-plan-submit`, and `tracker-block`. |
| `R021-F04` | high | `Dashboard-v2/src/routes/admin/members/+page.svelte:253` | wiring/availability | Member admin identity save calls `member-admin-update`, but no tracked function file or server mapping exists. |
| `R021-F05` | high | `Dashboard-v2/src/routes/pipeline/customers/+page.svelte:188`, `:239`, `:279`, `:330`, `:638`, `:913`, `:949`, `:1042` | wiring/availability | CRM/customer page calls four untracked backend functions: `crm-inline-edit`, `crm-promote-to-client`, `crm-generate-draft`, and `crm-send-email`. These cover business-critical editing, promotion, AI draft generation, and email send workflows. |
| `R021-F06` | medium | `Dashboard-v2/src/routes/admin/pitch/+page.svelte:61`, `:77`, `:114` | wiring/security-review | Pitch SSO admin UI calls `pitch-sso` for list/create/revoke, but no tracked backend exists. The repo cannot prove the backend authorization gate for magic-link management. |
| `R021-F07` | medium | `Dashboard-v2/src/routes/meetings/studio/+page.svelte:301`, `:395`, `:491` | auth/navigation | Meetings studio uses raw `fetch()` for analysis, Obsidian push, and MCP ticket creation instead of `getAuthed`/`postAuthed`. `mcp-server` uses `credentials: "include"`, but analysis and Obsidian push have no explicit cookie or bearer semantics. Function-level auth must be inspected before suppression. |
| `R021-F08` | medium | `Dashboard-v2/src/routes/pipeline/customers/+page.svelte` | navigation/maintainability | `pipeline/customers/+page.svelte` is a 2999-line route combining kanban, DnD, customer drawer, inline edits, outreach drafting, M365 send, Claude API workflow, scoring, tags, decision makers, next actions, timeline, manual logging, and large CSS. This is expensive and risky for LLM navigation. |
| `R021-F09` | low | `Dashboard-v2/src/routes/pipeline/customers/+page.svelte:188`, `:239`, `:279`, `:330`, `:638`, `:949` | auth/navigation | CRM page mixes manual raw fetch plus manually constructed bearer headers, direct Supabase RPC/table calls, and helper-based patterns in neighboring routes. That makes auth review per-call instead of mechanical. |
| `R021-F10` | info/positive | `Dashboard-v2/src/routes/admin/tracker/+page.svelte:1-17`, `:174`, `:214`, `:231`, `:252` | positive | Tracker admin has strong local intent documentation and consistently uses `postAuthed` for writes. Preserve this pattern, but verify the backend/RPC implementations separately. |
| `R021-F11` | info/positive | `Dashboard-v2/src/lib/components/tracker/TimeEditRequestModal.svelte:94-143` | positive | Time edit modal is a clean 358-line component with explicit admin override, non-admin request flow, drift handling, and consistent `postAuthed` usage. |
| `R021-F12` | info/positive | `Dashboard-v2/src/lib/components/tracker/CalendarView.svelte:97-104`, `:143`, `:242`, `:276`, `:300` | positive | Calendar view documents and separates member visibility, M365 overlay, and block CRUD, and uses `getAuthed`/`postAuthed` for function calls. |

## Suppressions / Narrowing

- `admin/tracker/+page.svelte:123-131` loading all admin tracker reference data is not promoted as a current scalability risk from this shard. The code appears bounded for a small team and limits some reference tables. This is a performance/navigability suppression only.
- Raw same-origin or credentials-included `fetch()` is not automatically treated as unauthenticated. Browser same-origin requests normally carry same-origin cookies. The accepted issue is inconsistency, missing bearer fallback, and missing function-level proof.
- Frontend `user.isAdmin` and `user.can(...)` checks are useful UX/navigation controls, but they are not backend authorization proof.

## Deferred

- Exact tracker backend authorization remains open for unmapped existing functions such as `tracker-plan-submit`, `tracker-log`, `tracker-block`, `tracker-time-edit-request`, and `tracker-absence-decide`.
- Exact RLS proof remains open for direct Supabase updates in `tracker/+page.svelte:162` and `pipeline/customers/+page.svelte:557`.
- `analyze-meeting`, `push-meeting-to-obsidian`, `mcp-server`, and `whisper-transcribe` need function-level auth/resource-control review because the frontend path can consume AI/API resources, push meeting notes, or create tickets.
- Production may contain an untracked `/api/functions` bridge or populated `netlify/functions` directory, but the GitHub-obtainable tracked repo does not prove it.

## C-137 Spot Checks

C-137 directly checked these anchors before accepting:

- Endpoint inventory across all eight assigned files with `git grep`.
- `server/index.js:39-96`: explicit `/.netlify/functions/*` mappings only; no `/api/functions/*`; no tracker function mappings; no CRM/pitch missing-function mappings.
- `Caddyfile.template:14-33`: only `/.netlify/functions/*`, `/_internal/*`, and `/health` route to backend; catch-all goes to frontend.
- `deploy.sh:11-18`: syncs Dashboard-v2 while excluding `.netlify`, then runs `npm install` inside `$REMOTE/netlify/functions`, implying a runtime directory absent from the tracked clone.
- `server/ecosystem.config.js:16-18`: PM2 API process runs `./server/index.js`, so `server/index.js` is the primary tracked production API router.
- `git ls-files` for `/api` bridge surfaces, hooks, Netlify config, `_redirects`, `_headers`, and endpoint function files.
- Line/word counts for each assigned file using `git show HEAD:<path>`.

## Immediate Implications

1. The route dialect and function-directory mismatch are now confirmed across another high-value frontend shard. This is an architecture issue, not a localized typo.
2. Several important workflows appear either missing from the tracked backend or dependent on untracked production state: member admin, CRM inline edits, CRM promotion, CRM AI/email, pitch SSO, and multiple tracker mutations.
3. The next audit shard should inspect the existing but unmapped high-authority function internals surfaced here before final severity is set.

## Next Queue

Run 022 should stay single-lane and inspect the existing backend functions surfaced by Run 021 that remain unmapped or auth-deferred:

- `Dashboard-v2/functions/tracker-plan-submit.js`
- `Dashboard-v2/functions/tracker-time-edit-request.js`
- `Dashboard-v2/functions/tracker-absence-decide.js`
- `Dashboard-v2/functions/whisper-transcribe.js`
- `Dashboard-v2/functions/analyze-meeting.js`
- `Dashboard-v2/functions/push-meeting-to-obsidian.js`
- `Dashboard-v2/functions/mcp-server.js`

Before dispatch, C-137 should check prior result artifacts to avoid double-counting any function already semantically covered.
