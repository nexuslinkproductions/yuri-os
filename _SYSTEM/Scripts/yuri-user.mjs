#!/usr/bin/env node
/**
 * YURI user identity resolver (ESM source of truth).
 *
 * Resolves a STABLE, gate-safe user handle for telemetry attribution.
 * Enterprise identity rule (PostHog/Segment, exact-string, no fuzzy merge):
 * assign one stable id per user and never let it drift. The handle is derived
 * from `githubId` ONCE at onboarding, persisted to `.claude/yuri-user.json`,
 * and thereafter read VERBATIM — never re-normalized from a mutable display
 * name. Empty string is the anonymous fallback and is always gate-safe.
 *
 * See `_SYSTEM/docs/user-data-methodology.md` §1 P4.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(_HERE, '..', '..');
const USER_CONFIG_FILE = path.join(REPO_ROOT, '.claude', 'yuri-user.json'); // local, persisted handle
const OPERATOR_FILE = path.join(REPO_ROOT, '.claude', 'operator.json');

/** Lowercase, strip to [a-z0-9], '' on junk. Deterministic + gate-safe. */
export function normalizeHandle(name) {
  if (typeof name !== 'string') return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function defaultUserConfigReader() {
  try {
    if (!fs.existsSync(USER_CONFIG_FILE)) return null;
    return JSON.parse(fs.readFileSync(USER_CONFIG_FILE, 'utf8'));
  } catch { return null; }
}

function defaultOperatorReader() {
  try {
    if (!fs.existsSync(OPERATOR_FILE)) return null;
    return JSON.parse(fs.readFileSync(OPERATOR_FILE, 'utf8'));
  } catch { return null; }
}

/**
 * Resolve the stable persisted handle.
 * Priority: YURI_USER env (normalized) → persisted `.claude/yuri-user.json`
 * `handle` (read VERBATIM) → `normalizeHandle(operator.json .name)` → ''.
 *
 * @param {object} [opts]
 * @param {() => ({handle?: string}|null)} [opts.userConfigReader] injectable
 * @param {() => ({name?: string}|null)}   [opts.operatorReader]   injectable
 * @returns {string} stable handle, or '' (anonymous)
 */
export function currentUserHandle(opts = {}) {
  const envHandle = normalizeHandle(process.env.YURI_USER ?? '');
  if (envHandle) return envHandle;

  const userReader = opts.userConfigReader ?? defaultUserConfigReader;
  const cfg = userReader();
  if (cfg && typeof cfg.handle === 'string' && cfg.handle) return cfg.handle; // VERBATIM — no re-normalize

  const opReader = opts.operatorReader ?? defaultOperatorReader;
  const op = opReader();
  return op && typeof op.name === 'string' ? normalizeHandle(op.name) : '';
}

export { USER_CONFIG_FILE, OPERATOR_FILE };
