import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ActivationApplyError,
  analyzePromptItems,
  applyUserActivation,
  assertNativeCollisionPlan,
  buildActivationPlan,
  buildActivationPlanFromDocuments,
  buildAppServerRequests,
  extractDescription,
  renderSkillsConfigOverride,
  validateNativeCollisions,
  validatePromptReport,
} from './yuri-codex-skill-activation.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const SCRIPT_PATH = path.join(HERE, 'yuri-codex-skill-activation.mjs');

function loadJson(relativePath) {
  return JSON.parse(readFileSync(path.resolve(REPO_ROOT, relativePath), 'utf8'));
}

function fakeAppServer({ failWrite = null, mismatchWrite = null, hangWrite = null } = {}) {
  return `
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
let writes = 0;
rl.on('line', (line) => {
  const request = JSON.parse(line);
  if (request.method === 'initialize') {
    process.stdout.write(JSON.stringify({ id: request.id, result: {} }) + '\\n');
    return;
  }
  if (request.method !== 'skills/config/write') return;
  writes += 1;
  if (writes === ${JSON.stringify(failWrite)}) {
    process.stdout.write(JSON.stringify({ id: request.id, error: { code: -32000, message: 'fixture failure' } }) + '\\n');
    return;
  }
  if (writes === ${JSON.stringify(hangWrite)}) return;
  const effectiveEnabled = writes === ${JSON.stringify(mismatchWrite)} ? !request.params.enabled : request.params.enabled;
  process.stdout.write(JSON.stringify({ id: request.id, result: { effectiveEnabled } }) + '\\n');
});
`;
}

function promptItems(plan, extraLines = []) {
  const required = [
    ...plan.implicitGovernedSkillIds.map((id) => ({ id, path: path.resolve(REPO_ROOT, '.agents/skills', id, 'SKILL.md') })),
    ...plan.rules.filter((rule) => rule.enabled).map((rule) => ({ id: rule.id, path: rule.path })),
  ];
  const lines = required.map(({ id, path: skillPath }) => {
    const description = extractDescription(readFileSync(skillPath, 'utf8'), skillPath);
    return `- ${id}: ${description} (file: ${skillPath})`;
  });
  return [{
    role: 'developer',
    content: [{ type: 'input_text', text: `<skills_instructions>\n### Available skills\n${[...lines, ...extraLines].join('\n')}\n</skills_instructions>` }],
  }];
}

test('plan emits only the 14 native collision states while 466 governed sidecars remain authoritative', () => {
  const plan = buildActivationPlan(REPO_ROOT);
  assert.deepEqual(plan.counts, {
    governed: 466,
    implicitGoverned: 1,
    explicitOnlyGoverned: 465,
    canonical: 127,
    armed: 300,
    labgated: 39,
    adapterRules: 0,
    collisionRules: 14,
    enabledCollisionRules: 6,
    disabledCollisionRules: 8,
    totalRules: 14,
  });
  assert.deepEqual(plan.implicitGovernedSkillIds, ['activate-yuri-skills']);
  assert.deepEqual(plan.adapterRules, []);
  assert.equal(plan.rules.every((rule) => rule.kind === 'native-collision'), true);
  assert.equal(plan.rules.some((rule) => rule.path.includes(`${path.sep}.agents${path.sep}`)), false);
  assert.equal(new Set(plan.rules.map((rule) => rule.path)).size, 14);

  const enabled = new Map(plan.rules.filter((rule) => rule.enabled).map((rule) => [rule.id, rule.path]));
  for (const id of ['imagegen', 'openai-docs', 'plugin-creator', 'skill-creator', 'skill-installer']) {
    assert.equal(enabled.get(id), path.resolve(process.env.HOME, '.codex/skills/.system', id, 'SKILL.md'));
  }
  assert.equal(enabled.get('humanizer'), path.resolve(REPO_ROOT, '.codex/skills/humanizer/SKILL.md'));
  assert.equal(enabled.has('hatch-pet'), false);
  assert.equal(enabled.has('browser-harness'), false);
  assert.equal(assertNativeCollisionPlan(plan).length, 14);
});

test('override and app-server requests are deterministic, collision-only, and never read config', () => {
  const plan = buildActivationPlan(REPO_ROOT);
  const override = renderSkillsConfigOverride(plan);
  const requests = buildAppServerRequests(plan);
  assert.match(override, /^\[/);
  assert.match(override, /enabled=false/);
  assert.match(override, /enabled=true/);
  assert.equal(override.includes('.agents/skills'), false);
  assert.equal(override, renderSkillsConfigOverride(buildActivationPlan(REPO_ROOT)));
  assert.equal(requests.length, 15);
  assert.equal(requests[0].method, 'initialize');
  assert.equal(requests.slice(1).every((request) => request.method === 'skills/config/write'), true);
  assert.equal(requests.some((request) => request.method === 'config/read'), false);
  assert.equal(requests.slice(1).every((request) => request.params.name === null), true);
  assert.equal(requests.slice(1).some((request) => request.params.path.includes(`${path.sep}.agents${path.sep}`)), false);
});

test('collision validation rejects drift, escapes, .agents injection, duplicate enablement, duplicate paths, and symlinks', () => {
  const policy = loadJson('_SYSTEM/config/codex-native-skill-activation.json');
  const collisions = loadJson('_SYSTEM/config/codex-skill-collision-registry.json');

  const driftedPolicy = structuredClone(policy);
  driftedPolicy.nativeCollisionPolicy.expectedRuleCount = 15;
  assert.throws(() => validateNativeCollisions(REPO_ROOT, driftedPolicy, collisions), /accepted recovery design/i);

  const escaped = structuredClone(collisions);
  escaped.collisions[0].legacyPath = '/private/tmp/yuri-collision-escape/SKILL.md';
  escaped.collisions[0].requiredEnabled = false;
  assert.throws(() => validateNativeCollisions(REPO_ROOT, policy, escaped), /outside the single approved/i);

  const adapterInjected = structuredClone(collisions);
  adapterInjected.collisions[0].legacyPath = path.resolve(REPO_ROOT, '.codex/skills/.agents/imagegen/SKILL.md');
  adapterInjected.collisions[0].requiredEnabled = false;
  assert.throws(() => validateNativeCollisions(REPO_ROOT, policy, adapterInjected), /must never target \.agents/i);

  const dualEnabled = structuredClone(collisions);
  dualEnabled.collisions.find((entry) => entry.adapterId === 'imagegen' && entry.legacyPath.startsWith(REPO_ROOT)).requiredEnabled = true;
  assert.throws(() => validateNativeCollisions(REPO_ROOT, policy, dualEnabled), /exactly 1 enabled/i);

  const duplicatePath = structuredClone(collisions);
  duplicatePath.collisions[6].legacyPath = duplicatePath.collisions[0].legacyPath;
  duplicatePath.collisions[6].requiredEnabled = false;
  assert.throws(() => validateNativeCollisions(REPO_ROOT, policy, duplicatePath), /duplicate native skill rule path/i);

  const symlinkTarget = collisions.collisions[0].legacyPath;
  const symlinkComponent = path.dirname(symlinkTarget);
  const fsOps = {
    existsSync,
    lstatSync(value) {
      if (value === symlinkComponent) return { isSymbolicLink: () => true, isFile: () => false };
      return lstatSync(value);
    },
  };
  assert.throws(() => validateNativeCollisions(REPO_ROOT, policy, collisions, { fsOps }), /symlink component/i);
});

test('governed sidecar drift and forged write plans fail closed', () => {
  const plan = buildActivationPlan(REPO_ROOT);
  const manifest = structuredClone(plan.manifest);
  manifest.skills.find((skill) => skill.id === 'activate-yuri-skills').nativeInvocation.allowImplicitInvocation = false;
  assert.throws(
    () => buildActivationPlanFromDocuments(REPO_ROOT, plan.policy, manifest, plan.collisions),
    /sidecar state mismatch/i,
  );

  const forged = structuredClone(plan);
  forged.rules[0].path = path.resolve(REPO_ROOT, '.agents/skills/imagegen/SKILL.md');
  assert.throws(() => renderSkillsConfigOverride(forged), /rules differ|\.agents/i);
  assert.throws(() => buildAppServerRequests(forged), /rules differ|\.agents/i);

  const forgedHash = structuredClone(plan);
  forgedHash.planHash = '0'.repeat(64);
  assert.throws(() => assertNativeCollisionPlan(forgedHash), /plan hash differs/i);
});

test('fresh-prompt acceptance requires exact preferred paths, one implicit governed adapter, and full required descriptions', () => {
  const plan = buildActivationPlan(REPO_ROOT);
  const items = promptItems(plan);
  const report = analyzePromptItems(items, plan);
  const accepted = validatePromptReport(report, plan);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.implicitGoverned, 1);
  assert.equal(accepted.explicitOnlyGoverned, 465);
  assert.equal(report.truncatedDescriptions.length, 0);

  const explicitPath = path.resolve(REPO_ROOT, '.agents/skills/ad-creative/SKILL.md');
  const explicitDescription = extractDescription(readFileSync(explicitPath, 'utf8'), explicitPath);
  const leaked = analyzePromptItems(promptItems(plan, [`- ad-creative: ${explicitDescription} (file: ${explicitPath})`]), plan);
  assert.equal(leaked.forbiddenGovernedEntries.length, 1);
  assert.throws(() => validatePromptReport(leaked, plan), /explicit-only governed adapters leaked/i);

  const disabled = plan.rules.find((rule) => rule.id === 'humanizer' && !rule.enabled);
  const disabledDescription = extractDescription(readFileSync(disabled.path, 'utf8'), disabled.path);
  const duplicated = analyzePromptItems(promptItems(plan, [`- humanizer: ${disabledDescription} (file: ${disabled.path})`]), plan);
  assert.equal(duplicated.duplicateVisibleIds.length, 1);
  assert.equal(duplicated.managedDuplicateVisibleIds.length, 1);
  assert.equal(duplicated.forbiddenDisabledCollisionEntries.length, 1);
  assert.equal(duplicated.wrongPreferredCollisionEntries.length, 1);

  const arbitrary = analyzePromptItems(promptItems(plan, ['- connector-skill: Connector description. (file: /private/nonexistent/plugin/SKILL.md)']), plan);
  assert.equal(arbitrary.truncatedDescriptions.length, 0, 'untrusted prompt paths must not be dereferenced');

  const unmanagedDuplicate = analyzePromptItems(promptItems(plan, [
    '- connector-skill: Connector description. (file: /private/nonexistent/plugin-a/SKILL.md)',
    '- connector-skill: Connector description. (file: /private/nonexistent/plugin-b/SKILL.md)',
  ]), plan);
  assert.deepEqual(unmanagedDuplicate.unmanagedDuplicateVisibleIds.map((entry) => entry.id), ['connector-skill']);
  assert.deepEqual(validatePromptReport(unmanagedDuplicate, plan).unmanagedDuplicateVisibleIds, ['connector-skill']);

  const omittedItems = structuredClone(items);
  omittedItems[0].content[0].text += '\n1 additional skill was not included in the model-visible skills list';
  assert.throws(() => validatePromptReport(analyzePromptItems(omittedItems, plan), plan), /metadata budget overflow/i);
});

test('persistent apply rejects absent owner gate before spawn', async () => {
  const plan = buildActivationPlan(REPO_ROOT);
  await assert.rejects(
    applyUserActivation(plan, { codexCommand: '/definitely/not/a/command' }),
    /requires ownerApproved=true/i,
  );
});

test('fake app-server apply produces a complete replay-idempotent receipt and cleans the child', async () => {
  const plan = buildActivationPlan(REPO_ROOT);
  const receipt = await applyUserActivation(plan, {
    codexCommand: process.execPath,
    appServerArgs: ['-e', fakeAppServer()],
    timeoutMs: 3000,
    cleanupTimeoutMs: 1000,
    ownerApproved: true,
    ownerToken: plan.policy.runtime.ownerGate.confirmationToken,
  });
  assert.equal(receipt.complete, true);
  assert.equal(receipt.partial, false);
  assert.equal(receipt.replayIdempotent, true);
  assert.equal(receipt.priorStateKnown, false);
  assert.deepEqual(receipt.counts, {
    planned: 14,
    attempted: 14,
    confirmed: 14,
    failed: 0,
    notAttempted: 0,
    validationFailedBeforeWrite: 0,
    desiredEnabled: 6,
    desiredDisabled: 8,
    changed: null,
    alreadyEffective: null,
    confirmedDesiredStateChangeUnknown: 14,
    unconfirmedState: 0,
  });
  assert.equal(receipt.cleanup.exited, true);
  assert.equal(receipt.cleanup.pendingRequests, 0);
  assert.equal(receipt.outcomes.every((outcome) => outcome.status === 'confirmed' && outcome.stateKnown), true);
});

test('fake app-server partial failure retains exact attempted, confirmed, unknown, and cleanup evidence', async () => {
  const plan = buildActivationPlan(REPO_ROOT);
  await assert.rejects(
    applyUserActivation(plan, {
      codexCommand: process.execPath,
      appServerArgs: ['-e', fakeAppServer({ failWrite: 3 })],
      timeoutMs: 3000,
      cleanupTimeoutMs: 1000,
      ownerApproved: true,
      ownerToken: plan.policy.runtime.ownerGate.confirmationToken,
    }),
    (error) => {
      assert.equal(error instanceof ActivationApplyError, true);
      assert.equal(error.receipt.complete, false);
      assert.equal(error.receipt.partial, true);
      assert.equal(error.receipt.counts.attempted, 3);
      assert.equal(error.receipt.counts.confirmed, 2);
      assert.equal(error.receipt.counts.failed, 1);
      assert.equal(error.receipt.counts.notAttempted, 11);
      assert.equal(error.receipt.outcomes[2].status, 'attempted-unconfirmed');
      assert.equal(error.receipt.outcomes[2].stateKnown, false);
      assert.equal(error.receipt.cleanup.exited, true);
      return true;
    },
  );
});

test('confirmed effective-state mismatch is preserved in the failure receipt', async () => {
  const plan = buildActivationPlan(REPO_ROOT);
  await assert.rejects(
    applyUserActivation(plan, {
      codexCommand: process.execPath,
      appServerArgs: ['-e', fakeAppServer({ mismatchWrite: 1 })],
      timeoutMs: 3000,
      cleanupTimeoutMs: 1000,
      ownerApproved: true,
      ownerToken: plan.policy.runtime.ownerGate.confirmationToken,
    }),
    (error) => {
      const outcome = error.receipt.outcomes[0];
      assert.equal(outcome.status, 'confirmed-mismatch');
      assert.equal(outcome.stateKnown, true);
      assert.equal(outcome.desiredPostState, 'mismatch');
      assert.equal(outcome.effectiveEnabled, !outcome.desiredEnabled);
      return true;
    },
  );
});

test('mid-write timeout is an attempted-unconfirmed partial and the child is still reaped', async () => {
  const plan = buildActivationPlan(REPO_ROOT);
  await assert.rejects(
    applyUserActivation(plan, {
      codexCommand: process.execPath,
      appServerArgs: ['-e', fakeAppServer({ hangWrite: 2 })],
      timeoutMs: 500,
      cleanupTimeoutMs: 1000,
      ownerApproved: true,
      ownerToken: plan.policy.runtime.ownerGate.confirmationToken,
    }),
    (error) => {
      assert.equal(error.receipt.partial, true);
      assert.equal(error.receipt.counts.attempted, 2);
      assert.equal(error.receipt.counts.confirmed, 1);
      assert.equal(error.receipt.outcomes[1].status, 'attempted-unconfirmed');
      assert.equal(error.receipt.outcomes[1].desiredPostState, 'unconfirmed');
      assert.equal(error.receipt.cleanup.exited, true);
      return true;
    },
  );
});

test('spawn failure returns a zero-write receipt without leaking a child', async () => {
  const plan = buildActivationPlan(REPO_ROOT);
  await assert.rejects(
    applyUserActivation(plan, {
      codexCommand: '/definitely/not/a/command',
      timeoutMs: 100,
      cleanupTimeoutMs: 100,
      ownerApproved: true,
      ownerToken: plan.policy.runtime.ownerGate.confirmationToken,
    }),
    (error) => {
      assert.equal(error instanceof ActivationApplyError, true);
      assert.equal(error.receipt.complete, false);
      assert.equal(error.receipt.partial, false);
      assert.equal(error.receipt.counts.attempted, 0);
      assert.equal(error.receipt.counts.notAttempted, 14);
      assert.equal(error.receipt.cleanup.exited, true);
      assert.equal(error.receipt.cleanup.spawnError, 'ENOENT');
      return true;
    },
  );
});

test('CLI rejects ambiguous action combinations before any operation', () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, '--check', '--probe'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /exactly one activation action flag/i);
});
