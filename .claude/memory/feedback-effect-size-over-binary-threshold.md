---
name: feedback-effect-size-over-binary-threshold
description: "Statistical verdicts on a continuous metric: report effect size + significance + rank, never a binary thresholded claim — a fixed cutoff is arbitrary and a permutation null at large n flags everything"
metadata: 
  node_type: memory
  type: feedback
  tier: warm
  scope: claude-behavioral
  trig: 
    - coupling
    - separable
    - threshold
    - significance
    - p-value
    - schmidt
    - permutation null
    - effect size
    - binary verdict
  refs: 
    - proj-energy-calibration-swarm-sheet-2026-06-13
    - feedback-completeness-cert-needs-total-counts
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

RULE: when an instrument emits a verdict from a CONTINUOUS metric (coupling ratio, similarity, drift, risk score), report the EFFECT SIZE + SIGNIFICANCE + RANK — do NOT ship a binary thresholded claim ("coupled/separable", "pass/fail") off a single cutoff.

WHEN: building any analysis/sim/scoring instrument that classifies on a continuous statistic (esp. before a downstream decision reads the binary).

DO: emit the magnitude (effect size) per item, rank items by it, and attach significance (vs a data-driven null) as a real-vs-chance footnote. Let the consumer/owner judge the cut.

DONT: (1) hard-code a fixed threshold — it's an undefended magic number; a small sweep around it usually swings the verdict wildly (the calibration coupling set swung 0→12+ pairs across a 0.10 band). (2) "fix" that by switching to a permutation-null significance test and calling significant=coupled — at large n the shuffle null is so tight that ANY tiny real association clears p<0.05, so it flags nearly everything (17/21). Significance ≠ importance.

WHY: a binary coupled/separable verdict is non-robust in BOTH directions (arbitrary fixed cutoff; large-n significance inflation). The honest, robust signal is the effect-size magnitude + rank; significance only says "real, not chance." Surfaced by an adversarial verify pass on the energy-calibration quantum coupling test (Schmidt separabilityRatio) — it caught that a shipped "2 coupled pairs" finding was a bins/threshold artifact; the robust restatement was "all pairs ≥98.6% separable, ranked by weak effect size."

SEE: [[proj-energy-calibration-swarm-sheet-2026-06-13]] · [[feedback-completeness-cert-needs-total-counts]]
