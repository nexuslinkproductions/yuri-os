#!/usr/bin/env node

const ALLOWED_SCHEMAS = new Set(['yuri.math.adapter.v0']);
const ALLOWED_RUN_MODES = new Set(['core', 'lab', 'proof', 'accelerator', 'research']);
const ALLOWED_PROMOTION_STATES = new Set([
  'research',
  'fixture',
  'verified-baseline',
  'owner-approved',
  'blocked',
]);

export function validateMathAdapterManifest(adapter) {
  const errors = [];
  const warnings = [];

  if (!adapter || typeof adapter !== 'object') {
    return { ok: false, errors: ['adapter manifest must be an object'], warnings };
  }
  if (!ALLOWED_SCHEMAS.has(adapter.schema)) errors.push(`unsupported schema: ${adapter.schema || '(missing)'}`);
  if (!adapter.id || typeof adapter.id !== 'string') errors.push('id is required');
  if (!adapter.engine || typeof adapter.engine !== 'string') errors.push('engine is required');
  if (!Array.isArray(adapter.capabilities) || adapter.capabilities.length === 0) {
    errors.push('capabilities must include at least one capability');
  }
  if (!ALLOWED_RUN_MODES.has(adapter.runMode)) {
    errors.push(`runMode must be one of: ${[...ALLOWED_RUN_MODES].join(', ')}`);
  }
  if (!ALLOWED_PROMOTION_STATES.has(adapter.promotionStatus)) {
    errors.push(`promotionStatus must be one of: ${[...ALLOWED_PROMOTION_STATES].join(', ')}`);
  }
  if (adapter.writesRuntimeTruth !== false) {
    errors.push('writesRuntimeTruth must be false unless promoted by a separate owner-approved gate');
  }
  if (adapter.runMode === 'runtime') {
    errors.push('runtime mode is not allowed in the v0 adapter contract');
  }
  if (adapter.promotionStatus === 'owner-approved') {
    warnings.push('owner-approved adapters still require artifact registry and release-gate evidence');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateMathLabManifest(manifest) {
  const errors = [];
  const warnings = [];
  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, errors: ['lab manifest must be an object'], warnings };
  }
  if (manifest.schema !== 'yuri.math-lab-harness.v0') errors.push('schema must be yuri.math-lab-harness.v0');
  if (!Array.isArray(manifest.adapters)) errors.push('adapters must be an array');

  for (const adapter of manifest.adapters || []) {
    const result = validateMathAdapterManifest(adapter);
    errors.push(...result.errors.map((error) => `${adapter?.id || 'adapter'}: ${error}`));
    warnings.push(...result.warnings.map((warning) => `${adapter?.id || 'adapter'}: ${warning}`));
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
