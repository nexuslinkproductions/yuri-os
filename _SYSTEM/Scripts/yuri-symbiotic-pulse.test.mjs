#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const script = resolve(__dirname, 'yuri-symbiotic-pulse.mjs');
const runnerScript = resolve(__dirname, 'offload-runner.mjs');
const manifestRoot = mkdtempSync(join(tmpdir(), 'yuri-symbiotic-pulse-'));
const traceRoot = mkdtempSync(join(tmpdir(), 'yuri-symbiotic-pulse-trace-'));

try {
  for (const model of ['llama3.2:latest', 'qwen3.5:4b', 'qwen2.5-coder:7b', 'qwen2.5:7b']) {
    const [name, tag] = model.split(':');
    mkdirSync(join(manifestRoot, name), { recursive: true });
    writeFileSync(join(manifestRoot, name, tag), '{}');
  }

  const plan = JSON.parse(execFileSync(
    process.execPath,
    [
      script,
      'plan',
      'large campaign to refactor backend code, summarize docs, and review architecture risk',
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        OLLAMA_MANIFEST_DIR: manifestRoot,
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.example',
        OPENAI_API_KEY: '',
        OLLAMA_API_KEY: '',
        GEMMA_CLOUD_API_KEY: '',
      },
    },
  ));

  assert.equal(plan.schema_version, 2, 'schema version mismatch');
  assert.equal(plan.contract, 'PulsePlan', 'pulse plan contract mismatch');
  assert.equal(plan.pulseSeed.schema_version, 1, 'pulse seed schema mismatch');
  assert.equal(plan.pulseSeed.privacyClass, 'standard', 'privacy class mismatch');
  assert(plan.pulseSeed.definition.includes('structured intent genome'), 'pulse seed definition missing');
  assert(plan.pulseSeed.workPackets.some((packet) => packet.id === 'decompose'), 'high-reasoning pulse should include decompose packet');
  assert(plan.pulseSeed.capabilityHints.includes('deep-decomposition'), 'pulse seed should carry deep decomposition hint');
  assert.equal(plan.symbioticPulse.unit, 'symbioticPulse', 'pulse should be one native unit');
  assert.deepEqual(
    plan.symbioticPulse.nativeModules,
    ['ai-pipeline-offloading', 'swarm-coordination', 'offload-runner'],
    'pulse native modules should stay unified',
  );
  assert.equal(plan.symbioticPulse.arsenalScope, 'all_available_lanes', 'pulse should consider the whole available arsenal');
  assert.equal(plan.symbioticPulse.triggerAllAtOnce, false, 'pulse must not fire every lane at once');
  assert.equal(plan.symbioticPulse.reasoningMode, 'high', 'campaign/risk work should use high reasoning mode');
  assert.equal(plan.symbioticPulse.activationPolicy.initialStageMaxLanes, 1, 'initial stage should stay bounded');
  assert.equal(plan.symbioticPulse.activationPolicy.skipUnavailableLanes, true, 'unavailable lanes should be skipped');
  assert.equal(plan.symbioticPulse.activationPolicy.hiddenReasoningStorage, false, 'pulse should not store hidden reasoning');
  assert.equal(plan.symbioticPulse.arsenalRegistry.schema_version, 1, 'arsenal registry schema mismatch');
  assert.equal(plan.symbioticPulse.arsenalRegistry.entries['triage-local'].schema_version, 1, 'arsenal entry schema mismatch');
  assert(plan.symbioticPulse.arsenalRegistry.entries['triage-local'].capabilities.includes('classification'), 'triage capability missing');
  assert.equal(plan.symbioticPulse.arsenalRegistry.entries['triage-local'].availability.available, true, 'triage should be available');
  assert.equal(plan.symbioticPulse.activeSkillRegistry.schema_version, 1, 'active skill registry schema mismatch');
  assert.equal(plan.symbioticPulse.activeSkillRegistry.policy.advisoryOnly, true, 'active skills should stay advisory');
  assert(plan.symbioticPulse.activeSkillRegistry.active.length > 0, 'pulse should select active skills');
  assert(plan.symbioticPulse.activeSkillRegistry.active.every((skill) => !('body' in skill)), 'active skill entries should not expose bodies');
  assert(plan.symbioticPulse.activeSkillRegistry.stageBindings.intake_classify.length > 0, 'intake should receive skill bindings');
  assert.match(plan.symbioticPulse.activeSkillRegistry.trace.selectionHash, /^[a-f0-9]{16}$/, 'active skill selection hash mismatch');
  assert.equal(plan.symbioticPulse.activationGraph.schema_version, 1, 'activation graph schema mismatch');
  assert.equal(plan.symbioticPulse.activationGraph.type, 'bounded_dag', 'activation graph should be a bounded DAG');
  assert.equal(plan.symbioticPulse.activationGraph.triggerAllAtOnce, false, 'activation graph should not trigger all models');
  assert(plan.symbioticPulse.activationGraph.nodes.every((node) => Array.isArray(node.skillIds)), 'activation graph nodes should expose skillIds');
  assert.equal(plan.pulseTrace.schema_version, 1, 'pulse trace schema mismatch');
  assert.equal(plan.pulseTrace.storesHiddenReasoning, false, 'pulse trace must not store hidden reasoning');
  assert.equal(plan.pulseTrace.decisionTrace.activeSkillSelectionHash, plan.symbioticPulse.activeSkillRegistry.trace.selectionHash, 'pulse trace should include active skill selection hash');
  assert.deepEqual(
    plan.pulseTrace.decisionTrace.selectedSkillIds,
    plan.symbioticPulse.activeSkillRegistry.active.map((skill) => skill.skill_id),
    'pulse trace selected skills mismatch',
  );
  assert.equal(plan.pulseTrace.scores.verificationStatus, 'not_run', 'trace verification should start not_run');
  assert(!JSON.stringify(plan).includes('workhorse'), 'non-alias PulsePlan should not contain workhorse vocabulary');
  assert(!JSON.stringify(plan).includes('council'), 'non-alias PulsePlan should not contain council vocabulary');

  const stageIds = plan.symbioticPulse.stages.map((stage) => stage.id);
  assert.deepEqual(
    stageIds,
    ['intake_classify', 'campaign_decompose', 'specialist_fanout', 'verify_local_truth', 'merge_learn'],
    'pulse stage order changed',
  );
  assert(plan.symbioticPulse.selectedLanes.includes('triage-local'), 'local triage should be selected');
  assert(plan.symbioticPulse.selectedLanes.includes('deepseek-v4-pro'), 'cloud DeepSeek decomposition should be selected when available');
  assert(plan.symbioticPulse.selectedLanes.includes('code-local'), 'code specialist should be selected');
  assert(plan.symbioticPulse.selectedLanes.includes('summarize-local'), 'summarization specialist should be selected');
  assert(plan.symbioticPulse.stages.every((stage) => stage.triggerAllAtOnce === false), 'no stage should trigger all lanes at once');
  assert(plan.symbioticPulse.stages.every((stage) => Array.isArray(stage.laneIds)), 'stage laneIds missing');
  assert(plan.symbioticPulse.stages.every((stage) => Array.isArray(stage.skillIds)), 'stage skillIds missing');
  assert.deepEqual(
    plan.symbioticPulse.stages.find((stage) => stage.id === 'intake_classify').skillIds,
    plan.symbioticPulse.activeSkillRegistry.stageBindings.intake_classify,
    'intake stage should receive active skill binding',
  );

  const availableIds = plan.symbioticPulse.availableArsenal.map((lane) => lane.id);
  assert(availableIds.includes('deepseek-v4-pro'), 'available arsenal should include deepseek-v4-pro');
  assert(availableIds.includes('triage-local'), 'available arsenal should include triage-local');

  const frozenManifestRoot = mkdtempSync(join(tmpdir(), 'yuri-symbiotic-pulse-frozen-'));
  mkdirSync(join(frozenManifestRoot, 'deepseek-v2'), { recursive: true });
  writeFileSync(join(frozenManifestRoot, 'deepseek-v2', '16b'), '{}');
  const frozenPlan = JSON.parse(execFileSync(
    process.execPath,
    [script, 'plan', 'deep local reasoning review'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        OLLAMA_MANIFEST_DIR: frozenManifestRoot,
        DEEPSEEK_LOCAL_MODEL: 'deepseek-v2:16b',
        DEEPSEEK_API_KEY: '',
        OPENAI_API_KEY: '',
        OLLAMA_API_KEY: '',
        GEMMA_CLOUD_API_KEY: '',
      },
    },
  ));
  const frozenEntry = frozenPlan.symbioticPulse.arsenalRegistry.entries['deepseek-local'];
  assert.equal(frozenEntry.availability.available, false, 'frozen local model should be unavailable');
  assert.equal(frozenEntry.availability.frozen, true, 'frozen local model should be marked frozen');
  rmSync(frozenManifestRoot, { recursive: true, force: true });

  const dryRun = JSON.parse(execFileSync(
    process.execPath,
    [runnerScript, 'pulse', '--dry-run', '--plan-json', JSON.stringify(plan)],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PULSE_TRACE_ROOT: traceRoot,
      },
    },
  ));
  assert.equal(dryRun.executor, 'offload-runner', 'pulse dry-run should use offload-runner');
  assert.equal(dryRun.mode, 'pulse_dry_run', 'pulse dry-run should not execute lanes');
  assert.equal(dryRun.pulse_plan_schema_version, 2, 'pulse dry-run should accept PulsePlan v2');
  assert.equal(dryRun.trigger_all_at_once, false, 'pulse dry-run should preserve bounded activation');
  assert.deepEqual(dryRun.stage_order, stageIds, 'pulse dry-run should expose stage_order');
  assert.deepEqual(dryRun.stages.map((stage) => stage.id), stageIds, 'pulse dry-run stage order mismatch');
  assert(dryRun.stages.every((stage) => Array.isArray(stage.skillIds)), 'pulse dry-run stages should expose skillIds');
  assert(dryRun.pulse_trace_ledger_path.endsWith('ledger.ndjson'), 'pulse dry-run should expose ledger path');
  assert(existsSync(dryRun.pulse_trace_ledger_path), 'pulse dry-run should write ledger');
  assert(existsSync(dryRun.pulse_trace_snapshot_path), 'pulse dry-run should write snapshot');
  assert(dryRun.pulse_trace_events.some((event) => event.type === 'pulse.dry_run.completed'), 'pulse dry-run completion event missing');

  process.stdout.write('yuri-symbiotic-pulse: pass\n');
} finally {
  rmSync(manifestRoot, { recursive: true, force: true });
  rmSync(traceRoot, { recursive: true, force: true });
}
