---
name: memory-write-native-flow
description: Writing a Claude memory is now native — just Write the .md file; the wrapper is optional (block scoped 2026-06-02)
metadata: 
  node_type: memory
  type: feedback
  tier: semantic
  scope: all
  trig: 
    - write a memory
    - save to memory
    - remember this
    - memory wrapper
    - how do I write memory
  refs: 
    - "[[memory-architecture-map]]"
  originSessionId: 09506d5f-46d8-4a63-ab5c-e3dff49f4a16
---

RULE: Writing a Claude behavioral memory is native — Write the `<slug>.md` file directly into `~/.claude/projects/<id>/memory/` with v3 frontmatter. The protected-path Write/Edit deny was scoped down to volatile subdirs only (history/state/file-history/worktrees/transcripts) on 2026-06-02, so `memory/` is directly writable. Loading was always native (Claude Code reads MEMORY.md at session start; no hook needed).

WHEN: any time a behavioral memory is captured.

DO: Write the file directly with frontmatter (name · description · metadata.type [+ tier/scope/trig/refs]). MEMORY.md self-heals via a SessionStart reindex; run `node _SYSTEM/Scripts/claude-memory-write.mjs reindex` to refresh the index immediately if needed.

DONT: don't treat the 7-flag `claude-memory-write.mjs add` wrapper as mandatory — it's now optional (frontmatter validation / index repair only). Don't write into the still-blocked volatile subdirs.

WHY: the wrapper's flag-wall was YURI-imposed friction layered on top of an already-native capability; the only real requirement is keeping MEMORY.md in sync. Marcel, 2026-06-02: "way too complicated... I want a clean setup."

SEE: _SYSTEM/MEMORY_ARCHITECTURE.md
