import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { SystemConfig } from '../config/SystemConfig';

const rawDbPath = process.env.NUDIMMUD_DB_PATH;
const DB_PATH = rawDbPath === ':memory:'
    ? ':memory:'
    : rawDbPath
        ? SystemConfig.resolve(rawDbPath)
        : SystemConfig.resolve(SystemConfig.SYSTEM.DB);
const DB_DIR: string | null = DB_PATH !== ':memory:' ? path.dirname(DB_PATH) : null;
const LATEST_SCHEMA_VERSION = 1;

// Lazily initialize the database to prevent top-level crashes during module import
let dbInstance: Database.Database | null = null;

function getDB(): Database.Database {
    if (!dbInstance) {
        console.log(`⬡ DATABASE :: ATTEMPTING_CONNECTION_AT: ${DB_PATH}`);
        if (DB_DIR && !fs.existsSync(DB_DIR)) {
            console.log(`⬡ DATABASE :: CREATING_DIRECTORY: ${DB_DIR}`);
            fs.mkdirSync(DB_DIR, { recursive: true });
        }
        dbInstance = new Database(DB_PATH, { timeout: 10000 }); // Increase timeout for slow disks
        dbInstance.pragma('journal_mode = WAL');
        dbInstance.pragma('foreign_keys = ON');
        dbInstance.pragma('busy_timeout = 10000');
    }
    return dbInstance;
}

/**
 * NUDIMMUD KNOWLEDGE SCHEMA
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS deities (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    role        TEXT NOT NULL,
    domain      TEXT NOT NULL,
    status      TEXT DEFAULT 'ACTIVE',
    sephira     TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    layer       TEXT NOT NULL,
    domain      TEXT NOT NULL,
    role        TEXT,
    learning_cycles INTEGER DEFAULT 0,
    command         TEXT,
    status          TEXT DEFAULT 'IDLE',
    last_pulse      TEXT,
    deity_id        INTEGER REFERENCES deities(id),
    parent_agent_id INTEGER REFERENCES agents(id),
    current_op      TEXT,
    current_state   TEXT DEFAULT 'NIGREDO',
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ref         TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    status      TEXT DEFAULT 'ACTIVE',
    priority    INTEGER DEFAULT 5,
    description TEXT,
    context     TEXT,
    owner_deity TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    status      TEXT DEFAULT 'PENDING',
    assigned_to TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_nodes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    source_path TEXT UNIQUE,
    node_type   TEXT DEFAULT 'DOCUMENT',
    tags        TEXT,
    domain      TEXT,
    embedding   TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id   INTEGER NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    target_id   INTEGER NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    link_type   TEXT DEFAULT 'WIKILINK',
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(source_id, target_id)
);

CREATE TABLE IF NOT EXISTS event_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type  TEXT NOT NULL,
    source      TEXT,
    message     TEXT NOT NULL,
    metadata    TEXT,
    severity    TEXT DEFAULT 'INFO',
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS telemetry (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    stage               TEXT DEFAULT 'RUBEDO',
    neural_density      REAL DEFAULT 0,
    swarm_sync          REAL DEFAULT 0,
    ingestion_pressure  REAL DEFAULT 0,
    seal_stability      REAL DEFAULT 0,
    logic_throughput    REAL DEFAULT 0,
    active_agent_count  INTEGER DEFAULT 0,
    recorded_at         TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calendar_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    start_time  TEXT NOT NULL,
    end_time    TEXT,
    event_type  TEXT DEFAULT 'MEETING',
    status      TEXT DEFAULT 'CONFIRMED',
    project_id  INTEGER REFERENCES projects(id),
    metadata    TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tickets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE,
    title       TEXT NOT NULL,
    status      TEXT DEFAULT 'TODO',
    priority    TEXT DEFAULT 'MEDIUM',
    assigned_to TEXT,
    client      TEXT,
    project_id  INTEGER REFERENCES projects(id),
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS temporal_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id     TEXT UNIQUE,
    title           TEXT NOT NULL,
    start_time      TEXT NOT NULL,
    end_time        TEXT,
    strategic_summary TEXT,
    importance_score INTEGER DEFAULT 5,
    participants    TEXT,
    project_refs    TEXT,
    sync_status     TEXT DEFAULT 'SYNCED',
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS temporal_edges (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id       INTEGER NOT NULL REFERENCES temporal_events(id) ON DELETE CASCADE,
    target_id       INTEGER NOT NULL,
    target_type     TEXT NOT NULL,
    edge_type       TEXT NOT NULL,
    weight          REAL DEFAULT 1.0,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integrations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    status      TEXT DEFAULT 'DISCONNECTED',
    last_sync   TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS swarm_messages (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_task_id    INTEGER REFERENCES project_tasks(id),
    sender_agent_id   INTEGER REFERENCES agents(id),
    receiver_agent_id INTEGER REFERENCES agents(id),
    content           TEXT NOT NULL,
    message_type      TEXT NOT NULL,
    compute_cost      REAL DEFAULT 0,
    created_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cognitive_states (
    id          TEXT PRIMARY KEY,
    sessionId   TEXT NOT NULL,
    state_data  TEXT NOT NULL,
    node_name   TEXT NOT NULL,
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS telemetry_sessions (
    session_id          TEXT PRIMARY KEY,
    start_time          INTEGER NOT NULL,
    end_time            INTEGER,
    tokens_estimated    INTEGER DEFAULT 0,
    tools_loaded        INTEGER DEFAULT 0,
    status              TEXT DEFAULT 'ACTIVE',
    metadata            TEXT
);

CREATE TABLE IF NOT EXISTS core_memory (
    memory_key  TEXT PRIMARY KEY,
    memory_val  TEXT NOT NULL,
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS semantic_memory USING fts5(
    lesson_title, 
    lesson_content, 
    context_tags,
    tokenize='porter'
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_layer ON agents(layer);
CREATE INDEX IF NOT EXISTS idx_agents_domain ON agents(domain);
CREATE INDEX IF NOT EXISTS idx_agents_deity_id ON agents(deity_id);
CREATE INDEX IF NOT EXISTS idx_agents_parent_agent_id ON agents(parent_agent_id);

CREATE INDEX IF NOT EXISTS idx_projects_ref ON projects(ref);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_priority ON projects(priority);
CREATE INDEX IF NOT EXISTS idx_projects_owner_deity ON projects(owner_deity);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned_to ON project_tasks(assigned_to);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_title ON knowledge_nodes(title);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_domain ON knowledge_nodes(domain);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_node_type ON knowledge_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_tags ON knowledge_nodes(tags);

CREATE INDEX IF NOT EXISTS idx_event_log_event_type ON event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_source ON event_log(source);
CREATE INDEX IF NOT EXISTS idx_event_log_created_at ON event_log(created_at);
CREATE INDEX IF NOT EXISTS idx_event_log_severity ON event_log(severity);

CREATE INDEX IF NOT EXISTS idx_telemetry_recorded_at ON telemetry(recorded_at);

CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_project_id ON calendar_events(project_id);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_project_id ON tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_tickets_external_id ON tickets(external_id);

CREATE INDEX IF NOT EXISTS idx_temporal_events_start_time ON temporal_events(start_time);
CREATE INDEX IF NOT EXISTS idx_temporal_events_sync_status ON temporal_events(sync_status);
CREATE INDEX IF NOT EXISTS idx_temporal_events_external_id ON temporal_events(external_id);

CREATE INDEX IF NOT EXISTS idx_temporal_edges_source_id ON temporal_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_temporal_edges_target_id ON temporal_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_temporal_edges_edge_type ON temporal_edges(edge_type);

CREATE INDEX IF NOT EXISTS idx_integrations_name ON integrations(name);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status);

CREATE INDEX IF NOT EXISTS idx_swarm_messages_parent_task_id ON swarm_messages(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_swarm_messages_sender_agent_id ON swarm_messages(sender_agent_id);
CREATE INDEX IF NOT EXISTS idx_swarm_messages_receiver_agent_id ON swarm_messages(receiver_agent_id);
CREATE INDEX IF NOT EXISTS idx_swarm_messages_message_type ON swarm_messages(message_type);

CREATE INDEX IF NOT EXISTS idx_cognitive_states_sessionId ON cognitive_states(sessionId);
CREATE INDEX IF NOT EXISTS idx_cognitive_states_node_name ON cognitive_states(node_name);

CREATE INDEX IF NOT EXISTS idx_knowledge_links_source_id ON knowledge_links(source_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_target_id ON knowledge_links(target_id);
`;

function getUserVersion(db: Database.Database): number {
    return Number(db.pragma('user_version', { simple: true })) || 0;
}

function setUserVersion(db: Database.Database, version: number) {
    db.pragma(`user_version = ${version}`);
}

function tableExists(db: Database.Database, tableName: string): boolean {
    const row = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
    ).get(tableName) as { name?: string } | undefined;

    return Boolean(row?.name);
}

function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    return columns.some((column) => column.name === columnName);
}

function addColumnIfMissing(db: Database.Database, tableName: string, columnName: string, definition: string) {
    if (!columnExists(db, tableName, columnName)) {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
}

function runMigrations(db: Database.Database) {
    const currentVersion = getUserVersion(db);
    if (currentVersion >= LATEST_SCHEMA_VERSION) {
        return;
    }

    db.transaction(() => {
        addColumnIfMissing(db, 'agents', 'current_state', "TEXT DEFAULT 'NIGREDO'");
        addColumnIfMissing(db, 'knowledge_nodes', 'embedding', 'TEXT');
        addColumnIfMissing(db, 'agents', 'parent_agent_id', 'INTEGER REFERENCES agents(id)');
        addColumnIfMissing(db, 'tickets', 'client', 'TEXT');

        if (!tableExists(db, 'cognitive_states')) {
            db.exec(`
                CREATE TABLE cognitive_states (
                    id          TEXT PRIMARY KEY,
                    sessionId   TEXT NOT NULL,
                    state_data  TEXT NOT NULL,
                    node_name   TEXT NOT NULL,
                    updated_at  TEXT DEFAULT (datetime('now'))
                );
                CREATE INDEX idx_cognitive_states_sessionId ON cognitive_states(sessionId);
                CREATE INDEX idx_cognitive_states_node_name ON cognitive_states(node_name);
            `);
        }

        if (!tableExists(db, 'telemetry_sessions')) {
            db.exec(`
                CREATE TABLE telemetry_sessions (
                    session_id          TEXT PRIMARY KEY,
                    start_time          INTEGER NOT NULL,
                    end_time            INTEGER,
                    tokens_estimated    INTEGER DEFAULT 0,
                    tools_loaded        INTEGER DEFAULT 0,
                    status              TEXT DEFAULT 'ACTIVE',
                    metadata            TEXT
                );
            `);
        }

        setUserVersion(db, LATEST_SCHEMA_VERSION);
    })();
}

function validateSchema(db: Database.Database) {
    const requiredTables = [
        'agents',
        'projects',
        'knowledge_nodes',
        'knowledge_links',
        'event_log',
        'integrations',
        'cognitive_states',
        'telemetry_sessions'
    ];

    for (const tableName of requiredTables) {
        if (!tableExists(db, tableName)) {
            throw new Error(`DATABASE_SCHEMA_INVALID :: missing table ${tableName}`);
        }
    }

    const requiredColumns: Array<[string, string]> = [
        ['agents', 'current_state'],
        ['agents', 'parent_agent_id'],
        ['knowledge_nodes', 'embedding'],
        ['tickets', 'client'],
        ['cognitive_states', 'state_data'],
        ['cognitive_states', 'node_name']
    ];

    for (const [tableName, columnName] of requiredColumns) {
        if (!columnExists(db, tableName, columnName)) {
            throw new Error(`DATABASE_SCHEMA_INVALID :: missing ${tableName}.${columnName}`);
        }
    }
}

export function initDatabase(): Database.Database {
    const db = getDB();
    try {
        db.exec(SCHEMA);
        runMigrations(db);
        const { runNotebookMigrations } = require('./notebookSchema');
        runNotebookMigrations(db);
        validateSchema(db);

        // Patch default values
        db.prepare("UPDATE agents SET role = 'Neural Unit' WHERE role IS NULL").run();
        db.prepare("UPDATE agents SET learning_cycles = 10 WHERE learning_cycles = 0").run();

        seedDatabase(db);
        console.log('⬡ ABZU_DATABASE_INITIALIZED :: nudimmud.db');
        return db;
    } catch (err: any) {
        console.error('⬡ DATABASE_INIT_ERROR ::', err.message);
        throw err;
    }
}

function seedDatabase(db: Database.Database) {
    const deityCount = (db.prepare('SELECT COUNT(*) as c FROM deities').get() as any).c;
    const temporalCount = (db.prepare('SELECT COUNT(*) as c FROM temporal_events').get() as any).c;
    const integrationCount = (db.prepare('SELECT COUNT(*) as c FROM integrations').get() as any).c;
    const projectCount = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c;
    const taskCount = (db.prepare('SELECT COUNT(*) as c FROM project_tasks').get() as any).c;

    const insertDeity = db.prepare(`INSERT INTO deities (name, role, domain, sephira) VALUES (?, ?, ?, ?)`);
    const insertAgent = db.prepare(`INSERT INTO agents (name, layer, domain, role, learning_cycles, command, status, parent_agent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertProject = db.prepare(`INSERT INTO projects (ref, name, status, priority, description, context, owner_deity) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const insertTask = db.prepare(`INSERT INTO project_tasks (project_id, title, status, assigned_to) VALUES (?, ?, ?, ?)`);
    const insertIntegration = db.prepare(`INSERT INTO integrations (name, status) VALUES (?, ?)`);
    const insertTemporal = db.prepare(`INSERT INTO temporal_events (title, start_time, strategic_summary, importance_score) VALUES (?, ?, ?, ?)`);

    db.transaction(() => {
        if (deityCount === 0) {
            insertDeity.run('ENKI', 'The Source / Strategic Decision', 'Top-level intent, constraints, active income pipelines', 'KETER');
            insertDeity.run('NABU', 'The Codifier / Empire Architect', 'Blueprint orchestration, scribe of written law, Tablet of Destinies', 'CHOKHMAH');
            insertDeity.run('NISABA', 'The Measurer / Deployment Goddess', 'Swarm deployment, evolution, distribution, quality, defense, idea-to-empire pipelines', 'BINAH');
            insertDeity.run('NOESIS', 'The Unconscious Linter', 'Memory health, contradiction detection, session correction distillation', 'CHESED');
            insertDeity.run('OBLITERATUS', 'The Adversarial Cortex', 'Red-teaming, security exploit discovery, zero-compliance QA', 'GEVURAH');

            const businessAgents = [
                ['CLAWDIIA', 'BUSINESS', 'Operations', 'Overseer of agenda, emails, and strategic tasks', 45, '/clawdia', 'SYNCING'],
                ['FLUX', 'BUSINESS', 'Finance', 'Financial orchestration and cash flow analyzer', 82, '/flux', 'ACTIVE'],
                ['ATLAS', 'BUSINESS', 'Projects', 'Tactical lead for engineering sprints and GitHub sync', 60, '/atlas', 'ACTIVE'],
                ['PULSE', 'BUSINESS', 'Community', 'Sentiment analysis and community engagement engine', 10, '/pulse', 'IDLE'],
                ['PIXEL', 'BUSINESS', 'Social Media', 'Content strategist and analytics aggregator', 15, '/pixel', 'IDLE'],
                ['SAGE', 'BUSINESS', 'Strategy', 'Strategic roadmap architect and OKR guardian', 55, '/sage', 'ACTIVE'],
                ['NEX', 'BUSINESS', 'Sales', 'Lead qualification and pipeline velocity specialist', 20, '/nex', 'IDLE'],
                ['MENTOR', 'BUSINESS', 'Courses', 'Educational pathfinder and module curator', 30, '/mentor', 'IDLE'],
                ['KAI', 'BUSINESS', 'Personal', 'Health and habit optimization daemon', 10, '/kai', 'IDLE'],
                ['ORACLE', 'BUSINESS', 'Strategic Entry', 'Strategic onboarding and high-level discovery', 90, '/oracle', 'ACTIVE'],
                ['MAKO', 'BUSINESS', 'Marketing', 'SEO and brand dominance architect', 25, '/mako', 'IDLE'],
                ['ARIA', 'BUSINESS', 'HR / People', 'Recruitment and team performance monitor', 12, '/aria', 'IDLE'],
                ['ZARA', 'BUSINESS', 'Customer Success', 'Client health and triage specialist', 18, '/zara', 'IDLE'],
                ['LEX', 'BUSINESS', 'Legal', 'Compliance and contract risk analyzer', 5, '/lex', 'IDLE'],
                ['NOVA', 'BUSINESS', 'Product', 'Product research and specification engine', 40, '/nova', 'IDLE'],
                ['DEX', 'BUSINESS', 'Data / BI', 'SQL architect and knowledge graph analyzer', 70, '/dex', 'ACTIVE'],
                ['LUMEN', 'BUSINESS', 'Learning Retention', 'Fact capture and spaced repetition specialist', 85, '/lumen-learning', 'IDLE'],
            ];
            for (const a of businessAgents) insertAgent.run(...a, null);

            const clawdiaId = (db.prepare("SELECT id FROM agents WHERE name = 'CLAWDIIA'").get() as any).id;
            const subAgents = [
                ['CHRONOS', 'BUSINESS', 'Time', 'Temporal anchor and schedule guardian', 65, '/chronos', 'ACTIVE', clawdiaId],
                ['LOGOS', 'BUSINESS', 'Communcation', 'Dialect translator and communication scribe', 40, '/logos', 'IDLE', clawdiaId],
                ['NOMOS', 'BUSINESS', 'Logic', 'Gatekeeper of tactical decisions and verification', 55, '/nomos', 'ACTIVE', clawdiaId],
            ];
            for (const a of subAgents) insertAgent.run(...a);
        }

        if (integrationCount === 0) {
            insertIntegration.run('EXEOFLOW', 'DISCONNECTED');
            insertIntegration.run('GITNEXUS_MCP', 'CONNECTED');
            insertIntegration.run('OUTLOOK_365', 'DISCONNECTED');
            insertIntegration.run('PLANE_SO', 'DISCONNECTED');
            insertIntegration.run('OBSIDIAN', 'OFFLINE');
        }

        if (temporalCount === 0) {
            const now = new Date();
            const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
            const dayAfter = new Date(now); dayAfter.setDate(dayAfter.getDate() + 2);

            insertTemporal.run('NUDIMMUD_BOOT_SEQUENCE', now.toISOString(), 'Initial engine ignition and neural layer stabilization across all domains.', 9);
            insertTemporal.run('ALBEDO_ENRICHMENT_PHASE', tomorrow.toISOString(), 'Systemic hardening of UI/UX telemetry and data-linkage protocols.', 8);
            insertTemporal.run('EVONEXUS_VESSEL_MANIFESTATION', dayAfter.toISOString(), 'Final integration of the 3D neural bridge with active command routines.', 10);
        }

        // Seed initial projects and tasks if none exist
        if (projectCount === 0 && taskCount === 0) {
            // Seed some initial projects
            insertProject.run(
                'OPENSPACE',
                'OpenSpace',
                'ACTIVE',
                8,
                'A collaborative workspace for inter-disciplinary projects and research',
                'Focus on AI-agent symbiosis and knowledge sharing',
                'ENKI'
            );
            
            insertProject.run(
                'EVONEXUS',
                'EvoNexus',
                'ACTIVE',
                9,
                'Evolutionary AI system development and deployment',
                'Next-generation artificial intelligence with emergent properties',
                'NABU'
            );
            
            insertProject.run(
                'COMMAND_CENTER',
                'NUDIMMUD Command Center',
                'ACTIVE',
                10,
                'Central nervous system for the NUDIMMUD ecosystem',
                'Monitoring, coordination, and strategic oversight of all subsystems',
                'ENKI'
            );

            // Get the project IDs for task assignment
            const openspaceId = db.prepare("SELECT id FROM projects WHERE ref = 'OPENSPACE'").get() as {id: number};
            const evonexusId = db.prepare("SELECT id FROM projects WHERE ref = 'EVONEXUS'").get() as {id: number};
            const commandCenterId = db.prepare("SELECT id FROM projects WHERE ref = 'COMMAND_CENTER'").get() as {id: number};

            // Get agent IDs for task assignment
            const atlasId = db.prepare("SELECT id FROM agents WHERE name = 'ATLAS'").get() as {id: number};
            const dexId = db.prepare("SELECT id FROM agents WHERE name = 'DEX'").get() as {id: number};
            const sageId = db.prepare("SELECT id FROM agents WHERE name = 'SAGE'").get() as {id: number};
            const chronosId = db.prepare("SELECT id FROM agents WHERE name = 'CHRONOS'").get() as {id: number};
            const logosId = db.prepare("SELECT id FROM agents WHERE name = 'LOGOS'").get() as {id: number};

            // Seed tasks for OpenSpace project
            insertTask.run(openspaceId.id, 'Design OpenSpace architecture', 'COMPLETE', atlasId.id);
            insertTask.run(openspaceId.id, 'Implement agent communication bridges', 'IN_PROGRESS', dexId.id);
            insertTask.run(openspaceId.id, 'Create knowledge sharing protocols', 'PENDING', sageId.id);
            insertTask.run(openspaceId.id, 'Deploy OpenSpace to production', 'PENDING', null);

            // Seed tasks for EvoNexus project
            insertTask.run(evonexusId.id, 'Define evolutionary algorithms', 'COMPLETE', sageId.id);
            insertTask.run(evonexusId.id, 'Implement neural network architectures', 'IN_PROGRESS', dexId.id);
            insertTask.run(evonexusId.id, 'Create fitness evaluation functions', 'PENDING', atlasId.id);
            insertTask.run(evonexusId.id, 'Deploy EvoNexus evolution engine', 'PENDING', null);

            // Seed tasks for Command Center project
            insertTask.run(commandCenterId.id, 'Setup monitoring and alerting systems', 'COMPLETE', chronosId.id);
            insertTask.run(commandCenterId.id, 'Implement API gateway and routing', 'IN_PROGRESS', dexId.id);
            insertTask.run(commandCenterId.id, 'Create web dashboard UI', 'PENDING', logosId.id);
            insertTask.run(commandCenterId.id, 'Deploy Command Center to cloud', 'PENDING', null);
        }
    })();
}

// Export the getter function if someone needs the raw DB instance
export { getDB };
