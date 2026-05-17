# Evidence Pack — Yuri OS Anthropic Independence Audit

Date: 2026-05-16
Runway: 30 days to 15-June-2026 Claude Agent SDK pricing change
Method: deterministic local grep (read-only, no Agent() spawns)
Authority: local truth only; advisor output marked `advisory_only=true`

## Evidence Contract Grammar (per `_SYSTEM/yuri-origin.md`)

```
TERM_COUNT term=<TERM> count=<N>
FILE_COUNT file=<PATH> count=<N>
MATCH file=<PATH> term=<TERM> line=<N> excerpt="<bounded text>"
```

---

## §1 Subagent Definitions — `.claude/agents/`

```
FILE_COUNT file=.claude/agents/*.md count=11
TERM_COUNT term=^model: count=0
```

Files (all without `model:` field, all inherit parent session model):
- architect.md
- argus.md (native_function — deterministic, no model needed)
- cassandra.md
- doc-cleaner.md
- file-inventory.md
- hermes.md (native_function — deterministic)
- log-summarizer.md
- memory-curator.md
- noesis-linter.md
- obliteratus-qa.md (native_function — deterministic)
- security-reviewer.md

**Verdict:** 8/11 are model-backed and will inherit whatever model the parent session uses → currently Sonnet (`.claude/settings.json:89`). 3/11 are already native_function deterministic and Anthropic-safe.

## §2 Direct Anthropic API References — _SYSTEM/Scripts/

```
MATCH file=_SYSTEM/Scripts/offload-contract.mjs line=110 term=claude-opus-4-7 excerpt="smart: { model: 'claude-opus-4-7', context: '300k', use: 'unconstrained impl' }"
MATCH file=_SYSTEM/Scripts/offload-contract.mjs line=176 term=claude excerpt="dispatchTokens: ['claude', 'claude-3-5-sonnet', 'claude-3-5-sonnet-liberated', 'claude-3-opus']"
MATCH file=_SYSTEM/Scripts/offload-contract.mjs line=270 term=claude-sonnet-4-6 excerpt="model: 'claude-sonnet-4-6'"
MATCH file=_SYSTEM/Scripts/yuri-symbiotic-pulse.mjs line=250 term=claude-sonnet-4-6 excerpt="model: 'claude-sonnet-4-6'"
MATCH file=_SYSTEM/Scripts/trading-bot/ensemble-inference.mjs line=25 term=api.anthropic.com excerpt="baseUrl: 'https://api.anthropic.com/v1'"
MATCH file=_SYSTEM/Scripts/trading-bot/ensemble-inference.mjs line=27 term=claude-sonnet-4 excerpt="model: 'claude-sonnet-4-20250514'"
MATCH file=_SYSTEM/Scripts/token-ledger.mjs line=65-67 term=claude-* excerpt="pricing rows for sonnet/opus/haiku"
MATCH file=_SYSTEM/Scripts/ai line=272 term=claude-sonnet-4-6 excerpt="printf '# model: claude-sonnet-4-6\n'"
MATCH file=_SYSTEM/Scripts/ai line=1103 term=claude-sonnet-4-6 excerpt='printf MODEL claude-sonnet-4-6'
MATCH file=_SYSTEM/Scripts/ai line=1128 term=claude-sonnet-4-6 excerpt='printf MODEL claude-sonnet-4-6'
MATCH file=_SYSTEM/Scripts/offload.sh line=367 term=claude-3* excerpt="claude-3-5-sonnet-liberated|claude-3-5-sonnet|claude-3-opus|claude)"
```

## §3 Hooks — `.claude/hooks/*.js`

```
FILE_COUNT file=.claude/hooks/*.js count=37
MATCH file=.claude/hooks/nisaba-dream.js line=75 term=claude-haiku-4-5 excerpt="claude -p --model claude-haiku-4-5 ... --allowedTools Write,Edit,Read"
MATCH file=.claude/hooks/token-status.js line=52-54 term=claude-* excerpt="pricing rows (telemetry only)"
MATCH file=.claude/hooks/agent-spawn-guard.js line=38 term=BANNED excerpt="Agent() with Anthropic models is BANNED — hard floor enforced"
```

**Verdict:** Only **1 active Anthropic spawn** in hooks (`nisaba-dream.js:75`). All other Claude refs in hooks are pricing telemetry or the guard itself. `agent-spawn-guard.js` is the enforcement floor that already blocks `Agent()`-style spawns.

## §4 End-of-Transmission Skill — `.claude/skills/end-of-transmission/SKILL.md`

```
MATCH line=29  term=haiku-4-5 excerpt="Agent({ model: 'haiku-4-5-20251001', run_in_background: true }) — micro-EOT trigger"
MATCH line=404 term=haiku_worker excerpt="eot-005b owner=haiku_worker model=haiku-4-5-20251001"
MATCH line=405 term=haiku_worker excerpt="eot-006 owner=haiku_worker model=haiku-4-5-20251001"
MATCH line=406 term=haiku_worker excerpt="eot-007 owner=haiku_worker model=haiku-4-5-20251001"
```

**Verdict:** Every `/eot` cycle spawns ≥4 Anthropic Haiku workers by design. Post-15-June this becomes the **single highest token-volume Anthropic dependency** because EOT runs on session-close + auto-triggers at context ≥60%.

## §5 Pulse Orchestrator — `_SYSTEM/Scripts/pulse-orchestrator.mjs`

```
FILE_COUNT file=_SYSTEM/Scripts/pulse-orchestrator.mjs lines=533
MATCH line=414 term=@claude excerpt="['security', '@claude']"
```

**Verdict:** Pulse Cortex itself routes the `security` advisor role to `@claude` lane. One actionable surface; rest of the orchestrator routes through `@deepseek`, `@nvidia-nemotron`, `@codex-spark`, `@kimi`, `@swarm`.

## §6 Skill Frontmatter Sweep — `.claude/skills/`

```
FILE_COUNT file=.claude/skills/*/SKILL.md count=34
TERM_COUNT term=^model:_in_frontmatter count=0
```

No SKILL.md frontmatter declares a model. Model selection happens inside the skill body (most route via `_SYSTEM/Scripts/offload.sh -m <lane>` which is non-Anthropic) or via Agent() (blocked by guard). Lane discipline is good; specific audit per skill body is packet #10 work.

## §7 Local Runtime Snapshot — `ollama list` (M2 Pro 16 GB, 2026-05-16)

```
qwen2.5-coder:7b           4.7 GB    code primary
qwen2.5:7b                 4.7 GB    general primary (actually-used; supersedes models.json's llama3.2 default)
qwen3.5:4b                 3.4 GB    lightweight triage
gemma4:latest              9.6 GB    manual-only (16 GB ceiling pressure)
gemma4:e2b                 7.2 GB    multimodal
deepseek-r1:8b             5.2 GB    deep reasoning (models.json marks "frozen" — needs M4 Pro retest)
deepseek-r1:latest         5.2 GB    duplicate
deepseek-liberated:latest  8.9 GB    manual-only
deepseek-v2:16b            8.9 GB    manual-only
starcoder2:latest          1.7 GB    code fallback
llama3.2:latest            2.0 GB    legacy primary (per models.json — superseded in practice)
qwen-liberated:latest      4.7 GB    experimental
nomic-embed-text:latest    274 MB    embeddings
```

**Verdict:** Local arsenal is healthier than `.claude/config/models.json` claims. `qwen2.5:7b` and `qwen2.5-coder:7b` are battle-ready under 5 GB each → fit M4 Pro 16 GB Mac Mini floor comfortably. `deepseek-r1:8b` frozen flag dates from M2 Pro 16 GB tests — needs re-verification on M4 Pro stations.

## §8 Non-Anthropic Cloud Lanes (Independence-Safe)

| Lane | Provider | Status | June 15 risk |
|------|----------|--------|--------------|
| @deepseek (v4-pro, v4-flash) | api.deepseek.com | Live, tools-on | None |
| @kimi (k2.6) | moonshot | Live | None |
| @nvidia (nemotron, llama, qwen) | NVIDIA NIM | Live, tools-on | None |
| @gpt-5.5 / @gpt-5.4-mini | Codex / OpenAI | Live, primary impl lane | None |
| @amp (smart, deep, rush) | Amp | Live — but `smart` mode = claude-opus-4-7 cloud-billed | **MIXED** (smart=Claude, deep=GPT-5.5, rush=fast) |
| @codex-spark | Codex sandbox | Live | None |
| @gpt-oss | OpenAI gpt-oss | Live | None |
| @perplexity | Perplexity (computer-use) | Live | None |
| @comet | browser-use | Live | None |

## §9 NEXUSLINK / Symbiotic Pulse Surface

```
FILE_COUNT file=src/components/NexusLinkLanding.tsx lines=423
FILE_COUNT file=src/lib/nexusLinkLanding.ts lines=122
FILE_COUNT file=src/lib/nexuslinkLandingData.ts lines=80
FILE_COUNT file=docs/SYMBIOTIC_PULSE_V1.md present=true
FILE_COUNT file=_SYSTEM/Scripts/yuri-symbiotic-pulse.mjs present=true
FILE_COUNT file=_SYSTEM/Scripts/yuri-canonical-memory-import.mjs present=true
FILE_COUNT file=_SYSTEM/NEXUSLINK/nexbox-handoff-v1.md present=false (to-create)
```

Current NEXUSLINK content is a research/sources board (Linear/Vercel/Apple/Primer/Atlassian/Notion design radar). No client-deliverable "symbiotic independence" section. No bundled runtime for nexbox handoffs.

## §9b Deep SDK Lock-in — `@anthropic-ai/sdk` imports

DeepSeek advisory flagged that model-name strings underestimate the lock-in surface. SDK-level imports found:

```
MATCH file=backend/src/services/providers/anthropicProvider.ts line=1 term=@anthropic-ai/sdk excerpt="import Anthropic from '@anthropic-ai/sdk'"
MATCH file=backend/package.json line=21 term=@anthropic-ai/sdk excerpt="^0.39.0"
MATCH file=NEURAL-NETWORK/GitNexus/gitnexus-web/package-lock.json line=1495 term=@anthropic-ai/sdk excerpt="^0.71.0"
MATCH file=NEURAL-NETWORK/GitNexus/gitnexus-web/vite.config.ts line=21 term=@anthropic-ai/sdk excerpt="alias transform-json-schema"
```

Plus search for `cache_control`, `betas`, `thinking.budget_tokens`, `anthropic-beta` returned no hits → no Anthropic-extended-features lock-in beyond the base SDK.

**Verdict:** 2 live SDK consumers (backend provider + GitNexus web). These continue to function post-15-June; they're regular API clients billed under the standard API tier. They are *not* part of the Agent SDK pricing change but should be inventoried for cost-projection purposes.

## §9c NEW SURFACE — Skill-bound `agent.md` files (verifier finding)

`_SYSTEM/Scripts/independence-check.mjs` surfaced 5 skill-scoped `agent.md` files carrying **explicit** Anthropic models. Separate surface from `.claude/agents/` parent-inheritance subagents — these are skill-embedded agent definitions that fire when the skill activates.

```
MATCH file=.claude/skills/execution-domain-core/agent.md line=4 term=claude-sonnet-4-6 excerpt="model: claude-sonnet-4-6"
MATCH file=.claude/skills/failure-evolution-loop/agent.md line=4 term=claude-haiku-4-5-20251001 excerpt="model: claude-haiku-4-5-20251001"
MATCH file=.claude/skills/non-destructive-infinity-guard/agent.md line=4 term=claude-sonnet-4-6 excerpt="model: claude-sonnet-4-6"
MATCH file=.claude/skills/parallel-clone-orchestrator/agent.md line=4 term=claude-sonnet-4-6 excerpt="model: claude-sonnet-4-6"
MATCH file=.claude/skills/pattern-mirror-core/agent.md line=4 term=claude-sonnet-4-6 excerpt="model: claude-sonnet-4-6"
```

**Additional skill-scoped Anthropic references (advisory / documentation, lower severity):**
- `.claude/skills/yuri-shura/SKILL.md:29` — `@claude-sonnet-advisory | sonnet-4-6` in 6-perspective advisor table
- `.claude/skills/tokenmaxxing/SKILL.md:60` — documents `Agent({ model: 'haiku' })` as the local-fail fallback
- `.claude/skills/openclaw-offload/SKILL.md:82` — example string mentions `anthropic/claude-opus-4-6` as an override option

**Verdict:** Initial grep missed `.claude/skills/*/agent.md` because the sweep was scoped to `SKILL.md`. Adds 5 high-severity surfaces. Verifier-confirmed true positives. Captured as Packet #17 in build list.

## §9d Verifier Smoke-Test Result (2026-05-16)

```
node _SYSTEM/Scripts/independence-check.mjs
  FAIL: 16
  WARN: 19
  PASS: 3
  Independence score (this run): ~8 / 100 (raw)
```

Raw score is harsher than the §1–§9 evidence-weighted score because the verifier counts every Anthropic-related text occurrence, including a few false-positives in negative-context documentation (e.g. `obliteratus-qa.md:17` saying "must not run as claude -p" matches the `claude -p` regex). Build-list Packet #13 includes refinement of false-positive suppression.

## §10 Authority Chain Confirmation

Per `_SYSTEM/yuri-origin.md`:

```
1. Owner intent
2. Direct local evidence
3. _SYSTEM/yuri-origin.md
4. SOUL.md
5. Thin adapters (CLAUDE.md, AGENTS.md, ...)
6. _SYSTEM/Scripts/offload-contract.mjs
7. On-demand references and skills
8. Model inference (lowest priority)
```

All advisor output from this audit (including the DeepSeek advisory triggered in parallel) is `advisory_only=true` per the contract. Codex remains the only implementation authority per `AGENTS.md`.

---

## Independence Score (today)

| Surface | Weight | Anthropic-exposed % | Score |
|---------|--------|---------------------|-------|
| Subagents | 30 | 73% (8/11) | 8.1 |
| Hooks | 20 | 3% (1/37 active spawn) | 19.5 |
| Default model | 15 | 100% | 0.0 |
| EOT skill | 15 | 100% (≥4 haiku/session-close) | 0.0 |
| Symbiotic Pulse default | 10 | 100% (line 250) | 0.0 |
| offload-contract default lanes | 5 | partial (@amp.smart, @claude exists) | 2.5 |
| _SYSTEM/Scripts/trading-bot | 3 | 100% | 0.0 |
| Other _SYSTEM/Scripts/* (status banners) | 2 | low (cosmetic) | 1.5 |
| **TOTAL** | **100** | — | **31.6 / 100** |

**Target by 14-June-2026: ≥ 90 / 100.**

---

## Replacement Lane Map (preferred, non-Anthropic)

| Replaced | Replace with | Tier |
|----------|--------------|------|
| Subagent (architect, security-reviewer) | @deepseek-v4-pro reasoning | Cloud (non-Anthropic) |
| Subagent (doc-cleaner, log-summarizer, file-inventory, memory-curator) | qwen2.5:7b via ollama-bridge | Local |
| Subagent (cassandra, noesis-linter) | qwen2.5:7b OR deepseek-v4-flash | Local-first |
| EOT haiku workers | deepseek-v4-flash (cloud) OR qwen2.5:7b (local) per phase weight | Hybrid |
| Symbiotic Pulse default cortex | @deepseek-v4-pro | Cloud (non-Anthropic) |
| @amp.smart default | @gpt-5.5 (Codex) | Cloud (non-Anthropic) |
| nisaba-dream | qwen2.5-coder:7b (Write/Edit are deterministic tools, local model sufficient) | Local |
| trading-bot ensemble | DeepSeek + Kimi + NVIDIA Nemotron ensemble | Cloud (non-Anthropic) |
| Session default `sonnet` | Remove key OR set Codex wrapper | N/A |
