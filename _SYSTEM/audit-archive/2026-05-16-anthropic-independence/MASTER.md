# Yuri OS Independence Audit — Pre-15-June Sovereignty Sprint
## Master Deliverable · 2026-05-16

> Single-file consolidation of: executive audit · evidence pack · 17-packet build list · NEXUSLINK nexbox handoff packet · verifier reference.
>
> Sibling artifacts (rendered surfaces, optional):
> - `AUDIT.html` — styled one-page audit (Mermaid + Chart.js)
> - `AUDIT-DECK.html` — 10-slide reveal deck
> - `_SYSTEM/Scripts/independence-check.mjs` — runnable verifier
> - `_SYSTEM/NEXUSLINK/nexbox-handoff-v1.md` — also embedded below as §D

---

# §A · Executive Audit

## A.1 Context

Anthropic is moving Claude Agent SDK operations to **separately billed pay-per-token API** on **15 June 2026**. Today is **2026-05-16** → **30-day runway**.

If Yuri OS is still implicitly running on Anthropic-backed subagents, hooks, and routing fallbacks on that date, every `Agent()`, every auto-spawned hook subagent, and every `claude -p` shell-out becomes a metered API call billed on top of the Claude Code subscription.

**Verdict (5 lines):**
1. Today: **31.6 / 100** independence-weighted · **~8 / 100** raw verifier.
2. Target: **≥ 90 / 100** by 2026-06-14 (D-1).
3. Sprint burn: **~17 working days** parallel · **~13 day buffer** against 30-day calendar.
4. No new hardware. No new vendor. No Claude-Code migration.
5. NEXUSLINK nexbox handoff packet ships with the sprint — clients inherit sovereignty by default.

## A.2 Threat Model — what changes on 15 June

| Surface | Today | Post-15-June risk |
|---|---|---|
| 11 subagents in `.claude/agents/` w/o `model:` field | inherit Sonnet/Opus from session default | every spawn → metered API call |
| `.claude/settings.json:89` default `"sonnet"` | implicit Anthropic for all session-default ops | full session metered |
| EOT skill spawns ≥4 Haiku workers / `/eot` | auto-triggers at context ≥60% | recurring high-volume cost |
| `.claude/hooks/nisaba-dream.js:75` shells `claude -p haiku` | only live shell-out post-guard | per-fire metered |
| `_SYSTEM/Scripts/yuri-symbiotic-pulse.mjs:250` defaults `claude-sonnet-4-6` | cortex routing brain is itself Anthropic | every pulse metered |
| `@amp.smart=claude-opus-4-7` · `@claude` lane | hybrid + opt-in | only `@amp.smart` auto-fires |
| 5 skill `agent.md` files (verifier-discovered) | hardcoded Anthropic models | per-skill-trigger metered |

## A.3 Independence Score — weighted breakdown

| Surface | Weight | Anthropic-exposed % | Score |
|---|---|---|---|
| Subagents | 30 | 73% (8/11) | 8.1 |
| Hooks | 20 | 3% (1/37 active spawn) | 19.5 |
| Default model | 15 | 100% | 0.0 |
| EOT skill | 15 | 100% | 0.0 |
| Symbiotic Pulse default | 10 | 100% | 0.0 |
| offload-contract default lanes | 5 | partial | 2.5 |
| _SYSTEM/Scripts/trading-bot | 3 | 100% | 0.0 |
| Other _SYSTEM/Scripts/* | 2 | low (cosmetic) | 1.5 |
| **TOTAL** | **100** | — | **31.6** |

## A.4 Current Phase Map (text rendering)

```
[ User Input ]
      ↓
[ Pulse Seed ] → [ Symbiotic Pulse Cortex ]  🔴 line 250 = claude-sonnet-4-6
      ↓
[ Arsenal Registry ]
      ├─ 🔴 .claude/agents/  (11 subagents, no model:)
      ├─ 🔴 EOT skill        (4+ Haiku workers per /eot)
      ├─ 🔴 nisaba-dream.js:75  (claude -p haiku)
      ├─ 🔴 5 skill agent.md files  (verifier-discovered)
      ├─ 🔴 @amp.smart       (claude-opus-4-7)
      ├─ 🟡 @claude lane     (advisory · sonnet-4-6)
      ├─ 🟢 @deepseek (v4-pro · v4-flash)
      ├─ 🟢 @kimi K2.6
      ├─ 🟢 @nvidia NIM (nemotron · llama-3.3-70b)
      ├─ 🟢 @gpt-5.5 · @gpt-5.4-mini (Codex)
      ├─ 🟢 @perplexity · @comet
      ├─ 🔵 qwen2.5-coder:7b
      ├─ 🔵 qwen2.5:7b · qwen3.5:4b
      ├─ 🔵 deepseek-r1:8b (frozen → re-test M4 Pro)
      └─ 🔵 nomic-embed-text

Native gates (always-on, deterministic): ARGUS · HERMES · OBLITERATUS · CASSANDRA-lite
Hard floor: .claude/hooks/agent-spawn-guard.js (blocks Agent() w/ Anthropic models)
```

Legend: 🔴 Anthropic-only · 🟡 Hybrid w/ Anthropic fallback · 🟢 Non-Anthropic cloud · 🔵 Local

## A.5 Cost Projection (single-developer profile, indicative)

| Month | Status-quo (no sprint) | Post-sprint (council opt-in only) |
|---|---|---|
| Jun-26 | $425 | $15 |
| Jul-26 | $860 | $40 |
| Aug-26 | $920 | $45 |
| Sep-26 | $980 | $40 |

Ratio: **~20×**. Estimates use EOT firing 6×/day with 4 Haiku workers, nisaba-dream 2×/day, ambient subagent inheritance ~8 Sonnet-equivalent calls/day. Numbers are for ranking purposes, not invoicing.

## A.6 Verification Plan — proving independence on 14 June

1. `_SYSTEM/Scripts/independence-check.mjs --strict` returns `exit 0` with `YURI_NO_ANTHROPIC=1`.
2. Full `/eot` cycle under kill-switch → zero Claude calls in `_SYSTEM/cost-trends.md`.
3. 24h fresh session with kill-switch on → productivity delta vs prior baseline.
4. `gitnexus_detect_changes()` after every packet → scope matches expectation.
5. Independence score re-computed → **≥ 90 / 100 required for PASS**.

## A.7 Out of Scope (explicit)

- Migrating away from Claude Code itself (stays as IDE/CLI surface).
- Re-architecting Codex protocol (already non-Anthropic).
- Replacing Perplexity, NVIDIA NIM, Kimi, Amp (all non-Anthropic, all stay).
- New hardware beyond existing Mac Mini M4 Pro 16 GB floor.

---

# §B · Evidence Pack (deterministic local recon)

Method: Bash grep + Read (read-only, no Agent() spawns).
Authority: local truth only; advisor output marked `advisory_only=true`.

## B.1 Evidence Contract Grammar (per `_SYSTEM/yuri-origin.md`)

```
TERM_COUNT term=<TERM> count=<N>
FILE_COUNT file=<PATH> count=<N>
MATCH file=<PATH> term=<TERM> line=<N> excerpt="<bounded text>"
```

## B.2 Subagent Definitions — `.claude/agents/`

```
FILE_COUNT file=.claude/agents/*.md count=11
TERM_COUNT term=^model: count=0
```

All 11 files (no `model:` field — inherit parent session model):
- architect.md
- argus.md (native_function — deterministic)
- cassandra.md
- doc-cleaner.md
- file-inventory.md
- hermes.md (native_function — deterministic)
- log-summarizer.md
- memory-curator.md
- noesis-linter.md
- obliteratus-qa.md (native_function — deterministic)
- security-reviewer.md

**Verdict:** 8/11 model-backed agents inherit session default (currently Sonnet). 3/11 already native_function Anthropic-safe.

## B.3 Direct Anthropic API references — `_SYSTEM/Scripts/`

```
MATCH file=_SYSTEM/Scripts/offload-contract.mjs line=110 term=claude-opus-4-7 excerpt="smart: { model: 'claude-opus-4-7' }"
MATCH file=_SYSTEM/Scripts/offload-contract.mjs line=176 term=claude excerpt="dispatchTokens: ['claude', 'claude-3-5-sonnet', 'claude-3-5-sonnet-liberated', 'claude-3-opus']"
MATCH file=_SYSTEM/Scripts/offload-contract.mjs line=270 term=claude-sonnet-4-6 excerpt="model: 'claude-sonnet-4-6'"
MATCH file=_SYSTEM/Scripts/yuri-symbiotic-pulse.mjs line=250 term=claude-sonnet-4-6 excerpt="model: 'claude-sonnet-4-6'"
MATCH file=_SYSTEM/Scripts/trading-bot/ensemble-inference.mjs line=25 term=api.anthropic.com excerpt="baseUrl: 'https://api.anthropic.com/v1'"
MATCH file=_SYSTEM/Scripts/trading-bot/ensemble-inference.mjs line=27 term=claude-sonnet-4 excerpt="model: 'claude-sonnet-4-20250514'"
MATCH file=_SYSTEM/Scripts/token-ledger.mjs line=65-67 term=claude-* excerpt="pricing rows for sonnet/opus/haiku"
MATCH file=_SYSTEM/Scripts/ai line=272 term=claude-sonnet-4-6 excerpt="printf '# model: claude-sonnet-4-6'"
MATCH file=_SYSTEM/Scripts/ai line=1103 term=claude-sonnet-4-6 excerpt='printf MODEL claude-sonnet-4-6'
MATCH file=_SYSTEM/Scripts/ai line=1128 term=claude-sonnet-4-6 excerpt='printf MODEL claude-sonnet-4-6'
MATCH file=_SYSTEM/Scripts/offload.sh line=367 term=claude-3* excerpt="claude-3-5-sonnet-liberated|claude-3-5-sonnet|claude-3-opus|claude)"
```

## B.4 Hooks — `.claude/hooks/*.js`

```
FILE_COUNT file=.claude/hooks/*.js count=37
MATCH file=.claude/hooks/nisaba-dream.js line=75 term=claude-haiku-4-5 excerpt="claude -p --model claude-haiku-4-5 ... --allowedTools Write,Edit,Read"
MATCH file=.claude/hooks/token-status.js line=52-54 term=claude-* excerpt="pricing rows (telemetry only)"
MATCH file=.claude/hooks/agent-spawn-guard.js line=38 term=BANNED excerpt="Agent() with Anthropic models is BANNED — hard floor enforced"
```

**Verdict:** Only **1 active Anthropic spawn** in hooks (`nisaba-dream.js:75`). Other Claude refs in hooks are pricing telemetry or the guard itself.

## B.5 End-of-Transmission Skill

```
MATCH line=29  term=haiku-4-5 excerpt="Agent({ model: 'haiku-4-5-20251001', run_in_background: true })"
MATCH line=404 term=haiku_worker excerpt="eot-005b owner=haiku_worker model=haiku-4-5-20251001"
MATCH line=405 term=haiku_worker excerpt="eot-006 owner=haiku_worker model=haiku-4-5-20251001"
MATCH line=406 term=haiku_worker excerpt="eot-007 owner=haiku_worker model=haiku-4-5-20251001"
```

**Verdict:** Every `/eot` cycle spawns ≥4 Anthropic Haiku workers by design. Post-15-June: **single highest token-volume Anthropic dependency**.

## B.6 Pulse Orchestrator

```
FILE_COUNT file=_SYSTEM/Scripts/pulse-orchestrator.mjs lines=533
MATCH line=414 term=@claude excerpt="['security', '@claude']"
```

**Verdict:** Cortex routes `security` advisor role to `@claude` lane. One actionable surface; rest already non-Anthropic.

## B.7 Local Runtime Snapshot — `ollama list` (M2 Pro 16 GB, 2026-05-16)

```
qwen2.5-coder:7b           4.7 GB    code primary
qwen2.5:7b                 4.7 GB    general primary (de-facto today; supersedes models.json llama3.2)
qwen3.5:4b                 3.4 GB    lightweight triage
gemma4:latest              9.6 GB    manual-only (16 GB ceiling pressure)
gemma4:e2b                 7.2 GB    multimodal
deepseek-r1:8b             5.2 GB    deep reasoning (frozen — re-test on M4 Pro)
deepseek-r1:latest         5.2 GB    duplicate
deepseek-liberated:latest  8.9 GB    manual-only
deepseek-v2:16b            8.9 GB    manual-only
starcoder2:latest          1.7 GB    code fallback
llama3.2:latest            2.0 GB    legacy primary
qwen-liberated:latest      4.7 GB    experimental
nomic-embed-text:latest    274 MB    embeddings
```

**Verdict:** Local arsenal healthier than `models.json` claims. `qwen2.5:7b` + `qwen2.5-coder:7b` battle-ready under 5 GB → comfortable fit on M4 Pro 16 GB Mac Mini floor.

## B.8 Non-Anthropic Cloud Lanes (Independence-Safe)

| Lane | Provider | Status | June 15 risk |
|---|---|---|---|
| @deepseek (v4-pro · v4-flash) | api.deepseek.com | Live, tools-on | None |
| @kimi (k2.6) | moonshot | Live | None |
| @nvidia (nemotron · llama · qwen) | NVIDIA NIM | Live, tools-on | None |
| @gpt-5.5 / @gpt-5.4-mini | Codex / OpenAI | Live, primary impl | None |
| @amp (smart, deep, rush) | Amp | Live — but `smart`=claude-opus-4-7 | **MIXED** |
| @codex-spark | Codex sandbox | Live | None |
| @gpt-oss | OpenAI gpt-oss | Live | None |
| @perplexity | Perplexity (computer-use) | Live | None |
| @comet | browser-use | Live | None |

## B.9 NEXUSLINK / Symbiotic Pulse Surface

```
FILE_COUNT file=src/components/NexusLinkLanding.tsx lines=423
FILE_COUNT file=src/lib/nexusLinkLanding.ts lines=122
FILE_COUNT file=src/lib/nexuslinkLandingData.ts lines=80
FILE_COUNT file=docs/SYMBIOTIC_PULSE_V1.md present=true
FILE_COUNT file=_SYSTEM/Scripts/yuri-symbiotic-pulse.mjs present=true
FILE_COUNT file=_SYSTEM/Scripts/yuri-canonical-memory-import.mjs present=true
FILE_COUNT file=_SYSTEM/NEXUSLINK/nexbox-handoff-v1.md present=true (created 2026-05-16)
```

Current NEXUSLINK content = research/sources board (Linear/Vercel/Apple/Primer/Atlassian/Notion design radar). No client-deliverable "symbiotic independence" section before this audit. Nexbox handoff packet drafted as §D below.

## B.10 Deep SDK Lock-in — `@anthropic-ai/sdk` imports

DeepSeek advisor flagged model-name strings underestimate lock-in. SDK-level imports:

```
MATCH file=backend/src/services/providers/anthropicProvider.ts line=1 term=@anthropic-ai/sdk excerpt="import Anthropic from '@anthropic-ai/sdk'"
MATCH file=backend/package.json line=21 term=@anthropic-ai/sdk excerpt="^0.39.0"
MATCH file=NEURAL-NETWORK/GitNexus/gitnexus-web/package-lock.json line=1495 term=@anthropic-ai/sdk excerpt="^0.71.0"
MATCH file=NEURAL-NETWORK/GitNexus/gitnexus-web/vite.config.ts line=21 term=@anthropic-ai/sdk excerpt="alias transform-json-schema"
```

Searches for `cache_control`, `betas`, `thinking.budget_tokens`, `anthropic-beta` returned **no hits** → no Anthropic-extended-features lock-in beyond base SDK.

**Verdict:** 2 live SDK consumers. These continue to function post-15-June — billed under standard API tier, **not** affected by Agent SDK pricing change. Inventoried for cost projection only.

## B.11 NEW SURFACE — Skill-bound `agent.md` files (verifier-discovered)

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
- `.claude/skills/tokenmaxxing/SKILL.md:60` — documents `Agent({ model: 'haiku' })` as local-fail fallback
- `.claude/skills/openclaw-offload/SKILL.md:82` — example string mentions `anthropic/claude-opus-4-6`

**Verdict:** Initial grep missed `.claude/skills/*/agent.md` (sweep scoped to `SKILL.md`). Adds 5 high-severity surfaces. Captured as Packet #17.

## B.12 Verifier Smoke-Test Result (2026-05-16)

```
node _SYSTEM/Scripts/independence-check.mjs
  FAIL: 16
  WARN: 19
  PASS: 3
  Independence score (this run): ~8 / 100 (raw)
```

Raw score harsher than §A.3 weighted score because verifier counts every Anthropic text occurrence including false-positives in negative-context docs (e.g. `obliteratus-qa.md:17` says "must not run as `claude -p`" matching the regex). Packet #13 includes false-positive suppression.

## B.13 Authority Chain Confirmation (per `_SYSTEM/yuri-origin.md`)

```
1. Owner intent
2. Direct local evidence
3. _SYSTEM/yuri-origin.md
4. SOUL.md
5. Thin adapters
6. _SYSTEM/Scripts/offload-contract.mjs
7. On-demand references and skills
8. Model inference (lowest)
```

All advisor output (including DeepSeek pass during audit) is `advisory_only=true · local_truth_claim=false`. Codex remains only implementation authority per `AGENTS.md`.

## B.14 Replacement Lane Map (preferred, non-Anthropic)

| Replaced | Replace with | Tier |
|---|---|---|
| Subagent (architect, security-reviewer) | @deepseek-v4-pro | Cloud (non-Anthropic) |
| Subagent (doc-cleaner, log-summarizer, file-inventory, memory-curator) | qwen2.5:7b via ollama-bridge | Local |
| Subagent (cassandra, noesis-linter) | qwen2.5:7b OR deepseek-v4-flash | Local-first |
| EOT haiku workers | deepseek-r1:8b (local) · deepseek-v4-flash (overflow) | Hybrid |
| Symbiotic Pulse default cortex | @deepseek-v4-pro | Cloud (non-Anthropic) |
| @amp.smart default | @gpt-5.5 (Codex) | Cloud (non-Anthropic) |
| nisaba-dream | qwen2.5-coder:7b · or strip model entirely | Local |
| trading-bot ensemble | DeepSeek + Kimi + Nemotron tri-ensemble | Cloud (non-Anthropic) |
| Session default `sonnet` | Remove key · or Codex wrapper | N/A |

---

# §C · Ranked Build List — 17 packets · 17-day parallel burn

Each packet shaped per `CLAUDE CONTROL PACKET` grammar (Goal · Target files · Constraints · Acceptance · Test · Rollback · Route-plan classification · GitNexus impact · Verification). Ordered per DeepSeek advisory: **control-plane before data-plane**.

## Packet 1 — De-Claude Symbiotic Pulse default cortex

- **Goal:** Symbiotic Pulse runtime defaults to a non-Anthropic model. Claude becomes opt-in only via explicit dispatch token.
- **Target files:** `_SYSTEM/Scripts/yuri-symbiotic-pulse.mjs:250`
- **Constraints:** No new dependencies. Existing `_SYSTEM/Scripts/offload-contract.mjs` lane vocabulary intact. Council-dissent mode (`@claude` advisory) still available when explicitly named.
- **Acceptance:**
  - [ ] Default `model:` at line 250 reads `deepseek-v4-pro` (or capability lookup once Packet #15 lands).
  - [ ] `_SYSTEM/Scripts/yuri-symbiotic-pulse.test.mjs` passes unchanged.
  - [ ] Pulse trace shows `lane=@deepseek-v4-pro` on freshly seeded test prompt.
- **Test:** `node _SYSTEM/Scripts/yuri-symbiotic-pulse.test.mjs && node _SYSTEM/Scripts/yuri-symbiotic-pulse.mjs --self-check`
- **Rollback:** `git diff _SYSTEM/Scripts/yuri-symbiotic-pulse.mjs` ≤ 6 lines.
- **Route-plan:** critical · architectural · cortex migration.
- **GitNexus impact:** required upstream.
- **ETA:** 1d · **Owner:** Codex.

## Packet 2 — Switch session default model away from sonnet

- **Goal:** `.claude/settings.json` no longer pins Anthropic Sonnet as per-session default.
- **Target files:** `.claude/settings.json:89`
- **Constraints:** Claude Code may require some `"model"` value; if so, set non-Anthropic placeholder or remove key entirely.
- **Acceptance:**
  - [ ] `jq '.model' .claude/settings.json` returns `null` or non-Anthropic.
  - [ ] Fresh session boot → no automatic Sonnet usage.
- **Test:** `node _SYSTEM/Scripts/independence-check.mjs --check=default-model`
- **Rollback:** single-line edit.
- **Route-plan:** high-stakes · global config · main-session approval.
- **ETA:** 0.5d · **Owner:** Claude (control plane) + Marcel (approval).

## Packet 3 — Add `model:` field to all 11 subagents

- **Goal:** Every `.claude/agents/*.md` declares explicit non-Anthropic model OR is converted to `runtime kind: native_function`.
- **Target files:** all 11 files under `.claude/agents/`
- **Per-agent assignment:**
  - `architect.md` → `model: deepseek-v4-pro`
  - `security-reviewer.md` → `model: deepseek-v4-pro`
  - `cassandra.md` → `model: deepseek-v4-flash`
  - `doc-cleaner.md` → `model: qwen2.5:7b` (local)
  - `file-inventory.md` → `model: qwen2.5:7b` (local)
  - `log-summarizer.md` → `model: qwen2.5:7b` (local)
  - `memory-curator.md` → `model: deepseek-v4-flash`
  - `noesis-linter.md` → `model: qwen2.5:7b` (local)
  - `argus.md`, `hermes.md`, `obliteratus-qa.md` → already `native_function` — verify frontmatter
- **Acceptance:**
  - [ ] `grep -h "^model:" .claude/agents/*.md | sort | uniq` returns zero `claude-*` values.
  - [ ] EOT Patch 001 verification: all 11 have `model:` AND `description:` non-empty (except 3 native_function with `runtime: native_function`).
- **Test:** `node _SYSTEM/Scripts/independence-check.mjs --check=subagents`
- **Rollback:** per-file diff ≤ 4 lines.
- **Route-plan:** high-stakes · routing · agent harness.
- **ETA:** 2d · **Owner:** Codex.

## Packet 4 — EOT skill · migrate Haiku workers to local deepseek-r1:8b

- **Goal:** `/eot` no longer spawns Anthropic Haiku workers as default. Local `deepseek-r1:8b` (after Packet #9 re-test) handles Phase 5.5 and Phase 3 audit workers. Haiku as cloud overflow only when local saturated.
- **Target files:** `.claude/skills/end-of-transmission/SKILL.md:29,404-406`
- **Constraints:** EOT pipeline structure unchanged. Workers stay `run_in_background:true`. Conditional overflow to `deepseek-v4-flash` cloud when local queue depth > N.
- **Acceptance:**
  - [ ] `grep -n "haiku-4-5" .claude/skills/end-of-transmission/SKILL.md` returns 0 hits (or only commented fallback).
  - [ ] `/eot` cycle under `YURI_NO_ANTHROPIC=1` completes successfully.
- **Test:** `YURI_NO_ANTHROPIC=1 bash -c 'echo "end of transmission" | claude --plan'`
- **Rollback:** SKILL.md edits ≤ 30 lines.
- **Route-plan:** critical · skill protocol · auto-firing surface.
- **ETA:** 2d · **Owner:** Codex.

## Packet 5 — Rip Anthropic from `nisaba-dream.js`

- **Goal:** `.claude/hooks/nisaba-dream.js:75` no longer shells `claude -p`. Decide: (a) replace with `_SYSTEM/Scripts/offload.sh -m deepseek-r1:8b`, OR (b) strip model call entirely and convert to deterministic dispatcher. Prefer (b) if hook is just signal routing.
- **Target files:** `.claude/hooks/nisaba-dream.js`
- **Acceptance:**
  - [ ] `grep -n "claude" .claude/hooks/nisaba-dream.js` returns 0 hits.
  - [ ] Hook fires under `YURI_NO_ANTHROPIC=1`.
- **Test:** `node .claude/hooks/nisaba-dream.js --dry-run`
- **Rollback:** single-file edit.
- **Route-plan:** high-stakes · hook protocol.
- **ETA:** 0.5d · **Owner:** Codex.

## Packet 6 — Strip `@claude` default routing · @amp.smart → gpt-5.5

- **Goal:** `@claude` lane opt-in only (removed from default fan-out chains). `@amp.smart` no longer maps to `claude-opus-4-7`.
- **Target files:** `_SYSTEM/Scripts/offload-contract.mjs:110, 270` (and dispatch tokens at 176)
- **Constraints:** `@claude` lane stays defined for explicit `-m claude`. Default tables and scenario fan-outs don't include it. `@amp.smart` → `gpt-5.5`.
- **Acceptance:**
  - [ ] `node _SYSTEM/Scripts/offload-contract-dispatch-check.mjs` passes.
  - [ ] `@amp` default mode does not route to Anthropic.
- **Test:** `node _SYSTEM/Scripts/offload-contract-dispatch-check.mjs && node _SYSTEM/Scripts/independence-check.mjs --check=routing`
- **Rollback:** ≤ 30 lines.
- **Route-plan:** critical · routing contract.
- **GitNexus impact:** required upstream on `offload-contract`.
- **ETA:** 1d · **Owner:** Codex.

## Packet 7 — trading-bot ensemble replacement

- **Goal:** `_SYSTEM/Scripts/trading-bot/ensemble-inference.mjs` no longer calls `api.anthropic.com`. Replace with tri-ensemble: DeepSeek-V4-Pro + Kimi K2.6 + NVIDIA Nemotron-70B.
- **Target files:** `_SYSTEM/Scripts/trading-bot/ensemble-inference.mjs:25-27`
- **Constraints:** Output schema unchanged. Latency budget preserved. Confidence calibration re-validated.
- **Acceptance:**
  - [ ] `baseUrl` no longer `api.anthropic.com`.
  - [ ] Ensemble produces signal under `YURI_NO_ANTHROPIC=1`.
  - [ ] Backtest replay within ±5% of prior baseline.
- **Test:** `node _SYSTEM/Scripts/trading-bot/ensemble-inference.mjs --self-check --replay=last-week`
- **Rollback:** single file ≤ 60 lines.
- **Route-plan:** financial · high-stakes · ensemble.
- **ETA:** 1d · **Owner:** Codex.

## Packet 8 — token-ledger pricing rows for non-Anthropic lanes

- **Goal:** `_SYSTEM/Scripts/token-ledger.mjs` + `.claude/hooks/token-status.js` carry pricing rows for every active non-Anthropic lane.
- **Target files:** `_SYSTEM/Scripts/token-ledger.mjs:65-67,112` · `.claude/hooks/token-status.js:52-56`
- **Constraints:** Anthropic rows retained for opt-in usage tracking. New rows: deepseek-v4-pro, deepseek-v4-flash, kimi-k2.6, nemotron-70b, llama-3.3-70b, gpt-5.5, gpt-5.4-mini, gpt-5.3-codex-spark.
- **Acceptance:**
  - [ ] All active lanes from `offload-contract.mjs` have pricing rows.
  - [ ] `_SYSTEM/Scripts/ai status` shows accurate per-lane cost summary.
- **Test:** `node _SYSTEM/Scripts/token-ledger.mjs --self-check`
- **Rollback:** ≤ 80 lines across two files.
- **ETA:** 1d · **Owner:** Codex.

## Packet 9 — Local-first reasoning fallback · deepseek-r1:8b re-test on M4 Pro · models.json refresh

- **Goal:** Confirm `deepseek-r1:8b` runs stably on Mac Mini M4 Pro 16 GB stations. Update `models.json` to reflect actual ollama arsenal (qwen2.5:7b is de-facto primary today, not llama3.2).
- **Target files:** `.claude/config/models.json` · Ollama-installed model set.
- **Constraints:** No model > 9 GB on 16 GB unified memory. Frozen flag removed only if 24h soak passes.
- **Acceptance:**
  - [ ] `models.json` `local.primary` = `qwen2.5:7b`.
  - [ ] `local.deep_reasoning` unfrozen if M4 Pro stable; else cloud `deepseek-v4-flash` as deep-reasoning fallback.
  - [ ] `local.code` = `qwen2.5-coder:7b` (already correct).
- **Test:** 24h ollama soak test running deepseek-r1:8b under load.
- **Rollback:** config edit only.
- **ETA:** 2d (soak wait) · **Owner:** Marcel + Codex.

## Packet 10 — Hook-by-hook audit · quarantine any Claude spawn

- **Goal:** Each of 37 hooks in `.claude/hooks/` audited for direct/transitive Anthropic calls. Findings logged. Any Anthropic-firing hook refactored to deterministic JS or routed through `_SYSTEM/Scripts/offload.sh -m <non-anthropic-lane>`.
- **Target files:** `.claude/hooks/*.js` (37 files)
- **Acceptance:**
  - [ ] `grep -rEn "claude -p|api.anthropic|claude-(opus|sonnet|haiku)" .claude/hooks/ | grep -v "token-status.js" | grep -v "agent-spawn-guard.js"` returns 0 active hits.
- **Test:** scripted lint pass + boot session under `YURI_NO_ANTHROPIC=1`.
- **Rollback:** per-hook small edits.
- **Route-plan:** high-stakes · hook protocol.
- **ETA:** 3d · **Owner:** Codex.

## Packet 11 — Skill model-routing sweep

- **Goal:** Each of 34 SKILL.md files (+ associated runtimes) audited so model selection inside skill body has non-Anthropic primary. Anthropic = explicit opt-in only.
- **Target files:** `.claude/skills/*/SKILL.md` and sibling scripts.
- **Acceptance:**
  - [ ] Skill bodies don't hardcode Anthropic model strings as defaults.
  - [ ] Skill manifests reviewed for `Agent()` spawns — flag any.
- **Test:** scripted grep + per-skill smoke invocation under `YURI_NO_ANTHROPIC=1`.
- **Rollback:** per-skill small edits.
- **ETA:** 2d · **Owner:** Codex.

## Packet 12 — `_SYSTEM/Scripts/ai` banner defaults

- **Goal:** Status/banner output in `_SYSTEM/Scripts/ai` (lines 272, 1103, 1128) doesn't hard-assert `claude-sonnet-4-6`. Read actual session model from settings or display "user-selected".
- **Target files:** `_SYSTEM/Scripts/ai:272,1103,1128`
- **Constraints:** Cosmetic. No behaviour change.
- **Acceptance:**
  - [ ] `_SYSTEM/Scripts/ai status` doesn't falsely advertise Claude when inactive.
- **Test:** `bash _SYSTEM/Scripts/ai status`
- **Rollback:** ≤ 20 lines.
- **ETA:** 0.5d · **Owner:** Codex.

## Packet 13 — Independence smoke test — `YURI_NO_ANTHROPIC=1`

- **Goal:** New script `_SYSTEM/Scripts/independence-check.mjs` boots verifier walking every subagent, hook, skill, offload lane to assert no Anthropic surface fires when `YURI_NO_ANTHROPIC=1`. (Initial version shipped 2026-05-16 alongside this audit; this packet hardens false-positive suppression and wires into CI.)
- **Target files:** `_SYSTEM/Scripts/independence-check.mjs` (exists) + CI hook
- **Constraints:** Read-only verifier. < 60s runtime. Exit 0 on PASS, non-zero on FAIL.
- **Acceptance:**
  - [ ] Script returns 0 on pass.
  - [ ] Negative-context docs (e.g. "must not run as `claude -p`") suppressed.
  - [ ] CI hook wires to pre-commit or pre-push.
- **Test:** intentionally introduce Anthropic reference, confirm catch; remove.
- **Rollback:** new file, deletable.
- **ETA:** 1.5d · **Owner:** Codex.

## Packet 14 — NEXUSLINK nexbox handoff packet

- **Goal:** `_SYSTEM/NEXUSLINK/nexbox-handoff-v1.md` (drafted, see §D) defines client-deliverable bundle. `src/components/NexusLinkLanding.tsx` extended with "Symbiotic Independence" section.
- **Target files:** `_SYSTEM/NEXUSLINK/nexbox-handoff-v1.md` (exists) · `src/components/NexusLinkLanding.tsx` + `src/lib/nexuslinkLandingData.ts`
- **Constraints:** Landing page changes additive only. Bundle spec includes 6 layers DeepSeek flagged (identity attestation, schema version, trust chain, model catalog, fallback policy, liveness TTL).
- **Acceptance:**
  - [ ] Bundle spec ratified by Marcel.
  - [ ] Landing renders new "Symbiotic Independence" section.
- **Test:** `npm run lint && npm run build`.
- **Rollback:** ≤ 80 lines of landing edits.
- **Route-plan:** high-stakes · product surface.
- **ETA:** 2d · **Owner:** Marcel + Codex.

## Packet 15 — Lane dispatcher abstraction (capability manifest router)

- **Goal:** New `_SYSTEM/Scripts/lane-dispatcher.mjs` reads capability manifest (each lane declares ctx window, tool-use, latency tier, cost tier, privacy class). Every later migration becomes manifest config change, not hardcoded string swap.
- **Target files:** new `_SYSTEM/Scripts/lane-dispatcher.mjs` · new `_SYSTEM/Scripts/lane-capability-manifest.json` · refactor consumers (`yuri-symbiotic-pulse.mjs`, `pulse-orchestrator.mjs`, hook templates).
- **Constraints:** Existing dispatch tokens backward-compatible. Dispatcher additive — direct `-m <model>` calls still work.
- **Acceptance:**
  - [ ] Dispatcher selects correct lane for synthetic capability request.
  - [ ] At least 3 consumers refactored to call dispatcher.
- **Test:** `node _SYSTEM/Scripts/lane-dispatcher.mjs --self-check`
- **Rollback:** new files; refactors additive.
- **Route-plan:** critical · architectural · routing runtime.
- **GitNexus impact:** required after first use.
- **ETA:** 3d · **Owner:** Codex.

> **DeepSeek's #1 architectural call.** Without dispatcher, every migration is a hardcoded string swap. With it, all later config changes become one-liners.

## Packet 16 — Kill-switch drill (14 June)

- **Goal:** Final verification. Disable Anthropic API key, set `YURI_NO_ANTHROPIC=1`, run full day. PASS = score ≥ 90 + no critical workflow blocked.
- **Target files:** none — runbook + observation.
- **Acceptance:**
  - [ ] 24h continuous operation, no Anthropic key.
  - [ ] No critical workflow blocked.
  - [ ] Independence score ≥ 90 confirmed.
- **Test:** `unset ANTHROPIC_API_KEY && export YURI_NO_ANTHROPIC=1 && node _SYSTEM/Scripts/independence-check.mjs --strict && claude` (operate 24h).
- **Rollback:** env-only.
- **Route-plan:** critical · go/no-go drill.
- **ETA:** 0.5d (scheduled 2026-06-14) · **Owner:** Marcel.

## Packet 17 — Skill-bound `agent.md` Anthropic models

- **Goal:** Five skill-scoped `agent.md` files no longer declare Anthropic models. (Verifier-discovered surface, missed by initial SKILL.md-scoped grep.)
- **Target files:**
  - `.claude/skills/execution-domain-core/agent.md:4` (claude-sonnet-4-6)
  - `.claude/skills/failure-evolution-loop/agent.md:4` (claude-haiku-4-5-20251001)
  - `.claude/skills/non-destructive-infinity-guard/agent.md:4` (claude-sonnet-4-6)
  - `.claude/skills/parallel-clone-orchestrator/agent.md:4` (claude-sonnet-4-6)
  - `.claude/skills/pattern-mirror-core/agent.md:4` (claude-sonnet-4-6)
- **Per-skill replacement:**
  - `execution-domain-core` → `deepseek-v4-pro` (policy/exit-criteria reasoning)
  - `failure-evolution-loop` → `deepseek-v4-flash` (fast triage)
  - `non-destructive-infinity-guard` → `deepseek-v4-pro` (risk classifier)
  - `parallel-clone-orchestrator` → `deepseek-v4-pro` (decomposition/synthesis)
  - `pattern-mirror-core` → `deepseek-v4-pro` (artifact perception)
- **Acceptance:**
  - [ ] `grep -h "^model:" .claude/skills/*/agent.md` returns zero `claude-*` values.
  - [ ] Per-skill smoke run under `YURI_NO_ANTHROPIC=1`.
- **Test:** `node _SYSTEM/Scripts/independence-check.mjs --check=skills`
- **Rollback:** 5 single-line frontmatter edits.
- **ETA:** 0.5d · **Owner:** Codex.

## C.99 Parallelization Summary

| Track | Packets | Day window | Notes |
|---|---|---|---|
| A · Codex parallel | 1, 5, 6, 7, 12, 17 | days 1–4 | independent files, no shared edits |
| B · Codex sequential | 2 → 3 → 4 → 8 → 10 → 11 | days 1–13 | settings.json affects subagent inheritance |
| C · Marcel + Codex | 9, 14 | days 5–10 | needs Marcel hardware + product input |
| D · Architectural | 15 | days 4–12 | lane dispatcher; lands day 12 |
| E · Verification | 13, 16 | days 10–11, 29 | smoke test then drill |

**Total burn:** ~17 working days parallel against 30-day calendar → ~13 day buffer.

---

# §D · NEXUSLINK · Nexbox Handoff Packet v1

## D.0 Promise

> A client receives NEXUSLINK / nexbox bundled with a YURI-grade Symbiotic Pulse runtime that requires **zero Anthropic credentials** to operate, runs on a Mac Mini M4 Pro 16 GB (or upward), and proves its independence through a verifier the client themselves can run.

Sovereignty is not just an internal Yuri OS property — it is the product wrap. Clients inherit it by default.

## D.1 Bundle Contents

### D.1.1 Local runtime layer
- Ollama bootstrap script (`bin/bootstrap-ollama.sh`) — installs Ollama if absent, pulls pinned models.
- Pinned model set (≤ 9 GB per model, fits 16 GB unified memory floor):
  - `qwen2.5:7b` — general primary
  - `qwen2.5-coder:7b` — code primary
  - `qwen3.5:4b` — lightweight triage
  - `deepseek-r1:8b` — deep reasoning (conditional: stable on M4 Pro per Packet #9)
  - `nomic-embed-text:latest` — embeddings
- `models.json` template mirroring `.claude/config/models.json`; client overrides via `OLLAMA_DEFAULT_MODEL`.

### D.1.2 Symbiotic Pulse engine
- `_SYSTEM/Scripts/yuri-symbiotic-pulse.mjs` ported to standalone client lib (`nexbox/symbiotic-pulse.mjs`).
- De-Claude'd per Packet #1 — default cortex routes to `@deepseek-v4-pro` (or local `deepseek-r1:8b` if client declines cloud).
- `docs/SYMBIOTIC_PULSE_V1.md` shipped verbatim.

### D.1.3 Canonical memory shim
- `_SYSTEM/Scripts/yuri-canonical-memory-import.mjs` adapted to client-owned `nexbox/memory.db`.
- Memory schema versioned (per §D.3.1).
- Client owns SQLite file; no upstream sync unless explicitly enabled.

### D.1.4 Routing contract (slim)
- `nexbox/offload-contract.mjs` — minimal lane table:
  - `@deepseek` (cloud, opt-in with client's own DeepSeek key)
  - `@kimi` (cloud, opt-in)
  - `@nvidia` (cloud, opt-in with client's own NVIDIA NIM key)
  - `@ollama-local` (always available)
  - `@codex-spark` (optional)
- **No `@claude` lane unless client explicitly adds Anthropic key** via `nexbox config add-lane claude`.

### D.1.5 Verification harness
- `_SYSTEM/Scripts/independence-check.mjs` shipped with bundle.
- Client runs `nexbox verify` → asserts zero Anthropic dependency.
- Reports written to `nexbox/reports/independence-<ISO-DATE>.md`.

### D.1.6 NEXUSLINK landing extension
- New "Symbiotic Independence" section on landing surface.
- Live status widget polling `nexbox verify` results.
- Marketing copy: "Sovereign by default. Cloud by consent."

### D.1.7 Hardware spec sheet
- **Floor:** Mac Mini M4 Pro 16 GB unified memory.
- **Recommended:** M4 Pro 24 GB / 32 GB for parallel workloads.
- **Heavy:** Mac Studio M3 / M4 Ultra (64 GB+) for 70B-class models.
- **Desktop alt:** x86 + RTX 4090 (24 GB) / RTX 5090 (32 GB).
- **Network:** offline-first; cloud lanes optional per-call.

### D.1.8 Operating runbook
- `nexbox/RUNBOOK.md` — install → bootstrap → first-pulse smoke test → optional cloud-key add-on → kill-switch drill.

## D.2 Identity Attestation

Each nexbox install carries node fingerprint + capability attestation.

```json
{
  "nodeId": "<uuid-v4>",
  "fingerprint": "<sha256(public-runtime-config + hardware-class + arsenal-hash)>",
  "capabilities": {
    "modelArsenal": ["qwen2.5:7b", "qwen2.5-coder:7b", "deepseek-r1:8b"],
    "ctxWindow": 128000,
    "toolUseSupported": true,
    "privacyClass": "standard|elevated|sealed",
    "cloudOptIn": ["deepseek", "nvidia"]
  },
  "issuedAt": "<ISO>",
  "ttlSeconds": 86400
}
```

## D.3 Schema Version + Trust Chain

### D.3.1 Schema versioning
Every pulse packet carries `schema_version: "<semver>"`. Receivers refuse packets with major-version mismatch.

### D.3.2 Trust chain
- Each handoff carries `nonce` chained from prior handoff (HMAC).
- Tie into existing CASSANDRA nonce tracking.
- Prevents replay of stale pulse state.

## D.4 Model Catalog

```json
{
  "manifestVersion": "1.0",
  "node": "<nodeId>",
  "models": [
    {
      "id": "qwen2.5:7b",
      "runtime": "ollama-local",
      "ctxWindow": 32768,
      "toolUse": "structured",
      "quantization": "Q4_K_M",
      "throughputTokSec": 35,
      "costTier": "free",
      "privacyTier": "local"
    },
    {
      "id": "deepseek-v4-pro",
      "runtime": "cloud",
      "endpoint": "https://api.deepseek.com",
      "ctxWindow": 1000000,
      "toolUse": "native",
      "costTier": "cloud-low",
      "privacyTier": "third-party"
    }
  ]
}
```

## D.5 Fallback Policy

```yaml
fallback:
  primary: ollama-local:qwen2.5:7b
  if_local_saturated:
    - ollama-local:qwen3.5:4b
    - cloud:deepseek-v4-flash    # only if cloudOptIn includes deepseek
  if_unreachable:
    - skip-and-log
    - alert-via-cassandra
  never:
    - any-anthropic-lane         # explicit deny unless client overrides
```

## D.6 Liveness Window

```json
{
  "ttl": 3600,
  "heartbeatExpectedSec": 60,
  "lastHeartbeat": "<ISO>",
  "status": "alive|degraded|stale|down"
}
```

## D.7 Bundle Manifest

```
nexbox/
├── RUNBOOK.md
├── symbiotic-pulse.mjs          # de-Claude'd pulse engine
├── memory.db                    # client-owned canonical memory
├── offload-contract.mjs         # slim lane table (no @claude default)
├── models.json                  # local model registry
├── bin/
│   ├── bootstrap-ollama.sh
│   └── nexbox                   # CLI entrypoint
├── docs/
│   └── SYMBIOTIC_PULSE_V1.md
├── verify/
│   ├── independence-check.mjs
│   └── reports/
└── attestation/
    ├── node-identity.json
    ├── model-manifest.json
    ├── fallback-policy.yaml
    └── liveness.json
```

## D.8 Client CLI surface

```
nexbox install        # bootstrap Ollama + pull models
nexbox verify         # run independence-check
nexbox pulse <input>  # fire a Symbiotic Pulse on raw input
nexbox status         # print node identity + liveness + recent verify results
nexbox config add-lane <name> --key=<env-var-name>   # opt-in cloud
nexbox config remove-lane <name>
nexbox handoff <peer-node-id>   # exchange pulse state with another nexbox
```

## D.9 Acceptance criteria for v1 ship

- [ ] All 8 bundle contents (§D.1.1–§D.1.8) present in `nexbox/` skeleton.
- [ ] `nexbox verify` returns exit 0 on fresh client install with no Anthropic key.
- [ ] Identity attestation, schema-versioned pulse, trust-chain nonces, model catalog, fallback policy, liveness — all implemented per §D.2–§D.6.
- [ ] NEXUSLINK landing renders "Symbiotic Independence" section with live verify status.
- [ ] First client install completes in < 30 min on fresh Mac Mini M4 Pro.

## D.10 Out of scope (v1)

- Multi-tenant nexbox clusters.
- Cross-org handoff governance (deferred v2).
- Anthropic-lane re-enablement UI (CLI only for now).
- Fine-tuning of local models (stock Ollama).

## D.11 Authority chain (per Yuri origin)

- Codex = only implementation authority for runtime code.
- Marcel = product authority for client packaging.
- DeepSeek advisor input shaped §D.2–§D.6; `advisory_only=true · local_truth_claim=false`.
- Client-side `nexbox verify` results = only authoritative independence signal.

---

# §E · Verifier Reference

`_SYSTEM/Scripts/independence-check.mjs` (already shipped 2026-05-16). Read-only static analyzer.

## E.1 Usage

```bash
node _SYSTEM/Scripts/independence-check.mjs              # full report, exit 0/1
node _SYSTEM/Scripts/independence-check.mjs --strict     # fail on any warn too
node _SYSTEM/Scripts/independence-check.mjs --check=<s>  # one surface only
```

Surfaces: `subagents · hooks · skills · scripts · routing · settings · eot · all`

## E.2 Detection patterns

- `ANTHROPIC_MODEL_RE`: `/claude[-:](opus|sonnet|haiku|3|4|5)/i`
- `ANTHROPIC_SHELL_RE`: `/\bclaude\s+-p\b/`
- `ANTHROPIC_API_RE`: `/api\.anthropic\.com/`
- `ANTHROPIC_SDK_RE`: `/@anthropic-ai\/sdk/`
- `HAIKU_AGENT_RE`: `/Agent\(\{[^}]*haiku/i`

## E.3 Allowlist (legitimate Anthropic mentions, not firing surfaces)

- `.claude/hooks/agent-spawn-guard.js` (the guard itself)
- `.claude/hooks/token-status.js` (pricing telemetry)
- `.claude/hooks/token-session-end.js` (provider name)
- `.claude/hooks/pre-tool-use.js` (local-first nudge text)
- `_SYSTEM/Scripts/token-ledger.mjs` (pricing rows)
- `_SYSTEM/Scripts/offload-contract-dispatch-check.mjs` (test fixture)
- `_SYSTEM/Scripts/create-missing-commands.mjs` (skill names)
- `_SYSTEM/Scripts/independence-check.mjs` (self)

## E.4 Report shape

```
YURI OS INDEPENDENCE CHECK
  ran: all  strict: false  scanned: <N>

FAIL (n)        — surfaces that auto-fire Anthropic
  ✗ <file>:<line>  [<surface>]
    <excerpt>
    → <fix>

WARN (n)        — surfaces that mention Claude (review for opt-in vs default)
  ! <file>:<line>  [<surface>]
    <excerpt>

PASS (n)        — surfaces verified clean

Independence score (this run): N / 100
```

Exit codes: `0` PASS · `1` FAIL · `1` with `--strict` and WARN > 0 · `2` invalid surface arg.

---

# §F · Source artifacts & cross-references

- This file: `_SYSTEM/audit-archive/2026-05-16-anthropic-independence/MASTER.md`
- Original split deliverables (kept for granular access):
  - `_SYSTEM/audit-archive/2026-05-16-anthropic-independence/AUDIT.html` (styled one-pager)
  - `_SYSTEM/audit-archive/2026-05-16-anthropic-independence/AUDIT-DECK.html` (10-slide deck)
  - `_SYSTEM/audit-archive/2026-05-16-anthropic-independence/evidence-pack.md`
  - `_SYSTEM/audit-archive/2026-05-16-anthropic-independence/build-list.md`
  - `_SYSTEM/NEXUSLINK/nexbox-handoff-v1.md`
  - `_SYSTEM/Scripts/independence-check.mjs`
- Canonical authority: `_SYSTEM/yuri-origin.md` · `SOUL.md` · `AGENTS.md` · `_SYSTEM/Scripts/offload-contract.mjs`
- Pulse Cortex: `_SYSTEM/Scripts/pulse-orchestrator.mjs` · `docs/SYMBIOTIC_PULSE_V1.md`

---

**Generated:** 2026-05-16 · main-session control plane · Codex final authority · DeepSeek V4 Pro advisory.
**Status:** plan approved · 17 packets queued · verifier live · ready for Codex execution.
