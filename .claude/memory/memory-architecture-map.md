---
name: memory-architecture-map
description: Canonical memory map (2 tracks + 3 DBs + subconscious) lives at _SYSTEM/MEMORY_ARCHITECTURE.md
metadata:
  type: reference
  scope: all
  trig: ["memory architecture", "where do memories go", "memory.db", "subconscious", "cold store", "confused about memory", "how does memory work"]
  refs: ["[[subconscious-memory-build]]", "[[two-track-rule]]", "[[reference-memory-format-research]]"]
---

FACTS:
- Track B (native Claude behavioral memory) = ~/.claude/projects/<id>/memory/*.md, written ONLY via _SYSTEM/Scripts/claude-memory-write.mjs; MEMORY.md index auto-loads every session start. 109 files, healthy.
- Track A (YURI canonical) = _SYSTEM/OS_KERNEL/memory.db via memory-kernel.mjs (propose->decide->ledger). Live layer = memory_items; 'memories' table stale since May 14.
- Subconscious = _SYSTEM/OS_KERNEL/memory-cold.db (FTS5/BM25 cold_docs+cold_meta). ARMED+wired (consolidator L6 >30d demote, yuri-recall cue-recall in user-prompt-submit.js) but row count=0 AND mis-wired: DEFAULT_MEMORY_ROOT=_SYSTEM/memory (legacy), NOT Track B, so Claude memories never reach it yet.
- 3 DBs not to confuse: memory.db (181M, ~95% token_ledger telemetry NOT memory), memory-cold.db (32K subconscious), search-index.db (400M doc corpus for 'ai search').
- Dead-not-cleared: memory.db semantic_memory/knowledge_nodes/core_memory all 0 rows (abandoned RAG+portable-identity experiment). This FTS5 is NOT the subconscious FTS5.
IMPLICATION: telemetry != Claude notes; two different FTS5 systems (dead in memory.db vs live cold store); both memory stores gitignored = no off-disk backup; 'Mike gets my memories' is unbuilt not broken.
SEE: _SYSTEM/MEMORY_ARCHITECTURE.md (full verified map, 2026-06-02).
