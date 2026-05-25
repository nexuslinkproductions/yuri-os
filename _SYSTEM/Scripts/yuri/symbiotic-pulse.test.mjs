#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createEvent, EVENT_TYPES } from './event-protocol.mjs';
import { createInitialHarnessState, reduceHarnessState, summarizeHarnessState } from './harness-state.mjs';
import { compileDryRun } from './prompt-compiler.mjs';
import {
  createRunArtifactPaths,
  createRunRecord,
  serializeEventForJsonl,
  summarizeRunRecord,
  validateRunRecord,
} from './run-recorder.mjs';
import { runSymbioticPulse } from './symbiotic-pulse.mjs';

const simpleUser = runSymbioticPulse({
  source: 'user',
  content: 'inspect package scripts without mutation',
  requestedAction: 'inspect',
  turnId: 'turn-simple',
});
assert.equal(simpleUser.mode, 'micro', 'simple user request should use micro pulse');
assert.equal(simpleUser.authority, 'owner', 'user source should map to owner authority');
assert.equal(simpleUser.trustLevel, 'trusted', 'simple owner input should be trusted');
assert.equal(simpleUser.decision, 'continue', 'simple owner input should continue');
assert.equal(simpleUser.localTruthRequired, false, 'simple owner input should not need local truth by default');
assert.equal(simpleUser.mutationGate.required, false, 'simple readonly input should not open mutation gate');
assert.ok(simpleUser.normalizedTaskDelta.includes('inspect package scripts'), 'normalized task delta should preserve intent');

const mutationUser = runSymbioticPulse({
  source: 'user',
  content: 'edit _SYSTEM/Scripts/yuri/symbiotic-pulse.mjs to add a new gate',
  requestedAction: 'edit file',
  turnId: 'turn-mutation',
});
assert.equal(mutationUser.mode, 'full', 'mutation request should escalate to full pulse');
assert.equal(mutationUser.mutationGate.required, true, 'mutation request should require mutation gate');
assert.equal(mutationUser.riskLevel, 'medium', 'normal repo mutation should be medium risk');
assert.equal(mutationUser.decision, 'continue', 'non-protected owner mutation can continue after gate marking');

const dockedReport = runSymbioticPulse({
  source: 'docked_llm',
  content: 'I checked the repo and _SYSTEM/Scripts/yuri/symbiotic-pulse.mjs already emits pulse.json',
  claims: ['_SYSTEM/Scripts/yuri/symbiotic-pulse.mjs emits pulse.json'],
  turnId: 'turn-docked',
});
assert.equal(dockedReport.mode, 'full', 'docked LLM claims should escalate to full pulse');
assert.equal(dockedReport.authority, 'docked_llm', 'docked source should map to docked authority');
assert.equal(dockedReport.trustLevel, 'advisory', 'docked model output must remain advisory');
assert.equal(dockedReport.localTruthRequired, true, 'docked model repo claim needs local truth');
assert.equal(dockedReport.decision, 'verify', 'docked model repo claim should verify before trust');

const localTool = runSymbioticPulse({
  source: 'tool_result',
  content: 'git status --short returned no changes for _SYSTEM/Scripts/yuri',
  requestedAction: 'local deterministic read',
  context: { deterministicLocal: true },
  turnId: 'turn-tool',
});
assert.equal(localTool.authority, 'local_evidence', 'deterministic local tool output should be local evidence');
assert.equal(localTool.trustLevel, 'trusted', 'deterministic local tool output should be trusted');
assert.equal(localTool.decision, 'continue', 'deterministic local tool output should continue');

const protectedSelfAction = runSymbioticPulse({
  source: 'assistant_self',
  content: 'I will edit .env and read backend/data/memory.db before responding',
  requestedAction: 'edit .env',
  turnId: 'turn-self-protected',
});
assert.equal(protectedSelfAction.mode, 'full', 'protected self-action should escalate');
assert.equal(protectedSelfAction.riskLevel, 'critical', 'protected path self-action should be critical');
assert.equal(protectedSelfAction.trustLevel, 'untrusted', 'critical self-action should be untrusted');
assert.equal(protectedSelfAction.decision, 'block', 'protected path self-action should block');
assert.equal(protectedSelfAction.mutationGate.blocked, true, 'protected path should block mutation gate');

const conflict = runSymbioticPulse({
  source: 'user',
  content: 'this is already implemented',
  context: { conflicts: ['pulse.json missing from YURI harness artifacts'] },
  turnId: 'turn-conflict',
});
assert.equal(conflict.mode, 'full', 'conflict should escalate to full pulse');
assert.equal(conflict.localTruthRequired, true, 'conflict should require local truth');
assert.equal(conflict.decision, 'verify', 'conflict should verify before continuing');

assert.equal(EVENT_TYPES.PULSE_EVALUATED, 'PULSE_EVALUATED', 'event protocol should expose PULSE_EVALUATED');

const pulseEvent = createEvent({
  event_id: 'evt-pulse',
  run_id: 'run-harness',
  turn_id: 'turn-simple',
  type: EVENT_TYPES.PULSE_EVALUATED,
  model: 'codex-main',
  lane: 'main-session',
  phase: simpleUser.phase,
  local_truth_required: simpleUser.localTruthRequired,
  source_authority: simpleUser.authority,
  payload: {
    pulse_id: simpleUser.pulseId,
    warnings: simpleUser.warnings,
  },
});
assert.equal(pulseEvent.type, EVENT_TYPES.PULSE_EVALUATED, 'pulse should produce a typed harness event');
assert.equal(pulseEvent.source_authority, 'owner', 'pulse event should preserve source authority');

const initialState = createInitialHarnessState({
  run_id: 'run-harness',
  turn_id: 'turn-simple',
});
const reducedState = reduceHarnessState(initialState, pulseEvent);
assert.equal(reducedState.phase, simpleUser.phase, 'harness state should adopt pulse phase');
assert.equal(reducedState.lane, 'main-session', 'harness state should adopt pulse lane');
assert.equal(reducedState.model, 'codex-main', 'harness state should adopt pulse model');
assert.match(summarizeHarnessState(reducedState), /run-harness/, 'harness state summary should stay inspectable');

const contractDryRun = compileDryRun({
  run_id: 'run-harness',
  turn_id: 'turn-simple',
  task_delta: simpleUser.normalizedTaskDelta,
  allowed_scope: ['_SYSTEM/Scripts/yuri'],
  forbidden_scope: ['backend/data', '.env'],
});
assert.equal(contractDryRun.ok, true, 'pulse task delta should compile into a valid one-transaction contract');
assert.equal(contractDryRun.validation.ok, true, 'compiled contract should pass validation');
assert.match(contractDryRun.contract.compiled_prompt, /ONE_TRANSACTION/, 'compiled prompt should encode one-transaction mode');

const artifactPaths = createRunArtifactPaths({
  base_dir: '/tmp/yuri-harness-test',
  run_id: 'run-harness',
  turn_id: 'turn-simple',
});
assert.ok(artifactPaths.pulse_path.endsWith('/pulse.json'), 'run recorder should reserve pulse artifact path');

const runRecord = createRunRecord({
  run_id: 'run-harness',
  turn_id: 'turn-simple',
  artifact_paths: artifactPaths,
  event_count: 1,
  final_report_seen: false,
  warnings: simpleUser.warnings,
});
assert.equal(validateRunRecord(runRecord).ok, true, 'run record should validate with pulse artifact paths');
assert.match(summarizeRunRecord(runRecord), /events 1/, 'run record summary should expose event count');
assert.match(serializeEventForJsonl(pulseEvent), /PULSE_EVALUATED/, 'pulse event should serialize to JSONL');

process.stdout.write('symbiotic-pulse: pass\n');
