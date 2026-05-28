# C-137 Dashboard Navigationability And Feature-Wiring Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection. No target scripts executed. No installs. No dev server. No live services called.

## Scope

This shard focuses on whether the dashboard can be navigated and trusted by an operator or LLM:

```text
docs/navigation label
  -> Svelte route
  -> UI action/fetch
  -> backend function file
  -> tracked server route
  -> data/service side effect
```

The answer is currently: only partially. The dashboard has a rich UI surface, but many navigation paths do not resolve to tracked backend truth.

## Inventory

Tracked Svelte page routes:

```text
41 page routes under Dashboard-v2/src/routes
```

Unique frontend `/api/functions/*` references in `Dashboard-v2/src/routes` and `Dashboard-v2/src/lib`:

```text
69 unique API references
```

Navigation references with no tracked Svelte page route found:

```text
/finance
/crm
```

The `/api/functions/*` versus `/.netlify/functions/*` route dialect problem is already accepted in shard `104`; this shard adds feature-level navigation impact.

## Findings

### R108-F01 - Primary Navigation Contains Dead Internal Links

Severity: High navigationability risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/lib/components/Sidebar.svelte:33-38` defines a MONEY section with a `Finance` link at `/finance`.
- `Dashboard-v2/src/routes/nexdoc/+page.svelte:281-285` renders a `Finance ->` link to `/finance`.
- The tracked route inventory has `Dashboard-v2/src/routes/revenue/+page.svelte` and `Dashboard-v2/src/routes/expenses/+page.svelte`, but no `Dashboard-v2/src/routes/finance/+page.svelte`.
- `Dashboard-v2/src/routes/welcome/+page.svelte:79-83` defines a marketing capability card that links to `/crm`.
- The tracked route inventory has `/pipeline/customers`, but no `Dashboard-v2/src/routes/crm/+page.svelte`.

Impact:

The sidebar and onboarding cards lead users and LLM navigators to routes that do not exist in the tracked app. This is not just cosmetic: `/finance` is placed as a primary MONEY module, so a reviewer would reasonably expect it to be a major source of financial truth.

Required remediation direction:

- Replace `/finance` with an existing route or add the missing finance route.
- Replace `/crm` with `/pipeline/customers` or add a canonical redirect route.
- Generate and enforce a route-link checker so every internal link resolves to a tracked page or explicit redirect.

### R108-F02 - Central Product Pages Depend On Missing Backend Functions

Severity: Critical for repo-truth wiring; High operational stability risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/routes/files/+page.svelte:75-87` loads file vault data from `/api/functions/nex-files-list`.
- `Dashboard-v2/src/routes/files/+page.svelte:102-115` downloads through `/api/functions/nex-file-download`.
- `Dashboard-v2/src/routes/files/+page.svelte:149-220` uploads through `/api/functions/nex-file-ingest`, `/api/functions/nex-file-presign`, and `/api/functions/nex-file-confirm`.
- `Dashboard-v2/src/routes/nexogram/+page.svelte:491-519` opens channels through `/api/functions/nexogram-channels`.
- `Dashboard-v2/src/routes/nexogram/+page.svelte:702-704` sends messages through `/api/functions/nexogram-send`.
- `Dashboard-v2/src/routes/nexogram/+page.svelte:971-1014` edits, deletes, and reacts through `/api/functions/nexogram-messages`.
- `Dashboard-v2/src/routes/nexogram/+page.svelte:1176-1180` loads context through `/api/functions/nexita-context`.
- `Dashboard-v2/src/routes/nexdoc/+page.svelte:93-104` lists docs through `/api/functions/nexdoc-list`.
- `Dashboard-v2/src/routes/nexdoc/+page.svelte:118-150` scans docs through `/api/functions/nexdoc-scan`.
- `Dashboard-v2/src/routes/nexdoc/+page.svelte:183-219` updates docs through `/api/functions/nexdoc-update`.
- The tracked `Dashboard-v2/functions/` directory does not contain these handlers, and `Dashboard-v2/server/index.js` does not route them.

Impact:

File Vault, NEXOGRAM, and NEXdoc are prominent product modules, but their tracked UI code points to handlers that do not exist in the GitHub clone. An LLM reading the UI can easily infer that uploads, chat, document extraction, and context panels work, while the tracked backend cannot prove those paths.

Required remediation direction:

- Create one generated route manifest with columns: UI caller, endpoint, physical function file, server route, auth class, owner module, and deployment status.
- Fail CI when a UI endpoint has no tracked function handler.
- Clearly mark any production-only/untracked endpoints as `BLOCKED_LOCAL_STATE` rather than presenting them as repo-truth.

### R108-F03 - CRM, Focus, Meetings, Expenses, Admin System, And Onboarding Also Reference Missing Functions

Severity: High navigationability and workflow reliability risk  
Status: `C137_VERIFIED`

Evidence:

- CRM route calls missing handlers:
  - `Dashboard-v2/src/routes/pipeline/customers/+page.svelte:188-190`, `239-241`, `279-281`, `330-332`, and `1042-1044` call `/api/functions/crm-inline-edit`.
  - `Dashboard-v2/src/routes/pipeline/customers/+page.svelte:638-640` calls `/api/functions/crm-promote-to-client`.
  - `Dashboard-v2/src/routes/pipeline/customers/+page.svelte:913-915` calls `/api/functions/crm-generate-draft`.
  - `Dashboard-v2/src/routes/pipeline/customers/+page.svelte:949-951` calls `/api/functions/crm-send-email`.
- Focus route calls missing handlers:
  - `Dashboard-v2/src/routes/focus/+page.svelte:45-47` calls `/api/functions/focus-schedule-sync`.
  - `Dashboard-v2/src/routes/focus/+page.svelte:367-368` calls `/api/functions/calendar-events`.
  - `Dashboard-v2/src/routes/focus/+page.svelte:470-471` calls `/api/functions/focus-data`.
  - `Dashboard-v2/src/routes/focus/+page.svelte:1184-1186` calls `/api/functions/focus-mark-done`.
  - `Dashboard-v2/src/routes/focus/+page.svelte:1313-1315` calls `/api/functions/focus-calendar-sync`.
- Meetings route calls missing handlers:
  - `Dashboard-v2/src/routes/meetings/+page.svelte:64-67` calls `/api/functions/meetings-list`.
  - `Dashboard-v2/src/routes/meetings/+page.svelte:102-104` calls `/api/functions/meetings-update`.
- Expenses route calls missing handlers:
  - `Dashboard-v2/src/routes/expenses/+page.svelte:242-243` calls `/api/functions/expenses-list`.
  - `Dashboard-v2/src/routes/expenses/+page.svelte:280-282` calls `/api/functions/expenses-create`.
  - `Dashboard-v2/src/routes/expenses/+page.svelte:324-326` calls `/api/functions/expenses-update`.
- Admin and onboarding call missing handlers:
  - `Dashboard-v2/src/routes/admin/system/+page.svelte:100-105` calls `/api/functions/admin-system`.
  - `Dashboard-v2/src/routes/welcome/+page.svelte:195-199` calls `/api/functions/request-access`.
- The endpoint-to-function comparison shows these names have no tracked `Dashboard-v2/functions/<name>.js` and no tracked `Dashboard-v2/server/index.js` route.

Impact:

These are not obscure dev-only routes. They touch CRM edits, client promotion, AI draft generation, email sending, focus scheduling, meeting lists, expenses, system status, and user onboarding. This is a broad feature-wiring failure from the standpoint of GitHub repo truth.

Required remediation direction:

- Treat missing endpoint families as product-area blockers, not isolated 404s.
- Add endpoint family owners and expected live source: tracked function, deployed external service, retired, or intentionally blocked.
- Keep frontend route cards hidden or degraded when their backend manifest entry is missing.

### R108-F04 - Health And Alert Surfaces Can Produce False Assurance

Severity: High operational false-assurance risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/lib/health-sla.ts:40-46` defines the `Supabase realtime` service matcher as a condition ending in `|| true`, so any audit row matches realtime.
- `Dashboard-v2/src/lib/health-sla.ts:81-90` computes latest matching rows and severity from that matcher.
- `Dashboard-v2/src/routes/health/+page.svelte:23-32` loads recent audit rows and subscribes to audit log events.
- `Dashboard-v2/src/routes/health/+page.svelte:55-72` derives service counts from `serviceRollup(audit)`.
- `Dashboard-v2/src/lib/components/HealthAlertStrip.svelte:17-30` also drives red/yellow global alerts from the same rollup.
- `Dashboard-v2/src/routes/admin/system/+page.svelte:100-105` expects `/api/functions/admin-system`, but that handler is missing from tracked functions.

Impact:

The health UI can show realtime as healthy because any audit row exists, not because the realtime subsystem is actually healthy. Meanwhile the admin system page that claims a stronger heartbeat/module/audit view points to a missing handler. This can make Claudio believe monitoring is working while the repo cannot prove it.

Required remediation direction:

- Remove `|| true` and require a specific realtime heartbeat/action.
- Separate "audit rows exist" from "Supabase realtime subscription is healthy."
- Make the admin system backend source-tracked or mark the page as unavailable.
- Add negative-control tests where audit rows exist but realtime is broken.

### R108-F05 - Command Palette And Mobile Navigation Are Partial, Not A Reliable Map Of The App

Severity: Medium-High navigationability risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/lib/components/CommandPalette.svelte:96-106` hardcodes only nine navigation items: Command, Focus, Meetings, Clients, Pipeline, Revenue, Projects, Intel, and Health.
- The tracked route inventory has 41 page routes.
- `Dashboard-v2/src/lib/components/CommandPalette.svelte:115-123` loads client/ticket search directly from `entity_state` via browser Supabase helpers.
- `Dashboard-v2/src/lib/components/MobileBottomNav.svelte:8-14` exposes only Command, CHRONEX, CRM, and Chat as primary mobile slots.
- `Dashboard-v2/src/lib/components/MobileBottomNav.svelte:21-26` defines "New Note" and "Push to Telegram" quick actions whose handlers only close the sheet.
- The real quick-action modal's Telegram push path at `Dashboard-v2/src/lib/components/QuickActionModal.svelte:82-94` calls `/api/functions/telegram`, but `Dashboard-v2/server/index.js` does not route `telegram` even though the file exists.

Impact:

The command palette is not a complete app index and the mobile quick-action sheet has visible actions that do not perform the labeled operation. For a human, this is frustrating. For an LLM trying to navigate the repo, it is worse: the most discoverable surfaces are incomplete and can imply capability that is not wired.

Required remediation direction:

- Generate command palette entries from the same route manifest used by the sidebar.
- Mark actions as disabled/unavailable if their backend endpoint is missing.
- Replace no-op mobile quick actions with actual `quickAction.show(...)` calls or remove them.
- Add a navigation test that compares route files, sidebar links, mobile links, command palette entries, and endpoint dependencies.

### R108-F06 - Client-Side Auth Hints Are Not A Substitute For Backend Auth And Worsen Navigation Confusion

Severity: Medium-High security/navigation risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/routes/+layout.svelte:44-46` exempts login/auth/pitch/welcome from the auth redirect check.
- `Dashboard-v2/src/routes/+layout.svelte:50-161` performs client-side session, domain, profile, and server-cookie verification.
- `Dashboard-v2/src/routes/+layout.svelte:96-103` and `137-141` call `/api/functions/auth` with `action: "verify"`.
- Shard `105` established that `auth.js?action=verify` does not mint the cookie from GoTrue Bearer the way the frontend expects.
- `Dashboard-v2/src/routes/admin/system/+page.svelte:79-87` additionally uses a client-side admin check before loading admin data.
- Many endpoints called by pages are missing or have inconsistent auth classes from shards `104` and `105`.

Impact:

The UI looks like it has a coherent auth shell, but actual backend safety depends on each function. Because route exposure, endpoint existence, and auth dialects are inconsistent, the client-side shell can hide brokenness during normal navigation while still leaving direct function reachability ambiguous.

Required remediation direction:

- Use client-side auth only for UX redirects, never as a claimed backend control.
- Add `AUTH_CLASS` to the route manifest and render it in admin/system diagnostics.
- Reconcile `auth.js`, `auth-check.js`, `postAuthed`, and Supabase GoTrue into one documented auth path.

## Positive Controls

- `Dashboard-v2/src/lib/components/Sidebar.svelte:12-58` gives the app a structured primary navigation model.
- `Dashboard-v2/src/routes/+layout.svelte:240-357` consistently mounts sidebar, topbar, main content, audit rail, mobile nav, command palette, and quick action modal across protected pages.
- `Dashboard-v2/src/lib/db.ts:718-759` centralizes cookie-plus-Bearer helper calls through `postAuthed()` and `getAuthed()` for many routes.
- `Dashboard-v2/src/routes/admin/+page.svelte:1-12` intentionally redirects `/admin` to `/admin/members`, which is a good pattern for stable parent routes.

## Coverage Notes

Inspected directly:

```text
Dashboard-v2/src/routes/**/*.{svelte,ts}
Dashboard-v2/src/lib/components/**/*.svelte
Dashboard-v2/src/lib/stores/*.ts
Dashboard-v2/src/lib/db.ts
Dashboard-v2/src/lib/health-sla.ts
Dashboard-v2/server/index.js
Dashboard-v2/functions/*.js inventory
```

Not inspected because it is outside GitHub clone scope:

```text
production-only frontend redirects
untracked serverless functions
live reverse-proxy rewrites
live user role/profile data
browser runtime screenshots
```
