import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const repoRoot = path.resolve(__dirname, '../../..');
const stateRoot = path.join(os.homedir(), '.nudimmud', 'token-ledger');
const queueDir = process.env.TOKEN_LEDGER_QUEUE_DIR || path.join(stateRoot, 'queue');
const ledgerScript = path.join(repoRoot, 'Scripts', 'token-ledger.mjs');

type TokenLedgerUsage = {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_tokens?: number;
    cache_write_tokens?: number;
    reasoning_tokens?: number;
    measurement_type?: string;
    accuracy_class?: string;
};

type ProviderEventInput = {
    provider: string;
    requestModel: string;
    responseModel?: string;
    status: 'ok' | 'error';
    usage?: any;
    messages?: any[];
    system?: string;
    fallbackOutputText?: string;
    latencyMs?: number;
    error?: unknown;
    operationType?: string;
    lane?: string;
    sourcePath?: string;
    metadata?: Record<string, unknown>;
};

export const tokenLedgerService = {
    recordProviderEvent(input: ProviderEventInput) {
        try {
            fs.mkdirSync(queueDir, { recursive: true });
            const usage = normalizeUsage(input.provider, input.usage, {
                input_tokens: estimateMessageTokens(input.messages, input.system),
                output_tokens: estimateMessageTokens([{ role: 'assistant', content: input.fallbackOutputText || '' }])
            });
            const event = {
                trace_id: process.env.TOKEN_LEDGER_TRACE_ID || process.env.YURI_SESSION_ID || `backend-${Date.now()}-${process.pid}`,
                source_path: input.sourcePath || 'backend/src/services/providers',
                lane: input.lane || 'backend',
                provider: input.provider,
                request_model: input.requestModel,
                response_model: input.responseModel || input.requestModel,
                operation_type: input.operationType || 'backend_provider_call',
                status: input.status,
                ...usage,
                latency_ms: input.latencyMs || 0,
                payload_hash: hashPayload({
                    messages: input.messages || [],
                    system: input.system || '',
                    model: input.requestModel,
                    provider: input.provider
                }),
                error_class: input.error instanceof Error ? input.error.name : '',
                error_message_hash: input.error instanceof Error ? sha256(input.error.message) : '',
                metadata: {
                    message_count: input.messages?.length || 0,
                    system_chars: input.system?.length || 0,
                    ...input.metadata
                }
            };
            const fileName = `${Date.now()}-${process.pid}-${crypto.randomUUID()}.json`;
            const finalPath = path.join(queueDir, fileName);
            const tmpPath = `${finalPath}.tmp`;
            fs.writeFileSync(tmpPath, `${JSON.stringify(event)}\n`, { mode: 0o600 });
            fs.renameSync(tmpPath, finalPath);
            spawn(process.execPath, [ledgerScript, 'drain'], {
                cwd: repoRoot,
                detached: true,
                stdio: 'ignore',
                env: process.env
            }).unref();
        } catch {
            // Fail open: backend provider calls must never fail because observability failed.
        }
    }
};

function normalizeUsage(provider: string, usage: any, fallback: TokenLedgerUsage): TokenLedgerUsage {
    const providerName = String(provider || '').toLowerCase();
    if (usage) {
        if (providerName.includes('ollama')) {
            const inputTokens = positive(usage.prompt_eval_count ?? usage.prompt_tokens ?? usage.input_tokens);
            const outputTokens = positive(usage.eval_count ?? usage.completion_tokens ?? usage.output_tokens);
            if (inputTokens || outputTokens) {
                return {
                    input_tokens: inputTokens,
                    output_tokens: outputTokens,
                    cache_read_tokens: 0,
                    cache_write_tokens: 0,
                    reasoning_tokens: 0,
                    measurement_type: providerName.includes('cloud') ? 'observed_provider' : 'observed_local_native',
                    accuracy_class: providerName.includes('cloud') ? 'exact_provider' : 'native_local_count'
                };
            }
        }

        if (providerName.includes('anthropic') || providerName.includes('claude')) {
            return {
                input_tokens: positive(usage.input_tokens),
                output_tokens: positive(usage.output_tokens),
                cache_read_tokens: positive(usage.cache_read_input_tokens),
                cache_write_tokens: positive(usage.cache_creation_input_tokens),
                reasoning_tokens: 0,
                measurement_type: 'observed_provider',
                accuracy_class: 'exact_provider'
            };
        }

        const inputTokens = positive(usage.prompt_tokens ?? usage.input_tokens);
        const outputTokens = positive(usage.completion_tokens ?? usage.output_tokens);
        if (inputTokens || outputTokens) {
            return {
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                cache_read_tokens: positive(usage.prompt_tokens_details?.cached_tokens || usage.input_tokens_details?.cached_tokens),
                cache_write_tokens: positive(usage.input_tokens_details?.cache_creation_input_tokens),
                reasoning_tokens: positive(usage.completion_tokens_details?.reasoning_tokens || usage.output_tokens_details?.reasoning_tokens),
                measurement_type: 'observed_provider',
                accuracy_class: 'exact_provider'
            };
        }
    }

    return {
        input_tokens: positive(fallback.input_tokens),
        output_tokens: positive(fallback.output_tokens),
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        reasoning_tokens: 0,
        measurement_type: 'estimated_tokenizer',
        accuracy_class: 'estimate_chars_div_4_pm25'
    };
}

function estimateMessageTokens(messages?: any[], system?: string) {
    const text = [
        system || '',
        ...(messages || []).map((message) => String(message?.content || ''))
    ].join('\n');
    return text ? Math.max(1, Math.ceil(text.length / 4)) : 0;
}

function hashPayload(value: unknown) {
    return sha256(canonicalJson(value));
}

function sha256(text: string) {
    return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function canonicalJson(value: unknown): string {
    return JSON.stringify(sortForJson(value));
}

function sortForJson(value: any): any {
    if (Array.isArray(value)) return value.map(sortForJson);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((acc: Record<string, unknown>, key) => {
        acc[key] = sortForJson(value[key]);
        return acc;
    }, {});
}

function positive(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
}
