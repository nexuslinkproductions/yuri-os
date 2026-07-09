#!/usr/bin/env node
// @capability: sol-moe-routing-policy
// @serves: deterministic Sol-first MURE routing | task risk class | native dispatch specs | route telemetry
// @does: pure, advisory routing for the existing MURE company orchestrator. It classifies tasks before any LLM call, applies hard risk masks, returns sessions_spawn-compatible dispatch specs, and creates ledger rows without dispatching or writing live state.
// @use: import { classifyTask, produceCandidatePlan, routeTask, createLedgerRow } from './sol-moe-router.mjs'. This module never calls sessions_spawn and never mutates runtime config.
// @exports: DEFAULT_POLICY, NoEligibleFrontierError, classifyTask, produceCandidatePlan, routeTask, createLedgerRow

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POLICY_PATH = path.resolve(HERE, '../config/sol-moe-routing-policy.json');

export const DEFAULT_POLICY = deepFreeze(JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8')));

const PROTECTED_PATH = /(^|[\\/])(?:\.env|backend[\\/]data|node_modules|\.amp|\.claude[\\/](?:state|history|file-history|worktrees|transcripts))(?:[\\/]|$)/i;
const SECURITY = /\b(?:security|secure|auth(?:entication|orization)?|credential|secret|token|oauth|permission|vulnerab|exploit|injection|xss|csrf|bypass|threat|red[ -]?team)\b/i;
const GOVERNANCE = /\b(?:governance|owner[ -]?gate|policy|constitutional|protected[ -]?path|compliance|consent|approval gate)\b/i;
const DESTRUCTIVE = /\b(?:delete|destroy|drop|purge|wipe|rotate production|force push|reset --hard|irreversible|publish|deploy production)\b/i;
const IMPLEMENTATION = /\b(?:implement|build|code|edit|patch|fix|refactor|migrate|adapter|parser|compiler|api)\b/i;
const ARCHITECTURE = /\b(?:architecture|architect|system design|service design|migration plan|multi-service|schema design)\b/i;
const SYNTHESIS = /\b(?:synthesi[sz]e|integrate findings|combine findings|final synthesis)\b/i;
const RESEARCH = /\b(?:research|investigate|survey|compare sources|literature|evidence review)\b/i;
const VERIFICATION = /\b(?:verify|verification|validate|acceptance test|release gate|finali[sz]e|commit gate|audit result)\b/i;
const ORCHESTRATION = /\b(?:orchestrat|delegate|dispatch|route tasks?|goal spine|decompose)\b/i;
const BREADTH = /\b(?:grep|scan|extract|classify|inventory|list all|summari[sz]e files?|find occurrences?)\b/i;

export class NoEligibleFrontierError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'NoEligibleFrontierError';
    this.code = 'NO_ELIGIBLE_FRONTIER';
    this.details = details;
  }
}

/** Deterministic, pre-LLM task classifier. Unknown work defaults to R1, never cheap. */
export function classifyTask(task = {}) {
  const summary = String(task.summary || task.prompt || '').trim();
  const files = Array.isArray(task.files) ? task.files.map(String) : [];
  const text = `${summary} ${String(task.kind || '')} ${String(task.domain || '')}`.trim();
  const protectedSurface = files.some((file) => PROTECTED_PATH.test(normalizePath(file)));
  const security = task.security === true || task.touchesSensitive === true || SECURITY.test(text);
  const governance = task.governance === true || GOVERNANCE.test(text);
  const destructive = task.destructive === true || task.irreversible === true || task.reversible === false || DESTRUCTIVE.test(text);
  const outwardFacing = task.outwardFacing === true;
  const arming = task.arming === true;
  const architecture = task.architecture === true || ARCHITECTURE.test(text);
  const implementation = task.implementation === true || IMPLEMENTATION.test(text);
  const multiFile = files.length >= 4;
  const highBlast = String(task.blastRadius || '').toUpperCase() === 'HIGH';
  const mediumBlast = String(task.blastRadius || '').toUpperCase() === 'MEDIUM';
  const explicitImportant = task.important === true || task.riskClass === 'R2';

  let riskClass;
  if (task.riskClass === 'R3' || security || governance || destructive || protectedSurface || outwardFacing || arming) {
    riskClass = 'R3';
  } else if (architecture || multiFile || highBlast || mediumBlast || explicitImportant) {
    riskClass = 'R2';
  } else if (task.riskClass === 'R0' || isMechanicalReadOnly(task, text)) {
    riskClass = 'R0';
  } else {
    riskClass = 'R1';
  }

  const taskType = inferTaskType(task, text, {
    riskClass,
    security,
    governance,
    architecture,
    implementation,
  });

  const reasons = [];
  if (protectedSurface) reasons.push('protected-surface');
  if (security) reasons.push('security');
  if (governance) reasons.push('governance');
  if (destructive) reasons.push('destructive-or-irreversible');
  if (outwardFacing) reasons.push('outward-facing');
  if (arming) reasons.push('arming');
  if (architecture) reasons.push('architecture');
  if (multiFile) reasons.push('multi-file');
  if (highBlast || mediumBlast) reasons.push(`${String(task.blastRadius).toLowerCase()}-blast`);
  if (riskClass === 'R0') reasons.push('mechanical-read-only');
  if (!reasons.length) reasons.push('frontier-safe-default');

  return deepFreeze({
    riskClass,
    taskType,
    reasons,
    protectedSurface,
    requiresFrontierProducer: riskClass !== 'R0',
    requiresVerifier: riskClass === 'R2' || riskClass === 'R3',
    requiresOpusVerification: riskClass === 'R3',
    task: { ...task, summary, files },
  });
}

/** Build an advisory candidate plan after hard masks, without choosing or dispatching. */
export function produceCandidatePlan(classification, opts = {}) {
  assertClassification(classification);
  const policy = opts.policy || DEFAULT_POLICY;
  validatePolicy(policy);
  const availability = opts.availability || {};
  const profile = policy.taskProfiles[classification.taskType] || policy.taskProfiles.general;
  const byId = new Map(policy.experts.map((expert) => [expert.id, expert]));
  const rejected = [];

  const resolve = (ids, use) => ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((expert) => candidate(expert, use, classification, availability, rejected))
    .filter(Boolean);

  const primary = resolve(profile.producer || [], 'semantic-producer');
  const availabilityFallbacks = resolve(profile.availabilityFallback || [], 'semantic-producer');
  const qualityEscalations = resolve(profile.qualityEscalation || [], 'semantic-producer');
  const verifierIds = classification.requiresOpusVerification
    ? ['opus48', ...(profile.verifier || []).filter((id) => id !== 'opus48')]
    : (profile.verifier || []);
  const verifiers = resolve(verifierIds, 'final-verifier');
  const evidenceGatherers = policy.experts
    .filter((expert) => expert.tier === 'cheap')
    .map((expert) => candidate(expert, 'evidence', classification, availability, rejected))
    .filter(Boolean);

  // Record negative-mask evidence even when a cheap model is not named by the task profile.
  if (classification.riskClass === 'R2' || classification.riskClass === 'R3') {
    for (const expert of policy.experts.filter((entry) => entry.tier === 'cheap')) {
      rejected.push(rejection(expert, 'semantic-producer', 'cheap-semantic-work-forbidden-for-important-risk'));
      rejected.push(rejection(expert, 'final-verifier', 'cheap-final-verification-forbidden'));
    }
  }

  return deepFreeze({
    policyVersion: policy.version,
    seat: dispatchSpec(policy.seat),
    classification,
    producers: [...primary, ...availabilityFallbacks],
    primaryProducers: primary,
    availabilityFallbacks,
    qualityEscalations,
    verifiers,
    evidenceGatherers,
    rejected: dedupeRejections(rejected),
  });
}

/** Select the first available eligible route. Availability and quality paths remain distinct. */
export function routeTask(task = {}, opts = {}) {
  const classification = classifyTask(task);
  const plan = produceCandidatePlan(classification, opts);
  const availablePrimary = plan.primaryProducers.find((entry) => entry.available);
  const availableFallbacks = plan.availabilityFallbacks.filter((entry) => entry.available);
  const producer = availablePrimary || availableFallbacks[0] || null;
  const selection = availablePrimary ? 'primary' : 'availability-fallback';

  if (!producer || (classification.requiresFrontierProducer && producer.tier !== 'frontier')) {
    throw new NoEligibleFrontierError(
      `No eligible frontier producer for ${classification.riskClass}/${classification.taskType}; cheap fallback is forbidden.`,
      { riskClass: classification.riskClass, taskType: classification.taskType },
    );
  }

  let verifier = null;
  if (classification.requiresOpusVerification) {
    verifier = plan.verifiers.find((entry) => entry.id === 'opus48' && entry.available) || null;
    if (!verifier) {
      throw new NoEligibleFrontierError(
        'R3 requires available Opus verification; no downgrade or cheap verifier is permitted.',
        { riskClass: 'R3', requirement: 'Opus verification' },
      );
    }
  } else if (classification.requiresVerifier) {
    verifier = plan.verifiers.find((entry) => entry.available && entry.tier === 'frontier') || null;
    if (!verifier) {
      throw new NoEligibleFrontierError(
        `No eligible frontier verifier for ${classification.riskClass}/${classification.taskType}.`,
        { riskClass: classification.riskClass, taskType: classification.taskType },
      );
    }
  }

  return deepFreeze({
    policyVersion: plan.policyVersion,
    taskId: String(task.id || stableTaskId(classification)),
    selection,
    seat: plan.seat,
    classification,
    producer: { ...producer, dispatch: dispatchSpec(producer) },
    verifier: verifier ? { ...verifier, required: true, dispatch: dispatchSpec(verifier) } : null,
    evidenceGatherers: plan.evidenceGatherers
      .filter((entry) => entry.available)
      .map((entry) => ({ ...entry, dispatch: dispatchSpec(entry) })),
    availabilityFallbacks: availableFallbacks
      .filter((entry) => entry.id !== producer.id)
      .map((entry) => ({ ...entry, dispatch: dispatchSpec(entry) })),
    qualityEscalations: plan.qualityEscalations
      .filter((entry) => entry.available)
      .map((entry) => ({ ...entry, dispatch: dispatchSpec(entry) })),
    rejected: plan.rejected,
  });
}

/** Create, but do not persist, one telemetry/ledger row. */
export function createLedgerRow(route, observation = {}) {
  if (!route?.producer?.model || !route?.classification?.riskClass) {
    throw new TypeError('createLedgerRow requires a routeTask result');
  }
  if (!observation.timestamp) throw new TypeError('createLedgerRow requires an explicit timestamp');
  return deepFreeze({
    timestamp: String(observation.timestamp),
    policyVersion: route.policyVersion,
    taskId: route.taskId,
    taskType: route.classification.taskType,
    riskClass: route.classification.riskClass,
    agentId: route.producer.agentId,
    model: route.producer.model,
    verifierAgentId: route.verifier?.agentId || null,
    verifierModel: route.verifier?.model || null,
    routeKind: observation.routeKind || route.selection,
    outcome: observation.outcome || 'unknown',
    verifierPass: observation.verifierPass ?? null,
    latencyMs: finiteOrNull(observation.latencyMs),
    tokens: finiteOrNull(observation.tokens),
    retries: finiteOrZero(observation.retries),
  });
}

function inferTaskType(task, text, state) {
  if (state.security && state.implementation) return 'security-implementation';
  if (state.security) return 'security';
  if (state.governance) return 'governance';
  if (task.verification === true || VERIFICATION.test(text)) return 'verification';
  if (state.architecture) return 'architecture';
  if (task.longContext === true || Number(task.estimatedTokens) >= 120_000) return 'long-context';
  if (task.synthesis === true || SYNTHESIS.test(text)) return 'synthesis';
  if (task.research === true || RESEARCH.test(text)) return 'research';
  if (task.orchestration === true || ORCHESTRATION.test(text)) return 'orchestration';
  if (state.riskClass === 'R0' || task.breadth === true || BREADTH.test(text)) return 'breadth';
  if (state.implementation) return 'implementation';
  return 'general';
}

function isMechanicalReadOnly(task, text) {
  const readOnly = task.readOnly === true || task.mutation === false;
  const mechanical = task.mechanical === true || task.breadth === true || BREADTH.test(text);
  return readOnly && mechanical;
}

function candidate(expert, use, classification, availability, rejected) {
  const reason = maskReason(expert, use, classification);
  if (reason) {
    rejected.push(rejection(expert, use, reason));
    return null;
  }
  return deepFreeze({
    ...expert,
    use,
    allowedUses: allowedUses(expert, classification),
    available: availability[expert.model] !== false && availability[expert.id] !== false,
  });
}

function maskReason(expert, use, classification) {
  if (use === 'semantic-producer' && classification.riskClass === 'R3' && expert.id === 'opus48') {
    return 'opus-reserved-for-independent-r3-verification';
  }
  if (use === 'final-verifier' && expert.tier === 'cheap') return 'cheap-final-verification-forbidden';
  if (use === 'semantic-producer' && expert.tier === 'cheap' && classification.riskClass !== 'R0') {
    return 'cheap-semantic-work-forbidden-above-R0';
  }
  if (classification.riskClass === 'R3' && use === 'final-verifier' && expert.id !== 'opus48') {
    return 'R3-requires-Opus-verification';
  }
  return null;
}

function allowedUses(expert, classification) {
  if (expert.tier === 'cheap' && (classification.riskClass === 'R2' || classification.riskClass === 'R3')) {
    return ['evidence'];
  }
  if (expert.tier === 'cheap') return classification.riskClass === 'R0'
    ? ['evidence', 'semantic-producer']
    : ['evidence'];
  return ['evidence', 'semantic-producer', 'final-verifier'];
}

function dispatchSpec(source) {
  return deepFreeze({ agentId: source.agentId, model: source.model, thinking: source.thinking });
}

function rejection(expert, use, reason) {
  return { id: expert.id, agentId: expert.agentId, model: expert.model, tier: expert.tier, use, reason };
}

function dedupeRejections(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.id}:${entry.use}:${entry.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function validatePolicy(policy) {
  if (!policy?.version || !Array.isArray(policy.experts) || !policy.taskProfiles || !policy.seat) {
    throw new TypeError('invalid Sol MoE routing policy');
  }
  const ids = new Set(policy.experts.map((expert) => expert.id));
  if (!ids.has(policy.seat.expert) || policy.seat.model !== 'openai/gpt-5.6-sol') {
    throw new TypeError('policy seat must resolve to the Sol expert');
  }
}

function assertClassification(classification) {
  if (!classification || !/^R[0-3]$/.test(classification.riskClass) || !classification.taskType) {
    throw new TypeError('produceCandidatePlan requires classifyTask output');
  }
}

function stableTaskId(classification) {
  const seed = `${classification.riskClass}:${classification.taskType}:${classification.task.summary}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `route-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function finiteOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function finiteOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalizePath(value) {
  return String(value).replaceAll('\\\\', '/').replace(/^\.\//, '');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
