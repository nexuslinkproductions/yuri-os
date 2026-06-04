#!/usr/bin/env node
/**
 * mechanism-pattern-registry.mjs — closed-set validator for the v0 mechanism-pattern verb taxonomy.
 *
 * The 5 verbs are the propagation "fuel map" (roadmap §5). This module is the ONE source of truth
 * for the verb set: the node-field validator (MATH-02) and the future propagation-scan import
 * MECHANISM_PATTERN_VERBS from here so a verb can never be self-minted in two places.
 *
 * Fail-closed by contract: an unknown verb, a verb with <2 witnesses, or a witness that is not
 * path:line-shaped is rejected — exactly as the proof-gate refuses self-mint of formula cards.
 *
 * CLI: node _SYSTEM/Scripts/math/mechanism-pattern-registry.mjs  (validates the registry file;
 * process.exitCode=1 on failure). Modeled on math-proof-gate.mjs CLI tail + math-adapters.mjs
 * closed-set/require idiom.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..'); // Scripts/math/ → Scripts/ → _SYSTEM/ → repo root
const REGISTRY_PATH = path.join(REPO_ROOT, '_SYSTEM', 'data', 'math', 'mechanism-pattern-registry.json');

/** The closed v0 enum. Frozen Set — the single shared source of truth for verb identity. */
export const MECHANISM_PATTERN_VERBS = Object.freeze(
  new Set([
    'replace-hand-tuned-constant',
    'read-lower-bound-not-point',
    'gate-on-identity-not-aggregate',
    'shared-prerequisite-unlock',
    'compose-readonly-analyzer',
  ]),
);

/** Minimum witnesses for a verb to be admissible (the new-verb threshold). */
export const MIN_WITNESSES = 2;

const ALLOWED_SCHEMAS = new Set(['yuri.mechanism-pattern-registry.v0']);
const ALLOWED_PROMOTION_STATES = new Set([
  'research',
  'verified-baseline',
  'stable',
  'quarantined',
  'fixture',
]);

// A witness is "<path>:<line>": a non-colon, non-whitespace-bordered path segment, a single colon,
// a 1+ digit line. Rejects bare paths, bare numbers, ranges (12-20), double-colon noise, and
// leading/trailing whitespace (a space-padded path reads "well-formed" but never resolves via grep).
const WITNESS_RE = /^(?!\s)[^:\s][^:]*?(?<!\s):[0-9]+$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Validate a mechanism-pattern registry object.
 * Fail-closed: returns { ok:false, ... } on any structural or closed-set violation.
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function validateMechanismPatternRegistry(registry) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(registry)) {
    return { ok: false, errors: ['registry must be an object'], warnings };
  }

  if (!ALLOWED_SCHEMAS.has(registry.schema)) {
    errors.push(`unsupported schema: ${registry.schema || '(missing)'}`);
  }
  if (!isNonEmptyString(registry.id)) errors.push('id is required');
  if (!isNonEmptyString(registry.version)) {
    errors.push('version is required');
  } else if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(registry.version)) {
    errors.push(`version must be semver-shaped: ${registry.version}`);
  }
  if (!ALLOWED_PROMOTION_STATES.has(registry.promotionStatus)) {
    errors.push(`promotionStatus must be one of: ${[...ALLOWED_PROMOTION_STATES].join(', ')}`);
  }
  if (typeof registry.advisoryOnly !== 'boolean') {
    errors.push('advisoryOnly must be a boolean');
  }

  if (!Array.isArray(registry.verbs) || registry.verbs.length === 0) {
    errors.push('verbs must be a non-empty array');
    return { ok: errors.length === 0, errors, warnings };
  }

  const seen = new Set();
  for (let i = 0; i < registry.verbs.length; i += 1) {
    const entry = registry.verbs[i];
    const tag = isPlainObject(entry) && isNonEmptyString(entry.verb) ? entry.verb : `index ${i}`;

    if (!isPlainObject(entry)) {
      errors.push(`verb ${tag}: each verb entry must be an object`);
      continue;
    }

    // Closed-set gate — unknown verb is rejected outright (no self-mint).
    if (!isNonEmptyString(entry.verb)) {
      errors.push(`verb ${tag}: verb name is required`);
    } else if (!MECHANISM_PATTERN_VERBS.has(entry.verb)) {
      errors.push(`verb ${entry.verb}: not in the closed v0 set (a new verb requires owner promotion)`);
    } else if (seen.has(entry.verb)) {
      errors.push(`verb ${entry.verb}: duplicate verb entry`);
    } else {
      seen.add(entry.verb);
    }

    if (!isNonEmptyString(entry.definition)) errors.push(`verb ${tag}: definition is required`);
    if (!isNonEmptyString(entry.rippleClass)) errors.push(`verb ${tag}: rippleClass is required`);
    if (!isNonEmptyString(entry.guardRequirement)) errors.push(`verb ${tag}: guardRequirement is required`);
    if (!isNonEmptyString(entry.cascadeFamily)) errors.push(`verb ${tag}: cascadeFamily is required`);

    // Witness gate — >=2, each path:line-shaped.
    if (!Array.isArray(entry.witnesses)) {
      errors.push(`verb ${tag}: witnesses must be an array`);
    } else {
      if (entry.witnesses.length < MIN_WITNESSES) {
        errors.push(`verb ${tag}: needs >=${MIN_WITNESSES} witnesses, found ${entry.witnesses.length}`);
      }
      for (const witness of entry.witnesses) {
        if (typeof witness !== 'string' || !WITNESS_RE.test(witness)) {
          errors.push(`verb ${tag}: malformed witness (expected path:line): ${JSON.stringify(witness)}`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Load + validate the on-disk registry file. */
export function validateRegistryFile(registryPath = REGISTRY_PATH) {
  let raw;
  try {
    raw = readFileSync(registryPath, 'utf8');
  } catch (err) {
    return { ok: false, errors: [`cannot read registry: ${err.message}`], warnings: [], verbCount: 0 };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, errors: [`registry is not valid JSON: ${err.message}`], warnings: [], verbCount: 0 };
  }
  const result = validateMechanismPatternRegistry(parsed);
  return {
    ...result,
    verbCount: Array.isArray(parsed?.verbs) ? parsed.verbs.length : 0,
  };
}

function isCliEntrypoint() {
  return path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
}

if (isCliEntrypoint()) {
  const result = validateRegistryFile();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
