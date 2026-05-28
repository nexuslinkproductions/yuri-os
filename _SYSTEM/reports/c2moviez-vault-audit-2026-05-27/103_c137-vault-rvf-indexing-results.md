# C-137 Vault, RVF, Indexing, And Navigation Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection. No target scripts executed. No installs. No live services called. No credentials used or validated.

## Scope

This pass replaces a broad "RVF/vault/indexing/runtime" fanout with direct C-137 inspection of the local GitHub clone. It focuses on:

- RVF/MCP server wiring and tool authority.
- Vault walkers, frontmatter writers, lookup/indexing, and retrieval fallback behavior.
- Obsidian queue consumer and audit-log command surfaces.
- Vault-to-service sync scripts and route wiring.
- LaunchAgent/runtime resource pressure, local model sidecar, and scheduled indexing loops.
- Navigation truth for an LLM/operator trying to understand what actually works.

Status taxonomy:

- `C137_VERIFIED`: exact target file/line checked by Codex/main.
- `DEPLOYMENT_DEPENDENT`: tracked code says one thing, but live deployment or local runtime state is needed for final proof.
- `BLOCKED_LOCAL_STATE`: requires Claudio's machine state, untracked files, process list, dashboards, or live service export.

## Executive Summary

The vault/RVF layer is not just an indexing utility. It is a local operations plane connected to Supabase, Telegram, Plane, local model processes, vault file mutation, and MCP tools. Several parts are thoughtfully built, but the whole architecture is over-connected and under-separated.

Most serious: tracked SQL grants `anon` visibility and insert policy for `audit_log`, while `Scripts/obsidian-queue-consumer.js` treats selected audit-log rows as commands that write local files, mutate local finance state, send Telegram, and launch ingest jobs. If Claudio's live Supabase grants match the tracked migrations, this creates a command-bus risk from a public database role into local side effects.

Most explanatory for the observed CPU/RAM symptoms: multiple recursive vault walkers, backfills, local model warmups, model sidecars, 5-second dashboards, 20-second queue pollers, 30-minute embedding refreshes, and self-healing restarters can overlap. The repo contains explicit signs of previous runaway behavior and current mitigations, but the mitigations are local and fragmented.

Most important for LLM navigation: several status surfaces disagree with the code. RVF claims BGE default behavior in schema/UI while code defaults to MiniLM unless `engine` is passed; the MCP health tool still calls the service a scaffold; two file-sync scripts send to an endpoint that is not present in the tracked functions; scheduled jobs run under Node 18 while RVF declares Node >=20.10.

## Findings

### R103-F01 - Audit Log Doubles As A Command Bus Into Local Side Effects

Severity: Critical if tracked RLS/grants match live Supabase; otherwise High architecture risk  
Status: `C137_VERIFIED`, `DEPLOYMENT_DEPENDENT`

Evidence:

- `Dashboard-v2/db-migrations/003_security_hardening.sql:44-51` defines anon select and insert policies on `audit_log`.
- `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql:187-193` documents the final state as anon read for `audit_log`, plus anon insert exception.
- `Scripts/obsidian-queue-consumer.js:76-87` defines action names treated as local queue commands.
- `Scripts/obsidian-queue-consumer.js:419-444` dispatches audit-log rows by action and details without an observed signature/actor trust check in that block.
- `Scripts/obsidian-queue-consumer.js:447-471` polls `audit_log` rows from Supabase and applies them locally.
- `Scripts/obsidian-queue-consumer.js:535-554` runs realtime plus a 20-second REST catch-up poll.

Impact:

The database table is acting as an inter-process command bus, not only an audit ledger. The consumer can write vault notes, patch client frontmatter, mutate a local finance SQLite file, send Telegram messages, and launch detached ingest processes. If anon insert is live and reachable with a public anon key, the nearest boundary before local side effects is too weak.

This is one of the highest-priority items to verify with Claudio because it bridges cloud database permissions to local machine behavior.

Required remediation direction:

- Split immutable audit logging from trusted command queues.
- Make queue tables private by default.
- Require server-side command creation, actor identity, command schema validation, idempotency keys, and a signature or HMAC checked by the local consumer.
- Treat `audit_log` as read-only evidence, never as a write-command transport.

### R103-F02 - Obsidian Queue Consumer Lacks Path Containment On Local Writes

Severity: High  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/obsidian-queue-consumer.js:124-140` builds meeting-note output paths with `path.join(VAULT_DIR, target_path)` and writes content.
- `Scripts/obsidian-queue-consumer.js:142-195` patches frontmatter at `path.join(VAULT_DIR, target_path)`.
- No containment check equivalent to `path.relative` is visible in those writer blocks.
- Positive contrast: `Scripts/nex-rvf/lib/vault-apply.js:37-42` does use a `safePath()` containment check before writes.
- Producers can supply path components:
  - `Dashboard-v2/functions/client-update.js:96-121`
  - `Dashboard-v2/functions/client-meeting-note.js:125-153`
  - `Dashboard-v2/functions/push-meeting-to-obsidian.js:82-143`
  - `Dashboard-v2/functions/mcp-server.js:191-193`

Impact:

The repo already contains the safer pattern in `vault-apply.js`, but the queue consumer does not use it. Because the queue consumer performs actual filesystem writes, every command row should be confined to an explicit vault subdirectory allowlist after canonical path resolution.

Required remediation direction:

- Add a shared `safeVaultPath()` helper based on `path.resolve`, `path.relative`, and allowlisted prefixes.
- Reject absolute paths, path traversal, symlink escapes, and unknown queue actions.
- Validate `target_path` in producers and again in the local consumer.

### R103-F03 - RVF MCP Server Is A Privileged Tool Plane With No Internal RBAC

Severity: High  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/nex-rvf/server.js:55-544` defines a large MCP tool catalog, including search, cite, feedback, drift, coherence, memory, local chat/reason/embed, vault edit, divergence recording, health, and memory audit tools.
- `Scripts/nex-rvf/server.js:546-580` dispatches by tool name and arguments with no per-tool authorization or role check in the dispatcher.
- `Scripts/nex-rvf/server.js:887-903` exposes `apply_vault_edit` and `record_vault_diverged` tool paths.
- `Scripts/nex-rvf/server.js:987-1020` bridges local model calls.
- `Scripts/nex-rvf/server.js:1064-1087` logs MCP calls and returns JSON results.

Impact:

This is not automatically remote-exploitable from tracked code alone because the MCP server is a local stdio process. But once an agent/session is granted the server, the authority is broad: read retrieval, cite chunks, inspect memory, trigger local model calls, and write vault frontmatter. The trust boundary is therefore the MCP attachment/session config, which is blocked by local runtime state.

Required remediation direction:

- Split read-only retrieval tools from write tools.
- Add explicit tool groups and per-session allowlists.
- Require confirmation for `apply_vault_edit`.
- Log actor/session identity, not only tool call metadata.
- Treat MCP server attachment as a privileged administrative grant.

### R103-F04 - RAG/RVF Navigation Truth Drift: BGE Claimed, MiniLM Used

Severity: High for operational truth; Medium for direct security  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/nex-rvf/server.js:63-86` declares `search.engine` default as `bge`.
- `Scripts/nex-rvf/server.js:621` implements `stubSearch({ ..., engine = 'minilm' })`.
- `Scripts/nex-rvf/server.js:620-702` falls back from BGE to MiniLM on error and labels it `minilm:fallback`.
- `Scripts/nex-watch.js:333-340` presents BGE as the default retrieval posture.
- `Scripts/nex-rvf/server.js:1046-1055` reports health as phase `alpha - scaffold`, even though many real subsystems are wired.

Impact:

An LLM/operator asking "is the repo wired correctly?" can be misled by the schema, UI copy, and health text. Retrieval quality and trust calibration depend on whether BGE is actually being used. The current defaults make it easy to believe semantic BGE retrieval is active while the code path uses MiniLM unless the caller explicitly passes `engine: "bge"`.

Required remediation direction:

- Make the implementation default match the schema and UI, or change the schema/UI to MiniLM.
- Include actual engine, fallback reason, index age, and coverage in health output.
- Treat stale health text as a release-blocking navigation defect.

### R103-F05 - File-Vault Sync Appears Unwired Or Route-Drifted

Severity: High for stability/navigation; Medium security due internal-key transport  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/vault-file-sync.js:29` targets `/api/functions/nex-file-ingest`.
- `Scripts/vault-to-file-vault.js:21` targets `https://ops.c2moviez.com/api/functions/nex-file-ingest`.
- `Dashboard-v2/production-server.js:118-123` only routes `/.netlify/functions/:name` and returns 404 if a function module is missing.
- `Dashboard-v2/server/Caddyfile.template:13-16` routes only `/.netlify/functions/*` to the API process.
- `Dashboard-v2/server/index.js:40-82` lists explicit `/.netlify/functions/*` handlers and does not include `nex-file-ingest`.
- No tracked `Dashboard-v2/functions/nex-file-ingest.js` was present in the clone.

Impact:

Two local sync scripts appear to send file payloads to an endpoint path/function that is not present in tracked server wiring. That means the operator may believe vault files are mirrored while the tracked deployment would 404 or fall through to the frontend path. This is exactly the kind of false operational confidence the audit is meant to expose.

Required remediation direction:

- Decide whether file ingest is still intended.
- If intended, implement and route one canonical endpoint under the same route dialect as production.
- If retired, remove/disable the sync scripts and LaunchAgent references.
- Never let an internal-key file uploader sit half-wired.

### R103-F06 - Resource Pressure Chain Plausibly Explains High CPU/RAM Symptoms

Severity: High stability risk  
Status: `C137_VERIFIED`, `BLOCKED_LOCAL_STATE` for live process confirmation

Evidence:

- `Scripts/nex-rvf/server.js:1092-1095` warms the embedder at MCP server startup.
- `Scripts/nex-rvf/lib/state.js:3-6` claims lazy initialization avoids idle CPU/RAM, which the server startup warmup contradicts.
- `Scripts/nex-rvf/local-models/serve.sh:31-37` sets `PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0`, intentionally removing the normal MPS high-watermark limit.
- `Scripts/launchagents-staged/com.c2moviez.nex-local-models.plist:17-20` expects 7-8GB RSS while serving.
- `Scripts/nex-rvf/lib/embedder.js:128-165` retries BGE embedding requests up to 3 times with 120-second request timeouts.
- `Scripts/nex-rvf/backfill-bge.js:101-164` loops over pending embeddings and permanently skips after repeated failures.
- `Scripts/vault-to-file-vault.js:27-45`, `Scripts/vault-to-file-vault.js:212-267` recursively walks and watches many vault folders.
- `Scripts/vault-file-sync.js:212-239`, `Scripts/vault-file-sync.js:258-272` recursively walks and watches client files.
- `Scripts/nex-watch.js:17`, `Scripts/nex-watch.js:110-236`, `Scripts/nex-watch.js:461-468` polls broad status data every 5 seconds.
- `Scripts/obsidian-queue-consumer.js:535-554` combines realtime subscription with 20-second REST polling.
- `Scripts/nex-self-healer.js:127-174` can restart red/yellow agents on a 5-minute loop.

Impact:

The repo contains several independent loops that each look reasonable in isolation, but together can stack into high CPU, high RAM, and repeated restarts. The MPS watermark setting is especially important because it can allow memory pressure to expand instead of failing fast.

Required remediation direction:

- Build one runtime supervisor map with every LaunchAgent, schedule, watcher, model process, lock, and restart policy.
- Add single-flight guards to polling loops.
- Add hard memory/process budgets around local model services.
- Remove duplicate vault syncers or make one canonical.
- Make the self-healer restart only after validated failure classes, not only broad liveness color.

### R103-F07 - Scheduled RVF Jobs Declare Node >=20 But Run Under Node 18

Severity: Medium-High stability risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/nex-rvf/package.json:20-21` declares `node >=20.10.0`.
- `Scripts/nex-rvf/refresh.sh:56` prepends a Node v18.20.8 path.
- Multiple staged LaunchAgents invoke `/Users/ic2m/.nvm/versions/node/v18.20.8/bin/node`, including RVF refresh, canonical drift, LoRA train/promote, module status, and registry scan jobs.

Impact:

Manual shell testing and scheduled production behavior can diverge. A script may pass in a Node 20 dev shell and fail or behave differently under a scheduled Node 18 LaunchAgent. For an LLM navigating the repo, `package.json` says one runtime while the automation uses another.

Required remediation direction:

- Pick a single supported Node runtime for RVF.
- Make LaunchAgent paths derive from one managed wrapper.
- Add a startup preflight that logs and fails clearly when the runtime does not match `engines`.

### R103-F08 - Generated LoRA Training Data And Adapters Can Be Accidentally Tracked

Severity: Medium-High privacy/supply-chain risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/nex-rvf/train-week.js:240-249` writes `train.jsonl` and `valid.jsonl` under `Scripts/nex-rvf/local-models/train-data/<week>`.
- `Scripts/nex-rvf/train-week.js:257-268` trains LoRA adapters under local model paths.
- `Scripts/lora-pair-write.py:17-52` writes prompt/response pairs from pane text into `/tmp/nex-outbox.jsonl`.
- `.gitignore` ignores `Scripts/nex-rvf/local-models/.venv/` and Python caches, but not `Scripts/nex-rvf/local-models/train-data/` or adapter output directories.

Impact:

Training pairs may contain client content, operator prompts, assistant responses, and operational context. Generated datasets and adapters should not be commit-visible by default.

Required remediation direction:

- Add explicit ignores for local training data, adapters, generated evals, and outbox-derived artifacts.
- Keep only schema/example redacted fixtures in Git.
- Use a separate private artifact store for generated local model material.

### R103-F09 - Supabase Service Role Is Used As The Default Automation Primitive

Severity: Medium-High  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/nex-rvf/lib/pgmirror.js:13-18` documents that service role bypasses RLS and uses `SUPABASE_SERVICE_ROLE_KEY || SUPABASE_KEY`.
- `Scripts/nex-rvf/lib/walker.js:107-128` also uses `SUPABASE_SERVICE_ROLE_KEY || SUPABASE_KEY`.
- `Scripts/nex-rvf/local-models/serve.py:53-84` fetches the service key from Keychain to read active adapter config.
- `Scripts/vault-watch.js:27-35` requires Supabase/Plane credentials for canonical sync.
- `Scripts/nex-watch.js:35-36` loads the service key from Keychain.
- `Scripts/nex-self-healer.js:52-58` loads service key and Telegram token from Keychain.

Impact:

This may be acceptable for trusted local automation, but it makes each local script a high-value process. A bug in one script can become an RLS bypass across the data plane.

Required remediation direction:

- Replace broad service-role use with purpose-specific keys or server-side RPCs where possible.
- Document which scripts are allowed to hold service role and why.
- Keep service-role automation out of long-lived UI/watch processes when a narrower credential would work.

### R103-F10 - Refresh Lock Cleanup Is Fragile

Severity: Medium  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/nex-rvf/refresh.sh:32-33` installs an `EXIT` trap to remove the lock file.
- `Scripts/nex-rvf/refresh.sh:39-42` installs another `EXIT` trap for heartbeat failure, which replaces the earlier trap in shell semantics.
- `Scripts/nex-rvf/refresh.sh:48-52` adds a peer-process guard with `pgrep`.

Impact:

The stale-PID check reduces harm, but lock cleanup depends on stale-lock recovery instead of guaranteed trap composition. Under failure, this can create confusing skipped refreshes and misleading monitoring.

Required remediation direction:

- Compose both cleanup actions into one trap.
- Log lock ownership and age whenever a run is skipped.
- Keep the peer-process guard, but do not rely on it as the primary cleanup mechanism.

## Positive Controls Observed

- `Scripts/nex-rvf/lib/vault-apply.js:37-42` uses `path.relative` containment for approved vault edits.
- `Scripts/nex-rvf/lib/vault-frontmatter-edit.js:31-37` refuses missing or unterminated frontmatter.
- `Scripts/nex-rvf/lib/vault-frontmatter-edit.js:59-92` rejects object and multiline scalar serialization.
- `Scripts/lib/plane-client.js:7-8` documents a previous runaway pagination issue, and `Scripts/lib/plane-client.js:23-25`, `Scripts/lib/plane-client.js:149-168` now add rate limiting and `MAX_PAGES`.
- `Scripts/nex-rvf/backfill-bge.js:93-99`, `Scripts/nex-rvf/backfill-bge.js:130-136` permanently skip repeatedly failing rows instead of retrying forever.
- `Scripts/nex-rvf/drift-canary.js:11-19`, `Scripts/nex-rvf/drift-canary.js:132-170` checks coverage, freshness, logs, embedder degradation, and can notify Telegram.
- `Scripts/obsidian-queue-consumer.js:51-57` recognizes Realtime churn and uses REST catch-up as the reliable delivery path.

## Architecture Readout

The wiring is not cleanly layered:

```text
Supabase audit_log
  -> obsidian-queue-consumer
  -> local vault file writes / finance SQLite / Telegram / detached ingest

Vault folders
  -> recursive watchers and backfills
  -> file sync endpoints / RVF chunking / embedding mirrors / Supabase writes

MCP stdio server
  -> retrieval / citation / memory / local model bridge / vault frontmatter edit

LaunchAgents and self-healer
  -> scheduled refreshes / sidecars / restarts / watchdogs
```

That architecture can work, but only if trust boundaries are explicit. In the tracked repo they are scattered: some modules have solid containment and rate limits, while adjacent modules use broad service credentials, queue rows as commands, and unsafely joined paths.

## Required Next Validation Gates

1. Verify live Supabase policies/grants for `audit_log` with Claudio present, without exposing secrets.
2. Export or inspect LaunchAgent inventory from Claudio's machine if he chooses to provide it; without that, runtime overlap remains `BLOCKED_LOCAL_STATE`.
3. Confirm whether `nex-file-ingest` exists outside Git. If not, retire or repair both file-sync scripts.
4. Add a route dialect ledger: every caller path must map to a tracked server route.
5. Build the runtime/process map requested in the master plan: entrypoint, schedule, credential, sink, retry/backoff, lock, resource bound, and owner.
6. Re-audit queue consumers after path containment and command signing are designed.

## Acceptance

Accepted as C-137 direct evidence for the vault/RVF/indexing/runtime shard. Findings are source-truth bound to the cloned GitHub repository and do not rely on the invalidated stalled fanout runs.
