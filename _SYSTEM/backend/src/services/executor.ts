import { spawn } from 'child_process';
import path from 'path';
import Database from 'better-sqlite3';
import { logEvent } from '../models/queries';
import { SystemConfig } from '../config/SystemConfig';
import { runVaultIngestion } from './vaultIngestion';
import { syncOutlookIcs } from './outlookIcs';
import { syncPlaneTickets } from './planeSync';

export type AllowedCommandKey =
    | 'GITNEXUS_ANALYZE'
    | 'PALACE_REBUILD'
    | 'VAULT_INGEST'
    | 'SYSTEM_UPDATE'
    | 'PLANE_SYNC'
    | 'OUTLOOK_SYNC'
    | 'OPEN_IMAGES_FOLDER';

type CommandExecutionResult = {
    stdout: string;
    stderr: string;
    exitCode: number;
};

type SpawnCommand = {
    kind: 'spawn';
    command: string;
    args: string[];
};

type HandlerCommand = {
    kind: 'handler';
    run: (db: Database.Database) => Promise<CommandExecutionResult>;
};

type AllowedCommand = SpawnCommand | HandlerCommand;

export const ALLOWED_COMMANDS: Record<AllowedCommandKey, { description: string }> = {
    GITNEXUS_ANALYZE: { description: 'Refresh the GitNexus index for this repository.' },
    PALACE_REBUILD: { description: 'Run the palace rebuild maintenance script.' },
    VAULT_INGEST: { description: 'Trigger a vault ingestion pass without shelling out.' },
    SYSTEM_UPDATE: { description: 'Pull the latest git changes from the configured remote.' },
    PLANE_SYNC: { description: 'Synchronize tickets from Plane.so.' },
    OUTLOOK_SYNC: { description: 'Synchronize calendar events from the Outlook ICS feed.' },
    OPEN_IMAGES_FOLDER: { description: 'Open the generated images folder in Finder.' }
};

const COMMAND_HANDLERS: Record<AllowedCommandKey, AllowedCommand> = {
    GITNEXUS_ANALYZE: { kind: 'spawn', command: 'npx', args: ['gitnexus', 'analyze'] },
    PALACE_REBUILD: { kind: 'spawn', command: 'python3', args: [SystemConfig.resolve('_SYSTEM/palace-rebuild.py')] },
    SYSTEM_UPDATE: { kind: 'spawn', command: 'git', args: ['pull'] },
    OPEN_IMAGES_FOLDER: { kind: 'spawn', command: 'open', args: [path.resolve(SystemConfig.ROOT, '..', 'GeneratedContent', 'images')] },
    VAULT_INGEST: {
        kind: 'handler',
        async run(db) {
            const result = await runVaultIngestion(db, 'executor:VAULT_INGEST');
            return {
                stdout: JSON.stringify(result),
                stderr: '',
                exitCode: result.failureRate > 10 ? 1 : 0
            };
        }
    },
    PLANE_SYNC: {
        kind: 'handler',
        async run() {
            const result = await syncPlaneTickets();
            return {
                stdout: JSON.stringify(result),
                stderr: '',
                exitCode: result.success ? 0 : 1
            };
        }
    },
    OUTLOOK_SYNC: {
        kind: 'handler',
        async run() {
            await syncOutlookIcs();
            return {
                stdout: 'Outlook sync completed.',
                stderr: '',
                exitCode: 0
            };
        }
    }
};

function runSpawnCommand(command: string, args: string[]): Promise<CommandExecutionResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: SystemConfig.ROOT,
            shell: false,
            env: process.env
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });

        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        child.on('error', reject);
        child.on('close', (code) => {
            const exitCode = code ?? 1;
            if (exitCode !== 0) {
                reject(new Error(stderr.trim() || `${command} exited with code ${exitCode}`));
                return;
            }

            resolve({ stdout, stderr, exitCode });
        });
    });
}

export function isAllowedCommandKey(value: string): value is AllowedCommandKey {
    return value in COMMAND_HANDLERS;
}

export async function executeCommand(
    db: Database.Database,
    commandKey: AllowedCommandKey,
    source: string = 'SYSTEM'
): Promise<CommandExecutionResult> {
    const selectedCommand = COMMAND_HANDLERS[commandKey];

    console.log(`⬡ EXECUTOR :: RUNNING -> ${commandKey}`);
    logEvent(db, 'SYSTEM', 'EXECUTOR', `Executing command key: ${commandKey} (${source})`, 'INFO');

    try {
        const result = selectedCommand.kind === 'spawn'
            ? await runSpawnCommand(selectedCommand.command, selectedCommand.args)
            : await selectedCommand.run(db);

        if (result.stderr) {
            console.error(`⬡ EXECUTOR_ERROR :: ${result.stderr}`);
            logEvent(db, 'SYSTEM', 'EXECUTOR', `Command warning (${commandKey}): ${result.stderr.slice(0, 200)}`, 'WARN');
        }

        return result;
    } catch (error: any) {
        console.error(`⬡ EXECUTOR_CRITICAL :: ${error.message}`);
        logEvent(db, 'SYSTEM', 'EXECUTOR', `Execution failed for ${commandKey}: ${error.message.slice(0, 200)}`, 'CRITICAL');
        throw error;
    }
}
