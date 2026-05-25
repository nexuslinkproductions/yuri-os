import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  assembleShintaiTeam,
  applyHealthPreflightToAssembly,
  buildMemberPrompt,
  buildPacketEvidence,
  loadShintaiRoster,
  resolveShintaiStageTimeout,
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

test('Shintai DeepSeek member uses direct paid API without NVIDIA fallback', () => {
  const assembly = assembleShintaiTeam(MEMORY_TASK, loadShintaiRoster(), {});
  const deepseek = assembly.members.find((member) => member.id === 'deepseek');
  const prompt = buildMemberPrompt(MEMORY_TASK, deepseek, {});

  assert.equal(deepseek.provider, 'deepseek');
  assert.equal(deepseek.lane, 'deepseek-v4-pro');
  assert.equal(deepseek.model, 'deepseek-v4-pro');
  assert.deepEqual(deepseek.dispatchArgs, ['offload', '--model', 'deepseek-v4-pro']);
  assert.match(prompt, /Lane: deepseek-v4-pro/);
  assert.doesNotMatch(prompt, /nvidia-deepseek/);
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

test('Shintai health preflight has a bounded default timeout', () => {
  assert.equal(resolveShintaiStageTimeout('health', 0, {}), 180000);
  assert.equal(resolveShintaiStageTimeout('health', 0, { YURI_SHINTAI_HEALTH_TIMEOUT_MS: '2500' }), 2500);
  assert.equal(resolveShintaiStageTimeout('critique', 0, {}), 0);
  assert.equal(resolveShintaiStageTimeout('proposal', 45000, {}), 45000);
});

test('Shintai health preflight preserves scoped assembly instead of rebuilding from roster', () => {
  const member = {
    id: 'qwen3-next',
    displayName: 'Timeout Probe Lane',
    lane: 'nvidia-qwen3-next',
    model: 'nvidia-qwen3-next',
    health: { ok: true },
  };
  const assembly = {
    ok: true,
    task: 'standard timeout probe',
    tier: 'standard',
    minSize: 1,
    targetSize: 1,
    selectedIds: ['qwen3-next'],
    selected: [member],
    members: [member],
    skipped: [],
    requiredIds: [],
  };

  const updated = applyHealthPreflightToAssembly(assembly, {
    'qwen3-next': { ok: false, signal: 'SIGTERM', error: 'timeout' },
  });

  assert.equal(updated.ok, false);
  assert.deepEqual(updated.selectedIds, []);
  assert.equal(updated.skipped[0].id, 'qwen3-next');
  assert.equal(updated.members.some((entry) => entry.id === 'codex'), false);
});
