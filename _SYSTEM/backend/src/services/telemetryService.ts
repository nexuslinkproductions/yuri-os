import { getDB } from '../models/database';

export interface SessionTelemetry {
    sessionId: string;
    startTime: number;
    endTime?: number;
    tokensEstimated: number;
    toolsLoaded: number;
    status: 'ACTIVE' | 'FINALIZED';
    metadata?: string;
}

export const telemetryService = {
    async initSession(session: SessionTelemetry) {
        const db = getDB();
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO telemetry_sessions (session_id, start_time, tokens_estimated, tools_loaded, status, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(session.sessionId, session.startTime, session.tokensEstimated, session.toolsLoaded, session.status, session.metadata);
    },

    async updateSession(sessionId: string, data: Partial<SessionTelemetry>) {
        const db = getDB();
        const fields = Object.keys(data).map(key => `${key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)} = ?`).join(', ');
        const values = Object.values(data);
        const stmt = db.prepare(`UPDATE telemetry_sessions SET ${fields} WHERE session_id = ?`);
        stmt.run(...values, sessionId);
    },

    async getStats() {
        const db = getDB();
        const total = db.prepare('SELECT COUNT(*) as count, SUM(tokens_estimated) as tokens FROM telemetry_sessions').get() as { count: number, tokens: number };
        const recent = db.prepare('SELECT session_id, tokens_estimated, status FROM telemetry_sessions ORDER BY start_time DESC LIMIT 10').all();
        
        return {
            totalSessions: total.count || 0,
            totalTokens: total.tokens || 0,
            recentSessions: recent.map((r: any) => ({
                id: r.session_id,
                info: `${r.tokens_estimated} tokens [${r.status}]`
            }))
        };
    },

    async getActiveSession() {
        const db = getDB();
        try {
            return db.prepare("SELECT session_id as sessionId, start_time as startTime, tokens_estimated as tokensEstimated, tools_loaded as toolsLoaded, status, metadata FROM telemetry_sessions WHERE status = 'ACTIVE' ORDER BY start_time DESC LIMIT 1").get() as SessionTelemetry | undefined;
        } catch (e) {
            return undefined;
        }
    }
};
