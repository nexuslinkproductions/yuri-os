# Fanout Run 010 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no target execution, no live service calls, no credential use
Parallel lane cap: `3`

## Acceptance Summary

Run 010 is accepted.

- `R010_TEAM_BOTS_OPUS / TEAM-BOTS-010`: accepted, `files_covered=11 findings=13 suppressions=3 deferred=1 invalidated=0`.
- `R010_PRIME_QWEN_HEARTBEAT_OPUS / PRIME-QWEN-HEARTBEAT-010`: accepted, `files_covered=8 findings=14 suppressions=4 deferred=0 invalidated=0`.
- `R010_SUPABASE_RLS_RPC_OPUS / SUPABASE-RLS-010`: accepted, `files_covered=9 findings=13 suppressions=2 deferred=2 invalidated=0`.

Accepted assigned target surfaces added by Run 010: `28`.

Accepted assigned target coverage total after Run 010: `194 / 1505` tracked files.

Strict semantic caveat carried forward: two lockfiles are currently `partial`: `Scripts/telegram-mcp/package-lock.json` from Run 008 and `Scripts/team-bots/package-lock.json` from Run 010. Full semantic coverage is `192 covered + 2 partial`.

Contamination check: passed. C-137 scanned Run 010 pipe logs for protected Claude runtime paths, `Searched memories`, and invalidation markers; no matches were found.

Clone proof: C-137 verified the target clone at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, clean status count `0`, and `1505` tracked files.

Source pipe logs:

- `/tmp/yuri-c2v-fanout-run-010/pipe/r010-team-bots.pipe.log`
- `/tmp/yuri-c2v-fanout-run-010/pipe/r010-prime-qwen.pipe.log`
- `/tmp/yuri-c2v-fanout-run-010/pipe/r010-supabase.pipe.log`

## C-137 Severity Adjustments

Lane severities remain advisory. C-137 adjusted or qualified these before acceptance:

- `RLS010-F01` and `RLS010-F02`: accepted as critical deployment-order candidates, not proven live criticals. The Phase L migration explicitly says "NOT YET APPLIED", while later migration `005_n1_rls_lockdown.sql` revokes anon access. If Phase L is applied after the lockdown or the live DB matches Phase L grants, the impact is critical. Live migration order remains deferred.
- `RLS010-F07`: accepted as medium hardening risk. `nex_search` is callable by default unless privileges are revoked, but it is not `SECURITY DEFINER`; RLS can still block table access.
- `TB010-02`: accepted for `team-poller.js`, but not generalized to `fanny-bot.js`. C-137 verified `fanny-bot.js` has its own allowlist before queueing messages; the generic team poller and unified `team-bot.js` do not show equivalent sender checks.
- `PQH-002`: kept as high privacy/operational coupling risk, not a secret-key leak. The hardcoded Telegram identifier is not credential material, but it is sensitive identity/control-plane metadata.

## Executive Findings

Run 010 strengthens the audit picture in three directions.

First, the team-bot layer has inconsistent ingress trust. `fanny-bot.js` has a meaningful allowlist before processing/queueing, but the generic `team-bot.js` and `team-poller.js` process or persist incoming Telegram messages without an equivalent user/chat allowlist. That means one part of the team-bot system is substantially safer than the reusable/generalized pieces around it.

Second, the prime/Qwen/heartbeat lane confirms that "memory" and "health" can be polluted from weakly trusted local surfaces. Several helpers read `/tmp` JSONL/state files, insert CEO-derived text into Supabase, and later build prompts from those rows. This creates a prompt-supply-chain risk: even if the model lane is stable, the material feeding its boot prompt can be contaminated or can persist sensitive CEO content.

Third, Supabase migrations contain a dangerous split-brain story. Some migrations show strong lockdown practices, but the Phase L fact-ledger migration grants anon/authenticated execution on `SECURITY DEFINER` fact assertion and retraction RPCs. The repo says Phase L was pending, while code comments and helpers expect anon-accessible fact ledger behavior. This must be verified against live migration state before calling it live-exploitable, but the design risk is serious enough to prioritize.

## Team Bots Lane

Lane: `R010_TEAM_BOTS_OPUS`
Batch: `TEAM-BOTS-010`

Files covered:

- `Scripts/team-bots/fanny-bot.js`
- `Scripts/team-bots/team-bot.js`
- `Scripts/team-bots/team-poller.js`
- `Scripts/team-bots/notify.js`
- `Scripts/team-bots/team-config.js`
- `Scripts/team-bots/start-pollers.sh`
- `Scripts/team-bots/fanny-daemon-tmux.sh`
- `Scripts/team-bots/fanny-bot-tmux.sh`
- `Scripts/team-bots/chat-ids.json`
- `Scripts/team-bots/package.json`
- `Scripts/team-bots/package-lock.json` (partial/structure review)

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `TB010-01` | high | `Scripts/team-bots/team-bot.js:465-483` | security | Unified team bot handles commands, saves chat IDs, and fetches Plane ticket data without an observed sender/chat allowlist. |
| `TB010-02` | high | `Scripts/team-bots/team-poller.js:218-233` | security | Generic poller persists every incoming Telegram message to `/tmp/telegram-inbox-{name}.jsonl` without validating `from_id` or `chat_id`. |
| `TB010-03` | high | `Scripts/team-bots/fanny-daemon-tmux.sh:31-46` | secret handling | Anthropic key is loaded from Keychain and embedded literally in the tmux session shell command environment. |
| `TB010-04` | medium | `Scripts/team-bots/fanny-bot.js:1322` | secret hygiene | Startup log prints the first 8 characters of the bot token. For Telegram tokens this can expose the bot ID prefix. |
| `TB010-05` | medium | `Scripts/team-bots/fanny-bot.js:678-704` | stability | `askClaude()` calls `logTokenUsage(source, ...)`, but `source` is undefined in that scope. Successful AI responses can trigger a runtime error before returning. |
| `TB010-06` | medium | `Scripts/team-bots/team-config.js:34`, `Scripts/team-bots/notify.js:82-89` | wiring | Marcel's quiet hours are configured as `06:00-20:00`; `notify.js` interprets that range as "do not send", suppressing workday notifications. |
| `TB010-07` | medium | `Scripts/team-bots/fanny-bot.js:195-204` | availability | Every render request launches Chrome through Puppeteer with `--no-sandbox`; no concurrency limiter is visible. |
| `TB010-08` | medium | `Scripts/team-bots/fanny-bot.js:253-272` | availability | Voice transcription uses synchronous `ffmpeg` and `whisper-cli` calls with up to 90 seconds of blocking work. |
| `TB010-09` | medium | `Scripts/team-bots/start-pollers.sh:11-17` | reliability | Restart kills pollers and truncates inbox JSONL files, which can drop unprocessed messages. |
| `TB010-10` | low | `Scripts/team-bots/chat-ids.json` | privacy/config | Real Telegram chat/user IDs are committed as routing config. They are identifiers, not credentials, but they should be treated as sensitive operational metadata. |
| `TB010-11` | low | `Scripts/team-bots/team-poller.js:47-48` | hygiene | `OPENAI_KEY` is retrieved from Keychain but unused, increasing unnecessary secret touch surface. |
| `TB010-12` | info | `Scripts/team-bots/fanny-bot.js:66-72`, `Scripts/team-bots/fanny-bot.js:1111-1177` | positive | Fanny bot has a strict allowlist, Keychain-first token retrieval, audit logging, single-instance guard, heartbeat, and ticket caching. |
| `TB010-13` | info | `Scripts/team-bots/fanny-bot.js` | architecture | `fanny-bot.js` is a 1333-line monolith spanning polling, auth, Plane, AI, vision, rendering, voice, docs, commitments, logging, and notifications. This is a navigation and maintenance risk. |

Suppressions:

- Supabase service-role use in `fanny-bot.js` is currently narrow and server-local in the inspected code.
- Token usage logging gives useful cost visibility even though rate/concurrency controls still need work.
- Chat IDs are not credentials; treat as sensitive identifiers, not secret keys.

Deferred:

- `Scripts/team-bots/package-lock.json` needs a real dependency audit in a later supply-chain lane; this run only gave it structure/manifest coverage.

## Prime/Qwen/Heartbeat Lane

Lane: `R010_PRIME_QWEN_HEARTBEAT_OPUS`
Batch: `PRIME-QWEN-HEARTBEAT-010`

Files covered:

- `Scripts/build-prime.sh`
- `Scripts/qwen-fast.js`
- `Scripts/lib/heartbeat.sh`
- `Scripts/lib/heartbeat.js`
- `Scripts/lib/ceo-correction-detector.js`
- `Scripts/lib/nex-system-prompt.md`
- `Scripts/lib/reasoning-chain.js`
- `Scripts/lib/night-mode.js`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `PQH-001` | high | `Scripts/build-prime.sh:34-82` | prompt-supply-chain | Supabase correction/signal rows are inserted into the assembled prime prompt with length caps but no instruction/content sanitization. |
| `PQH-002` | high | `Scripts/lib/ceo-correction-detector.js:22-27`, `Scripts/lib/ceo-correction-detector.js:285-287` | privacy/config | CEO Telegram identifier is hardcoded in tracked source and used as the sole identity filter. |
| `PQH-003` | high | `Scripts/lib/ceo-correction-detector.js:22-24`, `Scripts/lib/ceo-correction-detector.js:413-430` | local trust boundary | Detector reads `/tmp/telegram-inbox.jsonl` and state/log files under `/tmp`; any local process able to write that file can forge CEO-shaped JSON unless the producer side is trusted. |
| `PQH-004` | medium | `Scripts/qwen-fast.js:55-65`, `Scripts/qwen-fast.js:76-82` | output handling | Local Qwen response is sent to Telegram with `parse_mode: "HTML"` and no HTML escaping or content filter. |
| `PQH-005` | medium | `Scripts/lib/ceo-correction-detector.js:355-385` | privacy/data retention | CEO message signal extraction stores `context` and up to 1000 chars of raw message text into Supabase. |
| `PQH-006` | medium | `Scripts/lib/heartbeat.sh:42-52` | stability | Bash heartbeat builds JSON through string interpolation; quotes/newlines in agent/status/action values can corrupt payloads. |
| `PQH-007` | medium | `Scripts/build-prime.sh:59-82` | prompt-supply-chain | `nex_ceo_signals_recent` values and contexts flow into `/tmp/nex-prime.txt`, making signal rows part of the agent boot prompt. |
| `PQH-008` | medium | `Scripts/lib/reasoning-chain.js:24-39`, `Scripts/migrations/2026-04-22-phase-k.sql:145` | data integrity | Reasoning-chain writer uses the anon Supabase key and a `SECURITY DEFINER` RPC granted to anon/authenticated. |
| `PQH-009` | low | `Scripts/lib/heartbeat.js:54-65` | false health | Node heartbeat swallows failed writes; dashboard health can become stale without an explicit local error signal. |
| `PQH-010` | low | `Scripts/build-prime.sh:25-27` | portability/nav | Prime assembly depends on absolute user-machine paths and writes to `/tmp/nex-prime.txt`. |
| `PQH-011` | info | `Scripts/lib/ceo-correction-detector.js` | llm_nav | Single 459-line detector mixes corrections, positive feedback, commitments, signals, Supabase writes, and polling. |
| `PQH-012` | info | `Scripts/lib/night-mode.js` | positive | Night-mode evaluator uses explicit Europe/Zurich timezone handling and a clean boolean API. |
| `PQH-013` | info | `Scripts/lib/nex-system-prompt.md` | positive | Prompt contains useful approval boundaries, including draft-before-send behavior for email. |
| `PQH-014` | info | `Scripts/qwen-fast.js:28-33`, `Scripts/qwen-fast.js:49` | positive | Qwen fast path is restricted to short greetings/acks and has an 8-second timeout before falling through. |

Suppressions:

- `build-prime.sh` does not echo the service-role key in the inspected output path.
- `ceo-correction-detector.js` caps processed IDs and signal count per message.
- `reasoning-chain.js` flushes bounded chain arrays supplied by callers; no unbounded accumulation was proven in this lane.
- `night-mode.js` weekend and timezone handling looked intentionally designed, not accidental.

## Supabase RLS/RPC Lane

Lane: `R010_SUPABASE_RLS_RPC_OPUS`
Batch: `SUPABASE-RLS-010`

Files covered:

- `Dashboard-v2/db-migrations/003_security_hardening.sql`
- `Dashboard-v2/db-migrations/004_n1_auth_hardening.sql`
- `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql`
- `Dashboard-v2/db-migrations/007_nex_rag_foundation.sql`
- `Dashboard-v2/db-migrations/013_nex_h2_verification.sql`
- `Dashboard-v2/db-migrations/014_nex_coherence.sql`
- `Dashboard-v2/db-migrations/018_nex_local_inference_log.sql`
- `Scripts/migrations/2026-04-24-fix-view-security-invoker.sql`
- `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `RLS010-F01` | critical candidate | `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql:111-197` | data integrity | `assert_fact(...)` is `SECURITY DEFINER` and granted to `anon, authenticated`. If live, a public anon key holder can insert/supersede fact-ledger records. |
| `RLS010-F02` | critical candidate | `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql:222-253` | data integrity | `retract_fact(uuid,text,text)` is `SECURITY DEFINER` and granted to `anon, authenticated`. If live with readable fact IDs, a public anon key holder can retract facts. |
| `RLS010-F03` | high | `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql:1-5`, `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql:33-117` | migration order | Phase L says "NOT YET APPLIED" and grants broad anon fact access; migration 005 later locks down those surfaces. Actual live order/state is unresolved. |
| `RLS010-F04` | high | `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql:92-101`, `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql:259-275` | RLS/view security | Phase L views do not specify `security_invoker`; later repo patterns use explicit security-invoker/lockdown for sensitive views. |
| `RLS010-F05` | medium | `Scripts/migrations/2026-04-24-fix-view-security-invoker.sql:57`, `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql:73-117` | migration order | `exeo_reasoning_graph_live` is granted to anon/authenticated in the older fix migration; migration 005 later revokes it. Live order must be verified. |
| `RLS010-F06` | medium | `Dashboard-v2/db-migrations/003_security_hardening.sql:113-129` | access control | `scheduled_blocks` grants anon full CRUD for browser scheduler behavior with no visible per-user/object scoping. |
| `RLS010-F07` | medium | `Dashboard-v2/db-migrations/007_nex_rag_foundation.sql:153-190`, `Dashboard-v2/db-migrations/008_nex_rvf_resize_to_384.sql:42-80`, `Dashboard-v2/db-migrations/009_nex_search_outcome_boost.sql:16-90` | RPC hardening | `nex_search` is repeatedly created without explicit revoke/grant closure. `nex_search_v2` later shows the better pattern: revoke from public and grant service-role only. |
| `RLS010-F08` | medium | `Dashboard-v2/db-migrations/004_n1_auth_hardening.sql` | availability | Auth rate-check cleanup deletes old attempts on every invocation; under auth load this can create avoidable DB contention. |
| `RLS010-F09` | low | `Dashboard-v2/db-migrations/014_nex_coherence.sql` | operations | Single-active baseline is protected by a unique partial index, but no atomic swap helper is visible in this lane. |
| `RLS010-F10` | info | `Dashboard-v2/db-migrations/004_n1_auth_hardening.sql` | positive | Auth hardening includes revocation, rate limiting, audit trail, deny policies, and search-path controls. |
| `RLS010-F11` | info | `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql:1-31`, `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql:187-193` | positive | Lockdown migration is idempotent, documents final anon access state, and handles tables/views/matviews defensively. |
| `RLS010-F12` | info | `Dashboard-v2/db-migrations/013_nex_h2_verification.sql` | positive | H2 verification shows the preferred pattern: service-role-only RPC grants and `security_invoker` view handling. |
| `RLS010-F13` | info | `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql:1-37` | positive | Fact-ledger conceptual model is clear and valuable; the problem is privilege/deployment posture, not the data model goal. |

Suppressions:

- `Dashboard-v2/db-migrations/018_nex_local_inference_log.sql` did not show anon/authenticated grants in assigned evidence; service-role-only posture appears intentional.
- `003_security_hardening.sql` `prune_audit_log` concern is suppressed for this lane: fixed cutoff, pinned search path, and no anon grant in the inspected block.

Deferred:

- Actual live Supabase migration order and current grants/RLS must be verified through a separately scoped read-only Supabase procedure. GitHub evidence alone cannot decide whether Phase L is live.
- Full storage bucket policy review remains outside this lane.

## C-137 Spot Checks

C-137 directly checked these anchors in the canonical clone before accepting:

- `team-bot.js:465-483`: command handling lacks observed allowlist and saves chat ID from any message.
- `team-poller.js:218-233`: all messages are written to JSONL.
- `fanny-bot.js:1111-1177`: Fanny path has a real allowlist, so generic poller findings must not be overgeneralized.
- `fanny-daemon-tmux.sh:31-46`: key loaded from Keychain and inserted into tmux command string.
- `fanny-bot.js:678-704`: undefined `source` in `askClaude()`.
- `fanny-bot.js:195-204` and `253-272`: Chrome launch and blocking voice transcription.
- `start-pollers.sh:11-17`: pollers killed and inbox files truncated.
- `ceo-correction-detector.js:22-27`, `285-287`, `413-430`: `/tmp` inbox/state and hardcoded CEO identity check.
- `ceo-correction-detector.js:355-385`: CEO signal text and context writes.
- `build-prime.sh:34-82`: corrections/signals flow into prime prompt.
- `qwen-fast.js:55-65`: raw Qwen text sent as Telegram HTML.
- `heartbeat.sh:42-52`: shell-interpolated JSON payload.
- `reasoning-chain.js:24-39` plus `2026-04-22-phase-k.sql:145`: anon-key reasoning RPC path.
- `2026-04-27-phase-l-fact-ledger.sql:111-197`, `222-253`: fact assert/retract RPC grants.
- `005_n1_rls_lockdown.sql:33-117`, `187-193`: later lockdown contradicts/mitigates Phase L if applied after it.
- `007`, `008`, `009`, and `019` RAG migrations: `nex_search` lacks explicit revoke in early versions; `nex_search_v2` has explicit service-role-only grant.

## Immediate Implications

1. Fix inbound Telegram identity at every ingress layer, not just in Fanny's specialized bot.
2. Treat `/tmp` JSONL queues as untrusted until producer identity and file permissions are tightened.
3. Stop embedding secrets into tmux command strings; pass them through safer environment/session handling.
4. Verify live Supabase migration order before Claudio relies on the command center's fact ledger.
5. Move prompt-boot material through a sanitizing/typed channel instead of raw Supabase text rows.
6. The next fanout should close remaining Supabase/RAG migrations, storage policies, and the still-open `nex_search_v2`/fact-ledger wiring around dashboard helpers.

## Next Queue

Run 011 should keep the active lane cap at `3` and target:

1. Remaining Supabase/RAG migrations around `nex_search_v2`, storage policies, and fact-ledger helper callers.
2. Remaining team/Telegram daemon consumers that read the generic inboxes.
3. Build/deploy/supply-chain shard for package scripts, lockfiles, Netlify/GitHub workflow surfaces, and dependency posture.
