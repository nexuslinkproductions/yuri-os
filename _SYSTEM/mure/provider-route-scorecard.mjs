// @serves: deterministic shadow scoring of native provider-route observations
// @does: validates OMP-evidenced route observations {jobId,agent,observedModel} against
// @does:   route-owned {model,agentId} and derives comparable evidence/eligibility summaries
// @does-not: select models, alter route status, compile spawns, or influence live routing

import { PROVIDER_ROUTE_REGISTRY } from './provider-route-registry.mjs';
import { validateOmpJobId } from './omp-task-adapter.mjs';

export const PROVIDER_ROUTE_SCORECARD_SCHEMA_VERSION = 'mure-provider-route-scorecard-v2';
export const PROVIDER_ROUTE_TRIAL_LEDGER_SCHEMA_VERSION = 'mure-provider-route-trial-ledger-v2';

const TERMINAL_RESULTS = new Set(['completed', 'rejected', 'lost', 'blocked']);
const VERDICTS = new Set(['pass', 'reject', 'not-required', 'not-run']);
// Legacy native-completion identity fields are rejected categorically: OMP evidence is
// {jobId,agent} (spawn receipt / task result) plus the transcript's model_change.model.
const LEGACY_OBSERVATION_FIELDS = ['runId', 'childSessionKey', 'resolvedModel'];
const FAILURE_CLASSES = new Set([
  'none', 'auth', 'quota', 'timeout', 'request-schema', 'model-identifier',
  'transport', 'evidence-mismatch', 'verifier-rejection', 'unknown',
]);

export function createProviderRouteScorecard(observations = []) {
  if (!Array.isArray(observations)) throw new TypeError('observations must be an array');
  const normalized = observations.map(normalizeObservation);
  const routeIds = new Set(normalized.map((entry) => entry.routeId));
  if (routeIds.size !== normalized.length) throw new TypeError('scorecard permits one observation per routeId');
  return deepFreeze({
    schemaVersion: PROVIDER_ROUTE_SCORECARD_SCHEMA_VERSION,
    observations: normalized,
  });
}

export function summarizeProviderRouteScorecard(scorecard) {
  requireScorecard(scorecard);
  const routes = scorecard.observations.map((entry) => deepFreeze({
    routeId: entry.routeId,
    provider: entry.provider,
    model: entry.model,
    result: entry.result,
    failureClass: entry.failureClass,
    verifierVerdict: entry.verifierVerdict,
    evidenceAccurate: entry.evidenceAccurate,
    eligibleForDeterministicRouting: isEligible(entry),
    latencyMs: entry.latencyMs,
  }));
  return deepFreeze({
    schemaVersion: PROVIDER_ROUTE_SCORECARD_SCHEMA_VERSION,
    observedRoutes: routes.length,
    eligibleRoutes: routes.filter((entry) => entry.eligibleForDeterministicRouting).length,
    routes,
  });
}

/** Preserve repeated route trials without allowing the same OMP completion to be counted twice. */
export function createProviderRouteTrialLedger(observations = []) {
  if (!Array.isArray(observations)) throw new TypeError('observations must be an array');
  const normalized = observations.map(normalizeObservation);
  const eventKeys = new Set();
  for (const entry of normalized) {
    // Dedup on jobId alone unless the observation also grounds a deterministic taskId;
    // when present, taskId narrows the identity instead of being synthesized here.
    const key = entry.taskId ? `${entry.jobId}\u0000${entry.taskId}` : entry.jobId;
    if (eventKeys.has(key)) throw new TypeError('trial ledger rejects duplicate OMP completion identity');
    eventKeys.add(key);
  }
  return deepFreeze({
    schemaVersion: PROVIDER_ROUTE_TRIAL_LEDGER_SCHEMA_VERSION,
    observations: normalized,
  });
}

/** Append one normalized trial immutably; replayed OMP completion identities fail closed. */
export function appendProviderRouteTrial(ledger, observation) {
  requireTrialLedger(ledger);
  return createProviderRouteTrialLedger([...ledger.observations, observation]);
}

/** Derive deterministic, non-steering reliability summaries from repeated trials. */
export function summarizeProviderRouteTrialLedger(ledger) {
  requireTrialLedger(ledger);
  const grouped = new Map();
  for (const entry of ledger.observations) {
    if (!grouped.has(entry.routeId)) grouped.set(entry.routeId, []);
    grouped.get(entry.routeId).push(entry);
  }
  const routes = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([routeId, trials]) => {
    const completed = trials.filter((entry) => entry.result === 'completed');
    const eligible = trials.filter(isEligible);
    const latencies = completed.map((entry) => entry.latencyMs).filter((value) => value !== null).sort((a, b) => a - b);
    const failureClasses = Object.create(null);
    for (const entry of trials) {
      if (entry.failureClass !== 'none') failureClasses[entry.failureClass] = (failureClasses[entry.failureClass] || 0) + 1;
    }
    return deepFreeze({
      routeId,
      provider: trials[0].provider,
      model: trials[0].model,
      trials: trials.length,
      completed: completed.length,
      eligible: eligible.length,
      completionRate: ratio(completed.length, trials.length),
      verifiedEligibilityRate: ratio(eligible.length, trials.length),
      medianCompletedLatencyMs: median(latencies),
      failureClasses: deepFreeze(Object.fromEntries(Object.entries(failureClasses).sort(([a], [b]) => a.localeCompare(b)))),
    });
  });
  return deepFreeze({
    schemaVersion: PROVIDER_ROUTE_TRIAL_LEDGER_SCHEMA_VERSION,
    totalTrials: ledger.observations.length,
    observedRoutes: routes.length,
    routes,
  });
}

function normalizeObservation(input) {
  requirePlainObject(input, 'observation');
  for (const legacyField of LEGACY_OBSERVATION_FIELDS) {
    if (legacyField in input) {
      throw new TypeError(`observation must not use legacy field '${legacyField}'; OMP evidence requires jobId/agent/observedModel`);
    }
  }
  const route = findRoute(nonEmpty(input.routeId, 'observation.routeId'));
  if (!route) throw new TypeError(`unknown provider route: ${input.routeId}`);
  const result = enumValue(input.result, TERMINAL_RESULTS, 'observation.result');
  const verifierVerdict = enumValue(input.verifierVerdict, VERDICTS, 'observation.verifierVerdict');
  const failureClass = enumValue(input.failureClass, FAILURE_CLASSES, 'observation.failureClass');
  const evidenceAccurate = requireBoolean(input.evidenceAccurate, 'observation.evidenceAccurate');
  const latencyMs = input.latencyMs === null ? null : nonNegativeNumber(input.latencyMs, 'observation.latencyMs');
  const jobId = nonEmpty(input.jobId, 'observation.jobId');
  if (!validateOmpJobId(jobId)) throw new TypeError(`observation.jobId is malformed: ${jobId}`);
  const agent = nonEmpty(input.agent, 'observation.agent');
  const observedModel = input.observedModel === null ? null : nonEmpty(input.observedModel, 'observation.observedModel');
  // taskId is optional: only carried when the caller grounds a deterministic task identity
  // (e.g. omp-task-adapter's deterministicOmpTaskId); absent otherwise, never synthesized here.
  const taskId = input.taskId === undefined || input.taskId === null ? null : nonEmpty(input.taskId, 'observation.taskId');

  if (result === 'completed' && observedModel !== route.model) {
    throw new TypeError(`completed route ${route.id} requires exact transcript model match`);
  }
  if (result === 'completed' && agent !== route.agentId) {
    throw new TypeError(`completed route ${route.id} requires exact agent card match`);
  }
  if (result === 'completed' && failureClass !== 'none') {
    throw new TypeError('completed observation must use failureClass none');
  }
  if (result !== 'completed' && failureClass === 'none') {
    throw new TypeError('non-completed observation requires a failureClass');
  }
  if (verifierVerdict === 'pass' && (!evidenceAccurate || result !== 'completed')) {
    throw new TypeError('verifier pass requires completed output with accurate evidence');
  }
  if (route.status === 'unresolved' && result === 'completed') {
    throw new TypeError('unresolved route may not claim completion');
  }

  return deepFreeze({
    routeId: route.id,
    provider: route.provider,
    surface: route.surface,
    model: route.model,
    agentId: route.agentId ?? null,
    jobId,
    agent,
    observedModel,
    taskId,
    result,
    latencyMs,
    evidenceAccurate,
    verifierVerdict,
    failureClass,
    observed: nonEmpty(input.observed, 'observation.observed'),
  });
}

function isEligible(entry) {
  return entry.result === 'completed'
    && entry.observedModel === entry.model
    && entry.agent === entry.agentId
    && entry.evidenceAccurate
    && (entry.verifierVerdict === 'pass' || entry.verifierVerdict === 'not-required')
    && entry.failureClass === 'none';
}

function findRoute(routeId) {
  for (const identity of Object.values(PROVIDER_ROUTE_REGISTRY.modelIdentities)) {
    const route = identity.routes.find((candidate) => candidate.id === routeId);
    if (route) return route;
  }
  return null;
}

function requireScorecard(value) {
  requirePlainObject(value, 'scorecard');
  if (value.schemaVersion !== PROVIDER_ROUTE_SCORECARD_SCHEMA_VERSION || !Array.isArray(value.observations)) {
    throw new TypeError('invalid provider route scorecard');
  }
}

function requireTrialLedger(value) {
  requirePlainObject(value, 'trial ledger');
  if (value.schemaVersion !== PROVIDER_ROUTE_TRIAL_LEDGER_SCHEMA_VERSION || !Array.isArray(value.observations)) {
    throw new TypeError('invalid provider route trial ledger');
  }
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function median(values) {
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function enumValue(value, allowed, label) {
  const normalized = nonEmpty(value, label);
  if (!allowed.has(normalized)) throw new TypeError(`${label} is unsupported: ${normalized}`);
  return normalized;
}

function nonEmpty(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
  return value;
}

function nonNegativeNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new TypeError(`${label} must be a non-negative number or null`);
  return value;
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
