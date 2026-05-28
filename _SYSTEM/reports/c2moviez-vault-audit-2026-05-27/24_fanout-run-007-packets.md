# Fanout Run 007 Packets

Date: 2026-05-27
Purpose: next sandboxed target-repo fanout after accepted Run 006
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Parallel lane cap: `3`
Mode: read-only, no target mutation, no live service calls, no credential use
Worker model: Sonnet was attempted first with maximum-depth repo-grounding instructions. Two lanes refused the orchestrator packet because fresh Sonnet sessions could not see the outer authorization transcript and treated the lane packet as suspicious. Run 007 is therefore escalated back to Opus worker lanes for reliability, while preserving the parallel cap of `3`.

## Launch Rule

Run 007 lanes must be launched as persistent Claude/tmux sessions:

1. Attempt Sonnet worker bootstrap first only when the worker can accept the authorization/context packet without false prompt-injection refusal.
2. If Sonnet refuses or weakens repo-grounding, relaunch the same lane as Opus in a persistent tmux session.
3. Send the assigned Run 007 packet prompt.

All Run 007 lanes must run under the OS sandbox profile that denies protected Claude runtime paths:

- `/Users/marcelspatz/.claude/projects`
- `/Users/marcelspatz/.claude/state`
- `/Users/marcelspatz/.claude/history`
- `/Users/marcelspatz/.claude/file-history`
- YURI-local `.claude/projects`, `.claude/state`, `.claude/history`, `.claude/file-history`

The target repository's tracked `.claude/agents` files are in scope only when explicitly assigned and accessed through the canonical clone with `git -C`. They are not assigned in Run 007.

## Universal Repo-Truth Contract

Allowed commands:

- `git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo rev-parse HEAD`
- `git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo status --short`
- `git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo ls-files -- <assigned-path>`
- `git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo show HEAD:<assigned-path>`
- bounded `git -C ... grep`/`rg` only for caller/import/link checks tied to assigned files
- `wc`, `sed`, `nl`, `head`, `tail` on command output or assigned report artifacts

Forbidden:

- no writes or edits;
- no execution of target scripts;
- no package install/build/test;
- no live service calls;
- no credential use or validation;
- no raw secret printing;
- no runtime `.claude/projects`, `.claude/state`, `.claude/history`, `.claude/file-history`;
- no target `.env`, `backend/data`, `node_modules`, or `.amp`.

Coverage rule:

- Broad tree/list commands can orient a lane but cannot close coverage.
- Every covered target file requires `PATH_PROOF`, `READ_PROOF`, and `FILE_COVERAGE`.
- A file is not covered unless the lane inspects the file content semantically.
- Large files can use full `git show` plus targeted cross-reference commands, but must disclose if any section was only sampled.

Required output rows:

```text
BATCH_OPEN lane=<lane> batch=<batch> scope=<scope>
RUN_PROOF lane=<lane> model=<model> sandbox=os-deny-protected-runtime status=<ok|failed>
REPO_PROOF commit=<sha> clean_status_count=<n> tracked_files=<n>
PATH_PROOF path="<target-path>" command="<command>" status=<exists|missing>
READ_PROOF path="<target-path>" command="<command>" first_line="<summary>" last_line="<summary>"
FILE_COVERAGE path="<target-path>" method=<method> status=<covered|partial|deferred|invalidated> lines=<n|unknown> words=<n|unknown> notes="<short>"
FINDING id=<id> severity=<info|low|medium|high|critical> path="<target-path[:line]>" class=<security|wiring|architecture|llm_nav|stability|cost|positive> evidence="<repo evidence>" impact="<why it matters>" recommendation="<next action>"
SUPPRESSION path="<target-path>" hypothesis="<hypothesis>" counterevidence="<counterevidence>"
DEFERRED path="<target-path>" reason="<reason>" next="<next evidence/action>"
BATCH_CLOSE lane=<lane> batch=<batch> files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=<0|1>
```

## R007_PRIME_TELEGRAM_PLANE_SONNET - TELEGRAM-PLANE-007

Scope: Telegram control surface, callback routing, Plane helper wiring, and provider error hygiene.

Files:

- `Dashboard-v2/functions/telegram.js`
- `Dashboard-v2/functions/shared-telegram.js`
- `Dashboard-v2/functions/shared-plane-client.js`
- `Dashboard-v2/functions/shared-plane.js`

Questions:

- Do Telegram callback handlers cover every callback emitted by tracker/dashboard flows, including `tplan_approve` and `tplan_reject`?
- Are allowed-user, chat-id, and command-origin checks centralized and consistently applied before state mutation or downstream calls?
- Do Telegram and Plane helpers avoid logging tokens, raw provider secrets, or sensitive request/response payloads?
- Are Plane calls bounded with rate limiting, timeout, retry, backoff, and error classification?
- Could Telegram routing or Plane helper behavior explain broken command-center behavior, duplicated actions, or high CPU/RAM?

## R007_SECURITY_AUTH_CONFIG_SONNET - AUTH-CONFIG-007

Scope: dashboard auth boundary, service-role/anon separation, shared config/data helper authority.

Files:

- `Dashboard-v2/functions/auth.js`
- `Dashboard-v2/functions/auth-check.js`
- `Dashboard-v2/functions/shared-config.js`
- `Dashboard-v2/functions/shared-data.js`
- `Dashboard-v2/functions/shared-team-config.js`
- `Dashboard-v2/functions/shared-facts.js`

Questions:

- Are login/session/auth-check flows consistent with tracker endpoint assumptions?
- Are service-role and anon credentials clearly separated, and are fallbacks dangerous?
- Are tenant/user/team authorization rules encoded in shared helpers or left to callers/RPCs?
- Do shared data helpers create a confused-deputy risk when imported by public functions?
- Are error responses and logs safe from raw token/session leakage?

## R007_DAEMON_GUARDRAILS_SONNET - DAEMON-GUARDRAILS-007

Scope: EXEO/NEX daemon control chain, guardrail coverage, mutation authority, and loop/stability risk.

Files:

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

Questions:

- What can the daemon trigger, write, broadcast, or escalate?
- Are guardrails mandatory in the actual control flow or only adjacent helpers?
- Are mutation gates, CEO confirmation gates, or dry-run paths enforced before risky actions?
- Are loops, intervals, retries, heartbeats, and stuck-watch behavior bounded enough to rule out high CPU/RAM causes?
- Are agent registry and decision recording structured enough for LLM navigation and post-incident auditability?
