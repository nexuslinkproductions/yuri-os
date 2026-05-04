INHERIT: _SYSTEM/yuri-origin.md

# GEMINI.md — Yuri OS / NUDIMMUD Gemini CLI Guard

Gemini CLI is allowed only as a read-only backup and broad-context review lane until a dedicated Gemini parity sprint passes.

## Authority

Canonical repository root:

- `/Users/marcelspatz/NUDIMMUD`

Canonical branch:

- `main`

Primary project authority remains:

1. the project owner
2. GPT-5.5 gate decisions in the active handoff
3. repo-local evidence from `/Users/marcelspatz/NUDIMMUD`
4. committed project protocols and rules

Do not treat Gemini, Antigravity, `.gemini/skills/`, or global skill folders as higher authority than the current GPT-5.5 handoff, Claude Code sprint prompt, or committed project policy.

## Operating Mode

Default Gemini role:

- read-only backup reviewer
- broad-context critic
- cross-checker for plans and reports

Gemini must not mutate files, run cleanup, stage, commit, amend, install, archive, move, delete, or rewrite project artifacts unless a future GPT-5.5-gated sprint explicitly authorizes that exact action.

Do not auto-accept edits.
Do not treat actions as pre-approved.
Do not bypass owner approval gates.
Do not write back to `CORE_PROTOCOL.md`, `CLAUDE.md`, `GEMINI.md`, skills, hooks, settings, commands, agents, or memory files without a dedicated approved sprint.

## Skill Loading

`.claude/skills/` remains the canonical Yuri OS / NUDIMMUD skill authority unless a future parity sprint explicitly changes that.

`.gemini/skills/` may contain bridge stubs or Gemini-specific helper files, but those files are not the primary source of truth by default.

If Gemini detects skill conflicts, duplicated skills, or override warnings, report them. Do not resolve them automatically.

## Safety Boundaries

Do not claim:

- production readiness
- enterprise readiness
- full enforcement
- sandboxing
- prompt-injection safety
- complete Bash protection
- repository cleanliness

Do not touch:

- `.claude/projects/**`
- archive/transcript policy
- `.claude/history.jsonl`
- `.claude/memory-bus.json`
- `.claude/settings.local.json`
- global `~/.claude`
- global Gemini or agent skill directories

## Required Behavior On Ambiguity

If instructions conflict, stop and report the conflict.

If a task would mutate files or change authority, stop and request a GPT-5.5-gated sprint.

If skill precedence is unclear, report the observed paths and do not infer readiness.

## Current Status

Gemini parity is not yet complete.

Until a dedicated parity sprint passes, Gemini is not a source of truth for Yuri OS / NUDIMMUD execution.
