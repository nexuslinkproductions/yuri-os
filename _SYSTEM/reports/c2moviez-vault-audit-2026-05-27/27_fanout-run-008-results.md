# Fanout Run 008 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no target execution, no live service calls, no credential use
Parallel lane cap: `3`

## Acceptance Summary

Run 008 is accepted with one explicit coverage caveat.

- `R008_EXTERNAL_FUNCTIONS_OPUS / EXTERNAL-FUNCTIONS-008`: accepted, `files_covered=11 findings=17 suppressions=4 deferred=0 invalidated=0`.
- `R008_TELEGRAM_MCP_OPUS / TELEGRAM-MCP-008`: accepted, `files_covered=7 findings=15 suppressions=2 deferred=2 invalidated=0`.
- `R008_RVF_WRITE_AUTHORITY_OPUS / RVF-WRITE-008`: accepted after C-137 proof correction, `files_covered=12 findings=16 suppressions=4 deferred=4 invalidated=0`.

Accepted assigned target surfaces added by Run 008: `30`.

Accepted assigned target coverage total after Run 008: `135 / 1505` tracked files.

Caveat: `Scripts/telegram-mcp/package-lock.json` is counted as an accepted assigned target surface, but its semantic status is `partial` because the lane reviewed the header and dependency structure, not every lockfile line. Strict full-file semantic coverage is therefore `134 covered + 1 partial`.

Contamination check: passed. C-137 scanned the Run 008 pipe logs for protected Claude runtime paths, `Searched memories`, and invalidation markers; no matches were found.

Proof correction: the RVF lane initially emitted `tracked_files=61`, which is the `Scripts/nex-rvf` subtree count, not the full repo count. C-137 verified the canonical clone directly:

```text
commit=8103286e1abc63fa9490cb1375ecde4f340aa2bb
clean_status_count=0
tracked_files=1505
```

The RVF pane appended a correction row, but terminal rendering mangled `lane` to `lan`; C-137's direct Git proof is the authoritative correction.

Source pipe logs:

- `/tmp/yuri-c2v-fanout-run-008/pipe/r008-external.pipe.log`
- `/tmp/yuri-c2v-fanout-run-008/pipe/r008-telegram-mcp.pipe.log`
- `/tmp/yuri-c2v-fanout-run-008/pipe/r008-rvf.pipe.log`

## Executive Findings

Run 008 substantially increases the cybersecurity weight of the audit. It confirms that the repo contains several unauthenticated or weakly authenticated service bridges, and that Telegram-to-Claude control is weaker on the MCP/poller side than the dashboard side alone suggested.

The highest-risk new issue is `offer-create.js`: a public POST endpoint can create Supabase offer rows, push Bexio offer operations, queue local-vault work through `audit_log`, and notify Telegram without an auth check.

The second major issue is Telegram poller ingress. `Scripts/telegram-mcp/poller.js` and `silas-poller.js` write inbound Telegram messages to `/tmp` inboxes without sender allowlisting. Combined with the previously inspected EXEO daemon path, this is a direct injection route from Telegram into the persistent Claude control plane.

The RVF lane found that write authority is thoughtfully concentrated, but path safety is not strong enough for a vault-writing tool: the current path checks do not resolve symlinks or real paths, ticket lookups build paths from unvalidated IDs, and the `memory_audit` child-process path gate uses substring checks instead of canonical path validation.

## External Functions Lane

Lane: `R008_EXTERNAL_FUNCTIONS_OPUS`
Batch: `EXTERNAL-FUNCTIONS-008`

Files covered:

- `Dashboard-v2/functions/outlook-subscribe.js`
- `Dashboard-v2/functions/outlook-webhook.js`
- `Dashboard-v2/functions/outlook-sync.js`
- `Dashboard-v2/functions/plane-webhook.js`
- `Dashboard-v2/functions/event-dispatch.js`
- `Dashboard-v2/functions/offer-create.js`
- `Dashboard-v2/functions/offer-accept.js`
- `Dashboard-v2/functions/fanny-ai.js`
- `Dashboard-v2/functions/marketing-studio.js`
- `Dashboard-v2/functions/nexbox-fleet.js`
- `Dashboard-v2/functions/health.js`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `EF-001` | high | `Dashboard-v2/functions/offer-create.js:161` | security | `offer-create` has no auth check. A public POST can create Supabase offer rows, trigger Bexio offer operations, queue `audit_log` work, and notify Telegram. |
| `EF-002` | high | `Dashboard-v2/functions/outlook-subscribe.js:143` | security | `outlook-subscribe` has no auth check. Any caller can trigger Graph subscription lifecycle work using the app credentials available to the function. |
| `EF-003` | medium | `Dashboard-v2/functions/fanny-ai.js:39`, `Dashboard-v2/functions/marketing-studio.js:192` | security | Internal-key auth uses plain string equality instead of a shared constant-time helper. |
| `EF-004` | medium | `Dashboard-v2/functions/nexbox-fleet.js:59-60` | wiring | Uses `INTERNAL_KEY` while the rest of the internal service pattern uses `INTERNAL_SERVICE_KEY`, creating a likely deployment/auth drift bug. |
| `EF-005` | medium | `Dashboard-v2/functions/offer-create.js:37` | security | Several functions use `SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY`; unauthenticated `offer-create` can therefore exercise service-role writes when that key is configured. |
| `EF-006` | medium | `Dashboard-v2/functions/fanny-ai.js:18` | security | Token usage logging uses service-role/anon fallback and bypasses RLS for writes. |
| `EF-007` | medium | `Dashboard-v2/functions/outlook-subscribe.js:147` | data exposure | The unauthenticated subscription endpoint returns subscription IDs and resource/email paths in the response body. |
| `EF-008` | medium | `Dashboard-v2/functions/outlook-webhook.js:191-195` | security | Outlook webhook `clientState` validation is skip-if-empty; if `OUTLOOK_WEBHOOK_SECRET` is unset, notifications are accepted without that origin check. |
| `EF-009` | low | multiple external functions | security | Several error responses return `e.message` verbatim, risking internal provider/config leakage. |
| `EF-010` | low | `Dashboard-v2/functions/event-dispatch.js:251-254` | stability | The response body re-evaluates a rule after the dispatch loop already evaluated it, which can duplicate side effects if rules change. |
| `EF-011` | low | `Dashboard-v2/functions/event-dispatch.js:29-36` | stability | Burst dedupe is warm-container memory only and is not reliable across cold starts. |
| `EF-012` | info | `Dashboard-v2/functions/plane-webhook.js:52` | positive | Plane webhook signature handling fails closed when the secret is missing. |
| `EF-013` | low | `Dashboard-v2/functions/outlook-webhook.js:209` | security | `userKey` is extracted from a Graph resource path and used for a Graph fetch without allowlisting against known team mailboxes. |
| `EF-014` | medium | `Dashboard-v2/functions/offer-create.js:244` | data exposure | Unauthenticated `offer-create` returns slices of Bexio error messages in the response body. |
| `EF-015` | info | `Dashboard-v2/functions/health.js:205-207` | stability | Health timestamps hardcode UTC+2, so winter CET status is wrong by one hour. |
| `EF-016` | info | `Dashboard-v2/functions/outlook-sync.js:137` | positive | Outlook sync escapes single quotes and strips angle brackets before constructing the OData filter. |
| `EF-017` | info | `Dashboard-v2/functions/event-dispatch.js:24` | positive | `event-dispatch` uses the anon key, not service-role, for audit/entity-state writes. |

Suppressions:

- Outlook validation-token echo was suppressed as XSS: response is `text/plain` and token syntax is constrained.
- Plane and offer signature `timingSafeEqual` mismatch concerns were suppressed because the code wraps invalid signatures safely.
- Marketing Studio HTML storage was treated as a consumer sandboxing/deployment concern rather than a direct finding in this lane.

## Telegram MCP Lane

Lane: `R008_TELEGRAM_MCP_OPUS`
Batch: `TELEGRAM-MCP-008`

Files covered:

- `Scripts/telegram-mcp/server.js`
- `Scripts/telegram-mcp/poller.js`
- `Scripts/telegram-mcp/silas-poller.js`
- `Scripts/telegram-mcp/package.json`
- `Scripts/telegram-mcp/package-lock.json` (`partial`)
- `Scripts/start-claude-telegram.sh`
- `Scripts/start-diagnostics.sh`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `TMC-001` | critical | `Scripts/telegram-mcp/poller.js:560-574` | security | Main Telegram poller writes any Telegram sender's message into `/tmp/telegram-inbox.jsonl` and wakes EXEO. No sender allowlist is present in the inspected poller. |
| `TMC-002` | critical | `Scripts/telegram-mcp/silas-poller.js` | security | Silas poller has the same no-sender-filter pattern and writes any sender into `/tmp/telegram-silas-inbox.jsonl`. |
| `TMC-003` | high | `Scripts/telegram-mcp/server.js:137-138`, `Scripts/telegram-mcp/server.js:202`, `Scripts/telegram-mcp/server.js:232` | security | MCP `send_message`, `reply_message`, and `send_buttons` allow arbitrary `chat_id` use instead of constraining to `ALLOWED_USERS`. |
| `TMC-004` | high | `Scripts/telegram-mcp/server.js:172-181` | reliability/security | `get_messages` reads the entire inbox and truncates it with no access control, backup, lease, or multi-consumer safety. |
| `TMC-005` | high | `Scripts/telegram-mcp/poller.js:572-574` | prompt/control injection | Raw Telegram text enters the inbox and wakes the tmux/Claude chain without normalization, content tagging, or sender trust before handoff. |
| `TMC-006` | medium | `Scripts/telegram-mcp/server.js:69-83` | cost/false assurance | Token/cost logging is synthetic, derived from outgoing message length, and uses a hardcoded model label. |
| `TMC-007` | medium | `Scripts/telegram-mcp/silas-poller.js:52-60` | stability | Silas Telegram API request lacks the timeout used by the main poller, so a stalled connection can hang it indefinitely. |
| `TMC-008` | medium | `Scripts/telegram-mcp/poller.js:166` | wiring | Meeting notes path is hardcoded to `/Users/ic2m/...`, making the feature brittle outside that exact machine layout. |
| `TMC-009` | medium | `Scripts/telegram-mcp/poller.js`, `Scripts/telegram-mcp/server.js:172` | stability | The `/tmp/telegram-inbox.jsonl` queue is unbounded and later read fully into memory. |
| `TMC-010` | low | `Scripts/telegram-mcp/poller.js:22-29` | stability | Wakeup uses hardcoded `/opt/homebrew/bin/tmux` and swallows failures, making broken tmux paths silent. |
| `TMC-011` | low | `Scripts/start-diagnostics.sh:27-30` | stability | Diagnostics startup kills any process bound to port `9876`, not just the intended diagnostics server. |
| `TMC-012` | low | `Scripts/telegram-mcp/poller.js:80-84` | stability | PID lock has a time-of-check/time-of-use race and can allow duplicate pollers. |
| `TMC-013` | info | `Scripts/telegram-mcp/server.js` | positive | Server has dual stdio/HTTP transport support and bounded reply-map state. |
| `TMC-014` | info | `Scripts/telegram-mcp/poller.js:91-119` | positive | Main poller includes a 40s request timeout and self-healing request destroy path. |
| `TMC-015` | info | `Scripts/start-claude-telegram.sh` | positive | Startup chain is short, traceable, and delegates to a tracked terminal script. |

Suppressions:

- `keychainGet()` shell interpolation was suppressed because current callsites pass hardcoded literals only.
- Lockfile vulnerability audit is deferred to a no-target-execution dependency audit; the lane verified dependency shape but did not run `npm audit`.

Deferred:

- `Scripts/exeo-daemon-tmux.sh`: needed to complete the inbox-to-Claude prompt injection chain.
- `Scripts/exeo-terminal.sh`: needed to verify the local startup environment and daemon launch path.

## RVF Write Authority Lane

Lane: `R008_RVF_WRITE_AUTHORITY_OPUS`
Batch: `RVF-WRITE-008`

Files covered:

- `Scripts/nex-rvf/server.js`
- `Scripts/nex-rvf/loop-b.js`
- `Scripts/nex-rvf/promote.js`
- `Scripts/nex-rvf/bless-vault-frontmatter.js`
- `Scripts/nex-rvf/package.json`
- `Scripts/nex-rvf/lib/vault-apply.js`
- `Scripts/nex-rvf/lib/vault-frontmatter-edit.js`
- `Scripts/nex-rvf/lib/vault-lookup.js`
- `Scripts/nex-rvf/lib/walker.js`
- `Scripts/nex-rvf/lib/state.js`
- `Scripts/nex-rvf/lib/memory.js`
- `Scripts/nex-rvf/lib/pgmirror.js`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `RVF008-01` | high | `Scripts/nex-rvf/lib/vault-apply.js:37-41` | filesystem security | `safePath()` checks only `path.relative()` and allowed prefixes. It does not resolve symlinks or canonical real paths before writing. |
| `RVF008-02` | high | `Scripts/nex-rvf/lib/vault-lookup.js:124-127` | path traversal | Ticket lookup builds a path from unvalidated `subject_id`; traversal-shaped IDs can escape the intended ticket directory at read time and create future write risk. |
| `RVF008-03` | medium | `Scripts/nex-rvf/lib/walker.js:33-45` | filesystem security | Vault walker has no symlink detection or canonical root check, so symlinks inside allowed dirs can escape the intended vault tree for indexing and possible later writes. |
| `RVF008-04` | medium | `Scripts/nex-rvf/lib/walker.js:33-47` | resource use | Recursive vault walk has no depth, file-count, or total-byte cap, creating a plausible RAM/CPU pressure source during backfill/embedding. |
| `RVF008-05` | medium | `Scripts/nex-rvf/promote.js` | hardening | Keychain shell calls use hardcoded arguments today, but the helper shape is fragile if later parameterized. |
| `RVF008-06` | medium | `Scripts/nex-rvf/lib/vault-apply.js:44-57` | process control | `applyVaultEdit()` documents CEO approval, but code does not enforce an approval token or decision record before writing. |
| `RVF008-07` | medium | `Scripts/nex-rvf/server.js:592-600` | filesystem/process security | `memory_audit` path gate uses substring/extension checks before spawning a child process, not canonical path validation under an approved root. |
| `RVF008-08` | low | `Scripts/nex-rvf/lib/state.js` | runtime hygiene | State directory creation occurs at module import time inside the target runtime tree. |
| `RVF008-09` | low | `Scripts/nex-rvf/lib/pgmirror.js` | stability | Recursive split retry lacks an explicit maximum retry/depth cap. |
| `RVF008-10` | low | `Scripts/nex-rvf/lib/vault-lookup.js` | performance | Client index rebuild is synchronous/blocking, which can hurt responsiveness under repeated lookup calls. |
| `RVF008-11` | low | `Scripts/nex-rvf/server.js` | cost/resource use | Local model tools allow large max-token requests and do not show a concurrency cap in the covered server path. |
| `RVF008-12` | info | `Scripts/nex-rvf/package.json` | supply chain | Alpha dependencies use caret ranges; acceptable for a prototype, but should be pinned for production. |
| `RVF008-13` | info | `Scripts/nex-rvf/bless-vault-frontmatter.js` | positive | Frontmatter blessing is dry-run by default. |
| `RVF008-14` | info | `Scripts/nex-rvf/lib/vault-frontmatter-edit.js` | positive | Frontmatter editor is conservative and scoped to frontmatter updates. |
| `RVF008-15` | info | `Scripts/nex-rvf/server.js` | positive | MCP tool naming and descriptions are explicit, improving LLM navigation. |
| `RVF008-16` | info | `Scripts/nex-rvf/lib/memory.js` | positive | Memory conflict detection exists and is an important guardrail pattern. |

Suppressions:

- Service-role use in `pgmirror.js` is accepted as an internal-service pattern, assuming secrets stay server-local and never reach clients.
- Local `/reload` sidecar call in `promote.js` was suppressed because it targets localhost only.
- Some walker table-size concerns are accepted at current deployment scale but remain a future scaling risk.
- Retrieval query logging is treated as intentional internal telemetry, not automatically a leak.

Deferred:

- `Scripts/nex-rvf/lib/local-client.js`
- `Scripts/nex-rvf/lib/coherence-hold.js`
- `Scripts/nex-rvf/lib/swarm.js`
- `Scripts/nex-rvf/memory-audit.js`

## C-137 Spot Checks

C-137 directly spot-checked the following high-risk anchors in the canonical clone before accepting the run:

- `offer-create.js:161-168`: handler starts with method and JSON/payload validation; no auth gate before privileged work.
- `offer-create.js:34-44`: Supabase helper uses service-key/anon fallback as bearer auth.
- `offer-create.js:243-244`: Bexio exception text is copied into the public response summary.
- `outlook-subscribe.js:143-151`: handler calls `ensureSubscriptions()` and returns the summary without auth.
- `outlook-webhook.js:191-195`: `CLIENT_STATE` check is conditional on the secret being set.
- `telegram-mcp/poller.js:560-574`: incoming Telegram message is appended to `/tmp/telegram-inbox.jsonl` and wakes EXEO.
- `telegram-mcp/server.js:137-138`, `172-181`, `202`, `232`: arbitrary chat targeting and destructive inbox read confirmed.
- `vault-apply.js:37-41`: `safePath()` lacks realpath/symlink resolution.
- `vault-lookup.js:124-127`: ticket path is constructed from `subjectId`.
- `nex-rvf/server.js:592-600`: `memory_audit` path check uses substring/extension checks before child spawn.

## Immediate Implications

Run 008 gives Claudio a sharper picture of the current risk profile:

1. External function exposure is not uniform. Some endpoints have good fail-closed behavior, while others are public and high-authority.
2. The Telegram command plane has at least two independent unauthenticated ingress routes: dashboard webhook handling from Run 007 and local poller inbox handling from Run 008.
3. Cost/health/logging surfaces can create false assurance: synthetic token cost, timezone drift, swallowed wake failures, and destructive queue reads can make dashboards look healthier than reality.
4. RVF/vault tooling is promising but must become realpath-safe, symlink-aware, approval-enforced, and bounded before it should be treated as a reliable write authority.

## Next Queue

Run 009 should keep the active lane cap at `3` and close the deferred or adjacent high-risk surfaces:

1. `Scripts/exeo-daemon-tmux.sh`, `Scripts/exeo-terminal.sh`, and adjacent launch/terminal glue that completes the Telegram inbox to Claude prompt path.
2. `Scripts/nex-rvf/lib/local-client.js`, `Scripts/nex-rvf/lib/coherence-hold.js`, `Scripts/nex-rvf/lib/swarm.js`, and `Scripts/nex-rvf/memory-audit.js`.
3. Remaining `Dashboard-v2/functions/*.js` not yet covered, grouped by auth model, provider, and write capability.
