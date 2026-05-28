# Codex Run 046 Packet - Context, Plan, Predictive Intel Functions

Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no installs, no service starts, no live calls, no credential use.

Do not read `/Users/marcelspatz/YURI-OS-MUSUBI` or any path outside the target clone except this packet and `/tmp` output. Do not read `.env`, `backend/data`, `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `node_modules`, or `.amp`. Do not print raw secrets.

## Assigned Scope

- `Dashboard-v2/functions/context-engine.js`
- `Dashboard-v2/functions/plan.js`
- `Dashboard-v2/functions/predictive-intel.js`
- `Dashboard-v2/functions/intel-retrieval-stats.js`
- `Dashboard-v2/functions/shared-data.js`
- `Dashboard-v2/functions/shared-storage.js`
- `Dashboard-v2/functions/shared.js`

Supporting route/auth files only:

- `Dashboard-v2/functions/auth-check.js`
- `Dashboard-v2/server/index.js`
- `Dashboard-v2/production-server.js`
- `Dashboard-v2/src/routes/intel/+page.svelte`
- `Dashboard-v2/src/routes/intel/retrieval/+page.svelte`

## Close These Questions

1. Which handlers require auth, and which are schedule/route-perimeter dependent?
2. Which handlers trigger AI/provider costs, Plane reads, Telegram sends, Supabase writes, or storage writes?
3. Which data aggregation loops can become heavy or stale?
4. Which UI claims depend on missing/unmapped handlers?
5. Which findings are duplicates of route-map drift, and which are new function-authority findings?

## Required Output

```text
CLONE_PROOF ...
FILE_COVERAGE path="..." status=covered|partial lines=... notes="..."
AI_AUTH_COST_MAP source="path:line" function="..." auth="..." provider_cost="yes|no|unknown" writes="..." route_status="..."
FINDING id=R046-F.. severity=... title="..." evidence="path:line, path:line" impact="..."
SUPPRESSION source="path:line" hypothesis="..." counterevidence="..."
DEFERRED source="..." reason="..."
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R046 status="complete_read_only"
```
