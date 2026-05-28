# C-137 Route, Function, And Navigation Wiring Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection. No target scripts executed. No installs. No live services called.

## Scope

This shard checks whether the dashboard/function architecture is navigable and wired from tracked source alone. It specifically compares:

- existing `Dashboard-v2/functions/*.js` files;
- PM2/API server wiring under `Dashboard-v2/server`;
- alternative `Dashboard-v2/production-server.js` wiring;
- Caddy route exposure;
- frontend and script callers using `/api/functions/*` versus `/.netlify/functions/*`;
- missing endpoint names referenced by UI/scripts.

## Executive Summary

The tracked repo has a serious route/navigation split. The frontend mostly calls `/api/functions/*`, while tracked Caddy and server wiring expose `/.netlify/functions/*`. The PM2 API server configured in `server/ecosystem.config.js` points at `server/index.js`, but `server/index.js` imports a missing `./netlify-adapter` and tries to require handlers from a missing `Dashboard-v2/netlify/functions` directory. The alternative `production-server.js` has the same missing `netlify/functions` assumption.

From GitHub source alone, a fresh deploy cannot be trusted to reproduce the claimed backend. This directly supports the user's concern that the command center may pretend things are wired while parts are not actually connected.

## Inventory Counts

Source-truth counts from the clone:

```text
unique /api/functions callers: 69
Dashboard-v2/functions/*.js files: 83
Dashboard-v2/server/index.js route targets: 46
tracked Dashboard-v2/netlify/functions directory: absent
tracked Dashboard-v2/server/netlify-adapter.js: absent
tracked Dashboard-v2/server/express-adapter.js: present
```

## Findings

### R104-F01 - PM2 API Server References A Missing Adapter And Missing Function Directory

Severity: Critical for deploy reproducibility and navigation truth  
Status: `C137_VERIFIED`, `BLOCKED_LOCAL_STATE` only if Claudio has untracked remote files

Evidence:

- `Dashboard-v2/server/ecosystem.config.js:15-27` defines the `nex-api` PM2 process as `script: './server/index.js'`, `cwd: '/opt/nex/app'`, `PORT: '3001'`.
- `Dashboard-v2/server/index.js:9` imports `./netlify-adapter`.
- `Dashboard-v2/server/express-adapter.js:10-39` exports the expected `netlifyadapter`, but the filename is `express-adapter.js`, not `netlify-adapter.js`.
- `Dashboard-v2/server/index.js:40-93` requires handlers from `../netlify/functions/...`.
- The tracked clone contains `Dashboard-v2/functions`, but no `Dashboard-v2/netlify/functions` directory.
- `git ls-files` shows tracked function files under `Dashboard-v2/functions/*` and `Dashboard-v2/server/express-adapter.js`, not `Dashboard-v2/server/netlify-adapter.js`.

Impact:

The PM2 API process described by the tracked production config is not reconstructible from the clone. It would fail at startup on the missing adapter before it reaches handler loading. If an untracked remote copy or symlink exists on Claudio's VPS, that is operational state outside Git and must be treated as unreproducible deployment drift.

Required remediation direction:

- Rename/import the adapter consistently.
- Point server code at `Dashboard-v2/functions`, or move functions into the expected `netlify/functions` path.
- Add a boot-time route self-test that fails deployment when a required function directory or adapter is missing.
- Commit the canonical deploy layout or document the generated step that creates it.

### R104-F02 - Alternative Production Server Has The Same Missing `netlify/functions` Assumption

Severity: High  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/production-server.js:36-44` sets `functionsDir = join(__dirname, 'netlify/functions')` and reads that directory.
- `Dashboard-v2/production-server.js:48-63` loads handlers from that directory.
- `Dashboard-v2/production-server.js:118-123` routes `/.netlify/functions/:name` only after handlers have loaded.
- The tracked repo has no `Dashboard-v2/netlify/functions` directory.

Impact:

The fallback or older production server cannot load functions from tracked source either. This means both visible server strategies disagree with the actual tracked function location.

Required remediation direction:

- Delete the unused server strategy or repair it to the same canonical function path as the active PM2 server.
- Add one production server entrypoint, not competing partial entrypoints.

### R104-F03 - Frontend Calls `/api/functions/*` While Tracked Caddy Exposes `/.netlify/functions/*`

Severity: Critical for UX/backend wiring if no untracked proxy exists  
Status: `C137_VERIFIED`, `BLOCKED_LOCAL_STATE` for any untracked reverse proxy

Evidence:

- `Dashboard-v2/server/Caddyfile.template:13-16` routes only `/.netlify/functions/*` to the API process.
- `Dashboard-v2/production-server.js:118-123` exposes only `/.netlify/functions/:name`.
- `Dashboard-v2/production-server.js:176-177` prints `Functions -> /.netlify/functions/:name`.
- `Dashboard-v2/server/index.js:40-82` exposes explicit `/.netlify/functions/*` routes.
- Frontend examples using `/api/functions/*`:
  - `Dashboard-v2/src/routes/+layout.svelte:96`, `:137`, `:206`
  - `Dashboard-v2/src/routes/login/+page.svelte:45`
  - `Dashboard-v2/src/routes/tokens/+page.svelte:41`
  - `Dashboard-v2/src/routes/files/+page.svelte:79`, `:105`, `:172`, `:177`, `:206`
  - `Dashboard-v2/src/routes/nexogram/+page.svelte:754`, `:835`, `:897`
  - `Dashboard-v2/src/routes/ai-monitor/+page.svelte:137`
  - `Dashboard-v2/src/routes/pipeline/+page.svelte:157`, `:198`, `:347`, `:386`
- No tracked SvelteKit `/api/functions` route or hook proxy was found under `Dashboard-v2/src/routes`.

Impact:

The dashboard UI largely speaks one route dialect while the tracked production proxy speaks another. Without an untracked proxy or platform adapter, many UI actions would hit SvelteKit frontend routing instead of the function server.

Required remediation direction:

- Choose one public function prefix and make every caller use it.
- If `/api/functions/*` is desired, add a tracked Caddy and/or SvelteKit proxy route.
- If `/.netlify/functions/*` is desired, update frontend helper functions and scripts.
- Add static route-dialect checks in CI.

### R104-F04 - Many UI-Referenced `/api/functions` Endpoints Have No Matching Tracked Function File

Severity: High  
Status: `C137_VERIFIED`

Unique `/api/functions` names referenced by UI/scripts but absent from `Dashboard-v2/functions/*.js`:

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

Impact:

The UI references a much larger backend than the tracked function directory contains. Some of these may be planned, retired, generated, or untracked. From a repo-truth audit perspective, they are not navigable implementation.

Required remediation direction:

- Classify every referenced endpoint as `implemented`, `untracked`, `retired`, or `planned`.
- Remove dead UI controls or add clear unavailable states.
- Keep a generated route manifest committed with the app.

### R104-F05 - Many Existing Function Files Are Not Routed By `server/index.js`

Severity: High for production parity  
Status: `C137_VERIFIED`

Existing non-shared function files not explicitly routed by `Dashboard-v2/server/index.js`:

```text
telegram
telegram-calendar-watch
telegram-team
telegram-weekly
token-usage
tracker-absence-decide
tracker-absence-request
tracker-admin-delete-entry
tracker-admin-set-fte
tracker-admin-set-rate
tracker-admin-set-working-hours
tracker-admin-update-entry
tracker-block
tracker-log
tracker-m365-mirror
tracker-plan-decide
tracker-plan-submit
tracker-pull-plane
tracker-push-plane
tracker-start
tracker-stop
tracker-tick
tracker-ticket-create
tracker-time-edit-decide
tracker-time-edit-request
transcribe
whisper-transcribe
```

Impact:

Even if the missing adapter/path were fixed, the explicit PM2 server route list exposes only a subset of tracked functions. Several UI-used tracker and token endpoints exist as files but are not mapped by this server.

Required remediation direction:

- Replace the manual route list with manifest-driven loading, or generate the manual list from committed source.
- Fail CI when a function file is UI-referenced but not routed.

### R104-F06 - Deploy Script Assumes A Remote `netlify/functions` Directory Not Present In Git

Severity: High  
Status: `C137_VERIFIED`, `BLOCKED_LOCAL_STATE` for remote-only directories

Evidence:

- `Dashboard-v2/server/deploy.sh:12-14` rsyncs the local `Dashboard-v2/` directory to `/opt/nex/app/`.
- `Dashboard-v2/server/deploy.sh:17-18` then runs `npm install` in `$REMOTE` and `$REMOTE/netlify/functions`.
- The tracked `Dashboard-v2/` directory has `functions/`, not `netlify/functions/`.

Impact:

The deploy script encodes the same path drift. A clean remote deploy from the GitHub clone should not have the directory it tries to install in unless some untracked/preexisting state exists on the server.

Required remediation direction:

- Make deploy scripts create or sync the actual canonical function directory.
- Add `test -d` guards with loud failure before npm install/restart.
- Stop relying on remote filesystem leftovers as part of the deployment model.

## Architecture Readout

Tracked source currently has at least four backend route models:

```text
Frontend/Scripts:
  /api/functions/<name>

Static legacy page and internal function-to-function calls:
  /.netlify/functions/<name>

PM2 API server:
  server/index.js -> require('../netlify/functions/<name>')

Actual committed function files:
  Dashboard-v2/functions/<name>.js
```

This is a major navigationability failure. An LLM or human operator cannot reliably infer the live backend from the repo because route prefixes, physical function paths, deploy scripts, and server configs disagree.

## Required Next Validation Gates

1. Ask Claudio whether `/opt/nex/app/netlify/functions` exists only on the server. If yes, classify it as untracked deployment drift.
2. Generate a canonical route manifest from source.
3. Compare that manifest to every frontend/script caller.
4. Decide one route dialect and one physical function directory.
5. Add a predeploy smoke check that runs without secrets and verifies adapter import, function directory existence, and route manifest completeness.

## Acceptance

Accepted as C-137 direct evidence for dashboard route/navigation wiring. This artifact strengthens the audit's architecture conclusion: the repo contains working code fragments, but the tracked wiring is not coherent enough for reliable deployment or LLM navigation.
