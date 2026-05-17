// @ts-nocheck
import assert from 'node:assert/strict';
import { neuralForge } from './neuralForgeService';
import { ollamaProvider } from './providers/ollamaProvider';

(async () => {
    const forge = neuralForge as any;
    const originalHealth = ollamaProvider.health;
    const originalChat = ollamaProvider.chat;
    const originalAxiosGet = forge.axiosInstance.get;
    const originalCache = forge.localModelTagCache;

    const calls: Array<{ model: string; system: string }> = [];

    try {
        ollamaProvider.health = async () => ({ ok: true });
        ollamaProvider.chat = async (request: any) => {
            calls.push({ model: request.model, system: request.system || '' });
            return {
                content: `local:${request.model}`,
                model: request.model,
                usage: { prompt_eval_count: 4, eval_count: 2 }
            };
        };

        forge.axiosInstance.get = async () => ({
            data: {
                models: [
                    { name: 'qwen3.5:4b' },
                    { name: 'qwen2.5:7b' }
                ]
            }
        });
        forge.localModelTagCache = null;

        const response = await neuralForge.chat(
            'qwen-liberated:latest',
            [{ role: 'user', content: 'summarize the control-plane audit' }],
            'SYSTEM: local utility check',
            {
                allowCloud: false,
                intent: 'summarization',
                retrievalProfile: 'YURI_SYSTEM'
            }
        );

        assert.equal(response.runtime, 'local');
        assert.equal(response.model, 'qwen3.5:4b');
        assert.equal(response.content, 'local:qwen3.5:4b');
        assert.equal(calls.length >= 1, true);
        assert.equal(calls[0].model, 'qwen3.5:4b');
    } finally {
        ollamaProvider.health = originalHealth;
        ollamaProvider.chat = originalChat;
        forge.axiosInstance.get = originalAxiosGet;
        forge.localModelTagCache = originalCache;
    }

    process.stdout.write('neural-forge-local-policy: pass\n');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
