import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(__dirname, '../data/nudimmud.db');

async function setup() {
    console.log('⬡ TELEMETRY_INIT :: Setting up schema in ' + dbPath);
    
    if (!fs.existsSync(path.dirname(dbPath))) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }

    const db = new Database(dbPath);

    db.exec(`
        CREATE TABLE IF NOT EXISTS telemetry_sessions (
            session_id TEXT PRIMARY KEY,
            start_time INTEGER NOT NULL,
            end_time INTEGER,
            tokens_estimated INTEGER DEFAULT 0,
            tools_loaded INTEGER DEFAULT 0,
            status TEXT DEFAULT 'ACTIVE',
            metadata TEXT
        );

        CREATE TABLE IF NOT EXISTS telemetry_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            event_data TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (session_id) REFERENCES telemetry_sessions(session_id)
        );
    `);

    console.log('⬡ TELEMETRY_INIT :: Schema ready.');
    db.close();
}

setup().catch(console.error);
