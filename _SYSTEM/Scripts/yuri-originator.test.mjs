import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildSubstrateToolObservationPrompt,
  executeSubstrateToolRequest,
  buildCandidateActions,
  buildFormulaSlate,
  buildWorkSubstrate,
  buildWorkerLaneInvocation,
  buildWorkerRevisionPrompt,
  parseWorkerJsonPayload,
  resolveMaxLadderInversionCap,
  resolveOriginatorOllamaTimeoutMs,
  resolveWorkerBackend,
  resolveRevisionAttempts,
  runOriginator,
  selectFinalWorkerVerification,
  shouldReviseWorkerOutput,
  tryGateCompiledModelOutput,
  collectSubstrateToolRequests,
  verifyFormulaUse,
  verifyWorkerModelOutput,
} from './yuri-originator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const originatorPath = resolve(__dirname, 'yuri-originator.mjs');

{
  assert.equal(resolveOriginatorOllamaTimeoutMs({}, {}), 300_000);
  assert.equal(resolveOriginatorOllamaTimeoutMs({ timeoutMs: 900000 }, {}), 900_000);
  assert.equal(resolveOriginatorOllamaTimeoutMs({}, { YURI_ORIGINATOR_OLLAMA_TIMEOUT_MS: '600000' }), 600_000);
  assert.equal(resolveRevisionAttempts({}, {}), 1);
  assert.equal(resolveRevisionAttempts({ autoRevise: false }, {}), 0);
  assert.equal(resolveRevisionAttempts({ revisionAttempts: 10 }, {}), 2);
  assert.equal(resolveMaxLadderInversionCap({}), 0);
  assert.equal(resolveMaxLadderInversionCap({ maxLadderInversionCap: Infinity }), Infinity);
  assert.equal(resolveWorkerBackend({ lane: 'gemma-local' }), 'ollama');
  assert.equal(resolveWorkerBackend({ lane: 'deepseek-v4-pro' }), 'llm-lane');
  assert.equal(resolveWorkerBackend({ backend: 'llm-compat', lane: 'gemma-local' }), 'llm-lane');
}

{
  const localInvocation = buildWorkerLaneInvocation({
    lane: 'gemma-local',
    model: 'gemma4:12b-it-qat',
    backend: 'ollama',
    system: 'system',
    timeoutMs: 123,
  });
  assert.equal(localInvocation.backend, 'ollama');
  assert.match(localInvocation.args.join(' '), /ollama-lane\.mjs/);
  assert.deepEqual(localInvocation.args.slice(1, 4), ['gemma-local', '--model', 'gemma4:12b-it-qat']);
  assert.ok(localInvocation.args.includes('--system'));
  assert.equal(localInvocation.env.LLM_COMPAT_OLLAMA_TIMEOUT_MS, '123');
  assert.equal(localInvocation.env.LLM_COMPAT_OLLAMA_STREAM_TELEMETRY, 'true');

  const compatInvocation = buildWorkerLaneInvocation({
    lane: 'deepseek-v4-pro',
    model: 'deepseek-v4-pro',
    backend: 'llm-lane',
    system: 'system',
    timeoutMs: 456,
    reasoning: 'xhigh',
    maxIters: 3,
    noTools: true,
  });
  assert.equal(compatInvocation.backend, 'llm-lane');
  assert.match(compatInvocation.args.join(' '), /llm-lane\.mjs/);
  assert.deepEqual(compatInvocation.args.slice(1, 6), ['deepseek-v4-pro', '--system', 'system', '--reasoning', 'xhigh']);
  assert.ok(compatInvocation.args.includes('--no-tools'));
}

{
  const parsed = parseWorkerJsonPayload('```json\n{\"ok\":true}\n```');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.ok, true);
}

{
  const slate = buildFormulaSlate('handoff local worker xref energy evidence compiler', 'graph impact and Claude continuity');
  const ids = slate.map((card) => card.id);
  assert.ok(ids.includes('schema.type_algebra'));
  assert.ok(ids.includes('lyapunov.energy_descent'));
  assert.ok(ids.includes('bayes.evidence_update'));
  assert.ok(ids.includes('invariant.handoff_continuity'));

  const ok = verifyFormulaUse({ laneClaims: { formulaUse: ['schema.type_algebra', 'lyapunov.energy_descent'] } }, slate);
  assert.equal(ok.status, 'ok');
  const missing = verifyFormulaUse({ laneClaims: {} }, slate);
  assert.equal(missing.status, 'missing');
  const rejected = verifyFormulaUse({ laneClaims: { formulaUse: ['made.up.card'] } }, slate);
  assert.equal(rejected.status, 'rejected');

  // false-convergence audit: an INJECTED (mandatory, 0-hit) card cited by a lane is NOT independence.
  const injectedSlate = buildFormulaSlate('zzzz', ''); // no objective term matches any useWhen
  const injectedSchema = injectedSlate.find((card) => card.id === 'schema.type_algebra');
  assert.equal(injectedSchema.hits, 0);
  assert.equal(injectedSchema.mandatoryBoost, 2);
  assert.equal(injectedSchema.provenance, 'mandatory');
  const injectedTrace = verifyFormulaUse({ laneClaims: { formulaUse: ['schema.type_algebra'] } }, injectedSlate);
  assert.equal(injectedTrace.status, 'ok');
  assert.equal(injectedTrace.independentFormulaUse, false);
  assert.deepEqual(injectedTrace.injectedOnlyCitations, ['schema.type_algebra']);

  // an EARNED (selected, real-hit) citation of the same card IS independence.
  const earnedSlate = buildFormulaSlate('schema compiler json contract state', '');
  const earnedSchema = earnedSlate.find((card) => card.id === 'schema.type_algebra');
  assert.ok(earnedSchema.hits > 0);
  assert.equal(earnedSchema.provenance, 'selected');
  const earnedTrace = verifyFormulaUse({ laneClaims: { formulaUse: ['schema.type_algebra'] } }, earnedSlate);
  assert.equal(earnedTrace.independentFormulaUse, true);
  assert.deepEqual(earnedTrace.injectedOnlyCitations, []);
}

{
  const verified = verifyWorkerModelOutput('```json\n{\"proposedState\":{\"stateBefore\":{\"llm_compat_schema\":\"Structure only\"},\"stateAfter\":{\"energy_gate_enforcement\":\"Atomic\"}}}\n```');
  assert.equal(verified.modelJsonParse.ok, true);
  assert.equal(verified.postModelCompile.status, 'unprovable');
  assert.equal(verified.postModelCompile.verification.executableEnergyState, false);
  assert.equal(shouldReviseWorkerOutput(verified), true);
  const revisionPrompt = buildWorkerRevisionPrompt({
    objective: 'fix local worker packet',
    previousOutput: 'bad packet',
    previousVerification: verified,
  });
  assert.match(revisionPrompt, /llm_compat_schema/);
  assert.match(revisionPrompt, /Allowed executable fields/);
  assert.match(revisionPrompt, /stateBefore/);
}

{
  const verified = verifyWorkerModelOutput('not json');
  assert.equal(verified.modelJsonParse.ok, false);
  assert.equal(verified.postModelCompile.status, 'not_run');
}

{
  const validPacket = JSON.stringify({
    proposedState: {
      stateBefore: {
        claimPromotionDistribution: [0.25, 0.25, 0.25, 0.25],
        claimedDistribution: [0.7, 0.1, 0.1, 0.1],
        verifiedDistribution: [0.25, 0.25, 0.25, 0.25],
        priorState: [0.25, 0.25, 0.25, 0.25],
        posteriorState: [0.25, 0.25, 0.25, 0.25],
        evidence: [{ base: 0.8, age: 5, halfLife: 10 }],
        protectedPathViolations: 0,
        promotionLadderInversions: 0,
        verifiedEvidenceCount: 0,
      },
      stateAfter: {
        claimPromotionDistribution: [0.7, 0.1, 0.1, 0.1],
        claimedDistribution: [0.7, 0.1, 0.1, 0.1],
        verifiedDistribution: [0.7, 0.1, 0.1, 0.1],
        priorState: [0.25, 0.25, 0.25, 0.25],
        posteriorState: [0.7, 0.1, 0.1, 0.1],
        evidence: [{ base: 0.8, age: 1, halfLife: 10 }],
        protectedPathViolations: 0,
        promotionLadderInversions: 0,
        verifiedEvidenceCount: 1,
      },
    },
  });
  const initial = verifyWorkerModelOutput('```json\n{\"proposedState\":{\"stateBefore\":{\"worker_context_buffer\":[]},\"stateAfter\":{\"governor_intensity\":1.2}}}\n```');
  const revised = verifyWorkerModelOutput(validPacket);
  const final = selectFinalWorkerVerification(initial, {
    attempts: [{
      attempt: 1,
      modelJson: revised.modelJson,
      postModelCompile: revised.postModelCompile,
    }],
  });
  assert.equal(initial.postModelCompile.status, 'unprovable');
  assert.equal(revised.postModelCompile.status, 'compiled');
  assert.equal(final.postModelCompile.status, 'compiled');
  assert.equal(shouldReviseWorkerOutput(final), false);
  const gate = tryGateCompiledModelOutput(final.postModelCompile, {});
  assert.equal(gate.status, 'accepted');
  assert.equal(gate.result.accept, true);
}

{
  const result = await runOriginator({
    op: 'compile_state',
    payload: {
      stateBefore: { entropy: 0.85 },
      stateAfter: { energy_delta_estimate: -0.15 },
    },
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.verification.derivedMetricSmugglingRejected, true);
}

{
  const result = await runOriginator({
    op: 'energy_gate',
    payload: {
      stateBefore: {
        claimPromotionDistribution: [0.25, 0.25, 0.25, 0.25],
        claimedDistribution: [0.7, 0.1, 0.1, 0.1],
        verifiedDistribution: [0.25, 0.25, 0.25, 0.25],
        priorState: [0.25, 0.25, 0.25, 0.25],
        posteriorState: [0.25, 0.25, 0.25, 0.25],
        protectedPathViolations: 0,
        promotionLadderInversions: 0,
        verifiedEvidenceCount: 0,
      },
      stateAfter: {
        claimPromotionDistribution: [0.7, 0.1, 0.1, 0.1],
        claimedDistribution: [0.7, 0.1, 0.1, 0.1],
        verifiedDistribution: [0.7, 0.1, 0.1, 0.1],
        priorState: [0.25, 0.25, 0.25, 0.25],
        posteriorState: [0.7, 0.1, 0.1, 0.1],
        protectedPathViolations: 0,
        promotionLadderInversions: 0,
        verifiedEvidenceCount: 1,
      },
    },
  });
  assert.equal(result.status, 'accepted');
  assert.equal(result.result.gate.accept, true);
  assert.ok(result.result.gate.deltaU < 0);
}

{
  const rejected = await runOriginator({
    op: 'energy_gate',
    payload: {
      stateBefore: { promotionLadderInversions: 1, maxLadderInversion: 5 },
      stateAfter: { promotionLadderInversions: 1, maxLadderInversion: 5 },
    },
  });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.result.gate.maxSeverityVeto, true);
  assert.equal(rejected.result.gate.dominantTerm, 'maxLadderInversion');

  const compatibilityOpen = await runOriginator({
    op: 'energy_gate',
    payload: {
      stateBefore: { promotionLadderInversions: 1, maxLadderInversion: 5 },
      stateAfter: { promotionLadderInversions: 1, maxLadderInversion: 5 },
      maxLadderInversionCap: Infinity,
    },
  });
  assert.equal(compatibilityOpen.status, 'accepted');
  assert.equal(compatibilityOpen.result.gate.maxSeverityVeto, false);
}

{
  const result = await runOriginator({
    op: 'energy_gate',
    payload: {
      stateBefore: { claimPromotionDistribution: [1], protectedPathViolations: 0 },
      stateAfter: { claimPromotionDistribution: [1], entropy: 0.1, protectedPathViolations: 0 },
    },
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.verification.gateNotRun, true);
}

{
  const result = await runOriginator({
    op: 'energy_gate',
    payload: {
      stateBefore: {
        verifiedDistribution: 0.82,
        protectedPathViolations: 45,
        priorState: 'unregulated_provider_dispatch',
        results: ['leakage_detected', 'overflow_event'],
      },
      stateAfter: {
        verifiedDistribution: 0.98,
        protectedPathViolations: 1,
        posteriorState: 'gated_canonical_dispatch',
        results: ['success', 'gate_blocked_safe'],
      },
    },
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.verification.gateNotRun, true);
  assert.ok(result.result.compile.rejectedFields.some((field) => field.reason === 'canonical_type_mismatch'));
}

{
  const result = await runOriginator({
    op: 'worker_exoskeleton',
    payload: {
      objective: 'local worker should inspect YURI originator loop',
      execute: false,
      top: 3,
      scan: 10,
    },
  });
  assert.equal(result.status, 'planned');
  assert.equal(result.result.model, 'gemma4:12b-it-qat');
  assert.equal(result.result.lane, 'gemma-local');
  assert.equal(result.result.backend, 'ollama');
  assert.match(result.result.system, /Never place derived metrics/);
  assert.match(result.result.system, /Executable state fields are only/);
  assert.match(result.result.system, /formulaSlate/);
  assert.match(result.result.prompt, /\"evidence\"/);
  assert.ok(result.result.formulaSlate.some((card) => card.id === 'schema.type_algebra'));
}

{
  const substrate = buildWorkSubstrate({
    objective: 'fix originator work substrate gap with xref and tests',
    traceId: 'test-substrate-build',
    mode: 'improve',
    top: 3,
    scan: 10,
  });
  assert.equal(substrate.task_id, 'test-substrate-build');
  assert.equal(substrate.mode, 'improve');
  assert.equal(substrate.actionContract, 'read_only');
  assert.ok(substrate.deniedPaths.includes('backend/data/'));
  assert.ok(substrate.formulaPolicy.formulaSlate.some((card) => card.id === 'schema.type_algebra'));

  const actions = buildCandidateActions(substrate);
  assert.equal(actions.length, 3);
  assert.ok(actions.every((action) => action.id.startsWith('test-substrate-build:')));
}

{
  const created = await runOriginator({
    op: 'create_work_substrate',
    payload: {
      objective: 'launch local model discovery through compact substrate',
      traceId: 'test-substrate-op',
      top: 3,
      scan: 10,
    },
  });
  assert.equal(created.status, 'ok');
  assert.equal(created.result.substrate.task_id, 'test-substrate-op');
  assert.ok(created.result.substrate.deniedPaths.includes('backend/data/'));

  const candidates = await runOriginator({
    op: 'candidate_actions',
    payload: { substrate: created.result.substrate },
  });
  assert.equal(candidates.status, 'ok');
  assert.equal(candidates.result.candidateActions.length, 3);

  const planned = await runOriginator({
    op: 'launch_substrate',
    payload: {
      substrate: created.result.substrate,
      execute: false,
      lane: 'deepseek-v4-pro',
      backend: 'llm-lane',
    },
  });
  assert.equal(planned.status, 'planned');
  assert.equal(planned.result.backend, 'llm-lane');
  assert.match(planned.result.prompt, /workSubstrate/);
  assert.doesNotMatch(planned.result.prompt, /rawChars[\\s\\S]{0,80}xref/);
}

{
  const result = await runOriginator({
    op: 'worker_exoskeleton',
    payload: {
      objective: 'DeepSeek should inspect YURI originator loop through llm compat',
      lane: 'deepseek-v4-pro',
      execute: false,
      top: 3,
      scan: 10,
    },
  });
  assert.equal(result.status, 'planned');
  assert.equal(result.result.lane, 'deepseek-v4-pro');
  assert.equal(result.result.model, 'deepseek-v4-pro');
  assert.equal(result.result.backend, 'llm-lane');
  assert.match(result.result.system, /backend llm-lane/);
}

{
  const requests = collectSubstrateToolRequests({
    toolRequests: [
      { id: 't1', tool: 'xref-query', args: { query: 'originator', top: 200 } },
      { id: 't2', name: 'read_file', args: { path: '_SYSTEM/Scripts/yuri-originator.mjs' } },
    ],
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].tool, 'xref-query');
  assert.equal(requests[1].tool, 'read_file');
  const nestedRequests = collectSubstrateToolRequests({
    workSubstrate: {
      toolRequests: [{ id: 't3', tool: 'grep', args: { pattern: 'telemetry' } }],
    },
  });
  assert.equal(nestedRequests.length, 1);
  assert.equal(nestedRequests[0].tool, 'grep');

  const substrate = buildWorkSubstrate({
    objective: 'local lane should finalize executable state after tool observations',
    traceId: 'test-tool-observation-prompt',
  });
  const prompt = buildSubstrateToolObservationPrompt({
    substrate,
    candidateActions: buildCandidateActions(substrate),
    previousOutput: { toolRequests: requests },
    observations: [{ id: 't1', tool: 'xref_query', ok: true, output: 'hit' }],
    iteration: 1,
  });
  assert.match(prompt, /Final proposedState must be/);
  assert.match(prompt, /stateBefore/);
  assert.match(prompt, /stateAfter/);
  assert.match(prompt, /file paths belong in candidateActions/);
}

{
  const nestedVerification = verifyWorkerModelOutput(JSON.stringify({
    workSubstrate: {
      candidateActions: [],
      laneClaims: { formulaUse: ['schema.type_algebra'] },
      proposedState: {
        stateBefore: {
          evidence: [{ base: 0.75, age: 3, halfLife: 14 }],
          verifiedEvidenceCount: 1,
          protectedPathViolations: 0,
          promotionLadderInversions: 0,
          maxLadderInversion: 0,
        },
        stateAfter: {
          evidence: [{ base: 0.85, age: 1, halfLife: 14 }],
          verifiedEvidenceCount: 2,
          protectedPathViolations: 0,
          promotionLadderInversions: 0,
          maxLadderInversion: 0,
        },
      },
      handoff: ['nested workSubstrate wrapper should compile'],
    },
  }));
  assert.equal(nestedVerification.modelJsonParse.ok, true);
  assert.equal(nestedVerification.postModelCompile.status, 'compiled');
}

{
  const blocked = spawnSync(process.execPath, [originatorPath, 'unknown_op', '{}'], { encoding: 'utf8' });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stdout, /unknown_originator_op/);
}

{
  const blocked = await runOriginator({
    op: 'xref',
    payload: { query: 'inspect backend/data/raw.sqlite' },
  });
  assert.equal(blocked.status, 'rejected');
  assert.equal(blocked.verification.reason, 'protected_path_reference_refused');
}

// yuri_navigate tool dispatch — the graph.impact_centrality executableHook is now real (greenfield wiring)
{
  const sub = { discoveryTools: ['yuri_navigate'], allowedActions: ['yuri_navigate'], allowedPaths: [] };
  // raw 'navigate' alias normalizes + dispatches to deterministic structural centrality
  const r1 = executeSubstrateToolRequest(sub, { id: 't1', tool: 'navigate', args: { nodeId: 'math-kernel', metric: 'impact' } }, 0);
  assert.equal(r1.ok, true);
  assert.equal(r1.tool, 'yuri_navigate');
  const o1 = typeof r1.output === 'string' ? JSON.parse(r1.output) : r1.output;
  assert.ok(o1.result.impact.impactScore > 0, 'navigate returns a real impact score');
  // anchors form (the OpenProcess Sum Pool call shape)
  const r2 = executeSubstrateToolRequest(sub, { id: 't2', tool: 'yuri_navigate', args: { anchors: ['_SYSTEM/Scripts/math/yuri-energy.mjs'], metric: 'both' } }, 1);
  assert.equal(r2.ok, true);
  const o2 = typeof r2.output === 'string' ? JSON.parse(r2.output) : r2.output;
  assert.equal(typeof o2.result.dependency_centrality, 'number');
  // empty target refused
  const r3 = executeSubstrateToolRequest(sub, { id: 't3', tool: 'yuri_navigate', args: {} }, 2);
  assert.equal(r3.ok, false);
  assert.equal(r3.reason, 'empty_navigate_target');
}

console.log('yuri-originator: pass');
