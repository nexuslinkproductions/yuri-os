import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

function isTruthy(v: string | undefined): boolean {
    return v === '1' || v === 'true';
}

function isTestMode(): boolean {
    return isTruthy(process.env.YURI_TEST_MODE);
}

function ephemeralRoot(): string | null {
    if (!isTestMode()) return null;
    const raw = process.env.YURI_BACKEND_EPHEMERAL_ROOT;
    if (!raw || !String(raw).trim()) {
        throw new Error('YURI_BACKEND_EPHEMERAL_ROOT is required when YURI_TEST_MODE=1');
    }
    return path.resolve(String(raw).trim());
}

// Test mode must not load dotenv (no persistent .env / secrets surface).
if (!isTestMode()) {
    dotenv.config();
}

function isWithinRoot(root: string, candidate: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function locateRepoRoot(): string {
    const envRoot = process.env.YURI_ROOT || process.env.SYSTEM_ROOT;
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
                fs.existsSync(path.join(current, 'package.json')) &&
                fs.existsSync(path.join(current, '_SYSTEM', 'backend', 'package.json'))
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

const REPO_ROOT = locateRepoRoot();
const EPH_ROOT = (() => {
    try {
        return ephemeralRoot();
    } catch (e) {
        // Allow module import in non-test contexts; test-mode callers must set the env.
        if (isTestMode()) throw e;
        return null;
    }
})();

const PERSISTENT_SYSTEM = {
    BACKEND: '_SYSTEM/backend',
    DATA: '_SYSTEM/backend/data',
    LOGS: '_SYSTEM/backend/data/logs',
    DB: '_SYSTEM/backend/data/yuri.db'
} as const;

const TEST_SYSTEM = EPH_ROOT
    ? {
        BACKEND: '_SYSTEM/backend',
        DATA: path.join(EPH_ROOT, 'data'),
        LOGS: path.join(EPH_ROOT, 'logs'),
        DB: path.join(EPH_ROOT, 'data', 'yuri.db')
    }
    : PERSISTENT_SYSTEM;

/**
 * ⬡ SYSTEM_CORE_CONFIG
 * The central authority for system paths and ecosystem bifurcation.
 */
export const SystemConfig = {
    // Determine the current root based on environment or execution path
    ROOT: REPO_ROOT,
    
    // Ecosystem A: System Assets
    SYSTEM: TEST_SYSTEM,

    // Ecosystem B: Knowledge Vaults (Obsidian)
    VAULTS: {
        PRIMARY: '06_KNOWLEDGE-BASE',
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

        if (EPH_ROOT && isWithinRoot(EPH_ROOT, resolved)) {
            return resolved;
        }

        if (!isWithinRoot(this.ROOT, resolved)) {
            throw new Error(`ACCESS_DENIED: ${subPath} (resolved: ${resolved}, root: ${this.ROOT})`);
        }

        // In test mode, refuse persistent backend-data resolves (both trees) and the
        // canonical OS_KERNEL memory.db (native better-sqlite3 bypasses JS fs guards —
        // path containment must fail closed at resolve/ENV, not via fs wrappers).
        if (isTestMode()) {
            const persistentSystemData = path.resolve(this.ROOT, PERSISTENT_SYSTEM.DATA);
            if (isWithinRoot(persistentSystemData, resolved)) {
                throw new Error(
                    `ACCESS_DENIED_TEST_MODE: persistent backend data path forbidden (${resolved})`
                );
            }
            // Bare <repo>/backend/data is also a protected floor — HARD DENY (throw).
            // Production defaults must use SystemConfig.SYSTEM.DATA (already ephemeral in test).
            const persistentBareBackendData = path.resolve(this.ROOT, 'backend/data');
            if (isWithinRoot(persistentBareBackendData, resolved)) {
                throw new Error(
                    `ACCESS_DENIED_TEST_MODE: persistent backend data path forbidden (${resolved})`
                );
            }
            const canonicalMemoryDb = path.resolve(this.ROOT, '_SYSTEM/OS_KERNEL/memory.db');
            if (resolved === canonicalMemoryDb) {
                throw new Error(
                    `ACCESS_DENIED_TEST_MODE: canonical OS_KERNEL memory.db forbidden (${resolved})`
                );
            }
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
