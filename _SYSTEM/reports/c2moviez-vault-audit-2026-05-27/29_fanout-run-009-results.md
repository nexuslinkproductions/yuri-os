# Fanout Run 009 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no target execution, no live service calls, no credential use
Parallel lane cap: `3`

## Acceptance Summary

Run 009 is accepted.

- `R009_EXEO_TERMINAL_BRIDGE_OPUS / EXEO-BRIDGE-009`: accepted, `files_covered=8 findings=14 suppressions=3 deferred=4 invalidated=0`.
- `R009_RVF_DEFERRED_AUTHORITY_OPUS / RVF-DEFERRED-009`: accepted, `files_covered=11 findings=14 suppressions=0 deferred=0 invalidated=0`.
- `R009_DASHBOARD_WRITE_CONTENT_OPUS / DASHBOARD-WRITE-009`: accepted, `files_covered=12 findings=18 suppressions=3 deferred=2 invalidated=0`.

Accepted assigned target surfaces added by Run 009: `31`.

Accepted assigned target coverage total after Run 009: `166 / 1505` tracked files.

Strict semantic caveat carried forward: `Scripts/telegram-mcp/package-lock.json` from Run 008 remains `partial`; full semantic coverage is `165 covered + 1 partial`.

Contamination check: passed. C-137 scanned Run 009 pipe logs for protected Claude runtime paths, `Searched memories`, and invalidation markers; no matches were found.

Source pipe logs:

- `/tmp/yuri-c2v-fanout-run-009/pipe/r009-exeo.pipe.log`
- `/tmp/yuri-c2v-fanout-run-009/pipe/r009-rvf.pipe.log`
- `/tmp/yuri-c2v-fanout-run-009/pipe/r009-dashboard.pipe.log`

## C-137 Severity Adjustments

Lane severities remain advisory. C-137 adjusted these before acceptance:

- `DW009-01`: downgraded from high to low/medium wiring risk. `meeting-research.js` duplicates `anthropicPost()`, but the inspected handler still uses `checkAuth`.
- `DW009-10`: downgraded from medium to low. Missing security headers are real, but this authenticated JSON endpoint is not itself a strong exploit path.
- `RVF009-01`: accepted as medium hardening risk, not proven arbitrary command execution. The command string is unsafe in shape, but the current regex restricts extracted service names.

## Executive Findings

Run 009 closes the most important missing link from earlier runs: the local EXEO bridge. The repo now has a repo-evidenced critical path from Telegram inbox JSONL to tmux paste into Claude, with no sender validation at the dispatch layer. Combined with Run 008's no-allowlist pollers, this is the clearest explanation so far for how the Telegram control plane can be broken, noisy, or hijacked.

The second major theme is excessive local authority. EXEO launch paths use permission bypass modes, and `send-file-telegram.sh` is a ready-made arbitrary file exfiltration helper if any high-authority agent/tool path can invoke it.

The RVF deferred lane was stronger than expected in several places: coherence holds are a real decision gate, local model failures degrade cleanly, and verify/review are deterministic in useful ways. The main remaining concern is resource bounding around the local FastAPI model server and shell-command hardening inside memory audit.

The dashboard write/content lane found several false-assurance and LLM-output trust issues: generated HTML is returned unsanitized, model-extracted facts can be written to the fact ledger, stubs claim work that they only log, and meeting note paths use raw `client_code` in filenames despite computing a sanitized copy.

## EXEO Terminal Bridge Lane

Lane: `R009_EXEO_TERMINAL_BRIDGE_OPUS`
Batch: `EXEO-BRIDGE-009`

Files covered:

- `Scripts/exeo-daemon-tmux.sh`
- `Scripts/exeo-terminal.sh`
- `Scripts/exeo-live.sh`
- `Scripts/exeo-cron.sh`
- `Scripts/exeo-autonomous.js`
- `Scripts/daemon-stuck-watch.js`
- `Scripts/mcp-wrappers-backup/telegram-mcp.sh`
- `Scripts/send-file-telegram.sh`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `EXEO-009-01` | critical | `Scripts/exeo-daemon-tmux.sh:517-611` | security | `dispatch()` parses every `/tmp/telegram-inbox.jsonl` line and pastes it into the Claude tmux session without `from_id`, `chat_id`, or sender validation. |
| `EXEO-009-02` | high | `Scripts/exeo-daemon-tmux.sh:107-174` | credential handling | Claude OAT is read from Keychain and interpolated into the tmux shell command environment. This risks exposure through process metadata or tmux/server environment handling. |
| `EXEO-009-03` | high | multiple EXEO launch paths | security | `exeo-daemon-tmux.sh`, `exeo-terminal.sh`, `exeo-live.sh`, and `exeo-autonomous.js` use `--dangerously-skip-permissions` or `--permission-mode bypassPermissions`. Combined with unauthenticated dispatch, this is dangerous. |
| `EXEO-009-04` | high | `Scripts/send-file-telegram.sh:12-48` | data exfiltration | Script accepts an arbitrary file path, reads the file, and sends it to Telegram as CEO without path allowlist, size limit, or symlink control. |
| `EXEO-009-05` | medium | `Scripts/exeo-autonomous.js:272-290` | stability | Autonomous Claude child processes have no per-child timeout; a stuck process can block the loop. |
| `EXEO-009-06` | medium | `Scripts/exeo-daemon-tmux.sh:622-636` | stability | Several background subshells run without a max-concurrency limit, plausibly contributing to CPU/RAM growth under load. |
| `EXEO-009-07` | medium | `Scripts/mcp-wrappers-backup/telegram-mcp.sh` | secret handling | Wrapper exports Telegram bot token and allowed users into the MCP server environment. |
| `EXEO-009-08` | medium | `Scripts/exeo-daemon-tmux.sh:225-316` | llm_nav | Large fallback prime prompt is embedded directly in shell. If canonical prime assembly fails, the system can silently run stale behavioral instructions. |
| `EXEO-009-09` | medium | `Scripts/exeo-cron.sh:44-82` | architecture | Cron slots inject static operational prompts into tmux. They are bounded, but add another scheduled prompt-authority surface. |
| `EXEO-009-10` | low | `Scripts/exeo-terminal.sh:36-75` | architecture | Older interactive watcher duplicates daemon logic with a different polling prompt, increasing navigation/confusion risk. |
| `EXEO-009-11` | low | `Scripts/daemon-stuck-watch.js` | stability | Watchdog loops every 15 seconds and repeatedly reads/captures local state; useful, but it adds constant overhead. |
| `EXEO-009-12` | low | `Scripts/exeo-live.sh:250-257` | architecture | Debug/live path uses `claude -p` and fresh sessions per message, unsuitable for production continuity and cost. |
| `EXEO-009-13` | info | `Scripts/exeo-daemon-tmux.sh` | positive | Auth probe, restart, lockfile, drift detection, push-on-finish, and latency tracking are strong operational hygiene. |
| `EXEO-009-14` | info | `Scripts/daemon-stuck-watch.js` | positive | Three-signal liveness gate and auth canary are well-designed safeguards against false health. |

Suppressions:

- OAT token is not logged directly by the inspected `log()` calls.
- `exeo-autonomous.js` Keychain helper returns secrets only to assignment contexts in covered code.
- `exeo-cron.sh` slot prompts are static case branches, not user-supplied prompt injection.

Deferred:

- `Scripts/telegram-mcp/poller.js`: upstream sender filter and JSONL write atomicity.
- `Scripts/lib/heartbeat.sh`: sourced by EXEO daemon; needs lib-lane review.
- `Scripts/build-prime.sh`: prime prompt assembly may ingest Supabase-sourced CEO corrections.
- `Scripts/qwen-fast.js`: fast-path interceptor before Claude dispatch.

## RVF Deferred Authority Lane

Lane: `R009_RVF_DEFERRED_AUTHORITY_OPUS`
Batch: `RVF-DEFERRED-009`

Files covered:

- `Scripts/nex-rvf/lib/local-client.js`
- `Scripts/nex-rvf/lib/coherence-hold.js`
- `Scripts/nex-rvf/lib/swarm.js`
- `Scripts/nex-rvf/memory-audit.js`
- `Scripts/nex-rvf/lib/coherence.js`
- `Scripts/nex-rvf/lib/drift.js`
- `Scripts/nex-rvf/lib/verify.js`
- `Scripts/nex-rvf/lib/bless.js`
- `Scripts/nex-rvf/lib/review.js`
- `Scripts/nex-rvf/local-models/serve.py`
- `Scripts/nex-rvf/local-models/serve.sh`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `RVF009-01` | medium | `Scripts/nex-rvf/memory-audit.js:128-132` | security | `memory-audit` runs a shell string using service names extracted from rule-file content. Current regex reduces exploitability, but the pattern is brittle. |
| `RVF009-02` | medium | `Scripts/nex-rvf/local-models/serve.py` | stability | Local FastAPI model server lacks explicit max-connections, semaphore, and request-level inference timeout across `/embed`, `/chat`, and `/reason`. |
| `RVF009-03` | medium | `Scripts/nex-rvf/lib/swarm.js:23-85` | architecture | Swarm indexes hardcoded `.claude/agents` from Claudio's vault path without an allowlist/blocklist for routable agents. |
| `RVF009-04` | medium | `Scripts/nex-rvf/lib/bless.js:64-130` | wiring | `bless()` writes canonical facts through RPC; validation failures are returned/logged, but caller authorization and confirmation live outside this module. |
| `RVF009-05` | medium | `Scripts/nex-rvf/lib/coherence-hold.js:15-20` | security | Coherence holds use service-role credentials by design; comments imply RLS locking, but service-role bypasses RLS and must remain server-local. |
| `RVF009-06` | low | `Scripts/nex-rvf/lib/coherence-hold.js:108-122` | input validation | `hold_id` is interpolated into a PostgREST filter without integer validation. |
| `RVF009-07` | low | `Scripts/nex-rvf/local-models/serve.py` | stability | Chat/reason prompts do not show a Pydantic max-length validator before tokenization/generation. |
| `RVF009-08` | low | `Scripts/nex-rvf/lib/coherence.js` | cost | Coherence, drift, and review can each embed similar text independently, causing duplicated local model work. |
| `RVF009-09` | info | `Scripts/nex-rvf/memory-audit.js` | stability | Deep mode can perform sequential live HEAD probes from rule-file URLs; bounded by timeout, but slow/noisy on many URLs. |
| `RVF009-10` | info | `Scripts/nex-rvf/lib/drift.js` | positive | Drift thresholds are empirically documented and rolling-window based. |
| `RVF009-11` | info | `Scripts/nex-rvf/lib/local-client.js` | positive | Local client returns typed status objects and treats local cognition as opportunistic, not load-bearing. |
| `RVF009-12` | info | `Scripts/nex-rvf/lib/verify.js` | positive | Verification has a useful 4-tier resolution model: canonical fact, vault frontmatter, retrieval, no evidence. |
| `RVF009-13` | info | `Scripts/nex-rvf/lib/review.js` | positive | Claim extraction is deterministic regex, avoiding LLM recursion for the review pass. |
| `RVF009-14` | info | `Scripts/nex-rvf/lib/coherence-hold.js` | positive | Holds are real decision records with explicit `shipped|edited|killed|expired` outcomes, not just advisory text. |

## Dashboard Write/Content Lane

Lane: `R009_DASHBOARD_WRITE_CONTENT_OPUS`
Batch: `DASHBOARD-WRITE-009`

Files covered:

- `Dashboard-v2/functions/analyze-meeting.js`
- `Dashboard-v2/functions/calendar-schedule-event.js`
- `Dashboard-v2/functions/client-meeting-note.js`
- `Dashboard-v2/functions/client-update.js`
- `Dashboard-v2/functions/decision-outcome.js`
- `Dashboard-v2/functions/document-generate.js`
- `Dashboard-v2/functions/meeting-followup.js`
- `Dashboard-v2/functions/meeting-research.js`
- `Dashboard-v2/functions/nlp-ticket.js`
- `Dashboard-v2/functions/pipeline-email-draft.js`
- `Dashboard-v2/functions/pipeline-move.js`
- `Dashboard-v2/functions/push-meeting-to-obsidian.js`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `DW009-01` | low | `Dashboard-v2/functions/meeting-research.js:1-29` | wiring | Local `anthropicPost()` duplicates shared behavior. Real drift risk, but C-137 downgraded from lane-reported high because `checkAuth()` is present. |
| `DW009-02` | high | `Dashboard-v2/functions/decision-outcome.js:238-245` | security | Internal auth fails open when `INTERNAL_SERVICE_KEY` is unset. The same function performs service-key Supabase writes. |
| `DW009-03` | high | `Dashboard-v2/functions/document-generate.js:388-419` | llm_nav | Claude-generated HTML is returned directly after only code-fence stripping. If rendered unsandboxed, this is an LLM-output XSS path. |
| `DW009-04` | high | `Dashboard-v2/functions/analyze-meeting.js:76-104` | llm_nav | Claude output is regex-parsed as JSON and model-extracted claims are written to the fact ledger through `assertFact()` without local schema validation of predicate/value. |
| `DW009-05` | medium | `Dashboard-v2/functions/client-meeting-note.js:125-133` | filesystem/wiring | Code computes `safeCode` but builds the queued vault filename with raw `client_code`, preserving traversal/path-drift risk for downstream consumers. |
| `DW009-06` | medium | `Dashboard-v2/functions/client-update.js` | architecture | Plane customer sync does broad/fuzzy in-memory matching, risking wrong-customer updates under similar names/codes. |
| `DW009-07` | medium | `Dashboard-v2/functions/push-meeting-to-obsidian.js:85-100` | content injection | Transcript/note markdown can break fences or frontmatter expectations if not escaped before Obsidian ingestion. |
| `DW009-08` | medium | `Dashboard-v2/functions/client-meeting-note.js:117-131` | output handling | Telegram HTML brief embeds user-provided note/agenda snippets without HTML escaping. |
| `DW009-09` | medium | `Dashboard-v2/functions/decision-outcome.js:171-187` | stability | Outcome sweep can process many decisions sequentially with individual Supabase PATCH calls. |
| `DW009-10` | low | `Dashboard-v2/functions/meeting-research.js:5-9` | hardening | Local CORS headers omit the extra hardening headers used by shared helpers. |
| `DW009-11` | medium | `Dashboard-v2/functions/document-generate.js:9-35`, `Dashboard-v2/functions/document-generate.js:388-391` | cost/privacy | Company details are hardcoded into every prompt path and document generation uses an 8192 max-token budget. |
| `DW009-12` | low | `Dashboard-v2/functions/pipeline-email-draft.js` | false assurance | Function accepts queue-like fields but only logs them; response can imply a queue action that did not occur. |
| `DW009-13` | low | `Dashboard-v2/functions/pipeline-move.js` | false assurance | Function accepts stage-change fields but only logs them; no Supabase/Plane move occurs. |
| `DW009-14` | low | `Dashboard-v2/functions/client-meeting-note.js:21`, `Dashboard-v2/functions/push-meeting-to-obsidian.js:17` | privacy/config | CEO chat ID is hardcoded as fallback, making misconfiguration silently route sensitive notifications to the fallback. |
| `DW009-15` | info | `Dashboard-v2/functions/calendar-schedule-event.js` | positive | Uses anon key, not service-role, for audit log insertion. |
| `DW009-16` | info | `Dashboard-v2/functions/nlp-ticket.js` | wiring | Local Plane helper lacks shared retry/rate behavior. Low risk but a navigation/drift issue. |
| `DW009-17` | info | `Dashboard-v2/functions/analyze-meeting.js` | positive | Has auth, minimum transcript validation, known-fact grounding, and fail-soft fact assertions. |
| `DW009-18` | info | `Dashboard-v2/functions/document-generate.js` | positive | Input type validation and note-length cap are useful controls. |

Suppressions:

- `client-update.js` arbitrary field concern was partially suppressed for Plane sync because Plane fields use an allowlist.
- `meeting-followup.js` does not auto-send email; it returns a draft for approval.
- `decision-outcome.js` weekly rollup upsert is idempotent by `week_start`.

Deferred:

- `Dashboard-v2/functions/shared-facts.js`: need Supabase RPC/RLS definitions to validate fact writes.
- `Dashboard-v2/functions/shared-storage.js`: need Supabase Storage bucket policies to validate client KB reads.

## C-137 Spot Checks

C-137 directly checked these anchors in the canonical clone before accepting:

- `exeo-daemon-tmux.sh:517-611`: dispatch parses inbox JSONL and pastes into tmux without sender validation.
- `exeo-daemon-tmux.sh:107-174`: OAT loaded from Keychain and placed into tmux session command string.
- `exeo-terminal.sh:97`, `exeo-live.sh:255`, `exeo-autonomous.js:279`: permission bypass paths confirmed.
- `send-file-telegram.sh:12-48`: arbitrary file path is read and sent to Telegram.
- `decision-outcome.js:238-245`: internal auth is conditional and fails open when env key is absent.
- `document-generate.js:388-419`: generated HTML returned to caller.
- `analyze-meeting.js:76-104`: model-extracted claims passed to `assertFact()`.
- `client-meeting-note.js:125-133`: sanitized `safeCode` exists, but filename uses raw `client_code`.
- `memory-audit.js:128-132`: shell string runs with extracted keychain service name.
- `serve.py:249-316`: model endpoints have OOM handling but no request concurrency gate in covered code.

## Immediate Implications

Run 009 materially changes the current audit picture:

1. The highest priority fix is inbound identity gating before anything reaches tmux/Claude. This must happen at the poller/inbox boundary and again at EXEO dispatch.
2. Permission-bypass Claude sessions are not acceptable while inbound trust is unresolved.
3. Local resource risk is real: background jobs, local model serving, and sequential/uncapped AI or Supabase loops all plausibly contribute to high CPU/RAM.
4. Several dashboard functions are "working-looking" but only log or return generated content. That is a false-assurance risk for Claudio's command center.
5. RVF has good bones, especially deterministic verification and real coherence holds, but it needs bounded model service, stricter path/auth gates, and better shell-command hygiene.

## Next Queue

Run 010 should keep the active lane cap at `3` and target:

1. `Scripts/telegram-mcp/poller.js`, `Scripts/telegram-mcp/silas-poller.js`, and JSONL write atomicity/filter remediation design as a follow-up validation pass.
2. `Scripts/build-prime.sh`, `Scripts/qwen-fast.js`, `Scripts/lib/heartbeat.sh`, and adjacent prompt/liveness helpers.
3. Supabase schema/migrations/RLS/RPC/storage policy evidence, especially `shared-facts.js`, `assertFact`, `bless_fact`, `facts_current`, and storage buckets.
