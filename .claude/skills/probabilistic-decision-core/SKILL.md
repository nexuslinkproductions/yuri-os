---
name: probabilistic-decision-core
description: Operational probability, calibration, and expected-value discipline for Yuri OS decisions.
version: 1.0.0
status: active
enterprise_ready: true
non_destructive_default: true
triggers:
  - "/yuri probability"
  - "/probability"
  - "/pdc"
requires:
  - execution-domain-core
  - non-destructive-infinity-guard
  - failure-evolution-loop
---

# Probabilistic Decision Core Skill

## When to use

Use this skill when Yuri OS / NUDIMMUD must make or support an operational decision under uncertainty:

- task priority
- route selection
- risk acceptance
- opportunity ranking
- forecast-backed planning
- resource allocation
- go / no-go judgment
- escalation threshold
- postmortem calibration

Also use it when the active task matches this operating principle:

> Separate forecast, goal, plan, confidence, and cost of error before action. Update the estimate when evidence changes. Calibrate against outcomes after the decision resolves.

## When not to use

Do not use this skill when:

- the task is deterministic and local evidence fully decides it
- the decision is identity-level, relationship-critical, or owner-only
- the only available estimate would be fake precision
- the action is high or critical risk and lacks owner approval
- the outcome cannot be observed later enough to calibrate

## Operating doctrine

1. Forecasts are not goals.
2. Probability is a decision input, not a permission slip.
3. Base rates come before local signals.
4. Local signals must name direction and strength.
5. Confidence describes evidence quality, not emotional certainty.
6. Expected value must include cost of being wrong.
7. High-impact irreversible actions require guard routing even when probability is favorable.
8. Forecasts must be logged when the outcome can later be checked.

## Required output shape

```yaml
probabilistic_decision:
  decision: string
  outcome_being_estimated: string
  time_horizon: string
  base_rate:
    estimate: number | unknown
    source: string
    confidence: low | medium | high
  predictability:
    factor_understanding: low | medium | high
    data_available: none | weak | adequate | strong
    future_similarity: low | medium | high
    observer_effect: none | weak | material
    verdict: low | medium | high
  signals_for:
    - signal: string
      strength: weak | medium | strong
      source: string
  signals_against:
    - signal: string
      strength: weak | medium | strong
      source: string
  estimate:
    probability: number | range | not_estimable
    confidence: low | medium | high
    rationale: string
  decision_value:
    upside: string
    downside: string
    cost_if_wrong: low | medium | high | critical
    reversibility: low | medium | high
    expected_value: negative | neutral | positive | unclear
  action:
    recommendation: proceed | defer | gather_more_evidence | escalate_to_owner | block
    next_step: string
    calibration_log_required: true | false
```

## Execution steps

1. Define the decision and the concrete outcome being estimated.
2. Separate goal from forecast: name what Marcel wants and what seems likely.
3. Check predictability before assigning a probability.
4. Establish a base rate from local history, external evidence, or mark it `unknown`.
5. Add local evidence as signals for and against, with strength.
6. Estimate probability as a range unless evidence supports a point estimate.
7. Evaluate expected value, reversibility, and cost of error.
8. Select action: proceed, defer, gather evidence, escalate, or block.
9. If the outcome is observable, append a calibration row to the active probability calibration log.

## Probability bands

| Band | Use |
|---|---|
| 0-20% | unlikely |
| 20-40% | doubtful |
| 40-60% | uncertain / coin-flip zone |
| 60-80% | likely |
| 80-95% | strong likelihood |
| 95%+ | only for deterministic or heavily evidenced cases |

## Calibration rules

- Prefer ranges for first-pass estimates.
- Do not use decimals unless produced by a real model or calculation.
- Mark `not_estimable` when predictability is low and evidence is weak.
- Score resolved binary forecasts with Brier score: `(forecast_probability - outcome)^2`.
- Review calibration in buckets: 20-40%, 40-60%, 60-80%, 80-95%.
- Treat overconfidence as a failure pattern and route repeated failures through `failure-evolution-loop`.

## Integration with Yuri operations

- Use before `execution-domain-core` when uncertainty shapes the domain boundary.
- Use before `non-destructive-infinity-guard` when probability affects risk acceptance.
- Use after `failure-evolution-loop` when a wrong estimate caused bad routing, priority, or action.
- Use alongside DACH market intelligence, trading analysis, and planning work where outcome probabilities drive operational choices.

## Research basis

- Forecasting practice should distinguish forecasts, goals, and plans; planning responds to forecasts and goals.
- Predictability depends on factor understanding, data availability, future similarity to the past, and whether forecasts affect the outcome.
- Distributional forecasts should be evaluated against outcomes, not just stated.
- Decision analysis should propagate uncertainty through alternatives instead of relying only on point estimates.
- Proper scoring rules such as Brier score reward honest probabilistic forecasts and support calibration review.

Sources:
- https://otexts.com/fpp3/planning.html
- https://otexts.com/fpp3/what-can-be-forecast.html
- https://otexts.com/fpp3/distaccuracy.html
- https://www.nist.gov/publications/incorporating-attribute-value-uncertainty-decision-analysis
- https://link.springer.com/article/10.1007/s10994-023-06336-7

## Safety rules

- Do not let favorable probability bypass explicit owner approval.
- Do not convert owner preferences into forecasts.
- Do not treat model confidence as evidence confidence.
- Do not log personal, identity-level, or relationship-sensitive predictions unless explicitly requested.
- Do not write to protected state surfaces.

## Success criteria

The skill succeeds when it produces:

- a clear decision recommendation
- separated forecast, goal, plan, and confidence
- explicit base rate or `unknown`
- named evidence for and against
- cost-of-error and reversibility assessment
- calibration log proposal when the outcome can be checked

## Failure handling

If execution fails, return:

```yaml
failure:
  extension_id: "probabilistic-decision-core"
  halt_reason: string
  missing_inputs: []
  unsafe_precision_risk: true | false
  recommended_next_action: string
```

## Session Notes

### 2026-05-16
- session: 41m | peak ctx: 0% | compacts: 0
- tools: Bash×44, Write×25, Edit×21, TodoWrite×6, Read×5, mcp×1, Skill×1
- corrections: Base directory for this skill: /Users/marcelspatz/.claude/skills/end-of-transmission

# End of Transmission

Continuous background reflection engine for NUDIMMUD. Runs **two modes**:

1. **Micro-EOT**
- errors: none

### 2026-05-16
- session: 37m | peak ctx: 0% | compacts: 0
- tools: Bash×40, Write×23, Edit×21, TodoWrite×6, Read×5, mcp×1
- corrections: none
- errors: none

### 2026-05-16
- session: 27m | peak ctx: 0% | compacts: 0
- tools: Bash×31, Edit×19, Write×10, TodoWrite×6, Read×4, mcp×1
- corrections: none
- errors: none

### 2026-05-16
- session: 13m | peak ctx: 0% | compacts: 0
- tools: Bash×16, Edit×4, Write×3, TodoWrite×3, Read×2
- corrections: none
- errors: none

### 2026-05-10
- tools used: web research, local file inspection, apply_patch
- corrections: none
- errors: none
- notes: Created as an operational decision layer for Yuri OS probability, uncertainty, expected value, and calibration discipline.
