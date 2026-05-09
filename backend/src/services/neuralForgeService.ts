import axios, { AxiosInstance } from 'axios';
import http from 'http';
import https from 'https';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { anthropicProvider } from './providers/anthropicProvider';
import { googleProvider } from './providers/googleProvider';
import { openaiProvider } from './providers/openaiProvider';
import { tokenGovernor } from './tokenGovernor';
import { vectorSearch } from './vectorSearchService';
import {
    CompressionMode,
    PreferredRuntime,
    ReasoningBudget,
    RetrievalProfile,
    RoutingDecision,
    RoutingRequestOptions,
    SmartRouter
} from './smartRouter';
import { CompressionStats, promptCompression } from './promptCompressionService';

dotenv.config();

const NATIVE_PROVIDER_TIMEOUT_MS = 60000;
const LOCAL_CHAT_TIMEOUT_MS = 60000;
const TOTAL_CHAT_TIMEOUT_MS = 120000;
const LOCAL_TAG_CACHE_TTL_MS = 30000;

type ProviderStatus = {
    local: boolean;
    cloud: boolean;
    anthropic: boolean;
    google: boolean;
    openai: boolean;
    moonshot: boolean;
    kimi: boolean;
};

export interface NeuralChatOptions extends RoutingRequestOptions {
    providerOptions?: {
        mode?: 'reasoning' | 'instant';
        extraBody?: Record<string, unknown>;
    };
}

export interface NeuralEmbeddingOptions {
    allowCloud?: boolean;
}

export interface ForgeExecutionSnapshot {
    timestamp: string;
    runtime: 'local' | 'cloud' | 'degraded';
    model: string;
    decision: RoutingDecision | null;
    escalated: boolean;
    loopCount: number;
    fallbackCause?: string;
    compressionRatio?: number;
}

export type NeuralChatResponse = {
    id: string;
    role: 'assistant';
    content: string;
    model: string;
    timestamp: string;
    usage?: any;
    context_injected?: boolean;
    status?: 'FORGE_DEGRADED';
    final_summary?: string;
    runtime?: 'local' | 'cloud' | 'degraded';
    compression?: CompressionStats;
    escalated?: boolean;
    loopCount?: number;
    decision?: RoutingDecision;
    ui?: {
        overlay: 'mission_synthesis';
        mode: 'strategic';
        source: 'conclave';
    };
};

type LoopExecutionResult = {
    response: NeuralChatResponse;
    shouldEscalate: boolean;
    fallbackCause?: string;
    loopCount: number;
};

type ProviderType = 'anthropic' | 'google' | 'openai' | 'moonshot' | 'kimi';

/**
 * ⬡ LATENCY_TRACKER
 * Tracks rolling average of Ollama inference response times.
 */
class LatencyTracker {
    private latencies: number[] = [];
    private maxSamples = 10;

    record(ms: number) {
        this.latencies.push(ms);
        if (this.latencies.length > this.maxSamples) this.latencies.shift();
    }

    getAverage(): number {
        if (this.latencies.length === 0) return 0;
        return Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length);
    }
}

class ForgeTelemetryTracker {
    private history: ForgeExecutionSnapshot[] = [];
    private maxEntries = 20;

    record(snapshot: ForgeExecutionSnapshot) {
        this.history.push(snapshot);
        if (this.history.length > this.maxEntries) this.history.shift();
    }

    getLatest() {
        return this.history[this.history.length - 1] || null;
    }

    getRecent(limit: number = 5) {
        return this.history.slice(-limit);
    }
}

export const latencyTracker = new LatencyTracker();
export const forgeTelemetryTracker = new ForgeTelemetryTracker();

/**
 * NeuralForgeService
 * Orchestrates local-first and hybrid inference.
 */
export class NeuralForgeService {
    private ollamaHost: string;
    private cloudEndpoint: string;
    private cloudApiKey: string;
    private kimiEndpoint: string;
    private kimiApiKey: string;
    private gptOssEndpoint: string;
    private gptOssApiKey: string;
    private db: Database.Database | null = null;
    private axiosInstance: AxiosInstance;
    private localModelTagCache: { tags: Set<string>; expiresAt: number } | null = null;

    constructor() {
        this.ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
        this.cloudEndpoint = process.env.OLLAMA_CLOUD_ENDPOINT || 'https://ollama.com';
        this.cloudApiKey = process.env.OLLAMA_CLOUD_API_KEY || '';
        this.kimiEndpoint = process.env.KIMI_BASE_URL || '';
        this.kimiApiKey = process.env.KIMI_API_KEY || '';
        this.gptOssEndpoint = process.env.GPT_OSS_BASE_URL || 'http://localhost:11434/v1';
        this.gptOssApiKey = process.env.GPT_OSS_API_KEY || 'openai';

        this.axiosInstance = axios.create({
            timeout: 125000,
            httpAgent: new http.Agent({ keepAlive: true, maxSockets: 10 }),
            httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 10 })
        });
    }

    setDb(db: Database.Database) {
        this.db = db;
    }

    /**
     * Check if providers are reachable
     */
    async ping(): Promise<ProviderStatus> {
        const status: ProviderStatus = {
            local: false,
            cloud: false,
            anthropic: false,
            google: false,
            openai: false,
            moonshot: false,
            kimi: false
        };

        try {
            await this.axiosInstance.get(`${this.ollamaHost}/api/tags`, { timeout: 1500 });
            status.local = true;
        } catch (e: any) {
            console.log(`⬡ NEURAL_FORGE :: LOCAL_OFFLINE (${e.message})`);
        }

        try {
            if (this.cloudApiKey) {
                await this.axiosInstance.get(`${this.cloudEndpoint}/api/tags`, {
                    headers: { 'Authorization': `Bearer ${this.cloudApiKey}` },
                    timeout: 2000
                });
                status.cloud = true;
            }
        } catch (e: any) {
            console.error(`⬡ NEURAL_FORGE :: CLOUD_OFFLINE (${e.message})`);
        }

        status.anthropic = this.hasConfiguredKey('ANTHROPIC_API_KEY') && !tokenGovernor.isCoolingOff('anthropic');
        status.google = this.hasConfiguredKey('GOOGLE_API_KEY') && !tokenGovernor.isCoolingOff('google');
        status.openai = this.hasConfiguredKey('OPENAI_API_KEY') && !tokenGovernor.isCoolingOff('openai');
        status.moonshot = this.hasConfiguredKey('MOONSHOT_API_KEY') && !tokenGovernor.isCoolingOff('moonshot');
        status.kimi = await this.hasConfiguredKimiServer();

        console.log(`⬡ NEURAL_FORGE :: PING_STATUS ::`, status);
        return status;
    }

    /**
     * Generate an embedding vector for a string
     */
    async getEmbedding(text: string, model: string = 'nomic-embed-text', options: NeuralEmbeddingOptions = {}): Promise<number[] | null> {
        const start = Date.now();
        const isCloud = model.endsWith(':cloud');
        const allowCloud = options.allowCloud !== false;
        const endpoint = isCloud ? this.cloudEndpoint.replace(/\/api$/, '') : this.ollamaHost;
        const actualModel = isCloud ? model.replace(':cloud', '') : model;

        if (isCloud && !allowCloud) {
            console.warn(`⬡ NEURAL_FORGE :: EMBEDDING_CLOUD_BLOCKED_BY_POLICY`);
            return null;
        }

        const headers: Record<string, string> = {};
        if (isCloud && this.cloudApiKey) {
            headers['Authorization'] = `Bearer ${this.cloudApiKey}`;
        }

        try {
            const response = await axios.post(`${endpoint}/api/embeddings`, {
                model: actualModel,
                prompt: text
            }, { headers, timeout: 15000 });

            latencyTracker.record(Date.now() - start);
            return response.data.embedding;
        } catch (e: any) {
            console.error(`⬡ NEURAL_FORGE_EMBEDDING_ERROR :: ${isCloud ? 'CLOUD' : 'LOCAL'} :: ${e.message}`);
            if (!isCloud && this.cloudApiKey && allowCloud) {
                console.log(`⬡ NEURAL_FORGE :: RETRYING_EMBEDDING_VIA_CLOUD`);
                return this.getEmbedding(text, `${actualModel}:cloud`, options);
            }
            return null;
        }
    }

    /**
     * Chat with a specific model or the hybrid router.
     */
    async chat(
        modelId: string,
        messages: any[],
        systemPrompt?: string,
        options: NeuralChatOptions = {}
    ): Promise<NeuralChatResponse> {
        console.log(`⬡ NEURAL_FORGE_CHAT :: Requesting: ${modelId}`);

        if (modelId === 'fusion-swarm') {
            return this.handleFusionChat(messages);
        }

        try {
            return await this.withTimeout(
                () => this.runChat(modelId, messages, systemPrompt, options),
                TOTAL_CHAT_TIMEOUT_MS,
                'NEURAL_FORGE_TOTAL_TIMEOUT'
            );
        } catch (error: any) {
            console.error(`⬡ NEURAL_FORGE_CHAT_DEGRADED :: ${error.message}`);
            return this.buildDegradedResponse(modelId, messages, error, systemPrompt);
        }
    }

    /**
     * Diagnostic: Verify Cloud Integration
     */
    async verifyCloudIntegration(): Promise<any> {
        console.log('⬡ NEURAL_FORGE :: VERIFYING_CLOUD...');
        const ping = await this.ping();
        if (!this.cloudApiKey) return { success: false, error: 'MISSING_API_KEY' };

        try {
            const test = await this.getEmbedding('CLOUD_PULSE', 'nomic-embed-text:cloud');
            return {
                success: !!test,
                ping,
                endpoint: this.cloudEndpoint,
                auth_configured: true
            };
        } catch (e: any) {
            return { success: false, error: e.message, ping };
        }
    }

    private async runChat(
        modelId: string,
        messages: any[],
        systemPrompt?: string,
        options: NeuralChatOptions = {}
    ): Promise<NeuralChatResponse> {
        const pingStatus = await this.ping();
        const lastUserMessage = this.extractLastUserMessage(messages);
        const decision = SmartRouter.route(lastUserMessage || modelId, {
            ...options,
            modelId,
            providerStatus: pingStatus
        });
        const requestedModel = modelId || decision.preferredModel;
        const retrievalContext = await this.buildVaultContext(
            lastUserMessage,
            options.retrievalProfile || decision.retrievalProfile,
            options.reasoningBudget || decision.reasoningBudget
        );

        const contextSections = [systemPrompt || '', retrievalContext].filter(Boolean);
        const compression = promptCompression.compress(
            contextSections.join('\n\n'),
            options.compressionMode || decision.compressionMode
        );
        const finalSystemPrompt = compression.content;

        let escalated = false;
        let fallbackCause: string | undefined;
        let lastError: Error | null = null;
        const allowLocal = options.allowLocal !== false;
        const allowCloud = options.allowCloud !== false;

        for (const candidate of decision.fallbackChain) {
            const candidateModel = candidate || requestedModel;
            const runtime = this.getModelRuntime(candidateModel);

            if (runtime === 'local' && !allowLocal) continue;
            if (runtime === 'cloud' && !allowCloud) continue;

            try {
                if (runtime === 'local') {
                    // LLM answers no longer use Ollama local models
                    // Local models are reserved for embeddings only
                    fallbackCause = `LOCAL_LLM_DISABLED :: ${candidateModel}`;
                    continue;
                }

                const providerType = this.getProviderType(candidateModel);
                if (!providerType || !this.isProviderAvailable(providerType, pingStatus)) {
                    fallbackCause = `PROVIDER_UNAVAILABLE :: ${candidateModel}`;
                    continue;
                }

                const response = await this.executeNativeChat(
                    providerType,
                    candidateModel,
                    messages,
                    finalSystemPrompt,
                    options
                );
                const decorated = this.decorateResponse(response, {
                    runtime: 'cloud',
                    compression: compression.stats,
                    escalated,
                    loopCount: 1,
                    decision,
                    contextInjected: !!retrievalContext
                });
                this.recordExecutionSnapshot(decorated, decision, fallbackCause);
                return decorated;
            } catch (error: any) {
                lastError = error;
                fallbackCause = error.message;
                console.error(`⬡ NEURAL_FORGE_ATTEMPT_FAILED :: ${candidateModel} :: ${error.message}`);

                const providerType = this.getProviderType(candidateModel);
                if (runtime === 'cloud' && providerType && this.shouldPenalizeProvider(error)) {
                    tokenGovernor.penalize(providerType);
                }
            }
        }

        throw lastError || new Error(fallbackCause || `NO_AVAILABLE_RUNTIME :: ${requestedModel}`);
    }

    private async buildVaultContext(
        query: string,
        profile: RetrievalProfile,
        budget: ReasoningBudget
    ) {
        if (!this.db || !query) return '';

        const limit = budget === 'cheap' ? 2 : budget === 'balanced' ? 3 : 4;
        const excerptLimit = budget === 'cheap' ? 500 : budget === 'balanced' ? 900 : 1300;
        const searchResults = await vectorSearch.search(this.db, query, { limit, profile });

        if (searchResults.length === 0) return '';

        console.log(`⬡ NEURAL_FORGE :: INJECTED_${searchResults.length}_KNOWLEDGE_NODES :: profile=${profile}`);

        return [
            `[VAULT_CONTEXT_PROFILE]: ${profile}`,
            ...searchResults.map(node => {
                return `--- FILE: ${node.source_path} ---\n${node.content.substring(0, excerptLimit)}`;
            })
        ].join('\n\n');
    }

    private async executeNativeChat(
        providerType: ProviderType,
        cleanId: string,
        messages: any[],
        finalSystemPrompt: string,
        options: NeuralChatOptions
    ): Promise<NeuralChatResponse> {
        if (providerType === 'anthropic') {
            console.log(`⬡ NEURAL_FORGE :: ROUTING_TO_ANTHROPIC :: ${cleanId}`);
            const response = await this.withTimeout(
                () => anthropicProvider.chat(messages, cleanId, finalSystemPrompt),
                NATIVE_PROVIDER_TIMEOUT_MS,
                `ANTHROPIC_TIMEOUT_${cleanId}`
            );
            return this.buildResponse(response.content, response.model, { usage: response.usage });
        }

        if (providerType === 'google') {
            console.log(`⬡ NEURAL_FORGE :: ROUTING_TO_GOOGLE :: ${cleanId}`);
            const response = await this.withTimeout(
                () => googleProvider.chat(messages, cleanId, finalSystemPrompt),
                NATIVE_PROVIDER_TIMEOUT_MS,
                `GOOGLE_TIMEOUT_${cleanId}`
            );
            return this.buildResponse(response.content, response.model);
        }

        if (providerType === 'moonshot') {
            console.log(`⬡ NEURAL_FORGE :: ROUTING_TO_MOONSHOT :: ${cleanId}`);
            const response = await this.withTimeout(
                () => openaiProvider.chat(messages, cleanId, finalSystemPrompt, {
                    apiKey: process.env.MOONSHOT_API_KEY,
                    baseURL: process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.ai/v1',
                    providerName: 'moonshot'
                }),
                NATIVE_PROVIDER_TIMEOUT_MS,
                `MOONSHOT_TIMEOUT_${cleanId}`
            );
            return this.buildResponse(response.content || '⬡ EMPTY_RESPONSE', response.model, { usage: response.usage });
        }

        if (providerType === 'kimi') {
            console.log(`⬡ NEURAL_FORGE :: ROUTING_TO_KIMI :: ${cleanId}`);
            const kimiConfig = this.getKimiProviderConfig();
            if (!kimiConfig) {
                throw new Error('KIMI_CLIENT_NOT_INITIALIZED');
            }

            const response = await this.withTimeout(
                () => openaiProvider.chat(messages, cleanId, finalSystemPrompt, {
                    ...kimiConfig,
                    providerName: 'kimi',
                    extraBody: this.buildKimiExtraBody(options)
                }),
                NATIVE_PROVIDER_TIMEOUT_MS,
                `KIMI_TIMEOUT_${cleanId}`
            );
            return this.buildResponse(response.content || '⬡ EMPTY_RESPONSE', response.model, { usage: response.usage });
        }

        if (cleanId.includes('gpt-oss')) {
            console.log(`⬡ NEURAL_FORGE :: ROUTING_TO_GPT_OSS_LOCAL :: ${cleanId}`);
            const response = await this.withTimeout(
                () => openaiProvider.chat(messages, cleanId, finalSystemPrompt, {
                    apiKey: this.gptOssApiKey,
                    baseURL: this.gptOssEndpoint,
                    providerName: 'gpt-oss-local'
                }),
                NATIVE_PROVIDER_TIMEOUT_MS,
                `GPT_OSS_TIMEOUT_${cleanId}`
            );
            return this.buildResponse(response.content || '⬡ EMPTY_RESPONSE', response.model, { usage: response.usage });
        }

        console.log(`⬡ NEURAL_FORGE :: ROUTING_TO_OPENAI :: ${cleanId}`);
        const response = await this.withTimeout(
            () => openaiProvider.chat(messages, cleanId, finalSystemPrompt),
            NATIVE_PROVIDER_TIMEOUT_MS,
            `OPENAI_TIMEOUT_${cleanId}`
        );
        return this.buildResponse(response.content || '⬡ EMPTY_RESPONSE', response.model, { usage: response.usage });
    }

    private async executeOllamaChat(
        ollamaModelName: string,
        messages: any[],
        finalSystemPrompt: string
    ): Promise<NeuralChatResponse> {
        console.log(`⬡ NEURAL_FORGE :: ROUTING_TO_LOCAL :: ${ollamaModelName}`);
        const formattedMessages = messages.map(m => ({ role: m.role, content: m.content }));
        if (finalSystemPrompt) {
            formattedMessages.unshift({ role: 'system', content: finalSystemPrompt });
        }

        const start = Date.now();
        const response = await this.withTimeout(
            () => this.axiosInstance.post(`${this.ollamaHost}/api/chat`, {
                model: ollamaModelName,
                messages: formattedMessages,
                options: {
                    num_ctx: 4096,
                    num_predict: 320
                },
                stream: false
            }, { timeout: LOCAL_CHAT_TIMEOUT_MS }),
            LOCAL_CHAT_TIMEOUT_MS,
            `OLLAMA_TIMEOUT_${ollamaModelName}`
        );

        latencyTracker.record(Date.now() - start);

        return this.buildResponse(
            response.data.message?.content || response.data.response || '⬡ EMPTY_RESPONSE',
            ollamaModelName
        );
    }

    private async executeLocalReasoningLoop(
        localModelName: string,
        messages: any[],
        finalSystemPrompt: string,
        decision: RoutingDecision
    ): Promise<LoopExecutionResult> {
        const draft = await this.executeOllamaChat(localModelName, messages, finalSystemPrompt);

        if (decision.reasoningBudget === 'cheap') {
            return { response: draft, shouldEscalate: false, loopCount: 1 };
        }

        const originalRequest = this.extractLastUserMessage(messages) || '';
        const critiquePrompt = [
            {
                role: 'user',
                content: [
                    'Evaluate the draft answer for missing constraints, contradictions, or low confidence.',
                    'Return strict JSON with keys:',
                    '{"confidence": number, "contradiction": boolean, "missingConstraints": string[], "shouldEscalate": boolean, "revisionBrief": string}',
                    '',
                    `ORIGINAL_REQUEST:\n${originalRequest}`,
                    '',
                    `DRAFT_RESPONSE:\n${draft.content}`
                ].join('\n')
            }
        ];

        const critique = await this.executeOllamaChat(localModelName, critiquePrompt, finalSystemPrompt);
        const parsedCritique = this.extractJsonObject(critique.content);

        if (!parsedCritique) {
            return {
                response: draft,
                shouldEscalate: true,
                fallbackCause: 'LOCAL_CRITIQUE_PARSE_FAILURE',
                loopCount: 2
            };
        }

        const confidence = typeof parsedCritique.confidence === 'number' ? parsedCritique.confidence : 0;
        const contradiction = Boolean(parsedCritique.contradiction);
        const missingConstraints = Array.isArray(parsedCritique.missingConstraints)
            ? parsedCritique.missingConstraints
            : [];
        const shouldEscalate = Boolean(parsedCritique.shouldEscalate)
            || contradiction
            || confidence < 0.66
            || (missingConstraints.length > 0 && decision.risk !== 'low');

        if (shouldEscalate) {
            return {
                response: draft,
                shouldEscalate: true,
                fallbackCause: 'LOCAL_LOW_CONFIDENCE',
                loopCount: 2
            };
        }

        const revisedPrompt = [
            ...messages,
            { role: 'assistant', content: draft.content },
            {
                role: 'user',
                content: [
                    'Revise the previous answer using this critique summary.',
                    String(parsedCritique.revisionBrief || 'Tighten accuracy and keep the answer concise.')
                ].join('\n')
            }
        ];

        const revised = await this.executeOllamaChat(localModelName, revisedPrompt, finalSystemPrompt);
        return {
            response: revised,
            shouldEscalate: false,
            loopCount: 3
        };
    }

    private async resolveAvailableLocalModels(modelId: string, intent: RoutingDecision['intent']) {
        const tags = await this.getLocalModelTags();
        const normalized = this.normalizeLocalModelName(modelId);
        if (tags.has(normalized)) {
            return [normalized];
        }

        return this.getFallbackLocalModels(normalized, intent).filter((model) => tags.has(model));
    }

    private async getLocalModelTags(force = false): Promise<Set<string>> {
        const now = Date.now();
        if (!force && this.localModelTagCache && this.localModelTagCache.expiresAt > now) {
            return this.localModelTagCache.tags;
        }

        const response = await this.axiosInstance.get(`${this.ollamaHost}/api/tags`, { timeout: 1500 });
        const tags = new Set<string>();
        for (const model of response.data?.models || []) {
            if (model?.name) tags.add(model.name);
            if (model?.model) tags.add(model.model);
        }

        this.localModelTagCache = {
            tags,
            expiresAt: now + LOCAL_TAG_CACHE_TTL_MS
        };

        return tags;
    }

    private normalizeLocalModelName(modelId: string) {
        const cleanId = modelId.replace(':cloud', '');
        const aliases: Record<string, string> = {
            'gpt-oss-20b': 'qwen-liberated:latest',
            'gpt-oss': 'qwen-liberated:latest',
            'deepseek-r1': 'deepseek-r1:latest',
            'deepseek-liberated': 'deepseek-liberated:latest',
            'starcoder2': 'starcoder2:latest',
            'llama3.2': 'llama3.2:latest'
        };
        return aliases[cleanId] || cleanId;
    }

    private getFallbackLocalModels(modelId: string, intent: RoutingDecision['intent']) {
        const cleanId = modelId.replace(':cloud', '');

        if (cleanId.includes('starcoder')) {
            return ['starcoder2:latest', 'qwen-liberated:latest', 'qwen2.5:7b', 'deepseek-r1:latest', 'llama3.2:latest'];
        }

        if (cleanId.includes('deepseek-r1')) {
            return ['deepseek-r1:latest', 'qwen-liberated:latest', 'qwen2.5:7b', 'llama3.2:latest'];
        }

        if (cleanId.includes('deepseek')) {
            return ['deepseek-liberated:latest', 'deepseek-r1:latest', 'qwen-liberated:latest', 'qwen2.5:7b', 'llama3.2:latest'];
        }

        if (cleanId.includes('qwen')) {
            return ['qwen2.5:7b', 'qwen-liberated:latest', 'deepseek-r1:latest', 'llama3.2:latest'];
        }

        if (cleanId.includes('gpt-oss')) {
            return ['qwen-liberated:latest', 'qwen2.5:7b', 'deepseek-r1:latest', 'llama3.2:latest'];
        }

        if (cleanId.includes('llama')) {
            return ['llama3.2:latest', 'qwen-liberated:latest', 'qwen2.5:7b'];
        }

        if (intent === 'coding') {
            return ['starcoder2:latest', 'qwen-liberated:latest', 'qwen2.5:7b', 'deepseek-r1:latest'];
        }

        return ['qwen-liberated:latest', 'qwen2.5:7b', 'deepseek-r1:latest', 'deepseek-liberated:latest', 'llama3.2:latest'];
    }

    private shouldUseReasoningLoop(decision: RoutingDecision, runtime: PreferredRuntime | 'local' | 'cloud') {
        return runtime === 'local' && (decision.reasoningBudget === 'balanced' || decision.reasoningBudget === 'deep');
    }

    private extractLastUserMessage(messages: any[]) {
        const lastUser = [...messages].reverse().find((message) => message.role === 'user');
        return typeof lastUser?.content === 'string' ? lastUser.content : '';
    }

    private extractJsonObject(content: string): any | null {
        try {
            const match = content.match(/\{[\s\S]*\}/);
            if (!match) return null;
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }

    private decorateResponse(
        response: NeuralChatResponse,
        metadata: {
            runtime: 'local' | 'cloud' | 'degraded';
            compression: CompressionStats;
            escalated: boolean;
            loopCount: number;
            decision: RoutingDecision;
            contextInjected: boolean;
        }
    ): NeuralChatResponse {
        return {
            ...response,
            runtime: metadata.runtime,
            compression: metadata.compression,
            escalated: metadata.escalated,
            loopCount: metadata.loopCount,
            decision: metadata.decision,
            context_injected: metadata.contextInjected
        };
    }

    private recordExecutionSnapshot(
        response: NeuralChatResponse,
        decision: RoutingDecision,
        fallbackCause?: string
    ) {
        forgeTelemetryTracker.record({
            timestamp: response.timestamp,
            runtime: response.runtime || 'degraded',
            model: response.model,
            decision,
            escalated: Boolean(response.escalated),
            loopCount: response.loopCount || 1,
            fallbackCause,
            compressionRatio: response.compression?.compressionRatio
        });
    }

    private handleFusionChat(messages: any[]): NeuralChatResponse {
        return {
            id: `fusion_${Date.now()}`,
            role: 'assistant',
            content: `⬡ SYNERGY_ACTIVE :: Fusing outputs from DeepSeek-V3, Qwen-3.5, and InternLM-3.\n\n[SYNTHESIS]: Based on your mission logs, the optimal path is to prioritize local processing for 80% of tasks, using the 'Liberated' swarm for planning and Antigravity only for final validation.`,
            model: 'fusion-swarm',
            timestamp: new Date().toISOString(),
            runtime: 'local'
        };
    }

    private hasConfiguredKey(envKey: string) {
        const value = process.env[envKey];
        return !!value && !value.includes('your_');
    }

    private getKimiProviderConfig() {
        if (!this.kimiEndpoint) {
            return null;
        }

        return {
            apiKey: this.kimiApiKey || 'kimi',
            baseURL: this.kimiEndpoint
        };
    }

    private async hasConfiguredKimiServer() {
        const config = this.getKimiProviderConfig();
        if (!config) return false;

        try {
            const headers = this.kimiApiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined;
            await this.axiosInstance.get(`${config.baseURL.replace(/\/$/, '')}/models`, {
                ...(headers ? { headers } : {}),
                timeout: 2000
            });
            return true;
        } catch (error: any) {
            console.log(`⬡ NEURAL_FORGE :: KIMI_OFFLINE (${error.message})`);
            return false;
        }
    }

    private buildKimiExtraBody(options: NeuralChatOptions) {
        const extraBody = { ...(options.providerOptions?.extraBody || {}) } as Record<string, unknown>;

        if (options.providerOptions?.mode === 'instant') {
            const existingTemplateKwargs = (extraBody.chat_template_kwargs as Record<string, unknown> | undefined) || {};
            extraBody.chat_template_kwargs = {
                ...existingTemplateKwargs,
                thinking: false
            };
        }

        return Object.keys(extraBody).length > 0 ? extraBody : undefined;
    }

    private isProviderAvailable(providerType: ProviderType, status: ProviderStatus) {
        if (providerType === 'anthropic') return status.anthropic;
        if (providerType === 'google') return status.google;
        if (providerType === 'moonshot') return status.moonshot;
        if (providerType === 'kimi') return status.kimi;
        return status.openai;
    }

    private getProviderType(modelId: string): ProviderType | null {
        const cleanId = modelId.replace(':cloud', '').toLowerCase();
        if (cleanId.includes('claude')) return 'anthropic';
        if (cleanId.includes('gemini')) return 'google';
        if (cleanId.includes('kimi-k2.6') || cleanId.includes('kimi-k2-6')) return 'kimi';
        if (cleanId.includes('kimi')) return 'moonshot';
        if (cleanId.includes('gpt') || cleanId.includes('o1')) return 'openai';
        return null;
    }

    private getModelRuntime(modelId: string): 'local' | 'cloud' {
        return this.isLikelyLocalModel(modelId) ? 'local' : 'cloud';
    }

    private isLikelyLocalModel(modelId: string) {
        const cleanId = modelId.replace(':cloud', '').toLowerCase();
        return cleanId.includes('qwen')
            || cleanId.includes('deepseek')
            || cleanId.includes('llama')
            || cleanId.includes('starcoder')
            || cleanId.includes('nomic-embed-text');
    }

    private buildResponse(content: string, model: string, extras: Partial<NeuralChatResponse> = {}): NeuralChatResponse {
        return {
            id: `msg_${Date.now()}`,
            role: 'assistant',
            content,
            model,
            timestamp: new Date().toISOString(),
            ...extras
        };
    }

    private async buildDegradedResponse(
        modelId: string,
        messages: any[],
        error: Error,
        systemPrompt?: string
    ): Promise<NeuralChatResponse> {
        const lastUserMsg = this.extractLastUserMessage(messages);
        const userInput = lastUserMsg || 'unknown';
        const pingStatus = await this.ping().catch(() => ({
            local: false,
            cloud: false,
            anthropic: false,
            google: false,
            openai: false,
            moonshot: false,
            kimi: false
        }));

        const diagnosticInfo = [
            `Local_Ollama: ${pingStatus.local ? 'ONLINE' : 'OFFLINE'}`,
            `Cloud_Ollama: ${pingStatus.cloud ? 'ONLINE' : 'OFFLINE'}`,
            `Anthropic: ${pingStatus.anthropic ? 'CONFIGURED' : 'MISSING_KEY'}`,
            `Google: ${pingStatus.google ? 'CONFIGURED' : 'MISSING_KEY'}`,
            `OpenAI: ${pingStatus.openai ? 'CONFIGURED' : 'MISSING_KEY'}`,
            `Moonshot: ${pingStatus.moonshot ? 'CONFIGURED' : 'MISSING_KEY'}`,
            `Kimi: ${pingStatus.kimi ? 'CONFIGURED' : 'MISSING_KEY'}`
        ].join(' | ');

        const finalSummary = `Neural forge degraded while processing "${userInput.substring(0, 80)}". ${error.message}.`;
        let content = `⬡ FORGE_DEGRADED_MODE :: ${finalSummary}\n\nDiagnostic: ${diagnosticInfo}`;

        if (systemPrompt?.includes('CURRENT_NODE: ENLIL')) {
            content = `[{"id": "sim_1", "description": "Fallback planning for: ${userInput.substring(0, 30)}", "status": "PENDING"}]`;
        } else if (systemPrompt?.includes('MISSION_COMPLETE')) {
            content = 'MISSION_COMPLETE (Degraded)';
        }

        const degraded = {
            id: `msg_fallback_${Date.now()}`,
            role: 'assistant' as const,
            content,
            final_summary: finalSummary,
            model: `${modelId} -> offline-fallback`,
            status: 'FORGE_DEGRADED' as const,
            runtime: 'degraded' as const,
            timestamp: new Date().toISOString()
        };

        forgeTelemetryTracker.record({
            timestamp: degraded.timestamp,
            runtime: 'degraded',
            model: degraded.model,
            decision: null,
            escalated: false,
            loopCount: 0,
            fallbackCause: error.message
        });

        return degraded;
    }

    private shouldPenalizeProvider(error: Error) {
        const message = error.message.toLowerCase();
        return message.includes('401')
            || message.includes('429')
            || message.includes('timeout')
            || message.includes('authentication')
            || message.includes('unauthorized');
    }

    private async withTimeout<T>(factory: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(label));
            }, timeoutMs);

            factory()
                .then((value) => {
                    clearTimeout(timeoutId);
                    resolve(value);
                })
                .catch((error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                });
        });
    }
}

export const neuralForge = new NeuralForgeService();
