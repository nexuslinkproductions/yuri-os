// @capability: lib-arming
// @serves: arming flag check | env-or-flag gate | disarmed default
// @does: checks arming state via environment variable or gitignored flag file; resolves flag paths under _SYSTEM/state; provides disarmed-safe default
// @use: import { isArmed, armState, resolveFlagPath, REPO_ROOT } from '_SYSTEM/lib/arming.mjs'
// @exports: isArmed, armState, resolveFlagPath, REPO_ROOT

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../..');

/**
 * Check if a feature is armed via environment variable OR flag file.
 * Armed when either env var is '1' OR flag file exists.
 * @param {Object} options
 * @param {string} options.env - Environment variable name (e.g., 'YURI_FEATURE_ENABLED')
 * @param {string} options.flag - Absolute path or path relative to repo root (e.g., '_SYSTEM/state/feature.enabled')
 * @returns {boolean}
 */
export function isArmed({ env, flag }) {
  // Check environment variable first
  if (env && typeof env === 'string' && process.env[env] === '1') {
    return true;
  }
  // Check flag file existence
  if (flag && typeof flag === 'string') {
    const flagPath = flag.startsWith('/') ? flag : path.resolve(REPO_ROOT, flag);
    try {
      return fs.existsSync(flagPath);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Get detailed arming state including source.
 * @param {Object} options
 * @param {string} options.env - Environment variable name
 * @param {string} options.flag - Flag file path (absolute or relative to repo root)
 * @returns {{armed: boolean, source: 'env'|'flag'|null}}
 */
export function armState({ env, flag }) {
  if (env && typeof env === 'string' && process.env[env] === '1') {
    return { armed: true, source: 'env' };
  }
  if (flag && typeof flag === 'string') {
    const flagPath = flag.startsWith('/') ? flag : path.resolve(REPO_ROOT, flag);
    try {
      if (fs.existsSync(flagPath)) {
        return { armed: true, source: 'flag' };
      }
    } catch {
      // Fall through
    }
  }
  return { armed: false, source: null };
}

/**
 * Resolve a flag name to the canonical path under _SYSTEM/state.
 * Idempotent: if name already ends with .enabled, it's used as-is.
 * @param {string} name - Flag name (e.g., 'my-feature' or 'my-feature.enabled')
 * @returns {string} Absolute path to <repoRoot>/_SYSTEM/state/<name>.enabled
 */
export function resolveFlagPath(name) {
  const suffix = name.endsWith('.enabled') ? '' : '.enabled';
  return path.resolve(REPO_ROOT, '_SYSTEM', 'state', `${name}${suffix}`);
}