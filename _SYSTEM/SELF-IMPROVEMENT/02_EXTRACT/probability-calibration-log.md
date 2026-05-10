# Probability Calibration Log

Purpose: track Yuri operational forecasts against outcomes so future sessions improve calibration instead of repeating confident guesses.

## Rules

- Log only operational decisions where the outcome can later be checked.
- Do not log identity-level, relationship-sensitive, or private personal predictions unless explicitly requested.
- Use probability ranges when evidence is weak.
- Resolve rows when the time horizon expires or the outcome is known.
- Calculate Brier score for binary outcomes: `(p - outcome)^2`, where outcome is `1` if true and `0` if false.

## Active Forecasts

| Date | Decision | Outcome Estimated | Horizon | Probability | Confidence | Base Rate | Key Signals | Action | Resolve By | Status |
|---|---|---|---|---:|---|---|---|---|---|---|

## Resolved Forecasts

| Date | Decision | Probability | Outcome | Brier | Error Pattern | Lesson |
|---|---|---:|---:|---:|---|---|

## Monthly Calibration Review

Use this review at month end:

```text
Bucket reviewed:
Forecast count:
Observed frequency:
Average Brier:
Overconfident cases:
Underconfident cases:
Adjustment for next month:
```
