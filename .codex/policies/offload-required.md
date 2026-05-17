# YURI Codex Offload Policy

Use `yuri.offload_task` for scans across multiple files, repo research, summarization and extraction, architecture review, security or safety audits, and parallel fan-out.

Self-execute only for small edits already in current context, deterministic shell inspection, single-file reads, and final synthesis from offload outputs.

Do not use native Codex agents for offload-eligible work while `yuriOffload` is available. If it is unavailable, treat OS_KERNEL task memory and offload budgets as non-authoritative before using native agents.

Protected surfaces remain blocked per `_SYSTEM/yuri-origin.md`.
