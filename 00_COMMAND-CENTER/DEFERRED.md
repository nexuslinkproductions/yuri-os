# DEFERRED ITEMS

**Last Updated:** 2026-04-24  
**Protocol:** Each item must have a reopen trigger — a specific condition that unlocks it. Do not reopen without the trigger.

---

## Active Deferrals

### PROJECT 4 — EvoNexus Vessel (Command Center UI)
**Blocked by:** No bandwidth for UI build; concept not fully locked
**Reopen when:** All current client projects reach delivery state AND 2 uninterrupted weeks available
**What's waiting:**
- Visual interface framework decision (Electron / Tauri / Web)
- Map of 38 agents + Pantheon to physical UI
- Interactive RAG/Graph traversal interface design

---

### gstack P0 — ML Prompt Injection Classifier
**Blocked by:** Separate session required; not part of current sprint
**Reopen when:** Dedicated gstack session is scheduled
**What's waiting:**
- DeBERTa-v3 classifier via Hugging Face
- Chrome DevTools MCP Integration (Chrome 146+)

---

### Desktop: CLAUDE DESIGN/ + YURI_RECOVERY/
**Blocked by:** Requires Marcel decision on contents
**Reopen when:** Marcel reviews and decides: merge, archive, or delete
**What's waiting:**
- `CLAUDE DESIGN/YURI/` — appears to be older vault copy (has full directory structure + `enki_state.md` etc.)
- `CLAUDE DESIGN/DOMAIN EXPANSION - INFINITE VOID/` — separate Claude setup/project
- `YURI_RECOVERY/backend/src/` — recovery code project

**Action options:**
1. If CLAUDE DESIGN/YURI/ is superseded → delete after confirming local YURI is more recent
2. If it has unique content → merge into main vault
3. YURI_RECOVERY/backend/ → move to `01_PROJECTS/` if still active, or archive

---

### .claude Consolidation (Symlink)
**Blocked by:** High-risk operation; requires step-by-step confirmation
**Reopen when:** Marcel explicitly says "do the .claude symlink now"
**What's waiting:**
- Backup `~/.claude/`
- Merge unique content → `YURI/.claude/`
- Replace `~/.claude/` with symlink
- Verify Claude Code loads

---

## Completed (reference)

| Item | Completed | Notes |
|------|-----------|-------|
| MIT RLM Paper archive + synthesis | 2026-04-24 | See `RESEARCH/papers/` + `06_KNOWLEDGE-BASE/05_OPERATIONAL/rlm-synthesis.md` |
| EvoNexus Integration Map | 2026-04-24 | At `_SYSTEM/EVONEXUS_INTEGRATION_MAP.md` |
| EvoNexus Fusion Protocol | 2026-04-24 | Appended to `_SYSTEM/EVONEXUS_PROTOCOLS.md` |
| Offload workflow Gemini lanes | 2026-04-24 | Updated `_SYSTEM/offload-workflow.md` |
| Image/Video Gen Protocol | 2026-04-24 | At `_SYSTEM/IMAGE-VIDEO-GEN-PROTOCOL.md` |
