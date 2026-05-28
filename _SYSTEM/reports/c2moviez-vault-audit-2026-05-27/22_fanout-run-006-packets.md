# Fanout Run 006 Packets

Date: 2026-05-27
Purpose: next sandboxed target-repo fanout after Run 003/004 repair
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Parallel lane cap: `3`
Mode: read-only, no target mutation, no live service calls, no credential use

## Launch Rule

Run 006 lanes must be launched as persistent Claude/tmux sessions:

1. Load lane profile on Sonnet.
2. Escalate the same persistent session to Opus.
3. Send the assigned Run 006 packet prompt.

All Run 006 lanes must run under the OS sandbox profile that denies protected Claude runtime paths:

- `/Users/marcelspatz/.claude/projects`
- `/Users/marcelspatz/.claude/state`
- `/Users/marcelspatz/.claude/history`
- `/Users/marcelspatz/.claude/file-history`
- YURI-local `.claude/projects`, `.claude/state`, `.claude/history`, `.claude/file-history`

The target repository's tracked `.claude/agents` files are in scope when accessed through the canonical clone with `git -C`, but runtime `.claude/projects`, `.claude/state`, `.claude/history`, and `.claude/file-history` remain forbidden.

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

## R006_QUANTUM_ARCH_OPUS - RUNTIME-ARCH-006

Scope: dashboard runtime architecture, deployment wiring, and stability risk.

Files:

- `Dashboard-v2/package.json`
- `Dashboard-v2/svelte.config.js`
- `Dashboard-v2/vite.config.ts`
- `Dashboard-v2/production-server.js`
- `Dashboard-v2/server/index.js`
- `Dashboard-v2/server/express-adapter.js`
- `Dashboard-v2/server/cron-runner.js`
- `Dashboard-v2/server/ecosystem.config.js`
- `Dashboard-v2/src/hooks.client.ts`
- `Dashboard-v2/src/lib/db.ts`

Questions:

- Are frontend, server, adapter, and deployment entrypoints wired coherently?
- Are there duplicate runtimes or stale deploy paths that would confuse an LLM or operator?
- Are cron/background jobs bounded, observable, and unlikely to explain high CPU/RAM symptoms?
- Are runtime env assumptions clear without exposing secrets?

## R006_PRIME_SECURITY_OPUS - TRACKER-WIRING-006

Scope: tracker workflow security, state transitions, and external sync wiring.

Files:

- `Dashboard-v2/functions/tracker-start.js`
- `Dashboard-v2/functions/tracker-stop.js`
- `Dashboard-v2/functions/tracker-tick.js`
- `Dashboard-v2/functions/tracker-log.js`
- `Dashboard-v2/functions/tracker-block.js`
- `Dashboard-v2/functions/tracker-plan-submit.js`
- `Dashboard-v2/functions/tracker-plan-decide.js`
- `Dashboard-v2/functions/tracker-pull-plane.js`
- `Dashboard-v2/functions/tracker-push-plane.js`
- `Dashboard-v2/functions/shared-idempotency.js`
- `Dashboard-v2/functions/shared-storage.js`

Questions:

- Are tracker actions authenticated and tenant/user-scoped consistently?
- Are start/stop/tick/log transitions idempotent and race-safe?
- Could Plane pull/push or ticker loops explain runaway CPU/RAM or duplicated writes?
- Are service-role/anon Supabase operations separated correctly?

## R006_ZETA_LLMNAV_OPUS - LLMNAV-AGENTS-006

Scope: LLM navigationability, agent instruction quality, and repo-control surface clarity.

Files:

- `CLAUDE.md`
- `Home.md`
- `11 - NEX Brain/Operating Contract.md`
- `11 - NEX Brain/Overnight Intelligence.md`
- `11 - NEX Brain/_legacy-prototypes/System-Map.md`
- `.claude/agents/cto.md`
- `.claude/agents/ops-guardian.md`
- `.claude/agents/nexapp-dev.md`
- `.claude/agents/knowledge-curator.md`
- `.obsidian/plugins/claudian/manifest.json`
- `.obsidian/plugins/claudian/main.js`

Questions:

- Can an LLM enter the repo, identify current authority, and avoid stale/nonexistent paths?
- Do agent prompts create unsafe autonomy, hallucination, or write-risk patterns?
- Are NEX Brain docs aligned with actual tracked architecture?
- Does Obsidian/Claude integration create navigation or command-execution risk?
