import chokidar from 'chokidar';
import path from 'path';
import Database from 'better-sqlite3';
import { logEvent } from '../models/queries';
import { runVaultIngestion, inferDomain } from './vaultIngestion';
import { liquidMemory } from './liquidMemoryService';
import { SystemConfig } from '../config/SystemConfig';

const VAULT_ROOT = SystemConfig.ROOT;
const WATCHER_DEBOUNCE_MS = 1500;

const WATCH_DIRS = [
    path.join(VAULT_ROOT, '06_KNOWLEDGE-BASE'),
    path.join(VAULT_ROOT, 'NISABA'),
    path.join(VAULT_ROOT, '01_PROJECTS'),
    path.join(VAULT_ROOT, '_SYSTEM'),
    path.join(VAULT_ROOT, 'NEURAL-NETWORK/evo-nexus/docs')
];

export type VaultWatcherController = {
    close: () => Promise<void>;
    isRunning: () => boolean;
    getStatus: () => {
        running: boolean;
        lastEvent: string | null;
        pendingRun: boolean;
    };
};

export function initVaultWatcher(db: Database.Database): VaultWatcherController {
    console.log(`⬡ VAULT_WATCHER_ONLINE :: Monitoring Knowledge Layers`);
    let running = true;
    let pendingRun: NodeJS.Timeout | null = null;
    let lastEvent: string | null = null;

    const watcher = chokidar.watch(WATCH_DIRS, {
        ignored: [
            /(^|[\/\\])\../, // ignore dotfiles
            '**/node_modules/**',
            '**/dist/**',
            '**/data/**',
            '**/graph/**',
            '**/.obsidian/**',
        ],
        persistent: true,
        ignoreInitial: true, // Only watch for changes after boot
        awaitWriteFinish: {
            stabilityThreshold: 2000,
            pollInterval: 100
        }
    });

    const scheduleIngestion = (reason: string, filePath: string) => {
        lastEvent = `${reason}:${path.basename(filePath)}`;
        if (pendingRun) clearTimeout(pendingRun);

        pendingRun = setTimeout(() => {
            pendingRun = null;
            void runVaultIngestion(db, `watcher:${reason}`).catch((error) => {
                console.error('⬡ VAULT_WATCHER_INGEST_ERROR ::', error);
            });
        }, WATCHER_DEBOUNCE_MS);
    };

    watcher
        .on('add', (filePath) => {
            if (filePath.endsWith('.md')) {
                const relativePath = path.relative(VAULT_ROOT, filePath);
                const domain = inferDomain(relativePath);
                
                console.log(`⬡ VAULT_EVENT :: NEW_FILE_DETECTED -> ${path.basename(filePath)} (${domain})`);
                
                liquidMemory.recordActivity(filePath, domain);
                scheduleIngestion('add', filePath);
                logEvent(db, 'SYSTEM', 'VAULT_WATCHER', `New knowledge node detected: ${path.basename(filePath)}`, 'INFO');
            }
        })
        .on('change', (filePath) => {
            if (filePath.endsWith('.md')) {
                const relativePath = path.relative(VAULT_ROOT, filePath);
                const domain = inferDomain(relativePath);

                console.log(`⬡ VAULT_EVENT :: FILE_MODIFIED -> ${path.basename(filePath)} (${domain})`);
                
                liquidMemory.recordActivity(filePath, domain);
                scheduleIngestion('change', filePath);
                logEvent(db, 'SYSTEM', 'VAULT_WATCHER', `Knowledge node updated: ${path.basename(filePath)}`, 'INFO');
            }
        })
        .on('unlink', (filePath) => {
            if (filePath.endsWith('.md')) {
                const relativePath = path.relative(VAULT_ROOT, filePath);
                console.log(`⬡ VAULT_EVENT :: FILE_REMOVED -> ${path.basename(filePath)}`);
                db.prepare('DELETE FROM knowledge_nodes WHERE source_path = ?').run(relativePath);
                logEvent(db, 'SYSTEM', 'VAULT_WATCHER', `Knowledge node removed: ${path.basename(filePath)}`, 'WARN');
            }
        })
        .on('error', (error) => {
            console.error('⬡ VAULT_WATCHER_ERROR ::', error);
        });

    return {
        async close() {
            running = false;
            if (pendingRun) {
                clearTimeout(pendingRun);
                pendingRun = null;
            }
            await watcher.close();
        },
        isRunning() {
            return running;
        },
        getStatus() {
            return {
                running,
                lastEvent,
                pendingRun: pendingRun !== null
            };
        }
    };
}
