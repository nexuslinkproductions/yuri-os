import ical from 'node-ical';
import axios from 'axios';
import { getDB } from '../models/database';
import dotenv from 'dotenv';

dotenv.config();

const ICS_URL = process.env.OUTLOOK_ICS_URL;

export async function syncOutlookIcs() {
    if (!ICS_URL || ICS_URL === 'your_ics_link_here') {
        console.warn('⬡ ICS_SYNC_SKIP :: OUTLOOK_ICS_URL not configured in .env');
        return;
    }

    console.log('⬡ ICS_SYNC_START :: Fetching temporal vertices from Outlook...');

    try {
        const db = getDB();
        const response = await axios.get(ICS_URL);
        const data = ical.parseICS(response.data);

        const insertEvent = db.prepare(`
            INSERT INTO temporal_events (external_id, title, start_time, end_time, strategic_summary, importance_score)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(external_id) DO UPDATE SET
                title = excluded.title,
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                updated_at = datetime('now')
        `);

        db.transaction(() => {
            for (const k in data) {
                const event: any = data[k];
                if (event.type === 'VEVENT') {
                    const id = event.uid || k;
                    const title = event.summary || 'UNTITLED_EVENT';
                    const start = event.start ? (event.start as Date).toISOString() : new Date().toISOString();
                    const end = event.end ? (event.end as Date).toISOString() : null;
                    
                    // Basic importance logic: meetings with "STAKEHOLDER" or "PROJECT" in title are higher importance
                    const importance = /STAKEHOLDER|PROJECT|C2|EXEO/i.test(title) ? 8 : 5;

                    insertEvent.run(
                        id,
                        title,
                        start,
                        end,
                        event.description || null, // raw description as base for summary
                        importance
                    );
                }
            }
        })();

        console.log('⬡ ICS_SYNC_COMPLETE :: Temporal Graph updated.');
        
        // Log to Akashic Record
        db.prepare('INSERT INTO event_log (event_type, source, message) VALUES (?, ?, ?)')
          .run('SYSTEM', 'ICS_INGESTOR', `Successfully synced ${Object.keys(data).length} events from Outlook.`);

    } catch (error) {
        console.error('⬡ ICS_SYNC_ERROR :: Failed to ingest calendar:', (error as Error).message);
    }
}
