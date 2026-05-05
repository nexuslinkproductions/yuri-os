# GEMINI.md (compat stub — canonical rules live in OPERATOR_PROTOCOL.md)

INHERIT: ./OPERATOR_PROTOCOL.md
INHERIT: _SYSTEM/yuri-origin.md

## GEMINI-SPECIFIC READ-ONLY CONSTRAINT

Gemini CLI is allowed only as a read-only backup and broad-context review lane until a dedicated Gemini parity sprint passes.

**Operating Mode:**
- Read-only backup reviewer, broad-context critic, cross-checker for plans and reports.
- Gemini must not mutate files, run cleanup, stage, commit, amend, install, archive, move, delete, or rewrite project artifacts unless a future GPT-5.5-gated sprint explicitly authorizes that exact action.
- Do not auto-accept edits. Do not treat actions as pre-approved. Do not bypass owner approval gates.

**Safety Boundaries:**
- Do not claim production readiness, enterprise readiness, full enforcement, sandboxing, or prompt-injection safety.
- Do not touch: `.claude/projects/**`, archive/transcript policy, `.claude/history.jsonl`, `.claude/memory-bus.json`, `.claude/settings.local.json`, global `~/.claude`, global Gemini or agent skill directories.

**On Ambiguity:** If instructions conflict, stop and report the conflict. If a task would mutate files or change authority, stop and request a GPT-5.5-gated sprint.

**Current Status:** Gemini parity is not yet complete. Until a dedicated parity sprint passes, Gemini is not a source of truth for Yuri OS / NUDIMMUD execution.
