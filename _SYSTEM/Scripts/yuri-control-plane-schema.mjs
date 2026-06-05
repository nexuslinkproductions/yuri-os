import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const CONTROL_PLANE_VERSION = 'yuri.control-plane.v1';

export const CONTROL_PLANE_EVENTS = Object.freeze([
  'GRAPH_COMPILED',
  'NODE_DISPATCHED',
  'NODE_VERIFIED',
  'PROMOTION_DECISION',
]);

const CANONICAL_LIFECYCLE = Object.freeze([
  'intake',
  'normalize',
  'graph-plan',
  'route',
  'execute',
  'verify',
  'sanitize',
  'promote',
]);

const PROBABILITY_MARKERS = Object.freeze([
  'probability',
  'uncertainty',
  'uncertain',
  'forecast',
  'expected value',
  'risk acceptance',
  'go / no-go',
  'go/no-go',
  'calibration',
  'confidence',
  'cost of error',
  'reversibility',
  'route selection',
  'opportunity ranking',
]);

const CONTROL_PLANE_KEYWORDS = Object.freeze([
  'brain dump',
  'control plane',
  'graph plan',
  'task graph',
  'durable orchestration',
  'route',
  'execute',
  'verify',
  'sanitize',
  'promote',
  'canonical state',
  'artifact',
]);

function textHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function normalizePrompt(value) {
  return String(value || '').trim();
}

function includesAny(text, markers) {
  const lowered = text.toLowerCase();
  return markers.some((marker) => lowered.includes(marker));
}

function extractKeywords(prompt) {
  const lowered = prompt.toLowerCase();
  return CONTROL_PLANE_KEYWORDS.filter((keyword) => lowered.includes(keyword));
}

function inferRisk(prompt, routePlan = {}) {
  const lowered = prompt.toLowerCase();
  if (includesAny(lowered, ['secret', 'credential', '.env', 'backend/data', 'protected path', 'production', 'auth', 'database'])) {
    return 'high';
  }
  if (routePlan.scenario === 'control-plane-orchestration' || includesAny(lowered, ['risk', 'architecture', 'control plane', 'orchestration', 'mutation'])) {
    return 'medium';
  }
  return 'low';
}

function buildProbabilityLens(prompt) {
  if (!includesAny(prompt, PROBABILITY_MARKERS)) {
    return undefined;
  }

  return {
    decision: 'Route and execute this control-plane task with uncertainty made explicit.',
    outcome_being_estimated: 'Whether the selected route can produce verified artifacts without unsafe promotion.',
    time_horizon: 'current run',
    base_rate: {
      estimate: 'unknown',
      source: 'No calibrated local base rate supplied for this task class.',
      confidence: 'low',
    },
    predictability: {
      factor_understanding: 'medium',
      data_available: 'weak',
      future_similarity: 'medium',
      observer_effect: 'weak',
      verdict: 'medium',
    },
    signals_for: [
      {
        signal: 'Existing sandbox, guarded executor, skill context, and learning gates provide reusable control-plane substrate.',
        strength: 'medium',
        source: 'repo-local orchestration surfaces',
      },
    ],
    signals_against: [
      {
        signal: 'Graph node execution and promotion decisions are not yet fully durable at node granularity.',
        strength: 'medium',
        source: 'repo-local gap analysis',
      },
    ],
    estimate: {
      probability: 'not_estimable',
      confidence: 'low',
      rationale: 'The current repo has strong substrate but lacks calibrated outcome history for this specific graph orchestration path.',
    },
    decision_value: {
      upside: 'More auditable routing and safer promotion of verified learning.',
      downside: 'Additional schema and artifact complexity can become overhead if not kept narrow.',
      cost_if_wrong: 'medium',
      reversibility: 'high',
      expected_value: 'positive',
    },
    action: {
      recommendation: 'proceed',
      next_step: 'Compile graph artifacts and require deterministic verification before promotion.',
      calibration_log_required: false,
    },
  };
}

export function buildNormalizedIntent({ prompt, mode = 'dry-run', routePlan = {}, artifactRoot = '', runDir = '' } = {}) {
  const roughIdea = normalizePrompt(prompt);
  const executionMode = mode === 'live' ? 'execute' : 'dry_run';
  const probabilityLens = buildProbabilityLens(roughIdea);
  const intent = {
    id: `intent-${textHash(`${roughIdea}:${executionMode}`)}`,
    intent_version: CONTROL_PLANE_VERSION,
    rough_idea: roughIdea,
    normalized_goal: roughIdea || 'Process a Yuri control-plane request.',
    execution_mode: executionMode,
    tier_required: 'tier0_readonly',
    risk_level: inferRisk(roughIdea, routePlan),
    mutation_policy: {
      default_mutation: false,
      tier1_blocked: true,
      repo_writes_allowed: false,
      source_writes_allowed: false,
      gitnexus_impact_required_for_mutation: true,
    },
    artifact_policy: {
      keep_out_of_repo: true,
      write_git_tracked_source: false,
      artifact_root: artifactRoot || runDir || '',
      run_dir: runDir || '',
      raw_output_tainted: true,
    },
    verifier_requirements: [
      'route-plan-present',
      'artifact-policy-present',
      'repo-status-unchanged',
      'protected-paths-clean',
      'raw-output-artifact-only',
      'promotion-requires-verification',
    ],
    notes: [
      'Raw brain dump and executor output remain artifact-only until deterministic verification.',
      'Probability is a normalization lens only; it cannot bypass safety gates.',
    ],
    keywords: extractKeywords(roughIdea),
  };

  if (probabilityLens) {
    intent.probabilistic_decision = probabilityLens;
  }

  return intent;
}

export function buildGraphPlan({ normalizedIntent, routePlan = {}, memorySurface = '_SYSTEM/OS_KERNEL/memory.db' } = {}) {
  const intent = normalizedIntent || buildNormalizedIntent({});
  const graphId = `graph-${textHash(`${intent.id}:${intent.normalized_goal}`)}`;
  const nodes = [
    buildNode({
      node_id: 'intake',
      kind: 'intake',
      dependencies: [],
      capability: 'capture-tainted-input',
      lane_hint: 'main-session',
      required_artifacts: ['normalized-intent.json'],
      verifier: 'artifact-exists',
      promotion_gate: { requires_verification: false, action: 'none' },
    }),
    buildNode({
      node_id: 'normalize',
      kind: 'normalize',
      dependencies: ['intake'],
      capability: 'compile-typed-intent',
      lane_hint: 'main-session',
      required_artifacts: ['normalized-intent.json'],
      verifier: 'normalized-intent-schema',
      promotion_gate: { requires_verification: false, action: 'none' },
    }),
    buildNode({
      node_id: 'graph-plan',
      kind: 'graph-plan',
      dependencies: ['normalize'],
      capability: 'compile-task-graph',
      lane_hint: 'main-session',
      required_artifacts: ['graph-plan.json'],
      verifier: 'graph-plan-schema',
      promotion_gate: { requires_verification: false, action: 'none' },
    }),
    buildNode({
      node_id: 'route',
      kind: 'route',
      dependencies: ['graph-plan'],
      capability: 'bind-capability-to-lane',
      lane_hint: routePlan.lane || 'native',
      required_artifacts: ['route-plan.json'],
      verifier: 'llm-compat-contract-route-plan',
      promotion_gate: { requires_verification: false, action: 'none' },
    }),
    buildNode({
      node_id: 'execute',
      kind: 'execute',
      dependencies: ['route'],
      capability: 'run-bounded-executor',
      lane_hint: routePlan.lane || 'native',
      required_artifacts: ['raw-output.md'],
      verifier: 'executor-artifact-check',
      promotion_gate: { requires_verification: false, action: 'none' },
    }),
    buildNode({
      node_id: 'verify',
      kind: 'verify',
      dependencies: ['execute'],
      capability: 'upgrade-claims-with-local-evidence',
      lane_hint: 'local-tools',
      required_artifacts: ['verification.json'],
      verifier: 'deterministic-local-evidence',
      promotion_gate: { requires_verification: true, action: 'allow-sanitize' },
    }),
    buildNode({
      node_id: 'sanitize',
      kind: 'sanitize',
      dependencies: ['verify'],
      capability: 'hash-and-summarize-verified-facts',
      lane_hint: 'main-session',
      required_artifacts: ['learning-summary.json'],
      verifier: 'raw-output-hash-present',
      promotion_gate: { requires_verification: true, action: 'allow-promotion-candidate' },
    }),
    buildNode({
      node_id: 'promote',
      kind: 'promote',
      dependencies: ['sanitize', 'verify'],
      capability: 'submit-sanitized-learning-to-existing-gates',
      lane_hint: 'memory',
      required_artifacts: ['promotion-decision.json'],
      verifier: 'reviewed-learning-gate',
      promotion_gate: { requires_verification: true, action: 'existing-learning-review-only' },
    }),
  ];

  return {
    graph_id: graphId,
    graph_version: CONTROL_PLANE_VERSION,
    intent_id: intent.id,
    created_at: new Date().toISOString(),
    scenario: routePlan.scenario || 'control-plane-orchestration',
    route_lane: routePlan.lane || 'native',
    lifecycle: CANONICAL_LIFECYCLE.slice(),
    artifact_policy: { ...intent.artifact_policy },
    canonical_state_policy: {
      memory_surface: memorySurface,
      raw_output_tainted: true,
      raw_output_may_enter_memory: false,
      sanitized_verified_summary_only: true,
      promotion_requires_review: true,
    },
    observability: {
      token_ledger_optional: true,
      events: CONTROL_PLANE_EVENTS.slice(),
    },
    nodes,
  };
}

function buildNode(input) {
  return {
    permission_tier: 'tier0_readonly',
    gitnexus_gate: {
      impact_required: false,
      required_before_mutation: true,
    },
    ...input,
  };
}

export function buildNodeVerificationArtifacts(graphPlan = {}) {
  const nodes = Array.isArray(graphPlan.nodes) ? graphPlan.nodes : [];
  return nodes.map((node) => ({
    node_id: node.node_id,
    kind: node.kind,
    verification_status: 'pending',
    advisory_only: true,
    local_truth_claim: false,
    verifier: node.verifier,
    required_artifacts: Array.isArray(node.required_artifacts) ? node.required_artifacts.slice() : [],
    promotion_gate: node.promotion_gate || {},
    evidence: [],
  }));
}

export function writeNodeVerificationArtifacts(graphPlan, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const verifications = buildNodeVerificationArtifacts(graphPlan);
  for (const verification of verifications) {
    const fileName = `${verification.node_id}.verification.json`;
    fs.writeFileSync(path.join(directory, fileName), `${JSON.stringify(verification, null, 2)}\n`, 'utf8');
  }
  return verifications;
}

export function validateNormalizedIntent(intent) {
  const issues = [];
  if (!isPlainObject(intent)) {
    return { ok: false, issues: ['intent must be a plain object'] };
  }

  for (const key of ['id', 'intent_version', 'rough_idea', 'normalized_goal', 'execution_mode', 'tier_required', 'risk_level', 'mutation_policy', 'artifact_policy', 'notes', 'keywords']) {
    if (!(key in intent)) issues.push(`intent missing field: ${key}`);
  }
  if (!['dry_run', 'execute'].includes(intent.execution_mode)) issues.push('invalid execution_mode');
  if (!['tier0_readonly', 'tier1_blocked'].includes(intent.tier_required)) issues.push('invalid tier_required');
  if (!['low', 'medium', 'high'].includes(intent.risk_level)) issues.push('invalid risk_level');
  if (!isPlainObject(intent.mutation_policy)) {
    issues.push('mutation_policy must be an object');
  } else {
    if (intent.mutation_policy.default_mutation !== false) issues.push('mutation_policy.default_mutation must be false');
    if (intent.mutation_policy.tier1_blocked !== true) issues.push('mutation_policy.tier1_blocked must be true');
    if (intent.mutation_policy.repo_writes_allowed !== false) issues.push('mutation_policy.repo_writes_allowed must be false');
    if (intent.mutation_policy.source_writes_allowed !== false) issues.push('mutation_policy.source_writes_allowed must be false');
  }
  if (!isPlainObject(intent.artifact_policy)) {
    issues.push('artifact_policy must be an object');
  } else {
    if (intent.artifact_policy.keep_out_of_repo !== true) issues.push('artifact_policy.keep_out_of_repo must be true');
    if (intent.artifact_policy.write_git_tracked_source !== false) issues.push('artifact_policy.write_git_tracked_source must be false');
    if (typeof intent.artifact_policy.artifact_root !== 'string' || intent.artifact_policy.artifact_root.length === 0) issues.push('artifact_policy.artifact_root must be non-empty');
  }
  if (!Array.isArray(intent.notes) || intent.notes.some((item) => typeof item !== 'string')) issues.push('notes must be a string array');
  if (!Array.isArray(intent.keywords) || intent.keywords.some((item) => typeof item !== 'string')) issues.push('keywords must be a string array');
  if (intent.probabilistic_decision && !isPlainObject(intent.probabilistic_decision.action)) {
    issues.push('probabilistic_decision.action must be present when probability lens is used');
  }

  return { ok: issues.length === 0, issues };
}

export function validateGraphPlan(plan) {
  const issues = [];
  if (!isPlainObject(plan)) {
    return { ok: false, issues: ['graph plan must be a plain object'] };
  }

  for (const key of ['graph_id', 'graph_version', 'intent_id', 'artifact_policy', 'canonical_state_policy', 'nodes']) {
    if (!(key in plan)) issues.push(`graph plan missing field: ${key}`);
  }
  if (!isPlainObject(plan.artifact_policy)) issues.push('artifact_policy must be present');
  if (!Array.isArray(plan.nodes) || plan.nodes.length === 0) {
    issues.push('nodes must be a non-empty array');
    return { ok: issues.length === 0, issues };
  }

  const nodeIds = new Set();
  for (const node of plan.nodes) {
    if (!isPlainObject(node)) {
      issues.push('node must be an object');
      continue;
    }
    for (const key of ['node_id', 'kind', 'dependencies', 'capability', 'lane_hint', 'permission_tier', 'required_artifacts', 'verifier', 'promotion_gate']) {
      if (!(key in node)) issues.push(`node missing field: ${key}`);
    }
    if (typeof node.node_id === 'string') {
      if (nodeIds.has(node.node_id)) issues.push(`duplicate node_id: ${node.node_id}`);
      nodeIds.add(node.node_id);
    }
    if (!Array.isArray(node.dependencies)) issues.push(`node ${node.node_id || '(unknown)'} dependencies must be an array`);
    if (!Array.isArray(node.required_artifacts) || node.required_artifacts.length === 0) issues.push(`node ${node.node_id || '(unknown)'} required_artifacts must be non-empty`);
    if (typeof node.verifier !== 'string' || node.verifier.length === 0) issues.push(`node ${node.node_id || '(unknown)'} verifier is required`);
    if (!isPlainObject(node.promotion_gate)) issues.push(`node ${node.node_id || '(unknown)'} promotion_gate must be an object`);
    if (node.permission_tier === 'tier1_mutation' && node.gitnexus_gate?.impact_required !== true) {
      issues.push(`node ${node.node_id || '(unknown)'} tier1 mutation requires gitnexus impact gate`);
    }
    if (node.kind === 'promote' && node.promotion_gate?.requires_verification !== true) {
      issues.push(`node ${node.node_id || '(unknown)'} promotion requires verification`);
    }
  }

  for (const node of plan.nodes) {
    if (!Array.isArray(node?.dependencies)) continue;
    for (const dependency of node.dependencies) {
      if (!nodeIds.has(dependency)) issues.push(`node ${node.node_id} has unknown dependency: ${dependency}`);
    }
  }

  return { ok: issues.length === 0, issues };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
