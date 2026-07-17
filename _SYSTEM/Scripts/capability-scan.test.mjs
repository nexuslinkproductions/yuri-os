import assert from 'node:assert/strict';
import test from 'node:test';

import { isMechanismFile, parseCapabilityContent, scanCapabilities } from './capability-scan.mjs';

test('parses capability annotations and metadata from source content', () => {
  const source = [
    '// @capability: fixture-capability',
    '// @serves: first | second',
    '// @does: proves parsing',
    '// @use: call it',
    '// @exports: one, two',
    'export const one = 1;',
  ].join('\n');
  const [capability] = parseCapabilityContent('_SYSTEM/Scripts/fixture.mjs', source);
  assert.equal(capability.id, 'fixture-capability');
  assert.deepEqual(capability.serves, ['first', 'second']);
  assert.deepEqual(capability.exports, ['one', 'two']);
});

test('mechanism path filter preserves the scanner directory contract', () => {
  assert.equal(isMechanismFile('_SYSTEM/Scripts/example.mjs'), true);
  assert.equal(isMechanismFile('_SYSTEM/Scripts/example.test.mjs'), false);
  assert.equal(isMechanismFile('_SYSTEM/random/example.mjs'), false);
  assert.equal(isMechanismFile('_SYSTEM/Scripts/voice/example.py'), true);
});

test('sparse scan includes tracked hidden mechanisms and present October addition', () => {
  const capabilities = scanCapabilities();
  const ids = new Set(capabilities.map((capability) => capability.id));
  assert.ok(ids.has('mure-company-orchestrator'), 'expected sparse-hidden tracked MURE capability');
  assert.ok(ids.has('october-external-capability-index'), 'expected present untracked October capability');
});
