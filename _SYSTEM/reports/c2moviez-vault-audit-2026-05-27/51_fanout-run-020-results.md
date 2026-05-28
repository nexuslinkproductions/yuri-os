# Fanout Run 020 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no SQL execution, no target execution, no live service calls, no credential use
Worker mode: single persistent Claude/tmux lane, active cap `1`

## Acceptance Summary

Run 020 is accepted with C-137 corrections.

- `R020_APP_ROUTE_ALIAS_NAVIGATION_OPUS / APP-ROUTE-ALIAS-NAVIGATION-020`: worker closed with `files_covered=10 findings=12 suppressions=4 deferred=2 invalidated=0`.
- C-137 accepted the 10 assigned target files as covered after verifying endpoint calls, route config, function existence, and missing proxy evidence against the local clone.
- C-137 narrowed several worker statements before acceptance; see corrections below.

Accepted assigned target surfaces added by Run 020: `10`.

Accepted assigned target coverage total after Run 020: `298 / 1505` tracked files.

Strict semantic caveat carried forward: two lockfiles are currently `partial`: `Scripts/telegram-mcp/package-lock.json` from Run 008 and `Scripts/team-bots/package-lock.json` from Run 010. Full semantic coverage is `296 covered + 2 partial`.

Contamination check: passed. C-137 checked the Run 020 pipe log for protected Claude runtime reads, `Searched memories`, and invalidation markers. The only protected-path matches were the packet's own "do not browse" rules. No protected-runtime read was accepted.

Clone proof: C-137 verified the target clone at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, clean status count `0`, and `1505` tracked files.

Source pipe log:

- `/tmp/yuri-c2v-fanout-run-020/pipe/r020-single.pipe.log`

## C-137 Corrections

Lane output remains advisory until verified. C-137 corrected these points before acceptance:

- Corrected assigned-file line/word counts from local `git show` output. The worker's file line counts were consistently off by one.
- Corrected `pipeline/+page.svelte` auth wording. It uses raw same-origin `fetch()` without explicit `credentials: "include"` and without a bearer header at `157`, `198`, `347`, and `386`. Browser defaults still send same-origin cookies, so this is an auth consistency and reliability issue, not a standalone auth bypass.
- Rejected the worker's `admin/system` backend-auth suppression as proven. `admin/system/+page.svelte:11-12` comments claim CEO/CTO backend enforcement, but the backend function `admin-system.js` is missing from the tracked tree, so repo truth cannot prove that enforcement.
- Corrected the tracked function source count: `Dashboard-v2/functions/` contains `83` tracked `.js` files, not `79`.
- Narrowed `production-server.js` evidence: the tracked PM2 config uses `Dashboard-v2/server/index.js` for `nex-api`; `production-server.js` is still useful corroborating evidence because it also exposes only `/.netlify/functions/:name`, but it is not the PM2 API server named in `server/ecosystem.config.js`.

## Executive Finding

Run 020 confirms the route dialect problem as an app-wide architecture/navigationability fault, not a tracker-specific bug.

Every assigned frontend route calls `/api/functions/*`. The tracked Caddy template only proxies `/.netlify/functions/*`, `/_internal/*`, and `/health` to the backend API server, while all other paths go to SvelteKit. The tracked Express API server also registers `/.netlify/functions/*`, not `/api/functions/*`. The repo contains no tracked `src/routes/api/`, `hooks.server.ts`, `vite` proxy, `_redirects`, `_headers`, or `netlify.toml` bridge.

That means either production has untracked routing, or the tracked repo cannot explain how major frontend actions reach their backend functions. For LLM navigation, this is severe: the route names in UI code, server config, deploy script, and function directory layout do not form a single traceable path.

## Files Covered

| Path | Lines | Words | Notes |
| --- | ---: | ---: | --- |
| `Dashboard-v2/src/routes/+layout.svelte` | 780 | 2826 | Root auth verify, logout, profile/menu, app shell |
| `Dashboard-v2/src/routes/login/+page.svelte` | 223 | 741 | Microsoft SSO and password fallback |
| `Dashboard-v2/src/routes/schedule/+page.svelte` | 1361 | 3979 | Scheduler grid and schedule function calls |
| `Dashboard-v2/src/routes/pipeline/+page.svelte` | 1062 | 3888 | CRM/pipeline actions and draft creation |
| `Dashboard-v2/src/routes/meetings/+page.svelte` | 1037 | 3944 | Meeting list/update UI |
| `Dashboard-v2/src/routes/admin/system/+page.svelte` | 672 | 2322 | Admin system status surface |
| `Dashboard-v2/src/routes/tokens/+page.svelte` | 355 | 1362 | Token usage dashboard |
| `Dashboard-v2/src/routes/calendar/+page.svelte` | 439 | 1558 | Calendar event scheduling |
| `Dashboard-v2/src/routes/intel/+page.svelte` | 620 | 2234 | Intel prediction action surface |
| `Dashboard-v2/src/routes/nexdoc/+page.svelte` | 1171 | 3765 | Document scan/list/update UI |

Supporting evidence read, not counted as new coverage:

- `Dashboard-v2/server/Caddyfile.template`
- `Dashboard-v2/server/index.js`
- `Dashboard-v2/production-server.js`
- `Dashboard-v2/server/deploy.sh`
- `Dashboard-v2/server/ecosystem.config.js`
- `Dashboard-v2/svelte.config.js`
- `Dashboard-v2/vite.config.ts`
- `Dashboard-v2/src/lib/db.ts`

## Endpoint Truth Map

Assigned frontend calls:

| Frontend source | Endpoint | Tracked function file | `server/index.js` mapping | Tracked `/api` bridge |
| --- | --- | --- | --- | --- |
| `+layout.svelte:96`, `+layout.svelte:137`, `+layout.svelte:206`, `login/+page.svelte:45` | `/api/functions/auth` | `Dashboard-v2/functions/auth.js` | yes, but only `/.netlify/functions/auth` | missing |
| `schedule/+page.svelte:111` | `/api/functions/schedule-list` | `Dashboard-v2/functions/schedule-list.js` | yes, but only `/.netlify/functions/schedule-list` | missing |
| `schedule/+page.svelte:225`, `schedule/+page.svelte:257`, `schedule/+page.svelte:274` | `/api/functions/schedule-plan-ticket` | `Dashboard-v2/functions/schedule-plan-ticket.js` | yes, but only `/.netlify/functions/schedule-plan-ticket` | missing |
| `pipeline/+page.svelte:157` | `/api/functions/client-update` | `Dashboard-v2/functions/client-update.js` | yes, but only `/.netlify/functions/client-update` | missing |
| `pipeline/+page.svelte:198` | `/api/functions/client-meeting-note` | `Dashboard-v2/functions/client-meeting-note.js` | yes, but only `/.netlify/functions/client-meeting-note` | missing |
| `pipeline/+page.svelte:347` | `/api/functions/pipeline-move` | `Dashboard-v2/functions/pipeline-move.js` | yes, but only `/.netlify/functions/pipeline-move` | missing |
| `pipeline/+page.svelte:386`, `intel/+page.svelte:86` | `/api/functions/pipeline-email-draft` | `Dashboard-v2/functions/pipeline-email-draft.js` | yes, but only `/.netlify/functions/pipeline-email-draft` | missing |
| `calendar/+page.svelte:64` | `/api/functions/calendar-schedule-event` | `Dashboard-v2/functions/calendar-schedule-event.js` | yes, but only `/.netlify/functions/calendar-schedule-event` | missing |
| `intel/+page.svelte:113` | `/api/functions/mcp-server` | `Dashboard-v2/functions/mcp-server.js` | yes, but only `/.netlify/functions/mcp-server` | missing |
| `intel/+page.svelte:146` | `/api/functions/event-dispatch` | `Dashboard-v2/functions/event-dispatch.js` | yes, but only `/.netlify/functions/event-dispatch` | missing |
| `tokens/+page.svelte:41` | `/api/functions/token-usage` | `Dashboard-v2/functions/token-usage.js` | missing | missing |
| `meetings/+page.svelte:66` | `/api/functions/meetings-list` | missing | missing | missing |
| `meetings/+page.svelte:104` | `/api/functions/meetings-update` | missing | missing | missing |
| `admin/system/+page.svelte:104` | `/api/functions/admin-system` | missing | missing | missing |
| `nexdoc/+page.svelte:97` | `/api/functions/nexdoc-list` | missing | missing | missing |
| `nexdoc/+page.svelte:135` | `/api/functions/nexdoc-scan` | missing | missing | missing |
| `nexdoc/+page.svelte:185`, `nexdoc/+page.svelte:218` | `/api/functions/nexdoc-update` | missing | missing | missing |

## Accepted Findings

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `R020-F01` | high | assigned frontend route files, `Dashboard-v2/server/Caddyfile.template:14-33`, `Dashboard-v2/server/index.js:39-96` | wiring/navigation | All assigned frontend route files call `/api/functions/*`, but tracked Caddy and Express only expose `/.netlify/functions/*`; no tracked SvelteKit, Vite, Netlify, or redirect bridge exists. |
| `R020-F02` | high | `Dashboard-v2/server/index.js:40-82`, `Dashboard-v2/production-server.js:35-44`, `Dashboard-v2/server/deploy.sh:11-18` | wiring/navigation | Server/deploy files expect `Dashboard-v2/netlify/functions`, but tracked function source lives under `Dashboard-v2/functions`; no tracked build/symlink/copy step bridges the directories. |
| `R020-F03` | high | `Dashboard-v2/src/routes/meetings/+page.svelte:66`, `Dashboard-v2/src/routes/meetings/+page.svelte:104` | wiring/availability | Meetings UI calls `meetings-list` and `meetings-update`, but no tracked implementations or server mappings exist. |
| `R020-F04` | high | `Dashboard-v2/src/routes/admin/system/+page.svelte:104` | wiring/availability | Admin system UI calls `admin-system`, but no tracked implementation or server mapping exists. The page comment claims CEO/CTO backend enforcement, but the backend cannot be audited because it is missing. |
| `R020-F05` | high | `Dashboard-v2/src/routes/nexdoc/+page.svelte:97`, `Dashboard-v2/src/routes/nexdoc/+page.svelte:135`, `Dashboard-v2/src/routes/nexdoc/+page.svelte:185`, `Dashboard-v2/src/routes/nexdoc/+page.svelte:218` | wiring/availability | NEXdoc list/scan/update calls target functions that have no tracked implementations or server mappings. |
| `R020-F06` | medium | `Dashboard-v2/src/routes/tokens/+page.svelte:41`, `Dashboard-v2/server/index.js:39-96` | wiring/availability | `token-usage.js` exists, but `server/index.js` omits a `/.netlify/functions/token-usage` route. |
| `R020-F07` | medium | `Dashboard-v2/src/routes/pipeline/+page.svelte:157`, `Dashboard-v2/src/routes/pipeline/+page.svelte:198`, `Dashboard-v2/src/routes/pipeline/+page.svelte:347`, `Dashboard-v2/src/routes/pipeline/+page.svelte:386` | navigation/auth-reliability | Pipeline uses raw same-origin `fetch()` instead of `postAuthed`, so it has no bearer fallback and must be audited call-by-call. |
| `R020-F08` | medium | `Dashboard-v2/src/routes/schedule/+page.svelte:111`, `Dashboard-v2/src/routes/schedule/+page.svelte:225`, `Dashboard-v2/src/routes/schedule/+page.svelte:257`, `Dashboard-v2/src/routes/schedule/+page.svelte:274` | navigation/auth-reliability | Schedule uses raw `fetch()` with cookie auth instead of `getAuthed`/`postAuthed`, creating a second auth style beside the centralized helper path. |
| `R020-F09` | info/positive | `Dashboard-v2/src/routes/+layout.svelte:47-88` | positive | Root layout clearly enforces `@c2moviez.com` domain, CEO bypass, and active profile checks before allowing app access. |
| `R020-F10` | info/positive | `Dashboard-v2/src/lib/db.ts:718-759` | positive | `postAuthed` and `getAuthed` are strong centralized auth helpers: they send cookies and attach GoTrue Bearer tokens when available. |
| `R020-F11` | info/positive | `Dashboard-v2/src/routes/login/+page.svelte:29-38` | positive | Login flow includes documented stale-session cleanup before Microsoft OAuth, tied to a specific prior incident. |
| `R020-F12` | low | `Dashboard-v2/src/routes/+layout.svelte:302-303` | navigation/UX | Profile identity is hardcoded as `CT` / `Claudio`, which misleads multi-user navigation and audit context. |

## Suppressions / Narrowing

- Domain restriction in `+layout.svelte:60-88` is not frontend-only nonsense; it is useful defense-in-depth before backend/RLS checks.
- Raw same-origin `fetch()` in pipeline is not treated as unauthenticated by itself because same-origin browser requests normally carry same-origin cookies by default. The accepted issue is lack of bearer fallback and inconsistent helper usage.
- `intel/+page.svelte:146-168` falling back to direct `audit_log` insertion is not promoted as a bypass from this shard. It is a resilience path and needs RLS/grant context before security severity.
- `admin/system/+page.svelte:82-85` frontend `user.isAdmin` is useful UX gating, but C-137 did not accept the worker's claim that backend CEO/CTO enforcement is proven, because the target backend function is missing from the tracked repo.

## Deferred

- Production `/opt/nex/app/netlify/functions/` state is not available from GitHub clone evidence. The repo suggests it may exist on the server, but this audit is constrained to what can be pulled from GitHub.
- Production `/etc/caddy/Caddyfile` could contain untracked manual rewrites. The tracked deploy script copies `Caddyfile.template`, but live server truth remains out of scope without Claudio providing production server evidence.

## C-137 Spot Checks

C-137 directly checked these anchors before accepting:

- Endpoint inventory across all ten assigned files with `git grep`.
- `Caddyfile.template:12-33`: only `/.netlify/functions/*`, `/_internal/*`, and `/health` route to backend; catch-all goes to frontend.
- `server/index.js:39-96`: explicit `/.netlify/functions/*` mappings only; no `/api/functions/*`; no mappings for `token-usage`, `meetings-*`, `admin-system`, or `nexdoc-*`.
- `production-server.js:35-44` and `118-164`: generic loader uses `netlify/functions` and exposes only `/.netlify/functions/:name`.
- `deploy.sh:11-18`: syncs Dashboard-v2 then runs `npm install` inside `$REMOTE/netlify/functions`, implying a runtime directory absent from the tracked clone.
- `server/ecosystem.config.js:16-18`: PM2 API process runs `./server/index.js`, so `server/index.js` is the primary tracked production API router.
- `git ls-files` for `Dashboard-v2/src/routes/api/**`, `Dashboard-v2/src/hooks.server*`, `Dashboard-v2/src/hooks.ts`, `Dashboard-v2/netlify/**`, `Dashboard-v2/netlify.toml`, `_redirects`, and `_headers`: no bridge evidence found.
- `git ls-files` for endpoint function files: `meetings-list`, `meetings-update`, `admin-system`, `nexdoc-list`, `nexdoc-scan`, and `nexdoc-update` were absent; `token-usage.js` existed but was unmapped.

## Immediate Implications

1. The route dialect must be fixed or documented as an explicit deployment contract. Pick `/api/functions/*` or `/.netlify/functions/*`, then align frontend, Caddy, Express, SvelteKit, deploy docs, and tests.
2. The function source/runtime directory mismatch must be resolved with a tracked copy/symlink/build step or by changing the API server to load the actual tracked `Dashboard-v2/functions` directory.
3. Missing functions for meetings, admin-system, and NEXdoc should be treated as repo-truth blockers. The current GitHub clone cannot prove those features exist or are secure.
4. `getAuthed`/`postAuthed` should become the standard frontend function-call path unless there is a documented exception.

## Next Queue

Run 021 should stay single-lane and continue route/navigation closure across frontend surfaces not yet semantically covered, especially:

- `Dashboard-v2/src/routes/admin/tracker/+page.svelte`
- `Dashboard-v2/src/routes/admin/members/+page.svelte`
- `Dashboard-v2/src/routes/tracker/+page.svelte`
- `Dashboard-v2/src/lib/components/tracker/CalendarView.svelte`
- `Dashboard-v2/src/lib/components/tracker/TimeEditRequestModal.svelte`
- `Dashboard-v2/src/routes/pipeline/customers/+page.svelte`
- `Dashboard-v2/src/routes/meetings/studio/+page.svelte`
- `Dashboard-v2/src/routes/admin/tokens/+page.svelte` if present

The goal is to keep burning down the same route dialect/auth-helper/navigationability family without double-counting files already covered in Runs 019-020.
