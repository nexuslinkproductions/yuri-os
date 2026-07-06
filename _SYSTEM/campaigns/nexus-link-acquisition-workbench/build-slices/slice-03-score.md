# Slice 03 — Score

## Goal
Convert each enriched lead into a **calibrated conversion probability** (not a points score) and carry it forward as a bettable number.

> **Metric this slice computes:** `P(reply|L)`, `P(conv|reply,L)`, and `P(conv|L)` — the two-stage logistic of `11-math-models.md` §1. This is the *only* slice that produces the probability everything downstream prices against. No other slice may invent a score.

## Inputs
- `leads/enriched/<id>.json`
- `config/weights.json` — feature weights `wᵢ` (reply) and `vⱼ` (conv) in **logit units**, plus biases `b_r`, `b_c` (§1.3 starter table)

## Outputs
- `leads/scored/<id>.json` — enriched + `p_reply` + `p_conv_given_reply` + `p_conv` + `z_reply` + `z_conv` + `features_used` + `weights_version`

## Spec
1. Load weights config (`wᵢ`, `vⱼ`, `b_r`, `b_c`).
2. Map enrichment fields → binary/[0,1] features `xᵢ` (§1.3): fresh, budget-stated, decision-maker-reachable, pain-matches-proof, verified-prior-spend, scoped-ask, bounty-clear-criteria, crowded(−), consent-gap(−), no-contact(−).
3. Apply confidence decay to any feature carrying a timestamp: `x_eff = x · 0.5^(age/halfLife)` (§1.8) — feed `x_eff`, not the raw `1.0`.
4. Compute `z_reply = b_r + Σ wᵢ·x_eff`; `p_reply = σ(z_reply)`.
5. Compute `z_conv = b_c + Σ vⱼ·x_eff`; `p_conv_given_reply = σ(z_conv)`.
6. `p_conv = p_reply · p_conv_given_reply`.
7. Write scored JSON. Band assignment (A/B/C/drop) is **derived from `p_conv` cut-points in config**, not a separate number.

## Compute recipe + worked example (§1.5)
Fresh post, budget stated, DM reachable, pain matches a proof-piece, but crowded:
```
z_reply = −1.4 + 0.9 + 0.4 + 0.6 + 0.5 − 0.5 = 0.5  →  p_reply = σ(0.5) = 0.622
z_conv  = −0.4 + 0.8 + 0.5 + 0.9 − 0.3       = 1.5  →  p_conv|reply = σ(1.5) = 0.818
p_conv  = 0.622 × 0.818 = 0.509   (~51%)
```
Stale-budget case: budget feature aged 20d, halfLife 14d → `x_eff = 0.5^(20/14) = 0.37`; re-run step 4–6 with the decayed feature.

## Calibration loop (§1.7 — the honesty gate)
This slice does not get to claim its numbers are real. After ≥30 logged outcomes (from slice 06), recompute **Brier** = mean squared error of predicted `p_conv` vs realized {0,1}:
```
Brier = (1/N) Σ (Pᵢ − oᵢ)²
```
- `Brier < 0.25` → the weights beat coin-flip → keep them.
- `Brier ≥ 0.25` → the weights are theater → fall back to "pursue anything with budget + reachable DM" and retune.
Emit `brier` and `n_outcomes` on a daily/weekly health line.

## Done-test
- For a hand-labeled sample, `p_conv` ranks leads in the same order a human analyst would, and `σ`/decay math matches §1.5 by hand on one worked lead.
- Output JSON contains `p_conv ∈ [0,1]`, never a 0–100 integer.

## THE DECISION IT DRIVES
Which lead is *worth* the next hour — and at what intensity. The raw probability here is the input to slice 04's EVH ranking.

## What this slice does NOT do
- No 0–100 "points" score (cut in §1.1 — uncomparable, uncalibrated).
- No ranking — that is slice 04 (EVH needs value + effort, which this slice does not see).
- No entropy/KL over the lead set (theater for ranking, §1.9).

## Niche note
Only the **feature definitions** are niche-specific (what counts as "pain matches a proof-piece"). The logistic math and weights schema live in `config/weights.json` and never change across campaigns.
