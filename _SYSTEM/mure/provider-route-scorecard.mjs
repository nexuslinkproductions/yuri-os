// @serves: deterministic shadow scoring of native provider-route observations
// @does: validates route observations and derives comparable evidence/eligibility summaries
// @does-not: select models, alter route status, compile spawns, or influence live routing

import { PROVIDER_ROUTE_REGISTRY } from './provider-route-registry.mjs';

export const PROVIDER_ROUTE_SCORECARD_SCHEMA_VERSION = 'mure-provider-route-scorecard-v1';
export const PROVIDER_ROUTE_TRIAL_LEDGER_SCHEMA_VERSION = 'mure-provider-route-trial-ledger-v1';

const TERMINAL_RESULTS = new Set(['completed', 'rejected', 'lost', 'blocked']);
const VERDICTS = new Set(['pass', 'reject', 'not-required', 'not-run']);
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

/** Preserve repeated route trials without allowing the same native event to be counted twice. */
export function createProviderRouteTrialLedger(observations = []) {
  if (!Array.isArray(observations)) throw new TypeError('observations must be an array');
  const normalized = observations.map(normalizeObservation);
  const eventKeys = new Set();
  for (const entry of normalized) {
    const key = `${entry.runId}\u0000${entry.childSessionKey}`;
    if (eventKeys.has(key)) throw new TypeError('trial ledger rejects duplicate native completion identity');
    eventKeys.add(key);
  }
  return deepFreeze({
    schemaVersion: PROVIDER_ROUTE_TRIAL_LEDGER_SCHEMA_VERSION,
    observations: normalized,
  });
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
  const route = findRoute(nonEmpty(input.routeId, 'observation.routeId'));
  if (!route) throw new TypeError(`unknown provider route: ${input.routeId}`);
  const result = enumValue(input.result, TERMINAL_RESULTS, 'observation.result');
  const verifierVerdict = enumValue(input.verifierVerdict, VERDICTS, 'observation.verifierVerdict');
  const failureClass = enumValue(input.failureClass, FAILURE_CLASSES, 'observation.failureClass');
  const evidenceAccurate = requireBoolean(input.evidenceAccurate, 'observation.evidenceAccurate');
  const latencyMs = input.latencyMs === null ? null : nonNegativeNumber(input.latencyMs, 'observation.latencyMs');
  const runId = nonEmpty(input.runId, 'observation.runId');
  const childSessionKey = nonEmpty(input.childSessionKey, 'observation.childSessionKey');
  const resolvedModel = input.resolvedModel === null ? null : nonEmpty(input.resolvedModel, 'observation.resolvedModel');

  if (result === 'completed' && resolvedModel !== route.model) {
    throw new TypeError(`completed route ${route.id} requires exact resolvedModel`);
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
    runId,
    childSessionKey,
    resolvedModel,
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
    && entry.resolvedModel === entry.model
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
