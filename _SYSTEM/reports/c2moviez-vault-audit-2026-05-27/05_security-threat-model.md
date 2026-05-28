# C2Moviez Vault Security Threat Model

Date: 2026-05-27
Target: `c2moviezfpv/c2moviez-vault`
Commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Mode: GitHub-obtainable, read-only, no credential use

## System Shape

`c2moviez-vault` is an Obsidian business vault plus operational software stack. Repository evidence shows:

- an Obsidian vault with client, finance, team, meeting, work-item, and strategy data;
- `Dashboard-v2`, a SvelteKit/Express/Netlify/Infomaniak-facing operations dashboard for `ops.c2moviez.com`;
- many serverless/Express-style functions under `Dashboard-v2/functions`;
- Supabase-backed data, audit logs, realtime channels, RLS migrations, storage, and dashboard state;
- Plane, Telegram, Microsoft Graph/Outlook, Bexio, Anthropic, OpenAI, Infomaniak AI, and local MCP/RAG integrations;
- local automation scripts, LaunchAgent plists, watchdogs, queue consumers, sync jobs, and model/RAG backfill code under `Scripts`;
- Claude agent profiles and MCP wrapper references that imply high-authority tool paths.

This threat model treats the repository as an agentic operations control plane, not a static note archive.

## Assets And Privileges

Primary assets:

- client records, proposals, contracts, invoices, meeting notes, internal team data, strategy notes, and sales pipeline data;
- Supabase tables, storage buckets, audit logs, realtime channels, service-role keys, anon/publishable keys, JWT/session material, and RLS policies;
- Plane work items, customers, projects, cycles, webhooks, API keys, and sync state;
- Telegram bots, chat IDs, allowed-user lists, command handlers, webhook/polling state, and message content;
- Microsoft Graph tenants, OAuth app credentials, subscriptions, mailbox/calendar metadata, and webhook validation secrets;
- Bexio finance API tokens, imported bank/accounting data, SQLite finance database, invoice artifacts, and export bundles;
- Obsidian Local REST API auth material, local vault write authority, plugin TLS keys, and vault file paths;
- local tmux/Claude sessions, MCP tools, RAG indexes, model caches, and automation state;
- deploy authority for Netlify/Infomaniak/VPS surfaces and SSH identity references.

High-value privileges:

- any service-role or admin token that bypasses RLS or provider authorization boundaries;
- any webhook secret that authenticates provider-originated mutations;
- any bot token or MCP server that can cause messages, file writes, issue updates, SQL execution, deploys, or agent tool calls;
- any local script or LaunchAgent that can loop, mutate vault files, sync to providers, or call an LLM/API repeatedly.

## Trust Boundaries

Important trust boundaries:

- internet request to dashboard/function route;
- provider webhook to local/serverless mutation path;
- Telegram message to bot handler to Claude/MCP/automation command;
- Obsidian file edit to sync worker to Plane/Supabase/dashboard;
- Supabase anon client to database policies and storage policies;
- service-role/server-side code to Supabase privileged operations;
- model/RAG retrieval content to agent instruction and tool selection;
- local LaunchAgent/watchdog to production-facing automations;
- Git-tracked config to local runtime secret stores;
- generated docs/dashboards to operator decision-making.

Boundary assumptions:

- This trial can prove Git-tracked evidence and visible GitHub metadata only.
- Claudio-local `.env`, Keychain, installed LaunchAgents, logs, process tables, and provider dashboards are out of scope unless later exported or made available through an owner-approved read-only procedure.
- Discovered secrets are never used by YURI. Their presence in Git is enough for repository-exposure findings.

## Attacker-Controlled Inputs

Potential attacker-controlled or low-trust inputs include:

- public or authenticated dashboard/function HTTP request bodies, query strings, headers, CORS origins, and uploaded files;
- Telegram messages, callbacks, chat IDs, forwarded content, and command arguments;
- Plane webhook payloads, issue/customer fields, descriptions, comments, labels, and API responses;
- Outlook webhook notifications, calendar/mail fields, subscription validation challenges, and Microsoft Graph responses;
- Supabase realtime events, table rows, storage object names, and RLS-visible data;
- Obsidian markdown/frontmatter content, filenames, generated HTML/PDFs, and vault search/RAG chunks;
- local file events from WatchPaths and queue files;
- model outputs from Anthropic/OpenAI/Infomaniak/local embeddings;
- environment variables, package lifecycle scripts, and dependency code.

## Security Invariants

The system should preserve these invariants:

- secrets, private keys, passwords, and provider tokens must not be tracked in Git or copied into reports/logs;
- public/publishable identifiers must not be treated as authorization boundaries;
- all external mutation paths must authenticate origin and authorize the requested object/function;
- Supabase service-role material must stay server-only and must never be exposed through public config, client bundles, logs, or repo history;
- webhook handlers must fail closed on missing/invalid signatures and reject replay/oversized payloads where feasible;
- Telegram and MCP tools must enforce explicit allowlists, least privilege, confirmation for dangerous side effects, and bounded rate/resource use;
- agent/RAG content must not be able to override system/operator policy or trigger writes without a trusted control point;
- automation loops must have caps, locks, backoff, idempotency, and observability;
- deploy/build outputs must be traceable to reviewed source and not depend on untracked local state for security;
- operator dashboards must distinguish verified health from aspirational or stale claims.

## Repository-Wide Failure Modes

Most important failure classes for this audit:

- exposed credentials, private keys, tokens, webhook secrets, OAuth client secrets, passwords, or password hashes in current files or Git history;
- missing, inconsistent, or bypassable auth on dashboard functions and API helpers;
- broken object-level or function-level authorization across clients, work items, finance data, and provider objects;
- Supabase RLS/policy gaps, service-role misuse, unsafe `security definer` functions, and public storage exposure;
- webhook forgery, replay, or trust in unsigned provider payloads;
- Telegram-to-Claude/MCP command injection or excessive agent authority;
- prompt/RAG injection from vault/provider content into high-authority tools;
- runaway polling/backfill/watchdog loops that can explain high CPU, high memory, token/cost burn, or broken control-plane sessions;
- false health or docs drift where command-center claims do not match tracked code;
- supply-chain drift from unpinned/deprecated dependencies, local-only deploy scripts, missing CI, or generated artifacts that cannot be reproduced.

## Audit Priorities

1. Credential and password exposure across current tree, visible branch, and reachable history.
2. Internet-facing functions, auth controls, CORS, webhook handlers, and provider bridges.
3. Telegram/MCP/Claude/RAG authority chain and local write paths.
4. Supabase migrations, RLS, service-role use, storage, and data privacy boundaries.
5. Runtime availability: LaunchAgents, loops, backfills, watchers, locks, memory/cost controls, and stale health.
6. Dependency, deploy, provenance, and repo architecture/navigation risks.
7. Strengths that should be preserved during remediation.

