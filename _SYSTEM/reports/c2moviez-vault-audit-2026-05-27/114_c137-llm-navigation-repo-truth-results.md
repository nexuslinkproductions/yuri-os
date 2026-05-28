# C-137 LLM Navigation And Repo-Truth Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection. No target source files mutated. No target scripts executed. No live services called.

## Scope

This shard inspects whether the GitHub clone is an efficient, trustworthy navigation surface for an LLM operator:

```text
root docs / CLAUDE.md / Home.md / NEX Operating Contract / agent definitions
  -> claimed source of truth
  -> actual tracked files and directories
  -> deployment and route instructions
  -> MCP/tool registry truth
  -> dashboard/module map
  -> risk of AI hallucinating working infrastructure
```

The conclusion is direct: the repo contains a large amount of useful operator knowledge, but it is not yet repo-truth reliable. `CLAUDE.md` declares itself authoritative, then points to missing paths, obsolete deployment layouts, absent MCP config, absent NEX Brain index files, and contradictory production process details. This is a strong root cause for high-confidence AI hallucinations about "backend automations/monitoring/syncing works" when tracked source cannot prove it.

## Findings

### R114-F01 - The Authoritative Root Map Points To Missing Canonical Paths

Severity: Critical LLM navigationability risk  
Status: `C137_VERIFIED`

Evidence:

- `CLAUDE.md:3-5` declares that the file describes what the system is and that drift should be fixed in the same change.
- `CLAUDE.md:32-62` lists the canonical vault structure, including `core/`, `nexbox/`, `tenants/`, `Dashboard-v2/supabase-migrations/`, and several `11 - NEX Brain/00 - ...` files.
- Source inventory showed the following listed paths are absent from the clone: `core/`, `nexbox/`, `tenants/`, `Dashboard-v2/supabase-migrations/`, `11 - NEX Brain/00 - Master Plan.md`, `11 - NEX Brain/00 - Roadmap.md`, `11 - NEX Brain/00 - Health Dashboard.md`, `11 - NEX Brain/_index.json`, and `11 - NEX Brain/NEX Brain.md`.
- `CLAUDE.md:64` references `Dashboard-v2/.netlify/state.json`; that file is absent from the clone.
- `CLAUDE.md:229` references `ROADMAP.md`; no root `ROADMAP.md` is tracked.

Impact:

An LLM using `CLAUDE.md` as its first navigation map will confidently believe whole productization, tenant, migration, dashboard-state, roadmap, and brain-index surfaces exist when they do not exist in the GitHub clone. This is not a cosmetic documentation issue; it directly corrupts task planning, routing, file lookup, migration assumptions, and "system health" claims.

Required remediation direction:

- Split `CLAUDE.md` into `repo-truth`, `live-state-export`, and `roadmap` sections.
- Add a generated path-validation check that fails when authoritative docs reference missing paths.
- Keep aspirational NEXBOX and tenant material in roadmap docs until the files are tracked.

### R114-F02 - Deployment Instructions Contradict The Tracked Production Shape

Severity: Critical operations and stability risk  
Status: `C137_VERIFIED`

Evidence:

- `CLAUDE.md:310-335` says the dashboard runs as PM2 `ops-dashboard` on port `3000`, with `/opt/nex/app/production-server.js` as the entry.
- `Dashboard-v2/server/Caddyfile.template:7-16` describes a split architecture: Express API on port `3001`, SvelteKit frontend on port `3002`, and Caddy routing `/.netlify/functions/*` to port `3001`.
- `Dashboard-v2/server/ecosystem.config.js:14-31` defines PM2 app `nex-api` on port `3001`.
- `Dashboard-v2/server/ecosystem.config.js:33-51` defines PM2 app `nex-frontend` on port `3002`.
- `Dashboard-v2/server/deploy.sh:16-18` runs `npm install` in `$REMOTE` and `$REMOTE/netlify/functions`.
- `Dashboard-v2/server/deploy.sh:27-28` deletes only `nex-frontend` before starting the ecosystem config, leaving the old process model ambiguous.
- `.claude/agents/nexapp-dev.md:21-26` describes yet another deployment story: SvelteKit 5, Express 5, a different VPS address than `CLAUDE.md`, PM2 `ops-dashboard` id `0`, and port `3000`.

Impact:

There are at least three production mental models in the clone: `ops-dashboard`/port 3000, split `nex-api` plus `nex-frontend` on ports 3001/3002, and old `netlify/functions` layout. A human or LLM following the wrong one can restart the wrong process, deploy to the wrong path, install dependencies in a missing directory, or believe production is fixed while the live process is untouched.

Required remediation direction:

- Generate deployment docs from `server/ecosystem.config.js`, `Caddyfile.template`, and the actual function directory.
- Remove stale PM2 names and old VPS/process details from agent prompts.
- Add a deploy preflight that checks ports, function directory, PM2 app names, and expected entry files before any restart.

### R114-F03 - MCP Tool Registry Claims Are Not Reproducible From The Clone

Severity: High LLM/tooling reproducibility risk  
Status: `C137_VERIFIED`

Evidence:

- `CLAUDE.md:184-200` says MCP servers are configured in `.mcp.json` at repo root and wrap macOS Keychain credentials.
- `.mcp.json` is absent from the GitHub clone.
- `CLAUDE.md:231-236` says `Dashboard-v2/netlify/functions/mcp-server.js` exposes HTTP MCP tools. That exact path is absent; the tracked function file exists at `Dashboard-v2/functions/mcp-server.js`.
- `11 - NEX Brain/Operating Contract.md:21-24` requires `mcp__nex-rag__verify`, `memory_check`, `review_draft`, and `search` before factual/high-stakes claims.
- `11 - NEX Brain/Operating Contract.md:124-128` says retrieval covers vault folders plus Supabase rows and live providers, but the clone cannot prove the live MCP configuration or credentials.

Impact:

The repo teaches an LLM to rely on MCP tools that the clone does not configure. This can produce false certainty: the model may claim it verified facts, checked current Plane/Outlook/Telegram state, or used NEX-RAG when the repository alone cannot make those calls available. The missing `.mcp.json` may be intentional because credentials are local, but then the clone must explicitly mark those capabilities as live-local dependencies rather than repo-truth.

Required remediation direction:

- Track a redacted `.mcp.example.json` with exact server names, commands, env variables, and expected transports.
- Add a `mcp-health` export that records which tools were actually available in a given audit/session.
- Make agent prompts say "use if available" only when the repo cannot guarantee the tool.

### R114-F04 - The Claimed Event-Bus Source Of Truth No Longer Matches The Code Architecture

Severity: High architecture/wiring truth risk  
Status: `C137_VERIFIED`

Evidence:

- `CLAUDE.md:25-30` says every mutation flows through Supabase `audit_log` and is broadcast over Supabase Realtime.
- `CLAUDE.md:125-142` diagrams every mutation flowing through `Dashboard-v2/netlify/functions/event-dispatch.js`, `audit_log`, `entity_state`, Supabase Realtime, and `Scripts/obsidian-queue-consumer.js`.
- The exact path `Dashboard-v2/netlify/functions/event-dispatch.js` is absent; the tracked file exists at `Dashboard-v2/functions/event-dispatch.js`.
- Earlier verified shards found direct browser writes and function-specific writes outside a single event-dispatch route, including `Dashboard-v2/src/lib/db.ts:331-360` for `scheduled_blocks`, `Dashboard-v2/src/lib/components/tracker/StopModal.svelte:99-102` for `time_entries`, and multiple direct function writes into Supabase tables.
- `113_c137-auth-session-realtime-client-trust-results.md` verified that the current realtime bridge uses `Scripts/soketi-bridge.js` and `Dashboard-v2/src/lib/pusher-realtime.ts`, not only Supabase Realtime.

Impact:

The docs describe a clean central command bus, but the codebase is a mixed architecture: direct browser Supabase access, direct function writes, audit-log command bus, entity-state writes, and Soketi realtime. That mixed model can be fine if documented and tested, but it cannot be safely navigated as "everything flows through event-dispatch." This is a major cause of backend hallucination because a model can infer missing central guarantees from a diagram that is no longer true.

Required remediation direction:

- Replace the single event-bus diagram with a generated write-path manifest.
- Classify each mutation path as `direct_browser_rls`, `authed_function`, `internal_function`, `audit_log_command`, `entity_state_projection`, `soketi_realtime`, or `retired`.
- Make the dashboard and agent docs link to that manifest instead of prose claims.

### R114-F05 - Agent Definitions Contain Stale Or Non-Enforceable Operational Assumptions

Severity: High AI-control-plane drift risk  
Status: `C137_VERIFIED`

Evidence:

- `11 - NEX Brain/Operating Contract.md:232-234` says the agent index reads `.claude/agents/*.md` frontmatter and refreshes every five minutes.
- `.claude/agents/nexapp-dev.md:10` declares model `claude-opus-4-7`.
- `.claude/agents/nexapp-dev.md:21-26` describes dashboard stack/deploy/process details that conflict with `CLAUDE.md` and `Dashboard-v2/server/ecosystem.config.js`.
- `.claude/agents/nexapp-dev.md:41-60` declares a canonical module route tree with `/finance`, `/crm`, and `/timetracking`, while the tracked routes contain `/revenue`, `/expenses`, `/tracker`, and no `Dashboard-v2/src/routes/finance`, `crm`, or `timetracking` directories.
- `.claude/agents/nexapp-dev.md:64-67` says modules read through `Dashboard-v2/src/lib/supabase.ts` and write through `event-dispatch.js`; the tracked shared client is `Dashboard-v2/src/lib/db.ts`, and multiple writes bypass a single event-dispatch path.
- `.claude/agents/designer.md:5` and `.claude/agents/web-dev.md:5` grant broad `Write`, `Edit`, `Bash`, Supabase, Plane, and Telegram tool surfaces in prompt metadata.

Impact:

The agent registry is useful, but it is not source-of-truth safe. It mixes desired workflow, old module names, stale deploy targets, and broad tool authority. If Claude routes through these definitions, it can select an agent based on a stale map and then operate with too much authority for the actual task. This is especially risky in a repo where Telegram and Claude/tmux can mutate operational systems.

Required remediation direction:

- Validate agent frontmatter against actual route, module, deploy, and model registries.
- Split agent permission profiles by task class: read-only audit, code edit, live ops, external messaging, and deployment.
- Remove stale route trees from prompts or generate them from `Dashboard-v2/src/routes`.

### R114-F06 - Runtime/LaunchAgent Counts And Names Are Not Repo-Reconstructable

Severity: High monitoring false-assurance risk  
Status: `C137_VERIFIED`

Evidence:

- `CLAUDE.md:287-303` claims 41 active LaunchAgents and lists many labels, including older `exeo-*`, Telegram, finance, Plane, and watchdog processes.
- The tracked `Scripts/launchagents-staged/` directory contains 20 plist files.
- Source inventory found several names implied by `CLAUDE.md` are not present as tracked root scripts or staged plists in the GitHub clone, including examples such as `telegram-poller`, `exeo-wake`, `realtime-smoke`, `watchdog`, `finance-ingest`, `finance-server`, and `auto-backup` in the expected locations.

Impact:

The docs may reflect Claudio's local machine, but the GitHub clone cannot reconstruct that runtime. A monitoring dashboard or LLM health pass can report "41 agents active" or reason from old labels while the tracked source only supports a subset. This is exactly the false-assurance pattern the audit is testing for: live state is asserted in docs, but not exported as verifiable source truth.

Required remediation direction:

- Track a runtime manifest separate from staged plist files.
- Export live `launchctl`/PM2/tmux state into a redacted snapshot when performing audits.
- Mark any non-tracked local agents as `local-only` with owner, purpose, and current source path.

### R114-F07 - The Root Onboarding Surface Is Thin For A Repo That Expects LLM Operation

Severity: Medium-high navigationability risk  
Status: `C137_VERIFIED`

Evidence:

- The repo root has `CLAUDE.md` and `Home.md` but no tracked `README.md`, `AGENTS.md`, `ROADMAP.md`, or root package manifest.
- `Home.md:126-140` lists active tools and code repos, but points at local machine paths rather than a reproducible GitHub onboarding flow.
- The repo has multiple package islands: `Dashboard-v2`, `Dashboard-v2/functions`, `Scripts`, `Scripts/nex-rvf`, `Scripts/telegram-mcp`, `Scripts/team-bots`, `Scripts/finance-mcp`, and a client Figma Make package.
- No single tracked manifest tells an LLM which package is production, which packages are local daemons, which are experiments, which are archived, and which are client artifacts.

Impact:

For an LLM, this increases search cost and hallucination risk. The model has to infer active/runtime/archive boundaries from prose, folder names, and stale comments. That is how broad, expensive, low-precision runs happen. It also makes it hard to prove that every line has been audited because there is no authoritative package/runtime inventory to close against.

Required remediation direction:

- Add a root `README.md` or `REPO_TRUTH.md` generated from manifests.
- Add package/runtime status fields: `active_prod`, `active_local`, `scheduled`, `client_artifact`, `experiment`, `retired`.
- Add machine-readable route, function, scheduler, MCP, package, and data-schema manifests.

## Positive Controls Observed

- `CLAUDE.md:3-5` contains the right operating principle: authoritative docs should reflect reality and drift should be corrected immediately.
- `11 - NEX Brain/Operating Contract.md:21-24` contains strong anti-hallucination rules: verify before factual claims and review high-stakes content.
- `.claude/agents/ops-guardian.md:1-40` shows useful role separation by forbidding direct CEO Telegram sends for that agent.
- The repo does contain enough code to build a strong manifest-driven navigation layer; the problem is drift and missing generated truth, not lack of raw material.

## Coverage Boundary

This pass inspects the GitHub clone as an LLM navigation source. It does not prove Claudio's live machine is missing the absent files or MCP config. It proves that the GitHub clone, by itself, is not sufficient to support the authoritative claims made by its own docs.
