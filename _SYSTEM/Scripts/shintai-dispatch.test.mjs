import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  assembleShintaiTeam,
  buildMemberPrompt,
  loadShintaiRoster,
} from './shintai-dispatch.mjs';

const MEMORY_TASK = 'critical Shintai YURI memory RAG skill recall neurodivergence self improvement MSA supercharge';

test('critical memory/RAG sprint assembles task-fit Shintai council', () => {
  const assembly = assembleShintaiTeam(MEMORY_TASK, loadShintaiRoster(), {});

  assert.equal(assembly.ok, true);
  assert.equal(assembly.tier, 'critical');
  assert.deepEqual(assembly.selectedIds, [
    'codex',
    'deepseek',
    'claude-opus-audit',
    'nemotron',
    'qwen-397b',
    'mistral-large',
    'gpt-oss-120b',
    'glm',
    'qwen-coder',
  ]);
  assert.equal(assembly.selectedIds.includes('kimi'), false);
  assert.equal(assembly.selectedIds.includes('codex-spark'), false);
});

test('memory/RAG member prompt uses YURI memory objective and neuro rail evidence', () => {
  const assembly = assembleShintaiTeam(MEMORY_TASK, loadShintaiRoster(), {});
  const qwen = assembly.members.find((member) => member.id === 'qwen-397b');
  const prompt = buildMemberPrompt(MEMORY_TASK, qwen, {
    neuroRail: {
      evidence: {
        active: true,
        activations: [{ id: 'durable-correction-capture', behavior: 'test' }],
        sourceDocs: ['SOUL.md'],
      },
    },
  });

  assert.match(prompt, /^PERSONA: Rick/);
  assert.match(prompt, /stabilize YURI memory\/RAG, skill recall, neurodivergence interaction rails/);
  assert.match(prompt, /durable-correction-capture/);
  assert.doesNotMatch(prompt, /stabilize Rick harness and Shintai integration/);
  assert.match(prompt, /codex-spark default unless the user explicitly requests it/i);
});

test('active Rick path imports neutral Shintai bridge, not rick-shintai', () => {
  const repl = readFileSync(new URL('./rick-repl.mjs', import.meta.url), 'utf8');
  const bridge = readFileSync(new URL('./shintai-dispatch.mjs', import.meta.url), 'utf8');

  assert.match(repl, /shintai-dispatch\.mjs/);
  assert.doesNotMatch(repl, /rick-shintai\.mjs/);
  assert.doesNotMatch(bridge, /rick-shintai\.mjs/);
});

test('Shintai dispatch forwards packet evidence ids into member output rails', () => {
  const bridge = readFileSync(new URL('./shintai-dispatch.mjs', import.meta.url), 'utf8');

  assert.match(bridge, /requiredEvidenceIdsForTask/);
  assert.match(bridge, /YURI_OUTPUT_REQUIRED_EVIDENCE_IDS/);
  assert.match(bridge, /YURI_OUTPUT_EVIDENCE_IDS/);
});

test('critical Shintai dispatch fails closed when council degrades below minimum size', () => {
  const roster = loadShintaiRoster();
  const assembly = assembleShintaiTeam(MEMORY_TASK, roster, {
    codex: { ok: true },
    deepseek: { ok: true },
    'claude-opus-audit': { ok: false, error: 'down' },
    nemotron: { ok: false, error: 'down' },
    'qwen-397b': { ok: false, error: 'down' },
    'mistral-large': { ok: false, error: 'down' },
    'gpt-oss-120b': { ok: false, error: 'down' },
    glm: { ok: false, error: 'down' },
    'qwen-coder': { ok: false, error: 'down' },
  });

  assert.equal(assembly.ok, false);
  assert.equal(assembly.minSize, 3);
  assert.deepEqual(assembly.selectedIds, ['codex', 'deepseek']);
});
