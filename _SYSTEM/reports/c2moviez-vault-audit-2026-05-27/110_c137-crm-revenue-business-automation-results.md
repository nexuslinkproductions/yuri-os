# C-137 CRM, Revenue, Offers, And Business-Automation Wiring Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection. No target scripts executed. No installs. No dev server. No live Bexio, Supabase, Plane, Outlook, Telegram, or credential calls.

## Scope

This shard inspects the business operations lane:

```text
CRM / pipeline / clients / revenue / expenses
  -> frontend actions
  -> tracked function files
  -> Supabase tables/views/RPCs
  -> Bexio, Plane, Outlook, Telegram, Obsidian/vault side effects
```

The repo contains a lot of real business workflow code, but the operational truth is split across several partially overlapping models. The key audit question is whether an operator or LLM can reliably know which source is canonical. Today the answer is no.

## Findings

### R110-F01 - Business Data Has Multiple Competing Truth Models Without A Tracked Canonical Schema

Severity: Critical repo-truth and business-integrity risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/lib/db.ts:454-475` reads CRM rows from `customer_master_safe`.
- `Dashboard-v2/src/lib/db.ts:477-489` reads an admin/revenue variant from `customer_master`.
- `Dashboard-v2/src/lib/db.ts:536-545` reads per-customer activity from `customer_activities`.
- `Dashboard-v2/src/routes/clients/+page.svelte:21-34` reads clients and tickets from `entity_state`.
- `Dashboard-v2/src/routes/revenue/+page.svelte:37-72` reads `client`, `client_finance`, and `bexio_overview` from `entity_state`.
- `Dashboard-v2/functions/offer-create.js:178-208` reads/writes an `offers` table.
- `Dashboard-v2/functions/offer-accept.js:130-159` writes `audit_log` and `commitments`.
- A tracked migration search for `customer_master`, `customer_master_safe`, `customer_activities`, `offers`, and `expenses` returned no defining migration under `Dashboard-v2/db-migrations` or `Scripts/migrations`. `commitments` exists in `Scripts/migrations/2026-04-19-phase-j.sql`, but the main CRM/offer/expense tables and views do not.

Impact:

The business system cannot be reconstructed from the GitHub clone. There are at least four overlapping business truth sources: `customer_master`, `entity_state`, vault frontmatter, and external providers. This is exactly the kind of setup where an LLM will confidently answer from whichever source it saw last.

Required remediation direction:

- Export canonical migrations for `customer_master`, `customer_master_safe`, `customer_activities`, `offers`, expenses/AP tables, Bexio snapshot shape, RLS policies, grants, and indexes.
- Create a business-truth manifest that marks each source as canonical, cache, projection, queue, or retired.
- Add drift checks between `customer_master`, `entity_state`, Plane customers, Bexio contacts, and vault frontmatter.

### R110-F02 - The New CRM Board Calls Missing Backend Handlers For Core Workflows

Severity: Critical feature-wiring and false-assurance risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/routes/pipeline/customers/+page.svelte:188-192`, `239-243`, `279-283`, `330-334`, and `1042-1047` call `/api/functions/crm-inline-edit`.
- `Dashboard-v2/src/routes/pipeline/customers/+page.svelte:638-642` calls `/api/functions/crm-promote-to-client`.
- `Dashboard-v2/src/routes/pipeline/customers/+page.svelte:913-918` calls `/api/functions/crm-generate-draft`.
- `Dashboard-v2/src/routes/pipeline/customers/+page.svelte:949-963` calls `/api/functions/crm-send-email`.
- `Dashboard-v2/functions/` contains no `crm-inline-edit.js`, `crm-promote-to-client.js`, `crm-generate-draft.js`, or `crm-send-email.js`.

Impact:

The most advanced CRM UI exposes decision makers, tags, prospect score, next action scheduling, promotion, AI draft generation, and email sending, but the tracked backend for those actions is absent. From a user perspective, this looks like a sophisticated CRM. From repo truth, its core mutation and communication paths are not wired.

Required remediation direction:

- Add the missing CRM handler family or mark these controls unavailable.
- Add endpoint-manifest checks for every `fetch("/api/functions/...")` call.
- Keep the older `/pipeline` and newer `/pipeline/customers` route models reconciled before calling either canonical.

### R110-F03 - Older Pipeline Actions Return "Queued" Without Durable Queue Writes

Severity: High operational false-assurance risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/routes/pipeline/+page.svelte:153-193` saves client edits through `/api/functions/client-update`.
- `Dashboard-v2/src/routes/pipeline/+page.svelte:195-215` creates meeting notes through `/api/functions/client-meeting-note`.
- `Dashboard-v2/src/routes/pipeline/+page.svelte:347-386`, `ClientDrawer.svelte:367-390`, and `QuickActionModal.svelte:67-79` use `/api/functions/pipeline-email-draft`.
- `Dashboard-v2/functions/pipeline-email-draft.js:21-30` logs the draft intent to stdout and comments that Outlook draft creation will be wired later.
- `pipeline-email-draft.js:32-40` still returns `queued: true` and the note "will appear in Outlook drafts on next m365 sync."
- `QuickActionModal.svelte:52-64` and the older pipeline route use `/api/functions/pipeline-move`.
- `Dashboard-v2/functions/pipeline-move.js:26-38` only logs to stdout and returns `queued: true`; it does not write Supabase, Plane, audit_log, or a local queue.

Impact:

Users can be told that pipeline moves and Outlook drafts are queued when nothing durable was queued. This is a major source of hallucinated backend confidence: the frontend sees `ok: true`, the toast says the operation will sync, but there is no tracked durable work item.

Required remediation direction:

- Replace console-only stubs with real queue writes, or return `501 not implemented`.
- Make the UI distinguish "durably queued" from "local acknowledgement."
- Add tests that assert each "queued" response inserts a row into a durable queue or audit table.

### R110-F04 - Public Offer Creation Performs High-Impact Bexio, Supabase, Telegram, And Vault-Queue Side Effects

Severity: Critical if reachable without a separate perimeter; High otherwise  
Status: `C137_VERIFIED`, `DEPLOYMENT_DEPENDENT`

Evidence:

- `Dashboard-v2/functions/offer-create.js:161-168` accepts any POST body with `identity.kuerzel` and `identity.name`; there is no HMAC, session, captcha, origin signature, or rate limiter in the handler.
- `offer-create.js:189-208` inserts into the `offers` table.
- `offer-create.js:211-241` finds or creates a Bexio contact and creates a Bexio `kb_offer`.
- `offer-create.js:247-266` writes an `audit_log` entry with `draft_email_request`, which the local queue consumer can turn into vault work.
- `offer-create.js:268-284` sends a Telegram nudge with inline buttons.
- `offer-accept.js:38-45` and `offer-accept.js:107-114` show the stronger pattern: HMAC verification before acceptance side effects.

Impact:

This endpoint is a high-side-effect business automation path. If it is publicly reachable, an attacker or careless automation can create Bexio contacts/offers, insert Supabase offer rows, trigger Telegram notifications, and enqueue local vault work. The existence of a signed `offer-accept` endpoint proves the repo already knows this class of flow should be signed.

Required remediation direction:

- Put `offer-create` behind HMAC, authenticated session, or a scoped public-form nonce with replay/rate controls.
- Add idempotency keys that are not caller-chosen plain offer numbers.
- Separate "register draft offer" from "push to Bexio" so public intake cannot directly mutate Bexio.
- Add a manual approval state before Bexio and Telegram side effects.

### R110-F05 - Offer Creation Can Return Partial Success After Provider Failure

Severity: High business-state ambiguity risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/functions/offer-create.js:177-208` creates or finds the Supabase offer row before the Bexio step.
- `offer-create.js:211-245` catches Bexio errors and stores only `summary.bexio_error`; it does not fail the request.
- `offer-create.js:247-266` still writes `audit_log`.
- `offer-create.js:268-286` still sends Telegram and returns HTTP 200.

Impact:

The workflow can say "offer generated" while Bexio failed. That may be acceptable if surfaced as a draft-only state, but the response is still `200` and the Telegram copy is mostly framed as generated. This can create duplicate manual cleanup, unpushed offers, or an email draft pointing to a missing Bexio link.

Required remediation direction:

- Use explicit workflow states: `registered`, `bexio_failed`, `awaiting_retry`, `bexio_pushed`, `draft_created`, `sent`.
- Return non-2xx for hard provider failures unless the caller explicitly requested draft-only mode.
- Add a retry queue with exactly-once provider idempotency.

### R110-F06 - Revenue Page Says "Bexio Live" But Reads A Local Snapshot Projection

Severity: Medium-High monitoring and decision-quality risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/routes/revenue/+page.svelte:58-65` states that the Bexio overview is pushed hourly from a local launchd agent and shows "no Bexio snapshot yet - sync runs hourly" on absence.
- `revenue/+page.svelte:60-72` reads and subscribes to `entity_state` rows of type `bexio_overview`.
- `Scripts/sync-financial-to-supabase.js:1-4` describes a one-shot sync from vault client frontmatter plus Bexio paid invoices to Supabase `entity_state`.
- `sync-financial-to-supabase.js:13-15` pulls Supabase and Bexio tokens from macOS Keychain when env vars are absent.
- `sync-financial-to-supabase.js:273-280` writes the `bexio_overview` projection.
- `sync-financial-to-supabase.js:286-325` writes per-client `client_finance` projections.
- No Bexio/financial LaunchAgent plist was found in the tracked `Scripts/launchagents-staged/` inventory.

Impact:

The UI presents a live financial pulse, but GitHub only proves a local one-shot script and a snapshot projection. Without the installed LaunchAgent state, Claudio and an LLM can over-trust stale revenue metrics. This is especially risky because revenue pages influence business decisions.

Required remediation direction:

- Show snapshot age and source prominently anywhere financial data is displayed.
- Source-track the scheduled sync LaunchAgent or mark the schedule as local state.
- Add a stale-data threshold that disables "live" labels after the expected sync interval is missed.

### R110-F07 - Expenses/AP UI Depends On Missing Backend And Missing Schema

Severity: High feature-wiring risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/routes/expenses/+page.svelte:238-249` loads AP items from `/api/functions/expenses-list`.
- `expenses/+page.svelte:275-309` creates expenses through `/api/functions/expenses-create`.
- `expenses/+page.svelte:323-335` updates expenses through `/api/functions/expenses-update`.
- `Dashboard-v2/functions/` contains no `expenses-list.js`, `expenses-create.js`, or `expenses-update.js`.
- A tracked migration search found no source-controlled expenses/AP table definition in `Dashboard-v2/db-migrations` or `Scripts/migrations`.

Impact:

The expenses UI is detailed, but the GitHub clone does not contain its backend or table. This is another operator-facing feature that can look complete while being unprovable from source.

Required remediation direction:

- Add the missing expenses handler family and schema/RLS migrations, or mark the route unavailable.
- Tie the dashboard AP model to the `Scripts/finance-mcp` local AP model or explicitly declare them separate.
- Add route-manifest tests for `/expenses`.

### R110-F08 - Client Update And Meeting Note Queue Paths Depend On Downstream Path Safety

Severity: Medium-High local integrity risk  
Status: `C137_VERIFIED`, `DOWNSTREAM_DEPENDENT`

Evidence:

- `Dashboard-v2/functions/client-update.js:96-105` accepts `client_code`, `client_name`, and arbitrary `fields`, then writes the patch into `entity_state`.
- `client-update.js:107-121` builds `targetPath` as `02 - Clients/${client_code} - ${client_name || client_code}.md` and inserts it into `audit_log` for the local vault consumer.
- `Dashboard-v2/functions/client-meeting-note.js:125-128` validates a sanitized `safeCode`, but `client-meeting-note.js:132-133` builds the filename/path from the original `client_code`, not `safeCode`.
- `client-meeting-note.js:137-153` inserts that path and generated content into `audit_log`.

Impact:

These handlers are authenticated, but they create local vault queue instructions. If the downstream consumer does not strictly contain paths, an authorized-but-buggy caller or compromised session could enqueue unexpected filesystem writes. This aligns with the path-containment risk already accepted in the vault/RVF shard.

Required remediation direction:

- Build paths from sanitized identifiers only.
- Validate the final path with a shared safe-path helper before inserting queue entries.
- Require the local consumer to reject paths outside approved vault subtrees even if upstream functions make a mistake.

## Positive Controls

- `offer-accept.js` uses HMAC verification and constant-time comparison before provisioning-side effects.
- `client-update.js` maps only a small allowlist of fields to Plane customer updates.
- `shared-plane.js:39-70` documents and fixes a previous cursor-pagination bug with dedupe and page caps.
- `sync-financial-to-supabase.js` separates `client_finance` projections from `client` state to reduce overwrites between Plane-owned and finance-owned data.
- `draft-offer-email.js:5-8` preserves the rule that NEXBOX does not auto-send client emails; it writes a draft and nudges the CEO.

## Coverage Notes

Inspected directly:

```text
Dashboard-v2/src/lib/db.ts
Dashboard-v2/src/routes/pipeline/+page.svelte
Dashboard-v2/src/routes/pipeline/customers/+page.svelte
Dashboard-v2/src/routes/clients/+page.svelte
Dashboard-v2/src/routes/revenue/+page.svelte
Dashboard-v2/src/routes/expenses/+page.svelte
Dashboard-v2/src/lib/components/ClientDrawer.svelte
Dashboard-v2/src/lib/components/QuickActionModal.svelte
Dashboard-v2/functions/client-update.js
Dashboard-v2/functions/client-meeting-note.js
Dashboard-v2/functions/pipeline-move.js
Dashboard-v2/functions/pipeline-email-draft.js
Dashboard-v2/functions/offer-create.js
Dashboard-v2/functions/offer-accept.js
Dashboard-v2/functions/shared-plane.js
Scripts/sync-financial-to-supabase.js
Scripts/push-offer-to-bexio.js
Scripts/draft-offer-email.js
Dashboard-v2/db-migrations/*.sql
Scripts/migrations/*.sql
```

Not inspected because it is outside GitHub clone scope:

```text
live Bexio tenant data and scopes
live Supabase CRM/offer/expense schemas
installed financial sync LaunchAgents
live Plane customer property schema
live Outlook draft sync
local vault files and Keychain values
```
