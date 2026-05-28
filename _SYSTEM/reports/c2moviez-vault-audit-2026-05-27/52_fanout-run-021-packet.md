# Fanout Run 021 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: single persistent Claude/tmux lane, active cap `1`
Required model lane: Opus worker in the existing persistent session after `/clear`

## Mission

Execute one bounded read-only target-repo shard:

`R021_TRACKER_ADMIN_CUSTOMER_MEETING_NAV_OPUS / TRACKER-ADMIN-CUSTOMER-MEETING-NAV-021`

This shard continues the Run 019 and Run 020 route wiring/navigationability family without double-counting previously covered files. It inspects high-value frontend surfaces that call tracker, CRM, meeting, pitch, and document-related functions from the browser.

The core questions are:

- whether these UI actions route to tracked backend functions;
- whether backend functions are present but unmapped, absent, or only reachable through untracked runtime layout;
- whether the files use consistent auth helpers (`getAuthed`/`postAuthed`) or raw `fetch`;
- whether the UI/navigation flow is efficient for an LLM or human to trace end-to-end from route to backend to deployment.

## Non-Negotiable Rules

- Read-only only.
- No writes to Claudio's target repository.
- No writes to YURI report files from the worker lane.
- No target execution, no dependency installs, no service starts.
- No live service calls to Plane, Microsoft, Outlook, Supabase, Telegram, Whisper, Claude, MCP servers, Caddy, Infomaniak, or any provider.
- No credential use, validation, replay, provider login, or API probing.
- Use only repository evidence from `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`.
- Do not read YURI protected runtime paths.
- Do not browse `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `.env`, `node_modules`, `.amp`, or `backend/data`.
- C-137 writes the durable report after validating your output.

## Required Clone Proof

Emit:

```text
CLONE_PROOF commit=<sha> status_count=<n> tracked_files=<n>
```

Expected:

- commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
- status count `0`
- tracked files `1505`

## Assigned Current-Tree Files

Inspect these files directly and completely:

1. `Dashboard-v2/src/routes/admin/tracker/+page.svelte`
2. `Dashboard-v2/src/routes/admin/members/+page.svelte`
3. `Dashboard-v2/src/routes/tracker/+page.svelte`
4. `Dashboard-v2/src/lib/components/tracker/CalendarView.svelte`
5. `Dashboard-v2/src/lib/components/tracker/TimeEditRequestModal.svelte`
6. `Dashboard-v2/src/routes/pipeline/customers/+page.svelte`
7. `Dashboard-v2/src/routes/meetings/studio/+page.svelte`
8. `Dashboard-v2/src/routes/admin/pitch/+page.svelte`

Read every line of every assigned file. Do not mark a file covered from search hits, summaries, or partial reads.

## Required Supporting Evidence

In addition to assigned-file coverage, perform bounded supporting reads/searches for:

- `Dashboard-v2/server/Caddyfile.template` route proxy rules.
- `Dashboard-v2/server/index.js` function route mappings.
- `Dashboard-v2/production-server.js` generic function loader and exposed route prefix.
- `Dashboard-v2/server/deploy.sh` and `Dashboard-v2/server/ecosystem.config.js` only where needed to prove deployed directory/path assumptions.
- `Dashboard-v2/src/lib/db.ts` only where needed for `getAuthed`/`postAuthed` semantics.
- `git ls-files` checks for missing proxy surfaces:
  - `Dashboard-v2/src/routes/api/**`
  - `Dashboard-v2/src/hooks.server*`
  - `Dashboard-v2/src/hooks.ts`
  - `Dashboard-v2/netlify/**`
  - `Dashboard-v2/netlify.toml`
  - `Dashboard-v2/_redirects`
  - `Dashboard-v2/_headers`
- `git ls-files` or `git show` checks for backend function files corresponding to each endpoint called by the assigned frontend files.

Supporting evidence can be cited, but do not count it as assigned target coverage unless it is one of the assigned files.

## Required Output Rows

For every assigned existing file:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
```

For any assigned or searched missing path/symbol:

```text
MISSING_PROOF target="<path-or-symbol>" command="<bounded command>" status=missing evidence="<bounded result>"
```

For every assigned-file HTTP/function call:

```text
API_CALL_MAP source="<assigned file:line>" action="<short action>" endpoint="<literal or constructed endpoint>" method="<GET|POST|DELETE|PATCH|unknown>" auth_method="<credentials_include|bearer_getAuthed|bearer_postAuthed|raw_same_origin_fetch|raw_fetch_no_credentials|supabase_client|none|unknown>" backend_file="<path|missing|unknown>" server_index_route="<path|missing>" caddy_route="<path|missing>" status="<covered|reportable|suppressed|deferred>"
```

For route alias/deployment truth:

```text
ROUTE_ALIAS_MAP prefix="<frontend prefix>" frontend_evidence="<file:line list>" caddy_target="<summary|missing>" server_target="<summary|missing>" svelte_proxy="<path|missing>" status="<covered|reportable|suppressed|deferred>"
```

For backend function existence:

```text
FUNCTION_EXISTENCE_MAP endpoint="<endpoint>" expected_function="<name>" tracked_function_file="<path|missing>" server_index_mapped="<yes|no>" generic_loader_possible="<yes|no|deployment-dependent>" status="<covered|reportable|suppressed|deferred>"
```

For admin/privileged UI boundaries:

```text
ADMIN_UI_BOUNDARY_MAP source="<assigned file:line>" action="<short action>" frontend_gate="<user.isAdmin|user.can|none|unknown>" backend_gate_visible="<yes|no|missing_function|missing_sql|unknown>" status="<covered|reportable|suppressed|deferred>"
```

For navigation/LLM ergonomics:

```text
NAVIGATIONABILITY_MAP surface="<route|component|server config>" issue="<duplicate dialect|missing function|missing mapping|auth-helper divergence|hidden runtime dependency|monolithic file|good anchor|unknown>" evidence="<repo evidence>" llm_impact="<how this affects repo navigation/auditability>" status="<covered|reportable|positive|deferred>"
```

For findings:

```text
FINDING id=R021-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|privacy|data-integrity|availability|wiring|navigation|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
```

For suppressions:

```text
SUPPRESSION path="<path>" hypothesis="<risk considered>" counterevidence="<exact counterevidence>"
```

For deferred items:

```text
DEFERRED path="<path-or-surface>" reason="<exact blocker>" next="<next read-only evidence source>"
```

Close with:

```text
BATCH_CLOSE lane=opus batch=R021 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Seeded Endpoint Checks

Be sure to include existence/mapping rows for these endpoints if they appear in assigned files:

- `tracker-plan-submit`
- `tracker-log`
- `tracker-block`
- `tracker-admin-update-entry`
- `tracker-time-edit-request`
- `tracker-admin-delete-entry`
- `tracker-admin-set-fte`
- `tracker-admin-set-working-hours`
- `tracker-absence-decide`
- `tracker-admin-set-rate`
- `member-admin-update`
- `crm-inline-edit`
- `crm-promote-to-client`
- `crm-generate-draft`
- `crm-send-email`
- `whisper-transcribe`
- `analyze-meeting`
- `push-meeting-to-obsidian`
- `mcp-server`
- `pitch-sso`

## Audit Questions

Answer from repo evidence only:

- Which assigned frontend files call `/api/functions/*`?
- Do any assigned files call `/.netlify/functions/*` directly?
- Which assigned frontend calls use `postAuthed`/`getAuthed`, and which use raw `fetch`?
- For every assigned endpoint, does a tracked function file exist?
- For every assigned endpoint, is the function mapped in `Dashboard-v2/server/index.js`?
- Which functions exist in `Dashboard-v2/functions/` but are unmapped by `server/index.js`?
- Which endpoint calls reference no tracked function at all?
- Which admin/tracker actions have only frontend gates versus repo-visible backend authorization?
- Does the Run 020 `/api/functions/*` route mismatch also apply to these assigned files?
- Which assigned route files are hardest for an LLM to navigate because they are large, mix many workflows, or depend on missing backend/runtime files?
- Which assigned files contain good local anchors or helper usage worth preserving?

## False-Positive Guards

- Do not claim a runtime 404 as fact unless repo evidence proves the production route. Use "tracked deployment config lacks..." when live deployment could contain untracked config.
- Do not count supporting `rg` hits as full assigned-file coverage. Each assigned file needs direct full read proof.
- Do not double-count Run 019 or Run 020 assigned files as new Run 021 coverage.
- Do not report frontend permission checks as backend authorization. Treat them as UX/navigation controls unless backend or SQL enforces them.
- Do not report missing backend function mapping as a security vulnerability by itself; classify as wiring/navigation/availability unless it creates a privileged bypass or security-control failure.
- For raw same-origin `fetch()`, do not automatically claim "no cookies"; browser default credentials are `same-origin`. The issue is lack of explicit helper semantics and no bearer fallback unless the code shows otherwise.
- Preserve positives such as `getAuthed`/`postAuthed`, clear `user.can` gates, field allowlists, local input validation, and route-local comments that accurately document behavior.

## C-137 Current Coverage State

Before Run 021:

- accepted assigned target coverage: `298 / 1505`
- strict semantic coverage: `296 covered + 2 partial`
- partial files: `Scripts/telegram-mcp/package-lock.json`, `Scripts/team-bots/package-lock.json`
