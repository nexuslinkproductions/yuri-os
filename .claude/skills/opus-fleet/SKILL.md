---
name: opus-fleet
description: "Standing operating model — the OMP orchestrator session decomposes and reviews while spawned workers execute across OMP task() subagents, z.ai GLM lanes (glm-fleet.mjs), and Ollama Cloud peer lanes (ollama-fleet.mjs) — CLOUD ONLY, no local SLMs, no Codex. Includes copy-paste task() dispatch templates, cloud model roster, MURE role dispatch, and governed autonomous loop. Use for any non-trivial build, research, multi-file edit, audit, refactor, or fan-out."
version: 2.0.0
status: active
triggers:
  - /opus-fleet
  - opus orchestrates
  - spawn agents
  - fan out agents
  - fleet execution
  - research code testing lanes
  - agent fleet
  - glm fleet
  - zai fleet
  - ollama cloud fleet
  - glm-fleet
  - task subagents
  - tri-substrate
  - three substrates
scope: harness
invocation: workflow
---

# opus-fleet — OMP orchestrator + cloud fleet

The default way to run any non-trivial task. The **orchestrator session** (this OMP harness) never grinds parallelizable work itself — it **decomposes → dispatches → reviews → finalizes**. Workers run on **OMP `task()` subagents** and/or **armed cloud fleets** (GLM, Ollama Cloud). Canonical model map: [`_SYSTEM/config/cloud-fleet-models.json`](../../../_SYSTEM/config/cloud-fleet-models.json). Binding record: [`.claude/memory/feedback-opus-fleet-standing-default.md`](../../memory/feedback-opus-fleet-standing-default.md).

## When this fires

Every substantial task — build, research, multi-file edit, audit, verification, refactor. Skip only trivial single reads and pure conversation.

**Fleet sizing — don't under-spawn.** OMP `task()` subagents are **flat** (they cannot spawn their own subagents). Trade depth for **breadth**: fan out **up to ~32 parallel `task()` items in one batch** when work divides cleanly. Recursion depth is the GLM substrate's job via `nano-spawn` (owner-gated, depth ≤ 5). The failure mode is timidity, not excess.

## Architecture at a glance

```
                 ┌───────────────────────────────┐
                 │  ORCHESTRATOR (this OMP session) │
                 │  decompose · judge · synthesize  │
                 │  review · verify · finalize      │
                 └───────────────────────────────┘
          ↑              ↑              ↑              ↑
    ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ OMP task │   │ GLM fleet│   │ Ollama   │   │ MURE     │
    │ subagents│   │ (z.ai)   │   │ Cloud    │   │ company  │
    └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

## Orchestrator model (subscription order)

| Priority | Provider | Model | When |
|----------|----------|-------|------|
| 1 | Anthropic OAuth | `claude-sonnet-4-6` | OMP `default` when window available |
| 2 | Cursor OAuth | `composer-2.5` | Claude session limit / credential block |
| 3 | Z.ai | `glm-5.2` (`glm-max`) | Heavy synthesis on z.ai plan |
| 4 | Mimo | `mimo-v2.5-pro[1m]` | Anthropic-protocol alternative |

Configure OMP roles in `~/.omp/agent/config.yml`. **Direct DeepSeek API is retired** — use Ollama Cloud `:cloud` tags only.

## Quick start — OMP `task()` dispatch

Run independent workers **in parallel** (one `task()` call with multiple `tasks[]`). Every assignment is self-contained.

```
task(
  context: `# Goal
<what the batch accomplishes>
# Constraints
<rules, protected paths, cloud-only, no Codex>
# Contract
<shared interfaces / acceptance for the batch>`,
  tasks: [
    {
      role: "Research scout",
      assignment: `# Target
<exact files/symbols>
# Change
<bounded investigation steps>
# Acceptance
<table / verdict format — no project-wide test suite>`
    },
    {
      agent: "task",
      role: "Implementation worker",
      assignment: `# Target ...
# Change ...
# Acceptance ...`
    }
  ]
)
```

### OMP agent roles

| Agent | Lane | Use when |
|-------|------|----------|
| `explore` | Research | Read-only census, grep-survey, prior-art (cannot edit) |
| `task` | Code-gen | Patches, new files, refactors |
| `tester` | Testing | Test authoring / contract defense |
| `reviewer` | Verification | Quality + security review |
| `librarian` | Research | External library/API source verification |
| `designer` | Design | UI/UX implementation |
| `plan` | Architecture | Multi-file architectural decisions (`slow` model) |
| `sonic` | Mechanical | Strictly mechanical updates (`smol` model) |

Never spawn a subagent to read one known file — do it inline in the orchestrator.

## The orchestrator loop

1. **Decompose** into independent lanes; identify what genuinely parallelizes.
2. **Dispatch** parallel workers (`task()` batch + optional armed GLM/Ollama fleets).
3. **Review + correct** — first-run output is a hypothesis. Verify load-bearing claims against local evidence.
4. **Finalize** — orchestrator only: scoped-pathspec commit, push, irreversible/outward calls. Subagents never finalize.

## Hard rules (failure-anchored)

- **`task()` only for OMP fan-out.** Do not use legacy Workflow tools. Do not assume Claude `Agent(model:sonnet)` — this harness uses OMP `task()`.
- **Cloud only for fleet lanes.** No local Ollama SLMs (`qwen-local`, `gemma-local`, `vibethinker-local`). MacBook cannot run them in fleet.
- **No Codex.** Owner retired Codex — ignore `codex-offload-runner`, `openai-codex`, and YURI offload-to-Codex paths.
- **No direct DeepSeek API.** Retired 2026-07-06. DeepSeek work routes through Ollama Cloud `deepseek-v4-*:cloud`.
- **Self-contained assignments.** Subagents lack conversation history. Always include state + constraints + return format.
- **GLM lanes: never `tee`/`>`, always `--out`.** Second stream reader triggers transport:EPIPE. <!-- @anchor: v1 | failure: FB:GLM-ZAI-BUILD-LANE -->
- **GLM agents run at `--reasoning high`.** Pin on every GLM task.
- **GLM + Ollama fleets DISARMED by default.** `YURI_GLM_FLEET=1` / `YURI_OLLAMA_FLEET=1` or gitignored `*.enabled` flags — owner-gated.
- **Verify every fleet result locally.** GLM/Ollama lanes over-claim; treat "done" as a hypothesis until locally checked.

## Anti-rationalization table

| Excuse | Reality |
|--------|---------|
| "This is small, I'll solo it." | Multi-file / multi-step / survey work is exactly the fan-out case. |
| "I'll use Workflow — it's easier." | Banned. Use `task()` batch dispatch. |
| "The subagent said it passed." | Verify with a local run before trusting. |
| "I'll route through Codex for heavy code." | Codex retired — use GLM-max, Mimo, or Ollama Cloud heavy tiers. |
| "I'll spin up local qwen for cheap fan-out." | Forbidden — cloud tiers only (`glm-flash`, `deepseek-v4-flash:cloud`). |
| "GLM is read-only advisory." | Wrong — full harness (write/edit/bash). Peer build substrate. |
| "Arm the loop unattended." | Arming spends durable budget — owner-gated always. |

## z.ai GLM fleet — substrate B

Twin cloud fleet via `_SYSTEM/Scripts/glm-fleet.mjs`. Full YURI operator harness via `llm-lane.mjs` — read/write/edit/bash. DISARMED by default (dry-run). Arm: `YURI_GLM_FLEET=1` or `touch _SYSTEM/state/glm-fleet.enabled`.

| Tier | alias | model | ctx | use |
|------|-------|-------|-----|-----|
| Orchestrator-peer | `glm-max` | glm-5.2 | 1M | architecture, adversarial, synthesis |
| Workhorse | `glm` | glm-5.1 | 200K | code-gen, refactor, judgment |
| Fast | `glm-flash` | glm-5-turbo | 200K | census, scan, cheap bulk (`glm-flash` alias; 4.7-flash unstable) |
| Reactive | `glm-turbo` | glm-5-turbo | 200K | snappy interactive |
| Vision | `glm-vision` | glm-4.6v | 64K | screenshots / UI |

```bash
YURI_GLM_FLEET=1 node _SYSTEM/Scripts/glm-fleet.mjs \
  --tasks '[{"lane":"glm-max","label":"ARCH","prompt":"..."}]' \
  --concurrency 3
# results → .claude/jobs/<run>/results/<label>.json
```

## Ollama Cloud fleet — substrate C

**Cloud endpoints only** (`*:cloud`). Script: `_SYSTEM/Scripts/ollama-fleet.mjs`. Pro plan: **3 concurrent**. DISARMED by default. Arm: `YURI_OLLAMA_FLEET=1` or `touch _SYSTEM/state/ollama-fleet.enabled`.

| tier | model | use |
|------|-------|-----|
| `flash` | deepseek-v4-flash:cloud | **default bulk** — best quality/usage |
| `minimax` | minimax-m3:cloud | efficient generalist |
| `kimi` | kimi-k2.7-code:cloud | code-heavy peer |
| `nemotron` | nemotron-3-ultra:cloud | heavy reasoning burst |
| `deepseek-pro` | deepseek-v4-pro:cloud | true-1M heavy — avoid bulk (~2× usage) |
| `gemma` | gemma4:31b-cloud | available cloud generalist |

**Forbidden:** any local model tag without `:cloud`, or MacBook-local SLM names in fleet config.

```bash
YURI_OLLAMA_FLEET=1 node _SYSTEM/Scripts/ollama-fleet.mjs \
  --tasks '[{"tier":"flash","label":"R1","prompt":"..."}]' \
  --concurrency 3
```

API key hydrates from keychain at lane layer (`YURI_OS_MUSUBI:OLLAMA_API_KEY`).

## Multi-substrate routing

NOT a capability tier. Route by operational fit, then spread across independent quota pools:

| factor | OMP `task()` | GLM lanes | Ollama Cloud |
|--------|--------------|-----------|--------------|
| build powers | read · write · edit · bash | identical | identical |
| quota pool | Claude/Cursor OAuth | z.ai plan | Ollama Pro |
| recursion | flat leaf | nano-spawn depth ≤ 5 | flat peer fan-out |
| native MCP / browser | yes (orchestrator + task) | no | no |
| finalize | orchestrator only | orchestrator only | orchestrator only |

Default: spread large builds across all three quota pools in parallel. Native MCP/browser needs stay on OMP `task()` or orchestrator.

## MURE — 20-role governed collective

Named roles in `_SYSTEM/config/fleet-roles.json` + `_SYSTEM/mure/`. Use when a task wants role casting instead of hand-picked lanes:

```bash
node _SYSTEM/mure/mure.mjs --roster
node _SYSTEM/mure/mure.mjs --demo
node _SYSTEM/mure/company.mjs --task-file t.json --dry-run
# armed: YURI_MURE_ARMED=1 or touch _SYSTEM/state/mure.enabled
node _SYSTEM/mure/ceo.mjs "your task description"
```

`company.runCompany(task)` maps subtasks → roles → GLM leaves + native specs. **When Claude is capped**, translate MURE `nativeSpecs` (legacy sonnet/haiku/opus) per `cloud-fleet-models.json` → `mureNativeTranslation` (OMP `task()` / `sonic` / `glm-max`).

DISARMED by default. Finalize stays orchestrator/owner. Manual: `_SYSTEM/mure/README.md`.

## Optional — governed autonomous loop

For unknown-size discovery: `_SYSTEM/Scripts/swarm-convergence.mjs` + `runSwarm.mjs`. Owner-gated (`YURI_SWARM_CONVERGENCE=1`). Adversarial pass typically uses `glm-max`. Orchestrator re-verifies load-bearing claims.

## Spawning a sub-orchestrator

A `glm-max` lane can run this protocol if handed `FLEET_PROTOCOL_PREAMBLE` (from `glm-fleet.mjs`) or this SKILL pasted into prompt. Native OMP `task()` subagents remain **flat** — breadth compensates; recursion is GLM `nano-spawn` (owner-gated).

## Retired / ignore

| Item | Status |
|------|--------|
| Codex / openai-codex | **Ignore** — owner no longer uses |
| Direct DeepSeek API | **Retired** 2026-07-06 |
| Local Ollama SLMs in fleet | **Forbidden** on MacBook |
| Claude `Agent(model:sonnet)` as primary | **Superseded** by OMP `task()` in this harness |
| Workflow tool | **Banned** |

## Session Notes

### 2026-07-06
- v2.0.0: OMP `task()` substrate, cloud-only roster, Codex retired, MURE native translation, `cloud-fleet-models.json`
