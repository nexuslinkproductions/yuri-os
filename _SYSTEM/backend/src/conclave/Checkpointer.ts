import { Database } from 'better-sqlite3';
import { CognitiveState } from './types';

/**
 * ⬡ CONCLAVE_CHECKPOINTER ⬡
 * SQLite-backed durable persistence for Cognitive State.
 */
export class Checkpointer {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
        this.initializeTable();
    }

    private initializeTable() {
        // Drop existing if it has wrong schema (id as INTEGER)
        const info = this.db.prepare("PRAGMA table_info(cognitive_states)").all() as any[];
        const idType = info.find(c => c.name === 'id')?.type;
        
        if (idType === 'INTEGER') {
            console.log('⬡ CHECKPOINTER :: MIGRATING_TABLE (id INTEGER -> TEXT)');
            this.db.prepare('DROP TABLE cognitive_states').run();
        }

        this.db.prepare(`
            CREATE TABLE IF NOT EXISTS cognitive_states (
                id          TEXT PRIMARY KEY,
                sessionId   TEXT NOT NULL,
                state_data  TEXT NOT NULL,
                node_name   TEXT NOT NULL,
                created_at  TEXT DEFAULT (datetime('now'))
            )
        `).run();
    }

    public async save(state: CognitiveState, nodeName: string): Promise<string> {
        const id = `cp_${state.sessionId}_${Date.now()}`;
        const blob = JSON.stringify(state);
        
        this.db.prepare(`
            INSERT INTO cognitive_states (id, sessionId, state_data, node_name)
            VALUES (?, ?, ?, ?)
        `).run(id, state.sessionId, blob, nodeName);
        
        console.log(`⬡ CHECKPOINT_SAVED :: Session [${state.sessionId}] at Node [${nodeName}]`);
        return id;
    }

    public async loadLatest(sessionId: string): Promise<CognitiveState | null> {
        const row = this.db.prepare(`
            SELECT state_data FROM cognitive_states 
            WHERE sessionId = ? 
            ORDER BY created_at DESC LIMIT 1
        `).get(sessionId) as any;
        
        return row ? JSON.parse(row.state_data) : null;
    }
}
