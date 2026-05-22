---
name: ai-pipeline-offloading
description: Strategies for effective LLM offloading and AI pipeline optimization. Use when designing multi-model workflows to minimize cost and latency while maximizing quality.
---

# AI Pipeline Offloading & Optimization

This skill guides the selection of models and offloading strategies for NUDIMMUD AI pipelines.

## 1. Complexity-Based Routing

Match the model to the task complexity to optimize ROI.

| Task Complexity | Examples | Recommended Model |
| :--- | :--- | :--- |
| **Low** | Linting, formatting, single-file search, summarization. | 4o-mini, Qwen-Lite, GPT-3.5 |
| **Medium** | Unit test generation, refactoring, multi-file search, docs. | Claude 3.5 Sonnet, GPT-4o, Qwen-72B |
| **High** | Architectural design, security audits, novel debugging, RAG. | Claude 3 Opus, GPT-4o (Reasoning), DeepSeek-V3 |

## 2. The "Guardian" Pattern (Adversarial Offloading)

Offload validation to a separate model to ensure objectivity.
1. **Generator**: Medium/High model creates output.
2. **Guardian**: Independent model (usually INANNA/Gemini) audits the output against constraints.
3. **Loop**: If Guardian fails, offload the "Fix" task back to Generator with specific feedback.

## 3. Tool-Call Offloading

Avoid using reasoning models for deterministic tasks.
- **Offload to Shell**: Instead of asking LLM to calculate, ask it to write a script and run it.
- **Offload to MCP**: Use specialized MCP servers for database queries, file system indexing, or API calls.

## 4. Pipeline Decomposition

Break long-running pipelines into discrete stages with intermediate "Checkpoints".
- **Stage 1: Intake**: Summarize request (Low model).
- **Stage 2: Plan**: Create implementation plan (High model).
- **Stage 3: Execute**: Code generation (Medium model).
- **Stage 4: Verify**: Test and Audit (High/Guardian model).

## 5. Token Efficiency (Context Pruning)

- **Selective Loading**: Only load the symbols/files identified by `gitnexus_impact`.
- **Context Distillation**: Summarize previous turns into a "State Summary" before the next heavy reasoning step.
- **Cache-Aware Prompts**: Structure prompts to maximize KV-cache reuse if the model provider supports it.

## 6. Local vs. Cloud Offloading

- **Local (Ollama/LM Studio)**: Use for privacy-sensitive data or routine automation tasks (Gemma 2, Llama 3).
- **Cloud**: Use for "Frontier" reasoning and large-scale context (Claude 3.5, GPT-4o).
