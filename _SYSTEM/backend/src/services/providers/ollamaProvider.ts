import axios from 'axios';
import dotenv from 'dotenv';
import { tokenLedgerService } from '../tokenLedgerService';

dotenv.config();

type OllamaRuntime = 'local' | 'cloud';

export interface OllamaChatMessage {
    role: string;
    content: string;
}

export interface OllamaChatOptions {
    model: string;
    messages: OllamaChatMessage[];
    system?: string;
    runtime?: OllamaRuntime;
    options?: Record<string, unknown>;
    signal?: AbortSignal;
    operationType?: string;
    metadata?: Record<string, unknown>;
}

export interface OllamaEmbeddingOptions {
    model: string;
    prompt: string;
    runtime?: OllamaRuntime;
    signal?: AbortSignal;
    operationType?: string;
    metadata?: Record<string, unknown>;
}

export class OllamaProvider {
    private localBaseUrl: string;
    private cloudBaseUrl: string;
    private cloudApiKey: string;

    constructor() {
        this.localBaseUrl = normalizeBaseUrl(process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL || 'http://localhost:11434');
        this.cloudBaseUrl = normalizeBaseUrl(process.env.OLLAMA_CLOUD_ENDPOINT || 'https://ollama.com');
        this.cloudApiKey = process.env.OLLAMA_CLOUD_API_KEY || process.env.OLLAMA_API_KEY || '';
    }

    async health(runtime: OllamaRuntime = 'local') {
        const startedAt = Date.now();
        const baseUrl = this.baseUrl(runtime);
        try {
            const response = await axios.get(`${baseUrl}/api/tags`, {
                headers: this.headers(runtime),
                timeout: runtime === 'local' ? 1500 : 2500
            });
            return {
                ok: true,
                runtime,
                latencyMs: Date.now() - startedAt,
                models: Array.isArray(response.data?.models) ? response.data.models : []
            };
        } catch (error: any) {
            return {
                ok: false,
                runtime,
                latencyMs: Date.now() - startedAt,
                error: error?.message || String(error)
            };
        }
    }

    async chat(options: OllamaChatOptions) {
        const startedAt = Date.now();
        const runtime = options.runtime || 'local';
        const formattedMessages = this.formatMessages(options.messages, options.system);
        try {
            const response = await axios.post(`${this.baseUrl(runtime)}/api/chat`, {
                model: options.model,
                messages: formattedMessages,
                stream: false,
                ...(options.options ? { options: options.options } : {})
            }, {
                headers: this.headers(runtime),
                signal: options.signal,
                timeout: 60000
            });

            const content = response.data?.message?.content || response.data?.response || '';
            this.record(options, runtime, 'ok', startedAt, response.data, content, formattedMessages);
            return {
                content,
                model: response.data?.model || options.model,
                usage: response.data,
                runtime,
                provider: this.providerName(runtime)
            };
        } catch (error) {
            this.record(options, runtime, 'error', startedAt, undefined, '', formattedMessages, error);
            throw error;
        }
    }

    async streamChat(options: OllamaChatOptions & { onToken: (token: string) => void }) {
        const startedAt = Date.now();
        const runtime = options.runtime || 'local';
        const formattedMessages = this.formatMessages(options.messages, options.system);
        let fullContent = '';
        let finalUsage: any = {};

        try {
            const response = await fetch(`${this.baseUrl(runtime)}/api/chat`, {
                method: 'POST',
                headers: this.headers(runtime),
                body: JSON.stringify({
                    model: options.model,
                    messages: formattedMessages,
                    stream: true,
                    ...(options.options ? { options: options.options } : {})
                }),
                signal: options.signal
            } as any);

            if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
            if (!response.body) throw new Error('No response body');

            const reader = (response.body as any).getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.trim()) continue;
                    const parsed = JSON.parse(line);
                    const token = parsed?.message?.content || '';
                    if (token) {
                        fullContent += token;
                        options.onToken(token);
                    }
                    if (parsed?.done) finalUsage = parsed;
                }
            }

            this.record(options, runtime, 'ok', startedAt, finalUsage, fullContent, formattedMessages);
            return {
                content: fullContent,
                model: finalUsage?.model || options.model,
                usage: finalUsage,
                runtime,
                provider: this.providerName(runtime)
            };
        } catch (error) {
            this.record(options, runtime, 'error', startedAt, finalUsage, fullContent, formattedMessages, error);
            throw error;
        }
    }

    async embedding(options: OllamaEmbeddingOptions): Promise<number[] | null> {
        const startedAt = Date.now();
        const runtime = options.runtime || 'local';
        try {
            const response = await axios.post(`${this.baseUrl(runtime)}/api/embeddings`, {
                model: options.model,
                prompt: options.prompt
            }, {
                headers: this.headers(runtime),
                signal: options.signal,
                timeout: 15000,
                maxRedirects: 0
            });

            tokenLedgerService.recordProviderEvent({
                provider: this.providerName(runtime),
                requestModel: options.model,
                responseModel: options.model,
                status: 'ok',
                messages: [{ role: 'user', content: options.prompt }],
                latencyMs: Date.now() - startedAt,
                operationType: options.operationType || 'ollama_embedding',
                metadata: {
                    runtime,
                    vector_dimensions: Array.isArray(response.data?.embedding) ? response.data.embedding.length : 0,
                    billing_state: runtime === 'cloud' ? 'provisional' : '',
                    ...this.runtimeProfile(),
                    ...options.metadata
                }
            });

            return Array.isArray(response.data?.embedding) ? response.data.embedding : null;
        } catch (error) {
            tokenLedgerService.recordProviderEvent({
                provider: this.providerName(runtime),
                requestModel: options.model,
                responseModel: options.model,
                status: 'error',
                messages: [{ role: 'user', content: options.prompt }],
                latencyMs: Date.now() - startedAt,
                operationType: options.operationType || 'ollama_embedding',
                error,
                metadata: { runtime, ...this.runtimeProfile(), ...options.metadata }
            });
            throw error;
        }
    }

    hasCloudKey() {
        return Boolean(this.cloudApiKey);
    }

    private baseUrl(runtime: OllamaRuntime) {
        return runtime === 'cloud' ? this.cloudBaseUrl : this.localBaseUrl;
    }

    private headers(runtime: OllamaRuntime): Record<string, string> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (runtime === 'cloud' && this.cloudApiKey) headers.Authorization = `Bearer ${this.cloudApiKey}`;
        return headers;
    }

    private providerName(runtime: OllamaRuntime) {
        return runtime === 'cloud' ? 'ollama-cloud' : 'ollama-local';
    }

    private formatMessages(messages: OllamaChatMessage[], system?: string) {
        const formatted = messages.map((message) => ({ role: message.role, content: message.content }));
        if (system) formatted.unshift({ role: 'system', content: system });
        return formatted;
    }

    private record(
        options: OllamaChatOptions,
        runtime: OllamaRuntime,
        status: 'ok' | 'error',
        startedAt: number,
        usage: any,
        outputText: string,
        formattedMessages: OllamaChatMessage[],
        error?: unknown
    ) {
        tokenLedgerService.recordProviderEvent({
            provider: this.providerName(runtime),
            requestModel: options.model,
            responseModel: usage?.model || options.model,
            status,
            usage,
            messages: formattedMessages,
            fallbackOutputText: outputText,
            latencyMs: Date.now() - startedAt,
            operationType: options.operationType || 'ollama_chat',
            error,
            metadata: {
                runtime,
                billing_state: runtime === 'cloud' ? 'provisional' : '',
                ...this.runtimeProfile(),
                ...options.metadata
            }
        });
    }

    private runtimeProfile() {
        return {
            ollama_host: process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
            ollama_flash_attention: process.env.OLLAMA_FLASH_ATTENTION || '',
            ollama_kv_cache_type: process.env.OLLAMA_KV_CACHE_TYPE || '',
            ollama_no_cloud: process.env.OLLAMA_NO_CLOUD || ''
        };
    }
}

function normalizeBaseUrl(url: string) {
    const trimmed = (url || '').replace(/\/$/, '');
    if (trimmed.endsWith('/api/chat')) return trimmed.slice(0, -9);
    if (trimmed.endsWith('/api')) return trimmed.slice(0, -4);
    return trimmed;
}

export const ollamaProvider = new OllamaProvider();
