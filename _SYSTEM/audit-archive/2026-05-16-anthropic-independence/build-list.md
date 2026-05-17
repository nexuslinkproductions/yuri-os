# Build List — Pre-15-June Sovereignty Sprint

Machine-parseable build queue. Each packet shaped per `CLAUDE CONTROL PACKET` grammar (Goal · Target files · Constraints · Acceptance · Test · Rollback · Route-plan classification · GitNexus impact · Verification). Ordered per DeepSeek advisory: **control-plane before data-plane**. ETA assumes Codex-led implementation under Claude control-plane review.

---

## Packet 1 — De-Claude Symbiotic Pulse default cortex

- **Goal:** Symbiotic Pulse runtime defaults to a non-Anthropic model. Claude becomes opt-in only via explicit dispatch token.
- **Target files:** `_SYSTEM/Scripts/yuri-symbiotic-pulse.mjs:250`
- **Constraints:** No new dependencies. Existing `_SYSTEM/Scripts/offload-contract.mjs` lane vocabulary stays intact. Council-dissent mode (`@claude` advisory) still available when explicitly named.
- **Acceptance:**
  - [ ] Default `model:` at line 250 reads `deepseek-v4-pro` (or capability lookup once Packet #15 lands).
  - [ ] `_SYSTEM/Scripts/yuri-symbiotic-pulse.test.mjs` passes unchanged.
  - [ ] Pulse trace shows `lane=@deepseek-v4-pro` on a freshly seeded test prompt.
- **Test command:** `node _SYSTEM/Scripts/yuri-symbiotic-pulse.test.mjs && node _SYSTEM/Scripts/yuri-symbiotic-pulse.mjs --self-check`
- **Rollback boundary:** `git diff _SYSTEM/Scripts/yuri-symbiotic-pulse.mjs` ≤ 6 lines.
- **Route-plan classification:** critical · architectural · cortex migration.
- **GitNexus impact:** required upstream — `gitnexus_impact({target:'symbioticPulse', direction:'upstream'})`.
- **Verification before merge:** `gitnexus_detect_changes()` confirms only `symbioticPulse` runtime changed. Full pulse e2e test (`_SYSTEM/Scripts/yuri-symbiotic-pulse.test.mjs`).
- **ETA:** 1d · **Owner:** Codex.

---

## Packet 2 — Switch session default model away from sonnet

- **Goal:** `.claude/settings.json` no longer pins Anthropic Sonnet as the per-session default. Subagents inheriting the parent model fall back to either a non-Anthropic wrapper or per-agent explicit `model:` fields (Packet #3).
- **Target files:** `.claude/settings.json:89`
- **Constraints:** Claude Code may require *some* `"model"` value; if so, set to the cheapest user-pickable opt-in or remove the key entirely (Claude Code default UI prompt).
- **Acceptance:**
  - [ ] `jq '.model' .claude/settings.json` returns `null` or a non-Anthropic placeholder.
  - [ ] Boot a fresh session — no automatic Sonnet usage in token-ledger.
- **Test command:** `node _SYSTEM/Scripts/independence-check.mjs --check=default-model`
- **Rollback boundary:** single-line `.claude/settings.json` edit.
- **Route-plan classification:** high-stakes · global config · main-session approval.
- **GitNexus impact:** N/A (config-only).
- **Verification:** session restart smoke test; confirm no Sonnet token charges within first 60 s of fresh session under `YURI_NO_ANTHROPIC=1`.
- **ETA:** 0.5d · **Owner:** Claude (control plane) + Marcel (approval).

---

## Packet 3 — Add `model:` field to all 11 subagents

- **Goal:** Every `.claude/agents/*.md` declares an explicit non-Anthropic model OR is converted to `runtime kind: native_function` deterministic-only.
- **Target files:** all 11 files under `.claude/agents/`
- **Per-agent assignment:**
  - `architect.md` → `model: deepseek-v4-pro` (architecture reasoning depth)
  - `security-reviewer.md` → `model: deepseek-v4-pro`
  - `cassandra.md` → `model: deepseek-v4-flash` (fast risk triage)
  - `doc-cleaner.md` → `model: qwen2.5:7b` (local; deterministic format work)
  - `file-inventory.md` → `model: qwen2.5:7b` (local; cheap)
  - `log-summarizer.md` → `model: qwen2.5:7b` (local; bounded summarization)
  - `memory-curator.md` → `model: deepseek-v4-flash` (cloud; needs judgment)
  - `noesis-linter.md` → `model: qwen2.5:7b` (local; structural lint)
  - `argus.md`, `hermes.md`, `obliteratus-qa.md` → already `native_function`, no model needed (verify frontmatter says so).
- **Constraints:** No `Agent({ model: 'claude-*' })`. Honour `agent-spawn-guard.js` which already blocks Anthropic. Each frontmatter must include `model:` non-Anthropic.
- **Acceptance:**
  - [ ] `grep -h "^model:" .claude/agents/*.md | sort | uniq` shows zero `claude-*` values.
  - [ ] EOT Patch 001 verification: all 11 files have `model:` AND `description:` non-empty (except 3 native_function which need `runtime: native_function`).
- **Test command:** `node _SYSTEM/Scripts/independence-check.mjs --check=subagents`
- **Rollback boundary:** per-file `git diff` ≤ 4 lines each.
- **Route-plan classification:** high-stakes · routing · agent harness.
- **GitNexus impact:** none (markdown frontmatter).
- **Verification:** spawn each subagent in a smoke loop, assert non-Anthropic lane in token-ledger.
- **ETA:** 2d · **Owner:** Codex.

---

## Packet 4 — EOT skill · migrate Haiku workers to local deepseek-r1:8b

- **Goal:** `/eot` no longer spawns Anthropic Haiku workers as default. Local `deepseek-r1:8b` (after M4 Pro re-test, Packet #9) handles Phase 5.5 and Phase 3 audit workers. Haiku stays as cloud overflow when local queue saturated.
- **Target files:** `.claude/skills/end-of-transmission/SKILL.md:29,404-406`
- **Constraints:** EOT pipeline structure unchanged. Workers stay `run_in_background:true`. Local model picked by capability manifest (after Packet #15) or hardcoded fallback to `deepseek-r1:8b`. Conditional overflow to `deepseek-v4-flash` cloud (still non-Anthropic) when local queue depth > N.
- **Acceptance:**
  - [ ] `grep -n "haiku-4-5" .claude/skills/end-of-transmission/SKILL.md` returns 0 hits (or only in commented-out fallback).
  - [ ] `/eot` cycle under `YURI_NO_ANTHROPIC=1` completes successfully.
- **Test command:** `YURI_NO_ANTHROPIC=1 bash -c 'echo "end of transmission" | claude --plan'` (manual; or scripted `_SYSTEM/Scripts/independence-check.mjs --check=eot`).
- **Rollback boundary:** SKILL.md edits ≤ 30 lines.
- **Route-plan classification:** critical · skill protocol · auto-firing surface.
- **GitNexus impact:** none (markdown).
- **Verification:** full `/eot` run produces all phases without Anthropic token usage; output quality compared against prior baseline.
- **ETA:** 2d · **Owner:** Codex.

---

## Packet 5 — Rip Anthropic from `nisaba-dream.js`

- **Goal:** `.claude/hooks/nisaba-dream.js:75` no longer shells `claude -p`. Decide: (a) replace with `_SYSTEM/Scripts/offload.sh -m deepseek-r1:8b` shell-out, OR (b) strip the model call entirely and convert the hook to a deterministic dispatcher.
- **Target files:** `.claude/hooks/nisaba-dream.js`
- **Constraints:** Hook semantics preserved. `--allowedTools Write,Edit,Read` semantics may need re-implementation if going deterministic. Per DeepSeek advisory: prefer (b) if the hook is just dispatching signals; (a) only if multi-turn pipeline reasoning is actually required.
- **Acceptance:**
  - [ ] `grep -n "claude" .claude/hooks/nisaba-dream.js` returns 0 hits.
  - [ ] Hook fires successfully under `YURI_NO_ANTHROPIC=1`.
- **Test command:** `node .claude/hooks/nisaba-dream.js --dry-run`
- **Rollback boundary:** single-file hook edit.
- **Route-plan classification:** high-stakes · hook protocol.
- **GitNexus impact:** none (hook).
- **Verification:** hook fires; nisaba dream artifact produced; no Anthropic call in token ledger.
- **ETA:** 0.5d · **Owner:** Codex.

---

## Packet 6 — Strip `@claude` default routing · @amp.smart → gpt-5.5

- **Goal:** `@claude` lane in offload-contract is opt-in only — removed from any default fan-out chain. `@amp.smart` default mode no longer points to `claude-opus-4-7`.
- **Target files:** `_SYSTEM/Scripts/offload-contract.mjs:110, 270` (and dispatch tokens list at 176)
- **Constraints:** `@claude` lane stays *defined* for explicit user requests (`-m claude`). Default routing tables and scenario fan-outs do not include it. `@amp.smart` re-mapped to `gpt-5.5` (Codex full tier) which is already the `@amp.deep` mode — collapse if appropriate, or keep distinct as `smart=gpt-5.5-reasoning-high`.
- **Acceptance:**
  - [ ] `node _SYSTEM/Scripts/offload-contract-dispatch-check.mjs` passes.
  - [ ] `@amp` default mode does not route to Anthropic.
- **Test command:** `node _SYSTEM/Scripts/offload-contract-dispatch-check.mjs && node _SYSTEM/Scripts/independence-check.mjs --check=routing`
- **Rollback boundary:** `git diff _SYSTEM/Scripts/offload-contract.mjs` ≤ 30 lines.
- **Route-plan classification:** critical · routing contract.
- **GitNexus impact:** `gitnexus_impact({target:'offload-contract', direction:'upstream'})` required.
- **Verification:** dispatcher-check + smoke runs of @amp + every scenario fan-out under `YURI_NO_ANTHROPIC=1`.
- **ETA:** 1d · **Owner:** Codex.

---

## Packet 7 — trading-bot ensemble · replace claude-sonnet endpoint

- **Goal:** `_SYSTEM/Scripts/trading-bot/ensemble-inference.mjs` ensemble no longer calls `api.anthropic.com`. Replace with tri-ensemble across DeepSeek-V4-Pro + Kimi K2.6 + NVIDIA Nemotron-70B. Verify ensemble math (voting, weighting, consensus threshold) still produces calibrated signal.
- **Target files:** `_SYSTEM/Scripts/trading-bot/ensemble-inference.mjs:25-27` (and any consumers of `claude-sonnet-4-20250514`).
- **Constraints:** Output schema unchanged. Latency budget preserved. Confidence-calibration tests (if any) re-run.
- **Acceptance:**
  - [ ] `baseUrl` no longer `api.anthropic.com`.
  - [ ] Ensemble produces signal under `YURI_NO_ANTHROPIC=1`.
  - [ ] Backtest replay produces signal within ±5% of prior baseline (sanity).
- **Test command:** `node _SYSTEM/Scripts/trading-bot/ensemble-inference.mjs --self-check --replay=last-week`
- **Rollback boundary:** single file ≤ 60 lines.
- **Route-plan classification:** financial · high-stakes · ensemble.
- **GitNexus impact:** check.
- **Verification:** backtest delta + 24 h shadow run alongside old ensemble before cutover.
- **ETA:** 1d · **Owner:** Codex.

---

## Packet 8 — token-ledger pricing rows for non-Anthropic lanes

- **Goal:** `_SYSTEM/Scripts/token-ledger.mjs` and `.claude/hooks/token-status.js` carry pricing rows for every active non-Anthropic lane so cost telemetry stays accurate post-cutover.
- **Target files:** `_SYSTEM/Scripts/token-ledger.mjs:65-67,112` · `.claude/hooks/token-status.js:52-56`
- **Constraints:** Anthropic rows retained for opt-in usage tracking. New rows: deepseek-v4-pro, deepseek-v4-flash, kimi-k2.6, nemotron-70b, llama-3.3-70b, gpt-5.5, gpt-5.4-mini, gpt-5.3-codex-spark.
- **Acceptance:**
  - [ ] All active lanes from `_SYSTEM/Scripts/offload-contract.mjs` have pricing rows.
  - [ ] `_SYSTEM/Scripts/ai status` shows accurate per-lane cost summary.
- **Test command:** `node _SYSTEM/Scripts/token-ledger.mjs --self-check`
- **Rollback boundary:** ≤ 80 lines across two files.
- **Route-plan classification:** standard · telemetry.
- **GitNexus impact:** none.
- **Verification:** spawn one call to each lane, confirm ledger row.
- **ETA:** 1d · **Owner:** Codex.

---

## Packet 9 — Local-first reasoning fallback · deepseek-r1:8b re-test on M4 Pro · models.json refresh

- **Goal:** Confirm `deepseek-r1:8b` runs stably on Mac Mini M4 Pro 16 GB stations (current `.claude/config/models.json` flags it frozen from M2 Pro tests). Update `models.json` `local.deep_reasoning` and `local.primary` to reflect actual ollama-list arsenal (qwen2.5:7b is the de-facto primary today, not llama3.2).
- **Target files:** `.claude/config/models.json` · Ollama-installed model set.
- **Constraints:** No model > 9 GB on 16 GB unified memory (browser + IDE + backend headroom). Frozen flag removed only if 24 h soak passes.
- **Acceptance:**
  - [ ] `models.json` `local.primary` = `qwen2.5:7b` (de-facto today).
  - [ ] `models.json` `local.deep_reasoning` re-tested; if M4 Pro stable, unfreeze deepseek-r1:8b; else keep frozen and use cloud `deepseek-v4-flash` as deep-reasoning fallback.
  - [ ] `local.code` = `qwen2.5-coder:7b` (already correct).
- **Test command:** 24 h ollama soak test running deepseek-r1:8b under load, measure crash rate.
- **Rollback boundary:** `models.json` edit only.
- **Route-plan classification:** standard · config · runtime calibration.
- **Verification:** Marcel runs soak test on M4 Pro station; reports stable/unstable; Codex updates config accordingly.
- **ETA:** 2d (mostly waiting on soak test) · **Owner:** Marcel + Codex.

---

## Packet 10 — Hook-by-hook audit · quarantine any Claude spawn

- **Goal:** Each of the 37 hooks in `.claude/hooks/` audited for direct or transitive Anthropic calls. Findings logged. Any hook that fires Anthropic is either refactored to deterministic JS or routed through `_SYSTEM/Scripts/offload.sh -m <non-anthropic-lane>`.
- **Target files:** `.claude/hooks/*.js` (37 files)
- **Constraints:** Hook execution order preserved. No new dependencies. Quarantine = comment-out + raise issue if non-trivial refactor needed.
- **Acceptance:**
  - [ ] `grep -rEn "claude -p|api.anthropic|claude-(opus|sonnet|haiku)" .claude/hooks/ | grep -v "token-status.js" | grep -v "agent-spawn-guard.js"` returns 0 active hits.
  - [ ] `nisaba-dream.js` is the only currently-flagged hook (per Packet #5).
- **Test command:** scripted lint pass + boot session under `YURI_NO_ANTHROPIC=1`.
- **Rollback boundary:** per-hook small edits.
- **Route-plan classification:** high-stakes · hook protocol.
- **Verification:** independence-check passes; no automatic Anthropic spawns in 60 s of fresh session.
- **ETA:** 3d · **Owner:** Codex.

---

## Packet 11 — Skill model-routing sweep

- **Goal:** Each of 34 SKILL.md files (and any associated `.mjs` runtime) audited so model selection inside the skill body has a non-Anthropic primary. Anthropic = explicit opt-in only.
- **Target files:** `.claude/skills/*/SKILL.md` and any sibling scripts.
- **Constraints:** Skill triggers unchanged. Functionality preserved.
- **Acceptance:**
  - [ ] Skill bodies do not hardcode Anthropic model strings as defaults.
  - [ ] Skill manifests reviewed for `Agent()` spawns — flag any.
- **Test command:** scripted grep + per-skill smoke invocation under `YURI_NO_ANTHROPIC=1`.
- **Rollback boundary:** per-skill small edits.
- **Route-plan classification:** standard · skill harness.
- **Verification:** spawn each skill via `/<command>`, confirm non-Anthropic dispatch.
- **ETA:** 2d · **Owner:** Codex.

---

## Packet 12 — `_SYSTEM/Scripts/ai` banner defaults

- **Goal:** Status / banner output in `_SYSTEM/Scripts/ai` (lines 272, 1103, 1128) does not hard-assert `claude-sonnet-4-6`. Read actual session model from settings or display "user-selected".
- **Target files:** `_SYSTEM/Scripts/ai:272,1103,1128`
- **Constraints:** Cosmetic. No behavior change.
- **Acceptance:**
  - [ ] `_SYSTEM/Scripts/ai status` does not falsely advertise Claude as active model when it isn't.
- **Test command:** `bash _SYSTEM/Scripts/ai status`
- **Rollback boundary:** ≤ 20 lines.
- **Route-plan classification:** trivial · cosmetic.
- **ETA:** 0.5d · **Owner:** Codex.

---

## Packet 13 — Independence smoke test — `YURI_NO_ANTHROPIC=1`

- **Goal:** New script `_SYSTEM/Scripts/independence-check.mjs` boots a verifier that walks every subagent, hook, skill, and offload lane to assert no Anthropic surface fires when `YURI_NO_ANTHROPIC=1` is set.
- **Target files:** new file `_SYSTEM/Scripts/independence-check.mjs`
- **Constraints:** Read-only verifier — no mutations. Should run in < 60 s. Exit 0 on PASS, non-zero with diagnostic on FAIL.
- **Acceptance:**
  - [ ] Script exists, executes, returns 0 on pass.
  - [ ] CI hook wires it to pre-commit or pre-push.
- **Test command:** `node _SYSTEM/Scripts/independence-check.mjs --strict`
- **Rollback boundary:** new file, deletable.
- **Route-plan classification:** standard · verifier.
- **Verification:** intentionally introduce an Anthropic reference, confirm script catches it; remove reference.
- **ETA:** 1.5d · **Owner:** Codex.

---

## Packet 14 — NEXUSLINK nexbox handoff packet

- **Goal:** `_SYSTEM/NEXUSLINK/nexbox-handoff-v1.md` defines client-deliverable bundle. `src/components/NexusLinkLanding.tsx` extended with a "Symbiotic Independence" section.
- **Target files:** new `_SYSTEM/NEXUSLINK/nexbox-handoff-v1.md` · edits to `src/components/NexusLinkLanding.tsx` + `src/lib/nexuslinkLandingData.ts`
- **Constraints:** Landing page changes are additive only. Bundle spec must include 6 layers DeepSeek flagged (identity attestation, schema version, trust chain, model catalog, fallback policy, liveness TTL).
- **Acceptance:**
  - [ ] `_SYSTEM/NEXUSLINK/nexbox-handoff-v1.md` exists with full bundle spec.
  - [ ] Landing page renders new "Symbiotic Independence" section.
- **Test command:** `npm run lint && npm run build` (or local dev server smoke).
- **Rollback boundary:** new file + ≤ 80 lines of landing edits.
- **Route-plan classification:** high-stakes · product surface.
- **Verification:** landing page e2e test; bundle spec reviewed by Marcel.
- **ETA:** 2d · **Owner:** Marcel + Codex.

---

## Packet 15 — Lane dispatcher abstraction (capability manifest router)

- **Goal:** New `_SYSTEM/Scripts/lane-dispatcher.mjs` reads a capability manifest (each lane declares ctx window, tool-use support, latency tier, cost tier, privacy class) and selects lane per call based on requirements. Every later migration becomes a manifest config change rather than a hardcoded model string swap.
- **Target files:** new `_SYSTEM/Scripts/lane-dispatcher.mjs` · new `_SYSTEM/Scripts/lane-capability-manifest.json` · refactor consumers (`yuri-symbiotic-pulse.mjs`, `pulse-orchestrator.mjs`, hook templates) to call dispatcher.
- **Constraints:** Existing dispatch tokens (`@deepseek`, `@kimi`, etc.) remain backward-compatible. Dispatcher is additive — direct `-m <model>` calls still work.
- **Acceptance:**
  - [ ] Dispatcher selects correct lane for a synthetic capability request.
  - [ ] At least 3 consumers refactored to use dispatcher.
- **Test command:** `node _SYSTEM/Scripts/lane-dispatcher.mjs --self-check`
- **Rollback boundary:** new files; consumer refactors are additive.
- **Route-plan classification:** critical · architectural · routing runtime.
- **GitNexus impact:** required — `gitnexus_impact({target:'lane-dispatcher'})` after first use.
- **Verification:** swap a manifest field (e.g. cost-tier on @amp.smart), confirm next dispatch picks different lane without source edits.
- **ETA:** 3d · **Owner:** Codex.

---

## Packet 16 — Kill-switch drill (14 June)

- **Goal:** Final verification. Disable Anthropic API key, set `YURI_NO_ANTHROPIC=1`, run full Yuri OS day. Measure productivity delta. Pass = independence-score ≥ 90 + no critical workflow blocked.
- **Target files:** none — runbook + observation.
- **Acceptance:**
  - [ ] 24 h continuous operation with no Anthropic key.
  - [ ] No critical workflow blocked.
  - [ ] Independence score ≥ 90 confirmed.
- **Test command:** `unset ANTHROPIC_API_KEY && export YURI_NO_ANTHROPIC=1 && node _SYSTEM/Scripts/independence-check.mjs --strict && claude` (then operate normally for 24 h).
- **Rollback boundary:** environment-only.
- **Route-plan classification:** critical · go/no-go drill.
- **ETA:** 0.5d (execution) — schedule for 2026-06-14.
- **Owner:** Marcel.

---

## Packet 17 — Skill-bound `agent.md` Anthropic models

- **Goal:** Five skill-scoped `agent.md` files no longer declare Anthropic models. (Surface discovered by verifier smoke test 2026-05-16, missed by initial SKILL.md-scoped grep.)
- **Target files:**
  - `.claude/skills/execution-domain-core/agent.md:4` (claude-sonnet-4-6)
  - `.claude/skills/failure-evolution-loop/agent.md:4` (claude-haiku-4-5-20251001)
  - `.claude/skills/non-destructive-infinity-guard/agent.md:4` (claude-sonnet-4-6)
  - `.claude/skills/parallel-clone-orchestrator/agent.md:4` (claude-sonnet-4-6)
  - `.claude/skills/pattern-mirror-core/agent.md:4` (claude-sonnet-4-6)
- **Replacement per skill semantics:**
  - `execution-domain-core` → `deepseek-v4-pro` (policy/exit-criteria judgment needs reasoning depth)
  - `failure-evolution-loop` → `deepseek-v4-flash` (failure capture is fast triage)
  - `non-destructive-infinity-guard` → `deepseek-v4-pro` (risk classifier; needs judgment)
  - `parallel-clone-orchestrator` → `deepseek-v4-pro` (decomposition/synthesis)
  - `pattern-mirror-core` → `deepseek-v4-pro` (artifact perception/extraction)
- **Constraints:** Skill behaviour preserved. No skill triggers change.
- **Acceptance:**
  - [ ] `grep -h "^model:" .claude/skills/*/agent.md` returns zero `claude-*` values.
  - [ ] Invoke each skill via its slash command; verify dispatch goes to DeepSeek not Anthropic.
- **Test command:** `node _SYSTEM/Scripts/independence-check.mjs --check=skills`
- **Rollback boundary:** 5 single-line frontmatter edits.
- **Route-plan classification:** high-stakes · skill harness.
- **GitNexus impact:** none (frontmatter only).
- **Verification:** per-skill smoke run under `YURI_NO_ANTHROPIC=1`.
- **ETA:** 0.5d (mechanical) · **Owner:** Codex.

---

## Parallelization Summary

| Track | Packets | Day window | Notes |
|-------|---------|------------|-------|
| A · Codex parallel | 1, 5, 6, 7, 12 | days 1–4 | independent files, no shared edits |
| B · Codex sequential | 2 → 3 → 4 → 8 → 10 → 11 | days 1–13 | settings.json affects subagent inheritance |
| C · Marcel + Codex | 9, 14 | days 5–10 | needs Marcel hardware + product input |
| D · Architectural | 15 | days 4–12 | lane dispatcher; lands by day 12 |
| E · Verification | 13, 16 | days 10–11, 29 | smoke test then drill |

**Total burn:** ~17 working days against 30-day calendar → ~13 day buffer.
