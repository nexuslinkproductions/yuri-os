# Token Efficiency & Memory Architecture

## Tiered Memory Architecture
Managing token limits requires a hierarchical approach mimicking computer memory:
1. **Tier 1 (Working Memory / Hot)**: Immediate history and active task state. Stored in-context or in rapid Key-Value cache.
2. **Tier 2 (Episodic Memory / Warm)**: Summarized past interactions and workflows. Stored in Vector DBs for semantic retrieval.
3. **Tier 3 (Semantic & Relational / Cold)**: Distilled facts, entity relations (Knowledge Graphs like Neo4j), and canonical docs.

## Prompt Compression & Caching
1. **Semantic Summarization**: Use smaller models (Llama 3 8B, GPT-4o-mini) to maintain a rolling summary of chat histories, replacing raw turns.
2. **Token-Level Pruning (LLMLingua)**: Strip low-entropy tokens (articles, connectors), achieving up to 20x compression with minimal loss.
3. **Caching Strategies**:
   - **Provider Prompt Caching (KV Cache)**: Caching massive system prompts or reference documents at the API layer (reduces input cost by up to 90%).
   - **Semantic Caching**: Embedding user queries to detect and serve >95% similar cached responses, saving 100% of LLM compute.

### Gap Analysis & Implementation for NUDIMMUD
- **Current Gap**: Token context bloat leading to expensive sessions or "amnesia".
- **Implementation**: Establish a strict Tiered Memory approach for NABU and the Conclave. Enforce Provider Caching for large project context files (like `AGENTS.md` and `SKILL.md` collections).