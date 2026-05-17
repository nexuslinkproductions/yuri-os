## CODEX TASK SPEC

**Goal:** Create two new memory pipeline scripts — memory-consolidate.mjs and memory-synthesize.mjs.

**Target files:**
- Scripts/memory-consolidate.mjs (create)
- Scripts/memory-synthesize.mjs (create)

**Rollback boundary:** git diff HEAD Scripts/memory-consolidate.mjs Scripts/memory-synthesize.mjs

**Prohibited:** Do not modify any existing scripts. Do not delete memory records — flag only.

Scripts/memory-consolidate.mjs (ESM):
- Open _SYSTEM/OS_KERNEL/semantic-memory.db with better-sqlite3 + sqlite-vec loaded
- ALTER TABLE memories ADD COLUMN IF NOT EXISTS contradiction_flag INTEGER DEFAULT 0 (use try/catch per column)
- ALTER TABLE memories ADD COLUMN IF NOT EXISTS merged_into INTEGER
- ALTER TABLE memories ADD COLUMN IF NOT EXISTS last_accessed TEXT
- ALTER TABLE memories ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0
- ALTER TABLE memories ADD COLUMN IF NOT EXISTS synthesis_parent TEXT
- Query all memories that don't have merged_into set (active memories only)
- For each pair where vec distance < 0.35: if same type AND description similarity > 0.6 (rough: shared word ratio): mark older merged_into=newer id. Else if same type but different body: set contradiction_flag=1 on both.
- Print: [memory-consolidate] consolidated=N contradictions=M
- Close db

Scripts/memory-synthesize.mjs (ESM):
- Open DB with better-sqlite3 + sqlite-vec
- Group active memories (no merged_into) by type
- Within each type group, find clusters: use a greedy approach — seed with first unassigned memory, add others within distance 0.5, cluster size >= 3
- For each qualifying cluster not already synthesized in last 7 days (check synthesis_parent overlap):
  - Build synthesis body: list member names + descriptions as bullet points
  - Generate embedding via Xenova/all-MiniLM-L6-v2
  - Insert into memories: name='SYNTHESIS: [first member name prefix]', type='synthesis', description='Auto-synthesized from N memories', synthesis_parent=comma-joined ids, body=bullet list, embedded_at=now
  - Insert embedding into mem_vss
- Print: [memory-synthesize] clusters_found=N syntheses_created=M
- Close db

Verify: node --check Scripts/memory-consolidate.mjs && node --check Scripts/memory-synthesize.mjs
