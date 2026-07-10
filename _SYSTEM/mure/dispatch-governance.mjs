// @serves: shadow-only dispatch governance gate for native MURE spawns
// @does: validates that every native dispatch respects archetype authority boundaries
//        before it is compiled or executed
// @does-not: select models, compile spawn payloads, execute spawns, or alter live routing

import { ARCHETYPES, getArchetypeContract } from './archetype-contract.mjs';

export const GOVERNANCE_SCHEMA_VERSION = 'mure-dispatch-governance-v1';

const ARCHETYPE_ROLE_MAP = Object.freeze({
  architect: new Set(['architect']),
  'strategic-peer': new Set(['advisor', 'deliberator']),
  'delegated-orchestrator': new Set(['helmsman', 'steward', 'helmsman-glm']),
  worker: new Set([
    'engineer', 'scout', 'artificer', 'chronicler', 'quartermaster', 'mechanic',
    'evolver', 'ideator', 'archivist', 'envoy', 'kernelsmith', 'sentinel',
    'synthesist', 'deepseek-flash', 'composer-fast',
  ]),
  verifier: new Set(['calibrator', 'oracle', 'adjudicator', 'sentinel']),
  control: new Set(['yuri']),
});

/**
 * Validate a dispatch intent against archetype governance rules.
 * Returns immutable diagnostics; never touches live state.
 */
export function validateDispatchGovernance(intent) {
  if (!intent || typeof intent !== 'object') throw new TypeError('intent must be an object');
  const errors = [];
  const purpose = nonEmpty(intent.purpose, 'intent.purpose');
  const fromArchetype = nonEmpty(intent.fromArchetype, 'intent.fromArchetype');
  const toArchetype = nonEmpty(intent.toArchetype, 'intent.toArchetype');
  const agentId = intent.agentId ? String(intent.agentId) : null;

  if (!ARCHETYPES.includes(fromArchetype)) errors.push(`unknown fromArchetype: ${fromArchetype}`);
  if (!ARCHETYPES.includes(toArchetype)) errors.push(`unknown toArchetype: ${toArchetype}`);

  if (errors.length === 0) {
    const fromContract = getArchetypeContract(fromArchetype);
    const toContract = getArchetypeContract(toArchetype);

    if (purpose === 'delegation') {
      if (!fromContract.mayIssueTickets) {
        errors.push(`${fromArchetype} may not issue delegation tickets`);
      }
      if (toContract.mayIssueTickets && fromArchetype !== 'control') {
        errors.push(`${fromArchetype} may not delegate to another orchestrator (${toArchetype})`);
      }
    }

    if (purpose === 'producer' || purpose === 'evidence' || purpose === 'availability-fallback') {
      if (!toContract.mayExecuteWork) {
        errors.push(`${toArchetype} may not execute producer work`);
      }
    }

    if (purpose === 'verifier') {
      if (intent.producerArchetype && intent.producerArchetype === toArchetype) {
        errors.push('verifier archetype must differ from producer archetype');
      }
      if (intent.producerAgentId && agentId && intent.producerAgentId === agentId) {
        errors.push('verifier agent must differ from producer agent');
      }
    }

    if (purpose === 'quality-escalation') {
      if (!fromContract.mayIssueTickets) {
        errors.push(`${fromArchetype} may not issue quality escalation`);
      }
    }
  }

  if (agentId && errors.length === 0) {
    const knownRoles = ARCHETYPE_ROLE_MAP[toArchetype];
    if (knownRoles && !knownRoles.has(agentId)) {
      errors.push(`agentId ${agentId} is not a recognized ${toArchetype} role`);
    }
  }

  return Object.freeze({
    schemaVersion: GOVERNANCE_SCHEMA_VERSION,
    purpose,
    fromArchetype,
    toArchetype,
    agentId,
    ok: errors.length === 0,
    errors: Object.freeze(errors),
  });
}

/**
 * Derive the archetype for a given agentId using the role map.
 * Returns null for unmapped agents.
 */
export function deriveArchetypeForAgent(agentId) {
  const id = String(agentId || '').toLowerCase().trim();
  for (const [archetype, roles] of Object.entries(ARCHETYPE_ROLE_MAP)) {
    if (roles.has(id)) return archetype;
  }
  return null;
}

function nonEmpty(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} is required`);
  return text;
}
