#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const contractPath = resolve(__dirname, 'llm-compat-contract.mjs');
const llmCompatPath = resolve(__dirname, 'llm-compat.sh');
const ollamaLanePath = resolve(__dirname, 'ollama-lane.mjs');

// Windows: `ai` and `llm-compat.sh` are bash scripts and cannot be exec'd directly
// (ENOENT); invoke them via bash. POSIX execs the shebang script directly (unchanged).
function runShellScript(scriptPath, args, opts = {}) {
  return process.platform === 'win32'
    ? execFileSync('bash', [scriptPath, ...args], opts)
    : execFileSync(scriptPath, args, opts);
}

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
assert.equal(contract.deepseekCodexQualityGate.authority.modelOutput, 'worker_product=true; staged_for_review=true; local_truth_claim=false (until main-session verifies)', 'DeepSeek lane output is a staged worker-product, advisory until main-session verifies');
assert.ok(contract.deepseekCodexQualityGate.discardWhenAny.includes('Contradicts deterministic local evidence.'), 'degradation guard missing');
assert.ok(contract.deepseekCodexQualityGate.metrics.includes('accepted_findings'), 'quality metrics missing');
assert.equal(contract.claudeProtocolGate.mode, 'warn-first', 'Claude protocol gate should warn first');
assert.equal(contract.claudeProtocolGate.mainSessionFinalAuthority, true, 'Claude main session must keep final authority');
assert.equal(contract.claudeProtocolGate.codexSpecCompatibility.requiredSpec, '## CODEX TASK SPEC', 'Claude gate must preserve Codex spec compatibility');
assert.equal(contract.claudeProtocolGate.nativeFunctionGates.argus, 'always-on', 'Claude gate should keep Argus native gate always-on');
assert.equal(contract.claudeProtocolGate.nativeFunctionGates.crucible, 'conditional-high-risk', 'Claude gate should make Crucible conditional');
// Yuri Sentinel absorbed into Musubi as Nisaba Sentinel (2026-05-17) — authority updated to native-integrated
assert.ok(['bridge-only-advisory', 'native-integrated'].includes(contract.claudeProtocolGate.sentinel.authority), 'Yuri Sentinel/Nisaba authority must be advisory or native-integrated');
assert.equal(contract.lanes.ollama.alias, '@ollama', 'additive Ollama lane metadata missing');
assert.equal(contract.lanes.ollamaLocal.alias, '@ollama-local', 'additive local Ollama lane metadata missing');
assert.equal(contract.lanes.gemmaLocal.alias, '@gemma-local', 'Gemma local lane metadata missing');
assert.deepEqual(contract.lanes.gemmaLocal.dispatchTokens, ['gemma-local', 'gemma4:12b-it-qat'], 'Gemma local lane should expose only the QAT model token');
assert.equal(contract.lanes.claude.alias, '@claude', 'Claude council lane metadata missing');
// NVIDIA NIM (kimi + nemotron) lanes were retired and replaced by the first-class Xiaomi Mimo lane
// (Anthropic Messages protocol, MIMO_API_KEY). The nvidia/kimi lanes must be fully gone.
assert.equal(contract.lanes.nvidia, undefined, 'retired NVIDIA NIM lane must be removed from the contract');
assert.equal(contract.lanes.kimi, undefined, 'retired Kimi NIM lane must be removed from the contract');
assert.equal(contract.lanes.mimo.alias, '@mimo', 'Mimo lane metadata missing');
assert.equal(contract.lanes.mimo.protocol, 'anthropic', 'Mimo lane must speak the Anthropic Messages protocol');
assert.equal(contract.lanes.mimo.envKey, 'MIMO_API_KEY', 'Mimo lane must read MIMO_API_KEY');
assert.deepEqual(contract.lanes.mimo.dispatchTokens, ['mimo', 'mimo-v2.5-pro', 'mimo-v2.5', 'mimo-flash', 'mimo-v2-flash', 'xiaomimimo', 'mimo-session'], 'Mimo dispatch tokens = the live forms the dispatcher emits');
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
assert.ok(contract.pulseGovernanceSkeleton.checkpointProfiles.crucible, 'Crucible checkpoint profile missing');
assert.ok(contract.pulseGovernanceSkeleton.checkpointProfiles['sentinel-derived'], 'Yuri Sentinel-derived pattern profile missing');

const yuriSelftest = execFileSync(
  process.execPath,
  [
    '_SYSTEM/Scripts/yuri-guarded-executor.mjs',
    '--selftest',
    '--artifact-root',
    '/tmp/yuri-yuri-selftest-regression'
  ],
  { encoding: 'utf8' }
).trim();
assert.ok(yuriSelftest.includes('YURI_GUARDED_EXECUTOR_SELFTEST_PASS'), 'yuri guarded executor selftest should pass');

function autoPlan(prompt) {
  return JSON.parse(runShellScript(
    resolve(__dirname, 'ai'),
    ['auto', '--dry-run', prompt],
    { encoding: 'utf8' }
  ).trim());
}

const cases = [
  {
    prompt: 'brain dump to durable orchestration control plane: intake normalize graph plan route execute verify sanitize promote',
    lane: 'native',
    scenario: 'control-plane-orchestration'
  },
  {
    prompt: 'compile a task graph for artifact-driven verification and canonical state promotion',
    lane: 'native',
    scenario: 'control-plane-orchestration'
  },
  {
    prompt: 'run the Yuri sandbox improvement loop as a live test',
    lane: 'native',
    scenario: 'sandbox-improvement'
  },
  {
    prompt: 'complete Yuri OS evidence-first upgrade proving run with source manifest reference registry section manifest md-vs-html and html control surface',
    lane: 'native',
    scenario: 'sandbox-improvement'
  },
  {
    prompt: 'document-native audit proving run for beta-readiness with artifact audit and promotion candidates',
    lane: 'native',
    scenario: 'sandbox-improvement'
  },
  {
    prompt: 'use @codex-spark for a bounded read-only sandbox proving run',
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
    lane: 'native',
    scenario: 'high-stakes-review'
  },
  {
    prompt: 'update offload protocol for a new CLI harness',
    lane: 'native',
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
  assert.equal(plan.entrypoint, './_SYSTEM/Scripts/ai auto', `entrypoint mismatch for "${testCase.prompt}"`);
  assert.equal(plan.qualityGate, 'main-session', `quality gate mismatch for "${testCase.prompt}"`);
  assert.ok(plan.dispatch === 'single-lane' || plan.dispatch === 'native-orchestration', `dispatch missing for "${testCase.prompt}"`);
  assert.equal(plan.deepseekAdvisory.localTruthRequired, true, `local truth boundary missing for "${testCase.prompt}"`);
  assert.equal(plan.deepseekAdvisory.codexFinalAuthority, true, `Codex authority missing for "${testCase.prompt}"`);
  assert.equal(plan.claudeAdvisory.localTruthRequired, true, `Claude local truth boundary missing for "${testCase.prompt}"`);
  assert.equal(plan.claudeAdvisory.codexFinalAuthority, true, `Claude Codex authority missing for "${testCase.prompt}"`);
  assert.equal(plan.nativeFunctionGates.argus.decision, 'always-on', `Argus native gate missing for "${testCase.prompt}"`);
  assert.equal(plan.nativeFunctionGates.argus.runtime, 'native_function', `Argus should be native for "${testCase.prompt}"`);
  assert.equal(plan.pulseGovernanceSkeleton.id, 'pulse-governance-skeleton', `pulse governance skeleton missing for "${testCase.prompt}"`);
  assert.equal(plan.pulseGovernanceSkeleton.authority.entryBranch, 'main', `pulse intake should start on main for "${testCase.prompt}"`);
  assert.equal(plan.pulseGovernanceSkeleton.authority.exitBranch, 'main', `pulse output should return to main for "${testCase.prompt}"`);
  assert.ok(plan.pulseGovernanceSkeleton.activeProfiles.includes('argus'), `Argus profile should be active for "${testCase.prompt}"`);
  assert.ok(plan.pulseGovernanceSkeleton.activeProfiles.includes('sentinel-derived'), `Yuri Sentinel-derived profile should be available for "${testCase.prompt}"`);
  assert.ok(plan.pulseGovernanceSkeleton.phaseCheckpoints.verify_local_truth.some((checkpoint) => checkpoint.profile === 'argus'), `verify phase should include Argus checkpoint for "${testCase.prompt}"`);
  assert.ok(plan.pulseGovernanceSkeleton.phaseCheckpoints.intake_classify.some((checkpoint) => checkpoint.profile === 'sentinel-derived'), `intake phase should include Yuri Sentinel-derived manifest pattern for "${testCase.prompt}"`);
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

// WP-C.2 (wave-2): `analysis` tier coverage — previously ZERO of the cases hit
// this tier. NOTE adapted to HEAD: the audit's expected ensemble (deepseek +
// nvidia) predates the lane consolidation (8ca6c254) — the live analysis
// council is deepseek-preflight + mimo-preflight.
const analysisPlan = routePlan('which knob matters more for recall, recency or salience?');
assert.equal(analysisPlan.complexityTier, 'analysis', 'pure advisory question should classify as analysis tier');
assert.ok(analysisPlan.ensemble.includes('deepseek-preflight'), 'analysis ensemble includes deepseek');
assert.ok(analysisPlan.ensemble.includes('mimo-preflight'), 'analysis ensemble includes mimo');
assert.ok(!analysisPlan.ensemble.some((e) => e.startsWith('codex')), 'analysis tier is advisory-only — no codex execution/queue lanes');
const analysisPlan2 = routePlan('does the soak loop doc still describe the live flow?');
assert.equal(analysisPlan2.complexityTier, 'analysis', 'doc-currency question stays analysis tier');
// Deliberate shadowing pin: analysis-VERB prompts route to the analysis-council
// SCENARIO, which classifyComplexity escalates to `complex` (heavier council with
// yuri-risk + shura). The `analysis` TIER is reachable only by question prompts
// outside that scenario — pinned here so a future change is a decision, not drift.
const councilVerbPlan = routePlan('assess the tradeoffs of our recall blend weights, thoughts on what to tune?');
assert.equal(councilVerbPlan.complexityTier, 'complex', 'analysis-council scenario escalates to complex by design');

const councilPlan = routePlan('large Yuri OS beta proving run with model council architecture risk review');
assert.equal(councilPlan.claudeAdvisory.decision, 'use-sonnet', 'Claude should join high-stakes model council');
assert.deepEqual(councilPlan.claudeAdvisory.models, ['deepseek-v4-pro'], 'Claude council model mismatch — updated to deepseek-v4-pro per sovereignty sprint P6');
assert.equal(councilPlan.claudeAdvisory.outputCapLines, 80, 'Claude council line cap missing from route plan');
assert.equal(councilPlan.nativeFunctionGates.crucible.decision, 'use-native-gate', 'Crucible should gate high-stakes council work');
assert.equal(councilPlan.nativeFunctionGates.crucible.runtime, 'native_function', 'Crucible should be a native function gate');
assert.equal(councilPlan.nativeFunctionGates.crucible.alias, 'crucible', 'Crucible alias should stay stable');
assert.ok(councilPlan.pulseGovernanceSkeleton.activeProfiles.includes('crucible'), 'high-stakes plan should activate Crucible profile');
assert.ok(councilPlan.pulseGovernanceSkeleton.phaseCheckpoints.merge_learn.some((checkpoint) => checkpoint.profile === 'crucible' && checkpoint.action === 'durable_promotion_gate'), 'high-stakes plan should include Crucible durable promotion checkpoint');
const claudeUltraPlan = routePlan('claude ultra deep hardening protocol promotion Yuri Sentinel symbioticPulse routing');
assert.equal(claudeUltraPlan.scenario, 'protocol-change', 'Claude ultra hardening should classify as protocol-change');
assert.equal(claudeUltraPlan.lane, 'native', 'Claude ultra hardening should route to native main-session orchestration');
assert.equal(claudeUltraPlan.deepseekAdvisory.decision, 'use-native', 'Claude ultra hardening should use the native single-advisory decision');
assert.deepEqual(claudeUltraPlan.deepseekAdvisory.models, ['deepseek-v4-pro'], 'native advisory must be a single sequential DeepSeek-pro call (no parallel pair)');
assert.equal(claudeUltraPlan.nativeFunctionGates.argus.decision, 'always-on', 'Claude ultra hardening should keep Argus always-on');
assert.equal(claudeUltraPlan.nativeFunctionGates.crucible.decision, 'use-native-gate', 'Claude ultra hardening should activate Crucible');
assert.ok(claudeUltraPlan.pulseGovernanceSkeleton.activeProfiles.includes('sentinel-derived'), 'Claude ultra hardening should expose Yuri Sentinel-derived profile');
const sandboxCouncilPlan = routePlan('Yuri sandbox proving run with model council review');
assert.equal(sandboxCouncilPlan.lane, 'native', 'sandbox proving runs should not auto-route to Spark without explicit request');
assert.equal(sandboxCouncilPlan.codexDispatch.model, 'gpt-5.5', 'non-explicit sandbox work should stay on primary Codex');
assert.equal(sandboxCouncilPlan.codexDispatch.reasoning, 'xhigh', 'non-explicit sandbox work should use high-power Codex reasoning');
assert.equal(sandboxCouncilPlan.claudeAdvisory.decision, 'use-sonnet', 'sandbox model council should still attach Claude advisory');
assert.equal(sandboxCouncilPlan.nativeFunctionGates.crucible.decision, 'use-native-gate', 'Crucible should gate sandbox promotion-risk work');
assert.ok(sandboxCouncilPlan.pulseGovernanceSkeleton.activeProfiles.includes('crucible'), 'sandbox promotion-risk plan should activate Crucible profile');
const explicitSparkPlan = routePlan('use @codex-spark for a bounded read-only sandbox proving run');
assert.equal(explicitSparkPlan.lane, 'codex-spark', 'explicit Spark request should preserve Spark lane');
assert.equal(explicitSparkPlan.codexDispatch.model, 'gpt-5.3-codex-spark', 'explicit Spark request should use Spark model');
assert.equal(explicitSparkPlan.codexDispatch.sandbox, 'read-only', 'explicit Spark request should stay read-only');

const promotionGatePlan = routePlan('promote verified artifact into canonical memory after review');
assert.equal(promotionGatePlan.nativeFunctionGates.crucible.decision, 'use-native-gate', 'promotion candidate should use Crucible gate');
assert.equal(promotionGatePlan.nativeFunctionGates.crucible.localTruthRequired, true, 'Crucible gate must require local truth');
assert.ok(promotionGatePlan.pulseGovernanceSkeleton.activeProfiles.includes('crucible'), 'promotion candidate should activate Crucible profile');
const smallCodePlan = routePlan('fix typo in one known helper test');
assert.equal(smallCodePlan.nativeFunctionGates.crucible.decision, 'skip', 'small code task should not invoke Crucible gate');
assert.equal(smallCodePlan.pulseGovernanceSkeleton.profileStatus.crucible, 'skip', 'small code task should skip Crucible profile');
assert(!smallCodePlan.pulseGovernanceSkeleton.activeProfiles.includes('crucible'), 'small code task should not activate Crucible profile');

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
    decision: 'use-native',
    models: ['deepseek-v4-pro']
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
assert.equal(controlPlaneScenario.defaultLane, 'native', 'control-plane-orchestration should route to native main-session orchestration');
assert.ok(controlPlaneScenario.lifecycle.some((step) => /Graph plan/i.test(step)), 'control-plane lifecycle should include graph plan');
assert.ok(controlPlaneScenario.lifecycle.some((step) => /Sanitize/i.test(step)), 'control-plane lifecycle should include sanitize');
assert.ok(controlPlaneScenario.lifecycle.some((step) => /Promote/i.test(step)), 'control-plane lifecycle should include promote');
const sandboxScenario = examples.find((scenario) => scenario.id === 'sandbox-improvement');
assert.ok(sandboxScenario, 'sandbox-improvement example missing');
assert.equal(sandboxScenario.defaultLane, 'native', 'sandbox-improvement should route to native unless Spark is explicit');
assert.ok(sandboxScenario.lifecycle.some((step) => /Self-probe/i.test(step)), 'sandbox lifecycle should include self-probe');
assert.ok(sandboxScenario.lifecycle.some((step) => /Sanitize/i.test(step)), 'sandbox lifecycle should include sanitize');
assert.ok(sandboxScenario.lifecycle.some((step) => /Promote-check/i.test(step)), 'sandbox lifecycle should include promote-check');
const crossDomainScenario = examples.find((scenario) => scenario.id === 'cross-domain-lesson-work');
assert.ok(crossDomainScenario, 'cross-domain-lesson-work example missing');
assert.equal(crossDomainScenario.defaultLane, 'summarize-local', 'cross-domain lesson work should route to summarize-local');
assert.ok(crossDomainScenario.lifecycle.some((step) => /Bridge/i.test(step)), 'cross-domain lifecycle should include bridge');
assert.ok(crossDomainScenario.lifecycle.some((step) => /Consolidate/i.test(step)), 'cross-domain lifecycle should include consolidate');
assert.equal(contract.lanes.codexSpark.alias, '@codex-spark', 'codexSpark lane metadata missing');

const deepseekReasoningRoute = JSON.parse(runShellScript(
  llmCompatPath,
  ['--model', 'deepseek-v4-pro:max-reasoning', '--dry-run', 'review deeply'],
  { encoding: 'utf8', env: { ...process.env, DEEPSEEK_API_KEY: 'test-key' } }
));
assert.equal(deepseekReasoningRoute.lane, 'deepseek-v4-pro', 'DeepSeek reasoning suffix should normalize to canonical Pro lane');
assert.equal(deepseekReasoningRoute.model, 'deepseek-v4-pro:cloud', 'DeepSeek route exposes the ollama-cloud wire model id (repointed 2026-06-15 off api.deepseek.com; lane KEY stays bare deepseek-v4-pro)');
assert.match(deepseekReasoningRoute.endpoint, /ollama\.com\/api\/chat$/, 'DeepSeek V4 Pro now routes through Ollama Cloud (repointed 2026-06-15 off api.deepseek.com)');
assert.equal(deepseekReasoningRoute.provider, 'ollama-cloud', 'DeepSeek V4 Pro now routes through the ollama-cloud provider (repointed 2026-06-15)');
assert.ok(Array.isArray(deepseekReasoningRoute.tools), 'DeepSeek dry-run should expose the full YURI tool loadout');

const deepseekAliasRoute = JSON.parse(runShellScript(
  llmCompatPath,
  ['--model', 'code-deepseek', '--dry-run', 'review code architecture'],
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
  let claudeError = null;
  try {
    runShellScript(
      resolve(__dirname, 'ai'),
      ['@claude', 'review architecture risk'],
      { encoding: 'utf8', env: { ...process.env, CLAUDE_BIN: claudeStub } },
    );
  } catch (error) {
    claudeError = error;
  }
  assert(claudeError, 'Claude prompt route should fail closed');
  assert.equal(claudeError.status, 64, 'Claude prompt route should use EX_USAGE failure');
  assert.match(claudeError.stderr, /Claude prompt route disabled: @claude/, 'Claude prompt route should explain the disabled path');
  assert.match(claudeError.stderr, /continuous Claude CLI session/, 'Claude prompt route should point to the continuous tmux\/PTY path');
  assert.match(claudeError.stderr, /Forbidden here: Claude SDK/, 'Claude prompt route should forbid SDK-style one-shot calls');
} finally {
  rmSync(claudeStubRoot, { recursive: true, force: true });
}

const manifestRoot = mkdtempSync(join(tmpdir(), 'ollama-lane-regression-'));
try {
  mkdirSync(join(manifestRoot, 'gemma4'), { recursive: true });
  writeFileSync(join(manifestRoot, 'gemma4', '12b-it-qat'), '{}');
  writeFileSync(join(manifestRoot, 'gemma4', 'e2b'), '{}');
  const ollamaLocal = JSON.parse(execFileSync(
    process.execPath,
    [ollamaLanePath, 'ollama-local', '--dry-run', 'private summary'],
    { encoding: 'utf8', env: { ...process.env, OLLAMA_MANIFEST_DIR: manifestRoot, OLLAMA_LOCAL_MODEL: 'gemma4:e2b' } }
  ));
  assert.equal(ollamaLocal.kind, 'local', 'ollama-local should resolve as local');
  assert.equal(ollamaLocal.model, 'gemma4:12b-it-qat', 'ollama-local should normalize retired local aliases to Gemma 4 12B QAT');

  const ollamaAuto = JSON.parse(execFileSync(
    process.execPath,
    [ollamaLanePath, 'ollama', '--dry-run', 'private summary'],
    { encoding: 'utf8', env: { ...process.env, OLLAMA_MANIFEST_DIR: manifestRoot, OLLAMA_LOCAL_MODEL: 'gemma4:e2b' } }
  ));
  assert.equal(ollamaAuto.resolvedVia, 'local', 'ollama auto lane should prefer local when available');
  assert.equal(ollamaAuto.model, 'gemma4:12b-it-qat', 'ollama auto lane should stay on the Gemma-only local policy');
} finally {
  rmSync(manifestRoot, { recursive: true, force: true });
}

process.stdout.write('llm-compat-contract-regression: pass\n');
