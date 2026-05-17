
import { obsidianRest } from './services/obsidianRestService';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function test() {
    console.log('Testing Obsidian connection...');
    const status = obsidianRest.getStatus();
    const isOnline = status.mode !== 'offline';
    console.log('Status:', isOnline ? `ONLINE (${status.mode})` : 'OFFLINE');

    try {
        const active = await obsidianRest.getActiveFile();
        console.log('Active File:', active?.path || status.workspaceActiveFile || 'none');
    } catch (e) {
        console.error('Error getting active file:', (e as any).message);
    }
}

test();
