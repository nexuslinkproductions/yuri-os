# Fanout Run 020 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: single persistent Claude/tmux lane, active cap `1`
Required model lane: Opus worker in the existing persistent session after `/clear`

## Mission

Execute one bounded read-only target-repo shard:

`R020_APP_ROUTE_ALIAS_NAVIGATION_OPUS / APP-ROUTE-ALIAS-NAVIGATION-020`

This shard tests whether the app-wide frontend navigation and command surfaces are wired to backend functions that the tracked production server can actually expose.

Run 019 proved a tracker route dialect mismatch: frontend code calls `/api/functions/*`, while tracked Caddy/Express routes expose `/.netlify/functions/*`, and no tracked SvelteKit `/api/functions` proxy exists. Run 020 expands that question across major app routes. The goal is not to make a broad grep finding; the goal is to read the assigned files line-by-line and produce a route-by-route truth map for the assigned surfaces.

## Non-Negotiable Rules

- Read-only only.
- No writes to Claudio's target repository.
- No writes to YURI report files from the worker lane.
- No target execution, no dependency installs, no service starts.
- No live service calls to Plane, Microsoft, Outlook, Supabase, Telegram, or any provider.
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

1. `Dashboard-v2/src/routes/+layout.svelte`
2. `Dashboard-v2/src/routes/login/+page.svelte`
3. `Dashboard-v2/src/routes/schedule/+page.svelte`
4. `Dashboard-v2/src/routes/pipeline/+page.svelte`
5. `Dashboard-v2/src/routes/meetings/+page.svelte`
6. `Dashboard-v2/src/routes/admin/system/+page.svelte`
7. `Dashboard-v2/src/routes/tokens/+page.svelte`
8. `Dashboard-v2/src/routes/calendar/+page.svelte`
9. `Dashboard-v2/src/routes/intel/+page.svelte`
10. `Dashboard-v2/src/routes/nexdoc/+page.svelte`

Read every line of every assigned file. Do not mark a file covered from search hits, summaries, or partial reads.

## Required Supporting Evidence

In addition to assigned-file coverage, perform bounded supporting reads/searches for:

- `Dashboard-v2/server/Caddyfile.template` route proxy rules.
- `Dashboard-v2/server/index.js` function route mappings.
- `Dashboard-v2/production-server.js` generic function loader and exposed route prefix.
- `Dashboard-v2/server/deploy.sh` and `Dashboard-v2/server/ecosystem.config.js` only where needed to prove deployed directory/path assumptions.
- `git ls-files` checks for missing proxy surfaces:
  - `Dashboard-v2/src/routes/api/**`
  - `Dashboard-v2/src/hooks.server*`
  - `Dashboard-v2/src/hooks.ts`
  - `Dashboard-v2/netlify/**`
  - `Dashboard-v2/netlify.toml`
  - `Dashboard-v2/_redirects`
  - `Dashboard-v2/_headers`
- `git ls-files` or `git show` checks for backend function files corresponding to each endpoint called by the assigned frontend files.

Supporting evidence can be cited, but do not count it as assigned target coverage unless it is one of the 10 assigned files.

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
API_CALL_MAP source="<assigned file:line>" action="<short action>" endpoint="<literal or constructed endpoint>" method="<GET|POST|DELETE|PATCH|unknown>" auth_method="<credentials_include|bearer_getAuthed|bearer_postAuthed|raw_fetch|supabase_client|none|unknown>" backend_file="<path|missing|unknown>" server_index_route="<path|missing>" caddy_route="<path|missing>" status="<covered|reportable|suppressed|deferred>"
```

For route alias/deployment truth:

```text
ROUTE_ALIAS_MAP prefix="<frontend prefix>" frontend_evidence="<file:line list>" caddy_target="<summary|missing>" server_target="<summary|missing>" svelte_proxy="<path|missing>" status="<covered|reportable|suppressed|deferred>"
```

For backend function existence:

```text
FUNCTION_EXISTENCE_MAP endpoint="<endpoint>" expected_function="<name>" tracked_function_file="<path|missing>" server_index_mapped="<yes|no>" generic_loader_possible="<yes|no|deployment-dependent>" status="<covered|reportable|suppressed|deferred>"
```

For navigation/LLM ergonomics:

```text
NAVIGATIONABILITY_MAP surface="<route|component|server config>" issue="<duplicate dialect|missing proxy|hidden dependency|monolithic file|good anchor|unknown>" evidence="<repo evidence>" llm_impact="<how this affects repo navigation/auditability>" status="<covered|reportable|positive|deferred>"
```

For findings:

```text
FINDING id=R020-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|privacy|data-integrity|availability|wiring|navigation|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
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
BATCH_CLOSE lane=opus batch=R020 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Audit Questions

Answer from repo evidence only:

- Which assigned frontend routes call `/api/functions/*`?
- Do any assigned routes call `/.netlify/functions/*` directly?
- For every assigned endpoint, does a tracked function file exist?
- For every assigned endpoint, is the function mapped in `Dashboard-v2/server/index.js`?
- Does tracked Caddy proxy `/api/functions/*` to the backend function server?
- Does tracked SvelteKit provide a `/api/functions/*` route or hook proxy?
- Does tracked production server expose only `/.netlify/functions/:name`, or also `/api/functions/:name`?
- Are there conflicting function directory assumptions such as `Dashboard-v2/functions` versus `Dashboard-v2/netlify/functions`?
- Which route files create the highest navigation/LLM confusion because endpoint dialect, backend mapping, and deployment layout disagree?
- Which route files have good local anchors, clear auth helpers, or readable endpoint conventions worth preserving?

## False-Positive Guards

- Do not claim a runtime 404 as fact unless repo evidence proves the production route. Use "tracked deployment config lacks..." when live deployment could contain untracked config.
- Do not count supporting `rg` hits as full assigned-file coverage. Each assigned file needs direct full read proof.
- Do not double-count earlier Run 019 tracker endpoints as new Run 020 assigned coverage unless they appear in assigned files and are read in context here.
- Do not report frontend permission checks as backend authorization. Treat them as UX/navigation controls unless backend or SQL enforces them.
- Do not report missing backend function mapping as a security vulnerability by itself; classify as wiring/navigation/availability unless it creates a privileged bypass or security-control failure.
- Preserve positives such as explicit bearer helper usage, consistent endpoint naming, method intent, and clear route-local state handling.

## C-137 Current Coverage State

Before Run 020:

- accepted assigned target coverage: `288 / 1505`
- strict semantic coverage: `286 covered + 2 partial`
- partial files: `Scripts/telegram-mcp/package-lock.json`, `Scripts/team-bots/package-lock.json`
