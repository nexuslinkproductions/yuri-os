# Fanout Run 014 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: single persistent Claude/tmux lane, active cap `1`
Required model lane: Opus worker in the existing persistent session

## Mission

Execute one bounded read-only target-repo shard:

`R014_PUBLIC_AUTH_FUNCTION_CLUSTER_OPUS / PUBLIC-AUTH-FUNCTION-CLUSTER-014`

This shard inspects the highest-risk dashboard function cluster: auth/session verification, public config, client updates, chat/context/plan endpoints, predictive intelligence, RAG query, and MCP server authority. The goal is to map entrypoints, auth controls, credential posture, internal call forwarding, data reads/writes, agent/tool authority, and failure modes.

## Non-Negotiable Rules

- Read-only only.
- No writes to Claudio's target repository.
- No writes to YURI report files from the worker lane.
- No target execution, no dependency installs, no service starts.
- No live service calls.
- No credential use, validation, replay, provider login, or API probing.
- Use only repository evidence from `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`.
- Do not read YURI protected runtime paths.
- Do not browse `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `.env`, `node_modules`, `.amp`, or `backend/data`.
- C-137 writes the durable report after validating your output.

## Required Clone Proof

Emit:

```text
CLONE_PROOF commit=<sha> status_count=<n> tracked_files=<n>
```

Expected:

- commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
- status count `0`
- tracked files `1505`

## Assigned Current-Tree Files

Inspect these files directly and completely:

1. `Dashboard-v2/functions/auth.js`
2. `Dashboard-v2/functions/auth-check.js`
3. `Dashboard-v2/functions/config-public.js`
4. `Dashboard-v2/functions/client-update.js`
5. `Dashboard-v2/functions/chat.js`
6. `Dashboard-v2/functions/context-engine.js`
7. `Dashboard-v2/functions/plan.js`
8. `Dashboard-v2/functions/predictive-intel.js`
9. `Dashboard-v2/functions/nex-rag-query.js`
10. `Dashboard-v2/functions/mcp-server.js`

Use complete `git show HEAD:<path>` reads. These files are small enough for direct full-file inspection; chunk only if the terminal truncates output.

## Required Output Rows

For every assigned file:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
```

For entrypoint and authority mapping:

```text
FUNCTION_MAP path="<path>" entrypoint="<handler/route/tool>" auth_control="<checkAuth|raw_internal_key|none|custom|unknown>" credential_source="<anon|service_role|internal_key|openai|none|mixed>" reads="<tables/services>" writes="<tables/services>" internal_calls="<functions/services>" observability="<audit/logs/errors>" failure_mode="<short>" status="<covered|reportable|suppressed|deferred>"
```

For MCP tools, if applicable:

```text
MCP_TOOL path="Dashboard-v2/functions/mcp-server.js" tool="<name>" auth_control="<handler/control>" inputs="<short>" reads="<short>" writes="<short>" downstream="<short>" audit="<short>" status="<covered|reportable|deferred>"
```

For findings:

```text
FINDING id=R014-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|wiring|availability|privacy|llm_nav|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
```

For suppressions:

```text
SUPPRESSION path="<path>" hypothesis="<risk considered>" counterevidence="<exact counterevidence>"
```

For deferred items:

```text
DEFERRED path="<path-or-surface>" reason="<exact blocker>" next="<next read-only evidence source>"
```

Close with:

```text
BATCH_CLOSE lane=opus batch=R014 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Audit Questions

Answer from repo evidence only:

- Which functions are unauthenticated, `checkAuth`-guarded, legacy `X-Internal-Key` guarded, HMAC guarded, or custom-guarded?
- Does `auth-check.js` still accept bare `X-Internal-Key`, and which callers rely on it?
- Does any function fail open if an auth secret or service key is missing?
- Which functions use anon Supabase keys for writes, service-role keys for writes, or mixed/fallback credentials?
- Does `config-public.js` expose only expected public config, or does it reveal non-public service state?
- Does `client-update.js` trust client-supplied entity state too broadly after auth?
- Does `chat.js` have bounded input sizes for text/audio and clear external OpenAI call controls?
- Does `context-engine.js` or `plan.js` rely on shared auth correctly?
- Is `predictive-intel.js` protected by auth, and what data does it return?
- Is `nex-rag-query.js` protected by auth before reading client/ticket/decision/audit context or forwarding to `chat`?
- Does `mcp-server.js` correctly gate every tool and audit every write/tool call?
- Are there browser-to-function-to-agent chains that let a normal authenticated user reach high-authority MCP, RAG, chat, or client-update behavior?

## False-Positive Guards

- Do not report a function as public merely because it appears in `server/index.js`; inspect the function's own guard and the browser caller posture.
- Do not treat `config-public.js` returning an anon key as a secret leak by itself; public anon keys are expected, but their allowed RLS grants matter.
- Do not call anon-key writes exploitable unless the code path is reachable and live RLS is unknown/permissive; use `RLS-dependent` when needed.
- Do not treat MCP tool specs as live tool reachability unless the handler auth path reaches them.
- Do not print raw secrets or environment values.
- Preserve positives such as HMAC verification, constant-time compare, httpOnly cookies, revocation checks, audit logs, size limits, localhost-only internal calls, and fail-closed behavior.

## C-137 Current Coverage State

Before Run 014:

- accepted assigned target coverage: `228 / 1505`
- strict semantic coverage: `226 covered + 2 partial`
- partial files: `Scripts/telegram-mcp/package-lock.json`, `Scripts/team-bots/package-lock.json`
