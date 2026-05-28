# Codex Run 041 Results - Customer And Pipeline Write Functions

Date: 2026-05-27
Lane: `R041_CUSTOMER_PIPELINE_WRITES_GPT55_XHIGH`
Worker: Codex CLI, `gpt-5.5`, `model_reasoning_effort=xhigh`, read-only sandbox
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Status: accepted with C-137 validation

## Clone Proof

```text
CLONE_PROOF cwd="/private/tmp/yuri-c2moviez-vault-full.b1RopZ/repo" actual_commit="8103286e1abc63fa9490cb1375ecde4f340aa2bb" mode="read_only_no_mutation"
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R041 status="complete_read_only"
```

Contamination check: `last-message.md` did not depend on YURI-root reads. stderr hits were packet guard text or target-repo evidence.

## Accepted Findings

### R041-F01 - `offer-create` Is Unauthenticated And Performs Provider/Database Side Effects

Severity: critical
Class: unauthenticated side effects / provider cost and data integrity

Evidence:

- `Dashboard-v2/functions/offer-create.js:161-168` accepts POST JSON and validates payload shape, with no auth gate.
- `offer-create.js:189-206` inserts an `offers` row.
- `offer-create.js:213-241` calls Bexio and patches the offer with Bexio identifiers.
- `offer-create.js:248-266` inserts an `audit_log` row with email-draft request metadata.
- `offer-create.js:268-284` sends a Telegram notification with action buttons.

Impact:

If routable, any caller can trigger Bexio offer creation, Supabase writes, local-vault queue work, and Telegram notifications.

### R041-F02 - `client-update` Trusts Arbitrary Client-Supplied Fields For State And Vault Queue

Severity: high
Class: data integrity / overbroad mutation

Evidence:

- `Dashboard-v2/functions/client-update.js:96-105` accepts arbitrary `fields` and upserts them into `entity_state`.
- `client-update.js:107-121` queues the same patch into `audit_log` for downstream Obsidian/frontmatter writes.
- `client-update.js:145-154` uses a later allowlist only for Plane payload sync, not for Supabase/frontmatter patching.

Impact:

Authenticated callers can inject unexpected state/frontmatter keys into customer records. Plane sync is narrower, but the primary dashboard/vault state is not.

### R041-F03 - `production-hub` Allows Generic Storage Save/Delete Behind Generic Auth

Severity: medium/high
Class: storage authority / missing object-level authorization

Evidence:

- `Dashboard-v2/functions/production-hub.js:63-68` uses `checkAuth`.
- `production-hub.js:89-111` accepts `entity.operation`, allows several entity families, and saves/deletes arbitrary caller-supplied records by `data.id`.
- `Dashboard-v2/functions/shared-storage.js:14-15` prefers service-role/service storage credentials.
- `shared-storage.js:72-98` upserts objects; `:101-126` deletes objects.

Impact:

Any session/internal caller accepted by `checkAuth` can overwrite or delete allowed production-hub object families. There is no visible per-entity or per-object permission check.

### R041-F04 - `offer-accept` HMAC Payloads Are Replayable

Severity: medium
Class: webhook replay / idempotency

Evidence:

- `Dashboard-v2/functions/offer-accept.js:107-114` validates an HMAC over the raw body.
- `offer-accept.js:129-147` inserts `audit_log`.
- `offer-accept.js:149-159` inserts a `commitments` row.
- `offer-accept.js:170-177` sends a Telegram notification.

Impact:

A captured valid signed body can be replayed to create duplicate commitments/audit rows and Telegram notifications. No nonce, timestamp, or status idempotency is visible.

### R041-F05 - Pipeline Move And Email Draft Endpoints Acknowledge Work They Do Not Perform

Severity: medium
Class: false assurance / workflow integrity

Evidence:

- `Dashboard-v2/functions/pipeline-move.js:26-38` logs and returns `queued: true`, but performs no Supabase, Plane, or durable queue write.
- `Dashboard-v2/functions/pipeline-email-draft.js:26-39` logs and returns `queued: true`, while comments say Outlook draft creation is future work.

Impact:

The UI can report successful workflow changes or draft creation even though tracked source records no durable work.

## Suppressions

- `pipeline-move.js` does not currently mutate Plane or customer pipeline state.
- `pipeline-email-draft.js` does not currently create an Outlook draft.
- `offer-accept.js` does not update the public offer status row.
- `client-update.js` uses a Supabase anon key for its Supabase helper in this tracked source; service-role overreach is not accepted for that function from this evidence.

## Coverage Update

No unique coverage increment is claimed. Run 041 mostly deepens previously covered function surfaces and consolidates authority findings.
