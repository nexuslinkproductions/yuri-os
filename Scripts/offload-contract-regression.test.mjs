#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
    prompt: 'run the Yuri sandbox improvement loop as a live test',
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
    prompt: 'use ollama to summarize this private local note',
    lane: 'ollama',
    scenario: 'document-synthesis'
  },
  {
    prompt: 'offline summarize this private local note',
    lane: 'ollama-local',
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
const sandboxScenario = examples.find((scenario) => scenario.id === 'sandbox-improvement');
assert.ok(sandboxScenario, 'sandbox-improvement example missing');
assert.equal(sandboxScenario.defaultLane, 'codex-spark', 'sandbox-improvement should route to codex-spark');
assert.ok(sandboxScenario.lifecycle.some((step) => /Self-probe/i.test(step)), 'sandbox lifecycle should include self-probe');
assert.ok(sandboxScenario.lifecycle.some((step) => /Sanitize/i.test(step)), 'sandbox lifecycle should include sanitize');
assert.ok(sandboxScenario.lifecycle.some((step) => /Promote-check/i.test(step)), 'sandbox lifecycle should include promote-check');
assert.equal(contract.lanes.codexSpark.alias, '@codex-spark', 'codexSpark lane metadata missing');

const swarmDefault = runContract(['swarm-default']);
assert.equal(swarmDefault, 'deepseek-v4-pro-lite-budget,deepseek-v4-flash', 'shared swarm default changed unexpectedly');

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
