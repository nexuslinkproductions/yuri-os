# C-137 Function Route Contract Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection and static route extraction. No target source files mutated. No target scripts executed. No live HTTP calls.

## Scope

This shard checks whether the frontend, deployed API router, tracked function files, and deployment scripts agree:

```text
frontend fetch/postAuthed/getAuthed calls
  -> expected API path
  -> tracked function file
  -> tracked production router/Caddy path
  -> deployment script and production server model
```

Static extraction found 90 named function endpoint references in tracked JS/Svelte/HTML source. The repository does not expose a single coherent function route contract. The most important break is structural: the Svelte app mostly calls `/api/functions/*`, while tracked production Caddy and Express route `/.netlify/functions/*`; additionally the tracked Express servers point to a `Dashboard-v2/netlify/functions` directory that is absent from the clone.

## Findings

### R118-F01 - Production API Servers Point To An Absent `netlify/functions` Directory

Severity: Critical deployment and route-wiring risk  
Status: `C137_VERIFIED`

Evidence:

- The clone contains `Dashboard-v2/functions` and `Dashboard-v2/edge-functions`; no `Dashboard-v2/netlify/functions` directory was present in this pass.
- `Dashboard-v2/server/index.js:40-82` maps public function routes to `fn('../netlify/functions/<name>')`.
- `Dashboard-v2/server/index.js:85-93` maps scheduled internal routes to the same `../netlify/functions` directory.
- `Dashboard-v2/production-server.js:35-42` sets `functionsDir = join(__dirname, 'netlify/functions')` and reads it at startup.
- `Dashboard-v2/server/deploy.sh:18` runs `cd $REMOTE/netlify/functions && npm install` under `set -e`.
- Tracked function files actually live at `Dashboard-v2/functions/*.js`.

Impact:

From GitHub alone, the production API cannot be reconstructed. The current split server (`server/index.js`) safe-loads missing modules into `503 Handler unavailable`, while the older `production-server.js` would fail when reading the absent directory. The deploy script also expects the missing remote path. This is a system-level wiring failure, not a single endpoint bug.

Required remediation direction:

- Pick one physical function directory and generate every router/deploy reference from it.
- Change tracked production servers and deployment scripts to use `Dashboard-v2/functions`, or move files into `Dashboard-v2/netlify/functions` with a compatibility manifest.
- Add a CI route-contract test that fails when a router target has no file.

### R118-F02 - Frontend Calls `/api/functions/*`, But Tracked Production Routing Exposes `/.netlify/functions/*`

Severity: Critical frontend/backend integration risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/lib/db.ts:721-738` sends `postAuthed(path, body)` to the caller-provided path.
- `Dashboard-v2/src/lib/db.ts:743-759` sends `getAuthed(path)` to the caller-provided path.
- Representative frontend calls use `/api/functions/*`:
  - `Dashboard-v2/src/routes/+layout.svelte:96`, `137`, and `206` call `/api/functions/auth`.
  - `Dashboard-v2/src/routes/ai-monitor/+page.svelte:106-138` calls `/api/functions/ai-monitor-metrics`.
  - `Dashboard-v2/src/routes/pipeline/customers/+page.svelte:188-194` and `239-245` call `/api/functions/crm-inline-edit`.
  - `Dashboard-v2/src/routes/nexogram/+page.svelte:491-520` calls `/api/functions/nexogram-channels`.
  - `Dashboard-v2/src/lib/stores/tracker.svelte.ts:91-115` calls `/api/functions/tracker-start` and `/api/functions/tracker-stop`.
- `Dashboard-v2/server/Caddyfile.template:14-16` only proxies `/.netlify/functions/*` to the API server.
- `Dashboard-v2/server/index.js:40-82` only registers `/.netlify/functions/*` public API paths.
- `Dashboard-v2/vite.config.ts:4-13` does not define a dev proxy for `/api/functions`.
- No `Dashboard-v2/src/routes/api` route tree was found.
- No tracked `netlify.toml`, `_redirects`, or equivalent redirect file was found in `Dashboard-v2`.

Impact:

The browser-facing app and the tracked production router do not agree on the API prefix. Unless a live-only proxy exists outside GitHub, most frontend API calls fall through to SvelteKit and fail. This directly damages navigationability for LLMs: a model following the frontend call sites will believe endpoints exist at `/api/functions/*`, while production routing truth says otherwise.

Required remediation direction:

- Choose `/api/functions/*` or `/.netlify/functions/*` as the canonical browser API prefix.
- Add tracked Caddy/SvelteKit/Express routing for the chosen prefix.
- Add a generated route manifest that maps every frontend call to a deployable handler.

### R118-F03 - Many Referenced Function Names Have No Matching Tracked Function File

Severity: High feature-wiring and false-assurance risk  
Status: `C137_VERIFIED_STATIC_EXTRACTION`

Evidence:

- Static endpoint extraction found 90 named function endpoint references.
- Thirty-eight referenced names had no matching `Dashboard-v2/functions/<name>.js` file in this pass.
- Missing referenced endpoint names include:

```text
admin-system
ai-monitor-metrics
calendar-events
crm-generate-draft
crm-inline-edit
crm-promote-to-client
crm-send-email
dispatch-event
expenses-create
expenses-list
expenses-update
focus-calendar-sync
focus-data
focus-mark-done
focus-schedule-sync
meetings-list
meetings-update
member-admin-update
membership
nex-file-confirm
nex-file-download
nex-file-ingest
nex-file-presign
nex-files-list
nexdoc-list
nexdoc-scan
nexdoc-update
nexita-context
nexogram-channels
nexogram-messages
nexogram-send
nexogram-typing
pitch-sso
request-access
tasks-crud
```

Representative call sites:

- `Dashboard-v2/src/routes/ai-monitor/+page.svelte:106-138` expects `ai-monitor-metrics`.
- `Dashboard-v2/src/routes/pipeline/customers/+page.svelte:188-245` expects `crm-inline-edit`.
- `Dashboard-v2/src/routes/nexogram/+page.svelte:491-520` expects `nexogram-channels`.
- `Dashboard-v2/src/routes/expenses/+page.svelte:242-324` expects `expenses-list`, `expenses-create`, and `expenses-update`.
- `Dashboard-v2/functions/chat.js:503-506` expects `membership`.

Impact:

Large product areas are not repo-reconstructable: AI monitor aggregation, CRM edit/send/promote, expenses, focus, meetings, NEXDOC, NEX files, NEXOGRAM, pitch SSO, welcome access, team member admin, and tracker task CRUD. These features can look complete in the UI while the backend contract is missing from GitHub.

Required remediation direction:

- Generate a missing-endpoint report in CI from frontend references.
- Either add the missing handlers, remove the UI controls, or mark the features as live-only/export-required.
- Keep comments and UI copy from claiming an endpoint exists until a tracked handler exists.

### R118-F04 - Existing Function Files Used By The UI Are Not Exposed By The Tracked Split API Router

Severity: High deployment drift risk  
Status: `C137_VERIFIED_STATIC_EXTRACTION`

Evidence:

- The clone has 83 tracked `Dashboard-v2/functions/*.js` files.
- `Dashboard-v2/server/index.js:40-82` exposes only 37 public `/.netlify/functions/*` routes.
- Static extraction found UI references to existing handler files that are not in the tracked split server public route table, including:

```text
telegram
telegram-team
token-usage
tracker-absence-decide
tracker-admin-delete-entry
tracker-admin-set-fte
tracker-admin-set-rate
tracker-admin-set-working-hours
tracker-admin-update-entry
tracker-block
tracker-log
tracker-plan-submit
tracker-start
tracker-stop
tracker-tick
tracker-ticket-create
tracker-time-edit-request
whisper-transcribe
```

Representative call sites:

- `Dashboard-v2/src/routes/tokens/+page.svelte:41` calls `token-usage`.
- `Dashboard-v2/src/lib/stores/tracker.svelte.ts:91-115` calls `tracker-start` and `tracker-stop`.
- `Dashboard-v2/src/routes/admin/tracker/+page.svelte:174-252` calls several tracker admin handlers.
- `Dashboard-v2/src/routes/meetings/studio/+page.svelte:17` declares `whisper-transcribe`.

Impact:

Even handlers that exist in the repository are not necessarily reachable in the tracked production router. This is another source of false confidence: file existence does not equal deployed route existence.

Required remediation direction:

- Generate the Express route table from the function directory.
- Add explicit exclusions for shared libraries and scheduled-only handlers.
- Add a test that fails any frontend-referenced existing handler that is not routed.

### R118-F05 - There Are Two Incompatible Production Server Models

Severity: High LLM navigation and operational stability risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/production-server.js:1-3` describes an all-in-one server started as PM2 `ops-dashboard`.
- `Dashboard-v2/production-server.js:118-178` dynamically serves `/.netlify/functions/:name` and SvelteKit from one port.
- `Dashboard-v2/server/Caddyfile.template:7-10` describes a split architecture: API on port 3001 and frontend on port 3002.
- `Dashboard-v2/server/ecosystem.config.js:14-47` defines PM2 apps `nex-api` and `nex-frontend`, not `ops-dashboard`.
- `CLAUDE.md:332-333` still says PM2 `ops-dashboard`, port 3000, Caddy to localhost 3000.

Impact:

This gives operators and LLMs conflicting deployment truth. Depending on which file is treated as authoritative, the expected port, process name, route behavior, function loader, and Caddy config all change. That is exactly how an AI assistant can claim the backend is running while it is checking the wrong process or URL shape.

Required remediation direction:

- Retire one server model or mark it archived.
- Generate deployment docs from the active PM2/Caddy/server files.
- Add one root `runtime-manifest.json` or equivalent for process names, ports, routes, and active entrypoints.

### R118-F06 - Backend Function-To-Function Calls Also Use Drifted Or Missing Paths

Severity: Medium-high reliability and observability risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/functions/chat.js:280-291` posts to `/.netlify/functions/telegram`.
- `Dashboard-v2/functions/chat.js:503-506` requests `/.netlify/functions/membership`; no matching tracked `membership.js` file was found.
- `Dashboard-v2/functions/nex-rag-query.js:118-122` calls `/.netlify/functions/chat` and falls back if chat is unavailable.
- Static extraction found `telegram.js` exists as a function file, but the split server route table does not expose it publicly.

Impact:

Internal function workflows can silently degrade or skip behavior when route drift occurs. This can make monitoring look healthy while downstream effects such as Telegram dispatch, membership enrichment, or Claude-backed RAG generation quietly fail or fall back.

Required remediation direction:

- Prefer in-process shared helpers or a typed internal router for function-to-function calls.
- If HTTP loopback is required, route paths must be generated from the same manifest used by Caddy and Express.
- Add failure telemetry for every function-to-function fallback.

## Positive Controls Observed

- The split server has a safe-load wrapper that prevents one bad module from crashing the entire API process.
- `Dashboard-v2/server/Caddyfile.template:18-23` blocks non-loopback access to `/_internal/*`.
- `Dashboard-v2/production-server.js:76-80` also checks loopback access for scheduled triggers.
- Several static pages, such as `Dashboard-v2/static/marketing-studio.html`, consistently use `/.netlify/functions/*`, showing that some route consumers match the tracked Caddy prefix.

## Coverage Boundary

This shard does not call any live endpoint and does not prove the production server currently lacks an out-of-band proxy or copied `netlify/functions` directory. It proves the GitHub clone cannot reconstruct a coherent route contract. For a repo-truth audit, that is enough to mark API routing and LLM navigationability as high-risk until a generated manifest closes the gap.
