---
name: compact-optimizer
description: "Construct the minimum-viable /compact hint. Grounded in selective context compression research (self-information scoring, perplexity-based pruning, attention-sink preservation)."
trigger: /compact-hint
aliases: [/compact-optimizer]
skill: compact-optimizer
---

# /compact

Invoke the `compact-optimizer` skill to build a context-preservation hint before running `/compact`.

## Usage

```
/compact
```

Analyzes the current session and constructs a minimal hint that tells `/compact` exactly which files, corrections, and constraints must survive compression.

## Research Grounding

Based on EMNLP 2023 (Selective Context, LLMLingua) and NeurIPS 2023 (H2O MIT attention-sink analysis). Preserves session-unique state, compresses verbose reasoning, drops reconstructable content.

## Behavior Authority

Complete survival priority hierarchy, compression rules, and hint template are in `.claude/skills/compact-optimizer/SKILL.md`.
