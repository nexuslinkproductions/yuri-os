#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const contractPath = resolve(__dirname, 'offload-contract.mjs');
const offloadRunnerPath = resolve(__dirname, 'offload-runner.mjs');

function runContract(args) {
  return execFileSync(process.execPath, [contractPath, ...args], { encoding: 'utf8' }).trim();
}

function routePlan(prompt) {
  return JSON.parse(runContract(['route-plan', prompt]));
}

const contract = JSON.parse(runContract(['contract']));
assert.equal(contract.version, 3, 'contract version should be pinned');
assert.equal(contract.activation.mode, 'automatic', 'contract should remain automatic');
assert.equal(contract.activation.triggerless, true, 'contract should remain triggerless');
assert.equal(contract.deepseekCodexQualityGate.authority.executor, 'Codex/main-session', 'Codex must remain executor/final authority');
assert.equal(contract.deepseekCodexQualityGate.authority.modelOutput, 'advisory_only=true; local_truth_claim=false', 'DeepSeek output must remain advisory');
assert.ok(contract.deepseekCodexQualityGate.discardWhenAny.includes('Contradicts deterministic local evidence.'), 'degradation guard missing');
assert.ok(contract.deepseekCodexQualityGate.metrics.includes('accepted_findings'), 'quality metrics missing');
assert.equal(contract.lanes.ollama.alias, '@ollama', 'additive Ollama lane metadata missing');
assert.equal(contract.lanes.ollamaLocal.alias, '@ollama-local', 'additive local Ollama lane metadata missing');
assert.equal(contract.lanes.ollamaCloud.alias, '@ollama-cloud', 'additive Ollama Cloud lane metadata missing');
assert.equal(contract.lanes.claude.alias, '@claude', 'Claude council lane metadata missing');
assert.equal(contract.crossReference.taxonomySurface, '_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/cross-reference-taxonomy.md', 'cross-reference taxonomy surface missing');
assert.equal(contract.crossReference.rulesSurface, '_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/prevention-rules.md', 'cross-reference rules surface missing');
assert.equal(contract.claudeCouncilQualityGate.role.outputCapLines, 80, 'Claude council output cap should be 80 lines');
assert.deepEqual(contract.claudeCouncilQualityGate.role.requiredSections, [
  'findings',
  'risks',
  'upgrade_candidates',
  'tests_needed',
  'reject_or_accept_reasoning',
], 'Claude council response contract changed');
assert.equal(contract.pulseGovernanceSkeleton.id, 'pulse-governance-skeleton', 'pulse governance skeleton metadata missing');
assert.equal(contract.pulseGovernanceSkeleton.authority.entryBranch, 'main', 'all pulse intake should begin from main');
assert.equal(contract.pulseGovernanceSkeleton.authority.exitBranch, 'main', 'all pulse output should collapse back to main');
assert.deepEqual(contract.pulseGovernanceSkeleton.phaseOrder, [
  'intake_classify',
  'campaign_decompose',
  'specialist_fanout',
  'verify_local_truth',
  'merge_learn',
], 'pulse governance phase spine changed');
assert.ok(contract.pulseGovernanceSkeleton.checkpointProfiles.argus, 'Argus checkpoint profile missing');
assert.ok(contract.pulseGovernanceSkeleton.checkpointProfiles.hermes, 'Hermes checkpoint profile missing');
assert.ok(contract.pulseGovernanceSkeleton.checkpointProfiles.obliteratus, 'Obliteratus checkpoint profile missing');
assert.ok(contract.pulseGovernanceSkeleton.checkpointProfiles['openclaw-derived'], 'OpenClaw-derived pattern profile missing');

const yuriSelftest = execFileSync(
  process.execPath,
  [
    'Scripts/yuri-guarded-executor.mjs',
    '--selftest',
    '--artifact-root',
    '/tmp/nudimmud-yuri-selftest-regression'
  ],
  { encoding: 'utf8' }
).trim();
assert.ok(yuriSelftest.includes('YURI_GUARDED_EXECUTOR_SELFTEST_PASS'), 'yuri guarded executor selftest should pass');

function autoPlan(prompt) {
  return JSON.parse(execFileSync(
    resolve(__dirname, 'ai'),
    ['auto', '--dry-run', prompt],
    { encoding: 'utf8' }
  ).trim());
}

const cases = [
  {
    prompt: 'brain dump to durable orchestration control plane: intake normalize graph plan route execute verify sanitize promote',
    lane: 'swarm',
    scenario: 'control-plane-orchestration'
  },
  {
    prompt: 'compile a task graph for artifact-driven verification and canonical state promotion',
    lane: 'swarm',
    scenario: 'control-plane-orchestration'
  },
  {
    prompt: 'run the Yuri sandbox improvement loop as a live test',
    lane: 'codex-spark',
    scenario: 'sandbox-improvement'
  },
  {
    prompt: 'complete Yuri OS evidence-first upgrade proving run with source manifest reference registry section manifest md-vs-html and html control surface',
    lane: 'codex-spark',
    scenario: 'sandbox-improvement'
  },
  {
    prompt: 'document-native audit proving run for beta-readiness with artifact audit and promotion candidates',
    lane: 'codex-spark',
    scenario: 'sandbox-improvement'
  },
  {
    prompt: 'implement a new auth flow',
    lane: 'code-local',
    scenario: 'code-change'
  },
  {
    prompt: 'review this architecture for security risk',
    lane: 'swarm',
    scenario: 'high-stakes-review'
  },
  {
    prompt: 'update offload protocol for a new CLI harness',
    lane: 'swarm',
    scenario: 'protocol-change'
  },
  {
    prompt: 'summarize these notes into a short brief',
    lane: 'summarize-local',
    scenario: 'document-synthesis'
  },
  {
    prompt: 'rewrite the cross-reference taxonomy and prevention rules for cross-domain lesson indexing',
    lane: 'summarize-local',
    scenario: 'cross-domain-lesson-work'
  },
  {
    prompt: 'use ollama to summarize this private local note',
    lane: 'ollama',
    scenario: 'document-synthesis'
  },
  {
    prompt: 'offline summarize this private local note',
    lane: 'ollama-local',
    scenario: 'document-synthesis'
  },
  {
    prompt: 'ask @claude for model council architecture risk review',
    lane: 'claude',
    scenario: 'high-stakes-review'
  }
];

for (const testCase of cases) {
  const plan = routePlan(testCase.prompt);
  assert.equal(plan.automatic, true, `automatic routing should be enabled for "${testCase.prompt}"`);
  assert.equal(plan.lane, testCase.lane, `lane mismatch for "${testCase.prompt}"`);
  assert.equal(plan.scenario, testCase.scenario, `scenario mismatch for "${testCase.prompt}"`);
  assert.equal(plan.entrypoint, './Scripts/ai auto', `entrypoint mismatch for "${testCase.prompt}"`);
  assert.equal(plan.qualityGate, 'main-session', `quality gate mismatch for "${testCase.prompt}"`);
  assert.ok(plan.dispatch === 'single-lane' || plan.dispatch === 'parallel-fan-out', `dispatch missing for "${testCase.prompt}"`);
  assert.equal(plan.deepseekAdvisory.localTruthRequired, true, `local truth boundary missing for "${testCase.prompt}"`);
  assert.equal(plan.deepseekAdvisory.codexFinalAuthority, true, `Codex authority missing for "${testCase.prompt}"`);
  assert.equal(plan.claudeAdvisory.localTruthRequired, true, `Claude local truth boundary missing for "${testCase.prompt}"`);
  assert.equal(plan.claudeAdvisory.codexFinalAuthority, true, `Claude Codex authority missing for "${testCase.prompt}"`);
  assert.equal(plan.nativeFunctionGates.argus.decision, 'always-on', `Argus native gate missing for "${testCase.prompt}"`);
  assert.equal(plan.nativeFunctionGates.argus.runtime, 'native_function', `Argus should be native for "${testCase.prompt}"`);
  assert.equal(plan.nativeFunctionGates.hermes.decision, 'always-on', `Hermes native gate missing for "${testCase.prompt}"`);
  assert.equal(plan.nativeFunctionGates.hermes.runtime, 'native_function', `Hermes should be native for "${testCase.prompt}"`);
  assert.equal(plan.pulseGovernanceSkeleton.id, 'pulse-governance-skeleton', `pulse governance skeleton missing for "${testCase.prompt}"`);
  assert.equal(plan.pulseGovernanceSkeleton.authority.entryBranch, 'main', `pulse intake should start on main for "${testCase.prompt}"`);
  assert.equal(plan.pulseGovernanceSkeleton.authority.exitBranch, 'main', `pulse output should return to main for "${testCase.prompt}"`);
  assert.ok(plan.pulseGovernanceSkeleton.activeProfiles.includes('argus'), `Argus profile should be active for "${testCase.prompt}"`);
  assert.ok(plan.pulseGovernanceSkeleton.activeProfiles.includes('hermes'), `Hermes profile should be active for "${testCase.prompt}"`);
  assert.ok(plan.pulseGovernanceSkeleton.activeProfiles.includes('openclaw-derived'), `OpenClaw-derived profile should be available for "${testCase.prompt}"`);
  assert.ok(plan.pulseGovernanceSkeleton.phaseCheckpoints.verify_local_truth.some((checkpoint) => checkpoint.profile === 'argus'), `verify phase should include Argus checkpoint for "${testCase.prompt}"`);
  assert.ok(plan.pulseGovernanceSkeleton.phaseCheckpoints.merge_learn.some((checkpoint) => checkpoint.profile === 'hermes'), `merge phase should include Hermes checkpoint for "${testCase.prompt}"`);
  assert.ok(plan.pulseGovernanceSkeleton.phaseCheckpoints.intake_classify.some((checkpoint) => checkpoint.profile === 'openclaw-derived'), `intake phase should include OpenClaw-derived manifest pattern for "${testCase.prompt}"`);
  assert.ok(Array.isArray(plan.lifecycle) && plan.lifecycle.length >= 5, `lifecycle missing for "${testCase.prompt}"`);
  assert.ok(Array.isArray(plan.learningCapture) && plan.learningCapture.includes('next_rule_candidate'), `learning capture missing for "${testCase.prompt}"`);
  if (testCase.scenario === 'cross-domain-lesson-work') {
    assert.ok(plan.learningCapture.includes('canonical_tags'), `cross-domain capture should include canonical tags for "${testCase.prompt}"`);
    assert.ok(plan.learningCapture.includes('bridge_domains'), `cross-domain capture should include bridge domains for "${testCase.prompt}"`);
    assert.ok(plan.crossReference, `cross-domain route plan should expose cross-reference surfaces for "${testCase.prompt}"`);
    assert.equal(plan.crossReference.taxonomySurface, '_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/cross-reference-taxonomy.md', `cross-domain taxonomy surface missing for "${testCase.prompt}"`);
    assert.equal(plan.crossReference.rulesSurface, '_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/prevention-rules.md', `cross-domain rules surface missing for "${testCase.prompt}"`);
  }

  const dryPlan = autoPlan(testCase.prompt);
  assert.equal(dryPlan.lane, testCase.lane, `auto lane mismatch for "${testCase.prompt}"`);
  assert.equal(dryPlan.scenario, testCase.scenario, `auto scenario mismatch for "${testCase.prompt}"`);
}

const councilPlan = routePlan('large Yuri OS beta proving run with model council architecture risk review');
assert.equal(councilPlan.claudeAdvisory.decision, 'use-sonnet', 'Claude should join high-stakes model council');
assert.deepEqual(councilPlan.claudeAdvisory.models, ['claude-sonnet-4-6'], 'Claude council model mismatch');
assert.equal(councilPlan.claudeAdvisory.outputCapLines, 80, 'Claude council line cap missing from route plan');
assert.equal(councilPlan.nativeFunctionGates.obliteratus.decision, 'use-native-gate', 'Obliteratus should gate high-stakes council work');
assert.equal(councilPlan.nativeFunctionGates.obliteratus.runtime, 'native_function', 'Obliteratus should be a native function gate');
assert.equal(councilPlan.nativeFunctionGates.obliteratus.alias, 'obliteratus', 'Obliteratus alias should stay stable');
assert.ok(councilPlan.pulseGovernanceSkeleton.activeProfiles.includes('obliteratus'), 'high-stakes plan should activate Obliteratus profile');
assert.ok(councilPlan.pulseGovernanceSkeleton.phaseCheckpoints.merge_learn.some((checkpoint) => checkpoint.profile === 'obliteratus' && checkpoint.action === 'durable_promotion_gate'), 'high-stakes plan should include Obliteratus durable promotion checkpoint');
const sandboxCouncilPlan = routePlan('Yuri sandbox proving run with model council review');
assert.equal(sandboxCouncilPlan.lane, 'codex-spark', 'model council should not steal sandbox execution lane');
assert.equal(sandboxCouncilPlan.claudeAdvisory.decision, 'use-sonnet', 'sandbox model council should still attach Claude advisory');
assert.equal(sandboxCouncilPlan.nativeFunctionGates.obliteratus.decision, 'use-native-gate', 'Obliteratus should gate sandbox promotion-risk work');
assert.ok(sandboxCouncilPlan.pulseGovernanceSkeleton.activeProfiles.includes('obliteratus'), 'sandbox promotion-risk plan should activate Obliteratus profile');

const promotionGatePlan = routePlan('promote verified artifact into canonical memory after review');
assert.equal(promotionGatePlan.nativeFunctionGates.obliteratus.decision, 'use-native-gate', 'promotion candidate should use Obliteratus gate');
assert.equal(promotionGatePlan.nativeFunctionGates.obliteratus.localTruthRequired, true, 'Obliteratus gate must require local truth');
assert.ok(promotionGatePlan.pulseGovernanceSkeleton.activeProfiles.includes('obliteratus'), 'promotion candidate should activate Obliteratus profile');
const smallCodePlan = routePlan('fix typo in one known helper test');
assert.equal(smallCodePlan.nativeFunctionGates.obliteratus.decision, 'skip', 'small code task should not invoke Obliteratus gate');
assert.equal(smallCodePlan.pulseGovernanceSkeleton.profileStatus.obliteratus, 'skip', 'small code task should skip Obliteratus profile');
assert(!smallCodePlan.pulseGovernanceSkeleton.activeProfiles.includes('obliteratus'), 'small code task should not activate Obliteratus profile');

const advisoryCases = [
  {
    prompt: 'fix typo in one known helper test',
    decision: 'skip',
    models: []
  },
  {
    prompt: 'summarize noisy logs into action items',
    decision: 'use-flash',
    models: ['deepseek-v4-flash']
  },
  {
    prompt: 'review architecture of DeepSeek and Codex collaboration for quality risk',
    decision: 'use-swarm',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash']
  },
  {
    prompt: 'diagnose ambiguous bug in parser',
    decision: 'use-flash',
    models: ['deepseek-v4-flash']
  },
  {
    prompt: 'debug failed auth flow after one reproduction still unclear',
    decision: 'use-pro',
    models: ['deepseek-v4-pro']
  }
];

for (const testCase of advisoryCases) {
  const plan = routePlan(testCase.prompt);
  assert.equal(plan.deepseekAdvisory.decision, testCase.decision, `DeepSeek advisory decision mismatch for "${testCase.prompt}"`);
  assert.deepEqual(plan.deepseekAdvisory.models, testCase.models, `DeepSeek advisory models mismatch for "${testCase.prompt}"`);
}

const examples = JSON.parse(runContract(['examples']));
assert.ok(Array.isArray(examples) && examples.length >= 5, 'embedded scenario catalog should contain multiple examples');
assert.ok(examples.some((scenario) => scenario.id === 'code-change'), 'code-change example missing');
assert.ok(examples.some((scenario) => scenario.id === 'protocol-change'), 'protocol-change example missing');
assert.ok(examples.some((scenario) => scenario.id === 'high-stakes-review'), 'high-stakes-review example missing');
const controlPlaneScenario = examples.find((scenario) => scenario.id === 'control-plane-orchestration');
assert.ok(controlPlaneScenario, 'control-plane-orchestration example missing');
assert.equal(controlPlaneScenario.defaultLane, 'swarm', 'control-plane-orchestration should route to swarm');
assert.ok(controlPlaneScenario.lifecycle.some((step) => /Graph plan/i.test(step)), 'control-plane lifecycle should include graph plan');
assert.ok(controlPlaneScenario.lifecycle.some((step) => /Sanitize/i.test(step)), 'control-plane lifecycle should include sanitize');
assert.ok(controlPlaneScenario.lifecycle.some((step) => /Promote/i.test(step)), 'control-plane lifecycle should include promote');
const sandboxScenario = examples.find((scenario) => scenario.id === 'sandbox-improvement');
assert.ok(sandboxScenario, 'sandbox-improvement example missing');
assert.equal(sandboxScenario.defaultLane, 'codex-spark', 'sandbox-improvement should route to codex-spark');
assert.ok(sandboxScenario.lifecycle.some((step) => /Self-probe/i.test(step)), 'sandbox lifecycle should include self-probe');
assert.ok(sandboxScenario.lifecycle.some((step) => /Sanitize/i.test(step)), 'sandbox lifecycle should include sanitize');
assert.ok(sandboxScenario.lifecycle.some((step) => /Promote-check/i.test(step)), 'sandbox lifecycle should include promote-check');
const crossDomainScenario = examples.find((scenario) => scenario.id === 'cross-domain-lesson-work');
assert.ok(crossDomainScenario, 'cross-domain-lesson-work example missing');
assert.equal(crossDomainScenario.defaultLane, 'summarize-local', 'cross-domain lesson work should route to summarize-local');
assert.ok(crossDomainScenario.lifecycle.some((step) => /Bridge/i.test(step)), 'cross-domain lifecycle should include bridge');
assert.ok(crossDomainScenario.lifecycle.some((step) => /Consolidate/i.test(step)), 'cross-domain lifecycle should include consolidate');
assert.equal(contract.lanes.codexSpark.alias, '@codex-spark', 'codexSpark lane metadata missing');

const swarmDefault = runContract(['swarm-default']);
assert.equal(swarmDefault, 'deepseek-v4-pro,deepseek-v4-flash', 'shared swarm default changed unexpectedly');

const deepseekReasoningRoute = JSON.parse(execFileSync(
  process.execPath,
  [offloadRunnerPath, 'deepseek-v4-pro:max-reasoning', '--dry-run', 'review deeply'],
  { encoding: 'utf8', env: { ...process.env, DEEPSEEK_API_KEY: 'test-key' } }
));
assert.equal(deepseekReasoningRoute.lane, 'deepseek-v4-pro', 'DeepSeek reasoning suffix should normalize to canonical Pro lane');
assert.equal(deepseekReasoningRoute.model, 'deepseek-v4-pro', 'DeepSeek reasoning suffix should preserve Pro model');
assert.equal(deepseekReasoningRoute.reasoningDepth, 'xhigh', 'max-reasoning suffix should become xhigh depth');
assert.equal(deepseekReasoningRoute.tools, false, 'DeepSeek must be text-only by default');

const deepseekAliasRoute = JSON.parse(execFileSync(
  process.execPath,
  [offloadRunnerPath, 'code-deepseek', '--dry-run', 'review code architecture'],
  { encoding: 'utf8', env: { ...process.env, DEEPSEEK_API_KEY: 'test-key' } }
));
assert.equal(deepseekAliasRoute.lane, 'deepseek-v4-pro', 'code-deepseek alias should normalize to canonical Pro lane');

const claudeStubRoot = mkdtempSync(join(tmpdir(), 'claude-council-regression-'));
try {
  const claudeStub = join(claudeStubRoot, 'claude-stub.sh');
  writeFileSync(claudeStub, [
    '#!/usr/bin/env bash',
    'printf "findings:\\n"',
    'printf "risks:\\n"',
    'printf "upgrade_candidates:\\n"',
    'printf "tests_needed:\\n"',
    'printf "reject_or_accept_reasoning:\\n"',
    'for i in $(seq 1 120); do printf "extra line %s\\n" "$i"; done',
    '',
  ].join('\n'));
  chmodSync(claudeStub, 0o755);
  const claudeOut = execFileSync(
    resolve(__dirname, 'ai'),
    ['@claude', 'review architecture risk'],
    { encoding: 'utf8', env: { ...process.env, CLAUDE_BIN: claudeStub } },
  );
  assert(claudeOut.includes('ADVISORY_CLAUDE_COUNCIL_OUTPUT'), 'Claude council advisory label missing');
  assert(claudeOut.includes('NOT_LOCAL_TRUTH'), 'Claude council local truth disclaimer missing');
  assert(claudeOut.includes('stdout_cap_marker: TRUNCATED'), 'Claude council output should be capped');
  assert(claudeOut.includes('required_sections=findings,risks,upgrade_candidates,tests_needed,reject_or_accept_reasoning'), 'Claude council schema marker missing');
} finally {
  rmSync(claudeStubRoot, { recursive: true, force: true });
}

const manifestRoot = mkdtempSync(join(tmpdir(), 'ollama-lane-regression-'));
try {
  mkdirSync(join(manifestRoot, 'qwen2.5'), { recursive: true });
  writeFileSync(join(manifestRoot, 'qwen2.5', '7b'), '{}');
  const ollamaLocal = JSON.parse(execFileSync(
    process.execPath,
    [offloadRunnerPath, 'ollama-local', '--dry-run', 'private summary'],
    { encoding: 'utf8', env: { ...process.env, OLLAMA_MANIFEST_DIR: manifestRoot } }
  ));
  assert.equal(ollamaLocal.kind, 'local', 'ollama-local should resolve as local');
  assert.equal(ollamaLocal.model, 'qwen2.5:7b', 'ollama-local should pick installed local model');

  const ollamaAuto = JSON.parse(execFileSync(
    process.execPath,
    [offloadRunnerPath, 'ollama', '--dry-run', 'private summary'],
    { encoding: 'utf8', env: { ...process.env, OLLAMA_MANIFEST_DIR: manifestRoot } }
  ));
  assert.equal(ollamaAuto.resolvedVia, 'local', 'ollama auto lane should prefer local when available');
} finally {
  rmSync(manifestRoot, { recursive: true, force: true });
}

process.stdout.write('offload-contract-regression: pass\n');
