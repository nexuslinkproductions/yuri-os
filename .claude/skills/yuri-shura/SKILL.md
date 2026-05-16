---
name: yuri-shura
description: 6-perspective adversarial review for high-stakes turns. Fires when classifier detects scenario=strategic-review (architecture decisions, refactor planning, deployment review). Fans out 6 lanes in parallel: NVIDIA-nemotron (architect), DS-pro (adversary), codex-spark (maintainer), kimi (ops), deepseek-flash (product), claude-sonnet-advisory (security). Additive -- does not replace per-turn 6-advisor ensemble.
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
| @nvidia-nemotron | nvidia/llama-3.1-nemotron-70b | Architect -- soundness of design |
| @ds-pro | deepseek-v4-pro | Adversary -- what breaks |
| @codex-spark | gpt-5.3-codex | Maintainer -- long-term cost |
| @kimi | moonshot/kimi-k2-6 | Ops -- production readiness |
| @ds-flash | deepseek-v4-flash | Product -- user impact |
| @claude-sonnet-advisory | sonnet-4-6 | Security -- risk surface |

## Output format

Six bounded sections (50 lines each) consolidated by main thread. Each perspective answers: assessment, risks, recommendation.

## Quarantine rules

Standard advisory output. No impl authority. Findings logged to pulse-bus with source=SHURA. Codex applies any resulting changes through standard two-phase gate.

## Trigger phrases (auto-classify)

- "architecture review"
- "should we refactor"
- "deployment plan"
- "high stakes"
- "before we ship"
