import { NotebookService, NotebookChunk } from './notebookService';
import { neuralForge } from './neuralForgeService';
import { memoryGovernor } from './memoryGovernorService';

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
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
    signal?: AbortSignal;
}

type EmbeddedChunk = NotebookChunk & { source_title: string };

export class NotebookRagService {
    private notebookService: NotebookService;

    constructor(notebookService: NotebookService) {
        this.notebookService = notebookService;
    }

    async streamAnswer(opts: StreamRagOptions): Promise<void> {
        const { notebookId, query, modelId, onToken, onCitation, onDone, onError, signal } = opts;

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

        const citations = topChunks.map(chunk => ({
            chunk_id: chunk.id,
            source_title: chunk.source_title,
            excerpt: chunk.content.slice(0, 200) + (chunk.content.length > 200 ? '…' : '')
        }));

        const systemPrompt = this.buildSystemPrompt(topChunks);
        const usedChunkIds = topChunks.map(c => c.id);

        try {
            const upstream = await fetch(`${OLLAMA_BASE}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelId,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: query }
                    ],
                    stream: true
                }),
                signal
            });

            if (!upstream.ok) throw new Error(`Ollama HTTP ${upstream.status}`);
            if (!upstream.body) throw new Error('No response body');

            let fullContent = '';
            const reader = upstream.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const text = decoder.decode(value, { stream: true });
                for (const line of text.split('\n').filter(Boolean)) {
                    try {
                        const parsed = JSON.parse(line);
                        const token = parsed?.message?.content || '';
                        if (token) {
                            fullContent += token;
                            onToken(token);
                        }
                        if (parsed?.done) break;
                    } catch (_) {}
                }
            }

            this.notebookService.saveMessage(notebookId, 'assistant', fullContent, usedChunkIds);
            memoryGovernor.recordRetrieval(topChunks.map(c => c.memoryItemId), 'notebook_rag', { notebookId, query });
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

    private retrieveTopK(chunks: EmbeddedChunk[], queryVec: number[], k: number): Array<EmbeddedChunk & { memoryItemId?: number }> {
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
                return {
                    chunk: { ...c, memoryItemId: decision.itemId },
                    score: decision.allowed
                        ? this.cosineSimilarity(queryVec, JSON.parse(c.embedding!)) * decision.multiplier
                        : -1
                };
            })
            .filter(r => r.score >= 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, k)
            .map(r => r.chunk);
    }

    private buildSystemPrompt(chunks: EmbeddedChunk[]): string {
        const contextBlocks = chunks.map((c, i) =>
            `[SOURCE ${i + 1}: ${c.source_title}]\n${c.content}`
        ).join('\n\n---\n\n');

        return [
            'You are an expert research assistant with access to the following source material.',
            'Answer the user\'s question based ONLY on the provided sources.',
            'Be thorough, accurate, and cite sources naturally (e.g., "According to [SOURCE 1]...").',
            'If the sources don\'t contain enough information, say so clearly.',
            '',
            '## Source Material',
            '',
            contextBlocks
        ].join('\n');
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
