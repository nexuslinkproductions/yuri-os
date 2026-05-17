---
title: Recursive Language Models (RLM) — Synthesis & Application
source: Zhang, Kraska, Khattab (MIT, 2025) · arXiv:2512.24601v2
archived: /Users/marcelspatz/YURI-OS-MUSUBI/RESEARCH/papers/Recursive Language Models - MIT.pdf
date: 2026-04-24
tags: [rlm, offloading, token-optimization, gemini-flash, architecture]
---

# RLM Synthesis: Application to EvoNexus Pipeline

## Core Finding

Recursive Language Models treat long prompts as **external environment data** rather than neural inputs. The model uses a Read-Eval-Print Loop (REPL) to programmatically examine, decompose, and recursively call itself over prompt snippets.

**Result:** Successful processing of inputs **up to 100x beyond** model context windows.

Key benchmarks:
- RLM(GPT-5): 62% on CodeQA (23K–4.2M tokens) vs. 24% baseline
- RLM(GPT-5): 91.3% on BrowseComp-Plus (6-11M tokens), +29% over summarization
- Cost: Comparable or lower at 50th percentile vs. naive approaches

---

## Three Operational Directives for EvoNexus

### 1. Gemini Flash as RLM Execution Environment
Route all large-context tasks (>50k tokens) to Gemini Flash via `g` CLI. Sonnet orchestrates; Flash executes recursive sub-calls. Flash's 1M token window + unlimited Google tier makes it the ideal RLM worker.

```
Claude Sonnet (Orchestrator)
  → dispatches large-context task to `g`
  → Gemini Flash decomposes via RLM REPL
  → returns compressed result
  → Sonnet synthesizes
```

### 2. Stateful Recursive Sharding (Mental Map JSON)
Instruct Flash to output a **"Mental Map JSON"** at the end of every recursive call — not raw recursive output. Sonnet ingests the JSON map, not the full tape. This prevents O(N²) context growth.

```json
{
  "task": "...",
  "shards_processed": 4,
  "key_findings": ["...", "..."],
  "open_questions": ["..."],
  "next_shard": "section_5"
}
```

### 3. Shadow Context via Antigravity
Flash can run in the **background** via Antigravity, tracking terminal outputs and scratchpads. This maintains a "Full Tape" playback buffer for Sonnet without burning active context window. Use for long research sessions, vault scans, and multi-hour synthesis tasks.

---

## Fine-Tuning Implication

RLM-Qwen3-8B outperformed base Qwen3-8B by **28.3%** and approached GPT-5 quality on three long-context tasks. Implication: **local LLM offloading via @ollama is more viable than assumed** for large-context tasks when RLM pattern is applied. Don't assume local = low quality for long-context work.

---

## Links
- [`offload-workflow.md`](/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/offload-workflow.md) — Gemini Flash lane + dispatch
- [`ai-pipeline-offloading`](/Users/marcelspatz/YURI-OS-MUSUBI/.claude/skills/ai-pipeline-offloading/) — skill for multi-model dispatch
- [`EVONEXUS_INTEGRATION_MAP.md`](/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/EVONEXUS_INTEGRATION_MAP.md) — platform map

---

*Synthesized 2026-04-24 for EvoNexus pipeline integration. Paper archived in RESEARCH/papers/.*
