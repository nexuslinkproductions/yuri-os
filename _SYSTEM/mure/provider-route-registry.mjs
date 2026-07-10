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

const ROUTE_STATUSES = new Set(['canary-proven', 'catalog-candidate', 'default-masked', 'blocked-schema', 'unresolved']);
const SURFACES = new Set(['openclaw-native', 'direct-api', 'ollama-cloud', 'cline-pass', 'cursor-cli', 'opencode']);

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
      if (route.status === 'canary-proven') {
        const evidence = route.canaryEvidence;
        if (!evidence?.runId || !evidence?.childSessionKey || evidence?.result !== 'completed') {
          throw new TypeError(`canary-proven route ${route.id} requires exact completed native evidence`);
        }
      }
    }
  }
  validateRoleTopology(registry.roleTopology);
  if (!Array.isArray(registry.excludedModels) || !registry.excludedModels.some((entry) => entry.model === 'anthropic/claude-fable-5')) {
    throw new TypeError('provider route registry must explicitly exclude Fable 5');
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
  // The provider surface (direct API, Ollama, Cline, Cursor, or native OpenClaw)
  // is distinct from the launch mechanism. A route is canary-eligible when its
  // exact model and configured agent binding exist; unresolved routes stay out.
  return listModelRoutes(modelId)
    .filter((route) => route.model && route.agentId
      && (route.status === 'canary-proven' || route.status === 'catalog-candidate'));
}

function validateRoleTopology(topology) {
  const required = ['orchestrator', 'advisor', 'architect', 'worker', 'verifier'];
  for (const role of required) {
    const entry = topology?.[role];
    if (!entry || !Array.isArray(entry.preferredModels) && role !== 'orchestrator') {
      throw new TypeError(`role topology is missing ${role}`);
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
