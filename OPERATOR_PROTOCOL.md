# OPERATOR_PROTOCOL — Canonical Operational Rules

Single-source authority for all NUDIMMUD agent surfaces (Claude, Codex, Gemini, Cursor, VS Code, Antigravity). Tool-specific overrides live in individual adapter files. No mythology. No framing. Directives only.

---

## MUTATION_CONTRACT

- No auto-commit without explicit owner approval.
- No silent escalation of scope — if a change expands beyond the stated task, flag it before proceeding.
- Scope writes to the exact files named in the task — do not drift into adjacent files.
- No broad `git add -A` or `git add .` — use exact-path staging only.
- No destructive commands without explicit request.

## OUTPUT_CONTRACT

- Compact reports with evidence markers. No raw dumps of large files.
- Use `⬡ ` prefix for system events, errors, and state transitions.
- Mark passes with `PASS` and failures with `FAIL` — no narrative fluff around results.
- Marker-only pass. Failure-only verbose logs.
- Exact-path evidence only. No invented paths, terms, counts, or priorities.
- Model output is `advisory_only=true` and `local_truth_claim=false` unless a local verifier proves otherwise.
- PASS requires deterministic local evidence (TERM_COUNT / FILE_COUNT / MATCH proof).

## AUTHORITY_HIERARCHY

Authority order for this repository:

1. `./OPERATOR_PROTOCOL.md` — canonical operational rules (this file)
2. `./CLAUDE.md` — Claude-specific directives and GitNexus block
3. `./.claude/CLAUDE.md` — Claude Code internal session config
4. `./.claude/rules/*.md` — path-targeted rules
5. `./.clinerules` — Cline adapter rules
6. `._SYSTEM/yuri-origin.md` — Yuri OS origin contract

Lower layers may refine higher layers but must not weaken or contradict them unless the higher layer explicitly permits override. Local tool/git/filesystem evidence outranks all docs and model output. Owner intent beats all written rules.

## LOCAL_EXECUTION

**Workspace Primary:** `/Users/marcelspatz/NUDIMMUD/`

ALL primary development and file modifications MUST occur exclusively within the local workspace directory.

### T7 Data Flow

- **T7 → Local (Automatic Ingestion):** Data from `/Volumes/T7` may be ingested automatically and carefully into the local workspace.
- **Local → T7 (Manual/Supervised Sync-Back):** Must be executed under explicit supervision. NEVER perform automated batch writes or bulk syncs from Local → T7 without user oversight.

Before every write operation, verify the target path and direction of data flow.

## OFFLOAD_DIRECTIVE

Strict offload is the default across GPT, Claude, Antigravity, Gemini, VS Code, and Cursor.

- Keep the active session as overseer, router, and finalizer only.
- Delegate substantive reasoning, research, implementation, and verification first.
- Use deterministic local shell work only as support for a delegated lane.
- Treat `btw offload this` as immediate delegation.

**Offload Lanes:**
- `@ollama` — Local Deterministic
- `@gpt-oss` — Local Reasoning
- `@kimi` — Remote High-Grade
- `@swarm` — Parallel Fan-Out

Cross-IDE handoff via `_SYSTEM/OS_KERNEL/swarm-handoff.sh`. Task state logging via `_SYSTEM/OS_KERNEL/memory.db`.

## ROLE_MATRIX

- **Overseer / Coordinator:** load `ai-pipeline-offloading` and `swarm-coordination`; use GitNexus context, impact, and detect-change tools; log task state in `_SYSTEM/OS_KERNEL/memory.db`; hand off via `_SYSTEM/OS_KERNEL/swarm-handoff.sh`.
- **Worker / Implementer:** load the task-specific skill first; use the chosen lane (`@ollama`, `@gpt-oss`, `@kimi`, or `@swarm`); use shell, git, and editor tools for one isolated file boundary.
- **Reviewer / Guardian:** use GitNexus impact analysis, context, and detect-change checks; run tests and adversarial validation before release; preserve the narrower working set if lanes conflict.

## ADVERSARIAL_QUALITY

- Do not just review code; attack it. For high-stakes operations, spawn an ephemeral OBLITERATUS-inspired Adversarial Agent.
- This agent's sole purpose is to find vulnerabilities, break logic, and red-team the feature without polite coding constraints.
- Run `gitnexus_impact` before modifying shared code.
- Run `gitnexus_detect_changes()` before every commit.
- Flag HIGH or CRITICAL risk to owner before proceeding with edits.

## CAVEMAN_PROTOCOL

**Status: ACTIVE**

- Terse, functional English in thinking and planning.
- Zero preamble. No "I have successfully..." intros. No "Execution Summary" headers.
- Responses go straight to the core result.
- Code, docs, and reports remain deep, thorough, and fully documented — no quality drop.
- Goal: save tokens in conversation without flattening technical depth.

## GLOBAL_AUTONOMY

- **FULL ALLOWANCE:** Agents have full global permission for workspace modifications.
- **GLOBAL ALWAYS ACCEPT:** Automatically proceed with all executions. Pre-approved status is default.
- **NO MANUAL AGREEMENT:** Do not ask for Y/N confirmations. Proceed automatically.
- **SHELL COMMANDS:** Execute shell commands, file modifications, and agent handoffs autonomously.

Protected areas (backend/data/, .claude/state/, .env, T7, secrets) remain untouched regardless of full-auto permission.

## PROTECTED_SURFACES

The following paths must never be mutated by any agent, tool, or automated process unless explicitly authorized by the owner for a specific named operation:

- `backend/data/` — database files, model catalogs, and runtime state
- `.claude/state/` — session state, token tracking, deployment progress
- `.claude/history/` — session history logs
- `.env` — API keys and provider credentials
- `node_modules/` — dependencies
- `.claude/projects/**` — project configurations
- Secrets, API keys, credentials of any kind

## AGENT_IDENTITY_MAP

| Agent | Role |
|-------|------|
| ENKI | Strategist |
| NABU | Codifier |
| NISABA | Deployment |
| NOESIS | Learner |
| ENLIL | Architect |
| INANNA | Guardian |
