import Database from 'better-sqlite3';
import { neuralForge } from './neuralForgeService';
import { KnowledgeNode } from '../models/queries';
import { RetrievalProfile } from './smartRouter';
import { memoryGovernor } from './memoryGovernorService';

export interface VectorSearchOptions {
    limit?: number;
    profile?: RetrievalProfile;
}

/**
 * VECTOR SEARCH SERVICE
 * Performs local semantic similarity search using Ollama embeddings.
 */
export class VectorSearchService {
    /**
     * Search the vault for semantically similar content.
     */
    async search(
        db: Database.Database,
        query: string,
        limitOrOptions: number | VectorSearchOptions = 5
    ): Promise<KnowledgeNode[]> {
        const options = typeof limitOrOptions === 'number'
            ? { limit: limitOrOptions }
            : limitOrOptions;

        const limit = options.limit || 5;
        const profile = options.profile;

        console.log(`⬡ VECTOR_SEARCH :: Query: "${query}" :: profile=${profile || 'DEFAULT'}`);

        const queryVector = await neuralForge.getEmbedding(query);
        if (!queryVector) {
            console.error('⬡ VECTOR_SEARCH_ERROR :: Failed to generate query embedding.');
            return [];
        }

        const nodes = db.prepare('SELECT * FROM knowledge_nodes WHERE embedding IS NOT NULL').all() as KnowledgeNode[];
        if (nodes.length === 0) {
            console.warn('⬡ VECTOR_SEARCH_WARNING :: No embedded nodes found in DB.');
            return [];
        }

        const filteredNodes = memoryGovernor
            .filterKnowledgeNodes(nodes.filter((node) => this.matchesProfile(node, profile)));
        const scoredNodes = filteredNodes.map((node) => {
            const nodeVector = JSON.parse(node.embedding!);
            const similarity = this.cosineSimilarity(queryVector, nodeVector);
            const weightedScore = similarity * this.profileWeight(node, profile) * node.memoryScoreMultiplier;
            return { ...node, similarity: weightedScore };
        });

        const results = scoredNodes
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
        memoryGovernor.recordRetrieval(results.map((node) => node.memoryItemId), 'vector_search', { query, profile });
        return results;
    }

    private matchesProfile(node: KnowledgeNode, profile?: RetrievalProfile) {
        const sourcePath = node.source_path || '';
        const domain = node.domain || '';
        const isYuriNode = sourcePath.startsWith('backend/')
            || sourcePath.startsWith('_SYSTEM/')
            || sourcePath.startsWith('NISABA/')
            || sourcePath.startsWith('NEURAL-NETWORK/')
            || sourcePath.startsWith('00_COMMAND-CENTER/')
            || ['SYSTEM', 'NEURAL', 'COMMAND', 'DEPLOYMENT', 'INGESTION', 'SWARM', 'DEFENSE', 'QUALITY'].includes(domain);

        if (!profile) return isYuriNode;

        if (profile === 'YURI_SYSTEM') {
            return isYuriNode;
        }

        return sourcePath.startsWith('backend/')
            || sourcePath.startsWith('_SYSTEM/')
            || sourcePath.startsWith('00_COMMAND-CENTER/');
    }

    private profileWeight(node: KnowledgeNode, profile?: RetrievalProfile) {
        if (!profile) return 1;

        const sourcePath = node.source_path || '';
        const domain = node.domain || '';

        if (profile === 'YURI_SYSTEM') {
            if (sourcePath.startsWith('backend/')) return 1.35;
            if (sourcePath.startsWith('_SYSTEM/') || sourcePath.startsWith('NISABA/')) return 1.25;
            if (sourcePath.startsWith('00_COMMAND-CENTER/') || sourcePath.startsWith('NEURAL-NETWORK/')) return 1.15;
            if (domain === 'SYSTEM' || domain === 'NEURAL' || domain === 'COMMAND') return 1.1;
            return 0.75;
        }

        if (sourcePath.startsWith('backend/') || sourcePath.startsWith('_SYSTEM/')) return 1.15;
        return 1;
    }

    /**
     * Basic Cosine Similarity calculation
     */
    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Hybrid search: semantic + FTS5 keyword fusion.
     * Delegates to HybridSearchService.
     */
    async searchHybrid(
        db: Database.Database,
        query: string,
        options: VectorSearchOptions & { semanticWeight?: number } = {}
    ): Promise<{ results: KnowledgeNode[]; stats: any }> {
        const { hybridSearch } = require('./hybridSearchService');
        return hybridSearch.searchHybrid(db, query, options);
    }
}

export const vectorSearch = new VectorSearchService();
