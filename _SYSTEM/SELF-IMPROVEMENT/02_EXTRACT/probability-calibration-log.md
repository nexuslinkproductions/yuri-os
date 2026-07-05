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
2026-05-16 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-16 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-16 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-16 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-16 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-16 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-16 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-16 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-17 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-17 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-17 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-17 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-17 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-17 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-20 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-21 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-21 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-22 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-22 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-23 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-24 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-24 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-25 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-26 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-26 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-27 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-27 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-28 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-28 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-29 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-30 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-30 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-31 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-05-31 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-01 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-01 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-02 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-02 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-03 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-03 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-04 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-04 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-04 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-05 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-05 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-06 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-06 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-07 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-07 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-08 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-08 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-09 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-09 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-10 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-10 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-11 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-11 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-12 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-12 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-13 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-13 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-14 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-14 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-06-15 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-07-04 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
2026-07-04 | evaluated=0 | deprioritized=[none] | f1_dropped=[none]
