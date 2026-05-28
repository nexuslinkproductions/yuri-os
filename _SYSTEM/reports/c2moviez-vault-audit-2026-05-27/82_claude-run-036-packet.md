# Claude Run 036 Packet - Client Data And Realtime Authority

Lane: `R036_CLIENT_DATA_REALTIME_OPUS`
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Repository URL: `https://github.com/c2moviezfpv/c2moviez-vault`

## Non-Negotiables

- READ ONLY. Do not mutate the target repo, run target services, install dependencies, call live services, or use credentials.
- Inspect only the target clone plus this packet. Do not inspect YURI root, protected runtime, or any unrelated local paths.
- Do not read `.env`, `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `backend/data`, `node_modules`, or `.amp`.
- Your output is advisory until C-137 verifies it.

## Assigned Scope

Primary files:

- `Dashboard-v2/src/lib/db.ts`
- `Dashboard-v2/src/lib/pusher-realtime.ts`

Supporting files, only as needed for direct callers/sinks:

- `Dashboard-v2/src/routes/revenue/+page.svelte`
- `Dashboard-v2/src/routes/nexogram/+page.svelte`
- `Scripts/soketi-bridge.js`
- `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql`
- `Dashboard-v2/db-migrations/010_user_identity.sql`

## Questions To Answer

1. Which browser helpers expose direct Supabase read/write authority?
2. Which helpers use cookie-primary backend auth versus Supabase Bearer auth?
3. Which realtime channels are public-subscribe versus auth-gated?
4. Can this helper layer explain false assurance or runaway state due to reconnect loops, broad subscriptions, or stale cached auth?
5. What is good and should be preserved?

## Required Output

Emit:

```text
CLONE_PROOF commit=<sha> status_count=<n> tracked_files=<n>
FILE_COVERAGE path="<path>" method=full_read status=<covered|partial> lines=<n> words=<n> notes="<short>"
DATA_AUTH_MAP source="<file:line>" helper="<name>" authority="<read|write|auth|realtime>" trust_boundary="<browser|backend|soketi|supabase>" status="<covered|reportable|positive|deferred>"
REALTIME_MAP source="<file:line>" channel="<name/pattern>" auth_model="<public|private|unknown>" status="<covered|reportable|deferred|positive>"
NAVIGATIONABILITY_MAP surface="<file>" issue="<monolithic|hidden_dependency|good_anchor|drift>" evidence="<file:line>" llm_impact="<short>" status="<covered|reportable|positive>"
FINDING id=R036-F## severity=<critical|high|medium|low|info> path="<file:line>" class="<class>" evidence="<repo evidence>" impact="<impact>" recommendation="<fix>"
SUPPRESSION path="<file:line>" hypothesis="<risk considered>" counterevidence="<repo evidence>"
DEFERRED path="<path>" reason="<why blocked>" next="<next evidence>"
BATCH_CLOSE lane=opus batch=R036 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=<n>
```

Keep findings strict. Do not claim live exploitation without repo evidence and C-137 verification.
