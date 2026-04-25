import Database from 'better-sqlite3';
import axios from 'axios';
import { logEvent } from '../models/queries';
import dotenv from 'dotenv';

dotenv.config();

const EXEOFLOW_API_URL = process.env.EXEOFLOW_API_URL;
const EXEOFLOW_API_KEY = process.env.EXEOFLOW_API_KEY;

export interface TimeEntry {
    ticket_id: string;
    notes: string;
    time: string; // e.g. "1h 30m"
}

export function ensureTimeEntriesTable(db: Database.Database) {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS time_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT NOT NULL,
            notes TEXT,
            time_logged TEXT,
            synced_to_exeoflow INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `).run();
}

export async function logTimeEntry(db: Database.Database, entry: TimeEntry): Promise<{ success: boolean; exeoflow?: boolean; reason?: string }> {
    // 1. Always persist locally first (source of truth)
    db.prepare(`
        INSERT INTO time_entries (ticket_id, notes, time_logged, synced_to_exeoflow)
        VALUES (?, ?, ?, 0)
    `).run(entry.ticket_id, entry.notes, entry.time);

    logEvent(db, 'SYSTEM', 'TIME_TRACKER', `Time entry logged: ${entry.ticket_id} — ${entry.time}`, 'INFO');

    // 2. Attempt live ExeoFlow transmission if credentials are configured
    if (EXEOFLOW_API_URL && EXEOFLOW_API_KEY && EXEOFLOW_API_KEY !== 'your_exeoflow_api_key') {
        try {
            await axios.post(`${EXEOFLOW_API_URL}/api/time-entries`, {
                ticket_id: entry.ticket_id,
                notes: entry.notes,
                duration: entry.time,
                timestamp: new Date().toISOString(),
            }, {
                headers: {
                    'Authorization': `Bearer ${EXEOFLOW_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            // Mark as synced
            db.prepare(`UPDATE time_entries SET synced_to_exeoflow = 1 WHERE ticket_id = ? AND synced_to_exeoflow = 0`)
              .run(entry.ticket_id);

            logEvent(db, 'SYSTEM', 'EXEOFLOW_SYNC', `Time entry for ${entry.ticket_id} transmitted to ExeoFlow.`, 'INFO');
            return { success: true, exeoflow: true };

        } catch (err: any) {
            logEvent(db, 'SYSTEM', 'EXEOFLOW_SYNC', `ExeoFlow transmission failed: ${err.message}`, 'WARN');
            return { success: true, exeoflow: false, reason: 'ExeoFlow unreachable — stored locally.' };
        }
    }

    return { 
        success: true, 
        exeoflow: false, 
        reason: 'EXEOFLOW_API_KEY not configured in .env — stored locally only.' 
    };
}

export function getPendingTimeEntries(db: Database.Database): any[] {
    return db.prepare(`SELECT * FROM time_entries WHERE synced_to_exeoflow = 0 ORDER BY created_at DESC`).all();
}

export function getAllTimeEntries(db: Database.Database): any[] {
    return db.prepare(`SELECT * FROM time_entries ORDER BY created_at DESC`).all();
}
