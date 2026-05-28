# Claude Run 036 Results - Client Data And Realtime Authority

Date: 2026-05-27
Lane: `R036_CLIENT_DATA_REALTIME_CLAUDE_OPUS`
Worker: persistent Claude/tmux lane, read-only target inspection
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Status: accepted with C-137 validation

## Clone Proof

Claude emitted clone proof and `BATCH_CLOSE` from the canonical target clone. C-137 captured the lane output to:

```text
/tmp/yuri-c2v-claude-run-036/pipe/r036-claude-capture-redacted.txt
```

Raw credential values are intentionally excluded from this durable report.

## File Coverage

Accepted new first-class target coverage:

- `Dashboard-v2/src/lib/pusher-realtime.ts`
- `Scripts/soketi-bridge.js`

Deep supporting reads, not counted as new unique coverage because they were already covered or supporting evidence in prior runs:

- `Dashboard-v2/src/lib/db.ts`
- `Dashboard-v2/src/routes/revenue/+page.svelte`
- `Dashboard-v2/src/routes/nexogram/+page.svelte`
- `Dashboard-v2/db-migrations/003_security_hardening.sql`
- `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql`
- `Dashboard-v2/db-migrations/010_user_identity.sql`

## Accepted Findings

### R036-F01 - Soketi/Pusher Realtime Uses Public Channel Subscription Names

Severity: high
Class: realtime authorization / privacy

Evidence:

- `Dashboard-v2/src/lib/pusher-realtime.ts:112-124` initializes the browser Pusher client with host/key configuration only.
- `pusher-realtime.ts:158-160` subscribes to `nex.entity-state.{entityType}`.
- `pusher-realtime.ts:178-184` subscribes to `nex.audit-log`.
- `pusher-realtime.ts:235-241`, `:254-260`, `:273-279`, `:292-298`, `:311-317`, and `:330-336` subscribe to operational data channels.
- `pusher-realtime.ts:350-357` and `:381-395` subscribe to `nex.nexogram.{channelId}` message/ephemeral channels.
- `Scripts/soketi-bridge.js:43-55` publishes matching public channel names from PostgreSQL notifications.

C-137 correction:

This is accepted as a tracked architecture risk, not a live exploit proof. If deployed as tracked, the browser-visible app key and public channel names are enough to subscribe. Live reachability remains deferred until a read-only deployed Soketi configuration review exists.

Impact:

Entity state, audit events, customer master changes, time tracking, user profile updates, and Nexogram messages can be exposed over unauthenticated public channels if the deployed Soketi/Pusher layer follows this code.

Recommendation:

Move sensitive channels to private or presence channels with server-side channel authorization. Separate public cosmetic events from financial, identity, chat, audit, and operational events.

### R036-F02 - Hardcoded Soketi Publish Secret Is Tracked In Git

Severity: high
Class: credential exposure / realtime message injection

Evidence:

- `Scripts/soketi-bridge.js:39-40` hardcodes the Soketi app key and publish secret.
- `Scripts/soketi-bridge.js:76-87` uses those values to sign Pusher HTTP API publish requests.
- Secret fingerprint recorded by C-137: `sha256:2e06c6a932ac...` (value redacted).

Impact:

Anyone with repository access can recover the publish secret. If the deployed secret still matches this tracked value, they can forge Soketi events and inject messages/state changes into subscribed clients.

Recommendation:

Rotate the Soketi secret immediately, remove it from tracked source, load it from a secret manager or environment variable, and review history for prior exposure.

### R036-F03 - `scheduled_blocks` Is Writable From The Browser Anon Role

Severity: high
Class: authorization / data integrity

Evidence:

- `Dashboard-v2/src/lib/db.ts:345-355` upserts `scheduled_blocks` directly from the browser Supabase client.
- `Dashboard-v2/src/lib/db.ts:358-362` deletes `scheduled_blocks` directly from the browser Supabase client.
- `Dashboard-v2/db-migrations/003_security_hardening.sql:113-129` explicitly creates anon `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies for `scheduled_blocks`.
- `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql:188-194` confirms anon read and scheduled-block update/delete remain allowed.

C-137 correction:

The child lane initially left part of this as deferred. C-137 validated that tracked SQL explicitly grants anon CRUD, so the finding is accepted as repo truth.

Impact:

If these migrations match production, unauthenticated browser clients can alter scheduling state. That can corrupt planning data, break calendar integrity, and create false operational truth.

Recommendation:

Move schedule mutations behind authenticated server endpoints or tighten RLS to authenticated users with ownership/team/admin checks. Remove anon write/delete policies.

## Deferred Follow-Up

- `customer_master` browser read authority remains deferred until the applied production RLS/policy state is exported.
- `nexogram_channels` and `nexogram_members` RLS remain deferred because no tracked policy definitions were found in the assigned evidence.
- Live Soketi reachability and deployed key/secret validity were not tested. Discovered credentials were not used.

## Coverage Update

Before Run 036:

- accepted assigned target coverage: `344 / 1505`
- strict semantic coverage: `342 covered + 2 partial`

After Run 036:

- accepted assigned target coverage: `346 / 1505`
- strict semantic coverage: `344 covered + 2 partial`
