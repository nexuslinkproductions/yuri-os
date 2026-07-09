import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeProvider, requiredProvidersByAgent } from './mure-auth-seed.mjs';

test('normalizes native and direct provider model references', () => {
  assert.equal(normalizeProvider('openai/gpt-5.6-terra'), 'openai');
  assert.equal(normalizeProvider('opencode-go/mimo-v2.5'), 'opencode-go');
  assert.equal(normalizeProvider('deepseek-v4-flash:direct'), 'deepseek');
  assert.equal(normalizeProvider('cursor/composer-2.5'), 'cursor-cli');
});

test('role auth requirements include every baseline and variant provider', () => {
  const required = requiredProvidersByAgent({
    agents: [{
      name: 'mure-artificer',
      model: 'ollama-cloud/deepseek-v4-flash:cloud',
      variants: [
        { model: 'opencode-go/mimo-v2.5' },
        { model: 'anthropic/claude-sonnet-5' },
      ],
    }],
  });
  assert.deepEqual([...required.get('mure-artificer')].sort(), ['anthropic', 'ollama-cloud', 'opencode-go']);
});
