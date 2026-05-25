---
name: yuri-shura
description: 6-perspective adversarial review for high-stakes turns. Fires when classifier detects scenario=strategic-review (architecture decisions, refactor planning, deployment review). Fans out 6 lanes in parallel: nvidia-nemotron-120b (architect), DS-pro (adversary), codex-spark (maintainer), nvidia-kimi (ops/long-ctx), deepseek-flash (product), nvidia-mistral-medium (security). Additive -- does not replace per-turn 6-advisor ensemble.
triggers:
  - "/shura"
  - "strategic review"
  - "architecture review"
  - "yuri-shura"
---

# Yuri Shura -- 6-Perspective Review

Inspired by Istishraf (MIT-licensed Claude plugin). Original implementation adapted to Yuri OS's pulse-cortex.

## When to fire

Auto: pulse-classifier detects scenario `strategic-review`
Manual: `/shura <topic>` from user

## 6 Perspectives (parallel)

| Lane | Model | Perspective |
|---|---|---|
| @nvidia-nemotron-120b | nvidia/nemotron-3-super-120b-a12b | Architect -- soundness of design |
| @ds-pro | deepseek-v4-pro | Adversary -- 7-vector attack protocol (see below) |
| @codex-spark | gpt-5.3-codex | Maintainer -- long-term cost |
| @nvidia-kimi | moonshotai/kimi-k2.6 | Ops -- production readiness (1M ctx) |
| @ds-flash | deepseek-v4-flash | Product -- user impact |
| @nvidia-mistral-medium | mistralai/mistral-medium-3.5-128b | Security -- risk surface |

## Output format

Six bounded sections (50 lines each) consolidated by main thread. Each perspective answers: assessment, risks, recommendation.

## Adversary Protocol — 7-Vector Attack Checklist

The `@ds-pro` adversary lane runs this checklist against every artifact. Derived from Anderson's security framework + Ibn Khaldun's resilience/decay model + SOUL.md reversibility principle. Source: strategic-thinker MIT brief (2026-05-16).

| # | Vector | Question |
|---|--------|----------|
| 1 | **Policy** | Does this violate an explicit rule, boundary, or operating constraint? |
| 2 | **Mechanism** | How could the implementation fail, hang, corrupt state, or be exploited? |
| 3 | **Assurance** | What cannot be monitored, audited, or verified after the fact? |
| 4 | **Incentives** | What system or actor benefits from this failing silently? |
| 5 | **Fragility** | Where are the single points of failure, tight coupling, or cascade paths? |
| 6 | **Scope creep** | What silent expansion or unapproved scope increase does this permit? |
| 7 | **Irreversibility** | How hard is rollback if this is wrong? Is there a tested recovery path? |

Adversary prompt injection: for each vector, deliver one finding or "clean" — no filler. Total output ≤ 35 lines.

## Quarantine rules

Standard advisory output. No impl authority. Findings logged to pulse-bus with source=SHURA. Codex applies any resulting changes through standard two-phase gate.

## Trigger phrases (auto-classify)

- "architecture review"
- "should we refactor"
- "deployment plan"
- "high stakes"
- "before we ship"

## Session Notes

### 2026-05-17
- session: 113m | peak ctx: 0% | compacts: 0
- tools: Bash×168, Edit×41, Read×33, mcp×33, Write×11, ToolSearch×2, Skill×1, AskUserQuestion×1, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-05-17
- session: 111m | peak ctx: 0% | compacts: 0
- tools: Bash×167, Edit×41, Read×33, mcp×33, Write×11, ToolSearch×2, Skill×1, AskUserQuestion×1, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-05-17
- session: 108m | peak ctx: 0% | compacts: 0
- tools: Bash×164, Edit×41, Read×33, mcp×33, Write×11, ToolSearch×2, Skill×1, AskUserQuestion×1, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-05-17
- session: 107m | peak ctx: 0% | compacts: 0
- tools: Bash×157, Edit×41, Read×33, mcp×33, Write×10, ToolSearch×2, Skill×1, AskUserQuestion×1, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-05-17
- session: 100m | peak ctx: 0% | compacts: 0
- tools: Bash×153, Edit×41, mcp×33, Read×32, Write×9, ToolSearch×2, Skill×1, AskUserQuestion×1, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-05-17
- session: 98m | peak ctx: 0% | compacts: 0
- tools: Bash×152, Edit×41, mcp×33, Read×32, Write×9, ToolSearch×2, Skill×1, AskUserQuestion×1, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-05-17
- session: 84m | peak ctx: 0% | compacts: 0
- tools: Bash×136, Edit×34, mcp×33, Read×27, Write×7, ToolSearch×2, Skill×1, AskUserQuestion×1, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-05-17
- session: 67m | peak ctx: 0% | compacts: 0
- tools: Bash×119, Read×18, Edit×13, Write×5, mcp×4, Skill×1, ToolSearch×1, AskUserQuestion×1
- corrections: none
- errors: none

### 2026-05-17
- session: 61m | peak ctx: 0% | compacts: 0
- tools: Bash×110, Read×17, Edit×13, Write×4, mcp×3, Skill×1, ToolSearch×1, AskUserQuestion×1
- corrections: none
- errors: none

### 2026-05-17
- session: 59m | peak ctx: 0% | compacts: 0
- tools: Bash×109, Read×17, Edit×13, Write×4, mcp×3, Skill×1, ToolSearch×1, AskUserQuestion×1
- corrections: none
- errors: none

### 2026-05-16
- session: 61m | peak ctx: 0% | compacts: 0
- tools: Bash×50, Edit×28, Write×13, Read×12
- corrections: none
- errors: none

### 2026-05-16
- session: 56m | peak ctx: 0% | compacts: 0
- tools: Bash×38, Edit×16, Write×12, Read×10
- corrections: none
- errors: none

### 2026-05-16
- session: 49m | peak ctx: 0% | compacts: 0
- tools: Bash×30, Write×11, Edit×9, Read×6
- corrections: none
- errors: none

### 2026-05-16
- session: 41m | peak ctx: 0% | compacts: 0
- tools: Bash×21, Write×8, Edit×7, Read×5
- corrections: none
- errors: none

### 2026-05-16
- session: 37m | peak ctx: 0% | compacts: 0
- tools: Bash×16, Write×7, Edit×6, Read×3
- corrections: none
- errors: none
