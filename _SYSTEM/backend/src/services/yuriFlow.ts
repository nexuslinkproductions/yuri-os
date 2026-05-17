import Database from 'better-sqlite3';
import { logEvent } from '../models/queries';

export interface YuriFlowTimeEntry {
    ticket_id: string;
    notes: string;
    time: string;
}

export function ensureYuriFlowEntriesTable(db: Database.Database) {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS time_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT NOT NULL,
            notes TEXT,
            time_logged TEXT,
            synced_to_yuri_flow INTEGER DEFAULT 0,
            flow_status TEXT DEFAULT 'LOCAL_ONLY',
            created_at TEXT DEFAULT (datetime('now'))
        )
    `).run();

    const columns = new Set(
        (db.prepare('PRAGMA table_info(time_entries)').all() as Array<{ name: string }>)
            .map((column) => column.name)
    );

    if (!columns.has('synced_to_yuri_flow')) {
        db.prepare('ALTER TABLE time_entries ADD COLUMN synced_to_yuri_flow INTEGER DEFAULT 0').run();
    }

    if (!columns.has('flow_status')) {
        db.prepare("ALTER TABLE time_entries ADD COLUMN flow_status TEXT DEFAULT 'LOCAL_ONLY'").run();
    }
}

export async function logYuriFlowTimeEntry(
    db: Database.Database,
    entry: YuriFlowTimeEntry
): Promise<{ success: boolean; yuriFlow: boolean; stored: boolean; reason: string }> {
    db.prepare(`
        INSERT INTO time_entries (ticket_id, notes, time_logged, synced_to_yuri_flow, flow_status)
        VALUES (?, ?, ?, 0, 'LOCAL_ONLY')
    `).run(entry.ticket_id, entry.notes, entry.time);

    logEvent(db, 'SYSTEM', 'YURI_FLOW_TIME_ENTRY', `Time entry logged: ${entry.ticket_id} - ${entry.time}`, 'INFO');

    return {
        success: true,
        yuriFlow: true,
        stored: true,
        reason: 'Yuri Flow entry stored locally.'
    };
}

export function getPendingYuriFlowEntries(db: Database.Database): any[] {
    return db.prepare(`
        SELECT * FROM time_entries
        WHERE COALESCE(synced_to_yuri_flow, 0) = 0
        ORDER BY created_at DESC
    `).all();
}

export function getAllYuriFlowEntries(db: Database.Database): any[] {
    return db.prepare('SELECT * FROM time_entries ORDER BY created_at DESC').all();
}
