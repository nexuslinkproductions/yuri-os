# HANDOFF — Memory + Sovereignty Sprint
**Date:** 2026-05-16
**Session commits:** 1da68165, 00d325c6, cf872704
**Independence score:** 71/100 · fail=0 · warn=5

---

## What Changed This Session

### Memory Architecture (M1–M5) — FULLY WIRED

| Component | File | What it does |
|-----------|------|-------------|
| Dream processor | `Scripts/nisaba-dream-processor.mjs` | Consumes `dream-queue.jsonl` via DeepSeek, writes rules to `global.md`. Fixed: truncatePrompt (61KB→~4KB), positional arg to offload.sh. |
| Session capture | `.claude/hooks/nisaba-on-stop.js` | 800-char human messages, files_modified, commit_messages, error_snippets from session-state.json |
| Corrections signal | `.claude/hooks/session-reflect.js` | `corrections` reads from latest session JSONL instead of hardcoded `''` |
| Session→memory.db | `Scripts/memory-session-write.mjs` | Writes every session observation as episodic memory to memory.db. Weekly consolidation trigger if >7d. |
| RAG injection | `.claude/hooks/memory-rag-inject.js` | Queries memory_governor.py read --limit 12 at SessionStart. Injects top 10 active LTM items as `<yuri-memory>` block. |
| Learning score | `Scripts/memory-learning-score.mjs` | 0-100 score. Baseline: 59/100 from 390 sessions. `node Scripts/memory-learning-score.mjs --report` |

**settings.json wired:** memory-rag-inject.js in SessionStart, memory-session-write.mjs in StopHooks, memory-archive.mjs changed --dry-run → --execute.

**Why it matters:** The dream processor was dead since P5 (sovereignty sprint). 389 sessions of observations accumulated with zero synthesis. M1 fixed the broken loop. Next session will be the first to have synthesized rules injected at start.

---

### Sovereignty Sprint Continuation

| Packet | Status | Notes |
|--------|--------|-------|
| P13 pre-commit gate | ✅ | `_SYSTEM/git-hooks/pre-commit` + `Scripts/pre-commit-independence.sh`. Blocks new Anthropic model refs on commit. |
| Track D sharingan | ✅ | 4 briefs in `.sharingan/` — strategic-thinker (MIT, 6-persona council), socraticode (code_context per-turn schema), codebuff (private/404, documented from public sources), visual-explainer (404, yuri-report already covers domain) |
| research_pipeline.md | ✅ | curl allowed for raw.githubusercontent.com + api.github.com. WebFetch Tier 5 no longer requires explicit approval. |

---

## Pending Manual Action (Marcel)

### 1. agent-spawn-guard.js — VARIABLE ORDER BUG (critical fix needed)
Marcel inserted the SAFE_SUBAGENT_TYPES block before the `const subagentType/model` declarations. This causes a ReferenceError.

**Fix:** In `.claude/hooks/agent-spawn-guard.js`, ensure this order after line 31:
```javascript
// [YURI_ALLOW_AGENT block ends here]

  const subagentType = (payload.tool_input && payload.tool_input.subagent_type) || '<unspecified>';
  const description = (payload.tool_input && payload.tool_input.description) || '';
  const model = (payload.tool_input && payload.tool_input.model) || 'inherited';

  // Allow built-in read-only subagent types (no model pinning, no Anthropic risk)
  const SAFE_SUBAGENT_TYPES = ['Explore', 'Plan', 'statusline-setup', 'claude-code-guide'];
  if (SAFE_SUBAGENT_TYPES.includes(subagentType)) {
    process.exit(0);
  }

  // Allow explicit non-Anthropic model strings
  const NON_ANTHROPIC_PATTERNS = ['deepseek', 'gpt-', 'qwen', 'nvidia', 'nemotron', 'kimi', 'gemini', 'ollama', 'mistral', 'llama'];
  if (model !== 'inherited' && NON_ANTHROPIC_PATTERNS.some(p => model.toLowerCase().includes(p))) {
    process.exit(0);
  }

  const reason = [   // <-- rest of original code continues here
```

### 2. Curl Bash allow rule
`"Bash(*)"` is already in settings.json permissions.allow — all Bash is pre-approved. The earlier curl blocks were from a PreToolUse hook intercepting network commands. No additional settings change needed; curl to raw.githubusercontent.com should pass through now.

---

## Open Campaigns (Carry Forward)

| Item | Priority | Notes |
|------|----------|-------|
| P9 M4 Pro soak | When Mac Mini arrives | `ollama run deepseek-r1:8b` 24h test; update models.json local.deep_reasoning |
| P16 Kill-switch drill | Jun 14, 2026 | `unset ANTHROPIC_API_KEY && node Scripts/independence-check.mjs --strict` |
| yuri-shura enhancement | Low | Extract 7-vector adversary checklist from strategic-thinker brief into yuri-shura adversary lane prompt |
| codebase-to-course update | Low | Add code_context + last_output per-turn schema from socraticode brief |
| GitNexus index | When convenient | `npx gitnexus analyze` — stale since 3d83566 |

---

## Architecture State

### Routing (offload-contract.mjs)
- Default cortex: deepseek-v4-pro (was claude-sonnet-4-6)
- @amp.smart: gpt-5.5 reasoning:high
- @amp.deep: gpt-5.5
- claudeCouncilQualityGate: deepseek-v4-pro
- @claude: defined but removed from all default fan-out arrays (explicit opt-in only)

### Signal Engine (ensemble-inference.mjs)
| Leg | Model | Weight |
|-----|-------|--------|
| nemotron | nvidia/llama-3.1-nemotron-70b-instruct | 0.25 |
| grok | grok-beta | 0.20 |
| gpt4o | gpt-4o | 0.20 |
| deepseek | deepseek-chat | 0.20 |
| gemini | gemini-2.0-flash | 0.15 |

### Lane Dispatcher
`Scripts/lane-dispatcher.mjs` + `Scripts/lane-capability-manifest.json` (12 lanes). Future model migrations = JSON edit only. selectLane({ privacy, cost_tier, ctx_window }) returns best match.

### nexbox Bundle
`nexbox/` — zero-Anthropic portable runtime. symbiotic-pulse.mjs, offload-contract.mjs, verify.mjs, RUNBOOK.md, bin/bootstrap-ollama.sh. Ready for Mac Mini M4 Pro deployment.

### Memory System
- `memory.db`: 1238 items (432 suppressed, 89 low-trust). Last consolidation: 2026-05-14.
- `global.md`: now receiving synthesized rules via dream processor.
- `palace-index.md`: 12 hub concepts injected at SessionStart (stale — not automated).
- Learning score: 59/100 baseline (390 sessions).

### Independence Score Path to ≥90
Current 71/100. Remaining 5 warns:
- dispatchTokens legacy claude entries (intentional opt-in)
- P9 soak → models.json update (+2)
- P16 kill-switch drill confirmation (+2)
- Lane dispatcher 3+ consumer refactors (already done via P15, may unlock more)

---

## Verified Tests (run to confirm state)
```bash
node Scripts/independence-check.mjs | tail -5          # 71/100 fail=0 warn=5
node Scripts/memory-learning-score.mjs --report        # 59/100 baseline
node Scripts/nisaba-dream-processor.mjs --dry-run      # shows queue state
python3 _SYSTEM/OS_KERNEL/memory_governor.py health    # 1238 items
echo '{"event_type":"SessionStart"}' | node .claude/hooks/memory-rag-inject.js | head -3  # verify RAG output
```
