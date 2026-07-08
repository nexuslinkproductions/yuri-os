# OMP Subagent Spawn Config — delegation reliability fix

**Date:** 2026-07-08 · **Owner directive:** "improve the subagent spawn config within omp itself so the orchestration gets better and subagents are used more, right now the main sessions tend to do too much work still."

## Root cause (why subagents 'aren't used')
The OMP config `~/.omp/agent/config.yml` pinned the default `task` subagent to a **single provider with no fallback**:
- `modelRoles.task = zai/glm-5.2:xhigh` — every default `task()` dispatch hit z.ai GLM.
- `retry.fallbackChains = {}` — no fallback wired, despite `retry.modelFallback: true` being on.

When z.ai hit its **weekly cap** (429 code 1310, resets 2026-07-10), **every default subagent dispatch died** (verified: 3 discovery lanes + 2 smoke tests all 429'd). A dispatch path that dies teaches the orchestrator "delegation fails" → it hoards work. This is a core reason the main session over-works.

The `.claude/agents/*` roster (12 agents) is GLM-free; a `_SYSTEM/config/role-pools.json` failover design exists but is **advisory, never wired into OMP**. The fragility was entirely in OMP's default routing.

## Changes applied (`~/.omp/agent/config.yml` — NOT git-tracked; via `omp config set`)
```
modelRoles.task:  zai/glm-5.2:xhigh  ->  deepseek/deepseek-v4-pro   # reliable, independent ollama-cloud quota
retry.fallbackChains:
  "zai/glm-5.2:xhigh":        ["anthropic/claude-sonnet-4-6:xhigh", "deepseek/deepseek-v4-pro"]
  "deepseek/deepseek-v4-pro": ["anthropic/claude-sonnet-4-6:xhigh", "cursor/composer-2.5-fast"]
```
- Default subagents now use a capable model that does NOT depend on the GLM weekly quota.
- Any role still on `zai/glm-5.2` (commit, advisor, designer) degrades to sonnet-4-6 → deepseek-v4-pro on a cap.
- The new default itself has a fallback → resilient both ways.

## ⚠️ Verification limit (honest)
**OMP reads config at SESSION START.** An in-session `omp config set` does NOT take effect until the next launch — so this fix could NOT be smoke-tested live this session (both smoke tests still hit the cached GLM route). It applies on **Marcel's next `omp` launch**. Until then, in-session delegation must use explicit healthy agents (`deepseek-flash`, or the GLM-free `.claude/agents/*` roster), which work.

Residual uncertainty: whether `retry.fallbackChains` catches a *weekly-quota* 429 (vs transient) is unproven (session-cache blocked the live test). The `modelRoles.task` repoint does NOT depend on the fallback mechanism, so dispatch reliability holds regardless.

## Paired doctrine (committed, git-tracked)
- `_SYSTEM/config/cloud-fleet-models.json`: sonnet role fixed — was "Research analyst", now "Capable generalist (real coding/refactor/integration/analysis/verify)".
- `skills/fleet-economy/SKILL.md`: Iron Rule 5 now defines "trivial" concretely (≤1 known file, ≤~50 lines, no grep/glob, no multi-stage bash) to close the loophole; new "Dispatch reliability" section.

## Deferred levers (owner-gated — NOT built)
From the diagnosis, ranked; these were NOT auto-applied (bigger/more invasive — need Marcel's call):
1. **Hard PreToolUse gate** (`.claude/hooks/delegation-nudge.mjs` → blocking) — blocks reads/greps beyond a threshold unless a subagent was dispatched. Highest behavioral impact, but invasive (could block legitimate orchestrator reads). **Offer.**
2. **Delegation telemetry** — EOT report of dispatch-vs-inline ratio, flag <20%. Accountability loop.
3. **Assignment template + `/dispatch` shortcut** — lowers the friction of writing a good assignment.
