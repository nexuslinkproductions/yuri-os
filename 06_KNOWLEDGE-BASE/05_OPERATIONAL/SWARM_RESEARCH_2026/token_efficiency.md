# Token Efficiency & Tiered Memory
## Date: 2026-04-23
### Focus: Prompt Compression & Caching
- **Hierarchical Pruning**: Implement a rolling summary buffer for episodic memory. Keep only the last 3 turns in active RAM, while deep-storing older turns into a RAG (Retrieval-Augmented Generation) pipeline.
- **Prompt Caching**: Structure system prompts so that the invariant sections (Protocols, Skills) are at the top, maximizing KV-cache hit rates for models like Claude 3.5 Sonnet and DeepSeek-V3.
- **Action Items**: Rewrite the `AEONIC_PROTOCOL.md` to be strictly modular for dynamic inclusion/exclusion based on the current active agent.
