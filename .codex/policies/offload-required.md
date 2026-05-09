# NUDIMMUD Codex Offload Policy

Use `nudimmud.offload_task` for:

- Scans across multiple files.
- Repo research.
- Summarization and extraction.
- Architecture review.
- Security or safety audit.
- Parallel fan-out.

Self-execute only for:

- Small edits already in current context.
- Deterministic shell inspection.
- Single-file reads.
- Final synthesis from offload outputs.
- Direct user-requested local work.

Rules:

- Do not use native Codex agents for offload-eligible work while `nudimmudOffload` is available.
- If `nudimmudOffload` is unavailable, warn that OS_KERNEL task memory and offload budgets are not authoritative before using native agents.
- Keep `mutation_allowed=false` unless a later safety phase explicitly enables mutation through the bridge.
- Protected paths remain blocked: `.env`, `.claude/state/`, `.claude/history/`, `backend/data/`, `/Volumes/T7` write targets, and secrets.
