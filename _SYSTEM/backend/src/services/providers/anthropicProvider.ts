import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { tokenLedgerService } from '../tokenLedgerService';

dotenv.config();

export class AnthropicProvider {
    private client: Anthropic | null = null;

    constructor() {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (apiKey) {
            console.log('⬡ ANTHROPIC_PROVIDER :: INITIALIZED (API key configured)');
            this.client = new Anthropic({ apiKey });
        } else {
            console.warn('⬡ ANTHROPIC_PROVIDER :: MISSING_API_KEY');
        }
    }

    private modelMap: Record<string, string> = {
        'claude-3-5-sonnet-liberated': 'claude-sonnet-4-6',
        'claude-3-5-sonnet': 'claude-sonnet-4-6',
        'claude-3-1-opus-liberated': 'claude-opus-4-7',
        'claude-3-1-opus': 'claude-opus-4-7',
        'claude-3-opus': 'claude-opus-4-7',
        'claude-3-5-haiku-liberated': 'claude-haiku-4-5-20251001',
        'claude-3-5-haiku': 'claude-haiku-4-5-20251001'
    };

    async chat(messages: any[], model: string = 'claude-3-5-sonnet-20241022', system?: string) {
        if (!this.client) throw new Error('ANTHROPIC_CLIENT_NOT_INITIALIZED');

        const actualModel = this.modelMap[model] || model;

        const formattedMessages = messages.map(m => ({ role: m.role, content: m.content }));
        const startedAt = Date.now();
        try {
            const response = await this.client.messages.create({
                model: actualModel,
                max_tokens: 4096,
                system,
                messages: formattedMessages,
            });
            tokenLedgerService.recordProviderEvent({
                provider: 'anthropic',
                requestModel: actualModel,
                responseModel: response.model,
                status: 'ok',
                usage: response.usage,
                messages: formattedMessages,
                system,
                latencyMs: Date.now() - startedAt,
                metadata: { content_blocks: response.content.length }
            });

            return {
                content: (response.content[0] as any).text,
                model: response.model,
                usage: response.usage
            };
        } catch (error) {
            tokenLedgerService.recordProviderEvent({
                provider: 'anthropic',
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
}

export const anthropicProvider = new AnthropicProvider();
