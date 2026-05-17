# HANDOFF · Yuri OS Independence Audit
**From:** main-session 2026-05-16
**To:** next session (Claude / Codex / Marcel)
**Status:** PLAN APPROVED · deliverables shipped · execution not started

---

## 1 · One-paragraph state

Anthropic Claude Agent SDK ops move to separately-billed pay-per-token API on **15 June 2026** (T-30d). Full audit completed; 17-packet build list approved; verifier shipped and runs clean against the live repo (8/100 raw, 31.6/100 weighted today; target ≥90 by 14 Jun). NEXUSLINK nexbox client-handoff packet drafted. Nothing has been migrated yet — sprint execution is the next session's job.

## 2 · What was produced (single working dir)

`_SYSTEM/audit-archive/2026-05-16-anthropic-independence/`

| File | Role |
|---|---|
| `MASTER.md` | Single-file consolidation of everything below |
| `AUDIT.html` | Styled one-page audit (Mermaid + Chart.js, dark NUDIMMUD HUD) |
| `AUDIT-DECK.html` | 10-slide reveal deck for stakeholder walkthrough |
| `evidence-pack.md` | Deterministic local-grep evidence per Yuri Evidence Contract |
| `build-list.md` | 17 CLAUDE CONTROL PACKETs, parallelization map |
| `HANDOFF.md` | This file |

Sibling artifacts:
- `_SYSTEM/NEXUSLINK/nexbox-handoff-v1.md` — client-deliverable bundle spec
- `_SYSTEM/Scripts/independence-check.mjs` — runnable verifier (read-only, no mutations)
- `~/.claude/plans/nexus-pulse-orchestration-with-abundant-kazoo.md` — original approved plan

## 3 · What's true (verified, not asserted)

- 11 subagents in `.claude/agents/` carry **zero** `model:` fields → inherit session default = Sonnet.
- `.claude/settings.json:89` default `"model": "sonnet"`.
- `.claude/hooks/nisaba-dream.js:75` shells `claude -p --model claude-haiku-4-5` (only live shell-out).
- `_SYSTEM/Scripts/yuri-symbiotic-pulse.mjs:250` defaults `claude-sonnet-4-6` (cortex is itself Anthropic).
- `_SYSTEM/Scripts/offload-contract.mjs:110` `@amp.smart=claude-opus-4-7` · `:270` `@claude` lane = `claude-sonnet-4-6`.
- EOT skill spawns ≥4 Haiku workers per `/eot` (`SKILL.md:29,404,405,406`).
- **5 skill `agent.md` files** carry explicit Anthropic models (verifier-discovered, missed by initial grep): `execution-domain-core`, `failure-evolution-loop`, `non-destructive-infinity-guard`, `parallel-clone-orchestrator`, `pattern-mirror-core`.
- 2 live `@anthropic-ai/sdk` imports (`backend/`, `NEURAL-NETWORK/GitNexus/gitnexus-web/`) — standard API tier, not Agent SDK pricing change, but inventoried.
- Local arsenal: 13 Ollama models installed; `qwen2.5:7b` + `qwen2.5-coder:7b` are battle-ready; `deepseek-r1:8b` frozen on M2 Pro 16GB but needs M4 Pro re-test.
- `agent-spawn-guard.js` already hard-blocks `Agent()` with Anthropic models — guard is the floor that already saved us from auto-spawns.

## 4 · DeepSeek advisory (advisory_only=true)

1. **Reorder**: control-plane (Symbiotic Pulse, Packet 1) BEFORE data-plane (subagents, Packet 3). My final order does this.
2. **Lane dispatcher** (Packet 15) is the single highest-leverage architectural artifact — without it every migration is a hardcoded string swap.
3. nisaba-dream: prefer stripping the model call entirely (deterministic router) over swapping to local model.
4. EOT phase 5.5: migrate Haiku → `deepseek-r1:8b` local, not `qwen2.5:7b`. MoE reasoning better at multi-doc synthesis.
5. Nexbox missing 6 layers: identity attestation, schema version, trust chain, model catalog, fallback policy, liveness TTL. All folded into `nexbox-handoff-v1.md`.

## 5 · Execution plan — day-by-day skeleton

```
Day 1     · Track A starts (Codex parallel): packets 1, 5, 6, 7, 12, 17 — 5 worktrees, file-isolated
Day 1     · Marcel approves Packet 2 (settings.json default change)
Day 1-2   · Packet 2 lands, Packet 3 begins (depends on 2)
Day 3-4   · Track A wraps; Track B picks up packets 8, 10, 11
Day 4-5   · Marcel starts Packet 9 soak test on M4 Pro
Day 4-12  · Packet 15 (lane dispatcher) parallel — DeepSeek's #1 call
Day 5-10  · Packet 14 (NEXUSLINK nexbox extension) — Marcel + Codex
Day 10-11 · Packet 13 (verifier hardening + CI wire) — second pass
Day 12    · Packet 4 (EOT migration) lands behind Packet 15 dispatcher
Day 13-29 · Cleanup, observability, soak
Day 29    · Packet 16 (kill-switch drill) — 2026-06-14 final go/no-go
```

Total burn: ~17 working days parallel · ~13-day buffer vs cutover.

## 6 · Open questions for the next session

1. **Codex worktree strategy** — confirm 5 concurrent worktrees are within Marcel's local M2 Pro / M4 Pro capacity (memory says 8–10 safe, 14 ceiling).
2. **`.claude/settings.json` `"model"` field** — does Claude Code accept `null` / missing key, or does it require some value? (Test before Packet 2 ships.)
3. **M4 Pro soak test** — when does Marcel have a station free for a 24h `deepseek-r1:8b` load test (Packet 9)?
4. **`@amp.smart` collapse** — does `smart` collapse into `deep` (both → gpt-5.5) or stay distinct as `smart=gpt-5.5-reasoning-high`? (Packet 6 decision.)
5. **Nexbox v1 ship date** — does NEXUSLINK landing extension (Packet 14) ship with the sprint, or as a separate product release post-15-Jun?

## 7 · First commands for the next session

```bash
# 1. Confirm position
pwd                          # must be /Users/marcelspatz/YURI-OS-MUSUBI
git branch --show-current    # must be main

# 2. Re-baseline the verifier
node _SYSTEM/Scripts/independence-check.mjs | tail -20

# 3. Get route-plan evidence for execution start
./_SYSTEM/Scripts/ai route-plan "Execute Packet 1: De-Claude Symbiotic Pulse default cortex at _SYSTEM/Scripts/yuri-symbiotic-pulse.mjs:250"

# 4. GitNexus impact before touching the symbol
# (via MCP) gitnexus_impact({target:'symbioticPulse', direction:'upstream'})

# 5. Dispatch the first packet to Codex
bash _SYSTEM/Scripts/offload.sh -m gpt-5.5 "<CODEX TASK SPEC from build-list.md §Packet 1>"
```

## 8 · Pre-execution gates (always-on, do not bypass)

- ARGUS · HERMES · OBLITERATUS · CASSANDRA-lite native gates — always-on.
- `agent-spawn-guard.js` hard floor — do not set `YURI_ALLOW_AGENT=1`.
- Per packet: `gitnexus_impact()` BEFORE edit · `gitnexus_detect_changes()` BEFORE commit.
- No auto-commit. Marcel approves every commit.

## 9 · Authority chain (per `_SYSTEM/yuri-origin.md`)

1. Owner intent (Marcel)
2. Direct local evidence (grep/tool/filesystem reads)
3. `_SYSTEM/yuri-origin.md`
4. `SOUL.md`
5. Thin adapters (CLAUDE.md, AGENTS.md, …)
6. `_SYSTEM/Scripts/offload-contract.mjs`
7. On-demand skills/refs
8. Model inference (lowest)

**Codex is the only implementation authority.** All advisor output (DeepSeek, NVIDIA NIM, OpenClaw, Kimi) is `advisory_only=true · local_truth_claim=false` until verified by local evidence.

## 10 · Risk if dropped

- **Slip cost** (developer profile, indicative): status-quo $850/mo vs post-sprint $40/mo from 15 Jun — ~20× delta.
- **Strategic cost**: NEXUSLINK / nexbox product promise of "symbiotic independence" becomes hollow if client deliveries inherit Anthropic dependency the same week Anthropic re-prices.
- **Reputation cost**: this is the sprint that proves Yuri OS is actually sovereign rather than only claiming to be.

## 11 · Definition of done

- `_SYSTEM/Scripts/independence-check.mjs --strict` exits 0 under `YURI_NO_ANTHROPIC=1`.
- 24h kill-switch drill on 2026-06-14 completes with no critical-workflow block.
- Independence score ≥ 90 / 100.
- NEXUSLINK landing renders "Symbiotic Independence" section live.
- Codex commits trail audit-archive references in every packet's commit message.

---

**Handoff complete.** Next session reads this file first, then `MASTER.md` for full context, then `build-list.md` §Packet 1 to start.
