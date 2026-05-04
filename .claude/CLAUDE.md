# Yuri OS / NUDIMMUD Session Start Guard

## INHERIT
INHERIT: ../CLAUDE.md

This file is a secondary extension layer for local Claude tooling behavior.
If any instruction here conflicts with `../CLAUDE.md` or `../CORE_PROTOCOL.md`, the higher file prevails.


Canonical repository root:

- `/Users/marcelspatz/NUDIMMUD`

Canonical branch:

- `main`

Before any Yuri OS / NUDIMMUD sprint, audit, validation, cleanup, patch, report, config work, or local CLI task, first verify:

- `pwd` equals `/Users/marcelspatz/NUDIMMUD`
- `git branch --show-current` equals `main`

If either check fails:

- stop immediately
- do not continue the task
- do not switch directories automatically
- do not switch branches automatically
- do not mutate files
- do not stage or commit
- report the mismatch to the owner and ask them to manually reconcile the VS Code workspace / terminal context

Do not treat `/Users/marcelspatz` as the Yuri OS / NUDIMMUD repository root.
Do not run Yuri OS / NUDIMMUD sprint work from `master`.

INHERIT: _SYSTEM/yuri-origin.md

---

# Yuri OS — Session Boot

When starting with `npm run yuri`, the session automatically loads:
- `.claude/specs/YURI_PROGRESS.md` — living roadmap tracker (guide + reference, not hard rule)
- `.claude/specs/yuri_os_audit_pack/` — spec authority (use to verify coverage)
- `.claude/specs/yuri_os_roadmap/` — rollout plans and enterprise readiness docs
- Roadmap state from `.claude/state/roadmap-state.json` — tracked by the system

**Working posture:** Build incrementally, spec-driven, evidence-backed. Use roadmap as guide. Track and update progress after each session.

---

# graphify
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.

## Protected Surfaces

The following paths must never be mutated by any agent, tool, or automated process unless explicitly authorized by the owner for a specific named operation:
- `backend/data/` — database files, model catalogs, and runtime state
- `.claude/state/` — session state, token tracking, deployment progress
- `.claude/history/` — session history logs
- `.env` — API keys and provider credentials

## CAVEMAN_PROTOCOL
- **Status:** Active by default.
- **Scope:** Global. Apply in every project, every session, unless the user explicitly asks for a different style.
- **Thinking/Planning:** Terse, functional English. Strip filler. Key nouns and verbs only.
- **Responses:** Zero preamble. Max brevity. Match depth to the core need.
- **Code / Docs / Reports:** Stay deep, thorough, and fully documented. No quality drop.
- **Goal:** Save tokens in conversation without flattening technical depth.

## Model Routing Policy

**Default model**: Claude Sonnet 4.6.

**Use Sonnet 4.6 for:**
- architecture decisions
- security design and threat modeling
- permission and memory governance
- multi-agent orchestration
- risky multi-file edits
- final reviews and QA
- system prompt authoring
- production decisions

**Use Haiku 4.5 only for:**
- summarization and log compression
- extraction and file inventories
- markdown cleanup and normalization
- repetitive transformations
- first-pass drafts
- cheap worker tasks (low risk of structural damage)
- bulk high-volume work

**Avoid Opus by default.**
If a task appears Opus-level, first attempt:
1. Sonnet 4.6 with high reasoning
2. staged planning
3. Haiku worker decomposition
4. Sonnet final review

Escalate to Opus only with explicit user approval after Sonnet fails via structured retries.

**Cost control rules:**
- Use `/clear` between unrelated tasks
- Use `/compact` during long tasks to preserve context
- Prefer file paths over pasting giant files
- Run Haiku for preprocessing; Sonnet for final review
- Check `/cost` periodically when using API-key billing

---

## Tool Routing Discipline — HARD ENFORCED

**Before any Agent() call, attempt with local tools first.**

Local tools suffice for:
- **File reads & inventory**: Use `Read`, `Bash find/grep/ls`
- **Directory exploration**: Use `Bash find`, `Bash tree`, `Bash ls -R`
- **Extraction & parsing**: Use `Bash grep/sed/awk`, `Read` multiple files, then synthesize locally
- **Markdown cleanup & normalization**: Haiku 4.5 via Agent is OK if ≥5 files; single file → local tool

**Escalate to Agent only when:**
- Task requires cross-file reasoning (file A affects file B affects file C; needs inference)
- Task involves subjective judgment (what's an "architecture violation"? What should priorities be?)
- Task requires synthesis beyond grep/find (e.g., "summarize 50 log lines into common themes")
- Local tool result is insufficient and Agent reasoning adds value

**Cost rule:** File reads that consume 45k tokens via Agent can be done locally for <100 tokens. Always choose local first.

**Exception:** If Agent output is cached or reused in same session, marginal cost is low and reasoning may justify it. Still bias toward local.

---

## Agent & Escalation Protocols

### Agent Creation Validation (EOT Patch 001)

When creating or batch-creating subagent definition files:
1. After creation, verify model IDs match canonical strings: `grep -h "^model:" ~/.claude/agents/*.md | sort | uniq`
2. Confirm all files have `model:` and `description:` fields present and non-empty
3. Only mark agents as "created and verified" after both checks pass

This prevents silent mismatches like `claude-haiku-3-5` (wrong) vs `claude-haiku-4-5-20251001` (correct).

### Risk Escalation Clarity (EOT Patch 002)

When deferring a system-level change, log the escalation explicitly:
```
ESCALATION: [file/setting] — deferred. Reason: [specific impact]. Scope: [global/project/session]. Approval: [who].
```

Not: "This is too risky."  
Yes: "Changes global model default for all sessions; requires explicit user approval."

This ensures session handoff is clear and future readers understand the decision boundary.

---

## Protected Surfaces

Protected surfaces are inherited from `../CLAUDE.md`.

This file may add stricter local protections, but it must not relax, bypass, or reinterpret repository-level protected-surface rules.

## END OF TRANSMISSION (Global Session-Close Command — Full Auto)

When the user says `end of transmission`, stop normal implementation mode and enter End-of-Session Reflection Mode in FULL AUTO execution.

This command is deliberate user authorization to run the entire EOT pipeline from beginning to end without asking for further permission. Do not pause for confirmation, format selection, optional review, or approval to proceed. Do not ask whether to inspect files, create artifacts, update self-improvement docs, offload deterministic work, or finalise with Sonnet. The command itself grants that permission.

Run a full session backtrack. Build an evidence inventory from user requests, assistant outputs, files, tool calls, checks, errors, artifacts, and unresolved assumptions. Double-check all important claims against evidence. Log verified successes, failures, partials, unsupported claims, and remaining risks. Identify what could have been done better and convert those lessons into reusable skill updates with trigger, rule, validation, and evidence.

Automatically update the current self-improvement system and related documentation where the target is clearly within the self-improvement scope and the mutation is safe. If direct system mutation is not possible, blocked by platform permissions, unsafe, or outside the protected scope, create a patch proposal instead of claiming injection. Continue the rest of the pipeline without asking the user.

All mechanical work must be offloaded to deterministic tools or Haiku workers first: file inventory, transcript extraction, grep/search, diff checks, artifact verification, test/log collection, and evidence tables. Main thread performs final synthesis directly from Haiku worker outputs. Micro-EOT runs automatically mid-session in background — no manual trigger required for checkpoint reflections.

Final output must include: session summary, verified successes, failures/partials, what could have been done better, skill refinement patch, self-improvement update, next-session boot packet, offload summary, blocked items, and remaining risks. Do not reveal hidden chain-of-thought. Do not invent accomplishments. Do not claim checks were run without evidence. Do not touch protected areas such as Conclave, secrets, private environment files, T7 drive, or unrelated production logic. Do not perform irreversible external side effects unless separately and explicitly requested.
