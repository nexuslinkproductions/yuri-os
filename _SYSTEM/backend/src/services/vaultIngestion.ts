/**
 * VAULT INGESTION SERVICE
 * Crawls the entire YURI-OS-MUSUBI vault (Obsidian markdown files) and ingests
 * knowledge nodes into the Abzu database. The DB is the deduplication layer.
 */
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { insertKnowledgeNode, logEvent } from '../models/queries';
import { neuralForge } from './neuralForgeService';
import { memoryGovernor } from './memoryGovernorService';

import { SystemConfig } from '../config/SystemConfig';

// Detect Vault Root via SystemConfig abstraction
const VAULT_ROOT = SystemConfig.ROOT;


// Domain mapping: directory prefix → esoteric domain label
const DIR_DOMAIN_MAP: Record<string, string> = {
    '06_KNOWLEDGE-BASE/01_COSMOLOGY':     'COSMOLOGY',
    '06_KNOWLEDGE-BASE/02_CONSCIOUSNESS': 'CONSCIOUSNESS',
    '06_KNOWLEDGE-BASE/03_COMMUNICATION': 'COMMUNICATION',
    '06_KNOWLEDGE-BASE/04_SYNTHESIS':     'SYNTHESIS',
    '06_KNOWLEDGE-BASE/05_OPERATIONAL':   'OPERATIONAL',
    '06_KNOWLEDGE-BASE/00_META':          'META',
    '06_KNOWLEDGE-BASE':                  'HERMETIC',
    'NISABA/01_DEPLOYMENT':               'DEPLOYMENT',
    'NISABA/02_EVOLUTION':                'EVOLUTION',
    'NISABA/03_DISTRIBUTION':             'DISTRIBUTION',
    'NISABA/04_QUALITY':                  'QUALITY',
    'NISABA/05_DEFENSE':                  'DEFENSE',
    'NISABA/06_SWARM':                    'SWARM',
    'NISABA/07_CANON':                    'CANON',
    'NISABA/08_INGESTION':                'INGESTION',
    'NISABA':                             'SYSTEM',
    '_SYSTEM':                            'SYSTEM',
    '03_RESOURCES':                       'RESOURCE',
    '02_AREAS':                           'MEMORY',
    '00_COMMAND-CENTER':                  'COMMAND',
    'NEURAL-NETWORK':                     'NEURAL',
    '01_PROJECTS':                        'PROJECTS',
};

// File-level domain overrides (root-level files)
const FILE_DOMAIN_MAP: Record<string, string> = {
    'AEONIC_PROTOCOL.md':  'AEONIC',
    'CODEX_PROTOCOL.md':   'AEONIC',
    'esoteric_codex.md':   'HERMETIC',
    'creative_codex.md':   'CREATIVE',
    'language_codex.md':   'LINGUISTICS',
    'nabu.md':             'SYSTEM',
    'identity.md':         'MEMORY',
    'session_log.md':      'LOG',
    'enki_state.md':       'MEMORY',
    'STRUCTURE.md':        'SYSTEM',
};

const VAULT_DIRS = Object.keys(DIR_DOMAIN_MAP);

const CORE_FILES = [
    { file: 'AEONIC_PROTOCOL.md',                             domain: 'AEONIC' },
    { file: 'CODEX_PROTOCOL.md',                              domain: 'AEONIC' },
    { file: 'esoteric_codex.md',                              domain: 'HERMETIC' },
    { file: 'creative_codex.md',                              domain: 'CREATIVE' },
    { file: 'language_codex.md',                              domain: 'LINGUISTICS' },
    { file: 'nabu.md',                                        domain: 'SYSTEM' },
    { file: 'identity.md',                                    domain: 'MEMORY' },
    { file: 'session_log.md',                                 domain: 'LOG' },
    { file: 'enki_state.md',                                  domain: 'MEMORY' },
    { file: 'STRUCTURE.md',                                   domain: 'SYSTEM' },
    { file: '06_KNOWLEDGE-BASE/REPORT.md',                   domain: 'META' },
    { file: 'NISABA/nisaba.md',                              domain: 'SYSTEM' }
];

const MAX_FILE_SIZE_BYTES = 300_000; // Skip files > 300KB
const SKIP_DIRS = new Set(['.git', 'node_modules', '.obsidian', 'dist', 'data', 'graph', 'graphify-out', 'claude-palace-out']);
const FAILURE_RATE_THRESHOLD = 10;

type IngestFileStatus = 'INGESTED' | 'SKIPPED' | 'FAILED';

type IngestFileResult = {
    status: IngestFileStatus;
    filePath: string;
    error?: string;
};

export interface VaultIngestionResult {
    trigger: string;
    successCount: number;
    failureCount: number;
    skippedCount: number;
    totalIngested: number;
    totalProcessed: number;
    failureRate: number;
    durationMs: number;
    queuedFollowUp: boolean;
    completedAt: string;
}

type VaultIngestionState = {
    activeRun: Promise<VaultIngestionResult> | null;
    queuedTrigger: string | null;
    lastResult: VaultIngestionResult | null;
    lastError: string | null;
    lastStartedAt: string | null;
};

const ingestionState: VaultIngestionState = {
    activeRun: null,
    queuedTrigger: null,
    lastResult: null,
    lastError: null,
    lastStartedAt: null
};

/**
 * REDACTION LAYER (SECURITY_AUDIT)
 * Prevents sensitive credentials from entering the semantic knowledge base.
 */
function redactSecrets(content: string): string {
    let redacted = content;
    const patterns = [
        /sk-[a-zA-Z0-9]{32,}/g,           // OpenAI / Generic Secret Keys
        /xkeysia-[a-zA-Z0-9]{60,}/g,      // Anthropic / Sendinblue
        /AIza[0-9A-Za-z-_]{35}/g,         // Google Cloud API Keys
        /ghp_[a-zA-Z0-9]{36}/g,           // GitHub PAT
        /ey[a-zA-Z0-9-_]{20,}\.ey[a-zA-Z0-9-_]{20,}\.[a-zA-Z0-9-_]{20,}/g, // JWTs
        /password\s*[:=]\s*["']?[^"'\s,]+["']?/gi, // Potential passwords
    ];

    for (const pattern of patterns) {
        redacted = redacted.replace(pattern, (match) => {
            const prefix = match.substring(0, 4);
            return `${prefix}...[REDACTED_BY_GUARDIAN]`;
        });
    }
    return redacted;
}

/**
 * Infer the domain for a file based on its relative path.
 */
export function inferDomain(relativePath: string): string {
    const filename = path.basename(relativePath);
    // Check file-level overrides first
    if (FILE_DOMAIN_MAP[filename]) return FILE_DOMAIN_MAP[filename];
    // Check from most specific to least specific directory prefix
    for (const prefix of Object.keys(DIR_DOMAIN_MAP).sort((a, b) => b.length - a.length)) {
        if (relativePath.startsWith(prefix)) return DIR_DOMAIN_MAP[prefix];
    }
    return 'GENERAL';
}

/**
 * Extract a title from a markdown file (first H1) or fall back to filename.
 */
function extractTitle(content: string, filePath: string): string {
    const match = content.match(/^#\s+(.+)$/m);
    if (match) return match[1].replace(/[*_`]/g, '').trim();
    return path.basename(filePath, '.md').replace(/[-_]/g, ' ');
}

/**
 * Extract semantic tags from content.
 */
function extractTags(content: string, domain: string): string {
    const hashtags = [...content.matchAll(/#([a-zA-Z][a-zA-Z0-9_-]+)/g)]
        .map(m => m[1])
        .filter(t => t.length > 2 && t.length < 30);
    const unique = new Set([domain.toLowerCase(), ...hashtags.slice(0, 12)]);
    return JSON.stringify([...unique]);
}

/**
 * Extract wikilinks [[Link]] from content.
 */
function extractLinks(content: string): string[] {
    const links = [...content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)]
        .map(m => m[1].trim());
    return [...new Set(links)];
}

/**
 * Ingest a single markdown file — upsert into DB.
 */
function ingestFile(db: Database.Database, filePath: string): IngestFileResult {
    try {
        const stats = fs.statSync(filePath);
        if (stats.size > MAX_FILE_SIZE_BYTES || stats.size < 50) {
            return { status: 'SKIPPED', filePath };
        }

        let content = fs.readFileSync(filePath, 'utf-8').trim();
        if (content.length < 50) {
            return { status: 'SKIPPED', filePath };
        }

        // Apply Redaction Layer
        content = redactSecrets(content);

        const relativePath = path.relative(VAULT_ROOT, filePath);
        const domain = inferDomain(relativePath);
        const title = extractTitle(content, filePath);
        const tags = extractTags(content, domain);

        // Generate embedding via NeuralForge (Ollama)
        // We embed the title + a snippet of content for better semantic retrieval
        const embedText = `${title}\n${content.substring(0, 1000)}`;
        
        const existing = (db as any)
            .prepare('SELECT id, updated_at, embedding FROM knowledge_nodes WHERE source_path = ?')
            .get(relativePath) as { id: number; updated_at: string; embedding: string | null } | undefined;

        if (existing) {
            const dbTime = new Date(existing.updated_at).getTime();
            if (stats.mtimeMs > dbTime || !existing.embedding) {
                memoryGovernor.governWrite({
                    content,
                    memoryType: 'semantic',
                    sourceUri: relativePath,
                    sourceKind: 'rag_ingest',
                    tags: [domain.toLowerCase(), 'vault_ingestion'],
                    importance: domain === 'SYSTEM' || domain === 'COMMAND' ? 3 : 2,
                    ragSourcePath: relativePath,
                    ragNodeId: existing.id,
                    metadata: { title, domain }
                });
                void neuralForge.getEmbedding(embedText).then(vector => {
                    if (vector) {
                        (db as any).prepare(
                            `UPDATE knowledge_nodes SET title = ?, content = ?, tags = ?, domain = ?, embedding = ?, updated_at = datetime('now') WHERE id = ?`
                        ).run(title, content, tags, domain, JSON.stringify(vector), existing.id);
                    }
                }).catch((error) => {
                    console.error(`⬡ INGEST_EMBED_ERROR :: ${filePath} :: ${(error as Error).message}`);
                });
            }
        } else {
            // Initial insert without embedding, then update async to avoid blocking crawl
            const nodeId = insertKnowledgeNode(db, { title, content, source_path: relativePath, node_type: 'DOCUMENT', tags, domain, embedding: null }) as any;
            memoryGovernor.governWrite({
                content,
                memoryType: 'semantic',
                sourceUri: relativePath,
                sourceKind: 'rag_ingest',
                tags: [domain.toLowerCase(), 'vault_ingestion'],
                importance: domain === 'SYSTEM' || domain === 'COMMAND' ? 3 : 2,
                ragSourcePath: relativePath,
                ragNodeId: Number(nodeId),
                metadata: { title, domain }
            });
            void neuralForge.getEmbedding(embedText).then(vector => {
                if (vector) {
                    (db as any).prepare('UPDATE knowledge_nodes SET embedding = ? WHERE id = ?')
                        .run(JSON.stringify(vector), nodeId);
                }
            }).catch((error) => {
                console.error(`⬡ INGEST_EMBED_ERROR :: ${filePath} :: ${(error as Error).message}`);
            });
        }
        return { status: 'INGESTED', filePath };
    } catch (e: any) {
        console.error(`⬡ INGEST_FILE_ERROR :: ${filePath} :: ${e.message}`);
        return { status: 'FAILED', filePath, error: e.message };
    }
}

/**
 * Recursively crawl a directory and ingest all .md files.
 */
function crawlDirectory(db: Database.Database, dirPath: string, depth = 0): IngestFileResult[] {
    if (depth > 5 || !fs.existsSync(dirPath)) return [];

    const results: IngestFileResult[] = [];
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
        return [];
    }

    for (const entry of entries) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            results.push(...crawlDirectory(db, fullPath, depth + 1));
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            results.push(ingestFile(db, fullPath));
        }
    }

    return results;
}

/**
 * Master ingestion run. Called on boot and can be re-triggered via API.
 */
async function performVaultIngestion(db: Database.Database, trigger: string): Promise<VaultIngestionResult> {
    const startTime = Date.now();
    const results: IngestFileResult[] = [];

    console.log(`⬡ VAULT_INGESTION_START :: ${trigger} :: scanning YURI knowledge layers...`);

    // 1. Priority core files
    for (const { file, domain: _ } of CORE_FILES) {
        const fullPath = path.join(VAULT_ROOT, file);
        results.push(ingestFile(db, fullPath));
    }

    // 2. Full directory crawls for each knowledge domain
    for (const dir of VAULT_DIRS) {
        const fullDir = path.join(VAULT_ROOT, dir);
        results.push(...crawlDirectory(db, fullDir));
    }

    // 3. Resolve and store links
    processLinks(db);

    const successCount = results.filter((result) => result.status === 'INGESTED').length;
    const failureResults = results.filter((result) => result.status === 'FAILED');
    const skippedCount = results.filter((result) => result.status === 'SKIPPED').length;
    const failureCount = failureResults.length;
    const totalProcessed = successCount + failureCount;
    const failureRate = totalProcessed === 0 ? 0 : (failureCount / totalProcessed) * 100;
    const duration = Date.now() - startTime;

    const summary: VaultIngestionResult = {
        trigger,
        successCount,
        failureCount,
        skippedCount,
        totalIngested: successCount,
        totalProcessed,
        failureRate: Number(failureRate.toFixed(2)),
        durationMs: duration,
        queuedFollowUp: Boolean(ingestionState.queuedTrigger),
        completedAt: new Date().toISOString()
    };

    ingestionState.lastResult = summary;
    ingestionState.lastError = failureCount > 0 ? failureResults[0].error || 'UNKNOWN_INGESTION_FAILURE' : null;

    logEvent(
        db,
        'SYSTEM',
        'VAULT_INGESTION',
        `Ingested ${successCount} nodes with ${failureCount} failures and ${skippedCount} skips in ${duration}ms`,
        failureRate > FAILURE_RATE_THRESHOLD ? 'WARN' : 'INFO',
        { trigger, failureRate: summary.failureRate }
    );

    console.log(
        `⬡ VAULT_INGESTION_COMPLETE :: ${successCount} ingested, ${failureCount} failed, ${skippedCount} skipped in ${duration}ms`
    );

    if (failureRate > FAILURE_RATE_THRESHOLD) {
        throw new Error(`VAULT_INGESTION_INCOMPLETE :: ${summary.failureRate}% failure rate`);
    }

    return summary;
}

export function runVaultIngestion(db: Database.Database, trigger: string = 'manual'): Promise<VaultIngestionResult> {
    if (ingestionState.activeRun) {
        ingestionState.queuedTrigger = trigger;
        return ingestionState.activeRun;
    }

    ingestionState.lastStartedAt = new Date().toISOString();
    ingestionState.activeRun = performVaultIngestion(db, trigger)
        .catch((error: any) => {
            ingestionState.lastError = error.message;
            throw error;
        })
        .finally(() => {
            const followUpTrigger = ingestionState.queuedTrigger;
            ingestionState.activeRun = null;
            ingestionState.queuedTrigger = null;

            if (followUpTrigger) {
                setTimeout(() => {
                    void runVaultIngestion(db, `${followUpTrigger}:follow_up`).catch((error) => {
                        console.error('⬡ VAULT_INGESTION_FOLLOWUP_ERROR ::', error);
                    });
                }, 0);
            }
        });

    return ingestionState.activeRun;
}

export function getVaultIngestionStatus() {
    return {
        isRunning: Boolean(ingestionState.activeRun),
        queuedTrigger: ingestionState.queuedTrigger,
        lastStartedAt: ingestionState.lastStartedAt,
        lastError: ingestionState.lastError,
        lastResult: ingestionState.lastResult
    };
}

/**
 * Resolve wikilinks into database relations.
 */
function processLinks(db: Database.Database): void {
    console.log('⬡ VAULT_INGESTION :: resolving neural links...');
    const nodes = db.prepare('SELECT id, title, content FROM knowledge_nodes').all() as { id: number; title: string; content: string }[];
    
    // Create a title -> id map for fast lookup
    const titleMap = new Map<string, number>();
    nodes.forEach(n => titleMap.set(n.title.toLowerCase(), n.id));

    const insertLink = db.prepare('INSERT OR IGNORE INTO knowledge_links (source_id, target_id) VALUES (?, ?)');
    
    db.transaction(() => {
        // Clear old links before re-resolving (optional, but keeps it clean)
        db.prepare('DELETE FROM knowledge_links').run();

        for (const node of nodes) {
            const links = extractLinks(node.content);
            for (const linkTitle of links) {
                const targetId = titleMap.get(linkTitle.toLowerCase());
                if (targetId && targetId !== node.id) {
                    insertLink.run(node.id, targetId);
                }
            }
        }
    })();
}

/**
 * Returns ingestion statistics for the telemetry feed.
 */
export function getIngestionStats(db: Database.Database): { total: number; byDomain: Record<string, number> } {
    const total = ((db as any).prepare('SELECT COUNT(*) as c FROM knowledge_nodes').get() as any).c;
    const byDomainRows = (db as any)
        .prepare('SELECT domain, COUNT(*) as c FROM knowledge_nodes GROUP BY domain ORDER BY c DESC')
        .all() as { domain: string; c: number }[];

    const byDomain: Record<string, number> = {};
    for (const row of byDomainRows) byDomain[row.domain] = row.c;

    return { total, byDomain };
}
