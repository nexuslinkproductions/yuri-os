# Yuri OS Post-Sprint Handoff — 2026-05-16
## Sovereignty Sprint Session Output

---

## 1 · What the sprint accomplished

**Independence score: 8/100 → 67/100** (fail: 16 → 0 · warn: 19 → 6)

The system no longer has any hard Anthropic model dependencies in its runtime surfaces. Every remaining warn is an **intentional opt-in surface** (regression tests asserting Claude advisory behavior stays available, @claude route handler for explicit dispatch, yuri-shura security lane).

---

## 2 · How Yuri OS routes work now (post-sprint)

### Default cortex

| Before | After |
|--------|-------|
| `Scripts/yuri-symbiotic-pulse.mjs` EXTERNAL_LANES.claude had `model: 'claude-sonnet-4-6'` | Model field removed — `@claude` lane uses CLI default, no hardcoded Anthropic pin |
| `.claude/settings.json` → `"model": "sonnet"` — every session defaulted to Sonnet | `"model": "user-selected"` — session model is user-chosen, not auto-pinned |

### Lane routing table (offload-contract.mjs)

| Key change | Before | After |
|-----------|--------|-------|
| `routingPriority` tail | `..., '@claude']` | `'@deepseek']` — @claude removed from default fan-out |
| `@amp.smart` mode | `claude-opus-4-7` | `gpt-5.5` + `reasoning: 'high'` |
| `claudeCouncilQualityGate` model | `claude-sonnet-4-6` | `deepseek-v4-pro` |

### Agent inheritance

All 11 `.claude/agents/` files now have **explicit** `model:` or `runtime: native_function` fields. Before this sprint, 11 subagents had no model field and would inherit the session default (Sonnet).

| Agent | Model now |
|-------|----------|
| architect, security-reviewer | deepseek-v4-pro |
| cassandra, memory-curator | deepseek-v4-flash |
| doc-cleaner, file-inventory, log-summarizer, noesis-linter | qwen2.5:7b |
| argus, hermes, obliteratus-qa | runtime: native_function |

### Hook layer

| Hook | Before | After |
|------|--------|-------|
| `nisaba-dream.js` | `execSync('claude -p --model claude-haiku-4-5 ...')` — synchronous Anthropic call every session stop | Queue-writer: writes prompt to `dream-queue.jsonl`, returns immediately. Zero model dependency on hot path. |
| `token-status.js` | Claude pricing only, DEFAULT_PRICE = claude-sonnet-4-6 | 10 non-Anthropic pricing rows added; DEFAULT_PRICE = deepseek-v4-pro |

### Skill layer

| Skill | Before | After |
|-------|--------|-------|
| EOT (end-of-transmission) | Spawned `Agent({ model: "haiku-4-5-20251001" })` for all worker phases | Dispatches `Scripts/offload.sh -m deepseek-v4-flash`; runs in queue |
| tokenmaxxing | Fallback `Agent({ model: "haiku" })` | Fallback `Scripts/offload.sh -m deepseek-v4-flash` |
| 5 skill agent.md files | `model: claude-sonnet-4-6` / `claude-haiku-4-5-20251001` | deepseek-v4-pro / deepseek-v4-flash |

### Signal Engine (trading bot)

| Leg | Before | After |
|-----|--------|-------|
| `claude` (weight 0.25) | `api.anthropic.com/v1`, `claude-sonnet-4-20250514` | `nvidia-nemotron-70b` (`integrate.api.nvidia.com/v1`, weight 0.25) |
| Other 4 legs | Unchanged | Unchanged (Grok 0.20, GPT-4o 0.20, DeepSeek 0.20, Gemini 0.15) |

---

## 3 · New systems created this sprint

### nexbox bundle (`nexbox/`)
Client-portable, zero-Anthropic runtime for Mac Mini M4 Pro deployments.

| File | Purpose |
|------|---------|
| `nexbox/symbiotic-pulse.mjs` | Standalone routing engine. Self-check: `node nexbox/symbiotic-pulse.mjs --self-check` |
| `nexbox/offload-contract.mjs` | Slim 5-lane table (deepseek, kimi, nvidia, ollama-local, codex-spark). No @claude default. |
| `nexbox/RUNBOOK.md` | Install → bootstrap → smoke → optional cloud keys → kill-switch drill |
| `nexbox/verify.mjs` | Thin wrapper: `node nexbox/verify --strict` runs independence check under NUDIMMUD_NO_ANTHROPIC=1 |
| `bin/bootstrap-ollama.sh` | Ollama install check + model pulls (qwen2.5:7b, qwen2.5-coder:7b, qwen3.5:4b, nomic-embed-text) |

### Lane dispatcher (`Scripts/lane-dispatcher.mjs`)
Manifest-driven lane selector. **Key property: future model migrations = edit JSON only, no source changes.**

```bash
node Scripts/lane-dispatcher.mjs --self-check       # 5/5 PASS
node Scripts/lane-dispatcher.mjs --list              # all available lanes
node Scripts/lane-dispatcher.mjs --select '{"capabilities":["deep-reasoning"]}'
```

Manifest: `Scripts/lane-capability-manifest.json` — set `available: false` for any lane to remove it from routing without touching source.

### Independence verifier (`Scripts/independence-check.mjs`)
Already existed; sprint verified it runs clean. Hardened with pre-commit regression gate script (`Scripts/pre-commit-independence.sh`).

**Wire it manually:** add `bash Scripts/pre-commit-independence.sh` to `.git/hooks/pre-commit`.

### NexusLink landing — "Symbiotic Independence" section
Added to `src/components/NexusLinkLanding.tsx`. Shows independence score, active non-Anthropic lanes, verify command. Data source: `src/lib/nexuslinkLandingData.ts → independenceData`.

### Design documents
- `_SYSTEM/SELF-IMPROVEMENT/enki-density-mitigation.md` — STATE_AGGREGATOR proposal for ENKI's 30-edge choke point (deferred to post-Jun-14 sprint)
- `_SYSTEM/SELF-IMPROVEMENT/design-command-boundaries.md` — design-master / design-source-pack / frontend-design scope map

---

## 4 · 6 intentional opt-in surfaces (the remaining warns)

These are NOT problems. They are the explicit @claude advisory path that stays available when Marcel explicitly invokes it.

| Surface | What it is | Status |
|---------|-----------|--------|
| `yuri-shura/SKILL.md:3,29` | 6-perspective review; Claude = security lane by design | Intentional opt-in |
| `offload-contract.mjs:176` | `@claude` lane dispatchTokens definition | Intentional opt-in |
| `offload.sh:367` | `@claude` route handler for `-m claude` | Intentional opt-in |
| `offload-contract-regression.test.mjs:197` | Test asserts Claude advisory behavior is available | Valid regression test |

---

## 5 · What still needs to run

| Item | Blocker | ETA |
|------|---------|-----|
| **P9 — deepseek-r1:8b soak + models.json update** | Mac Mini M4 Pro hardware | When Marcel has M4 |
| **Track D — Sharingan 4 repos** | curl hook-gated. Needs `curl` permission or Perplexity app session | Next session w/ permissions |
| **P16 — kill-switch drill** | Calendar date | 2026-06-14 |
| **P13 git hook wire** | `.git/hooks` hard-blocked by auto-classifier | Marcel runs: `echo 'bash Scripts/pre-commit-independence.sh' >> .git/hooks/pre-commit` |

---

## 6 · Score path to ≥90

Current: **67/100** · fail=0 · warn=6

| Step | Delta | Est. score |
|------|-------|-----------|
| Now | — | 67 |
| P9 (models.json unfreeze deepseek-r1:8b) | +2 | 69 |
| Track D (4 repo pattern briefs inform skill upgrades) | +? | 69+ |
| Warn surface cleanup (regression test updates if desired) | +~6 | 75 |
| P13 CI wire (structural coverage) | +3 | 78 |
| Lane dispatcher adoption (3 consumers refactored) | +5 | 83 |
| Post-Jun-14 cleanup sprint | +7 | ≥90 |
| Jun 14 kill-switch drill | verify | ≥90 ✓ |

---

## 7 · Current token ledger pricing

`Scripts/token-ledger.mjs` and `.claude/hooks/token-status.js` now include pricing for all active lanes:

| Lane | Input/1M | Output/1M |
|------|---------|----------|
| deepseek-v4-pro | $0.27 | $1.10 |
| deepseek-v4-flash | $0.07 | $0.28 |
| deepseek-r1:8b | $0 | $0 (local) |
| gpt-5.5 | $5.00 | $20.00 |
| gpt-5.4-mini | $0.15 | $0.60 |
| nvidia-nemotron-70b | $0.20 | $0.20 |
| kimi-k2.6 | $0.15 | $0.60 |
| qwen2.5 (local) | $0 | $0 |
| claude-sonnet-4-6 | $3.00 | $15.00 (opt-in, tracked) |

**Sprint economic impact:** Routing shift from Sonnet-default (~$3/M input) to deepseek-v4-flash-default (~$0.07/M input) for background tasks = ~43× cost reduction on automated hook/scout/EOT surfaces.

---

## 8 · Commit boundary recommendation

These are the clean, reviewable commits for this sprint:

```bash
# Commit 1 — Independence: cortex + hooks + agents (P1+P5+P6+P7+P17+P3+P10+P11+P12)
git add Scripts/yuri-symbiotic-pulse.mjs .claude/hooks/nisaba-dream.js Scripts/offload-contract.mjs Scripts/trading-bot/ensemble-inference.mjs Scripts/ai .claude/agents/ .claude/skills/*/agent.md .claude/hooks/token-status.js .claude/skills/end-of-transmission/SKILL.md .claude/skills/tokenmaxxing/SKILL.md .claude/skills/local-subagent/SKILL.md .claude/skills/openclaw-offload/SKILL.md .claude/commands/yuri-probability.md

# Commit 2 — Independence: settings + token ledger (P2+P4+P8)
git add .claude/settings.json Scripts/token-ledger.mjs

# Commit 3 — Architecture: lane dispatcher + manifest (P15)
git add Scripts/lane-dispatcher.mjs Scripts/lane-capability-manifest.json

# Commit 4 — nexbox bundle (Track E)
git add nexbox/ bin/bootstrap-ollama.sh

# Commit 5 — NexusLink independence section (P14)
git add src/components/NexusLinkLanding.tsx src/lib/nexuslinkLandingData.ts

# Commit 6 — Design docs + pre-commit gate (C5+C6+P13)
git add _SYSTEM/SELF-IMPROVEMENT/ Scripts/pre-commit-independence.sh
```

Each commit can be reviewed and reverted independently.
