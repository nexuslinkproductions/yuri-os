# No Anthropic Agents — Hard Rule

**Rule:** `Agent()` with Claude / Haiku / Sonnet / Opus models is **BANNED** in NUDIMMUD.

**Effective:** Hard-enforced by `.claude/hooks/agent-spawn-guard.js` (PATCH 023, 2026-05-14) — PreToolUse hook returns `permissionDecision: "deny"` on any `tool_name === "Agent"`.

**Why it kept happening before the hook:**
- `claude-protocol-guard.js` was warn-only — model ignored it under context pressure
- `Agent(*)` is in `permissions.allow` array in `.claude/settings.json` — no negative gate
- This memory file was referenced in `MEMORY.md` but the actual file was missing — no enforcement loop

**Approved alternatives (in priority order):**

| Task type | Lane | Command |
|---|---|---|
| Bounded code change (1-3 files) | Codex gpt-5.4-mini | `bash Scripts/offload.sh -m gpt-5.4-mini "<CODEX TASK SPEC>"` |
| Complex multi-file refactor | Codex gpt-5.5 | `bash Scripts/offload.sh -m gpt-5.5 "<CODEX TASK SPEC>"` |
| Multi-file analysis + write | DeepSeek v4-pro (bounded per PATCH 011) | `bash Scripts/offload.sh -m deepseek-v4-pro --reasoning high "<bounded prompt>"` |
| Quick triage / classification | llama3.2 local | `bash Scripts/offload.sh -m ollama-local "<prompt>"` |
| Known-path file read | `Read` tool directly | `Read` |
| Directory exploration | `Bash find/grep` or `mcp__ollama-bridge__ollama_explore_files` | direct |
| Raw GitHub source | `curl raw.githubusercontent.com` (research_pipeline.md Tier 2) | `curl -s "https://raw.githubusercontent.com/<owner>/<repo>/main/<path>" \| head -200` |
| Deterministic checks | direct Bash | direct |

**Bypass (emergency / explicit user approval only):**
```bash
YURI_ALLOW_AGENT=1 <command-that-spawns-agent>
```
The bypass logs to stderr (`[agent-spawn-guard] YURI_ALLOW_AGENT=1 — Agent spawn allowed (logged)`) — never silent.

**Failure mode this rule prevents:**
- Spawning 3 Explore/Haiku agents costs ~300k+ tokens
- Same work via Codex/DeepSeek/curl costs 5-20k tokens
- Anthropic agents bypass the offload-contract.mjs routing layer entirely

**Verification:**
```bash
echo '{"tool_name":"Agent","tool_input":{"subagent_type":"Explore"}}' | node .claude/hooks/agent-spawn-guard.js | jq '.hookSpecificOutput.permissionDecision'
# Expect: "deny"
```

**Locked:** 2026-05-14 — PATCH 023 (commit pending)
