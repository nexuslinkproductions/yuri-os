# Anthropic Agents — ALLOWED (policy reversed 2026-05-30)

**Rule:** `Agent()` and Workflow subagents with Claude / Haiku / Sonnet / Opus models are **ALLOWED**.

**Owner directive (2026-05-30):** Anthropic-model subagents are permitted, primarily for the **Workflow feature** and **ultracode-effort** work, where token cost is explicitly accepted in exchange for quality and parallelism. This reverses the earlier hard ban (PATCH 023, 2026-05-14).

**Enforcement now:** `.claude/hooks/agent-spawn-guard.js` is **observability-only** — it logs every Agent spawn (`subagent_type`, `model`, `description`) to stderr and always allows. No `deny`.

**Cost guidance (guidance, NOT enforced):**

Spend deliberately. An Anthropic subagent is the right tool when reasoning quality, parallel fan-out, or adversarial verification justify the spend (ultracode, complex multi-file work, independent review). For routine bounded work the cheaper lanes still win:

| Task type | Prefer | Command |
|---|---|---|
| Known-path file read | `Read` tool directly | `Read` |
| Directory exploration | `Bash find/grep` or ollama-bridge | direct |
| Quick triage / classification | llama3.2 local | `bash _SYSTEM/Scripts/offload.sh -m ollama-local "<prompt>"` |
| Bounded code change (1-3 files) | inline Opus, or Codex | inline / `offload.sh -m gpt-5.4-mini` |
| Raw GitHub source | `curl raw.githubusercontent.com` | `curl -s ".../main/<path>" \| head -200` |
| Parallel fan-out / adversarial review / large research | **Workflow + Anthropic subagents** | `Workflow({...})` |

**Why the spend can be worth it now:** under ultracode the goal is the most exhaustive, correct answer — parallel Anthropic subagents for independent verification and fan-out buy quality the offload lanes can't match. The old failure mode (300k+ tokens on three Explore agents doing trivial reads) is still wasteful — that's what the cost guidance above prevents, by judgment rather than a hard gate.

**Bypass flag (now redundant):** `YURI_ALLOW_AGENT=1` is no longer needed — spawns are allowed by default. Harmless if still set.

**Verification:**
```bash
echo '{"tool_name":"Agent","tool_input":{"subagent_type":"general-purpose","model":"sonnet"}}' | node .claude/hooks/agent-spawn-guard.js; echo "exit=$?"
# Expect: stderr log line + exit=0 (allowed), no deny JSON on stdout
```

**History:** banned 2026-05-14 (PATCH 023) for cost control; reversed 2026-05-30 by owner directive for Workflow/ultracode use.
