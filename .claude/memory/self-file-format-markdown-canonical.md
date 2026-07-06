---
name: self-file-format-markdown-canonical
description: Self-store stays markdown+YAML frontmatter (most token-efficient); win is a derived index not a denser format
metadata:
  type: feedback
  tier: semantic
  scope: all
  trig: ["format", "markdown", "html", "json", "store", "self-file", "how do you save", "token efficient"]
  refs: ["[[brain-inspired-memory-evolution]]", "[[reference-memory-format-research]]", "[[lessons-default-to-memory-write]]"]
---

RULE: Store my own memory + knowledge files as **Markdown + YAML frontmatter** — verified (2026 benchmarks) as the MOST token-efficient text format: 34-38% fewer tokens than JSON, ~10% under YAML; HTML/XML are the WORST (+80% tokens). Do NOT swap to HTML/JSON/binary for prose. The real efficiency lever is RETRIEVE-LESS via a derived, rebuildable SQLite index (FTS5 + graph + vector) over the markdown source-of-truth — NOT encode-denser. memory.db already holds the index tables (semantic_memory FTS5, knowledge_nodes/links, temporal_edges, lane_finding_embeddings); they are under-wired to the markdown store.
WHEN: choosing how to store my own self-use files, or asked "is markdown right vs HTML/denser for machine files?".
DO: markdown+YAML frontmatter as the canonical store (the draft IS the store — no draft/store divergence); derive a SQLite/FTS5 index keyed by content hash for top-k recall; render the always-loaded core to XML tags at LOAD time only (Claude is trained on XML tags) but never STORE XML; emit MEMORY.md as a table, not a bullet list.
DONT: store prose as JSON/HTML/binary (more tokens AND worse comprehension); compress persona/voice/SOUL content (the nuance IS the signal — least compressible); hand-edit the derived index (rebuild from .md).
WHY: owner asked whether markdown is right or HTML/denser is better — measured benchmarks say markdown wins for prose; his intuition is right about ARCHITECTURE (retrieve less) not FORMAT. The format is already ~90% optimal; the gap is wiring, not format.
SEE: [[brain-inspired-memory-evolution]], [[reference-memory-format-research]], [[lessons-default-to-memory-write]]
