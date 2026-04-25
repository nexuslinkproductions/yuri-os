---
name: context-compressor
description: Use for optimizing LLM context window usage via Tiered Memory, prompt caching, and semantic summarization. Ideal for long-running sessions or projects with massive documentation.
---

# Context Compressor

Standards for managing the NUDIMMUD memory hierarchy and token efficiency.

## Tiered Memory Strategy
1. **L1 (Hot)**: Current turn + last 3 turns. Store in immediate context.
2. **L2 (Warm)**: Episodic summaries of past tasks. Use a rolling summary model.
3. **L3 (Cold)**: Entity relations and distilled facts. Run `graphify` periodically to update the L3 Knowledge Graph.

## Compression Workflow
- **Prompt Caching**: Always structure system prompts and reference docs to be at the prefix of the conversation to leverage provider-level KV caching.
- **LLMLingua**: When context exceeds 80% of window, run a token pruning script to strip low-entropy tokens (articles, connectors).
- **Semantic Summarization**: Before task handoff, condense the conversation log into a compact JSON state object.

## Tools
- Use specialized scripts in `scripts/` for token-level pruning.
- Run `graphify query` instead of reading entire folders.