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
('INANNA', 'Radiant Guardian', 'Gemini 3.1 Pro');
