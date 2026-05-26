---
title: Model Routing Digest — Frontier Models (Build This Now)
type: operational
layer: 05_OPERATIONAL
created: 2026-04-23
tags: [operational, models, routing, frontier, llm, research]
status: active
version: 1.0
links:
  - "[[05_OPERATIONAL/response_architecture]]"
  - "[[05_OPERATIONAL/mode_triggers]]"
  - "[[05_OPERATIONAL/partner_memory]]"
---

# Model Routing Digest — Frontier Models

Source: [Build This Now, 2026-04-21](https://www.buildthisnow.com/blog/models/2026-04-21-opus47-vs-frontier)

## Thesis

No single frontier model wins everywhere. The right model depends on the work:

- Quality-sensitive coding and autonomous agent work -> Claude Opus 4.7
- Giant context ingestion and long documents -> Gemini 3.1 Pro
- Web research and short interactive work -> GPT-5.4
- Cheap bulk automation -> DeepSeek V3.2
- Chinese / multilingual niche work -> Kimi K2.6

The useful frame is workload routing, not model loyalty.

## Practical Routing

### Claude Opus 4.7
- Best for messy coding, debugging, code review, long agent runs, and high-precision reasoning.
- Use when self-correction and coherence matter more than raw throughput.

### GPT-5.4
- Best for web research, retrieval, and short multi-step interactive chains.
- Use when the task depends on fast access to current information.

### Gemini 3.1 Pro
- Best when the whole source must fit, especially long docs, contracts, and large codebases.
- Use as the ingest layer before deeper analysis.

### DeepSeek V3.2
- Best for cheap, high-volume, well-defined automation.
- Use for tagging, classification, extraction, and templated generation.

### Kimi K2.6
- Best for Chinese-language documents and simpler multilingual tasks.
- Less strong on long multi-hop reasoning.

## Claims From the Article

These are article claims, not independently verified here:

- Opus 4.7: 70% on CursorBench
- GPT-5.4: 68% on SWE-Bench
- Gemini 3.1 Pro: 63% on SWE-Bench
- DeepSeek V3.2: 52% on HumanEval
- BrowseComp: GPT-5.4 at 89.3% vs Claude at 79.3%

Pricing claims in the post:

- Opus 4.7: $5 / $25 per 1M input/output tokens
- GPT-5.4: $2.50 / $15
- Kimi K2.6: $3 / $15
- Gemini 3.1 Pro: $2 / $12
- DeepSeek V3.2: $1 / $4

Context-window claims in the post:

- Gemini: 2M
- Opus: 1M
- Kimi: 512K
- GPT-5.4: 256K
- DeepSeek: 128K

## Caveats

- The post is builder-oriented and strongly favors Opus 4.7 for hard coding and agent work.
- The benchmarks are mixed across different tests, so the comparisons are not perfectly apples-to-apples.
- Context window is treated as a major decision axis; that matters for docs and codebases, but not every workflow.
- Treat the numbers as routing signals, not procurement truth.

## Reusable Heuristic

- Messy coding, debugging, code review -> Claude Opus 4.7
- Long autonomous agent runs -> Claude Opus 4.7
- Huge docs, contracts, monorepos -> Gemini 3.1 Pro
- Huge docs needing precision -> Gemini 3.1 Pro first, then Opus 4.7 for analysis
- Web research, retrieval, short chat -> GPT-5.4
- Cheap bulk automation -> DeepSeek V3.2
- Chinese-language docs or simple multilingual tasks -> Kimi K2.6
- Default pair for builders -> Opus 4.7 + DeepSeek V3.2

## Bottom Line

The article's strongest operational value is the routing pattern:

1. Use Gemini to fit the whole source.
2. Use Opus when quality and coherence matter.
3. Use GPT-5.4 when current retrieval matters.
4. Use DeepSeek when scale and cost dominate.

