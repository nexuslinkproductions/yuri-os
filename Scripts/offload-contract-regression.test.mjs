#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const contractPath = resolve(__dirname, 'offload-contract.mjs');

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
  assert.ok(Array.isArray(plan.lifecycle) && plan.lifecycle.length >= 5, `lifecycle missing for "${testCase.prompt}"`);
  assert.ok(Array.isArray(plan.learningCapture) && plan.learningCapture.includes('next_rule_candidate'), `learning capture missing for "${testCase.prompt}"`);

  const dryPlan = autoPlan(testCase.prompt);
  assert.equal(dryPlan.lane, testCase.lane, `auto lane mismatch for "${testCase.prompt}"`);
  assert.equal(dryPlan.scenario, testCase.scenario, `auto scenario mismatch for "${testCase.prompt}"`);
}

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
    models: ['deepseek-v4-pro-lite-budget', 'deepseek-v4-flash']
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

const swarmDefault = runContract(['swarm-default']);
assert.equal(swarmDefault, 'deepseek-v4-pro-lite-budget,deepseek-v4-flash', 'shared swarm default changed unexpectedly');

process.stdout.write('offload-contract-regression: pass\n');
