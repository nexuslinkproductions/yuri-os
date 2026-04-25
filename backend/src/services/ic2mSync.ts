import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { SystemConfig } from '../config/SystemConfig';
import { logEvent } from '../models/queries';

const IC2M_WORK_ITEMS_PATH = SystemConfig.resolve('iC2M/05 - Work Items');

/**
 * ⬡ IC2M_SYNC_SERVICE
 * Synchronizes work items from the iC2M Obsidian vault into the NUDIMMUD tickets table.
 */
export async function syncIc2mWorkItems(db: Database.Database) {
    if (!fs.existsSync(IC2M_WORK_ITEMS_PATH)) {
        console.warn(`⬡ IC2M_SYNC_SKIP :: Directory not found at ${IC2M_WORK_ITEMS_PATH}`);
        return;
    }

    console.log('⬡ IC2M_SYNC_START :: Parsing work items from iC2M vault...');

    const files = fs.readdirSync(IC2M_WORK_ITEMS_PATH).filter(f => f.endsWith('.md'));
    let totalSynced = 0;

    const upsertTicket = db.prepare(`
        INSERT OR REPLACE INTO tickets (external_id, title, status, priority, assigned_to, client, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    for (const file of files) {
        try {
            const filePath = path.join(IC2M_WORK_ITEMS_PATH, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            
            // Basic YAML frontmatter parser using regex
            const frontmatterMatch = content.match(/^---\s*([\s\S]*?)\s*---/);
            if (!frontmatterMatch) continue;

            const yamlStr = frontmatterMatch[1];
            const data: any = {};
            
            yamlStr.split('\n').forEach(line => {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const val = parts.slice(1).join(':').trim().replace(/^["']|["']$/g, '');
                    data[key] = val;
                }
            });

            if (!data.ticket) continue; // Must have an external ID

            const externalId = data.ticket;
            const title = data.title || path.basename(file, '.md');
            const client = data.client || 'UNKNOWN';
            const priority = (data.priority || 'MEDIUM').toUpperCase();
            const assignedTo = data.assigned_to || data.assignee || 'UNASSIGNED';
            const rawState = data.state || 'Todo';

            // Map iC2M states to NUDIMMUD normalized statuses
            const status = mapIc2mState(rawState);

            upsertTicket.run(
                externalId,
                title,
                status,
                priority,
                assignedTo,
                client
            );

            totalSynced++;
        } catch (err: any) {
            console.error(`⬡ IC2M_SYNC_ERROR :: Failed to parse ${file} :: ${err.message}`);
        }
    }

    console.log(`⬡ IC2M_SYNC_COMPLETE :: Synchronized ${totalSynced} work items.`);
    logEvent(db, 'SYSTEM', 'IC2M_SYNC', `Successfully synchronized ${totalSynced} work items from iC2M vault.`, 'INFO');
}

/**
 * Maps iC2M state nomenclature to system-wide canonical statuses.
 */
function mapIc2mState(state: string): string {
    const s = state.toLowerCase();
    
    if (s.includes('backlog')) return 'BACKLOG';
    if (s.includes('planning')) return 'PLANNING';
    if (s.includes('todo')) return 'TODO';
    if (s.includes('in progress') || s.includes('editing')) return 'IN_PROGRESS';
    if (s.includes('pending') || s.includes('review')) return 'REVIEW';
    if (s.includes('done') || s.includes('completed')) return 'DONE';
    
    return 'TODO';
}
