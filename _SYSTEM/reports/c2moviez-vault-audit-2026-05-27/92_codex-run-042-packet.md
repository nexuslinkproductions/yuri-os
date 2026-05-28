# Codex Run 042 Packet - AI/RAG/MCP High-Cost Functions

Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Repo URL: `https://github.com/c2moviezfpv/c2moviez-vault`
Mode: read-only, no mutation, no installs, no service starts, no live calls, no credential use.

You are a child Codex advisory lane. C-137 verifies all claims before acceptance.

## Sandbox Guard

C-137 already satisfied YURI context duties. Do not read `/Users/marcelspatz/YURI-OS-MUSUBI` or any path outside the target clone except your packet and `/tmp` output. Do not read `.env`, `backend/data`, `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `node_modules`, or `.amp`.

Do not print raw secrets.

## Assigned Scope

Inspect AI/RAG/MCP functions for auth, cost, writes, prompt/input trust, and hallucinated backend health:

- `Dashboard-v2/functions/chat.js`
- `Dashboard-v2/functions/context-engine.js`
- `Dashboard-v2/functions/plan.js`
- `Dashboard-v2/functions/predictive-intel.js`
- `Dashboard-v2/functions/mcp-server.js`
- `Dashboard-v2/functions/nex-rag-query.js`
- `Dashboard-v2/functions/document-generate.js`
- `Dashboard-v2/functions/marketing-studio.js`
- `Dashboard-v2/functions/fanny-ai.js`
- `Dashboard-v2/functions/token-usage.js`
- `Dashboard-v2/functions/shared-facts.js`
- `Dashboard-v2/functions/shared-storage.js`
- `Dashboard-v2/functions/shared.js`

Supporting frontend call sites are allowed for endpoint context only:

- `Dashboard-v2/src/routes/intel/+page.svelte`
- `Dashboard-v2/src/routes/intel/retrieval/+page.svelte`
- `Dashboard-v2/src/routes/ai-monitor/+page.svelte`
- `Dashboard-v2/src/routes/tokens/+page.svelte`
- `Dashboard-v2/src/lib/components/CommandPalette.svelte`

## Questions To Close

1. Which handlers require auth and which can trigger model/provider cost without auth?
2. Which handlers write Supabase, storage, Obsidian/vault-like data, Plane, Telegram, or logs?
3. Is MCP/tool exposure constrained by auth, allowlists, method checks, and action scopes?
4. Are provider keys read from env only, or are any secrets hardcoded?
5. Which UI health/monitoring claims can be false because the backend endpoint is missing/unmapped or unauthenticated?
6. Are there loops, unbounded retrievals, or request sizes that plausibly explain CPU/RAM/cost blowups?

## Required Output

Emit:

```text
CLONE_PROOF ...
FILE_COVERAGE path="..." status=covered|partial lines=... notes="..."
AI_AUTH_COST_MAP source="path:line" function="..." auth="..." provider_cost="yes|no|unknown" writes="..." route_status="..."
FINDING id=R042-F.. severity=... title="..." evidence="path:line, path:line" impact="..."
SUPPRESSION source="path:line" hypothesis="..." counterevidence="..."
DEFERRED source="..." reason="..."
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R042 status="complete_read_only"
```
