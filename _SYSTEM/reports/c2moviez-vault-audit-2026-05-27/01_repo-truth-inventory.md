# Repo Truth Inventory

Date: 2026-05-27
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Target repo: `c2moviezfpv/c2moviez-vault`
Mode: read-only tracked Git inventory, redacted-sensitive posture

## Source Resolution

Available evidence source:

- Full materialized Git remote tracked content at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`.
- Canonical full local audit clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`.
- GitHub metadata available to the authenticated read-only audit session.

Blocked evidence source:

- Untracked/local-only target files are not accessible from GitHub or Git history.
- Target untracked audit needs Claudio's actual working directory, archive, mounted volume, or another local source.
- Claudio-local runtime state, installed LaunchAgents, local logs, local `.env`, Keychain values, process tables, memory/CPU evidence, and provider dashboards remain blocked until owner export or read-only procedure is available.

Materialization note:

- Earlier blobless/no-checkout clones were useful for Git-object proof but were not full working-tree materializations.
- The canonical clone is now fully materialized and clean. Rick lanes may inspect local files there, but final coverage evidence still needs Git-object-backed path/line proof.

## Maximum Obtainable Source Inventory

GitHub/Git evidence currently obtainable from our side:

```text
REPO origin=https://github.com/c2moviezfpv/c2moviez-vault.git
REPO visibility=PRIVATE
REPO default_branch=main
REPO canonical_clone=/tmp/yuri-c2moviez-vault-full.b1RopZ/repo
REPO clean_status_count=0
BRANCH origin/main sha=8103286e1abc63fa9490cb1375ecde4f340aa2bb tracked_paths=1505 commits=303
BRANCH origin/claude/objective-tharp-b04a32 sha=ca26458fa8d1adef061faf0684147729aea02f6c tracked_paths=738 commits=109
COMMITS visible_refs_total=304
TAGS visible_count=0
PR_REFS visible_count=0
PULL_REQUESTS listed_count=0
ISSUES listed_count=0
WORKFLOWS listed_count=0
LFS_POINTERS head_scan_count=0
SUBMODULES shown_count=0
GITHUB wiki_enabled=false
GITHUB discussions_enabled=false
GITHUB issues_enabled=true
GITHUB projects_enabled=true
```

Scope implication:

- `origin/main` current tracked content is fully cloned locally.
- `origin/claude/objective-tharp-b04a32` must be audited as a visible side branch before any final "full repo" claim.
- Git history must be searched for deleted secrets and high-risk removed code before final credential/security closure.
- GitHub issues/PR/workflow surfaces currently appear empty or unavailable through the current read, but this should be rechecked near final report assembly.

## Repository Shape

Tree facts:

```text
HEAD 8103286e1abc63fa9490cb1375ecde4f340aa2bb
FILE_COUNT total_tracked_paths=1505
```

Top-level tracked path counts:

```text
FILE_COUNT path="02 - Clients" count=657
FILE_COUNT path="Dashboard-v2" count=333
FILE_COUNT path="Scripts" count=259
FILE_COUNT path="05 - Work Items" count=80
FILE_COUNT path=".obsidian" count=26
FILE_COUNT path="03 - Projects" count=22
FILE_COUNT path="07 - Resources" count=19
FILE_COUNT path="04 - Team" count=18
FILE_COUNT path="01 - Daily Briefings" count=17
FILE_COUNT path=".claude" count=16
FILE_COUNT path="06 - Processes" count=10
FILE_COUNT path="12 - SILASWIRTH" count=8
FILE_COUNT path="11 - NEX Brain" count=7
```

Dominant file extensions:

```text
FILE_COUNT extension=png count=282
FILE_COUNT extension=js count=247
FILE_COUNT extension=md count=230
FILE_COUNT extension=jpg count=102
FILE_COUNT extension=ttf count=90
FILE_COUNT extension=html count=90
FILE_COUNT extension=svelte count=88
FILE_COUNT extension=tsx count=64
FILE_COUNT extension=json count=60
FILE_COUNT extension=sh count=52
FILE_COUNT extension=pdf count=34
FILE_COUNT extension=sql count=30
FILE_COUNT extension=ts count=21
FILE_COUNT extension=plist count=21
```

Executable-ish tracked file distribution:

```text
FILE_COUNT path="Scripts" executableish=207
FILE_COUNT path="Dashboard-v2" executableish=197
FILE_COUNT path="02 - Clients" executableish=70
FILE_COUNT path=".obsidian" executableish=5
```

Navigation smell:

- Several tracked paths include leading quotes or quote-suffixed extensions, e.g. `"02 - Clients`, `"16 - Meetings`, `md"`, `html"`, `command"`, `docx"`.
- This suggests shell quoting mistakes or accidental files with literal quote characters in names. Needs validation from full tree listing before rating severity.

## External Live-Service Surface Inventory

Marcel clarified that live external services are in scope for read-only, non-mutating assessment. This inventory is repo-evidenced only; no live external service has been probed yet.

| Service surface | C-137 verified repo evidence | Primary risk categories | Read-only live checks to design |
| --- | --- | --- | --- |
| `ops.c2moviez.com` dashboard | `CLAUDE.md:21-22`, `Dashboard-v2/functions/auth-check.js:91`, `Dashboard-v2/functions/shared.js:5`, `Dashboard-v2/server/deploy.sh:36` | exposed function surface, CORS/auth drift, stale deploy claims | `HEAD`/`GET`/`OPTIONS` for headers, CORS, auth denial, public endpoints, route exposure |
| Infomaniak VPS/deploy surface | `CLAUDE.md:310`, `CLAUDE.md:410`, `Dashboard-v2/server/deploy.sh:2-8`, `Dashboard-v2/server/deploy.sh:16-28` | SSH/deploy authority, parallel production surface, server/process drift | read-only TLS/banner/header checks, owner-provided SSH read-only process/config inventory if authorized credentials are available |
| Netlify/deploy/function surface | `CLAUDE.md:64`, `CLAUDE.md:199`, `Dashboard-v2/functions/auth.js:15-26`, `Dashboard-v2/functions/outlook-subscribe.js:21` | stale/decommissioned surface, env var exposure, function enumeration | verify whether Netlify endpoints still exist and return expected non-mutating responses |
| Supabase REST/Storage/Realtime/RLS | `Dashboard-v2/functions/config-public.js:27-31`, `Dashboard-v2/functions/shared-telegram.js:35-57`, `Dashboard-v2/functions/auth.js:39-44`, `Dashboard-v2/functions/event-dispatch.js:40-45` | RLS bypass, public anon exposure, storage bucket exposure, audit-log injection | read-only anon/auth/service-role scope map, `select`-only RLS probes, storage metadata reads, realtime subscription checks |
| Plane.so | `Dashboard-v2/functions/shared-plane.js:13-19`, `Dashboard-v2/functions/shared-plane.js:74-81`, `Dashboard-v2/functions/shared-plane.js:101-108`, `Dashboard-v2/functions/plane-webhook.js` | API key scope, webhook authenticity, write-capable helpers, rate exhaustion | token scope/read-only list checks, webhook unauthenticated denial behavior, no ticket mutation |
| Telegram Bot API | `Dashboard-v2/functions/shared-telegram.js:16-18`, `Dashboard-v2/functions/shared-telegram.js:61-69`, `Dashboard-v2/functions/event-dispatch.js:107-124`, `Scripts/telegram-mcp/poller.js:572` | bot-token scope, unauthorized send, command/prompt injection, inbox poisoning | bot identity/read-only metadata only; no `sendMessage`; inspect allowed users from local/runtime config if provided |
| Microsoft Graph / Outlook | `Dashboard-v2/functions/outlook-subscribe.js:26-43`, `Dashboard-v2/functions/outlook-subscribe.js:56-60`, `Dashboard-v2/functions/outlook-subscribe.js:89-125`, `Scripts/finance-mcp/lib/graph-client.js:57-91` | OAuth app scope, subscription lifecycle, calendar/mail metadata exposure | token/scopes, subscription listing, mailbox/calendar read-only sampling, webhook validation without creating subscriptions |
| Bexio finance/ERP | `Scripts/finance-mcp/lib/bexio-client.js:20-28`, `Scripts/finance-mcp/lib/bexio-client.js:49-58`, `Scripts/finance-mcp/lib/bexio-client.js:153-155`, `Dashboard-v2/functions/offer-create.js:65-83` | financial data exposure, over-scoped token, accidental invoice/contact writes | read-only token/scope/account checks and GET/list calls; no invoice/contact/file creation |
| Anthropic Claude API | `Dashboard-v2/functions/shared.js:27-46`, `Dashboard-v2/functions/fanny-ai.js:46-64`, `Dashboard-v2/functions/mcp-server.js:21` | API key exposure, cost burn, prompt-injection through proxy surfaces | key presence/scope/account metadata if available; no generation unless explicitly part of a bounded read-only test |
| OpenAI Whisper/API | `Dashboard-v2/functions/chat.js:331-374`, `Dashboard-v2/functions/transcribe.js`, `Dashboard-v2/functions/whisper-transcribe.js` | API key exposure, audio data handling, cost burn | account/key metadata only unless a bounded synthetic audio test is approved |
| Infomaniak AI API | `Scripts/lib/infomaniak-ai.js:19-20`, `Scripts/lib/infomaniak-ai.js:63-83`, `Scripts/lib/infomaniak-ai.js:102-120` | AI key exposure, model/cost behavior, data residency claims | model list/account metadata reads; no production prompt traffic unless separately approved |
| Hugging Face/model supply chain | `Scripts/nex-rvf/local-models/models.json`, `Scripts/nex-rvf/lib/embedder.js` | model poisoning, unpinned downloads, resource exhaustion | verify model identifiers, hashes/provenance if present, download policy, no large downloads by default |

Live-service blockers:

- `BLOCKED_LOCAL_STATE`: credentials, keychain entries, provider dashboards, server shells, `.mcp.json`, runtime env, and untracked local files are not available in the current GitHub-tracked source.
- `BLOCKED_PROCEDURE`: each live-service scan still needs a per-provider read-only procedure before execution, including target, method, credential class, non-mutation guarantee, rate limit, and stop condition.
- `BLOCKED_SECRET_HANDLING`: if credentials are provided, reports must record presence/scope/fingerprint only, never raw secret values.

## Credential And Password Exposure Inventory Scope

Forced discovery is in scope for API keys, bot tokens, OAuth client secrets, passwords, password hashes, database URLs, service-role keys, webhook secrets, SSH/deploy materials, private keys, and unsafe credential storage patterns.

Hard rule:

- Discovered credentials and passwords must not be used to authenticate, connect, retrieve data, validate access, rotate tokens, or prove exploitability.
- Reports may include only secret type, path, line, redacted fingerprint or hash prefix, service guess, risk, and `use_status=NOT_USED`.
- Raw secret values must not be copied into YURI reports.

Preliminary C-137 verified exposure candidate:

| ID | Status | Type | Evidence | Redacted fingerprint | Risk | Use status |
| --- | --- | --- | --- | --- | --- | --- |
| `C137-SECRET-001` | `CONFIRMED_EXPOSED` | Obsidian Local REST API key | `.obsidian/plugins/obsidian-local-rest-api/data.json:5` | `len=64 sha256=36d13ab8c1a08154` | If this tracked key is active, anyone with local/network access to the plugin endpoint may authenticate to the Obsidian Local REST API. Reachability still needs local/live validation. | `NOT_USED` |
| `C137-SECRET-002` | `CONFIRMED_EXPOSED` | TLS certificate/private-key material for Obsidian Local REST API | `.obsidian/plugins/obsidian-local-rest-api/data.json:7-9` | `cert len=1271 sha256=75f33acf51a6f96b`; `privateKey len=1777 sha256=9ce2305f5081c551`; `publicKey len=497 sha256=41a767cac96a5494` | Tracked private-key material should be considered compromised if this config is real/current. Impact depends on plugin binding, trust, and whether the keypair is still active. | `NOT_USED` |

Initial repo-evidenced secret-reference surfaces:

| Surface | Evidence | Secret material class | Current disposition |
| --- | --- | --- | --- |
| Dashboard auth | `Dashboard-v2/functions/auth.js:18-21`, `Dashboard-v2/functions/auth-check.js:104-115` | `AUTH_SECRET`, password hash, service-role key, internal service key | `SECRET_REFERENCE_ONLY` until values are provided or found |
| Public config | `Dashboard-v2/functions/config-public.js:27-31` | Supabase URL and anon key intentionally public | `WEAK_STORAGE_PATTERN_CHECK` because RLS must carry the security boundary |
| Telegram | `Dashboard-v2/functions/shared-telegram.js:61-69`, `Scripts/exeo-daemon.js:60-65` | bot token, allowed users, chat IDs | `SECRET_REFERENCE_ONLY`; bot token must never be used by YURI |
| Plane | `Dashboard-v2/functions/shared-plane.js:13-19`, `Dashboard-v2/functions/shared-plane.js:74-108` | `PLANE_API_KEY` with read/write helpers | `SECRET_REFERENCE_ONLY`; scope review required if value is found |
| Microsoft Graph | `Dashboard-v2/functions/outlook-subscribe.js:33-43`, `Scripts/finance-mcp/lib/graph-client.js:57-91` | tenant ID, client ID, client secret | `SECRET_REFERENCE_ONLY`; app permission review required |
| Bexio | `Scripts/finance-mcp/lib/bexio-client.js:20-28`, `Scripts/finance-mcp/lib/bexio-client.js:49-58` | API token in env/keychain | `SECRET_REFERENCE_ONLY`; no Bexio call with found token |
| Anthropic/OpenAI/Infomaniak AI | `Dashboard-v2/functions/shared.js:27-46`, `Dashboard-v2/functions/chat.js:331-374`, `Scripts/lib/infomaniak-ai.js:63-83` | AI API keys | `SECRET_REFERENCE_ONLY`; cost-burn and data-exposure risk |
| Deploy/SSH | `Dashboard-v2/server/deploy.sh:2-8`, `Dashboard-v2/server/deploy.sh:16-28` | SSH identity reference, server env file | `SECRET_REFERENCE_ONLY`; server access not used |

## Main Product Surfaces

### Dashboard-v2

Tracked indicators:

```text
FILE_COUNT path="Dashboard-v2/functions/*.js" count=83
FILE_COUNT path="Dashboard-v2/db-migrations/*.sql" count=25
```

`CLAUDE.md` claims the repo hosts "51 functions" powering `ops.c2moviez.com`. Tracked Git currently has 83 JavaScript files under `Dashboard-v2/functions/`.

Disposition:

```text
CLAIM source=CLAUDE.md line=21 status=drift_candidate evidence="Dashboard-v2/functions/*.js count=83"
```

Important function families visible by name:

- auth: `auth.js`, `auth-check.js`
- webhook/event: `event-dispatch.js`, `plane-webhook.js`, `outlook-webhook.js`
- Telegram: `telegram.js`, `telegram-team.js`, `telegram-proactive.js`, `telegram-calendar-watch.js`, digest/prebrief/eod/fact-change functions
- RAG/AI: `chat.js`, `deep-learning.js`, `nex-rag-query.js`, `predictive-intel.js`, `context-engine.js`
- MCP: `mcp-server.js`
- tracker/time/admin: many `tracker-*` functions
- storage/shared helpers: `shared-*.js`

Package summary:

```json
{
  "path": "Dashboard-v2/package.json",
  "name": "c2moviez-dashboard-v2",
  "private": true,
  "type": "module",
  "scripts": ["dev", "build", "preview", "check", "check:watch"],
  "dependencies": ["@supabase/supabase-js", "@sveltejs/adapter-node", "bits-ui", "dotenv", "express"],
  "devDependencies": ["@sveltejs/adapter-netlify", "@sveltejs/kit", "@sveltejs/vite-plugin-svelte", "svelte", "svelte-check", "typescript", "vite"]
}
```

```json
{
  "path": "Dashboard-v2/functions/package.json",
  "type": "commonjs",
  "dependencies": ["bcryptjs", "zod"]
}
```

### Scripts

Tracked indicators:

```text
FILE_COUNT path="Scripts" count=259
FILE_COUNT path="Scripts/*.plist and Scripts/launchagents-staged/*.plist" count=21
```

Control surfaces visible by name:

- daemon/session: `exeo-daemon.js`, `exeo-daemon-tmux.sh`, `start-claude-telegram.sh`
- Telegram/MCP: `telegram-mcp/server.js`, `telegram-mcp/poller.js`, `telegram-mcp/silas-poller.js`, `nexogram-bridge.js`
- Obsidian/Plane sync: `obsidian-queue-consumer.js`, `obsidian-to-plane.js`, `plane-sync.py`, `vault-watch.js`, `vault-file-sync.js`
- health/watchdogs: `daemon-stuck-watch.js`, `watchdog.sh`, `watchdog-realtime.js`, `check-fleet-health.js`, `nex-heartbeat.js`
- self-repair: `nex-self-healer.js`, `launchagents-staged/com.c2moviez.nex-self-healer.plist`
- RAG/RVF/local model: `Scripts/nex-rvf/*`, `Scripts/nex-rvf/local-models/*`
- finance: `Scripts/finance-mcp/*`

Package summaries:

```json
{
  "path": "Scripts/package.json",
  "name": "c2moviez-scripts",
  "private": true,
  "scripts": ["briefing"],
  "dependencies": ["@supabase/supabase-js", "pg"]
}
```

```json
{
  "path": "Scripts/nex-rvf/package.json",
  "name": "nex-rvf",
  "private": true,
  "type": "module",
  "scripts": ["start", "backfill", "doctor"],
  "dependencies": ["@modelcontextprotocol/sdk", "@claude-flow/embeddings", "@claude-flow/memory", "agentic-flow", "@xenova/transformers"]
}
```

```json
{
  "path": "Scripts/telegram-mcp/package.json",
  "name": "c2moviez-telegram-mcp",
  "type": "module",
  "main": "server.js",
  "dependencies": ["@modelcontextprotocol/sdk"]
}
```

```json
{
  "path": "Scripts/finance-mcp/package.json",
  "name": "c2moviez-finance-mcp",
  "type": "commonjs",
  "scripts": ["start", "init-db"],
  "dependencies": ["@modelcontextprotocol/sdk", "better-sqlite3", "fast-xml-parser"]
}
```

### RAG/RVF

Tracked indicators:

```text
FILE_COUNT path="Scripts/nex-rvf" count=61
```

Visible modules:

- `server.js`
- `backfill.js`, `backfill-bge.js`, `refresh.sh`
- `lib/embedder.js`, `lib/embedder-health.js`
- `lib/memory.js`, `lib/state.js`, `lib/pgmirror.js`
- `lib/vault-apply.js`, `lib/vault-frontmatter-edit.js`, `lib/walker.js`
- smoke scripts: `smoke-memory.js`, `smoke-search-bge.js`, `smoke-loop-b.js`, `smoke-verify.js`, etc.
- local model service: `local-models/serve.py`, `serve.sh`, `models.json`, `requirements.txt`

Risk hypothesis:

- This is a priority RAM/CPU audit shard because it combines embeddings, local models, pgvector, vault walking, backfill/refresh jobs, and LaunchAgents.

### LaunchAgents

Tracked plists:

```text
FILE_COUNT launchagent_plists_tracked=21
```

Tracked names include:

- `com.c2moviez.hosting-alerts`
- `com.c2moviez.ceo-correction-detector`
- `com.c2moviez.client-organizer`
- `com.c2moviez.nex-backup`
- `com.c2moviez.nex-caffeinate`
- `com.c2moviez.nex-canonical-drift`
- `com.c2moviez.nex-decision-recorder`
- `com.c2moviez.nex-embed-refresh`
- `com.c2moviez.nex-heartbeat`
- `com.c2moviez.nex-local-models`
- `com.c2moviez.nex-log-rotate`
- `com.c2moviez.nex-loop-b`
- `com.c2moviez.nex-module-status`
- `com.c2moviez.nex-outcome-reconcile`
- `com.c2moviez.nex-registry-scan`
- `com.c2moviez.nex-self-healer`
- `com.c2moviez.ticket-completeness`

Selected schedule facts from tracked plists:

- `client-organizer`: `WatchPaths` over clients, meeting notes, and team folders; `ThrottleInterval=10`; `RunAtLoad=true`.
- `nex-caffeinate`: `KeepAlive=true`; `RunAtLoad=true`; `ThrottleInterval=10`.
- `nex-local-models`: runs `local-models/serve.sh`; binds `127.0.0.1:8765`; `RunAtLoad=true`; `KeepAlive` success=true; `ThrottleInterval=30`; includes integer `4096` in the plist.
- `nex-embed-refresh`: `StartInterval=1800`; `RunAtLoad=true`; `ThrottleInterval=60`.
- `nex-module-status`: `StartInterval=900`; `RunAtLoad=true`.
- `nex-registry-scan`: `StartInterval=300`; `ThrottleInterval=300`; `RunAtLoad=true`; watches LaunchAgents, `.claude/agents`, `.mcp.json`, and team bots.
- Several daily jobs run around `00:15` to `00:25`, including memory audit, outcome reconcile, loop-b, and canonical drift.

Risk hypothesis:

- The runtime-stability pass should check lock/lease behavior, overlap control, and whether midnight jobs can stack with `RunAtLoad` or self-healing restarts.

Doc drift candidate:

- `CLAUDE.md` says "41 active plists" and also says "The 38:" before listing names. Tracked repo contains 21 plist files, but installed local LaunchAgents may include untracked/user-level plists. This stays `unverified` until local machine state is available.

```text
CLAIM source=CLAUDE.md line=289 status=unverified_local_state evidence="tracked plist count=21; live ~/Library/LaunchAgents unavailable"
```

### Claude Agent Specs

Tracked `.claude/agents` specs:

```text
FILE_COUNT path=".claude/agents" count=16
```

Names:

- `commitment-keeper`
- `construction-architect`
- `cto`
- `designer`
- `finance-keeper`
- `intel-analyst`
- `iso-auditor`
- `knowledge-curator`
- `meeting-coordinator`
- `nexapp-dev`
- `night-digest`
- `ops-guardian`
- `qms-keeper`
- `sales-coach`
- `web-dev`
- archived `self-healer` merge marker

Risk hypothesis:

- These are agentic behavior definitions and should be audited under OWASP Agentic Skills style controls: tool authority, write boundaries, memory use, human approval points, and stale role claims.

### Obsidian

Tracked community plugins:

```json
[
  "calendar",
  "dataview",
  "templater-obsidian",
  "claudian",
  "obsidian-local-rest-api",
  "breadcrumbs",
  "smart-composer",
  "smart-connections",
  "juggl"
]
```

Risk hypothesis:

- `obsidian-local-rest-api`, `claudian`, `smart-composer`, and `smart-connections` are high-interest surfaces for local API exposure, AI prompt/data flow, and derived embedding/runtime state. Full validation needs plugin configuration and local runtime state.

## Test And Verification Surface

Tracked names with test/smoke/check/audit/verify/health signals include:

- `Dashboard-v2/functions/health.js`
- `Dashboard-v2/src/lib/health-sla.ts`
- `Scripts/check-fleet-health.js`
- `Scripts/fanny-bot-healthcheck.sh`
- `Scripts/preflight-check.sh`
- `Scripts/realtime-smoke-test.js`
- `Scripts/ticket-completeness-check.js`
- `Scripts/verify-onboarding.js`
- `Scripts/nex-rvf/local-health-smoke.cjs`
- `Scripts/nex-rvf/smoke-*.js`
- `Scripts/nex-rvf/lib/verify.js`
- `Scripts/nex-rvf/lib/verify-kinds.js`
- `Scripts/nex-rvf/audit-canonical-vault-drift.js`
- `Scripts/nex-rvf/memory-audit.js`

Risk hypothesis:

- Presence of smoke/health scripts is a strength only if they are deterministic, fail-closed, wired into actual release/runtime gates, and not merely "green dashboard" indicators.

## Immediate Contradictions / Drift Candidates

1. `CLAUDE.md` line 21 says 51 functions; tracked `Dashboard-v2/functions/*.js` count is 83.
2. `CLAUDE.md` line 289 claims 41 active plists and then introduces "The 38"; tracked plist count is 21, while live local LaunchAgent state is unavailable.
3. `CLAUDE.md` includes paths such as `core/`, `nexbox/`, and `tenants/` in the vault structure, but these top-level folders were not present in the tracked top-level tree. This needs a direct claim-ledger pass before rating.
4. `CLAUDE.md` points to a master plan at `~/.claude/plans/is-there-an-actual-noble-crystal.md`; this is local protected/user state and not available in tracked Git evidence.

## Priority Shards For Next Audit Phase

1. Telegram-to-Claude control path:
   - `Scripts/start-claude-telegram.sh`
   - `Scripts/exeo-daemon.js`
   - `Scripts/exeo-daemon-tmux.sh`
   - `Scripts/telegram-mcp/server.js`
   - `Scripts/telegram-mcp/poller.js`
   - dashboard `telegram*.js`

2. CPU/RAM and loop stability:
   - `Scripts/nex-rvf/*`
   - `Scripts/nex-rvf/local-models/*`
   - LaunchAgent plists with `KeepAlive`, `RunAtLoad`, short `StartInterval`, or `WatchPaths`
   - `Scripts/watchdog*`, `Scripts/nex-self-healer.js`, `Scripts/daemon-stuck-watch.js`

3. Source-of-truth and hallucinated health:
   - `Dashboard-v2/functions/health.js`
   - `Dashboard-v2/src/lib/health-sla.ts`
   - `Scripts/check-fleet-health.js`
   - `Scripts/nex-heartbeat.js`
   - `Scripts/nex-rvf/refresh-module-status.js`

4. Security:
   - `Dashboard-v2/functions/auth*.js`
   - `Dashboard-v2/functions/*webhook*.js`
   - `Dashboard-v2/functions/mcp-server.js`
   - `Dashboard-v2/functions/shared-*.js`
   - `Scripts/*mcp*`
   - `Scripts/*sync*`

5. Agentic AI / RAG:
   - `.claude/agents/*.md`
   - `Scripts/nex-rvf/server.js`
   - `Scripts/nex-rvf/lib/*`
   - `Dashboard-v2/functions/chat.js`
   - `Dashboard-v2/functions/nex-rag-query.js`

## Inventory Verdict

This is not a small vault with a dashboard. It is a dense operational automation repo combining:

- Obsidian knowledge base;
- client artifacts;
- SvelteKit/Express dashboard;
- Netlify-style functions;
- Supabase migrations and runtime functions;
- Plane/Outlook/Telegram sync;
- local LaunchAgents;
- MCP servers;
- RAG/embedding/local model stack;
- Claude agent specs;
- finance automation.

The first professional audit should not start with random vulnerability hunting. It should start with control-plane decomposition, installed/runtime source resolution, and a claim ledger against `CLAUDE.md`.
