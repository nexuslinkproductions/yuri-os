import axios from 'axios';
import { getDB } from '../models/database';
import { logEvent } from '../models/queries';
import dotenv from 'dotenv';

dotenv.config();

const PLANE_API_KEY = process.env.PLANE_API_KEY;
const PLANE_WORKSPACE_SLUG = process.env.PLANE_WORKSPACE_SLUG || 'c2moviez';
const PLANE_API_URL = 'https://api.plane.so/api/v1';

export async function syncPlaneTickets() {
    const db = getDB();

    if (!PLANE_API_KEY || PLANE_API_KEY === 'your_plane_api_key') {
        console.warn('⬡ PLANE_SYNC_SKIP :: PLANE_API_KEY not configured in .env');
        return { success: false, reason: 'Missing API Key' };
    }

    console.log('⬡ PLANE_SYNC_START :: Fetching active operations from Plane.so...');

    try {
        // 1. Fetch Projects from workspace
        const projectsRes = await axios.get(`${PLANE_API_URL}/workspaces/${PLANE_WORKSPACE_SLUG}/projects/`, {
            headers: { 'x-api-key': PLANE_API_KEY }
        });

        let totalTickets = 0;

        const insertTicket = db.prepare(`
            INSERT OR REPLACE INTO tickets (external_id, title, status, priority, assigned_to)
            VALUES (?, ?, ?, ?, ?)
        `);

        db.transaction(() => {
            // 2. Fetch issues for each project
            // Note: Normally we'd await these in a loop, but for a synchronous transaction block
            // we'll fetch them all first, then insert.
        })();

        // For real implementation, fetch issues concurrently
        for (const project of projectsRes.data.results) {
            const issuesRes = await axios.get(`${PLANE_API_URL}/workspaces/${PLANE_WORKSPACE_SLUG}/projects/${project.id}/issues/`, {
                headers: { 'x-api-key': PLANE_API_KEY }
            });

            db.transaction(() => {
                for (const issue of issuesRes.data.results) {
                    const statusName = issue.state_detail?.name || 'TODO';
                    const priority = (issue.priority || 'MEDIUM').toUpperCase();
                    const assignees = issue.assignees?.map((a: any) => a.display_name).join(', ') || 'UNASSIGNED';
                    
                    insertTicket.run(
                        `${project.identifier}-${issue.sequence_id}`, // external_id e.g. C2M-155
                        issue.name,
                        statusName,
                        priority,
                        assignees
                    );
                    totalTickets++;
                }
            })();
        }

        console.log(`⬡ PLANE_SYNC_COMPLETE :: Synchronized ${totalTickets} tickets.`);
        logEvent(db, 'SYSTEM', 'PLANE_SYNC', `Successfully synced ${totalTickets} tickets from Plane.so.`, 'INFO');
        
        return { success: true, count: totalTickets };
    } catch (error: any) {
        console.error('⬡ PLANE_SYNC_ERROR ::', error.message);
        logEvent(db, 'SYSTEM', 'PLANE_SYNC', `Plane sync failed: ${error.message}`, 'WARN');
        return { success: false, error: error.message };
    }
}
