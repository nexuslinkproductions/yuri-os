---
name: tokenmaxxing
description: "Master token efficiency mode. Activates ultra-caveman, full offload-default, auto-compact, and ctrl+b background task routing. One command to engage everything."
triggers:
  - "/tokenmaxxing"
  - "tokenmaxxing"
---

# TOKENMAXXING MODE

## Auto-Activation (full bake — 2026-04-25)

`token-session-init.js` sets `tokenmaxxing: true` AND injects the full `## Rules` block from this SKILL.md into Claude's startup context on every SessionStart. No manual command needed. Rules are live from turn 1.

Use `/tokenmaxxing` only to **re-activate** after a `tokenmaxxing off` mid-session.

## Activation Steps (re-activate only — run when skill fires after `tokenmaxxing off`)

1. Run this Bash command to set the session flag:
   ```bash
   node -e "const ss=require('/Users/marcelspatz/.claude/hooks/session-state.js'); ss.update(s=>{s.tokenmaxxing=true;});"
   ```

2. Output exactly one line: `⚡ TOKENMAXXING ACTIVE`

## Rules — enforce for the rest of this session

### Ultra-Caveman
- Zero preamble. Zero trailing summaries. No "let me", no "I'll", no "here's".
- Single-sentence updates. Headers only for multi-section outputs.
- Code stays deep. Docs stay thorough. Speech stays minimal.

### Offload-Default (no trigger word needed)
- Every non-trivial task → delegate to smallest lane first, without being asked.
- Main thread = overseer + finalizer only. Never researcher or implementer.
- Routing priority: @deepseek → @qwen → @gpt-oss → @swarm → @claude (last resort).
- Do not narrate work that can run in a lane.

### Auto-Compact
- When context hits tier 2 (60%+), run /compact immediately — do not suggest, do not wait.
- Use the pre-built hint injected by pre-tool-use.js context.
- Never compact without preserving: branch, files touched, last user correction, next step.

### Local-First Subagent
- Before any `Agent()` call, assess: can `mcp__ollama-bridge__ollama_run` handle this?
- Lightweight tasks (lookup, explore, summarize, analyze ≤5 files, skill check) → use `mcp__ollama-bridge__ollama_run` or `mcp__ollama-bridge__ollama_explore_files` first.
- Only escalate to `Agent()` if local result is insufficient or task needs write/tool-loop.
- Skill: `/local-subagent` — full routing decision tree and model selection.
- **Default local model:** See `.claude/config/models.json` → `local.primary` (currently `qwen2.5:7b`, M2 Pro optimized). Code tasks: see `local.code` in same file (currently `qwen2.5-coder:latest`).

### No Cloud Agents for File Reads
- Known file paths → `Read` tool directly, or `mcp__ollama-bridge__ollama_explore_files`
- Directory exploration → `Bash find/grep` or ollama-bridge
- NEVER spawn `Agent(Explore)` or `Agent(general-purpose)` to read known files — costs 26k–57k tokens
- Only escalate to cloud Agent for: unknown paths + local insufficient + cross-file reasoning required

### Local-Fail Fallback
- Local (Ollama) fails → fetch/read/skill-lookup tasks → `Agent({ model: "haiku" })`
- Subagents and background agents → always `model: "haiku"`, no exception
- Planning, implementation, testing → Sonnet 4.6 (main thread only)
- Never escalate a failed fetch task to Sonnet — Haiku is the fallback ceiling for utility work

### Background Tasks (`ctrl+b` / `[bg]` prefix)
- If user input starts with `[bg]` or `/bg`: spawn as `Agent({ run_in_background: true })` immediately.
- Confirm in one line: `→ BG: <3-word description>`
- Return to main thread. Do not narrate the spawned task further.

## Deactivation

Type `tokenmaxxing off` to disable:
```bash
node -e "const ss=require('/Users/marcelspatz/.claude/hooks/session-state.js'); ss.update(s=>{s.tokenmaxxing=false;});"
```
Output: `TOKENMAXXING OFF`

## Session Notes

### 2026-04-27
- session: 3m | peak ctx: 50% | compacts: 0
- tools: Bash×8, Read×5
- corrections: none
- errors: none

### 2026-04-27
- session: 2m | peak ctx: 47% | compacts: 0
- tools: Bash×8, Read×5
- corrections: none
- errors: none

### 2026-04-27
- session: 1m | peak ctx: 43% | compacts: 0
- tools: Bash×15, Read×12
- corrections: none
- errors: none

### 2026-04-27
- session: 2m | peak ctx: 45% | compacts: 0
- tools: Read×12, Bash×8, Write×4
- corrections: none
- errors: none

### 2026-04-27
- session: 1m | peak ctx: 40% | compacts: 0
- tools: Read×10, Bash×2
- corrections: none
- errors: none

### 2026-04-27
- session: 6m | peak ctx: 53% | compacts: 0
- tools: Read×27, Bash×8, Write×2, mcp×1
- corrections: none
- errors: none

### 2026-04-27
- session: 8m | peak ctx: 50% | compacts: 0
- tools: Read×41, Bash×15, Write×5, Agent×1
- corrections: none
- errors: none

### 2026-04-26
- session: 7m | peak ctx: 0% | compacts: 0
- tools: Bash×15, Read×9, Write×4, Agent×1, ToolSearch×1, ExitPlanMode×1, Edit×1
- corrections: none
- errors: none

### 2026-04-26
- session: 6m | peak ctx: 0% | compacts: 0
- tools: Bash×15, Read×9, Write×4, Agent×1, ToolSearch×1, ExitPlanMode×1, Edit×1
- corrections: none
- errors: none

### 2026-04-26
- session: 17m | peak ctx: 11% | compacts: 0
- tools: Read×26, Edit×4, Bash×2, Agent×2, Write×2, ToolSearch×1
- corrections: none
- errors: none

### 2026-04-26
- session: 16m | peak ctx: 11% | compacts: 0
- tools: Read×26, Edit×4, Bash×2, Agent×2, Write×2, ToolSearch×1
- corrections: none
- errors: none

### 2026-04-26
- session: 37m | peak ctx: 13% | compacts: 0
- tools: Write×6, Bash×2, Read×1, Edit×1
- corrections: none
- errors: none

### 2026-04-26 (session 2)
- session: ollama-bridge validation | peak ctx: 11% | compacts: 0
- tools: ToolSearch×1, mcp__ollama-bridge×5, Bash×9, Read×4, Write×3, Skill×1
- corrections: MEMORY.md index missing after memory write — fixed in EOT
- errors: deepseek-r1 cold-load → 3× MCP timeouts (120s each); /api/chat hung pre-restart
- notes: deepseek/gpt-oss confirmed = Ollama proxies only. llama3.2 = correct default for skill fetch. 4 patches logged in eot/2026-04-26_1022/SKILL_REFINEMENT_PATCH.md

### 2026-04-26
- session: offload protocol enrichment | peak ctx: ~15% | compacts: 0
- tools: Read×4, Edit×5, Write×6, Bash×6, Agent×2 (cloud Explore — MISTAKE), Skill×1
- corrections: spawned 2 cloud Explore agents to read known file paths → 26k+57k tokens wasted; should have used Read+Bash directly
- errors: Ultraplan failed (no git repo at /Users/marcelspatz)
- notes: Haiku fallback + No-Cloud-Agents-for-File-Reads rules now encoded in ## Rules (auto-injected each session)

### 2026-04-26
- session: 5m | peak ctx: 9% | compacts: 0
- tools: Bash×31, Read×19, Edit×2, Agent×1
- corrections: none
- errors: none

### 2026-04-25
- session: 4m | peak ctx: 16% | compacts: 0
- tools: Bash×4, Edit×4, ToolSearch×1, ExitPlanMode×1, Read×1
- corrections: none
- errors: none

### 2026-04-25
- change: hook now dynamically reads ## Rules from SKILL.md and injects into startup additionalContext
- effect: full behavioral rules arrive in Claude context at turn 1, zero manual activation
- files: token-session-init.js (hardlinked NUDIMMUD↔global, single edit)
- statusline: token-status.js updated to show ⚡ TM:ON / ○ TM:OFF explicitly
- risk: if ## Rules heading renamed → injection silently breaks; null-check warn recommended
- patch: HOOK_REGEX_001 — always use ^## with m flag for Markdown section extraction

### 2026-04-25
- session: 2m | peak ctx: 8% | compacts: 0
- tools: Read×2, Bash×2, Agent×2, Edit×1
- corrections: none
- errors: none

### 2026-04-25
- session: 12m | peak ctx: 14% | compacts: 0
- tools: Bash×10, Read×9, Write×4, Edit×3, ToolSearch×1, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-04-25
- session: planning + implementation | peak ctx: 18% | compacts: 0
- tools: Bash×8, Read×7, Write×2, Edit×9, Agent×2 (explore), ExitPlanMode×1
- corrections: none
- errors: Edit failed on ai-pipeline-offloading + swarm-coordination (read-before-write guard missed during parallel edits)
- notes: ctrl+b uses `chat:insertText` — unverified. Verify with /keybindings-help before relying on it. token-status.js ⚡ indicator was missed in initial plan, caught in reflection pass.
