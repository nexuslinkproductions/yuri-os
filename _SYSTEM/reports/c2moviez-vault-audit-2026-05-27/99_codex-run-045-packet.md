# Codex Run 045 Packet - AI Support And Monitoring Functions

Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no installs, no service starts, no live calls, no credential use.

Do not read `/Users/marcelspatz/YURI-OS-MUSUBI` or any path outside the target clone except this packet and `/tmp` output. Do not read `.env`, `backend/data`, `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `node_modules`, or `.amp`. Do not print raw secrets.

## Assigned Scope

- `Dashboard-v2/functions/document-generate.js`
- `Dashboard-v2/functions/marketing-studio.js`
- `Dashboard-v2/functions/fanny-ai.js`
- `Dashboard-v2/functions/token-usage.js`
- `Dashboard-v2/functions/shared-storage.js`
- `Dashboard-v2/functions/shared.js`

Supporting route/auth files only:

- `Dashboard-v2/functions/auth-check.js`
- `Dashboard-v2/server/index.js`
- `Dashboard-v2/production-server.js`
- `Dashboard-v2/src/routes/tokens/+page.svelte`
- `Dashboard-v2/src/routes/ai-monitor/+page.svelte`

## Close These Questions

1. Which handlers are authenticated, internally gated, or unauthenticated?
2. Which handlers trigger model/provider costs?
3. Which handlers write Supabase rows, storage objects, Telegram messages, or external provider state?
4. Which UI monitoring claims point to missing/unmapped handlers?
5. Are any usage/cost endpoints exposed without proper auth?

## Required Output

```text
CLONE_PROOF ...
FILE_COVERAGE path="..." status=covered|partial lines=... notes="..."
AI_AUTH_COST_MAP source="path:line" function="..." auth="..." provider_cost="yes|no|unknown" writes="..." route_status="..."
FINDING id=R045-F.. severity=... title="..." evidence="path:line, path:line" impact="..."
SUPPRESSION source="path:line" hypothesis="..." counterevidence="..."
DEFERRED source="..." reason="..."
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R045 status="complete_read_only"
```
