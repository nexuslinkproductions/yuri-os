import { NotebookService, NotebookChunk } from './notebookService';
import { neuralForge } from './neuralForgeService';
import { memoryGovernor } from './memoryGovernorService';
import { ollamaProvider } from './providers/ollamaProvider';
import type { CompressionMode } from './smartRouter';
import { ollamaContextGovernor } from './ollamaContextGovernor';
import type { OllamaContextGovernorResult } from './ollamaContextGovernor';

const TOP_K = 5;

export interface RagCitation {
    chunk_id: number;
    source_title: string;
    excerpt: string;
}

export interface StreamRagOptions {
    notebookId: number;
    query: string;
    modelId: string;
    onToken: (token: string) => void;
    onCitation: (citation: RagCitation) => void;
    onDone: (fullContent: string) => void;
    onError: (msg: string) => void;
    compressionMode?: CompressionMode;
    signal?: AbortSignal;
}

type EmbeddedChunk = NotebookChunk & { source_title: string };
type GovernedRagChunk = EmbeddedChunk & { memoryItemId?: number; semanticScore?: number };

export class NotebookRagService {
    private notebookService: NotebookService;

    constructor(notebookService: NotebookService) {
        this.notebookService = notebookService;
    }

    async streamAnswer(opts: StreamRagOptions): Promise<void> {
        const { notebookId, query, modelId, onToken, onCitation, onDone, onError, compressionMode = 'safe', signal } = opts;

        const embeddedChunks = this.notebookService.getEmbeddedChunks(notebookId);
        if (embeddedChunks.length === 0) {
            onError('No embedded sources in this notebook yet. Please wait for ingestion to complete.');
            return;
        }

        const queryEmbedding = await neuralForge.getEmbedding(query, 'nomic-embed-text', { allowCloud: false });
        if (!queryEmbedding) {
            onError('Failed to generate query embedding. Is Ollama running?');
            return;
        }

        const topChunks = this.retrieveTopK(embeddedChunks, queryEmbedding, TOP_K);
        const governed = await this.buildGovernedContext(topChunks, {
            query,
            modelId,
            compressionMode
        });
        const selectedIds = new Set([...governed.selectedChunkIds, ...governed.summarizedChunkIds]);
        const selectedChunks = topChunks.filter(chunk => selectedIds.has(chunk.id));

        const citations = selectedChunks.map(chunk => ({
            chunk_id: chunk.id,
            source_title: chunk.source_title,
            excerpt: chunk.content.slice(0, 200) + (chunk.content.length > 200 ? '...' : '')
        }));

        const systemPrompt = this.buildSystemPrompt(governed.contextText);
        const usedChunkIds = selectedChunks.map(c => c.id);

        try {
            const result = await ollamaProvider.streamChat({
                model: modelId,
                system: systemPrompt,
                messages: [{ role: 'user', content: query }],
                runtime: 'local',
                signal,
                options: {
                    num_ctx: governed.recommendedNumCtx
                },
                operationType: 'notebook_rag_answer',
                metadata: {
                    notebook_id: notebookId,
                    top_k: topChunks.length,
                    compression_mode: governed.compressionMode,
                    context_input_chars: governed.contextInputChars,
                    context_output_chars: governed.contextOutputChars,
                    compression_ratio: governed.compressionRatio,
                    selected_chunks: governed.selectedChunkIds,
                    summarized_chunks: governed.summarizedChunkIds,
                    omitted_chunks: governed.omittedChunkIds,
                    num_ctx: governed.recommendedNumCtx
                },
                onToken
            });
            const fullContent = result.content;

            this.notebookService.saveMessage(notebookId, 'assistant', fullContent, usedChunkIds);
            memoryGovernor.recordRetrieval(selectedChunks.map(c => c.memoryItemId), 'notebook_rag', { notebookId, query });
            for (const citation of citations) {
                onCitation(citation);
            }
            onDone(fullContent);
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                onError(e.message || 'RAG_STREAM_FAILED');
            }
        }
    }

    private retrieveTopK(chunks: EmbeddedChunk[], queryVec: number[], k: number): GovernedRagChunk[] {
        return chunks
            .filter(c => c.embedding != null)
            .map(c => {
                const decision = memoryGovernor.governKnowledgeNode({
                    id: c.id,
                    title: c.source_title,
                    content: c.content,
                    source_path: `notebook:${c.source_id}:${c.chunk_index}`,
                    node_type: 'NOTEBOOK_CHUNK',
                    tags: c.metadata,
                    domain: 'NOTEBOOK',
                    embedding: c.embedding,
                    created_at: c.created_at
                });
                const score = decision.allowed
                    ? this.cosineSimilarity(queryVec, JSON.parse(c.embedding!)) * decision.multiplier
                    : -1;
                return {
                    chunk: { ...c, memoryItemId: decision.itemId, semanticScore: score },
                    score
                };
            })
            .filter(r => r.score >= 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, k)
            .map(r => r.chunk);
    }

    private buildSystemPrompt(contextText: string): string {
        return [
            'You are an expert research assistant with access to the following source material.',
            'Answer the user\'s question based ONLY on the provided sources.',
            'Be thorough, accurate, and cite only source numbers included in SOURCE CONTENT.',
            'If the sources don\'t contain enough information, say so clearly.',
            '',
            '## Source Material',
            '',
            contextText
        ].join('\n');
    }

    private async buildGovernedContext(
        chunks: GovernedRagChunk[],
        options: { query: string; modelId: string; compressionMode: CompressionMode }
    ): Promise<OllamaContextGovernorResult> {
        try {
            return await ollamaContextGovernor.govern({
                query: options.query,
                modelId: options.modelId,
                requestedNumCtx: 8192,
                compressionMode: options.compressionMode,
                taskType: 'rag_answer',
                chunks: chunks.map(chunk => ({
                    id: chunk.id,
                    content: chunk.content,
                    sourceTitle: chunk.source_title,
                    sourceId: chunk.source_id,
                    chunkIndex: chunk.chunk_index,
                    semanticScore: chunk.semanticScore,
                    createdAt: chunk.created_at
                }))
            });
        } catch (error: any) {
            console.warn(`⬡ OLLAMA_CONTEXT_GOVERNOR_FALLBACK :: rag_answer :: ${error.message}`);
            return ollamaContextGovernor.govern({
                query: options.query,
                modelId: options.modelId,
                requestedNumCtx: 8192,
                compressionMode: 'off',
                taskType: 'rag_answer',
                chunks: chunks.map(chunk => ({
                    id: chunk.id,
                    content: chunk.content,
                    sourceTitle: chunk.source_title,
                    sourceId: chunk.source_id,
                    chunkIndex: chunk.chunk_index,
                    semanticScore: chunk.semanticScore,
                    createdAt: chunk.created_at
                }))
            });
        }
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
