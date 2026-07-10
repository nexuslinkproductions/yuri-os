// @serves: shadow-only validation of provider-neutral MURE archetype cards
// @does: validates documentation bindings against the provider-neutral archetype contract
// @does-not: select routes, compile native spawns, or alter live dispatch

import { getArchetypeContract } from './archetype-contract.mjs';

const CARD_SPECS = Object.freeze({
  control: Object.freeze({
    title: 'Control',
    frontmatter: Object.freeze({ name: 'mure-yuri', binding: 'main-session' }),
    capabilities: Object.freeze({ mayIssueTickets: true, mayExecuteWork: false, mayVerifyOwnOutput: false }),
    statements: Object.freeze([
      'provider-neutral `control` archetype',
      'May issue a typed delegation ticket only after defining scope, expected outcome, constraints, evidence requirements, escalation rule, and WRITE SET.',
      'May not embed provider, model, agent ID, route, runtime, spawn, or tool-selection data in a delegation ticket.',
      'May not execute delegated worker work or verify its own producer output.',
      'Must keep the producer, verifier, lifecycle status, and final acceptance as distinct facts.',
    ]),
  }),
  architect: Object.freeze({
    title: 'Architect',
    frontmatter: Object.freeze({ name: 'mure-architect' }),
    capabilities: Object.freeze({ mayIssueTickets: false, mayExecuteWork: false, mayVerifyOwnOutput: false }),
    statements: Object.freeze([
      'provider-neutral `architect` archetype',
      'May not issue delegation tickets, execute delegated worker work, or verify producer output.',
      'Must return decomposition, interfaces, constraints, assumptions, risks, and evidence requirements to Control.',
      'Must compose existing capabilities before proposing new machinery.',
      'Must not embed provider, model, agent ID, runtime, or spawn choices in the architecture contract.',
      'Control retains dispatch and final acceptance authority.',
    ]),
  }),
  'strategic-peer': Object.freeze({
    title: 'Strategic Peer',
    frontmatter: Object.freeze({ name: 'mure-advisor' }),
    capabilities: Object.freeze({ mayIssueTickets: false, mayExecuteWork: false, mayVerifyOwnOutput: false }),
    statements: Object.freeze([
      'provider-neutral `strategic-peer` archetype',
      'May challenge assumptions, identify contradictions, compare options, and annotate risk at planning or commitment boundaries.',
      'May not issue delegation tickets, execute delegated worker work, spawn children, verify producer output, or accept the result.',
      'Must separate evidence-backed findings from advisory judgment and name unresolved uncertainty.',
      'Must not embed provider, model, agent ID, runtime, or spawn choices in the advisory contract.',
      'Control retains dispatch, verification, escalation, and final acceptance authority.',
    ]),
  }),
  'delegated-orchestrator': Object.freeze({
    title: 'Delegated Orchestrator',
    frontmatter: Object.freeze({ name: 'mure-helmsman' }),
    capabilities: Object.freeze({ mayIssueTickets: true, mayExecuteWork: false, mayVerifyOwnOutput: false }),
    statements: Object.freeze([
      'provider-neutral `delegated-orchestrator` archetype',
      'May issue typed delegation tickets only within the goal, scope, budget, child limit, and escalation boundary delegated by Control.',
      'May not execute delegated worker work, verify its own producer output, widen the goal, or accept the final result.',
      'Must preserve ticket, producer, verifier, lifecycle status, and evidence provenance as distinct facts.',
      'Must stop and return to Control when the delegated boundary is exhausted, ambiguous, owner-gated, or unavailable.',
      'Control retains the parent goal spine, provider-route authority, and final acceptance authority.',
    ]),
  }),
  worker: Object.freeze({
    title: 'Worker',
    frontmatter: Object.freeze({ name: 'mure-engineer' }),
    capabilities: Object.freeze({ mayIssueTickets: false, mayExecuteWork: true, mayVerifyOwnOutput: false }),
    statements: Object.freeze([
      'provider-neutral `worker` archetype',
      'May execute one bounded, self-contained leaf within the issued ticket scope and WRITE SET.',
      'May not issue delegation tickets, spawn peers, expand scope, verify its own producer output, or accept the result.',
      "Must return deterministic evidence matching the ticket's evidence requirements.",
      'Must report warnings, incomplete checks, and any unexpected mutation before returning.',
      'Control retains retry, escalation, and final acceptance authority.',
    ]),
  }),
  verifier: Object.freeze({
    title: 'Verifier',
    frontmatter: Object.freeze({ name: 'mure-adjudicator' }),
    capabilities: Object.freeze({ mayIssueTickets: false, mayExecuteWork: false, mayVerifyOwnOutput: false }),
    statements: Object.freeze([
      'provider-neutral `verifier` archetype',
      'Must be downstream from and independent of the producer; a producer may not verify itself.',
      'May not issue delegation tickets, execute the delegated fix, or accept the result.',
      'Must report both what was checked and what was not checked.',
      'Must return `pass`, `fail` with a failure reason, or `not-checked` with an unchecked reason.',
      'Control retains retry, escalation, and final acceptance authority.',
    ]),
  }),
});

const LEGACY_RESULT_LABEL = 'XXNN_DESCRIPTION_(X|P|F)_PASS_<STATE>';

/**
 * Validate the documentation-only Control binding for the MURE main session.
 * Returns immutable deterministic diagnostics; never reads configuration or routes.
 */
export function validateControlArchetypeCard(source) {
  return validateArchetypeCard(source, 'control');
}

export function validateArchitectArchetypeCard(source) {
  return validateArchetypeCard(source, 'architect');
}

export function validateStrategicPeerArchetypeCard(source) {
  return validateArchetypeCard(source, 'strategic-peer');
}

export function validateDelegatedOrchestratorArchetypeCard(source) {
  return validateArchetypeCard(source, 'delegated-orchestrator');
}

export function validateWorkerArchetypeCard(source) {
  return validateArchetypeCard(source, 'worker');
}

export function validateVerifierArchetypeCard(source) {
  return validateArchetypeCard(source, 'verifier');
}

function validateArchetypeCard(source, archetype) {
  if (typeof source !== 'string') throw new TypeError('source must be a string');
  const errors = [];
  const frontmatter = parseFrontmatter(source);
  const spec = CARD_SPECS[archetype];
  const contract = getArchetypeContract(archetype);

  for (const [key, expected] of Object.entries(spec.frontmatter)) {
    if (frontmatter[key] !== expected) errors.push(`frontmatter.${key} must equal ${expected}`);
  }
  for (const [capability, expected] of Object.entries(spec.capabilities)) {
    if (contract[capability] !== expected) {
      errors.push(`${archetype} archetype capability mismatch: ${capability}`);
    }
  }

  const section = sectionBody(source, `## ${spec.title} archetype contract (shadow-only)`);
  if (section === null) {
    errors.push(`missing ${spec.title} archetype contract section`);
  } else {
    for (const statement of spec.statements) {
      if (!section.includes(statement)) errors.push(`missing ${spec.title} contract statement: ${statement}`);
    }
  }
  if (source.includes(LEGACY_RESULT_LABEL)) errors.push('contains legacy RESULT_LABEL grammar');
  if (!source.includes('NNXX_DESCRIPTION_(X|P|F)_PASS_COMMITTED')) {
    errors.push('missing canonical RESULT_LABEL grammar');
  }

  return Object.freeze({
    schemaVersion: 'mure-archetype-card-v1',
    archetype: contract.id,
    ok: errors.length === 0,
    errors: Object.freeze(errors),
  });
}

function parseFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return Object.freeze({});
  const fields = {};
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/);
    if (field) fields[field[1]] = field[2].replace(/^"|"$/g, '');
  }
  return Object.freeze(fields);
}

function sectionBody(source, heading) {
  const start = source.indexOf(heading);
  if (start === -1) return null;
  const afterHeading = start + heading.length;
  const nextHeading = source.indexOf('\n## ', afterHeading);
  return source.slice(afterHeading, nextHeading === -1 ? source.length : nextHeading);
}
