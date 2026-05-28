# C2Moviez Vault Security Frontier Audit V1

Status correction: this is **not** the final master audit. Marcel correctly rejected the earlier framing because this was a C-137 solo security-frontier pass, not the full Rick-fanout, line-by-line, architecture-wiring, indexing, folder-architecture, and LLM-navigability audit originally requested.

This file remains useful as a validated first cybersecurity pass. It is superseded for final-audit purposes by the continued fanout operation and the later comprehensive master audit.

Date: 2026-05-27
Auditor: YURI / Codex main, C-137
Target: `https://github.com/c2moviezfpv/c2moviez-vault`
Audited commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Canonical clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Mode: authorized defensive audit, read-only, no target mutation, no credential use

## Executive Verdict For V1 Security Frontier

This repository is not just an Obsidian vault. It is an operations control plane: dashboard functions, Telegram bots, Claude/tmux automation, Supabase/PostgREST data access, Plane, Microsoft Graph/Outlook, Bexio, local model services, LaunchAgents, RAG/indexing, meeting storage, and client/business documents live in the same Git trust boundary.

The most important audit result is that several privileged systems are wired as if they are private/internal, but the code does not consistently enforce that assumption. The highest-risk pattern is: external or unauthenticated input reaches provider-mutating or agentic code paths that have service keys, bot tokens, app-only Graph tokens, Plane keys, Supabase service-role keys, Bexio tokens, local vault authority, or a Claude session running with broad tool permission.

This audit did not call Claudio's live services, did not use discovered credentials, did not validate tokens, did not send Telegram messages, did not trigger webhooks, and did not mutate the cloned repo. Every finding below is grounded in GitHub-obtainable repository evidence.

## Scope And Coverage

Repository truth:

- Origin: `https://github.com/c2moviezfpv/c2moviez-vault.git`
- Commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
- Tracked files: `1505`
- Clean clone status count: `0`
- Visible remote branches: `origin/main`, `origin/claude/objective-tharp-b04a32`
- Runtime inventory artifact: `/tmp/codex-security-scans/c2moviez-vault/8103286e1abc_20260527T053200Z/artifacts/runtime_inventory.md`
- Coverage ledger artifact: `/tmp/codex-security-scans/c2moviez-vault/8103286e1abc_20260527T053200Z/artifacts/repository_coverage_ledger.md`
- Secret scan artifact: `/tmp/codex-security-scans/c2moviez-vault/8103286e1abc_20260527T053200Z/artifacts/redacted_secret_hits.json`

Evidence classes covered:

- Current tree and visible Git history secret exposure.
- Dashboard function auth, webhooks, public API functions, provider calls, and internal-key pattern.
- Telegram command/control path in both Dashboard functions and local MCP/tmux scripts.
- Supabase migrations, RLS policy intent, public anon-key use, and storage policies.
- Local runtime scripts, LaunchAgent definitions, Claude health checks, model/RAG memory pressure.
- Package manifests, package locks, lifecycle scripts, and npm advisory state.
- Documentation and deploy-architecture drift where it affects security truth.

Deferred or out of scope for this trial:

- Claudio-local untracked files, `.env`, Keychain, installed LaunchAgents, local logs, local DBs, queues, shell history, process tables, and RAM/CPU samples.
- Live provider dashboards and production state for Telegram, Supabase, Plane, Bexio, Outlook/Microsoft Graph, Netlify, Infomaniak, and `ops.c2moviez.com`.
- Any test that would replay credentials, trigger webhooks, send messages, create/update/delete records, rotate secrets, or run production automation.
- Full semantic closure for every binary/client artifact and OCR-needed document. The high-impact code and control-plane audit is strong enough for remediation, but this is not a clean bill of health for every document byte.

## Method Baseline

The audit used repo-truth evidence first, then mapped risks against public security baselines:

- [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/) for web application control verification.
- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) for API auth, object/function authorization, resource use, and inventory drift.
- [OWASP GenAI / LLM guidance](https://genai.owasp.org/llm-top-10/) for prompt injection, excessive agency, sensitive disclosure, and unbounded consumption.
- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) for per-tool authorization and token boundaries.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Supabase API-key](https://supabase.com/docs/guides/getting-started/api-keys) documentation for the distinction between public anon keys and service-role keys.
- [GitHub secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/about-secret-scanning) guidance for current-tree and history secret exposure.
- [NIST SSDF SP 800-218](https://csrc.nist.gov/pubs/sp/800/218/final) for root-cause and repeat-prevention framing.
- [Telegram Bot API](https://core.telegram.org/bots/api), [Microsoft Graph subscription](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0), and [GitHub Actions secure-use](https://docs.github.com/en/actions/reference/security/secure-use) references for provider-specific review.

## Highest Priority Findings

### C2V-SEC-003 - Critical - Telegram to Claude to MCP bridge forwards external messages into a high-authority agent session

Evidence:

- `Scripts/telegram-mcp/poller.js:560-574` appends every incoming message to `/tmp/telegram-inbox.jsonl` and wakes EXEO. No sender allowlist check is present at this point.
- `Scripts/exeo-daemon.js:538-540` labels non-allowed users as `role: external`, but this is metadata only.
- `Scripts/exeo-daemon.js:713-783` processes the message and calls `runAI` even for non-CEO senders. Several side effects are gated later, but the Claude turn still receives the external text.
- `Scripts/ai:74-79` launches persistent Claude with `--permission-mode bypassPermissions` and broad tools: Telegram, Plane, DB/Supabase, Obsidian, `Read`, `Grep`, `Glob`, and `Bash`.
- `Scripts/lib/nex-system-prompt.md:21-29` requires a Telegram reply every turn using the untrusted `chat_id` and `msg_id` metadata.
- `Scripts/lib/nex-system-prompt.md:47-55` documents provider and filesystem tools as available.
- `Scripts/telegram-mcp/server.js:137-156` lets `send_message` target a caller-supplied `chat_id`.
- `Scripts/telegram-mcp/server.js:193-215` lets `reply_message` send to the supplied `chat_id` without an allowlist check.

Why this matters:

If an untrusted user can message the bot or place it in a chat, their text can become input to a Claude session that is explicitly configured to bypass permission prompts and has operational tools. The current `role: external` label is not a security boundary. This is a plausible root cause for Telegram control-plane breakage, unexpected replies, hallucinated operational claims, and tool abuse.

Recommended remediation:

- Drop non-allowed senders in the poller before writing the inbox.
- In `processMessage`, return before `runAI` for any non-allowed sender unless a deliberately restricted external mode exists.
- Enforce chat/user allowlists inside the Telegram MCP tools themselves.
- Remove `Bash`, Obsidian write tools, Plane mutation tools, and Supabase mutation tools from the default Claude toolset. Re-add only per task with explicit policy.
- Make external messages no-tools/no-reply by default.
- Add regression tests that prove an unknown `from_id` cannot reach `runAI`, Telegram MCP sends, Plane, Supabase, Obsidian, or Bash.

### C2V-SEC-004 - Critical - Public `offer-create` endpoint can create offers, Bexio records, Supabase rows, audit queue entries, and Telegram nudges

Evidence:

- `Dashboard-v2/functions/offer-create.js:1-29` describes a production endpoint at `POST /.netlify/functions/offer-create`.
- `Dashboard-v2/functions/offer-create.js:34-45` uses `SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY`.
- `Dashboard-v2/functions/offer-create.js:65-83` uses `BEXIO_API_TOKEN`.
- `Dashboard-v2/functions/offer-create.js:93-107` sends Telegram messages with `TELEGRAM_BOT_TOKEN`.
- `Dashboard-v2/functions/offer-create.js:161-168` accepts POST and only validates `identity.kuerzel` and `identity.name`.
- `Dashboard-v2/functions/offer-create.js:177-209` inserts or reads Supabase `offers`.
- `Dashboard-v2/functions/offer-create.js:211-242` finds/creates Bexio contacts and creates a `kb_offer`.
- `Dashboard-v2/functions/offer-create.js:247-266` writes an audit-log queue entry for local Obsidian email drafting.
- `Dashboard-v2/functions/offer-create.js:268-286` sends a Telegram nudge and returns success.

Why this matters:

If this function is deployed as described, an unauthenticated caller can cause real business-state writes across Supabase, Bexio, the local vault queue, and Telegram. This is a direct provider-mutation risk.

Recommended remediation:

- Disable the route until auth is added.
- Require authenticated session or HMAC-bound internal signature.
- Add rate limits, idempotency tied to a trusted server-generated nonce, and strict payload schema limits.
- Move Bexio offer creation behind a human approval or an authenticated internal workflow.
- Do not use service-role keys in public HTTP handlers unless the route is strongly authenticated and narrowly authorized.

### C2V-SEC-005 - Critical - Public `outlook-subscribe` handler mutates Microsoft Graph subscriptions

Evidence:

- `Dashboard-v2/functions/outlook-subscribe.js:1-21` documents a daily and on-demand lifecycle manager for Microsoft Graph subscriptions.
- `Dashboard-v2/functions/outlook-subscribe.js:33-53` obtains an app-only OAuth token with client credentials.
- `Dashboard-v2/functions/outlook-subscribe.js:89-140` lists, renews, deletes, and creates Graph subscriptions.
- `Dashboard-v2/functions/outlook-subscribe.js:143-152` handles any invocation without auth or method guard.
- `Dashboard-v2/functions/outlook-subscribe.js:26-27` sets `CLIENT_STATE` to `OUTLOOK_WEBHOOK_SECRET || ''`.

Why this matters:

The function has tenant/app-level Graph authority and performs subscription mutation from a public handler. A direct invocation can create, renew, or delete subscriptions if deployed with credentials.

Recommended remediation:

- Remove public on-demand access or require a scheduler-only secret/HMAC.
- Fail closed when `OUTLOOK_WEBHOOK_SECRET` is missing.
- Keep Graph subscription lifecycle in a private admin job or deploy-provider scheduled context that cannot be invoked publicly.
- Add tests proving unauthenticated/manual HTTP invocation cannot call Graph mutation.

### C2V-SEC-006 - High - `nex-rag-query` exposes operational RAG/client context without auth and prefers service-role key

Evidence:

- `Dashboard-v2/functions/nex-rag-query.js:11-12` chooses `SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY || PUBLIC_SUPABASE_ANON`.
- `Dashboard-v2/functions/nex-rag-query.js:14-20` only enforces POST.
- `Dashboard-v2/functions/nex-rag-query.js:32-38` only requires a string `query`.
- `Dashboard-v2/functions/nex-rag-query.js:49-60` includes client stage, MRR, contract, email, and last contact.
- `Dashboard-v2/functions/nex-rag-query.js:64-79` includes ticket context.
- `Dashboard-v2/functions/nex-rag-query.js:82-95` includes decisions.
- `Dashboard-v2/functions/nex-rag-query.js:98-111` includes audit log context.
- `Dashboard-v2/functions/nex-rag-query.js:118-141` calls `/chat` with only `X-Internal-Source`.
- `Dashboard-v2/functions/nex-rag-query.js:177-180` returns the answer plus `context_chunks`.

Why this matters:

If deployed, this is a sensitive data disclosure path. Service-role use can bypass RLS, and the response returns the context chunks directly.

Recommended remediation:

- Add `checkAuth`.
- Do not use service-role for user-facing RAG.
- Enforce object/tenant authorization for `client_code`.
- Minimize returned context; do not return raw retrieved chunks by default.
- Add query and response size limits plus rate limiting.

### C2V-SEC-007 - High - `intel-retrieval-stats` exposes agent memory, retrieval, commitments, decisions, and health with no auth

Evidence:

- `Dashboard-v2/functions/intel-retrieval-stats.js:13-14` says the browser fetches this via authenticated session.
- `Dashboard-v2/functions/intel-retrieval-stats.js:17-18` prefers `SUPABASE_SERVICE_ROLE_KEY`.
- `Dashboard-v2/functions/intel-retrieval-stats.js:43-48` has no `checkAuth`.
- `Dashboard-v2/functions/intel-retrieval-stats.js:51-66` reads retrieval logs and embeddings.
- `Dashboard-v2/functions/intel-retrieval-stats.js:141-164` reads drift, coherence holds, memory conflicts, MCP calls, decisions, commitments, agent health, canonical store rows, suspect rows, and module status.
- `Dashboard-v2/functions/intel-retrieval-stats.js:193-363` returns the assembled payload.

Why this matters:

This endpoint leaks a detailed operational map of the agent system and potentially sensitive memory/retrieval references. It also uses privileged database access.

Recommended remediation:

- Add `checkAuth` immediately.
- Remove service-role from this route or put it behind a tightly authenticated server-side report job.
- Return only aggregate fields needed by the UI.
- Add redaction of memory facts, prompts, references, and customer-linked fields.

### C2V-SEC-008 - High - `telegram-team` webhook can be forged with member key and can mutate Plane issues

Evidence:

- `Dashboard-v2/functions/shared-team-config.js:7-37` defines member keys and Plane user IDs.
- `Dashboard-v2/functions/telegram-team.js:193-205` identifies the bot by `?token=` matching either the member key or the bot token.
- `Dashboard-v2/functions/telegram-team.js:472-486` accepts POST and identifies the bot, with no Telegram secret-token verification.
- `Dashboard-v2/functions/telegram-team.js:498-507` trusts the request body chat/message fields.
- `Dashboard-v2/functions/telegram-team.js:516-535` dispatches commands.
- `Dashboard-v2/functions/telegram-team.js:348-370` marks Plane tickets completed.
- `Dashboard-v2/functions/telegram-team.js:373-403` appends notes to Plane issues.
- `Dashboard-v2/functions/telegram-team.js:42-48` and `68-84` use `PLANE_API_KEY` for Plane API calls.

Why this matters:

If the endpoint is deployed and a simple member key such as `fanny`, `silas`, or `marcel` is accepted, a forged POST can trigger Plane reads/writes and Telegram replies to an attacker-controlled chat ID.

Recommended remediation:

- Do not accept member keys or bot tokens in query strings as authentication.
- Use Telegram `X-Telegram-Bot-Api-Secret-Token`.
- Validate `from.id` and `chat.id` against the configured member chat ID.
- Make Plane mutation commands require confirmed member identity and narrow ticket ownership checks.

### C2V-SEC-009 - High - Scheduled/intelligence functions are public-invokable and cause provider calls, Telegram sends, and Supabase writes

Evidence:

- `Dashboard-v2/functions/deep-learning.js:280-291` has no auth or scheduler guard before starting.
- `Dashboard-v2/functions/deep-learning.js:293-377` fetches Plane/client data, sends Telegram, and writes `daily_metrics`.
- `Dashboard-v2/functions/metrics-snapshot.js:135-143` has no auth or scheduler guard.
- `Dashboard-v2/functions/metrics-snapshot.js:145-235` fetches Plane/storage data and writes metrics.
- `Dashboard-v2/functions/predictive-intel.js:356-366` has no auth or scheduler guard.
- `Dashboard-v2/functions/predictive-intel.js:368-430` fetches issues/client KB/pipeline and builds Telegram intelligence output.

Why this matters:

If these routes are publicly deployed, anyone can trigger expensive provider calls, repeated reports, Telegram messages, and database writes. Idempotency in adjacent helpers does not close every route.

Recommended remediation:

- Require a deploy-provider scheduler context or HMAC secret for all scheduled functions.
- Return 401 for normal public HTTP invocations.
- Add per-function idempotency and cost/rate controls.
- Move Telegram sends behind an authenticated internal dispatch queue.

### C2V-SEC-010 - High - Public Supabase anon policies expose operational tables/storage by design

Evidence:

- `Dashboard-v2/functions/config-public.js:27-31` returns Supabase URL and anon key by design.
- `Dashboard-v2/src/lib/db.ts:24-39` creates the browser Supabase client from public URL and anon key.
- `Dashboard-v2/db-migrations/001_scheduled_blocks.sql:21-24` initially gives anon full access to `scheduled_blocks`.
- `Dashboard-v2/db-migrations/001_scheduled_blocks.sql:42-44` gives anon full access to `meetings`.
- `Dashboard-v2/db-migrations/002_meetings_storage.sql:4-10` creates a public `meetings` storage bucket with 100 MB audio file limit.
- `Dashboard-v2/db-migrations/002_meetings_storage.sql:14-25` allows anon select and insert on meeting storage objects.
- `Dashboard-v2/db-migrations/003_security_hardening.sql:76-88` allows anon read/insert/update on `meetings`.
- `Dashboard-v2/db-migrations/003_security_hardening.sql:113-129` allows anon full CRUD on `scheduled_blocks`.
- `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql:187-194` documents final anon read and write exceptions.
- `Dashboard-v2/src/lib/db.ts:331-360` directly lists, upserts, and deletes `scheduled_blocks` from the browser client.

Why this matters:

The anon key is not supposed to be secret. The real boundary is RLS. Here, RLS intentionally allows public reads and some writes/deletes for operational scheduling and meeting surfaces. That is risky for confidentiality, integrity, and abuse if the data is not truly public.

Recommended remediation:

- Make operational scheduling and meeting data authenticated.
- Move writes to authenticated Netlify functions or session-bound Supabase auth.
- Make the meetings bucket private; use signed upload URLs or authenticated storage policies.
- Review all anon readable tables for client, finance, meeting, commitment, and agent-memory leakage.

## Medium Priority Findings

### C2V-SEC-011 - Medium/High - Legacy bare `X-Internal-Key` is still accepted and some internal handlers fail open when missing

Evidence:

- `Dashboard-v2/functions/auth-check.js:75-87` has a strong HMAC path using timestamp and body binding.
- `Dashboard-v2/functions/auth-check.js:113-119` still accepts deprecated bare `X-Internal-Key`.
- `Dashboard-v2/functions/outlook-webhook.js:94-107` forwards to `event-dispatch` with `X-Internal-Key`.
- `Dashboard-v2/functions/event-dispatch.js:177-179` uses `checkAuth`.
- `Dashboard-v2/functions/decision-outcome.js:238-246` only requires an internal key if `INTERNAL_SERVICE_KEY` exists; if the env var is missing, it proceeds.

Why this matters:

The HMAC design is good, but the legacy bare-key path is replayable and easy to leak through logs/headers. Fail-open internal routes make missing environment configuration a security bypass.

Recommended remediation:

- Remove the legacy `X-Internal-Key` path after migrating all callers.
- Fail closed when an internal-only route lacks `INTERNAL_SERVICE_KEY`.
- Rotate the internal key after removing public exposure paths.
- Add tests for missing-env and legacy-key rejection.

### C2V-SEC-012 - Medium/High - Outlook webhook clientState check fails open when secret is missing

Evidence:

- `Dashboard-v2/functions/outlook-webhook.js:21` sets `CLIENT_STATE = OUTLOOK_WEBHOOK_SECRET || ''`.
- `Dashboard-v2/functions/outlook-webhook.js:190-196` only rejects mismatches if `CLIENT_STATE` is truthy.
- `Dashboard-v2/functions/outlook-webhook.js:49-78` obtains Microsoft Graph app tokens.
- `Dashboard-v2/functions/outlook-webhook.js:216-218` fetches the event from Graph.
- `Dashboard-v2/functions/outlook-webhook.js:231-245` dispatches meeting events internally.

Why this matters:

If the secret is missing, forged Graph-shaped notifications can pass the clientState gate and cause Graph fetch attempts plus internal dispatch behavior.

Recommended remediation:

- Fail closed if `OUTLOOK_WEBHOOK_SECRET` is not configured.
- Validate subscription ID, resource path, tenant/user allowlist, and expected mailbox set.
- Use HMAC internal dispatch instead of bare `X-Internal-Key`.

### C2V-SEC-013 - Medium - Main Telegram webhook has conditional secret-token validation and pre-allowlist notify/proposal branches

Evidence:

- `Dashboard-v2/functions/telegram.js:2494-2496` exposes a POST webhook handler.
- `Dashboard-v2/functions/telegram.js:2498-2511` checks `TELEGRAM_WEBHOOK_SECRET_TOKEN` only if configured.
- `Dashboard-v2/functions/telegram.js:2519-2527` processes `update.notify` before sender allowlist.
- `Dashboard-v2/functions/telegram.js:2529-2558` stores meeting proposals and sends buttons before sender allowlist.
- `Dashboard-v2/functions/telegram.js:2573-2579` and `2610-2615` add allowlist checks later for message/callback paths.

Why this matters:

If the secret token is missing, a forged POST could cause Telegram spam or proposal social-engineering to allowed users. Later callbacks are gated, but the pre-allowlist branches still create operational noise and possible workflow confusion.

Recommended remediation:

- Fail closed when the Telegram webhook secret token is absent.
- Move internal `notify` and `meetingProposal` behind `checkAuth` or HMAC-only internal routes.
- Keep webhook-origin validation separate from business-message authorization.

### C2V-SEC-001 - Medium - Tracked Obsidian Local REST API authentication key

Evidence:

- `.obsidian/plugins/obsidian-local-rest-api/data.json:5`
- Secret class: confirmed repository secret exposure.
- Fingerprint only: `len=64 sha256=36d13ab8c1a08154`
- Use status: `NOT_USED`

Why this matters:

If active, this key may authenticate to the local Obsidian REST API. Runtime reachability was not tested. Because it is tracked in Git, it should be treated as compromised if it is real.

Recommended remediation:

- Rotate the key.
- Remove it from source and history where feasible.
- Store runtime local plugin keys outside Git.
- Confirm the plugin binds only to intended local interfaces.

### C2V-SEC-002 - Medium - Tracked TLS certificate/private-key material for Obsidian Local REST API

Evidence:

- `.obsidian/plugins/obsidian-local-rest-api/data.json:7-9`
- Fingerprints only:
  - certificate: `len=1271 sha256=75f33acf51a6f96b`
  - private key: `len=1777 sha256=9ce2305f5081c551`
  - public key: `len=497 sha256=41a767cac96a5494`
- Use status: `NOT_USED`

Why this matters:

Tracked private-key material should be treated as compromised if it reflects a real runtime keypair.

Recommended remediation:

- Replace the certificate/keypair.
- Remove tracked key material from current tree and history.
- Store local TLS material outside Git with restrictive permissions.

### C2V-SEC-014 - Medium - Claude health checks and canaries can create false health and cost/session burn

Evidence:

- `Scripts/daemon-stuck-watch.js:62-68` defines a 15-minute side canary using `claude --print`.
- `Scripts/daemon-stuck-watch.js:294-331` runs `claude --print --model claude-haiku-4-5-20251001`.
- `Scripts/exeo-daemon-tmux.sh:84-105` documents a previous incident where `--print` accepted auth differently from interactive tmux.
- `Scripts/exeo-daemon-tmux.sh:119-130` uses `claude --print` for auth probing.
- `Scripts/exeo-daemon-tmux.sh:173-174` starts interactive Claude with `--dangerously-skip-permissions`.
- `Scripts/exeo-daemon-tmux.sh:336-365` waits for idle by pane-output stability.

Why this matters:

The repo itself documents a mismatch between `--print` success and interactive Claude failure. A side canary can burn session quota and report the wrong health signal while the actual control plane is broken.

Recommended remediation:

- Replace side `--print` canaries with persistent-session sentinels that exercise the real tmux lane.
- Make health require actual agent-loop readiness, not only CLI auth.
- Track cost/session usage per canary and set hard budgets.
- Do not run the main operational agent with dangerous/bypass permissions as the default mode.

### C2V-SEC-015 - Medium - Local model/RAG stack has plausible high-memory and CPU pressure paths

Evidence:

- `Scripts/launchagents-staged/com.c2moviez.nex-local-models.plist:17-20` states expected 7-8 GB RSS with BGE-m3 and Qwen, and 1.5 GB idle.
- `Scripts/launchagents-staged/com.c2moviez.nex-local-models.plist:53-62` uses KeepAlive and a 30-second throttle interval.
- `Scripts/nex-rvf/local-models/serve.sh:31-37` sets `PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0` and enables MPS fallback.
- `Scripts/nex-rvf/local-models/serve.py:12-16` keeps BGE-m3 resident and mutually excludes 7B chat/reason models.
- `Scripts/nex-rvf/local-models/serve.py:249-313` loads the embed model and encodes request text, with OOM handling.
- `Scripts/nex-rvf/backfill.js:123-167` chunks all records into `allChunks`, then embeds fresh texts.
- `Scripts/nex-rvf/lib/walker.js:75-101` recursively reads full vault markdown files with no file-size cap.
- `Scripts/nex-rvf/lib/embedder.js:38-42` and `61-68` configure cache size `10000` and auto-download fallback.
- `Scripts/nex-rvf/lib/embedder.js:192-224` micro-batches embedding calls.

Why this matters:

The audit does not prove Claudio's reported 30+ GB RAM from Git alone. It does show plausible pressure sources: resident models, permissive MPS memory behavior, recursive full-file reads, large embedding caches, chunk aggregation, auto-download, and KeepAlive restarts.

Recommended remediation:

- Add per-file byte caps, total chunk caps, and total batch text caps.
- Log RSS, MPS memory, queue depth, model loaded state, and request sizes.
- Add a single-instance lock and hard memory budgets.
- Reconsider `PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0`; use bounded defaults unless a measured incident requires otherwise.
- Run local model services only on demand unless the machine has enough memory headroom.

### C2V-SEC-016 - Medium - Dependency advisories exist across multiple package roots

Evidence:

`npm audit --json --package-lock-only` was run read-only against package roots in the clone.

Results:

- `Dashboard-v2`: 10 vulnerabilities: 1 high, 8 moderate, 1 low. Notable advisories include Svelte/devalue DoS, Svelte SSR XSS, SvelteKit query cross-talk, Vite/esbuild dev-server/path issues, and `ws`.
- `Dashboard-v2/functions`: 0 vulnerabilities.
- `Scripts`: 1 moderate `ws`.
- `Scripts/nex-rvf`: 12 vulnerabilities: 4 high, 8 moderate. High paths include `@claude-flow/memory`, `agentdb`, `agentic-flow`, and OpenTelemetry Prometheus exporter crash.
- `Scripts/finance-mcp`: 6 vulnerabilities: 2 high, 4 moderate. High advisories include `fast-uri` and `fast-xml-builder`.
- `Scripts/team-bots`: 1 moderate `ws`.
- `Scripts/telegram-mcp`: 5 vulnerabilities: 1 high, 4 moderate. High advisory includes `fast-uri`.
- `02 - Clients/SHI/SHIPSTER-C1-APR-JUN-figma-make`: no package lock was available for a normal lockfile-backed audit.

Package lifecycle scripts:

- No `preinstall`, `install`, `postinstall`, `prepare`, `prepack`, `postpack`, `prepublish`, or `prepublishOnly` lifecycle scripts were found in the inspected package roots.

Recommended remediation:

- Patch Svelte/SvelteKit/devalue/Vite chains in the dashboard.
- Patch `fast-uri`, `fast-xml-builder`, Hono, `ws`, OpenTelemetry, protobuf/onnx/transformers chains in MCP/runtime packages.
- Add a lockfile for client artifact packages if they are built or deployed.
- Introduce Renovate/Dependabot plus a scheduled dependency audit gate.

## Architecture And Truth-Model Findings

### Deployment mapping is currently unclear from the audited HEAD

Evidence:

- Runtime inventory found 83 `Dashboard-v2/functions/*.js` files.
- The current audited HEAD does not contain a `netlify.toml`.
- The visible side branch includes `Dashboard-v2/netlify.toml` and many `Dashboard-v2/netlify/functions/*` paths in its diff, which means deployment layout appears to have changed across branches.
- Some source comments refer to production endpoint behavior, but this audit did not verify live deployment.

Why this matters:

Security severity depends on whether a function is deployed and reachable. The code contains multiple function handlers that would be high impact if public, but the audited HEAD alone does not prove the exact production routing table.

Recommended remediation:

- Create an authoritative deploy map: branch, build command, functions directory, route table, environment, scheduled functions, and disabled functions.
- Treat every provider-mutating function as public until proven otherwise.
- Remove dead or duplicate function surfaces from default deploy paths.

### The repo mixes source, operations, client documents, local runtime assumptions, and AI control plane in one trust boundary

Evidence:

- Runtime inventory top-level count includes large `02 - Clients`, `Dashboard-v2`, `Scripts`, `.obsidian`, `.claude`, meeting, project, and process trees.
- `CLAUDE.md` and operational scripts describe local paths, agents, provider systems, and production infrastructure.
- Client artifacts, generated apps, dashboards, runtime scripts, and bot control files live under the same Git repository.

Why this matters:

One leaked repo, bad branch, over-broad model read, or accidental publication exposes too much operational context. It also makes audits harder because production code and sensitive business records are interleaved.

Recommended remediation:

- Split production code, local vault/docs, client artifacts, and AI-control-plane operations into separate repositories or at least separate deploy trust boundaries.
- Add CODEOWNERS and route ownership for provider-mutating functions.
- Add a generated route/auth matrix to CI.

## Strengths Worth Preserving

- `Dashboard-v2/functions/auth-check.js:75-87` implements a real HMAC internal signature with timestamp and body binding.
- `Dashboard-v2/functions/auth-check.js:103-135` fails closed when `AUTH_SECRET` is missing and supports cookie/Bearer token validation plus revocation checks.
- `Dashboard-v2/functions/event-dispatch.js:177-179` uses `checkAuth` before dispatching events.
- `Dashboard-v2/functions/outlook-webhook.js:156-165` safely handles Microsoft Graph validation token echo with character and length checks.
- Supabase migrations show a conscious hardening attempt rather than total absence of policy. The issue is that some anon allowances remain too broad for operational data.
- Package lifecycle review found no install-time script execution hooks in the inspected package roots.
- The repo contains useful incident notes. For example, the Claude auth-mode comments in `Scripts/exeo-daemon-tmux.sh:84-105` accurately document a real class of false-health failures.

## Credential Handling Summary

Secret scan coverage:

- Current tree redacted hits: 215.
- Git history redacted hits: 651 across reachable blobs.
- Most redacted hits are environment-variable names, placeholder-like patterns, code variables, or URL regex false positives.
- Confirmed reportable current-tree credentials:
  - Obsidian Local REST API auth key.
  - Obsidian Local REST API TLS certificate/private key material.

Important suppressions:

- Public Supabase anon keys are not treated as secrets. The risk is RLS/policy exposure, not the existence of a browser anon key.
- Several `OPENAI_KEY`, `BASIC_URL_SECRET`, `tokenParam`, and `hasClientSecret` hits were code references or scanner artifacts, not confirmed leaked credentials.

Rules maintained:

- No discovered credential was used, replayed, tested, validated, rotated, or called.
- Raw secrets were not copied into durable YURI reports.
- Findings use path, line, class, length, hash fingerprint, and `NOT_USED`.

## Plausible Explanation For Claudio's Symptoms

Telegram control broke:

- The main Telegram/Claude bridge has multiple fragile surfaces: long-poll inbox, tmux injection, sentinel waits, mandatory Telegram reply tool calls, and high-trust tool permissions.
- External messages can reach Claude instead of being hard-dropped.
- Health checks can pass using `claude --print` while the actual interactive tmux lane is broken.

High CPU/RAM:

- The repo contains resident local model services, MPS fallback behavior, large caches, full-vault recursive reads, embedding backfills, and KeepAlive restarts.
- Git evidence makes 7-8 GB RSS plausible from the intended model stack and higher pressure plausible during backfill or failures. Git evidence alone does not prove the reported 30+ GB RAM.

Hallucinated backend/monitoring health:

- Dashboard/intelligence endpoints and agent prompts can claim operational status from stale metrics, incomplete auth checks, or model-generated summaries.
- Several "internal" routes are actually callable as HTTP functions unless deployment configuration proves otherwise.
- Current HEAD lacks a clear deploy map, so the repo cannot reliably answer "what is live" without provider verification.

## Immediate Remediation Plan

First 24 hours:

1. Disable or protect `offer-create`, `outlook-subscribe`, `nex-rag-query`, `intel-retrieval-stats`, `telegram-team`, and scheduled intelligence routes until auth is enforced.
2. Stop or isolate the Telegram-to-Claude bridge until unknown senders are dropped before inbox and before `runAI`.
3. Remove broad default Claude tools from the operational bot. Especially remove `Bash`, vault write, Plane mutation, and Supabase mutation from default every-turn access.
4. Rotate Obsidian Local REST API key and TLS material if they are active.
5. Rotate Telegram bot tokens, Plane key, Bexio token, Microsoft Graph client secret, Supabase service-role key, and internal service key if any high-risk endpoint was deployed publicly or logs indicate abuse. Do not rotate blindly without preserving incident evidence.
6. Make Outlook subscription/webhook secret mandatory and fail closed.
7. Remove legacy `X-Internal-Key` once callers are migrated to HMAC.

Next 7 days:

1. Build a route/auth matrix for all 83 dashboard functions: route, method, auth guard, provider keys, read/write behavior, deployment status, owner.
2. Add unit tests that fail if provider-mutating handlers lack auth.
3. Make Supabase meeting/scheduler surfaces authenticated or move writes behind server functions.
4. Patch dependency advisories across all package roots.
5. Add memory budgets and file-size caps to RAG/backfill/local model flows.
6. Split deployable code from client documents and local vault/runtime material.

Next 30 days:

1. Create a production-deploy source-of-truth document tied to CI and branch protection.
2. Add secret scanning with custom patterns and push protection.
3. Add structured incident logging for Telegram, Claude turns, provider mutations, and scheduled jobs.
4. Introduce least-privilege service accounts per provider.
5. Run a follow-up live read-only validation with Claudio-provided provider access, explicit scope, and no mutation.

## Final Risk Register

| ID | Severity | Status | Short title |
| --- | --- | --- | --- |
| C2V-SEC-003 | Critical | Reportable | Telegram-to-Claude-to-MCP external-input bridge |
| C2V-SEC-004 | Critical | Reportable if deployed | Unauthed `offer-create` provider mutation |
| C2V-SEC-005 | Critical | Reportable if deployed | Unauthed `outlook-subscribe` Graph mutation |
| C2V-SEC-006 | High | Reportable if deployed | Unauthed service-role RAG query |
| C2V-SEC-007 | High | Reportable if deployed | Unauthed service-role retrieval/agent telemetry |
| C2V-SEC-008 | High | Reportable if deployed | Forgeable team Telegram webhook with Plane writes |
| C2V-SEC-009 | High | Reportable if deployed | Public-invokable scheduled intelligence/provider calls |
| C2V-SEC-010 | High | Reportable | Public anon Supabase policies for operational data |
| C2V-SEC-011 | Medium/High | Reportable | Legacy internal bare key and fail-open internal route |
| C2V-SEC-012 | Medium/High | Reportable | Outlook webhook clientState fail-open |
| C2V-SEC-013 | Medium | Reportable | Main Telegram webhook conditional secret/token branches |
| C2V-SEC-001 | Medium | Reportable | Tracked Obsidian Local REST API auth key |
| C2V-SEC-002 | Medium | Reportable | Tracked Obsidian Local REST API TLS private key |
| C2V-SEC-014 | Medium | Reportable | False-health/cost risk from one-shot Claude probes |
| C2V-SEC-015 | Medium | Reportable | Local model/RAG memory pressure |
| C2V-SEC-016 | Medium | Reportable | Dependency advisories across package roots |

## YURI Trial Retrospective

What YURI did well:

- Maintained a read-only boundary even while doing a security audit.
- Separated repo evidence from model-lane advice.
- Detected and corrected the failed fanout procedure when Rick lanes did not prove direct repo reads.
- Established a repo-truth canary requirement: `rev-parse`, `cat-file`, `git show HEAD:<path>`, line/word counts, and explicit `BATCH_CLOSE`.
- Preserved process evidence in `11_yuri-process-log.md`.
- Produced actionable findings without using credentials or touching live services.

What needs improvement:

- Fanout packets must always include the canonical clone path, repo URL, commit, and mandatory Git-object read commands.
- Coverage ledgers need automatic status updates from `pending_validation` to `reportable`, `suppressed`, `not_applicable`, or `deferred`.
- Secret scanning needs a cleaner redacted classifier that separates environment variable names from actual values.
- Large document/binary/OCR coverage needs a separate privacy/document audit lane.
- Live read-only validation needs a formal provider procedure before any external service is touched.

## Bottom Line For Claudio

The repo shows genuine engineering effort and some good controls, especially around HMAC auth and documented operational incidents. But the system currently appears to rely too much on "this function is internal", "only I know this URL", "Telegram will only send real messages", "the model will behave", and "the dashboard reflects reality".

Those assumptions are not strong enough for a production operations brain.

The urgent fix is to harden trust boundaries: authenticated public functions, fail-closed webhooks, least-privilege provider keys, no default high-authority agent tools, locked-down Supabase policies, and a deploy map that says exactly what is live. Once those are in place, the useful parts of NEXBRAIN can be salvaged without letting the control plane keep pretending it is safer than it is.
