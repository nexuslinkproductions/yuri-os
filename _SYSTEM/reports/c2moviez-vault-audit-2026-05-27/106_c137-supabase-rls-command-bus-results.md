# C-137 Supabase RLS And Command-Bus Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection. No target scripts executed. No installs. No live services called.

## Scope

This shard inspects tracked database migrations, Supabase client usage, and the `audit_log` command-bus pattern.

Question:

```text
PUBLIC ANON KEY -> RLS/GRANT -> DATA TABLE/RPC -> LOCAL OR CLOUD SIDE EFFECT
```

## Inventory

Tracked SQL schema material is split across at least two locations:

```text
Dashboard-v2/db-migrations/*.sql: 25 files
Scripts/migrations/*.sql: 3 files
finance schema: Scripts/finance-mcp/init-schema.sql
```

Key tables/RPCs referenced heavily by application code but incompletely represented in the tracked migration set:

```text
entity_state
audit_log base table definition
upsert_entity_state RPC
time_entries / team_capacity / absences
```

This means a clean GitHub checkout is not enough to reconstruct the live Supabase schema with confidence.

## Findings

### R106-F01 - `audit_log` Is Both A Public Insert Surface And A Local Command Bus

Severity: Critical if live RLS matches tracked migrations  
Status: `C137_VERIFIED`, `DEPLOYMENT_DEPENDENT`

Evidence:

- `Dashboard-v2/db-migrations/003_security_hardening.sql:44-51` creates `anon_select_audit_log` and `anon_insert_audit_log`.
- `Scripts/obsidian-queue-consumer.js:76-87` defines queue actions such as `obsidian.queue.meeting_note`, `obsidian.queue.client_frontmatter`, and finance actions.
- `Scripts/obsidian-queue-consumer.js:420-432` dispatches trusted rows into local file/finance handlers.
- `Scripts/obsidian-queue-consumer.js:449-455` catches up from `audit_log`.
- `Scripts/obsidian-queue-consumer.js:493-504` subscribes to `audit_log` INSERT realtime events and applies matching rows.
- Producers use normal Supabase REST/SDK inserts with the anon key, including `client-meeting-note.js:137-150`, `client-update.js:107-120`, `push-meeting-to-obsidian.js:127-140`, `calendar-schedule-event.js:72-80`, `telegram.js:2770-2781`, and `src/routes/intel/+page.svelte:159-168`.

Impact:

The tracked design turns `audit_log` into more than a log. It is an executable queue consumed by a local agent with filesystem and finance side effects. If the public anon key can insert rows and an attacker can shape one of the accepted queue actions, the boundary becomes "can insert a row" rather than "can authenticate to the local machine."

Required remediation direction:

- Split append-only audit history from executable command queues.
- Make executable queues service-role-only or authenticated through a signed command envelope.
- Add schema-level constraints for allowed actors/sources and command payload shape.
- Keep local consumers deny-by-default and validate target paths, actor, source, and command signature before side effects.

### R106-F02 - Migration Comments Claim Anon Write Lockdown, But Tracked Policies Still Leave Browser-Facing Writes Open

Severity: High data integrity risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/db-migrations/001_scheduled_blocks.sql:23-24` originally grants anon/authenticated `FOR ALL` on `scheduled_blocks`.
- `Dashboard-v2/db-migrations/001_scheduled_blocks.sql:42-44` originally grants anon/authenticated `FOR ALL` on `meetings`.
- `Dashboard-v2/db-migrations/003_security_hardening.sql:76-88` replaces the broad meetings policy but still allows anon SELECT, INSERT, and UPDATE.
- `Dashboard-v2/db-migrations/003_security_hardening.sql:113-129` explicitly allows anon SELECT, INSERT, UPDATE, and DELETE on `scheduled_blocks`.
- `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql:119-123` says browser-required tables should keep anon SELECT and deny writes via Netlify functions.
- `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql:187-194` says anon cannot write anything except `audit_log` INSERT and scheduled-block UPDATE/DELETE, but this migration does not drop the earlier anon meetings INSERT/UPDATE or scheduled_blocks INSERT policy.
- Browser code still writes directly through the public Supabase client in `src/lib/db.ts:345-360` and `src/routes/meetings/studio/+page.svelte:445-453`.

Impact:

The repo's written security story and its tracked SQL disagree. A future maintainer or LLM agent reading the plan-level comments would believe writes were locked behind Netlify functions, while the actual tracked policy path preserves direct browser writes. This is exactly the kind of "looks secured in docs, still open in wiring" failure that causes hallucinated backend confidence.

Required remediation direction:

- Add a final authoritative RLS migration that drops obsolete anon write policies.
- Route writes through authenticated functions or Supabase Auth user-scoped policies.
- Add a schema audit script that prints the final effective policies for every table, not just migration intent.

### R106-F03 - Meeting Audio Storage Is Public And Anon-Insertable In Tracked SQL

Severity: High confidentiality and storage-abuse risk  
Status: `C137_VERIFIED`, `DEPLOYMENT_DEPENDENT`

Evidence:

- `Dashboard-v2/db-migrations/002_meetings_storage.sql:4-12` creates the `meetings` storage bucket with `public = true`.
- `Dashboard-v2/db-migrations/002_meetings_storage.sql:14-21` grants anon SELECT and INSERT on `storage.objects` for `bucket_id = 'meetings'`.
- `Dashboard-v2/src/routes/meetings/studio/+page.svelte:276-287` uploads full meeting audio to that bucket and retrieves a public URL.
- `Dashboard-v2/src/routes/meetings/studio/+page.svelte:144-154` lists recent meeting records from the browser.

Impact:

Meeting recordings and transcripts are sensitive operational/customer material. A public bucket with anon insert/select allows unauthenticated uploads and public object retrieval if object names are known or discovered. The UI uses UUID-based names, which helps guess resistance, but this is not an authorization boundary.

Required remediation direction:

- Make the bucket private.
- Upload through an authenticated server function or signed upload URL.
- Store object paths in rows protected by user/team RLS.
- Enforce object size, MIME, retention, and malware scanning controls.

### R106-F04 - Webhook Rate Limiter Is Wired To An RPC That Tracked Grants Make Inaccessible To Its Callers

Severity: Medium stability/control risk; High if webhook spam is observed  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/db-migrations/004_n1_auth_hardening.sql:71-93` defines `auth_rate_check(_ip)`.
- `Dashboard-v2/db-migrations/004_n1_auth_hardening.sql:154-156` grants the auth RPCs only to `service_role`.
- `Dashboard-v2/functions/plane-webhook.js:25-47` calls `/rest/v1/rpc/auth_rate_check` using `SUPABASE_ANON_KEY` and returns `false` on errors/null results.
- `Dashboard-v2/functions/outlook-webhook.js:23-46` does the same.
- `Dashboard-v2/functions/auth.js:37-47` correctly initializes Supabase with the service-role key, so the same grant mismatch does not apply to `auth.js`.

Impact:

The Plane and Outlook webhooks likely fail open for rate limiting if the live grants match tracked SQL. That makes the comments and control-plane expectation misleading: the limiter appears present but may be inert exactly on internet-facing webhook paths.

Required remediation direction:

- Either call the rate-limit RPC with service-role credentials inside the server runtime or grant only the specific RPC to anon with safe `SECURITY DEFINER` semantics.
- Treat RPC permission errors as deny or degraded-mode metrics, not invisible allow.
- Add tests that simulate grant-denied RPC responses.

### R106-F05 - Older Script Migrations Grant Broad Public AI/Decision/Facts RPC Access, Later Dashboard Migrations Partially Reverse It

Severity: High schema-governance risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/migrations/2026-04-19-phase-j.sql:117-121` grants anon/authenticated SELECT over commitments, decisions, cooldowns, night mode, and decision rollups.
- `Scripts/migrations/2026-04-19-phase-j.sql:197-200` grants anon/authenticated execute on decision/commitment/cooldown RPCs.
- `Scripts/migrations/2026-04-22-phase-k.sql:71-72` grants anon/authenticated read over reasoning edges and thoughts.
- `Scripts/migrations/2026-04-22-phase-k.sql:145` grants anon/authenticated execute on `record_reasoning_chain`.
- `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql:87`, `101`, `195`, `215`, `253`, and `279` grant broad public fact read/write/RPC access.
- `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql:33-117` later locks down several of these tables/views.
- `Dashboard-v2/db-migrations/015_nex_memory_physics.sql:66-67` and `112-113`, plus `013_nex_h2_verification.sql:89-90` and `124-125`, show newer service-role-only hardening for sensitive fact/reasoning RPCs.

Impact:

The tracked repo contains conflicting schema eras. If all migrations were applied in the intended order, some older exposure is reduced. If only the script migrations landed, or if a dev/prod database missed later dashboard migrations, sensitive AI/decision/fact ledgers can be publicly readable or writable with the anon key. The repo lacks an authoritative migration manifest to prove order and final state.

Required remediation direction:

- Consolidate migrations into one ordered schema manifest with checksums.
- Add a final "effective grants" verifier that fails if forbidden anon policies or RPC grants exist.
- Treat old `Scripts/migrations` SQL as retired unless it is part of a controlled migration chain.

### R106-F06 - Core Realtime Store Is Referenced Everywhere But Its Schema Is Not Reconstructable From Tracked Migrations

Severity: Medium reproducibility/navigation risk  
Status: `C137_VERIFIED`

Evidence:

- `CLAUDE.md:136` describes Supabase `entity_state` through `upsert_entity_state`.
- `Dashboard-v2/functions/event-dispatch.js:64-91` calls `/rest/v1/rpc/upsert_entity_state`.
- `Dashboard-v2/src/lib/db.ts:77-117` treats `entity_state` and `audit_log` as core browser-readable realtime stores.
- `Scripts/vault-watch.js:237-244` describes `upsert_entity_state` as the canonical dashboard sync path.
- `Scripts/plane-sync.py:130` upserts Plane data through the same RPC.
- Search of tracked SQL found comments and lockdown references for `entity_state`, but no tracked `CREATE TABLE public.entity_state` or `CREATE FUNCTION public.upsert_entity_state`.

Impact:

The repo relies on a live schema that GitHub does not fully define. This hurts reproducibility, onboarding, disaster recovery, and LLM navigation. It also makes security review harder because the most important realtime table/RPC cannot be verified from source alone.

Required remediation direction:

- Add an authoritative baseline migration or schema dump for `entity_state`, `audit_log`, and `upsert_entity_state`.
- Add drift detection between tracked migrations and live Supabase schema.
- Make the runtime fail loudly when a required table/RPC is absent or unauthorized.

## Positive Controls

- `Dashboard-v2/db-migrations/004_n1_auth_hardening.sql:123-156` correctly makes auth revocation/attempt/event tables service-role-only.
- `Dashboard-v2/db-migrations/007_nex_rag_foundation.sql:138-145` makes `nex_embed_queue` service-role-only.
- `Dashboard-v2/db-migrations/010_user_identity.sql:58-67` scopes `user_profiles` to `auth.uid()` while keeping `role_permissions` public-readable.
- Newer NEX migrations increasingly use service-role-only policies and explicit function revokes/grants.

## Coverage Notes

Inspected directly:

```text
Dashboard-v2/db-migrations/*.sql
Scripts/migrations/*.sql
Dashboard-v2/functions/auth.js
Dashboard-v2/functions/auth-check.js
Dashboard-v2/functions/plane-webhook.js
Dashboard-v2/functions/outlook-webhook.js
Dashboard-v2/functions/event-dispatch.js
Dashboard-v2/functions/calendar-schedule-event.js
Dashboard-v2/functions/client-meeting-note.js
Dashboard-v2/functions/client-update.js
Dashboard-v2/functions/push-meeting-to-obsidian.js
Dashboard-v2/functions/mcp-server.js
Dashboard-v2/src/lib/db.ts
Dashboard-v2/src/routes/meetings/studio/+page.svelte
Dashboard-v2/src/routes/intel/+page.svelte
Scripts/obsidian-queue-consumer.js
Scripts/vault-watch.js
Scripts/plane-sync.py
```

Not inspected because it is outside GitHub clone scope:

```text
live Supabase effective grants
live Supabase schema dump
live storage bucket metadata
provider dashboards
Claudio local runtime state
```
