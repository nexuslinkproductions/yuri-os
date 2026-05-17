import OpenAI from 'openai';
import dotenv from 'dotenv';
import { tokenLedgerService } from '../tokenLedgerService';

dotenv.config();

export interface OpenAICompatibleProviderConfig {
    apiKey?: string;
    baseURL?: string;
    providerName?: string;
    extraBody?: Record<string, unknown>;
}

export class OpenAIProvider {
    private defaultClient: OpenAI | null = null;
    private clientCache = new Map<string, OpenAI>();

    constructor() {
        if (process.env.OPENAI_API_KEY) {
            this.defaultClient = this.createClient({
                apiKey: process.env.OPENAI_API_KEY,
                baseURL: process.env.OPENAI_BASE_URL
            });
        }
    }

    private modelMap: Record<string, string> = {
        'gpt-4o-liberated': 'gpt-4o',
        'gpt-4o-mini-liberated': 'gpt-4o-mini',
        'o1-preview-liberated': 'o1-preview',
        'o1-mini-liberated': 'o1-mini',
        'kimi-k2-liberated': 'kimi-k2',
        'kimi-k2.5-liberated': 'kimi-k2.5',
        'kimi-k2': 'kimi-k2',
        'kimi-k2.5': 'kimi-k2.5'
    };

    async chat(
        messages: any[],
        model: string = 'gpt-4o',
        system?: string,
        config?: OpenAICompatibleProviderConfig
    ) {
        const client = this.resolveClient(config);

        const formattedMessages: any[] = messages.map(m => ({ role: m.role, content: m.content }));
        if (system) {
            formattedMessages.unshift({ role: 'system', content: system });
        }

        const actualModel = this.modelMap[model] || model;
        const requestBody: Record<string, unknown> = {
            model: actualModel,
            messages: formattedMessages
        };

        if (config?.extraBody && Object.keys(config.extraBody).length > 0) {
            Object.assign(requestBody, config.extraBody);
        }

        const provider = config?.providerName || 'openai';
        const startedAt = Date.now();
        try {
            const response = await client.chat.completions.create(requestBody as any);
            tokenLedgerService.recordProviderEvent({
                provider,
                requestModel: actualModel,
                responseModel: response.model,
                status: 'ok',
                usage: response.usage,
                messages: formattedMessages,
                system,
                latencyMs: Date.now() - startedAt,
                metadata: {
                    base_url_hash: config?.baseURL ? this.hashConfigValue(config.baseURL) : '',
                    choice_count: response.choices.length
                }
            });

            return {
                content: response.choices[0].message.content,
                model: response.model,
                usage: response.usage,
                provider
            };
        } catch (error) {
            tokenLedgerService.recordProviderEvent({
                provider,
                requestModel: actualModel,
                status: 'error',
                messages: formattedMessages,
                system,
                latencyMs: Date.now() - startedAt,
                error
            });
            throw error;
        }
    }

    private resolveClient(config?: OpenAICompatibleProviderConfig) {
        if (!config?.apiKey && this.defaultClient) return this.defaultClient;
        const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_CLIENT_NOT_INITIALIZED');
        const baseURL = config?.baseURL || process.env.OPENAI_BASE_URL || '';
        const cacheKey = `${baseURL}::${apiKey.slice(-8)}`;
        if (!this.clientCache.has(cacheKey)) {
            this.clientCache.set(cacheKey, this.createClient({ apiKey, baseURL }));
        }
        return this.clientCache.get(cacheKey)!;
    }

    private createClient(config: OpenAICompatibleProviderConfig) {
        return new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL
        });
    }

    private hashConfigValue(value: string) {
        let hash = 0;
        for (let i = 0; i < value.length; i += 1) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }
        return String(hash);
    }
}

export const openaiProvider = new OpenAIProvider();
