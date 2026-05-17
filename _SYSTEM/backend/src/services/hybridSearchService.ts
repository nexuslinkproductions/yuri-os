import Database from 'better-sqlite3';
import { vectorSearch, VectorSearchOptions } from './vectorSearchService';
import { KnowledgeNode } from '../models/queries';

export interface HybridStats {
    semanticResultCount: number;
    fts5ResultCount: number;
    fts5TableExists: boolean;
    degraded: boolean;
    durationMs: number;
    semanticLatencyMs: number;
    fts5LatencyMs: number;
}

export interface HybridSearchResult {
    results: KnowledgeNode[];
    stats: HybridStats;
}

interface ScoredNode extends KnowledgeNode {
    hybridScore: number;
    semanticScore: number;
    fts5Rank: number | null;
}

export class HybridSearchService {
    async searchHybrid(
        db: Database.Database,
        query: string,
        options: VectorSearchOptions & { semanticWeight?: number } = {}
    ): Promise<HybridSearchResult> {
        const start = Date.now();
        const semanticWeight = options.semanticWeight ?? 0.7;
        const limit = options.limit || 5;

        // Semantic branch
        const semStart = Date.now();
        const semanticResults = await vectorSearch.search(db, query, {
            limit: limit * 3,
            profile: options.profile
        });
        const semanticLatencyMs = Date.now() - semStart;

        // FTS5 branch
        const ftsStart = Date.now();
        const fts5TableExists = this.fts5TableExists(db);
        let fts5RankMap = new Map<number, number>();

        if (fts5TableExists) {
            fts5RankMap = this.runFts5Query(db, query);
        }
        const fts5LatencyMs = Date.now() - ftsStart;

        const fts5ResultCount = fts5RankMap.size;
        const degraded = !fts5TableExists || fts5ResultCount === 0;

        // Build combined pool
        const hybridPool: ScoredNode[] = semanticResults.map((node: any) => ({
            ...node,
            semanticScore: (node as any).similarity ?? 0,
            fts5Rank: fts5RankMap.get(node.id) ?? null,
            hybridScore: 0
        }));

        // FTS5-only results not in semantic results
        if (!degraded) {
            const semanticIds = new Set(hybridPool.map(n => n.id));
            const fts5OnlyIds = [...fts5RankMap.keys()].filter(id => !semanticIds.has(id));
            if (fts5OnlyIds.length > 0) {
                const placeholders = fts5OnlyIds.map(() => '?').join(',');
                const extraNodes = db.prepare(
                    `SELECT * FROM knowledge_nodes WHERE id IN (${placeholders})`
                ).all(...fts5OnlyIds) as KnowledgeNode[];
                for (const node of extraNodes) {
                    hybridPool.push({
                        ...node, semanticScore: 0,
                        fts5Rank: fts5RankMap.get(node.id) ?? 0,
                        hybridScore: 0
                    } as ScoredNode);
                }
            }
        }

        // Min-max normalize + fuse
        const semanticScores = hybridPool.map(n => n.semanticScore);
        const fts5Scores = hybridPool.map(n => n.fts5Rank ?? 0);
        const semMin = Math.min(...semanticScores);
        const semMax = Math.max(...semanticScores);
        const fts5Min = Math.min(...fts5Scores);
        const fts5Max = Math.max(...fts5Scores);
        const normSem = (v: number) => (semMax === semMin) ? 0 : (v - semMin) / (semMax - semMin);
        const normFts5 = (v: number) => (fts5Max === fts5Min) ? 0 : (v - fts5Min) / (fts5Max - fts5Min);

        for (const node of hybridPool) {
            const ns = normSem(node.semanticScore);
            const nf = node.fts5Rank !== null ? normFts5(node.fts5Rank) : 0;
            node.hybridScore = semanticWeight * ns + (1 - semanticWeight) * nf;
        }

        const results = hybridPool
            .sort((a, b) => b.hybridScore - a.hybridScore)
            .slice(0, limit);

        const durationMs = Date.now() - start;

        const stats: HybridStats = {
            semanticResultCount: semanticResults.length,
            fts5ResultCount, fts5TableExists, degraded,
            durationMs, semanticLatencyMs, fts5LatencyMs
        };

        console.log(
            `⬡ HYBRID_SEARCH_STATS :: ` +
            `query="${query.slice(0, 60)}" ` +
            `semanticResults=${semanticResults.length} ` +
            `fts5Results=${fts5ResultCount} ` +
            `fts5TableExists=${fts5TableExists} ` +
            `degraded=${degraded} ` +
            `durationMs=${durationMs}`
        );

        return { results, stats };
    }

    private fts5TableExists(db: Database.Database): boolean {
        try {
            const row = db.prepare(
                `SELECT name FROM sqlite_master WHERE name='semantic_memory'`
            ).get() as { name: string } | undefined;
            return Boolean(row?.name);
        } catch {
            return false;
        }
    }

    private runFts5Query(db: Database.Database, query: string): Map<number, number> {
        const rankMap = new Map<number, number>();
        try {
            const sanitized = query
                .replace(/[^a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\s-]/g, '')
                .trim();
            if (!sanitized) return rankMap;

            const rows = db.prepare(`
                SELECT rowid, rank
                FROM semantic_memory
                WHERE semantic_memory MATCH ?
                ORDER BY rank
                LIMIT 50
            `).all(sanitized) as { rowid: number; rank: number }[];

            for (const row of rows) {
                const score = -row.rank;
                const node = db.prepare(`
                    SELECT id FROM knowledge_nodes
                    WHERE instr(content, (SELECT lesson_content FROM semantic_memory WHERE rowid = ?))
                `).get(row.rowid) as { id: number } | undefined;
                if (node) {
                    rankMap.set(node.id, score);
                }
            }
        } catch (e: any) {
            console.warn(`⬡ HYBRID_SEARCH_FTS5_ERROR :: ${e.message}`);
        }
        return rankMap;
    }
}

export const hybridSearch = new HybridSearchService();
