# Calibration Report

**Generated:** 2026-05-05T20:39:29.576Z
**Trades Analyzed:** 7 (7 matched to outcomes)

## Model Performance
| Model | Brier Score | Sample Count | Rank |
|-------|-------------|-------------|------|
| claude | 0.1369 | 7 | 1 |
| deepseek | 0.1403 | 7 | 2 |
| gpt4o | 0.1412 | 7 | 3 |
| gemini | 0.1525 | 7 | 4 |
| groq | 0.2127 | 7 | 5 |

## Dispersion Analysis
| Bucket | Trades | Brier Score | Status |
|--------|--------|-------------|--------|
| < 0.05 | 3 | 0.1345 | ✅ |
| 0.05-0.10 | 2 | 0.2034 | ⚠️ |
| 0.10-0.15 | 2 | 0.1114 | ✅ |

## Confidence Calibration
**Status:** ok
| Bucket | Actual Brier | Expected Brier | Drift | Status |
|--------|-------------|----------------|-------|--------|
| < 0.05 | 0.1345 | 0.1200 | 0.0145 | ✅ ok |
| 0.05-0.10 | 0.2034 | 0.1800 | 0.0234 | ✅ ok |
| 0.10-0.15 | 0.1114 | 0.2400 | -0.1286 | ✅ ok |

## Issues
- None
