# Fanout Run 009 Packets

Date: 2026-05-27
Purpose: next sandboxed target-repo fanout after accepted Run 008
Target repo: `https://github.com/c2moviezfpv/c2moviez-vault`
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Target tracked files: `1505`
Parallel lane cap: `3`
Mode: read-only, no target mutation, no target execution, no live service calls, no credential use
Worker model: Opus direct under persistent Claude/tmux sessions. Fresh isolated Sonnet lanes are not accepted for this packet shape until the context/authorization prelude problem is solved.

## Launch Rule

Run 009 lanes must be launched as persistent Claude/tmux sessions:

1. Start each lane as a persistent Opus Claude CLI session.
2. Use the OS sandbox profile that denies protected Claude runtime paths.
3. Send only the scoped packet prompt for the assigned lane.
4. Keep active lanes capped at `3`.

All Run 009 lanes must run under the OS sandbox profile that denies protected Claude runtime paths:

- `/Users/marcelspatz/.claude/projects`
- `/Users/marcelspatz/.claude/state`
- `/Users/marcelspatz/.claude/history`
- `/Users/marcelspatz/.claude/file-history`
- YURI-local `.claude/projects`, `.claude/state`, `.claude/history`, `.claude/file-history`

The target repository's tracked `.claude/agents` files are in scope only when explicitly assigned and accessed through the canonical clone with `git -C`. They are not assigned in Run 009.

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
- no target `.env`, `backend/data`, `node_modules`, or `.amp`;
- no mutation of the canonical clone or Claudio's repository.

Coverage rule:

- Broad tree/list commands can orient a lane but cannot close coverage.
- Every covered target file requires `PATH_PROOF`, `READ_PROOF`, and `FILE_COVERAGE`.
- A file is not covered unless the lane inspects the file content semantically.
- Large/generated/lock files can use bounded parser/header/dependency review, but must disclose `partial` if any section was not semantically inspected.
- `repo_tracked_files`, `assigned_subtree_tracked_files`, and `files_covered` must not be conflated.

Required output rows:

```text
BATCH_OPEN lane=<lane> batch=<batch> scope=<scope>
RUN_PROOF lane=<lane> model=<model> sandbox=os-deny-protected-runtime status=<ok|failed>
REPO_PROOF commit=<sha> clean_status_count=<n> repo_tracked_files=<n>
PATH_PROOF path="<target-path>" command="<command>" status=<exists|missing>
READ_PROOF path="<target-path>" command="<command>" first_line="<summary>" last_line="<summary>"
FILE_COVERAGE path="<target-path>" method=<method> status=<covered|partial|deferred|invalidated> lines=<n|unknown> words=<n|unknown> notes="<short>"
FINDING id=<id> severity=<info|low|medium|high|critical> path="<target-path[:line]>" class=<security|wiring|architecture|llm_nav|stability|cost|positive> evidence="<repo evidence>" impact="<why it matters>" recommendation="<next action>"
SUPPRESSION path="<target-path>" hypothesis="<hypothesis>" counterevidence="<counterevidence>"
DEFERRED path="<target-path>" reason="<reason>" next="<next evidence/action>"
BATCH_CLOSE lane=<lane> batch=<batch> files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=<0|1>
```

## R009_EXEO_TERMINAL_BRIDGE_OPUS - EXEO-BRIDGE-009

Scope: terminal/tmux startup glue, Telegram inbox to Claude daemon bridge, local file-send paths, stuck-daemon detection, and portability/resource risks.

Files:

- `Scripts/exeo-daemon-tmux.sh`
- `Scripts/exeo-terminal.sh`
- `Scripts/exeo-live.sh`
- `Scripts/exeo-cron.sh`
- `Scripts/exeo-autonomous.js`
- `Scripts/daemon-stuck-watch.js`
- `Scripts/mcp-wrappers-backup/telegram-mcp.sh`
- `Scripts/send-file-telegram.sh`

Questions:

- How does a Telegram inbox event become a prompt or command in a persistent Claude/tmux session?
- Which startup scripts define environment variables, PATH, model choice, tmux session names, logs, and working directories?
- Are sender/auth checks present before Claude prompt injection, or are they delegated to earlier/later layers?
- Can file-send, tmux paste, or daemon recovery paths leak secrets, send arbitrary files, or silently fail?
- Are stuck-daemon recovery, cron, and autonomous loops bounded and observable?
- Could this layer explain Claudio's Telegram breakage, high CPU/RAM, or false command-center health?

## R009_RVF_DEFERRED_AUTHORITY_OPUS - RVF-DEFERRED-009

Scope: RVF deferred files and adjacent model/coherence/swarm authority: local model bridge, coherence holds, swarm routing, memory audit, and review/verify/bless controls.

Files:

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

Questions:

- Are local model calls bounded by timeout, concurrency, max tokens, input size, and failure recovery?
- Does coherence-hold enforce a real hold/release decision path, or only advisory text?
- Can swarm routing create excessive agency, unsafe delegation, circular routing, or unaudited tool selection?
- Does `memory-audit.js` safely handle caller-provided paths and output size?
- Do verify/bless/review controls enforce actual decision gates before writes or promotions?
- Could local model serving, memory audit, drift/coherence calibration, or swarm routing plausibly contribute to CPU/RAM spikes?

## R009_DASHBOARD_WRITE_CONTENT_OPUS - DASHBOARD-WRITE-009

Scope: remaining high-authority dashboard functions that create/update content, meetings, tickets, documents, schedules, or local-vault queues.

Files:

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

Questions:

- Which functions are dashboard-authenticated, internal-key-authenticated, webhook/scheduler callable, or unauthenticated?
- Which functions write to Supabase, call external providers, queue local vault writes, or call AI providers?
- Are service-role keys used only in server-side trusted contexts, and are anon fallbacks intentional?
- Are request bodies validated before provider/API writes?
- Are model outputs treated as untrusted before being stored, sent, or queued into operational systems?
- Are errors, generated documents, meeting notes, client fields, or research payloads reflected in ways that leak sensitive data?
- Could any of these functions explain hallucinated command-center status, broken sync, or resource spikes?
