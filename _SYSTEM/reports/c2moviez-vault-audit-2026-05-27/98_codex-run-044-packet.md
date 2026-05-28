# Codex Run 044 Packet - Chat/RAG/MCP Core

Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no installs, no service starts, no live calls, no credential use.

Do not read `/Users/marcelspatz/YURI-OS-MUSUBI` or any path outside the target clone except this packet and `/tmp` output. Do not read `.env`, `backend/data`, `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `node_modules`, or `.amp`. Do not print raw secrets.

## Assigned Scope

- `Dashboard-v2/functions/chat.js`
- `Dashboard-v2/functions/nex-rag-query.js`
- `Dashboard-v2/functions/mcp-server.js`
- `Dashboard-v2/functions/shared-facts.js`
- `Dashboard-v2/functions/shared.js`

Supporting route/auth files only:

- `Dashboard-v2/functions/auth-check.js`
- `Dashboard-v2/server/index.js`
- `Dashboard-v2/production-server.js`

## Close These Questions

1. Which endpoints require `checkAuth`, internal HMAC, legacy key, or no auth?
2. Which paths call Anthropic/OpenAI, Supabase RPCs/storage, Telegram, Plane, or internal HTTP functions?
3. Which tool calls can write facts, plans, storage, Telegram, or provider-side data?
4. Are there unbounded request sizes, loops, retrievals, or provider calls?
5. Which route calls are broken by `/api/functions` vs `/.netlify/functions` or missing `netlify/functions` layout?

## Required Output

```text
CLONE_PROOF ...
FILE_COVERAGE path="..." status=covered|partial lines=... notes="..."
AI_AUTH_COST_MAP source="path:line" function="..." auth="..." provider_cost="yes|no|unknown" writes="..." route_status="..."
FINDING id=R044-F.. severity=... title="..." evidence="path:line, path:line" impact="..."
SUPPRESSION source="path:line" hypothesis="..." counterevidence="..."
DEFERRED source="..." reason="..."
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R044 status="complete_read_only"
```
