// energy-calibration-contract.mjs — recovered compatibility seam for the
// tracked energy-calibration analyzers.
//
// No committed or otherwise recoverable copy of the historical WP0 file was
// found; session evidence showed it as untracked. This implementation restores
// only the pure interface required by current tracked consumers. Historical
// write/governance helpers are deliberately not recreated without source.

import {
  DEFAULT_WEIGHTS,
  gateProposal,
} from './yuri-energy.mjs';
import { evaluateTransitions } from './yuri-energy-experiment.mjs';

const ENERGY_PRECISION = 1e9;
const ENERGY_ROUNDING_TOLERANCE = (0.5 / ENERGY_PRECISION) + Number.EPSILON;
const MAX_ROUNDABLE_MAGNITUDE = Number.MAX_VALUE / ENERGY_PRECISION;
const VERIFIED_EVIDENCE_CREDIT_CAP = 50;
const BARRIER_WEIGHT_KEYS = Object.freeze(['eta', 'theta']);
const SUPPORTED_FORMULA_VERSIONS = Object.freeze([1, 2, 3]);

export { DEFAULT_WEIGHTS, gateProposal, evaluateTransitions };

export const SOFT_WEIGHT_KEYS = Object.freeze([
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'zeta',
  'iota',
  'kappa',
  'lambda',
  'mu',
]);

export const CONTRIBUTION_TO_WEIGHT = Object.freeze({
  entropy: 'alpha',
  klDivergence: 'beta',
  wasserstein: 'beta',
  overconfidenceDrift: 'mu',
  logLoss: 'gamma',
  brier: 'delta',
  repeatedFailure: 'kappa',
  malformedForecast: 'lambda',
  informationGain: 'epsilon',
  staleness: 'zeta',
  protectedPathViolations: 'eta',
  promotionLadderInversions: 'theta',
  verifiedEvidenceCredit: 'iota',
});

const ROUNDED_COMPONENTS = new Set([
  'repeatedFailure',
  'malformedForecast',
  'informationGain',
  'protectedPathViolations',
  'promotionLadderInversions',
  'verifiedEvidenceCredit',
]);

export const BURN_IN_DEFAULT_SUBSET = 'rejects';

// These identifiers are compatibility bindings for the tracked lane callers.
// 09AB is evidenced by their historical run IDs; the other two are explicit,
// grammar-conforming assignments because their original constants were lost.
export const LANE_IDS = Object.freeze({
  ABLATION: '09AB',
  ADVERSARIAL: '10AD',
  ANALYZE: '11AN',
});

export const PASS_TYPES = Object.freeze(['X', 'P', 'F']);

export function roundEnergy(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('roundEnergy requires a finite number');
  }
  const numeric = value;
  const scaled = numeric * ENERGY_PRECISION;
  if (!Number.isFinite(scaled)) {
    throw new Error('roundEnergy magnitude exceeds the finite rounding range');
  }
  const rounded = Math.round(scaled) / ENERGY_PRECISION;
  if (!Number.isFinite(rounded)) {
    throw new Error('roundEnergy produced a non-finite result');
  }
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeCandidate(config) {
  if (!isPlainObject(config)) {
    throw new Error('candidate weight configuration must be a plain object');
  }

  if (Object.hasOwn(config, 'kind') || Object.hasOwn(config, 'weights')) {
    const extra = Object.keys(config).filter((key) => key !== 'kind' && key !== 'weights');
    if (extra.length) {
      throw new Error(`unknown candidate configuration field: ${extra[0]}`);
    }
    const kind = config.kind ?? 'delta';
    if (kind !== 'delta' && kind !== 'full') {
      throw new Error(`candidate kind must be 'delta' or 'full' (got ${JSON.stringify(kind)})`);
    }
    if (!isPlainObject(config.weights)) {
      throw new Error('candidate weights must be a plain object');
    }
    return { kind, weights: config.weights };
  }

  return { kind: 'delta', weights: config };
}

export function validateCandidateWeights(config) {
  const normalized = normalizeCandidate(config);
  const keys = Object.keys(normalized.weights);

  if (normalized.kind === 'full') {
    const missing = SOFT_WEIGHT_KEYS.filter((key) => !Object.hasOwn(normalized.weights, key));
    if (missing.length) {
      throw new Error(`full candidate is missing soft weight: ${missing[0]}`);
    }
  }

  for (const key of keys) {
    if (!Object.hasOwn(DEFAULT_WEIGHTS, key)) {
      throw new Error(`unknown energy weight: ${key}`);
    }
    if (BARRIER_WEIGHT_KEYS.includes(key)) {
      throw new Error(`barrier weight ${key} is not calibratable`);
    }
    const value = normalized.weights[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`candidate weight ${key} must be a finite non-negative number`);
    }
    if (value > MAX_ROUNDABLE_MAGNITUDE) {
      throw new Error(`candidate weight ${key} exceeds the finite rounding range`);
    }
  }

  return normalized;
}

export function resolveFullWeights(config) {
  const { weights } = validateCandidateWeights(config);
  return { ...DEFAULT_WEIGHTS, ...weights };
}

function normalizeResolvedWeights(value) {
  if (!isPlainObject(value)) {
    throw new Error('resolved weights must be a plain object');
  }
  if (Object.hasOwn(value, 'kind') || Object.hasOwn(value, 'weights')) {
    return resolveFullWeights(value);
  }

  const resolved = { ...DEFAULT_WEIGHTS };
  for (const [key, raw] of Object.entries(value)) {
    if (!Object.hasOwn(DEFAULT_WEIGHTS, key)) {
      throw new Error(`unknown energy weight: ${key}`);
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
      throw new Error(`resolved weight ${key} must be a finite non-negative number`);
    }
    if (raw > MAX_ROUNDABLE_MAGNITUDE) {
      throw new Error(`resolved weight ${key} exceeds the finite rounding range`);
    }
    if (BARRIER_WEIGHT_KEYS.includes(key) && raw !== DEFAULT_WEIGHTS[key]) {
      throw new Error(`barrier weight ${key} cannot differ from its safety floor`);
    }
    resolved[key] = raw;
  }
  return resolved;
}

function recoverBasis(component, contribution, weight) {
  if (component === 'informationGain') return -contribution / weight;
  if (component === 'verifiedEvidenceCredit') return Math.expm1(-contribution / weight);
  return contribution / weight;
}

function forwardContribution(component, basis, weight) {
  let contribution;
  if (component === 'informationGain') {
    contribution = -weight * basis;
  } else if (component === 'verifiedEvidenceCredit') {
    contribution = -weight * Math.log1p(Math.min(basis, VERIFIED_EVIDENCE_CREDIT_CAP));
  } else {
    contribution = weight * basis;
  }
  if (!Number.isFinite(contribution)) {
    throw new Error(`rescored contribution ${component} is non-finite`);
  }
  return ROUNDED_COMPONENTS.has(component) ? roundEnergy(contribution) : contribution;
}

function assertRecordFormulaConsistency(record) {
  const version = resolveFormulaVersion(record);
  const contributions = record.componentContributions;
  if (contributions !== undefined && !isPlainObject(contributions)) {
    throw new Error('componentContributions must be a plain object when present');
  }
  for (const component of Object.keys(contributions ?? {})) {
    if (!Object.hasOwn(CONTRIBUTION_TO_WEIGHT, component)) {
      throw new Error(`unknown energy component contribution: ${component}`);
    }
  }

  const hasKl = isPlainObject(contributions) && Object.hasOwn(contributions, 'klDivergence');
  const hasWasserstein = isPlainObject(contributions) && Object.hasOwn(contributions, 'wasserstein');
  if (hasKl && hasWasserstein) {
    throw new Error('energy record cannot contain both klDivergence and wasserstein drift keys');
  }
  if (version <= 2 && hasWasserstein) {
    throw new Error(`energyFormulaVersion ${version} requires the klDivergence drift key`);
  }
  if (version === 3 && hasKl) {
    throw new Error('energyFormulaVersion 3 requires the wasserstein drift key');
  }
  return version;
}

export function reconstructRawComponents(record) {
  assertRecordFormulaConsistency(record);
  const contributions = isPlainObject(record.componentContributions)
    ? record.componentContributions
    : {};
  const weights = isPlainObject(record.weights) ? record.weights : {};
  const recovered = {};
  const absentComponents = [];
  const unrecoverable = [];
  const rightCensored = [];

  for (const [component, weightKey] of Object.entries(CONTRIBUTION_TO_WEIGHT)) {
    if (!Object.hasOwn(contributions, component)) {
      absentComponents.push(component);
      continue;
    }

    const contribution = contributions[component];
    const weight = weights[weightKey];
    if (typeof contribution !== 'number' || !Number.isFinite(contribution)) {
      unrecoverable.push({ component, weightKey, reason: 'non-finite-contribution' });
      continue;
    }
    if (typeof weight !== 'number' || !Number.isFinite(weight)) {
      unrecoverable.push({ component, weightKey, reason: 'missing-or-non-finite-weight' });
      continue;
    }
    if (!(weight > 0)) {
      unrecoverable.push({ component, weightKey, reason: 'non-positive-weight' });
      continue;
    }

    if (component === 'verifiedEvidenceCredit') {
      const cappedFloor = roundEnergy(-weight * Math.log1p(VERIFIED_EVIDENCE_CREDIT_CAP));
      if (contribution < cappedFloor - ENERGY_ROUNDING_TOLERANCE) {
        unrecoverable.push({
          component,
          weightKey,
          reason: 'formula-incompatible-below-capped-credit-floor',
        });
        continue;
      }
    }

    const basis = recoverBasis(component, contribution, weight);
    if (!Number.isFinite(basis) || basis < 0) {
      unrecoverable.push({ component, weightKey, reason: 'invalid-reconstructed-basis' });
      continue;
    }

    const rounds = ROUNDED_COMPONENTS.has(component);
    recovered[component] = {
      basis,
      weightKey,
      originalWeight: weight,
      contribution,
      rounds,
    };

    if (component === 'verifiedEvidenceCredit') {
      const cappedFloor = roundEnergy(-weight * Math.log1p(VERIFIED_EVIDENCE_CREDIT_CAP));
      if (Math.abs(contribution - cappedFloor) <= ENERGY_ROUNDING_TOLERANCE) {
        rightCensored.push({ component, at: VERIFIED_EVIDENCE_CREDIT_CAP });
      }
    }
  }

  return {
    recovered,
    recoveredCount: Object.keys(recovered).length,
    absentComponents,
    unrecoverable,
    rightCensored,
  };
}

export function rescoreRecordU(record, newWeights) {
  const weights = normalizeResolvedWeights(newWeights);
  const reconstruction = reconstructRawComponents(record);
  const contributions = {};
  let U = 0;

  for (const [component, recovered] of Object.entries(reconstruction.recovered)) {
    const contribution = forwardContribution(
      component,
      recovered.basis,
      weights[recovered.weightKey],
    );
    contributions[component] = contribution;
    U += contribution;
    if (!Number.isFinite(U)) {
      throw new Error(`rescored energy overflow after component ${component}`);
    }
  }

  return {
    U: roundEnergy(U),
    contributions,
    rescoredCount: Object.keys(contributions).length,
    absentComponents: reconstruction.absentComponents,
    unrecoverable: reconstruction.unrecoverable,
    rightCensored: reconstruction.rightCensored,
  };
}

export function resolveFormulaVersion(record) {
  if (!isPlainObject(record)) {
    throw new Error('energy record must be a plain object');
  }
  if (!Object.hasOwn(record, 'energyFormulaVersion')) return 1;
  const raw = record.energyFormulaVersion;
  const decimalString = typeof raw === 'string' && /^[1-9]\d*$/.test(raw);
  const value = decimalString ? Number(raw) : raw;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('energyFormulaVersion must be a positive integer');
  }
  if (!SUPPORTED_FORMULA_VERSIONS.includes(value)) {
    throw new Error(`unsupported energyFormulaVersion ${value}; supported versions are 1, 2, and 3`);
  }
  return value;
}

export function formulaVersionTally(records) {
  if (!Array.isArray(records)) throw new Error('formulaVersionTally requires an array');
  const tally = {};
  for (const record of records) {
    const version = resolveFormulaVersion(record);
    tally[version] = (tally[version] ?? 0) + 1;
  }
  return tally;
}

export function assertSingleEra(records, { context = 'energy rescore' } = {}) {
  const tally = formulaVersionTally(records);
  for (const record of records) assertRecordFormulaConsistency(record);
  const eras = Object.keys(tally).map(Number).sort((a, b) => a - b);
  if (eras.length > 1) {
    throw new Error(
      `${context}: multiple energyFormulaVersion eras (${eras.join(', ')}) cannot be pooled`,
    );
  }
  return eras[0] ?? null;
}

export function makeSeededRng(seed = 1) {
  let state = Number(seed) >>> 0;
  return function mulberry32() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeDescription(description) {
  const normalized = String(description ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
    .replace(/_+$/g, '');
  if (!normalized) throw new Error('result description is required');
  return normalized;
}

export function buildResultLabel({ laneId, description, passType }) {
  if (!/^\d{2}[A-Z]{2}$/.test(String(laneId ?? ''))) {
    throw new Error('laneId must match two digits plus two uppercase letters');
  }
  if (!PASS_TYPES.includes(passType)) {
    throw new Error(`passType must be one of ${PASS_TYPES.join(', ')}`);
  }
  return `${laneId}_${normalizeDescription(description)}_${passType}_PASS_COMMITTED`;
}

function evidenceToken(value, field) {
  if (typeof value !== 'string' || !value || /[\s=\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${field} must be a non-empty evidence token without whitespace or '='`);
  }
  return value;
}

function evidenceExcerpt(value) {
  return String(value).replace(/[\r\n\t]/g, ' ').trim();
}

function evidenceCount(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return value;
}

export const evidence = Object.freeze({
  termCount(term, count) {
    return `TERM_COUNT term=${evidenceToken(term, 'TERM_COUNT term')} count=${evidenceCount(count, 'TERM_COUNT count')}`;
  },
  fileCount(file, count) {
    return `FILE_COUNT file=${evidenceToken(file, 'FILE_COUNT file')} count=${evidenceCount(count, 'FILE_COUNT count')}`;
  },
  match(file, term, line, excerpt) {
    if (!Number.isSafeInteger(line) || line < 1) {
      throw new Error('MATCH line must be a positive safe integer');
    }
    return `MATCH file=${evidenceToken(file, 'MATCH file')} term=${evidenceToken(term, 'MATCH term')} line=${line} excerpt=${JSON.stringify(evidenceExcerpt(excerpt))}`;
  },
});
