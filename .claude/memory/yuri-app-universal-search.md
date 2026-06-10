---
name: yuri-app-universal-search
description: In-app universal search (memories+corpus+code) over existing FTS5; VS Code multi-root is interim
metadata:
  type: project
  tier: semantic
  scope: all
  trig: ["in-app search", "universal search", "search everything", "vscode search", "find memory"]
  refs: ["[[yuri-app-tuning-cockpit]]", "[[self-file-format-markdown-canonical]]"]
---

GOAL: an in-app UNIVERSAL search surface (search everything — Track-B memories, the knowledge corpus, code, transcripts) from inside the YURI app, so the owner stops depending on VS Code search once the app runs.
BACKEND already exists: the FTS5 corpus (`_SYSTEM/OS_KERNEL/search-index.db`, ~38k docs, `ai search` / yuri-search-index.mjs). The app surfaces it + ADDS the Track-B auto-memory (currently walled OUT of the corpus by yuri-search-index.mjs EXCLUDE_SUBSTR `.claude/projects/` — "the memory/search wall"). Keep the two-track separation: auto-memory becomes SEARCHABLE but never auto-injected into other lanes.
INTERIM: `yuri-os.code-workspace` (repo root) adds the auto-memory dir as a 2nd VS Code root so Cmd+Shift+F finds it. VS Code search ≠ ai search; the in-app search is the real destination.
STATE: owner ask (2026-05-31); not built. Ties to plan M2 (Tauri app) + the format-research index-wiring.
SEE: [[yuri-app-tuning-cockpit]], [[self-file-format-markdown-canonical]]
