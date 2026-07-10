// @serves: shadow-only validation of the main-session Control archetype card
// @does: validates documentation bindings against the provider-neutral archetype contract
// @does-not: select routes, compile native spawns, or alter live dispatch

import { getArchetypeContract } from './archetype-contract.mjs';

const REQUIRED_FRONTMATTER = Object.freeze({
  name: 'mure-yuri',
  binding: 'main-session',
});

const REQUIRED_CONTROL_STATEMENTS = Object.freeze([
  'provider-neutral `control` archetype',
  'May issue a typed delegation ticket only after defining scope, expected outcome, constraints, evidence requirements, escalation rule, and WRITE SET.',
  'May not embed provider, model, agent ID, route, runtime, spawn, or tool-selection data in a delegation ticket.',
  'May not execute delegated worker work or verify its own producer output.',
  'Must keep the producer, verifier, lifecycle status, and final acceptance as distinct facts.',
]);

const LEGACY_RESULT_LABEL = 'XXNN_DESCRIPTION_(X|P|F)_PASS_<STATE>';

/**
 * Validate the documentation-only Control binding for the MURE main session.
 * Returns immutable deterministic diagnostics; never reads configuration or routes.
 */
export function validateControlArchetypeCard(source) {
  if (typeof source !== 'string') throw new TypeError('source must be a string');
  const errors = [];
  const frontmatter = parseFrontmatter(source);
  const contract = getArchetypeContract('control');

  for (const [key, expected] of Object.entries(REQUIRED_FRONTMATTER)) {
    if (frontmatter[key] !== expected) errors.push(`frontmatter.${key} must equal ${expected}`);
  }
  if (!contract.mayIssueTickets || contract.mayExecuteWork || contract.mayVerifyOwnOutput) {
    errors.push('control archetype contract is not delegation-only');
  }

  const section = sectionBody(source, '## Control archetype contract (shadow-only)');
  if (section === null) {
    errors.push('missing Control archetype contract section');
  } else {
    for (const statement of REQUIRED_CONTROL_STATEMENTS) {
      if (!section.includes(statement)) errors.push(`missing Control contract statement: ${statement}`);
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
