# C2Moviez Vault Audit Master Plan

Date: 2026-05-27
Owner: Codex/main / Rick C-137
Target: `https://github.com/c2moviezfpv/c2moviez-vault`
Mode: read-only, evidence-first, no mutation of target repository or live services

## Run Status

This file starts the first documented YURI-backed external repository audit run.

Current phase: Runs 040, 041, and 043 accepted after function-authority burst; Run 042 and split Runs 044-046 stalled and were not accepted; `102_c137-ai-mcp-direct-results.md` now replaces the stalled AI/RAG/MCP scope with direct C-137 repo evidence. Comprehensive coverage ledger still open.

No writes have been made to Claudio's repository. C-137 now has a full materialized read-only clone of the current default branch in `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`; Rick lanes must be pointed at this clone and still prove file reads with Git-object evidence before coverage counts.

Important correction:

- `13_final-master-audit.md` is not the final master audit. It is a V1 security-frontier pass.
- `14_fanout-run-002-packets.md` and `15_fanout-run-002-results.md` are the first corrected fanout artifacts.
- `16_fanout-run-003-packets.md` and `17_fanout-run-003-results.md` are the first clean full-clone target-lane rerun artifacts. They raise accepted target coverage to `50 / 1505` tracked files, while invalidating the process lane that touched protected `.claude/projects` runtime material.
- `18_process-fanout-run-004-packets.md` and `19_process-fanout-run-004-results.md` document the process QA rerun. Run 004 accepted ledger, inventory, and LLM-navigation process lanes, and invalidated findings/plan process lanes for protected `.claude/projects` access.
- `20_sandbox-repair-run-005-packets.md` and `21_run-003-004-sandbox-repair-results.md` repair the invalidated Run 003 process lane and the invalidated Run 004 findings/plan lanes under an OS-enforced sandbox. These repairs add process-truth coverage only; target-repo coverage remains `50 / 1505`.
- `22_fanout-run-006-packets.md` and `23_fanout-run-006-results.md` document the next accepted target-repo fanout under the OS sandbox. Run 006 accepted runtime architecture, tracker wiring, and LLM-navigation/agent lanes with `invalidated=0`, raising accepted target coverage to `82 / 1505`.
- `24_fanout-run-007-packets.md` and `25_fanout-run-007-results.md` document the next accepted target-repo fanout. Sonnet worker bootstrap was tested first, but fresh Sonnet sessions refused the orchestrator packet because they could not see the outer authorization transcript. Run 007 was therefore escalated back to Opus worker lanes, preserving the active cap of `3`, and accepted with `invalidated=0`, raising accepted target coverage to `105 / 1505`.
- `26_fanout-run-008-packets.md` starts the next Opus-direct target-repo fanout for external functions, Telegram MCP/poller wiring, and RVF write authority.
- `27_fanout-run-008-results.md` documents the accepted Run 008 lanes. It raises accepted assigned target coverage to `135 / 1505` tracked files, with `Scripts/telegram-mcp/package-lock.json` marked `partial`.
- `28_fanout-run-009-packets.md` starts the next Opus-direct target-repo fanout for EXEO terminal/tmux bridge, RVF deferred authority, and remaining high-authority dashboard write/content functions.
- `29_fanout-run-009-results.md` documents the accepted Run 009 lanes. It raises accepted assigned target coverage to `166 / 1505` tracked files, with the Run 008 lockfile partial caveat carried forward.
- `30_fanout-run-010-packets.md` starts the next Opus-direct target-repo fanout for team bots, prime/qwen/heartbeat helpers, and Supabase RLS/RPC migrations.
- `31_fanout-run-010-results.md` documents the accepted Run 010 lanes. It raises accepted assigned target coverage to `194 / 1505` tracked files, with two lockfiles marked `partial`.
- `32_fanout-run-011-packet.md` starts the first single-lane usage-conservation packet. It targets the remaining Supabase/RAG/fact-ledger/storage bridge around Run 010's open critical candidates.
- `33_fanout-run-011-results.md` documents the accepted Run 011 single-lane shard. It raises accepted assigned target coverage to `206 / 1505` tracked files, with the two lockfile partials carried forward.
- `34_fanout-run-012-packet.md` starts the single-lane `public.decisions` lineage and decision read/write shard.
- `35_fanout-run-012-results.md` documents the accepted Run 012 single-lane shard. It raises accepted assigned target coverage to `218 / 1505` tracked files, with the two lockfile partials carried forward.
- `36_fanout-run-013-packet.md` starts the single-lane dashboard decision exposure, local dashboard server, and staged LaunchAgent wiring shard.
- `37_fanout-run-013-results.md` documents the accepted Run 013 single-lane shard. It raises accepted assigned target coverage to `228 / 1505` tracked files, with the two lockfile partials carried forward.
- `38_fanout-run-014-packet.md` starts the single-lane public/auth function cluster for auth, config, client update, chat/context/plan, predictive intelligence, RAG query, and MCP authority.
- `39_fanout-run-014-results.md` documents the accepted Run 014 single-lane shard. It raises accepted assigned target coverage to `238 / 1505` tracked files, with the two lockfile partials carried forward.
- `40_fanout-run-015-packet.md` starts the single-lane deployment wrapper, Telegram, event-dispatch, and shared-helper shard.
- `41_fanout-run-015-results.md` documents the accepted Run 015 single-lane shard. It raises accepted assigned target coverage to `248 / 1505` tracked files, with the two lockfile partials carried forward.
- `42_fanout-run-016-packet.md` starts the single-lane shared Plane, production-hub, observability, and deep-learning shard.
- `43_fanout-run-016-results.md` documents the accepted Run 016 single-lane shard. It raises accepted assigned target coverage to `258 / 1505` tracked files, with the two lockfile partials carried forward.
- `44_fanout-run-017-packet.md` starts the single-lane Supabase migration, RLS, and RPC shard.
- `45_fanout-run-017-results.md` documents the accepted Run 017 single-lane shard. It raises accepted assigned target coverage to `268 / 1505` tracked files, with the two lockfile partials carried forward.
- `46_fanout-run-018-packet.md` starts the single-lane webhook, Outlook, scheduling, and tracker mutation shard.
- `47_fanout-run-018-results.md` documents the accepted Run 018 single-lane shard. It raises accepted assigned target coverage to `278 / 1505` tracked files, with the two lockfile partials carried forward.
- `48_fanout-run-019-packet.md` starts the single-lane tracker/time-entry DB/RPC and UI wiring shard.
- `49_fanout-run-019-results.md` documents the accepted Run 019 single-lane shard. It raises accepted assigned target coverage to `288 / 1505` tracked files, with the two lockfile partials carried forward.
- `50_fanout-run-020-packet.md` starts the single-lane app-wide route-alias/navigationability shard.
- `51_fanout-run-020-results.md` documents the accepted Run 020 single-lane shard. It raises accepted assigned target coverage to `298 / 1505` tracked files, with the two lockfile partials carried forward. It confirms the `/api/functions/*` versus `/.netlify/functions/*` mismatch as an app-wide architecture/navigationability fault across the assigned frontend routes.
- `52_fanout-run-021-packet.md` starts the single-lane tracker/admin/customer/meeting navigation shard.
- `53_fanout-run-021-results.md` documents the accepted Run 021 single-lane shard. It raises accepted assigned target coverage to `306 / 1505` tracked files, with the two lockfile partials carried forward. It confirms that the same route dialect/function-directory mismatch hits tracker admin, member admin, CRM/customer, meetings studio, and pitch SSO surfaces, and it identifies several missing or unmapped high-authority backend functions for Run 022 closure.
- `54_fanout-run-022-packet.md` starts the single-lane tracker absence/time-edit/Whisper backend shard.
- `55_fanout-run-022-results.md` documents the accepted Run 022 single-lane shard. It raises accepted assigned target coverage to `313 / 1505` tracked files, with the two lockfile partials carried forward. It finds an unauthenticated/deployment-dependent OpenAI Whisper fallback, missing tracker absence/time-edit RPC source, and unwired Telegram callback strings for absence/time-edit approval buttons.
- `56_fanout-run-023-packet.md` starts the single-lane tracker Telegram callback/UI navigation shard.
- `57_fanout-run-023-results.md` documents the accepted Run 023 single-lane shard. It raises accepted assigned target coverage to `316 / 1505` tracked files, with the two lockfile partials carried forward. It verifies that absence, time-edit, and week-plan Telegram approval callbacks are emitted but not handled by tracked `telegram.js`, and it finds dead `assigneeCode` UI wiring in `TicketCreateDialog.svelte`.
- `58_fanout-run-024-packet.md` starts the single-lane tracker start/stop/task-picker UI shard.
- `59_fanout-run-024-results.md` documents the accepted Run 024 single-lane shard. It raises accepted assigned target coverage to `319 / 1505` tracked files, with the two lockfile partials carried forward. It verifies coherent tracker start/stop UI wiring, preserves `user.can("tracker.start")` / `user.can("tracker.stop")` as strengths, and flags direct browser Supabase mutations for post-stop notes/task creation as RLS-deferred authorization concerns.
- `60_fanout-run-025-packet.md` starts the single-lane tracker `TasksView.svelte` / `client_tasks` CRUD shard.
- `61_fanout-run-025-results.md` documents the accepted Run 025 single-lane shard. It raises accepted assigned target coverage to `320 / 1505` tracked files, with the two lockfile partials carried forward. It finds that `TasksView.svelte` calls a missing `/api/functions/tasks-crud` handler for create/update/archive/restore, preserves its consistent UI admin gating as a strength, and flags hourly-rate selection for all users as a data-minimization issue.
- `62_fanout-run-026-packet.md` starts the single-lane tracker `PlanWeekView.svelte` / weekly planning approval-wiring shard.
- `63_fanout-run-026-results.md` documents the accepted Run 026 single-lane shard. It raises accepted assigned target coverage to `321 / 1505` tracked files, with the two lockfile partials carried forward. It finds missing/unmapped focus endpoints used by `PlanWeekView.svelte`, localStorage-only week-plan state, client-code derivation drift, and preserves `tracker.start()` delegation as a strength.
- `64_fanout-run-027-packet.md` starts the single-lane tracker `AnalyticsView.svelte` / financial-scope analytics shard.
- `65_fanout-run-027-results.md` documents the accepted Run 027 shard. It raises accepted assigned target coverage to `322 / 1505` tracked files, with the two lockfile partials carried forward. It finds that `AnalyticsView.svelte` fetches rate/amount fields before UI hiding, relies on unverified `time_entries`/`client_tasks` RLS for privacy, has silent `5000` row truncation risk, and uses a hardcoded CHF 120 fallback rate.
- `66_codex-run-028-packet.md`, `67_codex-run-029-packet.md`, and `68_codex-run-030-packet.md` start a clean three-lane Codex GPT-5.5/xhigh burst from the target clone root after the first launch was invalidated for YURI-root contamination. Results remain pending C-137 validation.
- `69_claude-run-031-packet.md` and `70_claude-run-031-results.md` document the accepted app-shell/navigation shard. It raises accepted assigned target coverage to `331 / 1505` tracked files, with the two lockfile partials carried forward. It confirms a dead active `/finance` link, fragmented route truth, no-op mobile quick actions, stale/unmounted `TopNav`, hardcoded profile identity, and shell admin false-affordances while suppressing the stronger unauthorized-admin-access claim based on route-level guard evidence.
- `71_codex-run-028-results.md` documents the accepted tracker small-helper shard. It raises accepted assigned target coverage to `338 / 1505`, with two lockfile partials carried forward. It finds unmounted/stale TrackerChip, IdleModal, and TrackerHomeWidget surfaces, plus a TimeSliderControls end-time data-integrity issue and query-dropping tracker redirects.
- `72_codex-run-029-results.md` documents the accepted tracker CalendarView shard. It raises accepted assigned target coverage to `339 / 1505`, with two lockfile partials carried forward. It finds a high-risk schedule-list privacy issue that returns all team calendars, the recurring `/api/functions/*` deployment dialect mismatch, and a scheduled-block identity split between `user_id` and `assignee_code`.
- `73_codex-run-030-results.md` documents the accepted `/focus/+page.svelte` architecture shard. It raises accepted assigned target coverage to `340 / 1505`, with two lockfile partials carried forward. It confirms missing/unmapped focus endpoints, browser-local `focus:*` truth, team-wide data-scope hazards, false backend-sync comments, and monolithic LLM-navigation risk.
- `78_claude-run-032-results.md` documents the accepted Nexogram route shard. It raises accepted assigned target coverage to `341 / 1505`, with two lockfile partials carried forward. It confirms missing/unmapped Nexogram/file/context endpoints, RLS-deferred channel/message access risk, public-subscribe realtime channel risk, high-sensitivity context snapshot exposure, file upload size/memory hazards, and 4249-line monolith navigation risk.
- `79_codex-run-033-results.md` documents the accepted File Vault route shard. It raises accepted assigned target coverage to `342 / 1505`, with two lockfile partials carried forward. It confirms missing file-vault handlers, `/api/functions/*` dialect drift, server adapter/function-layout mismatch, unverifiable presign/confirm security, client-supplied metadata, and 1443-line route navigation risk.
- `80_codex-run-034-results.md` documents the accepted Expenses route shard. It raises accepted assigned target coverage to `343 / 1505`, with two lockfile partials carried forward. It confirms missing expenses/NEXdoc handlers, finance-permission drift, client-derived expense amounts, missing scan deep-links, and auth-helper inconsistency.
- `81_codex-run-035-results.md` documents the accepted Revenue route shard. It raises accepted assigned target coverage to `344 / 1505`, with two lockfile partials carried forward. It confirms direct browser financial-state reads, client/client-finance drift, auth/function routing dependency, recurring dead `/finance` navigation, and false Bexio-live freshness claims.
- `86_claude-run-036-results.md` documents the accepted realtime/client-data authority shard. It raises accepted assigned target coverage to `346 / 1505`, with two lockfile partials carried forward. It confirms public-channel realtime risk, a hardcoded Soketi publish secret in tracked Git, and anon browser CRUD on `scheduled_blocks`.
- `87_codex-run-037-results.md` documents the accepted deployment route-map/root-cause shard. It adds no unique coverage credit because the files were previously counted, but it consolidates the critical boot failure, untracked `netlify/functions` dependency, missing `/api/functions/*` route bridge, non-reproducible deploy script, and route/function coverage drift.
- `88_codex-run-038-results.md` documents the accepted RBAC/admin guard shard. It adds no unique coverage credit pending ledger reconciliation, but it confirms RBAC source-of-truth drift, CEO-only permission-page mismatch, missing admin backends, client-only admin guards, static high-authority navigation, and missing tracked RPC definitions.
- `89_codex-run-039-results.md` documents the accepted NEXdoc document-surface shard. It adds no unique coverage credit because `/nexdoc` was already counted in Run 020, but it deepens the missing NEXdoc handler, AI-extraction false-assurance, and expense-to-scan navigation findings.
- `94_claude-run-040-results.md` documents the accepted auth/internal-access shard. It adds no unique coverage credit, but it confirms the SSO/custom-cookie mismatch, GoTrue Bearer false-rejects, legacy SHA256 password fallback, legacy `X-Internal-Key` replay risk, client-side-only domain restriction evidence, and UTC+2 health timestamp drift.
- `95_codex-run-041-results.md` documents the accepted customer/pipeline write-function shard. It adds no unique coverage credit, but it reconfirms unauthenticated `offer-create` side effects and deepens client-update arbitrary-field trust, generic production-hub storage authority, replayable offer-accept HMAC bodies, and false-success pipeline endpoints.
- `96_codex-run-042-stalled.md` records the stopped AI/RAG/MCP shard. No R042 findings are accepted because the lane produced no final message or `BATCH_CLOSE`.
- `101_codex-runs-044-046-stalled.md` records the stopped split AI/RAG/MCP retries. No R044/R045/R046 findings or coverage rows are accepted.
- `102_c137-ai-mcp-direct-results.md` closes the AI/RAG/MCP scope through direct C-137 inspection. It confirms that MCP is a privileged operations plane with coarse authorization, that several AI/observability endpoints are no-auth or deployment-dependent candidates, and that `/api/functions/*` versus `/.netlify/functions/*` route drift materially harms navigationability.
- `97_codex-run-043-results.md` documents the accepted Telegram function-cluster shard. It adds no unique coverage credit pending ledger reconciliation, but it ties Telegram breakage to PM2/function-layout drift, unmapped webhook routing, pre-allowlist notify/proposal side effects, in-memory review sessions with disabled message handling, missing calendar-watch callback handlers, weak team-bot query-token auth, schedule drift, old Plane pagination, and disabled digest cron.
- Final reporting is blocked until every target surface is assigned to micro-batches and closed as `covered`, `partial`, `deferred`, `suppressed`, or `not_applicable` with repo evidence.

Authorization update:

- Marcel stated in-session that we have full permission to access and read Claudio's entire target repository, including secured, private, protected, and untracked target material.
- This expands read scope for the target repository only. It does not authorize mutation, execution of production automations, public disclosure of secrets, or writes back to the target repository.
- Untracked files cannot be recovered from GitHub history. They require a local checkout, archive, mounted volume, or other explicitly available filesystem/API source.
- Source resolution after this authorization: targeted local searches did not locate a local `c2moviez-vault` checkout or archive under likely Marcel home folders. The currently available source is tracked Git content at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`. Untracked target-state audit remains blocked until a local checkout/archive path is provided or mounted.
- Marcel later clarified that live external services are also in scope for read-only assessment. This includes `ops.c2moviez.com`, Telegram, Supabase, Plane, Bexio, Outlook/Microsoft Graph, Infomaniak, Netlify/deploy surfaces, and any other external service evidenced by the repository. The authorization remains read-only and non-mutating.
- Marcel later clarified that this must be a full YURI trial, not a partial current-branch-only audit. Scope therefore expands to the maximum obtainable evidence from our side: full current-branch tracked files, all visible remote branches, all reachable Git history, GitHub metadata available to the authenticated account, issue/PR/workflow/wiki/project surfaces when available, and read-only live-service/runtime evidence where a non-mutating procedure and source of credentials are explicitly defined.

## Full-Extent Evidence Scope

This run targets maximum obtainable truth, while preserving read-only and no-credential-use boundaries.

Available now:

- Current default branch full working-tree clone:
  - path: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
  - origin: `https://github.com/c2moviezfpv/c2moviez-vault.git`
  - HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
  - tracked files: `1505`
  - clean status count: `0`
- Visible remote branches:
  - `origin/main` at `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, `1505` tracked paths
  - `origin/claude/objective-tharp-b04a32` at `ca26458fa8d1adef061faf0684147729aea02f6c`, `738` tracked paths
- Reachable Git history:
  - all visible refs: `304` commits
  - `origin/main`: `303` commits
  - `origin/claude/objective-tharp-b04a32`: `109` commits
- GitHub metadata available to the authenticated account:
  - repository visibility: `PRIVATE`
  - default branch: `main`
  - issues enabled: `true`, issues listed through current read: `0`
  - projects enabled: `true`
  - wiki enabled: `false`
  - discussions enabled: `false`
  - pull requests listed through current read: `0`
  - visible workflow list/runs through current read: none shown
  - tags: `0`
  - PR refs: `0`
  - LFS pointer scan: `0`
  - submodules: none shown

Blocked until Claudio or Marcel provides a source:

- untracked local files;
- local runtime state, logs, queues, databases, LaunchAgents actually installed on Claudio's machine, shell history, process tables, and memory/CPU evidence;
- local `.env`, Keychain secret values, or provider tokens, except metadata/fingerprints when owner-approved;
- GitHub repository settings not exposed through current API/token response, including exact secret-scanning/push-protection status if unavailable;
- private provider dashboards and live-service state unless a read-only procedure and credential source are defined;
- service data that would require using a discovered credential, which remains forbidden.

Full-extent does not mean uncontrolled. Every source must be classified as `available_now`, `available_after_owner_export`, `available_after_read_only_provider_procedure`, `blocked`, or `forbidden`.

### Trial Scope Freeze

Marcel clarified that Claudio-local exports and direct local-machine data collection will not be requested for this trial. The active operation therefore proceeds as a **full GitHub-obtainable audit**.

In scope for this operation:

- full materialized `origin/main` tracked content;
- visible side branch `origin/claude/objective-tharp-b04a32`;
- all Git history reachable from visible refs;
- GitHub repository metadata available through the authenticated read-only session;
- repo-evidenced live-service references, deployment references, provider references, and runtime claims, assessed from GitHub-obtainable evidence only;
- credential and password discovery across GitHub-obtainable code, docs, generated artifacts, configs, branch content, and history, with redacted reporting only.

Out of scope for this operation:

- Claudio-local untracked files;
- local `.env`, Keychain values, local runtime databases, queues, logs, process tables, installed LaunchAgents, and memory/CPU samples;
- provider dashboards and live-service state that require Claudio-local credentials or provider access;
- any action that uses a discovered credential, replays a token, sends messages, mutates data, rotates secrets, triggers webhooks, starts automations, or probes production beyond a separately approved read-only procedure.

These out-of-scope surfaces should still be reported as `OUT_OF_SCOPE_FOR_THIS_TRIAL` with concrete unblock paths where useful, not silently ignored.

## Non-Negotiable Boundaries

- Do not push, commit, branch, open PRs, file issues, or otherwise mutate `c2moviez-vault`.
- Do not execute Claudio's production automations, LaunchAgents, Telegram bots, Supabase writes, Netlify deploys, shell installers, or MCP servers without explicit later authorization.
- Reading target-repo secrets/protected/runtime files is authorized for audit evidence, but reports must redact secret values and avoid copying sensitive data into durable YURI artifacts unless an explicit secure evidence-handling protocol is agreed.
- Do not treat Claude/Opus, DeepSeek, or any model lane as truth. All lane output is `advisory_only=true` until C-137 verifies exact repository evidence.
- Live external services are in scope under Marcel's explicit read-only authorization. No mutation is authorized.
- Forced credential and password discovery is in scope. This includes API keys, bot tokens, OAuth client secrets, passwords, password hashes, database URLs, service-role keys, webhook secrets, SSH/deploy materials, private keys, and unsafe storage patterns.
- Discovered credentials, passwords, and keys must never be used to connect, validate, fetch Claudio data, replay requests, refresh tokens, rotate secrets, or prove access. The audit may record only redacted fingerprints, file/line evidence, secret type, likely service, and risk.
- Do not perform destructive tests, brute force, fuzzing, credential guessing, spam, webhook trigger storms, endpoint stress/DoS, token rotation, deploys, production restarts, data creation, data updates, data deletion, or permission changes.
- Live read-only probes must be designed before execution. Prefer `HEAD`, `GET`, `OPTIONS`, metadata reads, official read-only API calls, TLS/header/CORS checks, authenticated read-only listing where credentials are provided, and single-request verification over bulk scanning.
- `POST` is allowed only when a provider's documented authentication or read-only query flow requires it and the request does not alter business state. Every such case must be listed in the live-service procedure before use.

## Mission Objective

Produce a repo-truth-bound, read-only defensive cybersecurity audit that Claudio can act on without needing to trust vibes, dashboards, or model claims.

The audit must answer four practical questions:

1. What is actually deployed, wired, reachable, and privileged?
2. Where can secrets, passwords, tokens, agent authority, filesystem writes, webhooks, or live-service access break containment?
3. Which runtime patterns plausibly explain broken Telegram control, high CPU/RAM, hallucinated health, or runaway automation?
4. Which controls are real strengths and should be preserved while fixing the dangerous parts?

The final product must be useful to Marcel and Claudio as an intervention document: clear enough to warn him, precise enough to guide remediation, and grounded enough that every serious claim can be traced back to evidence.

## Supercharged Operating Model

This run is organized as a read-only kill-chain audit, not a folder-by-folder browse.

Marcel's procedural correction: thoroughness comes from incremental, surgical closure, not broad scanning. Broad enumeration may only create manifests, shard queues, or high-level inventories; it does not count as semantic coverage and must not be used as the basis for a final claim.

Every active audit step must define a small slice before work starts:

- exact files, directory shard, function group, provider surface, or evidence row under inspection;
- reason this slice is next in the risk order;
- read method and stop condition;
- expected output rows;
- what closes the slice as `covered`, `suppressed`, `reportable`, `deferred`, or `needs_follow_up`;
- what raw material is forbidden from durable logs.

Rick lane packets must use the same surgical procedure. A Rick may not satisfy a shard by saying it scanned broadly or sampled hotspots. Each lane must work in bounded batches, inspect assigned files directly, and emit coverage rows with exact path, line range or file scope, claim, evidence, disposition, and follow-up.

Priority order:

1. Credential and password exposure.
2. Internet/live-service perimeter.
3. Auth and internal trust boundaries.
4. Telegram to tmux to Claude control path.
5. MCP/agent tool authority and vault write paths.
6. Supabase/RLS/data privacy.
7. Runtime availability: LaunchAgents, watchdogs, local models, loops, queues, memory pressure.
8. Build/deploy/supply chain.
9. Navigation, docs drift, false assurance.
10. Strengths, salvageable patterns, and recommended operating model.

Every sprint must produce:

- inspected scope;
- exact commands or read methods;
- findings, suppressions, unknowns, and blocked evidence;
- evidence paths and line numbers;
- confidence and false-positive notes;
- remediation priority;
- next verification step.

Finding lifecycle:

```text
HYPOTHESIS: plausible risk from docs, filenames, architecture, or lane output.
CANDIDATE: exact code/config evidence exists, but exploitability or reachability is not yet validated.
VALIDATED: evidence establishes entrypoint, trust boundary, control, sink, and plausible impact.
SUPPRESSED: exact counterevidence disproves or materially downgrades the risk.
DEFERRED: important but blocked by unavailable local state, credentials, provider metadata, or live read-only procedure.
REPORTABLE: validated enough for final audit, with severity and remediation.
```

Severity rubric:

```text
CRITICAL: exposed credential/private key with meaningful authority; unauthenticated or easily reachable write/delete/exec path; agent/tool path that can mutate high-value systems; RLS bypass exposing sensitive client/finance data; production deploy/server compromise path.
HIGH: auth bypass candidate with strong reachability; webhook forgery; prompt/control injection into high-authority agent; local-only credential exposure that becomes critical after local/process compromise; DoS path likely to explain 30GB+ RAM or control-plane outage.
MEDIUM: false assurance, stale health, partial auth inconsistency, excessive scope, weak secret handling, missing locks/backpressure, code wiring that can cause data drift or incident confusion.
LOW: hygiene issue, docs drift, weak naming, minor auditability gap, or non-sensitive identifier exposure.
INFO/STRENGTH: verified control, useful pattern, or non-risk context.
```

No severity is final until C-137 verification. Lane severity is advisory.

## Research-Supercharged Control Baseline

Online research pass completed: 2026-05-27.

Only primary or near-primary sources should drive the audit baseline. Blogs, social posts, and model-lane commentary may seed hypotheses, but they cannot establish severity or remediation by themselves.

Authoritative baselines now wired into the audit:

| Baseline | Source | How it changes this audit |
| --- | --- | --- |
| Web/app control verification | [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/), [OWASP WSTG](https://owasp.org/www-project-web-security-testing-guide/) | Findings should map to concrete verification themes: auth, session, access control, input/output handling, configuration, logging, files, API, and business logic. |
| API risk model | [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) | Dashboard functions, Supabase calls, MCP endpoints, and provider bridges must be checked for object-level auth, function-level auth, broken auth, resource consumption, inventory drift, and unsafe third-party API consumption. |
| Secure development and risk governance | [NIST SSDF SP 800-218](https://csrc.nist.gov/pubs/sp/800/218/final), [NIST CSF 2.0](https://www.nist.gov/cyberframework) | The report must distinguish root causes, operational risk, remediation priority, and repeat-prevention controls, not just isolated bugs. |
| Agentic AI and RAG | [OWASP GenAI / LLM Top 10 2025](https://genai.owasp.org/llm-top-10/), [OWASP Agentic AI Threats and Mitigations](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/) | Prompt injection, sensitive disclosure, supply chain, data/model poisoning, improper output handling, excessive agency, system prompt leakage, vector weakness, misinformation, and unbounded consumption become first-class audit rows. |
| MCP authorization and tool security | [MCP Authorization spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization), [MCP Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices), [MCP Authorization guidance](https://modelcontextprotocol.io/docs/tutorials/security/authorization) | Every MCP/tool path must prove token audience handling, per-tool authorization, no token passthrough, secure token storage, HTTPS where remote, least-privilege scopes, no credential logging, and auditability. |
| Supabase security boundary | [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod) | Public/publishable keys are not secrets; RLS and policies are the real boundary. Service-role/secret keys bypass RLS and must never be exposed. Storage, views, `security definer`, JWT metadata, rate limits, and PITR/backups need explicit checks. |
| Secret security and Git history | [GitHub secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/about-secret-scanning), [GitHub push protection](https://docs.github.com/en/code-security/concepts/secret-security/about-push-protection) | Credential hunting must include full history, non-provider/generic secrets, custom patterns, issue/wiki/PR surfaces where available, and prevention posture. GitHub validity checks are not a YURI permission to use found credentials. |
| CI/CD and supply chain | [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use), [OpenSSF Scorecard](https://github.com/ossf/scorecard), [SLSA v1.1](https://slsa.dev/spec/v1.1/about) | Build/deploy review must cover token permissions, secret masking, script injection, dependency updates, dangerous workflows, branch protection, provenance, generated artifacts, and whether scanned source equals deployed code. |
| Telegram control plane | [Telegram Bot API](https://core.telegram.org/bots/api/) | `getWebhookInfo` is read-only status evidence. `setWebhook`, `deleteWebhook`, `sendMessage`, and polling operations that alter queues/state are mutation unless explicitly scoped. Webhooks should use `X-Telegram-Bot-Api-Secret-Token` and bounded `max_connections`. |
| Microsoft Graph / Outlook | [Graph permissions overview](https://learn.microsoft.com/en-us/graph/permissions-overview), [Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference), [Graph subscription resource](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0), [List subscriptions](https://learn.microsoft.com/en-us/graph/api/subscription-list?view=graph-rest-1.0) | Distinguish delegated versus application permissions, tenant-wide app-only blast radius, least-privilege scopes, webhook subscription expiry/renewal, notification URL TLS, and read-only subscription inventory. |
| Bexio finance API | [Bexio API docs](https://docs.bexio.com/) | Finance tokens must be scope-audited. Write scopes imply read access for the same resource; `offline_access` introduces refresh-token persistence risk. Financial POST endpoints are mutation unless specifically documented as read-only search and approved. |
| Plane API and webhooks | [Plane API docs](https://developers.plane.so/api-reference/introduction), [Plane webhook docs](https://developers.plane.so/dev-tools/intro-webhooks) | Plane keys are password-equivalent. Webhook signatures, delivery IDs, event types, retries, deprecated `/issues/` endpoints, and migration to `/work-items/` must be checked. Because Plane's docs state `/api/v1/.../issues/` support ended on 2026-03-31, old endpoint usage is now an availability/security-drift candidate. |

### Research-Derived Audit Rules

- Every reportable web/API finding must map to at least one of: ASVS/WSTG, OWASP API Top 10, MCP security, OWASP GenAI, Supabase docs, provider docs, GitHub/GitHub Actions docs, OpenSSF Scorecard, SLSA, or NIST SSDF/CSF.
- Every high/critical finding must prove the root-control failure, not only a dangerous sink.
- Every provider integration must distinguish read-only inventory calls from state-changing calls before any live check.
- Every secret finding must distinguish `PUBLISHABLE_IDENTIFIER`, `SECRET_REFERENCE_ONLY`, `CONFIRMED_EXPOSED_SECRET`, `CONFIRMED_EXPOSED_PRIVATE_KEY`, `PASSWORD_OR_HASH`, and `UNKNOWN_SECRET_SHAPED`.
- Every agentic finding must identify the agent, tool, trust boundary, instruction/source of untrusted content, allowed side effect, and missing authorization or confirmation point.
- Every runtime finding must map to resource-consumption, availability, cost-burn, false-health, or runaway-control-plane risk.
- Every supply-chain finding must answer whether the deployed artifact can be traced back to reviewed source and whether build/deploy authority is protected.

## Execution Sprint Stack

Sprint order is risk-first, with repo truth and secret exposure front-loaded.

| Sprint | Name | Primary output | Closure condition |
| --- | --- | --- | --- |
| 0 | Scope, research, and evidence protocol | Updated `00_master-plan.md` | Marcel reviews/approves read-only plan, live-service procedure, secret handling, and lane behavior. |
| 1 | Credential/password deep sweep | Update `01_repo-truth-inventory.md` and seed `06_security-findings.md` | Tracked HEAD, bounded history, high-risk JSON/config/script/docs/generated surfaces, and ongoing code-review secret hits are redacted/fingerprinted or suppressed. |
| 2 | Asset and trust-boundary inventory | `01_repo-truth-inventory.md` | All major assets, providers, daemons, functions, LaunchAgents, MCP tools, data stores, secret classes, and blocked local-state sources are listed. |
| 3 | Web/API perimeter and function inventory | `03_code-wiring-quality-audit.md` plus security ledger rows | All `Dashboard-v2/functions/*.js` are grouped by auth model, external exposure, data access, writes, and provider calls. |
| 4 | AuthN/AuthZ and object-level access | `05_security-threat-model.md`, `06_security-findings.md` candidates | Internal keys, HMAC, session/password auth, Supabase roles, object IDs, tenant/client boundaries, and admin functions are mapped to controls. |
| 5 | Telegram/tmux/Claude/MCP/agent control chain | `07_agentic-ai-rag-memory-audit.md` and attack-path notes | Inbound message to model to tool to side effect is traced, including guardrails, allowed users, rate limits, prompt injection, session persistence, and write authority. |
| 6 | Supabase/RLS/storage/data privacy | Supabase shard in `06_security-findings.md` | Migrations, grants, RLS, views, `security definer`, service-role usage, storage policies, realtime, and audit tables are reviewed. Live RLS probes wait for procedure approval. |
| 7 | Runtime availability and resource consumption | `04_automation-runtime-audit.md` | LaunchAgents, loops, watchers, queues, local models, backfills, retries, locks, logs, memory caps, and CPU/RAM hypotheses are tied to code and schedules. |
| 8 | Build/deploy/supply chain | `08_build-test-dependency-audit.md` | Lockfiles, lifecycle scripts, CI/CD, deploy scripts, dependency health, action permissions, generated artifacts, and provenance gaps are inventoried. |
| 9 | Read-only live-service verification | Live-service appendix and updated findings | Each provider probe has a preapproved read-only procedure, rate/stop condition, and evidence retention rule. No discovered credential is used. |
| 10 | Final report and YURI proof retrospective | `final_c2moviez-vault-audit.md`, `09_yuri-proof-retrospective.md` | Findings are validated/suppressed/deferred, strengths included, unknowns explicit, and YURI process lessons captured. |

## Provider-Specific Read-Only Procedure Template

Before any live external-service action, write a mini-procedure with these fields:

```text
LIVE_CHECK_ID:
provider:
target:
repo_evidence:
purpose:
credential_source: owner_provided | browser_session | provider_dashboard | none | discovered_secret_PROHIBITED
credential_use_allowed: yes/no
method: HEAD | GET | OPTIONS | documented_read_only_POST | dashboard_read
exact_request_or_ui_action:
non_mutation_argument:
expected_response:
rate_limit:
stop_condition:
data_minimization:
evidence_to_record:
raw_secret_handling:
rollback: none_required
approval_status:
```

Provider guardrails:

- Telegram: read-only status methods such as `getWebhookInfo` may be procedure candidates; sending messages, setting/deleting webhooks, or consuming updates is mutation.
- Supabase: anonymous/publishable-key `select` probes can test RLS only after selecting synthetic or owner-approved minimal rows; service-role keys are not used unless Claudio separately provides a controlled read-only method and confirms no business data exfiltration.
- Microsoft Graph: prefer app/permission/subscription metadata and least-privilege inventory; do not create, renew, or delete subscriptions in this phase.
- Bexio: GET/list/read-only scope checks only; invoice/contact/file creation, reminder creation, send actions, status changes, uploads, and payment operations are out of scope.
- Plane: GET/list metadata and missing/invalid-signature denial behavior only; do not create/update/delete work items, comments, projects, webhooks, or labels.
- Netlify/Infomaniak/VPS: public TLS/header/CORS checks are allowed after procedure approval; SSH/process inventory requires owner-provided read-only access and a command list reviewed before execution.
- Anthropic/OpenAI/AI providers: account/key metadata only when owner-provided; no generation/transcription/model calls for proof unless a later synthetic-cost budget is approved.

## Evidence Ledger v2

Every sprint should leave durable rows in this format:

```text
ASSET id=<ID> type=<repo|service|function|daemon|mcp_tool|database|bucket|provider|secret_store> evidence=<PATH:LINE|URL|BLOCKED_LOCAL_STATE> owner=<unknown|repo_claim|verified>
FILE_COVERAGE path=<PATH> type=<code|docs|config|data|binary|generated> lane=<RICK_ID|C137> method=<pending|line_read|parser|structured_scan|metadata_only|ocr_needed|deferred> lines=<N|unknown> words=<N|unknown> status=<pending|covered|partial|deferred|binary_metadata_only|ocr_needed> notes=<short_reason>
FLOW id=<ID> source=<ENTRYPOINT> trust_boundary=<BOUNDARY> control=<PATH:LINE|none_observed> sink=<PATH:LINE|provider> status=<mapped|blocked|candidate|validated>
CONTROL id=<ID> framework=<ASVS|WSTG|OWASP_API|OWASP_LLM|MCP|Supabase|GitHub|SLSA|NIST|Provider> requirement=<short_ref> evidence=<PATH:LINE|URL|none_observed> status=<present|missing|partial|not_applicable|blocked>
SECRET id=<ID> class=<PUBLISHABLE_IDENTIFIER|SECRET_REFERENCE_ONLY|CONFIRMED_EXPOSED_SECRET|CONFIRMED_EXPOSED_PRIVATE_KEY|PASSWORD_OR_HASH|UNKNOWN_SECRET_SHAPED> evidence=<PATH:LINE> fingerprint=<sha256_prefix_or_len_only> use_status=NOT_USED
FINDING id=<ID> lifecycle=<HYPOTHESIS|CANDIDATE|VALIDATED|SUPPRESSED|DEFERRED|REPORTABLE> severity=<INFO|LOW|MEDIUM|HIGH|CRITICAL> confidence=<low|medium|high> evidence=<PATH:LINE> framework=<REF> next=<verification_step>
BLOCKED id=<ID> reason=<LOCAL_STATE|CREDENTIALS|PROCEDURE|LIVE_SCOPE|BINARY_EXTRACTION|TIMEBOX> needed=<exact_input>
STRENGTH id=<ID> control=<short_name> evidence=<PATH:LINE> preserve=<why_it_matters>
```

## Hidden Credential Handling During Code Exploration

Credential discovery is continuous. Every lane must treat secrets as live hazards even when the sprint is "architecture" or "runtime".

Procedure when a secret-shaped value appears:

1. Stop quoting the raw line.
2. Re-read with a redaction command or structured parser.
3. Record only path, line, type, length, hash prefix, and provider guess.
4. Mark `use_status=NOT_USED`.
5. Check neighboring code for storage pattern, logging, transport, scope, and rotation hints.
6. Continue the primary sprint with the secret row linked as evidence.

High-risk hiding places:

- `.obsidian/plugins/*/data.json`, plugin settings, `.canvas`, generated HTML, markdown exports, and local REST configs;
- `.claude` agent specs and local tool configs, excluding YURI protected runtime paths;
- `.mcp.json`, MCP server configs, tool schemas, wrappers, and env injection scripts when available;
- LaunchAgent plists, shell scripts, deploy scripts, aliases, crontabs, and `*.command` files;
- Supabase migrations, SQL seed files, public config functions, dashboard bundles, and serverless functions;
- lockfiles, generated client projects, old archives, screenshots/OCR candidates, PDFs, and docs pasted from provider consoles;
- Git history for deleted `.env`, JSON config, keys, bot tokens, passwords, private keys, and URL query tokens.

## Report Definition Of Done

The final audit is not done until:

- the exhaustive fanout coverage gate is closed: every tracked text-bearing code, config, markdown, JSON, SQL, script, HTML, Svelte, TypeScript, JavaScript, Python, plist, package/lock, and agent-spec file is assigned to a lane and marked `covered`, `partial`, or `deferred` with exact reason;
- every covered text-bearing file has line/word-level inspection evidence in the coverage ledger, not just filename-level enumeration;
- every binary, image, font, PDF, generated asset, and large artifact is classified as `binary_metadata_only`, `ocr_needed`, or `deferred`, with rationale and follow-up if it can hide credentials or architecture claims;
- every high/critical finding is `VALIDATED`, `SUPPRESSED`, or `DEFERRED` with exact reason;
- every exposed credential/private key/password row is redacted, fingerprinted, and marked `NOT_USED`;
- every privileged surface has an owner/source-of-truth status: verified, repo-claimed, blocked local state, or unknown;
- every live-service check has a procedure row before execution;
- every provider integration has read versus write capability separated;
- every agent/tool path has side effects and confirmation boundaries named;
- every runtime CPU/RAM hypothesis is tied to concrete loop/schedule/backoff/resource-bound evidence or deferred;
- every serious claim has path/line/source evidence and a framework/provider mapping;
- strengths are included with the same evidence discipline as weaknesses;
- unknowns are explicit enough that Claudio knows what local state or dashboard evidence to provide next;
- no raw secrets, passwords, private keys, customer data, or sensitive provider payloads are stored in YURI reports.

## Live External-Service Scope Envelope

Purpose: obtain Claudio's full risk picture across the code, deployed services, integrations, and provider control planes so Marcel can warn and guide him accurately.

In scope for read-only assessment:

- `ops.c2moviez.com` public dashboard and function surface;
- Infomaniak VPS/deploy surface evidenced by `Dashboard-v2/server/deploy.sh` and `CLAUDE.md`;
- Netlify/deploy/function surfaces where still configured or reachable;
- Supabase project: REST, Storage, Realtime, RLS behavior, schema metadata, and audit tables through read-only calls;
- Plane workspace and webhooks through read-only API calls and webhook receiver behavior checks;
- Telegram bot configuration, bot identity, allowed-user assumptions, webhook/poller state, and message-flow evidence without sending messages;
- Bexio finance/ERP API through read-only token/scope/account metadata and GET/list calls only;
- Outlook/Microsoft Graph through read-only OAuth/app metadata, subscription listing, calendar/mail metadata, and webhook validation behavior;
- Anthropic/OpenAI/Infomaniak AI/Hugging Face/model supply-chain surfaces evidenced by the repo;
- any additional external dependency discovered from tracked source, local runtime config, or Claudio-provided environment evidence.

Read-only live checks may answer:

- is the endpoint reachable and presenting the expected TLS/headers/CORS behavior;
- are unauthenticated endpoints properly denied or intentionally public;
- do documented webhooks fail closed on missing/invalid signatures without causing state change;
- do read-only credentials have excessive scopes;
- do public config endpoints expose only intended public values;
- do Supabase RLS policies hold at the wire for anon and authenticated read-only roles;
- do provider dashboards/API metadata match repo claims;
- are there duplicate or stale deploy surfaces that create a parallel attack surface.

Credential checks may answer:

- are real secrets, passwords, tokens, or private keys committed to tracked Git content;
- did secret-like material appear in history, lockfiles, generated assets, docs, client artifacts, Obsidian plugin config, deploy scripts, migrations, or agent specs;
- are secrets referenced through safer stores such as macOS Keychain, provider env vars, or untracked runtime config;
- are secrets weakly handled: logged, passed in URLs, stored in `/tmp`, exposed through public config, used for multiple trust boundaries, compared as raw strings, embedded in client bundles, or granted excessive scope;
- which provider accounts need rotation or scope review if a confirmed exposure is found.

Hidden-credential rule during code exploration:

- Every code-reading lane must treat newly discovered secret-shaped material as a security event.
- Stop expanding that raw view, record only path/line/type/fingerprint, and continue with redacted context.
- Do not paste raw key material into prompts, reports, terminal summaries, or lane packets.
- If raw material is accidentally shown in a model pane, do not repeat it; record `SECRET_SPILL_IN_LANE_OUTPUT` and summarize only the redacted fingerprint.
- Credential discovery continues during all later code, history, artifact, and live-surface work. The first credential sprint was only baseline coverage, not closure.

Deep credential follow-up scope:

- bounded `git log -p` searches for removed secrets, especially `.obsidian`, `.env`, `*.json`, deploy scripts, and wrapper scripts;
- redacted scan of generated client artifacts and HTML deliverables for embedded keys, URLs with tokens, analytics IDs with write scope, or password-bearing links;
- redacted review of `.obsidian/plugins/*/data.json`, `.claude` config/spec files, MCP wrappers, LaunchAgent plists, and shell scripts;
- metadata-only inventory of Keychain service names, Netlify env names, provider env names, and `.mcp.json` server definitions when available;
- no credential validation by provider login, API call, or replay.

Still out of scope unless Marcel gives a separate explicit mutation window:

- creating, updating, or deleting tickets, invoices, contacts, files, calendar events, Supabase rows, Telegram messages, deployments, tokens, subscriptions, users, roles, secrets, or server processes;
- exploit attempts that would alter logs, quotas, queues, counters, billing, or user-visible state beyond ordinary access logs;
- high-volume discovery, stress tests, or automated scanners against production services.
- using any discovered credential or password to authenticate, verify access, retrieve data, or prove exploitability.

## Cybersecurity Lens Weight Override

This operation is a defensive cybersecurity assessment first, not a general repo cleanup with a security chapter attached.

Every track must answer the cyber question underneath its local topic:

- repo truth inventory becomes asset, trust-boundary, and attack-surface inventory;
- navigation and folder architecture become security assurance checks: can a human or agent identify the real source of authority without trusting stale docs;
- code quality and wiring become control-plane integrity checks: do guards, data flows, jobs, webhooks, agents, and write paths connect cleanly or create confusing privilege paths;
- runtime stability becomes availability and denial-of-service analysis, including runaway loops, overlapping daemons, memory exhaustion, self-healer recursion, and stale health claims;
- indexing, RAG, and memory become prompt-injection, data-poisoning, stale-context, and excessive-agency surfaces;
- build and dependency health become supply-chain, reproducibility, and deploy integrity checks;
- documentation drift becomes a security-relevant false-assurance risk when it causes operators or agents to believe controls exist that are absent, broken, or unreachable;
- strengths become verified controls worth preserving, not vibes.

Priority weight for all lanes:

1. attack paths, trust boundaries, authorization, secret handling, Supabase/RLS, webhook authenticity, Telegram command authority, MCP/tool authority, filesystem write paths, command execution, agent autonomy, and runtime resilience;
2. code and wiring quality where it affects correctness, safety, maintainability, observability, or incident response;
3. navigation, naming, indexing, and docs where they affect auditability or operator confidence;
4. purely aesthetic or convenience issues only when they create measurable operational risk.

Non-security findings are allowed, but they must be framed as secondary unless they impair security assurance, runtime safety, or operator truth.

## Grounding Already Collected

YURI control-plane grounding:

- Loaded `_SYSTEM/yuri-origin.md`, `SOUL.md`, `_SYSTEM/context/README.md`, `_SYSTEM/context/context-registry.json`, and `_SYSTEM/INDEX.md`.
- Ran `node _SYSTEM/Scripts/context-router.mjs` for the external audit. Router first selected `automation`.
- Ran targeted routers for the workcell and cyber dimensions. Results selected `kagami-harness` and `cybersecurity`.
- Loaded the Codex Security `security-scan` skill. Its required phase order is threat model, finding discovery, validation, attack-path analysis, then final report.
- Classified this report path through `artifact-registry.mjs`; `_SYSTEM/reports/` is the correct generated-report location.

Target-repo grounding:

- `git ls-remote` resolved target `HEAD` to `8103286e1abc63fa9490cb1375ecde4f340aa2bb`.
- No-checkout tree inventory found `1505` tracked paths.
- Top-level surfaces include `.claude`, `.obsidian`, `01 - Daily Briefings`, `02 - Clients`, `03 - Projects`, `04 - Team`, `05 - Work Items`, `06 - Processes`, `07 - Resources`, `08 - Archive`, `09 - Templates`, `10 - Holding Companies`, `11 - NEX Brain`, `12 - SILASWIRTH`, `15 - Sales Pipeline`, `16 - Meetings`, `Dashboard-v2`, `Scripts`, `Home.md`, `CLAUDE.md`, and `Untitled.canvas`.
- Major path counts from tree names: `02 - Clients` 657, `Dashboard-v2` 333, `Scripts` 259, `05 - Work Items` 80, `.obsidian` 26, `03 - Projects` 22.
- Manifests found in `Dashboard-v2`, `Dashboard-v2/functions`, `Scripts`, `Scripts/finance-mcp`, `Scripts/nex-rvf`, `Scripts/team-bots`, `Scripts/telegram-mcp`, and one client Figma/Vite project.
- Relevant runtime/control surfaces in file names include Telegram MCP, Plane sync, Supabase sync, Obsidian queue consumer, LaunchAgents, NEX daemon, RAG/RVF, local models, self-healer, watchdogs, and dashboard functions.
- `CLAUDE.md` claims a production Obsidian vault plus SvelteKit dashboard, 51 functions via Express shim, Supabase audit/realtime, Plane/Outlook/Telegram bindings, local LaunchAgents, and a `nex-rvf` RAG/MCP system. These claims are not accepted yet; they become audit hypotheses.

External methodology grounding:

- [OWASP Code Review Guide](https://owasp.org/www-project-code-review-guide/): manual secure review remains necessary even when scanners improve.
- [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/) and [OWASP WSTG](https://owasp.org/www-project-web-security-testing-guide/): use stable control/scenario references when turning repo evidence into web-application findings.
- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/): prioritize object-level authorization, broken auth, function-level authorization, resource consumption, inventory drift, and unsafe third-party API consumption across function and integration surfaces.
- [NIST SSDF SP 800-218](https://csrc.nist.gov/pubs/sp/800/218/final) and [NIST CSF 2.0](https://www.nist.gov/cyberframework): secure software practices should reduce vulnerabilities, mitigate impact, address root causes, and communicate risk in an operator-usable vocabulary.
- [OWASP Threat Modeling Process](https://owasp.org/www-community/Threat_Modeling_Process): threat modeling helps prioritize depth-first code review of higher-risk components.
- [OWASP GenAI / LLM Top 10 2025](https://genai.owasp.org/llm-top-10/) and [OWASP Agentic AI Threats and Mitigations](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/): prompt injection, sensitive disclosure, insecure output handling, excessive agency, vector/RAG weakness, unbounded consumption, and agentic threats apply to this repo.
- [MCP Authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) and [MCP Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices): MCP/tool review must check token audience, token passthrough, per-client/per-tool authorization, secure storage, HTTPS, least-privilege scopes, and logging.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), and [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control): public keys rely on RLS; service-role/secret keys bypass RLS; storage policies must be explicit.
- [OpenSSF Scorecard](https://github.com/ossf/scorecard), [SLSA](https://slsa.dev/spec/v1.1/about), and [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use): repository health, CI token permissions, secret masking, script injection, and provenance checks are part of the audit frame.
- [GitHub secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/about-secret-scanning) and [GitHub push protection](https://docs.github.com/en/code-security/concepts/secret-security/about-push-protection): secret-leak detection, full-history scanning, non-provider/custom patterns, and push prevention are baseline controls to evaluate.
- Provider docs now included for [Telegram Bot API](https://core.telegram.org/bots/api/), [Microsoft Graph permissions](https://learn.microsoft.com/en-us/graph/permissions-overview), [Bexio API](https://docs.bexio.com/), and [Plane API/webhooks](https://developers.plane.so/api-reference/introduction).

## Decode Of Marcel's Intent

Primary intent: produce a serious, repo-truth-bound defensive cyber audit of Claudio's operational brain/backend stack and use it as a proof run for YURI's cyber/audit capability.

Secondary intent: investigate likely causes behind broken Telegram-to-Claude control, high CPU/RAM usage, and hallucinated health/automation claims.

Meta intent: test whether YURI's architecture, local-truth discipline, persistent lanes, verification gates, and report quality outperform normal vibe-coded assistant workflows.

Constraint hidden in the chaos: this must be professional enough to show strengths as well as weaknesses. We are not just dunking on the repo. We are proving method.

## Audit Questions

1. What does the repository actually contain, and how far does that differ from `CLAUDE.md` claims?
2. Which scripts, daemons, LaunchAgents, MCP servers, and dashboard functions are active control surfaces?
3. Where could runaway CPU, memory, or infinite loops plausibly come from?
4. Does the Telegram-to-Claude control path have durable session boundaries, backpressure, locks, idempotency, retries, and fail-closed behavior?
5. Does the repo protect secrets, credentials, client data, and runtime state?
6. Are Supabase, Plane, Outlook, Telegram, and dashboard mutations authenticated, authorized, auditable, and replay-safe?
7. Do the live external services match repo claims, and can read-only checks prove their auth, CORS, RLS, webhook, deployment, and integration boundaries without mutating production state?
8. Can a human or model navigate the repo without hallucinating architecture?
9. Is the RAG/memory/indexing system verifiably grounded, fresh, bounded, and recoverable?
10. Does the code and service wiring actually connect the claimed systems, controls, queues, webhooks, dashboards, agents, and databases, or are there broken handoffs, unreachable guards, duplicate paths, or misleading green lights?
11. Which parts are surprisingly good and worth preserving?
12. Which parts are costly vibe-coded mistakes: duplicated mechanisms, aspirational docs, stale names, uncontrolled background processes, missing tests, false health claims, brittle glue code, or confusing control flow?

## Audit Tracks

### Track A: Repo Truth Inventory

Purpose: build an exact map before judging.

Evidence:

- file tree counts;
- manifest list;
- package/dependency graph;
- script entrypoints;
- launch/service inventory;
- docs-to-code claim ledger;
- protected/runtime surfaces.

Output: `01_repo-truth-inventory.md`.

### Track B: Navigation And Architecture

Purpose: evaluate whether the repo can be safely understood by humans and agents as a security control.

Checks:

- top-level folder taxonomy;
- source/runtime/data separation;
- policy adapter thinness;
- stale naming such as NEX/EXEO drift;
- duplicate docs versus source truth;
- random assets in active source paths;
- generated/runtime artifacts tracked in git;
- whether important paths have owners and read rules.

Output: `02_navigation-architecture-audit.md`.

### Track C: Code And Wiring Quality

Purpose: inspect whether the system is actually wired together coherently, safely, and maintainably.

Security framing: poor wiring is not just ugly code. In a control-plane repo, it can mean auth checks are bypassed, health checks lie, retries amplify failures, agents write to the wrong place, or operators trust dashboards that do not prove real work.

Checks:

- entrypoint-to-sink tracing for dashboard functions, MCP handlers, scripts, LaunchAgents, queues, and daemon loops;
- auth and guard placement: whether checks happen before dangerous work and whether shared helpers are consistently used;
- error handling, retry behavior, idempotency, locking, leases, and backpressure;
- duplicate implementations for the same workflow, especially old EXEO/NEX or Telegram/Claude control paths;
- unreachable code, dead scripts, stale function names, circular dependencies, and unused "safety" helpers;
- environment variable wiring and fail-closed behavior when required config is absent;
- data model consistency across Supabase, local vault markdown, Plane/Outlook/Telegram payloads, and RAG indexes;
- observability wiring: whether logs, audit rows, sentinels, and dashboards prove the same state;
- testability: whether critical flows can be verified without running production side effects.

Output: `03_code-wiring-quality-audit.md`.

### Track D: Automation And Runtime Stability

Purpose: hunt the likely CPU/RAM failure classes.

Security framing: resource blowups, restart loops, and uncontrolled self-healing are availability and control-plane integrity risks.

Checks:

- LaunchAgent schedules, throttles, logs, and overlap risk;
- daemon/tmux lifecycle scripts;
- watchdog/self-healer recursion;
- queue consumers and reconnect loops;
- polling loops and backoff;
- no-lock concurrent workers;
- embedding/backfill/local-model memory caps;
- package installs and model caches;
- stale health endpoints that report green without proving live work.

Initial high-risk hypotheses from filenames and `CLAUDE.md` only:

- multiple LaunchAgents may overlap without leases;
- RAG/local model/backfill scripts may exceed RAM if chunking or batching is unbounded;
- Telegram/MCP/watchdog loops may reconnect aggressively after failure;
- health dashboards may summarize aspirational state instead of local process evidence;
- old EXEO/NEX naming can mask duplicate daemon paths.

Output: `04_automation-runtime-audit.md`.

### Track E: Security Review

Purpose: find reportable vulnerabilities, risky trust boundaries, and missing controls.

Use the Codex Security phase order:

1. Threat model.
2. Finding discovery.
3. Validation.
4. Attack-path analysis.
5. Final report.

Coverage:

- secrets and token handling;
- forced credential and password exposure discovery across tracked source, history where safely redacted, docs, generated artifacts, scripts, provider config references, and deployment surfaces;
- webhook signatures;
- auth and authorization;
- Supabase RLS and migrations;
- live external-service perimeter checks under the read-only scope envelope;
- MCP tool boundaries;
- Telegram command authorization;
- filesystem write paths;
- command execution and shell wrappers;
- SSRF/path traversal/deserialization/injection sinks;
- dependency/supply-chain posture;
- GitHub Actions and deploy surfaces if present;
- client data and privacy risk.

Output: `05_security-threat-model.md`, `06_security-findings.md`.

Credential handling rule:

- A credential finding may be confirmed by repository evidence alone, but the raw value must not be copied into reports.
- Use only masked fingerprints such as `abcd...wxyz len=40`, a hash prefix, path, line, secret type, and provider guess.
- Mark every discovered credential `use_status=NOT_USED`.
- Confirmed exposed credentials should lead to remediation guidance such as rotation, scope reduction, audit-log review, and repository history cleanup, not live use by YURI.

### Track F: Agentic AI, RAG, And Memory Safety

Purpose: evaluate the AI-native risk surface instead of treating it like a normal web app only.

Checks:

- prompt injection and tool-output injection;
- retrieval confidence thresholds versus enforcement;
- memory/RAG poisoning and stale context;
- autonomous retries and excessive agency;
- MCP tool schema trust;
- model route trust and local model resource bounds;
- "Claude says it works" versus deterministic evidence.

Output: `07_agentic-ai-rag-memory-audit.md`.

### Track G: Build, Test, And Dependency Health

Purpose: measure whether the repo can be rebuilt and verified.

Security framing: reproducibility, dependency provenance, and test coverage are supply-chain and operational assurance controls.

Default is static-only until Marcel authorizes heavier execution.

Allowed without extra target mutation:

- parse package manifests and lockfiles;
- inspect scripts;
- run static dependency metadata checks that do not execute target lifecycle scripts;
- inspect TypeScript/Svelte config.

Hold for explicit approval:

- `npm install`;
- `npm run build`;
- starting dev servers;
- launching scripts;
- running shell installers;
- invoking MCP servers;
- invoking live APIs.

Output: `08_build-test-dependency-audit.md`.

### Track H: Strengths And Salvage Map

Purpose: avoid a one-sided roast. Good architecture should be identified and reused.

Look for:

- clear source-of-truth docs;
- fail-closed HMAC/webhook claims verified in code;
- rate limiting and pagination caps;
- queue catch-up behavior;
- migrations that improve RLS/security;
- useful guardrail ideas;
- clear client folder schemas;
- any deterministic health checks.

Output: integrated into final report and a dedicated strengths section.

### Track I: YURI Proof Retrospective

Purpose: audit our audit.

Measure:

- where YURI was faster or more precise;
- where YURI needed better scanners or context packets;
- whether model lanes added signal or noise;
- which claims were corrected by local evidence;
- what new YURI capability should be promoted after the run.

Output: `09_yuri-proof-retrospective.md`.

## Lane Plan: Opus-Only Claude Audit Overlay

Marcel requested that the former Sonnet Rick roles be run as Opus-only for this test.

Operating rule:

- every Claude lane must be a persistent CLI/tmux/PTY session;
- no Claude SDK;
- no `claude -p`;
- no `claude --print`;
- no throwaway prompt processes;
- load the role/profile in-session, then escalate/switch the lane model to Opus before sending task packets where the CLI supports it;
- if Opus model switching cannot be verified in the live pane, the lane is blocked rather than silently downgraded.

Baseline lane sequence after Marcel approves this plan:

1. C-137 drafts the bounded first packet and evidence pack.
2. Quantum Rick as Claude/Opus receives the plan and produces decomposition pressure: missing tracks, audit order, likely false positives, and report shape.
3. C-137 integrates Quantum's repo-grounded critique, especially cybersecurity weighting and code/wiring scope.
4. Rick Prime as Claude/Opus receives the integrated draft and performs adversarial cybersecurity pressure: attack paths, trust boundaries, agent authority, write paths, runtime abuse, and false assurance.
5. Rick Prime performs a mandatory credential-and-password exposure sprint: force-find leaked API keys, passwords, tokens, private keys, service-role keys, bot tokens, database URLs, deploy keys, webhook secrets, OAuth secrets, password hashes, and weak secret-handling patterns. Output must be redacted/fingerprinted only and every hit must state `use_status=NOT_USED`.
6. C-137 verifies Prime's credential sprint with local read-only evidence, suppresses placeholders, redacts confirmed hits, and freezes the Phase 1 audit scope.
7. Fanout begins only after scope freeze:
   - Zeta Alpha Rick / Opus: exhaustive asset, repo truth, navigation, docs, and auditability shard coverage;
   - Cop Rick / Opus: exhaustive security controls, guardrails, auth, secrets, and abuse-case shard coverage;
   - Riq IV / Opus: exhaustive report structure, evidence ledger, claim-trace, and coverage-ledger shard coverage;
   - Maximums Rickimus / Opus: exhaustive static code and service-wiring shard coverage;
   - Rick Prime / Opus: final adversarial challenge pass against the full coverage ledger, not only hotspot findings;
   - Simple Rick / DeepSeek: compressed EOT and retrospective synthesis.

All lanes inherit the cybersecurity lens weight override. No lane may treat security as someone else's track.

All lane packets must include:

- target commit;
- assigned file shard and expected coverage status for every path in that shard;
- files allowed;
- files forbidden;
- exact output schema;
- mandatory `FILE_COVERAGE` rows and `UNREAD_OR_DEFERRED` list;
- claim/evidence separation;
- no mutation rule;
- max output budget;
- "unknown" allowed and preferred over guessing.
- "do not use discovered credentials or passwords" and "never print raw secret values" when the lane touches secrets.

## Micro-Batch Burn-Down Protocol

Run 002 proved that broad lane names are not sufficient. A Rick lane does not count as having audited a surface unless it inspected assigned files directly from the canonical clone and emitted proof rows.

Canonical run rule:

- clone once, read many times;
- no lane reclones the target repo;
- every target-lane prompt includes the repo URL, canonical clone path, commit SHA, tracked-file count, read-only boundary, and no-credential-use boundary;
- lanes may use broad tree commands only to build a queue, never to close coverage;
- every assigned file must have `PATH_PROOF`, `READ_PROOF`, and `FILE_COVERAGE`;
- every batch must end with `BATCH_CLOSE`;
- C-137 must spot-check accepted lane claims against the clone before they enter a durable report;
- contaminated, truncated, or prompt-polluted lane output is accepted only for claims independently verified by C-137;
- target `.claude` hook ingestion must be avoided in future lanes. Prefer launching lanes from YURI root with user-only settings and reading target files through `git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo`.

Coverage states:

```text
queued        assigned but not yet inspected
covered       direct line/word inspection completed and accepted
partial       direct inspection began but failed or only covered a bounded subset
deferred      blocked with exact reason and next evidence source
suppressed    considered issue is not valid, with counterevidence
invalidated   lane output rejected because proof/capture was insufficient
not_applicable file/surface does not bear text, code, config, secret, architecture, runtime, or navigation evidence for this audit
```

Current accepted target coverage status:

- unique assigned target surfaces: `346 / 1505`;
- strict semantic caveat: `344 covered + 2 partial` because `Scripts/telegram-mcp/package-lock.json` and `Scripts/team-bots/package-lock.json` received bounded structure/dependency review rather than full lockfile line review;
- YURI process files inspected: `5`;
- tracked target files: `1505`;
- status: fanout mechanism proven, comprehensive line-by-line audit still open.

Usage-conservation update:

- Active Rick worker cap is now `1`.
- Future worker execution should reuse one continuous persistent Claude/tmux lane instead of spawning fresh terminal sessions for each run.
- Between bounded runs, C-137 should ask the lane to `/clear` and then feed the next packet from durable YURI artifacts.
- This is expected to reduce session/context burn, but `/clear` also removes the worker's conversational context. Durable packets, reports, clone path, commit SHA, and C-137 verification remain the source of truth.
- Parallel fanout is suspended unless Marcel explicitly reauthorizes it for a specific short burst.

Next burn-down queue:

1. Run 027: next bounded single-lane target shard, preferably `AnalyticsView.svelte`, remaining small tracker helper components, or `/focus/+page.svelte` because Run 026 found the same missing focus endpoints there.
2. public/external-facing `Dashboard-v2/functions/*.js` grouped by provider, auth model, write capability, and service-role use.
3. `Scripts/telegram-mcp/*` plus adjacent startup scripts to close the poller/server side of the Telegram-to-Claude chain.
4. MCP/RAG/RVF write authority: `Scripts/nex-rvf/*`, vault apply/search helpers, and write-back tools that can mutate Obsidian or repository state.
4. remaining `Dashboard-v2/functions/*.js` grouped by provider, auth model, and write capability.
5. remaining `.claude/agents/*.md` not covered by Run 006.
6. `.obsidian/` configuration and plugin settings, including Claudian source/bundle verification.
7. `02 - Clients/` client schema, generated files, and routing consistency.
8. visible side branch and reachable history credential/password sweep.
9. lockfiles, deploy scripts, package scripts, LaunchAgent/plist references, and CI/deploy metadata.

Master audit naming rule:

- no artifact may be called final unless the burn-down ledger closes all target surfaces or lists every remaining surface as deferred with exact blocker and next evidence source.

## Evidence Grammar

For deterministic audit claims, prefer machine-parseable lines:

```text
TERM_COUNT term=<TERM> count=<N>
FILE_COUNT file=<PATH> count=<N>
MATCH file=<PATH> term=<TERM> line=<N> excerpt="<bounded text>"
CLAIM source=<DOC_PATH> status=<verified|contradicted|unverified> evidence=<PATH:LINE>
RISK id=<ID> severity=<low|medium|high|critical> confidence=<low|medium|high> evidence=<PATH:LINE>
```

Findings need:

- affected path and line;
- source/entrypoint;
- trust boundary;
- closest relevant control;
- sink/failure mode;
- plausible impact;
- validation evidence;
- remediation guidance;
- residual uncertainty.

## Planned Deliverables

```text
_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/
  00_master-plan.md
  01_repo-truth-inventory.md
  02_navigation-architecture-audit.md
  03_code-wiring-quality-audit.md
  04_automation-runtime-audit.md
  05_security-threat-model.md
  06_security-findings.md
  07_agentic-ai-rag-memory-audit.md
  08_build-test-dependency-audit.md
  09_yuri-proof-retrospective.md
  10_exhaustive-coverage-ledger.md
  11_yuri-process-log.md
  final_c2moviez-vault-audit.md
```

## Phase Gates

Gate 0: Scope and ethics.

- Marcel approves the plan and confirms read-only target and live-service handling.
- C-137 confirms no target repo mutation, no live-service mutation, and no unplanned production probing.
- Research baseline accepted: ASVS/WSTG, OWASP API, NIST SSDF/CSF, OWASP GenAI/Agentic AI, MCP security, Supabase provider guidance, GitHub secret/security guidance, OpenSSF/SLSA, and provider-specific docs are the control backbone.
- Any live-service scan packet lists exact target, method, credential class, expected non-mutating behavior, rate, and rollback/stop condition before execution.

Gate 1: Repo truth inventory.

- Exact commit recorded.
- Tree and manifests inventoried.
- Target protected, private, secured, and untracked material handled under Marcel's read authorization when available, with secret values redacted from durable reports.
- YURI protected runtime and secret paths remain off limits.

Gate 2: Threat model and wiring map.

- Data flows and trust boundaries mapped.
- Critical code wiring and entrypoint-to-sink paths mapped.
- High-risk audit shards selected.
- Credential/password exposure surface mapped without using any discovered credential.

Gate 3: Exhaustive fanout coverage.

- Fanout Ricks must directly inspect the repo themselves. Quantum and Prime direct scans are not sufficient proof for the full audit.
- Fanout work must be incremental and surgical. Each Rick receives bounded batches and must close each batch before moving to the next.
- Broad grep, tree listings, and global sink counts may seed a queue, but they never close coverage by themselves.
- The audit must produce `10_exhaustive-coverage-ledger.md` before final findings are considered complete.
- Every tracked target path must be classified: code, docs, config, data, generated, binary/media, dependency artifact, or blocked/local-state.
- Every text-bearing file must be assigned to a lane and inspected at line/word level. Shallow greps, tree listings, and packet summaries do not close coverage by themselves.
- Every code-bearing file must be read for wiring, security controls, data flow, side effects, and hidden credentials, even if no finding emerges.
- Every docs/markdown/agent/spec file must be read for claims, false assurance, secrets, operational instructions, stale architecture, and navigation risk.
- Large/generated/binary files may be handled by metadata, hashes, dimensions, text extraction, or OCR triage, but they must be marked `covered`, `partial`, or `deferred` with a reason.
- Each lane must return a `FILE_COVERAGE` ledger for its shard, including path, method, line count, word count where available, status, and notable suppressions.
- C-137 must spot-check lane coverage against `git ls-tree -r HEAD` and reject fanout output that only samples hotspots.
- No final report may imply full-repo confidence until all paths are covered, partially covered with rationale, or explicitly deferred.

Gate 4: Static discovery.

- Findings are candidates only.
- No reportable finding without exact code evidence.
- Secret candidates are redacted/fingerprinted only and tagged `CONFIRMED_EXPOSED`, `PLACEHOLDER`, `SECRET_REFERENCE_ONLY`, `WEAK_STORAGE_PATTERN`, or `NEEDS_C137_VERIFICATION`.

Gate 5: Validation.

- Each candidate gets proven, suppressed, or deferred.
- False positives stay in the ledger with reasons.
- Credential validation uses repository evidence, entropy/context, provider format, and storage location only. It must not authenticate with, test, or replay the credential.

Gate 6: Final report.

- Executive summary and technical findings split.
- Strengths and weaknesses both covered.
- Unknowns and deferred areas named.
- Every serious finding maps to repository evidence plus an external control/provider baseline or explicitly explains why no external baseline applies.

Gate 7: YURI proof retrospective.

- Evaluate YURI's process, lane value, gaps, and next improvements.

## Immediate Next Step

Current status: Quantum Rick completed a direct-repo planning critique. Rick Prime was loaded through the persistent tmux/Claude lane using the Sonnet profile-load step, switched to Opus, and performed a direct read-only inspection of the target repo. Prime completed the first credential/password sprint. C-137 verified the first confirmed exposed secret/private-key rows in `01_repo-truth-inventory.md` without using or printing raw values. C-137 then performed an online research pass on primary security/provider sources and supercharged this master plan with standards-backed gates, sprint closure criteria, live-service procedure templates, and continuous hidden-credential handling.

Completed Prime packet requirements:

- this updated master plan;
- target commit and temporary read-only clone path;
- strict no-mutation rule;
- direct-inspection requirement;
- cybersecurity lens weight override;
- code and wiring quality scope;
- request for attack-path pressure, threat model upgrades, priority shard ordering, and false-positive suppression;
- output schema requiring `DIRECT_REPO_EVIDENCE`, `C137_SUPPLIED_CONTEXT`, and `advisory_from_packet` separation.

Current next step: prepare Run 016 for shared helper plus production side-effect dependencies, while preserving the active lane cap of `1` and reusing one continuous worker session with `/clear` between bounded runs.

## Worker Direct-Inspection Correction

Marcel clarified after the first Quantum planning packet that Rick lanes must directly inspect Claudio's repository themselves. C-137-provided packets are orientation, not a substitute for first-hand read-only evidence.

Updated lane rule:

- Every planning, scout, security, architecture, and Prime lane must perform a bounded direct read-only inspection of the target repository before returning claims.
- Acceptable direct inspection includes `git ls-tree`, `git show`, `git grep`, manifest reads, and bounded source-file reads against a temporary clone or exact target path.
- Workers must use the existing full materialized tracked clone at `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo` unless C-137 explicitly freezes a later clone path.
- Workers must not mutate the target repo, run target code, install dependencies, start services, probe live endpoints, write into Claudio's checkout, or disclose raw secrets.
- Worker outputs must distinguish `DIRECT_REPO_EVIDENCE` from `C137_SUPPLIED_CONTEXT`.
- Any claim derived only from C-137's packet must be marked `advisory_from_packet`, not repo truth.

## Exhaustive Fanout Coverage Gate

Marcel's correction: it is not enough that Quantum Rick and Prime Rick directly inspected the target repo. The full Rick fanout must inspect the repository themselves, and the audit must not be shallow.

Operational rule:

- Every Rick lane receives an explicit file shard and must inspect its shard directly from target commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb` or a later explicitly frozen audit commit.
- Every text-bearing file in scope must be line-read or parser-read by at least one lane, then spot-checked by C-137.
- Every line of code must be considered for entrypoints, controls, sinks, errors, side effects, auth, data flow, secrets, logging, resource usage, and dead/unreachable wiring.
- Every word in docs, markdown, agent specs, scripts comments, config labels, and operational notes must be considered for architecture claims, commands, credentials, stale truth, hidden instructions, provider references, and false assurance.
- Generated files, binaries, images, PDFs, fonts, and large assets cannot silently disappear from scope. They must receive metadata classification and, when likely to contain text/secrets/architecture, text extraction or OCR triage.
- No lane can close a shard with only `rg` hits, tree counts, or summaries from another lane. Search is an index into reading, not a substitute for reading.
- Each lane output must include `FILE_COVERAGE` rows and a short `UNREAD_OR_DEFERRED` list. Empty `UNREAD_OR_DEFERRED` means the lane claims full direct coverage for its shard.
- C-137 arbitrates duplicates, verifies high-risk claims, checks that the union of lane shards equals the tracked tree, and records all deferred paths.

Coverage statuses:

```text
pending: assigned to a lane but not semantically inspected yet; useful for shard manifests, not gate closure.
covered: text/file content directly inspected for audit-relevant meaning.
partial: file inspected but not fully closed due size, encoding, generated noise, binary embedding, or timebox; reason required.
binary_metadata_only: non-text artifact classified by path, type, hash/size, and risk; extraction not attempted yet.
ocr_needed: image/PDF/binary may contain text/secrets/architecture and needs extraction before closure.
deferred: blocked by unavailable local state, protected source not mounted, live-service procedure, credentials, or explicit timebox.
```

Coverage priority:

1. All executable code and scripts.
2. All config, manifests, plists, package/lock files, SQL, env templates, MCP/agent/tool specs.
3. All markdown/docs/Obsidian notes that make architecture, operational, credential, client, or provider claims.
4. Generated HTML/client bundles and exported docs that can expose secrets or stale operational truth.
5. PDFs/images/screenshots/other media where names or context suggest credentials, invoices/client data, diagrams, dashboards, or architecture.

## Prime Direct-Inspection Addendum

Prime's direct pass increased the cyber weighting materially. The master plan is updated accordingly:

- code and service wiring is now a primary security audit surface, not a cosmetic maintainability review;
- Telegram-to-Claude/tmux control is now a first-order attack-path and availability shard;
- internal service authentication consistency is now a first-order auth shard;
- agent/MCP/vault write authority is now a first-order excessive-agency shard;
- false assurance from docs, dashboards, health checks, and agent specs is now treated as an operator-security risk.

Prime output remains advisory until C-137 verifies exact repository evidence. Use this status taxonomy in every follow-up report:

```text
C137_VERIFIED: exact target file/line checked by Codex/main.
PRIME_DIRECT_EVIDENCE_NEEDS_C137_VERIFICATION: Prime directly inspected but C-137 has not yet rechecked.
BLOCKED_LOCAL_STATE: requires Claudio's local checkout, runtime files, .mcp.json, secrets vault, process list, or untracked files.
SUPPRESSED: plausible concern rejected by exact repo evidence, with reason recorded.
```

### C-137 Verified Priority Attack Paths

1. Legacy internal auth downgrade and inconsistent internal auth.
   - `Dashboard-v2/functions/auth-check.js:113-119` accepts the deprecated bare `X-Internal-Key` fallback when HMAC headers are absent.
   - `Dashboard-v2/functions/fanny-ai.js:38-40` performs a raw `provided !== INTERNAL_KEY` comparison and does not use the shared `checkAuth` helper.
   - `Dashboard-v2/functions/plane-webhook.js:60-71`, `Dashboard-v2/functions/outlook-webhook.js:96-105`, and `Dashboard-v2/functions/mcp-server.js:163-169` forward internal calls with `X-Internal-Key`.
   - Audit question: is `INTERNAL_SERVICE_KEY` a single shared root secret whose compromise lets one path impersonate multiple internal services?

2. Telegram to tmux to Claude control injection and authority chain.
   - `Scripts/exeo-daemon.js:5-12` documents the `/tmp/telegram-inbox.jsonl` to `/tmp/nex-ai-msg.txt` to tmux paste-buffer control flow.
   - `Scripts/exeo-daemon.js:543-550` loads a tmux buffer, pastes into the Claude pane, and sends Enter.
   - `Scripts/telegram-mcp/poller.js:572` appends to the inbox and wakes EXEO via tmux.
   - Audit question: are inbound Telegram messages authenticated, normalized, rate-limited, guardrailed before reaching Claude, and scoped away from high-authority tools?

3. Agentic write authority into the vault.
   - `Scripts/nex-rvf/lib/vault-apply.js:37-42` restricts paths by `path.relative` and allowed prefixes.
   - `Scripts/nex-rvf/lib/vault-apply.js:87-90` writes frontmatter through `setFrontmatterField`.
   - Audit question: can symlinks, stale indexes, bad lookup results, or over-broad MCP authority turn an approved edit into a write outside the intended object?

4. Event-to-Telegram HTML injection surface.
   - `Dashboard-v2/functions/event-dispatch.js:107-124` sends Telegram messages with `parse_mode: 'HTML'`.
   - `Dashboard-v2/functions/event-dispatch.js:129-168` interpolates event fields into HTML strings, including link attributes, without an observed escaping layer in that block.
   - Audit question: can attacker-controlled Plane, webhook, meeting, client, or ticket fields alter Telegram rendering or links sent to privileged users?

5. Runtime/indexing denial-of-service and resource exhaustion.
   - `Scripts/nex-rvf/lib/walker.js:33-46` recursively walks vault directories for `.md` files.
   - `Scripts/nex-rvf/lib/walker.js:75-88` reads each markdown file into memory with no size cap observed in that range.
   - `Scripts/exeo-daemon.js:130-132` shells out to Python voice transcription with interpolated `audioPath` and `WHISPER_MODEL`.
   - Audit question: which loops, backfills, local models, voice paths, and watchdog/self-healer jobs can multiply CPU/RAM usage or restart each other under failure?

### Code Wiring Map Requirements

Every code/wiring lane must produce a map with these columns:

```text
ENTRYPOINT | AUTH_CONTROL | INTERNAL_CALL | TRUST_BOUNDARY | SINK | OBSERVABILITY | FAILURE_MODE | STATUS
```

Required maps:

- all 83 `Dashboard-v2/functions/*.js` files, grouped by unauthenticated, `checkAuth`, webhook-HMAC, legacy `X-Internal-Key`, and raw/custom auth;
- Telegram poller/server/daemon/tmux/Claude/MCP/vault chain from inbound message to final side effect;
- MCP tool list, each tool's inputs, auth gate, downstream call, data/write sink, and audit log;
- agent specs versus actual available tools/session configuration, with `.mcp.json` or live-session config marked `BLOCKED_LOCAL_STATE` if unavailable;
- Supabase key/RLS map: anon key, service role, SECURITY DEFINER functions, table grants, and every write surface;
- LaunchAgent/runtime map: schedules, locks, PID files, retries, backoff, logs, and overlap risks;
- RAG/RVF map: vault walker, embedder fallback, index freshness, local model resource bounds, and write-back authority.

### Prime Fanout Order

The next fanout should prioritize risk rather than folder order:

1. Auth and internal-service trust boundary sweep.
2. Telegram to tmux to Claude control-chain sweep.
3. MCP and agent authority sweep.
4. Vault/RAG/RVF write and indexing sweep.
5. Runtime availability sweep: LaunchAgents, watchdogs, loops, local models, memory caps.
6. Supabase/RLS/data privacy sweep.
7. Dependency/build/supply-chain sweep.
8. Navigation/docs false-assurance sweep.

### False-Positive Guards

- Do not report a vulnerability only because a risky sink exists; prove an entrypoint, trust boundary, closest control, and plausible impact.
- Do not treat markdown agent specs as proof of actual runtime tool grants.
- Do not treat `CLAUDE.md` or dashboard copy as proof of production behavior.
- Do not rate Telegram injection as high until message origin, allowed-user checks, guardrail placement, and downstream tool authority are mapped.
- Do not rate path traversal as high until symlink/local filesystem state or lookup poisoning is validated; keep it as a candidate where only tracked code is available.
- Do not treat CPU/RAM symptoms as caused by a script until loop schedule, process ownership, memory bounds, and restart behavior are tied to evidence.
- Do preserve verified strengths: auth hardening, RLS lockdowns, guardrail design, rate limiting, audit logs, and locks are part of the audit truth when they survive verification.

### 2026-05-27 C-137 RVF/Vault/Indexing Plan Update

Artifact `103_c137-vault-rvf-indexing-results.md` is accepted as the direct C-137 replacement for the RVF/vault/indexing/runtime shard.

Plan consequences:

- Promote `audit_log` command-bus verification to the top remaining live-validation gate. The tracked repo shows anon audit-log policies plus a local queue consumer that treats audit-log rows as commands.
- Treat queue-consumer path containment as a concrete code-remediation candidate, with `vault-apply.js` as the internal safe-path pattern to reuse.
- Add route dialect verification to every future wiring lane. `/api/functions/*` callers must be reconciled against tracked `/.netlify/functions/*` server and Caddy routes.
- Add runtime budget mapping before making further claims about CPU/RAM root cause. The source supports a strong overlap hypothesis, but live LaunchAgent/process data remains `BLOCKED_LOCAL_STATE`.
- Add generated model/training artifacts to the repository hygiene lane. `local-models/train-data/` and adapter outputs are not ignored by the tracked `.gitignore`.
- Preserve a specific navigationability finding: the repo's operator-facing truth surfaces disagree on RAG engine defaults and system maturity.

### 2026-05-27 C-137 Route/Navigation Plan Update

Artifact `104_c137-route-navigation-wiring-results.md` is accepted as the direct C-137 route/navigation wiring shard.

Plan consequences:

- Treat route coherence as a core audit axis, not a minor cleanup item.
- Add a mandatory route manifest to the final remediation plan: every UI/script caller, public path, physical function file, server route, Caddy route, and deploy location must resolve to one canonical endpoint.
- Mark the tracked PM2 API backend as non-reproducible from GitHub until `server/index.js`, adapter naming, and the `Dashboard-v2/functions` versus `Dashboard-v2/netlify/functions` split are reconciled.
- Keep `/api/functions/*` versus `/.netlify/functions/*` as a high-weight navigationability failure because it can make working UI code, docs, and backend files disagree simultaneously.

### 2026-05-27 C-137 Function Auth Plan Update

Artifact `105_c137-function-auth-surface-results.md` is accepted as the direct C-137 function-auth shard.

Plan consequences:

- Add `AUTH_CLASS` to the route manifest: public, user-auth, internal-HMAC, webhook-HMAC, Telegram-secret, scheduled-internal, retired, or broken.
- Require in-handler auth for scheduled functions. Loopback Caddy/PM2 protection is defense-in-depth, not the only guard.
- Treat SSO/custom-cookie auth drift as a core stability defect. The frontend expects Supabase GoTrue Bearer to mint `exeo_token`, but `auth.js?action=verify` only reads the existing cookie.
- Prioritize unauthenticated high-side-effect handlers for remediation design: `offer-create`, `whisper-transcribe`, `outlook-subscribe`, `telegram-team`, and scheduled side-effect handlers.
- Keep legacy bare `X-Internal-Key` migration as a high-priority security cleanup item.

### 2026-05-27 C-137 Supabase/RLS Command-Bus Plan Update

Artifact `106_c137-supabase-rls-command-bus-results.md` is accepted as the direct C-137 Supabase/RLS command-bus shard.

Plan consequences:

- Treat `audit_log` as an executable queue wherever local consumers subscribe to it. Do not classify it as harmless telemetry unless the command-bus path is removed or cryptographically gated.
- Add a final effective-policy manifest to the remediation plan. Migration comments are not enough; the repo must prove final anon/auth/service-role grants for tables, views, storage buckets, and RPCs.
- Promote meeting storage privacy to a first-order data risk. The tracked bucket is public and anon-insertable, while the UI stores full meeting audio there.
- Flag webhook rate limiting as "control present but likely inert" where handlers call service-role-only RPCs using the anon key and fail open.
- Mark the live Supabase schema as non-reproducible from GitHub until `entity_state`, `audit_log`, and `upsert_entity_state` are tracked in an authoritative baseline.

### 2026-05-27 C-137 Telegram/Tmux/Claude Control-Chain Plan Update

Artifact `107_c137-telegram-tmux-control-chain-results.md` is accepted as the direct C-137 Telegram/tmux/Claude control-chain shard.

Plan consequences:

- Treat Telegram ingress as a high-trust command boundary. The audit must not classify Telegram as "just messaging" when it can wake Claude, drive MCP tools, create meeting artifacts, and trigger local analysis.
- Add sender authorization before any Telegram poller file write, media download, meeting command handling, or AI wake. The repo currently gates some downstream behavior but not the first write into the control bus.
- Promote tool-profile separation to a first-order remediation: CEO-admin, internal-scheduled, and external-contact turns must not share the same Claude tool authority.
- Move outbound guardrails into the Telegram MCP server itself. Fallback sends are guarded, but the main `mcp__telegram__*` send path is not.
- Replace `/tmp/telegram-inbox.jsonl` with a signed or private queue design, and split internal `SYSTEM` jobs from external Telegram messages.
- Require receiver-mode ownership in docs and health checks. Long-poll startup clears Telegram webhooks, so webhook and polling paths cannot both be treated as live.
- Mark the tracked LaunchAgent story as non-reproducible until `telegram-poller`, `exeo-daemon`, and `exeo-wake` have source-tracked plists or an explicit live-state export.

### 2026-05-27 C-137 Dashboard Navigationability Plan Update

Artifact `108_c137-dashboard-navigationability-results.md` is accepted as the direct C-137 dashboard navigationability and feature-wiring shard.

Plan consequences:

- Add a generated app-route manifest to the final remediation plan. Every sidebar/mobile/command-palette link must resolve to a tracked page route or an explicit redirect.
- Add endpoint manifest enforcement. Every `/api/functions/*` caller must resolve to a tracked function file, a tracked server route, an auth class, and a deployment owner.
- Treat File Vault, NEXOGRAM, NEXdoc, CRM, Focus, Meetings, Expenses, Admin System, and onboarding as feature families requiring backend truth closure, not individual missing-endpoint anecdotes.
- Mark `/finance` and `/crm` as dead internal links until backed by routes or redirects.
- Treat Health/SLA monitoring as false-assurance-prone until the `Supabase realtime` matcher stops accepting any audit row as proof of realtime health.
- Make command palette and mobile quick actions manifest-driven; remove no-op actions or wire them to the same quick-action store used by the desktop modal.

### 2026-05-27 C-137 CHRONEX Tracker Wiring Plan Update

Artifact `109_c137-chronex-tracker-wiring-results.md` is accepted as the direct C-137 CHRONEX/tracker wiring and data-authority shard.

Plan consequences:

- Treat tracked Supabase schema/RPC absence as a Critical repo-truth blocker for CHRONEX. The code delegates the real authority to live SQL that GitHub does not contain.
- Add schema/RPC manifest enforcement to the final remediation plan. Every `supabase().from(...)`, service-role REST table access, and `/rpc/...` call must map to a tracked migration.
- Add the tracker function family to route-manifest enforcement. `/api/functions/tracker-*` calls must resolve through the declared deployment router, not only physical function files.
- Promote `tasks-crud` and `client_tasks` to a concrete missing-backend workflow finding.
- Collapse the split schedule authority model. `schedule-plan-ticket` and `tracker-block` must not mutate the same schedule domain through different auth/key models.
- Add in-handler schedule/auth guards to side-effectful tracker sync jobs before accepting Netlify schedule metadata as a sufficient boundary.
- Add a data-integrity remediation for Plane pull fallback attribution. Unmapped worklogs should become sync conflicts, not CEO-owned billable entries.
- Add frontend lifecycle QA for CHRONEX. The tracker idle interval/listener cleanup bug is a plausible low-grade CPU/noise contributor and should be fixed even if it is not the whole RAM spike.
- Treat direct browser reads of team capacity, absences, billing rates, and Telegram profile metadata as deployment-dependent until final RLS is source-tracked and tested.

### 2026-05-27 C-137 CRM/Revenue/Business Automation Plan Update

Artifact `110_c137-crm-revenue-business-automation-results.md` is accepted as the direct C-137 CRM/revenue/business-workflow shard.

Plan consequences:

- Add a business-truth model to the final remediation plan. `customer_master`, `customer_master_safe`, `customer_activities`, `entity_state`, vault frontmatter, Plane, and Bexio must be classified as canonical, projection, cache, queue, or retired.
- Require tracked migrations for CRM, offer, expense, and Bexio projection tables/views before accepting the business layer as reconstructable.
- Treat the new CRM board as blocked until the missing `crm-*` handler family is source-tracked or the UI controls are hidden.
- Replace console-only "queued" stubs with durable queue writes or hard `501` responses. User-facing "queued" must mean "recoverable from storage."
- Harden `offer-create` to match the signed `offer-accept` pattern before treating it as safe for public deployment.
- Add explicit workflow states for offer generation so Bexio partial failure cannot look like a completed generated offer.
- Downgrade "Bexio live" claims to snapshot language unless the LaunchAgent/scheduler and snapshot freshness are source-tracked or exported.
- Treat AP/expenses as an unwired feature family until handlers and schema are tracked.
- Route all vault queue target paths through a shared safe-path helper before insertion into `audit_log`.

### 2026-05-27 C-137 Runtime/Scheduler/Resource-Pressure Plan Update

Artifact `111_c137-runtime-scheduler-resource-pressure-results.md` is accepted as the direct C-137 runtime/scheduler/resource-pressure shard.

Plan consequences:

- Add a runtime manifest to the final remediation plan. Every LaunchAgent, PM2 process, tmux lane, local port, scheduler, heartbeat name, log path, expected cadence, restart policy, host, and memory budget must be source-tracked or explicitly marked local-only.
- Treat CPU/RAM instability as a first-order audit axis. The source supports a plausible overlap model: local model residency, Whisper transcription, Claude crash-loop respawn, Telegram/team bot long polling, self-healing, registry scanning, embed refresh, and PM2 cron can all run on the same machine.
- Replace the local-model "cap at 8 GB" comment with an actual enforced budget, watchdog, or documented macOS operating limit. The tracked plist only limits open files, and the local model launcher disables the MPS hard watermark.
- Add crash-loop protection to `Scripts/ai`. Three-second infinite respawn with broad bypass tool authority is both a resource/cost risk and a security boundary.
- Move Telegram media handling behind a bounded worker queue. The receiver loop should authorize first, then enqueue; it should not download, transcode, run Whisper, write artifacts, and wake EXEO inline.
- Generate PM2 cron entries and internal routes from one manifest. `decision-outcome` is scheduled by PM2 but not exposed by the tracked internal route table.
- Resolve scheduler dialect drift. Tracker sync functions carry Netlify schedule metadata, but the repo has no tracked `netlify.toml`, and PM2 does not schedule those tracker functions.
- Make the self-healer source-truth-aware: restart only installed labels that match the tracked runtime manifest; classify missing labels as registry/install errors rather than ordinary red/yellow liveness.
- Reuse the shared Plane pagination helper in team bots so duplicated integration logic does not create stale/duplicated task views.

### 2026-05-27 C-137 Build/Dependency/Supply-Chain Plan Update

Artifact `112_c137-build-dependency-supply-chain-results.md` is accepted as the direct C-137 build/dependency/supply-chain shard.

Plan consequences:

- Treat deterministic rebuild as a Critical gate. `Dashboard-v2` currently fails `npm ci --dry-run --ignore-scripts --no-audit --no-fund` because `express` is declared in `package.json` but absent from the lockfile.
- Replace deployment-time `npm install` with `npm ci` after lockfiles are repaired. Production must not resolve dependency versions that were not reviewed in Git.
- Collapse the deployment path dialects. `Dashboard-v2/functions`, `Dashboard-v2/netlify/functions`, `production-server.js`, `server/index.js`, `server/deploy.sh`, PM2 docs, and CLAUDE docs must all point to one physical function directory.
- Add a single Node runtime manifest. Dashboard/RVF package manifests require Node 20-plus, while many LaunchAgents and wrappers hard-code Node 18.20.8.
- Add package advisory triage as a security deliverable. Current npm audit shows vulnerabilities in dashboard, RVF, finance MCP, Telegram MCP, team bots, and scripts; each needs a reachable/not-reachable disposition.
- Give RVF a stricter supply-chain policy than ordinary UI packages because it is a privileged MCP/RAG server. Alpha AI packages, install scripts, transitive Claude/Google AI SDKs, native modules, and telemetry dependencies need explicit review.
- Lock Python local-model dependencies and Hugging Face model revisions. Lower-bound-only Python requirements and floating model downloads are not acceptable for a repo-truth control plane.
- Mark client design packages without lockfiles as archived/non-runtime or add lockfiles before an LLM can safely treat them as buildable projects.
- Fix `.gitignore` so it does not say `Scripts/nex-rvf/package-lock.json` is ignored while the file remains tracked and operationally important.

### 2026-05-27 C-137 Auth/Session/Realtime/Client-Trust Plan Update

Artifact `113_c137-auth-session-realtime-client-trust-results.md` is accepted as the direct C-137 auth/session/realtime/client-trust shard.

Plan consequences:

- Treat realtime security as a Critical audit pillar, not an implementation detail. Soketi/Pusher sits outside Supabase RLS and must have its own credential, channel-auth, payload-minimization, and rotation plan.
- Rotate the tracked Soketi signing secret and move all signing material out of source. The report records the file/line but does not copy the secret value.
- Replace public sensitive realtime channels with private/presence channels and a server-side authorization endpoint. `audit_log`, `customer_master`, `time_entries`, `team_capacity`, `absences`, `user_profiles`, reasoning streams, schedule blocks, and NEXOGRAM cannot remain public-channel assumptions.
- Fix the Supabase SSO to `exeo_token` bridge. The frontend says Bearer `verify` mints or refreshes the cookie, but `auth.js` verify only reads an existing cookie and `auth-check.js` verifies Bearer tokens as custom `AUTH_SECRET` tokens, not Supabase JWTs.
- Mark client-side route gates as UX only. SSR is disabled, layout auth runs in `onMount`, and local cached auth hints do not secure data. Security must live in RLS, functions, edge token validation, and realtime channel auth.
- Add a browser data-access manifest. Every browser `supabase().from(...)`, `supabase().rpc(...)`, and realtime subscription must map to tracked RLS/RPC/channel-policy tests.
- Replace cookie-name-only edge guards with real token verification before treating static sensitive pages as protected.
- Remove credential-prefix logging from Telegram/team bots and include log redaction rules in the runtime manifest.

### 2026-05-27 C-137 LLM Navigation/Repo-Truth Plan Update

Artifact `114_c137-llm-navigation-repo-truth-results.md` is accepted as the direct C-137 LLM navigation/repo-truth shard.

Plan consequences:

- Treat LLM navigationability as a core audit output, not a documentation appendix. Claudio's repo currently gives an AI enough stale authority to hallucinate working systems.
- Build a generated repo-truth manifest that validates authoritative docs against actual paths, routes, functions, schemas, packages, schedulers, MCP servers, agents, and deployment process names.
- Split `CLAUDE.md` into source-tracked truth, live-state export, and roadmap/aspiration. Missing paths such as `core/`, `nexbox/`, `tenants/`, brain index files, `.mcp.json`, and old Netlify paths must not live in the same authority layer as current repo truth.
- Collapse deployment truth into one generated document from `Caddyfile.template`, `ecosystem.config.js`, deploy script, function directory, and server route table. Remove stale `ops-dashboard`/port-3000 and old VPS/process assumptions from agents.
- Add a redacted `.mcp.example.json` plus MCP health export so "verified with NEX-RAG/Supabase/Plane/Telegram" can be proven per session.
- Replace the single event-bus story with a write-path manifest. The repo now has direct browser writes, function writes, audit-log command bus, entity-state projections, and Soketi realtime.
- Validate `.claude/agents/*.md` frontmatter and operational assumptions against real route/deploy/model/tool registries before using those agents as authorities.
- Require a root onboarding artifact for AI operators: package map, active/retired status, build/test commands, protected paths, live dependencies, and blocked-live-state boundaries.

### 2026-05-27 C-137 Secret Exposure/Credential Hygiene Plan Update

Artifact `115_c137-secret-exposure-credential-hygiene-results.md` is accepted as the direct C-137 credential-hygiene shard.

Plan consequences:

- Treat credential rotation as a P0 remediation. Current HEAD contains hardcoded credential values in `Scripts/ai`, `Scripts/mcp-wrappers-backup/supabase-mcp.sh`, and `Scripts/soketi-bridge.js`.
- Do not wait for proof that tokens are live. Any key, bot token, PAT, or signing secret committed to Git must be assumed compromised.
- Build a provider rotation checklist: Telegram bot token, internal API key, Supabase MCP/PAT token, Soketi signing secret, and any related environment variables or Keychain entries.
- Add a secret scanner before every commit and before every AI context packet/report export.
- Remove backup wrappers containing secret material or convert them to redacted templates.
- Replace all hardcoded exports with Keychain/env/secret-store lookups through one shared wrapper.
- Reduce runtime token exposure by avoiding command-string interpolation for Claude OATs and other high-value tokens.
- Add a credential-hygiene section to the final master audit with redacted evidence only and a strict "no credential validation/use" boundary.

### 2026-05-27 C-137 Schema/Data-Contract Plan Update

Artifact `116_c137-schema-data-contract-results.md` is accepted as the direct C-137 schema/data-contract shard.

Plan consequences:

- Treat database contract completeness as a Critical final-audit gate. The code references 85 table/view/storage names and 27 RPCs, while tracked SQL defines only a subset.
- Generate a schema coverage manifest from source and require every table/view/storage/RPC reference to map to tracked SQL or an explicit live-only/deferred reason.
- Export live Supabase schema/RLS/RPC/storage state into a read-only snapshot if Claudio wants this audit to cover the true production backend.
- Block acceptance of CRM, revenue, offers, expenses, tracker, HR, NEX telemetry, and permission workflows until their schemas and RPCs are tracked.
- Add RLS and storage policy tests for anon/authenticated/service-role behavior. Migration comments and historical fragments are not enough.
- Treat broad anon policies for `scheduled_blocks`, `meetings`, and the public `meetings` storage bucket as high-priority privacy issues unless later effective-policy tests prove they are closed.
- Bring `user_module_permissions`, `set_user_permission`, and `reset_user_permission` into tracked migrations before relying on the admin permission UI.
- Add storage-bucket manifests for `meetings`, `avatars`, and any future media buckets.

### 2026-05-27 C-137 AI Control-Plane/Prompt-Injection Plan Update

Artifact `117_c137-ai-control-plane-prompt-injection-results.md` is accepted as the direct C-137 AI control-plane/prompt-injection shard.

Plan consequences:

- Treat prompt injection as a Critical final-audit pillar. Telegram and NEXOGRAM content currently enters privileged Claude sessions as raw prompt text, not as isolated untrusted data.
- Move authorization to the earliest possible ingress point. Telegram sender/chat authorization must happen before media download, transcription, meeting commands, inbox append, or tmux wake.
- Move guardrails to the authoritative egress sinks. The Telegram MCP server and NEXOGRAM send boundary must enforce role, recipient, language, secret, retrieval-confidence, and email-hold policies, not only fallback helpers.
- Restrict Telegram MCP `chat_id` authority. Explicit targets must be rejected unless they map to a known role and allowed content class.
- Replace `/tmp/telegram-inbox.jsonl` as a trust boundary with a private, authenticated, single-consumer queue or broker. Multiple readers must not be able to clear or forge control-plane messages.
- Split the AI control plane into intake, planner, and executor lanes. Chat-facing lanes should not run with permission bypass, shell access, or broad database/filesystem tools.
- Replace text-scraped tool-call detection with structured tool telemetry from MCP servers and Telegram API response IDs.
- Treat assistant-emitted `<COMMITMENT>` tags and similar machine tags as proposed actions until confirmed by explicit user intent.
- Move LoRA/training capture out of shared `/tmp` and add redaction, retention, and opt-out controls.

### 2026-05-27 C-137 Function Route Contract Plan Update

Artifact `118_c137-function-route-contract-results.md` is accepted as the direct C-137 function route-contract shard.

Plan consequences:

- Treat API route coherence as a Critical final-audit gate. The frontend, function files, Caddy, Express server, production server, and deploy script currently do not form one reconstructable route contract.
- Resolve the `/api/functions/*` versus `/.netlify/functions/*` split. Browser call sites and production routing must share one tracked prefix or a generated rewrite/proxy.
- Resolve the physical function directory split. The repo tracks `Dashboard-v2/functions`, while production servers and deploy scripts point to `Dashboard-v2/netlify/functions`.
- Generate the public API route table from the function directory and explicit metadata. Hand-maintained Express route lists are already stale against frontend call sites.
- Add a route-contract CI check: every frontend function reference must map to a tracked handler and a production route; every routed handler must map to a tracked file; every missing or live-only endpoint must be explicitly classified.
- Mark UI families that depend on missing handlers as not repo-reconstructable: AI monitor metrics, CRM inline edit/send/promote, expenses, focus, meetings, NEXDOC, NEX files, NEXOGRAM, pitch SSO, request access, tasks CRUD, member admin, and several tracker operations.
- Retire or archive the old all-in-one `production-server.js`/`ops-dashboard` model if the active runtime is `nex-api` plus `nex-frontend`.
- Replace HTTP function-to-function calls with shared helpers or manifest-backed internal routes so downstream failures cannot disappear into silent fallbacks.

### 2026-05-27 C-137 Function Auth Boundary Plan Update

Artifact `119_c137-function-auth-boundary-results.md` is accepted as the direct C-137 function auth-boundary shard.

Plan consequences:

- Treat function auth as a manifest problem, not a per-file convention. Every handler needs a declared auth class, required permission, side effects, provider secret type, and route exposure.
- Remove legacy bare `X-Internal-Key` support from shared auth and internal callers. HMAC-signed internal calls must be the only internal bypass.
- Rotate internal service keys because source exposure plus legacy bare-key acceptance creates an avoidable replay path.
- Extend `checkAuth` into a permission-aware gate or pair it with a mandatory `requirePermission` helper. Authentication alone is insufficient for admin, finance, dispatch, health, control-plane, and team-management endpoints.
- Track every service-role RPC authorization boundary in SQL migrations and tests. Handler comments that say "RPC checks permissions" are not proof unless the RPC body is source-tracked.
- Add in-handler HMAC/internal checks to every scheduled side-effect function. Route isolation should remain defense in depth, not the only auth boundary.
- Make token/cost telemetry authenticated on GET and scoped to ops/admin roles.
- Fail closed on missing Telegram webhook secret tokens and remove query-param member-key authentication from team Telegram webhooks.
- Add CI/static analysis that rejects handler files with service-role writes and no declared auth/permission class.

### 2026-05-27 C-137 UI Navigation Contract Plan Update

Artifact `120_c137-ui-navigation-contract-results.md` is accepted as the direct C-137 UI navigation-contract shard.

Plan consequences:

- Treat UI navigationability as a first-class audit axis. Route truth must be generated, not inferred from scattered labels and hardcoded links.
- Fix dead active links immediately: `/finance` needs a tracked route/alias or all links must move to canonical finance surfaces; `/crm` needs an alias to `/pipeline/customers` or the welcome link must be corrected.
- Create a route/module manifest with route id, path, label, aliases, status, auth class, feature family, owner, and nav surfaces.
- Generate sidebar, mobile nav, command palette, module cards, welcome cards, and admin module links from the same manifest.
- Archive or remove unused navigation components such as stale `TopNav` and `CommandBar`, or make them manifest-driven before keeping them as active context for LLM operators.
- Expand command-palette coverage to include active major modules: NEXOGRAM, CHRONEX/tracker, CRM, NEXdoc, files, expenses, AI monitor, RailGuard, deploy log, and admin.
- Add route alias truth for domain names: Finance, CRM, CHRONEX, NEXdoc, NEXOGRAM, RailGuard, System, Deploy Log, and any legacy route names.
- Classify hidden/special routes such as `/components`, `/planner`, `/pitch`, `/auth/callback`, and `/welcome` so LLMs know whether they are primary, alias, auth-only, dev-only, public, or retired.
