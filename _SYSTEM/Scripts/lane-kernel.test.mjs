import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ACTIVE_NIM_LANES,
  DEAD_NIM_LANES,
  LANE_KERNEL,
  NEMO_STYLE_RAILS,
  ROLE_TRUST_SURFACES,
  SUPERAUDIT_WORKER_PREFLIGHT_BINDING,
  SHINTAI_MEMORY_RAG_MEMBER_IDS,
  SHINTAI_REQUIRED_MEMBER_IDS,
  buildSuperauditDeployment,
  isProtectedPath,
  resolveAdmittedCheapWorkerBinding,
  selectMemoryRagMemberIds,
} from './lane-kernel.mjs';

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
  assert.deepEqual(deployment.preflightBindings, [SUPERAUDIT_WORKER_PREFLIGHT_BINDING]);
  assert.ok(deployment.sequence.includes('registry-cheap-worker-evidence-preflight'));
  assert.doesNotMatch(JSON.stringify(deployment), /haiku/i);
});

test('Claude Opus is a bounded co-main lane, not audit-only, and remains failsafe-gated', () => {
  const opus = LANE_KERNEL['claude-opus-audit'];

  assert.equal(opus.lane, 'claude-opus-4-7-comain');
  assert.equal(opus.role, 'co-main-coding-architect');
  assert.equal(opus.reasoning, 'max');
  assert.deepEqual(opus.dispatchArgs, ['@claude-opus-comain']);
  assert.equal(Object.hasOwn(opus, 'wakeModel'), false);
  assert.equal(opus.preflightBinding, SUPERAUDIT_WORKER_PREFLIGHT_BINDING);
  assert.equal(opus.preflightBinding.role, 'worker');
  assert.equal(opus.preflightBinding.tier, 'cheap');
  assert.equal(opus.preflightBinding.status, 'canary-proven');
  assert.match(opus.assignment, /Codex must independently verify/i);
  assert.match(opus.assignment, /registry-backed cheap Worker evidence preflight/i);
  assert.doesNotMatch(opus.assignment, /haiku/i);
  assert.equal(opus.tools.edit, true);
  assert.equal(opus.tools.shell, true);
  assert.equal(opus.tools.commit, false);
  assert.equal(opus.tools.push, false);
  assert.equal(opus.tools.protectedReads, false);
  assert.equal(opus.tools.protectedWrites, false);
});

test('superaudit preflight resolves the current admitted cheap Worker from canonical registries', () => {
  assert.deepEqual(SUPERAUDIT_WORKER_PREFLIGHT_BINDING, {
    role: 'worker',
    use: 'evidence-preflight',
    tier: 'cheap',
    model: 'opencode-go/mimo-v2.5',
    routeId: 'mimo-v2.5.opencode',
    agentId: 'mure-artificer-mimo25',
    surface: 'omp-native',
    status: 'canary-proven',
    mayExecuteWorkerTasks: true,
    maySpawn: false,
    registryPath: '_SYSTEM/config/provider-route-registry.json',
    policyPath: '_SYSTEM/config/sol-moe-routing-policy.json',
  });
  assert.ok(Object.isFrozen(SUPERAUDIT_WORKER_PREFLIGHT_BINDING));
});

test('cheap Worker resolution fails closed instead of reviving an excluded or unproven route', () => {
  const registry = {
    schemaVersion: 'yuri-provider-route-v1',
    modelIdentities: {
      'retired/example': {
        routes: [{
          id: 'retired.example',
          model: 'retired/example',
          agentId: 'retired-agent',
          surface: 'omp-native',
          status: 'owner-excluded',
        }],
      },
    },
    roleTopology: {
      worker: {
        preferredModels: ['retired/example'],
        mayExecuteWorkerTasks: true,
        maySpawn: false,
      },
    },
    excludedModels: [{ model: 'retired/example' }],
  };
  const policy = {
    providerRouteRegistry: {
      path: '_SYSTEM/config/provider-route-registry.json',
      unresolvedRoutesAreBlocked: true,
    },
    experts: [{ model: 'retired/example', tier: 'cheap' }],
  };

  assert.throws(
    () => resolveAdmittedCheapWorkerBinding(registry, policy),
    /no admitted canary-proven cheap Worker route/i,
  );
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

test('ROLE_TRUST_SURFACES is a valid non-empty frozen trust surface', () => {
  // The dev/coworker role system (and operator-write-guard.js, its second guard) was
  // removed 2026-06-20/07-06 as confirmed-dead code (single-operator machine, the role
  // gate could never fire) — this export now only needs to hold shape for its remaining
  // consumers (e.g. energy-arm-hardening.test.mjs), not cross-check "both role guards".
  assert.ok(Object.isFrozen(ROLE_TRUST_SURFACES));
  assert.ok(Array.isArray(ROLE_TRUST_SURFACES.files) && ROLE_TRUST_SURFACES.files.length >= 4);
  assert.ok(Array.isArray(ROLE_TRUST_SURFACES.dirs) && ROLE_TRUST_SURFACES.dirs.length >= 1);
  assert.ok(ROLE_TRUST_SURFACES.files.includes('_SYSTEM/SELF/dev-credential.json'));
  assert.ok(ROLE_TRUST_SURFACES.files.includes('.claude/hooks/bash-security-guard.js'));
  assert.ok(ROLE_TRUST_SURFACES.files.includes('_SYSTEM/Scripts/energy-tick-adapter.mjs'));
  assert.ok(!ROLE_TRUST_SURFACES.files.includes('.claude/hooks/energy-tick.mjs'));
  assert.ok(ROLE_TRUST_SURFACES.dirs.includes('.claude/hooks/operator-guard'));
});

test('DeepSeek dispatch wrappers do not force CLI tool mode', () => {
  const offload = readFileSync(new URL('./llm-compat.sh', import.meta.url), 'utf8');
  // pulse-orchestrator.mjs assertion removed (wave-2 D-C2): file deleted —
  // a deleted dispatch surface cannot force tool mode.
  assert.doesNotMatch(offload, /deepseek[^\n]*--tools|--tools[^\n]*deepseek/i);
  assert.match(offload, /Tool\/skill intent belongs\s+.*prompt contract/s);
});
