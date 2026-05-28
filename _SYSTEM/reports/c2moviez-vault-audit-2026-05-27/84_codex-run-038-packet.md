# Codex Run 038 Packet - User/RBAC And Admin Guard Truth

Lane: `R038_USER_RBAC_ADMIN_GUARDS_GPT55_XHIGH`
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Repository URL: `https://github.com/c2moviezfpv/c2moviez-vault`

## Non-Negotiables

- READ ONLY. Do not mutate, execute target services, call live services, or use credentials.
- Inspect only the target clone, this packet, and your `/tmp` output.
- Do not read `.env`, `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `backend/data`, `node_modules`, or `.amp`.
- Direct repo evidence only; do not rely on C-137 summaries.

## Assigned Scope

Primary files:

- `Dashboard-v2/src/lib/stores/user.svelte.ts`
- `Dashboard-v2/db-migrations/010_user_identity.sql`
- `Dashboard-v2/src/routes/admin/+page.svelte`
- `Dashboard-v2/src/routes/admin/members/+page.svelte`
- `Dashboard-v2/src/routes/admin/modules/+page.svelte`
- `Dashboard-v2/src/routes/admin/permissions/+page.svelte`
- `Dashboard-v2/src/routes/admin/system/+page.svelte`
- `Dashboard-v2/src/routes/admin/tracker/+page.svelte`
- `Dashboard-v2/src/routes/admin/pitch/+page.svelte`

Supporting reads:

- `Dashboard-v2/src/lib/components/Sidebar.svelte`
- `Dashboard-v2/src/routes/+layout.svelte`
- `Dashboard-v2/functions/auth-check.js`

## Questions To Answer

1. What permissions exist in the client store and role migration?
2. Which admin pages enforce admin/permission checks locally?
3. Which high-authority routes are visible in navigation before permission context?
4. Is there one permission source of truth, or drift between SQL, store, and pages?
5. Where are backend checks present, missing, or deferred?

## Required Output

```text
CLONE_PROOF ...
FILE_COVERAGE ...
RBAC_MAP source="<file:line>" permission="<role/action/route>" status="<present|missing|drift|positive|deferred>"
ADMIN_GUARD_MAP source="<file:line>" route="<route>" guard="<guard expression>" status="<present|missing|weak|positive|deferred>"
FINDING id=R038-F## ...
SUPPRESSION ...
DEFERRED ...
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R038 ...
```
