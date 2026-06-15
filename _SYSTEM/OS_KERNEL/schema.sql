-- SCHEMA OWNERSHIP (wave-2 M.12): this schema is owned by memory_governor.py.
-- lane-memory.mjs co-tenants the SAME DB file via its own lane_findings family
-- (bootstrapped by lane-memory.mjs ensureSchema / lane-memory-migrate.mjs).
-- There are NO foreign-key relationships between the two schema families;
-- write contention is managed via WAL + busy_timeout. The two processes do not
-- know about each other's tables.

-- Agents: Definition of the Conclave members and their states
CREATE TABLE IF NOT EXISTS agents (
    agent_id TEXT PRIMARY KEY, -- ENLIL, NABU, ENKI, INANNA
    role TEXT,
    base_model TEXT,
    status TEXT DEFAULT 'IDLE', -- IDLE, THINKING, ACTING, ERROR
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tasks: The "Process Table" of the OS
CREATE TABLE IF NOT EXISTS tasks (
    task_id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    description TEXT,
    priority INTEGER DEFAULT 1,
    assigned_to TEXT,
    status TEXT DEFAULT 'PENDING', -- PENDING, RUNNING, COMPLETED, FAILED
    result TEXT,
    metadata_json TEXT, -- Dependencies, requirements
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(assigned_to) REFERENCES agents(agent_id),
    FOREIGN KEY(parent_id) REFERENCES tasks(task_id)
);

-- Unified Memory: Episodic (logs) and Semantic (facts)
CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT, -- 'episodic', 'semantic', 'workflow'
    content TEXT,
    source_agent TEXT,
    tags TEXT, -- JSON array: ["git", "security", "refactor"]
    importance INTEGER DEFAULT 1,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(source_agent) REFERENCES agents(agent_id)
);

-- Governed Memory: canonical lifecycle store for Yuri memory/RAG surfaces.
-- Existing `memories` stays as a compatibility append log; these tables own
-- lifecycle, trust, structure, retention, and retrieval governance.
CREATE TABLE IF NOT EXISTS memory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    legacy_memory_id INTEGER,
    content TEXT NOT NULL,
    canonical_summary TEXT,
    memory_type TEXT NOT NULL DEFAULT 'episodic',
    tier TEXT NOT NULL DEFAULT 'MTM',
    structure TEXT NOT NULL DEFAULT 'ledger',
    scope TEXT NOT NULL DEFAULT 'state',
    status TEXT NOT NULL DEFAULT 'active',
    source_agent TEXT,
    source_uri TEXT,
    source_kind TEXT NOT NULL DEFAULT 'kernel',
    tags TEXT NOT NULL DEFAULT '[]',
    trust_score REAL NOT NULL DEFAULT 0.5,
    confidence_score REAL NOT NULL DEFAULT 0.5,
    source_quality REAL NOT NULL DEFAULT 0.5,
    sensitivity TEXT NOT NULL DEFAULT 'internal',
    decay_score REAL NOT NULL DEFAULT 0.5,
    importance INTEGER NOT NULL DEFAULT 1,
    use_count INTEGER NOT NULL DEFAULT 0,
    content_hash TEXT NOT NULL UNIQUE,
    rag_source_path TEXT,
    rag_node_id INTEGER,
    archive_path TEXT,
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at DATETIME,
    expires_at DATETIME,
    FOREIGN KEY(legacy_memory_id) REFERENCES memories(id),
    FOREIGN KEY(source_agent) REFERENCES agents(agent_id)
);

CREATE TABLE IF NOT EXISTS memory_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER,
    event_type TEXT NOT NULL,
    operation TEXT NOT NULL,
    actor TEXT,
    outcome TEXT NOT NULL DEFAULT 'ok',
    utility_score REAL,
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(item_id) REFERENCES memory_items(id)
);

CREATE TABLE IF NOT EXISTS memory_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_item_id INTEGER NOT NULL,
    target_item_id INTEGER NOT NULL,
    relation_type TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(source_item_id) REFERENCES memory_items(id),
    FOREIGN KEY(target_item_id) REFERENCES memory_items(id),
    UNIQUE(source_item_id, target_item_id, relation_type)
);

CREATE TABLE IF NOT EXISTS memory_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER,
    event_id INTEGER,
    operation TEXT NOT NULL,
    outcome TEXT NOT NULL,
    utility_label TEXT,
    utility_score REAL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(item_id) REFERENCES memory_items(id),
    FOREIGN KEY(event_id) REFERENCES memory_events(id)
);

CREATE TABLE IF NOT EXISTS memory_research_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    publication_date TEXT,
    evidence_grade TEXT NOT NULL,
    venue TEXT,
    checked_at DATETIME,
    relevance_score REAL NOT NULL DEFAULT 0.5,
    implementation_impact TEXT,
    status TEXT NOT NULL DEFAULT 'watching',
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memory_consolidation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    items_scanned INTEGER NOT NULL DEFAULT 0,
    promoted INTEGER NOT NULL DEFAULT 0,
    demoted INTEGER NOT NULL DEFAULT 0,
    tombstoned INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    duplicates_merged INTEGER NOT NULL DEFAULT 0,
    summary_json TEXT,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_memory_items_status ON memory_items(status);
CREATE INDEX IF NOT EXISTS idx_memory_items_tier ON memory_items(tier);
CREATE INDEX IF NOT EXISTS idx_memory_items_type ON memory_items(memory_type);
CREATE INDEX IF NOT EXISTS idx_memory_items_scope ON memory_items(scope);
CREATE INDEX IF NOT EXISTS idx_memory_items_hash ON memory_items(content_hash);
CREATE INDEX IF NOT EXISTS idx_memory_items_rag_source ON memory_items(rag_source_path);
CREATE INDEX IF NOT EXISTS idx_memory_items_last_accessed ON memory_items(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_memory_events_item ON memory_events(item_id);
CREATE INDEX IF NOT EXISTS idx_memory_events_operation ON memory_events(operation);
CREATE INDEX IF NOT EXISTS idx_memory_relations_source ON memory_relations(source_item_id);
CREATE INDEX IF NOT EXISTS idx_memory_relations_target ON memory_relations(target_item_id);
CREATE INDEX IF NOT EXISTS idx_memory_feedback_item ON memory_feedback(item_id);
CREATE INDEX IF NOT EXISTS idx_memory_research_checked ON memory_research_sources(checked_at);
CREATE INDEX IF NOT EXISTS idx_memory_consolidation_cycle ON memory_consolidation_runs(cycle);

-- Context Switches: Tracking the "Handover" between agents
CREATE TABLE IF NOT EXISTS context_switches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    from_agent TEXT,
    to_agent TEXT,
    handoff_note TEXT,
    snapshot_path TEXT, -- Path to a JSON context file in /tmp
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(task_id) REFERENCES tasks(task_id)
);

-- Initialize the Conclave Members
INSERT OR IGNORE INTO agents (agent_id, role, base_model) VALUES 
('ENLIL', 'High Architect', 'Claude 3.5 Sonnet'),
('NABU', 'Divine Scribe', 'DeepSeek-V3.2'),
('ENKI', 'Great Craftsman', 'Qwen-3.5-72B'),
('INANNA', 'Radiant Guardian', 'Gemini 3.1 Pro'),
('OPENCLAW', 'Channel-Native Execution Lane', 'deepseek/deepseek-v4-flash');
