# YURI Memory, RAG, Skill Recall Research

Date: 2026-05-21
Owner: Codex/main orchestrator
Mode: source-backed implementation guidance for the Shintai self-improvement wave

## Research Boundary

This is not an implementation dependency decision. It is an evidence packet for YURI's own memory, retrieval, skill recall, and self-improvement kernels.

Protected surfaces remain sealed: `backend/data/`, `.claude/state/`, `.claude/history/`, `.env`, `node_modules/`, `.amp/`.

## Sources Captured

- EverMind-AI MSA local checkout: `_SYSTEM/tools/MSA` at `77fbdfde88e150cd91307fd710067cf06828cfdc`.
- MSA upstream: `https://github.com/EverMind-AI/MSA` and arXiv `https://arxiv.org/abs/2604.21748`.
- OpenAI file search / vector stores: `https://developers.openai.com/api/docs/guides/tools-file-search`.
- Anthropic Claude prompting and agentic guidance: `https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices`.
- Mem0 search and graph memory docs: `https://docs.mem0.ai/core-concepts/memory-operations/search`, `https://docs.mem0.ai/open-source/features/graph-memory`, `https://docs.mem0.ai/api-reference/memory/search-memories`.
- Letta memory overview, blocks, shared memory, and sleep-time agents: `https://docs.letta.com/guides/agents/memory`, `https://docs.letta.com/guides/agents/memory-blocks/`, `https://docs.letta.com/guides/core-concepts/memory/shared-memory/`, `https://docs.letta.com/guides/agents/sleep-time-agents`.
- LangMem: `https://langchain-ai.github.io/langmem/`.
- CrewAI agents: `https://docs.crewai.com/en/concepts/agents`.
- NeMo Guardrails local checkout and matrix: `_SYSTEM/tools/nemo-guardrails`, `_SYSTEM/docs/YURI_OS_NEMO_GUARDRAIL_MATRIX_2026-05-20.md`.

## Findings

### MSA

MSA is the strongest architectural signal, but not an immediate import target. The local README describes a trainable sparse latent-memory layer with document-wise RoPE, top-k memory routing, KV compression, Memory Parallel inference, and Memory Interleave for multi-hop reasoning. The practical YURI takeaway is the separation of memory capacity from active reasoning: huge background memory should be encoded, routed, and assembled selectively rather than dumped into every prompt.

YURI implementation implication: keep `_SYSTEM/tools/MSA` as ignored upstream research. Borrow the pipeline shape, not the Python dependency stack:

- offline encode/index;
- online route;
- assemble sparse context;
- generation or dispatch;
- optional interleave when multi-hop evidence is missing.

### OpenAI File Search

OpenAI's current file search pattern is explicit vector-store setup, then model-side `file_search` tool use through Responses. The docs emphasize semantic and keyword search over uploaded knowledge bases, metadata filtering, result limiting, explicit inclusion of search results, and file citations.

YURI implementation implication: YURI should expose retrieval evidence as an inspectable object, not invisible prompt stuffing. Memory recall should report selected store, filters, result count, scores where available, and whether the retrieval result was injected, summarized, or withheld.

### Anthropic / Claude

Claude's guidance reinforces high or xhigh effort for hard agentic work, explicit tool-use instructions, long-context prompt structure, and parallel tool calls when independent. It also cautions that long-context documents should be structured with metadata and placed before the query; ambiguity across multiple user turns reduces autonomy and performance.

YURI implementation implication: Shintai packet construction should place evidence before task instructions, include source metadata, state exact tool policy, and make every lane's role explicit. Claude Opus remains audit-only for this project because Codex/main owns implementation and mutation authority.

### Mem0

Mem0's useful design signals are scoped memory search, hybrid retrieval, metadata filters, graph augmentation, reranking, and event surfaces. The search docs emphasize user/agent/run scoping and filters to avoid cross-contamination; graph memory adds relationships in parallel to vector hits but does not automatically reorder vector results.

YURI implementation implication: introduce scope-aware memory queries and keep provenance attached. A memory result should carry `scope`, `originLane`, `sourcePath`, `timestamp`, `score`, `tags`, and optional graph relations. Do not let graph recall silently override vector recall; surface both.

### Letta

Letta separates always-visible memory blocks from external memory. Memory blocks are labeled, limited, structured context sections that can be shared across agents, while archival or conversation search handles larger history. Sleep-time agents run asynchronously and update memory blocks from conversation history or files.

YURI implementation implication: split YURI memory into pinned blocks and retrieved archives:

- pinned blocks: Rick persona, Marcel interaction preferences, neurodivergence rail, active goal, current operating constraints;
- retrieved archives: session logs, Shintai artifacts, docs, code research, historical corrections;
- sleep-time analogue: EOT and neuron-loop propose memory changes, but promotion remains auditable.

### LangMem

LangMem's useful pattern is a small memory tool surface: manage memory, search memory, background memory extraction, and DB-backed persistence for production. It keeps memory operations explicit enough to debug while allowing agents to use them during the hot path.

YURI implementation implication: `memory-kernel.mjs` should become the only public memory contract. Rick, Shintai, EOT, and automation should call recall/proposal/promotion through it instead of inventing their own files.

### CrewAI

CrewAI's current agent docs separate roles, goals, tools, memory, knowledge sources, reasoning, execution limits, and safe code execution. It is useful as a vocabulary check: tools act, knowledge informs, skills shape behavior, memory persists state.

YURI implementation implication: preserve these boundaries. A YURI skill is not a tool call, and a retrieval hit is not a skill. The skill selector should explain why a skill was selected without injecting full skill bodies unless a lane actually needs one.

### NeMo Guardrails

NeMo remains the guardrail vocabulary source: input, retrieval, dialog, execution, output, tool, and observability rails. YURI is not adding `nemoguardrails` as a dependency in this wave; it is using deterministic local rails.

YURI implementation implication: every memory/RAG/skill recall path needs rail outputs: input parse, retrieval scope, execution denial, output evidence, and health preflight where dispatch is involved.

## YURI Architecture Decision

YURI should not chase one memory product. The durable architecture is a four-layer memory control plane:

1. **Pinned blocks**: tiny always-visible blocks for persona, active goal, neurodivergence activation, current rails, and operator preferences.
2. **Ledger memory**: append-only session and lane facts in YURI-owned state.
3. **Searchable archives**: indexed docs, Shintai artifacts, reports, and session summaries with explicit filters and provenance.
4. **Research-grade long memory**: MSA-style offline encoding and sparse routing as a future experiment, not current runtime dependency.

Skill recall becomes adjacent, not merged: the skill kernel selects instructions based on task capabilities, signals, provenance, and collision policy. It must not confuse migrated duplicate roots with invalid skills.

## Patch Requirements From Research

- Gate 0 must load this research artifact before Shintai dispatch for memory/RAG/skill work.
- `memory-kernel.mjs` must expose evidence inventory, recall, proposal, promotion, ledger, and protected-surface denial as inspectable contracts.
- `yuri-skill-loader.mjs` must provide body-free skill recommendations with reasons, stage bindings, and capability indexes.
- `skills/` must be treated as canonical when duplicate migrated or provider-imported skills exist.
- The neurodivergence rail must be mechanical: repeated correction, messy input, high-stakes orchestration, and visual/design prompts must activate named behaviors.
- Shintai dispatch for this task must assemble the memory/RAG council: Codex, DeepSeek, Claude Opus audit, Nemotron, Qwen 397B, Mistral Large, GPT-OSS 120B, GLM, and Qwen Coder when healthy.

## Non-Goals

- Do not install Mem0, Letta, LangMem, CrewAI, or MSA as dependencies in this wave.
- Do not move protected Claude, backend, or environment data.
- Do not claim sentience as a product feature. Implement better coordination, memory, recall, and correction loops.
- Do not auto-promote memory from Shintai outputs without Codex/main arbitration and a reviewable proposal.
