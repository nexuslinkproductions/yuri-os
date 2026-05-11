import type { CompressionMode } from './smartRouter';

export type OllamaContextTaskType = 'rag_answer' | 'doc_generate' | 'benchmark';

export interface OllamaContextChunk {
    id: number | string;
    content: string;
    sourceTitle: string;
    sourceType?: string;
    sourceWordCount?: number;
    sourceId?: number | string;
    chunkIndex?: number;
    semanticScore?: number;
    createdAt?: string;
}

export interface OllamaContextGovernorInput {
    query: string;
    chunks: OllamaContextChunk[];
    modelId: string;
    requestedNumCtx?: number;
    compressionMode?: CompressionMode;
    taskType: OllamaContextTaskType;
    promptOverheadChars?: number;
    maxContextChars?: number;
    summarizeChunk?: (chunk: OllamaContextChunk) => Promise<string>;
}

export interface OllamaContextGovernorResult {
    sourceManifest: string;
    contextText: string;
    selectedChunkIds: Array<number | string>;
    summarizedChunkIds: Array<number | string>;
    omittedChunkIds: Array<number | string>;
    compressionMode: CompressionMode;
    compressionRatio: number;
    contextInputChars: number;
    contextOutputChars: number;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    requestedNumCtx: number;
    recommendedNumCtx: number;
    selectedSourceNumbers: number[];
}

interface ScoredChunk {
    chunk: OllamaContextChunk;
    originalIndex: number;
    sourceNumber: number;
    score: number;
}

const DEFAULT_NUM_CTX: Record<OllamaContextTaskType, number> = {
    rag_answer: 8192,
    doc_generate: 32768,
    benchmark: 8192
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
    pdf: 'PDF',
    docx: 'DOCX',
    audio: 'Audio',
    video: 'Video',
    url: 'Web',
    obsidian: 'Vault Note'
};

const AGGRESSIVE_SUMMARY_CHAR_LIMIT = 1800;

export class OllamaContextGovernor {
    async govern(input: OllamaContextGovernorInput): Promise<OllamaContextGovernorResult> {
        const mode = input.compressionMode || 'safe';
        const chunks = input.chunks || [];
        const requestedNumCtx = input.requestedNumCtx || DEFAULT_NUM_CTX[input.taskType] || 8192;
        const sourceNumbers = this.buildSourceNumbers(chunks);
        const sourceManifest = this.buildSourceManifest(chunks, sourceNumbers);
        const rawContext = this.renderContext(chunks.map((chunk, originalIndex) => ({
            chunk,
            originalIndex,
            sourceNumber: sourceNumbers.get(this.sourceKey(chunk)) || originalIndex + 1,
            score: 1
        })));
        const contextInputChars = rawContext.length + sourceManifest.length;

        if (!chunks.length || mode === 'off') {
            return this.buildResult({
                chunks,
                selected: chunks.map((chunk, originalIndex) => ({
                    chunk,
                    originalIndex,
                    sourceNumber: sourceNumbers.get(this.sourceKey(chunk)) || originalIndex + 1,
                    score: 1
                })),
                summaries: [],
                omitted: [],
                sourceManifest,
                sourceNumbers,
                mode,
                requestedNumCtx,
                contextInputChars,
                promptOverheadChars: input.promptOverheadChars || 0
            });
        }

        const budgetChars = this.contextBudgetChars(input, requestedNumCtx);
        if (contextInputChars + (input.promptOverheadChars || 0) <= budgetChars) {
            return this.buildResult({
                chunks,
                selected: chunks.map((chunk, originalIndex) => ({
                    chunk,
                    originalIndex,
                    sourceNumber: sourceNumbers.get(this.sourceKey(chunk)) || originalIndex + 1,
                    score: 1
                })),
                summaries: [],
                omitted: [],
                sourceManifest,
                sourceNumbers,
                mode,
                requestedNumCtx,
                contextInputChars,
                promptOverheadChars: input.promptOverheadChars || 0
            });
        }

        const scored = this.scoreChunks(chunks, input.query, sourceNumbers);
        const selected = this.selectWithinBudget(scored, budgetChars - sourceManifest.length - (input.promptOverheadChars || 0), mode);
        const selectedIds = new Set(selected.map(item => item.chunk.id));
        const omitted = scored.filter(item => !selectedIds.has(item.chunk.id));
        const summaries = await this.buildAggressiveSummaries(omitted, input, budgetChars, sourceManifest.length, selected);
        const summaryIds = new Set(summaries.map(item => item.chunk.id));

        return this.buildResult({
            chunks,
            selected,
            summaries,
            omitted: omitted.filter(item => !summaryIds.has(item.chunk.id)),
            sourceManifest,
            sourceNumbers,
            mode,
            requestedNumCtx,
            contextInputChars,
            promptOverheadChars: input.promptOverheadChars || 0
        });
    }

    estimateTokens(content: string): number {
        if (!content) return 0;
        return Math.max(1, Math.ceil(content.length / 4));
    }

    private scoreChunks(chunks: OllamaContextChunk[], query: string, sourceNumbers: Map<string, number>): ScoredChunk[] {
        return chunks
            .map((chunk, originalIndex) => {
                const semantic = this.clamp01(((chunk.semanticScore ?? 0) + 1) / 2);
                const lexical = this.lexicalOverlap(query, chunk.content);
                const position = chunks.length <= 1 ? 0 : originalIndex / (chunks.length - 1);
                const trigRetention = 0.5 + (0.35 * Math.cos(Math.PI * position)) + (0.15 * Math.sin(2 * Math.PI * position));
                const recency = chunks.length <= 1 ? 1 : originalIndex / (chunks.length - 1);
                const attentionSink = originalIndex < 2 || originalIndex >= chunks.length - 2 ? 0.15 : 0;
                const score = (semantic * 0.42) + (lexical * 0.28) + (this.clamp01(trigRetention) * 0.16) + (recency * 0.09) + attentionSink;

                return {
                    chunk,
                    originalIndex,
                    sourceNumber: sourceNumbers.get(this.sourceKey(chunk)) || originalIndex + 1,
                    score
                };
            })
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.originalIndex - b.originalIndex;
            });
    }

    private selectWithinBudget(scored: ScoredChunk[], budgetChars: number, mode: CompressionMode): ScoredChunk[] {
        const effectiveBudget = Math.max(1200, budgetChars);
        const selected: ScoredChunk[] = [];
        const sourceHits = new Map<number, number>();
        let used = 0;

        for (const item of scored) {
            const sourcePenalty = (sourceHits.get(item.sourceNumber) || 0) * (mode === 'aggressive' ? 0.22 : 0.12);
            const adjusted = item.score - sourcePenalty;
            if (adjusted < (mode === 'aggressive' ? 0.18 : 0.08) && selected.length > 0) continue;

            const renderedLength = this.renderChunk(item).length + 8;
            if (used + renderedLength > effectiveBudget && selected.length > 0) continue;

            selected.push(item);
            used += renderedLength;
            sourceHits.set(item.sourceNumber, (sourceHits.get(item.sourceNumber) || 0) + 1);
        }

        return selected.sort((a, b) => a.originalIndex - b.originalIndex);
    }

    private async buildAggressiveSummaries(
        omitted: ScoredChunk[],
        input: OllamaContextGovernorInput,
        budgetChars: number,
        manifestChars: number,
        selected: ScoredChunk[]
    ): Promise<ScoredChunk[]> {
        if (input.compressionMode !== 'aggressive' || !input.summarizeChunk) return [];

        const selectedLength = this.renderContext(selected).length;
        let remaining = Math.max(0, budgetChars - manifestChars - selectedLength - (input.promptOverheadChars || 0));
        const summaries: ScoredChunk[] = [];

        for (const item of omitted.filter(entry => entry.chunk.content.length > AGGRESSIVE_SUMMARY_CHAR_LIMIT).slice(0, 3)) {
            if (remaining < 600) break;
            const summary = (await input.summarizeChunk(item.chunk)).trim();
            if (!summary) continue;
            const summarizedChunk = {
                ...item.chunk,
                content: summary.length > 1200 ? `${summary.slice(0, 1200)}...` : summary
            };
            const summarizedItem = { ...item, chunk: summarizedChunk };
            const renderedLength = this.renderChunk(summarizedItem, true).length + 8;
            if (renderedLength > remaining) continue;
            summaries.push(summarizedItem);
            remaining -= renderedLength;
        }

        return summaries.sort((a, b) => a.originalIndex - b.originalIndex);
    }

    private buildResult(args: {
        chunks: OllamaContextChunk[];
        selected: ScoredChunk[];
        summaries: ScoredChunk[];
        omitted: ScoredChunk[];
        sourceManifest: string;
        sourceNumbers: Map<string, number>;
        mode: CompressionMode;
        requestedNumCtx: number;
        contextInputChars: number;
        promptOverheadChars: number;
    }): OllamaContextGovernorResult {
        const selectedContext = this.renderContext(args.selected);
        const summaryContext = args.summaries.length
            ? `\n\n## Compressed Source Summaries\n\n${this.renderContext(args.summaries, true)}`
            : '';
        const contextText = `${args.sourceManifest}\n\n## SOURCE CONTENT\n\n${selectedContext}${summaryContext}`.trim();
        const contextOutputChars = contextText.length;
        const estimatedOutputTokens = this.estimateTokens(contextText) + this.estimateTokens(String(args.promptOverheadChars));
        const selectedSourceNumbers = Array.from(new Set([...args.selected, ...args.summaries].map(item => item.sourceNumber))).sort((a, b) => a - b);

        return {
            sourceManifest: args.sourceManifest,
            contextText,
            selectedChunkIds: args.selected.map(item => item.chunk.id),
            summarizedChunkIds: args.summaries.map(item => item.chunk.id),
            omittedChunkIds: args.omitted.map(item => item.chunk.id),
            compressionMode: args.mode,
            compressionRatio: args.contextInputChars === 0 ? 1 : Number((contextOutputChars / args.contextInputChars).toFixed(3)),
            contextInputChars: args.contextInputChars,
            contextOutputChars,
            estimatedInputTokens: this.estimateTokensFromChars(args.contextInputChars),
            estimatedOutputTokens,
            requestedNumCtx: args.requestedNumCtx,
            recommendedNumCtx: Math.max(2048, Math.min(args.requestedNumCtx, Math.ceil(estimatedOutputTokens * 1.25))),
            selectedSourceNumbers
        };
    }

    private renderContext(items: ScoredChunk[], summarized = false): string {
        return items.map(item => this.renderChunk(item, summarized)).join('\n\n---\n\n');
    }

    private renderChunk(item: ScoredChunk, summarized = false): string {
        const label = summarized ? 'SUMMARY' : 'CONTENT';
        const index = item.chunk.chunkIndex !== undefined ? ` chunk ${item.chunk.chunkIndex}` : '';
        return `### [SOURCE ${item.sourceNumber} ${label}: "${item.chunk.sourceTitle}"${index}]\n${item.chunk.content}`;
    }

    private buildSourceManifest(chunks: OllamaContextChunk[], sourceNumbers: Map<string, number>): string {
        const bySource = new Map<string, OllamaContextChunk>();
        for (const chunk of chunks) {
            const key = this.sourceKey(chunk);
            if (!bySource.has(key)) bySource.set(key, chunk);
        }

        const lines = Array.from(bySource.values())
            .sort((a, b) => (sourceNumbers.get(this.sourceKey(a)) || 0) - (sourceNumbers.get(this.sourceKey(b)) || 0))
            .map(chunk => {
                const number = sourceNumbers.get(this.sourceKey(chunk)) || 0;
                const type = chunk.sourceType ? SOURCE_TYPE_LABELS[chunk.sourceType] || chunk.sourceType : 'Source';
                const words = chunk.sourceWordCount ? `, ~${Number(chunk.sourceWordCount).toLocaleString()} words` : '';
                return `[${number}] "${chunk.sourceTitle}" (${type}${words})`;
            });

        return ['## SOURCE MANIFEST', ...lines].join('\n');
    }

    private buildSourceNumbers(chunks: OllamaContextChunk[]): Map<string, number> {
        const sourceNumbers = new Map<string, number>();
        for (const chunk of chunks) {
            const key = this.sourceKey(chunk);
            if (!sourceNumbers.has(key)) sourceNumbers.set(key, sourceNumbers.size + 1);
        }
        return sourceNumbers;
    }

    private sourceKey(chunk: OllamaContextChunk): string {
        return String(chunk.sourceId ?? chunk.sourceTitle);
    }

    private contextBudgetChars(input: OllamaContextGovernorInput, requestedNumCtx: number): number {
        const reservedOutputTokens = input.taskType === 'doc_generate' ? 7000 : 1400;
        const tokenBudgetChars = Math.max(1600, (requestedNumCtx - reservedOutputTokens) * 4);
        const capped = input.maxContextChars ? Math.min(tokenBudgetChars, input.maxContextChars) : tokenBudgetChars;
        return Math.max(1600, capped);
    }

    private estimateTokensFromChars(chars: number): number {
        return Math.max(1, Math.ceil(chars / 4));
    }

    private lexicalOverlap(query: string, content: string): number {
        const terms = Array.from(new Set((query || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []));
        if (!terms.length) return 0;
        const lower = content.toLowerCase();
        const hits = terms.filter(term => lower.includes(term)).length;
        return hits / terms.length;
    }

    private clamp01(value: number): number {
        if (!Number.isFinite(value)) return 0;
        return Math.max(0, Math.min(1, value));
    }
}

export const ollamaContextGovernor = new OllamaContextGovernor();
