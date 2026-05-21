import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ACTIVE_NIM_LANES,
  DEAD_NIM_LANES,
  LANE_KERNEL,
  NEMO_STYLE_RAILS,
  SHINTAI_MEMORY_RAG_MEMBER_IDS,
  SHINTAI_REQUIRED_MEMBER_IDS,
  buildSuperauditDeployment,
  isProtectedPath,
  selectMemoryRagMemberIds,
} from './lane-kernel.mjs';

test('lane kernel exposes the heavy Shintai/NIM deployment without Kimi or Spark', () => {
  const deployment = buildSuperauditDeployment();
  const ids = deployment.members.map((member) => member.id);
  const lanes = deployment.members.map((member) => member.lane).join(' ');

  assert.deepEqual(ids.slice(0, 3), ['codex', 'deepseek', 'claude-opus-audit']);
  assert.ok(ids.includes('mistral-large'));
  assert.ok(ids.includes('qwen-coder'));
  assert.ok(ids.includes('minimax-m27'));
  assert.equal(ids.includes('glm'), false);
  assert.ok(ids.includes('qwen3-next'));
  assert.equal(ids.includes('kimi'), false);
  assert.doesNotMatch(lanes, /codex-spark|spark/i);
  assert.equal(deployment.authority.finalDecision, 'codex-main');
  assert.deepEqual(SHINTAI_REQUIRED_MEMBER_IDS, ['codex', 'deepseek']);
});

test('lane kernel tracks active and dead NIM lanes explicitly', () => {
  assert.ok(ACTIVE_NIM_LANES.includes('nvidia-mistral-large'));
  assert.ok(ACTIVE_NIM_LANES.includes('nvidia-qwen-coder'));
  assert.ok(ACTIVE_NIM_LANES.includes('nvidia-minimax-m27'));
  assert.equal(ACTIVE_NIM_LANES.includes('nvidia-glm'), false);
  assert.ok(ACTIVE_NIM_LANES.includes('nvidia-gpt-oss-120b'));
  assert.ok(ACTIVE_NIM_LANES.includes('nvidia-kimi'));
  assert.ok(ACTIVE_NIM_LANES.includes('nvidia-qwen-397b'));
  assert.ok(ACTIVE_NIM_LANES.includes('nvidia-nemotron-nano-30b'));
  assert.ok(DEAD_NIM_LANES.includes('nvidia-llama-405b'));
  assert.equal(DEAD_NIM_LANES.includes('nvidia-gpt-oss-120b'), false);
  assert.equal(DEAD_NIM_LANES.includes('nvidia-kimi'), false);
});

test('memory/RAG Shintai council uses large task-fit lanes without Spark fallback', () => {
  const ids = selectMemoryRagMemberIds({});

  assert.deepEqual(ids.slice(0, 3), ['codex', 'deepseek', 'claude-opus-audit']);
  assert.ok(ids.includes('nemotron'));
  assert.ok(ids.includes('qwen-397b'));
  assert.ok(ids.includes('mistral-large'));
  assert.ok(ids.includes('gpt-oss-120b'));
  assert.ok(ids.includes('minimax-m27'));
  assert.equal(ids.includes('glm'), false);
  assert.ok(ids.includes('qwen-coder'));
  assert.equal(ids.includes('codex-spark'), false);
  assert.equal(ids.includes('kimi'), false);
  assert.deepEqual(ids, [...SHINTAI_MEMORY_RAG_MEMBER_IDS]);
});

test('memory/RAG Shintai NIM lanes keep tool mode available under YURI rails', () => {
  for (const id of ['nemotron', 'qwen-397b', 'mistral-large', 'gpt-oss-120b', 'minimax-m27', 'qwen-coder']) {
    const lane = LANE_KERNEL[id];
    assert.ok(lane, `missing lane kernel entry for ${id}`);
    assert.equal(lane.dispatchArgs.includes('--no-tools'), false, `${id} should not force no-tools`);
    assert.equal(lane.tools.read, true);
    assert.equal(lane.tools.search, true);
    assert.equal(lane.tools.commit, false);
    assert.equal(lane.tools.push, false);
  }
});

test('Shintai NIM lanes keep tool mode available under YURI rails', () => {
  for (const id of ['nemotron', 'nemotron-nano-30b', 'mistral-large', 'mistral-medium', 'qwen-coder', 'qwen-397b', 'minimax-m27', 'qwen3-next']) {
    const lane = LANE_KERNEL[id];
    assert.ok(lane, `missing lane kernel entry for ${id}`);
    assert.equal(lane.dispatchArgs.includes('--no-tools'), false, `${id} should not force no-tools`);
    assert.equal(lane.tools.read, true);
    assert.equal(lane.tools.search, true);
    assert.equal(lane.tools.shell, true);
    assert.equal(lane.tools.commit, false);
    assert.equal(lane.tools.push, false);
    assert.equal(lane.tools.protectedReads, false);
    assert.equal(lane.tools.protectedWrites, false);
  }
});

test('lane kernel maps NeMo-style rails to YURI harness controls', () => {
  assert.ok(NEMO_STYLE_RAILS.input.includes('shell-block-detect'));
  assert.ok(NEMO_STYLE_RAILS.retrieval.includes('browser-harness-dom-first'));
  assert.ok(NEMO_STYLE_RAILS.execution.includes('no-auto-commit-or-push'));
  assert.ok(NEMO_STYLE_RAILS.output.includes('ansi-safe-streaming'));
});

test('protected path predicate blocks forbidden surfaces', () => {
  assert.equal(isProtectedPath('backend/data/snapshot.db'), true);
  assert.equal(isProtectedPath('.claude/state/pulse-bus.jsonl'), true);
  assert.equal(isProtectedPath('.claude/history/session.jsonl'), true);
  assert.equal(isProtectedPath('.env'), true);
  assert.equal(isProtectedPath('/tmp/work/.env'), true);
  assert.equal(isProtectedPath('.amp/settings.json'), true);
  assert.equal(isProtectedPath('node_modules/pkg/index.js'), true);
  assert.equal(isProtectedPath('_SYSTEM/state/shintai-advisory/out.md'), false);
});

test('DeepSeek dispatch wrappers do not force CLI tool mode', () => {
  const offload = readFileSync(new URL('./offload.sh', import.meta.url), 'utf8');
  const pulse = readFileSync(new URL('./pulse-orchestrator.mjs', import.meta.url), 'utf8');

  assert.doesNotMatch(offload, /deepseek[^\n]*--tools|--tools[^\n]*deepseek/i);
  assert.doesNotMatch(pulse, /deepseek[^\n]*--tools|--tools[^\n]*deepseek/i);
  assert.match(offload, /Tool\/skill intent belongs\s+.*prompt contract/s);
});
