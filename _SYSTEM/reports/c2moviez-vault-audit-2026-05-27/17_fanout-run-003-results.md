# Fanout Run 003 Results

Date: 2026-05-27
Status: four target lanes accepted, process lane invalidated

## Verdict

Run 003 successfully dispatched clean Opus lanes against the canonical clone without adding the target repo as a Claude project directory.

Accepted target lanes:

- `r003-quantum` / `API-PERIM-001`
- `r003-prime` / `GUARDRAILS-001`
- `r003-maximums` / `DAEMON-LIB-001`
- `ZETA_ALPHA_RICK_OPUS` / `PROVIDER-AUTH-001`

Invalidated process lane:

- `RIQ_IV_OPUS` / `PROCESS-003`

Reason: the RIQ lane accessed `.claude/projects/...`, which is protected by YURI operating rules. Its findings are useful as hypotheses, but the lane output is contaminated and does not count as accepted process QA.

## Coverage Delta

Run 003 accepted:

- `29` assigned target files inspected;
- all from canonical clone `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`;
- all against commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`;
- no target repo mutation;
- no live-service calls;
- no credential use.

Combined accepted target coverage so far:

- Run 002 unique assigned target files: `21`
- Run 003 unique assigned target files: `29`
- total accepted unique assigned target files: `50`
- total tracked repo files: `1505`
- current status: `50 / 1505` assigned target files accepted, or about `3.3%` of tracked files.

This is real fanout coverage, but still far from comprehensive.

## Accepted Run 003 Findings

### API Perimeter

Accepted lane: `r003-quantum`

Files covered:

- `Dashboard-v2/functions/chat.js`
- `Dashboard-v2/functions/config-public.js`
- `Dashboard-v2/functions/context-engine.js`
- `Dashboard-v2/functions/nex-rag-query.js`
- `Dashboard-v2/functions/health.js`
- `Dashboard-v2/functions/token-usage.js`

High-signal candidates:

- `AP-S01`: `Dashboard-v2/functions/nex-rag-query.js` has no visible auth gate and uses `SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY || PUBLIC_SUPABASE_ANON`. It queries `entity_state`, `decisions`, and `audit_log` based on request body values.
- `AP-S02`: `Dashboard-v2/functions/token-usage.js` documents GET as public and returns token/cost statistics without a function-level auth check.
- `AP-S04`: `Dashboard-v2/functions/auth-check.js` still accepts legacy bare `X-Internal-Key`, bypassing HMAC replay protections if that key leaks.
- `AP-W03`: `nex-rag-query.js` is ESM while most function siblings are CJS, making runtime/dependency tracing ambiguous.
- `AP-W05`: `nex-rag-query.js` calls `/chat` with `X-Internal-Source`, but `chat.js` auth expects recognized auth material, so the Claude generation path likely falls back instead of working.
- `AP-N03`: `chat.js` is a 694-line monolith containing chat, ticket creation, ticket fixing, bulk updates, meeting analysis, and document summarization.

### Guardrails

Accepted lane: `r003-prime`

Files covered:

- `Scripts/nex-guardrails/index.js`
- `Scripts/nex-guardrails/inject-event.js`
- `Scripts/nex-guardrails/rails/email-gate-rail.js`
- `Scripts/nex-guardrails/rails/infra-rail.js`
- `Scripts/nex-guardrails/rails/language-rail.js`
- `Scripts/nex-guardrails/rails/output-sanitize-rail.js`
- `Scripts/nex-guardrails/rails/retrieval-confidence-rail.js`
- `Scripts/nex-guardrails/rails/role-scope-rail.js`

High-signal candidates:

- `GR-S03`: guardrail event logs default to `/tmp/nex-guardrails-events.jsonl`, potentially exposing rail decisions and reasons to local users depending on runtime permissions.
- `GR-S04`: `email-gate-rail.js` stores pending email payloads in `/tmp/nex-email-gate-pending.json`.
- `GR-S05`: PostgREST audit logging silently skips when Supabase/PostgREST env vars are missing, so guardrails can enforce without producing an audit trail.
- `GR-S06`: language rail uses a very small fixed German-word regex list, so it is pattern-only and trivially bypassable.
- `GR-S08`: retrieval-confidence rail passes when `ragScores` is missing or empty, making missing caller context a fail-open condition.
- Positive: `runGuardrails` is a clear middleware-style chain and short-circuits on first failure.

### Daemon Helper Libraries

Accepted lane: `r003-maximums`

Files covered:

- `Scripts/lib/agent-registry.js`
- `Scripts/lib/group-broadcaster.js`
- `Scripts/lib/reasoning-chain.js`
- `Scripts/lib/plane-client.js`
- `Scripts/lib/tenant.js`
- `Scripts/lib/infomaniak-ai.js`
- `Scripts/lib/sync-customer-to-plane.js`

High-signal candidates:

- `DL-W01`: `sync-customer-to-plane.js` has its own Plane HTTP helper and bypasses the centralized `plane-client.js` rate limiter.
- `DL-W02`: `infomaniak-ai.js` is an ESM module with no callers found in the tracked repo.
- `DL-W03`: `group-broadcaster.js` hardcodes the NEX Brain Telegram group id and allows caller-provided `meta.agentName`, so local callers can impersonate agents in coordination messages.
- `DL-S02`: `group-broadcaster.js` interpolates `agent`, `type`, `entity`, and `summary` into HTML Telegram messages without escaping.
- `DL-S04`: the CLI path in `sync-customer-to-plane.js` retrieves a Supabase service key through macOS Keychain and can write customer sync state to Plane/Supabase.
- Positive: `plane-client.js` includes a token-bucket limiter, retry-after handling, and a pagination cap tied to a documented 429 incident.
- Positive: `tenant.js` deep-freezes config and validates required fields.

### Provider/Auth/Webhook Wiring

Accepted lane: `ZETA_ALPHA_RICK_OPUS`

Files covered:

- `Dashboard-v2/functions/auth.js`
- `Dashboard-v2/functions/shared-plane.js`
- `Dashboard-v2/functions/shared-plane-client.js`
- `Dashboard-v2/functions/plane.js`
- `Dashboard-v2/functions/plane-webhook.js`
- `Dashboard-v2/functions/outlook-webhook.js`
- `Dashboard-v2/functions/outlook-sync.js`
- `Dashboard-v2/functions/outlook-subscribe.js`

High-signal candidates:

- `ZA-S01`: `outlook-subscribe.js` has no visible auth gate and can create, renew, or delete Microsoft Graph subscriptions when invoked.
- `ZA-S02`: `auth.js` still accepts an unsalted SHA256 legacy password hash fallback when `AUTH_PASSWORD_HASH` exists.
- `ZA-S03`: `plane-webhook.js` and `outlook-webhook.js` call `event-dispatch` with legacy `X-Internal-Key` instead of HMAC.
- `ZA-S05`: `outlook-sync.js` constructs an OData filter from user-supplied values with only basic escaping; needs validation.
- `ZA-S06`: `plane-webhook.js` rate limiting uses an anon Supabase key and appears to fail open if the RPC is unavailable.
- `ZA-N01`: two Plane clients exist (`shared-plane.js` and `shared-plane-client.js`) with overlapping purpose and different rate-limit semantics.
- Positive: `plane.js` restricts proxied paths to a workspace prefix and blocks traversal-ish patterns.
- Positive: `outlook-sync.js` uses an auth gate and env-derived mailbox allowlist.

## Invalidated Process Lane Notes

RIQ produced useful hypotheses, but they are not accepted as clean process findings because it read protected Claude project memory.

Useful-but-contaminated hypotheses:

- coverage ledger has no `covered_by_run` or `inspected_in_batch` field;
- Run 002 completions were not merged into the ledger;
- lane assignment appears imbalanced and does not match process-lane reality;
- security candidates need a promotion gate from lane output into `06_security-findings.md`;
- all `10_exhaustive-coverage-ledger.md` rows still appear to have unknown line/word counts.

These must be rechecked by C-137 or a clean RIQ lane before acceptance.

## C-137 Verification Notes

Spot checks confirmed the main accepted findings:

- `nex-rag-query.js` lines 11-14 define Supabase URL/key selection and no auth gate before handler entry.
- `nex-rag-query.js` lines 49-105 query `entity_state`, tickets, decisions, and audit logs.
- `token-usage.js` lines 106-123 allow GET stats without auth logic.
- `outlook-subscribe.js` lines 89-140 create/renew/delete Graph subscriptions, and lines 143-152 expose the handler without an auth gate.
- `auth.js` lines 130-148 keep the SHA256 legacy password fallback.
- `output-sanitize-rail.js` lines 4-10 define broad secret patterns; `retrieval-confidence-rail.js` lines 14-16 passes when scores are missing.
- `index.js` lines 60-64 silently skips PostgREST logging when env is absent.
- `group-broadcaster.js` lines 23-31 expose the group id and keychain service names; lines 75-83 interpolate unescaped HTML.

## Next Required Correction

Before Run 004:

1. Re-run process QA in a clean lane with an explicit `FORBIDDEN_PATHS` reminder and no memory search.
2. Add a coverage update mechanism to mark Run 002 and Run 003 accepted files.
3. Create a candidate-promotion gate so accepted security candidates become lifecycle rows in `06_security-findings.md`.
4. Prioritize validation of:
   - `AP-S01` unauthenticated `nex-rag-query.js`;
   - `AP-S02` public token usage stats;
   - `ZA-S01` unauthenticated `outlook-subscribe.js`;
   - `ZA-S02` SHA256 fallback;
   - `GR-S05` silent guardrail audit loss;
   - `DL-S02` Telegram HTML injection path.
