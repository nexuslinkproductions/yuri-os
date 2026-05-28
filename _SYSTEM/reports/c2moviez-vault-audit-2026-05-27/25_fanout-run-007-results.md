# Fanout Run 007 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no target execution, no live service calls, no credential use
Parallel lane cap: `3`

## Acceptance Summary

Run 007 is accepted.

- `R007_PRIME_TELEGRAM_PLANE_SONNET / TELEGRAM-PLANE-007`: accepted after Opus escalation, `files_covered=4 findings=13 suppressions=3 deferred=1 invalidated=0`.
- `R007_SECURITY_AUTH_CONFIG_SONNET / AUTH-CONFIG-007`: accepted after Opus escalation, `files_covered=6 findings=13 suppressions=2 deferred=0 invalidated=0`.
- `R007_DAEMON_GUARDRAILS_SONNET / DAEMON-GUARDRAILS-007`: accepted after Opus escalation, `files_covered=13 findings=12 suppressions=4 deferred=0 invalidated=0`.

Accepted target-file coverage added by Run 007: `23` assigned files.

Accepted target-file coverage total after Run 007: `105 / 1505` tracked files.

Contamination check: passed. The pipe-log scan found all expected `BATCH_CLOSE` markers and no protected Claude runtime reads, no `Searched memories` event, and no invalidated lane output.

Source pipe logs:

- `/tmp/yuri-c2v-fanout-run-007/pipe-v2/r007-telegram.pipe.log`
- `/tmp/yuri-c2v-fanout-run-007/pipe-v2/r007-auth.pipe.log`
- `/tmp/yuri-c2v-fanout-run-007/pipe-v2/r007-daemon.pipe.log`

## Process Note

Run 007 intentionally tested whether Sonnet at maximum repo-grounding effort could run file-level audit lanes. Two fresh Sonnet lanes rejected the orchestrator packet because they could not see the parent authorization transcript; the auth lane accepted the clone, but was reset for consistency. The run was then escalated back to Opus worker lanes under the same OS sandbox and lane cap.

Conclusion: Sonnet may be useful after a shared trust/context prelude is established, but fresh isolated Sonnet workers are not yet reliable for this authorized external-audit packet shape. The active lane cap remains `3`.

## Executive Findings

Run 007 tightened the exact area Marcel asked us to weight more heavily: whether the repo is wired correctly, navigable by LLMs, and structurally safe as a Telegram-to-Claude command center.

The Telegram lane found that core approval buttons are still unwired: `tracker-plan-submit.js` emits `tplan_approve` and `tplan_reject`, but `telegram.js` has no handler and will route unknown callbacks into the AI text path. It also found that `telegram.js` duplicates Telegram and Plane clients instead of using the shared fixed clients, preserving a known broken pagination pattern and bypassing the rate-limited Plane client.

The auth/config lane found good single-admin auth hardening, including bcrypt, JWT revocation, httpOnly cookies, rate limiting, and clean error surfaces. The main remaining risks are privilege fallback patterns in non-auth functions, legacy SHA256 password fallback, and legacy bare `X-Internal-Key` bypass support.

The daemon/guardrail lane found that the NEX guardrail chain is structurally strong, but not complete: two direct Telegram sends bypass guardrails, the hold approval mechanism is not implemented, inbound non-allowed Telegram messages can still reach the persistent Claude session, and the daemon queue is unbounded.

## Telegram And Plane Lane

Lane: `R007_PRIME_TELEGRAM_PLANE_SONNET`
Batch: `TELEGRAM-PLANE-007`

Files covered:

- `Dashboard-v2/functions/telegram.js`
- `Dashboard-v2/functions/shared-telegram.js`
- `Dashboard-v2/functions/shared-plane-client.js`
- `Dashboard-v2/functions/shared-plane.js`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `TP007-01` | high | `Dashboard-v2/functions/telegram.js:2800` | wiring | `tplan_approve` and `tplan_reject` callbacks are emitted by `tracker-plan-submit.js:108-109`, but `telegram.js` has no handler. Unknown callbacks fall through to `handleCommand(chatId, cbData)`, so approval/rejection buttons become AI text instead of plan decisions. |
| `TP007-02` | high | `Dashboard-v2/functions/telegram.js:791-804` | architecture | `telegram.js` still uses page-number Plane pagination while `shared-plane.js:48-71` contains the cursor/dedupe fix for the known duplicate-page bug. |
| `TP007-03` | high | `Dashboard-v2/functions/telegram.js:1-120` | architecture | `telegram.js` reimplements Telegram and Plane HTTP helpers instead of importing `shared-telegram.js` and `shared-plane.js`, so fixes drift across duplicate API clients. |
| `TP007-04` | medium | `Dashboard-v2/functions/telegram.js:2504-2511` | security | Telegram webhook `secret_token` validation is conditional. If `TELEGRAM_WEBHOOK_SECRET_TOKEN` is unset, function URL POSTs are accepted. |
| `TP007-05` | medium | `Dashboard-v2/functions/telegram.js:2565-2567` | wiring | Incoming webhook messages are short-circuited before the text/voice handlers below, leaving dead handler blocks that confuse audit/navigation. |
| `TP007-06` | medium | `Dashboard-v2/functions/telegram.js:81` | stability | `_meetingProposals` is an in-memory serverless cache without eviction; blob fallback exists but warm instances can accumulate stale proposals. |
| `TP007-07` | medium | `Dashboard-v2/functions/telegram.js:47-76` | stability | Inline Plane calls have no request timeout, no token bucket, and only fixed short retries, while `shared-plane-client.js` has rate limiting and backoff. |
| `TP007-08` | medium | `Dashboard-v2/functions/telegram.js:1884-1885` | wiring | Ticket wizard priority buttons use `wiz:assignee:*` callback data while the active step is priority. It works by accident through later value handling, but is semantically miswired. |
| `TP007-09` | low | `Dashboard-v2/functions/shared-telegram.js:86-93` | positive | CEO-bound messages get language-drift tagging and audit logging, while internal helper options are stripped before Telegram API calls. |
| `TP007-10` | low | `Dashboard-v2/functions/shared-plane-client.js:16-103` | positive | Shared Plane client has token-bucket limiting, Retry-After support, exponential backoff, and clean request/call separation. |
| `TP007-11` | low | `Dashboard-v2/functions/shared-plane.js:48-71` | positive | Shared Plane pagination uses cursor progression, ID dedupe, stall detection, and a hard page cap. |
| `TP007-12` | low | `Dashboard-v2/functions/telegram.js:611` | security | M365 client secret is not logged, but token acquisition is duplicated in two places with divergent error handling. |
| `TP007-13` | low | `Dashboard-v2/functions/telegram.js:2808-2809` | stability | Top-level catch returns `200 ok` for all errors without logging, which prevents Telegram retries and hides crashes. |

Suppressions:

- API keys read from env at module scope were not logged by the inspected files.
- `shared-telegram.js` drift audit payloads did not include service-role keys.
- `getDashboardData` was not validated as the likely cause of 30GB RAM symptoms; duplicates can inflate memory, but current caps do not prove the extreme symptom.

Deferred:

- `Dashboard-v2/functions/telegram.js:366-377`: lead wizard internal call with `INTERNAL_SERVICE_KEY` needs broader internal-auth review.

## Auth And Config Lane

Lane: `R007_SECURITY_AUTH_CONFIG_SONNET`
Batch: `AUTH-CONFIG-007`

Files covered:

- `Dashboard-v2/functions/auth.js`
- `Dashboard-v2/functions/auth-check.js`
- `Dashboard-v2/functions/shared-config.js`
- `Dashboard-v2/functions/shared-data.js`
- `Dashboard-v2/functions/shared-team-config.js`
- `Dashboard-v2/functions/shared-facts.js`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `AC007-01` | info | `Dashboard-v2/functions/auth.js` | positive | Auth hardening is strong for a single-admin dashboard: bcrypt cost 12, JWT with `jti` revocation, httpOnly secure strict cookie, zod validation, rate limiting, and audit trail. |
| `AC007-02` | low | `Dashboard-v2/functions/auth.js:131` | security | Legacy unsalted SHA256 password fallback remains if bcrypt config is missing or comparison fails. |
| `AC007-03` | info | `Dashboard-v2/functions/auth-check.js` | positive | Protected endpoints consistently use async revocation-aware `checkAuth`; deprecated sync check is not exported. |
| `AC007-04` | low | `Dashboard-v2/functions/auth-check.js:121` | security | Legacy bare `X-Internal-Key` fallback still works when HMAC headers are absent. |
| `AC007-05` | medium | cross-ref from config helpers | security | Several non-auth functions use `SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY`, causing silent privilege downgrade if service-role env is missing. |
| `AC007-06` | info | `Dashboard-v2/functions/auth.js:42` | positive | Auth infrastructure itself uses service-role credentials and does not fall back to anon. |
| `AC007-07` | info | `Dashboard-v2/functions/shared-facts.js:6` | positive | `shared-facts.js` uses anon key by design, relying on Supabase policy/RPC controls. |
| `AC007-08` | low | `Dashboard-v2/functions/shared-config.js` | architecture | Team/project config maps identities but does not enforce per-user authorization. Acceptable only under the single-admin assumption. |
| `AC007-09` | info | `Dashboard-v2/functions/shared-data.js` | architecture | `getDashboardData()` returns all project/team/client data to any authenticated caller, matching a single-admin model but not multi-user roles. |
| `AC007-10` | medium | `Dashboard-v2/functions/shared-data.js` | security | `shared-data.js` re-exports full Plane and storage helpers, so importers inherit powerful data access without module-level caller checks. |
| `AC007-11` | low | `Dashboard-v2/functions/shared-facts.js:86` | security | `assertFact()` writes through an anon-key RPC; integrity depends on caller gates and server-side RPC validation. |
| `AC007-12` | info | `Dashboard-v2/functions/auth.js` | positive | Auth error responses and logs do not expose password, hash, token, or secret values. |
| `AC007-13` | info | `Dashboard-v2/functions/auth-check.js` | positive | `auth-check.js` denial responses are generic and do not leak internal state. |

Suppressions:

- Static Plane member UUIDs and env var names in `shared-team-config.js` are not secrets.
- Public Supabase anon key exposure is not itself a leak; RLS is the security boundary.

## Daemon And Guardrail Lane

Lane: `R007_DAEMON_GUARDRAILS_SONNET`
Batch: `DAEMON-GUARDRAILS-007`

Files covered:

- `Scripts/exeo-daemon.js`
- `Scripts/lib/agent-registry.js`
- `Scripts/lib/decision-recorder.js`
- `Scripts/lib/group-broadcaster.js`
- `Scripts/lib/heartbeat.js`
- `Scripts/nex-guardrails/index.js`
- `Scripts/nex-guardrails/inject-event.js`
- `Scripts/nex-guardrails/rails/email-gate-rail.js`
- `Scripts/nex-guardrails/rails/infra-rail.js`
- `Scripts/nex-guardrails/rails/language-rail.js`
- `Scripts/nex-guardrails/rails/output-sanitize-rail.js`
- `Scripts/nex-guardrails/rails/retrieval-confidence-rail.js`
- `Scripts/nex-guardrails/rails/role-scope-rail.js`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `DG007-01` | high | `Scripts/exeo-daemon.js:311-312` | security | Two direct `tg('sendMessage')` paths bypass `guardedTgSend()`: hold alerts and voice transcript echo. The transcript path can send user-supplied text without output/language guardrails. |
| `DG007-02` | high | `Scripts/exeo-daemon.js:310-313` | wiring | Guardrail hold alerts ask CEO to reply `approve {holdId}` or `reject {holdId}`, but no handler parses those commands. Held messages can be permanently lost. |
| `DG007-03` | medium | `Scripts/nex-guardrails/rails/output-sanitize-rail.js:9-10` | stability | Generic 32+ alphanumeric secret detection is too broad and can false-positive on legitimate identifiers or encoded values. |
| `DG007-04` | medium | `Scripts/nex-guardrails/rails/language-rail.js:3-4` | llm_nav | Language rail only detects German markers, despite the broader "always English" policy. French, Italian, Romansh, and other non-English outputs can pass. |
| `DG007-05` | medium | `Scripts/exeo-daemon.js:717-770` | security | `processMessage()` dispatches all incoming messages to Claude; allowed-user checks are only applied to selected branches. Unknown Telegram senders can reach the persistent Claude session. |
| `DG007-06` | medium | `Scripts/exeo-daemon.js:957-964` | stability | Incoming message queue is unbounded, so floods can grow memory while serial processing is blocked. |
| `DG007-07` | low | `Scripts/exeo-daemon.js:606` | stability | A stuck Claude turn blocks the daemon for up to 120 seconds per message, allowing backlog growth under sustained failure. |
| `DG007-08` | low | `Scripts/lib/decision-recorder.js:160-194` | positive | Decision recorder is a bounded one-shot process with a 500-ID ring buffer. |
| `DG007-09` | info | `Scripts/lib/agent-registry.js` | positive | Static agent registry is auditable and LLM-navigation friendly. |
| `DG007-10` | info | `Scripts/nex-guardrails/index.js` | positive | Guardrail chain is structurally mandatory for normal fallback sends, ordered, short-circuiting, and dual-logged. |
| `DG007-11` | info | `Scripts/nex-guardrails/inject-event.js` | positive | Synthetic guardrail event injector has validation and supports offline SOC/test integration. |
| `DG007-12` | info | `Scripts/lib/heartbeat.js` | positive | Heartbeat helper is fire-and-forget and cannot crash callers. |

Suppressions:

- `execSync` calls in `exeo-daemon.js` use hardcoded paths/services and do not interpolate user input into shell commands.
- Whisper transcription shell risk via `audioPath` is negligible based on timestamp-derived path construction.
- Unicode homoglyph bypass of role-scope rail is theoretical for an accidental-output rail.
- Hardcoded Telegram group ID in `group-broadcaster.js` is not itself an injection surface.

## Immediate Implications

Run 007 confirms that Claudio's repo has several strong defensive foundations, but also several exact wiring failures that explain why command-center behavior can appear functional while important actions silently do not happen.

Most important next fixes for Claudio, once this becomes a remediation project rather than read-only audit:

1. Wire `tplan_approve` and `tplan_reject` into the Telegram callback handler.
2. Replace Telegram's inline Plane/Telegram clients with the shared rate-limited clients.
3. Make Telegram webhook secret enforcement fail closed.
4. Add an early sender allowlist before any Telegram message reaches the persistent Claude session.
5. Implement guardrail hold approve/reject release logic.
6. Add queue caps and clearer timeout/liveness handling around daemon-to-Claude dispatch.

## Next Queue

Run 008 should remain capped at three active lanes and target the next surfaces:

1. Public/external-facing `Dashboard-v2/functions/*.js`, grouped by provider, auth model, write capability, and service-role use.
2. `Scripts/telegram-mcp/*` plus adjacent startup scripts, to close the Telegram poller/server side of the Telegram-to-Claude chain.
3. MCP/RAG/RVF write authority: `Scripts/nex-rvf/*`, vault apply/search helpers, and any write-back tools that can mutate Obsidian or repository state.
