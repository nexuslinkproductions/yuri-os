# Codex Run 041 Packet - Customer/Pipeline Write Functions

Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Repo URL: `https://github.com/c2moviezfpv/c2moviez-vault`
Mode: read-only, no mutation, no installs, no service starts, no live calls, no credential use.

You are a child Codex advisory lane. C-137 verifies all claims before acceptance.

## Sandbox Guard

C-137 already satisfied YURI context duties. Do not read `/Users/marcelspatz/YURI-OS-MUSUBI` or any path outside the target clone except your packet and `/tmp` output. Do not read `.env`, `backend/data`, `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `node_modules`, or `.amp`.

Do not print raw secrets.

## Assigned Scope

Inspect the tracked customer/pipeline mutation functions and their shared dependencies:

- `Dashboard-v2/functions/client-update.js`
- `Dashboard-v2/functions/client-meeting-note.js`
- `Dashboard-v2/functions/pipeline-move.js`
- `Dashboard-v2/functions/pipeline-email-draft.js`
- `Dashboard-v2/functions/offer-create.js`
- `Dashboard-v2/functions/offer-accept.js`
- `Dashboard-v2/functions/production-hub.js`
- `Dashboard-v2/functions/shared.js`
- `Dashboard-v2/functions/shared-data.js`
- `Dashboard-v2/functions/shared-plane.js`
- `Dashboard-v2/functions/shared-plane-client.js`
- `Dashboard-v2/functions/shared-storage.js`

Supporting frontend call sites are allowed only for endpoint/action context:

- `Dashboard-v2/src/routes/pipeline/+page.svelte`
- `Dashboard-v2/src/routes/clients/+page.svelte`
- `Dashboard-v2/src/lib/components/ClientDrawer.svelte`
- `Dashboard-v2/src/lib/components/QuickActionModal.svelte`

## Questions To Close

1. Which functions mutate Supabase, Plane, Obsidian/storage, email drafts, or public offer state?
2. Which functions authenticate users, and which trust only route secrecy or missing deployment assumptions?
3. Do service-role keys or provider tokens appear to be used server-side without user/role checks?
4. Are function names called by frontend actually tracked and routed?
5. Is there client-supplied field trust that can corrupt customer/pipeline state?
6. Which findings are duplicates of route-map drift and which are new function-level authority issues?

## Required Output

Emit:

```text
CLONE_PROOF ...
FILE_COVERAGE path="..." status=covered|partial lines=... notes="..."
FUNCTION_AUTH_MAP source="path:line" function="..." auth="..." writes="..." routed="mapped|unmapped|unknown"
FINDING id=R041-F.. severity=... title="..." evidence="path:line, path:line" impact="..."
SUPPRESSION source="path:line" hypothesis="..." counterevidence="..."
DEFERRED source="..." reason="..."
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R041 status="complete_read_only"
```
