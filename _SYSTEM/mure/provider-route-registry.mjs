#!/usr/bin/env node
// @capability: provider-route-registry
// @serves: canonical model identity -> provider/surface/agent route mapping
// @does: validates provider routes and role topology without probing providers or mutating runtime state

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(HERE, '../config/provider-route-registry.json');

export const PROVIDER_ROUTE_REGISTRY = deepFreeze(
  JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')),
);

const ROUTE_STATUSES = new Set(['canary-proven', 'catalog-candidate', 'default-masked', 'blocked-schema', 'quota-blocked', 'unresolved', 'owner-excluded']);
const SURFACES = new Set(['omp-native', 'direct-api', 'ollama-cloud', 'cline-pass', 'cursor-cli', 'opencode']);

export function validateProviderRouteRegistry(registry = PROVIDER_ROUTE_REGISTRY) {
  if (registry?.schemaVersion !== 'yuri-provider-route-v1') {
    throw new TypeError('provider route registry schemaVersion is invalid');
  }
  if (!registry.modelIdentities || typeof registry.modelIdentities !== 'object') {
    throw new TypeError('provider route registry must define modelIdentities');
  }
  const routeIds = new Set();
  for (const [modelId, identity] of Object.entries(registry.modelIdentities)) {
    if (!identity?.role || !Array.isArray(identity.routes) || !identity.routes.length) {
      throw new TypeError(`model identity ${modelId} must define a role and routes`);
    }
    for (const route of identity.routes) {
      if (!route?.id || routeIds.has(route.id)) throw new TypeError(`duplicate or missing provider route id: ${route?.id || '<missing>'}`);
      routeIds.add(route.id);
      if (!route.provider || !SURFACES.has(route.surface) || !ROUTE_STATUSES.has(route.status)) {
        throw new TypeError(`provider route ${route.id} has invalid provider, surface, or status`);
      }
      if (route.status === 'unresolved') {
        if (route.model !== null || !route.blockedReason) throw new TypeError(`unresolved route ${route.id} must have null model and blockedReason`);
      } else if (!route.model || !route.agentId) {
        throw new TypeError(`provider route ${route.id} must have model and agentId`);
      }
      if (route.status === 'blocked-schema' && !route.blockedReason) {
        throw new TypeError(`blocked-schema route ${route.id} must have blockedReason`);
      }
      if (route.status === 'owner-excluded' && !route.blockedReason) {
        throw new TypeError(`owner-excluded route ${route.id} must have blockedReason`);
      }
      if (route.minimumBindingThinkingLevel !== undefined) {
        if (typeof route.minimumBindingThinkingLevel !== 'string' || !/^(off|low|medium|high|xhigh|max)$/.test(route.minimumBindingThinkingLevel)) {
          throw new TypeError(`provider route ${route.id} minimumBindingThinkingLevel must be a valid level (off/low/medium/high/xhigh/max)`);
        }
        if (route.status !== 'canary-proven') {
          throw new TypeError(`provider route ${route.id} minimumBindingThinkingLevel is only valid on canary-proven routes`);
        }
      }
      if (route.status === 'canary-proven') {
        const evidence = route.canaryEvidence;
        // Strict OMP evidence contract: require the full packet shape.
        if (!evidence || typeof evidence !== 'object') {
          throw new TypeError(`canary-proven route ${route.id} lacks canaryEvidence object`);
        }
        // Reject any legacy field — OMP-only contract.
        if ('runId' in evidence || 'childSessionKey' in evidence || 'resolvedModel' in evidence) {
          throw new TypeError(`canary-proven route ${route.id} carries legacy evidence fields (runId/childSessionKey/resolvedModel forbidden)`);
        }
        if (typeof evidence.jobId !== 'string' || !evidence.jobId) {
          throw new TypeError(`canary-proven route ${route.id} requires nonempty jobId`);
        }
        if (typeof evidence.ompSessionId !== 'string' || !evidence.ompSessionId) {
          throw new TypeError(`canary-proven route ${route.id} requires nonempty ompSessionId`);
        }
        if (evidence.model !== route.model) {
          throw new TypeError(`canary-proven route ${route.id} evidence.model must match route.model`);
        }
        if (evidence.agentId !== route.agentId) {
          throw new TypeError(`canary-proven route ${route.id} evidence.agentId must match route.agentId`);
        }
        if (evidence.taskResultStatus !== 'completed') {
          throw new TypeError(`canary-proven route ${route.id} requires taskResultStatus "completed"`);
        }
        if (typeof evidence.observed !== 'string' || !evidence.observed) {
          throw new TypeError(`canary-proven route ${route.id} requires nonempty observed date`);
        }
        // Calendar-valid UTC round-trip (match resolver's isValidObservedDate)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(evidence.observed)) {
          throw new TypeError(`canary-proven route ${route.id} observed date must be YYYY-MM-DD format`);
        }
        const d = new Date(`${evidence.observed}T00:00:00.000Z`);
        if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== evidence.observed) {
          throw new TypeError(`canary-proven route ${route.id} requires a calendar-valid observed date`);
        }
        const result = evidence.result;
        if (!result || typeof result !== 'object') {
          throw new TypeError(`canary-proven route ${route.id} requires result object`);
        }
        if (typeof result.canary !== 'string' || !result.canary) {
          throw new TypeError(`canary-proven route ${route.id} requires nonempty result.canary`);
        }
        if (typeof result.packageName !== 'string' || !result.packageName) {
          throw new TypeError(`canary-proven route ${route.id} requires nonempty result.packageName`);
        }
        if (result.status !== 'ok') {
          throw new TypeError(`canary-proven route ${route.id} requires result.status "ok"`);
        }
        // Transcript observation booleans
        if (evidence.transcriptReadObserved !== true || evidence.transcriptYieldObserved !== true) {
          throw new TypeError(`canary-proven route ${route.id} requires transcriptReadObserved and transcriptYieldObserved both true`);
        }
        // thinkingLevel: absent, null, or valid vocabulary value
        if (evidence.thinkingLevel !== null && evidence.thinkingLevel !== undefined) {
          if (typeof evidence.thinkingLevel !== 'string' || !/^(off|low|medium|high|xhigh|max)$/.test(evidence.thinkingLevel)) {
            throw new TypeError(`canary-proven route ${route.id} thinkingLevel must be null or a valid level (off/low/medium/high/xhigh/max)`);
          }
        }
        // Model-specific minimum binding level enforcement
        if (route.minimumBindingThinkingLevel) {
          const evidenceLevel = (evidence.thinkingLevel !== null && evidence.thinkingLevel !== undefined)
            ? evidence.thinkingLevel : 'off';
          const RANKS = { off: 0, low: 1, medium: 2, high: 3, xhigh: 4, max: 5 };
          if (RANKS[evidenceLevel] < RANKS[route.minimumBindingThinkingLevel]) {
            throw new TypeError(`canary-proven route ${route.id} evidence thinkingLevel "${evidenceLevel}" is below minimum binding "${route.minimumBindingThinkingLevel}"`);
          }
        }
      }
    }
  }
  validateRoleTopology(registry.roleTopology);
  if (!Array.isArray(registry.excludedModels)) {
    throw new TypeError('provider route registry must define excludedModels');
  }
  // Fable 5: promoted to canary-proven via the 2026-07-13-live exact-route canary.
  // The normal route is the executable path; the evidence-only bootstrap seam is
  // tombstoned. catalog-candidate remains a valid pre-admission state for OTHER
  // routes — Fable has advanced past it — so only Fable's own lifecycle is pinned.
  // (Admissible evidence is enforced generically for every canary-proven route in
  // the loop above, so this guard pins only the route-status lifecycle.)
  const fableRoutes = registry.modelIdentities['anthropic/claude-fable-5']?.routes || [];
  if (!fableRoutes.some((r) => r.status === 'canary-proven')) {
    throw new TypeError('provider route registry must carry a canary-proven Fable 5 route (promoted 2026-07-13 via the live exact-route canary)');
  }
  if (registry.excludedModels.some((e) => e.model === 'anthropic/claude-fable-5')) {
    throw new TypeError('Fable 5 must not be blanket-excluded; the normal route is canary-proven');
  }
  // Haiku 4.5: retired 2026-07-12 — owner-excluded AND listed in excludedModels so it can never resolve.
  const haikuRoutes = registry.modelIdentities['anthropic/claude-haiku-4-5']?.routes || [];
  if (!haikuRoutes.some((r) => r.status === 'owner-excluded')) {
    throw new TypeError('Haiku 4.5 must be owner-excluded (retired 2026-07-12)');
  }
  if (!registry.excludedModels.some((e) => e.model === 'anthropic/claude-haiku-4-5')) {
    throw new TypeError('Haiku 4.5 must be listed in excludedModels so it cannot resolve');
  }
  if (!registry.excludedModels.some((e) => e.model === 'openai/gpt-5.6-sol')) {
    throw new TypeError('provider route registry must explicitly exclude Sol (orchestrator seat, not a worker)');
  }
  return true;
}

export function listModelRoutes(modelId, options = {}) {
  const identity = PROVIDER_ROUTE_REGISTRY.modelIdentities[modelId];
  if (!identity) return [];
  const routes = identity.routes.filter((route) => options.includeUnresolved === true || route.status !== 'unresolved');
  if (options.surface) return routes.filter((route) => route.surface === options.surface);
  if (options.provider) return routes.filter((route) => route.provider === options.provider);
  return routes;
}

export function getNativeCanaryRoutes(modelId) {
  // The provider surface (direct API, Ollama, Cline, Cursor, or the OMP TaskTool route)
  // is distinct from the launch mechanism. A route is canary-eligible when its
  // exact model and configured agent binding exist; unresolved routes stay out.
  return listModelRoutes(modelId)
    .filter((route) => route.model && route.agentId
      && (route.status === 'canary-proven' || route.status === 'catalog-candidate'));
}

function validateRoleTopology(topology) {
  const required = ['orchestrator', 'advisor', 'architect', 'worker', 'verifier', 'strategic-peer'];
  for (const role of required) {
    const entry = topology?.[role];
    if (!entry) throw new TypeError(`role topology is missing ${role}`);
    if (role !== 'orchestrator' && !Array.isArray(entry.preferredModels)) {
      throw new TypeError(`${role} must define preferredModels`);
    }
    if (entry.maySpawn !== false && role !== 'orchestrator') {
      throw new TypeError(`${role} may not spawn children`);
    }
  }
  if (topology.orchestrator.owner !== 'sol' || topology.orchestrator.mayExecuteWorkerTasks !== false) {
    throw new TypeError('Sol must own orchestration and may not execute worker tasks');
  }
  if (topology.verifier.mustBeIndependent !== true) throw new TypeError('verifier independence is required');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

validateProviderRouteRegistry();

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: PROVIDER_ROUTE_REGISTRY.schemaVersion,
    deepseekFlash: listModelRoutes('deepseek-v4-flash', { includeUnresolved: true }),
    fableExcluded: PROVIDER_ROUTE_REGISTRY.excludedModels.some((entry) => entry.model === 'anthropic/claude-fable-5'),
  }, null, 2)}\n`);
}
