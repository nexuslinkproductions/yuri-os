import { NotebookService } from './notebookService';
import { neuralForge } from './neuralForgeService';

export interface EntityFreqData {
    entity: string;
    count: number;
    type: 'person' | 'org' | 'place' | 'concept';
}

export interface TemporalPoint {
    date: string;
    eventTitle: string;
    count: number;
}

export interface TopicNode {
    id: string;
    label: string;
    weight: number;
}

export interface TopicEdge {
    source: string;
    target: string;
    weight: number;
}

export interface SentimentResult {
    positive: number;
    neutral: number;
    negative: number;
    compound: number;
}

interface CacheEntry<T> {
    data: T;
    expires: number;
}

export class NotebookVizService {
    private notebookService: NotebookService;
    private cache = new Map<string, CacheEntry<unknown>>();
    private TTL = 5 * 60 * 1000;

    constructor(notebookService: NotebookService) {
        this.notebookService = notebookService;
    }

    async getEntityFrequencies(notebookId: number): Promise<EntityFreqData[]> {
        return this.cached(`entities:${notebookId}`, async () => {
            const text = this.getSourceText(notebookId);
            const prompt = `Analyze the following text and extract named entities. Return ONLY valid JSON array in this exact format:
[{"entity": "Name", "count": N, "type": "person|org|place|concept"}]
Extract 10-20 most prominent entities. Sort by count descending.

Text:
${text.slice(0, 8000)}`;
            return await this.extractJson<EntityFreqData[]>(prompt, 'entity-freq') || [];
        });
    }

    async getTemporalSeries(notebookId: number): Promise<TemporalPoint[]> {
        return this.cached(`temporal:${notebookId}`, async () => {
            const text = this.getSourceText(notebookId);
            const prompt = `Analyze the following text and extract all temporal events, dates, and time references. Return ONLY valid JSON array:
[{"date": "YYYY-MM-DD or descriptive period", "eventTitle": "Brief event description", "count": 1}]
Extract up to 15 events. Sort chronologically.

Text:
${text.slice(0, 8000)}`;
            return await this.extractJson<TemporalPoint[]>(prompt, 'temporal') || [];
        });
    }

    async getTopicGraph(notebookId: number): Promise<{ nodes: TopicNode[]; edges: TopicEdge[] }> {
        return this.cached(`topics:${notebookId}`, async () => {
            const text = this.getSourceText(notebookId);
            const prompt = `Analyze the following text and identify topic clusters and their relationships. Return ONLY valid JSON object:
{"nodes": [{"id": "topic-id", "label": "Topic Name", "weight": 0.0-1.0}], "edges": [{"source": "id1", "target": "id2", "weight": 0.0-1.0}]}
Include 8-12 nodes and meaningful edges showing topic co-occurrence.

Text:
${text.slice(0, 8000)}`;
            return await this.extractJson<{ nodes: TopicNode[]; edges: TopicEdge[] }>(prompt, 'topics') || { nodes: [], edges: [] };
        });
    }

    async getSentiment(notebookId: number): Promise<SentimentResult> {
        return this.cached(`sentiment:${notebookId}`, async () => {
            const text = this.getSourceText(notebookId);
            const prompt = `Perform sentiment analysis on the following text. Return ONLY valid JSON:
{"positive": 0.0-1.0, "neutral": 0.0-1.0, "negative": 0.0-1.0, "compound": -1.0 to 1.0}
Ensure positive + neutral + negative = 1.0. compound is -1 (most negative) to +1 (most positive).

Text:
${text.slice(0, 8000)}`;
            return await this.extractJson<SentimentResult>(prompt, 'sentiment') || { positive: 0.33, neutral: 0.34, negative: 0.33, compound: 0 };
        });
    }

    private getSourceText(notebookId: number): string {
        const chunks = this.notebookService.getEmbeddedChunks(notebookId);
        if (chunks.length === 0) {
            // Fall back to all chunks (not yet embedded)
            const sources = this.notebookService.listSources(notebookId);
            return sources.map(s => s.title).join('. ');
        }
        return chunks.map(c => c.content).join('\n\n');
    }

    private async extractJson<T>(prompt: string, label: string): Promise<T | null> {
        try {
            const response = await neuralForge.chat(
                'qwen-liberated:latest',
                [{ role: 'user', content: prompt }],
                'You are a JSON extraction assistant. Return only valid JSON, no markdown code blocks, no explanations.'
            );

            const raw = response.content?.trim() || '';
            // Strip markdown code blocks if model disobeys
            const cleaned = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
            return JSON.parse(cleaned) as T;
        } catch (e: any) {
            console.error(`⬡ NOTEBOOK_VIZ_ERROR :: ${label} :: ${e.message}`);
            return null;
        }
    }

    private async cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
        const existing = this.cache.get(key) as CacheEntry<T> | undefined;
        if (existing && existing.expires > Date.now()) return existing.data;

        const data = await fn();
        this.cache.set(key, { data, expires: Date.now() + this.TTL });
        return data;
    }

    invalidateCache(notebookId: number): void {
        for (const key of this.cache.keys()) {
            if (key.includes(`:${notebookId}`)) this.cache.delete(key);
        }
    }
}
