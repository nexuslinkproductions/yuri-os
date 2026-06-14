// Provider-agnostic tool-shape layer for llm-lane (scalability fix, owner 2026-06-14): tools normalize to a
// canonical internal shape and render to ANY provider — so a tool authored in any dialect works on every
// transport instead of crashing a one-shape consumer (the D4 spawn_nano liability). node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTool, toOpenAITools, toAnthropicTools, renderTools } from './llm-lane.mjs';

const OPENAI = { type: 'function', function: { name: 'read_file', description: 'read', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } };
const ANTHROPIC = { name: 'spawn_nano', description: 'spawn', input_schema: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] } };
const CANON = { name: 'grep', description: 'search', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } };

test('normalizeTool absorbs OpenAI, Anthropic, and canonical shapes → canonical', () => {
  assert.deepEqual(normalizeTool(OPENAI), { name: 'read_file', description: 'read', parameters: OPENAI.function.parameters });
  assert.deepEqual(normalizeTool(ANTHROPIC), { name: 'spawn_nano', description: 'spawn', parameters: ANTHROPIC.input_schema });
  assert.deepEqual(normalizeTool(CANON), { name: 'grep', description: 'search', parameters: CANON.parameters });
});

test('normalizeTool is idempotent (canonical → canonical)', () => {
  assert.deepEqual(normalizeTool(normalizeTool(OPENAI)), normalizeTool(OPENAI));
  assert.deepEqual(normalizeTool(normalizeTool(ANTHROPIC)), normalizeTool(ANTHROPIC));
});

test('toOpenAITools renders any shape → OpenAI t.function.* (the consumer deref that crashed D4)', () => {
  const out = toOpenAITools([OPENAI, ANTHROPIC, CANON]);
  for (const t of out) {
    assert.equal(t.type, 'function');
    assert.equal(typeof t.function.name, 'string');     // every consumer derefs t.function.name — must not throw
    assert.ok(t.function.parameters);
  }
  assert.deepEqual(out.map((t) => t.function.name), ['read_file', 'spawn_nano', 'grep']);
});

test('toAnthropicTools renders any shape → Anthropic {name,input_schema}', () => {
  const out = toAnthropicTools([OPENAI, ANTHROPIC, CANON]);
  for (const t of out) {
    assert.equal(typeof t.name, 'string');
    assert.ok(t.input_schema);
    assert.equal(t.function, undefined);                // NOT OpenAI-shaped
  }
  assert.deepEqual(out.map((t) => t.name), ['read_file', 'spawn_nano', 'grep']);
});

test('renderTools dispatches by protocol', () => {
  assert.ok(renderTools([ANTHROPIC], 'anthropic')[0].input_schema);            // anthropic
  assert.ok(renderTools([ANTHROPIC], 'openai')[0].function);                   // openai
  assert.ok(renderTools([ANTHROPIC], 'ollama-cloud')[0].function);             // ollama → OpenAI shape
  assert.ok(renderTools([ANTHROPIC], 'some-future-provider')[0].function);     // unknown → safe OpenAI default
});

test('D4 REGRESSION: the Anthropic-shaped spawn_nano descriptor survives every transport (no crash)', () => {
  // This is exactly the shape mismatch the adversarial panel proved would crash llm-lane dispatch.
  const SPAWN_NANO_TOOL = { name: 'spawn_nano', description: 'spawn a governed sub-lane', input_schema: { type: 'object', properties: { task: { type: 'string' }, lane: { type: 'string' } }, required: ['task', 'lane'] } };
  const mixed = [OPENAI, SPAWN_NANO_TOOL];                                     // a real TOOLS array with mixed shapes
  // OpenAI/Ollama transports: every t.function.name deref works
  assert.deepEqual(toOpenAITools(mixed).map((t) => t.function.name), ['read_file', 'spawn_nano']);
  // Anthropic transport: every t.name deref works, input_schema preserved
  const a = toAnthropicTools(mixed);
  assert.equal(a[1].name, 'spawn_nano');
  assert.deepEqual(a[1].input_schema.required, ['task', 'lane']);
});
