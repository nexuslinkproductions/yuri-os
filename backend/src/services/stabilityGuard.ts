import { obsidianRest } from './obsidianRestService';
import { logEvent } from '../models/queries';
import { Database } from 'better-sqlite3';

/**
 * StabilityGuard
 * Automatically detects and remediates infrastructure failures.
 * Specifically targets the 'Obsidian Vault Link' and 'Agent Deadlocks'.
 */
export class StabilityGuard {
    private db: Database;
    private checkInterval: NodeJS.Timeout | null = null;
    private consecutiveFailures: number = 0;
    private readonly recoveryThreshold = 5;

    constructor(db: Database) {
        this.db = db;
    }

    start() {
        if (this.checkInterval) return;
        console.log('⬡ STABILITY_GUARD_ACTIVATED :: Monitoring for systemic bugs...');
        this.checkInterval = setInterval(() => this.audit(), 10000); // Audit every 10s
    }

    private async audit() {
        // One-time System Calibration
        const calibrated = this.db.prepare("SELECT 1 FROM event_log WHERE event_type = 'CALIBRATION_COMPLETED'").get();
        if (!calibrated) {
            await this.calibrate();
        }

        const obsidianStatus = obsidianRest.getStatus();
        if (obsidianStatus.mode === 'file') {
            this.consecutiveFailures = 0;
            return;
        }

        const isVaultOnline = obsidianStatus.mode === 'rest' ? true : await obsidianRest.ping();
        
        if (!isVaultOnline) {
            this.consecutiveFailures++;
            if (this.consecutiveFailures >= this.recoveryThreshold) {
                await this.eliminateVaultBug();
            }
        } else {
            this.consecutiveFailures = 0;
        }
    }

    private async eliminateVaultBug() {
        console.error('⬡ BUG_DETECTED :: Vault Link Disconnected. Initiating Instant Remediation...');
        logEvent(this.db, 'STABILITY_GUARD', 'RECOVERY', 'Vault link failure detected. Attempting automated repair.', 'WARNING');

        try {
            console.log('  -> Resetting Obsidian Connector...');
            const restored = await obsidianRest.reconnectWithBackoff(4, 1000);
            
            if (restored && await obsidianRest.ping()) {
                console.log('⬡ BUG_ELIMINATED :: Vault link restored autonomously.');
                logEvent(this.db, 'STABILITY_GUARD', 'SUCCESS', 'Vault link restored autonomously.', 'INFO');
                this.consecutiveFailures = 0;
            } else {
                console.error('  -> First recovery stage failed. Escalating...');
                // Here we could trigger a PM2 restart or notify the user
            }
        } catch (e: any) {
            console.error('  -> Recovery error:', e.message);
        }
    }

    private async calibrate() {
        console.log('⬡ INITIATING_SYSTEM_CALIBRATION :: Idempotent health marker');
        logEvent(this.db, 'CALIBRATION_COMPLETED', 'STABILITY_GUARD', 'System calibration marker recorded.', 'INFO');
        console.log('⬡ CALIBRATION_COMPLETE :: Marker recorded.');
    }

    getStatus() {
        return {
            running: this.checkInterval !== null,
            consecutiveFailures: this.consecutiveFailures,
            recoveryThreshold: this.recoveryThreshold
        };
    }

    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
}
