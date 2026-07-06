---
name: Codex is powerhouse default — NIM is system/infra only
description: Routing philosophy correction — Codex handles all work types; NIM lanes are scoped to system/infra tasks exclusively
type: feedback
originSessionId: 9da9bd95-b354-463d-b6a7-51781d484fbe
---
Codex (gpt-5.5) is the powerhouse default for ALL work: implementation, design, visual, refactor, codegen, HTML reports, CSS, frontend — everything.

NIM lanes (@nvidia-*) are for system/infra-specific tasks only. Never route design, visual, or general coding work to NIM.

**Why:** Marcel: "codex is our powerhouse all for one tool" — "nim lanes are not for visual design work only system stuff". An audit HTML report was incorrectly routed via NIM. The brain map falsely listed `large_refactor_or_codegen → @nvidia-qwen-coder` in the session context.

**How to apply:** When choosing a lane for any task, default to Codex first. Only reach for NIM when the task is explicitly system/infra (e.g. system analysis, infra triage, long-doc over 128k). Never use NIM as a codegen or design alternative.

Also: do not use labels like `codexRateLimitFallback` — Codex subscription is stable and rarely saturates. Use `extremeLoadFallback` if a NIM fallback must be named at all.
