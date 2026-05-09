# Trading Bot — Phase 4: Ensemble Inference & Calibration

**Status:** Architecture & Specification  
**Date:** 2026-05-05  
**Purpose:** Multi-model probability aggregation, calibration, dispersion analysis

---

## Overview

Ensemble aggregates probability estimates from multiple models (Grok, Claude, GPT-4o, Gemini, DeepSeek), computes disagreement dispersion, and produces calibrated confidence scores.

```
Evidence Packet + Candidate Features
  ↓
Run Model Ensemble (5 models in parallel)
  ↓
Extract Per-Model Probabilities
  ↓
Compute Weighted Average (p_model)
  ↓
Calculate Dispersion (std dev across models)
  ↓
Confidence Bucketing (historical accuracy)
  ↓
Output: prediction_result.jsonl
```

---

## Model Roster

| Model | Provider | Strengths | Weight | Timeout |
|-------|----------|-----------|--------|---------|
| Grok | xAI | Real-time data, speed | 0.20 | 30s |
| Claude | Anthropic | Reasoning, nuance | 0.25 | 30s |
| GPT-4o | OpenAI | Broad knowledge | 0.20 | 30s |
| Gemini | Google | Multimodal capable | 0.15 | 30s |
| DeepSeek | DeepSeek | Cost-efficient, fast | 0.20 | 30s |

**Weights:** Reflect historical accuracy on Brier Score metric (updated quarterly)

---

## Inference Prompt Structure

**System message:**
```
You are a prediction market analyst. Given market evidence and candidate information, 
estimate the probability of the YES outcome (price going up) as a decimal 0-1.
Return ONLY a JSON object with key "probability" (float).
```

**User prompt:**
```
Market: {market_id}
Current Price: {last_price}
24h Volume: {volume_24h}
Spread: {spread_bps} bps

Evidence Summary:
{consensus_summary}

Contrarian View:
{dissent_summary}

What is the probability this market closes above {target_price}?
```

---

## Probability Aggregation

**Weighted Ensemble:**
```
p_model = Σ(weight_i * p_i) / Σ(weight_i)
```

**Dispersion (Disagreement):**
```
dispersion = sqrt( Σ(weight_i * (p_i - p_model)²) / Σ(weight_i) )
```

**Interpretation:**
- `dispersion < 0.05` — Strong consensus (high confidence)
- `dispersion 0.05-0.15` — Moderate consensus (fair confidence)
- `dispersion > 0.15` — High disagreement (low confidence)

---

## Confidence Bucketing

Historical accuracy determines confidence assignment.

**Training Phase (50+ backtested trades):**
1. Collect predictions and outcomes
2. Bin by dispersion range (0-0.05, 0.05-0.10, 0.10-0.15, >0.15)
3. Calculate Brier Score per bucket
4. Assign confidence = 1 - (actual_brier / max_brier)

**Example calibration:**
| Dispersion | Sample Size | Brier Score | Confidence |
|-----------|-------------|-------------|-----------|
| < 0.05 | 8 | 0.12 | 0.88 |
| 0.05-0.10 | 12 | 0.18 | 0.82 |
| 0.10-0.15 | 18 | 0.24 | 0.76 |
| > 0.15 | 12 | 0.32 | 0.68 |

---

## Prediction Result Schema

**File Format:** `prediction_result.jsonl` (append-only)

```json
{
  "market_id": "BTC-USD",
  "p_model": 0.643,
  "confidence": 0.78,
  "model_probs": {
    "grok": 0.67,
    "claude": 0.62,
    "gpt4o": 0.65,
    "gemini": 0.60,
    "deepseek": 0.64
  },
  "dispersion": 0.024,
  "research_quality": 0.81,
  "bucketed_by_dispersion": "0.05-0.10",
  "model_weights": {
    "grok": 0.20,
    "claude": 0.25,
    "gpt4o": 0.20,
    "gemini": 0.15,
    "deepseek": 0.20
  },
  "notes": ["consensus strong", "fresh evidence"],
  "timestamp": "2026-05-05T12:34:56.789Z"
}
```

---

## Calibration Report

**Generated after every 10 trades:**

```markdown
# Calibration Report — 2026-05-05

## Model Performance
- Grok: Brier 0.195 (rank 2)
- Claude: Brier 0.185 (rank 1)
- GPT-4o: Brier 0.204 (rank 3)
- Gemini: Brier 0.218 (rank 4)
- DeepSeek: Brier 0.190 (rank 2)

## Dispersion Analysis
- Low dispersion (<0.05): 8 trades, Brier 0.12 ✅
- Medium dispersion (0.05-0.15): 12 trades, Brier 0.18 ✅
- High dispersion (>0.15): 4 trades, Brier 0.28 ⚠️

## Confidence Calibration
- All buckets: Expected ≈ Actual ✅
- Model weights: No update needed

## Issues
- None
```

---

## Implementation: ensemble-inference.mjs

**Location:** `Scripts/trading-bot/ensemble-inference.mjs`

**Interface:**
```typescript
async function runInference(
  marketId: string,
  evidencePacket: EvidencePacket,
  features: CandidateFeatures
): Promise<PredictionResult>

async function callModel(
  modelName: string,
  prompt: string
): Promise<number>

function aggregateProbs(
  probs: Record<string, number>,
  weights: Record<string, number>
): { p_model: number; dispersion: number }

function assignConfidence(
  dispersion: number,
  calibrationTable: CalibrationBucket[]
): number

function generateCalibrationReport(
  trades: Trade[],
  outcomes: Outcome[]
): CalibrationReport
```

**Error handling:**
- Model timeout → use last known probability, mark as stale
- API error → retry with exponential backoff (max 3 attempts)
- Invalid probability → reject, log error, skip model
- Missing evidence → use neutral (0.50) prior

**Output validation:**
- Probabilities 0-1 range
- Dispersion ≥ 0
- Weights sum to 1.0
- Confidence ≤ 1.0

---

## Calibration Maintenance

**Weekly (after 10 trades):**
- Recompute Brier Score per model
- Update confidence bucket thresholds
- Check for model drift (Brier increase > 0.05)

**Monthly (after 50 trades):**
- Full recalibration: reassign model weights
- Archive calibration report
- Review & adjust dispersion thresholds if needed

---

## Next: Phase 5 Risk Engine

Prediction result + market conditions feed into Kelly sizing and risk gates.
