---
name: yuri-probability
description: Operational probability and calibration discipline for Yuri OS decisions
trigger: /yuri probability
aliases: [/probability, /pdc]
skill: probabilistic-decision-core
model: claude-sonnet-4-6
---

# /yuri probability

Invoke Probabilistic Decision Core for operational decisions under uncertainty.

## Usage

```bash
/yuri probability --decision "TEXT" --horizon "TEXT" --evidence "TEXT"
```

## Options

- `--decision TEXT` - Decision or route being evaluated
- `--horizon TEXT` - Time window for the outcome
- `--evidence TEXT` - Known facts, signals, or constraints
- `--calibrate` - Prepare an outcome row for the calibration log
- `--non-destructive` - Keep output advisory-only

## Output

- Forecast vs goal separation
- Predictability check
- Base rate and local signals
- Probability estimate or `not_estimable`
- Cost-of-error and expected-value judgment
- Action recommendation and calibration row when applicable
