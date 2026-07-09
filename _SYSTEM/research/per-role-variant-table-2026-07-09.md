# Per-Role Variant Assignment Table — MURE Rebuild — 2026-07-09

**Author:** Opus 4.8 heavy-reasoning lane (HV04), max thinking depth.
**Downstream consumer:** MiniMax-M3 drafter → transcribes `variants[]` into `.openclaw/mure-agent-catalog.json`.
**Scope:** 24 roles (mure-advisor excluded — already drafted with 7 variants; sanity-checked at end).
**Seed source:** `_SYSTEM/research/model-audit-2026-07-09.md` role×model relevance matrix (L496–L521). Seeded ONLY from ★/● cells; `—`/`?` cells dropped.

---

## READING RULES APPLIED (binding decisions before the table)

These four cross-model exclusions were applied to EVERY audit ★/● cell before seeding. Each is a place where a binding owner constraint overrides an audit star. All losses are itemized in the "Variants the audit star-cell lost" section.

1. **Fable-5 (F5) → EXCLUDED everywhere.** Temporarily unavailable till 2026-07-12 (`cloud-fleet-models.json:6`, catalog `fable-synth` note L307). Every F5 ★/● cell dropped. `fable-synth` agent itself is DISABLED.
2. **Sonnet-4-6 (S46) → EXCLUDED (dominated).** Same price as Sonnet 5, strictly inferior on agentic benchmarks (`model-audit:118-120`). Every S46 ★ is re-pointed to Sonnet 5. Keeps the seed lean per "when in doubt, fewer variants."
3. **MiniMax M2.7 / M2.7-highspeed (M27/M27H) → EXCLUDED (`?` availability).** Superseded by M3; Ultra-tier availability flagged NEEDS VERIFICATION (`model-audit:411,434,568`). `?`-class ⇒ exclude per constraint.
4. **Haiku (H45) → EXCLUDED from all write/curate roles.** Owner rule: "Haiku is recon + cheap research ONLY." Eligible contexts are the enumerated read/recon set (scout, envoy, chronicler-cheap, advisor-watcher-T1). Haiku ★/● cells on write-heavy roles (artificer, archivist, calibrator, quartermaster, composer-fast) are DROPPED — those roles write files / run tests / mutate state and fall outside "recon + cheap research." Haiku is kept ONLY where the role is read-only recon.

Also structurally dropped: **Kimi-k2.7-code** and **all Cursor models** (composer-2.5/-fast, grok-4.3, gpt-5.5-high, grok-code-fast-1) are NOT in the audit matrix columns and cannot be seeded from it; Cursor is additionally "NOT actively routed" (`cloud-fleet-models.json:168`). Roles whose *current* catalog binding is Kimi/Cursor are reseeded purely from their audit row. **GLM-4.6V (G4V)** never scores ★/● in any row → never appears.

**Model-string + short-code key** (for transcription):

```json
{
  "opus48":   "anthropic/claude-opus-4-8",
  "sonnet5":  "anthropic/claude-sonnet-5",
  "haiku":    "anthropic/claude-haiku-4-5",
  "glm52":    "zai/glm-5.2",
  "glm51":    "zai/glm-5.1",
  "glmturbo": "zai/glm-5-turbo",
  "dvp":      "deepseek-v4-pro:direct",
  "dvf":      "deepseek-v4-flash:direct",
  "m3":       "minimax-portal/MiniMax-M3"
}
```

DeepSeek strings use the `:direct` suffix (re-instated direct API, `cloud-fleet-models.json:172-197`) matching the existing `mure-advisor` variant convention. Both DeepSeek tiers carry the **$1.25/day hard cap** (`advisor-note-schema:199-220`).

**Convention defaults** (unless a role overrides): cheap tier → `thinkingLevel: low`, `max_tokens: 4096`; medium (Sonnet 5) → `medium`, `8192`; heavy (glm52/dvp/m3) → `high`, `8192` (M3 cross-modal/long-ctx → `16384`); apex (opus48) → `high`, `8192` (synthesis-heavy → `16384`). Read-only roles get `tools: [read, grep, glob]`; all others `[read, grep, glob, edit, write, bash]` (mirrors catalog per-role tools).

---

## 1. mure-helmsman
lane: orchestration
mission: decode the goal into a goal tree, decompose into sub-tasks, capability-match roles, build runSwarm leaves, hold the goal spine, escalate owner-gated decisions.

```json
[
  {"id":"mure-helmsman-glm52","model":"zai/glm-5.2","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["orchestrator-peer","apex-judgment"],"eligibilityFlags":["heavy","judgment-seat","orchestrator-only","z-ai-quota-pool"],"costTier":"heavy","note":"Z.ai-pool orchestrator when the Anthropic weekly pool is capped; near-Opus FrontierSWE (74.4 vs 75.1) at 1M ctx."},
  {"id":"mure-helmsman-opus48","model":"anthropic/claude-opus-4-8","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["apex-judgment","orchestrator-peer"],"eligibilityFlags":["apex","judgment-seat","orchestrator-only","anchor"],"costTier":"apex","note":"Proven orchestrator; max goal-spine + dispatch-planning reasoning — the anchor prime."}
]
```

selection: surfaced-heavy
fallbackChain: [mure-helmsman-glm52, mure-helmsman-opus48]
specialRules: [judgment-seat, orchestrator-only-never-leaf, finalize-authority-within-run-but-never-commit-push]
rationale: Helmsman IS the apex reasoning lane per fleet-economy — it must not run on a medium model or the whole run degrades. Audit ★ = F5/O48/G52; F5 excluded, leaving the two orchestration-class reasoners. Opus 4.8 is the anchor prime (this is a judgment seat, the one place Opus reservation *grants* rather than withholds); GLM-5.2 is the quota-pool fallback (the raison d'être of `mure-helmsman-glm`). Audit ● cells (S5/DVP/M3) dropped — a cost-cut on the orchestrator is a false economy.

## 2. mure-helmsman-glm
lane: orchestration
mission: decode the goal into a goal tree, decompose into sub-tasks, capability-match roles, build runSwarm leaves, hold the goal spine, escalate owner-gated decisions (GLM-pool orchestrator variant).

```json
[
  {"id":"mure-helmsman-glm-glm51","model":"zai/glm-5.1","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["orchestrator-peer"],"eligibilityFlags":["heavy","workhorse","orchestrator-only","z-ai-quota-pool"],"costTier":"heavy","note":"200K-ctx workhorse orchestrator for shorter goal-trees; 8-hour autonomy stability when GLM-5.2 quota is tight."},
  {"id":"mure-helmsman-glm-glm52","model":"zai/glm-5.2","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["orchestrator-peer","apex-judgment"],"eligibilityFlags":["heavy","judgment-seat","orchestrator-only","z-ai-quota-pool"],"costTier":"heavy","note":"Prime — the only Z.ai model with orchestration-class reasoning (1M ctx, Max thinking)."}
]
```

selection: surfaced-heavy
fallbackChain: [mure-helmsman-glm-glm51, mure-helmsman-glm-glm52]
specialRules: [z-ai-quota-pool-only, orchestrator-only-never-leaf]
rationale: Dedicated GLM orchestrator. Audit ★ = G52 only; ● = G51. All Anthropic cells are `—` (wrong provider pool by design). GLM-5.2 prime; GLM-5.1 is the smaller-ctx workhorse fallback within the same quota pool.

## 3. mure-envoy
lane: operations
mission: decode the owner brain-dump (rank intents, surface hidden constraint + meta-need), turn chaotic input into a clean spec / goal tree for the helmsman.
tools: read-only ([read, grep, glob]) — matches catalog.

```json
[
  {"id":"mure-envoy-haiku","model":"anthropic/claude-haiku-4-5","thinkingLevel":"low","tools":["read","grep","glob"],"max_tokens":4096,"systemSections":["minimalist","recon-breadth"],"eligibilityFlags":["cheap","recon-eligible","cheap-research-only","haiku-eligible-context"],"costTier":"cheap","note":"Fast cheap decode of short/simple brain-dumps; envoy is an explicit Haiku-eligible read-only context."},
  {"id":"mure-envoy-sonnet5","model":"anthropic/claude-sonnet-5","thinkingLevel":"medium","tools":["read","grep","glob"],"max_tokens":8192,"systemSections":["agentic-clean-tool-use","minimalist"],"eligibilityFlags":["default-prime","auto-prime"],"costTier":"medium","note":"Default prime — intent-ranking + hidden-constraint surfacing at cost-perf sweet spot."},
  {"id":"mure-envoy-m3","model":"minimax-portal/MiniMax-M3","thinkingLevel":"high","tools":["read","grep","glob"],"max_tokens":16384,"systemSections":["vision-cross-modal","agentic-clean-tool-use"],"eligibilityFlags":["heavy","minimax-ultra","cross-modal"],"costTier":"heavy","note":"Decode brain-dumps carrying images/video/screenshots (1M ctx + image + video)."}
]
```

selection: auto-cheap
fallbackChain: [mure-envoy-haiku, mure-envoy-sonnet5, mure-envoy-m3]
specialRules: [read-only]
rationale: Audit ★ = S5/S46/M3; S46→S5. Sonnet 5 is the default-prime decoder; Haiku is the legitimate cheap tier (envoy is on the owner's Haiku-eligible list AND read-only, satisfying "recon/cheap-research"); M3 is the cross-modal override for visual brain-dumps. Opus/DVP ● dropped — decode is light-medium reasoning, not apex.

## 4. mure-scout
lane: research
mission: research local corpus first then online; cite primary sources; synthesize findings; capture to the research corpus.
tools: read-only ([read, grep, glob]).

```json
[
  {"id":"mure-scout-haiku","model":"anthropic/claude-haiku-4-5","thinkingLevel":"low","tools":["read","grep","glob"],"max_tokens":4096,"systemSections":["recon-breadth","cheap-research"],"eligibilityFlags":["cheap","recon-eligible","cheap-research-only","haiku-eligible-context"],"costTier":"cheap","note":"Cheap local-corpus recon + citation gathering; scout is an explicit Haiku-eligible read-only context."},
  {"id":"mure-scout-sonnet5","model":"anthropic/claude-sonnet-5","thinkingLevel":"medium","tools":["read","grep","glob"],"max_tokens":8192,"systemSections":["cheap-research","agentic-clean-tool-use"],"eligibilityFlags":["default-prime","auto-prime"],"costTier":"medium","note":"Default prime — multi-step local-first + online research with synthesis."},
  {"id":"mure-scout-m3","model":"minimax-portal/MiniMax-M3","thinkingLevel":"high","tools":["read","grep","glob"],"max_tokens":16384,"systemSections":["vision-cross-modal","cheap-research"],"eligibilityFlags":["heavy","minimax-ultra","cross-modal"],"costTier":"heavy","note":"1M-ctx sweep over very large corpora + visual/diagram source material."}
]
```

selection: auto-cheap
fallbackChain: [mure-scout-haiku, mure-scout-sonnet5, mure-scout-m3]
specialRules: [read-only]
rationale: Audit ★ = S5/S46 (S46→S5). Haiku cheap recon (Haiku-eligible + read-only), Sonnet 5 prime, M3 for 1M-ctx / cross-modal source material (constraint names scout as an M3 "1M ctx" role). Opus/DVP/G52 ● dropped for conservatism.

## 5. mure-engineer
lane: engineering
mission: implement features; write the primary code for a scoped sub-task; build behind disarmed flags.

```json
[
  {"id":"mure-engineer-dvf","model":"deepseek-v4-flash:direct","thinkingLevel":"low","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["coding-excellence","minimalist"],"eligibilityFlags":["cheap","deepseek-capped","workhorse"],"costTier":"cheap","note":"Cheap coder for simple scoped features (SWE-Verified 79.0); subject to $1.25/day DeepSeek cap."},
  {"id":"mure-engineer-sonnet5","model":"anthropic/claude-sonnet-5","thinkingLevel":"medium","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["coding-excellence","agentic-clean-tool-use"],"eligibilityFlags":["auto-prime","workhorse"],"costTier":"medium","note":"Cost-perf coder; finishes end-to-end where Sonnet 4.6 stalled — Anthropic-pool alternate to GLM."},
  {"id":"mure-engineer-glm52","model":"zai/glm-5.2","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["coding-excellence","agentic-clean-tool-use"],"eligibilityFlags":["heavy","workhorse","z-ai-quota-pool"],"costTier":"heavy","note":"Workhorse prime for non-judgment codegen — ×20 GLM pool spares the Anthropic weekly quota; 1M ctx."},
  {"id":"mure-engineer-m3","model":"minimax-portal/MiniMax-M3","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":16384,"systemSections":["coding-excellence","vision-cross-modal"],"eligibilityFlags":["heavy","minimax-ultra","cross-modal"],"costTier":"heavy","note":"1M-ctx builds + implement-from-screenshot/diagram (frontend/backend spec fidelity)."}
]
```

selection: auto-cheap
fallbackChain: [mure-engineer-dvf, mure-engineer-sonnet5, mure-engineer-glm52, mure-engineer-m3]
specialRules: [opus-excluded-routine-codegen]
rationale: Audit ★ = F5/O48/S5/G52/DVP/M3. **Opus 4.8 (★) is deliberately EXCLUDED** — constraint reserves Opus for judgment seats, NOT routine codegen; engineer is the codegen workhorse. GLM-5.2 is the workhorse prime (heavy-use ×20 pool by owner directive), Sonnet 5 the Anthropic-pool alternate, M3 the cross-modal/1M option, DVF the capped cheap tier. Four variants is the upper bound, justified: this is the core build role that most benefits from cost-graded fan-out.

## 6. mure-mechanic
lane: engineering
mission: wire modules together, refactor, productize research code, fix integration seams.

```json
[
  {"id":"mure-mechanic-dvf","model":"deepseek-v4-flash:direct","thinkingLevel":"low","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["coding-excellence","minimalist"],"eligibilityFlags":["cheap","deepseek-capped","workhorse"],"costTier":"cheap","note":"Cheap mechanical wiring / seam fixes; $1.25/day DeepSeek cap."},
  {"id":"mure-mechanic-sonnet5","model":"anthropic/claude-sonnet-5","thinkingLevel":"medium","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["coding-excellence","agentic-clean-tool-use"],"eligibilityFlags":["default-prime","auto-prime","workhorse"],"costTier":"medium","note":"Default prime — integration + refactor + PR-review-grade multi-file work."},
  {"id":"mure-mechanic-glm52","model":"zai/glm-5.2","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["coding-excellence","agentic-clean-tool-use"],"eligibilityFlags":["heavy","workhorse","z-ai-quota-pool"],"costTier":"heavy","note":"Hard cross-module integration on the ×20 GLM pool; 1M ctx for whole-subsystem refactors."},
  {"id":"mure-mechanic-m3","model":"minimax-portal/MiniMax-M3","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":16384,"systemSections":["coding-excellence","vision-cross-modal"],"eligibilityFlags":["heavy","minimax-ultra","cross-modal"],"costTier":"heavy","note":"Large 1M-ctx refactors; wiring against visual/UI references."}
]
```

selection: auto-cheap
fallbackChain: [mure-mechanic-dvf, mure-mechanic-sonnet5, mure-mechanic-glm52, mure-mechanic-m3]
specialRules: [opus-excluded-routine-codegen]
rationale: Audit ★ = O48/S5/S46/G52/G51/DVP/M3. Opus (★) EXCLUDED (integration is codegen-class, not a judgment seat); S46→S5. Sonnet 5 default-prime; GLM-5.2 the GLM-pool heavy workhorse (GLM-5.1 ★ folded into it — 5.2 has 1M ctx and dominates 5.1 on bench, so 5.1 adds no distinct value here); M3 cross-modal/1M; DVF cheap capped.

## 7. mure-artificer
lane: engineering
mission: scaffold files, do mechanical edits, run tests, census/scan — the cheap fast lane.

```json
[
  {"id":"mure-artificer-glmturbo","model":"zai/glm-5-turbo","thinkingLevel":"low","tools":["read","grep","glob","edit","write","bash"],"max_tokens":4096,"systemSections":["minimalist","agentic-clean-tool-use"],"eligibilityFlags":["cheap","z-ai-quota-pool","always-on"],"costTier":"cheap","note":"Prime cheap scaffolding/census lane on the Z.ai pool — designed for always-on high-throughput bulk."},
  {"id":"mure-artificer-dvf","model":"deepseek-v4-flash:direct","thinkingLevel":"low","tools":["read","grep","glob","edit","write","bash"],"max_tokens":4096,"systemSections":["minimalist","agentic-clean-tool-use"],"eligibilityFlags":["cheap","deepseek-capped"],"costTier":"cheap","note":"Cheap mechanical edits + test-runs with light reasoning; $1.25/day DeepSeek cap."},
  {"id":"mure-artificer-sonnet5","model":"anthropic/claude-sonnet-5","thinkingLevel":"medium","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["agentic-clean-tool-use","minimalist"],"eligibilityFlags":["medium","fallback-when-scaffold-needs-judgment"],"costTier":"medium","note":"Fallback when scaffolding needs a brain (non-trivial templates / test authoring judgment)."}
]
```

selection: auto-cheap
fallbackChain: [mure-artificer-glmturbo, mure-artificer-dvf, mure-artificer-sonnet5]
specialRules: [cheap-fast-lane]
rationale: Audit ★ = H45/GT/M27H. **Haiku (★) and M27H (★) both EXCLUDED** — Haiku because artificer WRITES files / runs tests (outside "recon + cheap research"; not on the owner's Haiku-eligible list); M27H because Ultra availability is unverified (`?`). GLM-5-turbo is the cheap Z.ai prime, DVF the cheap capped alternate, Sonnet 5 the light-reasoning fallback.

## 8. mure-kernelsmith
lane: engineering
mission: optimize hot paths; identify Rust/Mojo consolidation candidates (JS reference + native delivery); benchmark perf tradeoffs.

```json
[
  {"id":"mure-kernelsmith-glm52","model":"zai/glm-5.2","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["coding-excellence","apex-judgment"],"eligibilityFlags":["heavy","workhorse","z-ai-quota-pool"],"costTier":"heavy","note":"Workhorse prime for perf codegen + tradeoff reasoning on the ×20 pool."},
  {"id":"mure-kernelsmith-dvp","model":"deepseek-v4-pro:direct","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["coding-excellence","narrow-prompt-reserved"],"eligibilityFlags":["heavy","deepseek-capped","think-max"],"costTier":"heavy","note":"Think Max for elite algorithmic hot-path work (Codeforces 3206, LiveCodeBench 93.5); $1.25/day cap."},
  {"id":"mure-kernelsmith-m3","model":"minimax-portal/MiniMax-M3","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["coding-excellence"],"eligibilityFlags":["heavy","minimax-ultra"],"costTier":"heavy","note":"KernelBench-Hard 28.8 — low-level / kernel perf specialty."},
  {"id":"mure-kernelsmith-opus48","model":"anthropic/claude-opus-4-8","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["apex-judgment","narrow-prompt-reserved"],"eligibilityFlags":["apex","judgment-seat","anchor"],"costTier":"apex","note":"Apex override for the hardest perf-judgment + language-consolidation architecture (JS→Rust/Mojo)."}
]
```

selection: surfaced-heavy
fallbackChain: [mure-kernelsmith-glm52, mure-kernelsmith-dvp, mure-kernelsmith-m3, mure-kernelsmith-opus48]
specialRules: [opus-explicit-call-only]
rationale: Audit ★ = F5/O48/G52/DVP (F5 excluded). Kernelsmith is the ONE codegen role where Opus is retained — the owner's Opus-demotion directive explicitly maps Opus to kernelsmith for heavy judgment (language-consolidation architecture is a judgment call, not routine codegen). Opus stays apex/explicit-call; GLM-5.2 is the day-to-day perf workhorse, DVP Think Max the algorithmic specialist, M3 the kernel-perf option (audit ● but a distinct KernelBench strength).

## 9. mure-sentinel
lane: engineering
mission: security-review code, audit protected-path and safety boundaries, adversarial red-team for vulnerabilities; any ARM is owner-gated.

```json
[
  {"id":"mure-sentinel-dvp","model":"deepseek-v4-pro:direct","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["security-strict","narrow-prompt-reserved"],"eligibilityFlags":["heavy","security-only","deepseek-capped","think-max"],"costTier":"heavy","note":"Think Max deep-adversarial security fallback — audit co-primes it with Opus for chained-exploit reasoning; $1.25/day cap."},
  {"id":"mure-sentinel-opus48","model":"anthropic/claude-opus-4-8","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["security-strict","apex-judgment","narrow-prompt-reserved"],"eligibilityFlags":["apex","security-only","anchor","mandatory-prime"],"costTier":"apex","note":"MANDATORY security anchor prime (hard rule) — deepest adversarial + attack-class knowledge."}
]
```

selection: surfaced-heavy
fallbackChain: [mure-sentinel-dvp, mure-sentinel-opus48]
specialRules: [security-only, MUST-be-opus48-prime, only-opus48-or-dvp-think-max-eligible, sonnet5-glm-cheap-DISQUALIFIED, ARM-owner-gated, structurally-independent-of-engineer-mechanic]
rationale: Audit ★ = O48/DVP. **HARD SECURITY RULE:** Opus 4.8 is the mandatory prime; Sonnet 5 is DISQUALIFIED (VERIFIED "lower cybersecurity task ability", `model-audit:94,531`), and all small/cheap models are disqualified. Audit ● cells (S5/G52/DVF) are therefore DROPPED even though non-`—`. DVP Think Max is the sole permitted heavy fallback — the audit explicitly names Opus + DVP Think Max as the two best-positioned for chained-exploit reasoning (`model-audit:531`). GLM-5.2 excluded (audit: "less tested on security-critical review", `model-audit:188`).

## 10. mure-ideator
lane: research
mission: generate unusual options, edge cases, and remote associations; score novelty; run the divergent scan before convergence.
tools: read-only ([read, grep, glob]).

```json
[
  {"id":"mure-ideator-sonnet5","model":"anthropic/claude-sonnet-5","thinkingLevel":"medium","tools":["read","grep","glob"],"max_tokens":8192,"systemSections":["agentic-clean-tool-use","minimalist"],"eligibilityFlags":["default-prime","auto-prime"],"costTier":"medium","note":"Default prime — routine divergent scan + novelty scoring."},
  {"id":"mure-ideator-glm52","model":"zai/glm-5.2","thinkingLevel":"high","tools":["read","grep","glob"],"max_tokens":8192,"systemSections":["apex-judgment"],"eligibilityFlags":["heavy","z-ai-quota-pool"],"costTier":"heavy","note":"Broader remote-association / cross-domain leap generation."},
  {"id":"mure-ideator-dvp","model":"deepseek-v4-pro:direct","thinkingLevel":"high","tools":["read","grep","glob"],"max_tokens":8192,"systemSections":["apex-judgment","narrow-prompt-reserved"],"eligibilityFlags":["heavy","deepseek-capped","think-max"],"costTier":"heavy","note":"Deep divergent reasoning for high-stakes edge-case hunting; $1.25/day cap."}
]
```

selection: auto-cheap
fallbackChain: [mure-ideator-sonnet5, mure-ideator-glm52, mure-ideator-dvp]
specialRules: [read-only]
rationale: Audit ★ = F5/O48/DVP (F5 excluded). **Opus (★) deferred** — ideation is generative, not a judgment SEAT, and the CRITICAL-commit divergent scan (Izanagi) is a main-session skill, not this agent; Opus reservation applies. Sonnet 5 prime, GLM-5.2 for creative breadth, DVP Think Max for deep edge-case reasoning. M3 ● (cross-modal ideation) noted but omitted for conservatism.

## 11. mure-deliberator
lane: research
mission: hold one hard sub-problem deeply with adaptive compute; build the full mechanism map; exit on completion or verification checkpoint.

```json
[
  {"id":"mure-deliberator-glm52","model":"zai/glm-5.2","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["apex-judgment","narrow-prompt-reserved"],"eligibilityFlags":["heavy","workhorse","z-ai-quota-pool"],"costTier":"heavy","note":"Max-thinking deep-reasoning workhorse prime on the ×20 pool."},
  {"id":"mure-deliberator-dvp","model":"deepseek-v4-pro:direct","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["apex-judgment","narrow-prompt-reserved"],"eligibilityFlags":["heavy","deepseek-capped","think-max"],"costTier":"heavy","note":"Think Max — deepest single-problem reasoning (LiveCodeBench 93.5); $1.25/day cap."},
  {"id":"mure-deliberator-opus48","model":"anthropic/claude-opus-4-8","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["apex-judgment","narrow-prompt-reserved"],"eligibilityFlags":["apex","judgment-seat","anchor"],"costTier":"apex","note":"Apex override for the hardest monotropic deliberation."}
]
```

selection: surfaced-heavy
fallbackChain: [mure-deliberator-glm52, mure-deliberator-dvp, mure-deliberator-opus48]
specialRules: [opus-explicit-call-only]
rationale: Audit ★ = F5/O48/G52/DVP (F5 excluded). Deep monotropic reasoning is a high-value seat where Opus is retained (as apex override). GLM-5.2 Max is the deep-reasoning prime, DVP Think Max the peer specialist (deepest LiveCodeBench), Opus the apex escalation. S5/G51/DVF/M3 ● dropped — deliberation is heavy by definition.

## 12. mure-synthesist
lane: research
mission: merge scattered findings into a lattice map; name cross-domain transfers (source/target/mechanism/mismatch/confidence); large-context synthesis.

```json
[
  {"id":"mure-synthesist-sonnet5","model":"anthropic/claude-sonnet-5","thinkingLevel":"medium","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["minimalist","agentic-clean-tool-use"],"eligibilityFlags":["medium","auto-prime"],"costTier":"medium","note":"Smaller-scope synthesis where 1M ctx is not required."},
  {"id":"mure-synthesist-glm52","model":"zai/glm-5.2","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":16384,"systemSections":["apex-judgment","minimalist"],"eligibilityFlags":["heavy","workhorse","z-ai-quota-pool"],"costTier":"heavy","note":"1M-ctx text lattice-synthesis prime — merge large scattered corpora + name convergences."},
  {"id":"mure-synthesist-m3","model":"minimax-portal/MiniMax-M3","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":16384,"systemSections":["vision-cross-modal","apex-judgment"],"eligibilityFlags":["heavy","minimax-ultra","cross-modal"],"costTier":"heavy","note":"Cross-modal synthesis — lattice maps that span visual artifacts (1M ctx + image + video)."}
]
```

selection: surfaced-heavy
fallbackChain: [mure-synthesist-sonnet5, mure-synthesist-glm52, mure-synthesist-m3]
specialRules: []
rationale: Audit ★ = F5/O48/G52/M3 (F5 excluded). Large-context lattice synthesis needs 1M ctx + strong reasoning: GLM-5.2 is the text prime, M3 the cross-modal heavy (constraint names synthesist as an M3 cross-modal role), Sonnet 5 the medium small-scope option. Opus (★) deferred — GLM-5.2 + M3 cover the 1M-ctx synthesis need and Opus is reserved. DVP ● dropped (text-only, no ctx advantage over GLM here).

## 13. mure-chronicler
lane: knowledge
mission: distill outputs into docs, blueprints, and owner-facing summaries; emit conforming RESULT_LABELs; translate research to legible narrative.

```json
[
  {"id":"mure-chronicler-haiku","model":"anthropic/claude-haiku-4-5","thinkingLevel":"low","tools":["read","grep","glob","edit","write","bash"],"max_tokens":4096,"systemSections":["minimalist","cheap-research"],"eligibilityFlags":["cheap","cheap-research-only","haiku-eligible-context"],"costTier":"cheap","note":"Cheap summaries + RESULT_LABEL emission; chronicler-cheap is an explicit Haiku-eligible context."},
  {"id":"mure-chronicler-sonnet5","model":"anthropic/claude-sonnet-5","thinkingLevel":"medium","tools":["read","grep","glob","edit","write","bash"],"max_tokens":16384,"systemSections":["minimalist","agentic-clean-tool-use"],"eligibilityFlags":["default-prime","auto-prime"],"costTier":"medium","note":"Default prime — technical writing + owner-facing narrative distillation."},
  {"id":"mure-chronicler-m3","model":"minimax-portal/MiniMax-M3","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":16384,"systemSections":["vision-cross-modal","minimalist"],"eligibilityFlags":["heavy","minimax-ultra","cross-modal"],"costTier":"heavy","note":"Visual blueprints / diagram-bearing docs (cross-modal chronicler)."}
]
```

selection: auto-cheap
fallbackChain: [mure-chronicler-haiku, mure-chronicler-sonnet5, mure-chronicler-m3]
specialRules: []
rationale: Audit ★ = S5/S46/M3 (S46→S5). Chronicler-cheap is an explicit Haiku-eligible context (summaries/labels are cheap-research-adjacent read-then-write distillation, on the owner's list) → Haiku is the cheap tier here (contrast archivist/calibrator, which are NOT on the list). Sonnet 5 prime for real writing; M3 for visual blueprints (constraint names chronicler-visual for M3).

## 14. mure-archivist
lane: knowledge
mission: curate the skill library and memory; track lineage; keep the capability registry fresh; preserve stepping-stones.

```json
[
  {"id":"mure-archivist-glmturbo","model":"zai/glm-5-turbo","thinkingLevel":"low","tools":["read","grep","glob","edit","write","bash"],"max_tokens":4096,"systemSections":["minimalist"],"eligibilityFlags":["cheap","z-ai-quota-pool","always-on"],"costTier":"cheap","note":"Cheap bulk curation / registry upkeep prime on the Z.ai pool."},
  {"id":"mure-archivist-dvf","model":"deepseek-v4-flash:direct","thinkingLevel":"low","tools":["read","grep","glob","edit","write","bash"],"max_tokens":4096,"systemSections":["minimalist"],"eligibilityFlags":["cheap","deepseek-capped"],"costTier":"cheap","note":"Cheap lineage-scan + registry-write; $1.25/day DeepSeek cap."},
  {"id":"mure-archivist-sonnet5","model":"anthropic/claude-sonnet-5","thinkingLevel":"medium","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["minimalist","agentic-clean-tool-use"],"eligibilityFlags":["medium","fallback-when-curation-needs-judgment"],"costTier":"medium","note":"Fallback when curation needs judgment (dedup/merge/promote decisions)."}
]
```

selection: auto-cheap
fallbackChain: [mure-archivist-glmturbo, mure-archivist-dvf, mure-archivist-sonnet5]
specialRules: []
rationale: Audit ★ = H45/G5/GT/DVF. **Haiku (★) EXCLUDED** — archivist writes/curates memory + registry (mutates state), outside "recon + cheap research" and not on the owner's Haiku list. GLM-5-turbo is the cheap Z.ai prime; G5 (★) folded into it (turbo is cheaper, same pool); DVF the cheap capped alternate; Sonnet 5 the judgment fallback. M27/M27H ● excluded (unverified).

## 15. mure-adjudicator
lane: verification
mission: attack every artifact — name failure modes, find what is missing, default to refuted when uncertain; structurally independent of the producers.

```json
[
  {"id":"mure-adjudicator-glm52","model":"zai/glm-5.2","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["apex-judgment","narrow-prompt-reserved"],"eligibilityFlags":["heavy","apex-reasoning-fallback","z-ai-quota-pool"],"costTier":"heavy","note":"Apex-reasoning refutation fallback when Opus is capped (audit-★ adversarial reasoner); NOT for security-relevant artifacts."},
  {"id":"mure-adjudicator-dvp","model":"deepseek-v4-pro:direct","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["apex-judgment","narrow-prompt-reserved"],"eligibilityFlags":["heavy","apex-reasoning-fallback","deepseek-capped","think-max"],"costTier":"heavy","note":"Think Max adversarial fallback; $1.25/day cap; NOT for security-relevant artifacts."},
  {"id":"mure-adjudicator-opus48","model":"anthropic/claude-opus-4-8","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["apex-judgment","narrow-prompt-reserved"],"eligibilityFlags":["apex","anchor","mandatory-prime"],"costTier":"apex","note":"Mandatory adversarial anchor prime — best-in-fleet refutation quality + gap detection."}
]
```

selection: surfaced-heavy
fallbackChain: [mure-adjudicator-glm52, mure-adjudicator-dvp, mure-adjudicator-opus48]
specialRules: [opus48-mandatory-anchor, sonnet5-cheap-DISQUALIFIED, security-relevant-artifacts-MUST-route-opus48, structurally-independent-of-ideator-engineer-mechanic-synthesist]
rationale: Audit ★ = F5/O48/G52/DVP (F5 excluded); ● = M3. Hard rule names adjudicator as a MUST-be-Opus seat → Opus is the mandatory anchor prime and Sonnet5/cheap are DISQUALIFIED. GLM-5.2 and DVP are permitted apex-reasoning fallbacks ONLY when Opus is quota-capped — both are audit-★ for adversarial refutation (`model-audit:533`, "only apex-tier models") — but any **security-relevant** artifact MUST route to Opus (mirrors sentinel). M3 ● (cross-modal adjudication) omitted; note it as the future visual-artifact option.

## 16. mure-oracle
lane: verification
mission: run the red/grey/green tests, measure against acceptance, accept/reject; the gate every evolver proposal must pass.

```json
[
  {"id":"mure-oracle-dvf","model":"deepseek-v4-flash:direct","thinkingLevel":"low","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["agentic-clean-tool-use","minimalist"],"eligibilityFlags":["cheap","deepseek-capped"],"costTier":"cheap","note":"Cheap test-execution + mechanical accept/reject; $1.25/day cap."},
  {"id":"mure-oracle-sonnet5","model":"anthropic/claude-sonnet-5","thinkingLevel":"medium","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["agentic-clean-tool-use"],"eligibilityFlags":["default-prime","auto-prime"],"costTier":"medium","note":"Default prime — test execution + acceptance judgment (self-checks output)."},
  {"id":"mure-oracle-glm52","model":"zai/glm-5.2","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["apex-judgment","agentic-clean-tool-use"],"eligibilityFlags":["heavy","z-ai-quota-pool"],"costTier":"heavy","note":"Hard acceptance calls / ambiguous grey-zone verdicts on the ×20 pool."}
]
```

selection: auto-cheap
fallbackChain: [mure-oracle-dvf, mure-oracle-sonnet5, mure-oracle-glm52]
specialRules: [structurally-independent-of-evolver-and-engineer]
rationale: Audit ★ = O48/S5/G52/DVP/DVF/M3 (broadly capable). Oracle is a mechanical-test-gate + accept/reject judgment, not a security or apex seat → seed a clean cost ladder: DVF cheap (runs tests), Sonnet 5 prime (execution + judgment, emergent self-verification), GLM-5.2 heavy (hard verdicts). Opus (★) deferred (not a judgment seat; Sonnet+GLM suffice); DVP capped and M3 cross-modal noted-available for UI/visual test acceptance.

## 17. mure-calibrator
lane: verification
mission: record prediction→outcome, compute Brier and calibration, weight advisors by track record, flag over-confidence.

```json
[
  {"id":"mure-calibrator-dvf","model":"deepseek-v4-flash:direct","thinkingLevel":"low","tools":["read","grep","glob","edit","write","bash"],"max_tokens":4096,"systemSections":["minimalist","cheap-research"],"eligibilityFlags":["cheap","deepseek-capped"],"costTier":"cheap","note":"Cheap structured Brier/calibration computation; $1.25/day cap."},
  {"id":"mure-calibrator-glmturbo","model":"zai/glm-5-turbo","thinkingLevel":"low","tools":["read","grep","glob","edit","write","bash"],"max_tokens":4096,"systemSections":["minimalist"],"eligibilityFlags":["cheap","z-ai-quota-pool"],"costTier":"cheap","note":"Bulk ledger scan + advisor-weight bookkeeping on the Z.ai pool."},
  {"id":"mure-calibrator-sonnet5","model":"anthropic/claude-sonnet-5","thinkingLevel":"medium","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["minimalist","agentic-clean-tool-use"],"eligibilityFlags":["medium","fallback-when-audit-needs-judgment"],"costTier":"medium","note":"Fallback when over-confidence analysis needs judgment over raw scoring."}
]
```

selection: auto-cheap
fallbackChain: [mure-calibrator-dvf, mure-calibrator-glmturbo, mure-calibrator-sonnet5]
specialRules: []
rationale: Audit ★ = S46/G5/GT/DVF. S46→dropped (dominated); **Haiku (● / not ★, and excluded anyway)** — calibrator writes score state, off the Haiku list. Calibration is light structured-data work → cheap ladder: DVF + GLM-turbo cheap primes, Sonnet 5 judgment fallback. G5 (★) folded into GLM-turbo.

## 18. mure-steward
lane: orchestration
mission: run the 6-gate charter on every decision; compute blast-radius and contention; produce owner-HOLD packets; the deterministic governance layer.

```json
[
  {"id":"mure-steward-sonnet5","model":"anthropic/claude-sonnet-5","thinkingLevel":"medium","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["governance-strict","minimalist"],"eligibilityFlags":["default-prime","auto-prime"],"costTier":"medium","note":"Default prime — deterministic 6-gate charter + blast-radius computation."},
  {"id":"mure-steward-glm52","model":"zai/glm-5.2","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["governance-strict","apex-judgment"],"eligibilityFlags":["heavy","z-ai-quota-pool"],"costTier":"heavy","note":"Harder governance / high-contention calls on the ×20 pool."},
  {"id":"mure-steward-opus48","model":"anthropic/claude-opus-4-8","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["governance-strict","apex-judgment"],"eligibilityFlags":["apex","anchor"],"costTier":"apex","note":"Apex override for highest-blast owner-HOLD packet composition."}
]
```

selection: surfaced-heavy
fallbackChain: [mure-steward-sonnet5, mure-steward-glm52, mure-steward-opus48]
specialRules: [owner-gated-autonomy, governance-strict]
rationale: Audit ★ = O48/S46 (S46→S5). Governance is high-stakes but largely deterministic → Sonnet 5 prime for the routine 6-gate, GLM-5.2 for hard contention calls, Opus apex-override for the highest-blast owner-HOLD packets. DVF/DVP ● dropped — governance should not run cheap.

## 19. mure-quartermaster
lane: operations
mission: account token budget, route by quota (native weekly pool vs z.ai plan), enforce budgetCap, prevent cost runaway.

```json
[
  {"id":"mure-quartermaster-dvf","model":"deepseek-v4-flash:direct","thinkingLevel":"low","tools":["read","grep","glob","edit","write","bash"],"max_tokens":4096,"systemSections":["minimalist"],"eligibilityFlags":["cheap","deepseek-capped"],"costTier":"cheap","note":"Cheap token-accounting + budget-cap bookkeeping; $1.25/day cap (self-aware of its own tier's cap)."},
  {"id":"mure-quartermaster-glmturbo","model":"zai/glm-5-turbo","thinkingLevel":"low","tools":["read","grep","glob","edit","write","bash"],"max_tokens":4096,"systemSections":["minimalist"],"eligibilityFlags":["cheap","z-ai-quota-pool"],"costTier":"cheap","note":"Quota-routing bulk bookkeeping on the Z.ai pool."},
  {"id":"mure-quartermaster-sonnet5","model":"anthropic/claude-sonnet-5","thinkingLevel":"medium","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["minimalist","governance-strict"],"eligibilityFlags":["medium","fallback-when-budget-policy-needs-judgment"],"costTier":"medium","note":"Fallback when budget-routing policy needs a judgment call."}
]
```

selection: auto-cheap
fallbackChain: [mure-quartermaster-dvf, mure-quartermaster-glmturbo, mure-quartermaster-sonnet5]
specialRules: []
rationale: Audit ★ = S46/H45/GT/DVF/M27H. S46→dropped (dominated); **Haiku (★) and M27H (★) EXCLUDED** (Haiku off-list write role; M27H unverified). Budget accounting is the lightest structured work → DVF + GLM-turbo cheap primes, Sonnet 5 policy-judgment fallback.

## 20. mure-architect
lane: orchestration
mission: design systems, methods, and interfaces; set the quality bar; compose existing capabilities before building new ones; corner-law audit.

```json
[
  {"id":"mure-architect-sonnet5","model":"anthropic/claude-sonnet-5","thinkingLevel":"medium","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["coding-excellence","agentic-clean-tool-use"],"eligibilityFlags":["medium","auto-prime"],"costTier":"medium","note":"Lighter interface/method design where apex judgment is not required."},
  {"id":"mure-architect-glm52","model":"zai/glm-5.2","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["apex-judgment","coding-excellence"],"eligibilityFlags":["heavy","workhorse","z-ai-quota-pool"],"costTier":"heavy","note":"Architecture-design workhorse prime (1M ctx, near-Opus FrontierSWE) on the ×20 pool."},
  {"id":"mure-architect-opus48","model":"anthropic/claude-opus-4-8","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":16384,"systemSections":["apex-judgment","narrow-prompt-reserved"],"eligibilityFlags":["apex","judgment-seat","anchor"],"costTier":"apex","note":"MANDATORY for critical/corner-law architecture judgment (partial hard rule)."}
]
```

selection: surfaced-heavy
fallbackChain: [mure-architect-sonnet5, mure-architect-glm52, mure-architect-opus48]
specialRules: [critical-architecture-decisions-MUST-be-opus48, corner-law-audit-routes-opus48]
rationale: Audit ★ = F5/O48/G52 (F5 excluded). Constraint: "parts of architect MUST be Opus 4.8" + Opus-demotion directive maps Opus to architect for heavy judgment. GLM-5.2 is the day-to-day design workhorse, Sonnet 5 the lighter option, Opus the mandatory apex for critical/corner-law decisions. DVP/M3 ● noted-available (M3 for cross-modal architecture from visual specs).

## 21. mure-evolver
lane: research
mission: propose improvements to MURE itself and to YURI processes via evolutionary search; HIGHEST blast — every proposal owner-gated and must pass the oracle first.

```json
[
  {"id":"mure-evolver-glm52","model":"zai/glm-5.2","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":8192,"systemSections":["apex-judgment","narrow-prompt-reserved"],"eligibilityFlags":["heavy","z-ai-quota-pool"],"costTier":"heavy","note":"Evolutionary-search / candidate-generation workhorse on the ×20 pool."},
  {"id":"mure-evolver-opus48","model":"anthropic/claude-opus-4-8","thinkingLevel":"high","tools":["read","grep","glob","edit","write","bash"],"max_tokens":16384,"systemSections":["apex-judgment","narrow-prompt-reserved"],"eligibilityFlags":["apex","judgment-seat","anchor","highest-blast"],"costTier":"apex","note":"Apex prime for highest-blast self-modification design — every proposal owner-gated + oracle-gated."}
]
```

selection: surfaced-heavy
fallbackChain: [mure-evolver-glm52, mure-evolver-opus48]
specialRules: [owner-gated, must-pass-mure-oracle-before-act, highest-blast]
rationale: Audit ★ = F5/O48/G52 (F5 excluded). Evolver has the HIGHEST blast radius → Opus is the apex judgment prime for self-modification design; GLM-5.2 runs the cheaper evolutionary search / candidate generation. DVP/M3 ● dropped for conservatism on the highest-blast seat.

## 22. composer-fast
lane: engineering
mission: fast worker lane for parallel drafting and critique — produce an independent result. (Generic fast worker; original Cursor `composer-2.5-fast` binding is off-seam.)

```json
[
  {"id":"composer-fast-glmturbo","model":"zai/glm-5-turbo","thinkingLevel":"low","tools":["read","grep","glob","write","bash"],"max_tokens":4096,"systemSections":["minimalist","agentic-clean-tool-use"],"eligibilityFlags":["cheap","z-ai-quota-pool","parallel-worker"],"costTier":"cheap","note":"Cheap fast draft/critique prime on the Z.ai pool (replaces the retired Cursor binding)."},
  {"id":"composer-fast-dvf","model":"deepseek-v4-flash:direct","thinkingLevel":"low","tools":["read","grep","glob","write","bash"],"max_tokens":4096,"systemSections":["minimalist","agentic-clean-tool-use"],"eligibilityFlags":["cheap","deepseek-capped","parallel-worker"],"costTier":"cheap","note":"Cheap bulk draft/critique; $1.25/day cap."},
  {"id":"composer-fast-sonnet5","model":"anthropic/claude-sonnet-5","thinkingLevel":"medium","tools":["read","grep","glob","write","bash"],"max_tokens":8192,"systemSections":["agentic-clean-tool-use","minimalist"],"eligibilityFlags":["medium","fallback-when-draft-needs-judgment"],"costTier":"medium","note":"Fallback when a draft/critique needs real reasoning."}
]
```

selection: auto-cheap
fallbackChain: [composer-fast-glmturbo, composer-fast-dvf, composer-fast-sonnet5]
specialRules: [cursor-origin-off-seam, retirement-or-merge-candidate-with-deepseek-flash]
rationale: Audit ★ = H45/GT/DVF. Its identity model (Cursor composer-2.5-fast) is off-seam (`cloud-fleet-models.json:168`) → reseeded as a generic cheap Z.ai/DeepSeek worker. **Haiku (★) and M27H (★) excluded** (write-worker off Haiku list; M27H unverified). **Flag for owner:** this role is now functionally a duplicate of `deepseek-flash` — recommend merge/retire rather than maintain two generic cheap-worker roles.

## 23. deepseek-flash
lane: research
mission: fast worker lane for parallel bulk analysis and critique — produce an independent result.

```json
[
  {"id":"deepseek-flash-dvf","model":"deepseek-v4-flash:direct","thinkingLevel":"low","tools":["read","grep","glob","write","bash"],"max_tokens":4096,"systemSections":["minimalist","cheap-research"],"eligibilityFlags":["cheap","deepseek-capped","parallel-worker"],"costTier":"cheap","note":"Native flash bulk-analysis prime; $1.25/day DeepSeek cap."},
  {"id":"deepseek-flash-glmturbo","model":"zai/glm-5-turbo","thinkingLevel":"low","tools":["read","grep","glob","write","bash"],"max_tokens":4096,"systemSections":["minimalist","cheap-research"],"eligibilityFlags":["cheap","z-ai-quota-pool","parallel-worker","uncapped-fallback"],"costTier":"cheap","note":"Uncapped Z.ai equivalent when the DeepSeek daily cap is hit — the resilient fallback."}
]
```

selection: auto-cheap
fallbackChain: [deepseek-flash-dvf, deepseek-flash-glmturbo]
specialRules: [deepseek-cap-fallback-to-glmturbo]
rationale: Audit ★ = GT/DVF; ● = DVP. This role IS the DeepSeek flash worker: DVF native prime, GLM-5-turbo the uncapped Z.ai fallback (critical — when the $1.25/day DeepSeek cap trips, this role must not die; GLM-turbo keeps it alive per `advisor-note-schema:205`). DVP ● omitted — a "flash" worker upgrading to Think Max defeats its cheap-bulk purpose.

## 24. fable-synth  ⚠️ DISABLED
lane: orchestration
mission: final mastermind synthesizer over multi-model prep fan-out — synthesize, judge, correct, CUT into a definitive result (anti-over-engineering).

```json
[]
```

selection: N/A (agent DISABLED)
fallbackChain: []
specialRules: [DISABLED-till-2026-07-12, apex-only-seat, spawned-once-after-multi-model-fanout, does-not-redo-work]
pending_variants_when_reenabled:
```json
[
  {"id":"fable-synth-fable5","model":"anthropic/claude-fable-5","thinkingLevel":"high","tools":["read","grep","glob","write","bash"],"max_tokens":16384,"systemSections":["apex-judgment","narrow-prompt-reserved"],"eligibilityFlags":["apex","anchor","anti-over-engineering"],"costTier":"apex","note":"[INACTIVE till 2026-07-12] Apex final synthesizer prime — SWE-Verified 95.0, #1 leaderboard."},
  {"id":"fable-synth-opus48","model":"anthropic/claude-opus-4-8","thinkingLevel":"high","tools":["read","grep","glob","write","bash"],"max_tokens":16384,"systemSections":["apex-judgment","narrow-prompt-reserved"],"eligibilityFlags":["apex","anchor","fable-export-block-fallback"],"costTier":"apex","note":"[INACTIVE] Apex fallback if Fable-5 access is export-blocked for EU operator."}
]
```
rationale: Audit ★ = F5 only; ● = O48/G52. **Fable-5 is temporarily excluded till 2026-07-12 and the agent itself is DISABLED** (`cloud-fleet-models.json:6`, catalog L307) → `variants[]` ships EMPTY now. The intended post-re-enable set (F5 apex prime → Opus 4.8 apex fallback for export-block) is recorded as `pending_variants` but MUST NOT be transcribed as active until access is verified live (open question `model-audit:565`). G52 ● deferred — this is an Anthropic-apex synthesis seat.

---

## CROSS-CUTTING NOTES

### Heavy-tier seeding pattern (which models appear in heavy/apex variants across roles)
| Model | Heavy/apex role appearances | Pattern |
|---|---|---|
| **glm-5.2** | helmsman, helmsman-glm, engineer, mechanic, kernelsmith, ideator, deliberator, synthesist, oracle, adjudicator, steward, architect, evolver | The universal heavy **workhorse** — the ×20 GLM pool is reached freely for all non-security heavy work; near-Opus FrontierSWE at 1M ctx. |
| **opus-4-8** | helmsman(apex), kernelsmith, sentinel, deliberator, adjudicator, steward, architect, evolver | Judgment/security **anchor only** — never a routine-codegen prime; appears as apex-override or mandatory-security. |
| **dvp (Think Max)** | kernelsmith, sentinel, ideator, deliberator, adjudicator | Deep-reasoning / adversarial specialist, **always $1.25/day capped**. |
| **m3** | envoy, scout, engineer, mechanic, kernelsmith, synthesist, chronicler | The cross-modal + 1M-ctx heavy (see vision cluster). |

Read: GLM-5.2 is the default heavy prime; Opus is the reserved anchor; DVP is the capped depth specialist; M3 is the cross-modal heavy.

### Sentinel override cluster — Opus 4.8 MANDATORY (hard security rule)
- **mure-sentinel** — Opus mandatory prime; only Opus + DVP-ThinkMax eligible; Sonnet5/GLM/cheap DISQUALIFIED.
- **mure-adjudicator** — Opus mandatory anchor; GLM-5.2/DVP permitted only as capacity fallback; **security-relevant artifacts MUST route Opus**; Sonnet5/cheap disqualified.
- **mure-architect** — Opus mandatory for *critical/corner-law* architecture decisions (partial rule); GLM-5.2 handles day-to-day design.
- **mure-advisor (heavy)** — already-drafted: Opus mandatory for security-relevant turns (catalog L363-366).

### Vision-capable cluster — M3 is the natural cross-modal option
mure-envoy (visual brain-dumps), mure-scout (visual sources + 1M ctx), mure-engineer (implement-from-screenshot), mure-mechanic (wire-to-UI), mure-synthesist (**cross-modal lattice — M3 co-prime**), mure-chronicler (**visual blueprints — M3**), mure-kernelsmith (KernelBench). Noted-available-but-omitted: mure-oracle (visual/UI test acceptance), mure-adjudicator (visual-artifact critique), mure-architect (design-from-visual-spec). M3 is the only vision model seeded — GLM-4.6V never scored ★/● and is redundant against M3.

### Auto-eligible cheap cluster — auto-prime, no operator approval (selection: auto-cheap)
envoy, scout, engineer, mechanic, artificer, ideator, chronicler, archivist, oracle, calibrator, quartermaster, composer-fast, deepseek-flash. Cheap primes are **Sonnet 5** (read/decode/write medium), **Haiku** (recon/cheap-research read-only ONLY: envoy, scout, chronicler-cheap), **GLM-5-turbo** (Z.ai cheap bulk/write), **DVF** (capped cheap coder/scanner). Everything else (helmsman·helmsman-glm·kernelsmith·sentinel·deliberator·synthesist·adjudicator·steward·architect·evolver) is **surfaced-heavy** — the operator surfaces a heavy/apex default with override.

### Variants the audit star-cell lost (★ cells excluded, with cause)
| Excluded ★ | Roles it was starred on | Cause |
|---|---|---|
| **Fable-5 (F5)** | helmsman, engineer, mechanic(●), kernelsmith, ideator, deliberator, synthesist, adjudicator, architect, evolver, **fable-synth** | Temporarily excluded till 2026-07-12; fable-synth agent DISABLED (empty variants now). |
| **Sonnet-4-6 (S46)** | envoy, scout, mechanic, chronicler, calibrator, steward, quartermaster | Dominated by Sonnet 5 at identical price → every S46★ re-pointed to S5. |
| **Haiku (H45)** | artificer, archivist, quartermaster, composer-fast | Owner rule: Haiku is recon+cheap-research ONLY; these are write/mutate roles off the eligible list. (Kept on scout/envoy/chronicler-cheap.) |
| **M2.7-highspeed (M27H)** | artificer, quartermaster, composer-fast | Ultra-tier availability unverified (`?`). |
| **Opus-4-8 (O48)** | engineer, mechanic | Reserved for judgment seats; excluded from routine codegen (retained on kernelsmith as the judgment exception). |
| **GLM-5 (G5)** | archivist, calibrator | Folded into cheaper same-pool GLM-5-turbo (no distinct value). |
| **grok-code-fast-1 / gpt-5.5-high / composer-2.5** (current bindings) | oracle, kernelsmith, mechanic, quartermaster, composer-fast | Cursor — not in audit matrix + "NOT actively routed"; roles reseeded from audit rows. |
| **kimi-k2.7-code** (current engineer binding) | engineer | Not in audit matrix → cannot be seeded; engineer reseeded from its audit row. |

### Audit sanity check — mure-advisor (already drafted; NOT re-spec'd)
The existing 7 `mure-advisor` variants (catalog L323-401) are **CONSISTENT** with the same seeded-from-audit discipline applied above:
- **watcher-sonnet5** (prime) — audit: S5 cost-perf sweet spot ✓; advisor-watcher is a Sonnet-5-prime medium seat.
- **watcher-haiku** (fallback) — advisor-watcher-T1 is on the owner's explicit Haiku-eligible list ✓, and it's a read-only recon seat ✓ (consistent with keeping Haiku on scout/envoy/chronicler and dropping it from write roles here).
- **watcher-dvflash** — cheap capped watcher, `deepseek-capped` flag present ✓.
- **heavy-opus48** — `security-only` + mandatory-for-security flag ✓ (identical hard rule as sentinel/adjudicator).
- **heavy-dvp / heavy-glm52 / heavy-m3** — heavy fallback chain Opus→DVP→GLM-5.2→M3, Haiku explicitly barred from heavy ✓, Fable excluded ✓ (matches roster `mure_advisor.excluded`).
No inconsistency found: the advisor's cost-tiers, the Haiku recon-only boundary, the Opus security anchor, the DeepSeek cap flags, and the Fable exclusion all match the discipline enforced across the 24 roles. **Sanity check: PASS.**

### Recursive offload disclosure
Operated as a **leaf** per fleet-economy's leaf-lane exception: 7 direct scoped reads of the 6 input files (all <600 lines, known paths), **0 sub-lanes spawned**. Spawning cheap catalog-read lanes was rejected as uneconomical — harness setup for 6 small known-path files exceeds the read cost saved, and the reasoning (variant seeding, constraint-vs-audit adjudication) is non-offloadable apex work that had to stay in this lane. Context budget held tight per owner's quota note.

---

*Deliverable path: `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/research/per-role-variant-table-2026-07-09.md`*
*Seed: `model-audit-2026-07-09.md` (matrix L496-521) · Constraints: owner grill round 2026-07-09 · Roster: `cloud-fleet-models.json` v2.1.0 · Schema §7 budget: `advisor-note-schema-2026-07-09.md`*
