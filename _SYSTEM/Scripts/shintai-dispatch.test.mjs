import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  assembleShintaiTeam,
  buildMemberPrompt,
  buildPacketEvidence,
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
    'minimax-m27',
    'qwen-coder',
  ]);
  assert.equal(assembly.selectedIds.includes('kimi'), false);
  assert.equal(assembly.selectedIds.includes('codex-spark'), false);
});

test('Shintai DeepSeek member uses NVIDIA route instead of retired direct paid API', () => {
  const assembly = assembleShintaiTeam(MEMORY_TASK, loadShintaiRoster(), {});
  const deepseek = assembly.members.find((member) => member.id === 'deepseek');
  const prompt = buildMemberPrompt(MEMORY_TASK, deepseek, {});

  assert.equal(deepseek.provider, 'nvidia');
  assert.equal(deepseek.lane, 'nvidia-deepseek-v4-pro');
  assert.equal(deepseek.model, 'deepseek-v4-pro');
  assert.deepEqual(deepseek.dispatchArgs, ['offload', '--model', 'nvidia-deepseek-v4-pro']);
  assert.match(prompt, /Lane: nvidia-deepseek-v4-pro/);
  assert.doesNotMatch(prompt, /deepseek-ai\//);
});

test('Claude Opus member prompt reflects co-main coding plus Codex verification gate', () => {
  const assembly = assembleShintaiTeam(MEMORY_TASK, loadShintaiRoster(), {});
  const opus = assembly.members.find((member) => member.id === 'claude-opus-audit');
  const prompt = buildMemberPrompt(MEMORY_TASK, opus, {});

  assert.match(prompt, /Claude Opus Co-Main/);
  assert.match(prompt, /draft or apply scoped code\/tests\/docs/);
  assert.match(prompt, /Codex must independently verify every Opus change before trust/);
  assert.doesNotMatch(prompt, /audit all council outputs with 1M-context posture; no edits/i);
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

test('Shintai packet evidence merges Gate 0 cyber evidence with memory evidence', () => {
  const assembly = assembleShintaiTeam(MEMORY_TASK, loadShintaiRoster(), {});
  const memoryEvidence = {
    sources: [
      { id: 'shintai-roster', path: '_SYSTEM/kagami/shintai-team.json', type: 'roster', sha256: 'aaa' },
      { id: 'extraction-sprint-template', path: '.claude/skills/extraction-sprint/SKILL.md', type: 'template', sha256: 'bbb' },
    ],
    loadedTemplates: ['extraction-sprint-template'],
    protectedSurfaceExclusions: ['.env'],
  };
  const controlPlane = {
    gate0: {
      loaded: [
        { id: 'cyber-company-goal', path: '_SYSTEM/docs/YURI_OS_CYBERSECURITY_COMPANY_SUPERCHARGE_GOAL_2026-05-22.md', type: 'doc', sha256: 'ccc' },
        { id: 'cyber-intel-matrix', path: '_SYSTEM/docs/YURI_CYBER_INTELLIGENCE_MATRIX_2026-05-22.md', type: 'doc', sha256: 'ddd' },
        { id: 'extraction-sprint-template', path: '.claude/skills/extraction-sprint/SKILL.md', type: 'template', sha256: 'bbb' },
      ],
    },
  };

  const packet = buildPacketEvidence('critical cybersecurity company supercharge', assembly, memoryEvidence, controlPlane);
  const ids = packet.evidenceSources.map((entry) => entry.id);

  assert.ok(ids.includes('shintai-roster'));
  assert.ok(ids.includes('cyber-company-goal'));
  assert.ok(ids.includes('cyber-intel-matrix'));
  assert.equal(ids.filter((id) => id === 'extraction-sprint-template').length, 1);
  assert.match(packet.hashes['cyber-company-goal'], /^[a-f0-9]{64}$/);
  assert.ok(packet.loadedTemplates.includes('extraction-sprint-template'));
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
    'minimax-m27': { ok: false, error: 'down' },
    'qwen-coder': { ok: false, error: 'down' },
  });

  assert.equal(assembly.ok, false);
  assert.equal(assembly.minSize, 3);
  assert.deepEqual(assembly.selectedIds, ['codex', 'deepseek']);
});
