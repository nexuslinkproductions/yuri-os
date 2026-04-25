import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

function isWithinRoot(root: string, candidate: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function locateRepoRoot(): string {
    const envRoot = process.env.NUDIMMUD_ROOT || process.env.SYSTEM_ROOT;
    if (envRoot) {
        const resolvedEnvRoot = path.resolve(envRoot);
        console.log(`⬡ SYSTEM_CONFIG :: REPO_ROOT_RESOLVED (via ENV): \${resolvedEnvRoot}`);
        return resolvedEnvRoot;
    }

    const anchors = [process.cwd(), __dirname];
    for (const anchor of anchors) {
        let current = path.resolve(anchor);
        while (true) {
            if (
                fs.existsSync(path.join(current, 'backend', 'package.json')) &&
                fs.existsSync(path.join(current, '_SYSTEM'))
            ) {
                return current;
            }

            const parent = path.dirname(current);
            if (parent === current) break;
            current = parent;
        }
    }

    const finalRoot = path.resolve(process.cwd());
    console.log(`⬡ SYSTEM_CONFIG :: REPO_ROOT_RESOLVED: \${finalRoot}`);
    return finalRoot;
}

/**
 * ⬡ SYSTEM_CORE_CONFIG
 * The central authority for system paths and ecosystem bifurcation.
 */
export const SystemConfig = {
    // Determine the current root based on environment or execution path
    ROOT: locateRepoRoot(),
    
    // Ecosystem A: System Assets
    SYSTEM: {
        BACKEND: 'backend',
        DATA: 'backend/data',
        LOGS: 'backend/data/logs',
        DB: 'backend/data/nudimmud.db'
    },

    // Ecosystem B: Knowledge Vaults (Obsidian)
    VAULTS: {
        PRIMARY: '06_KNOWLEDGE-BASE',
        CLAUDIO: '06_NETWORK-SYNC/C2MOVIEZ',
        STRUCTURE: {
            COSMOLOGY: '06_KNOWLEDGE-BASE/01_COSMOLOGY',
            OPERATIONAL: '06_KNOWLEDGE-BASE/05_OPERATIONAL',
            RESEARCH: 'RESEARCH'
        }
    },

    /**
     * Resolve a relative path to the current system root
     */
    resolve(subPath: string): string {
        const resolved = path.isAbsolute(subPath)
            ? path.resolve(subPath)
            : path.resolve(this.ROOT, subPath);

        console.log('⬡ SYSTEM_CONFIG :: RESOLVE:', subPath, '->', resolved, '(ROOT:', this.ROOT, ')');

        if (!isWithinRoot(this.ROOT, resolved)) {
            throw new Error(`ACCESS_DENIED: ${subPath} (resolved: ${resolved}, root: ${this.ROOT})`);
        }

        return resolved;
    },

    /**
     * Diagnostic: Check if we are in "SSD_MODE" or "LOCAL_MODE"
     */
    getMode(): 'SSD' | 'LOCAL' {
        return this.ROOT.startsWith('/Volumes/') ? 'SSD' : 'LOCAL';
    }
};

export default SystemConfig;
