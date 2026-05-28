# Fanout Run 014 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no target execution, no live service calls, no credential use
Worker mode: single persistent Claude/tmux lane, active cap `1`

## Acceptance Summary

Run 014 is accepted with C-137 corrections.

- `R014_PUBLIC_AUTH_FUNCTION_CLUSTER_OPUS / PUBLIC-AUTH-FUNCTION-CLUSTER-014`: worker closed with `files_covered=10 findings=16 suppressions=4 deferred=5 invalidated=0`.
- C-137 accepted the 10 assigned files as covered and added one verified deployment-wrapper wiring finding.

Accepted assigned target surfaces added by Run 014: `10`.

Accepted assigned target coverage total after Run 014: `238 / 1505` tracked files.

Strict semantic caveat carried forward: two lockfiles are currently `partial`: `Scripts/telegram-mcp/package-lock.json` from Run 008 and `Scripts/team-bots/package-lock.json` from Run 010. Full semantic coverage is `236 covered + 2 partial`.

Contamination check: passed. C-137 checked the Run 014 pipe log for protected Claude runtime reads, `Searched memories`, and invalidation markers. The log contains protected-path strings only from packet/prompt boundary text; no protected-runtime read was accepted.

Clone proof: C-137 verified the target clone at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, clean status count `0`, and `1505` tracked files.

Source pipe log:

- `/tmp/yuri-c2v-fanout-run-014/pipe/r014-single.pipe.log`

## C-137 Corrections

Lane output remains advisory until verified. C-137 corrected these points before acceptance:

- `R014-F01` and `R014-F02` are accepted as **critical deployment-dependent candidates**, not confirmed live public exposure. The assigned functions lack auth gates, but tracked Infomaniak server wiring appears broken unless untracked deployment steps create `Dashboard-v2/netlify/functions` and `server/netlify-adapter.js`.
- `R014-F02` line anchor corrected from the worker's loose `:1`/`:5` wording to `Dashboard-v2/functions/nex-rag-query.js:11-14`, `44-115`, and `121-140`.
- `R014-F03` is accepted as high wiring: `nex-rag-query` sends only `X-Internal-Source`, while `auth-check.js` recognizes HMAC headers or legacy `X-Internal-Key`.
- `R014-F08` remains deferred for final severity until `telegram.js` is read; the current claim is that `chat.js` does not authenticate the outbound Telegram internal call.
- `R014-F17` is added by C-137: the tracked production wrapper points to missing files/directories, which can explain many "dashboard says it works but backend does not" symptoms.

## Executive Findings

Run 014 exposes a split-brain problem: some functions are dangerous if deployed as normal public Netlify-style functions, while the tracked Infomaniak deployment wrapper appears unable to load them at all.

The two highest-risk function bodies are `predictive-intel.js` and `nex-rag-query.js`. Neither has a visible auth gate. `predictive-intel.js` can fetch Plane and storage data, send Telegram messages, write `daily_metrics`, and return the weekly intelligence payload. `nex-rag-query.js` can prefer a service-role Supabase key, read client/ticket/decision/audit context, and is called from `ClientDrawer.svelte`. If these are live HTTP routes, they are critical defensive findings.

But C-137 found a deployment-truth conflict. `server/ecosystem.config.js` starts `server/index.js` as `nex-api`; `server/index.js` requires `./netlify-adapter`, but the tracked file is named `express-adapter.js`. It also requires functions from `../netlify/functions/*`, while the tracked repo contains `Dashboard-v2/functions/*` and no `Dashboard-v2/netlify/functions` directory. `production-server.js` and `deploy.sh` repeat the same `netlify/functions` expectation. This means the GitHub-tracked Infomaniak wrapper likely fails to start or returns handler-unavailable/404 unless Claudio's server has untracked copied files. That is a high-confidence wiring defect from tracked evidence and a major navigationability failure for both humans and LLMs.

The auth helper itself is much stronger than the surrounding wiring: it has HMAC body binding, timestamp skew checks, constant-time comparison, httpOnly cookies, and fail-closed missing `AUTH_SECRET`. The remaining weakness is the legacy raw `X-Internal-Key` compatibility path, which is still used by `mcp-server.js`'s `dispatch_event` tool.

## Public/Auth Function Cluster Lane

Lane: `R014_PUBLIC_AUTH_FUNCTION_CLUSTER_OPUS`
Batch: `PUBLIC-AUTH-FUNCTION-CLUSTER-014`

Files covered:

- `Dashboard-v2/functions/auth.js`
- `Dashboard-v2/functions/auth-check.js`
- `Dashboard-v2/functions/config-public.js`
- `Dashboard-v2/functions/client-update.js`
- `Dashboard-v2/functions/chat.js`
- `Dashboard-v2/functions/context-engine.js`
- `Dashboard-v2/functions/plan.js`
- `Dashboard-v2/functions/predictive-intel.js`
- `Dashboard-v2/functions/nex-rag-query.js`
- `Dashboard-v2/functions/mcp-server.js`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `R014-F01` | critical candidate | `Dashboard-v2/functions/predictive-intel.js:19-23`, `Dashboard-v2/functions/predictive-intel.js:356-370`, `Dashboard-v2/functions/predictive-intel.js:460-487` | security/privacy | `predictive-intel.js` has no visible auth gate or method gate. If HTTP-reachable, an unauthenticated caller can trigger Plane/storage reads, Telegram sends, Supabase `daily_metrics` writes, and receive weekly intelligence output. |
| `R014-F02` | critical candidate | `Dashboard-v2/functions/nex-rag-query.js:11-14`, `Dashboard-v2/functions/nex-rag-query.js:44-115` | security/privacy | `nex-rag-query.js` has no visible auth gate and prefers `SUPABASE_SERVICE_ROLE_KEY` before anon keys, then reads `entity_state`, `decisions`, and `audit_log` for caller-supplied client context. If HTTP-reachable, this bypasses RLS. |
| `R014-F03` | high | `Dashboard-v2/functions/nex-rag-query.js:121-140`, `Dashboard-v2/functions/auth-check.js:75-88`, `Dashboard-v2/functions/auth-check.js:110-119` | wiring | `nex-rag-query` calls `/chat` with only `X-Internal-Source`. `chat.js` uses `checkAuth`, which accepts HMAC headers or legacy `X-Internal-Key`, not `X-Internal-Source`. The Claude-backed RAG path likely falls back to the stub. |
| `R014-F04` | medium candidate | `Dashboard-v2/functions/client-update.js:17-18`, `Dashboard-v2/functions/client-update.js:30-82`, `Dashboard-v2/functions/client-update.js:104-121` | security/wiring | Authenticated `client-update` writes `entity_state` via `upsert_entity_state` and inserts `audit_log` with the anon key. Safety depends on RLS/RPC grants; restrictive RLS can silently fail, permissive RLS can over-broaden writes. |
| `R014-F05` | medium | `Dashboard-v2/functions/client-update.js:96-105`, `Dashboard-v2/functions/client-update.js:123-130` | data integrity | `client-update` accepts arbitrary `fields` for the `entity_state`/frontmatter patch, while only the later Plane patch uses a whitelist. Authenticated users can inject unexpected state/frontmatter keys. |
| `R014-F06` | medium | `Dashboard-v2/functions/auth-check.js:24-26`, `Dashboard-v2/functions/auth-check.js:113-119` | security | The shared auth helper still accepts deprecated bare `X-Internal-Key`, which is replayable if leaked and is not timestamp/body-bound. |
| `R014-F07` | medium | `Dashboard-v2/functions/mcp-server.js:162-170` | security | The MCP `dispatch_event` tool still uses legacy `X-Internal-Key` rather than the HMAC signature path when calling `event-dispatch`. |
| `R014-F08` | medium/deferred | `Dashboard-v2/functions/chat.js:270-291` | wiring | `chat.js` auto-dispatches meeting proposals to `/.netlify/functions/telegram` with no auth headers. If `telegram.js` requires auth, this path is broken; if it does not, authenticated chat can trigger Telegram side effects. |
| `R014-F09` | medium | `Dashboard-v2/functions/mcp-server.js:520-537` | data integrity | The `assert_fact` MCP tool accepts caller-provided subject, predicate, value, actor, confidence, and rationale without a visible predicate/value schema in this layer. Authenticated MCP callers can pollute the fact ledger unless the RPC enforces policy. |
| `R014-F10` | low | `Dashboard-v2/functions/auth.js:130-148` | security | Login still has a legacy unsalted SHA-256 password hash fallback if `AUTH_PASSWORD_HASH` remains configured. It should be removed after bcrypt rollout. |
| `R014-F11` | low | `Dashboard-v2/functions/mcp-server.js:390-405` | wiring | `create_client` contains hardcoded Plane member/state UUIDs; workspace/state recreation can silently assign wrong ownership/state. |
| `R014-F12` | low | `Dashboard-v2/functions/chat.js:501-511` | wiring | `chat.js` calls `/.netlify/functions/membership` with no auth headers; if that endpoint is protected, membership enrichment silently fails. |
| `R014-F13` | info | `Dashboard-v2/functions/auth.js:4-13`, `Dashboard-v2/functions/auth.js:223-261`, `Dashboard-v2/functions/auth.js:264-290` | positive | Auth has strong controls: bcrypt path, HS256-like JWT with jti, httpOnly Secure SameSite cookie, rate limiting, no token in body, revocation, and audit rows. |
| `R014-F14` | info | `Dashboard-v2/functions/auth-check.js:69-88`, `Dashboard-v2/functions/auth-check.js:103-135` | positive | Shared auth has constant-time comparison, HMAC timestamp/body binding, revocation check, and fail-closed missing `AUTH_SECRET`. |
| `R014-F15` | info | `Dashboard-v2/functions/chat.js:346-365` | positive | `chat.js` has an SSRF guard for `audioUrl`: HTTPS-only and host allowlist, plus a 25 MB downloaded-audio cap. |
| `R014-F16` | info | `Dashboard-v2/functions/mcp-server.js:564-574` | positive | MCP tool calls are audited on success and failure with tool name, input/result/error, and duration. |
| `R014-F17` | high | `Dashboard-v2/server/ecosystem.config.js:14-27`, `Dashboard-v2/server/index.js:9`, `Dashboard-v2/server/index.js:40-82`, `Dashboard-v2/server/express-adapter.js:1-12`, `Dashboard-v2/production-server.js:35-64`, `Dashboard-v2/server/deploy.sh:16-18` | architecture/wiring | Tracked production wiring is internally inconsistent: PM2 starts `server/index.js`; `server/index.js` requires missing `./netlify-adapter` and function paths under missing `Dashboard-v2/netlify/functions`; the tracked adapter is named `express-adapter.js`; `production-server.js` and `deploy.sh` also expect `netlify/functions`. This can make every function route fail despite function code existing under `Dashboard-v2/functions`. |

Suppressions:

- `config-public.js`: public Supabase anon key exposure is expected. It is not a secret by itself; RLS/grants decide data exposure.
- `auth.js`: service-role usage is suppressed as over-privilege in this lane because it is limited to server-side auth rate-limit/audit/revocation behavior.
- `mcp-server.js`: public MCP tool reachability is suppressed because the handler calls `checkAuth` before dispatch.
- `nex-rag-query.js`: ESM/export-default format alone does not prove the function is unreachable. The reachability question is deferred to deployment wiring; the unauthenticated code path remains reportable as a candidate.

Deferred:

- `Dashboard-v2/functions/telegram.js`: needed to close `chat.js` auto-notify and MCP Telegram side-effect paths.
- `Dashboard-v2/functions/event-dispatch.js`: needed to close legacy `X-Internal-Key` receiving behavior and HTML/Telegram rendering risks.
- `Dashboard-v2/functions/membership.js`: referenced by `chat.js`, but no tracked file was found in this bounded pass; confirm whether it exists under another path or is untracked.
- Supabase RLS/RPC policies for `entity_state`, `audit_log`, `commitments`, `facts`, `daily_metrics`, and `nex_reply_outcome`.
- Live deployment/runtime state: whether Claudio's server has untracked `netlify/functions` and `netlify-adapter.js`, or whether Netlify still deploys `Dashboard-v2/functions` directly.

## C-137 Spot Checks

C-137 directly checked these anchors in the canonical clone before accepting:

- `predictive-intel.js:19-23`, `356-370`, `460-487`: env credential posture, no auth gate, Telegram send, Supabase write, returned findings.
- `nex-rag-query.js:11-14`, `44-115`, `121-140`: service-role fallback, context reads, and `/chat` call headers.
- `auth-check.js:75-88`, `103-135`, `140-155`: HMAC path, legacy key path, and deprecated sync helper behavior.
- `client-update.js:84-105`, `107-121`, `123-130`: auth gate, arbitrary state/frontmatter patch, audit insert, and Plane whitelist.
- `chat.js:53-67`, `270-291`, `317-365`, `501-511`, `675-689`: auth gate, unauthenticated internal Telegram/membership calls, audio bounds, and model call.
- `mcp-server.js:162-170`, `520-537`, `550-574`: legacy dispatch, fact assertion, handler auth, and audit-on-success/failure.
- `server/ecosystem.config.js:14-27`, `server/index.js:9`, `server/index.js:40-82`, `server/express-adapter.js:1-12`, `production-server.js:35-64`, `server/deploy.sh:16-18`: deployment wrapper inconsistency.

## Immediate Implications

1. Decide the real deployment model and make the repo match it. Either functions live under `Dashboard-v2/functions` and wrappers must load that path, or the deploy step must explicitly create `netlify/functions`.
2. Add auth gates to `predictive-intel.js` and `nex-rag-query.js` before treating them as public HTTP routes.
3. Remove legacy bare `X-Internal-Key` after migrating `mcp-server.js` and other internal callers to HMAC.
4. Schema-validate `client-update.fields` before writing it to `entity_state` or frontmatter/audit logs.
5. Read `telegram.js`, `event-dispatch.js`, missing `membership.js`, and shared helpers next to close the deferred side-effect chains.

## Next Queue

Run 015 should stay single-lane and close the function wrapper plus side-effect dependencies:

1. `Dashboard-v2/production-server.js`
2. `Dashboard-v2/server/express-adapter.js`
3. `Dashboard-v2/server/deploy.sh`
4. `Dashboard-v2/server/Caddyfile.template`
5. `Dashboard-v2/functions/telegram.js`
6. `Dashboard-v2/functions/event-dispatch.js`
7. `Dashboard-v2/functions/shared-data.js`
8. `Dashboard-v2/functions/shared-storage.js`
9. `Dashboard-v2/functions/shared.js`
10. `Dashboard-v2/functions/shared-config.js`
