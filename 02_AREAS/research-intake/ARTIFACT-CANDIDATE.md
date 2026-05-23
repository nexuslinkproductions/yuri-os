---
name: compact-optimizer
kind: skill
status: draft
date: 2026-04-24
evidence: stable — repeated need for precise /compact hints across all sessions
sources:
  - "Selective Context — Yucheng Li et al., EMNLP 2023 (self-information pruning)"
  - "LLMLingua — Microsoft Research / PKU, EMNLP 2023 (language-model surprise token scoring)"
  - "H2O Heavy-Hitter Oracle — MIT Han Lab, NeurIPS 2023 (attention-weight KV cache eviction)"
---

# Compact Optimizer — Artifact Candidate

## Problem
Claude Code's /compact command summarizes session context when the window fills. Without a precise hint, compaction is generic — dropping critical constraints, active file states, and user corrections while retaining low-value exploration text.

## Research Basis

### Selective Context (EMNLP 2023)
Self-information = -log P(token | preceding). Low self-information = redundant. High = irreplaceable. At 50% compression, <4% performance drop when high-info tokens are retained.
Applied rule: drop anything the model could reconstruct from general knowledge. Keep anything unique to THIS session.

### LLMLingua (EMNLP 2023)
Differential compression budgets per component:
- Instructions/constraints: compress 10-20% max
- Exploration/reasoning: compress 60-80%
- Tool outputs: keep outputs, drop call scaffolding

Applied rule: the compact hint should flag which blocks are high-priority (constraints, file states) vs low-priority (reasoning, narration).

### H2O — MIT Han Lab (NeurIPS 2023)
Retains top-K recent + top-M heavy-hitter tokens (high cumulative attention weight). Discards semantically important but low-attention middle content.
Applied rule: always preserve the last user correction and last known file state. They are the session's attention sinks.

## Behavior to Codify
1. Survival priority hierarchy
2. Drop list
3. Compact hint template
4. Per-phase hints (research / implement / review)

## Evidence of Repetition
Every multi-phase session requires /compact with a hint to prevent loss of active files, constraints, corrections, and error state. Without a hint these are lost in generic summaries.
