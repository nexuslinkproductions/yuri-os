// @ts-nocheck
import assert from 'node:assert/strict';
import { SmartRouter } from './smartRouter';

const providerStatus = {
    local: true,
    cloud: true,
    anthropic: true,
    google: true,
    openai: true,
    moonshot: true,
    kimi: true
};

const codeRoute = SmartRouter.route('fix the code-local routing for a parser bug', {
    intent: 'coding',
    providerStatus
});

assert.equal(codeRoute.preferredRuntime, 'local');
assert.equal(codeRoute.preferredModel, 'qwen2.5-coder:7b');
assert.deepEqual(codeRoute.fallbackChain.slice(0, 2), ['qwen2.5-coder:7b', 'starcoder2:latest']);
assert(!codeRoute.fallbackChain.includes('qwen-liberated:latest'));
assert(!codeRoute.fallbackChain.includes('qwen2.5:7b'));
assert(!codeRoute.fallbackChain.includes('qwen3.5:4b'));

const utilityRoute = SmartRouter.route('run a quick local utility check', {
    intent: 'ops',
    providerStatus
});

assert.equal(utilityRoute.preferredRuntime, 'local');
assert.equal(utilityRoute.preferredModel, 'qwen3.5:4b');
assert.equal(utilityRoute.fallbackChain[0], 'qwen3.5:4b');
assert(utilityRoute.fallbackChain.includes('qwen2.5:7b'));
assert(!utilityRoute.fallbackChain.includes('qwen-liberated:latest'));

const deepRoute = SmartRouter.route('design a multi-step orchestration strategy for this repo', {
    intent: 'strategy',
    providerStatus
});

assert.equal(deepRoute.preferredRuntime, 'local');
assert.equal(deepRoute.preferredModel, 'deepseek-r1:8b');
assert.equal(deepRoute.fallbackChain[0], 'deepseek-r1:8b');
assert(deepRoute.fallbackChain.includes('qwen2.5:7b'));
assert(deepRoute.fallbackChain.includes('qwen3.5:4b'));
assert(!deepRoute.fallbackChain.includes('deepseek-r1:latest'));

process.stdout.write('smart-router-local-policy: pass\n');
