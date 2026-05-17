# ⬡ REMEDIATION ACTION PLAN
**NUDIMMUD Stability Hardening**  
**Priority:** CRITICAL  
**Target Completion:** 2026-04-24 EOD

---

## PHASE 1: SECURITY LOCKDOWN (6 hours)

### Task 1.1: Remove Hardcoded API Key Fallback
**Severity:** 🔴 CRITICAL | **Time:** 30 min | **Blast Radius:** None (forces env var requirement)

**Current Code:**
```typescript
const apiKey = process.env.API_KEY || 'nudimmud-default-key-change-me';
```

**Fix:**
```typescript
const apiKey = process.env.API_KEY;
if (!apiKey) {
    bootLog('🔴 FATAL: API_KEY environment variable is required.');
    bootLog('Set API_KEY in .env file or environment before starting the server.');
    process.exit(1);
}
```

**Files to Change:**
- [backend/src/middleware/auth.ts](backend/src/middleware/auth.ts#L8)
- [src/main.ts](src/main.ts#L12) (frontend also has hardcoded key)

**Validation:**
```bash
# Should FAIL to start without API_KEY
unset API_KEY
npm run dev  # Should exit with error message

# Should START with API_KEY set
export API_KEY="prod-key-12345"
npm run dev  # Should start normally
```

---

### Task 1.2: Redact Credentials in Boot Logs
**Severity:** 🟠 HIGH | **Time:** 45 min | **Blast Radius:** Minimal (logging only)

**Changes:**
1. Redact Anthropic API key in boot sequence
2. Redact database connection strings
3. Redact IP addresses from logs (or use placeholders)

**File:** [backend/src/server.ts](backend/src/server.ts#L5-L20)

**Example:**
```typescript
const redactKey = (key: string) => {
    if (!key) return '[UNSET]';
    return `${key.substring(0, 4)}...[${key.length}_CHARS]`;
};

bootLog(`⬡ ANTHROPIC_PROVIDER :: INITIALIZED (Key: ${redactKey(process.env.ANTHROPIC_API_KEY)})`);
```

**Validation:**
```bash
npm run dev 2>&1 | grep "ANTHROPIC_PROVIDER"
# Should output: "ANTHROPIC_PROVIDER :: INITIALIZED (Key: sk-a...[45_CHARS])"
# NOT: "ANTHROPIC_PROVIDER :: INITIALIZED (Key: sk-ant-api-xyz...)"
```

---

### Task 1.3: Fix Shell Injection in Metrics
**Severity:** 🟠 HIGH | **Time:** 20 min | **Blast Radius:** Minimal (metrics only)

**File:** [backend/src/services/metrics.ts](backend/src/services/metrics.ts#L47)

**Current:**
```typescript
const df = execSync("df -h /Volumes/T7 | tail -1 | awk '{print $5}'").toString().trim();
```

**Fix Option 1 (Quick):**
```typescript
// Use array syntax to avoid shell injection
const result = execSync(['df', '-h', '/Volumes/T7']).toString();
const match = result.split('\n').pop()?.split(/\s+/)[4];
const diskUsage = match || 'unknown';
```

**Fix Option 2 (Better):**
```typescript
import { statfsSync } from 'fs';
try {
    const stats = statfsSync('/Volumes/T7');
    const percentUsed = ((stats.blocks - stats.bavail) / stats.blocks) * 100;
    const diskUsage = `${percentUsed.toFixed(1)}%`;
} catch (e) {
    const diskUsage = 'unavailable';
}
```

**Validation:**
```bash
npm run dev 2>&1 | grep "disk"
# Should report actual disk usage without executing shell
```

---

## PHASE 2: DATA DURABILITY (6 hours)

### Task 2.1: Initialize Database Schema on Boot
**Severity:** 🔴 CRITICAL | **Time:** 2 hours | **Blast Radius:** Medium (database schema)

**File:** [backend/src/models/database.ts](backend/src/models/database.ts) (create if missing)

**Implementation:**
```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = './data/yuri.db';

export function initDatabase() {
    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const db = new Database(DB_PATH);
    
    // Enable foreign keys
    db.pragma('foreign_keys = ON');
    
    // Run migrations (schema initialization)
    db.exec(`
        CREATE TABLE IF NOT EXISTS knowledge_nodes (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            domain TEXT NOT NULL,
            title TEXT,
            content TEXT,
            tags TEXT,
            ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_domain (domain),
            INDEX idx_ingested_at (ingested_at)
        );
        
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            source TEXT,
            data TEXT,
            severity TEXT DEFAULT 'INFO',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_type (type),
            INDEX idx_created_at (created_at)
        );
        
        CREATE TABLE IF NOT EXISTS telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            agent TEXT,
            metric_name TEXT,
            metric_value REAL,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_session_id (session_id),
            INDEX idx_agent (agent)
        );
        
        CREATE TABLE IF NOT EXISTS token_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            tool_name TEXT,
            tokens_used INTEGER,
            cost_estimate REAL,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_session_id (session_id),
            INDEX idx_recorded_at (recorded_at)
        );
        
        CREATE TABLE IF NOT EXISTS checkpoints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT,
            state TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_agent_id (agent_id),
            INDEX idx_created_at (created_at)
        );
    `);
    
    console.log(`✅ Database initialized at ${DB_PATH}`);
    return db;
}
```

**Validation:**
```bash
# After first run, check schema
sqlite3 ./data/yuri.db ".tables"
# Should output: checkpoints events knowledge_nodes telemetry token_usage

sqlite3 ./data/yuri.db ".schema knowledge_nodes"
# Should show full schema with indexes
```

---

### Task 2.2: Validate Vault Ingestion Completeness
**Severity:** 🟠 HIGH | **Time:** 1 hour | **Blast Radius:** Minimal (adds validation)

**File:** [backend/src/services/vaultIngestion.ts](backend/src/services/vaultIngestion.ts#L1)

**Current (Line ~180):**
```typescript
// Existing code just returns count
export function runVaultIngestion(db: Database) {
    // ... ingestion loop ...
    console.log(`⬡ VAULT_INGESTION_COMPLETE :: ${nodesIngested} nodes in ${duration}ms`);
}
```

**Enhanced:**
```typescript
export function runVaultIngestion(db: Database) {
    let successCount = 0;
    let failureCount = 0;
    const failures: { file: string; error: string }[] = [];
    
    // ... existing ingestion loop, modified to track errors ...
    for (const file of files) {
        try {
            const node = processFile(file);
            insertKnowledgeNode(db, node);
            successCount++;
        } catch (e: any) {
            failureCount++;
            failures.push({ file, error: e.message });
            console.error(`⬡ VAULT_INGESTION_ERROR :: ${file} :: ${e.message}`);
        }
    }
    
    const totalCount = successCount + failureCount;
    const failureRate = totalCount > 0 ? (failureCount / totalCount) * 100 : 0;
    
    // Log results
    console.log(`⬡ VAULT_INGESTION_COMPLETE :: ${successCount} success, ${failureCount} failures (${failureRate.toFixed(1)}%)`);
    
    // FAIL if > 10% of files failed
    if (failureRate > 10) {
        const errorSummary = failures.slice(0, 5).map(f => `${f.file}: ${f.error}`).join('\n');
        throw new Error(`VAULT_INGESTION_INCOMPLETE: ${failureRate.toFixed(1)}% failure rate\n${errorSummary}`);
    }
    
    return { successCount, failureCount, failures };
}
```

**Validation:**
```bash
npm run dev 2>&1 | grep "VAULT_INGESTION"
# Should show: "VAULT_INGESTION_COMPLETE :: 800 success, 5 failures (0.6%)"
# If > 10% fail, should see: "VAULT_INGESTION_INCOMPLETE: 15.0% failure rate"
```

---

## PHASE 3: OBSERVABILITY & RESILIENCE (5 hours)

### Task 3.1: Implement Health Check Endpoints
**Severity:** 🟠 HIGH | **Time:** 1 hour | **Blast Radius:** None (new endpoints)

**File:** [backend/src/routes/api.ts](backend/src/routes/api.ts#L30)

**Add to routes:**
```typescript
// Health check endpoints
router.get('/health', (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
            database: checkDatabaseHealth(db) ? 'online' : 'offline',
            vault_watcher: vaultWatcher?.isRunning ? 'online' : 'offline',
            neural_forge: checkNeuralForgeHealth() ? 'online' : 'offline'
        },
        memory: {
            used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total_mb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        }
    };
    
    const hasFailures = Object.values(health.services).some(s => s === 'offline');
    res.status(hasFailures ? 503 : 200).json(health);
});

router.get('/health/ready', (req, res) => {
    const ready = {
        ready: true,
        reason: 'all systems ready',
        timestamp: new Date().toISOString()
    };
    
    // Check if vault ingestion completed
    if (!vaultIngestCompleted) {
        ready.ready = false;
        ready.reason = 'vault ingestion in progress';
    }
    
    // Check if database is writable
    try {
        db.prepare('SELECT 1').get();
    } catch (e) {
        ready.ready = false;
        ready.reason = 'database not writable';
    }
    
    res.status(ready.ready ? 200 : 503).json(ready);
});
```

**Validation:**
```bash
curl -X GET http://localhost:3004/api/health \
  -H "X-API-KEY: your-api-key"
# Should return: { "status": "healthy", "services": { "database": "online", ... } }

curl -X GET http://localhost:3004/api/health/ready \
  -H "X-API-KEY: your-api-key"
# Should return: { "ready": true, "timestamp": "2026-04-22T..." }
```

---

### Task 3.2: Add Fallback Model Chain with Alerting
**Severity:** 🔴 CRITICAL | **Time:** 2 hours | **Blast Radius:** Medium (model routing)

**File:** [backend/src/services/neuralForgeService.ts](backend/src/services/neuralForgeService.ts)

**Implementation:**
```typescript
export class NeuralForge {
    private fallbackChain = [
        { name: 'claude-3-5-sonnet', provider: 'anthropic', tier: 'primary', costPerMillion: 3 },
        { name: 'claude-3-haiku', provider: 'anthropic', tier: 'degraded', costPerMillion: 0.8 },
        { name: 'gpt-4o-mini', provider: 'openai', tier: 'alternative', costPerMillion: 0.15 },
        { name: 'qwen2.5:7b', provider: 'local', tier: 'emergency', costPerMillion: 0 }
    ];
    
    async request(prompt: string, options: any = {}) {
        let lastError: Error | null = null;
        
        for (const model of this.fallbackChain) {
            try {
                console.log(`⬡ NEURAL_FORGE :: ATTEMPTING :: ${model.name}`);
                const result = await this.invoke(model, prompt, options);
                
                // Alert if not primary
                if (model.tier !== 'primary') {
                    console.warn(`⚠️  MODEL_DEGRADATION :: ${model.tier} tier active (primary unavailable)`);
                    await this.alertOperator({
                        severity: model.tier === 'emergency' ? 'CRITICAL' : 'WARNING',
                        message: `Using ${model.name} (${model.tier} tier)`,
                        preferredModel: this.fallbackChain[0].name
                    });
                }
                
                return result;
            } catch (error: any) {
                lastError = error;
                console.error(`⬡ MODEL_FAILED :: ${model.name} :: ${error?.message}`);
                
                // Log specific errors for diagnostics
                if (error.status === 429) {
                    console.error(`⬡ RATE_LIMITED :: ${model.provider}`);
                } else if (error.status === 401) {
                    console.error(`⬡ AUTH_FAILED :: ${model.provider} (check credentials)`);
                } else if (error.message?.includes('too low')) {
                    console.error(`⬡ INSUFFICIENT_CREDITS :: ${model.provider}`);
                }
                
                // Continue to next fallback
                continue;
            }
        }
        
        // All models exhausted
        throw new Error(`ALL_MODELS_EXHAUSTED :: Last error: ${lastError?.message}`);
    }
    
    private async alertOperator(alert: any) {
        // TODO: Implement alerting (email, Slack, PagerDuty, etc.)
        console.log(`📧 ALERT TO OPERATOR: ${JSON.stringify(alert)}`);
    }
}
```

**Validation:**
```bash
# Simulate primary model failure by setting invalid Anthropic key
export ANTHROPIC_API_KEY="invalid-key"
npm run dev 2>&1 | grep "MODEL_"

# Should output something like:
# "⬡ MODEL_FAILED :: claude-3-5-sonnet :: 401"
# "⬡ NEURAL_FORGE :: ATTEMPTING :: gpt-4o-mini"
# If that fails:
# "⬡ NEURAL_FORGE :: ATTEMPTING :: qwen2.5:7b"
```

---

### Task 3.3: Implement Obsidian Reconnection with Backoff
**Severity:** 🟠 HIGH | **Time:** 1.5 hours | **Blast Radius:** Minimal (connection logic)

**File:** [backend/src/services/vaultWatcher.ts](backend/src/services/vaultWatcher.ts) (create if missing)

**Implementation:**
```typescript
export class VaultWatcher {
    private isRunning = false;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private initialBackoffMs = 1000;
    
    async start(db: Database) {
        this.isRunning = true;
        
        // Attempt initial connection
        while (!this.isConnected && this.reconnectAttempts < this.maxReconnectAttempts) {
            try {
                await this.connectToObsidian();
                this.reconnectAttempts = 0;
                console.log(`✅ OBSIDIAN_CONNECTED`);
                break;
            } catch (e) {
                this.reconnectAttempts++;
                const backoff = this.initialBackoffMs * Math.pow(2, this.reconnectAttempts);
                console.warn(`⚠️  OBSIDIAN_RECONNECT :: Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}, backoff ${backoff}ms`);
                
                await new Promise(resolve => setTimeout(resolve, backoff));
            }
        }
        
        if (!this.isConnected) {
            throw new Error('OBSIDIAN_FAILED_TO_CONNECT :: max retries exceeded');
        }
        
        // Start file watcher for vault changes
        this.watchVaultChanges(db);
    }
    
    private async connectToObsidian() {
        const response = await fetch('https://127.0.0.1:27124/vault', {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`Obsidian connection failed: ${response.status}`);
        }
        
        this.isConnected = true;
    }
    
    private watchVaultChanges(db: Database) {
        // Poll for changes every 30 seconds
        setInterval(async () => {
            try {
                const changes = await this.getVaultChanges();
                if (changes.length > 0) {
                    console.log(`⬡ VAULT_CHANGES :: ${changes.length} files updated`);
                    await runVaultIngestion(db);
                }
            } catch (e) {
                console.error(`⬡ VAULT_WATCHER_ERROR :: ${e.message}`);
                this.isConnected = false;
                // Attempt reconnect on next cycle
            }
        }, 30000);
    }
}
```

**Validation:**
```bash
# Start backend
npm run dev &

# Simulate Obsidian unavailability
sudo service obsidian stop  # or unplug network

# Observe logs should show:
# "⚠️  OBSIDIAN_RECONNECT :: Attempt 1/5, backoff 1000ms"
# "⚠️  OBSIDIAN_RECONNECT :: Attempt 2/5, backoff 2000ms"
# (continues with exponential backoff)

# Then restart Obsidian
sudo service obsidian start

# Observe logs should show:
# "✅ OBSIDIAN_CONNECTED"
```

---

### Task 3.4: Add Per-Agent Timeout Warnings
**Severity:** 🟠 HIGH | **Time:** 1 hour | **Blast Radius:** Minimal (agent coordination)

**File:** [backend/src/conclave/ConclaveOS.ts](backend/src/conclave/ConclaveOS.ts#L10)

**Changes:**
```typescript
const CONCLAVE_TIMEOUT_MS = 28000;
const AGENT_WARNING_THRESHOLD_MS = 24000;

async boot(directive: string): Promise<ConclaveBootResult> {
    // ... existing setup ...
    
    return new Promise((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
            // Time limit approaching — emit warning to agents
            this.bus.emit('TIMEOUT_WARNING', { remaining_ms: CONCLAVE_TIMEOUT_MS - AGENT_WARNING_THRESHOLD_MS });
        }, AGENT_WARNING_THRESHOLD_MS);
        
        const hardTimeout = setTimeout(() => {
            // Hard limit — force checkpoint and exit
            console.error(`⬡ CONCLAVE_TIMEOUT :: Hard timeout reached`);
            clearTimeout(timeoutHandle);
            
            // Save state for recovery
            if (this.state) {
                this.checkpointer.save(this.state, 'TIMEOUT_RECOVERY')
                    .then(() => reject(new Error('CONCLAVE_TIMEOUT')))
                    .catch(reject);
            } else {
                reject(new Error('CONCLAVE_TIMEOUT'));
            }
        }, CONCLAVE_TIMEOUT_MS);
        
        // Execute conclave
        this.executeAgents(directive)
            .then(result => {
                clearTimeout(timeoutHandle);
                clearTimeout(hardTimeout);
                resolve(result);
            })
            .catch(error => {
                clearTimeout(timeoutHandle);
                clearTimeout(hardTimeout);
                reject(error);
            });
    });
}
```

---

## PHASE 4: PROCESS LIFECYCLE (2 hours)

### Task 4.1: Implement Proper Shutdown Handlers
**Severity:** 🟠 HIGH | **Time:** 1 hour | **Blast Radius:** Minimal (startup/shutdown)

**File:** [backend/src/server.ts](backend/src/server.ts#L20)

**Add after server initialization:**
```typescript
// ─── GRACEFUL SHUTDOWN ─────────────────────────────────────────────────
const gracefulShutdown = async (signal: string) => {
    bootLog(`⬡ SHUTDOWN_SIGNAL_RECEIVED :: ${signal}`);
    bootLog(`⬡ SHUTTING_DOWN_GRACEFULLY...`);
    
    // Close server (stop accepting new connections)
    server.close(() => {
        bootLog(`⬡ SERVER_CLOSED :: No new connections accepted`);
    });
    
    // Close WebSocket connections
    wss.clients.forEach(client => {
        client.close(1000, 'Server shutting down');
    });
    
    // Stop background services
    try {
        guard.stop();
        bootLog(`⬡ STABILITY_GUARD_STOPPED`);
    } catch (e) {
        bootLog(`⬡ ERROR_STOPPING_GUARD :: ${e}`);
    }
    
    // Close database
    try {
        db.close();
        bootLog(`⬡ DATABASE_CLOSED`);
    } catch (e) {
        bootLog(`⬡ ERROR_CLOSING_DATABASE :: ${e}`);
    }
    
    // Give services 5 seconds to clean up
    setTimeout(() => {
        bootLog(`⬡ FORCED_EXIT :: Timeout after 5 seconds`);
        process.exit(0);
    }, 5000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

**Validation:**
```bash
# Start backend
npm run dev &
PID=$!

# Give it 2 seconds to start
sleep 2

# Send SIGTERM
kill -TERM $PID

# Observe logs should show:
# "⬡ SHUTDOWN_SIGNAL_RECEIVED :: SIGTERM"
# "⬡ SHUTTING_DOWN_GRACEFULLY..."
# "⬡ SERVER_CLOSED :: No new connections accepted"
# "⬡ DATABASE_CLOSED"
# Server should exit cleanly within 5 seconds
```

---

## DEPLOYMENT CHECKLIST

- [ ] **Phase 1 Complete**
  - [ ] Task 1.1: API key hardcoding removed
  - [ ] Task 1.2: Credentials redacted from logs
  - [ ] Task 1.3: Shell injection fixed

- [ ] **Phase 2 Complete**
  - [ ] Task 2.1: Database schema initialized
  - [ ] Task 2.2: Vault ingestion validation added
  - [ ] Database contains 800+ knowledge nodes

- [ ] **Phase 3 Complete**
  - [ ] Task 3.1: Health endpoints working
  - [ ] Task 3.2: Fallback model chain implemented
  - [ ] Task 3.3: Obsidian reconnection added
  - [ ] Task 3.4: Agent timeout warnings working

- [ ] **Phase 4 Complete**
  - [ ] Task 4.1: Graceful shutdown handlers added
  - [ ] Server exits cleanly on SIGTERM/SIGINT

- [ ] **Testing Complete**
  - [ ] All endpoints tested with curl
  - [ ] No credentials visible in logs
  - [ ] Database persists data across restarts
  - [ ] Health checks return correct status codes

---

**Estimated Total Time:** ~19 hours  
**Recommended Allocation:** 5 hours/day over 4 days

