# C-137 Direct AI/MCP Results

Date: 2026-05-27
Lane: `C137_DIRECT_REPLACEMENT_FOR_R044_R045_R046`
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Status: accepted, direct C-137 repo inspection

## Purpose

Runs 044, 045, and 046 stalled without final output. This pass replaces them with direct C-137 inspection of the same AI/RAG/MCP scope. No stalled worker output is imported.

## Clone Proof

```text
CLONE_PROOF path="/tmp/yuri-c2moviez-vault-full.b1RopZ/repo" head="8103286e1abc63fa9490cb1375ecde4f340aa2bb" tracked_files=1505
BATCH_CLOSE lane=C137_DIRECT batch=R102 status="complete_read_only"
```

## File Coverage

Covered first-class function files:

- `Dashboard-v2/functions/chat.js` lines 1-694.
- `Dashboard-v2/functions/nex-rag-query.js` lines 1-181.
- `Dashboard-v2/functions/mcp-server.js` lines 1-576.
- `Dashboard-v2/functions/shared-facts.js` lines 1-159.
- `Dashboard-v2/functions/shared.js` lines 1-58.
- `Dashboard-v2/functions/document-generate.js` lines 1-425.
- `Dashboard-v2/functions/marketing-studio.js` lines 1-293.
- `Dashboard-v2/functions/fanny-ai.js` lines 1-68.
- `Dashboard-v2/functions/token-usage.js` lines 1-126.
- `Dashboard-v2/functions/context-engine.js` lines 1-178.
- `Dashboard-v2/functions/plan.js` lines 1-33.
- `Dashboard-v2/functions/predictive-intel.js` lines 1-495.
- `Dashboard-v2/functions/intel-retrieval-stats.js` lines 1-370.
- `Dashboard-v2/functions/shared-data.js` lines 1-189.
- `Dashboard-v2/functions/shared-storage.js` lines 1-128.

Supporting wiring files checked:

- `Dashboard-v2/server/index.js` lines 1-102.
- `Dashboard-v2/production-server.js` lines 1-178.
- `Dashboard-v2/server/Caddyfile.template` lines 1-43.
- `Dashboard-v2/src/lib/db.ts` lines 718-759.
- `Dashboard-v2/src/lib/components/ClientDrawer.svelte` lines 226-240.
- `Dashboard-v2/src/routes/tokens/+page.svelte` lines 39-43.
- `Dashboard-v2/src/routes/ai-monitor/+page.svelte` lines 105-148, 170-184, 300-340, 880-894.
- `Dashboard-v2/src/routes/intel/+page.svelte` lines 83-169.
- `Dashboard-v2/src/routes/intel/retrieval/+page.svelte` lines 8-15 and 104-110.
- `Scripts/team-bots/fanny-bot.js` lines 54-62, 596-607, 677-710.

UI/supporting files above are partial by design: they were read only where they establish route, auth-helper, or navigationability evidence.

## Accepted Findings

### R102-F01 - MCP Tool Authority Is Coarse-Grained

Severity: high
Class: excessive agency / authorization

Evidence:

- `Dashboard-v2/functions/mcp-server.js:550-556` applies one `checkAuth` gate before all tools.
- `Dashboard-v2/functions/mcp-server.js:561-570` dispatches any requested `tool` to `executeTool` after that single gate.
- `Dashboard-v2/functions/mcp-server.js:116-129` can create Plane tickets and queue Obsidian work-item writes.
- `Dashboard-v2/functions/mcp-server.js:131-154` can update tickets, mark tickets done, and queue state writes.
- `Dashboard-v2/functions/mcp-server.js:175-193` can send Telegram and queue arbitrary Obsidian writes.
- `Dashboard-v2/functions/mcp-server.js:195-315` can create a client, Plane customer, Plane ticket, client note, cluster note, intro HTML, and work-item note.
- `Dashboard-v2/functions/mcp-server.js:519-537` can assert arbitrary facts through the fact RPC.

Impact:

Any caller that passes the shared function auth boundary gets broad operational authority. The repo does not show per-tool RBAC, per-user role checks, schema-level tool allowlists, or confirmation gates in `mcp-server.js` itself.

### R102-F02 - MCP Telegram Tool Allows Authenticated HTML Broadcasts

Severity: medium/high
Class: message injection / operator trust

Evidence:

- `Dashboard-v2/functions/mcp-server.js:175-189` loops over `TELEGRAM_ALLOWED_USERS` and sends caller-provided `input.text` with `parse_mode: 'HTML'`.
- `Dashboard-v2/functions/mcp-server.js:181-184` resolves Telegram API errors silently.
- `Dashboard-v2/functions/mcp-server.js:187-189` also writes an EXEO last-active marker after sending.

Impact:

This is not unauthenticated, but it is high-trust output. A compromised session or over-broad MCP caller can send formatted Telegram messages to privileged recipients, with no visible escaping or per-tool approval gate in this file.

### R102-F03 - RAG Query Has No Function-Level Auth And Can Read Client Context

Severity: critical candidate, deployment-dependent
Class: data exposure / RAG privacy

Evidence:

- `Dashboard-v2/functions/nex-rag-query.js:11-14` chooses `SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY || PUBLIC_SUPABASE_ANON`.
- `Dashboard-v2/functions/nex-rag-query.js:14-38` only enforces POST and a string `query`; it does not call `checkAuth`.
- `Dashboard-v2/functions/nex-rag-query.js:49-60` reads client status, MRR, contract status, email, and last contact.
- `Dashboard-v2/functions/nex-rag-query.js:64-79` reads open ticket context.
- `Dashboard-v2/functions/nex-rag-query.js:82-95` reads decisions.
- `Dashboard-v2/functions/nex-rag-query.js:98-111` reads audit-log action context.
- `Dashboard-v2/src/lib/components/ClientDrawer.svelte:232-240` calls `/api/functions/nex-rag-query` without the shared `postAuthed` helper.

Impact:

If routable, this can expose client, revenue, decision, ticket, and audit context based on caller-supplied client identifiers. If not routable, the dashboard's Ask NEX strip falls back and the AI feature is false-assurance rather than functional RAG.

### R102-F04 - Token Usage GET Is Unauthenticated And Uses Privileged Supabase Credentials

Severity: high candidate, deployment-dependent
Class: cost/privacy exposure

Evidence:

- `Dashboard-v2/functions/token-usage.js:7` says GET is public "behind dashboard auth".
- `Dashboard-v2/functions/token-usage.js:13-15` uses `SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY` and stores `INTERNAL_SERVICE_KEY`.
- `Dashboard-v2/functions/token-usage.js:56-60` reads up to 2000 token usage rows.
- `Dashboard-v2/functions/token-usage.js:106-123` protects POST with `X-Internal-Key` but lets GET return stats with no `checkAuth`.
- `Dashboard-v2/src/routes/tokens/+page.svelte:39-43` only sends browser credentials; it does not add a function-level auth header by itself.

Impact:

If reachable, this exposes AI usage, model/source labels, call volume, and cost patterns. That is operational intelligence and can help cost-burn attacks.

### R102-F05 - Retrieval Metrics Endpoint Has No Auth And Aggregates Sensitive AI/Agent State

Severity: high
Class: observability data exposure

Evidence:

- `Dashboard-v2/functions/intel-retrieval-stats.js:13-14` claims browser fetches are via authenticated session.
- `Dashboard-v2/functions/intel-retrieval-stats.js:17-23` prefers `SUPABASE_SERVICE_ROLE_KEY` and performs raw REST reads.
- `Dashboard-v2/functions/intel-retrieval-stats.js:43-48` has no `checkAuth`.
- `Dashboard-v2/functions/intel-retrieval-stats.js:51-66` reads retrieval logs and embeddings.
- `Dashboard-v2/functions/intel-retrieval-stats.js:141-165` reads drift, coherence, memory conflicts, MCP calls, decisions, commitments, agent health, canonical store, suspect rows, and module status.
- `Dashboard-v2/functions/intel-retrieval-stats.js:359-368` returns the payload or a stack excerpt on error.
- `Dashboard-v2/src/routes/intel/retrieval/+page.svelte:104-110` fetches `/api/functions/intel-retrieval-stats?days=...`.

Impact:

The endpoint can expose the internal state of the AI memory/retrieval/agent system. Even when route-drift blocks it, the dashboard's "retrieval quality" navigation is not repo-truth reliable.

### R102-F06 - Predictive Intel Is A Side-Effect Function With No Auth Gate

Severity: critical candidate, deployment-dependent
Class: external trigger / cost / privacy / notification spam

Evidence:

- `Dashboard-v2/functions/predictive-intel.js:19-23` loads Telegram, Plane, Supabase, and allowed-user credentials.
- `Dashboard-v2/functions/predictive-intel.js:355-366` defines the handler with no method check and no `checkAuth`.
- `Dashboard-v2/functions/predictive-intel.js:368-374` fetches all issues, client KB, and pipeline leads.
- `Dashboard-v2/functions/predictive-intel.js:420-463` builds and sends a Telegram weekly intelligence report to all allowed users.
- `Dashboard-v2/functions/predictive-intel.js:465-480` writes `daily_metrics`.
- `Dashboard-v2/server/index.js:75-76` maps `intel-retrieval-stats` and `predictive-intel` as public `/.netlify/functions/*` routes in the tracked PM2 server.

Impact:

If the mapped route is live, an unauthenticated caller can trigger Plane reads, Supabase writes, Telegram messages, and receive the returned intelligence payload.

### R102-F07 - AI Proxy Functions Still Use Raw Shared Internal-Key Auth

Severity: medium/high
Class: shared-secret blast radius

Evidence:

- `Dashboard-v2/functions/fanny-ai.js:38-40` compares `x-internal-key` with `INTERNAL_SERVICE_KEY` directly.
- `Dashboard-v2/functions/marketing-studio.js:191-192` uses the same raw key comparison.
- `Scripts/team-bots/fanny-bot.js:54-62` loads the internal key from env or Keychain and calls `https://ops.c2moviez.com/api/functions/fanny-ai`.
- `Scripts/team-bots/fanny-bot.js:687-695` sends that shared key as `X-Internal-Key`.
- `Dashboard-v2/server/Caddyfile.template:14-16` routes `/.netlify/functions/*`, not `/api/functions/*`.

Impact:

The single internal key becomes a broad authority token across AI proxy, event, bot, and internal-call paths. The Fanny bot endpoint path also disagrees with the tracked Caddy route dialect, so the production behavior may be either broken or compensated by untracked routing.

### R102-F08 - Chat Combines AI Cost, Plane Mutation, And Telegram Side Effects Behind One Session Gate

Severity: medium/high
Class: mixed authority / cost

Evidence:

- `Dashboard-v2/functions/chat.js:53-60` applies `checkAuth` once at the handler entry.
- `Dashboard-v2/functions/chat.js:69-133` can bulk patch Plane tickets, cycles, and modules.
- `Dashboard-v2/functions/chat.js:137-145` calls Claude for summarization.
- `Dashboard-v2/functions/chat.js:270-291` auto-dispatches meeting proposals to `/.netlify/functions/telegram` with no auth headers.
- `Dashboard-v2/functions/chat.js:318-381` sends audio to OpenAI Whisper; local caps exist.
- `Dashboard-v2/functions/chat.js:491-500` can fetch Plane issues and states across projects.
- `Dashboard-v2/functions/chat.js:682-689` calls Claude and returns ticket counts, overdue counts, and hygiene score.

Impact:

This is not unauthenticated, but it has too many powers behind one generic chat endpoint. Any session/control issue in the dashboard becomes an AI-cost and Plane-mutation issue.

### R102-F09 - AI Monitor Depends On A Missing Metrics Endpoint

Severity: medium
Class: navigationability / false assurance

Evidence:

- `Dashboard-v2/src/routes/ai-monitor/+page.svelte:105-148` expects `/api/functions/ai-monitor-metrics` to aggregate every sensor into one JSON payload.
- `Dashboard-v2/src/routes/ai-monitor/+page.svelte:170-184` calls `refresh()` and `fetchSensors()` on mount and every 30 seconds.
- `Dashboard-v2/src/routes/ai-monitor/+page.svelte:880-894` renders "unified /ai-monitor-metrics" or fallback status.
- `Dashboard-v2/server/index.js:53-82` maps many functions but no `ai-monitor-metrics`.
- `git ls-files Dashboard-v2/functions` shows `metrics-snapshot.js`, but no tracked `ai-monitor-metrics.js`.

Impact:

The AI Monitor UI advertises a unified backend sensor layer that is not present in tracked code. This is exactly the kind of false operational assurance that can make Claudio believe monitoring is working when the repo cannot prove it.

### R102-F10 - AI Routes In The UI Use A Different Function Dialect Than The Tracked Server

Severity: high architecture finding
Class: navigationability / LLM operability

Evidence:

- `Dashboard-v2/server/Caddyfile.template:14-16` reverse-proxies `/.netlify/functions/*`.
- `Dashboard-v2/server/index.js:53-82` maps functions only under `/.netlify/functions/*`.
- `Dashboard-v2/src/lib/components/ClientDrawer.svelte:232-240` calls `/api/functions/nex-rag-query`.
- `Dashboard-v2/src/routes/tokens/+page.svelte:39-43` calls `/api/functions/token-usage`.
- `Dashboard-v2/src/routes/intel/+page.svelte:113-128` calls `/api/functions/mcp-server`.
- `Dashboard-v2/src/routes/intel/retrieval/+page.svelte:104-110` calls `/api/functions/intel-retrieval-stats`.
- `Scripts/team-bots/fanny-bot.js:62` calls `https://ops.c2moviez.com/api/functions/fanny-ai`.

Impact:

An LLM or operator reading the repo cannot reliably navigate from UI to backend behavior because the visible frontend function dialect does not match the tracked server/Caddy dialect. This directly weakens repo navigationability and makes backend claims hard to trust.

## Suppressions And Positive Controls

- `mcp-server.js` is not public without auth in its own function body; it calls `checkAuth` before tool dispatch.
- `document-generate.js` calls `checkAuth` at `document-generate.js:358-360`, rejects unknown types at `document-generate.js:376-381`, and caps free-text notes at `document-generate.js:316-318`.
- `chat.js` has a 5 MB `audioBase64` cap at `chat.js:318-322` and a 25 MB downloaded-audio cap at `chat.js:364-365`.
- `chat.js` has an SSRF guard for `audioUrl`: HTTPS-only and host allowlist at `chat.js:348-352`.
- `production-server.js` has a loopback guard for `/_internal/scheduled/:name` at `production-server.js:76-80`.
- `shared-storage.js` uses server-side Supabase storage credentials and is not itself an HTTP entrypoint.

## Deferred

- Live reachability of `/api/functions/*` versus `/.netlify/functions/*` remains deployment-state dependent.
- Supabase RLS/RPC grants for `facts_current`, `assert_fact`, `daily_metrics`, `token_usage`, `nex_*` observability tables, and `audit_log` remain deferred unless live schema/policy exports are provided.
- The runtime truth of `ai-monitor-metrics` remains unavailable in tracked Git; it may exist only as untracked production code.
- Actual AI-provider cost limits, account limits, and key scopes are outside tracked repo truth.

## Operational Takeaway

The AI/MCP layer is not merely a chat layer. It is a privileged operations plane with Plane mutations, Telegram broadcasts, Obsidian queue writes, fact-ledger writes, document generation, token tracking, retrieval metrics, and weekly intelligence side effects. The repo needs explicit tool-level authorization, one canonical function route dialect, and a clear separation between user chat, internal automation, monitoring, and scheduled jobs.
