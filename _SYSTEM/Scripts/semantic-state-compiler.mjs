#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { readFileSync } from 'node:fs';

const PROTECTED_PATHS = Object.freeze([
  'backend/data/',
  '.claude/state/',
  '.claude/history/',
  '.claude/file-history/',
  '.claude/projects/',
  '.env',
  'node_modules/',
  '.amp/',
]);

export const CANONICAL_ENERGY_FIELDS = Object.freeze([
  'claimPromotionDistribution',
  'claimedDistribution',
  'verifiedDistribution',
  'priorState',
  'posteriorState',
  'predictions',
  'outcomes',
  'forecasts',
  'results',
  'protectedPathViolations',
  'promotionLadderInversions',
  'maxLadderInversion',
  'verifiedEvidenceCount',
  'evidence',
]);

export const DERIVED_METRIC_FIELDS = Object.freeze([
  'U',
  'u',
  'uBefore',
  'uAfter',
  'deltaU',
  'energy',
  'energyDelta',
  'energy_delta',
  'energy_delta_estimate',
  'energyEstimate',
  'entropy',
  'kl',
  'klDivergence',
  'wasserstein',
  'overconfidenceDrift',
  'logLoss',
  'brier',
  'brierScore',
  'informationGain',
  'staleness',
  'stalenessIndex',
  'staleness_index',
  'risk',
  'riskScore',
  'risk_score',
  'dominantTerm',
  'componentDeltas',
  'lyapunovProperty',
]);

const CANONICAL_SET = new Set(CANONICAL_ENERGY_FIELDS);
const DERIVED_SET = new Set(DERIVED_METRIC_FIELDS);
const DISTRIBUTION_FIELDS = new Set([
  'claimPromotionDistribution',
  'claimedDistribution',
  'verifiedDistribution',
  'priorState',
  'posteriorState',
]);
const PROBABILITY_VECTOR_FIELDS = new Set([
  'predictions',
  'outcomes',
  'forecasts',
  'results',
]);
const NON_NEGATIVE_COUNT_FIELDS = new Set([
  'protectedPathViolations',
  'promotionLadderInversions',
  'maxLadderInversion',
  'verifiedEvidenceCount',
]);
const EXECUTABLE_CONTAINER_KEYS = Object.freeze([
  'state',
  'executableState',
  'compiledState',
  'stateBefore',
  'stateAfter',
  'before',
  'after',
]);

export function compileSemanticStatePacket(packet = {}, options = {}) {
  const input = normalizePacket(packet);
  const protectedHit = findProtectedPath(input);
  if (protectedHit) {
    return compilerEnvelope({
      status: 'rejected',
      reason: `protected path reference refused: ${protectedHit.path}`,
      rejectedFields: [{ path: protectedHit.pointer, field: protectedHit.path, reason: 'protected_path' }],
      advisoryFields: [],
      compiled: {},
      options,
    });
  }

  const mutationHit = findMutationAttempt(input);
  if (mutationHit) {
    return compilerEnvelope({
      status: 'rejected',
      reason: `mutation attempt refused in read-only compiler: ${mutationHit.pointer}`,
      rejectedFields: [{ path: mutationHit.pointer, field: mutationHit.key, reason: 'mutation_not_allowed' }],
      advisoryFields: [],
      compiled: {},
      options,
    });
  }

  const sources = collectExecutableSources(input);
  if (sources.length === 0) {
    return compilerEnvelope({
      status: 'unprovable',
      reason: 'no executable state object found',
      rejectedFields: [],
      advisoryFields: collectLaneClaimFields(input),
      compiled: {},
      options,
    });
  }

  const rejectedFields = [];
  const advisoryFields = [
    ...collectLaneClaimFields(input),
    ...collectWrapperAdvisoryFields(input, sources),
  ];
  const compiled = {};
  let canonicalFieldCount = 0;

  for (const source of sources) {
    const result = compileExecutableState(source.value, source.pointer);
    compiled[source.name] = result.compiledState;
    canonicalFieldCount += result.canonicalFieldCount;
    rejectedFields.push(...result.rejectedFields);
    advisoryFields.push(...result.advisoryFields);
  }

  if (rejectedFields.length > 0) {
    const hasDerivedMetricSmuggling = rejectedFields.some((field) => field.reason === 'derived_metric_smuggling');
    const hasTypeMismatch = rejectedFields.some((field) => field.reason === 'canonical_type_mismatch');
    return compilerEnvelope({
      status: 'rejected',
      reason: hasDerivedMetricSmuggling
        ? 'derived metric fields cannot be used as executable energy inputs'
        : hasTypeMismatch
          ? 'canonical energy fields failed executable type validation'
          : 'state packet failed executable compiler validation',
      rejectedFields,
      advisoryFields,
      compiled,
      options,
    });
  }

  const status = canonicalFieldCount > 0
    ? (advisoryFields.length > 0 ? 'partial' : 'compiled')
    : 'unprovable';
  return compilerEnvelope({
    status,
    reason: status === 'unprovable'
      ? 'state-like object had no canonical executable fields'
      : 'canonical executable fields compiled; advisory claims kept out of energy state',
    rejectedFields,
    advisoryFields,
    compiled,
    options,
  });
}

export function compileExecutableState(state = {}, pointer = '$') {
  if (!isPlainObject(state)) {
    return {
      compiledState: {},
      canonicalFieldCount: 0,
      rejectedFields: [{ path: pointer, field: '<state>', reason: 'state_must_be_object' }],
      advisoryFields: [],
    };
  }

  const compiledState = {};
  const rejectedFields = [];
  const advisoryFields = [];
  let canonicalFieldCount = 0;

  for (const [key, value] of Object.entries(state)) {
    const fieldPointer = `${pointer}.${key}`;
    if (DERIVED_SET.has(key)) {
      rejectedFields.push({
        path: fieldPointer,
        field: key,
        reason: 'derived_metric_smuggling',
      });
      continue;
    }
    if (CANONICAL_SET.has(key)) {
      const validation = validateCanonicalField(key, value);
      if (!validation.ok) {
        rejectedFields.push({
          path: fieldPointer,
          field: key,
          reason: 'canonical_type_mismatch',
          expected: validation.expected,
        });
        continue;
      }
      compiledState[key] = Object.hasOwn(validation, 'value') ? validation.value : value;
      canonicalFieldCount += 1;
      continue;
    }
    advisoryFields.push({
      path: fieldPointer,
      field: key,
      reason: 'not_canonical_energy_input',
    });
  }

  return {
    compiledState,
    canonicalFieldCount,
    rejectedFields,
    advisoryFields,
  };
}

function validateCanonicalField(key, value) {
  if (DISTRIBUTION_FIELDS.has(key)) {
    // OBJECT tolerance is restricted to claimPromotionDistribution ONLY — the
    // shape claim-cortex actually emits and kernel evalEntropy consumes via
    // Object.values. Do NOT loosen the other distribution fields: kernel evalKL
    // and evalInfoGain→normalizeDistribution are array-ONLY and silently SKIP
    // objects (term contributes 0 = fail-open laundering). Keep this restriction.
    const objectTolerant = key === 'claimPromotionDistribution';
    const entries = Array.isArray(value) ? value
      : (objectTolerant && isPlainObject(value)) ? Object.values(value)
        : null;
    if (entries === null) {
      return {
        ok: false,
        expected: objectTolerant
          ? 'array or plain-object map of finite non-negative numbers with positive finite sum'
          : 'array of finite non-negative numbers with positive finite sum',
      };
    }
    if (entries.length === 0) {
      return { ok: false, expected: 'non-empty distribution' };
    }
    let sum = 0;
    for (const entry of entries) {
      const number = Number(entry);
      if (!Number.isFinite(number) || number < 0) {
        return { ok: false, expected: 'finite non-negative distribution values' };
      }
      sum += number;
    }
    if (!Number.isFinite(sum) || sum <= 0) {
      return { ok: false, expected: 'distribution sum must be positive and finite' };
    }
    if (Array.isArray(value)) return { ok: true, value: value.map((entry) => Number(entry)) };
    return { ok: true, value: Object.fromEntries(Object.entries(value).map(([k2, v2]) => [k2, Number(v2)])) };
  }

  if (PROBABILITY_VECTOR_FIELDS.has(key)) {
    if (!Array.isArray(value)) {
      return { ok: false, expected: 'array of finite probability values in [0,1]' };
    }
    const normalized = [];
    for (const entry of value) {
      const number = Number(entry);
      if (!Number.isFinite(number) || number < 0 || number > 1) {
        return { ok: false, expected: 'array of finite probability values in [0,1]' };
      }
      normalized.push(number);
    }
    return { ok: true, value: normalized };
  }

  if (NON_NEGATIVE_COUNT_FIELDS.has(key)) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      return { ok: false, expected: 'finite non-negative number' };
    }
    return { ok: true, value: number };
  }

  if (key === 'evidence') {
    if (!Array.isArray(value)) {
      return { ok: false, expected: 'array of evidence records' };
    }
    const normalized = [];
    for (const entry of value) {
      if (!isPlainObject(entry)) {
        return { ok: false, expected: 'array of evidence record objects' };
      }
      const base = Number(entry.base);
      const age = Number(entry.age);
      const halfLife = Number(entry.halfLife);
      if (!Number.isFinite(base) || base < 0 || base > 1) {
        return { ok: false, expected: 'evidence[].base finite probability in [0,1]' };
      }
      if (!Number.isFinite(age) || age < 0) {
        return { ok: false, expected: 'evidence[].age finite non-negative number' };
      }
      if (!Number.isFinite(halfLife) || halfLife <= 0) {
        return { ok: false, expected: 'evidence[].halfLife finite positive number' };
      }
      normalized.push({ base, age, halfLife });
    }
    return { ok: true, value: normalized };
  }

  return { ok: true };
}

export function hasProtectedPathReference(value) {
  return findProtectedPath(value) !== null;
}

function compilerEnvelope({ status, reason, rejectedFields, advisoryFields, compiled, options }) {
  return {
    op: 'compile_state',
    status,
    result: {
      compiled,
      rejectedFields,
      advisoryFields,
    },
    completeness: {
      hasExecutableState: Object.values(compiled || {}).some((state) => Object.keys(state || {}).length > 0),
      rejectedCount: rejectedFields.length,
      advisoryCount: advisoryFields.length,
    },
    advisory_only: true,
    local_truth_claim: false,
    provenance: {
      compiler: '_SYSTEM/Scripts/semantic-state-compiler.mjs',
      canonicalFields: CANONICAL_ENERGY_FIELDS,
      derivedMetricFields: DERIVED_METRIC_FIELDS,
      readOnly: true,
      ...(options.traceId ? { traceId: options.traceId } : {}),
    },
    verification: {
      executableEnergyState: status === 'compiled' || status === 'partial',
      reason,
      derivedMetricSmugglingRejected: rejectedFields.some((field) => field.reason === 'derived_metric_smuggling'),
    },
  };
}

function collectExecutableSources(input) {
  const sources = [];
  if (!isPlainObject(input)) return sources;

  for (const key of EXECUTABLE_CONTAINER_KEYS) {
    if (isPlainObject(input[key])) {
      sources.push({ name: key, pointer: `$.${key}`, value: input[key] });
    }
  }

  if (sources.length === 0 && looksLikeExecutableState(input)) {
    sources.push({ name: 'state', pointer: '$', value: input });
  }

  return sources;
}

function looksLikeExecutableState(input) {
  return Object.keys(input).some((key) => CANONICAL_SET.has(key) || DERIVED_SET.has(key));
}

function collectLaneClaimFields(input) {
  const out = [];
  if (!isPlainObject(input)) return out;
  const claimContainers = ['claimedMetrics', 'laneClaims', 'semanticClaims', 'claims'];
  for (const key of claimContainers) {
    if (!isPlainObject(input[key])) continue;
    for (const claimKey of Object.keys(input[key])) {
      out.push({
        path: `$.${key}.${claimKey}`,
        field: claimKey,
        reason: 'lane_claim_not_executable_state',
      });
    }
  }
  return out;
}

function collectWrapperAdvisoryFields(input, sources = []) {
  const out = [];
  if (!isPlainObject(input) || sources.length === 0) return out;
  if (sources.some((source) => source.pointer === '$')) return out;

  const sourceNames = new Set(sources.map((source) => source.name));
  const claimContainers = new Set(['claimedMetrics', 'laneClaims', 'semanticClaims', 'claims']);
  for (const key of Object.keys(input)) {
    if (sourceNames.has(key) || claimContainers.has(key)) continue;
    out.push({
      path: `$.${key}`,
      field: key,
      reason: CANONICAL_SET.has(key)
        ? 'canonical_field_outside_executable_state'
        : 'packet_field_not_executable_state',
    });
  }
  return out;
}

function normalizePacket(packet) {
  if (isPlainObject(packet)) return packet;
  return { state: packet };
}

function findProtectedPath(value, pointer = '$') {
  if (typeof value === 'string') {
    const normalized = value.replace(/\\/g, '/');
    const hit = PROTECTED_PATHS.find((protectedPath) => normalized.includes(protectedPath));
    return hit ? { pointer, path: hit } : null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const hit = findProtectedPath(value[index], `${pointer}[${index}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (isPlainObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      const hit = findProtectedPath(nested, `${pointer}.${key}`);
      if (hit) return hit;
    }
  }
  return null;
}

function findMutationAttempt(value, pointer = '$') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const hit = findMutationAttempt(value[index], `${pointer}[${index}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;

  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === 'mutation' && String(nested || '').toLowerCase() !== 'read_only') {
      return { pointer: `${pointer}.${key}`, key };
    }
    if (['write', 'commit', 'push', 'delete', 'remove', 'unlink'].includes(normalizedKey) && nested === true) {
      return { pointer: `${pointer}.${key}`, key };
    }
    const hit = findMutationAttempt(nested, `${pointer}.${key}`);
    if (hit) return hit;
  }
  return null;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const raw = process.argv.slice(2).join(' ') || readStdin();
  const packet = raw.trim() ? JSON.parse(raw) : {};
  process.stdout.write(`${JSON.stringify(compileSemanticStatePacket(packet), null, 2)}\n`);
}

function readStdin() {
  try {
    return process.stdin.isTTY ? '' : readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}
