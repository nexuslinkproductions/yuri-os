import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { SystemConfig } from '../config/SystemConfig';
import { KnowledgeNode } from '../models/queries';

type MemoryStatus = 'active' | 'archived' | 'quarantined' | 'tombstoned';

export interface MemoryAssessment {
    content: string;
    contentHash: string;
    memoryType: string;
    tier: 'STM' | 'MTM' | 'LTM' | 'Archive' | 'Tombstone';
    structure: 'episode' | 'ledger' | 'tree' | 'entity';
    scope: 'state' | 'trajectory' | 'environment';
    status: MemoryStatus;
    trustScore: number;
    confidenceScore: number;
    sourceQuality: number;
    sensitivity: 'public' | 'internal' | 'restricted' | 'secret';
    decayScore: number;
    canonicalSummary: string;
    flags: string[];
}

export interface GovernedWriteInput {
    content: string;
    memoryType?: string;
    sourceAgent?: string;
    sourceUri?: string;
    sourceKind?: string;
    tags?: string[];
    importance?: number;
    ragSourcePath?: string | null;
    ragNodeId?: number | null;
    metadata?: Record<string, unknown>;
}

export interface RetrievalDecision {
    allowed: boolean;
    multiplier: number;
    status: MemoryStatus;
    reason: string;
    assessment: MemoryAssessment;
    itemId?: number;
}

const SECRET_PATTERNS = [
    /sk-[a-zA-Z0-9]{32,}/g,
    /xkeysia-[a-zA-Z0-9]{60,}/g,
    /AIza[0-9A-Za-z-_]{35}/g,
    /ghp_[a-zA-Z0-9]{36}/g,
    /ey[a-zA-Z0-9-_]{20,}\.ey[a-zA-Z0-9-_]{20,}\.[a-zA-Z0-9-_]{20,}/g,
    /password\s*[:=]\s*["']?[^"'\s,]+["']?/gi,
];

const CONTROL_FLOW_PATTERNS = [
    /ignore (all )?(previous|prior|above) instructions/i,
    /system prompt/i,
    /developer message/i,
    /tool call/i,
    /exfiltrat/i,
    /run .*shell/i,
];

class MemoryGovernorService {
    private db: Database.Database | null = null;
    private readonly dbPath: string;

    constructor() {
        const configuredPath = process.env.YURI_MEMORY_DB_PATH || '_SYSTEM/OS_KERNEL/memory.db';
        this.dbPath = path.isAbsolute(configuredPath)
            ? configuredPath
            : SystemConfig.resolve(configuredPath);
    }

    governWrite(input: GovernedWriteInput): number | null {
        try {
            const db = this.getDB();
            const assessment = this.assess(input.content, {
                memoryType: input.memoryType,
                sourceKind: input.sourceKind,
                importance: input.importance,
            });

            const existing = db.prepare('SELECT id FROM memory_items WHERE content_hash = ?')
                .get(assessment.contentHash) as { id: number } | undefined;

            if (existing) {
                db.prepare(`
                    UPDATE memory_items
                    SET use_count = use_count + 1,
                        last_accessed_at = datetime('now'),
                        updated_at = datetime('now'),
                        rag_source_path = COALESCE(rag_source_path, ?),
                        rag_node_id = COALESCE(rag_node_id, ?)
                    WHERE id = ?
                `).run(input.ragSourcePath ?? null, input.ragNodeId ?? null, existing.id);
                this.recordEvent(existing.id, 'duplicate', 'write', input.sourceAgent, 'deduped', { flags: assessment.flags });
                return existing.id;
            }

            const result = db.prepare(`
                INSERT INTO memory_items (
                    content, canonical_summary, memory_type, tier, structure, scope, status,
                    source_agent, source_uri, source_kind, tags, trust_score, confidence_score,
                    source_quality, sensitivity, decay_score, importance, content_hash,
                    rag_source_path, rag_node_id, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                assessment.content,
                assessment.canonicalSummary,
                assessment.memoryType,
                assessment.tier,
                assessment.structure,
                assessment.scope,
                assessment.status,
                input.sourceAgent ?? null,
                input.sourceUri ?? null,
                input.sourceKind ?? 'backend',
                JSON.stringify(input.tags ?? []),
                assessment.trustScore,
                assessment.confidenceScore,
                assessment.sourceQuality,
                assessment.sensitivity,
                assessment.decayScore,
                input.importance ?? 1,
                assessment.contentHash,
                input.ragSourcePath ?? null,
                input.ragNodeId ?? null,
                JSON.stringify({ ...(input.metadata ?? {}), flags: assessment.flags })
            );

            const itemId = Number(result.lastInsertRowid);
            this.recordEvent(itemId, 'write', 'store', input.sourceAgent, assessment.status, { flags: assessment.flags });
            return itemId;
        } catch (error: any) {
            console.warn(`⬡ MEMORY_GOVERNOR_WRITE_DEGRADED :: ${error.message}`);
            return null;
        }
    }

    governKnowledgeNode(node: KnowledgeNode): RetrievalDecision {
        const assessment = this.assess(node.content, {
            sourceKind: 'rag_retrieval',
            memoryType: node.node_type?.toLowerCase() || 'semantic',
            importance: 2,
        });

        try {
            const db = this.getDB();
            const lifecycle = db.prepare(`
                SELECT id, status, tier, trust_score, confidence_score, source_quality, sensitivity
                FROM memory_items
                WHERE rag_source_path = ? OR content_hash = ?
                ORDER BY updated_at DESC
                LIMIT 1
            `).get(node.source_path ?? '', assessment.contentHash) as {
                id: number;
                status: MemoryStatus;
                tier: string;
                trust_score: number;
                confidence_score: number;
                source_quality: number;
                sensitivity: string;
            } | undefined;

            const status = lifecycle?.status ?? assessment.status;
            const trust = lifecycle?.trust_score ?? assessment.trustScore;
            const confidence = lifecycle?.confidence_score ?? assessment.confidenceScore;
            const sourceQuality = lifecycle?.source_quality ?? assessment.sourceQuality;
            const sensitivity = lifecycle?.sensitivity ?? assessment.sensitivity;

            if (status === 'tombstoned' || status === 'quarantined') {
                return { allowed: false, multiplier: 0, status, reason: status, assessment, itemId: lifecycle?.id };
            }
            if (trust < 0.25) {
                return { allowed: false, multiplier: 0, status, reason: 'low_trust', assessment, itemId: lifecycle?.id };
            }
            if (sensitivity === 'secret') {
                return { allowed: false, multiplier: 0, status, reason: 'secret_sensitivity', assessment, itemId: lifecycle?.id };
            }

            const sensitivityPenalty = sensitivity === 'restricted' ? 0.75 : 1;
            const multiplier = clamp((0.45 + trust * 0.25 + confidence * 0.18 + sourceQuality * 0.12) * sensitivityPenalty, 0.1, 1.25);
            return { allowed: true, multiplier, status, reason: 'ok', assessment, itemId: lifecycle?.id };
        } catch (error: any) {
            console.warn(`⬡ MEMORY_GOVERNOR_READ_DEGRADED :: ${error.message}`);
            if (assessment.status !== 'active' || assessment.sensitivity === 'secret' || assessment.trustScore < 0.25) {
                return { allowed: false, multiplier: 0, status: assessment.status, reason: 'local_assessment_block', assessment };
            }
            return { allowed: true, multiplier: 0.85, status: 'active', reason: 'db_unavailable_local_assessment', assessment };
        }
    }

    filterKnowledgeNodes<T extends KnowledgeNode>(nodes: T[]): Array<T & { memoryScoreMultiplier: number; memoryItemId?: number }> {
        return nodes.flatMap((node) => {
            const decision = this.governKnowledgeNode(node);
            if (!decision.allowed) return [];
            return [{ ...node, memoryScoreMultiplier: decision.multiplier, memoryItemId: decision.itemId }];
        });
    }

    recordRetrieval(itemIds: Array<number | undefined>, operation: string, metadata: Record<string, unknown> = {}): void {
        const ids = itemIds.filter((id): id is number => typeof id === 'number');
        if (ids.length === 0) return;
        try {
            const db = this.getDB();
            const update = db.prepare(`
                UPDATE memory_items
                SET use_count = use_count + 1, last_accessed_at = datetime('now'), updated_at = datetime('now')
                WHERE id = ?
            `);
            const event = db.prepare(`
                INSERT INTO memory_events (item_id, event_type, operation, actor, outcome, metadata_json)
                VALUES (?, 'read', ?, 'backend', 'ok', ?)
            `);
            const feedback = db.prepare(`
                INSERT INTO memory_feedback (item_id, event_id, operation, outcome, utility_label, notes)
                VALUES (?, ?, ?, 'ok', 'useful', ?)
            `);
            const payload = JSON.stringify(metadata);
            db.transaction(() => {
                for (const id of ids) {
                    update.run(id);
                    const result = event.run(id, operation, payload);
                    feedback.run(id, Number(result.lastInsertRowid), operation, payload);
                }
            })();
        } catch (error: any) {
            console.warn(`⬡ MEMORY_GOVERNOR_RETRIEVAL_EVENT_DEGRADED :: ${error.message}`);
        }
    }

    assess(content: string, opts: { memoryType?: string; sourceKind?: string; importance?: number } = {}): MemoryAssessment {
        const { content: redactedContent, flags } = this.redact(content);
        const lowered = redactedContent.toLowerCase();
        let memoryType = opts.memoryType || 'episodic';
        if (/\b(must|never|policy|rule|protocol)\b/i.test(redactedContent)) memoryType = 'policy';
        else if (/\b(steps:|procedure|runbook|workflow|how to)\b/i.test(redactedContent)) memoryType = 'procedural';
        else if (/\b(paper|arxiv|openreview|iclr|www 2026)\b/i.test(redactedContent)) memoryType = 'research';

        let tier: MemoryAssessment['tier'] = opts.sourceKind === 'liquid' || opts.sourceKind === 'session' ? 'STM' : 'MTM';
        if (['policy', 'procedural', 'research'].includes(memoryType) && (opts.importance ?? 2) >= 2) tier = 'LTM';

        const structure: MemoryAssessment['structure'] = memoryType === 'procedural'
            ? 'tree'
            : memoryType === 'policy' || memoryType === 'research'
                ? 'ledger'
                : 'episode';

        let scope: MemoryAssessment['scope'] = 'state';
        if (/\b(trajectory|session|conversation|handoff)\b/i.test(redactedContent)) scope = 'trajectory';
        if (/\b(environment|\.env|api key|token|credential)\b/i.test(redactedContent)) scope = 'environment';

        let sensitivity: MemoryAssessment['sensitivity'] = 'internal';
        if (flags.includes('sensitive_secret_pattern') || scope === 'environment') sensitivity = 'secret';
        else if (/\b(private|personal|client|customer)\b/i.test(redactedContent)) sensitivity = 'restricted';

        let status: MemoryStatus = 'active';
        let trustScore = 0.72;
        let confidenceScore = 0.64;
        let sourceQuality = 0.6;

        if (['kernel', 'system', 'rag_ingest'].includes(opts.sourceKind ?? '')) sourceQuality += 0.15;
        if (CONTROL_FLOW_PATTERNS.some(pattern => pattern.test(redactedContent))) {
            flags.push('memory_control_flow_risk');
            trustScore -= 0.45;
            confidenceScore -= 0.25;
            status = 'quarantined';
        }
        if (sensitivity === 'secret') {
            trustScore -= 0.25;
            status = 'quarantined';
        }
        if ((opts.importance ?? 1) >= 4) confidenceScore += 0.12;

        return {
            content: redactedContent,
            contentHash: hashContent(redactedContent),
            memoryType,
            tier,
            structure,
            scope,
            status,
            trustScore: clamp(trustScore, 0, 1),
            confidenceScore: clamp(confidenceScore, 0, 1),
            sourceQuality: clamp(sourceQuality, 0, 1),
            sensitivity,
            decayScore: tier === 'LTM' ? 0.08 : tier === 'MTM' ? 0.2 : 0.45,
            canonicalSummary: redactedContent.replace(/\s+/g, ' ').trim().slice(0, 280),
            flags: [...new Set(flags)].sort(),
        };
    }

    private redact(content: string): { content: string; flags: string[] } {
        let redacted = content;
        const flags: string[] = [];
        for (const pattern of SECRET_PATTERNS) {
            pattern.lastIndex = 0;
            if (pattern.test(redacted)) {
                flags.push('sensitive_secret_pattern');
                pattern.lastIndex = 0;
                redacted = redacted.replace(pattern, '[REDACTED_BY_MEMORY_GOVERNOR]');
            }
        }
        return { content: redacted, flags };
    }

    private getDB(): Database.Database {
        if (!this.db) {
            fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
            this.db = new Database(this.dbPath, { timeout: 10000 });
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('foreign_keys = ON');
            this.ensureSchema(this.db);
        }
        return this.db;
    }

    private ensureSchema(db: Database.Database): void {
        db.exec(`
            CREATE TABLE IF NOT EXISTS memory_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                legacy_memory_id INTEGER,
                content TEXT NOT NULL,
                canonical_summary TEXT,
                memory_type TEXT NOT NULL DEFAULT 'episodic',
                tier TEXT NOT NULL DEFAULT 'MTM',
                structure TEXT NOT NULL DEFAULT 'ledger',
                scope TEXT NOT NULL DEFAULT 'state',
                status TEXT NOT NULL DEFAULT 'active',
                source_agent TEXT,
                source_uri TEXT,
                source_kind TEXT NOT NULL DEFAULT 'kernel',
                tags TEXT NOT NULL DEFAULT '[]',
                trust_score REAL NOT NULL DEFAULT 0.5,
                confidence_score REAL NOT NULL DEFAULT 0.5,
                source_quality REAL NOT NULL DEFAULT 0.5,
                sensitivity TEXT NOT NULL DEFAULT 'internal',
                decay_score REAL NOT NULL DEFAULT 0.5,
                importance INTEGER NOT NULL DEFAULT 1,
                use_count INTEGER NOT NULL DEFAULT 0,
                content_hash TEXT NOT NULL UNIQUE,
                rag_source_path TEXT,
                rag_node_id INTEGER,
                archive_path TEXT,
                metadata_json TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_accessed_at DATETIME,
                expires_at DATETIME
            );
            CREATE TABLE IF NOT EXISTS memory_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER,
                event_type TEXT NOT NULL,
                operation TEXT NOT NULL,
                actor TEXT,
                outcome TEXT NOT NULL DEFAULT 'ok',
                utility_score REAL,
                metadata_json TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS memory_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER,
                event_id INTEGER,
                operation TEXT NOT NULL,
                outcome TEXT NOT NULL,
                utility_label TEXT,
                utility_score REAL,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_memory_items_hash ON memory_items(content_hash);
            CREATE INDEX IF NOT EXISTS idx_memory_items_rag_source ON memory_items(rag_source_path);
            CREATE INDEX IF NOT EXISTS idx_memory_items_status ON memory_items(status);
            CREATE INDEX IF NOT EXISTS idx_memory_events_item ON memory_events(item_id);
            CREATE INDEX IF NOT EXISTS idx_memory_feedback_item ON memory_feedback(item_id);
        `);
        const columns = db.prepare('PRAGMA table_info(memory_items)').all() as Array<{ name: string }>;
        if (!columns.some(column => column.name === 'use_count')) {
            db.exec('ALTER TABLE memory_items ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0');
        }
    }

    private recordEvent(itemId: number | null, eventType: string, operation: string, actor: string | undefined, outcome: string, metadata: Record<string, unknown>): void {
        this.getDB().prepare(`
            INSERT INTO memory_events (item_id, event_type, operation, actor, outcome, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(itemId, eventType, operation, actor ?? null, outcome, JSON.stringify(metadata));
    }
}

function hashContent(content: string): string {
    const normalized = content.trim().replace(/\s+/g, ' ').toLowerCase();
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export const memoryGovernor = new MemoryGovernorService();
