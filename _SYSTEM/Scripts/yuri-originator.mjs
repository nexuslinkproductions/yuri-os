#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gateProposal } from './math/yuri-energy.mjs';
import {
  CANONICAL_ENERGY_FIELDS,
  compileSemanticStatePacket,
  hasProtectedPathReference,
} from './semantic-state-compiler.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const XREF_QUERY = path.join(__dirname, 'xref-query.mjs');
const OLLAMA_LANE = path.join(__dirname, 'ollama-lane.mjs');
const LLM_LANE = path.join(__dirname, 'llm-lane.mjs');
const PROPAGATION_SCAN = path.join(__dirname, 'propagation-scan.mjs');
const YURI_NAVIGATE = path.join(__dirname, 'yuri-navigate.mjs');
import { synthesizeFormulaCandidates } from './math/formula-foundry.mjs'; // Formula Foundry synthesis verb (advisory)
import { isProtectedPath } from './yuri-id-bridge.mjs'; // hydration: protected-path-safe source loading
const TELEMETRY_PATH = path.join(REPO_ROOT, '_SYSTEM/state/originator-telemetry.jsonl');
const DEFAULT_TOP = 200;
const DEFAULT_SCAN = 1000;
const DEFAULT_TELEMETRY_LIMIT = 20;
const DEFAULT_WORK_SUBSTRATE_MIN_RESULTS = 200;
const DEFAULT_WORK_SUBSTRATE_SCAN = 8000;
const DEFAULT_WORKER_LANE = 'gemma-local';
const DEFAULT_WORKER_MODEL = 'gemma4:12b-it-qat';
const DEFAULT_OLLAMA_TIMEOUT_MS = 1_200_000; // 20min — reasoning models need >5min; propagated to the ollama adapter
const WORKER_PROCESS_GRACE_MS = 15_000;
const DEFAULT_REVISION_ATTEMPTS = 1;
const MAX_REVISION_ATTEMPTS = 2;
const DEFAULT_SUBSTRATE_TOOL_ITERS = 16;
const DEFAULT_SUBSTRATE_TOOL_REQUESTS = 12;
const DEFAULT_WORKER_HEARTBEAT_MS = 15_000;
const MAX_FORMULA_SLATE_CARDS = 6;
const LLM_LANE_BACKEND = 'llm-lane';
const OLLAMA_BACKEND = 'ollama';
const PROTECTED_PATHS = Object.freeze([
  'backend/data/',
  '.claude/state/',
  '.claude/history/',
  '.claude/file-history/',
  '.claude/projects/',
  '.env',
  'node_modules/',
  '.amp/',
]);

export const FORMULA_CARDS = Object.freeze([
  {
    id: 'schema.type_algebra',
    theoremFamily: 'type_theory',
    useWhen: ['schema', 'compiler', 'json', 'contract', 'state'],
    operator: 'Constrain generated packets to a closed executable type surface before semantic claims can influence action.',
    executableHook: 'semantic-state-compiler',
    outputShape: 'canonical_state_or_rejected_fields',
  },
  {
    id: 'lyapunov.energy_descent',
    theoremFamily: 'control_theory',
    useWhen: ['energy', 'gate', 'transition', 'hardening', 'improvement'],
    operator: 'Accept only transitions whose scalar potential descends or holds under non-offsettable structural vetoes.',
    executableHook: 'gateProposal',
    outputShape: 'accept_reject_deltaU',
  },
  {
    id: 'bayes.evidence_update',
    theoremFamily: 'bayesian_inference',
    useWhen: ['evidence', 'confidence', 'verification', 'handoff', 'claim'],
    operator: 'Move belief from prior to posterior only when evidence is structured enough to update confidence.',
    executableHook: 'priorState/posteriorState/evidence',
    outputShape: 'prior_posterior_evidence_packet',
  },
  {
    id: 'information.context_entropy',
    theoremFamily: 'information_theory',
    useWhen: ['xref', 'recall', 'context', 'compression', 'search'],
    operator: 'Reduce context uncertainty by selecting high-coverage, low-redundancy evidence before model generation.',
    executableHook: 'xref-query + context pack',
    outputShape: 'ranked_context_pack',
  },
  {
    id: 'graph.impact_centrality',
    theoremFamily: 'graph_theory',
    useWhen: ['file', 'symbol', 'dependency', 'impact', 'lane', 'bridge'],
    operator: 'Rank candidate edits or checks by graph neighborhood, call impact, and cross-surface recurrence.',
    executableHook: 'yuri-navigate.mjs computeImpactCentrality (deterministic structural centrality over the id-bridge graph)',
    outputShape: 'impact_ranked_targets',
  },
  {
    id: 'hazard.evidence_decay',
    theoremFamily: 'survival_analysis',
    useWhen: ['stale', 'decay', 'memory', 'age', 'halfLife'],
    operator: 'Age evidence by half-life so old or weak claims contribute less than fresh verified records.',
    executableHook: 'evidence[].base/age/halfLife',
    outputShape: 'evidence_decay_terms',
  },
  {
    id: 'optimization.multi_objective',
    theoremFamily: 'optimization',
    useWhen: ['tradeoff', 'rank', 'choose', 'budget', 'latency'],
    operator: 'Rank actions by weighted improvement under risk, latency, recall, and verification constraints.',
    executableHook: 'formula slate scorer',
    outputShape: 'ranked_action_candidates',
  },
  {
    id: 'invariant.handoff_continuity',
    theoremFamily: 'formal_methods',
    useWhen: ['claude', 'deepseek', 'handoff', 'worker', 'continuity'],
    operator: 'Preserve invariant claims across model-lane boundaries and reject handoff packets that lose required state.',
    executableHook: 'post-model formula trace / semantic compiler',
    outputShape: 'invariant_check_report',
  },
]);

export async function runOriginator({ op = 'decode', payload = {}, options = {} } = {}) {
  const normalizedOp = normalizeOp(op || payload.op);
  const normalizedPayload = normalizePayload(payload);

  if (hasProtectedPathReference(payloadForProtectedPathCheck(normalizedPayload))) {
    return originatorEnvelope({
      op: normalizedOp,
      status: 'rejected',
      result: {},
      verification: { reason: 'protected_path_reference_refused' },
    });
  }
  if (hasMutationAttempt(normalizedPayload)) {
    return originatorEnvelope({
      op: normalizedOp,
      status: 'rejected',
      result: {},
      verification: { reason: 'mutation_attempt_refused_read_only_originator' },
    });
  }

  if (normalizedOp === 'decode') return runDecode(normalizedPayload);
  if (normalizedOp === 'xref') return runXref(normalizedPayload, options);
  if (normalizedOp === 'compile_state') return wrapCompiler(normalizedPayload, options);
  if (normalizedOp === 'energy_gate') return runEnergyGate(normalizedPayload, options);
  if (['create_work_substrate', 'work_substrate'].includes(normalizedOp)) return runCreateWorkSubstrate(normalizedPayload, options);
  if (normalizedOp === 'candidate_actions') return runCandidateActions(normalizedPayload, options);
  if (normalizedOp === 'synthesize_formula') return runSynthesizeFormula(normalizedPayload, options);
  if (normalizedOp === 'launch_substrate') return runLaunchSubstrate(normalizedPayload, options);
  if (normalizedOp === 'synthesize_formula_candidates') return runFormulaCandidateSeed(normalizedPayload);
  if (['worker_exoskeleton', 'llm_exoskeleton', 'gemma_exoskeleton'].includes(normalizedOp)) {
    return runWorkerExoskeleton(normalizedPayload, options, normalizedOp);
  }
  if (normalizedOp === 'telemetry') return runTelemetry(normalizedPayload);

  return originatorEnvelope({
    op: normalizedOp,
    status: 'rejected',
    result: {},
    verification: { reason: `unknown_originator_op:${normalizedOp}` },
  });
}

function runDecode(payload) {
  const objective = String(payload.objective || payload.query || payload.prompt || '').trim();
  const tokens = objective.toLowerCase().split(/[^a-z0-9:_/-]+/).filter(Boolean);
  const signals = {
    wantsLocalModel: tokens.some((token) => ['gemma', 'ollama', 'local', 'slm'].includes(token)),
    wantsMath: tokens.some((token) => ['math', 'energy', 'formula', 'theorem', 'computeu', 'gateproposal'].includes(token)),
    wantsRecall: tokens.some((token) => ['xref', 'recall', 'cross-reference', 'cross', 'reference'].includes(token)),
    wantsMutation: tokens.some((token) => ['write', 'edit', 'commit', 'push', 'delete'].includes(token)),
  };
  return originatorEnvelope({
    op: 'decode',
    status: 'ok',
    result: {
      objective,
      intentGenome: {
        signals,
        recommendedFirstOps: recommendedOps(signals),
      },
    },
    completeness: { objectiveChars: objective.length, tokenCount: tokens.length },
  });
}

function runXref(payload, options) {
  const query = String(payload.query || payload.objective || payload.prompt || '').trim();
  if (!query) {
    return originatorEnvelope({
      op: 'xref',
      status: 'rejected',
      result: {},
      verification: { reason: 'empty_xref_query' },
    });
  }
  const top = positiveInt(payload.top ?? options.top, DEFAULT_TOP);
  const scan = positiveInt(payload.scan ?? options.scan, DEFAULT_SCAN);
  const raw = execFileSync(process.execPath, [XREF_QUERY, query, '--top', String(top), '--scan', String(scan)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return originatorEnvelope({
    op: 'xref',
    status: 'ok',
    result: {
      query,
      top,
      scan,
      raw,
    },
    completeness: { rawChars: raw.length },
  });
}

function wrapCompiler(payload, options) {
  const compiled = compileSemanticStatePacket(payload, options);
  return originatorEnvelope({
    op: 'compile_state',
    status: compiled.status,
    result: compiled.result,
    completeness: compiled.completeness,
    verification: compiled.verification,
    provenance: compiled.provenance,
  });
}

function runEnergyGate(payload, options) {
  const compiled = compileSemanticStatePacket({
    stateBefore: payload.stateBefore,
    stateAfter: payload.stateAfter,
  }, options);

  if (compiled.status === 'rejected' || compiled.status === 'unprovable') {
    return originatorEnvelope({
      op: 'energy_gate',
      status: 'rejected',
      result: { compile: compiled.result },
      completeness: compiled.completeness,
      verification: {
        reason: compiled.verification.reason,
        gateNotRun: true,
      },
    });
  }

  const stateBefore = compiled.result.compiled.stateBefore || {};
  const stateAfter = compiled.result.compiled.stateAfter || {};
  const gate = gateProposal({
    origin: 'originator',
    stateBefore,
    stateAfter,
    weights: payload.weights,
    threshold: payload.threshold ?? 0,
    allowOverride: payload.allowOverride === true,
    maxLadderInversionCap: resolveMaxLadderInversionCap(payload),
  });

  return originatorEnvelope({
    op: 'energy_gate',
    status: gate.result.accept ? 'accepted' : 'rejected',
    result: {
      compile: compiled.result,
      gate: gate.result,
    },
    completeness: {
      ...compiled.completeness,
      gateRan: true,
    },
    verification: {
      reason: gate.result.reason,
      gateOperation: gate.operation,
      proof: gate.proof,
    },
  });
}

function runFormulaCandidateSeed(payload) {
  const objective = String(payload.objective || payload.query || '').trim();
  const candidates = [
    {
      id: 'candidate.local_model.exoskeleton.context_quality',
      source_domains: ['information_theory', 'retrieval', 'control_theory'],
      operators: ['xref_recall', 'entropy_guard', 'schema_compile'],
      input_contract: ['objective', 'xref_hits', 'lane_packet'],
      output_contract: ['ranked_context_pack', 'compile_status', 'handoff_packet'],
      invariants: ['read_only', 'deterministic_before_model_call', 'derived_metrics_not_executable'],
      proof_plan: ['fixture_with_invalid_entropy', 'canonical_state_gate', 'xref_recall_count'],
      promotion_status: 'hypothesis',
    },
    {
      id: 'candidate.local_model.exoskeleton.energy_revision',
      source_domains: ['lyapunov_descent', 'adversarial_verification'],
      operators: ['gateProposal', 'revise_if_ascending', 'protected_surface_veto'],
      input_contract: ['compiled_state_before', 'compiled_state_after'],
      output_contract: ['accept_reject', 'dominant_term', 'revision_hint'],
      invariants: ['non_offsettable_protected_path', 'non_offsettable_ladder_inversion'],
      proof_plan: ['descending_transition', 'derived_metric_smuggling_negative'],
      promotion_status: 'hypothesis',
    },
  ];
  return originatorEnvelope({
    op: 'synthesize_formula_candidates',
    status: 'ok',
    result: { objective, candidates },
    completeness: { candidateCount: candidates.length },
  });
}

function runCreateWorkSubstrate(payload, options) {
  const objective = String(payload.objective || payload.query || payload.prompt || '').trim();
  if (!objective) {
    return originatorEnvelope({
      op: 'create_work_substrate',
      status: 'rejected',
      result: {},
      verification: { reason: 'empty_objective' },
    });
  }
  const substrate = buildWorkSubstrate(payload, options);
  return originatorEnvelope({
    op: 'create_work_substrate',
    status: 'ok',
    result: { substrate },
    completeness: {
      formulaCardCount: substrate.formulaPolicy.formulaSlate.length,
      recallRawChars: substrate.recallEnvelope.rawChars,
      allowedActionCount: substrate.allowedActions.length,
    },
    verification: { reason: 'work_substrate_created' },
  });
}

export function buildWorkSubstrate(payload = {}, options = {}) {
  const objective = String(payload.objective || payload.query || payload.prompt || '').trim();
  const traceId = resolveTraceId(payload);
  const mode = normalizeWorkMode(payload.mode || inferWorkMode(objective));
  const actionContract = normalizeActionContract(payload.action_contract || payload.actionContract || payload.mutation || 'read_only');
  const minResults = positiveInt(payload.minResults ?? payload.top ?? options.top, DEFAULT_WORK_SUBSTRATE_MIN_RESULTS);
  const scanBudget = positiveInt(payload.scanBudget ?? payload.scan ?? options.scan, DEFAULT_WORK_SUBSTRATE_SCAN);
  const query = String(payload.query || objective).trim();
  const xref = runXref({ query, top: minResults, scan: scanBudget }, options);
  const formulaSlate = buildFormulaSlate(objective, xref.result.raw);

  return {
    task_id: traceId,
    objective,
    mode,
    allowedActions: normalizeStringList(payload.allowed_actions || payload.allowedActions, defaultAllowedActions(actionContract)),
    allowedPaths: normalizeStringList(payload.allowed_paths || payload.allowedPaths, defaultAllowedPaths(mode)),
    deniedPaths: PROTECTED_PATHS,
    discoveryTools: normalizeStringList(payload.discovery_tools || payload.discoveryTools, ['xref_query', 'read_file', 'grep', 'list_dir', 'propagation_scan', 'yuri_navigate', 'bash_tests']),
    recallPolicy: {
      strategy: 'xref_first',
      minResults,
      scanBudget,
      allowMore: payload.allowMore !== false,
    },
    formulaPolicy: {
      candidateCount: formulaSlate.length,
      proofRequired: payload.proofRequired !== false,
      formulaSlate,
    },
    actionContract,
    telemetryTraceId: traceId,
    stopConditions: normalizeStringList(payload.stopConditions || payload.stop_conditions, [
      'protected_path_reference',
      'compile_failure_after_revision_budget',
      'scope_violation',
      'budget_exceeded',
    ]),
    recallEnvelope: {
      query: xref.result.query,
      top: xref.result.top,
      scan: xref.result.scan,
      rawChars: xref.result.raw.length,
    },
    advisory_only: true,
    local_truth_claim: false,
  };
}

// Formula Foundry synthesis through the one Originator port — read-only, advisory. Returns ranked
// research-status candidate formulas; NEVER mutates a bank, NEVER promotes (every candidate is inert until
// kernel-bound + green worked example). The upstream mutation/protected-path guards already protect this op.
function runSynthesizeFormula(payload, options) {
  const opts = {
    maxCandidates: positiveInt(payload.maxCandidates, 64),
    maxChainLength: positiveInt(payload.maxChainLength, 4),
    domains: Array.isArray(payload.domains) ? payload.domains : undefined,
    startIds: Array.isArray(payload.startIds) ? payload.startIds : undefined,
    endIds: Array.isArray(payload.endIds) ? payload.endIds : undefined,
  };
  const { candidates, count, truncated } = synthesizeFormulaCandidates(opts);
  return originatorEnvelope({
    op: 'synthesize_formula',
    status: 'ok',
    result: { candidates, count, truncated },
    completeness: {
      candidateCount: count,
      truncated,
      allInert: candidates.every((c) => c.promotionStatus === 'research' && c.advisoryOnly === true && c.implementedBy === null),
    },
    verification: { reason: 'synthesized candidates are research-status, advisory-only, inert until kernel-bound + green worked example' },
  });
}

function runCandidateActions(payload, options) {
  const substrate = isPlainObject(payload.substrate)
    ? payload.substrate
    : buildWorkSubstrate(payload, options);
  const candidateActions = buildCandidateActions(substrate, payload);
  return originatorEnvelope({
    op: 'candidate_actions',
    status: 'ok',
    result: {
      substrate,
      candidateActions,
    },
    completeness: {
      candidateActionCount: candidateActions.length,
      formulaCardCount: substrate.formulaPolicy?.formulaSlate?.length || 0,
    },
    verification: { reason: 'candidate_actions_built_from_work_substrate' },
  });
}

export function buildCandidateActions(substrate = {}, payload = {}) {
  const taskId = String(substrate.task_id || resolveTraceId(payload));
  const formulaUse = (substrate.formulaPolicy?.formulaSlate || []).slice(0, 4).map((card) => card.id);
  const allowedPaths = substrate.allowedPaths || [];
  return [
    {
      id: `${taskId}:discover-ground-truth`,
      type: 'discovery',
      objective: 'Establish live repo truth before proposing work.',
      allowedActions: ['xref_query', 'read_file', 'grep', 'list_dir', 'yuri_navigate'],
      allowedPaths,
      formulaUse: formulaUse.includes('information.context_entropy') ? ['information.context_entropy'] : formulaUse.slice(0, 1),
      expectedOutput: 'evidence_map_with_file_refs',
      stopOn: ['protected_path_reference', 'empty_evidence'],
    },
    {
      id: `${taskId}:propose-candidate-work`,
      type: 'candidate_action',
      objective: 'Find a scoped improvement, simulation, proof, or documentation update that follows from discovered evidence.',
      allowedActions: substrate.actionContract === 'read_only'
        ? ['xref_query', 'read_file', 'grep', 'yuri_navigate']
        : ['xref_query', 'read_file', 'grep', 'yuri_navigate', 'propose_patch', 'run_tests'],
      allowedPaths,
      formulaUse,
      expectedOutput: 'CandidateAction_with_evidence_formulaUse_validation',
      stopOn: ['scope_violation', 'unverified_claim'],
    },
    {
      id: `${taskId}:verify-and-handoff`,
      type: 'verification',
      objective: 'Compile executable claims, run proof/simulation/test preflight, and emit telemetry-ready handoff.',
      allowedActions: ['run_tests', 'semantic_compile', 'energy_gate', 'telemetry'],
      allowedPaths,
      formulaUse: formulaUse.filter((id) => ['schema.type_algebra', 'lyapunov.energy_descent', 'invariant.handoff_continuity'].includes(id)),
      expectedOutput: 'verified_handoff_or_blocker_report',
      stopOn: ['compile_failure_after_revision_budget', 'ascending_energy_transition'],
    },
  ];
}

async function runLaunchSubstrate(payload, options) {
  const substrate = isPlainObject(payload.substrate)
    ? payload.substrate
    : buildWorkSubstrate(payload, options);
  const candidateActions = buildCandidateActions(substrate, payload);
  const traceId = String(substrate.telemetryTraceId || substrate.task_id || resolveTraceId(payload));
  const workerLane = resolveWorkerLane(payload);
  const workerModel = resolveWorkerModel(payload);
  const workerBackend = resolveWorkerBackend({ ...payload, lane: workerLane });
  const startedAt = Date.now();

  emitOriginatorTelemetry(payload, traceId, 'substrate.start', {
    lane: workerLane,
    model: workerModel,
    backend: workerBackend,
    mode: substrate.mode,
    actionContract: substrate.actionContract,
    execute: payload.execute === true,
  });

  const system = [
    'You are an advisory YURI WorkSubstrate lane.',
    'Do not assume all context is inside the prompt. Use available lane tools for discovery when available.',
    'If you need local YURI tools, return strict JSON with toolRequests: [{ "id": "t1", "tool": "xref_query|read_file|grep|list_dir|propagation_scan|yuri_navigate", "args": {} }].',
    'yuri_navigate gives deterministic structural impact/dependency centrality: args { "nodeId": "<graph-slug>" } or { "anchors": ["file or slug", ...], "metric": "impact|dependency|both" }.',
    'After ToolObservation results arrive, return final candidateActions, laneClaims, proposedState, and handoff.',
    'Return strict JSON only.',
    'Emit candidateActions and proposedState. proposedState must use canonical YURI executable fields only.',
    `Executable state fields are only: ${CANONICAL_ENERGY_FIELDS.join(', ')}.`,
    'Keep filenames, metrics, scores, and prose under laneClaims, observations, candidateActions, or handoff.',
    `Use worker lane ${workerLane}, backend ${workerBackend}, and model policy ${workerModel}.`,
  ].join(' ');
  const prompt = JSON.stringify({
    workSubstrate: substrate,
    candidateActionSeeds: candidateActions,
    required_shape: {
      objective: 'string',
      observations: ['string'],
      candidateActions: [
        {
          id: 'string',
          type: 'discovery|candidate_action|verification',
          evidence: ['file:line or xref/tool evidence'],
          formulaUse: substrate.formulaPolicy?.formulaSlate?.slice(0, 2).map((card) => card.id) || [],
          proposal: 'string',
          validation: ['command or proof/simulation need'],
        },
      ],
      toolRequests: [
        {
          id: 'optional-before-final',
          tool: 'xref_query',
          args: { query: substrate.objective, top: substrate.recallPolicy?.minResults || 200, scan: substrate.recallPolicy?.scanBudget || 8000 },
        },
      ],
      laneClaims: { formulaUse: substrate.formulaPolicy?.formulaSlate?.slice(0, 2).map((card) => card.id) || [] },
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
      handoff: ['string'],
    },
  }, null, 2);

  if (payload.execute !== true) {
    return originatorEnvelope({
      op: 'launch_substrate',
      status: 'planned',
      result: {
        substrate,
        candidateActions,
        lane: workerLane,
        model: workerModel,
        backend: workerBackend,
        system,
        prompt,
      },
      completeness: { promptChars: prompt.length, candidateActionCount: candidateActions.length },
      verification: { reason: 'work_substrate_launch_planned_no_model_call' },
    });
  }

  const workerTimeoutMs = resolveOriginatorOllamaTimeoutMs(payload);
  emitOriginatorTelemetry(payload, traceId, 'substrate.model_call_start', {
    lane: workerLane,
    model: workerModel,
    backend: workerBackend,
    timeoutMs: workerTimeoutMs,
    promptChars: prompt.length,
  });
  const run = workerBackend === OLLAMA_BACKEND && payload.toolLoop !== false
    ? await runSubstrateToolLoop({
      substrate,
      candidateActions,
      lane: workerLane,
      model: workerModel,
      backend: workerBackend,
      system,
      prompt,
      timeoutMs: workerTimeoutMs,
      reasoning: payload.reasoning || payload.reasoningDepth,
      maxIters: payload.maxIters,
      noTools: payload.noTools === true || payload.tools === false,
      maxToolIters: payload.maxToolIters,
      maxToolRequests: payload.maxToolRequests,
      telemetryPayload: payload,
      traceId,
    })
    : await callWorkerLane({
      lane: workerLane,
      model: workerModel,
      backend: workerBackend,
      system,
      prompt,
      timeoutMs: workerTimeoutMs,
      telemetryPayload: payload,
      traceId,
      phasePrefix: 'substrate',
      reasoning: payload.reasoning || payload.reasoningDepth,
      maxIters: payload.maxIters,
      noTools: payload.noTools === true || payload.tools === false,
    });
  emitOriginatorTelemetry(payload, traceId, 'substrate.model_call_complete', {
    lane: workerLane,
    model: workerModel,
    backend: workerBackend,
    exitCode: run.status,
    stdoutChars: run.stdout.length,
    stderrChars: run.stderr.length,
    stdout: shouldIncludeRawTelemetry(payload) ? run.stdout : undefined,
    stderr: run.stderr,
    toolTrace: run.toolTrace,
    toolLoopExhausted: run.toolLoopExhausted,
    pendingToolRequests: run.pendingToolRequests,
    laneEventCount: run.laneEvents?.length || 0,
  });

  const modelVerification = run.status === 0 ? verifyWorkerModelOutput(run.stdout, options) : null;
  const formulaTrace = modelVerification?.modelJson
    ? verifyFormulaUse(modelVerification.modelJson, substrate.formulaPolicy?.formulaSlate || [])
    : null;
  const energyGate = modelVerification?.postModelCompile
    ? tryGateCompiledModelOutput(modelVerification.postModelCompile, payload)
    : null;
  emitOriginatorTelemetry(payload, traceId, 'substrate.complete', {
    durationMs: Date.now() - startedAt,
    modelJsonParse: modelVerification?.modelJsonParse || null,
    postModelCompileStatus: modelVerification?.postModelCompile?.status || 'not_run',
    formulaTrace,
    energyGate,
    toolLoopExhausted: run.toolLoopExhausted,
    pendingToolRequests: run.pendingToolRequests,
  });

  const launchStatus = run.status === 0
    ? (run.toolLoopExhausted ? 'partial' : 'ok')
    : 'rejected';
  const launchReason = run.status !== 0
    ? `${workerBackend}_substrate_failed`
    : run.toolLoopExhausted
      ? `${workerBackend}_substrate_tool_loop_exhausted`
      : `${workerBackend}_substrate_completed`;

  return originatorEnvelope({
    op: 'launch_substrate',
    status: launchStatus,
    result: {
      substrate,
      candidateActions,
      lane: workerLane,
      model: workerModel,
      backend: workerBackend,
      traceId,
      telemetryPath: path.relative(REPO_ROOT, TELEMETRY_PATH),
      stdout: run.stdout,
      stderr: run.stderr,
      exitCode: run.status,
      ...(run.toolTrace ? { toolTrace: run.toolTrace } : {}),
      ...(run.toolLoopExhausted ? { toolLoopExhausted: true, pendingToolRequests: run.pendingToolRequests || [] } : {}),
      ...(run.laneEvents ? { laneEventCount: run.laneEvents.length } : {}),
      ...(modelVerification ? {
        modelJson: modelVerification.modelJson,
        postModelCompile: modelVerification.postModelCompile,
        postModelEnergyGate: energyGate,
        formulaTrace,
      } : {}),
    },
    completeness: {
      outputChars: run.stdout.length,
      stderrChars: run.stderr.length,
      toolLoopExhausted: Boolean(run.toolLoopExhausted),
      pendingToolRequestCount: run.pendingToolRequests?.length || 0,
      laneEventCount: run.laneEvents?.length || 0,
    },
    verification: {
      reason: launchReason,
      traceId,
      modelJsonParse: modelVerification?.modelJsonParse || null,
      postModelCompileStatus: modelVerification?.postModelCompile?.status || 'not_run',
      energyGateStatus: energyGate?.status || 'not_run',
      formulaTraceStatus: formulaTrace?.status || 'not_run',
    },
  });
}

// HYDRATION — load the ACTUAL source of the files the objective references, so a worker lane is HYDRATED with its
// materials (ground truth), not merely prompted. This is the system capability a lane needs to do real work on a
// file: xref `recall` gives RELATED context; hydration gives the file ITSELF. Protected-path safe (never hydrates
// secrets), bounded (total cap), de-duped. A referenced-but-protected/unreadable file is recorded as omitted.
function hydrateFiles(objective, opts = {}) {
  const pathRe = /\b((?:_SYSTEM|02_RESOURCES|03_NEXUS-LINK|00_COMMAND-CENTER|\.claude)\/[A-Za-z0-9._/-]+\.(?:mjs|js|cjs|ts|json|md|sh))\b/g;
  const CAP = Number.isFinite(opts.hydrationCap) ? opts.hydrationCap : 80000;
  const seen = new Set();
  const files = [];
  let total = 0;
  let m;
  while ((m = pathRe.exec(objective)) !== null) {
    const rel = m[1];
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (isProtectedPath(rel)) { files.push({ path: rel, omitted: 'protected-path' }); continue; }
    try {
      let content = readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      if (total + content.length > CAP) content = content.slice(0, Math.max(0, CAP - total)) + '\n…(truncated at hydration cap)';
      total += content.length;
      files.push({ path: rel, content });
    } catch { files.push({ path: rel, omitted: 'unreadable' }); }
  }
  return files;
}

async function runWorkerExoskeleton(payload, options, opName = 'worker_exoskeleton') {
  const objective = String(payload.objective || payload.query || payload.prompt || '').trim();
  if (!objective) {
    return originatorEnvelope({
      op: opName,
      status: 'rejected',
      result: {},
      verification: { reason: 'empty_objective' },
    });
  }

  const traceId = resolveTraceId(payload);
  const workerLane = resolveWorkerLane(payload);
  const workerModel = resolveWorkerModel(payload);
  const workerBackend = resolveWorkerBackend({ ...payload, lane: workerLane });
  const startedAt = Date.now();
  emitOriginatorTelemetry(payload, traceId, 'worker.start', {
    objective,
    query: payload.query || objective,
    lane: workerLane,
    model: workerModel,
    backend: workerBackend,
    execute: payload.execute === true,
    revisionAttempts: resolveRevisionAttempts(payload),
  });

  const xref = runXref({ query: payload.query || objective, top: payload.top, scan: payload.scan }, options);
  const formulaSlate = buildFormulaSlate(objective, xref.result.raw);
  const hydration = hydrateFiles(objective, payload);
  emitOriginatorTelemetry(payload, traceId, 'worker.context_ready', {
    xref: {
      query: xref.result.query,
      top: xref.result.top,
      scan: xref.result.scan,
      rawChars: xref.result.raw.length,
    },
    formulaSlate,
    hydration: { count: hydration.length, files: hydration.map((h) => h.path), chars: hydration.reduce((s, h) => s + (h.content ? h.content.length : 0), 0) },
  });
  const system = [
    'You are an advisory LLM worker lane inside YURI.',
    'YURI owns truth, recall, math, compilation, and energy gates.',
    'Return strict JSON only.',
    'Never place derived metrics such as entropy, deltaU, staleness_index, risk_score, or energy_delta_estimate inside stateBefore/stateAfter.',
    `Executable state fields are only: ${CANONICAL_ENERGY_FIELDS.join(', ')}.`,
    'Executable evidence records are exactly { "base": number in [0,1], "age": non-negative number, "halfLife": positive number } under the field name "evidence".',
    'Use the provided formulaSlate as construction operators. Cite used formula card IDs under laneClaims.formulaUse.',
    'The "hydration" field contains the FULL source of the files your objective references — treat it as ground truth. Never claim a referenced file is inaccessible if it appears in hydration.',
    'Put semantic claims under laneClaims. Put only canonical executable fields under proposedState.stateBefore/stateAfter.',
    `Use worker lane ${workerLane}, backend ${workerBackend}, and model policy ${workerModel}.`,
  ].join(' ');
  const prompt = JSON.stringify({
    objective,
    hydration,
    recall: xref.result.raw.slice(0, 16000),
    formulaSlate,
    required_shape: {
      objective: 'string',
      observations: ['string'],
      laneClaims: {
        formulaUse: ['schema.type_algebra', 'lyapunov.energy_descent'],
      },
      proposedState: {
        stateBefore: {
          evidence: [{ base: 0.8, age: 2, halfLife: 10 }],
          verifiedEvidenceCount: 1,
          protectedPathViolations: 0,
          promotionLadderInversions: 0,
        },
        stateAfter: {
          evidence: [{ base: 0.8, age: 1, halfLife: 10 }],
          verifiedEvidenceCount: 2,
          protectedPathViolations: 0,
          promotionLadderInversions: 0,
        },
      },
      handoff: ['string'],
    },
  }, null, 2);

  if (payload.execute !== true) {
    return originatorEnvelope({
      op: opName,
      status: 'planned',
      result: {
        lane: workerLane,
        model: workerModel,
        backend: workerBackend,
        traceId,
        execute: false,
        system,
        prompt,
        formulaSlate,
        xref: {
          query: xref.result.query,
          top: xref.result.top,
          scan: xref.result.scan,
          rawChars: xref.result.raw.length,
        },
      },
      completeness: { promptChars: prompt.length },
      verification: { reason: 'dry_run_packet_built_no_model_call' },
    });
  }

  const workerTimeoutMs = resolveOriginatorOllamaTimeoutMs(payload);
  emitOriginatorTelemetry(payload, traceId, 'worker.model_call_start', {
    lane: workerLane,
    model: workerModel,
    backend: workerBackend,
    timeoutMs: workerTimeoutMs,
    promptChars: prompt.length,
  });
  const run = await callWorkerLane({
    lane: workerLane,
    model: workerModel,
    backend: workerBackend,
    system,
    prompt,
    timeoutMs: workerTimeoutMs,
    telemetryPayload: payload,
    traceId,
    phasePrefix: 'worker',
    reasoning: payload.reasoning || payload.reasoningDepth,
    maxIters: payload.maxIters,
    noTools: payload.noTools === true || payload.tools === false,
  });
  emitOriginatorTelemetry(payload, traceId, 'worker.model_call_complete', {
    lane: workerLane,
    model: workerModel,
    backend: workerBackend,
    exitCode: run.status,
    stdoutChars: run.stdout.length,
    stderrChars: run.stderr.length,
    stdout: shouldIncludeRawTelemetry(payload) ? run.stdout : undefined,
    stderr: run.stderr,
    laneEventCount: run.laneEvents?.length || 0,
  });

  const modelVerification = run.status === 0 ? verifyWorkerModelOutput(run.stdout, options) : null;
  const modelFormulaTrace = modelVerification?.modelJson
    ? verifyFormulaUse(modelVerification.modelJson, formulaSlate)
    : null;
  const revisionAttempts = resolveRevisionAttempts(payload);
  const revision = modelVerification && revisionAttempts > 0 && shouldReviseWorkerOutput(modelVerification)
    ? await runWorkerRevision({
      objective,
      lane: workerLane,
      model: workerModel,
      backend: workerBackend,
      system,
      initialOutput: run.stdout,
      initialVerification: modelVerification,
      timeoutMs: workerTimeoutMs,
      reasoning: payload.reasoning || payload.reasoningDepth,
      maxIters: payload.maxIters,
      noTools: payload.noTools === true || payload.tools === false,
      options,
      maxAttempts: revisionAttempts,
      traceId,
      telemetryPayload: payload,
    })
    : null;
  const finalVerification = selectFinalWorkerVerification(modelVerification, revision);
  const finalEnergyGate = tryGateCompiledModelOutput(finalVerification?.postModelCompile, payload);
  const finalFormulaTrace = finalVerification?.modelJson
    ? verifyFormulaUse(finalVerification.modelJson, formulaSlate)
    : modelFormulaTrace;
  emitOriginatorTelemetry(payload, traceId, 'worker.verification_complete', {
    modelJsonParse: modelVerification?.modelJsonParse || null,
    postModelCompileStatus: modelVerification?.postModelCompile?.status || 'not_run',
    formulaTrace: modelFormulaTrace,
    postModelEnergyGate: modelVerification?.postModelCompile
      ? tryGateCompiledModelOutput(modelVerification.postModelCompile, payload)
      : null,
    revisionAttempted: Boolean(revision),
    finalPostModelCompileStatus: finalVerification?.postModelCompile?.status || 'not_run',
    finalEnergyGate,
    finalFormulaTrace,
  });
  emitOriginatorTelemetry(payload, traceId, 'worker.complete', {
    durationMs: Date.now() - startedAt,
    finalModelJson: finalVerification?.modelJson || null,
    finalPostModelCompile: finalVerification?.postModelCompile || null,
    finalEnergyGate,
    finalFormulaTrace,
  });

  return originatorEnvelope({
    op: opName,
    status: run.status === 0 ? 'ok' : 'rejected',
    result: {
      lane: workerLane,
      model: workerModel,
      traceId,
      telemetryPath: path.relative(REPO_ROOT, TELEMETRY_PATH),
      backend: workerBackend,
      timeoutMs: workerTimeoutMs,
      stdout: run.stdout,
      stderr: run.stderr,
      exitCode: run.status,
      ...(run.laneEvents ? { laneEventCount: run.laneEvents.length } : {}),
      ...(modelVerification ? {
        modelJson: modelVerification.modelJson,
        postModelCompile: modelVerification.postModelCompile,
        postModelEnergyGate: tryGateCompiledModelOutput(modelVerification.postModelCompile, payload),
        formulaTrace: modelFormulaTrace,
      } : {}),
      ...(revision ? { revision } : {}),
      ...(finalVerification ? {
        finalModelJson: finalVerification.modelJson,
        finalPostModelCompile: finalVerification.postModelCompile,
        finalPostModelEnergyGate: finalEnergyGate,
        finalFormulaTrace,
      } : {}),
    },
    completeness: { outputChars: run.stdout.length, stderrChars: run.stderr.length, laneEventCount: run.laneEvents?.length || 0 },
    verification: {
      reason: run.status === 0 ? `${workerBackend}_completed` : `${workerBackend}_failed`,
      traceId,
      ...(modelVerification ? {
        modelJsonParse: modelVerification.modelJsonParse,
        postModelCompileStatus: modelVerification.postModelCompile?.status || 'not_run',
        revisionAttempted: Boolean(revision),
        finalPostModelCompileStatus: finalVerification?.postModelCompile?.status || 'not_run',
        finalEnergyGateStatus: finalEnergyGate?.status || 'not_run',
        finalFormulaTraceStatus: finalFormulaTrace?.status || 'not_run',
      } : {}),
    },
  });
}

async function runSubstrateToolLoop({
  substrate,
  candidateActions,
  lane,
  model,
  backend,
  system,
  prompt,
  timeoutMs,
  reasoning = '',
  maxIters = '',
  noTools = false,
  maxToolIters = DEFAULT_SUBSTRATE_TOOL_ITERS,
  maxToolRequests = DEFAULT_SUBSTRATE_TOOL_REQUESTS,
  telemetryPayload = {},
  traceId = '',
}) {
  const iterations = resolveToolLoopBudget(maxToolIters);
  const requestsPerIteration = resolveToolRequestBudget(maxToolRequests);
  const toolTrace = [];
  let currentPrompt = prompt;
  let lastRun = null;
  let pendingToolRequests = [];
  let exhausted = false;

  for (let index = 0; index <= iterations; index += 1) {
    const run = await callWorkerLane({
      lane,
      model,
      backend,
      system,
      prompt: currentPrompt,
      timeoutMs,
      telemetryPayload,
      traceId,
      phasePrefix: 'substrate.tool_model',
      reasoning,
      maxIters,
      noTools,
    });
    lastRun = run;
    if (run.status !== 0) break;

    const parsed = parseWorkerJsonPayload(run.stdout);
    if (!parsed.ok) break;
    const requests = collectSubstrateToolRequests(parsed.value).slice(0, requestsPerIteration);
    if (requests.length === 0) break;
    if (index === iterations) {
      pendingToolRequests = requests.map(redactToolRequestForTrace);
      exhausted = true;
      emitOriginatorTelemetry(telemetryPayload, traceId, 'substrate.tool_loop_exhausted', {
        lane,
        model,
        backend,
        maxToolIters: iterations,
        maxToolRequests: requestsPerIteration,
        pendingToolRequests,
      });
      break;
    }

    const observations = requests.map((request, requestIndex) => executeSubstrateToolRequest(substrate, request, requestIndex));
    const traceEntry = {
      iteration: index + 1,
      requestCount: requests.length,
      requests: requests.map(redactToolRequestForTrace),
      observations: observations.map((observation) => ({
        id: observation.id,
        tool: observation.tool,
        ok: observation.ok,
        outputChars: String(observation.output || '').length,
          reason: observation.reason,
        })),
    };
    toolTrace.push(traceEntry);
    emitOriginatorTelemetry(telemetryPayload, traceId, 'substrate.tool_iteration', {
      lane,
      model,
      backend,
      ...traceEntry,
    });
    currentPrompt = buildSubstrateToolObservationPrompt({
      substrate,
      candidateActions,
      previousOutput: parsed.value,
      observations,
      iteration: index + 1,
    });
  }

  return {
    status: lastRun?.status ?? 1,
    stdout: lastRun?.stdout || '',
    stderr: lastRun?.stderr || '',
    toolTrace,
    toolLoopExhausted: exhausted,
    pendingToolRequests,
  };
}

export function collectSubstrateToolRequests(modelJson = {}) {
  if (!isPlainObject(modelJson)) return [];
  const packet = normalizeWorkerModelJson(modelJson);
  const raw = packet.toolRequests || packet.tool_requests || packet.requests || packet.tools || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isPlainObject)
    .map((request, index) => ({
      id: String(request.id || `tool-${index + 1}`),
      tool: String(request.tool || request.name || '').trim(),
      args: isPlainObject(request.args) ? request.args : {},
    }))
    .filter((request) => request.tool);
}

export function executeSubstrateToolRequest(substrate = {}, request = {}, requestIndex = 0) {
  const tool = normalizeToolName(request.tool);
  const id = String(request.id || `tool-${requestIndex + 1}`);
  const args = isPlainObject(request.args) ? request.args : {};
  if (!toolAllowedBySubstrate(substrate, tool)) {
    return { id, tool, ok: false, reason: 'tool_not_allowed_by_work_substrate', output: '' };
  }
  try {
    if (tool === 'xref_query') {
      const query = String(args.query || substrate.objective || '').trim();
      if (!query) return { id, tool, ok: false, reason: 'empty_xref_query', output: '' };
      const top = Math.min(positiveInt(args.top, substrate.recallPolicy?.minResults || DEFAULT_WORK_SUBSTRATE_MIN_RESULTS), 1000);
      const scan = Math.min(positiveInt(args.scan, substrate.recallPolicy?.scanBudget || DEFAULT_WORK_SUBSTRATE_SCAN), 20000);
      const output = execFileSync(process.execPath, [XREF_QUERY, query, '--top', String(top), '--scan', String(scan)], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
      });
      return { id, tool, ok: true, output: clipToolOutput(output) };
    }
    if (tool === 'read_file') {
      const target = resolveSubstratePath(substrate, args.path);
      if (!target.ok) return { id, tool, ok: false, reason: target.reason, output: '' };
      const maxLines = positiveInt(args.max_lines || args.maxLines, 160);
      const output = readFileSync(target.abs, 'utf8').split(/\r?\n/).slice(0, maxLines).join('\n');
      return { id, tool, ok: true, output: clipToolOutput(output) };
    }
    if (tool === 'list_dir') {
      const target = resolveSubstratePath(substrate, args.path || '.');
      if (!target.ok) return { id, tool, ok: false, reason: target.reason, output: '' };
      const entries = readdirSync(target.abs, { withFileTypes: true })
        .slice(0, 200)
        .map((entry) => `${entry.isDirectory() ? 'd' : 'f'} ${entry.name}`)
        .join('\n');
      return { id, tool, ok: true, output: entries };
    }
    if (tool === 'grep') {
      const pattern = String(args.pattern || args.query || '').trim();
      if (!pattern) return { id, tool, ok: false, reason: 'empty_grep_pattern', output: '' };
      const target = resolveSubstratePath(substrate, args.path || '.');
      if (!target.ok) return { id, tool, ok: false, reason: target.reason, output: '' };
      const output = execFileSync('rg', [
        '-n',
        '--glob', '!node_modules/**',
        '--glob', '!.amp/**',
        '--glob', '!backend/data/**',
        '--glob', '!.claude/state/**',
        '--glob', '!.claude/history/**',
        '--glob', '!.claude/file-history/**',
        pattern,
        target.abs,
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 6 * 1024 * 1024,
      });
      return { id, tool, ok: true, output: clipToolOutput(output) };
    }
    if (tool === 'propagation_scan') {
      const nodeId = String(args.nodeId || args.node_id || args.id || '').trim();
      if (!nodeId) return { id, tool, ok: false, reason: 'empty_node_id', output: '' };
      const top = Math.min(positiveInt(args.top, 50), 500);
      const output = execFileSync(process.execPath, [PROPAGATION_SCAN, nodeId, '--top', String(top), '--dry-run'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 12 * 1024 * 1024,
      });
      return { id, tool, ok: true, output: clipToolOutput(output) };
    }
    if (tool === 'yuri_navigate') {
      // structural centrality (read-only). Either a single nodeId/slug or --anchors a,b,c.
      const nodeId = String(args.nodeId || args.node_id || args.id || args.node || '').trim();
      const anchors = Array.isArray(args.anchors) ? args.anchors.map((a) => String(a).trim()).filter(Boolean) : [];
      if (!nodeId && !anchors.length) return { id, tool, ok: false, reason: 'empty_navigate_target', output: '' };
      const metric = String(args.metric || 'both');
      const cliArgs = [YURI_NAVIGATE];
      if (anchors.length) cliArgs.push('--anchors', anchors.join(','));
      else cliArgs.push(nodeId);
      cliArgs.push('--metric', metric, '--json');
      if (args.ppr) cliArgs.push('--ppr');
      if (args.noWrites || args.no_writes) cliArgs.push('--no-writes');
      const output = execFileSync(process.execPath, cliArgs, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 12 * 1024 * 1024,
      });
      return { id, tool, ok: true, output: clipToolOutput(output) };
    }
    return { id, tool, ok: false, reason: 'unknown_tool', output: '' };
  } catch (error) {
    return {
      id,
      tool,
      ok: false,
      reason: String(error?.message || error).slice(0, 300),
      output: clipToolOutput(error?.stdout || error?.stderr || ''),
    };
  }
}

export function buildSubstrateToolObservationPrompt({
  substrate,
  candidateActions,
  previousOutput,
  observations,
  iteration,
}) {
  return JSON.stringify({
    workSubstrate: substrate,
    candidateActionSeeds: candidateActions,
    toolLoopIteration: iteration,
    previousOutput,
    toolObservations: observations,
    instruction: [
      'Use these ToolObservation results to continue discovery.',
      'If more evidence is needed, return strict JSON with toolRequests and do not pretend the task is final.',
      'If ready, return strict JSON with candidateActions, laneClaims.formulaUse, proposedState, and handoff, and omit toolRequests entirely.',
      'Final proposedState must be { "stateBefore": {...}, "stateAfter": {...} }.',
      `Inside stateBefore/stateAfter, use only canonical executable fields: ${CANONICAL_ENERGY_FIELDS.join(', ')}.`,
      'If you use priorState/posteriorState/claimedDistribution/verifiedDistribution, they must be numeric arrays, not prose or objects.',
      'Evidence inside proposedState must be confidence objects like { "base": 0.85, "age": 1, "halfLife": 14 }; file paths belong in candidateActions[].evidence.',
      'Do not include derived metrics inside proposedState.',
    ],
    executableStateExample: {
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
  }, null, 2);
}

function normalizeToolName(value = '') {
  const raw = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (raw === 'rg' || raw === 'grep_search') return 'grep';
  if (raw === 'xref' || raw === 'xref_query') return 'xref_query';
  if (raw === 'read' || raw === 'readfile') return 'read_file';
  if (raw === 'ls' || raw === 'list') return 'list_dir';
  if (raw === 'propagation' || raw === 'propagation_scan') return 'propagation_scan';
  if (raw === 'navigate' || raw === 'yuri_navigate' || raw === 'impact_centrality' || raw === 'centrality') return 'yuri_navigate';
  return raw;
}

function toolAllowedBySubstrate(substrate = {}, tool = '') {
  const allowed = new Set([
    ...(substrate.discoveryTools || []),
    ...(substrate.allowedActions || []),
  ].map(normalizeToolName));
  return allowed.has(tool);
}

function resolveSubstratePath(substrate = {}, requestedPath = '.') {
  const raw = String(requestedPath || '.').trim();
  if (!raw) return { ok: false, reason: 'empty_path' };
  if (hasProtectedPathReference(raw)) return { ok: false, reason: 'protected_path_reference' };
  const abs = path.resolve(REPO_ROOT, raw);
  const rel = path.relative(REPO_ROOT, abs).replace(/\\/g, '/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, reason: 'outside_repo' };
  if (hasProtectedPathReference(rel)) return { ok: false, reason: 'protected_path_reference' };
  const allowed = normalizeStringList(substrate.allowedPaths, defaultAllowedPaths(substrate.mode));
  const ok = allowed.some((prefix) => {
    const normalized = String(prefix).replace(/\\/g, '/').replace(/^\.\//, '');
    const clean = normalized.endsWith('/') ? normalized : `${normalized}/`;
    return rel === normalized.replace(/\/$/, '') || rel.startsWith(clean);
  });
  if (!ok && rel !== '.') return { ok: false, reason: 'path_not_allowed_by_work_substrate' };
  const stat = statSafe(abs);
  if (!stat) return { ok: false, reason: 'path_not_found' };
  return { ok: true, abs, rel, stat };
}

function statSafe(file) {
  try {
    return statSync(file);
  } catch {
    return null;
  }
}

function redactToolRequestForTrace(request = {}) {
  return {
    id: request.id,
    tool: normalizeToolName(request.tool),
    args: Object.fromEntries(
      Object.entries(request.args || {}).map(([key, value]) => [key, String(value).slice(0, 240)]),
    ),
  };
}

function clipToolOutput(output = '', limit = 12000) {
  const text = String(output || '');
  return text.length > limit ? `${text.slice(0, limit)}\n...[truncated ${text.length - limit} chars]` : text;
}

function callWorkerLane({
  lane,
  model,
  backend,
  system,
  prompt,
  timeoutMs,
  telemetryPayload = {},
  traceId = '',
  phasePrefix = 'worker',
  reasoning = '',
  maxIters = '',
  noTools = false,
}) {
  const normalizedBackend = normalizeWorkerBackend(backend);
  const invocation = buildWorkerLaneInvocation({
    lane,
    model,
    backend: normalizedBackend,
    system,
    timeoutMs,
    reasoning,
    maxIters,
    noTools,
  });
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const stdoutChunks = [];
    const stderrChunks = [];
    const laneEvents = [];
    let stdoutChars = 0;
    let stderrChars = 0;
    let timedOut = false;
    let stderrLineBuffer = '';
    const maxBufferBytes = resolveWorkerMaxBufferBytes(telemetryPayload);

    const child = spawn(process.execPath, invocation.args, {
      cwd: REPO_ROOT,
      env: invocation.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    emitOriginatorTelemetry(telemetryPayload, traceId, `${phasePrefix}.process_start`, {
      lane,
      model,
      backend: normalizedBackend,
      pid: child.pid,
      promptChars: prompt.length,
      timeoutMs,
    });

    const heartbeatMs = resolveWorkerHeartbeatMs(telemetryPayload);
    const heartbeat = heartbeatMs > 0
      ? setInterval(() => {
        emitOriginatorTelemetry(telemetryPayload, traceId, `${phasePrefix}.heartbeat`, {
          lane,
          model,
          backend: normalizedBackend,
          pid: child.pid,
          elapsedMs: Date.now() - startedAt,
          stdoutChars,
          stderrChars,
          laneEventCount: laneEvents.length,
        });
      }, heartbeatMs)
      : null;
    if (heartbeat?.unref) heartbeat.unref();

    const timeout = setTimeout(() => {
      timedOut = true;
      emitOriginatorTelemetry(telemetryPayload, traceId, `${phasePrefix}.timeout`, {
        lane,
        model,
        backend: normalizedBackend,
        pid: child.pid,
        timeoutMs,
        stdoutChars,
        stderrChars,
      });
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, WORKER_PROCESS_GRACE_MS).unref?.();
    }, timeoutMs + WORKER_PROCESS_GRACE_MS);
    timeout.unref?.();

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stdoutChunks.push(text);
      stdoutChars += text.length;
      emitOriginatorTelemetry(telemetryPayload, traceId, `${phasePrefix}.stdout_chunk`, {
        lane,
        model,
        backend: normalizedBackend,
        pid: child.pid,
        chunkChars: text.length,
        stdoutChars,
      });
      if (stdoutChars + stderrChars > maxBufferBytes) {
        child.kill('SIGTERM');
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stderrChunks.push(text);
      stderrChars += text.length;
      const parsed = consumeLaneTelemetryLines(`${stderrLineBuffer}${text}`);
      stderrLineBuffer = parsed.remainder;
      for (const event of parsed.events) {
        laneEvents.push(event);
        emitOriginatorTelemetry(telemetryPayload, traceId, `${phasePrefix}.lane_${event.type || 'event'}`, {
          lane,
          model,
          backend: normalizedBackend,
          pid: child.pid,
          event,
        });
      }
      const visibleStderr = stripLaneTelemetryLines(text);
      if (visibleStderr) {
        emitOriginatorTelemetry(telemetryPayload, traceId, `${phasePrefix}.stderr_chunk`, {
          lane,
          model,
          backend: normalizedBackend,
          pid: child.pid,
          chunkChars: visibleStderr.length,
          stderrChars,
          laneEventCount: laneEvents.length,
        });
      }
      if (stdoutChars + stderrChars > maxBufferBytes) {
        child.kill('SIGTERM');
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      if (heartbeat) clearInterval(heartbeat);
      const stderr = stripLaneTelemetryLines(`${stderrChunks.join('')}${error?.message || String(error)}`);
      resolve({ status: 1, stdout: stdoutChunks.join(''), stderr, laneEvents, timedOut });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (heartbeat) clearInterval(heartbeat);
      const status = timedOut ? 124 : (typeof code === 'number' ? code : signal ? 1 : 0);
      emitOriginatorTelemetry(telemetryPayload, traceId, `${phasePrefix}.process_exit`, {
        lane,
        model,
        backend: normalizedBackend,
        pid: child.pid,
        status,
        signal,
        timedOut,
        elapsedMs: Date.now() - startedAt,
        stdoutChars,
        stderrChars,
        laneEventCount: laneEvents.length,
      });
      resolve({
        status,
        stdout: stdoutChunks.join(''),
        stderr: stripLaneTelemetryLines(stderrChunks.join('')),
        laneEvents,
        timedOut,
      });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function consumeLaneTelemetryLines(text = '') {
  const lines = String(text || '').split(/\r?\n/);
  const remainder = lines.pop() || '';
  const events = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('YURI_LANE_TELEMETRY ')) continue;
    try {
      const event = JSON.parse(trimmed.slice('YURI_LANE_TELEMETRY '.length));
      if (isPlainObject(event)) events.push(event);
    } catch {
      events.push({ type: 'malformed_lane_telemetry', line: trimmed.slice(0, 500) });
    }
  }
  return { events, remainder };
}

function stripLaneTelemetryLines(text = '') {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('YURI_LANE_TELEMETRY '))
    .join('\n')
    .trim();
}

function resolveToolLoopBudget(value, env = process.env) {
  const raw = value ?? env.YURI_SUBSTRATE_TOOL_ITERS ?? DEFAULT_SUBSTRATE_TOOL_ITERS;
  if (String(raw).toLowerCase() === 'unbounded') {
    return positiveInt(env.YURI_SUBSTRATE_TOOL_ITERS_UNBOUNDED_GUARD, 256);
  }
  return Math.max(1, positiveInt(raw, DEFAULT_SUBSTRATE_TOOL_ITERS));
}

function resolveToolRequestBudget(value, env = process.env) {
  const raw = value ?? env.YURI_SUBSTRATE_TOOL_REQUESTS ?? DEFAULT_SUBSTRATE_TOOL_REQUESTS;
  if (String(raw).toLowerCase() === 'unbounded') {
    return positiveInt(env.YURI_SUBSTRATE_TOOL_REQUESTS_UNBOUNDED_GUARD, 64);
  }
  return Math.max(1, positiveInt(raw, DEFAULT_SUBSTRATE_TOOL_REQUESTS));
}

function resolveWorkerHeartbeatMs(payload = {}, env = process.env) {
  if (payload.streamingTelemetry === false || payload.heartbeat === false) return 0;
  const raw = payload.heartbeatMs ?? env.YURI_WORKER_HEARTBEAT_MS ?? DEFAULT_WORKER_HEARTBEAT_MS;
  return Math.max(0, positiveInt(raw, DEFAULT_WORKER_HEARTBEAT_MS));
}

function resolveWorkerMaxBufferBytes(payload = {}, env = process.env) {
  const mb = Number(payload.maxBufferMb || env.YURI_WORKER_MAX_BUFFER_MB || 128);
  const safeMb = Number.isFinite(mb) && mb > 0 ? mb : 128;
  return safeMb * 1024 * 1024;
}

export function resolveWorkerLane(payload = {}) {
  return String(payload.lane || payload.workerLane || DEFAULT_WORKER_LANE).trim() || DEFAULT_WORKER_LANE;
}

export function resolveWorkerModel(payload = {}) {
  const explicit = String(payload.model || payload.workerModel || '').trim();
  if (explicit) return explicit;
  const lane = resolveWorkerLane(payload);
  return resolveWorkerBackend({ ...payload, lane }) === LLM_LANE_BACKEND ? lane : DEFAULT_WORKER_MODEL;
}

export function resolveWorkerBackend(payload = {}) {
  const explicit = normalizeWorkerBackend(payload.backend || payload.workerBackend);
  if (explicit) return explicit;
  const lane = resolveWorkerLane(payload).toLowerCase();
  if (/^(deepseek|ds|mimo)/.test(lane)) return LLM_LANE_BACKEND;
  return OLLAMA_BACKEND;
}

function normalizeWorkerBackend(value = '') {
  const raw = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  if (!raw) return '';
  if (['ollama', 'ollama-lane', 'local', 'local-ollama'].includes(raw)) return OLLAMA_BACKEND;
  if (['llm', 'llm-lane', 'llm-compat', 'compat', 'cloud'].includes(raw)) return LLM_LANE_BACKEND;
  return raw;
}

export function buildWorkerLaneInvocation({
  lane,
  model,
  backend,
  system,
  timeoutMs,
  reasoning = '',
  maxIters = '',
  noTools = false,
} = {}) {
  const normalizedBackend = normalizeWorkerBackend(backend) || OLLAMA_BACKEND;
  if (normalizedBackend === OLLAMA_BACKEND) {
    return {
      backend: OLLAMA_BACKEND,
      args: [OLLAMA_LANE, lane, '--model', model, '--system', system],
      env: {
        ...process.env,
        LLM_COMPAT_OLLAMA_TIMEOUT_MS: String(timeoutMs),
        LLM_COMPAT_OLLAMA_STREAM_TELEMETRY: process.env.LLM_COMPAT_OLLAMA_STREAM_TELEMETRY || 'true',
        YURI_ORIGINATOR_OLLAMA_TIMEOUT_MS: String(timeoutMs),
      },
    };
  }
  if (normalizedBackend === LLM_LANE_BACKEND) {
    const args = [LLM_LANE, lane, '--system', system];
    const depth = String(reasoning || 'high').trim();
    if (depth) args.push('--reasoning', depth);
    const iterations = positiveInt(maxIters, 8);
    args.push('--max-iters', String(iterations));
    if (noTools) args.push('--no-tools');
    return {
      backend: LLM_LANE_BACKEND,
      args,
      env: {
        ...process.env,
        YURI_ORIGINATOR_LLM_LANE_TIMEOUT_MS: String(timeoutMs),
      },
    };
  }
  throw new Error(`unknown_worker_backend:${normalizedBackend}`);
}

export function resolveOriginatorOllamaTimeoutMs(payload = {}, env = process.env) {
  const parsed = Number(payload.timeoutMs || env.YURI_ORIGINATOR_OLLAMA_TIMEOUT_MS || env.LLM_COMPAT_OLLAMA_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_OLLAMA_TIMEOUT_MS;
}

export function resolveRevisionAttempts(payload = {}, env = process.env) {
  if (payload.autoRevise === false) return 0;
  const raw = payload.revisionAttempts ?? env.YURI_ORIGINATOR_REVISION_ATTEMPTS ?? DEFAULT_REVISION_ATTEMPTS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(MAX_REVISION_ATTEMPTS, Math.floor(parsed));
}

// The originator lane deliberately pins a STRICTER local cap than the session
// tick path's DEFAULT_MAX_LADDER_INVERSION_CAP (now 1, owner decision D1):
// dispatched-lane claims get no 1-rung VERIFY-FIRST grace — any inversion vetoes.
const ORIGINATOR_MAX_LADDER_INVERSION_CAP = 0;

export function resolveMaxLadderInversionCap(payload = {}) {
  if (Object.hasOwn(payload, 'maxLadderInversionCap')) return payload.maxLadderInversionCap;
  return ORIGINATOR_MAX_LADDER_INVERSION_CAP;
}

export function shouldReviseWorkerOutput(verification = {}) {
  const status = verification.postModelCompile?.status || 'not_run';
  if (status === 'compiled' || status === 'partial') return false;
  return ['rejected', 'unprovable', 'not_run'].includes(status);
}

async function runWorkerRevision({
  objective,
  lane,
  model,
  backend,
  system,
  initialOutput,
  initialVerification,
  timeoutMs,
  reasoning = '',
  maxIters = '',
  noTools = false,
  options,
  maxAttempts,
  traceId,
  telemetryPayload,
}) {
  const attempts = [];
  let previousOutput = initialOutput;
  let previousVerification = initialVerification;

  for (let index = 0; index < maxAttempts; index += 1) {
    const prompt = buildWorkerRevisionPrompt({
      objective,
      previousOutput,
      previousVerification,
      attempt: index + 1,
    });
    emitOriginatorTelemetry(telemetryPayload, traceId, 'worker.revision_start', {
      attempt: index + 1,
      lane,
      model,
      backend,
      promptChars: prompt.length,
      previousCompileStatus: previousVerification?.postModelCompile?.status || 'not_run',
    });
    const run = await callWorkerLane({
      lane,
      model,
      backend,
      system,
      prompt,
      timeoutMs,
      telemetryPayload,
      traceId,
      phasePrefix: 'worker.revision',
      reasoning,
      maxIters,
      noTools,
    });
    const verification = run.status === 0 ? verifyWorkerModelOutput(run.stdout, options) : null;
    const revisionGate = verification
      ? tryGateCompiledModelOutput(verification.postModelCompile, {})
      : null;
    emitOriginatorTelemetry(telemetryPayload, traceId, 'worker.revision_complete', {
      attempt: index + 1,
      lane,
      model,
      backend,
      exitCode: run.status,
      stdoutChars: run.stdout.length,
      stderrChars: run.stderr.length,
      stdout: shouldIncludeRawTelemetry(telemetryPayload) ? run.stdout : undefined,
      stderr: run.stderr,
      modelJson: verification?.modelJson || null,
      postModelCompile: verification?.postModelCompile || null,
      postModelEnergyGate: revisionGate,
    });
    attempts.push({
      attempt: index + 1,
      promptChars: prompt.length,
      stdout: run.stdout,
      stderr: run.stderr,
      exitCode: run.status,
      ...(verification ? {
        modelJson: verification.modelJson,
        postModelCompile: verification.postModelCompile,
        postModelEnergyGate: revisionGate,
      } : {}),
    });

    if (verification && !shouldReviseWorkerOutput(verification)) break;
    previousOutput = run.stdout;
    previousVerification = verification || previousVerification;
  }

  const finalAttempt = attempts.at(-1) || null;
  return {
    attempted: true,
    attempts,
    final: finalAttempt ? {
      attempt: finalAttempt.attempt,
      exitCode: finalAttempt.exitCode,
      compileStatus: finalAttempt.postModelCompile?.status || 'not_run',
    } : null,
  };
}

function runTelemetry(payload) {
  const limit = positiveInt(payload.limit, DEFAULT_TELEMETRY_LIMIT);
  const events = readOriginatorTelemetry({
    limit,
    traceId: payload.traceId,
    phase: payload.phase,
  });
  return originatorEnvelope({
    op: 'telemetry',
    status: 'ok',
    result: {
      telemetryPath: path.relative(REPO_ROOT, TELEMETRY_PATH),
      count: events.length,
      events,
    },
    completeness: { eventCount: events.length },
    verification: { reason: 'telemetry_read_complete' },
  });
}

function resolveTraceId(payload = {}) {
  const provided = String(payload.traceId || '').trim();
  if (provided) return provided;
  return `originator-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
}

function shouldIncludeRawTelemetry(payload = {}) {
  return payload.telemetryRaw !== false;
}

export function formatOriginatorTelemetryEvent(traceId, phase, data = {}, now = new Date()) {
  return {
    ts: now.toISOString(),
    traceId,
    phase,
    advisory_only: true,
    local_truth_claim: false,
    data: stripUndefined(data),
  };
}

export function emitOriginatorTelemetry(payload = {}, traceId, phase, data = {}) {
  if (payload.telemetry === false) return null;
  const event = formatOriginatorTelemetryEvent(traceId, phase, data);
  mkdirSync(path.dirname(TELEMETRY_PATH), { recursive: true });
  appendFileSync(TELEMETRY_PATH, `${JSON.stringify(event)}\n`, 'utf8');
  return event;
}

export function readOriginatorTelemetry({ limit = DEFAULT_TELEMETRY_LIMIT, traceId = '', phase = '' } = {}) {
  if (!existsSync(TELEMETRY_PATH)) return [];
  const lines = readFileSync(TELEMETRY_PATH, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean);
  const events = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (traceId && event.traceId !== traceId) continue;
      if (phase && event.phase !== phase) continue;
      events.push(event);
    } catch {
      // Ignore malformed telemetry rows instead of blocking operator visibility.
    }
  }
  return events.slice(-positiveInt(limit, DEFAULT_TELEMETRY_LIMIT));
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .map(([key, nested]) => [key, stripUndefined(nested)]),
  );
}

export function buildWorkerRevisionPrompt({ objective = '', previousOutput = '', previousVerification = {}, attempt = 1 } = {}) {
  const compile = previousVerification.postModelCompile || {};
  const compileResult = compile.result || {};
  return JSON.stringify({
    objective,
    revisionAttempt: attempt,
    instruction: [
      'Revise the previous local-worker packet so proposedState compiles as executable YURI energy state.',
      'Return strict JSON only.',
      'Use proposedState.stateBefore and proposedState.stateAfter.',
      `Allowed executable fields: ${CANONICAL_ENERGY_FIELDS.join(', ')}.`,
      'Distribution fields must be arrays of finite non-negative numbers with positive finite sum.',
      'Probability vector fields must be arrays of finite probabilities in [0,1].',
      'Count fields must be finite non-negative numbers.',
      'Evidence must be an array of records exactly shaped as { "base": number in [0,1], "age": non-negative number, "halfLife": positive number }.',
      'Move all human-readable claims, filenames, labels, metrics, scores, and explanations into laneClaims, observations, or handoff.',
      'Preserve and cite formula card IDs under laneClaims.formulaUse when they are part of the construction.',
      'Do not include U, deltaU, entropy, staleness_index, risk_score, u_cost, drift_index, or energy_delta_estimate in proposedState.',
    ],
    compilerFeedback: {
      status: compile.status || 'not_run',
      reason: compile.verification?.reason || 'no compiler reason available',
      rejectedFields: compileResult.rejectedFields || [],
      advisoryFields: compileResult.advisoryFields || [],
      canonicalFields: CANONICAL_ENERGY_FIELDS,
    },
    previousOutput: String(previousOutput || '').slice(0, 12000),
    required_shape: {
      objective: 'string',
      observations: ['string'],
      laneClaims: {},
      proposedState: {
        stateBefore: {
          claimPromotionDistribution: { draft: 0.5, trusted: 0.5 },
          claimedDistribution: [0.8, 0.2],
          verifiedDistribution: [0.5, 0.5],
          priorState: [0.5, 0.5],
          posteriorState: [0.5, 0.5],
          evidence: [{ base: 0.7, age: 4, halfLife: 12 }],
          verifiedEvidenceCount: 1,
          protectedPathViolations: 0,
          promotionLadderInversions: 0,
        },
        stateAfter: {
          claimPromotionDistribution: { draft: 0.8, trusted: 0.2 },
          claimedDistribution: [0.8, 0.2],
          verifiedDistribution: [0.8, 0.2],
          priorState: [0.5, 0.5],
          posteriorState: [0.8, 0.2],
          evidence: [{ base: 0.8, age: 1, halfLife: 12 }],
          verifiedEvidenceCount: 2,
          protectedPathViolations: 0,
          promotionLadderInversions: 0,
        },
      },
      handoff: ['string'],
    },
  }, null, 2);
}

export function buildFormulaSlate(objective = '', recall = '') {
  const haystack = `${objective}\n${recall}`.toLowerCase();
  // These cards are INJECTED into every slate regardless of the objective. That manufactures presence:
  // a lane citing a mandatory card is NOT evidence it independently reached for it (verified false-
  // convergence 2026-06-08). buildFormulaSlate therefore tags provenance so verifyFormulaUse can tell
  // an injected citation from an earned one.
  const mandatory = new Set(['schema.type_algebra', 'lyapunov.energy_descent', 'bayes.evidence_update']);
  const scored = FORMULA_CARDS.map((card) => {
    const hits = card.useWhen.filter((term) => haystack.includes(term.toLowerCase())).length;
    const isMandatory = mandatory.has(card.id);
    const mandatoryBoost = isMandatory ? 2 : 0;
    // 'mandatory' = present ONLY via the boost (0 real objective hits); 'selected' = the objective
    // genuinely matched it (it earned its place, mandatory or not).
    const provenance = isMandatory && hits === 0 ? 'mandatory' : 'selected';
    return { card, score: hits + mandatoryBoost, hits, mandatoryBoost, provenance };
  })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.card.id.localeCompare(right.card.id));

  return scored.slice(0, MAX_FORMULA_SLATE_CARDS).map(({ card, score, hits, mandatoryBoost, provenance }) => ({
    id: card.id,
    theoremFamily: card.theoremFamily,
    operator: card.operator,
    executableHook: card.executableHook,
    outputShape: card.outputShape,
    selectionScore: score,
    hits,
    mandatoryBoost,
    provenance,
  }));
}

export function verifyFormulaUse(modelJson = {}, formulaSlate = []) {
  const allowed = new Set(formulaSlate.map((card) => card.id));
  const slateById = new Map(formulaSlate.map((card) => [card.id, card]));
  const rawUse = modelJson?.laneClaims?.formulaUse ?? modelJson?.formulaUse ?? [];
  const used = Array.isArray(rawUse)
    ? rawUse.map(String)
    : String(rawUse || '').split(/[,;\s]+/).filter(Boolean);
  const uniqueUsed = [...new Set(used)];
  // Per-citation provenance audit: a card cited only because it was INJECTED ('mandatory') is NOT
  // evidence of lane independence. independentFormulaUse requires at least one EARNED ('selected') citation.
  const citations = uniqueUsed.map((id) => {
    const slateEntry = slateById.get(id);
    const inSlate = Boolean(slateEntry);
    const provenance = inSlate ? (slateEntry.provenance === 'selected' ? 'selected' : 'mandatory') : null;
    return { id, inSlate, provenance, independentlyChosen: inSlate && provenance === 'selected' };
  });
  const independentFormulaUse = citations.some((c) => c.independentlyChosen);
  const injectedOnlyCitations = citations.filter((c) => c.inSlate && c.provenance === 'mandatory').map((c) => c.id);
  if (uniqueUsed.length === 0) {
    return {
      status: 'missing',
      used: [],
      unknown: [],
      citations: [],
      independentFormulaUse: false,
      injectedOnlyCitations: [],
      reason: 'model did not cite formula card IDs',
    };
  }
  const unknown = uniqueUsed.filter((id) => !allowed.has(id));
  return {
    status: unknown.length > 0 ? 'rejected' : 'ok',
    used: uniqueUsed,
    unknown,
    citations,
    independentFormulaUse,
    injectedOnlyCitations,
    reason: unknown.length > 0
      ? 'model cited formula cards outside selected formulaSlate'
      : 'formula card citations match selected formulaSlate',
  };
}

export function selectFinalWorkerVerification(initialVerification = null, revision = null) {
  const attempts = revision?.attempts || [];
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const verification = attempts[index]?.postModelCompile
      ? {
        modelJson: attempts[index].modelJson,
        modelJsonParse: { ok: true },
        postModelCompile: attempts[index].postModelCompile,
      }
      : null;
    if (verification && !shouldReviseWorkerOutput(verification)) return verification;
  }
  const last = attempts.at(-1);
  if (last?.postModelCompile) {
    return {
      modelJson: last.modelJson,
      modelJsonParse: { ok: true },
      postModelCompile: last.postModelCompile,
    };
  }
  return initialVerification;
}

export function tryGateCompiledModelOutput(postModelCompile = null, payload = {}) {
  if (!postModelCompile?.verification?.executableEnergyState) {
    return { status: 'not_run', reason: 'compiled executable state unavailable' };
  }
  const stateBefore = postModelCompile.result?.compiled?.stateBefore;
  const stateAfter = postModelCompile.result?.compiled?.stateAfter;
  if (!isPlainObject(stateBefore) || !isPlainObject(stateAfter)) {
    return { status: 'not_run', reason: 'stateBefore/stateAfter required for energy gate' };
  }
  try {
    const gate = gateProposal({
      origin: 'originator',
      stateBefore,
      stateAfter,
      weights: payload.weights,
      threshold: payload.threshold ?? 0,
      allowOverride: payload.allowOverride === true,
      maxLadderInversionCap: resolveMaxLadderInversionCap(payload),
    });
    return {
      status: gate.result.accept ? 'accepted' : 'rejected',
      result: gate.result,
      proof: gate.proof,
    };
  } catch (error) {
    return {
      status: 'rejected',
      reason: error?.message || String(error),
    };
  }
}

export function verifyWorkerModelOutput(stdout = '', options = {}) {
  const parsed = parseWorkerJsonPayload(stdout);
  if (!parsed.ok) {
    return {
      modelJson: null,
      modelJsonParse: {
        ok: false,
        reason: parsed.reason,
      },
      postModelCompile: {
        status: 'not_run',
        verification: { reason: 'model_json_parse_failed' },
      },
    };
  }

  const modelJson = normalizeWorkerModelJson(parsed.value);
  const postModelCompile = isPlainObject(modelJson?.proposedState)
    ? compileSemanticStatePacket(modelJson.proposedState, options)
    : {
      status: 'not_run',
      result: {},
      verification: { reason: 'no proposedState object' },
      completeness: {},
    };

  return {
    modelJson,
    modelJsonParse: {
      ok: true,
    },
    postModelCompile,
  };
}

function normalizeWorkerModelJson(value = {}) {
  if (!isPlainObject(value)) return value;
  const nested = value.workSubstrate;
  if (
    isPlainObject(nested)
    && !isPlainObject(value.proposedState)
    && (
      isPlainObject(nested.proposedState)
      || Array.isArray(nested.toolRequests)
      || Array.isArray(nested.tool_requests)
      || Array.isArray(nested.candidateActions)
      || isPlainObject(nested.laneClaims)
      || Array.isArray(nested.handoff)
    )
  ) {
    return nested;
  }
  return value;
}

export function parseWorkerJsonPayload(stdout = '') {
  const raw = String(stdout || '').trim();
  const candidates = [];
  if (raw) candidates.push(raw);

  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/i);
  if (fenced?.[1]) candidates.unshift(fenced[1].trim());

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(raw.slice(start, end + 1));

  for (const candidate of [...new Set(candidates)]) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // Try the next extraction strategy.
    }
  }

  return { ok: false, reason: 'strict_json_payload_not_found' };
}

function originatorEnvelope({
  op,
  status,
  result,
  completeness = {},
  provenance = {},
  verification = {},
}) {
  return {
    op,
    status,
    result,
    completeness,
    advisory_only: true,
    local_truth_claim: false,
    provenance: {
      originator: '_SYSTEM/Scripts/yuri-originator.mjs',
      generated_at: new Date().toISOString(),
      readOnly: true,
      ...provenance,
    },
    verification: {
      protectedPathCheck: 'passed',
      mutationPolicy: 'read_only',
      ...verification,
    },
  };
}

function recommendedOps(signals) {
  const ops = ['decode'];
  if (signals.wantsRecall || signals.wantsLocalModel || signals.wantsMath) ops.push('xref');
  if (signals.wantsMath || signals.wantsLocalModel) ops.push('compile_state', 'energy_gate');
  if (signals.wantsLocalModel) ops.push('worker_exoskeleton');
  return [...new Set(ops)];
}

function normalizeOp(op) {
  return String(op || 'decode').replace(/^@/, '').toLowerCase();
}

function normalizePayload(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload;
  return { objective: String(payload || '') };
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function inferWorkMode(objective = '') {
  const text = String(objective || '').toLowerCase();
  if (/\b(test|verify|proof|validate|check|audit)\b/.test(text)) return 'verify';
  if (/\b(simulate|simulation|model|scenario)\b/.test(text)) return 'simulate';
  if (/\b(research|explore|scope|understand)\b/.test(text)) return 'research';
  if (/\b(refactor|rename|cleanup)\b/.test(text)) return 'refactor';
  if (/\b(doc|handoff|manual|writeup)\b/.test(text)) return 'document';
  if (/\b(fix|improve|gap|hardening|upgrade)\b/.test(text)) return 'improve';
  return 'build';
}

function normalizeWorkMode(value = 'build') {
  const raw = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  const allowed = new Set(['improve', 'build', 'verify', 'simulate', 'research', 'refactor', 'document']);
  return allowed.has(raw) ? raw : 'build';
}

function normalizeActionContract(value = 'read_only') {
  const raw = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  const allowed = new Set(['read_only', 'propose_patch', 'safe_write_dry_run']);
  return allowed.has(raw) ? raw : 'read_only';
}

function normalizeStringList(value, fallback = []) {
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => String(entry || '').trim()).filter(Boolean);
    return normalized.length ? [...new Set(normalized)] : fallback;
  }
  if (typeof value === 'string' && value.trim()) {
    const normalized = value.split(/[,;\n]+/).map((entry) => entry.trim()).filter(Boolean);
    return normalized.length ? [...new Set(normalized)] : fallback;
  }
  return fallback;
}

function defaultAllowedActions(actionContract = 'read_only') {
  const base = ['xref_query', 'read_file', 'grep', 'list_dir', 'propagation_scan', 'run_tests'];
  if (actionContract === 'read_only') return base;
  return [...base, 'propose_patch', 'safe_write_dry_run'];
}

function defaultAllowedPaths(mode = 'build') {
  const shared = ['_SYSTEM/Scripts/', '_SYSTEM/docs/', '_SYSTEM/INDEX.md', '_SYSTEM/context/', '02_RESOURCES/RESEARCH/'];
  if (mode === 'document' || mode === 'research') return ['_SYSTEM/docs/', '02_RESOURCES/RESEARCH/', '_SYSTEM/reports/'];
  return shared;
}

function payloadForProtectedPathCheck(value) {
  if (Array.isArray(value)) return value.map(payloadForProtectedPathCheck);
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/_/g, '');
    if (normalized === 'deniedpaths') continue;
    out[key] = payloadForProtectedPathCheck(nested);
  }
  return out;
}

function hasMutationAttempt(value) {
  if (Array.isArray(value)) return value.some(hasMutationAttempt);
  if (!value || typeof value !== 'object') return false;
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === 'mutation' && String(nested || '').toLowerCase() !== 'read_only') return true;
    if (['write', 'commit', 'push', 'delete', 'remove', 'unlink'].includes(normalizedKey) && nested === true) return true;
    if (hasMutationAttempt(nested)) return true;
  }
  return false;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseCli(argv) {
  const options = { top: DEFAULT_TOP, scan: DEFAULT_SCAN };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--top') {
      options.top = positiveInt(argv[++i], DEFAULT_TOP);
    } else if (arg === '--scan') {
      options.scan = positiveInt(argv[++i], DEFAULT_SCAN);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      rest.push(arg);
    }
  }
  const op = rest.shift() || 'decode';
  const raw = rest.join(' ') || readStdin();
  const payload = parsePayload(raw);
  return { op, payload, options };
}

function parsePayload(raw) {
  const text = String(raw || '').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { objective: text, query: text };
  }
}

function readStdin() {
  try {
    return process.stdin.isTTY ? '' : readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function printHelp() {
  process.stdout.write(`Usage: node _SYSTEM/Scripts/yuri-originator.mjs <op> [json-or-text]\n\n`);
  process.stdout.write(`Ops: decode, xref, compile_state, energy_gate, create_work_substrate, candidate_actions, launch_substrate, synthesize_formula_candidates, worker_exoskeleton, llm_exoskeleton, gemma_exoskeleton, telemetry\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const request = parseCli(process.argv.slice(2));
    const payload = await runOriginator(request);
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = ['rejected'].includes(payload.status) ? 1 : 0;
  } catch (error) {
    process.stderr.write(`YURI_ORIGINATOR_FAIL ${error?.message || error}\n`);
    process.exitCode = 1;
  }
}
