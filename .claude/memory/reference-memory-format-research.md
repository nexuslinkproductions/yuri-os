---
name: reference-memory-format-research
description: 2026 SOTA memory research synthesis — SimpleMem, Memori, Mem0, three-tier, semantic triples
metadata:
  type: reference
  tier: semantic
  scope: all
  trig: ["memory", "format", "compression", "research", "arxiv", "simplemem", "memori", "mem0", "three-tier"]
  refs: ["[[fb-two-track-rule]]"]
---

FACTS

(2026-sota-pattern, name, three-tier-memory-architecture)
(three-tier, layers, [working, episodic, semantic])
(working-memory, role, "session-resident, max-density, scanned-every-session-start")
(episodic-memory, role, "recent-specifics, time-bound, loaded-by-context-match")
(semantic-memory, role, "durable-abstractions, loaded-on-rule-pattern-match")

(simplemem, arxiv, "2601.02553")
(simplemem, contribution, "3-stage: semantic-structured-compression → online-semantic-synthesis → intent-aware-retrieval-planning")
(simplemem, result, "26.4% F1 gain, 30x token reduction")

(memori, arxiv, "2603.19935")
(memori, contribution, "semantic-triple compression of chat into structured representations")
(memori, result, "1294 tokens/query at 81.95% LoCoMo accuracy, 67% fewer tokens than competitors, 20x vs full-context")

(mem0, status, "production-system-2026")
(mem0, baseline-comparison, "1800 tok/conv at 66.9% vs 26000 tok full-context at 72.9%")
(mem0, finding, "under 6 points accuracy for 14x token cost — full-context is rarely worth it")

(llmlingua, arxiv, "2310.05736")
(llmlingua, mechanism, "self-information scoring: drop tokens with low -log P(token|context)")
(llmlingua, finding, "compress reasoning 60-80%, compress instructions ≤20%")

(longllmlingua, arxiv, "2310.06839")
(longllmlingua, scope, "long-context prompt compression with budget controller")

(selective-context, paper, "EMNLP-2023")
(selective-context, finding, "drop reconstructable-from-general-knowledge, preserve session-unique")

(h2o-mit, paper, "NeurIPS-2023")
(h2o-mit, finding, "first+last tokens are attention sinks, front-loading matters; preserve last-correction + last-file-state")

(function-tokens, arxiv, "2510.08203")
(function-tokens, finding, "special tokens govern attention at retrieval; stable handles enable function-token-like behavior")

(magma, arxiv, "2601.03236")
(magma, contribution, "multi-graph agentic memory architecture, relationships as graph edges")

(hippocampus, arxiv, "2602.13594")
(hippocampus, contribution, "efficient scalable memory module introducing three-tier split")

(multi-layer-memory-framework, arxiv, "2603.29194")
(multi-layer-memory-framework, layers, [working, episodic, semantic])
(multi-layer-memory-framework, result, "0.618 F1, 5.1% false-memory rate, 58.4% context usage")

(memory-for-autonomous-llm-agents, arxiv, "2603.07670")
(memory-for-autonomous-llm-agents, formalization, "write → manage → read loop, 5 mechanism families")

(memagents-workshop, venue, "ICLR-2026")
(memagents-workshop, status, "memory is first-class architectural primitive with benchmark suite")

(yuri-auto-memory-v3, adopts, [stable-handles, semantic-triples-for-refs, RULE-WHEN-DO-labeled-bodies, frontmatter-trig-array, tier-tag, pipe-KV-index])
(yuri-auto-memory-v3, defers, ["--query intent retrieval until entry count >100", "physical tier directories until >300"])
(yuri-auto-memory-v3, rejects, "vector store + reranker for single-operator scale — overkill")

IMPLICATION

V3 format captures the 2026 SOTA insights at single-operator scale: stable handles for function-token-like recall (Memori, function-tokens), semantic triples for reference entries (Memori), RULE/WHEN/DO front-loading for rule entries (LLMLingua attention sinks), frontmatter trig array for intent-matching (SimpleMem intent-aware retrieval). Three-tier physical split deferred until entry count justifies the infrastructure (Hippocampus, Multi-Layer Memory Framework). Vector store + reranker explicitly rejected as production-scale overkill for one operator.

SEE  FB:TWO-TRACK-RULE · skills/compact-optimizer/SKILL.md · _SYSTEM/yuri-origin.md
