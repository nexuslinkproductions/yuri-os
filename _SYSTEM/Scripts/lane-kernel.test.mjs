import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ACTIVE_NIM_LANES,
  DEAD_NIM_LANES,
  LANE_KERNEL,
  NEMO_STYLE_RAILS,
  ROLE_TRUST_SURFACES,
  SHINTAI_MEMORY_RAG_MEMBER_IDS,
  SHINTAI_REQUIRED_MEMBER_IDS,
  buildSuperauditDeployment,
  isProtectedPath,
  selectMemoryRagMemberIds,
} from './lane-kernel.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('lane kernel exposes the consolidated Shintai deployment without Spark', () => {
  const deployment = buildSuperauditDeployment();
  const ids = deployment.members.map((member) => member.id);
  const lanes = deployment.members.map((member) => member.lane).join(' ');

  assert.deepEqual(ids.slice(0, 3), ['codex', 'deepseek', 'claude-opus-audit']);
  assert.ok(ids.includes('mimo'));
  assert.equal(ids.includes('nemotron'), false);
  assert.equal(ids.includes('kimi'), false);
  assert.equal(ids.includes('glm'), false);
  assert.doesNotMatch(lanes, /codex-spark|spark/i);
  assert.equal(deployment.authority.coMain, 'claude-opus-4-7-comain');
  assert.equal(deployment.authority.finalDecision, 'codex-main-after-independent-verification');
  assert.equal(deployment.authority.advisoryOnly.includes('claude-opus-audit'), false);
  assert.deepEqual(SHINTAI_REQUIRED_MEMBER_IDS, ['codex', 'deepseek']);
});

test('Claude Opus is a bounded co-main lane, not audit-only, and remains failsafe-gated', () => {
  const opus = LANE_KERNEL['claude-opus-audit'];

  assert.equal(opus.lane, 'claude-opus-4-7-comain');
  assert.equal(opus.role, 'co-main-coding-architect');
  assert.equal(opus.reasoning, 'max');
  assert.deepEqual(opus.dispatchArgs, ['@claude-opus-comain']);
  assert.match(opus.assignment, /Codex must independently verify/i);
  assert.equal(opus.tools.edit, true);
  assert.equal(opus.tools.shell, true);
  assert.equal(opus.tools.commit, false);
  assert.equal(opus.tools.push, false);
  assert.equal(opus.tools.protectedReads, false);
  assert.equal(opus.tools.protectedWrites, false);
});

test('DeepSeek Shintai lane routes through direct paid API with no NVIDIA fallback', () => {
  const deepseek = LANE_KERNEL.deepseek;

  assert.equal(deepseek.provider, 'deepseek');
  assert.equal(deepseek.lane, 'deepseek-v4-pro');
  assert.equal(deepseek.model, 'deepseek-v4-pro');
  assert.deepEqual(deepseek.dispatchArgs, ['offload', '--model', 'deepseek-v4-pro']);
  assert.equal(ACTIVE_NIM_LANES.includes('nvidia-deepseek-v4-pro'), false);
  assert.equal(ACTIVE_NIM_LANES.includes('nvidia-deepseek-v4-flash'), false);
  assert.doesNotMatch(deepseek.model, /deepseek-ai\//);
  // NIM lanes fully retired 2026-06-10 — the retired-fallback note was dropped from the
  // assignment text along with the NVIDIA path itself; assert it routes directly instead.
  assert.match(deepseek.assignment, /direct DeepSeek V4 Pro/);
  assert.doesNotMatch(deepseek.assignment, /NVIDIA|nvidia/);
});

test('lane kernel tracks active and dead NIM lanes explicitly', () => {
  // NIM lanes (nemotron + kimi) retired 2026-06-10 → no active NIM lanes remain; both moved to dead.
  assert.deepEqual(ACTIVE_NIM_LANES, []);
  assert.deepEqual(DEAD_NIM_LANES, ['nemotron-3-ultra-550b-a55b', 'kimi-k2.6']);
});

test('memory/RAG Shintai council uses large task-fit lanes without Spark fallback', () => {
  const ids = selectMemoryRagMemberIds({});

  assert.deepEqual(ids.slice(0, 3), ['codex', 'deepseek', 'claude-opus-audit']);
  assert.ok(ids.includes('mimo'));
  assert.equal(ids.includes('nemotron'), false);
  assert.equal(ids.includes('kimi'), false);
  assert.equal(ids.includes('glm'), false);
  assert.equal(ids.includes('codex-spark'), false);
  assert.deepEqual(ids, [...SHINTAI_MEMORY_RAG_MEMBER_IDS]);
});

test('memory/RAG Shintai advisory lane keeps tool mode available under YURI rails', () => {
  // NIM lanes (nemotron/kimi) retired 2026-06-10 → mimo is the replacement advisory reasoning lane.
  for (const id of ['mimo']) {
    const lane = LANE_KERNEL[id];
    assert.ok(lane, `missing lane kernel entry for ${id}`);
    assert.equal(lane.dispatchArgs.includes('--no-tools'), false, `${id} should not force no-tools`);
    assert.equal(lane.tools.read, true);
    assert.equal(lane.tools.search, true);
    assert.equal(lane.tools.commit, false);
    assert.equal(lane.tools.push, false);
  }
});

test('Shintai advisory lane keeps tool mode available under YURI rails', () => {
  // NIM lanes (nemotron/kimi) retired 2026-06-10 → mimo is the replacement advisory reasoning lane.
  for (const id of [
    'mimo',
  ]) {
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
  assert.equal(isProtectedPath('.claude/file-history/session.jsonl'), true);
  assert.equal(isProtectedPath('.claude/state/pulse-bus.jsonl'), true);
  assert.equal(isProtectedPath('.claude/history/session.jsonl'), true);
  assert.equal(isProtectedPath('.claude/projects/yuri.jsonl'), true);
  assert.equal(isProtectedPath('.env'), true);
  assert.equal(isProtectedPath('/tmp/work/.env'), true);
  assert.equal(isProtectedPath('.amp/settings.json'), true);
  assert.equal(isProtectedPath('node_modules/pkg/index.js'), true);
  assert.equal(isProtectedPath('_SYSTEM/state/shintai-advisory/out.md'), false);
});

test('ROLE_TRUST_SURFACES is the canonical single source for both role guards', () => {
  // Shape: non-empty frozen files + dirs covering trust roots + enforcement hooks.
  assert.ok(Object.isFrozen(ROLE_TRUST_SURFACES));
  assert.ok(Array.isArray(ROLE_TRUST_SURFACES.files) && ROLE_TRUST_SURFACES.files.length >= 4);
  assert.ok(Array.isArray(ROLE_TRUST_SURFACES.dirs) && ROLE_TRUST_SURFACES.dirs.length >= 1);
  assert.ok(ROLE_TRUST_SURFACES.files.includes('_SYSTEM/SELF/dev-credential.json'));
  assert.ok(ROLE_TRUST_SURFACES.files.includes('.claude/hooks/bash-security-guard.js'));
  assert.ok(ROLE_TRUST_SURFACES.dirs.includes('.claude/hooks/operator-guard'));

  // Both live guards must consume this canonical export, not a divergent hardcoded primary.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..', '..');
  const bashSrc = readFileSync(path.resolve(repoRoot, '.claude/hooks/bash-security-guard.js'), 'utf8');
  const writeSrc = readFileSync(path.resolve(repoRoot, '.claude/hooks/operator-write-guard.js'), 'utf8');
  for (const src of [bashSrc, writeSrc]) {
    assert.match(src, /ROLE_TRUST_SURFACES/);
    assert.match(src, /require\([^)]*lane-kernel\.mjs/);
  }

  // Fail-closed contract: each guard keeps a NON-EMPTY fallback list (never an open set).
  assert.match(bashSrc, /PROTECTED_ROLE_PATHS_FALLBACK\s*=\s*\[[\s\S]*?\.claude\/hooks\/tirith-url-guard\.js/);
  assert.match(writeSrc, /_roleFiles\s*=\s*\[[\s\S]*?dev-credential\.json/);
});

test('DeepSeek dispatch wrappers do not force CLI tool mode', () => {
  const offload = readFileSync(new URL('./llm-compat.sh', import.meta.url), 'utf8');
  const pulse = readFileSync(new URL('./pulse-orchestrator.mjs', import.meta.url), 'utf8');

  assert.doesNotMatch(offload, /deepseek[^\n]*--tools|--tools[^\n]*deepseek/i);
  assert.doesNotMatch(pulse, /deepseek[^\n]*--tools|--tools[^\n]*deepseek/i);
  assert.match(offload, /Tool\/skill intent belongs\s+.*prompt contract/s);
});
